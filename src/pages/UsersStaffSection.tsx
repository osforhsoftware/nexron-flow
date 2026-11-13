import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Modal } from "../components/Modal";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import { api, type ApiUser } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { ROLE_LABELS, type AppRole } from "../lib/roles";
import { useAsync } from "../lib/useAsync";

type Mode = "users" | "staff";

const emptyForm = {
  name: "",
  username: "",
  password: "",
  phone: "",
  email: "",
  isStaff: false,
  roleId: "",
};

export function UsersStaffSection({ mode }: { mode: Mode }) {
  const { can } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  const canRead = can("users", "read");
  const canCreate = can("users", "create");
  const canUpdate = can("users", "update");

  const { data: users, reload, loading } = useAsync(async () => {
    const { users: list } = await api.users.list();
    return list;
  }, []);

  const { data: roles } = useAsync(async () => {
    try {
      const { roles: list } = await api.roles.list();
      return list.filter((r) => r.status);
    } catch {
      return [];
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (users ?? []).filter((u) => (mode === "staff" ? Boolean(u.isStaff) : true));
    if (!needle) return list;
    return list.filter((u) =>
      [u.name, u.username, u.email, u.phone, u.role, ...(u.roles ?? []).map((r) => r.name)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [users, q, mode]);

  const pager = usePagedRows(filtered, 12);

  function closeEditor() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function openAdd() {
    setError("");
    setEditingId(null);
    setForm({ ...emptyForm, isStaff: mode === "staff" });
    setOpen(true);
  }

  function openEdit(row: ApiUser) {
    setError("");
    setEditingId(row.id);
    setForm({
      name: row.name,
      username: row.username,
      password: "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      isStaff: Boolean(row.isStaff) || mode === "staff",
      roleId: row.roles?.[0]?.id ?? "",
    });
    setOpen(true);
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim()) {
      setError("Name and username are required.");
      return;
    }
    if (!editingId && form.password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (editingId && form.password && form.password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (form.isStaff && !form.roleId) {
      setError("Select a role after assigning as staff.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        isStaff: form.isStaff,
        roleId: form.roleId || undefined,
        role: "office" as const,
      };
      if (editingId) {
        await api.users.update(editingId, {
          ...payload,
          password: form.password || undefined,
        });
      } else {
        await api.users.create({
          ...payload,
          password: form.password,
        });
      }
      await reload();
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "staff" ? "Staff" : "Users";
  const addLabel = mode === "staff" ? "Add Staff" : "Add User";
  const saveLabel = editingId ? (mode === "staff" ? "Save Staff" : "Save User") : addLabel;

  if (!canRead) {
    return (
      <div className="generic-settings">
        <h2>{title}</h2>
        <p className="muted">You do not have permission to view {title.toLowerCase()}.</p>
      </div>
    );
  }

  return (
    <div className="generic-settings settings-people">
      <div className="settings-people-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            {mode === "staff"
              ? "Add or edit staff accounts and assign a role after marking them as staff."
              : "Create users, optionally assign as staff, then pick a role."}
          </p>
        </div>
        {canCreate ? (
          <button className="btn btn-primary" type="button" onClick={openAdd}>
            <Plus size={14} /> {addLabel}
          </button>
        ) : null}
      </div>

      {error && !open ? <p className="form-error">{error}</p> : null}

      <div className="filter-bar">
        <input
          type="search"
          placeholder={mode === "staff" ? "Search staff…" : "Search users…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="panel people-list-panel">
        {loading && !(users?.length) ? <p className="muted people-empty">Loading…</p> : null}
        {!loading && pager.pageRows.length === 0 ? (
          <p className="muted people-empty">
            {mode === "staff" ? "No staff yet. Add a staff user." : "No users yet."}
          </p>
        ) : null}
        <ul className="people-list">
          {pager.pageRows.map((row) => (
            <UserRow
              key={row.id}
              user={row}
              showType={mode === "users"}
              canUpdate={canUpdate}
              onEdit={() => openEdit(row)}
            />
          ))}
        </ul>
        <TablePagination pager={pager} />
      </div>

      {open ? (
        <Modal
          title={editingId ? (mode === "staff" ? "Edit Staff" : "Edit User") : addLabel}
          onClose={closeEditor}
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={closeEditor} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="user-staff-form" disabled={saving}>
                {saving ? "Saving…" : saveLabel}
              </button>
            </>
          }
        >
          <form id="user-staff-form" className="user-add-form" onSubmit={(e) => void saveUser(e)}>
            {error ? <p className="form-error">{error}</p> : null}
            <label className="field">
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="field">
              Username
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="off"
                required
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                required={!editingId}
                placeholder={editingId ? "Leave blank to keep current" : undefined}
              />
            </label>
            <label className="field">
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="settings-staff-check">
              <input
                type="checkbox"
                checked={form.isStaff}
                onChange={(e) => setForm({ ...form, isStaff: e.target.checked })}
              />
              Assign as staff
            </label>
            <label className="field">
              Role
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                required={form.isStaff}
              >
                <option value="">{form.isStaff ? "Select role" : "No extra role"}</option>
                {(roles ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function UserRow({
  user,
  showType,
  canUpdate,
  onEdit,
}: {
  user: ApiUser;
  showType: boolean;
  canUpdate: boolean;
  onEdit: () => void;
}) {
  const roleLabel =
    user.roles?.[0]?.name ?? (user.role ? ROLE_LABELS[user.role as AppRole] ?? user.role : "—");
  const contact = user.phone || user.email || "—";

  return (
    <li className="people-row">
      <div className="people-identity">
        <span className="people-avatar" aria-hidden>
          {initials(user.name)}
        </span>
        <span className="people-identity-text">
          <strong>{user.name}</strong>
          <small>
            @{user.username}
            {contact !== "—" ? ` · ${contact}` : ""}
          </small>
        </span>
      </div>
      <div className="people-meta">
        {showType ? (
          <span className={`people-chip${user.isStaff ? " staff" : ""}`}>
            {user.isStaff ? "Staff" : "User"}
          </span>
        ) : null}
        <span className="people-chip role">{roleLabel}</span>
        {canUpdate ? (
          <button className="people-edit" type="button" onClick={onEdit}>
            <Pencil size={13} />
            Edit
          </button>
        ) : null}
      </div>
    </li>
  );
}
