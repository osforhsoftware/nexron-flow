import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRightLeft, CalendarDays, ChevronDown, Eye, MoreVertical, Plus, Printer, Trash2, Undo2, X } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import {
  defaultTaxPercentForTaxType,
  normalizeTaxType,
  taxOptionsForCompany,
} from "../lib/companyLocale";
import { printDocument } from "../lib/documentExport";
import { inr, todayISO } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import type { CommercialDoc } from "../db/types";

export type PipelineDocType = "quotation" | "sale_order" | "delivery";

const META: Record<
  PipelineDocType,
  { title: string; nextLabel: string; nextType: string }
> = {
  quotation: { title: "Estimate / Quotation", nextLabel: "Convert to Sale Order", nextType: "sale_order" },
  sale_order: { title: "Sale Order", nextLabel: "Convert to Delivery", nextType: "delivery" },
  delivery: { title: "Delivery Challan", nextLabel: "Convert to Sale Invoice", nextType: "sale" },
};

type DraftLine = {
  key: string;
  itemId: string;
  name: string;
  qty: string;
  rate: string;
  taxPercent: string;
};

type DateFilter = "this_month" | "last_month" | "custom" | "all";

const DOC_STATUSES = ["draft", "open", "converted"] as const;

function formatDocDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function monthBounds(offsetMonths = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: toIso(start), to: toIso(end) };
}

function emptyLine(taxPercent = "5"): DraftLine {
  return {
    key: crypto.randomUUID().slice(0, 8),
    itemId: "",
    name: "",
    qty: "1",
    rate: "0",
    taxPercent,
  };
}

export function PipelineDocsPage({ docType }: { docType: PipelineDocType }) {
  const { company, companies, switchCompany } = useApp();
  const companyId = company?.id;
  const taxOptions = taxOptionsForCompany(company);
  const defaultTaxPercent = defaultTaxPercentForTaxType(
    normalizeTaxType(company?.taxType, company?.country),
  );
  const meta = META[docType];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: docs, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { docs: rows } = await api.docs.list(companyId, docType);
    return rows;
  }, [companyId, docType]);

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: rows } = await api.parties.list(companyId);
    return rows.filter((p) => p.type !== "supplier");
  }, [companyId, docType]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const partyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parties ?? []) map.set(p.id, p.name);
    return map;
  }, [parties]);

  const viewDocId = searchParams.get("doc");
  const [viewDoc, setViewDoc] = useState<CommercialDoc | null>(null);
  const [viewError, setViewError] = useState("");
  const [linkedDelivery, setLinkedDelivery] = useState<CommercialDoc | null>(null);
  const [linkedInvoice, setLinkedInvoice] = useState<{ id: string; number: string } | null>(null);
  const [linkedEstimate, setLinkedEstimate] = useState<{ id: string; number: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine(defaultTaxPercent)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_month");
  const [customRange, setCustomRange] = useState(() => monthBounds(0));
  const [partyFilterId, setPartyFilterId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const monthRange = useMemo(() => {
    if (dateFilter === "this_month") return monthBounds(0);
    if (dateFilter === "last_month") return monthBounds(-1);
    if (dateFilter === "custom") return customRange;
    return { from: "0000-01-01", to: "9999-12-31" };
  }, [dateFilter, customRange]);

  const filteredDocs = useMemo(() => {
    return (docs ?? []).filter((d) => {
      if (dateFilter !== "all" && (d.date < monthRange.from || d.date > monthRange.to)) return false;
      if (partyFilterId && d.partyId !== partyFilterId) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      return true;
    });
  }, [docs, dateFilter, monthRange, partyFilterId, statusFilter]);

  const listPage = usePagedRows(
    filteredDocs,
    `${docType}|${dateFilter}|${monthRange.from}|${monthRange.to}|${partyFilterId}|${statusFilter}`,
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of lines) {
      const qty = Number(line.qty) || 0;
      const rate = Number(line.rate) || 0;
      const taxPercent = Number(line.taxPercent) || 0;
      const base = qty * rate;
      const tax = (base * taxPercent) / 100;
      subtotal += base;
      taxTotal += tax;
    }
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
  }, [lines]);

  useEffect(() => {
    if (!viewDocId) {
      setViewDoc(null);
      setViewError("");
      return;
    }
    let cancelled = false;
    setViewDoc(null);
    setViewError("");
    setLinkedDelivery(null);
    setLinkedInvoice(null);
    setLinkedEstimate(null);
    api.docs
      .get(viewDocId)
      .then(async ({ doc }) => {
        if (cancelled) return;
        if (doc.docType !== docType) {
          setViewError("This document is not on this page.");
          return;
        }
        setViewDoc(doc);
        try {
          if (doc.convertedFromType === "sale_order" && doc.convertedFromId) {
            const { doc: order } = await api.docs.get(doc.convertedFromId);
            if (
              !cancelled &&
              order.convertedFromType === "quotation" &&
              order.convertedFromId &&
              order.convertedFromNumber
            ) {
              setLinkedEstimate({ id: order.convertedFromId, number: order.convertedFromNumber });
            }
          }
          if (doc.convertedToType === "delivery" && doc.convertedToId) {
            const { doc: delivery } = await api.docs.get(doc.convertedToId);
            if (cancelled) return;
            setLinkedDelivery(delivery);
            if (delivery.convertedToType === "sale" && delivery.convertedToId) {
              const { transaction } = await api.transactions.get(delivery.convertedToId);
              if (!cancelled) setLinkedInvoice({ id: transaction.id, number: transaction.number });
            }
          } else if (doc.convertedToType === "sale" && doc.convertedToId) {
            const { transaction } = await api.transactions.get(doc.convertedToId);
            if (!cancelled) setLinkedInvoice({ id: transaction.id, number: transaction.number });
          }
        } catch {
          /* related documents stay optional */
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setViewError(err instanceof Error ? err.message : "Could not open the document");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewDocId, docType]);

  function closeViewDoc() {
    const next = new URLSearchParams(searchParams);
    next.delete("doc");
    setSearchParams(next, { replace: true });
  }

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }

  function removeLine(idx: number) {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [emptyLine(defaultTaxPercent)];
    });
  }

  function openCreate() {
    setPartyId(parties?.[0]?.id ?? "");
    setDate(todayISO());
    setNotes("");
    setLines([emptyLine(defaultTaxPercent)]);
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      openCreate();
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, docType]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !partyId) return;
    const valid = lines
      .filter((l) => l.name.trim() && Number(l.qty) > 0)
      .map((l) => {
        const qty = Number(l.qty) || 0;
        const rate = Number(l.rate) || 0;
        const taxPercent = Number(l.taxPercent) || 0;
        const base = qty * rate;
        const amount = base + (base * taxPercent) / 100;
        return {
          itemId: l.itemId || undefined,
          name: l.name.trim(),
          qty,
          rate,
          taxPercent,
          amount,
        };
      });
    if (!valid.length) {
      setError("Add at least one line item");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.docs.create({
        companyId,
        docType,
        date,
        partyId,
        notes: notes.trim() || undefined,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        lines: valid,
      });
      setOpen(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function convert(id: string) {
    if (!confirm(`${meta.nextLabel}?`)) return;
    setBusy(true);
    try {
      await api.docs.convert(id);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusy(false);
    }
  }

  function canConvert(doc: CommercialDoc) {
    return doc.status !== "converted" && doc.status !== "declined" && doc.status !== "expired";
  }

  function showDoc(id: string) {
    setMenuId(null);
    const next = new URLSearchParams(searchParams);
    next.set("doc", id);
    setSearchParams(next);
  }

  function openNext(doc: CommercialDoc) {
    if (!doc.convertedToId || !doc.convertedToType) return;
    setMenuId(null);
    if (doc.convertedToType === "sale") {
      navigate(`/sales?txn=${encodeURIComponent(doc.convertedToId)}`);
      return;
    }
    const path =
      doc.convertedToType === "delivery"
        ? "/sales/delivery"
        : doc.convertedToType === "sale_order"
          ? "/sales/orders"
          : "";
    if (!path) return;
    navigate(`${path}?doc=${encodeURIComponent(doc.convertedToId)}`);
  }

  function nextOpenLabel(type?: string | null) {
    if (type === "delivery") return "Delivery";
    if (type === "sale") return "Invoice";
    if (type === "sale_order") return "Sale order";
    return "Open";
  }

  function printDoc(doc: CommercialDoc) {
    setMenuId(null);
    const party = (doc.partyId && partyName.get(doc.partyId)) || "—";
    printDocument({
      filename: doc.number,
      companyName: company?.name || "",
      title: meta.title,
      docNumber: doc.number,
      meta: [
        { label: "Date", value: doc.date },
        { label: "Party", value: party },
      ],
      columns: [
        { header: "Item" },
        { header: "Qty", align: "right" },
        { header: "Rate", align: "right" },
        { header: "Amount", align: "right" },
      ],
      rows: doc.lines.map((line) => [
        line.name,
        line.qty,
        line.rate.toFixed(2),
        line.amount.toFixed(2),
      ]),
      totals: [{ label: "Total", value: inr(doc.grandTotal), emphasize: true }],
      notes: doc.notes || undefined,
    });
  }

  async function removeDoc(doc: CommercialDoc) {
    setMenuId(null);
    if (doc.status === "converted") return;
    if (!confirm(`Delete ${doc.number}?`)) return;
    setBusy(true);
    try {
      await api.docs.remove(doc.id);
      if (viewDocId === doc.id) closeViewDoc();
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleMenu(id: string, btn: HTMLButtonElement) {
    if (menuId === id) {
      setMenuId(null);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 220 && rect.top > 220;
    setMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - 210),
      openUp,
    });
    setMenuId(id);
  }

  useEffect(() => {
    if (!menuId) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-doc-menu]")) return;
      setMenuId(null);
    }
    function closeMenu() {
      setMenuId(null);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuId]);

  async function revoke(id: string) {
    const label =
      docType === "sale_order"
        ? "Revert this sale order back to the Estimate / Quotation? The order (and unused delivery, if any) will be deleted."
        : "Revoke conversion? Downstream unused documents will be deleted and the previous document will reopen.";
    if (!confirm(label)) return;
    setBusy(true);
    try {
      await api.docs.revoke(id);
      reload();
      if (docType === "sale_order") navigate("/sales/quotations");
      if (docType === "delivery") navigate("/sales/orders");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  if (viewDocId) {
    const party = (parties ?? []).find((row) => row.id === viewDoc?.partyId);
    const fromLabel =
      viewDoc?.convertedFromType === "quotation"
        ? "Estimate / Quotation"
        : viewDoc?.convertedFromType === "sale_order"
          ? "Sale Order"
          : viewDoc?.convertedFromType || "";
    const relatedTabs: { key: string; label: string; href: string }[] = [];
    if (linkedEstimate && viewDoc?.convertedFromId !== linkedEstimate.id) {
      relatedTabs.push({
        key: `est-${linkedEstimate.id}`,
        label: `Estimate / Quotation ${linkedEstimate.number}`,
        href: `/sales/quotations?doc=${encodeURIComponent(linkedEstimate.id)}`,
      });
    }
    if (viewDoc?.convertedFromId && viewDoc.convertedFromNumber) {
      const href =
        viewDoc.convertedFromType === "quotation"
          ? `/sales/quotations?doc=${encodeURIComponent(viewDoc.convertedFromId)}`
          : viewDoc.convertedFromType === "sale_order"
            ? `/sales/orders?doc=${encodeURIComponent(viewDoc.convertedFromId)}`
            : viewDoc.convertedFromType === "delivery"
              ? `/sales/delivery?doc=${encodeURIComponent(viewDoc.convertedFromId)}`
              : "";
      if (href) {
        relatedTabs.push({
          key: `from-${viewDoc.convertedFromId}`,
          label: `${fromLabel} ${viewDoc.convertedFromNumber}`,
          href,
        });
      }
    }
    if (linkedDelivery && linkedDelivery.id !== viewDoc?.id) {
      relatedTabs.push({
        key: `del-${linkedDelivery.id}`,
        label: `Delivery ${linkedDelivery.number}`,
        href: `/sales/delivery?doc=${encodeURIComponent(linkedDelivery.id)}`,
      });
    }
    if (linkedInvoice) {
      relatedTabs.push({
        key: `inv-${linkedInvoice.id}`,
        label: `Sale Invoice ${linkedInvoice.number}`,
        href: `/sales?txn=${encodeURIComponent(linkedInvoice.id)}`,
      });
    }
    return (
      <div className="full-editor invoice-fullscreen">
        <div className="inv-doc-tabs">
          <div className="inv-doc-tabs-left">
            <div className="inv-doc-tab active" role="tab" aria-selected>
              <span>
                {meta.title} {viewDoc ? viewDoc.number : "…"}
              </span>
              <button type="button" className="inv-tab-close" onClick={closeViewDoc} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            {relatedTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className="inv-doc-tab"
                title={tab.label}
                onClick={() => navigate(tab.href)}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="inv-doc-tabs-right">
            <button type="button" aria-label="Close details" onClick={closeViewDoc}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="inv-sheet invoice-detail-sheet">
          <div className="inv-sheet-scroll">
            {!viewDoc && !viewError ? <div className="sale-view-loading">Loading full details…</div> : null}
            {viewError ? <div className="empty">{viewError}</div> : null}
            {viewDoc ? (
              <>
                <div className="inv-top">
                  <div className="inv-top-left">
                    <div className="inv-sale-mode">
                      <h1>{meta.title}</h1>
                      <span className={`sale-view-status${viewDoc.status === "converted" ? " paid" : ""}`}>
                        {viewDoc.status}
                      </span>
                    </div>
                    <div className="sale-view-party">
                      <small>Party</small>
                      <strong>{party?.name || "—"}</strong>
                      {party?.phone ? <p>Phone: {party.phone}</p> : null}
                      {party?.email ? <p>Email: {party.email}</p> : null}
                      {party?.gstin ? <p>GSTIN: {party.gstin}</p> : null}
                      {party?.address ? <p>{party.address}</p> : null}
                      {viewDoc.billingAddress && viewDoc.billingAddress !== party?.address ? (
                        <p>{viewDoc.billingAddress}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="inv-top-right invoice-detail-meta">
                    <label>
                      <span>Number</span>
                      <strong>{viewDoc.number}</strong>
                    </label>
                    <label>
                      <span>Date</span>
                      <strong>{formatDocDate(viewDoc.date)}</strong>
                    </label>
                    <label>
                      <span>Status</span>
                      <strong>{viewDoc.status}</strong>
                    </label>
                    {viewDoc.refNo ? (
                      <label>
                        <span>Invoice ref</span>
                        <strong>{viewDoc.refNo}</strong>
                      </label>
                    ) : null}
                    {viewDoc.convertedFromNumber ? (
                      <label>
                        <span>From {fromLabel}</span>
                        <strong>{viewDoc.convertedFromNumber}</strong>
                      </label>
                    ) : null}
                    {linkedDelivery ? (
                      <label>
                        <span>Delivery</span>
                        <button
                          type="button"
                          className="sale-order-link"
                          onClick={() => navigate(`/sales/delivery?doc=${encodeURIComponent(linkedDelivery.id)}`)}
                        >
                          {linkedDelivery.number}
                        </button>
                      </label>
                    ) : null}
                    {linkedInvoice ? (
                      <label>
                        <span>Sale invoice</span>
                        <button
                          type="button"
                          className="sale-order-link"
                          onClick={() => navigate(`/sales?txn=${encodeURIComponent(linkedInvoice.id)}`)}
                        >
                          {linkedInvoice.number}
                        </button>
                      </label>
                    ) : null}
                    {viewDoc.stateOfSupply ? (
                      <label>
                        <span>State of supply</span>
                        <strong>{viewDoc.stateOfSupply}</strong>
                      </label>
                    ) : null}
                  </div>
                </div>

                <div className="inv-grid-wrap">
                  <table className="inv-grid invoice-detail-grid">
                    <thead>
                      <tr>
                        <th className="col-num">#</th>
                        <th className="col-item">ITEM</th>
                        <th className="col-qty">QTY</th>
                        <th className="col-unit">UNIT</th>
                        <th className="col-price">PRICE/UNIT</th>
                        <th className="col-tax">TAX %</th>
                        <th className="col-amt">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDoc.lines.map((line, index) => {
                        const catalog = (items ?? []).find((item) => item.id === line.itemId);
                        return (
                          <tr key={line.id}>
                            <td className="col-num">{index + 1}</td>
                            <td className="col-item">
                              <strong>{line.name}</strong>
                              {catalog?.sku ? <small className="muted"> · {catalog.sku}</small> : null}
                            </td>
                            <td className="col-qty">{line.qty}</td>
                            <td className="col-unit">{line.unit || catalog?.unit || "—"}</td>
                            <td className="col-price money">{inr(line.rate)}</td>
                            <td>{line.taxPercent}%</td>
                            <td className="col-amt money">{inr(line.amount)}</td>
                          </tr>
                        );
                      })}
                      {!viewDoc.lines.length ? (
                        <tr>
                          <td colSpan={7}>No line items</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="invoice-detail-bottom">
                  <div className="invoice-detail-notes">
                    {company?.name ? (
                      <p>
                        <strong>Company:</strong> {company.name}
                        {company.phone ? ` · ${company.phone}` : ""}
                      </p>
                    ) : null}
                    {company?.address ? <p>{company.address}</p> : null}
                    {company?.gstin ? <p>GSTIN: {company.gstin}</p> : null}
                    {viewDoc.notes ? (
                      <p className="sale-view-notes">
                        <strong>Notes:</strong> {viewDoc.notes}
                      </p>
                    ) : (
                      <p className="muted">No notes.</p>
                    )}
                    {viewDoc.terms ? (
                      <p className="sale-view-notes">
                        <strong>Terms:</strong> {viewDoc.terms}
                      </p>
                    ) : null}
                  </div>
                  <div className="sale-view-totals">
                    <span>
                      Subtotal <strong>{inr(viewDoc.subtotal)}</strong>
                    </span>
                    <span>
                      Tax <strong>{inr(viewDoc.taxTotal)}</strong>
                    </span>
                    <span className="grand">
                      Total <strong>{inr(viewDoc.grandTotal)}</strong>
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <div className="inv-footer">
            <div className="inv-footer-left">
              <span className="inv-total-word">Total</span>
              <input className="inv-grand-total" readOnly value={viewDoc ? viewDoc.grandTotal.toFixed(2) : "0"} />
            </div>
            <div className="inv-footer-right">
              {viewDoc ? (
                <button className="btn btn-primary" type="button" onClick={() => printDoc(viewDoc)}>
                  <Printer size={15} /> Print
                </button>
              ) : null}
              <button className="btn btn-ghost" type="button" onClick={closeViewDoc}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{meta.title}</h1>
          <p className="muted">Simple flow · no approval steps</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> Add {meta.title}
          </button>
        </div>
      </header>

      <div className="content sale-list-page">
        <div className="filter-bar">
          <span className="filter-label">Filter by :</span>
          <label className="filter-pill sale-filter-select">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              aria-label="Date filter"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown size={13} />
          </label>
          {dateFilter === "custom" ? (
            <span className="date-pill sale-custom-range">
              <CalendarDays size={13} />
              <input
                type="date"
                value={customRange.from}
                max={customRange.to}
                onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
              />
              <span>To</span>
              <input
                type="date"
                value={customRange.to}
                min={customRange.from}
                onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
              />
            </span>
          ) : dateFilter !== "all" ? (
            <span className="date-pill">
              <CalendarDays size={13} />
              {formatDocDate(monthRange.from)}&nbsp;&nbsp; To &nbsp;&nbsp;
              {formatDocDate(monthRange.to)}
            </span>
          ) : null}
          <label className="filter-pill sale-filter-select">
            <select
              value={partyFilterId}
              onChange={(e) => setPartyFilterId(e.target.value)}
              aria-label="Party filter"
            >
              <option value="">All Parties</option>
              {(parties ?? []).map((party) => (
                <option value={party.id} key={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
          <label className="filter-pill sale-filter-select">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Status filter"
            >
              <option value="">All Statuses</option>
              {DOC_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
          {companies.length > 1 ? (
            <label className="filter-pill sale-filter-select">
              <select
                value={companyId ?? ""}
                onChange={(e) => void switchCompany(e.target.value)}
                aria-label="Firm filter"
              >
                {companies.map((firm) => (
                  <option value={firm.id} key={firm.id}>
                    {firm.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          ) : null}
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>No.</th>
                  <th>Party</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th className="doc-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((d) => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>
                      <button type="button" className="sale-order-link" onClick={() => showDoc(d.id)}>
                        {d.number}
                      </button>
                    </td>
                    <td>{(d.partyId && partyName.get(d.partyId)) || "—"}</td>
                    <td>
                      <span
                        className={`badge ${
                          d.status === "converted"
                            ? "badge-ok"
                            : d.status === "draft" || d.status === "open"
                              ? "badge-muted"
                              : "badge-sale"
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="money">{inr(d.grandTotal)}</td>
                    <td className="doc-actions">
                      <div className="doc-row-actions">
                        <button className="btn btn-ghost" type="button" onClick={() => showDoc(d.id)}>
                          <Eye size={14} /> View
                        </button>
                        {!canConvert(d) && d.convertedToId ? (
                          <button className="btn btn-ghost" type="button" onClick={() => openNext(d)}>
                            {nextOpenLabel(d.convertedToType)}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="icon-tool"
                          title="More"
                          aria-label="More actions"
                          data-doc-menu=""
                          aria-expanded={menuId === d.id}
                          onClick={(e) => toggleMenu(d.id, e.currentTarget)}
                        >
                          <MoreVertical size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredDocs.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">
                        {docs?.length
                          ? "No documents match this filter."
                          : "No documents yet. Click Add to create one."}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={listPage} />
        </div>
      </div>

      {menuId && menuPos
        ? createPortal(
            (() => {
              const menuDoc = (docs ?? []).find((row) => row.id === menuId);
              if (!menuDoc) return null;
              return (
                <div
                  className={`sale-list-menu sale-list-menu-fixed${menuPos.openUp ? " drop-up" : ""}`}
                  ref={menuRef}
                  style={{
                    top: menuPos.openUp ? undefined : menuPos.top,
                    bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
                    left: menuPos.left,
                  }}
                >
                  <button type="button" onClick={() => showDoc(menuDoc.id)}>
                    <Eye size={13} /> View
                  </button>
                  <button type="button" onClick={() => printDoc(menuDoc)}>
                    <Printer size={13} /> Print
                  </button>
                  {canConvert(menuDoc) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMenuId(null);
                        void convert(menuDoc.id);
                      }}
                    >
                      <ArrowRightLeft size={13} /> {meta.nextLabel}
                    </button>
                  ) : null}
                  {menuDoc.status === "converted" || menuDoc.convertedFromId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMenuId(null);
                        void revoke(menuDoc.id);
                      }}
                    >
                      <Undo2 size={13} /> Revert
                    </button>
                  ) : null}
                  {menuDoc.status !== "converted" ? (
                    <button type="button" className="danger" onClick={() => void removeDoc(menuDoc)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  ) : null}
                </div>
              );
            })(),
            document.body,
          )
        : null}

      {open ? (
        <Modal
          title={`Add ${meta.title}`}
          className="pipeline-doc-modal"
          onClose={() => setOpen(false)}
          footer={
            <>
              <div className="pipeline-totals">
                <span>
                  Subtotal <strong>{inr(totals.subtotal)}</strong>
                </span>
                <span>
                  Tax <strong>{inr(totals.taxTotal)}</strong>
                </span>
                <span className="grand">
                  Total <strong>{inr(totals.grandTotal)}</strong>
                </span>
              </div>
              <div className="pipeline-footer-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" form="pipeline-form" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          }
        >
          <form id="pipeline-form" className="pipeline-doc-form" onSubmit={save}>
            <div className="form-grid">
              <label className="field">
                Party
                <select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                  <option value="">Select</option>
                  {(parties ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="field full">
                Notes
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </label>
            </div>

            <div className="pipeline-lines">
              <div className="pipeline-lines-head">
                <strong>Products</strong>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setLines((prev) => [...prev, emptyLine(defaultTaxPercent)])}
                >
                  <Plus size={14} /> Add product
                </button>
              </div>
              <div className="table-wrap">
                <table className="data pipeline-line-table">
                  <thead>
                    <tr>
                      <th className="col-num">#</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Tax %</th>
                      <th className="money">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const qty = Number(line.qty) || 0;
                      const rate = Number(line.rate) || 0;
                      const taxPercent = Number(line.taxPercent) || 0;
                      const base = qty * rate;
                      const amount = base + (base * taxPercent) / 100;
                      return (
                        <tr key={line.key}>
                          <td className="col-num">{idx + 1}</td>
                          <td>
                            <div className="pipeline-product">
                            <select
                              aria-label={`Product ${idx + 1}`}
                              value={line.itemId}
                              onChange={(e) => {
                                const item = (items ?? []).find((i) => i.id === e.target.value);
                                updateLine(idx, {
                                  itemId: e.target.value,
                                  name: item?.name ?? line.name,
                                  rate: item
                                    ? String(item.salePrice ?? line.rate)
                                    : line.rate,
                                  taxPercent: item
                                    ? String(item.taxPercent ?? line.taxPercent)
                                    : line.taxPercent,
                                });
                              }}
                            >
                              <option value="">Custom</option>
                              {(items ?? []).map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name}
                                </option>
                              ))}
                            </select>
                            {line.itemId ? null : (
                              <input
                                aria-label={`Name ${idx + 1}`}
                                value={line.name}
                                placeholder="Item name"
                                onChange={(e) => updateLine(idx, { name: e.target.value })}
                              />
                            )}
                            </div>
                          </td>
                          <td>
                            <input
                              aria-label={`Qty ${idx + 1}`}
                              type="number"
                              min="0"
                              step="any"
                              value={line.qty}
                              onChange={(e) => updateLine(idx, { qty: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Rate ${idx + 1}`}
                              type="number"
                              min="0"
                              step="any"
                              value={line.rate}
                              onChange={(e) => updateLine(idx, { rate: e.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Tax percent ${idx + 1}`}
                              value={line.taxPercent}
                              onChange={(e) => updateLine(idx, { taxPercent: e.target.value })}
                            >
                              {taxOptions.map((opt) => (
                                <option key={`${opt.value}-${opt.label}`} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="money">{inr(amount)}</td>
                          <td>
                            <button
                              type="button"
                              className="icon-tool"
                              title="Remove product"
                              aria-label={`Remove product ${idx + 1}`}
                              onClick={() => removeLine(idx)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {error ? <p className="pipeline-form-error">{error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
