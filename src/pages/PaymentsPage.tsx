import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, Landmark, Plus, ReceiptText } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { PaymentKind, TxnType } from "../db/types";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { money, todayISO } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";

const CASH_VIEWS = [
  {
    id: "bank",
    label: "Bank Accounts",
    icon: Landmark,
    kinds: ["bank", "upi"] as PaymentKind[],
    defaultKind: "bank" as PaymentKind,
    title: "Bank Accounts",
    empty: "No bank accounts yet. Add one to track balances.",
  },
  {
    id: "cash",
    label: "Cash In Hand",
    icon: Banknote,
    kinds: ["cash"] as PaymentKind[],
    defaultKind: "cash" as PaymentKind,
    title: "Cash In Hand",
    empty: "No cash accounts yet. Add cash-in-hand to get started.",
  },
  {
    id: "cheque",
    label: "Cheques",
    icon: ReceiptText,
    kinds: ["cheque"] as PaymentKind[],
    defaultKind: "cheque" as PaymentKind,
    title: "Cheques",
    empty: "No cheque accounts yet.",
  },
  {
    id: "loan",
    label: "Loan Accounts",
    icon: Building2,
    kinds: ["loan", "other"] as PaymentKind[],
    defaultKind: "loan" as PaymentKind,
    title: "Loan Accounts",
    empty: "No loan accounts yet.",
  },
] as const;

export function PaymentsPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewIndex = Math.min(
    Math.max(Number(searchParams.get("view") || "0") || 0, 0),
    CASH_VIEWS.length - 1,
  );
  const view = CASH_VIEWS[viewIndex];

  const [openAccount, setOpenAccount] = useState(() => searchParams.get("create") === "1");
  const [openTxn, setOpenTxn] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountKind, setAccountKind] = useState<PaymentKind>(view.defaultKind);
  const [opening, setOpening] = useState("0");

  const [txnType, setTxnType] = useState<"payment_in" | "payment_out">("payment_in");
  const [partyId, setPartyId] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");

  const { data: accounts, reload: reloadAccounts } = useAsync(async () => {
    if (!companyId) return [];
    const { accounts: rows } = await api.payments.accounts(companyId);
    return rows;
  }, [companyId]);

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: rows } = await api.parties.list(companyId);
    return rows;
  }, [companyId]);

  const { data: moneyTxns, reload: reloadTxns } = useAsync(async () => {
    if (!companyId) return [];
    const { transactions } = await api.transactions.list(companyId);
    return transactions
      .filter((t) => ["payment_in", "payment_out", "sale", "purchase"].includes(t.type))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [companyId]);

  const balances = useMemo(() => {
    return (accounts ?? []).map((acc) => {
      let bal = acc.openingBalance;
      for (const t of moneyTxns ?? []) {
        if (t.paymentTypeId !== acc.id) continue;
        if (t.type === "sale" || t.type === "payment_in") bal += t.grandTotal;
        if (t.type === "purchase" || t.type === "payment_out") bal -= t.grandTotal;
      }
      return { ...acc, balance: bal };
    });
  }, [accounts, moneyTxns]);

  const filteredBalances = useMemo(
    () => balances.filter((acc) => view.kinds.includes(acc.kind)),
    [balances, view],
  );

  const filteredAccountIds = useMemo(
    () => new Set(filteredBalances.map((acc) => acc.id)),
    [filteredBalances],
  );

  const filteredTxns = useMemo(
    () => (moneyTxns ?? []).filter((t) => t.paymentTypeId && filteredAccountIds.has(t.paymentTypeId)),
    [moneyTxns, filteredAccountIds],
  );

  useEffect(() => {
    setAccountKind(view.defaultKind);
  }, [view.defaultKind]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setAccountKind(view.defaultKind);
      setOpenAccount(true);
    }
  }, [searchParams, view.defaultKind]);

  function setView(index: number, create = false) {
    const params = new URLSearchParams();
    if (index) params.set("view", String(index));
    if (create) params.set("create", "1");
    const qs = params.toString();
    navigate(qs ? `/payments?${qs}` : "/payments");
  }

  function openAddAccount(index = viewIndex) {
    setAccountName("");
    setOpening("0");
    setAccountKind(CASH_VIEWS[index].defaultKind);
    setOpenAccount(true);
    setView(index, true);
  }

  function closeAccountModal() {
    setOpenAccount(false);
    const params = new URLSearchParams(searchParams);
    if (params.has("create")) {
      params.delete("create");
      const qs = params.toString();
      navigate(qs ? `/payments?${qs}` : "/payments", { replace: true });
    }
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    await api.payments.createAccount({
      companyId,
      name: accountName.trim(),
      kind: accountKind,
      openingBalance: Number(opening) || 0,
    });
    reloadAccounts();
    closeAccountModal();
    setAccountName("");
    setOpening("0");
  }

  async function saveTxn(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !partyId || !paymentTypeId) return;
    const grandTotal = Number(amount) || 0;
    if (grandTotal <= 0) return;
    const { transactions } = await api.transactions.list(companyId, txnType);
    const count = transactions.length + 1;
    const number = txnType === "payment_in" ? `RCPT-${200 + count}` : `PAY-${300 + count}`;
    await api.transactions.create({
      companyId,
      type: txnType as TxnType,
      number,
      date,
      partyId,
      paymentTypeId,
      notes: notes.trim() || undefined,
      subtotal: grandTotal,
      taxTotal: 0,
      grandTotal,
    });
    reloadTxns();
    setOpenTxn(false);
    setAmount("");
    setNotes("");
  }

  const accountOptions = filteredBalances.length ? filteredBalances : balances;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Cash &amp; Bank</h1>
          <p className="muted">{view.title} · payment-in / payment-out</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" type="button" onClick={() => openAddAccount()}>
            <Plus size={14} /> Add Account
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setPartyId(parties?.[0]?.id ?? "");
              setPaymentTypeId(accountOptions[0]?.id ?? accounts?.[0]?.id ?? "");
              setOpenTxn(true);
            }}
          >
            <Plus size={14} /> Add Payment
          </button>
        </div>
      </header>

      <div className="content cash-layout">
        <aside className="cash-nav">
          {CASH_VIEWS.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className={`cash-nav-row${index === viewIndex ? " active" : ""}`}>
                <button type="button" onClick={() => setView(index)}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
                <button
                  type="button"
                  className="cash-nav-add"
                  title={`Add ${item.label}`}
                  aria-label={`Add ${item.label}`}
                  onClick={() => openAddAccount(index)}
                >
                  <Plus size={12} />
                </button>
              </div>
            );
          })}
        </aside>
        <main className="cash-main">
          <div className="stat-row">
            {filteredBalances.length ? (
              filteredBalances.map((acc) => (
                <div className="stat" key={acc.id}>
                  <small>
                    {acc.name} · {acc.kind}
                  </small>
                  <strong>{fmtMoney(acc.balance)}</strong>
                </div>
              ))
            ) : (
              <div className="stat">
                <small>{view.title}</small>
                <strong className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                  {view.empty}
                </strong>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{view.title} Transactions</h2>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Type</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.length ? (
                    filteredTxns.slice(0, 20).map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>{t.number}</td>
                        <td>
                          <span className="badge badge-muted">{t.type.replace("_", " ")}</span>
                        </td>
                        <td className="money">{fmtMoney(t.grandTotal)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        No transactions for {view.label.toLowerCase()} yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {openAccount ? (
        <Modal
          title={`Add ${view.label}`}
          onClose={closeAccountModal}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={closeAccountModal}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="acc-form">
                Save
              </button>
            </>
          }
        >
          <form id="acc-form" className="form-grid" onSubmit={saveAccount}>
            <label className="field">
              Name
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Kind
              <select
                value={accountKind}
                onChange={(e) => setAccountKind(e.target.value as PaymentKind)}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="loan">Loan</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field full">
              Opening balance
              <input
                type="number"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
            </label>
            <label className="field">
              As of date
              <input type="date" defaultValue={todayISO()} />
            </label>
            <label className="setting-check full">
              <input type="checkbox" /> Print offline UPI QR on invoices
            </label>
            <label className="setting-check full">
              <input type="checkbox" /> Print bank details on invoices
            </label>
            <div className="bank-promo full">
              <strong>Accept Payments Online</strong>
              <span>Link UPI, cards and net banking to collect payments.</span>
            </div>
          </form>
        </Modal>
      ) : null}

      {openTxn ? (
        <Modal
          title="Record payment"
          onClose={() => setOpenTxn(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setOpenTxn(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="pay-form">
                Save
              </button>
            </>
          }
        >
          <form id="pay-form" className="form-grid" onSubmit={saveTxn}>
            <label className="field">
              Type
              <select
                value={txnType}
                onChange={(e) => setTxnType(e.target.value as "payment_in" | "payment_out")}
              >
                <option value="payment_in">Payment in (receipt)</option>
                <option value="payment_out">Payment out</option>
              </select>
            </label>
            <label className="field">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              Party
              <select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                {(parties ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Account
              <select
                value={paymentTypeId}
                onChange={(e) => setPaymentTypeId(e.target.value)}
                required
              >
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Amount
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
