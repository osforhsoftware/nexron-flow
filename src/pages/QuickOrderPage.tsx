import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { prefersQuickOrder } from "../lib/roles";
import { useAsync } from "../lib/useAsync";

type Line = {
  key: string;
  itemId?: string;
  name: string;
  qty: string;
  rate: string;
  taxPercent: string;
};

function emptyLine(): Line {
  return {
    key: `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    qty: "1",
    rate: "",
    taxPercent: "0",
  };
}

export function QuickOrderPage() {
  const { company, session, canAccess } = useApp();
  const navigate = useNavigate();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);

  const allow =
    prefersQuickOrder(session) ||
    canAccess("new_invoice") ||
    canAccess("sales");

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: all } = await api.parties.list(companyId);
    return all.filter((p) => p.type !== "supplier");
  }, [companyId]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const { data: accounts } = useAsync(async () => {
    if (!companyId) return [];
    const { accounts: rows } = await api.payments.accounts(companyId);
    return rows;
  }, [companyId]);

  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [saleMode, setSaleMode] = useState<"cash" | "credit">("cash");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);

  const filteredParties = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    const rows = parties ?? [];
    if (!q) return rows.slice(0, 8);
    return rows.filter((p) => p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q)).slice(0, 8);
  }, [parties, partyQuery]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const l of lines) {
      const qty = Number(l.qty) || 0;
      const rate = Number(l.rate) || 0;
      const taxPercent = Number(l.taxPercent) || 0;
      const taxable = qty * rate;
      const taxAmt = (taxable * taxPercent) / 100;
      subtotal += taxable;
      taxTotal += taxAmt;
    }
    return { subtotal, taxTotal, grand: subtotal + taxTotal };
  }, [lines]);

  if (!allow) {
    return <Navigate to="/" replace />;
  }

  function pickParty(id: string, name: string) {
    setPartyId(id);
    setPartyQuery(name);
  }

  function pickItem(lineKey: string, itemId: string) {
    const item = (items ?? []).find((i) => i.id === itemId);
    if (!item) return;
    setLines((current) =>
      current.map((l) =>
        l.key === lineKey
          ? {
              ...l,
              itemId: item.id,
              name: item.name,
              rate: String(item.salePrice ?? item.purchasePrice ?? 0),
              taxPercent: String(item.taxPercent ?? 0),
            }
          : l,
      ),
    );
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (!companyId) return;
    setError(null);
    const valid = lines.filter((l) => l.name.trim() && (Number(l.qty) || 0) > 0);
    if (!valid.length) {
      setError("Add at least one item with quantity.");
      return;
    }
    if (!partyId && saleMode === "credit") {
      setError("Select a party for credit sales.");
      return;
    }

    setSaving(true);
    try {
      const { transactions } = await api.transactions.list(companyId, "sale");
      const nextNum = String((transactions?.length ?? 0) + 1).padStart(4, "0");
      const number = `SI-${nextNum}`;

      const lineRows = valid.map((l) => {
        const qty = Number(l.qty) || 0;
        const rate = Number(l.rate) || 0;
        const taxPercent = Number(l.taxPercent) || 0;
        const taxable = qty * rate;
        const amount = taxable + (taxable * taxPercent) / 100;
        return {
          itemId: l.itemId,
          name: l.name.trim(),
          qty,
          rate,
          taxPercent,
          amount,
        };
      });

      await api.transactions.create({
        companyId,
        type: "sale",
        number,
        date,
        partyId: partyId || undefined,
        paymentTypeId: saleMode === "cash" ? paymentTypeId || accounts?.[0]?.id : undefined,
        notes: [saleMode === "credit" ? "Credit sale" : "Cash sale", notes.trim() || undefined]
          .filter(Boolean)
          .join(" · "),
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grand,
        lines: lineRows,
      });

      setSavedNumber(number);
      setLines([emptyLine()]);
      setNotes("");
      setPartyId("");
      setPartyQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sale.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="topbar quick-order-topbar">
        <div className="quick-order-title">
          <button type="button" className="icon-button touch-target" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>Quick Order</h1>
            <p className="muted">Fast sale entry · {company?.name}</p>
          </div>
        </div>
        <Link className="btn btn-ghost touch-target" to="/sales">
          Full invoice
        </Link>
      </header>

      <div className="content quick-order-page">
        <div className="quick-order-mobile-toolbar">
          <p className="muted">Fast sale entry · {company?.name}</p>
          <Link className="btn btn-ghost touch-target" to="/sales">
            Full invoice
          </Link>
        </div>

        {savedNumber ? (
          <div className="quick-order-success">
            <Check size={18} />
            <div>
              <strong>Saved {savedNumber}</strong>
              <p className="muted">Ready for the next order.</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setSavedNumber(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        {error ? <div className="empty quick-order-error">{error}</div> : null}

        <section className="panel quick-order-card">
          <div className="panel-head">
            <h2>Party</h2>
            <div className="sale-mode-toggle" role="group" aria-label="Sale mode">
              <button
                type="button"
                className={saleMode === "cash" ? "active" : ""}
                onClick={() => setSaleMode("cash")}
              >
                Cash
              </button>
              <button
                type="button"
                className={saleMode === "credit" ? "active" : ""}
                onClick={() => setSaleMode("credit")}
              >
                Credit
              </button>
            </div>
          </div>
          <div className="quick-order-fields">
            <label className="field">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              Customer
              <input
                value={partyQuery}
                placeholder="Search party…"
                onChange={(e) => {
                  setPartyQuery(e.target.value);
                  setPartyId("");
                }}
              />
            </label>
            {partyQuery && !partyId ? (
              <div className="quick-order-suggest">
                {filteredParties.map((p) => (
                  <button key={p.id} type="button" onClick={() => pickParty(p.id, p.name)}>
                    <strong>{p.name}</strong>
                    <small>{p.phone || "No phone"}</small>
                  </button>
                ))}
                {!filteredParties.length ? <div className="muted">No matching parties</div> : null}
              </div>
            ) : null}
            {saleMode === "cash" && (accounts?.length ?? 0) > 0 ? (
              <label className="field">
                Receive in
                <select value={paymentTypeId} onChange={(e) => setPaymentTypeId(e.target.value)}>
                  <option value="">Default cash</option>
                  {accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>

        <section className="panel quick-order-card">
          <div className="panel-head">
            <h2>Items</h2>
            <button
              type="button"
              className="btn btn-ghost touch-target"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              <Plus size={14} /> Line
            </button>
          </div>
          <div className="quick-order-lines">
            {lines.map((line) => (
              <div className="quick-order-line" key={line.key}>
                <label className="field">
                  Item
                  <input
                    list={`items-${line.key}`}
                    value={line.name}
                    placeholder="Name or pick item"
                    onChange={(e) => updateLine(line.key, { name: e.target.value, itemId: undefined })}
                    onBlur={(e) => {
                      const match = (items ?? []).find(
                        (i) => i.name.toLowerCase() === e.target.value.trim().toLowerCase(),
                      );
                      if (match) pickItem(line.key, match.id);
                    }}
                  />
                  <datalist id={`items-${line.key}`}>
                    {(items ?? []).slice(0, 40).map((i) => (
                      <option key={i.id} value={i.name} />
                    ))}
                  </datalist>
                </label>
                <div className="quick-order-line-meta">
                  <label className="field">
                    Qty
                    <input
                      inputMode="decimal"
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Rate
                    <input
                      inputMode="decimal"
                      value={line.rate}
                      onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Tax %
                    <input
                      inputMode="decimal"
                      value={line.taxPercent}
                      onChange={(e) => updateLine(line.key, { taxPercent: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button touch-target"
                    aria-label="Remove line"
                    disabled={lines.length <= 1}
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <label className="field quick-order-notes">
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </label>

        <div className="quick-order-summary">
          <div>
            <small>Subtotal</small>
            <strong>{fmtMoney(totals.subtotal)}</strong>
          </div>
          <div>
            <small>Tax</small>
            <strong>{fmtMoney(totals.taxTotal)}</strong>
          </div>
          <div className="grand">
            <small>Total</small>
            <strong>{fmtMoney(totals.grand)}</strong>
          </div>
        </div>

        <div className="quick-order-actions">
          <button type="button" className="btn btn-primary touch-target" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save sale"}
          </button>
          <button
            type="button"
            className="btn btn-secondary touch-target"
            disabled={saving}
            onClick={() => {
              void save().then(() => {
                /* stay on page for next order — save() already resets */
              });
            }}
          >
            Save & next
          </button>
        </div>
      </div>
    </>
  );
}
