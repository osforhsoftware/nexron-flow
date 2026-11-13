import { useMemo } from "react";
import type { ApiRoleSummary, ApiUser } from "../lib/api";
import { ROLE_LABELS, type AppRole } from "../lib/roles";

export type JobRoleOption = { id: string; name: string };

function roleKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+user$/, "");
}

export function userMatchesJobRole(user: ApiUser, role: JobRoleOption): boolean {
  const assigned = user.roles ?? [];
  if (assigned.length > 0) {
    return assigned.some((r) => r.id === role.id || r.name.toLowerCase() === role.name.toLowerCase());
  }
  const legacy = (user.role ?? "").toLowerCase();
  if (!legacy) return false;
  const key = roleKey(role.name);
  const label = ROLE_LABELS[legacy as AppRole]?.toLowerCase();
  return legacy === key || label === role.name.toLowerCase();
}

export function roleIdForUser(user: ApiUser | undefined, roles: JobRoleOption[] = []): string {
  if (!user) return "";
  if (user.roles?.[0]?.id) return user.roles[0].id;
  return roles.find((r) => userMatchesJobRole(user, r))?.id ?? "";
}

export function staffMatchingRole(users: ApiUser[] | undefined, role: JobRoleOption | undefined): ApiUser[] {
  if (!role) return [];
  const matching = (users ?? []).filter((u) => userMatchesJobRole(u, role));
  const staff = matching.filter((u) => Boolean(u.isStaff));
  return staff.length ? staff : matching;
}

export function StaffAssignFields({
  users,
  roles,
  roleId,
  userId,
  onChange,
}: {
  users: ApiUser[] | undefined;
  roles: Array<Pick<ApiRoleSummary, "id" | "name" | "status">> | undefined;
  roleId: string;
  userId: string;
  onChange: (next: { roleId: string; userId: string; name: string }) => void;
}) {
  const activeRoles = useMemo(() => {
    const byId = new Map<string, JobRoleOption>();
    for (const role of roles ?? []) {
      if (role.status === 0) continue;
      byId.set(role.id, { id: role.id, name: role.name });
    }
    for (const user of users ?? []) {
      for (const role of user.roles ?? []) {
        if (!byId.has(role.id)) byId.set(role.id, { id: role.id, name: role.name });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [roles, users]);

  const selectedRole = activeRoles.find((r) => r.id === roleId);
  const options = useMemo(() => staffMatchingRole(users, selectedRole), [users, selectedRole]);

  return (
    <>
      <label className="field">
        <span>Job role</span>
        <select
          value={roleId}
          onChange={(e) => {
            const nextRole = e.target.value;
            const role = activeRoles.find((r) => r.id === nextRole);
            const still = staffMatchingRole(users, role).find((u) => u.id === userId);
            onChange({
              roleId: nextRole,
              userId: still?.id ?? "",
              name: still?.name ?? "",
            });
          }}
        >
          <option value="">Select job role</option>
          {activeRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Assigned to</span>
        <select
          value={userId}
          disabled={!roleId}
          onChange={(e) => {
            const id = e.target.value;
            const name = options.find((u) => u.id === id)?.name ?? "";
            onChange({ roleId, userId: id, name });
          }}
        >
          <option value="">{roleId ? "Unassigned" : "Select job role first"}</option>
          {options.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
