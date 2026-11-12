import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Eye,
  FileSpreadsheet,
  FileText,
  Funnel,
  GripVertical,
  List,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { ItemFormFields } from "../components/ItemFormFields";
import { Modal } from "../components/Modal";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import { PartyFormFields } from "../components/PartyFormFields";
import type { Item, LineItem, Party, Transaction, TxnType } from "../db/types";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import {
  downloadDocumentPdf,
  downloadExcelTable,
  downloadTablePdf,
  previewDocument,
  printDocument,
  printTable,
  type DocumentExportSpec,
} from "../lib/documentExport";
import { lineAmountExTax, lineTaxAmount, money, todayISO } from "../lib/format";
import { emptyItemForm, itemPayloadFromForm } from "../lib/itemForm";
import { taxOptionsForCompany } from "../lib/companyLocale";
import { emptyPartyForm, partyPayloadFromForm } from "../lib/partyForm";
import { useAsync } from "../lib/useAsync";

function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

type SaleMode = "credit" | "cash";
type PriceTaxMode = "without" | "with";
type DateFilter = "this_month" | "last_month" | "custom" | "all";
type SortKey = "date" | "number" | "party" | "transaction" | "payment" | "amount" | "balance";

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

const SALE_LIST_ROUTES = [
  { label: "Sale Invoices", to: "/sales" },
  { label: "Estimate / Quotation", to: "/sales/quotations" },
  { label: "Sale Order", to: "/sales/orders" },
  { label: "Delivery Challan", to: "/sales/delivery" },
  { label: "Payment-In", to: "/payments" },
] as const;

export function InvoicePage({ type }: { type: "sale" | "purchase" }) {
  const { company, companies, switchCompany } = useApp();
  const companyId = company?.id;
  const taxOptions = taxOptionsForCompany(company);
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
  const [editingTxn, setEditingTxn] = useState<{ id: string; number: string } | null>(null);
  const [docs, setDocs] = useState<InvoiceDraft[]>(() =>
    searchParams.get("create") === "1" ? [createDraft()] : [],
  );
  const [activeDocId, setActiveDocId] = useState(() => docs[0]?.id ?? "");
  const [partyQuery, setPartyQuery] = useState("");
  const [partyMenuOpen, setPartyMenuOpen] = useState(false);
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [itemMenuKey, setItemMenuKey] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemForKey, setAddItemForKey] = useState<string | null>(null);
  const [itemEditorTab, setItemEditorTab] = useState<"pricing" | "stock">("pricing");
  const [newParty, setNewParty] = useState(emptyPartyForm());
  const [newItem, setNewItem] = useState(emptyItemForm);
  const [listSearch, setListSearch] = useState("");
  const [listSearchOpen, setListSearchOpen] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_month");
  const [customRange, setCustomRange] = useState(() => monthBounds(0));
  const [partyFilterId, setPartyFilterId] = useState("");
  const [payStatusFilter, setPayStatusFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [chartOpen, setChartOpen] = useState(false);
  const [viewTxn, setViewTxn] = useState<(Transaction & { lineItems?: LineItem[] }) | null>(null);
  const [invoiceLinks, setInvoiceLinks] = useState<{
    orderId: string;
    orderNumber: string;
    delivery?: { id: string; number: string };
    estimate?: { id: string; number: string };
  } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [actionMenuPos, setActionMenuPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const partyBoxRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleMenuRef = useRef<HTMLDivElement>(null);
  const currency = company?.currency ?? "INR";
  const fmtMoney = (n: number) => money(n, currency);

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

  const paymentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payments ?? []) map.set(p.id, p.name);
    return map;
  }, [payments]);

  const monthRange = useMemo(
    () => (dateFilter === "custom" ? customRange : monthBounds(dateFilter === "last_month" ? -1 : 0)),
    [dateFilter, customRange],
  );

  const filteredTxns = useMemo(() => {
    const rows = txns ?? [];
    const q = listSearch.trim().toLowerCase();
    const filtered = rows.filter((t) => {
      if (dateFilter !== "all") {
        if (t.date < monthRange.from || t.date > monthRange.to) return false;
      }
      if (partyFilterId && t.partyId !== partyFilterId) return false;
      const paid = Boolean(t.paymentTypeId) || isCashSale(t);
      if (payStatusFilter === "paid" && !paid) return false;
      if (payStatusFilter === "unpaid" && paid) return false;
      if (paymentTypeFilter && t.paymentTypeId !== paymentTypeFilter) return false;
      if (!q) return true;
      const party = (t.partyId && partyMap.get(t.partyId)) || "";
      return (
        t.number.toLowerCase().includes(q) ||
        party.toLowerCase().includes(q) ||
        t.date.includes(q)
      );
    });
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const values: Record<SortKey, [string | number, string | number]> = {
        date: [a.date, b.date],
        number: [a.number, b.number],
        party: [partyMap.get(a.partyId ?? "") ?? "", partyMap.get(b.partyId ?? "") ?? ""],
        transaction: [a.type, b.type],
        payment: [paymentMap.get(a.paymentTypeId ?? "") ?? "", paymentMap.get(b.paymentTypeId ?? "") ?? ""],
        amount: [a.grandTotal, b.grandTotal],
        balance: [txnBalance(a), txnBalance(b)],
      };
      const [left, right] = values[sort.key];
      if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * direction;
    });
  }, [
    txns,
    listSearch,
    dateFilter,
    monthRange,
    partyFilterId,
    payStatusFilter,
    paymentTypeFilter,
    partyMap,
    paymentMap,
    sort,
  ]);

  const listPage = usePagedRows(
    filteredTxns,
    `${type}|${listSearch}|${dateFilter}|${monthRange.from}|${monthRange.to}|${partyFilterId}|${payStatusFilter}|${paymentTypeFilter}|${sort.key}|${sort.direction}`,
  );

  const listSummary = useMemo(() => {
    let total = 0;
    let received = 0;
    for (const t of filteredTxns) {
      total += t.grandTotal;
      if (t.paymentTypeId || isCashSale(t)) received += t.grandTotal;
    }
    return { total, received, balance: total - received };
  }, [filteredTxns]);

  const trend = useMemo(() => {
    const current = monthBounds(0);
    const previous = monthBounds(-1);
    let currentTotal = 0;
    let previousTotal = 0;
    for (const txn of txns ?? []) {
      if (txn.date >= current.from && txn.date <= current.to) currentTotal += txn.grandTotal;
      if (txn.date >= previous.from && txn.date <= previous.to) previousTotal += txn.grandTotal;
    }
    if (!previousTotal) return currentTotal ? 100 : 0;
    return ((currentTotal - previousTotal) / previousTotal) * 100;
  }, [txns]);

  const chartRows = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const txn of filteredTxns) {
      grouped.set(txn.date, (grouped.get(txn.date) ?? 0) + txn.grandTotal);
    }
    const rows = [...grouped].sort(([a], [b]) => a.localeCompare(b)).slice(-14);
    const max = Math.max(1, ...rows.map(([, total]) => total));
    return rows.map(([date, total]) => ({ date, total, percent: (total / max) * 100 }));
  }, [filteredTxns]);

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

  const itemById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const row of items ?? []) map.set(row.id, row);
    return map;
  }, [items]);

  const viewTxnId = searchParams.get("txn");

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
    if (!viewTxnId) {
      setViewTxn(null);
      setViewLoading(false);
      return;
    }
    let cancelled = false;
    const fromList = (txns ?? []).find((row) => row.id === viewTxnId);
    if (fromList) setViewTxn(fromList as Transaction & { lineItems?: LineItem[] });
    setViewLoading(true);
    void api.transactions
      .get(viewTxnId)
      .then(({ transaction }) => {
        if (!cancelled) setViewTxn(transaction);
      })
      .catch(() => {
        /* keep list copy */
      })
      .finally(() => {
        if (!cancelled) setViewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTxnId]);

  useEffect(() => {
    const orderId = viewTxn?.saleOrderId;
    if (!viewTxnId || type !== "sale" || !viewTxn || viewTxn.id !== viewTxnId || !orderId) {
      setInvoiceLinks(null);
      return;
    }
    let cancelled = false;
    setInvoiceLinks({
      orderId,
      orderNumber: viewTxn.saleOrderNumber || "Sale order",
    });
    void api.docs
      .get(orderId)
      .then(async ({ doc }) => {
        if (cancelled || doc.docType !== "sale_order") return;
        const links: {
          orderId: string;
          orderNumber: string;
          delivery?: { id: string; number: string };
          estimate?: { id: string; number: string };
        } = { orderId: doc.id, orderNumber: doc.number };
        if (doc.convertedFromType === "quotation" && doc.convertedFromId && doc.convertedFromNumber) {
          links.estimate = { id: doc.convertedFromId, number: doc.convertedFromNumber };
        }
        if (doc.convertedToType === "delivery" && doc.convertedToId) {
          try {
            const { doc: delivery } = await api.docs.get(doc.convertedToId);
            if (!cancelled) links.delivery = { id: delivery.id, number: delivery.number };
          } catch {
            /* delivery link is optional */
          }
        }
        if (!cancelled) setInvoiceLinks(links);
      })
      .catch(() => {
        /* keep the sale-order tab from the invoice */
      });
    return () => {
      cancelled = true;
    };
  }, [viewTxnId, type, viewTxn?.saleOrderId, viewTxn?.saleOrderNumber]);

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
      const target = e.target as Node;
      if (!partyBoxRef.current?.contains(target)) setPartyMenuOpen(false);
      if (!itemMenuRef.current?.contains(target)) setItemMenuKey(null);
      const inMenu = actionMenuRef.current?.contains(target);
      const inBtn = actionMenuBtnRef.current?.contains(target);
      if (!inMenu && !inBtn) {
        setActionMenuId(null);
        setActionMenuPos(null);
      }
      if (!titleMenuRef.current?.contains(target)) setTitleMenuOpen(false);
    }
    function onScrollOrResize() {
      if (!actionMenuId || !actionMenuBtnRef.current) return;
      const rect = actionMenuBtnRef.current.getBoundingClientRect();
      const openUp = window.innerHeight - rect.bottom < 200 && rect.top > 200;
      setActionMenuPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - 148),
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
          // Amount is taxable value; tax is shown separately (matches Subtotal on print).
          amount: afterDiscount,
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
    // Without-tax: amount is exclusive → grand = amount + tax.
    // With-tax: amount is already gross (rate includes tax) → grand = amount.
    const preRound = priceIncludesTax ? amountTotal : amountTotal + taxTotal;
    const rounded = roundOff ? Math.round(preRound) : preRound;
    const roundDiff = rounded - preRound;
    return {
      qtyTotal,
      discountTotal,
      taxTotal,
      amountTotal,
      grandTotal: rounded,
      roundDiff,
    };
  }, [lineCalcs, activeDoc?.roundOff, priceIncludesTax]);

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
    setEditingTxn(null);
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
    setNewParty(
      emptyPartyForm({
        name: matchesExisting ? "" : typed,
        type: type === "sale" ? "not_specified" : "supplier",
        country: company?.country ?? "",
      }),
    );
    setPartyMenuOpen(false);
    setAddPartyOpen(true);
  }

  async function createPartyInline(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newParty.name.trim()) return;
    const { party } = await api.parties.create({
      companyId,
      ...partyPayloadFromForm({
        ...newParty,
        type: newParty.type || (type === "sale" ? "not_specified" : "supplier"),
      }),
    });
    await reloadParties();
    selectParty(party);
    setAddPartyOpen(false);
    setNewParty(emptyPartyForm());
  }

  function exitCreateMode() {
    setEditingTxn(null);
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

    const number = editingTxn
      ? editingTxn.number
      : await (async () => {
          const { transactions } = await api.transactions.list(companyId, type);
          const count = transactions.length + 1;
          return type === "sale" ? `INV-${1000 + count}` : `PUR-${500 + count}`;
        })();

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
      let amount = taxable;
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

    const payload = {
      date: activeDoc.date,
      partyId: activeDoc.partyId,
      paymentTypeId:
        activeDoc.saleMode === "cash" ? activeDoc.paymentTypeId || undefined : undefined,
      notes: noteParts.length ? noteParts.join(" · ") : undefined,
      subtotal,
      taxTotal,
      grandTotal: grand,
      lines: lineRows,
    };
    if (editingTxn) {
      await api.transactions.update(editingTxn.id, payload);
      setEditingTxn(null);
    } else {
      await api.transactions.create({
        companyId,
        type: type as TxnType,
        number,
        ...payload,
      });
    }

    reloadTxns();
    reloadItems();
    // Close only the saved tab; keep other drafts open.
    closeDocTab(activeDoc.id);
  }

  if (viewTxnId) {
    const party = viewTxn?.partyId ? partyById.get(viewTxn.partyId) : undefined;
    const bal = viewTxn ? txnBalance(viewTxn) : 0;
    const paid = viewTxn ? Math.max(0, viewTxn.grandTotal - bal) : 0;
    const isPaid = viewTxn ? bal <= 0 : false;
    const lines = viewTxn ? getTxnLines(viewTxn) : [];
    const cash = viewTxn ? isCashSale(viewTxn) : false;
    const docLabel = type === "sale" ? "Sale Invoice" : "Purchase Bill";
    return (
      <div className="full-editor invoice-fullscreen">
        <div className="inv-doc-tabs">
          <div className="inv-doc-tabs-left">
            <div className="inv-doc-tab active" role="tab" aria-selected>
              <span>
                {docLabel} #{viewTxn ? displayInvoiceNo(viewTxn.number) : "…"}
              </span>
              <button
                type="button"
                className="inv-tab-close"
                onClick={closeViewTxn}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            {invoiceLinks?.estimate ? (
              <button
                type="button"
                className="inv-doc-tab"
                title={`Estimate / Quotation ${invoiceLinks.estimate.number}`}
                onClick={() =>
                  navigate(`/sales/quotations?doc=${encodeURIComponent(invoiceLinks.estimate!.id)}`)
                }
              >
                <span>Estimate / Quotation {invoiceLinks.estimate.number}</span>
              </button>
            ) : null}
            {invoiceLinks ? (
              <button
                type="button"
                className="inv-doc-tab"
                title={`Sale Order ${invoiceLinks.orderNumber}`}
                onClick={() =>
                  navigate(`/sales/orders?doc=${encodeURIComponent(invoiceLinks.orderId)}`)
                }
              >
                <span>Sale Order {invoiceLinks.orderNumber}</span>
              </button>
            ) : null}
            {invoiceLinks?.delivery ? (
              <button
                type="button"
                className="inv-doc-tab"
                title={`Delivery ${invoiceLinks.delivery.number}`}
                onClick={() =>
                  navigate(`/sales/delivery?doc=${encodeURIComponent(invoiceLinks.delivery!.id)}`)
                }
              >
                <span>Delivery {invoiceLinks.delivery.number}</span>
              </button>
            ) : null}
          </div>
          <div className="inv-doc-tabs-right">
            <button type="button" aria-label="Close details" onClick={closeViewTxn}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="inv-sheet invoice-detail-sheet">
          <div className="inv-sheet-scroll">
            {viewLoading && !viewTxn ? (
              <div className="sale-view-loading">Loading full details…</div>
            ) : !viewTxn ? (
              <div className="empty">Invoice not found.</div>
            ) : (
              <>
                <div className="inv-top">
                  <div className="inv-top-left">
                    <div className="inv-sale-mode">
                      <h1>{type === "sale" ? "Sale" : "Purchase"}</h1>
                      <span className={`sale-view-status${isPaid ? " paid" : " unpaid"}`}>
                        {isPaid ? "Paid" : "Unpaid"}
                      </span>
                      <span className="sale-view-status">{cash ? "Cash" : "Credit"}</span>
                    </div>
                    <div className="sale-view-party">
                      <small>{type === "sale" ? "Bill To / Customer" : "Supplier"}</small>
                      <strong>
                        {party?.name || (viewTxn.partyId && partyMap.get(viewTxn.partyId)) || "—"}
                      </strong>
                      {party?.phone ? <p>Phone: {party.phone}</p> : null}
                      {party?.email ? <p>Email: {party.email}</p> : null}
                      {party?.gstin ? <p>GSTIN: {party.gstin}</p> : null}
                      {party?.address ? <p>{party.address}</p> : null}
                    </div>
                  </div>
                  <div className="inv-top-right invoice-detail-meta">
                    <label>
                      <span>Invoice Number</span>
                      <strong>{viewTxn.number}</strong>
                    </label>
                    <label>
                      <span>Invoice Date</span>
                      <strong>{formatDisplayDate(viewTxn.date)}</strong>
                    </label>
                    <label>
                      <span>Created</span>
                      <strong>
                        {viewTxn.createdAt
                          ? `${formatDisplayDate(viewTxn.createdAt.slice(0, 10))} ${viewTxn.createdAt.slice(11, 19)}`
                          : "—"}
                      </strong>
                    </label>
                    <label>
                      <span>Payment Type</span>
                      <strong>{paymentLabel(viewTxn)}</strong>
                    </label>
                    <label>
                      <span>Transaction</span>
                      <strong>{type === "sale" ? "Sale" : "Purchase"}</strong>
                    </label>
                    {type === "sale" && viewTxn.saleOrderId ? (
                      <label>
                        <span>Sale Order</span>
                        <button
                          type="button"
                          className="sale-order-link"
                          onClick={() => openSaleOrder(viewTxn)}
                        >
                          {viewTxn.saleOrderNumber || "View sale order"}
                        </button>
                      </label>
                    ) : null}
                  </div>
                </div>

                {viewLoading ? <div className="sale-view-loading">Refreshing line items…</div> : null}

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
                        <th className="col-tax">TAX AMT</th>
                        <th className="col-amt">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const catalog = line.itemId ? itemById.get(line.itemId) : undefined;
                        const taxAmt = lineTaxAmount(line);
                        const amountEx = lineAmountExTax(line);
                        return (
                          <tr key={line.id}>
                            <td className="col-num">{index + 1}</td>
                            <td className="col-item">
                              <strong>{line.name}</strong>
                              {catalog?.sku ? <small className="muted"> · {catalog.sku}</small> : null}
                            </td>
                            <td className="col-qty">{fmtNum(line.qty)}</td>
                            <td className="col-unit">{catalog?.unit || "—"}</td>
                            <td className="col-price money">{fmtMoney(line.rate)}</td>
                            <td>{line.taxPercent}%</td>
                            <td className="money">{fmtMoney(taxAmt)}</td>
                            <td className="col-amt money">{fmtMoney(amountEx)}</td>
                          </tr>
                        );
                      })}
                      {!lines.length && !viewLoading ? (
                        <tr>
                          <td colSpan={8}>No line items</td>
                        </tr>
                      ) : null}
                    </tbody>
                    <tfoot>
                      <tr className="inv-total-row">
                        <td colSpan={2}>TOTAL</td>
                        <td className="col-qty">
                          {fmtNum(lines.reduce((sum, line) => sum + line.qty, 0))}
                        </td>
                        <td colSpan={3} />
                        <td className="money">{fmtMoney(viewTxn.taxTotal)}</td>
                        <td className="col-amt money">{fmtMoney(viewTxn.grandTotal)}</td>
                      </tr>
                    </tfoot>
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
                    {viewTxn.notes ? (
                      <p className="sale-view-notes">
                        <strong>Notes / Description:</strong> {viewTxn.notes}
                      </p>
                    ) : (
                      <p className="muted">No notes or description.</p>
                    )}
                  </div>
                  <div className="sale-view-totals">
                    <span>
                      Subtotal <strong>{fmtMoney(viewTxn.subtotal)}</strong>
                    </span>
                    <span>
                      Tax <strong>{fmtMoney(viewTxn.taxTotal)}</strong>
                    </span>
                    <span className="grand">
                      Total <strong>{fmtMoney(viewTxn.grandTotal)}</strong>
                    </span>
                    <span>
                      {type === "sale" ? "Received" : "Paid"} <strong>{fmtMoney(paid)}</strong>
                    </span>
                    <span>
                      Balance Due <strong>{fmtMoney(bal)}</strong>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="inv-footer">
            <div className="inv-footer-left">
              <span className="inv-total-word">Total</span>
              <input
                className="inv-grand-total"
                readOnly
                value={viewTxn ? fmtNum(viewTxn.grandTotal) : "0"}
              />
            </div>
            <div className="inv-footer-right">
              {viewTxn ? (
                <>
                  <button className="btn btn-ghost" type="button" onClick={() => void previewTxn(viewTxn)}>
                    <Eye size={15} /> Preview
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void downloadTxnPdf(viewTxn)}>
                    <FileText size={15} /> Download
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void editTxn(viewTxn)}>
                    <Pencil size={15} /> Edit
                  </button>
                  {type === "sale" && viewTxn.saleOrderId ? (
                    <button className="btn btn-ghost" type="button" onClick={() => openSaleOrder(viewTxn)}>
                      <FileText size={15} /> Sale order
                    </button>
                  ) : null}
                  <button className="btn btn-ghost" type="button" onClick={() => void downloadTxnExcel(viewTxn)}>
                    <FileSpreadsheet size={15} /> Excel
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void shareTxn(viewTxn)}>
                    <Share2 size={15} /> Share
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => void printTxn(viewTxn)}>
                    <Printer size={15} /> Print
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void deleteTxn(viewTxn)}>
                    <Trash2 size={15} /> Delete
                  </button>
                </>
              ) : null}
              <button className="btn btn-ghost" type="button" onClick={closeViewTxn}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
                    <th className="col-price">PRICE/UNIT</th>
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
                {editingTxn ? "Update" : "Save"}
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
          <ItemFormFields
            formId="inv-add-item-form"
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
          className="inv-party-modal modal-party"
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
            <PartyFormFields form={newParty} onChange={setNewParty} />
          </form>
        </Modal>
      ) : null}
      </>
    );
  }

  function paymentLabel(t: Transaction): string {
    if (t.paymentTypeId && paymentMap.get(t.paymentTypeId)) {
      return paymentMap.get(t.paymentTypeId)!;
    }
    if (isCashSale(t)) return "Cash";
    return "—";
  }

  function txnBalance(t: Transaction): number {
    if (t.paymentTypeId || isCashSale(t)) return 0;
    return t.grandTotal;
  }

  function txnExportSpec(t: Transaction): DocumentExportSpec {
    const party = (t.partyId && partyMap.get(t.partyId)) || "—";
    const lines = getTxnLines(t);
    return {
      filename: t.number,
      companyName: company?.name || "",
      companyLines: [company?.address, company?.phone, company?.gstin ? `GSTIN/TRN: ${company.gstin}` : ""]
        .filter((v): v is string => Boolean(v && String(v).trim())),
      title: type === "sale" ? "SALE INVOICE" : "PURCHASE BILL",
      docNumber: t.number,
      meta: [
        { label: "Bill To", value: party },
        { label: "Invoice Date", value: formatDisplayDate(t.date) },
        { label: "Payment", value: paymentLabel(t) },
      ],
      columns: [
        { header: "Description" },
        { header: "Qty", align: "right", width: 18 },
        { header: "Rate", align: "right", width: 28 },
        { header: "Tax", align: "right", width: 18 },
        { header: "Amount", align: "right", width: 32 },
      ],
      rows: lines.length
        ? lines.map((l) => [
            l.name,
            l.qty,
            fmtMoney(l.rate),
            `${l.taxPercent}%`,
            fmtMoney(lineAmountExTax(l)),
          ])
        : [["No line items", "", "", "", ""]],
      totals: [
        { label: "Subtotal", value: fmtMoney(t.subtotal) },
        { label: "Tax", value: fmtMoney(t.taxTotal) },
        { label: "Total", value: fmtMoney(t.grandTotal), emphasize: true },
        { label: "Balance", value: fmtMoney(txnBalance(t)) },
      ],
      notes: t.notes || undefined,
      footerNote: "Authorized Signatory",
    };
  }

  async function loadTxnForExport(t: Transaction): Promise<Transaction> {
    if (getTxnLines(t).length) return t;
    try {
      const { transaction } = await api.transactions.get(t.id);
      return transaction;
    } catch {
      return t;
    }
  }

  async function printTxn(t: Transaction) {
    printDocument(txnExportSpec(await loadTxnForExport(t)));
  }

  async function downloadTxnPdf(t: Transaction) {
    downloadDocumentPdf(txnExportSpec(await loadTxnForExport(t)));
  }

  async function downloadTxnExcel(t: Transaction) {
    const full = await loadTxnForExport(t);
    const party = (full.partyId && partyMap.get(full.partyId)) || "";
    const lines = getTxnLines(full);
    downloadExcelTable({
      filename: full.number,
      sheetTitle: `${type === "sale" ? "Sale Invoice" : "Purchase Bill"} ${full.number}`,
      metaRows: [
        ["Company", company?.name || ""],
        ["Party", party],
        ["Date", full.date],
        ["Payment", paymentLabel(full) === "—" ? "" : paymentLabel(full)],
        ["Subtotal", full.subtotal.toFixed(2)],
        ["Tax", full.taxTotal.toFixed(2)],
        ["Total", full.grandTotal.toFixed(2)],
        ["Balance", txnBalance(full).toFixed(2)],
      ],
      columns: ["Description", "Qty", "Rate", "Tax %", "Amount"],
      rows: lines.map((l) => [
        l.name,
        l.qty,
        l.rate.toFixed(2),
        l.taxPercent,
        lineAmountExTax(l).toFixed(2),
      ]),
    });
  }

  async function shareTxn(t: Transaction) {
    const party = (t.partyId && partyMap.get(t.partyId)) || "Party";
    const text = `${type === "sale" ? "Sale Invoice" : "Purchase Bill"} ${t.number}\nParty: ${party}\nDate: ${formatDisplayDate(t.date)}\nAmount: ${fmtMoney(t.grandTotal)}\nBalance: ${fmtMoney(txnBalance(t))}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t.number, text });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
      alert("Invoice details copied to clipboard");
    } catch {
      alert(text);
    }
  }

  async function deleteTxn(t: Transaction) {
    setActionMenuId(null);
    setActionMenuPos(null);
    if (!confirm(`Delete invoice ${t.number}?`)) return;
    await api.transactions.remove(t.id);
    if (selectedTxnId === t.id) setSelectedTxnId(null);
    if (viewTxn?.id === t.id || viewTxnId === t.id) closeViewTxn();
    reloadTxns();
  }

  function closeActionMenu() {
    setActionMenuId(null);
    setActionMenuPos(null);
  }

  function openActionMenu(txnId: string, btn: HTMLButtonElement) {
    if (actionMenuId === txnId) {
      closeActionMenu();
      return;
    }
    const rect = btn.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 200 && rect.top > 200;
    actionMenuBtnRef.current = btn;
    setActionMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - 148),
      openUp,
    });
    setActionMenuId(txnId);
  }

  function closeViewTxn() {
    setViewTxn(null);
    setViewLoading(false);
    const params = new URLSearchParams(searchParams);
    params.delete("txn");
    navigate({ search: params.toString() }, { replace: true });
  }

  async function openViewTxn(t: Transaction) {
    closeActionMenu();
    setViewTxn(t as Transaction & { lineItems?: LineItem[] });
    const params = new URLSearchParams(searchParams);
    params.set("txn", t.id);
    navigate({ search: params.toString() });
  }

  function openSaleOrder(t: Transaction) {
    if (!t.saleOrderId) return;
    closeActionMenu();
    navigate(`/sales/orders?doc=${encodeURIComponent(t.saleOrderId)}`);
  }

  async function previewTxn(t: Transaction) {
    previewDocument(txnExportSpec(await loadTxnForExport(t)));
  }

  async function editTxn(t: Transaction) {
    const full = await loadTxnForExport(t);
    const source = getTxnLines(full);
    const draft = createDraft(full.partyId || "", full.paymentTypeId || "");
    draft.date = full.date.slice(0, 10);
    draft.saleMode = isCashSale(full) ? "cash" : "credit";
    draft.notes = full.notes || "";
    draft.showNotes = Boolean(full.notes);
    draft.lines = source.length
      ? source.map((line) => ({
          key: uid("draft"),
          itemId: line.itemId || "",
          name: line.name,
          qty: String(line.qty),
          unit: "NONE",
          rate: String(line.rate),
          discountPercent: "",
          taxPercent: String(line.taxPercent),
        }))
      : [blankLine()];
    setDocs([draft]);
    setActiveDocId(draft.id);
    setEditingTxn({ id: full.id, number: full.number });
    setOpen(true);
    closeViewTxn();
  }

  function changeSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "date" || key === "amount" || key === "balance" ? "desc" : "asc" },
    );
  }

  function listExportRows() {
    return filteredTxns.map((t) => [
      formatDisplayDate(t.date),
      t.number,
      (t.partyId && partyMap.get(t.partyId)) || "—",
      paymentLabel(t),
      fmtMoney(t.grandTotal),
      fmtMoney(txnBalance(t)),
    ]);
  }

  function listExportColumns() {
    return [
      { header: "Date", width: 24 },
      { header: "Invoice No.", width: 32 },
      { header: "Party" },
      { header: "Payment", width: 28 },
      { header: "Amount", align: "right" as const, width: 30 },
      { header: "Balance", align: "right" as const, width: 30 },
    ];
  }

  function exportListExcel() {
    downloadExcelTable({
      filename: `${type}-invoices-${todayISO()}`,
      sheetTitle: type === "sale" ? "Sale Invoices" : "Purchase Bills",
      metaRows: [
        ["Company", company?.name || ""],
        ["Total", listSummary.total.toFixed(2)],
        [type === "sale" ? "Received" : "Paid", listSummary.received.toFixed(2)],
        ["Balance", listSummary.balance.toFixed(2)],
      ],
      columns: ["Date", "Invoice No.", "Party", "Payment", "Amount", "Balance"],
      rows: filteredTxns.map((t) => [
        t.date,
        t.number,
        (t.partyId && partyMap.get(t.partyId)) || "",
        paymentLabel(t) === "—" ? "" : paymentLabel(t),
        t.grandTotal.toFixed(2),
        txnBalance(t).toFixed(2),
      ]),
    });
  }

  function downloadListPdf() {
    const title = type === "sale" ? "Sale Invoices" : "Purchase Bills";
    downloadTablePdf({
      filename: `${type}-invoices-${todayISO()}`,
      companyName: company?.name || "",
      title,
      subtitle:
        dateFilter === "all"
          ? "Period: All time"
          : `Period: ${formatDisplayDate(monthRange.from)} to ${formatDisplayDate(monthRange.to)}`,
      summary: [
        { label: "Total", value: fmtMoney(listSummary.total) },
        { label: type === "sale" ? "Received" : "Paid", value: fmtMoney(listSummary.received) },
        { label: "Balance", value: fmtMoney(listSummary.balance) },
      ],
      columns: listExportColumns(),
      rows: listExportRows(),
    });
  }

  function printList() {
    const title = type === "sale" ? "Sale Invoices" : "Purchase Bills";
    printTable({
      companyName: company?.name || "",
      title,
      subtitle:
        dateFilter === "all"
          ? "Period: All time"
          : `Period: ${formatDisplayDate(monthRange.from)} to ${formatDisplayDate(monthRange.to)}`,
      summary: [
        { label: "Total", value: fmtMoney(listSummary.total) },
        { label: type === "sale" ? "Received" : "Paid", value: fmtMoney(listSummary.received) },
        { label: "Balance", value: fmtMoney(listSummary.balance) },
      ],
      columns: listExportColumns(),
      rows: listExportRows(),
    });
  }

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return <Funnel size={11} />;
    return sort.direction === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  }

  return (
    <>
      <header className="topbar">
        <div className="sale-list-title" ref={titleMenuRef}>
          <button
            type="button"
            className="sale-list-title-button"
            onClick={() => type === "sale" && setTitleMenuOpen((open) => !open)}
            aria-expanded={type === "sale" ? titleMenuOpen : undefined}
          >
            <h1>{listTitle}</h1>
            {type === "sale" ? <ChevronDown size={16} aria-hidden /> : null}
          </button>
          {type === "sale" && titleMenuOpen ? (
            <div className="sale-title-menu">
              {SALE_LIST_ROUTES.map((item) => (
                <button
                  type="button"
                  key={item.to}
                  className={item.to === "/sales" ? "active" : undefined}
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
                onChange={(e) => setCustomRange((range) => ({ ...range, from: e.target.value }))}
                aria-label="From date"
              />
              <span>To</span>
              <input
                type="date"
                value={customRange.to}
                min={customRange.from}
                onChange={(e) => setCustomRange((range) => ({ ...range, to: e.target.value }))}
                aria-label="To date"
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
              value={payStatusFilter}
              onChange={(e) => setPayStatusFilter(e.target.value as typeof payStatusFilter)}
              aria-label="Payment status filter"
            >
              <option value="all">All Payments</option>
              <option value="paid">{type === "sale" ? "Received" : "Paid"}</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <ChevronDown size={13} />
          </label>
          <label className="filter-pill sale-filter-select">
            <select
              value={paymentTypeFilter}
              onChange={(e) => setPaymentTypeFilter(e.target.value)}
              aria-label="Payment type filter"
            >
              <option value="">All Payment Types</option>
              {(payments ?? []).map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
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
            <small>Total {type === "sale" ? "Sales" : "Purchase"} Amount</small>
            <strong>{fmtMoney(listSummary.total)}</strong>
            <div className="sale-list-summary-meta">
              <span>
                {type === "sale" ? "Received" : "Paid"}: {fmtMoney(listSummary.received)}
              </span>
              <span className="sep">|</span>
              <span>Balance: {fmtMoney(listSummary.balance)}</span>
            </div>
          <em className={`sale-list-trend${trend < 0 ? " negative" : ""}`}>
            {trend > 0 ? "+" : ""}
            {trend.toFixed(1)}% vs last month
          </em>
          </div>
          <button className="btn btn-primary sale-list-add" type="button" onClick={openCreate}>
            <Plus size={16} /> {addLabel}
          </button>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Transactions</h2>
            <div className="report-tools">
              {listSearchOpen ? (
                <label className="compact-search">
                  <Search size={14} />
                  <input
                    autoFocus
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search invoice / party"
                    aria-label="Search transactions"
                  />
                  <button
                    type="button"
                    className="icon-tool"
                    aria-label="Close search"
                    onClick={() => {
                      setListSearch("");
                      setListSearchOpen(false);
                    }}
                  >
                    <X size={14} />
                  </button>
                </label>
              ) : (
                <button
                  type="button"
                  className="icon-tool"
                  title="Search"
                  aria-label="Search"
                  onClick={() => setListSearchOpen(true)}
                >
                  <Search size={15} />
                </button>
              )}
              <button
                type="button"
                className="icon-tool"
                title="Chart"
                aria-label="Chart"
                onClick={() => setChartOpen(true)}
              >
                <BarChart3 size={15} />
              </button>
              <button
                type="button"
                className="icon-tool"
                title="Download Excel"
                aria-label="Download Excel"
                onClick={exportListExcel}
              >
                <FileSpreadsheet size={15} />
              </button>
              <button
                type="button"
                className="icon-tool"
                title="Download PDF"
                aria-label="Download PDF"
                onClick={downloadListPdf}
              >
                <FileText size={15} />
              </button>
              <button
                type="button"
                className="icon-tool"
                title="Print list"
                aria-label="Print list"
                onClick={printList}
              >
                <Printer size={15} />
              </button>
            </div>
          </div>
          <div className="table-wrap sale-list-table-wrap">
            <table className="data sale-list-table">
              <thead>
                <tr>
                  <th className="col-date">
                    <button type="button" className="sale-sort" onClick={() => changeSort("date")}>
                      Date {sortIcon("date")}
                    </button>
                  </th>
                  <th className="col-number">
                    <button type="button" className="sale-sort" onClick={() => changeSort("number")}>
                      Invoice no. {sortIcon("number")}
                    </button>
                  </th>
                  <th className="col-party">
                    <button type="button" className="sale-sort" onClick={() => changeSort("party")}>
                      Party Name {sortIcon("party")}
                    </button>
                  </th>
                  <th className="col-txn">
                    <button type="button" className="sale-sort" onClick={() => changeSort("transaction")}>
                      Transaction {sortIcon("transaction")}
                    </button>
                  </th>
                  <th className="col-payment">
                    <button type="button" className="sale-sort" onClick={() => changeSort("payment")}>
                      Payment Type {sortIcon("payment")}
                    </button>
                  </th>
                  <th className="col-amount">
                    <button type="button" className="sale-sort" onClick={() => changeSort("amount")}>
                      Amount {sortIcon("amount")}
                    </button>
                  </th>
                  <th className="col-balance">
                    <button type="button" className="sale-sort" onClick={() => changeSort("balance")}>
                      Balance {sortIcon("balance")}
                    </button>
                  </th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((t) => {
                  const bal = txnBalance(t);
                  const menuOpen = actionMenuId === t.id;
                  const partyName = (t.partyId && partyMap.get(t.partyId)) || "—";
                  return (
                    <tr
                      key={t.id}
                      className={selectedTxnId === t.id ? "selected" : undefined}
                      onClick={() => setSelectedTxnId(t.id)}
                      onDoubleClick={() => void openViewTxn(t)}
                    >
                      <td className="col-date" data-label="Date">
                        {formatDisplayDate(t.date)}
                      </td>
                      <td className="col-number" data-label="Invoice no.">
                        <strong>{displayInvoiceNo(t.number)}</strong>
                        {type === "sale" && t.saleOrderId ? (
                          <button
                            type="button"
                            className="sale-order-link"
                            onClick={() => openSaleOrder(t)}
                          >
                            {t.saleOrderNumber || "Sale order"}
                          </button>
                        ) : null}
                      </td>
                      <td className="col-party" data-label="Party" title={partyName}>
                        {partyName}
                      </td>
                      <td className="col-txn" data-label="Transaction">
                        {type === "sale" ? "Sale" : "Purchase"}
                      </td>
                      <td className="col-payment" data-label="Payment">
                        {paymentLabel(t)}
                      </td>
                      <td className="col-amount money" data-label="Amount">
                        {fmtMoney(t.grandTotal)}
                      </td>
                      <td className="col-balance money" data-label="Balance">
                        {fmtMoney(bal)}
                      </td>
                      <td
                        className="col-actions sale-list-actions"
                        data-label="Actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="sale-list-actions-inner">
                          <button
                            type="button"
                            className="icon-tool"
                            title="View details"
                            aria-label="View details"
                            onClick={() => void openViewTxn(t)}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-tool sale-action-wide"
                            title="Download PDF"
                            aria-label="Download PDF"
                            onClick={() => void downloadTxnPdf(t)}
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-tool sale-action-wide"
                            title="Print"
                            aria-label="Print"
                            onClick={() => void printTxn(t)}
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-tool sale-action-wide"
                            title="Share"
                            aria-label="Share"
                            onClick={() => void shareTxn(t)}
                          >
                            <Share2 size={15} />
                          </button>
                          <div className="sale-list-more">
                            <button
                              type="button"
                              className="icon-tool"
                              title="More"
                              aria-label="More actions"
                              aria-expanded={menuOpen}
                              onClick={(e) => openActionMenu(t.id, e.currentTarget)}
                            >
                              <MoreVertical size={15} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredTxns.length ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty">
                        No {type} invoices{listSearch ? " match your search" : " yet"}.
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
      {chartOpen ? (
        <Modal title={`${listTitle} chart`} className="sale-chart-modal" onClose={() => setChartOpen(false)}>
          <div className="sale-chart">
            {chartRows.map((row) => (
              <div className="sale-chart-row" key={row.date}>
                <span>{formatDisplayDate(row.date)}</span>
                <div>
                  <i style={{ width: `${row.percent}%` }} />
                </div>
                <strong>{fmtMoney(row.total)}</strong>
              </div>
            ))}
            {!chartRows.length ? <div className="empty">No data for the selected filters.</div> : null}
          </div>
        </Modal>
      ) : null}
      {actionMenuId && actionMenuPos
        ? createPortal(
            (() => {
              const menuTxn = filteredTxns.find((row) => row.id === actionMenuId);
              if (!menuTxn) return null;
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
                      void openViewTxn(menuTxn);
                    }}
                  >
                    View details
                  </button>
                  {type === "sale" && menuTxn.saleOrderId ? (
                    <button type="button" onClick={() => openSaleOrder(menuTxn)}>
                      View sale order
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void downloadTxnPdf(menuTxn);
                      closeActionMenu();
                    }}
                  >
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void downloadTxnExcel(menuTxn);
                      closeActionMenu();
                    }}
                  >
                    Download Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void printTxn(menuTxn);
                      closeActionMenu();
                    }}
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void shareTxn(menuTxn);
                      closeActionMenu();
                    }}
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void deleteTxn(menuTxn)}
                  >
                    Delete
                  </button>
                </div>
              );
            })(),
            document.body,
          )
        : null}
    </>
  );
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

function formatDisplayDate(iso: string) {
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

function isCashSale(t: Transaction): boolean {
  if (t.paymentTypeId) return true;
  return (t.notes ?? "").toLowerCase().includes("cash sale");
}

function displayInvoiceNo(number: string): string {
  const m = number.match(/(\d+)\s*$/);
  return m?.[1] ?? number;
}

function getTxnLines(transaction: Transaction): LineItem[] {
  return (transaction as Transaction & { lineItems?: LineItem[] }).lineItems ?? [];
}
