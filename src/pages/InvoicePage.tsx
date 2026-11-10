import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  Calculator,
  ChevronDown,
  FileText,
  GripVertical,
  List,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Modal } from "../components/Modal";
import type { Item, Party, TxnType } from "../db/types";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { todayISO } from "../lib/format";
import { taxOptionsForCountry } from "../lib/companyLocale";
import { useAsync } from "../lib/useAsync";

function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

type SaleMode = "credit" | "cash";
type PriceTaxMode = "without" | "with";

interface DraftLine {
  key: string;
  itemId: string;
  name: string;
  qty: string;
  unit: string;
  rate: string;
  discountPercent: string;
  taxPercent: string;
}

interface InvoiceDraft {
  id: string;
  partyId: string;
  partyPhone: string;
  billingAddress: string;
  saleMode: SaleMode;
  paymentTypeId: string;
  date: string;
  dueDate: string;
  stateOfSupply: string;
  refNo: string;
  refReady: boolean;
  priceTaxMode: PriceTaxMode;
  notes: string;
  terms: string;
  showTerms: boolean;
  showNotes: boolean;
  roundOff: boolean;
  lines: DraftLine[];
}

const UNITS = ["NONE", "pcs", "kg", "ltr", "box", "mtr", "BAG", "BTL", "BDL"] as const;

const SALE_VIEWS = [
  "Sale Invoice",
  "Estimate / Quotation",
  "Proforma Invoice",
  "Payment-In",
  "Sale Order",
  "Delivery Challan",
  "Sale Return / Credit Note",
  "NEXRON POS",
] as const;

export function InvoicePage({ type }: { type: "sale" | "purchase" }) {
  const { company } = useApp();
  const companyId = company?.id;
  const taxOptions = taxOptionsForCountry(company?.country);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewIndex = Number(searchParams.get("view") || "0") || 0;

  const docTitle =
    type === "purchase"
      ? "Purchase Bill"
      : SALE_VIEWS[Math.min(viewIndex, SALE_VIEWS.length - 1)] ?? "Sale Invoice";

  const listTitle = type === "sale" ? "Sale Invoices" : "Purchase Bills";
  const addLabel = type === "sale" ? "Add Sale" : "Add Purchase";

  const [open, setOpen] = useState(() => searchParams.get("create") === "1");
  const [docs, setDocs] = useState<InvoiceDraft[]>(() =>
    searchParams.get("create") === "1" ? [createDraft()] : [],
  );
  const [activeDocId, setActiveDocId] = useState(() => docs[0]?.id ?? "");
  const [partyQuery, setPartyQuery] = useState("");
  const [partyMenuOpen, setPartyMenuOpen] = useState(false);
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [priceMenuOpen, setPriceMenuOpen] = useState(false);
  const [itemMenuKey, setItemMenuKey] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemForKey, setAddItemForKey] = useState<string | null>(null);
  const [itemEditorTab, setItemEditorTab] = useState<"pricing" | "stock">("pricing");
  const [newParty, setNewParty] = useState({ name: "", phone: "", address: "" });
  const [newItem, setNewItem] = useState(emptyItemForm);
  const partyBoxRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);

  const { data: parties, reload: reloadParties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: all } = await api.parties.list(companyId);
    return all.filter((p) => (type === "sale" ? p.type !== "supplier" : p.type !== "customer"));
  }, [companyId, type]);

  const { data: items, reload: reloadItems } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const { data: payments } = useAsync(async () => {
    if (!companyId) return [];
    const { accounts } = await api.payments.accounts(companyId);
    return accounts;
  }, [companyId]);

  const { data: txns, reload: reloadTxns } = useAsync(async () => {
    if (!companyId) return [];
    const { transactions } = await api.transactions.list(companyId, type);
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  }, [companyId, type]);

  const partyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parties ?? []) map.set(p.id, p.name);
    return map;
  }, [parties]);

  const partyBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of parties ?? []) {
      const signed = p.balanceType === "to_receive" ? p.openingBalance : -p.openingBalance;
      map.set(p.id, signed);
    }
    return map;
  }, [parties]);

  const partyById = useMemo(() => {
    const map = new Map<string, Party>();
    for (const p of parties ?? []) map.set(p.id, p);
    return map;
  }, [parties]);

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? docs[0];
  const selectedParty = activeDoc?.partyId ? partyById.get(activeDoc.partyId) : undefined;
  const filteredParties = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    const list = parties ?? [];
    if (!q) return list.slice(0, 8);
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [parties, partyQuery]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      if (!open || docs.length === 0) {
        const draft = createDraft("", payments?.[0]?.id);
        setDocs([draft]);
        setActiveDocId(draft.id);
        setOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!open || !activeDoc) return;
    if (!activeDoc.paymentTypeId && payments?.[0]?.id) {
      patchActiveDoc({ paymentTypeId: payments[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parties, payments, activeDocId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!partyBoxRef.current?.contains(e.target as Node)) setPartyMenuOpen(false);
      if (!itemMenuRef.current?.contains(e.target as Node)) setItemMenuKey(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const itemMenuLine = activeDoc?.lines.find((l) => l.key === itemMenuKey);
  const filteredItems = useMemo(() => {
    const q = (itemMenuLine?.name ?? "").trim().toLowerCase();
    const list = items ?? [];
    if (!q || itemMenuLine?.itemId) return list.slice(0, 12);
    return list
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.sku ?? "").toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [items, itemMenuLine?.name, itemMenuLine?.itemId]);

  useEffect(() => {
    if (!selectedParty) {
      setPartyQuery("");
      return;
    }
    setPartyQuery(selectedParty.name);
  }, [selectedParty?.id]);

  useEffect(() => {
    if (!open || !companyId) return;
    const pending = docs.filter((d) => !d.refReady);
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      const { transactions } = await api.transactions.list(companyId, type);
      const count = transactions.length + 1;
      if (cancelled) return;
      setDocs((prev) => {
        const used = new Set(prev.filter((d) => d.refReady).map((d) => d.refNo));
        let next = count;
        return prev.map((doc) => {
          if (doc.refReady) return doc;
          while (used.has(String(next))) next += 1;
          const refNo = String(next);
          used.add(refNo);
          next += 1;
          return { ...doc, refNo, refReady: true };
        });
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, type, docs.map((d) => d.id + String(d.refReady)).join("|")]);

  const lines = activeDoc?.lines ?? [];

  const priceIncludesTax = activeDoc?.priceTaxMode === "with";

  const lineCalcs = useMemo(
    () =>
      lines.map((line) => {
        const qty = Number(line.qty) || 0;
        const rate = Number(line.rate) || 0;
        const discountPercent = Number(line.discountPercent) || 0;
        const taxPercent = Number(line.taxPercent) || 0;
        const base = qty * rate;
        const discountAmount = (base * discountPercent) / 100;
        const afterDiscount = base - discountAmount;
        if (priceIncludesTax && taxPercent > 0) {
          const taxable = afterDiscount / (1 + taxPercent / 100);
          const taxAmount = afterDiscount - taxable;
          return {
            qty,
            rate,
            discountPercent,
            discountAmount,
            taxPercent,
            taxAmount,
            amount: afterDiscount,
          };
        }
        const taxAmount = (afterDiscount * taxPercent) / 100;
        return {
          qty,
          rate,
          discountPercent,
          discountAmount,
          taxPercent,
          taxAmount,
          amount: afterDiscount + taxAmount,
        };
      }),
    [lines, priceIncludesTax],
  );

  const totals = useMemo(() => {
    let qtyTotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let amountTotal = 0;
    for (const row of lineCalcs) {
      qtyTotal += row.qty;
      discountTotal += row.discountAmount;
      taxTotal += row.taxAmount;
      amountTotal += row.amount;
    }
    const roundOff = activeDoc?.roundOff ?? true;
    const rounded = roundOff ? Math.round(amountTotal) : amountTotal;
    const roundDiff = rounded - amountTotal;
    return {
      qtyTotal,
      discountTotal,
      taxTotal,
      amountTotal,
      grandTotal: rounded,
      roundDiff,
    };
  }, [lineCalcs, activeDoc?.roundOff]);

  const selectedPartyBal = activeDoc ? partyBalanceMap.get(activeDoc.partyId) ?? 0 : 0;

  function patchActiveDoc(patch: Partial<InvoiceDraft>) {
    setDocs((prev) =>
      prev.map((doc) => (doc.id === activeDocId ? { ...doc, ...patch } : doc)),
    );
  }

  function updateActiveDoc(updater: (doc: InvoiceDraft) => InvoiceDraft) {
    setDocs((prev) => prev.map((doc) => (doc.id === activeDocId ? updater(doc) : doc)));
  }

  function openCreate() {
    const draft = createDraft("", payments?.[0]?.id);
    setDocs([draft]);
    setActiveDocId(draft.id);
    setPartyQuery("");
    setOpen(true);
    const params = new URLSearchParams(searchParams);
    params.set("create", "1");
    navigate({ search: params.toString() }, { replace: true });
  }

  function addDocTab() {
    const draft = createDraft("", payments?.[0]?.id);
    setDocs((prev) => [...prev, draft]);
    setActiveDocId(draft.id);
    setPartyQuery("");
  }

  function selectParty(party: Party) {
    patchActiveDoc({
      partyId: party.id,
      partyPhone: party.phone ?? "",
      billingAddress: party.address ?? "",
      stateOfSupply: activeDoc?.stateOfSupply || company?.state || "",
    });
    setPartyQuery(party.name);
    setPartyMenuOpen(false);
  }

  function clearParty() {
    patchActiveDoc({
      partyId: "",
      partyPhone: "",
      billingAddress: "",
    });
    setPartyQuery("");
  }

  function openAddParty(seedName = "") {
    const typed = seedName.trim();
    const matchesExisting = (parties ?? []).some(
      (p) => p.name.toLowerCase() === typed.toLowerCase(),
    );
    setNewParty({
      name: matchesExisting ? "" : typed,
      phone: "",
      address: "",
    });
    setPartyMenuOpen(false);
    setAddPartyOpen(true);
  }

  async function createPartyInline(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newParty.name.trim()) return;
    const { party } = await api.parties.create({
      companyId,
      name: newParty.name.trim(),
      phone: newParty.phone.trim() || undefined,
      address: newParty.address.trim() || undefined,
      type: type === "sale" ? "customer" : "supplier",
      openingBalance: 0,
      balanceType: "to_receive",
    });
    await reloadParties();
    selectParty(party);
    setAddPartyOpen(false);
    setNewParty({ name: "", phone: "", address: "" });
  }

  function exitCreateMode() {
    setDocs([]);
    setActiveDocId("");
    setOpen(false);
    const params = new URLSearchParams(searchParams);
    params.delete("create");
    navigate({ search: params.toString() }, { replace: true });
  }

  function closeDocTab(id: string) {
    const closedIndex = docs.findIndex((d) => d.id === id);
    const next = docs.filter((d) => d.id !== id);
    if (!next.length) {
      exitCreateMode();
      return;
    }
    setDocs(next);
    if (id === activeDocId) {
      const fallback = next[Math.max(0, closedIndex - 1)] ?? next[0];
      setActiveDocId(fallback.id);
    }
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    updateActiveDoc((doc) => ({
      ...doc,
      lines: doc.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));
  }

  function applyItemToLine(key: string, item: Item) {
    updateLine(key, {
      itemId: item.id,
      name: item.name,
      unit: item.unit || "NONE",
      rate: String(type === "sale" ? item.salePrice : item.purchasePrice),
      taxPercent: String(item.taxPercent),
      qty: "1",
    });
    setItemMenuKey(null);
  }

  function openAddItem(lineKey: string, seedName = "") {
    const typed = seedName.trim();
    const matchesExisting = (items ?? []).some(
      (i) => i.name.toLowerCase() === typed.toLowerCase(),
    );
    setNewItem({
      ...emptyItemForm(),
      name: matchesExisting ? "" : typed,
      taxPercent: taxOptions[0]?.value ?? "0",
    });
    setItemEditorTab("pricing");
    setAddItemForKey(lineKey);
    setItemMenuKey(null);
    setAddItemOpen(true);
  }

  async function createItemInline(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newItem.name.trim() || !addItemForKey) return;
    const { item } = await api.items.create({
      companyId,
      name: newItem.name.trim(),
      unit: newItem.unit || "pcs",
      salePrice: Number(newItem.salePrice) || 0,
      purchasePrice: Number(newItem.purchasePrice) || 0,
      stockQty: newItem.itemType === "service" ? 0 : Number(newItem.stockQty) || 0,
      taxPercent: Number(newItem.taxPercent) || 0,
      category: undefined,
      sku: undefined,
    });
    await reloadItems();
    applyItemToLine(addItemForKey, item);
    setAddItemOpen(false);
    setAddItemForKey(null);
    setNewItem(emptyItemForm());
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !activeDoc?.partyId) return;
    const validLines = activeDoc.lines.filter((l) => l.name && Number(l.qty) > 0);
    if (!validLines.length) {
      alert("Add at least one line item");
      return;
    }

    const { transactions } = await api.transactions.list(companyId, type);
    const count = transactions.length + 1;
    const number = type === "sale" ? `INV-${1000 + count}` : `PUR-${500 + count}`;

    let subtotal = 0;
    let taxTotal = 0;
    const includesTax = activeDoc.priceTaxMode === "with";
    const lineRows = validLines.map((l) => {
      const qty = Number(l.qty) || 0;
      const rate = Number(l.rate) || 0;
      const discountPercent = Number(l.discountPercent) || 0;
      const taxPercent = Number(l.taxPercent) || 0;
      const base = qty * rate;
      const discountAmount = (base * discountPercent) / 100;
      const afterDiscount = base - discountAmount;
      let taxable = afterDiscount;
      let taxAmt = (taxable * taxPercent) / 100;
      let amount = taxable + taxAmt;
      if (includesTax && taxPercent > 0) {
        taxable = afterDiscount / (1 + taxPercent / 100);
        taxAmt = afterDiscount - taxable;
        amount = afterDiscount;
      }
      subtotal += taxable;
      taxTotal += taxAmt;
      return {
        itemId: l.itemId || undefined,
        name: l.name,
        qty,
        rate,
        taxPercent,
        amount,
      };
    });

    const grand = activeDoc.roundOff ? Math.round(subtotal + taxTotal) : subtotal + taxTotal;
    const noteParts = [
      activeDoc.saleMode === "credit" ? "Credit sale" : "Cash sale",
      activeDoc.dueDate && activeDoc.saleMode === "credit"
        ? `Due: ${activeDoc.dueDate}`
        : undefined,
      activeDoc.stateOfSupply ? `Supply: ${activeDoc.stateOfSupply}` : undefined,
      activeDoc.billingAddress.trim() || undefined,
      activeDoc.notes.trim() || undefined,
      activeDoc.terms.trim() ? `T&C: ${activeDoc.terms.trim()}` : undefined,
    ].filter(Boolean);

    await api.transactions.create({
      companyId,
      type: type as TxnType,
      number,
      date: activeDoc.date,
      partyId: activeDoc.partyId,
      paymentTypeId:
        activeDoc.saleMode === "cash" ? activeDoc.paymentTypeId || undefined : undefined,
      notes: noteParts.length ? noteParts.join(" · ") : undefined,
      subtotal,
      taxTotal,
      grandTotal: grand,
      lines: lineRows,
    });

    reloadTxns();
    reloadItems();
    // Close only the saved tab; keep other drafts open.
    closeDocTab(activeDoc.id);
  }

  if (open && activeDoc) {
    return (
      <>
      <div className="full-editor invoice-fullscreen">
        <div className="inv-doc-tabs">
          <div className="inv-doc-tabs-left">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className={`inv-doc-tab${doc.id === activeDoc.id ? " active" : ""}`}
                role="tab"
                aria-selected={doc.id === activeDoc.id}
                onClick={() => setActiveDocId(doc.id)}
              >
                <span>
                  {docTitle} #{doc.refNo || "1"}
                </span>
                <button
                  type="button"
                  className="inv-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDocTab(doc.id);
                  }}
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inv-doc-add"
              aria-label="New document"
              onClick={addDocTab}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="inv-doc-tabs-right">
            <button type="button" aria-label="Calculator">
              <Calculator size={16} />
            </button>
            <button type="button" aria-label="Settings" onClick={() => navigate("/settings")}>
              <Settings size={16} />
            </button>
            <button type="button" aria-label="Notifications">
              <Bell size={16} />
            </button>
          </div>
        </div>

        <form id="invoice-form" className="inv-sheet" onSubmit={save}>
          <div className="inv-sheet-scroll">
            <div className="inv-top">
              <div className="inv-top-left">
                <div className="inv-sale-mode">
                  <h1>{type === "sale" ? "Sale" : "Purchase"}</h1>
                  <div
                    className={`inv-mode-toggle${activeDoc.saleMode === "cash" ? " cash" : ""}`}
                    role="group"
                    aria-label="Sale mode"
                  >
                    <button
                      type="button"
                      className={activeDoc.saleMode === "credit" ? "active" : ""}
                      onClick={() => patchActiveDoc({ saleMode: "credit" })}
                    >
                      Credit
                    </button>
                    <button
                      type="button"
                      className={activeDoc.saleMode === "cash" ? "active" : ""}
                      onClick={() => patchActiveDoc({ saleMode: "cash" })}
                    >
                      Cash
                    </button>
                  </div>
                </div>

                <div className="inv-party-row">
                  <div className="inv-party-field" ref={partyBoxRef}>
                    <span>
                      {type === "sale" ? "Customer" : "Supplier"}
                      <span className="req">*</span>
                    </span>
                    <div className="inv-party-search">
                      <input
                        value={partyQuery}
                        onChange={(e) => {
                          setPartyQuery(e.target.value);
                          setPartyMenuOpen(true);
                          if (activeDoc.partyId) clearParty();
                        }}
                        onFocus={() => setPartyMenuOpen(true)}
                        placeholder="Search by Name/Phone *"
                        required={!activeDoc.partyId}
                      />
                      {activeDoc.partyId ? (
                        <button
                          type="button"
                          className="inv-party-clear"
                          onClick={clearParty}
                          aria-label="Clear party"
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                      {partyMenuOpen ? (
                        <div className="inv-party-menu">
                          {filteredParties.map((p) => {
                            const bal = partyBalanceMap.get(p.id) ?? 0;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                className="inv-party-option"
                                onClick={() => selectParty(p)}
                              >
                                <span>
                                  <strong>{p.name}</strong>
                                  {p.phone ? <small>{p.phone}</small> : null}
                                </span>
                                <em className={bal < 0 ? "pay" : ""}>
                                  {Math.abs(bal).toLocaleString("en-IN")}
                                </em>
                              </button>
                            );
                          })}
                          {!filteredParties.length ? (
                            <div className="inv-party-empty">No party found</div>
                          ) : null}
                          <button
                            type="button"
                            className="inv-party-add"
                            onClick={() => openAddParty(partyQuery)}
                          >
                            <Plus size={14} /> Add Party
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {!activeDoc.partyId ? (
                      <button
                        type="button"
                        className="inv-add-party-link"
                        onClick={() => openAddParty(partyQuery)}
                      >
                        <Plus size={13} /> Add Party
                      </button>
                    ) : null}
                  </div>

                  <label className="inv-phone-field">
                    <span>Phone No.</span>
                    <input
                      value={activeDoc.partyPhone}
                      onChange={(e) => patchActiveDoc({ partyPhone: e.target.value })}
                      placeholder="Phone"
                    />
                  </label>
                </div>

                {activeDoc.partyId ? (
                  <div className={`inv-party-bal${selectedPartyBal < 0 ? " pay" : ""}`}>
                    Party Balance: {Math.abs(selectedPartyBal).toLocaleString("en-IN")}
                  </div>
                ) : null}

                {activeDoc.partyId || activeDoc.billingAddress ? (
                  <label className="inv-address-field">
                    <span>Billing Address</span>
                    <textarea
                      rows={3}
                      value={activeDoc.billingAddress}
                      onChange={(e) => patchActiveDoc({ billingAddress: e.target.value })}
                      placeholder="Address fills from party, or type here"
                    />
                  </label>
                ) : null}

                {activeDoc.saleMode === "cash" ? (
                  <label className="inv-dynamic-field">
                    <span>Payment Type</span>
                    <select
                      value={activeDoc.paymentTypeId}
                      onChange={(e) => patchActiveDoc({ paymentTypeId: e.target.value })}
                      required
                    >
                      <option value="">Select</option>
                      {(payments ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="inv-dynamic-field">
                    <span>Due Date</span>
                    <input
                      type="date"
                      value={activeDoc.dueDate}
                      onChange={(e) => patchActiveDoc({ dueDate: e.target.value })}
                    />
                  </label>
                )}
              </div>

              <div className="inv-top-right">
                <label>
                  <span>Invoice Number</span>
                  <input
                    value={activeDoc.refNo}
                    onChange={(e) =>
                      patchActiveDoc({ refNo: e.target.value, refReady: true })
                    }
                  />
                </label>
                <label>
                  <span>Invoice Date</span>
                  <input
                    type="date"
                    value={activeDoc.date}
                    onChange={(e) => patchActiveDoc({ date: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="inv-grid-wrap">
              <table className="inv-grid">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-item">ITEM</th>
                    <th className="col-qty">QTY</th>
                    <th className="col-unit">UNIT</th>
                    <th className="col-price">
                      <div>PRICE/UNIT</div>
                      <div className="inv-price-mode">
                        <button
                          type="button"
                          className="inv-price-mode-btn"
                          onClick={() => setPriceMenuOpen((v) => !v)}
                        >
                          {activeDoc.priceTaxMode === "with" ? "With Tax" : "Without Tax"}{" "}
                          <ChevronDown size={12} />
                        </button>
                        {priceMenuOpen ? (
                          <div className="inv-price-menu">
                            <button
                              type="button"
                              className={activeDoc.priceTaxMode === "without" ? "active" : ""}
                              onClick={() => {
                                patchActiveDoc({ priceTaxMode: "without" });
                                setPriceMenuOpen(false);
                              }}
                            >
                              Without Tax
                            </button>
                            <button
                              type="button"
                              className={activeDoc.priceTaxMode === "with" ? "active" : ""}
                              onClick={() => {
                                patchActiveDoc({ priceTaxMode: "with" });
                                setPriceMenuOpen(false);
                              }}
                            >
                              With Tax
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </th>
                    <th className="col-disc" colSpan={2}>
                      DISCOUNT
                    </th>
                    <th className="col-tax" colSpan={2}>
                      TAX
                    </th>
                    <th className="col-amt">AMOUNT</th>
                    <th className="col-actions" />
                  </tr>
                  <tr className="inv-subhead">
                    <th colSpan={5} />
                    <th>%</th>
                    <th>AMOUNT</th>
                    <th>%</th>
                    <th>AMOUNT</th>
                    <th />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {activeDoc.lines.map((line, index) => {
                    const calc = lineCalcs[index];
                    const menuOpen = itemMenuKey === line.key;
                    return (
                      <tr key={line.key} className="inv-line-row">
                        <td className="col-num">
                          <div className="inv-row-tools">
                            <span className="inv-row-grip" aria-hidden>
                              <GripVertical size={14} />
                            </span>
                            <button
                              type="button"
                              className="inv-row-del"
                              aria-label="Delete row"
                              onClick={() =>
                                updateActiveDoc((doc) => ({
                                  ...doc,
                                  lines:
                                    doc.lines.length > 1
                                      ? doc.lines.filter((l) => l.key !== line.key)
                                      : [blankLine()],
                                }))
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                            <span className="inv-row-index">{index + 1}</span>
                          </div>
                        </td>
                        <td className="col-item">
                          <div
                            className="inv-item-picker"
                            ref={menuOpen ? itemMenuRef : undefined}
                          >
                            <input
                              value={line.name}
                              placeholder="Type / select item"
                              onFocus={() => setItemMenuKey(line.key)}
                              onChange={(e) => {
                                updateLine(line.key, {
                                  name: e.target.value,
                                  itemId: "",
                                });
                                setItemMenuKey(line.key);
                              }}
                            />
                            {menuOpen ? (
                              <div className="inv-item-menu">
                                <div className="inv-item-menu-head">
                                  <button
                                    type="button"
                                    className="inv-item-add"
                                    onClick={() => openAddItem(line.key, line.name)}
                                  >
                                    <Plus size={14} /> Add Item
                                  </button>
                                  <span>SALE PRICE</span>
                                  <span>PURCHASE PRICE</span>
                                  <span>STOCK</span>
                                </div>
                                <div className="inv-item-menu-list">
                                  {filteredItems.map((row) => (
                                    <button
                                      key={row.id}
                                      type="button"
                                      className="inv-item-option"
                                      onClick={() => applyItemToLine(line.key, row)}
                                    >
                                      <strong>{row.name}</strong>
                                      <span>{fmtNum(row.salePrice)}</span>
                                      <span>{fmtNum(row.purchasePrice)}</span>
                                      <span
                                        className={
                                          row.stockQty <= 0 ? "stock-low" : undefined
                                        }
                                      >
                                        {fmtNum(row.stockQty)}
                                      </span>
                                    </button>
                                  ))}
                                  {!filteredItems.length ? (
                                    <div className="inv-item-empty">No items found</div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="col-qty">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                          />
                        </td>
                        <td className="col-unit">
                          <select
                            value={line.unit}
                            onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="col-price">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.rate}
                            onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                          />
                        </td>
                        <td className="col-disc-pct">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.discountPercent}
                            onChange={(e) =>
                              updateLine(line.key, { discountPercent: e.target.value })
                            }
                          />
                        </td>
                        <td className="col-disc-amt">
                          <input readOnly value={fmtNum(calc.discountAmount)} />
                        </td>
                        <td className="col-tax-pct">
                          <select
                            value={line.taxPercent}
                            onChange={(e) =>
                              updateLine(line.key, { taxPercent: e.target.value })
                            }
                          >
                            <option value="0">Select</option>
                            {taxOptions.map((opt) => (
                              <option key={`${opt.value}-${opt.label}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="col-tax-amt">
                          <input readOnly value={fmtNum(calc.taxAmount)} />
                        </td>
                        <td className="col-amt">
                          <input readOnly value={fmtNum(calc.amount)} />
                        </td>
                        <td className="col-actions" />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="inv-total-row">
                    <td colSpan={2}>
                      <button
                        type="button"
                        className="inv-add-row"
                        onClick={() =>
                          updateActiveDoc((doc) => ({
                            ...doc,
                            lines: [...doc.lines, blankLine()],
                          }))
                        }
                      >
                        ADD ROW
                      </button>
                    </td>
                    <td className="col-qty">{fmtNum(totals.qtyTotal)}</td>
                    <td />
                    <td className="inv-total-label">TOTAL</td>
                    <td />
                    <td className="col-disc-amt">{fmtNum(totals.discountTotal)}</td>
                    <td />
                    <td className="col-tax-amt">{fmtNum(totals.taxTotal)}</td>
                    <td className="col-amt">{fmtNum(totals.amountTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="inv-extras">
              <div className="inv-extras-left">
                {!activeDoc.showTerms ? (
                  <button
                    type="button"
                    className="inv-extra-btn"
                    onClick={() => patchActiveDoc({ showTerms: true })}
                  >
                    <List size={15} /> ADD TERMS &amp; CONDITIONS
                  </button>
                ) : (
                  <label className="inv-extra-field">
                    Terms &amp; Conditions
                    <textarea
                      rows={3}
                      value={activeDoc.terms}
                      onChange={(e) => patchActiveDoc({ terms: e.target.value })}
                      placeholder="Enter terms and conditions"
                    />
                  </label>
                )}
              </div>
              <div className="inv-extras-right">
                {!activeDoc.showNotes ? (
                  <button
                    type="button"
                    className="inv-extra-btn"
                    onClick={() => patchActiveDoc({ showNotes: true })}
                  >
                    <FileText size={15} /> ADD DESCRIPTION
                  </button>
                ) : (
                  <label className="inv-extra-field">
                    Description
                    <textarea
                      rows={2}
                      value={activeDoc.notes}
                      onChange={(e) => patchActiveDoc({ notes: e.target.value })}
                      placeholder="Enter description"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="inv-footer">
            <div className="inv-footer-left">
              <label className="inv-roundoff">
                <input
                  type="checkbox"
                  checked={activeDoc.roundOff}
                  onChange={(e) => patchActiveDoc({ roundOff: e.target.checked })}
                />
                Round Off
              </label>
              <input
                className="inv-round-input"
                readOnly
                value={fmtNum(totals.roundDiff)}
              />
              <span className="inv-total-word">Total</span>
              <input
                className="inv-grand-total"
                readOnly
                value={fmtNum(totals.grandTotal)}
              />
            </div>
            <div className="inv-footer-right">
              <button type="button" className="btn inv-share">
                Share <ChevronDown size={14} />
              </button>
              <button className="btn btn-primary inv-save" type="submit">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>

      {addItemOpen ? (
        <Modal
          title="Add Item"
          className="inv-item-modal"
          onClose={() => {
            setAddItemOpen(false);
            setAddItemForKey(null);
            setNewItem(emptyItemForm());
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setAddItemOpen(false);
                  setAddItemForKey(null);
                  setNewItem(emptyItemForm());
                }}
              >
                Cancel
              </button>
              <button
                className="btn inv-party-save"
                type="submit"
                form="inv-add-item-form"
                disabled={!newItem.name.trim()}
              >
                Save
              </button>
            </>
          }
        >
          <form id="inv-add-item-form" className="inv-item-form" onSubmit={createItemInline}>
            <div className="inv-item-form-top">
              <button
                className="product-toggle"
                type="button"
                onClick={() => {
                  const nextType = newItem.itemType === "product" ? "service" : "product";
                  setNewItem((p) => ({ ...p, itemType: nextType }));
                  if (nextType === "service") setItemEditorTab("pricing");
                }}
                aria-label="Toggle product or service"
              >
                <strong className={newItem.itemType === "product" ? "on" : ""}>Product</strong>
                <span
                  className={`switch${newItem.itemType === "product" ? " on" : ""}`}
                  aria-hidden
                >
                  <span />
                </span>
                <strong className={newItem.itemType === "service" ? "on" : ""}>Service</strong>
              </button>
            </div>

            <div className="inv-item-form-identity">
              <label>
                Item Name *
                <input
                  value={newItem.name}
                  onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                  required
                  autoFocus
                />
              </label>
              <label>
                Unit
                <select
                  value={newItem.unit}
                  onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                >
                  {UNITS.filter((u) => u !== "NONE").map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="tabs item-editor-tabs" role="tablist">
              <button
                className={`tab${itemEditorTab === "pricing" ? " active" : ""}`}
                type="button"
                role="tab"
                onClick={() => setItemEditorTab("pricing")}
              >
                Pricing
              </button>
              {newItem.itemType === "product" ? (
                <button
                  className={`tab${itemEditorTab === "stock" ? " active" : ""}`}
                  type="button"
                  role="tab"
                  onClick={() => setItemEditorTab("stock")}
                >
                  Stock
                </button>
              ) : null}
            </div>

            {itemEditorTab === "pricing" ? (
              <div className="inv-item-form-pricing">
                <section className="editor-section">
                  <h3>Sale Price</h3>
                  <label>
                    Sale Price
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newItem.salePrice}
                      onChange={(e) => setNewItem((p) => ({ ...p, salePrice: e.target.value }))}
                    />
                  </label>
                </section>
                <section className="editor-section">
                  <h3>Purchase Price</h3>
                  <label>
                    Purchase Price
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newItem.purchasePrice}
                      onChange={(e) =>
                        setNewItem((p) => ({ ...p, purchasePrice: e.target.value }))
                      }
                    />
                  </label>
                </section>
                <section className="editor-section">
                  <h3>Taxes</h3>
                  <label>
                    Tax Rate
                    <select
                      value={newItem.taxPercent}
                      onChange={(e) => setNewItem((p) => ({ ...p, taxPercent: e.target.value }))}
                    >
                      <option value="0">None</option>
                      {taxOptions.map((opt) => (
                        <option key={`${opt.value}-${opt.label}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              </div>
            ) : (
              <section className="editor-section">
                <h3>Stock</h3>
                <label>
                  Opening Quantity
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newItem.stockQty}
                    onChange={(e) => setNewItem((p) => ({ ...p, stockQty: e.target.value }))}
                  />
                </label>
              </section>
            )}
          </form>
        </Modal>
      ) : null}

      {addPartyOpen ? (
        <Modal
          title="Add Party"
          className="inv-party-modal"
          onClose={() => {
            setAddPartyOpen(false);
            setNewParty({ name: "", phone: "", address: "" });
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setAddPartyOpen(false);
                  setNewParty({ name: "", phone: "", address: "" });
                }}
              >
                Cancel
              </button>
              <button className="btn inv-party-save" type="submit" form="inv-add-party-form">
                Save Party
              </button>
            </>
          }
        >
          <form id="inv-add-party-form" className="inv-party-form" onSubmit={createPartyInline}>
            <p className="inv-party-form-hint">
              Create a new {type === "sale" ? "customer" : "supplier"}. Address will show on the
              invoice after save.
            </p>
            <div className="inv-party-form-row">
              <label>
                Name<span className="req">*</span>
                <input
                  value={newParty.name}
                  onChange={(e) => setNewParty((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Party name"
                  required
                  autoFocus
                />
              </label>
              <label>
                Phone
                <input
                  value={newParty.phone}
                  onChange={(e) => setNewParty((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone number"
                />
              </label>
            </div>
            <label className="inv-party-form-address">
              Billing Address
              <textarea
                rows={3}
                value={newParty.address}
                onChange={(e) => setNewParty((p) => ({ ...p, address: e.target.value }))}
                placeholder="Street, area, city"
              />
            </label>
          </form>
        </Modal>
      ) : null}
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{listTitle}</h1>
          <p className="muted">
            {type === "sale" ? "Sale invoices" : "Purchase bills"} · line items &amp;{" "}
            {company?.country === "IN" ? "GST" : "VAT"}
          </p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> {addLabel}
          </button>
        </div>
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="toolbar-left">
            <span className="filter-chip">This month</span>
            <span className="filter-chip">All parties</span>
          </div>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice No.</th>
                  <th>Party</th>
                  <th>Tax Amt</th>
                  <th>Total Amt</th>
                </tr>
              </thead>
              <tbody>
                {(txns ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      <strong>{t.number}</strong>
                    </td>
                    <td>{(t.partyId && partyMap.get(t.partyId)) || "—"}</td>
                    <td className="money">{fmtNum(t.taxTotal)}</td>
                    <td className="money">{fmtNum(t.grandTotal)}</td>
                  </tr>
                ))}
                {!txns?.length ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">No {type} invoices yet.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function emptyItemForm() {
  return {
    name: "",
    unit: "pcs",
    salePrice: "",
    purchasePrice: "",
    stockQty: "0",
    taxPercent: "0",
    itemType: "product" as "product" | "service",
  };
}

function createDraft(partyId = "", paymentTypeId = ""): InvoiceDraft {
  return {
    id: uid("doc"),
    partyId,
    partyPhone: "",
    billingAddress: "",
    saleMode: "credit",
    paymentTypeId,
    date: todayISO(),
    dueDate: "",
    stateOfSupply: "",
    refNo: "1",
    refReady: false,
    priceTaxMode: "without",
    notes: "",
    terms: "",
    showTerms: false,
    showNotes: false,
    roundOff: true,
    lines: [blankLine(), blankLine()],
  };
}

function blankLine(): DraftLine {
  return {
    key: uid("draft"),
    itemId: "",
    name: "",
    qty: "",
    unit: "NONE",
    rate: "",
    discountPercent: "",
    taxPercent: "0",
  };
}

function fmtNum(n: number): string {
  if (!n) return "0";
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
}
