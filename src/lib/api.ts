import type {
  Company,
  Item,
  LineItem,
  Party,
  PaymentType,
  Transaction,
} from "../db/types";
import type { AppRole } from "./roles";

const TOKEN_KEY = "ledgerly.api.token";
const COMPANY_KEY = "ledgerly.api.companyId";

export type ApiUser = {
  id: string;
  username: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  role: AppRole;
  modules: string[];
};

type TxnWithLines = Transaction & { lineItems?: LineItem[] };

function baseUrl(): string {
  return import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredCompanyId(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

export function setStoredCompanyId(id: string | null) {
  try {
    if (id) localStorage.setItem(COMPANY_KEY, id);
    else localStorage.removeItem(COMPANY_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  } catch {
    throw new Error("PHP API offline. Start backend on port 4000.");
  }

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? "Invalid JSON from API"
        : `API error (${res.status}). Is PHP server running? (backend: php -S 127.0.0.1:4000 server.php)`,
    );
  }

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  login: (username: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: ApiUser }>("/api/auth/me"),

  companies: {
    list: () => request<{ companies: Company[] }>("/api/companies"),
    get: (id: string) => request<{ company: Company }>(`/api/companies/${id}`),
    create: (body: Partial<Company> & { name: string; phone: string }) =>
      request<{ company: Company }>("/api/companies", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<Company>) =>
      request<{ company: Company }>(`/api/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  parties: {
    list: (companyId: string) =>
      request<{ parties: Party[] }>(`/api/parties?companyId=${encodeURIComponent(companyId)}`),
    create: (body: Omit<Party, "id" | "createdAt">) =>
      request<{ party: Party }>("/api/parties", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Party>) =>
      request<{ party: Party }>(`/api/parties/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/parties/${id}`, { method: "DELETE" }),
  },

  items: {
    list: (companyId: string) =>
      request<{ items: Item[] }>(`/api/items?companyId=${encodeURIComponent(companyId)}`),
    create: (body: Omit<Item, "id" | "createdAt">) =>
      request<{ item: Item }>("/api/items", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Item>) =>
      request<{ item: Item }>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/items/${id}`, { method: "DELETE" }),
  },

  payments: {
    accounts: (companyId: string) =>
      request<{ accounts: PaymentType[] }>(
        `/api/payments/accounts?companyId=${encodeURIComponent(companyId)}`,
      ),
    createAccount: (body: Omit<PaymentType, "id"> & { companyId: string }) =>
      request<{ account: PaymentType }>("/api/payments/accounts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  transactions: {
    list: (companyId: string, type?: string) => {
      const q = new URLSearchParams({ companyId });
      if (type) q.set("type", type);
      return request<{ transactions: TxnWithLines[] }>(`/api/transactions?${q}`);
    },
    create: (body: {
      companyId: string;
      type: Transaction["type"];
      number: string;
      date: string;
      partyId?: string;
      paymentTypeId?: string;
      notes?: string;
      subtotal: number;
      taxTotal: number;
      grandTotal: number;
      lines?: Array<{
        itemId?: string;
        name: string;
        qty: number;
        rate: number;
        taxPercent?: number;
        amount: number;
      }>;
    }) =>
      request<{ transaction: TxnWithLines }>("/api/transactions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/transactions/${id}`, { method: "DELETE" }),
  },

  master: {
    list: (companyId: string, kind?: string) => {
      const q = new URLSearchParams({ companyId });
      if (kind) q.set("kind", kind);
      return request<{ masterData: Array<Record<string, unknown>> }>(`/api/master?${q}`);
    },
  },

  docs: {
    list: (companyId: string, type: string) => {
      const q = new URLSearchParams({ companyId, type });
      return request<{
        docs: Array<{
          id: string;
          companyId: string;
          docType: string;
          number: string;
          date: string;
          partyId?: string | null;
          status: string;
          notes?: string | null;
          subtotal: number;
          taxTotal: number;
          grandTotal: number;
          convertedToId?: string | null;
          convertedToType?: string | null;
          createdAt: string;
          lines: Array<{
            id: string;
            itemId?: string | null;
            name: string;
            qty: number;
            rate: number;
            taxPercent: number;
            amount: number;
          }>;
        }>;
      }>(`/api/docs?${q}`);
    },
    create: (body: {
      companyId: string;
      docType: string;
      date: string;
      partyId?: string;
      notes?: string;
      number?: string;
      subtotal: number;
      taxTotal: number;
      grandTotal: number;
      lines: Array<{
        itemId?: string;
        name: string;
        qty: number;
        rate: number;
        taxPercent?: number;
        amount: number;
      }>;
    }) =>
      request<{ doc: { id: string } }>("/api/docs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    convert: (id: string) =>
      request<{ ok: boolean; toId: string; toType: string }>(`/api/docs/${id}/convert`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  },
};
