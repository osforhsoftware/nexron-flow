import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import type { Party, PartyType } from "../db/types";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { originOf } from "../lib/companyLocale";
import { partyBalances } from "../lib/reports";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  gstin: "",
  type: "customer" as PartyType,
  openingBalance: "0",
  balanceType: "to_receive" as "to_receive" | "to_pay",
  address: "",
};

export function PartiesPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const origin = originOf(company?.country);
  const fmtMoney = (n: number) => money(n, company?.currency);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: parties, reload } = useAsync(async () => {
    if (!companyId) return [];
    return partyBalances(companyId);
  }, [companyId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (parties ?? []).filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.phone?.includes(term) ||
        p.type.includes(term),
    );
  }, [parties, q]);

  const selected =
    filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  const selectedPartyId = selected?.id;
  const { data: txns } = useAsync(async () => {
    if (!companyId || !selectedPartyId) return [];
    const { transactions } = await api.transactions.list(companyId);
    return transactions
      .filter((t) => t.partyId === selectedPartyId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [companyId, selectedPartyId]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: Party) {
    setEditing(p);
    setForm({
      name: p.name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      gstin: p.gstin ?? "",
      type: p.type,
      openingBalance: String(p.openingBalance),
      balanceType: p.balanceType,
      address: p.address ?? "",
    });
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      type: form.type,
      openingBalance: Number(form.openingBalance) || 0,
      balanceType: form.balanceType,
      address: form.address.trim() || undefined,
    };
    if (editing) {
      await api.parties.update(editing.id, payload);
    } else {
      const { party } = await api.parties.create({
        companyId,
        ...payload,
      });
      setSelectedId(party.id);
    }
    setOpen(false);
    reload();
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Parties</h1>
          <p className="muted">Customers &amp; suppliers · party details</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> Add Party
          </button>
        </div>
      </header>

      <div className="content">
        <div className="split-parties">
          <div className="party-list-pane">
            <div className="pane-search">
              <input
                className="search"
                style={{ maxWidth: "none", width: "100%" }}
                placeholder="Search parties…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`party-row${selected?.id === p.id ? " active" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <strong>{p.name}</strong>
                  <div className="meta">
                    <span>{p.type}</span>
                    <span className={`money ${p.computed >= 0 ? "recv" : "pay"}`}>
                      {fmtMoney(Math.abs(p.computed))}
                    </span>
                  </div>
                </button>
              ))}
              {!filtered.length ? <div className="empty">No parties found</div> : null}
            </div>
          </div>

          <div className="party-detail-pane">
            {selected ? (
              <>
                <div className="detail-title">
                  <div>
                    <h2 style={{ fontSize: 18 }}>{selected.name}</h2>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {selected.phone || "No phone"} · {selected.type}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {selected.computed >= 0 ? "To Receive" : "To Pay"}
                    </div>
                    <div
                      className={`money ${selected.computed >= 0 ? "recv" : "pay"}`}
                      style={{ fontSize: 22 }}
                    >
                      {fmtMoney(Math.abs(selected.computed))}
                    </div>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ marginTop: 8 }}
                      onClick={() => openEdit(selected)}
                    >
                      Edit Party
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h2>Transactions</h2>
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
                        {(txns ?? []).map((t) => (
                          <tr key={t.id}>
                            <td>{t.date}</td>
                            <td>{t.type.replace("_", " ")}</td>
                            <td>{t.number}</td>
                            <td className="money">{fmtMoney(t.grandTotal)}</td>
                          </tr>
                        ))}
                        {!txns?.length ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="empty">No transactions for this party</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty">Select a party or add your first party</div>
            )}
          </div>
        </div>
      </div>

      {open ? (
        <Modal
          title={editing ? "Edit Party" : "Add Party"}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-secondary" type="submit" form="party-form">
                Save
              </button>
            </>
          }
        >
          <form id="party-form" onSubmit={save}>
            <div className="party-quick-fields">
            <label className="field">
              Party Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="field">
              {origin.taxIdLabel}
              <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </label>
            <label className="field">
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            </div>
            <div className="tabs party-tabs">
              <button className="tab active" type="button">{origin.code === "AE" ? "VAT" : "GST"} &amp; Address</button>
              <button className="tab" type="button">Credit &amp; Balance <span className="new-badge">New</span></button>
              <button className="tab" type="button">Additional Fields</button>
            </div>
            <div className="party-modal-body form-grid">
            <label className="field">
              {origin.code === "AE" ? "VAT" : "GST"} Type
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as PartyType })}
              >
                <option value="customer">Unregistered / Consumer</option>
                <option value="supplier">Registered Business</option>
                <option value="both">Both Customer &amp; Supplier</option>
              </select>
            </label>
            <label className="field">
              Email
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field">
              Opening Balance
              <input
                type="number"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
              />
            </label>
            <label className="field">
              Balance Type
              <select
                value={form.balanceType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    balanceType: e.target.value as "to_receive" | "to_pay",
                  })
                }
              >
                <option value="to_receive">To Receive</option>
                <option value="to_pay">To Pay</option>
              </select>
            </label>
            <label className="field full">
              Billing Address
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <div className="shipping-address">
              <strong>Shipping Address</strong>
              <button className="link-button" type="button">+ Enable Shipping Address</button>
            </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
