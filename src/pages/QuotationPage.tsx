import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  Funnel,
  History,
  List,
  Mail,
  MoreVertical,
  Plus,
  Printer,
  Share2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { ItemFormFields } from "../components/ItemFormFields";
import { Modal } from "../components/Modal";
import { PartyFormFields } from "../components/PartyFormFields";
import type { CommercialDoc, DocRevision, Item, Party, QuotationStatus } from "../db/types";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import {
  downloadBlob,
  downloadDocumentPdf,
  downloadExcelTable,
  downloadTablePdf,
  printDocument,
  type DocumentExportSpec,
} from "../lib/documentExport";
import { lineAmountExTax, money, todayISO } from "../lib/format";
import { emptyItemForm, itemPayloadFromForm } from "../lib/itemForm";
import { taxOptionsForCountry } from "../lib/companyLocale";
import { emptyPartyForm, partyPayloadFromForm } from "../lib/partyForm";
import { useAsync } from "../lib/useAsync";
import { TablePagination, usePagedRows } from "../components/TablePagination";

type DateFilter = "this_month" | "last_month" | "custom" | "all";
type SortKey = "date" | "number" | "party" | "status" | "amount" | "validUntil";
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

interface QuoteDraft {
  id: string;
  editingId: string | null;
  partyId: string;
  partyPhone: string;
  billingAddress: string;
  date: string;
  validUntil: string;
  followUpDate: string;
  stateOfSupply: string;
  refNo: string;
  priceTaxMode: PriceTaxMode;
  notes: string;
  terms: string;
  showTerms: boolean;
  showNotes: boolean;
  roundOff: boolean;
  lines: DraftLine[];
}

const UNITS = ["NONE", "pcs", "kg", "ltr", "box", "mtr", "BAG", "BTL", "BDL"] as const;

const STATUS_OPTIONS: QuotationStatus[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "converted",
];

const LOCKED: QuotationStatus[] = ["accepted", "converted"];

const SALE_LIST_ROUTES = [
  { label: "Sale Invoices", to: "/sales" },
  { label: "Estimate / Quotation", to: "/sales/quotations" },
  { label: "Sale Order", to: "/sales/orders" },
  { label: "Delivery Challan", to: "/sales/delivery" },
  { label: "Payment-In", to: "/payments" },
] as const;

function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function blankLine(): DraftLine {
  return {
    key: uid("line"),
    itemId: "",
    name: "",
    qty: "",
    unit: "NONE",
    rate: "",
    discountPercent: "",
    taxPercent: "0",
  };
}

function createDraft(defaults?: Partial<QuoteDraft>): QuoteDraft {
  return {
    id: uid("qt"),
    editingId: null,
    partyId: "",
    partyPhone: "",
    billingAddress: "",
    date: todayISO(),
    validUntil: "",
    followUpDate: "",
    stateOfSupply: "",
    refNo: "",
    priceTaxMode: "without",
    notes: "",
    terms: "",
    showTerms: false,
    showNotes: false,
    roundOff: true,
    lines: [blankLine(), blankLine()],
    ...defaults,
  };
}

function calcLine(
  qty: number,
  rate: number,
  discountPercent: number,
  taxPercent: number,
  includesTax: boolean,
) {
  const base = qty * rate;
  const discountAmount = (base * discountPercent) / 100;
  const afterDiscount = base - discountAmount;
  if (includesTax && taxPercent > 0) {
    const taxable = afterDiscount / (1 + taxPercent / 100);
    const tax = afterDiscount - taxable;
    return { discountAmount, taxable, tax, amount: afterDiscount };
  }
  const tax = (afterDiscount * taxPercent) / 100;
  // Amount is taxable value; tax is shown separately on the document.
  return { discountAmount, taxable: afterDiscount, tax, amount: afterDiscount };
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "accepted":
    case "converted":
      return "badge badge-ok";
    case "sent":
    case "viewed":
      return "badge badge-sale";
    case "declined":
    case "expired":
      return "badge badge-warn";
    default:
      return "badge badge-muted";
  }
}

function formatDisplayDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
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

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function QuotationPage() {
  const { company, companies, switchCompany } = useApp();
  const companyId = company?.id;
  const taxOptions = taxOptionsForCountry(company?.country);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currency = company?.currency ?? "INR";
  const fmtMoney = (n: number) => money(n, currency);

  const { data: docs, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { docs: rows } = await api.docs.list(companyId, "quotation");
    return rows;
  }, [companyId]);

  const { data: parties, reload: reloadParties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: rows } = await api.parties.list(companyId);
    return rows.filter((p) => p.type !== "supplier");
  }, [companyId]);

  const { data: items, reload: reloadItems } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const partyMap = useMemo(() => {
    const map = new Map<string, Party>();
    for (const p of parties ?? []) map.set(p.id, p);
    return map;
  }, [parties]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QuoteDraft>(() => createDraft());
  const [partyQuery, setPartyQuery] = useState("");
  const [partyMenuOpen, setPartyMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_month");
  const [customRange, setCustomRange] = useState(() => monthBounds(0));
  const [partyFilterId, setPartyFilterId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState<CommercialDoc | null>(null);
  const [revisions, setRevisions] = useState<DocRevision[] | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [newParty, setNewParty] = useState(emptyPartyForm());
  const [itemMenuKey, setItemMenuKey] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemForKey, setAddItemForKey] = useState<string | null>(null);
  const [itemEditorTab, setItemEditorTab] = useState<"pricing" | "stock">("pricing");
  const [newItem, setNewItem] = useState(emptyItemForm);

  const partyBoxRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleMenuRef = useRef<HTMLDivElement>(null);

  const monthRange = useMemo(() => {
    if (dateFilter === "this_month") return monthBounds(0);
    if (dateFilter === "last_month") return monthBounds(-1);
    if (dateFilter === "custom") return customRange;
    return { from: "0000-01-01", to: "9999-12-31" };
  }, [dateFilter, customRange]);

  const filteredDocs = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    let rows = [...(docs ?? [])];
    rows = rows.filter((d) => {
      if (dateFilter !== "all" && (d.date < monthRange.from || d.date > monthRange.to)) return false;
      if (partyFilterId && d.partyId !== partyFilterId) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      if (!q) return true;
      const partyName = (d.partyId && partyMap.get(d.partyId)?.name) || "";
      return (
        d.number.toLowerCase().includes(q) ||
        partyName.toLowerCase().includes(q) ||
        (d.notes ?? "").toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const partyA = (a.partyId && partyMap.get(a.partyId)?.name) || "";
      const partyB = (b.partyId && partyMap.get(b.partyId)?.name) || "";
      let cmp = 0;
      if (sort.key === "date") cmp = a.date.localeCompare(b.date);
      else if (sort.key === "number") cmp = a.number.localeCompare(b.number);
      else if (sort.key === "party") cmp = partyA.localeCompare(partyB);
      else if (sort.key === "status") cmp = String(a.status).localeCompare(String(b.status));
      else if (sort.key === "amount") cmp = a.grandTotal - b.grandTotal;
      else cmp = (a.validUntil || "").localeCompare(b.validUntil || "");
      return cmp * dir;
    });
    return rows;
  }, [docs, listSearch, dateFilter, monthRange, partyFilterId, statusFilter, sort, partyMap]);

  const listPage = usePagedRows(
    filteredDocs,
    `${listSearch}|${dateFilter}|${monthRange.from}|${monthRange.to}|${partyFilterId}|${statusFilter}|${sort.key}|${sort.direction}`,
  );

  const listSummary = useMemo(() => {
    const total = filteredDocs.reduce((s, d) => s + d.grandTotal, 0);
    const openAmt = filteredDocs
      .filter((d) => !["converted", "declined", "expired"].includes(String(d.status)))
      .reduce((s, d) => s + d.grandTotal, 0);
    const accepted = filteredDocs
      .filter((d) => d.status === "accepted" || d.status === "converted")
      .reduce((s, d) => s + d.grandTotal, 0);
    return { total, openAmt, accepted, count: filteredDocs.length };
  }, [filteredDocs]);

  const draftTotals = useMemo(() => {
    const includesTax = draft.priceTaxMode === "with";
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    for (const line of draft.lines) {
      if (!line.name.trim()) continue;
      const calc = calcLine(
        Number(line.qty) || 0,
        Number(line.rate) || 0,
        Number(line.discountPercent) || 0,
        Number(line.taxPercent) || 0,
        includesTax,
      );
      subtotal += calc.taxable;
      taxTotal += calc.tax;
      discountTotal += calc.discountAmount;
    }
    let grandTotal = subtotal + taxTotal;
    if (draft.roundOff) grandTotal = Math.round(grandTotal);
    return { subtotal, taxTotal, discountTotal, grandTotal };
  }, [draft]);

  const filteredParties = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties ?? [];
    return (parties ?? []).filter(
      (p) => p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q),
    );
  }, [parties, partyQuery]);

  const itemMenuLine = draft.lines.find((l) => l.key === itemMenuKey);
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

  const isLocked = Boolean(
    draft.editingId &&
      docs?.find((d) => d.id === draft.editingId) &&
      LOCKED.includes(
        String(docs.find((d) => d.id === draft.editingId)!.status) as QuotationStatus,
      ),
  );

  useEffect(() => {
    if (searchParams.get("create") === "1" && !open) {
      seedDraft();
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const id = searchParams.get("doc");
    if (!id) return;
    const next = new URLSearchParams(searchParams);
    next.delete("doc");
    setSearchParams(next, { replace: true });
    void api.docs
      .get(id)
      .then(({ doc }) => {
        if (doc.docType !== "quotation") return;
        setViewDoc(doc);
        setRevisions(null);
        setShareOpen(false);
      })
      .catch(() => {
        /* leave the quotation list open */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (partyBoxRef.current && !partyBoxRef.current.contains(t)) setPartyMenuOpen(false);
      if (itemMenuRef.current && !itemMenuRef.current.contains(t)) setItemMenuKey(null);
      const inMenu = actionMenuRef.current?.contains(t);
      const inBtn = actionMenuBtnRef.current?.contains(t);
      if (!inMenu && !inBtn) {
        setActionMenuId(null);
        setActionMenuPos(null);
      }
      if (titleMenuRef.current && !titleMenuRef.current.contains(t)) setTitleMenuOpen(false);
    }
    function onScrollOrResize() {
      if (!actionMenuId || !actionMenuBtnRef.current) return;
      const rect = actionMenuBtnRef.current.getBoundingClientRect();
      const openUp = window.innerHeight - rect.bottom < 260 && rect.top > 260;
      setActionMenuPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - 220),
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

  function seedDraft() {
    setDraft(
      createDraft({
        terms: company?.defaultTerms ?? "",
        showTerms: Boolean(company?.defaultTerms),
        stateOfSupply: company?.state ?? "",
      }),
    );
    setPartyQuery("");
    setError("");
  }

  function enterCreateMode() {
    const params = new URLSearchParams(searchParams);
    params.set("create", "1");
    setSearchParams(params, { replace: true });
  }

  function exitCreateMode() {
    setOpen(false);
    setError("");
    const params = new URLSearchParams(searchParams);
    params.delete("create");
    setSearchParams(params, { replace: true });
  }

  function openCreate() {
    seedDraft();
    setOpen(true);
    enterCreateMode();
  }

  function openEdit(doc: CommercialDoc) {
    if (LOCKED.includes(String(doc.status) as QuotationStatus)) {
      alert("Accepted or Converted quotations cannot be edited.");
      return;
    }
    const party = doc.partyId ? partyMap.get(doc.partyId) : undefined;
    setDraft(
      createDraft({
        editingId: doc.id,
        partyId: doc.partyId ?? "",
        partyPhone: party?.phone ?? "",
        billingAddress: doc.billingAddress ?? party?.address ?? "",
        date: doc.date,
        validUntil: doc.validUntil ?? "",
        followUpDate: doc.followUpDate ?? "",
        stateOfSupply: doc.stateOfSupply ?? "",
        refNo: doc.number,
        priceTaxMode: (doc.priceTaxMode as PriceTaxMode) || "without",
        notes: doc.notes ?? "",
        terms: doc.terms ?? "",
        showTerms: Boolean(doc.terms),
        showNotes: Boolean(doc.notes),
        roundOff: doc.roundOff !== false,
        lines: doc.lines.length
          ? doc.lines.map((l) => ({
              key: uid("line"),
              itemId: l.itemId ?? "",
              name: l.name,
              qty: String(l.qty),
              unit: l.unit || "pcs",
              rate: String(l.rate),
              discountPercent: String(l.discountPercent ?? 0),
              taxPercent: String(l.taxPercent),
            }))
          : [blankLine()],
      }),
    );
    setPartyQuery(party?.name ?? "");
    setError("");
    setViewDoc(null);
    setOpen(true);
    enterCreateMode();
  }

  function patchDraft(patch: Partial<QuoteDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));
  }

  function selectParty(p: Party) {
    patchDraft({
      partyId: p.id,
      partyPhone: p.phone ?? "",
      billingAddress: p.address ?? "",
    });
    setPartyQuery(p.name);
    setPartyMenuOpen(false);
  }

  function pickItem(lineKey: string, item: Item) {
    updateLine(lineKey, {
      itemId: item.id,
      name: item.name,
      rate: String(item.salePrice),
      taxPercent: String(item.taxPercent),
      unit: item.unit || "pcs",
      qty: "1",
    });
    setItemMenuKey(null);
  }

  function openAddItem(lineKey: string, seedName = "") {
    const typed = seedName.trim();
    const matchesExisting = (items ?? []).some(
      (i) => i.name.toLowerCase() === typed.toLowerCase(),
    );
    setNewItem(
      emptyItemForm({
        name: matchesExisting ? "" : typed,
        taxPercent: taxOptions[0]?.value ?? "5",
      }),
    );
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
      ...itemPayloadFromForm(newItem, "product"),
    });
    await reloadItems();
    pickItem(addItemForKey, item);
    setAddItemOpen(false);
    setAddItemForKey(null);
    setNewItem(emptyItemForm());
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId || isLocked) return;
    if (!draft.partyId) {
      setError("Select a customer");
      return;
    }
    const includesTax = draft.priceTaxMode === "with";
    const valid = draft.lines
      .filter((l) => l.name.trim() && Number(l.qty) > 0)
      .map((l) => {
        const qty = Number(l.qty) || 0;
        const rate = Number(l.rate) || 0;
        const discountPercent = Number(l.discountPercent) || 0;
        const taxPercent = Number(l.taxPercent) || 0;
        const calc = calcLine(qty, rate, discountPercent, taxPercent, includesTax);
        return {
          itemId: l.itemId || undefined,
          name: l.name.trim(),
          qty,
          rate,
          taxPercent,
          discountPercent,
          unit: l.unit === "NONE" ? undefined : l.unit,
          amount: calc.amount,
        };
      });
    if (!valid.length) {
      setError("Add at least one line item");
      return;
    }

    const body = {
      companyId,
      docType: "quotation" as const,
      date: draft.date,
      partyId: draft.partyId,
      notes: draft.showNotes ? draft.notes.trim() || undefined : undefined,
      terms: draft.showTerms ? draft.terms.trim() || undefined : undefined,
      number: draft.refNo.trim() || undefined,
      validUntil: draft.validUntil || undefined,
      followUpDate: draft.followUpDate || undefined,
      billingAddress: draft.billingAddress.trim() || undefined,
      stateOfSupply: draft.stateOfSupply.trim() || undefined,
      priceTaxMode: draft.priceTaxMode,
      roundOff: draft.roundOff,
      discountTotal: draftTotals.discountTotal,
      subtotal: draftTotals.subtotal,
      taxTotal: draftTotals.taxTotal,
      grandTotal: draftTotals.grandTotal,
      lines: valid,
    };

    setBusy(true);
    setError("");
    try {
      if (draft.editingId) {
        await api.docs.update(draft.editingId, body);
      } else {
        await api.docs.create(body);
      }
      exitCreateMode();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function openView(doc: CommercialDoc) {
    setViewDoc(doc);
    setRevisions(null);
    setShareOpen(false);
    try {
      const { doc: fresh } = await api.docs.get(doc.id);
      setViewDoc(fresh);
    } catch {
      /* keep list copy */
    }
  }

  async function loadRevisions(docId: string) {
    const { revisions: rows } = await api.docs.revisions(docId);
    setRevisions(rows);
  }

  async function cloneDoc(doc: CommercialDoc) {
    setActionMenuId(null);
    setBusy(true);
    try {
      const { doc: cloned } = await api.docs.clone(doc.id);
      reload();
      openEdit(cloned);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(doc: CommercialDoc, status: QuotationStatus) {
    setActionMenuId(null);
    if (LOCKED.includes(String(doc.status) as QuotationStatus) && status !== doc.status) {
      alert("Accepted or Converted quotations cannot change status this way.");
      return;
    }
    setBusy(true);
    try {
      await api.docs.setStatus(doc.id, status);
      reload();
      if (viewDoc?.id === doc.id) {
        const { doc: fresh } = await api.docs.get(doc.id);
        setViewDoc(fresh);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function revokeDoc(doc: CommercialDoc) {
    setActionMenuId(null);
    if (
      !confirm(
        `Revoke conversion of ${doc.number}? The linked sale order (and unused delivery, if any) will be deleted. This quotation returns to Draft so you can edit and convert again.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { doc: fresh } = await api.docs.revoke(doc.id);
      reload();
      setViewDoc(fresh);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function convertDoc(doc: CommercialDoc) {
    setActionMenuId(null);
    if (!confirm("Convert this quotation to a Sale Order?")) return;
    setBusy(true);
    try {
      await api.docs.convert(doc.id);
      reload();
      setViewDoc(null);
      navigate("/sales/orders");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoc(doc: CommercialDoc) {
    setActionMenuId(null);
    if (doc.status === "converted") {
      alert("Converted quotations cannot be deleted.");
      return;
    }
    if (!confirm(`Delete quotation ${doc.number}?`)) return;
    setBusy(true);
    try {
      await api.docs.remove(doc.id);
      if (viewDoc?.id === doc.id) setViewDoc(null);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function docExportSpec(doc: CommercialDoc): DocumentExportSpec {
    const party = (doc.partyId && partyMap.get(doc.partyId)) || null;
    const billTo = [party?.name || "—", doc.billingAddress, party?.phone].filter(Boolean).join("\n");
    const totals = [
      { label: "Subtotal", value: fmtMoney(doc.subtotal) },
      ...((doc.discountTotal ?? 0) > 0
        ? [{ label: "Discount", value: fmtMoney(doc.discountTotal ?? 0) }]
        : []),
      { label: "Tax", value: fmtMoney(doc.taxTotal) },
      { label: "Total", value: fmtMoney(doc.grandTotal), emphasize: true },
    ];
    return {
      filename: doc.number,
      companyName: company?.name || "",
      companyLines: [
        company?.address,
        company?.phone,
        company?.gstin ? `GSTIN/TRN: ${company.gstin}` : "",
      ].filter((v): v is string => Boolean(v && String(v).trim())),
      title: "ESTIMATE / QUOTATION",
      docNumber: doc.number,
      meta: [
        { label: "Bill To", value: billTo },
        {
          label: "Date",
          value: doc.validUntil
            ? `${formatDisplayDate(doc.date)}\nValid Until: ${formatDisplayDate(doc.validUntil)}`
            : formatDisplayDate(doc.date),
        },
        { label: "Status", value: `${doc.status}\nRevision R${doc.revision ?? 1}` },
      ],
      columns: [
        { header: "#", align: "center", width: 12 },
        { header: "Description" },
        { header: "Qty", align: "right", width: 16 },
        { header: "Rate", align: "right", width: 26 },
        { header: "Disc%", align: "right", width: 16 },
        { header: "Tax", align: "right", width: 16 },
        { header: "Amount", align: "right", width: 28 },
      ],
      rows: doc.lines.map((l, i) => [
        i + 1,
        l.name,
        l.qty,
        fmtMoney(l.rate),
        `${l.discountPercent ?? 0}%`,
        `${l.taxPercent}%`,
        fmtMoney(lineAmountExTax(l)),
      ]),
      totals,
      notes: doc.notes || undefined,
      terms: doc.terms || undefined,
      footerNote: "Authorized Signatory",
    };
  }

  function printDoc(doc: CommercialDoc) {
    printDocument(docExportSpec(doc));
  }

  function downloadDocPdf(doc: CommercialDoc) {
    downloadDocumentPdf(docExportSpec(doc));
  }

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
    const openUp = window.innerHeight - rect.bottom < 260 && rect.top > 260;
    actionMenuBtnRef.current = btn;
    setActionMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - 220),
      openUp,
    });
    setActionMenuId(docId);
  }

  function exportCsv(single?: CommercialDoc) {
    const rows = single ? [single] : filteredDocs;
    const header = [
      "Date",
      "Quotation No.",
      "Party",
      "Status",
      "Valid Until",
      "Follow-up",
      "Subtotal",
      "Tax",
      "Total",
      "Revision",
    ];
    const data = rows.map((d) => [
      d.date,
      d.number,
      (d.partyId && partyMap.get(d.partyId)?.name) || "",
      d.status,
      d.validUntil || "",
      d.followUpDate || "",
      d.subtotal.toFixed(2),
      d.taxTotal.toFixed(2),
      d.grandTotal.toFixed(2),
      d.revision ?? 1,
    ]);
    const csv = [header, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(`\uFEFF${csv}`, `quotations-${todayISO()}.csv`, "text/csv;charset=utf-8");
  }

  function exportExcel(single?: CommercialDoc) {
    if (single) {
      const party = (single.partyId && partyMap.get(single.partyId)?.name) || "";
      downloadExcelTable({
        filename: single.number,
        sheetTitle: `Quotation ${single.number}`,
        metaRows: [
          ["Company", company?.name || ""],
          ["Party", party],
          ["Date", single.date],
          ["Valid Until", single.validUntil || ""],
          ["Status", String(single.status)],
          ["Subtotal", single.subtotal.toFixed(2)],
          ["Tax", single.taxTotal.toFixed(2)],
          ["Total", single.grandTotal.toFixed(2)],
        ],
        columns: ["#", "Description", "Qty", "Rate", "Disc%", "Tax%", "Amount"],
        rows: single.lines.map((l, i) => [
          i + 1,
          l.name,
          l.qty,
          l.rate.toFixed(2),
          l.discountPercent ?? 0,
          l.taxPercent,
          lineAmountExTax(l).toFixed(2),
        ]),
      });
      return;
    }
    downloadExcelTable({
      filename: `quotations-${todayISO()}`,
      sheetTitle: "Quotations",
      columns: [
        "Date",
        "Quotation No.",
        "Party",
        "Status",
        "Valid Until",
        "Follow-up",
        "Subtotal",
        "Tax",
        "Total",
        "Revision",
      ],
      rows: filteredDocs.map((d) => [
        d.date,
        d.number,
        (d.partyId && partyMap.get(d.partyId)?.name) || "",
        String(d.status),
        d.validUntil || "",
        d.followUpDate || "",
        d.subtotal.toFixed(2),
        d.taxTotal.toFixed(2),
        d.grandTotal.toFixed(2),
        d.revision ?? 1,
      ]),
    });
  }

  function shareText(doc: CommercialDoc): string {
    const party = (doc.partyId && partyMap.get(doc.partyId)?.name) || "Customer";
    return `Quotation ${doc.number}\nParty: ${party}\nDate: ${formatDisplayDate(doc.date)}\nValid Until: ${formatDisplayDate(doc.validUntil || "")}\nAmount: ${fmtMoney(doc.grandTotal)}\nStatus: ${doc.status}`;
  }

  async function shareNative(doc: CommercialDoc) {
    const text = shareText(doc);
    try {
      if (navigator.share) {
        await navigator.share({ title: doc.number, text });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
      alert("Quotation details copied to clipboard");
    } catch {
      alert(text);
    }
  }

  function shareWhatsApp(doc: CommercialDoc) {
    const party = doc.partyId ? partyMap.get(doc.partyId) : undefined;
    const phone = (party?.phone || "").replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(shareText(doc))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function shareEmail(doc: CommercialDoc) {
    const party = doc.partyId ? partyMap.get(doc.partyId) : undefined;
    const subject = `Quotation ${doc.number} from ${company?.name || ""}`;
    const url = `mailto:${encodeURIComponent(party?.email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText(doc))}`;
    window.location.href = url;
  }

  async function saveParty(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newParty.name.trim()) return;
    const { party } = await api.parties.create({
      companyId,
      ...partyPayloadFromForm(newParty),
    });
    await reloadParties();
    selectParty(party);
    setAddPartyOpen(false);
    setNewParty(emptyPartyForm());
  }

  function changeSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "date" || key === "amount" ? "desc" : "asc" },
    );
  }

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return <Funnel size={11} />;
    return sort.direction === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  }

  const canConvert = (d: CommercialDoc) =>
    !["converted", "declined", "expired"].includes(String(d.status));

  return (
    <>
      {open ? null : (
      <>
      <header className="topbar">
        <div className="sale-list-title" ref={titleMenuRef}>
          <button
            type="button"
            className="sale-list-title-button"
            onClick={() => setTitleMenuOpen((v) => !v)}
            aria-expanded={titleMenuOpen}
          >
            <h1>Estimate / Quotation</h1>
            <ChevronDown size={16} aria-hidden />
          </button>
          {titleMenuOpen ? (
            <div className="sale-title-menu">
              {SALE_LIST_ROUTES.map((item) => (
                <button
                  type="button"
                  key={item.to}
                  className={item.to === "/sales/quotations" ? "active" : undefined}
                  onClick={() => {
                    setTitleMenuOpen(false);
                    navigate(item.to);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
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
              {formatDisplayDate(monthRange.from)}&nbsp;&nbsp; To &nbsp;&nbsp;
              {formatDisplayDate(monthRange.to)}
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
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
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

        <div className="sale-list-summary-row">
          <div className="sale-list-summary">
            <small>Total Quotation Amount</small>
            <strong>{fmtMoney(listSummary.total)}</strong>
            <div className="sale-list-summary-meta">
              <span>Open: {fmtMoney(listSummary.openAmt)}</span>
              <span className="sep">|</span>
              <span>Accepted+: {fmtMoney(listSummary.accepted)}</span>
              <span className="sep">|</span>
              <span>{listSummary.count} docs</span>
            </div>
          </div>
          <button className="btn btn-primary sale-list-add" type="button" onClick={openCreate}>
            <Plus size={16} /> Add Quotation
          </button>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Quotations</h2>
            <div className="report-tools">
              <label className="compact-search">
                <input
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search number / party / notes"
                />
              </label>
              <button className="btn btn-ghost" type="button" onClick={() => exportCsv()} title="Export CSV">
                <FileSpreadsheet size={15} /> CSV
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => exportExcel()} title="Export Excel">
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                title="Download PDF"
                onClick={() =>
                  downloadTablePdf({
                    filename: `quotations-${todayISO()}`,
                    companyName: company?.name || "",
                    title: "Quotations",
                    columns: [
                      { header: "Date", width: 22 },
                      { header: "No.", width: 28 },
                      { header: "Party" },
                      { header: "Status", width: 22 },
                      { header: "Total", align: "right", width: 28 },
                    ],
                    rows: filteredDocs.map((d) => [
                      formatDisplayDate(d.date),
                      d.number,
                      (d.partyId && partyMap.get(d.partyId)?.name) || "—",
                      String(d.status),
                      fmtMoney(d.grandTotal),
                    ]),
                  })
                }
              >
                <FileText size={15} /> PDF
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data sale-list-table">
              <thead>
                <tr>
                  {(
                    [
                      ["date", "Date"],
                      ["number", "No."],
                      ["party", "Party"],
                      ["status", "Status"],
                      ["validUntil", "Valid Until"],
                      ["amount", "Amount"],
                    ] as const
                  ).map(([key, label]) => (
                    <th key={key}>
                      <button type="button" className="sale-sort" onClick={() => changeSort(key)}>
                        {label} {sortIcon(key)}
                      </button>
                    </th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((d) => (
                  <tr key={d.id}>
                    <td>{formatDisplayDate(d.date)}</td>
                    <td>{d.number}</td>
                    <td>{(d.partyId && partyMap.get(d.partyId)?.name) || "—"}</td>
                    <td>
                      <span className={statusBadgeClass(String(d.status))}>{d.status}</span>
                    </td>
                    <td>{formatDisplayDate(d.validUntil || "")}</td>
                    <td className="money">{fmtMoney(d.grandTotal)}</td>
                    <td className="col-actions sale-list-actions">
                      <div className="sale-list-actions-inner">
                        <button
                          type="button"
                          className="icon-tool"
                          title="View details"
                          aria-label="View details"
                          onClick={() => void openView(d)}
                        >
                          <Eye size={15} />
                        </button>
                        <div className="sale-list-more">
                          <button
                            type="button"
                            className="icon-tool"
                            aria-label="More"
                            aria-expanded={actionMenuId === d.id}
                            onClick={(e) => openActionMenu(d.id, e.currentTarget)}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredDocs.length ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">No quotations yet. Click Add Quotation to create one.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={listPage} />
        </div>
      </div>
      </>
      )}

      {open ? (
        <div className="full-editor invoice-fullscreen">
          <div className="inv-doc-tabs">
            <div className="inv-doc-tabs-left">
              <button type="button" className="inv-doc-tab active">
                {draft.editingId ? "Edit Quotation" : "New Quotation"}
              </button>
            </div>
            <div className="inv-doc-tabs-right">
              <button type="button" aria-label="Close" onClick={exitCreateMode}>
                <X size={16} />
              </button>
            </div>
          </div>

          <form id="quotation-form" className="inv-sheet" onSubmit={save}>
            <div className="inv-sheet-scroll">
              <div className="inv-top">
                <div className="inv-top-left">
                  <div className="inv-sale-mode">
                    <h1>Estimate / Quotation</h1>
                  </div>

                  <div className="inv-party-row">
                    <div className="inv-party-field" ref={partyBoxRef}>
                      <span>
                        Customer<span className="req">*</span>
                      </span>
                      <div className="inv-party-search">
                        <input
                          value={partyQuery}
                          onChange={(e) => {
                            setPartyQuery(e.target.value);
                            setPartyMenuOpen(true);
                            if (draft.partyId) patchDraft({ partyId: "", partyPhone: "" });
                          }}
                          onFocus={() => setPartyMenuOpen(true)}
                          placeholder="Search by Name/Phone *"
                          required={!draft.partyId}
                          disabled={isLocked}
                        />
                        {draft.partyId ? (
                          <button
                            type="button"
                            className="inv-party-clear"
                            onClick={() => {
                              patchDraft({ partyId: "", partyPhone: "", billingAddress: "" });
                              setPartyQuery("");
                            }}
                            aria-label="Clear party"
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                        {partyMenuOpen ? (
                          <div className="inv-party-menu">
                            {filteredParties.map((p) => (
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
                              </button>
                            ))}
                            <button
                              type="button"
                              className="inv-party-add"
                              onClick={() => setAddPartyOpen(true)}
                            >
                              <Plus size={14} /> Add Party
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {!draft.partyId ? (
                        <button
                          type="button"
                          className="inv-add-party-link"
                          onClick={() => setAddPartyOpen(true)}
                        >
                          <Plus size={13} /> Add Party
                        </button>
                      ) : null}
                    </div>
                    <label className="inv-phone-field">
                      <span>Phone No.</span>
                      <input
                        value={draft.partyPhone}
                        onChange={(e) => patchDraft({ partyPhone: e.target.value })}
                        disabled={isLocked}
                      />
                    </label>
                  </div>

                  {draft.partyId || draft.billingAddress ? (
                    <label className="inv-address-field">
                      <span>Billing Address</span>
                      <textarea
                        rows={3}
                        value={draft.billingAddress}
                        onChange={(e) => patchDraft({ billingAddress: e.target.value })}
                        disabled={isLocked}
                      />
                    </label>
                  ) : null}

                  <label className="inv-dynamic-field">
                    <span>Valid Until</span>
                    <input
                      type="date"
                      value={draft.validUntil}
                      min={draft.date}
                      onChange={(e) => patchDraft({ validUntil: e.target.value })}
                      disabled={isLocked}
                    />
                  </label>
                </div>

                <div className="inv-top-right">
                  <label>
                    <span>Quotation Number</span>
                    <input
                      value={draft.refNo}
                      placeholder="Auto"
                      onChange={(e) => patchDraft({ refNo: e.target.value })}
                      disabled={isLocked}
                    />
                  </label>
                  <label>
                    <span>Quotation Date</span>
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => patchDraft({ date: e.target.value })}
                      disabled={isLocked}
                      required
                    />
                  </label>
                  <label>
                    <span>Follow-up</span>
                    <input
                      type="date"
                      value={draft.followUpDate}
                      onChange={(e) => patchDraft({ followUpDate: e.target.value })}
                      disabled={isLocked}
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
                      <th className="col-price">PRICE/UNIT</th>
                      <th>Disc%</th>
                      <th>Tax</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line, index) => {
                      const calc = calcLine(
                        Number(line.qty) || 0,
                        Number(line.rate) || 0,
                        Number(line.discountPercent) || 0,
                        Number(line.taxPercent) || 0,
                        draft.priceTaxMode === "with",
                      );
                      const menuOpen = itemMenuKey === line.key;
                      return (
                        <tr key={line.key} className="inv-line-row">
                          <td>
                            <div className="inv-row-tools">
                              <button
                                type="button"
                                className="inv-row-del"
                                disabled={isLocked || draft.lines.length <= 1}
                                onClick={() =>
                                  patchDraft({
                                    lines: draft.lines.filter((l) => l.key !== line.key),
                                  })
                                }
                              >
                                <Trash2 size={13} />
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
                                disabled={isLocked}
                                placeholder="Type / select item"
                                onFocus={() => {
                                  if (!isLocked) setItemMenuKey(line.key);
                                }}
                                onChange={(e) => {
                                  updateLine(line.key, {
                                    name: e.target.value,
                                    itemId: "",
                                  });
                                  setItemMenuKey(line.key);
                                }}
                              />
                              {menuOpen && !isLocked ? (
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
                                        onClick={() => pickItem(line.key, row)}
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
                          <td>
                            <input
                              value={line.qty}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              value={line.unit}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                            >
                              {UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={line.rate}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={line.discountPercent}
                              disabled={isLocked}
                              onChange={(e) =>
                                updateLine(line.key, { discountPercent: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <select
                              value={line.taxPercent}
                              disabled={isLocked}
                              onChange={(e) => updateLine(line.key, { taxPercent: e.target.value })}
                            >
                              {taxOptions.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="money">{fmtMoney(calc.amount)}</td>
                        </tr>
                      );
                    })}
                    <tr className="inv-total-row">
                      <td colSpan={2}>
                        <button
                          type="button"
                          className="inv-add-row"
                          disabled={isLocked}
                          onClick={() => patchDraft({ lines: [...draft.lines, blankLine()] })}
                        >
                          <Plus size={14} /> ADD ROW
                        </button>
                      </td>
                      <td colSpan={5} className="inv-total-label">
                        TOTAL
                      </td>
                      <td className="money">{fmtMoney(draftTotals.subtotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="inv-extras">
                <div className="inv-extras-left">
                  {!draft.showTerms ? (
                    <button
                      type="button"
                      className="inv-extra-btn"
                      disabled={isLocked}
                      onClick={() =>
                        patchDraft({
                          showTerms: true,
                          terms: draft.terms || company?.defaultTerms || "",
                        })
                      }
                    >
                      <List size={15} /> ADD TERMS &amp; CONDITIONS
                    </button>
                  ) : (
                    <label className="inv-extra-field">
                      Terms &amp; Conditions
                      <textarea
                        rows={3}
                        value={draft.terms}
                        disabled={isLocked}
                        onChange={(e) => patchDraft({ terms: e.target.value })}
                        placeholder="Enter terms and conditions"
                      />
                    </label>
                  )}
                </div>
                <div className="inv-extras-right">
                  {!draft.showNotes ? (
                    <button
                      type="button"
                      className="inv-extra-btn"
                      disabled={isLocked}
                      onClick={() => patchDraft({ showNotes: true })}
                    >
                      <FileText size={15} /> ADD DESCRIPTION
                    </button>
                  ) : (
                    <label className="inv-extra-field">
                      Description
                      <textarea
                        rows={2}
                        value={draft.notes}
                        disabled={isLocked}
                        onChange={(e) => patchDraft({ notes: e.target.value })}
                        placeholder="Enter description"
                      />
                    </label>
                  )}
                </div>
              </div>
              {error ? <p style={{ color: "#b91c1c", padding: "0 16px" }}>{error}</p> : null}
            </div>

            <div className="inv-footer">
              <div className="inv-footer-left">
                <label className="inv-roundoff">
                  <input
                    type="checkbox"
                    checked={draft.roundOff}
                    disabled={isLocked}
                    onChange={(e) => patchDraft({ roundOff: e.target.checked })}
                  />
                  Round Off
                </label>
                <span className="inv-total-word">Total</span>
                <input
                  className="inv-grand-total"
                  readOnly
                  value={fmtMoney(draftTotals.grandTotal)}
                />
              </div>
              <div className="inv-footer-right">
                <button className="btn btn-ghost" type="button" onClick={exitCreateMode}>
                  Cancel
                </button>
                <button className="btn btn-primary inv-save" type="submit" disabled={busy || isLocked}>
                  {busy ? "Saving…" : draft.editingId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {viewDoc ? (
        <Modal
          title={`Quotation ${viewDoc.number}`}
          className="sale-view-modal quote-view-modal"
          onClose={() => {
            setViewDoc(null);
            setRevisions(null);
            setShareOpen(false);
          }}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setShareOpen((v) => !v)}>
                <Share2 size={15} /> Share
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => exportExcel(viewDoc)}>
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => downloadDocPdf(viewDoc)}>
                <FileText size={15} /> PDF
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => printDoc(viewDoc)}>
                <Printer size={15} /> Print
              </button>
              {!LOCKED.includes(String(viewDoc.status) as QuotationStatus) ? (
                <button className="btn btn-ghost" type="button" onClick={() => openEdit(viewDoc)}>
                  Edit
                </button>
              ) : null}
              {canConvert(viewDoc) ? (
                <button className="btn btn-primary" type="button" onClick={() => void convertDoc(viewDoc)}>
                  <ArrowRightLeft size={15} /> Convert
                </button>
              ) : null}
              {viewDoc.status === "converted" ? (
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void revokeDoc(viewDoc)}>
                  <Undo2 size={15} /> Revert to Estimate
                </button>
              ) : null}
            </>
          }
        >
          {shareOpen ? (
            <div className="quote-share-bar">
              <button type="button" className="btn btn-ghost" onClick={() => shareWhatsApp(viewDoc)}>
                WhatsApp
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => shareEmail(viewDoc)}>
                <Mail size={14} /> Email
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void shareNative(viewDoc)}>
                More…
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => exportCsv(viewDoc)}>
                CSV
              </button>
            </div>
          ) : null}

          <div className="sale-view-meta">
            <span>
              <small>Date</small>
              <strong>{formatDisplayDate(viewDoc.date)}</strong>
            </span>
            <span>
              <small>Party</small>
              <strong>{(viewDoc.partyId && partyMap.get(viewDoc.partyId)?.name) || "—"}</strong>
            </span>
            <span>
              <small>Status</small>
              <strong>
                <span className={statusBadgeClass(String(viewDoc.status))}>{viewDoc.status}</span>
              </strong>
            </span>
            <span>
              <small>Valid Until</small>
              <strong>{formatDisplayDate(viewDoc.validUntil || "")}</strong>
            </span>
            <span>
              <small>Follow-up</small>
              <strong>{formatDisplayDate(viewDoc.followUpDate || "")}</strong>
            </span>
            <span>
              <small>Revision</small>
              <strong>R{viewDoc.revision ?? 1}</strong>
            </span>
          </div>

          {viewDoc.billingAddress ? (
            <p className="sale-view-notes">
              <strong>Billing Address:</strong> {viewDoc.billingAddress}
            </p>
          ) : null}

          <div className="table-wrap">
            <table className="data sale-view-lines">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Disc%</th>
                  <th>Tax</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {viewDoc.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.name}
                      {line.unit ? <small className="muted"> · {line.unit}</small> : null}
                    </td>
                    <td>{line.qty}</td>
                    <td className="money">{fmtMoney(line.rate)}</td>
                    <td>{line.discountPercent ?? 0}%</td>
                    <td>{line.taxPercent}%</td>
                    <td className="money">{fmtMoney(lineAmountExTax(line))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sale-view-totals">
            <span>
              Subtotal <strong>{fmtMoney(viewDoc.subtotal)}</strong>
            </span>
            {(viewDoc.discountTotal ?? 0) > 0 ? (
              <span>
                Discount <strong>{fmtMoney(viewDoc.discountTotal ?? 0)}</strong>
              </span>
            ) : null}
            <span>
              Tax <strong>{fmtMoney(viewDoc.taxTotal)}</strong>
            </span>
            <span className="grand">
              Total <strong>{fmtMoney(viewDoc.grandTotal)}</strong>
            </span>
          </div>

          {viewDoc.notes ? <p className="sale-view-notes">{viewDoc.notes}</p> : null}
          {viewDoc.terms ? (
            <div className="quote-terms-block">
              <strong>Terms & Conditions</strong>
              <p>{viewDoc.terms}</p>
            </div>
          ) : null}
          {viewDoc.convertedToId ? (
            <p className="sale-view-notes">
              Converted to {viewDoc.convertedToType} ({viewDoc.convertedToId}). Use{" "}
              <strong>Revert to Estimate</strong> to bring this quotation back to the normal flow
              (blocked after a sale invoice is created).
            </p>
          ) : null}

          <div className="quote-revision-section">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void loadRevisions(viewDoc.id)}
            >
              <History size={14} />{" "}
              {revisions ? "Refresh revision history" : "Show revision history"}
            </button>
            {revisions ? (
              <div className="quote-revision-list">
                {revisions.map((r) => (
                  <div key={r.id} className="quote-revision-item">
                    <strong>R{r.revision}</strong>
                    <span>{r.changeNote || "Update"}</span>
                    <small>{formatDisplayDate(r.createdAt.slice(0, 10))} · {r.createdAt.slice(11, 19)} UTC</small>
                    {r.snapshot ? (
                      <em>
                        {fmtMoney(r.snapshot.grandTotal)} · {r.snapshot.status} ·{" "}
                        {r.snapshot.lines?.length ?? 0} lines
                      </em>
                    ) : null}
                  </div>
                ))}
                {!revisions.length ? <div className="empty">No revisions recorded yet.</div> : null}
              </div>
            ) : null}
          </div>

          {!LOCKED.includes(String(viewDoc.status) as QuotationStatus) ? (
            <div className="quote-status-actions">
              <span className="muted">Set status:</span>
              {(["sent", "viewed", "accepted", "declined"] as QuotationStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || viewDoc.status === s}
                  onClick={() => void changeStatus(viewDoc, s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {actionMenuId && actionMenuPos
        ? createPortal(
            (() => {
              const menuDoc = filteredDocs.find((row) => row.id === actionMenuId);
              if (!menuDoc) return null;
              const locked = LOCKED.includes(String(menuDoc.status) as QuotationStatus);
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
                      void openView(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      openEdit(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void cloneDoc(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <Copy size={13} /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadDocPdf(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <FileText size={13} /> Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportExcel(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <FileSpreadsheet size={13} /> Download Excel
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
                  <button
                    type="button"
                    onClick={() => {
                      void shareNative(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <Share2 size={13} /> Share
                  </button>
                  {canConvert(menuDoc) ? (
                    <button
                      type="button"
                      onClick={() => {
                        void convertDoc(menuDoc);
                        closeActionMenu();
                      }}
                    >
                      <ArrowRightLeft size={13} /> Convert to Sale Order
                    </button>
                  ) : null}
                  {menuDoc.status === "converted" ? (
                    <button
                      type="button"
                      onClick={() => {
                        void revokeDoc(menuDoc);
                        closeActionMenu();
                      }}
                    >
                      <Undo2 size={13} /> Revert to Estimate
                    </button>
                  ) : null}
                  {!locked ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void changeStatus(menuDoc, "sent");
                          closeActionMenu();
                        }}
                      >
                        Mark Sent
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void changeStatus(menuDoc, "accepted");
                          closeActionMenu();
                        }}
                      >
                        Mark Accepted
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void changeStatus(menuDoc, "declined");
                          closeActionMenu();
                        }}
                      >
                        Mark Declined
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="danger"
                    disabled={menuDoc.status === "converted"}
                    onClick={() => {
                      void deleteDoc(menuDoc);
                      closeActionMenu();
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              );
            })(),
            document.body,
          )
        : null}

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
                form="qt-add-item-form"
                disabled={!newItem.name.trim()}
              >
                Save
              </button>
            </>
          }
        >
          <ItemFormFields
            formId="qt-add-item-form"
            form={newItem}
            onChange={setNewItem}
            editorTab={itemEditorTab}
            onEditorTabChange={setItemEditorTab}
            compact
            onSubmit={(e) => void createItemInline(e)}
          />
        </Modal>
      ) : null}

      {addPartyOpen ? (
        <Modal
          title="Add Party"
          className="modal-party"
          onClose={() => setAddPartyOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setAddPartyOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="qt-add-party">
                Save
              </button>
            </>
          }
        >
          <form id="qt-add-party" onSubmit={(e) => void saveParty(e)}>
            <PartyFormFields form={newParty} onChange={setNewParty} />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function fmtNum(n: number): string {
  if (!n) return "0";
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
}
