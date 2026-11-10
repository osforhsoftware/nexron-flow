import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { partyLedger, profitAndLossLite, salesSummary } from "../lib/reports";
import { useAsync } from "../lib/useAsync";

const reportGroups = [
  {
    title: "Transaction report",
    items: [
      "Sale",
      "Purchase",
      "Day book",
      "All Transactions",
      "Profit And Loss",
      "Bill Wise Profit",
      "Cash flow",
      "Trial Balance Report",
      "Balance Sheet",
    ],
  },
  {
    title: "Party report",
    items: [
      "Party Statement",
      "Party wise Profit & Loss",
      "All parties",
      "Party Report By Item",
      "Sale Purchase By Party",
      "Sale Purchase By Party Group",
    ],
  },
  {
    title: "GST reports",
    items: ["GSTR 1", "GSTR 2", "GSTR 3 B", "GSTR 9", "Sale Summary By HSN"],
  },
  {
    title: "Item / Stock report",
    items: ["Stock Summary", "Item Report", "Low Stock Summary", "Stock Detail"],
  },
];

type PnlView = "ledgerly" | "accounting";
type GstrErrorTab = "total" | "business" | "item" | "party" | "invoice";

const gstrSections = [
  "B2B",
  "B2C (Large)",
  "B2C (Small)",
  "Credit / Debit Notes (Registered)",
  "Credit / Debit Notes (Unregistered)",
  "Export Invoices",
  "Tax Liability (Advances Received)",
  "Adjustment of Advances",
  "Nil Rated Invoices",
  "HSN Wise Summary",
  "Document Issued",
];

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split("-");
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

export function ReportsPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);
  const [partyId, setPartyId] = useState("");
  const [selectedReport, setSelectedReport] = useState("Profit And Loss");
  const [pnlView, setPnlView] = useState<PnlView>("ledgerly");
  const [gstrFilter, setGstrFilter] = useState("Last Month");
  const [removeEinvoice, setRemoveEinvoice] = useState(false);
  const [nonTaxExempted, setNonTaxExempted] = useState(false);
  const [errorReviewOpen, setErrorReviewOpen] = useState(false);
  const [errorTab, setErrorTab] = useState<GstrErrorTab>("party");
  const [treatEmptyIntra, setTreatEmptyIntra] = useState(true);

  const thisMonth = useMemo(() => monthBounds(0), []);
  const lastMonth = useMemo(() => monthBounds(-1), []);
  const dateRange = gstrFilter === "This Month" ? thisMonth : lastMonth;

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: rows } = await api.parties.list(companyId);
    return rows;
  }, [companyId]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const { data: report } = useAsync(async () => {
    if (!companyId) return null;
    const [sales, pnl, partyRows] = await Promise.all([
      salesSummary(companyId),
      profitAndLossLite(companyId),
      api.parties.list(companyId).then((r) => r.parties),
    ]);
    const ledgerParty = partyId || partyRows[0]?.id || "";
    const ledger = ledgerParty ? await partyLedger(companyId, ledgerParty) : null;
    return { sales, pnl, ledger, ledgerParty };
  }, [companyId, partyId]);

  const businessErrors = useMemo(() => {
    const issues: string[] = [];
    if (!company?.name?.trim()) issues.push("Business name is missing");
    if (!company?.gstin?.trim()) {
      issues.push(company?.country === "IN" ? "GSTIN is missing" : "TRN is missing");
    }
    if (!company?.address?.trim()) issues.push("Business address is missing");
    if (!company?.state?.trim()) issues.push("Business state is missing");
    return issues;
  }, [company]);

  const itemErrors = useMemo(() => {
    return (items ?? [])
      .filter((item) => !item.name?.trim() || item.taxPercent == null)
      .map((item) => `${item.name || "Unnamed item"} needs tax / name details`);
  }, [items]);

  const partyErrors = useMemo(() => {
    return (parties ?? [])
      .filter((p) => p.gstin && p.gstin.length > 0 && p.gstin.length !== 15)
      .map((p) => `${p.name}: invalid GSTIN`);
  }, [parties]);

  const invoiceErrors: string[] = [];

  const errorCounts = {
    business: businessErrors.length,
    item: itemErrors.length,
    party: partyErrors.length,
    invoice: invoiceErrors.length,
  };
  const totalErrors =
    errorCounts.business + errorCounts.item + errorCounts.party + errorCounts.invoice;

  const selectedPartyId = partyId || report?.ledgerParty || "";
  const statementMode = selectedReport === "Party Statement";
  const rows = statementMode ? (report?.ledger?.rows ?? []) : (report?.sales.sales ?? []);

  const pnl = report?.pnl;
  const pnlRows = [
    { label: "Sale (+)", amount: pnl?.revenue ?? 0, indent: 0 },
    { label: "Credit Note (-)", amount: 0, indent: 0 },
    { label: "Sale FA (+)", amount: 0, indent: 0 },
    { label: "Purchase (-)", amount: pnl?.cogs ?? 0, indent: 0 },
    { label: "Debit Note (+)", amount: 0, indent: 0 },
    { label: "Purchase FA (-)", amount: 0, indent: 0 },
    { label: "Direct Expenses (-)", amount: 0, indent: 0, bold: true },
    { label: "Other Direct Expenses (-)", amount: 0, indent: 1 },
    { label: "Payment-in Discount (-)", amount: 0, indent: 1 },
    { label: "Tax Payable (-)", amount: pnl?.salesTax ?? 0, indent: 0, bold: true },
    { label: "GST Payable (-)", amount: pnl?.salesTax ?? 0, indent: 1 },
    { label: "TCS Payable (-)", amount: 0, indent: 1 },
    { label: "TDS Payable (-)", amount: 0, indent: 1 },
    { label: "Tax Receivable (+)", amount: pnl?.purchaseTax ?? 0, indent: 0, bold: true },
    { label: "GST Receivable (+)", amount: pnl?.purchaseTax ?? 0, indent: 1 },
    { label: "TCS Receivable (+)", amount: 0, indent: 1 },
    { label: "TDS Receivable (+)", amount: 0, indent: 1 },
    { label: "Opening Stock (-)", amount: 0, indent: 0 },
    { label: "Closing Stock (+)", amount: 0, indent: 0 },
  ];

  const netProfit =
    (pnl?.revenue ?? 0) -
    (pnl?.cogs ?? 0) -
    (pnl?.salesTax ?? 0) +
    (pnl?.purchaseTax ?? 0);

  function openErrorReview(tab: GstrErrorTab = "total") {
    setErrorTab(tab);
    setErrorReviewOpen(true);
  }

  function renderGenericTransactions() {
    return (
      <>
        <div className="report-summary">
          <small>{selectedReport} Amount</small>
          <strong>{fmtMoney(statementMode ? report?.ledger?.closingBalance ?? 0 : report?.sales.salesTotal ?? 0)}</strong>
          <span>
            Received: {fmtMoney(0)} &nbsp; | &nbsp; Balance: {fmtMoney(report?.sales.salesTotal ?? 0)}
          </span>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Transactions</h2>
            <div className="report-tools">
              <Search size={14} />
              <Download size={14} />
              <Printer size={14} />
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice No.</th>
                  <th>Party Name</th>
                  <th>Transaction</th>
                  <th>Payment Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.number}</td>
                    <td>
                      {statementMode
                        ? parties?.find((p) => p.id === selectedPartyId)?.name
                        : "Customer"}
                    </td>
                    <td>{row.type.replace("_", " ")}</td>
                    <td>Cash</td>
                    <td className="money">{fmtMoney(row.grandTotal)}</td>
                    <td className="money">
                      {fmtMoney("runningBalance" in row ? Number(row.runningBalance) : row.grandTotal)}
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">No transactions to show</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  function renderProfitAndLoss() {
    return (
      <div className="pnl-report">
        <div className="pnl-toolbar">
          <div className="pnl-dates">
            <span>From</span>
            <strong>{formatDisplayDate(thisMonth.from)}</strong>
            <span>To</span>
            <strong>{formatDisplayDate(thisMonth.to)}</strong>
          </div>
          <div className="report-tools">
            <button type="button" title="Excel" className="icon-tool">
              <FileSpreadsheet size={16} />
            </button>
            <button type="button" title="Print" className="icon-tool">
              <Printer size={16} />
            </button>
          </div>
        </div>

        <h2 className="pnl-title">PROFIT AND LOSS REPORT</h2>

        <div className="pnl-view-toggle">
          <span>View:</span>
          <label>
            <input
              type="radio"
              name="pnl-view"
              checked={pnlView === "ledgerly"}
              onChange={() => setPnlView("ledgerly")}
            />
            NEXRON
          </label>
          <label>
            <input
              type="radio"
              name="pnl-view"
              checked={pnlView === "accounting"}
              onChange={() => setPnlView("accounting")}
            />
            Accounting
          </label>
        </div>

        <div className="pnl-table-wrap">
          <table className="pnl-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((row) => (
                <tr key={row.label} className={row.bold ? "pnl-group" : undefined}>
                  <td style={{ paddingLeft: `${14 + row.indent * 22}px` }}>{row.label}</td>
                  <td className="money">{fmtMoney(row.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{pnlView === "ledgerly" ? "Net Profit" : "Net Profit / (Loss)"}</td>
                <td className="money">{fmtMoney(netProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  function renderGstr1() {
    return (
      <div className="gstr-report">
        <div className="gstr-toolbar">
          <div className="gstr-filters">
            <span className="filter-label">Filter by :</span>
            <select value={gstrFilter} onChange={(e) => setGstrFilter(e.target.value)}>
              <option>Last Month</option>
              <option>This Month</option>
              <option>This Quarter</option>
              <option>This Year</option>
              <option>Custom</option>
            </select>
            <span className="date-pill gstr-dates">
              {formatDisplayDate(dateRange.from)} &nbsp; To &nbsp; {formatDisplayDate(dateRange.to)}
            </span>
            <label className="gstr-check">
              <input
                type="checkbox"
                checked={removeEinvoice}
                onChange={(e) => setRemoveEinvoice(e.target.checked)}
              />
              Remove e-invoice txn from report
            </label>
            <label className="gstr-check">
              <input
                type="checkbox"
                checked={nonTaxExempted}
                onChange={(e) => setNonTaxExempted(e.target.checked)}
              />
              Consider non-tax as exempted
            </label>
          </div>
          <div className="report-tools">
            <button type="button" className="icon-tool" title="PDF">
              <FileText size={16} />
            </button>
            <button type="button" className="icon-tool" title="Excel">
              <FileSpreadsheet size={16} />
            </button>
            <button type="button" className="icon-tool" title="Print">
              <Printer size={16} />
            </button>
          </div>
        </div>

        <div className="gstr-errors-bar">
          <strong>GSTR Errors</strong>
          <button type="button" className="gstr-error-chip danger" onClick={() => openErrorReview("business")}>
            <AlertCircle size={13} />
            Business
            <em>{errorCounts.business}</em>
          </button>
          <button
            type="button"
            className={`gstr-error-chip ${errorCounts.item ? "danger" : "ok"}`}
            onClick={() => openErrorReview("item")}
          >
            {errorCounts.item ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
            Item
            {errorCounts.item ? <em>{errorCounts.item}</em> : null}
          </button>
          <button
            type="button"
            className={`gstr-error-chip ${errorCounts.party ? "danger" : "ok"}`}
            onClick={() => openErrorReview("party")}
          >
            {errorCounts.party ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
            Party
            {errorCounts.party ? <em>{errorCounts.party}</em> : null}
          </button>
          <button
            type="button"
            className={`gstr-error-chip ${errorCounts.invoice ? "danger" : "ok"}`}
            onClick={() => openErrorReview("invoice")}
          >
            {errorCounts.invoice ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
            Invoice
            {errorCounts.invoice ? <em>{errorCounts.invoice}</em> : null}
          </button>
          <button type="button" className="btn btn-ghost gstr-review-btn" onClick={() => openErrorReview("total")}>
            Review all
          </button>
        </div>

        <div className="gstr-table-wrap">
          <table className="gstr-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>No. of Records</th>
                <th>Total Taxable Value</th>
                <th>Total Integrated Value</th>
                <th>Total Central Tax Value</th>
                <th>Total State/UT Tax Value</th>
                <th>Total Cess</th>
              </tr>
            </thead>
            <tbody>
              {gstrSections.map((section) => (
                <tr key={section}>
                  <td>{section}</td>
                  <td>0</td>
                  <td className="money">{fmtMoney(0)}</td>
                  <td className="money">{fmtMoney(0)}</td>
                  <td className="money">{fmtMoney(0)}</td>
                  <td className="money">{fmtMoney(0)}</td>
                  <td className="money">{fmtMoney(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function activeErrorList() {
    if (errorTab === "business") return businessErrors;
    if (errorTab === "item") return itemErrors;
    if (errorTab === "party") return partyErrors;
    if (errorTab === "invoice") return invoiceErrors;
    return [
      ...businessErrors.map((e) => `Business: ${e}`),
      ...itemErrors.map((e) => `Item: ${e}`),
      ...partyErrors.map((e) => `Party: ${e}`),
      ...invoiceErrors.map((e) => `Invoice: ${e}`),
    ];
  }

  function errorTabTitle() {
    if (errorTab === "total") return "Total Errors";
    if (errorTab === "business") return "Business Details";
    if (errorTab === "item") return "Item Errors";
    if (errorTab === "party") return "Party Errors";
    return "Invoice Errors";
  }

  function renderErrorReview() {
    const list = activeErrorList();
    const countFor = (tab: GstrErrorTab) => {
      if (tab === "total") return totalErrors;
      return errorCounts[tab];
    };

    return (
      <div className="gstr-error-review">
        <header className="gstr-error-head">
          <button type="button" className="icon-tool" onClick={() => setErrorReviewOpen(false)}>
            <ArrowLeft size={18} />
          </button>
          <h1>GSTR1 Error Review</h1>
        </header>

        <div className="gstr-error-body">
          <aside className="gstr-error-nav">
            {(
              [
                ["total", "Total Errors"],
                ["business", "Business Details"],
                ["item", "Item Errors"],
                ["party", "Party Errors"],
                ["invoice", "Invoice Errors"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={errorTab === key ? "active" : ""}
                onClick={() => setErrorTab(key)}
              >
                <span>{label}</span>
                <em className={countFor(key) ? "has-error" : ""}>{countFor(key)}</em>
              </button>
            ))}
          </aside>

          <section className="gstr-error-panel">
            <div className="gstr-error-panel-head">
              <h2>{errorTabTitle()}</h2>
              {errorTab === "party" ? (
                <label className="gstr-check">
                  <input
                    type="checkbox"
                    checked={treatEmptyIntra}
                    onChange={(e) => setTreatEmptyIntra(e.target.checked)}
                  />
                  Treat empty state as Intra-state
                </label>
              ) : null}
            </div>

            {list.length ? (
              <ul className="gstr-error-list">
                {list.map((issue) => (
                  <li key={issue}>
                    <AlertCircle size={15} />
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="gstr-error-empty">
                <div className="gstr-error-empty-art">
                  <FileText size={42} strokeWidth={1.25} />
                  <CheckCircle2 size={22} className="ok-badge" />
                </div>
                <h3>
                  {errorTab === "total"
                    ? "No errors"
                    : errorTab === "business"
                      ? "No business errors"
                      : errorTab === "item"
                        ? "No item errors"
                        : errorTab === "party"
                          ? "No party errors"
                          : "No invoice errors"}
                </h3>
                <p>This section is clean — check the remaining sections.</p>
              </div>
            )}
          </section>
        </div>

        <footer className="gstr-error-footer">
          <button type="button" className="btn" onClick={() => setErrorReviewOpen(false)}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setErrorReviewOpen(false)}
          >
            Save Changes
          </button>
        </footer>
      </div>
    );
  }

  if (errorReviewOpen) {
    return renderErrorReview();
  }

  return (
    <div className="reports-shell">
      <aside className="report-nav">
        {reportGroups.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            {group.items.map((item) => (
              <button
                className={selectedReport === item ? "active" : ""}
                type="button"
                key={item}
                onClick={() => setSelectedReport(item)}
              >
                {item}
              </button>
            ))}
          </section>
        ))}
      </aside>

      <main className="report-main">
        <header className="topbar">
          <h1>
            {selectedReport === "Sale"
              ? "Sale Invoices"
              : selectedReport === "GSTR 1"
                ? "GSTR1"
                : selectedReport === "Profit And Loss"
                  ? "Profit And Loss"
                  : selectedReport}
          </h1>
          {selectedReport !== "Profit And Loss" && selectedReport !== "GSTR 1" ? (
            <button className="btn btn-primary" type="button">
              + Add Sale
            </button>
          ) : null}
        </header>

        {selectedReport === "Party Statement" ? (
          <div className="filter-bar">
            <span className="filter-label">Filter by :</span>
            <select value={selectedPartyId} onChange={(e) => setPartyId(e.target.value)}>
              {(parties ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="content report-content">
          {selectedReport === "Profit And Loss"
            ? renderProfitAndLoss()
            : selectedReport === "GSTR 1"
              ? renderGstr1()
              : renderGenericTransactions()}
        </div>
      </main>
    </div>
  );
}
