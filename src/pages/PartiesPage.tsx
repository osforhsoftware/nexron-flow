import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { api } from "../lib/api";
import { PARTY_TYPE_OPTIONS, partyTypeLabel, type Party } from "../db/types";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { emptyPartyForm, partyPayloadFromForm, partyToForm } from "../lib/partyForm";
import { partyBalances } from "../lib/reports";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";
import { PartyFormFields } from "../components/PartyFormFields";
import { TablePagination, usePagedRows } from "../components/TablePagination";

export function PartiesPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "to_receive" | "to_pay" | "settled">(
    "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState(emptyPartyForm());

  const { data: parties, reload } = useAsync(async () => {
    if (!companyId) return [];
    return partyBalances(companyId);
  }, [companyId]);

  const typeOptions = useMemo(() => {
    const seen = new Set<string>(PARTY_TYPE_OPTIONS.map((o) => o.value));
    const extras: { value: string; label: string }[] = [];
    for (const p of parties ?? []) {
      if (!seen.has(p.type)) {
        seen.add(p.type);
        extras.push({ value: p.type, label: partyTypeLabel(p.type, p.typeOther) });
      }
    }
    return [...PARTY_TYPE_OPTIONS, ...extras];
  }, [parties]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (parties ?? []).filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (balanceFilter === "to_receive" && p.computed <= 0) return false;
      if (balanceFilter === "to_pay" && p.computed >= 0) return false;
      if (balanceFilter === "settled" && p.computed !== 0) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.phone?.includes(term) ||
        p.type.includes(term) ||
        partyTypeLabel(p.type, p.typeOther).toLowerCase().includes(term)
      );
    });
  }, [parties, q, typeFilter, balanceFilter]);

  const partyPage = usePagedRows(filtered, `${q}|${typeFilter}|${balanceFilter}`);

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

  const txnPage = usePagedRows(txns, selectedPartyId ?? "");

  function openCreate() {
    setEditing(null);
    setForm(emptyPartyForm({ country: company?.country ?? "" }));
    setOpen(true);
  }

  function openEdit(p: Party) {
    setEditing(p);
    setForm(partyToForm(p));
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const payload = partyPayloadFromForm(form);
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
              <div className="party-filter-row">
                <label className="filter-pill sale-filter-select">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    aria-label="Party type filter"
                  >
                    <option value="">All Types</option>
                    {typeOptions.map((opt) => (
                      <option value={opt.value} key={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
                <label className="filter-pill sale-filter-select">
                  <select
                    value={balanceFilter}
                    onChange={(e) => setBalanceFilter(e.target.value as typeof balanceFilter)}
                    aria-label="Balance filter"
                  >
                    <option value="all">All Balances</option>
                    <option value="to_receive">To Receive</option>
                    <option value="to_pay">To Pay</option>
                    <option value="settled">Settled</option>
                  </select>
                  <ChevronDown size={13} />
                </label>
              </div>
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {partyPage.pageRows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`party-row${selected?.id === p.id ? " active" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <strong>{p.name}</strong>
                  <div className="meta">
                    <span>{partyTypeLabel(p.type, p.typeOther)}</span>
                    <span className={`money ${p.computed >= 0 ? "recv" : "pay"}`}>
                      {fmtMoney(Math.abs(p.computed))}
                    </span>
                  </div>
                </button>
              ))}
              {!filtered.length ? <div className="empty">No parties found</div> : null}
            </div>
            <TablePagination pager={partyPage} />
          </div>

          <div className="party-detail-pane">
            {selected ? (
              <>
                <div className="detail-title">
                  <div>
                    <h2 style={{ fontSize: 18 }}>{selected.name}</h2>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {selected.phone || "No phone"} ·{" "}
                      {partyTypeLabel(selected.type, selected.typeOther)}
                      {selected.contactPerson ? ` · ${selected.contactPerson}` : ""}
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

                <div className="panel" style={{ marginBottom: 12 }}>
                  <div className="panel-head">
                    <h2>Details</h2>
                  </div>
                  <div className="party-detail-meta">
                    {selected.email ? <p>Email: {selected.email}</p> : null}
                    {selected.city || selected.country ? (
                      <p>
                        {[selected.city, selected.country].filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                    {selected.licenseGst || selected.gstin ? (
                      <p>License / GST: {selected.licenseGst || selected.gstin}</p>
                    ) : null}
                    {selected.address ? <p>Address: {selected.address}</p> : null}
                    {selected.notes ? <p>Note: {selected.notes}</p> : null}
                    {(selected.additionalFields ?? []).map((f) => (
                      <p key={f.label}>
                        {f.label}: {f.value}
                      </p>
                    ))}
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
                        {txnPage.pageRows.map((t) => (
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
                  <TablePagination pager={txnPage} />
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
          className="modal-party"
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
            <PartyFormFields form={form} onChange={setForm} />
          </form>
        </Modal>
      ) : null}
    </>
  );
}
