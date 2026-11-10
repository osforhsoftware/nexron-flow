import type { AppRole } from "../lib/roles";

export type PartyType = "customer" | "supplier" | "both";
export type TxnType = "sale" | "purchase" | "payment_in" | "payment_out";
export type PaymentKind = "cash" | "bank" | "cheque" | "upi" | "loan" | "other";

export interface UserSession {
  id: string;
  username: string;
  phone?: string;
  name: string;
  email?: string;
  role: AppRole;
  modules: string[];
  loggedInAt: string;
}

export interface Company {
  id: string;
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  state?: string;
  /** Business origin: AE (UAE) or IN (India) */
  country: string;
  currency: string;
  createdAt: string;
}

export interface Party {
  id: string;
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  type: PartyType;
  openingBalance: number;
  balanceType: "to_receive" | "to_pay";
  address?: string;
  createdAt: string;
}

export interface Item {
  id: string;
  companyId: string;
  name: string;
  sku?: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  stockQty: number;
  taxPercent: number;
  category?: string;
  createdAt: string;
}

export interface PaymentType {
  id: string;
  companyId: string;
  name: string;
  kind: PaymentKind;
  openingBalance: number;
}

export interface Transaction {
  id: string;
  companyId: string;
  type: TxnType;
  number: string;
  date: string;
  partyId?: string;
  paymentTypeId?: string;
  notes?: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt: string;
}

export interface LineItem {
  id: string;
  companyId: string;
  transactionId: string;
  itemId?: string;
  name: string;
  qty: number;
  rate: number;
  taxPercent: number;
  amount: number;
}

export interface AppMeta {
  key: string;
  value: string;
}
