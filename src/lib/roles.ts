export type AppRole = "admin" | "office" | "field" | "store" | "accounts";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  office: "Office",
  field: "Field",
  store: "Store",
  accounts: "Accounts",
};

/** Map sidebar routes to module keys used by PHP Roles::MODULES */
export const ROUTE_MODULE: Record<string, string> = {
  "/": "dashboard",
  "/parties": "parties",
  "/items": "items",
  "/sales": "sales",
  "/purchases": "purchases",
  "/payments": "payments",
  "/reports": "reports",
  "/companies": "companies",
  "/settings": "settings",
  "/backup": "backup",
  "/utilities": "utilities",
};

export function canOpenRoute(modules: string[] | undefined, to: string): boolean {
  if (!modules?.length) return false;
  if (modules.includes("dashboard") && modules.length > 8) return true; // admin-like
  const module = ROUTE_MODULE[to] ?? to.replace(/^\//, "");
  return modules.includes(module);
}
