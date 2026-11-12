import { Fragment, type FormEvent, useCallback, useMemo, useState } from "react";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { Modal } from "../components/Modal";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import {
  api,
  type ApiModule,
  type ApiRoleDetail,
  type ApiRoleSummary,
} from "../lib/api";
import { useApp } from "../lib/AppContext";
import type { PermissionAction, PermissionEntry, PermissionMap } from "../lib/permissions";
import { useAsync } from "../lib/useAsync";

type MatrixState = Record<string, PermissionEntry>;

const ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "create", label: "Create" },
  { key: "read", label: "Read" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
];

function emptyMatrix(modules: ApiModule[]): MatrixState {
  const out: MatrixState = {};
  for (const mod of modules) {
    for (const sub of mod.subModules) {
      out[sub.directory] = { create: false, read: false, update: false, delete: false };
    }
  }
  return out;
}

function matrixFromRole(role: ApiRoleDetail, modules: ApiModule[]): MatrixState {
  const base = emptyMatrix(modules);
  const source = role.permissionMatrix ?? {};
  for (const [directory, entry] of Object.entries(source)) {
    base[directory] = {
      create: Boolean(entry.create),
      read: Boolean(entry.read),
      update: Boolean(entry.update),
      delete: Boolean(entry.delete),
    };
  }
  for (const perm of role.permissions ?? []) {
    base[perm.directory] = {
      create: perm.canCreate,
      read: perm.canRead,
      update: perm.canUpdate,
      delete: perm.canDelete,
    };
  }
  return base;
}

function toPayload(matrix: MatrixState): PermissionMap {
  const out: PermissionMap = {};
  for (const [directory, entry] of Object.entries(matrix)) {
    if (entry.create || entry.read || entry.update || entry.delete) {
      out[directory] = {
        create: Boolean(entry.create),
        read: Boolean(entry.read),
        update: Boolean(entry.update),
        delete: Boolean(entry.delete),
      };
    }
  }
  return out;
}

export function RolesPage() {
  const { can } = useApp();
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState(1);
  const [modules, setModules] = useState<ApiModule[]>([]);
  const [matrix, setMatrix] = useState<MatrixState>({});

  const { data: roles, reload, loading } = useAsync(async () => {
    const { roles: list } = await api.roles.list();
    return list;
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = roles ?? [];
    if (!needle) return list;
    return list.filter((r) => r.name.toLowerCase().includes(needle));
  }, [roles, q]);

  const pager = usePagedRows(filtered, 12);

  const canCreate = can("roles", "create");
  const canUpdate = can("roles", "update");
  const canDelete = can("roles", "delete");

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
    setName("");
    setStatus(1);
    setMatrix({});
    setError("");
  }, []);

  async function openCreate() {
    setError("");
    try {
      const { modules: tree } = await api.modules.tree();
      setModules(tree);
      setMatrix(emptyMatrix(tree));
      setEditingId(null);
      setName("");
      setStatus(1);
      setEditorOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
    }
  }

  async function openEdit(role: ApiRoleSummary) {
    setError("");
    try {
      const { role: detail } = await api.roles.get(role.id);
      const tree = detail.modules?.length ? detail.modules : (await api.modules.tree()).modules;
      setModules(tree);
      setMatrix(matrixFromRole(detail, tree));
      setEditingId(detail.id);
      setName(detail.name);
      setStatus(detail.status);
      setEditorOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load role");
    }
  }

  function toggle(directory: string, action: PermissionAction) {
    setMatrix((prev) => {
      const current = prev[directory] ?? {};
      const next = { ...current, [action]: !current[action] };
      // Granting write implies read for usability.
      if (action !== "read" && next[action]) next.read = true;
      return { ...prev, [directory]: next };
    });
  }

  function setRow(directory: string, value: boolean) {
    setMatrix((prev) => ({
      ...prev,
      [directory]: { create: value, read: value, update: value, delete: value },
    }));
  }

  function setModuleAll(mod: ApiModule, value: boolean) {
    setMatrix((prev) => {
      const next = { ...prev };
      for (const sub of mod.subModules) {
        next[sub.directory] = { create: value, read: value, update: value, delete: value };
      }
      return next;
    });
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Role name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const permissions = toPayload(matrix);
      if (editingId) {
        await api.roles.update(editingId, { name: trimmed, status, permissions });
      } else {
        await api.roles.create({ name: trimmed, status, permissions });
      }
      await reload();
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(role: ApiRoleSummary) {
    if (!canDelete) return;
    if (!window.confirm(`Delete role “${role.name}”? This removes its permissions and user assignments.`)) {
      return;
    }
    setError("");
    try {
      await api.roles.remove(role.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    }
  }

  if (!can("roles", "read")) {
    return (
      <>
        <header className="topbar">
          <div>
            <h1>Roles</h1>
            <p className="muted">You do not have permission to view roles.</p>
          </div>
        </header>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Roles & Permissions</h1>
          <p className="muted">Define role matrices keyed by submodule directory</p>
        </div>
        <div className="topbar-actions">
          {canCreate ? (
            <button className="btn btn-primary" type="button" onClick={() => void openCreate()}>
              <Plus size={14} /> Add Role
            </button>
          ) : null}
        </div>
      </header>

      <div className="content">
        {error && !editorOpen ? <p className="form-error">{error}</p> : null}
        <div className="filter-bar">
          <input
            type="search"
            placeholder="Search roles…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Users</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && !(roles?.length) ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Loading…
                    </td>
                  </tr>
                ) : null}
                {!loading && pager.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No roles yet. Create one to build a permission matrix.
                    </td>
                  </tr>
                ) : null}
                {pager.pageRows.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Shield size={14} />
                        <strong>{role.name}</strong>
                      </div>
                    </td>
                    <td>{role.status ? "Active" : "Inactive"}</td>
                    <td>{role.permissionCount}</td>
                    <td>{role.userCount}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canUpdate ? (
                        <button className="btn btn-ghost" type="button" onClick={() => void openEdit(role)}>
                          <Pencil size={14} /> Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button className="btn btn-ghost" type="button" onClick={() => void removeRole(role)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination pager={pager} />
        </div>
      </div>

      {editorOpen ? (
        <Modal
          title={editingId ? "Edit Role" : "Add Role"}
          onClose={closeEditor}
          className="modal-wide"
          footer={
            <>
              <button className="btn btn-ghost" type="button" onClick={closeEditor} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="role-form" disabled={saving}>
                {saving ? "Saving…" : "Save Role"}
              </button>
            </>
          }
        >
          <form id="role-form" className="role-editor" onSubmit={(e) => void saveRole(e)}>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-grid">
              <label className="field">
                <span>Role name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Status</span>
                <select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </label>
            </div>

            <div className="role-matrix-wrap">
              <table className="data role-matrix">
                <thead>
                  <tr>
                    <th>Module / Submodule</th>
                    <th>Directory</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} style={{ textAlign: "center" }}>
                        {a.label}
                      </th>
                    ))}
                    <th style={{ textAlign: "center" }}>All</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((mod) => (
                    <Fragment key={mod.id}>
                      <tr className="role-matrix-module">
                        <td colSpan={2}>
                          <strong>{mod.name}</strong>
                        </td>
                        <td colSpan={ACTIONS.length} />
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            title={`Toggle all in ${mod.name}`}
                            checked={
                              mod.subModules.length > 0 &&
                              mod.subModules.every((s) => {
                                const e = matrix[s.directory];
                                return e?.create && e?.read && e?.update && e?.delete;
                              })
                            }
                            onChange={(e) => setModuleAll(mod, e.target.checked)}
                          />
                        </td>
                      </tr>
                      {mod.subModules.map((sub) => {
                        const entry = matrix[sub.directory] ?? {};
                        const allOn = Boolean(entry.create && entry.read && entry.update && entry.delete);
                        return (
                          <tr key={sub.id}>
                            <td style={{ paddingLeft: 22 }}>{sub.name}</td>
                            <td>
                              <code className="dir-key">{sub.directory}</code>
                            </td>
                            {ACTIONS.map((a) => (
                              <td key={a.key} style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(entry[a.key])}
                                  onChange={() => toggle(sub.directory, a.key)}
                                  aria-label={`${sub.directory} ${a.label}`}
                                />
                              </td>
                            ))}
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={allOn}
                                onChange={(e) => setRow(sub.directory, e.target.checked)}
                                aria-label={`${sub.directory} all`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
