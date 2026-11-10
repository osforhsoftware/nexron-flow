import { Link } from "react-router-dom";
import { BanknoteArrowDown, BanknoteArrowUp, FilePlus2, Plus, ShoppingBag } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { partyBalances, salesSummary } from "../lib/reports";
import { useAsync } from "../lib/useAsync";

export function DashboardPage() {
  const { company, canAccess } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);

  const { data } = useAsync(async () => {
    if (!companyId) return null;
    const [summary, parties, itemsRes, txnsRes] = await Promise.all([
      salesSummary(companyId),
      partyBalances(companyId),
      api.items.list(companyId),
      api.transactions.list(companyId),
    ]);
    return {
      summary,
      receivable: parties.filter((p) => p.computed > 0).reduce((s, p) => s + p.computed, 0),
      payable: parties.filter((p) => p.computed < 0).reduce((s, p) => s + Math.abs(p.computed), 0),
      stockValue: itemsRes.items.reduce((s, i) => s + i.stockQty * i.purchasePrice, 0),
      recent: txnsRes.transactions.slice(0, 8),
    };
  }, [companyId]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Home</h1>
          <p className="muted">{company?.name} · business dashboard (PHP API)</p>
        </div>
        <div className="topbar-actions">
          {canAccess("sales") ? (
            <Link className="btn btn-primary" to="/sales?create=1">
              <Plus size={14} /> Add Sale
            </Link>
          ) : null}
          {canAccess("purchases") ? (
            <Link className="btn btn-secondary" to="/purchases?create=1">
              <Plus size={14} /> Add Purchase
            </Link>
          ) : null}
        </div>
      </header>

      <div className="content">
        <div className="quick-action-grid">
          {canAccess("sales") ? (
            <Link to="/sales?create=1" className="quick-action-card">
              <FilePlus2 />
              <span>
                <strong>Sale Invoice</strong>
                <small>Create tax invoice</small>
              </span>
            </Link>
          ) : null}
          {canAccess("purchases") ? (
            <Link to="/purchases?create=1" className="quick-action-card blue">
              <ShoppingBag />
              <span>
                <strong>Purchase Bill</strong>
                <small>Record new purchase</small>
              </span>
            </Link>
          ) : null}
          {canAccess("payments") ? (
            <>
              <Link to="/payments" className="quick-action-card green">
                <BanknoteArrowDown />
                <span>
                  <strong>Payment In</strong>
                  <small>Record receipt</small>
                </span>
              </Link>
              <Link to="/payments" className="quick-action-card amber">
                <BanknoteArrowUp />
                <span>
                  <strong>Payment Out</strong>
                  <small>Record expense</small>
                </span>
              </Link>
            </>
          ) : null}
        </div>
        <div className="stat-row">
          <div className="stat">
            <small>Total Sales</small>
            <strong>{fmtMoney(data?.summary.salesTotal ?? 0)}</strong>
          </div>
          <div className="stat">
            <small>To Receive</small>
            <strong className="money recv">{fmtMoney(data?.receivable ?? 0)}</strong>
          </div>
          <div className="stat">
            <small>To Pay</small>
            <strong className="money pay">{fmtMoney(data?.payable ?? 0)}</strong>
          </div>
          <div className="stat">
            <small>Stock Value</small>
            <strong>{fmtMoney(data?.stockValue ?? 0)}</strong>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Recent Transactions</h2>
            {canAccess("reports") ? (
              <Link className="btn btn-ghost" to="/reports">
                View reports
              </Link>
            ) : null}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>No.</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      <span
                        className={`badge ${
                          t.type === "sale" || t.type === "payment_in" ? "badge-sale" : "badge-purchase"
                        }`}
                      >
                        {t.type.replace("_", " ")}
                      </span>
                    </td>
                    <td>{t.number}</td>
                    <td className="money">{fmtMoney(t.grandTotal)}</td>
                  </tr>
                ))}
                {!data?.recent?.length ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty">No transactions yet. Click Add Sale to begin.</div>
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
