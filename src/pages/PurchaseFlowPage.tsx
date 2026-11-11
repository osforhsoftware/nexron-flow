import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, FileSpreadsheet, FileText, MoreVertical, Pencil, Plus, Printer, Undo2 } from "lucide-react";
import type { CommercialDoc, DocLine } from "../db/types";
import { Modal } from "../components/Modal";
import { PartyFormFields } from "../components/PartyFormFields";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import {
  downloadDocumentPdf,
  downloadExcelTable,
  printDocument,
  type DocumentExportSpec,
} from "../lib/documentExport";
import { money, todayISO } from "../lib/format";
import { emptyPartyForm, partyPayloadFromForm } from "../lib/partyForm";
import { useAsync } from "../lib/useAsync";
import { TablePagination, usePagedRows } from "../components/TablePagination";

export type PurchaseFlowType = "rfq" | "purchase_order" | "grn" | "purchase_return";

const META: Record<
  PurchaseFlowType,
  { title: string; addLabel: string; nextLabel?: string; purpose: string }
> = {
  rfq: {
    title: "RFQ",
    addLabel: "New RFQ",
    nextLabel: "Convert to PO",
    purpose: "Ask suppliers for prices",
  },
  purchase_order: {
    title: "Purchase Orders",
    addLabel: "New PO",
    nextLabel: "Convert to GRN",
    purpose: "Confirm orders with suppliers",
  },
  grn: {
    title: "GRN",
    addLabel: "New GRN",
    nextLabel: "Create Purchase Bill",
    purpose: "Receive items into stock",
  },
  purchase_return: {
    title: "Purchase Returns",
    addLabel: "New Return",
    purpose: "Return damaged or rejected goods",
  },
};

type DraftLine = {
  key: string;
  itemId: string;
  name: string;
  qty: string;
  receivedQty: string;
  rate: string;
  taxPercent: string;
  unit: string;
};

function newLine(line?: Partial<DraftLine>): DraftLine {
  return {
    key: crypto.randomUUID(),
    itemId: "",
    name: "",
    qty: "1",
    receivedQty: "1",
    rate: "0",
    taxPercent: "0",
    unit: "pcs",
    ...line,
  };
}

function lineFromDoc(line: DocLine): DraftLine {
  return newLine({
    itemId: line.itemId ?? "",
    name: line.name,
    qty: String(line.qty),
    receivedQty: String(line.receivedQty ?? line.qty),
    rate: String(line.rate),
    taxPercent: String(line.taxPercent),
    unit: line.unit ?? "pcs",
  });
}

const DOC_TITLES: Record<PurchaseFlowType, string> = {
  rfq: "REQUEST FOR QUOTATION",
  purchase_order: "PURCHASE ORDER",
  grn: "GOODS RECEIPT NOTE",
  purchase_return: "PURCHASE RETURN",
};

export function PurchaseFlowPage({ docType }: { docType: PurchaseFlowType }) {
  const meta = META[docType];
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (value: number) => money(value, company?.currency);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState<CommercialDoc | null>(null);
  const [convertSource, setConvertSource] = useState<CommercialDoc | null>(null);
  const [billSource, setBillSource] = useState<CommercialDoc | null>(null);
  const [date, setDate] = useState(todayISO());
  const [partyId, setPartyId] = useState("");
  const [notes, setNotes] = useState("");
  const [originalBillNo, setOriginalBillNo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [newParty, setNewParty] = useState(emptyPartyForm());
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuBtnRef = useRef<HTMLButtonElement | null>(null);

  const { data: docs, reload } = useAsync(async () => {
    if (!companyId) return [];
    return (await api.docs.list(companyId, docType)).docs;
  }, [companyId, docType]);

  const { data: parties, reload: reloadParties } = useAsync(async () => {
    if (!companyId) return [];
    const rows = (await api.parties.list(companyId)).parties;
    return rows.filter((party) => party.type !== "customer");
  }, [companyId]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    return (await api.items.list(companyId)).items;
  }, [companyId]);

  const { data: accounts } = useAsync(async () => {
    if (!companyId) return [];
    return (await api.payments.accounts(companyId)).accounts;
  }, [companyId]);

  const partyNames = useMemo(
    () => new Map((parties ?? []).map((party) => [party.id, party.name])),
    [parties],
  );

  const listPage = usePagedRows(docs, docType);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of lines) {
      const qty = docType === "grn" ? Number(line.receivedQty) || 0 : Number(line.qty) || 0;
      const base = qty * (Number(line.rate) || 0);
      subtotal += base;
      taxTotal += (base * (Number(line.taxPercent) || 0)) / 100;
    }
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
  }, [docType, lines]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("create") === "1") {
      openCreate();
      history.replaceState(null, "", location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  useEffect(() => {
    if (open && !partyId && parties?.length) {
      setPartyId(parties[0].id);
    }
  }, [open, parties, partyId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      const inMenu = actionMenuRef.current?.contains(t);
      const inBtn = actionMenuBtnRef.current?.contains(t);
      if (!inMenu && !inBtn) {
        setActionMenuId(null);
        setActionMenuPos(null);
      }
    }
    function onScrollOrResize() {
      if (!actionMenuId || !actionMenuBtnRef.current) return;
      const rect = actionMenuBtnRef.current.getBoundingClientRect();
      const openUp = window.innerHeight - rect.bottom < 220 && rect.top > 220;
      setActionMenuPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - 180),
        openUp,
      });
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [actionMenuId]);

  function closeActionMenu() {
    setActionMenuId(null);
    setActionMenuPos(null);
  }

  function openActionMenu(docId: string, btn: HTMLButtonElement) {
    if (actionMenuId === docId) {
      closeActionMenu();
      return;
    }
    const rect = btn.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 220 && rect.top > 220;
    actionMenuBtnRef.current = btn;
    setActionMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - 180),
      openUp,
    });
    setActionMenuId(docId);
  }

  function resetForm() {
    setDate(todayISO());
    setPartyId(parties?.[0]?.id ?? "");
    setNotes("");
    setOriginalBillNo("");
    setLines([newLine()]);
    setError("");
  }

  function isEditable(doc: CommercialDoc) {
    return doc.status !== "converted" && !doc.stockPostedAt;
  }

  function fillFromDoc(doc: CommercialDoc) {
    setDate(doc.date);
    setPartyId(doc.partyId ?? "");
    setNotes(doc.notes ?? "");
    setOriginalBillNo(doc.originalBillNo ?? "");
    setLines(doc.lines.map(lineFromDoc));
    setError("");
  }

  function openCreate() {
    setEditing(null);
    setViewing(false);
    setConvertSource(null);
    resetForm();
    setOpen(true);
  }

  function openAddSupplier() {
    setNewParty(
      emptyPartyForm({
        type: "supplier",
        country: company?.country ?? "",
        balanceType: "to_pay",
      }),
    );
    setAddPartyOpen(true);
  }

  async function createSupplierInline(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newParty.name.trim()) return;
    const { party } = await api.parties.create({
      companyId,
      ...partyPayloadFromForm({
        ...newParty,
        type: newParty.type || "supplier",
      }),
    });
    await reloadParties();
    setPartyId(party.id);
    setAddPartyOpen(false);
    setNewParty(emptyPartyForm());
  }

  function openView(doc: CommercialDoc) {
    setEditing(doc);
    setViewing(true);
    setConvertSource(null);
    fillFromDoc(doc);
    setOpen(true);
  }

  function openEdit(doc: CommercialDoc) {
    if (!isEditable(doc)) {
      openView(doc);
      return;
    }
    setEditing(doc);
    setViewing(false);
    setConvertSource(null);
    fillFromDoc(doc);
    setOpen(true);
  }

  function payloadLines() {
    return lines
      .filter((line) => line.name.trim() && Number(line.qty) > 0)
      .map((line) => {
        const qty = Number(line.qty) || 0;
        const receivedQty = Number(line.receivedQty) || 0;
        const rate = Number(line.rate) || 0;
        const taxPercent = Number(line.taxPercent) || 0;
        // GRN totals/amounts bill on received qty; ordered qty is kept for reference.
        const billableQty = docType === "grn" ? receivedQty : qty;
        return {
          itemId: line.itemId || undefined,
          name: line.name.trim(),
          qty,
          receivedQty: docType === "grn" ? receivedQty : undefined,
          rate,
          taxPercent,
          unit: line.unit || "pcs",
          // Amount is taxable (qty×rate); tax is applied in document totals.
          amount: billableQty * rate,
        };
      });
  }

  function lineBillableQty(line: DocLine) {
    if (docType === "grn") {
      return Number(line.receivedQty ?? line.qty) || 0;
    }
    return Number(line.qty) || 0;
  }

  function lineDisplayAmount(line: DocLine) {
    const qty = lineBillableQty(line);
    // Prefer stored exclusive amount; peel tax from legacy inclusive rows.
    const tax = Number(line.taxPercent) || 0;
    const base = qty * (Number(line.rate) || 0);
    const stored = Number(line.amount);
    if (Number.isFinite(stored) && stored > 0) {
      if (tax <= 0) return stored;
      const inclusive = base * (1 + tax / 100);
      if (Math.abs(stored - inclusive) < 0.05) return base;
      return stored;
    }
    return base;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (viewing) return;
    if (!companyId || !partyId || !date) return;
    const validLines = payloadLines();
    if (!validLines.length) {
      setError("Add an item name and quantity.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (convertSource) {
        await api.docs.convert(convertSource.id, { lines: validLines });
      } else {
        const body = {
          date,
          partyId,
          notes: notes.trim() || undefined,
          originalBillNo: originalBillNo.trim() || undefined,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          lines: validLines,
        };
        if (editing) {
          await api.docs.update(editing.id, body);
        } else {
          await api.docs.create({ companyId, docType, ...body });
        }
      }
      setOpen(false);
      setEditing(null);
      setViewing(false);
      setConvertSource(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  function startConvertToPo(doc: CommercialDoc) {
    setConvertSource(doc);
    setEditing(null);
    setViewing(false);
    setDate(doc.date);
    setPartyId(doc.partyId ?? "");
    setNotes(doc.notes ?? "");
    setLines(doc.lines.map(lineFromDoc));
    setError("");
    setOpen(true);
  }

  async function revoke(doc: CommercialDoc) {
    if (
      !confirm(
        `Revoke conversion of ${doc.number}? Unused downstream documents will be deleted and the previous document will reopen.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.docs.revoke(doc.id);
      setOpen(false);
      setViewing(false);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function convert(doc: CommercialDoc) {
    if (docType === "rfq") {
      startConvertToPo(doc);
      return;
    }
    if (docType === "grn") {
      setBillSource(doc);
      setInvoiceNo("");
      setPaymentTypeId("");
      return;
    }
    if (!confirm(`${meta.nextLabel}?`)) return;
    setBusy(true);
    try {
      await api.docs.convert(doc.id);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateStock(doc: CommercialDoc) {
    if (!confirm(docType === "grn" ? "Add received quantities to stock?" : "Deduct return quantities from stock?")) {
      return;
    }
    setBusy(true);
    try {
      await api.docs.postStock(doc.id);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Stock update failed");
    } finally {
      setBusy(false);
    }
  }

  async function createBill(e: FormEvent) {
    e.preventDefault();
    if (!billSource) return;
    setBusy(true);
    try {
      await api.docs.convert(billSource.id, {
        invoiceNo: invoiceNo.trim() || undefined,
        paymentTypeId: paymentTypeId || undefined,
      });
      setBillSource(null);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Bill creation failed");
    } finally {
      setBusy(false);
    }
  }

  function purchaseExportSpec(doc: CommercialDoc): DocumentExportSpec {
    const supplier = (doc.partyId && partyNames.get(doc.partyId)) || "—";
    const priced = docType !== "rfq";
    const qtyHeader = docType === "grn" ? "Received" : "Qty";
    const columns = priced
      ? [
          { header: "#", align: "center" as const, width: 12 },
          { header: "Item" },
          { header: qtyHeader, align: "right" as const, width: 18 },
          { header: "Rate", align: "right" as const, width: 26 },
          { header: "Tax", align: "right" as const, width: 18 },
          { header: "Amount", align: "right" as const, width: 30 },
        ]
      : [
          { header: "#", align: "center" as const, width: 12 },
          { header: "Item" },
          { header: qtyHeader, align: "right" as const, width: 24 },
        ];
    let subtotal = 0;
    let taxTotal = 0;
    const rows = doc.lines.map((line, index) => {
      const qty = lineBillableQty(line);
      const amount = lineDisplayAmount(line);
      const base = qty * line.rate;
      subtotal += base;
      taxTotal += (base * (Number(line.taxPercent) || 0)) / 100;
      return priced
        ? [
            index + 1,
            line.name,
            qty,
            fmtMoney(line.rate),
            `${line.taxPercent}%`,
            fmtMoney(amount),
          ]
        : [index + 1, line.name, qty];
    });
    const grandTotal = subtotal + taxTotal;
    return {
      filename: doc.number,
      companyName: company?.name || "",
      companyLines: [
        company?.address,
        company?.phone,
        company?.gstin ? `GSTIN/TRN: ${company.gstin}` : "",
      ].filter((v): v is string => Boolean(v && String(v).trim())),
      title: DOC_TITLES[docType],
      docNumber: doc.number,
      meta: [
        { label: "Supplier", value: supplier },
        { label: "Date", value: doc.date },
      ],
      columns,
      rows,
      totals: priced
        ? [
            { label: "Subtotal", value: fmtMoney(subtotal) },
            { label: "Tax", value: fmtMoney(taxTotal) },
            { label: "Total", value: fmtMoney(grandTotal), emphasize: true },
          ]
        : undefined,
      notes: doc.notes || undefined,
      footerNote: "Authorized Signatory",
    };
  }

  function printDoc(doc: CommercialDoc) {
    printDocument(purchaseExportSpec(doc));
  }

  function downloadDocPdf(doc: CommercialDoc) {
    downloadDocumentPdf(purchaseExportSpec(doc));
  }

  function exportDocExcel(doc: CommercialDoc) {
    const supplier = (doc.partyId && partyNames.get(doc.partyId)) || "";
    const priced = docType !== "rfq";
    let subtotal = 0;
    let taxTotal = 0;
    const rows = doc.lines.map((line, index) => {
      const qty = lineBillableQty(line);
      const amount = lineDisplayAmount(line);
      const base = qty * line.rate;
      subtotal += base;
      taxTotal += (base * (Number(line.taxPercent) || 0)) / 100;
      return priced
        ? [index + 1, line.name, qty, line.rate.toFixed(2), line.taxPercent, amount.toFixed(2)]
        : [index + 1, line.name, qty];
    });
    downloadExcelTable({
      filename: doc.number,
      sheetTitle: `${DOC_TITLES[docType]} ${doc.number}`,
      metaRows: [
        ["Company", company?.name || ""],
        ["Supplier", supplier],
        ["Date", doc.date],
        ["Status", String(doc.status)],
        ...(priced
          ? [
              ["Subtotal", subtotal.toFixed(2)] as [string, string],
              ["Tax", taxTotal.toFixed(2)] as [string, string],
              ["Total", (subtotal + taxTotal).toFixed(2)] as [string, string],
            ]
          : []),
      ],
      columns: priced
        ? ["#", "Item", docType === "grn" ? "Received" : "Qty", "Rate", "Tax%", "Amount"]
        : ["#", "Item", docType === "grn" ? "Received" : "Qty"],
      rows,
    });
  }

  const showPrice = docType === "purchase_order" || docType === "grn" || Boolean(convertSource);
  const lineClass = docType === "grn"
    ? "purchase-line grn"
    : showPrice
      ? "purchase-line priced"
      : "purchase-line basic";
  const title = convertSource
    ? `Convert ${convertSource.number} to PO`
    : viewing
      ? `${meta.title} ${editing?.number ?? ""}`
      : `${editing ? "Edit" : "Add"} ${meta.title}`;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{meta.title}</h1>
          <p className="muted">{meta.purpose}</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> {meta.addLabel}
          </button>
        </div>
      </header>
      <div className="content">
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>No.</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  {docType !== "rfq" ? <th>Amount</th> : null}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.date}</td>
                    <td>
                      <button className="linkish" type="button" onClick={() => openView(doc)}>
                        <strong>{doc.number}</strong>
                      </button>
                    </td>
                    <td>{(doc.partyId && partyNames.get(doc.partyId)) || "—"}</td>
                    <td><span className="badge badge-muted">{doc.status}</span></td>
                    {docType !== "rfq" ? <td className="money">{fmtMoney(doc.grandTotal)}</td> : null}
                    <td>
                      <div className="purchase-row-actions">
                        {docType === "grn" && !doc.stockPostedAt && doc.status !== "converted" ? (
                          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void updateStock(doc)}>
                            Receive to stock
                          </button>
                        ) : null}
                        {doc.stockPostedAt ? (
                          <span className="muted purchase-row-meta">Stock updated</span>
                        ) : null}
                        {meta.nextLabel && doc.status !== "converted" ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => void convert(doc)}
                          >
                            {meta.nextLabel}
                          </button>
                        ) : null}
                        <div className="purchase-row-more">
                          <button
                            type="button"
                            className="icon-tool"
                            title="More actions"
                            aria-label="More actions"
                            aria-expanded={actionMenuId === doc.id}
                            onClick={(e) => openActionMenu(doc.id, e.currentTarget)}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!docs?.length ? (
                  <tr>
                    <td colSpan={6}><div className="empty">No {meta.title.toLowerCase()} yet.</div></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={listPage} />
        </div>
      </div>

      {open ? (
        <Modal
          title={title}
          className="modal-purchase-flow"
          onClose={() => {
            setOpen(false);
            setViewing(false);
          }}
          footer={
            viewing && editing ? (
              <>
                <button className="btn btn-ghost" type="button" onClick={() => { setOpen(false); setViewing(false); }}>
                  Close
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => downloadDocPdf(editing)}>
                  <FileText size={13} /> PDF
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => exportDocExcel(editing)}>
                  <FileSpreadsheet size={13} /> Excel
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => printDoc(editing)}>
                  <Printer size={13} /> Print
                </button>
                {isEditable(editing) ? (
                  <button className="btn btn-ghost" type="button" onClick={() => openEdit(editing)}>
                    <Pencil size={13} /> Edit
                  </button>
                ) : null}
                {meta.nextLabel && editing.status !== "converted" ? (
                  <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void convert(editing)}>
                    {meta.nextLabel}
                  </button>
                ) : null}
                {editing.status === "converted" || editing.convertedFromId ? (
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void revoke(editing)}>
                    Revert
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button className="btn btn-ghost" type="button" onClick={() => { setOpen(false); setViewing(false); }}>Cancel</button>
                <button className="btn btn-primary" type="submit" form="purchase-flow-form" disabled={busy}>
                  {busy ? "Saving…" : convertSource ? "Create PO" : "Save"}
                </button>
              </>
            )
          }
        >
          <form id="purchase-flow-form" onSubmit={save} className={viewing ? "purchase-form-readonly" : undefined}>
            {viewing && editing && !isEditable(editing) ? (
              <p className="purchase-lock-hint">
                {editing.stockPostedAt
                  ? "Stock is posted on this document. It is view only."
                  : `Converted${editing.convertedToType ? ` to ${String(editing.convertedToType).replaceAll("_", " ")}` : ""}. Editing is locked.`}
              </p>
            ) : null}
            <div className="purchase-form-header">
              <label className="field">
                Supplier *
                <div className="purchase-supplier-row">
                  <select
                    value={partyId}
                    required
                    disabled={viewing}
                    onChange={(e) => {
                      if (e.target.value === "__add__") {
                        openAddSupplier();
                        return;
                      }
                      setPartyId(e.target.value);
                    }}
                  >
                    <option value="">Select supplier</option>
                    {(parties ?? []).map((party) => (
                      <option key={party.id} value={party.id}>{party.name}</option>
                    ))}
                    {viewing ? null : <option value="__add__">+ Add supplier</option>}
                  </select>
                  {viewing ? null : (
                    <button
                      className="purchase-add-supplier"
                      type="button"
                      onClick={openAddSupplier}
                      title="Add supplier"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  )}
                </div>
              </label>
              <label className="field">
                Date *
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={viewing} />
              </label>
              {docType === "purchase_return" ? (
                <label className="field">
                  Original bill no.
                  <input value={originalBillNo} onChange={(e) => setOriginalBillNo(e.target.value)} disabled={viewing} />
                </label>
              ) : null}
              <label className="field purchase-notes-field">
                {docType === "purchase_return" ? "Reason" : "Notes"}
                <input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={viewing} />
              </label>
            </div>
            <div className="purchase-lines">
              <div className={`${lineClass} purchase-line-head`}>
                <span>Item</span><span>Name *</span><span>{docType === "purchase_return" ? "Return Qty *" : "Qty *"}</span>
                {docType === "grn" ? <span>Received Qty *</span> : null}
                {showPrice ? <><span>Unit Rate</span><span>Tax %</span></> : null}
                <span />
              </div>
              {lines.map((line, index) => (
                <div className={lineClass} key={line.key}>
                  <select
                    value={line.itemId}
                    disabled={viewing}
                    onChange={(e) => {
                      const item = (items ?? []).find((row) => row.id === e.target.value);
                      setLines((current) => current.map((row, i) => i === index ? {
                        ...row,
                        itemId: e.target.value,
                        name: item?.name ?? row.name,
                        rate: String(item?.purchasePrice ?? row.rate),
                        taxPercent: String(item?.taxPercent ?? row.taxPercent),
                        unit: item?.unit ?? row.unit,
                      } : row));
                    }}
                  >
                    <option value="">Custom</option>
                    {(items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <input value={line.name} required disabled={viewing} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
                  <input type="number" min="0.001" step="any" value={line.qty} required disabled={viewing} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, qty: e.target.value, receivedQty: docType === "grn" ? e.target.value : row.receivedQty } : row))} />
                  {docType === "grn" ? (
                    <input type="number" min="0" step="any" value={line.receivedQty} required disabled={viewing} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, receivedQty: e.target.value } : row))} />
                  ) : null}
                  {showPrice ? (
                    <>
                      <input type="number" min="0" step="any" value={line.rate} disabled={viewing} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, rate: e.target.value } : row))} />
                      <input type="number" min="0" step="any" value={line.taxPercent} disabled={viewing} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, taxPercent: e.target.value } : row))} />
                    </>
                  ) : null}
                  {viewing ? <span /> : (
                    <button className="btn btn-ghost" type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>×</button>
                  )}
                </div>
              ))}
              {viewing ? null : (
                <button className="btn btn-ghost" type="button" onClick={() => setLines((current) => [...current, newLine()])}>
                  <Plus size={13} /> Add line
                </button>
              )}
            </div>
            {showPrice ? <p className="purchase-total">Total: <strong>{fmtMoney(totals.grandTotal)}</strong></p> : null}
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        </Modal>
      ) : null}

      {addPartyOpen ? (
        <Modal
          title="Add Supplier"
          className="inv-party-modal modal-party"
          nested
          onClose={() => {
            setAddPartyOpen(false);
            setNewParty(emptyPartyForm());
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setAddPartyOpen(false);
                  setNewParty(emptyPartyForm());
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="purchase-add-supplier-form">
                Save Supplier
              </button>
            </>
          }
        >
          <form id="purchase-add-supplier-form" className="inv-party-form" onSubmit={createSupplierInline}>
            <p className="inv-party-form-hint">Create a supplier and select them on this {meta.title}.</p>
            <PartyFormFields form={newParty} onChange={setNewParty} />
          </form>
        </Modal>
      ) : null}

      {billSource ? (
        <Modal
          title={`Create Purchase Bill from ${billSource.number}`}
          onClose={() => setBillSource(null)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setBillSource(null)}>Cancel</button>
              <button className="btn btn-primary" type="submit" form="grn-bill-form" disabled={busy}>Create Bill</button>
            </>
          }
        >
          <form id="grn-bill-form" className="form-grid" onSubmit={createBill}>
            <label className="field">
              Supplier invoice no.
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Auto if blank" />
            </label>
            <label className="field">
              Payment type
              <select value={paymentTypeId} onChange={(e) => setPaymentTypeId(e.target.value)}>
                <option value="">Credit</option>
                {(accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          </form>
        </Modal>
      ) : null}

      {actionMenuId && actionMenuPos
        ? createPortal(
            (() => {
              const menuDoc = (docs ?? []).find((row) => row.id === actionMenuId);
              if (!menuDoc) return null;
              return (
                <div
                  className={`sale-list-menu sale-list-menu-fixed${actionMenuPos.openUp ? " drop-up" : ""}`}
                  ref={actionMenuRef}
                  style={{
                    top: actionMenuPos.openUp ? undefined : actionMenuPos.top,
                    bottom: actionMenuPos.openUp
                      ? window.innerHeight - actionMenuPos.top
                      : undefined,
                    left: actionMenuPos.left,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      openView(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <Eye size={13} /> View
                  </button>
                  {isEditable(menuDoc) ? (
                    <button
                      type="button"
                      onClick={() => {
                        openEdit(menuDoc);
                        closeActionMenu();
                      }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      downloadDocPdf(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <FileText size={13} /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportDocExcel(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      printDoc(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <Printer size={13} /> Print
                  </button>
                  {menuDoc.status === "converted" || menuDoc.convertedFromId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void revoke(menuDoc);
                        closeActionMenu();
                      }}
                    >
                      <Undo2 size={13} /> Revert
                    </button>
                  ) : null}
                </div>
              );
            })(),
            document.body,
          )
        : null}
    </>
  );
}
