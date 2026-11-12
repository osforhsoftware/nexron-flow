import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { api, type ApiUser } from "../lib/api";
import type { ServiceCall, ServiceCallPriority, ServiceCallStatus, ServiceCallType } from "../db/types";
import { useApp } from "../lib/AppContext";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import { PageHeader } from "../components/UI";

const STATUS_OPTIONS: { value: ServiceCallStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "closed", label: "Closed" },
];

const TYPE_OPTIONS: ServiceCallType[] = ["Repair", "Maintenance", "Installation", "Other"];
const PRIORITY_OPTIONS: { value: ServiceCallPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const emptyForm = {
  customerId: "",
  equipmentId: "",
  type: "Repair" as ServiceCallType,
  priority: "normal" as ServiceCallPriority,
  description: "",
  assignedUserId: "",
  assignedName: "",
  scheduledFor: "",
  notes: "",
  status: "open" as ServiceCallStatus,
};

function statusLabel(value?: string | null) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Open";
}

function dateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function ServiceCallsPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceCall | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const openedFromSearch = useRef<string | null>(null);

  const { data: rows, error: loadError, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { serviceCalls } = await api.serviceCalls.list(companyId);
    return serviceCalls;
  }, [companyId]);

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: list } = await api.parties.list(companyId);
    return list;
  }, [companyId]);

  const { data: equipment } = useAsync(async () => {
    if (!companyId) return [];
    const { equipment: list } = await api.equipment.list(companyId);
    return list;
  }, [companyId]);

  const { data: users } = useAsync(async () => {
    try {
      const { users: list } = await api.users.list();
      return list;
    } catch {
      return [] as ApiUser[];
    }
  }, []);

  const equipmentForCustomer = useMemo(() => {
    const list = equipment ?? [];
    if (!form.customerId) return list;
    return list.filter((e) => !e.customerId || e.customerId === form.customerId);
  }, [equipment, form.customerId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!term) return true;
      return (
        row.callNo.toLowerCase().includes(term) ||
        row.customerName.toLowerCase().includes(term) ||
        row.description.toLowerCase().includes(term) ||
        (row.equipmentName ?? "").toLowerCase().includes(term) ||
        (row.assignedName ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, statusFilter]);

  const listPage = usePagedRows(filtered, `${q}|${statusFilter}`);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  function openEdit(item: ServiceCall) {
    setEditing(item);
    setForm({
      customerId: item.customerId,
      equipmentId: item.equipmentId ?? "",
      type: (item.type as ServiceCallType) || "Repair",
      priority: (item.priority as ServiceCallPriority) || "normal",
      description: item.description,
      assignedUserId: item.assignedUserId ?? "",
      assignedName: item.assignedName ?? "",
      scheduledFor: dateInput(item.scheduledFor),
      notes: item.notes ?? "",
      status: (item.status as ServiceCallStatus) || "open",
    });
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      openCreate();
      return;
    }
    const id = searchParams.get("id");
    if (!id || !rows?.length) return;
    if (openedFromSearch.current === id) return;
    const hit = rows.find((r) => r.id === id);
    if (!hit) return;
    openedFromSearch.current = id;
    openEdit(hit);
  }, [searchParams, rows]);

  function assignedPayload() {
    const assignedUserId = form.assignedUserId || undefined;
    let assignedName = form.assignedName.trim() || undefined;
    if (assignedUserId && !assignedName) {
      assignedName = (users ?? []).find((u) => u.id === assignedUserId)?.name;
    }
    return { assignedUserId, assignedName };
  }

  async function persist(statusOverride?: ServiceCallStatus) {
    if (!companyId) return;
    const description = form.description.trim();
    if (!form.customerId || !description) {
      setError("Customer and problem description are required.");
      return;
    }
    const status = statusOverride ?? form.status;
    const { assignedUserId, assignedName } = assignedPayload();
    const payload = {
      companyId,
      customerId: form.customerId,
      equipmentId: form.equipmentId || null,
      type: form.type,
      priority: form.priority,
      description,
      assignedUserId: assignedUserId || null,
      assignedName: assignedName || null,
      scheduledFor: form.scheduledFor || null,
      notes: form.notes.trim() || null,
      status,
    };

    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.serviceCalls.update(editing.id, payload);
      } else {
        await api.serviceCalls.create(payload);
      }
      await reload();
      setOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save service call.");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await persist();
  }

  async function setStatus(next: ServiceCallStatus) {
    if (!editing) {
      setForm((prev) => ({ ...prev, status: next }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { serviceCall } = await api.serviceCalls.update(editing.id, { status: next });
      setEditing(serviceCall);
      setForm((prev) => ({ ...prev, status: (serviceCall.status as ServiceCallStatus) || next }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Service Calls"
        subtitle="Log customer issues, assign, and close — no approval maze"
        actions={
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={16} /> New Service Call
          </button>
        }
      />

      <div className="content">
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              className="search"
              placeholder="Search call no, customer, problem…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="toolbar-right" role="tablist" aria-label="Status filter">
            <button
              type="button"
              className={`filter-chip${statusFilter === "" ? " active" : ""}`}
              onClick={() => setStatusFilter("")}
            >
              All
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`filter-chip${statusFilter === s.value ? " active" : ""}`}
                onClick={() => setStatusFilter(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loadError ? (
          <p className="form-error" style={{ padding: "0 0 10px" }}>
            {loadError}
          </p>
        ) : null}

        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Customer</th>
                  <th>Problem</th>
                  <th>Assigned</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.callNo}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.type} · {row.priority === "high" ? "High" : "Normal"}
                      </div>
                    </td>
                    <td>
                      {row.customerName}
                      {row.equipmentName ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {row.equipmentName}
                        </div>
                      ) : null}
                    </td>
                    <td className="service-call-desc">{row.description}</td>
                    <td>{row.assignedName || "—"}</td>
                    <td>
                      <span className={`badge badge-muted service-status-${row.status}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost" type="button" onClick={() => openEdit(row)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {listPage.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">
                        No service calls yet. Create one when a customer reports an issue.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={listPage} />
        </div>
      </div>

      {open ? (
        <Modal
          title={editing ? `Service Call ${editing.callNo}` : "New Service Call"}
          onClose={() => !saving && setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="service-call-form" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create call"}
              </button>
            </>
          }
        >
          <form id="service-call-form" className="form-grid" onSubmit={(e) => void onSubmit(e)}>
            {editing ? (
              <div className="full quote-status-actions" style={{ marginTop: 0, marginBottom: 4 }}>
                {editing.status !== "in_progress" && editing.status !== "done" && editing.status !== "closed" ? (
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void setStatus("in_progress")}>
                    Start
                  </button>
                ) : null}
                {editing.status !== "done" && editing.status !== "closed" ? (
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void setStatus("done")}>
                    Mark done
                  </button>
                ) : null}
                {editing.status !== "closed" ? (
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void setStatus("closed")}>
                    Close
                  </button>
                ) : (
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void setStatus("open")}>
                    Reopen
                  </button>
                )}
              </div>
            ) : null}

            <label className="field">
              <span>Customer</span>
              <select
                required
                value={form.customerId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    customerId: e.target.value,
                    equipmentId: "",
                  }))
                }
              >
                <option value="">Select customer</option>
                {(parties ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Equipment (optional)</span>
              <select
                value={form.equipmentId}
                onChange={(e) => setForm((prev) => ({ ...prev, equipmentId: e.target.value }))}
              >
                <option value="">No equipment linked</option>
                {equipmentForCustomer.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name} · {eq.assetTag}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Type</span>
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ServiceCallType }))}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as ServiceCallPriority }))}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field full">
              <span>Problem / description</span>
              <textarea
                rows={3}
                required
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What is the customer reporting?"
              />
            </label>

            <label className="field">
              <span>Assigned to</span>
              {(users ?? []).length > 0 ? (
                <select
                  value={form.assignedUserId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = (users ?? []).find((u) => u.id === id)?.name ?? "";
                    setForm((prev) => ({
                      ...prev,
                      assignedUserId: id,
                      assignedName: name,
                      status: prev.status === "open" && id ? "assigned" : prev.status,
                    }));
                  }}
                >
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.assignedName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      assignedName: e.target.value,
                      status: prev.status === "open" && e.target.value.trim() ? "assigned" : prev.status,
                    }))
                  }
                  placeholder="Engineer or staff name"
                />
              )}
            </label>

            <label className="field">
              <span>Schedule date</span>
              <input
                type="date"
                value={form.scheduledFor}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduledFor: e.target.value }))}
              />
            </label>

            <label className="field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as ServiceCallStatus }))}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field full">
              <span>Notes</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Internal notes (optional)"
              />
            </label>

            {error ? <p className="form-error full" style={{ padding: 0 }}>{error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
