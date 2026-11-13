import { canAccessModule, type PermissionSession } from "./permissions";

export type AppRole = "admin" | "office" | "field" | "store" | "accounts";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  office: "Office",
  field: "Field",
  store: "Store",
  accounts: "Accounts",
};

/**
 * Map sidebar routes to SubModule.directory keys (must match DB directories).
 * Child sales/purchase routes use fine-grained directories.
 */
export const ROUTE_MODULE: Record<string, string> = {
  "/": "dashboard",
  "/parties": "parties",
  "/items": "items",
  "/items/products": "items",
  "/items/services": "items",
  "/items/equipment": "equipment",
  "/service": "service_calls",
  "/service/calls": "service_calls",
  "/service/calls/new": "service_calls",
  "/sales": "new_invoice",
  "/sales/quick": "new_invoice",
  "/sales/quotations": "quotations",
  "/sales/orders": "sale_orders",
  "/sales/delivery": "delivery",
  "/purchases": "purchases",
  "/purchases/bills": "purchase_bills",
  "/purchases/orders": "purchase_orders",
  "/purchases/rfq": "rfq",
  "/purchases/grn": "grn",
  "/purchases/returns": "purchase_returns",
  "/payments": "payments",
  "/reports": "reports",
  "/companies": "companies",
  "/settings": "settings",
  "/backup": "backup",
  "/utilities": "utilities",
  "/roles": "roles",
  "/users": "users",
};

export function canOpenRoute(
  modulesOrSession: string[] | PermissionSession | undefined,
  to: string,
): boolean {
  const directory = ROUTE_MODULE[to] ?? to.replace(/^\//, "").replace(/\//g, "_");

  if (Array.isArray(modulesOrSession) || modulesOrSession === undefined) {
    if (!modulesOrSession?.length) return false;
    if (modulesOrSession.includes("dashboard") && modulesOrSession.length > 8) return true;
    if (modulesOrSession.includes(directory)) return true;
    // Parent aliases for legacy modules[] payloads.
    const parent =
      directory === "equipment"
        ? "items"
        : directory === "service_calls"
          ? "service_calls"
          : ["new_invoice", "quotations", "sale_orders", "delivery"].includes(directory)
            ? "sales"
            : ["rfq", "purchase_orders", "grn", "purchase_returns", "purchase_bills"].includes(directory)
              ? "purchases"
              : null;
    return parent ? modulesOrSession.includes(parent) : false;
  }

  return canAccessModule(modulesOrSession, directory);
}

/** Dashboard / mobile home layout profile from role + permissions. */
export type MobileHomeProfile = "admin" | "sales" | "store" | "accounts" | "office";

export function getMobileHomeProfile(
  session: PermissionSession | null | undefined,
): MobileHomeProfile {
  const role = (session?.role ?? "office") as AppRole;
  if (role === "admin" || session?.isSuperAdmin || session?.userType === 1) return "admin";
  if (role === "field") return "sales";
  if (role === "store") return "store";
  if (role === "accounts") return "accounts";
  // Office: prefer sales home when they can create invoices but lack admin modules.
  const canSale =
    canAccessModule(session, "new_invoice") ||
    canAccessModule(session, "sales") ||
    canAccessModule(session, "sale_orders");
  const canAdmin =
    canAccessModule(session, "roles") ||
    canAccessModule(session, "settings") ||
    canAccessModule(session, "companies");
  if (canSale && !canAdmin) return "sales";
  return "office";
}

/** True when the user should get the fast-track Quick Order Entry surface. */
export function prefersQuickOrder(session: PermissionSession | null | undefined): boolean {
  const profile = getMobileHomeProfile(session);
  if (profile !== "sales" && profile !== "office") return false;
  return (
    canAccessModule(session, "new_invoice") ||
    canAccessModule(session, "sales") ||
    canAccessModule(session, "sale_orders")
  );
}
