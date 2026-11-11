import type {
  CommercialDoc,
  Company,
  DocRevision,
  Equipment,
  Item,
  ItemCategory,
  LineItem,
  Party,
  PartyServiceType,
  PaymentType,
  Transaction,
} from "../db/types";
import type { AppRole } from "./roles";

type DocLineInput = {
  itemId?: string;
  name: string;
  qty: number;
  receivedQty?: number | null;
  rate: number;
  taxPercent?: number;
  discountPercent?: number;
  unit?: string;
  amount: number;
};

type DocWriteBody = {
  companyId?: string;
  docType?: string;
  date: string;
  partyId?: string;
  notes?: string;
  terms?: string;
  number?: string;
  status?: string;
  validUntil?: string;
  followUpDate?: string;
  billingAddress?: string;
  stateOfSupply?: string;
  priceTaxMode?: string;
  roundOff?: boolean;
  discountTotal?: number;
  refNo?: string;
  originalBillNo?: string;
  changeNote?: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: DocLineInput[];
};

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
    throw new Error("PHP API offline. Start XAMPP Apache (mems-backend).");
  }

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? "Invalid JSON from API"
        : `API error (${res.status}). Is Apache running? Check http://127.0.0.1/mems-backend/api/health`,
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

  partyTypes: {
    list: (companyId: string) =>
      request<{ types: PartyServiceType[] }>(
        `/api/party-types?companyId=${encodeURIComponent(companyId)}`,
      ),
    create: (body: { companyId: string; name: string }) =>
      request<{ type: PartyServiceType }>("/api/party-types", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/party-types/${id}`, { method: "DELETE" }),
  },

  equipment: {
    list: (companyId: string) =>
      request<{ equipment: Equipment[] }>(
        `/api/equipment?companyId=${encodeURIComponent(companyId)}`,
      ),
    create: (body: Partial<Equipment> & { companyId: string; name: string; serialNumber: string }) =>
      request<{ equipment: Equipment }>("/api/equipment", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<Equipment>, companyId?: string) => {
      const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      return request<{ equipment: Equipment }>(`/api/equipment/${id}${q}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
  },

  itemCategories: {
    list: (companyId: string) =>
      request<{ categories: ItemCategory[] }>(
        `/api/item-categories?companyId=${encodeURIComponent(companyId)}`,
      ),
    create: (body: { companyId: string; name: string }) =>
      request<{ category: ItemCategory }>("/api/item-categories", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/item-categories/${id}`, { method: "DELETE" }),
  },

  items: {
    list: (companyId: string, itemType?: "product" | "service") => {
      const q = new URLSearchParams({ companyId });
      if (itemType) q.set("itemType", itemType);
      return request<{ items: Item[] }>(`/api/items?${q.toString()}`);
    },
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
    get: (id: string) => request<{ transaction: TxnWithLines }>(`/api/transactions/${id}`),
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
    update: (
      id: string,
      body: {
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
      },
    ) =>
      request<{ transaction: TxnWithLines }>(`/api/transactions/${id}`, {
        method: "PATCH",
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
      return request<{ docs: CommercialDoc[] }>(`/api/docs?${q}`);
    },
    get: (id: string) => request<{ doc: CommercialDoc }>(`/api/docs/${id}`),
    create: (body: DocWriteBody & { companyId: string; docType: string }) =>
      request<{ doc: CommercialDoc }>("/api/docs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: DocWriteBody) =>
      request<{ doc: CommercialDoc }>(`/api/docs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/api/docs/${id}`, { method: "DELETE" }),
    clone: (id: string) =>
      request<{ doc: CommercialDoc }>(`/api/docs/${id}/clone`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    setStatus: (id: string, status: string) =>
      request<{ doc: CommercialDoc }>(`/api/docs/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    revisions: (id: string) =>
      request<{ revisions: DocRevision[] }>(`/api/docs/${id}/revisions`),
    convert: (
      id: string,
      body: {
        lines?: DocLineInput[];
        invoiceNo?: string;
        paymentTypeId?: string;
      } = {},
    ) =>
      request<{ ok: boolean; toId: string; toType: string }>(`/api/docs/${id}/convert`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    revoke: (id: string) =>
      request<{ ok: boolean; doc: CommercialDoc }>(`/api/docs/${id}/revoke`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    postStock: (id: string) =>
      request<{ doc: CommercialDoc }>(`/api/docs/${id}/post-stock`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  },

  scan: {
    product: (id: string) =>
      request<ProductScan>(`/api/scan/product/${encodeURIComponent(id)}`),
    equipment: (id: string) =>
      request<EquipmentScan>(`/api/scan/equipment/${encodeURIComponent(id)}`),
  },
};

export type ProductScan = {
  kind: "product";
  companyName: string;
  currency: string;
  record: Item;
};

export type EquipmentScan = {
  kind: "equipment";
  companyName: string;
  currency: string;
  record: Equipment;
};
