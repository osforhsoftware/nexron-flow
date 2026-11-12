import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Headphones,
  Home,
  Package,
  Search,
  ShoppingCart,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { canOpenRoute } from "../lib/roles";
import { money } from "../lib/format";

type ResultKind = "page" | "party" | "item" | "equipment" | "txn";

type SearchResult = {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  to: string;
  icon: LucideIcon;
};

const PAGE_RESULTS: Array<Omit<SearchResult, "id"> & { id: string; route: string }> = [
  { id: "page-home", kind: "page", title: "Home", subtitle: "Dashboard", to: "/", route: "/", icon: Home },
  { id: "page-parties", kind: "page", title: "Parties", subtitle: "Customers & suppliers", to: "/parties", route: "/parties", icon: Users },
  { id: "page-products", kind: "page", title: "Products", subtitle: "Items", to: "/items/products", route: "/items/products", icon: Package },
  { id: "page-services", kind: "page", title: "Services", subtitle: "Items", to: "/items/services", route: "/items/services", icon: Package },
  { id: "page-equipment", kind: "page", title: "Equipment", subtitle: "Items", to: "/items/equipment", route: "/items/equipment", icon: Wrench },
  { id: "page-service-calls", kind: "page", title: "Service Calls", subtitle: "Service", to: "/service/calls", route: "/service/calls", icon: Headphones },
  { id: "page-sales", kind: "page", title: "Sale Invoices", subtitle: "Sale", to: "/sales", route: "/sales", icon: ShoppingCart },
  { id: "page-quotations", kind: "page", title: "Estimate / Quotation", subtitle: "Sale", to: "/sales/quotations", route: "/sales/quotations", icon: FileText },
  { id: "page-orders", kind: "page", title: "Sale Order", subtitle: "Sale", to: "/sales/orders", route: "/sales/orders", icon: FileText },
  { id: "page-delivery", kind: "page", title: "Delivery Challan", subtitle: "Sale", to: "/sales/delivery", route: "/sales/delivery", icon: FileText },
  { id: "page-purchases", kind: "page", title: "Purchase Overview", subtitle: "Purchase", to: "/purchases", route: "/purchases", icon: Store },
  { id: "page-rfq", kind: "page", title: "RFQ", subtitle: "Purchase", to: "/purchases/rfq", route: "/purchases/rfq", icon: Store },
  { id: "page-po", kind: "page", title: "Purchase Order", subtitle: "Purchase", to: "/purchases/orders", route: "/purchases/orders", icon: Store },
  { id: "page-grn", kind: "page", title: "GRN", subtitle: "Purchase", to: "/purchases/grn", route: "/purchases/grn", icon: Store },
  { id: "page-returns", kind: "page", title: "Purchase Returns", subtitle: "Purchase", to: "/purchases/returns", route: "/purchases/returns", icon: Store },
  { id: "page-bills", kind: "page", title: "Purchase Bills", subtitle: "Purchase", to: "/purchases/bills", route: "/purchases/bills", icon: Store },
  { id: "page-payments", kind: "page", title: "Cash & Bank", subtitle: "Payments", to: "/payments", route: "/payments", icon: FileText },
  { id: "page-reports", kind: "page", title: "Reports", subtitle: "Analytics", to: "/reports", route: "/reports", icon: FileText },
  { id: "page-roles", kind: "page", title: "Roles", subtitle: "Access", to: "/roles", route: "/roles", icon: Users },
  { id: "page-utilities", kind: "page", title: "Utilities", subtitle: "Tools", to: "/utilities", route: "/utilities", icon: Wrench },
  { id: "page-manual-backup", kind: "page", title: "Create Manual Backup", subtitle: "Utilities", to: "/utilities", route: "/utilities", icon: FileText },
  { id: "page-settings", kind: "page", title: "Settings", subtitle: "Business", to: "/settings", route: "/settings", icon: FileText },
];

function matches(term: string, ...parts: Array<string | null | undefined>) {
  return parts.some((p) => (p ?? "").toLowerCase().includes(term));
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { company, session } = useApp();
  const companyId = company?.id;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState<SearchResult[]>([]);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [equipment, setEquipment] = useState<SearchResult[]>([]);
  const [txns, setTxns] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [partyRes, itemRes, eqRes, txnRes] = await Promise.all([
          api.parties.list(companyId),
          api.items.list(companyId),
          api.equipment.list(companyId),
          api.transactions.list(companyId),
        ]);
        if (cancelled) return;

        setParties(
          partyRes.parties.map((p) => ({
            id: `party-${p.id}`,
            kind: "party" as const,
            title: p.name,
            subtitle: [p.phone, p.type].filter(Boolean).join(" · ") || "Party",
            to: `/parties?id=${encodeURIComponent(p.id)}`,
            icon: Users,
          })),
        );

        setItems(
          itemRes.items.map((i) => {
            const kindPath = i.itemType === "service" ? "services" : "products";
            return {
              id: `item-${i.id}`,
              kind: "item" as const,
              title: i.name,
              subtitle: [i.sku, i.category, money(i.salePrice, company?.currency)]
                .filter(Boolean)
                .join(" · "),
              to: `/items/${kindPath}?id=${encodeURIComponent(i.id)}`,
              icon: Package,
            };
          }),
        );

        setEquipment(
          eqRes.equipment.map((e) => ({
            id: `eq-${e.id}`,
            kind: "equipment" as const,
            title: e.name,
            subtitle: [e.assetTag, e.serialNumber, e.customerName].filter(Boolean).join(" · "),
            to: `/items/equipment?id=${encodeURIComponent(e.id)}`,
            icon: Wrench,
          })),
        );

        setTxns(
          txnRes.transactions.map((t) => {
            const base =
              t.type === "sale"
                ? "/sales"
                : t.type === "purchase"
                  ? "/purchases/bills"
                  : "/payments";
            const icon = t.type === "sale" ? ShoppingCart : t.type === "purchase" ? Store : FileText;
            return {
              id: `txn-${t.id}`,
              kind: "txn" as const,
              title: `${t.number}`,
              subtitle: `${t.type.replace("_", " ")} · ${t.date} · ${money(t.grandTotal, company?.currency)}`,
              to: `${base}?txn=${encodeURIComponent(t.id)}`,
              icon,
            };
          }),
        );
      } catch {
        if (!cancelled) {
          setParties([]);
          setItems([]);
          setEquipment([]);
          setTxns([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, companyId, company?.currency]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pages = PAGE_RESULTS.filter((p) => canOpenRoute(session ?? undefined, p.route)).filter(
      (p) => !term || matches(term, p.title, p.subtitle),
    );

    if (!term) {
      return pages.slice(0, 12);
    }

    const dataHits = [...parties, ...items, ...equipment, ...txns].filter((r) =>
      matches(term, r.title, r.subtitle),
    );

    const ranked = [...pages, ...dataHits].slice(0, 40);
    return ranked;
  }, [query, parties, items, equipment, txns, session]);

  useEffect(() => {
    setActive(0);
  }, [query, results.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const hit = results[active];
        if (hit) {
          e.preventDefault();
          navigate(hit.to);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, navigate, onClose]);

  if (!open) return null;

  const kindLabel: Record<ResultKind, string> = {
    page: "Page",
    party: "Party",
    item: "Item",
    equipment: "Equipment",
    txn: "Document",
  };

  return (
    <div
      className="cmd-palette-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="cmd-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-palette-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parties, items, invoices, pages…"
            aria-label="Search"
            autoComplete="off"
          />
          {loading ? <span className="cmd-palette-hint">Loading…</span> : <kbd>Esc</kbd>}
        </div>
        <div className="cmd-palette-list" role="listbox">
          {!results.length ? (
            <div className="cmd-palette-empty">
              {query.trim() ? `No results for “${query.trim()}”` : "Type to search everything"}
            </div>
          ) : (
            results.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`cmd-palette-item${i === active ? " active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    navigate(r.to);
                    onClose();
                  }}
                >
                  <Icon size={16} />
                  <span className="cmd-palette-text">
                    <strong>{r.title}</strong>
                    <small>{r.subtitle}</small>
                  </span>
                  <span className="cmd-palette-kind">{kindLabel[r.kind]}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
