export type PermissionAction = "create" | "read" | "update" | "delete";

export type PermissionEntry = {
  create?: boolean;
  read?: boolean;
  update?: boolean;
  delete?: boolean;
};

export type PermissionMap = Record<string, PermissionEntry>;

export type PermissionSession = {
  isSuperAdmin?: boolean;
  userType?: number;
  role?: string;
  permissions?: PermissionMap | null;
  modules?: string[];
};

/** True when session is a super admin (user_type == 1) or legacy admin role. */
export function isSuperAdmin(session: PermissionSession | null | undefined): boolean {
  if (!session) return false;
  if (session.isSuperAdmin) return true;
  if (session.userType === 1) return true;
  return session.role === "admin";
}

/**
 * Check a single SubModule.directory permission from the session payload.
 * Keys must match the exact `directory` string saved in the database
 * (e.g. "new_invoice", "parties", "roles").
 */
export function can(
  session: PermissionSession | null | undefined,
  directory: string,
  action: PermissionAction,
): boolean {
  if (!session) return false;
  if (isSuperAdmin(session)) return true;
  const entry = session.permissions?.[directory];
  if (!entry) return false;
  return Boolean(entry[action]);
}

/** True if any of the directories allow the given action. */
export function anyCan(
  session: PermissionSession | null | undefined,
  directories: string[],
  action: PermissionAction,
): boolean {
  if (!session) return false;
  if (isSuperAdmin(session)) return true;
  return directories.some((directory) => can(session, directory, action));
}

/** Module-level nav helper: read access on directory or legacy modules[] list. */
export function canAccessModule(
  session: PermissionSession | null | undefined,
  moduleOrDirectory: string,
): boolean {
  if (!session) return false;
  if (isSuperAdmin(session)) return true;
  if (can(session, moduleOrDirectory, "read")) return true;
  return Boolean(session.modules?.includes(moduleOrDirectory));
}
