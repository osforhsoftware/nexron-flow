import { Link } from "react-router-dom";
import {
  FileText,
  Package,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const STEPS = [
  { to: "/purchases/rfq", label: "RFQ", hint: "Ask suppliers for prices", icon: FileText, type: "rfq" },
  { to: "/purchases/orders", label: "PO", hint: "Confirm purchase order", icon: ShoppingBag, type: "purchase_order" },
  { to: "/purchases/grn", label: "GRN", hint: "Receive items into stock", icon: PackageCheck, type: "grn" },
  { to: "/purchases/returns", label: "Purchase Returns", hint: "Return to supplier", icon: RotateCcw, type: "purchase_return" },
  { to: "/purchases/bills", label: "Purchase Bills", hint: "Supplier invoices", icon: Package, type: "" },
] as const;

export function PurchaseOverviewPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);

  const { data } = useAsync(async () => {
    if (!companyId) return null;
    const types = [
      "rfq",
      "purchase_order",
      "grn",
      "purchase_return",
    ] as const;
    const [docsLists, txns] = await Promise.all([
      Promise.all(types.map((type) => api.docs.list(companyId, type))),
      api.transactions.list(companyId, "purchase"),
    ]);
    const counts: Record<string, number> = {};
    types.forEach((type, i) => {
      counts[type] = docsLists[i].docs.length;
    });
    const bills = txns.transactions;
    return {
      counts,
      billCount: bills.length,
      billTotal: bills.reduce((s, t) => s + t.grandTotal, 0),
    };
  }, [companyId]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Purchase</h1>
          <p className="muted">RFQ → PO → GRN → Purchase Bill</p>
        </div>
        <div className="topbar-actions">
          <Link className="btn btn-primary" to="/purchases/rfq?create=1">
            New RFQ
          </Link>
        </div>
      </header>
      <div className="content">
        <div className="quick-action-grid purchase-flow-grid">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const count =
              step.to === "/purchases/bills"
                ? data?.billCount
                : step.type
                  ? data?.counts[step.type]
                  : undefined;
            return (
              <Link key={step.to} to={step.to} className="quick-action-card">
                <Icon />
                <span>
                  <strong>{step.label}</strong>
                  <small>
                    {step.hint}
                    {count != null ? ` · ${count}` : ""}
                  </small>
                </span>
              </Link>
            );
          })}
        </div>
        {data ? (
          <div className="panel" style={{ marginTop: 16, padding: 16 }}>
            <p className="muted">
              Purchase bills this company: <strong>{data.billCount}</strong> ·{" "}
              {fmtMoney(data.billTotal)}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
