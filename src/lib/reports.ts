import { api } from "./api";
import type { Party, Transaction } from "../db/types";

export async function salesSummary(companyId: string) {
  const { transactions } = await api.transactions.list(companyId);
  const sales = transactions.filter((t) => t.type === "sale");
  const purchases = transactions.filter((t) => t.type === "purchase");
  const paymentIn = transactions.filter((t) => t.type === "payment_in");
  const paymentOut = transactions.filter((t) => t.type === "payment_out");

  const sum = (rows: Transaction[]) => rows.reduce((acc, row) => acc + row.grandTotal, 0);

  return {
    salesCount: sales.length,
    salesTotal: sum(sales),
    purchaseCount: purchases.length,
    purchaseTotal: sum(purchases),
    paymentInTotal: sum(paymentIn),
    paymentOutTotal: sum(paymentOut),
    sales,
  };
}

export async function partyLedger(companyId: string, partyId: string) {
  const [{ parties }, { transactions }] = await Promise.all([
    api.parties.list(companyId),
    api.transactions.list(companyId),
  ]);
  const party = parties.find((p) => p.id === partyId);
  if (!party) return null;

  const txns = transactions
    .filter((t) => t.partyId === partyId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  let balance =
    party.balanceType === "to_receive" ? party.openingBalance : -party.openingBalance;

  const rows = txns.map((t) => {
    if (t.type === "sale" || t.type === "payment_out") balance += t.grandTotal;
    if (t.type === "purchase" || t.type === "payment_in") balance -= t.grandTotal;
    return { ...t, runningBalance: balance };
  });

  return { party, rows, closingBalance: balance };
}

export async function profitAndLossLite(companyId: string) {
  const { transactions } = await api.transactions.list(companyId);
  const sales = transactions.filter((t) => t.type === "sale");
  const purchases = transactions.filter((t) => t.type === "purchase");

  const revenue = sales.reduce((s, t) => s + t.subtotal, 0);
  const salesTax = sales.reduce((s, t) => s + t.taxTotal, 0);
  const cogs = purchases.reduce((s, t) => s + t.subtotal, 0);
  const purchaseTax = purchases.reduce((s, t) => s + t.taxTotal, 0);
  const gross = revenue - cogs;

  return {
    revenue,
    salesTax,
    cogs,
    purchaseTax,
    gross,
    netLite: gross,
  };
}

export async function partyBalances(
  companyId: string,
): Promise<Array<Party & { computed: number }>> {
  const [{ parties }, { transactions }] = await Promise.all([
    api.parties.list(companyId),
    api.transactions.list(companyId),
  ]);

  return parties.map((party) => {
    let balance =
      party.balanceType === "to_receive" ? party.openingBalance : -party.openingBalance;
    for (const t of transactions.filter((x) => x.partyId === party.id)) {
      if (t.type === "sale" || t.type === "payment_out") balance += t.grandTotal;
      if (t.type === "purchase" || t.type === "payment_in") balance -= t.grandTotal;
    }
    return { ...party, computed: balance };
  });
}
