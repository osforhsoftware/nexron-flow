import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import type { PartyFormState } from "../lib/partyForm";
import { PARTY_TYPE_OPTIONS, type PartyServiceType, type PartyType } from "../db/types";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { Modal } from "./Modal";

export function PartyFormFields({
  form,
  onChange,
}: {
  form: PartyFormState;
  onChange: (next: PartyFormState) => void;
}) {
  const { company } = useApp();
  const companyId = company?.id;
  const [types, setTypes] = useState<PartyServiceType[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [savingType, setSavingType] = useState(false);

  async function loadTypes() {
    if (!companyId) return;
    const { types: rows } = await api.partyTypes.list(companyId);
    setTypes(rows);
  }

  useEffect(() => {
    void loadTypes();
  }, [companyId]);

  function set<K extends keyof PartyFormState>(key: K, value: PartyFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  const typeOptions =
    types.length > 0
      ? types.map((t) => ({ value: t.slug, label: t.name }))
      : PARTY_TYPE_OPTIONS;

  async function addService(e?: FormEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (!companyId || !newTypeName.trim() || savingType) return;
    setSavingType(true);
    try {
      const { type } = await api.partyTypes.create({
        companyId,
        name: newTypeName.trim(),
      });
      await loadTypes();
      set("type", type.slug as PartyType);
      setNewTypeName("");
    } catch {
      await loadTypes();
    } finally {
      setSavingType(false);
    }
  }

  async function removeService(id: string) {
    await api.partyTypes.remove(id);
    const next = types.filter((t) => t.id !== id);
    setTypes(next);
    if (form.type === types.find((t) => t.id === id)?.slug) {
      set("type", (next[0]?.slug ?? "not_specified") as PartyType);
    }
  }

  return (
    <div className="party-form-fields">
      <div className="form-grid party-form-grid">
        <label className="field">
          <span>
            Name <span className="req">*</span>
          </span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </label>
        <div className="field">
          <span className="party-type-label">
            Type
            <button className="link-button" type="button" onClick={() => setManageOpen(true)}>
              Manage
            </button>
          </span>
          <select
            value={form.type}
            onChange={(e) => set("type", e.target.value as PartyType)}
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {!typeOptions.some((opt) => opt.value === form.type) ? (
              <option value={form.type}>{form.type}</option>
            ) : null}
          </select>
        </div>
        {form.type === "other" ? (
          <label className="field full">
            Other type
            <input
              value={form.typeOther}
              onChange={(e) => set("typeOther", e.target.value)}
              placeholder="Specify type"
            />
          </label>
        ) : null}
        <label className="field">
          Contact person
          <input
            value={form.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
          />
        </label>
        <label className="field">
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>
        <label className="field">
          Phone
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="field">
          License / GST
          <input
            value={form.licenseGst}
            onChange={(e) => set("licenseGst", e.target.value)}
          />
        </label>
        <label className="field">
          City
          <input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </label>
        <label className="field">
          Country
          <input value={form.country} onChange={(e) => set("country", e.target.value)} />
        </label>
        <label className="field">
          Balance type
          <select
            value={form.balanceType}
            onChange={(e) => set("balanceType", e.target.value as "to_receive" | "to_pay")}
          >
            <option value="to_receive">To Receive</option>
            <option value="to_pay">To Pay</option>
          </select>
        </label>
        <label className="field full">
          Address
          <textarea
            rows={2}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </label>
        <label className="field full">
          Additional note
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>

      <div className="party-extra-fields">
        <div className="party-extra-head">
          <strong>Additional fields</strong>
          <button
            className="link-button"
            type="button"
            onClick={() =>
              set("additionalFields", [...form.additionalFields, { label: "", value: "" }])
            }
          >
            <Plus size={13} /> Add option
          </button>
        </div>
        {form.additionalFields.map((field, index) => (
          <div className="party-extra-row" key={index}>
            <input
              placeholder="Field name"
              value={field.label}
              onChange={(e) => {
                const next = form.additionalFields.map((f, i) =>
                  i === index ? { ...f, label: e.target.value } : f,
                );
                set("additionalFields", next);
              }}
            />
            <input
              placeholder="Value"
              value={field.value}
              onChange={(e) => {
                const next = form.additionalFields.map((f, i) =>
                  i === index ? { ...f, value: e.target.value } : f,
                );
                set("additionalFields", next);
              }}
            />
            <button
              className="btn btn-ghost"
              type="button"
              aria-label="Remove field"
              onClick={() =>
                set(
                  "additionalFields",
                  form.additionalFields.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!form.additionalFields.length ? (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Add custom fields such as TRN, trade license, or reference.
          </p>
        ) : null}
      </div>
      {manageOpen
        ? createPortal(
            <Modal
              nested
              className="modal-party-types"
              title="Manage types"
              onClose={() => setManageOpen(false)}
              footer={
                <button className="btn btn-primary" type="button" onClick={() => setManageOpen(false)}>
                  Done
                </button>
              }
            >
              <div className="party-type-manage">
                <div className="party-type-add">
                  <input
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="Add service / type"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addService();
                      }
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={savingType || !newTypeName.trim()}
                    onClick={() => void addService()}
                  >
                    Add
                  </button>
                </div>
                <ul className="party-type-list">
                  {types.map((t) => (
                    <li key={t.id}>
                      <span>{t.name}</span>
                      {t.builtin ? (
                        <em className="muted">Default</em>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          aria-label={`Remove ${t.name}`}
                          onClick={() => void removeService(t.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Modal>,
            document.body,
          )
        : null}
    </div>
  );
}
