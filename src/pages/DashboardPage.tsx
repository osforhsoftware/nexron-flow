import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BanknoteArrowDown,
  BanknoteArrowUp,
  BarChart3,
  ClipboardList,
  FilePlus2,
  FileText,
  Package,
  PackageCheck,
  Plus,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { partyBalances, profitAndLossLite, salesSummary } from "../lib/reports";
import { getMobileHomeProfile, prefersQuickOrder, ROLE_LABELS } from "../lib/roles";
import { useAsync } from "../lib/useAsync";
import { TablePagination, usePagedRows } from "../components/TablePagination";

const LOW_STOCK_QTY = 5;

export function DashboardPage() {
  const { company, session, canAccess } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);
  const allowSales = canAccess("sales") || canAccess("new_invoice");
  const allowPurchases = canAccess("purchases") || canAccess("purchase_bills");
  const allowItems = canAccess("items");
  const homeProfile = getMobileHomeProfile(session);
  const showQuickOrder = prefersQuickOrder(session) && allowSales;
  const showAdminTools = canAccess("roles") || canAccess("settings") || canAccess("companies") || homeProfile === "admin";
  const showFinanceDeep =
    homeProfile === "admin" || homeProfile === "accounts" || homeProfile === "office";
  const showStockDeep = homeProfile === "admin" || homeProfile === "store" || homeProfile === "office";
  const roleLabel = session?.role ? ROLE_LABELS[session.role] : null;

  const { data, error, loading } = useAsync(async () => {
    if (!companyId) return null;

    const monthPrefix = new Date().toISOString().slice(0, 7);
    const emptyDocs = { docs: [] as Awaited<ReturnType<typeof api.docs.list>>["docs"] };
    const emptyEquip = { equipment: [] as Awaited<ReturnType<typeof api.equipment.list>>["equipment"] };
    const emptyAccounts = {
      accounts: [] as Awaited<ReturnType<typeof api.payments.accounts>>["accounts"],
    };
    const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return fallback;
      }
    };

    const [
      summary,
      parties,
      itemsRes,
      txnsRes,
      accountsRes,
      pnl,
      quotationDocs,
      saleOrders,
      deliveries,
      rfqs,
      pos,
      grns,
      equipmentRes,
    ] = await Promise.all([
      salesSummary(companyId),
      partyBalances(companyId),
      api.items.list(companyId),
      api.transactions.list(companyId),
      safe(api.payments.accounts(companyId), emptyAccounts),
      profitAndLossLite(companyId),
      allowSales ? safe(api.docs.list(companyId, "quotation"), emptyDocs) : emptyDocs,
      allowSales ? safe(api.docs.list(companyId, "sale_order"), emptyDocs) : emptyDocs,
      allowSales ? safe(api.docs.list(companyId, "delivery"), emptyDocs) : emptyDocs,
      allowPurchases ? safe(api.docs.list(companyId, "rfq"), emptyDocs) : emptyDocs,
      allowPurchases ? safe(api.docs.list(companyId, "purchase_order"), emptyDocs) : emptyDocs,
      allowPurchases ? safe(api.docs.list(companyId, "grn"), emptyDocs) : emptyDocs,
      allowItems ? safe(api.equipment.list(companyId), emptyEquip) : emptyEquip,
    ]);

    const products = itemsRes.items.filter((i) => (i.itemType ?? "product") === "product");
    const services = itemsRes.items.filter((i) => i.itemType === "service");
    const openDoc = (status: string) =>
      !["converted", "declined", "expired"].includes(String(status));

    const monthSales = summary.sales
      .filter((t) => t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.grandTotal, 0);
    const monthPurchases = txnsRes.transactions
      .filter((t) => t.type === "purchase" && t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.grandTotal, 0);

    const partyById = new Map(parties.map((p) => [p.id, p]));
    const recent = txnsRes.transactions.map((t) => ({
      ...t,
      partyName: t.partyId ? partyById.get(t.partyId)?.name : undefined,
    }));

    const cashBalance = accountsRes.accounts.reduce((s, a) => s + a.openingBalance, 0);

    return {
      summary,
      pnl,
      receivable: parties.filter((p) => p.computed > 0).reduce((s, p) => s + p.computed, 0),
      payable: parties.filter((p) => p.computed < 0).reduce((s, p) => s + Math.abs(p.computed), 0),
      stockValue: products.reduce((s, i) => s + i.stockQty * i.purchasePrice, 0),
      itemCount: itemsRes.items.length,
      productCount: products.length,
      serviceCount: services.length,
      partyCount: parties.length,
      equipmentCount: equipmentRes.equipment.length,
      lowStock: products
        .filter((i) => i.stockQty <= LOW_STOCK_QTY)
        .sort((a, b) => a.stockQty - b.stockQty),
      topRecv: parties
        .filter((p) => p.computed > 0)
        .sort((a, b) => b.computed - a.computed),
      topPay: parties
        .filter((p) => p.computed < 0)
        .sort((a, b) => a.computed - b.computed),
      recent,
      accounts: accountsRes.accounts,
      cashBalance,
      monthSales,
      monthPurchases,
      pipeline: {
        quotations: quotationDocs.docs.filter((d) => openDoc(String(d.status))).length,
        saleOrders: saleOrders.docs.filter((d) => openDoc(String(d.status))).length,
        deliveries: deliveries.docs.filter((d) => openDoc(String(d.status))).length,
        rfqs: rfqs.docs.filter((d) => openDoc(String(d.status))).length,
        pos: pos.docs.filter((d) => openDoc(String(d.status))).length,
        grns: grns.docs.filter((d) => openDoc(String(d.status))).length,
      },
    };
  }, [companyId]);

  const recvPage = usePagedRows(data?.topRecv, companyId ?? "");
  const payPage = usePagedRows(data?.topPay, `${companyId ?? ""}|pay`);
  const stockPage = usePagedRows(data?.lowStock, `${companyId ?? ""}|stock`);
  const recentPage = usePagedRows(data?.recent, `${companyId ?? ""}|recent`);

  return (
    <>
      <header className="topbar dash-home-topbar">
        <div>
          <h1>Home</h1>
          <p className="muted dash-home-company">
            {company?.name}
            {roleLabel ? ` · ${roleLabel}` : ""} ·{" "}
            {homeProfile === "sales"
              ? "quick sales workspace"
              : homeProfile === "store"
                ? "stock & purchase workspace"
                : homeProfile === "accounts"
                  ? "cash & reports workspace"
                  : "business dashboard"}
          </p>
        </div>
        <div className="topbar-actions dash-home-actions">
          {showQuickOrder ? (
            <Link className="btn btn-primary" to="/sales/quick">
              <Zap size={14} /> Quick Order
            </Link>
          ) : null}
          {allowSales ? (
            <Link className={`btn ${showQuickOrder ? "btn-secondary" : "btn-primary"}`} to="/sales?create=1">
              <Plus size={14} /> Add Sale
            </Link>
          ) : null}
          {allowPurchases && homeProfile !== "sales" ? (
            <Link className="btn btn-secondary" to="/purchases/bills?create=1">
              <Plus size={14} /> Add Purchase
            </Link>
          ) : null}
        </div>
      </header>

      <div className={`content dash-home dash-profile-${homeProfile}`}>
        {error ? <div className="empty">{error}</div> : null}
        {loading && !data ? <div className="muted" style={{ padding: "4px 2px" }}>Loading dashboard…</div> : null}

        {showQuickOrder ? (
          <Link to="/sales/quick" className="dash-quick-order-hero">
            <span className="dash-quick-order-icon">
              <Zap size={22} />
            </span>
            <span>
              <strong>Quick Order Entry</strong>
              <small>Create a cash or credit sale in a few taps</small>
            </span>
            <span className="dash-quick-order-cta">Start</span>
          </Link>
        ) : null}

        <div className="quick-action-grid dash-quick-grid">
          {allowSales ? (
            <>
              <Link to="/sales?create=1" className="quick-action-card">
                <FilePlus2 />
                <span>
                  <strong>Sale Invoice</strong>
                  <small>Create tax invoice</small>
                </span>
              </Link>
              {homeProfile !== "sales" ? (
                <>
                  <Link to="/sales/quotations?create=1" className="quick-action-card violet">
                    <FileText />
                    <span>
                      <strong>Quotation</strong>
                      <small>Estimate / quote</small>
                    </span>
                  </Link>
                  <Link to="/sales/orders?create=1" className="quick-action-card teal">
                    <ClipboardList />
                    <span>
                      <strong>Sale Order</strong>
                      <small>Confirm customer order</small>
                    </span>
                  </Link>
                  <Link to="/sales/delivery?create=1" className="quick-action-card slate">
                    <Truck />
                    <span>
                      <strong>Delivery</strong>
                      <small>Delivery challan</small>
                    </span>
                  </Link>
                </>
              ) : (
                <Link to="/parties" className="quick-action-card slate">
                  <Users />
                  <span>
                    <strong>Parties</strong>
                    <small>{data?.partyCount ?? 0} contacts</small>
                  </span>
                </Link>
              )}
            </>
          ) : null}
          {allowPurchases && homeProfile !== "sales" ? (
            <>
              <Link to="/purchases/bills?create=1" className="quick-action-card blue">
                <ShoppingBag />
                <span>
                  <strong>Purchase Bill</strong>
                  <small>Record new purchase</small>
                </span>
              </Link>
              {homeProfile !== "accounts" ? (
                <Link to="/purchases/rfq?create=1" className="quick-action-card indigo">
                  <FileText />
                  <span>
                    <strong>RFQ</strong>
                    <small>Ask suppliers</small>
                  </span>
                </Link>
              ) : null}
            </>
          ) : null}
          {canAccess("payments") ? (
            <>
              <Link to="/payments?create=1" className="quick-action-card green">
                <BanknoteArrowDown />
                <span>
                  <strong>Payment In</strong>
                  <small>Record receipt</small>
                </span>
              </Link>
              {homeProfile !== "sales" ? (
                <Link to="/payments" className="quick-action-card amber">
                  <BanknoteArrowUp />
                  <span>
                    <strong>Payment Out</strong>
                    <small>Record expense</small>
                  </span>
                </Link>
              ) : null}
            </>
          ) : null}
          {canAccess("parties") && homeProfile !== "sales" ? (
            <Link to="/parties" className="quick-action-card slate">
              <Users />
              <span>
                <strong>Parties</strong>
                <small>{data?.partyCount ?? 0} contacts</small>
              </span>
            </Link>
          ) : null}
          {allowItems && homeProfile !== "sales" && homeProfile !== "accounts" ? (
            <Link to="/items/products" className="quick-action-card teal">
              <Package />
              <span>
                <strong>Items</strong>
                <small>
                  {data?.productCount ?? 0} products · {data?.serviceCount ?? 0} services
                </small>
              </span>
            </Link>
          ) : null}
        </div>

        <div className="stat-row dash-stat-row">
          {allowSales || homeProfile === "admin" || homeProfile === "accounts" ? (
            <div className="stat">
              <small>Total Sales</small>
              <strong>{fmtMoney(data?.summary.salesTotal ?? 0)}</strong>
              <span className="stat-meta">{data?.summary.salesCount ?? 0} invoices</span>
            </div>
          ) : null}
          {(allowPurchases || homeProfile === "admin") && homeProfile !== "sales" ? (
            <div className="stat">
              <small>Total Purchase</small>
              <strong>{fmtMoney(data?.summary.purchaseTotal ?? 0)}</strong>
              <span className="stat-meta">{data?.summary.purchaseCount ?? 0} bills</span>
            </div>
          ) : null}
          {canAccess("parties") || showFinanceDeep ? (
            <div className="stat">
              <small>To Receive</small>
              <strong className="money recv">{fmtMoney(data?.receivable ?? 0)}</strong>
              <span className="stat-meta">Party receivables</span>
            </div>
          ) : null}
          {showFinanceDeep ? (
            <div className="stat">
              <small>To Pay</small>
              <strong className="money pay">{fmtMoney(data?.payable ?? 0)}</strong>
              <span className="stat-meta">Party payables</span>
            </div>
          ) : null}
          {showStockDeep && allowItems ? (
            <div className="stat">
              <small>Stock Value</small>
              <strong>{fmtMoney(data?.stockValue ?? 0)}</strong>
              <span className="stat-meta">{data?.productCount ?? 0} products</span>
            </div>
          ) : null}
          {canAccess("payments") || showFinanceDeep ? (
            <div className="stat">
              <small>Cash & Bank</small>
              <strong>{fmtMoney(data?.cashBalance ?? 0)}</strong>
              <span className="stat-meta">{data?.accounts.length ?? 0} accounts</span>
            </div>
          ) : null}
          {allowSales || homeProfile === "sales" ? (
            <div className="stat">
              <small>This Month Sales</small>
              <strong className="money recv">{fmtMoney(data?.monthSales ?? 0)}</strong>
              <span className="stat-meta">
                {homeProfile === "sales"
                  ? `${data?.summary.salesCount ?? 0} total invoices`
                  : `vs purchases ${fmtMoney(data?.monthPurchases ?? 0)}`}
              </span>
            </div>
          ) : null}
          {showFinanceDeep ? (
            <div className="stat">
              <small>Gross Profit (lite)</small>
              <strong className={data && data.pnl.gross >= 0 ? "money recv" : "money pay"}>
                {fmtMoney(data?.pnl.gross ?? 0)}
              </strong>
              <span className="stat-meta">Sales − purchases (ex tax)</span>
            </div>
          ) : null}
        </div>

        {homeProfile !== "sales" ? (
        <div className="dash-split">
          <div className="panel">
            <div className="panel-head">
              <h2>Open pipeline</h2>
              {allowPurchases ? (
                <Link className="btn btn-ghost" to="/purchases">
                  Purchase flow
                </Link>
              ) : null}
            </div>
            <div className="dash-pipeline">
              {allowSales ? (
                <>
                  <Link to="/sales/quotations" className="dash-pipe-card">
                    <strong>{data?.pipeline.quotations ?? 0}</strong>
                    <span>Quotations</span>
                  </Link>
                  <Link to="/sales/orders" className="dash-pipe-card">
                    <strong>{data?.pipeline.saleOrders ?? 0}</strong>
                    <span>Sale orders</span>
                  </Link>
                  <Link to="/sales/delivery" className="dash-pipe-card">
                    <strong>{data?.pipeline.deliveries ?? 0}</strong>
                    <span>Deliveries</span>
                  </Link>
                </>
              ) : null}
              {allowPurchases ? (
                <>
                  <Link to="/purchases/rfq" className="dash-pipe-card">
                    <strong>{data?.pipeline.rfqs ?? 0}</strong>
                    <span>RFQs</span>
                  </Link>
                  <Link to="/purchases/orders" className="dash-pipe-card">
                    <strong>{data?.pipeline.pos ?? 0}</strong>
                    <span>POs</span>
                  </Link>
                  <Link to="/purchases/grn" className="dash-pipe-card">
                    <strong>{data?.pipeline.grns ?? 0}</strong>
                    <span>GRNs</span>
                  </Link>
                </>
              ) : null}
              {allowItems && homeProfile !== "accounts" ? (
                <Link to="/items/equipment" className="dash-pipe-card">
                  <strong>{data?.equipmentCount ?? 0}</strong>
                  <span>Equipment</span>
                </Link>
              ) : null}
            </div>
          </div>

          {(canAccess("payments") || showFinanceDeep) ? (
          <div className="panel">
            <div className="panel-head">
              <h2>Cash & bank</h2>
              {canAccess("payments") ? (
                <Link className="btn btn-ghost" to="/payments">
                  Open
                </Link>
              ) : null}
            </div>
            <div className="dash-cash-list">
              {(data?.accounts ?? []).slice(0, 6).map((a) => (
                <div key={a.id} className="dash-cash-row">
                  <span>
                    <Wallet size={14} /> {a.name}
                    <small className="muted"> · {a.kind}</small>
                  </span>
                  <strong>{fmtMoney(a.openingBalance)}</strong>
                </div>
              ))}
              {!data?.accounts?.length ? (
                <div className="empty">No cash / bank accounts yet.</div>
              ) : null}
            </div>
          </div>
          ) : null}
        </div>
        ) : null}

        <div className="dash-split">
          <div className="panel">
            <div className="panel-head">
              <h2>To receive</h2>
              {canAccess("parties") ? (
                <Link className="btn btn-ghost" to="/parties">
                  Parties
                </Link>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recvPage.pageRows.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="money recv">{fmtMoney(p.computed)}</td>
                    </tr>
                  ))}
                  {!data?.topRecv?.length ? (
                    <tr>
                      <td colSpan={2}>
                        <div className="empty">No receivables.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <TablePagination pager={recvPage} />
          </div>

          {homeProfile !== "sales" ? (
          <div className="panel">
            <div className="panel-head">
              <h2>To pay</h2>
              {canAccess("parties") ? (
                <Link className="btn btn-ghost" to="/parties">
                  Parties
                </Link>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payPage.pageRows.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="money pay">{fmtMoney(Math.abs(p.computed))}</td>
                    </tr>
                  ))}
                  {!data?.topPay?.length ? (
                    <tr>
                      <td colSpan={2}>
                        <div className="empty">No payables.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <TablePagination pager={payPage} />
          </div>
          ) : null}
        </div>

        {homeProfile !== "sales" ? (
        <div className="dash-split">
          {showStockDeep && allowItems ? (
          <div className="panel">
            <div className="panel-head">
              <h2>
                <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                Low stock
              </h2>
              <Link className="btn btn-ghost" to="/items/products">
                Products
              </Link>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPage.pageRows.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td className={i.stockQty <= 0 ? "money pay" : ""}>
                        {i.stockQty} {i.unit}
                      </td>
                      <td className="money">{fmtMoney(i.stockQty * i.purchasePrice)}</td>
                    </tr>
                  ))}
                  {!data?.lowStock?.length ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty">No low-stock products (≤ {LOW_STOCK_QTY}).</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <TablePagination pager={stockPage} />
          </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h2>More tools</h2>
            </div>
            <div className="dash-tools">
              {canAccess("reports") ? (
                <Link to="/reports" className="dash-tool-link">
                  <BarChart3 size={16} /> Reports & GST
                </Link>
              ) : null}
              {canAccess("payments") ? (
                <Link to="/payments" className="dash-tool-link">
                  <Wallet size={16} /> Cash & Bank
                </Link>
              ) : null}
              {allowItems && homeProfile !== "accounts" ? (
                <Link to="/items/equipment" className="dash-tool-link">
                  <PackageCheck size={16} /> Equipment register
                </Link>
              ) : null}
              {canAccess("utilities") ? (
                <Link to="/utilities" className="dash-tool-link">
                  <Wrench size={16} /> Utilities
                </Link>
              ) : null}
              {showAdminTools ? (
                <Link to="/settings" className="dash-tool-link">
                  <ClipboardList size={16} /> Settings
                </Link>
              ) : null}
              {canAccess("roles") || canAccess("users") ? (
                <Link to="/settings?tab=roles" className="dash-tool-link">
                  <ClipboardList size={16} /> Roles & access
                </Link>
              ) : null}
            </div>
            {canAccess("payments") || showFinanceDeep ? (
            <div className="dash-money-flow">
              <div>
                <small>Payment In</small>
                <strong className="money recv">{fmtMoney(data?.summary.paymentInTotal ?? 0)}</strong>
              </div>
              <div>
                <small>Payment Out</small>
                <strong className="money pay">{fmtMoney(data?.summary.paymentOutTotal ?? 0)}</strong>
              </div>
            </div>
            ) : null}
          </div>
        </div>
        ) : null}

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
                  <th>Party</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPage.pageRows.map((t) => (
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
                    <td>{t.partyName || "—"}</td>
                    <td className="money">{fmtMoney(t.grandTotal)}</td>
                  </tr>
                ))}
                {!data?.recent?.length ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">No transactions yet. Click Add Sale to begin.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={recentPage} />
        </div>
      </div>
    </>
  );
}
