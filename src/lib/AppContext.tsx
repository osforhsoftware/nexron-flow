import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Company, UserSession } from "../db/types";
import { api, getStoredCompanyId, getToken, setStoredCompanyId, setToken, type ApiUser } from "./api";
import { anyCan, can, canAccessModule, type PermissionAction } from "./permissions";

interface AppState {
  ready: boolean;
  session: UserSession | null;
  company: Company | null;
  companies: Company[];
  apiOnline: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  refreshCompanies: () => Promise<void>;
  updateCompany: (patch: Partial<Company> & { id: string }) => Promise<void>;
  canAccess: (module: string) => boolean;
  can: (directory: string, action: PermissionAction) => boolean;
  anyCan: (directories: string[], action: PermissionAction) => boolean;
}

const Ctx = createContext<AppState | null>(null);

function toSession(user: ApiUser): UserSession {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone ?? undefined,
    email: user.email ?? undefined,
    role: user.role,
    userType: user.userType ?? 0,
    isSuperAdmin: Boolean(user.isSuperAdmin || user.userType === 1 || user.role === "admin"),
    modules: user.modules ?? [],
    permissions: user.permissions ?? {},
    roles: user.roles ?? [],
    loggedInAt: new Date().toISOString(),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [apiOnline, setApiOnline] = useState(false);

  const boot = useCallback(async () => {
    try {
      await api.health();
      setApiOnline(true);
    } catch {
      setApiOnline(false);
      setReady(true);
      return;
    }

    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }

    try {
      const { user } = await api.me();
      setSession(toSession(user));
      const { companies: list } = await api.companies.list();
      setCompanies(list);
      const saved = getStoredCompanyId();
      const current = list.find((c) => c.id === saved) ?? list[0] ?? null;
      setCompany(current);
      if (current) setStoredCompanyId(current.id);
    } catch {
      setToken(null);
      setSession(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    if (!ready || !company?.id || !session) return;
    if (!can(session, "backup", "read")) return;
    void api.backups.list(company.id).catch(() => undefined);
  }, [ready, company?.id, session]);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await api.login(username.trim(), password);
    setToken(token);
    setSession(toSession(user));
    const { companies: list } = await api.companies.list();
    setCompanies(list);
    const current = list[0] ?? null;
    setCompany(current);
    if (current) setStoredCompanyId(current.id);
    setApiOnline(true);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setSession(null);
    setCompany(null);
    setCompanies([]);
  }, []);

  const refreshCompanies = useCallback(async () => {
    const { companies: list } = await api.companies.list();
    setCompanies(list);
    setCompany((prev) => {
      if (!prev) return list[0] ?? null;
      return list.find((c) => c.id === prev.id) ?? list[0] ?? null;
    });
  }, []);

  const switchCompany = useCallback(async (companyId: string) => {
    const { company: next } = await api.companies.get(companyId);
    if (!next?.id) throw new Error("Company not found");
    setStoredCompanyId(next.id);
    setCompany(next);
  }, []);

  const updateCompany = useCallback(
    async (patch: Partial<Company> & { id: string }) => {
      const { id, ...body } = patch;
      const { company: next } = await api.companies.update(id, body);
      if (!next?.id) throw new Error("Company update failed");
      await refreshCompanies();
    },
    [refreshCompanies],
  );

  const canAccess = useCallback(
    (module: string) => canAccessModule(session, module),
    [session],
  );

  const canPerm = useCallback(
    (directory: string, action: PermissionAction) => can(session, directory, action),
    [session],
  );

  const anyCanPerm = useCallback(
    (directories: string[], action: PermissionAction) => anyCan(session, directories, action),
    [session],
  );

  const value = useMemo(
    () => ({
      ready,
      session,
      company,
      companies,
      apiOnline,
      login,
      logout,
      switchCompany,
      refreshCompanies,
      updateCompany,
      canAccess,
      can: canPerm,
      anyCan: anyCanPerm,
    }),
    [
      ready,
      session,
      company,
      companies,
      apiOnline,
      login,
      logout,
      switchCompany,
      refreshCompanies,
      updateCompany,
      canAccess,
      canPerm,
      anyCanPerm,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
