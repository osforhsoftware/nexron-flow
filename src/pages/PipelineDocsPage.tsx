import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRightLeft, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { inr, todayISO } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";

export type PipelineDocType = "quotation" | "sale_order" | "delivery" | "purchase_order";

const META: Record<
  PipelineDocType,
  { title: string; nextLabel: string; nextType: string }
> = {
  quotation: { title: "Estimate / Quotation", nextLabel: "Convert to Sale Order", nextType: "sale_order" },
  sale_order: { title: "Sale Order", nextLabel: "Convert to Delivery", nextType: "delivery" },
  delivery: { title: "Delivery Challan", nextLabel: "Convert to Sale Invoice", nextType: "sale" },
  purchase_order: { title: "Purchase Order", nextLabel: "Convert to Purchase Bill", nextType: "purchase" },
};

type DraftLine = {
  key: string;
  itemId: string;
  name: string;
  qty: string;
  rate: string;
  taxPercent: string;
};

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID().slice(0, 8),
    itemId: "",
    name: "",
    qty: "1",
    rate: "0",
    taxPercent: "18",
  };
}

export function PipelineDocsPage({ docType }: { docType: PipelineDocType }) {
  const { company } = useApp();
  const companyId = company?.id;
  const meta = META[docType];
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: docs, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { docs: rows } = await api.docs.list(companyId, docType);
    return rows;
  }, [companyId, docType]);

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: rows } = await api.parties.list(companyId);
    return rows.filter((p) =>
      docType === "purchase_order" ? p.type !== "customer" : p.type !== "supplier",
    );
  }, [companyId, docType]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const partyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parties ?? []) map.set(p.id, p.name);
    return map;
  }, [parties]);

  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of lines) {
      const qty = Number(line.qty) || 0;
      const rate = Number(line.rate) || 0;
      const taxPercent = Number(line.taxPercent) || 0;
      const base = qty * rate;
      const tax = (base * taxPercent) / 100;
      subtotal += base;
      taxTotal += tax;
    }
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
  }, [lines]);

  function openCreate() {
    setPartyId(parties?.[0]?.id ?? "");
    setDate(todayISO());
    setNotes("");
    setLines([emptyLine()]);
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      openCreate();
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, docType]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !partyId) return;
    const valid = lines
      .filter((l) => l.name.trim() && Number(l.qty) > 0)
      .map((l) => {
        const qty = Number(l.qty) || 0;
        const rate = Number(l.rate) || 0;
        const taxPercent = Number(l.taxPercent) || 0;
        const base = qty * rate;
        const amount = base + (base * taxPercent) / 100;
        return {
          itemId: l.itemId || undefined,
          name: l.name.trim(),
          qty,
          rate,
          taxPercent,
          amount,
        };
      });
    if (!valid.length) {
      setError("Add at least one line item");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.docs.create({
        companyId,
        docType,
        date,
        partyId,
        notes: notes.trim() || undefined,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        lines: valid,
      });
      setOpen(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function convert(id: string) {
    if (!confirm(`${meta.nextLabel}?`)) return;
    setBusy(true);
    try {
      await api.docs.convert(id);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{meta.title}</h1>
          <p className="muted">Simple flow · no approval steps</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> Add {meta.title}
          </button>
        </div>
      </header>

      <div className="content">
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>No.</th>
                  <th>Party</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(docs ?? []).map((d) => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>{d.number}</td>
                    <td>{(d.partyId && partyName.get(d.partyId)) || "—"}</td>
                    <td>
                      <span className={`badge ${d.status === "open" ? "badge-sale" : "badge-ok"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="money">{inr(d.grandTotal)}</td>
                    <td>
                      {d.status === "open" ? (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => void convert(d.id)}
                        >
                          <ArrowRightLeft size={14} /> {meta.nextLabel}
                        </button>
                      ) : (
                        <span className="muted">→ {d.convertedToType}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!docs?.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">No documents yet. Click Add to create one.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {open ? (
        <Modal
          title={`Add ${meta.title}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="pipeline-form" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="pipeline-form" onSubmit={save}>
            <div className="form-grid">
              <label className="field">
                Party
                <select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                  <option value="">Select</option>
                  {(parties ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="field full">
                Notes
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              {(lines).map((line, idx) => (
                <div className="form-grid" key={line.key} style={{ marginBottom: 8 }}>
                  <label className="field">
                    Item
                    <select
                      value={line.itemId}
                      onChange={(e) => {
                        const item = (items ?? []).find((i) => i.id === e.target.value);
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? {
                                  ...l,
                                  itemId: e.target.value,
                                  name: item?.name ?? l.name,
                                  rate: String(
                                    docType === "purchase_order"
                                      ? item?.purchasePrice ?? l.rate
                                      : item?.salePrice ?? l.rate,
                                  ),
                                  taxPercent: String(item?.taxPercent ?? l.taxPercent),
                                }
                              : l,
                          ),
                        );
                      }}
                    >
                      <option value="">Custom</option>
                      {(items ?? []).map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Name
                    <input
                      value={line.name}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)),
                        )
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    Qty
                    <input
                      value={line.qty}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Rate
                    <input
                      value={line.rate}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, rate: e.target.value } : l)),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <Plus size={14} /> Line
              </button>
            </div>

            <p className="muted" style={{ marginTop: 12 }}>
              Total: <strong>{inr(totals.grandTotal)}</strong>
            </p>
            {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
