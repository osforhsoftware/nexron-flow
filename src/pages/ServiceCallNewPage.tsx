import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Plus } from "lucide-react";
import { api, type ApiUser } from "../lib/api";
import type { ServiceCallPriority, ServiceCallStatus, ServiceCallType } from "../db/types";
import { useApp } from "../lib/AppContext";
import { useAsync } from "../lib/useAsync";
import { StaffAssignFields } from "../components/StaffAssignFields";
import { nextAssetTag } from "../lib/assetTag";
import { Modal } from "../components/Modal";

const TYPE_OPTIONS: ServiceCallType[] = ["Repair", "Maintenance", "Installation", "Inspection", "Other"];
const PRIORITY_OPTIONS: { value: ServiceCallPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];
const STATUS_OPTIONS: { value: ServiceCallStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "inspection", label: "Inspection" },
];

const emptyEquip = {
  name: "",
  serialNumber: "",
  model: "",
  manufacturer: "",
};

export function ServiceCallNewPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const navigate = useNavigate();

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: list } = await api.parties.list(companyId);
    return list;
  }, [companyId]);

  const { data: equipment, reload: reloadEquipment } = useAsync(async () => {
    if (!companyId) return [];
    const { equipment: list } = await api.equipment.list(companyId);
    return list;
  }, [companyId]);

  const { data: assignOptions } = useAsync(async () => {
    try {
      return await api.staffAssignOptions();
    } catch {
      return { users: [] as ApiUser[], roles: [] };
    }
  }, []);

  const users = assignOptions?.users;
  const roles = assignOptions?.roles;

  const [customerId, setCustomerId] = useState("");
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [type, setType] = useState<ServiceCallType>("Repair");
  const [priority, setPriority] = useState<ServiceCallPriority>("normal");
  const [description, setDescription] = useState("");
  const [roleId, setRoleId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignedName, setAssignedName] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [status, setStatus] = useState<ServiceCallStatus>("open");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [equipOpen, setEquipOpen] = useState(false);
  const [equipForm, setEquipForm] = useState(emptyEquip);
  const [equipSaving, setEquipSaving] = useState(false);
  const [equipError, setEquipError] = useState("");

  const equipmentForCustomer = useMemo(() => {
    const list = equipment ?? [];
    if (!customerId) return list;
    return list.filter((e) => !e.customerId || e.customerId === customerId);
  }, [equipment, customerId]);

  const nextTag = useMemo(
    () => nextAssetTag(company?.assetTagStart, (equipment ?? []).map((e) => e.assetTag)),
    [company?.assetTagStart, equipment],
  );

  async function createEquipment(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !customerId) return;
    if (!equipForm.name.trim() || !equipForm.serialNumber.trim()) {
      setEquipError("Name and serial number are required.");
      return;
    }
    setEquipSaving(true);
    setEquipError("");
    try {
      const customerName = (parties ?? []).find((p) => p.id === customerId)?.name;
      const { equipment: created } = await api.equipment.create({
        companyId,
        name: equipForm.name.trim(),
        serialNumber: equipForm.serialNumber.trim(),
        model: equipForm.model.trim() || null,
        manufacturer: equipForm.manufacturer.trim() || null,
        customerId,
        customerName: customerName || null,
        currentStatus: "in_service",
        noMachineWarranty: true,
        noServiceWarranty: true,
      });
      await reloadEquipment();
      setEquipmentIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setEquipForm(emptyEquip);
      setEquipOpen(false);
    } catch (err) {
      setEquipError(err instanceof Error ? err.message : "Could not add equipment.");
    } finally {
      setEquipSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    if (!customerId || !description.trim()) {
      setError("Customer and problem description are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let name = assignedName.trim();
      if (assignedUserId && !name) {
        name = (users ?? []).find((u) => u.id === assignedUserId)?.name ?? "";
      }
      const nextStatus = assignedUserId && status === "open" ? "inspection" : status;
      const { serviceCall } = await api.serviceCalls.create({
        companyId,
        customerId,
        equipmentId: equipmentIds[0] || null,
        equipmentIds,
        type,
        priority,
        description: description.trim(),
        assignedUserId: assignedUserId || null,
        assignedName: name || null,
        inspectorId: assignedUserId || null,
        inspectorName: name || null,
        scheduledFor: scheduledFor || null,
        notes: notes.trim() || null,
        status: nextStatus,
      });
      navigate(`/service/calls/${serviceCall.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create service call.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="svc-new-page">
      <header className="topbar svc-new-topbar">
        <div className="svc-page-title">
          <Link to="/service/calls" className="btn btn-ghost svc-back-btn">
            <ChevronLeft size={14} /> Service Calls
          </Link>
          <div>
            <h1>New Service Call</h1>
            <p className="muted">Assigned staff will see this as their task</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/service/calls">
            Cancel
          </Link>
          <button className="btn btn-primary" type="submit" form="svc-new-form" disabled={saving}>
            {saving ? "Creating…" : "Create service call"}
          </button>
        </div>
      </header>

      <form id="svc-new-form" onSubmit={(e) => void onSubmit(e)} className="svc-new-sheet">
        {error ? <p className="form-error svc-new-error">{error}</p> : null}

        <div className="svc-new-row svc-new-row-4">
          <label className="field">
            <span>Customer</span>
            <select
              required
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setEquipmentIds([]);
              }}
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
            <span>Service type</span>
            <select value={type} onChange={(e) => setType(e.target.value as ServiceCallType)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as ServiceCallPriority)}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ServiceCallStatus)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="svc-new-row svc-new-row-4">
          <StaffAssignFields
            users={users}
            roles={roles}
            roleId={roleId}
            userId={assignedUserId}
            onChange={({ roleId: nextRole, userId, name }) => {
              setRoleId(nextRole);
              setAssignedUserId(userId);
              setAssignedName(name);
              if (userId && status === "open") setStatus("inspection");
            }}
          />
          <label className="field">
            <span>Schedule date</span>
            <input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </label>
          <div className="field svc-new-equip-inline">
            <div className="svc-equip-row">
              <span>
                Equipment <em className="muted">optional</em>
                {equipmentIds.length ? <em className="muted"> · {equipmentIds.length}</em> : null}
              </span>
              {customerId ? (
                <button type="button" className="btn btn-ghost" onClick={() => setEquipOpen(true)}>
                  <Plus size={13} /> Add
                </button>
              ) : null}
            </div>
            {!customerId ? (
              <div className="svc-empty-hint">Select a customer first</div>
            ) : equipmentForCustomer.length === 0 ? (
              <div className="svc-empty-hint">
                No equipment · next tag <strong>{nextTag}</strong>
              </div>
            ) : (
              <div className="svc-equip-picker svc-new-equip-strip">
                {equipmentForCustomer.map((eq) => {
                  const selected = equipmentIds.includes(eq.id);
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      className={`svc-equip-chip${selected ? " selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() =>
                        setEquipmentIds((prev) =>
                          selected ? prev.filter((id) => id !== eq.id) : [...prev, eq.id],
                        )
                      }
                    >
                      <strong>{eq.name}</strong>
                      <small>
                        {[eq.model, eq.serialNumber ? `S/N ${eq.serialNumber}` : ""]
                          .filter(Boolean)
                          .join(" · ") || "No model / serial"}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="svc-new-row svc-new-row-2 svc-new-notes">
          <label className="field">
            <span>Problem description</span>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is the customer reporting?"
            />
          </label>
          <label className="field">
            <span>Internal notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes (optional)"
            />
          </label>
        </div>
      </form>

      {equipOpen ? (
        <Modal title="Add equipment" onClose={() => setEquipOpen(false)}>
          <form className="form-grid" onSubmit={(e) => void createEquipment(e)}>
            <label className="field">
              <span>Name</span>
              <input
                required
                value={equipForm.name}
                onChange={(e) => setEquipForm((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Serial number</span>
              <input
                required
                value={equipForm.serialNumber}
                onChange={(e) => setEquipForm((p) => ({ ...p, serialNumber: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                value={equipForm.model}
                onChange={(e) => setEquipForm((p) => ({ ...p, model: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Manufacturer</span>
              <input
                value={equipForm.manufacturer}
                onChange={(e) => setEquipForm((p) => ({ ...p, manufacturer: e.target.value }))}
              />
            </label>
            {equipError ? <p className="form-error full">{equipError}</p> : null}
            <div className="full" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEquipOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={equipSaving}>
                {equipSaving ? "Saving…" : "Add"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
