import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, QrCode, ScanLine, X } from "lucide-react";
import { QrCodeModal } from "../components/QrCodeModal";
import { api } from "../lib/api";
import type { Equipment } from "../db/types";
import { nextAssetTag } from "../lib/assetTag";
import { useApp } from "../lib/AppContext";
import { emptyPartyForm, partyPayloadFromForm } from "../lib/partyForm";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import { PartyFormFields } from "../components/PartyFormFields";

const STATUS_OPTIONS = [
  { value: "in_service", label: "In service" },
  { value: "in_repair", label: "In repair" },
  { value: "in_storage", label: "In storage" },
  { value: "decommissioned", label: "Decommissioned" },
  { value: "disposed", label: "Disposed" },
] as const;

const emptyForm = {
  name: "",
  serialNumber: "",
  model: "",
  manufacturer: "",
  category: "",
  customerId: "",
  location: "",
  installDate: "",
  warrantyStart: "",
  warrantyEnd: "",
  noMachineWarranty: true,
  serviceWarrantyStart: "",
  serviceWarrantyEnd: "",
  noServiceWarranty: true,
  condition: "",
  currentStatus: "in_service",
  additionalNote: "",
};

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function statusLabel(value?: string | null) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "In service";
}

export function EquipmentPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [qrItem, setQrItem] = useState<Equipment | null>(null);
  const [newParty, setNewParty] = useState(emptyPartyForm());
  const openedFromSearch = useRef<string | null>(null);

  const { data: rows, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { equipment } = await api.equipment.list(companyId);
    return equipment;
  }, [companyId]);

  const { data: parties, reload: reloadParties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: list } = await api.parties.list(companyId);
    return list;
  }, [companyId]);

  const nextTag = useMemo(
    () => nextAssetTag(company?.assetTagStart, (rows ?? []).map((e) => e.assetTag)),
    [company?.assetTagStart, rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (e) =>
        !term ||
        e.name.toLowerCase().includes(term) ||
        e.serialNumber.toLowerCase().includes(term) ||
        e.assetTag.toLowerCase().includes(term) ||
        (e.customerName ?? "").toLowerCase().includes(term) ||
        (e.category ?? "").toLowerCase().includes(term),
    );
  }, [rows, q]);

  const listPage = usePagedRows(filtered, q);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  function openEdit(item: Equipment) {
    setEditing(item);
    setForm({
      name: item.name,
      serialNumber: item.serialNumber,
      model: item.model ?? "",
      manufacturer: item.manufacturer ?? "",
      category: item.category ?? "",
      customerId: item.customerId ?? "",
      location: item.location ?? "",
      installDate: dateInput(item.installDate),
      warrantyStart: dateInput(item.warrantyStart),
      warrantyEnd: dateInput(item.warrantyEnd),
      noMachineWarranty: Boolean(item.noMachineWarranty),
      serviceWarrantyStart: dateInput(item.serviceWarrantyStart),
      serviceWarrantyEnd: dateInput(item.serviceWarrantyEnd),
      noServiceWarranty: Boolean(item.noServiceWarranty),
      condition: item.condition ?? "",
      currentStatus: item.currentStatus || "in_service",
      additionalNote: item.additionalNote ?? "",
    });
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !rows?.length) return;
    if (openedFromSearch.current === id) return;
    const hit = rows.find((e) => e.id === id);
    if (!hit) return;
    openedFromSearch.current = id;
    openEdit(hit);
  }, [searchParams, rows]);

  async function persist(keepOpen: boolean) {
    if (!companyId) return;
    const name = form.name.trim();
    const serialNumber = form.serialNumber.trim();
    if (!name || !serialNumber) {
      setError("Name and serial number are required.");
      return;
    }
    const payload = {
      name,
      serialNumber,
      model: form.model.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      category: form.category.trim() || null,
      customerId: form.customerId || null,
      location: form.location.trim() || null,
      installDate: form.installDate || null,
      noMachineWarranty: form.noMachineWarranty,
      warrantyStart: form.noMachineWarranty ? null : form.warrantyStart || null,
      warrantyEnd: form.noMachineWarranty ? null : form.warrantyEnd || null,
      noServiceWarranty: form.noServiceWarranty,
      serviceWarrantyStart: form.noServiceWarranty ? null : form.serviceWarrantyStart || null,
      serviceWarrantyEnd: form.noServiceWarranty ? null : form.serviceWarrantyEnd || null,
      condition: form.condition.trim() || null,
      currentStatus: form.currentStatus || "in_service",
      additionalNote: form.additionalNote.trim() || null,
    };
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.equipment.update(editing.id, payload, companyId);
      } else {
        await api.equipment.create({ companyId, ...payload });
      }
      reload();
      if (keepOpen) {
        setEditing(null);
        setForm(emptyForm);
        return;
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save equipment");
    } finally {
      setSaving(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await persist(false);
  }

  function openAddParty() {
    setNewParty(emptyPartyForm({ country: company?.country ?? "" }));
    setAddPartyOpen(true);
  }

  async function createPartyInline(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newParty.name.trim()) return;
    const { party } = await api.parties.create({
      companyId,
      ...partyPayloadFromForm(newParty),
    });
    await reloadParties();
    setForm((prev) => ({ ...prev, customerId: party.id }));
    setAddPartyOpen(false);
    setNewParty(emptyPartyForm());
  }

  if (open) {
    return (
      <div className="full-editor item-editor">
        <div className="editor-heading">
          <div className="editor-heading-left">
            <h1>{editing ? "Edit Equipment" : "Register Equipment"}</h1>
          </div>
          <div className="editor-icons">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X size={19} />
            </button>
          </div>
        </div>

        <form className="item-editor-form" onSubmit={save}>
          <div className="item-editor-scroll">
            <div className="item-identity-grid equipment-identity-grid">
              <label className="field">
                <span className="field-caption">
                  Equipment name<span className="req">*</span>
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-caption">
                  Serial number<span className="req">*</span>
                </span>
                <input
                  value={form.serialNumber}
                  onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-caption">Asset tag</span>
                <input
                  value={editing?.assetTag ?? nextTag}
                  readOnly
                  title="Assigned automatically from Settings → Item → Equipment asset tag"
                />
                {!editing ? (
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    Auto from settings ({company?.assetTagStart || "EQ-0001"}). Not editable.
                  </span>
                ) : null}
              </label>
              <label className="field">
                <span className="field-caption">Customer</span>
                <select
                  value={form.customerId}
                  onChange={(e) => {
                    if (e.target.value === "__add__") {
                      openAddParty();
                      return;
                    }
                    setForm({ ...form, customerId: e.target.value });
                  }}
                >
                  <option value="" disabled>
                    Select customer
                  </option>
                  {(parties ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__add__">+ Add Party</option>
                </select>
              </label>
              <label className="field">
                Manufacturer
                <input
                  value={form.manufacturer}
                  onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                />
              </label>
              <label className="field">
                Model
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </label>
              <label className="field">
                Category
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </label>
              <label className="field">
                Location
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </label>
            </div>

            <div className="item-editor-body">
              <section className="editor-section">
                <h3>Install &amp; warranty</h3>
                <div className="inline-fields stock-fields">
                  <label className="field">
                    Install / received date
                    <input
                      type="date"
                      value={form.installDate}
                      onChange={(e) => setForm({ ...form, installDate: e.target.value })}
                    />
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={form.noMachineWarranty}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        noMachineWarranty: e.target.checked,
                        warrantyStart: e.target.checked ? "" : form.warrantyStart,
                        warrantyEnd: e.target.checked ? "" : form.warrantyEnd,
                      })
                    }
                  />
                  No machine warranty
                </label>
                {!form.noMachineWarranty ? (
                  <div className="inline-fields stock-fields">
                    <label className="field">
                      Machine warranty start
                      <input
                        type="date"
                        value={form.warrantyStart}
                        onChange={(e) => setForm({ ...form, warrantyStart: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Machine warranty end
                      <input
                        type="date"
                        value={form.warrantyEnd}
                        onChange={(e) => setForm({ ...form, warrantyEnd: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={form.noServiceWarranty}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        noServiceWarranty: e.target.checked,
                        serviceWarrantyStart: e.target.checked ? "" : form.serviceWarrantyStart,
                        serviceWarrantyEnd: e.target.checked ? "" : form.serviceWarrantyEnd,
                      })
                    }
                  />
                  No service warranty
                </label>
                {!form.noServiceWarranty ? (
                  <div className="inline-fields stock-fields">
                    <label className="field">
                      Service warranty start
                      <input
                        type="date"
                        value={form.serviceWarrantyStart}
                        onChange={(e) =>
                          setForm({ ...form, serviceWarrantyStart: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Service warranty end
                      <input
                        type="date"
                        value={form.serviceWarrantyEnd}
                        onChange={(e) => setForm({ ...form, serviceWarrantyEnd: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              <section className="editor-section">
                <h3>Status</h3>
                <div className="inline-fields stock-fields">
                  <label className="field">
                    Current status
                    <select
                      value={form.currentStatus}
                      onChange={(e) => setForm({ ...form, currentStatus: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Condition
                    <input
                      value={form.condition}
                      onChange={(e) => setForm({ ...form, condition: e.target.value })}
                      placeholder="e.g. operational"
                    />
                  </label>
                </div>
                <label className="field">
                  Additional note
                  <textarea
                    rows={4}
                    value={form.additionalNote}
                    onChange={(e) => setForm({ ...form, additionalNote: e.target.value })}
                  />
                </label>
              </section>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </div>

          {addPartyOpen ? (
            <Modal
              title="Add Party"
              className="inv-party-modal modal-party"
              nested
              onClose={() => {
                setAddPartyOpen(false);
                setNewParty(emptyPartyForm());
              }}
              footer={
                <>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setAddPartyOpen(false);
                      setNewParty(emptyPartyForm());
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn inv-party-save" type="submit" form="eq-add-party-form">
                    Save Party
                  </button>
                </>
              }
            >
              <form id="eq-add-party-form" className="inv-party-form" onSubmit={createPartyInline}>
                <p className="inv-party-form-hint">Create a customer and link them to this equipment.</p>
                <PartyFormFields form={newParty} onChange={setNewParty} />
              </form>
            </Modal>
          ) : null}

          <div className="editor-footer">
            <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={saving}
              onClick={() => void persist(true)}
            >
              Save &amp; New
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {editing ? "Save" : "Register"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Equipment</h1>
          <p className="muted">Registered machines and serial-tracked assets</p>
        </div>
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/scan">
            <ScanLine size={14} /> Scan QR
          </Link>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> Register Equipment
          </button>
        </div>
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              className="search"
              placeholder="Search name / serial / asset tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Asset tag</th>
                  <th>Serial</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <div className="muted" style={{ fontSize: "0.78rem" }}>
                        {[item.manufacturer, item.model, item.category].filter(Boolean).join(" · ") ||
                          "—"}
                      </div>
                    </td>
                    <td>{item.assetTag}</td>
                    <td>{item.serialNumber}</td>
                    <td>{item.customerName || "—"}</td>
                    <td>{statusLabel(item.currentStatus)}</td>
                    <td>
                      <div className="purchase-row-actions">
                        <button
                          className="btn btn-ghost"
                          type="button"
                          title="QR code"
                          onClick={() => setQrItem(item)}
                        >
                          <QrCode size={14} /> QR
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">No equipment yet.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={listPage} />
        </div>
      </div>
      {qrItem ? (
        <QrCodeModal
          kind="equipment"
          id={qrItem.id}
          title={qrItem.name}
          subtitle={`${qrItem.assetTag} · ${qrItem.serialNumber}`}
          onClose={() => setQrItem(null)}
        />
      ) : null}
    </>
  );
}
