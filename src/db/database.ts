import Dexie, { type EntityTable } from "dexie";
import type {
  AppMeta,
  Company,
  Item,
  LineItem,
  Party,
  PaymentType,
  Transaction,
  UserSession,
} from "./types";

export class LedgerlyDB extends Dexie {
  sessions!: EntityTable<UserSession, "id">;
  companies!: EntityTable<Company, "id">;
  parties!: EntityTable<Party, "id">;
  items!: EntityTable<Item, "id">;
  paymentTypes!: EntityTable<PaymentType, "id">;
  transactions!: EntityTable<Transaction, "id">;
  lineItems!: EntityTable<LineItem, "id">;
  meta!: EntityTable<AppMeta, "key">;

  constructor() {
    super("ledgerly");
    this.version(1).stores({
      sessions: "id, phone",
      companies: "id, name",
      parties: "id, companyId, name, type",
      items: "id, companyId, name, sku",
      paymentTypes: "id, companyId, kind",
      transactions: "id, companyId, type, date, partyId, number",
      lineItems: "id, companyId, transactionId, itemId",
      meta: "key",
    });
  }
}

export const db = new LedgerlyDB();

export function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
