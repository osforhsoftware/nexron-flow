import type { CompanyCurrency } from "./companyLocale";
import { normalizeCurrency } from "./companyLocale";

export function money(amount: number, currency: string = "AED"): string {
  const code = normalizeCurrency(currency) as CompanyCurrency;
  const locale = code === "INR" ? "en-IN" : "en-AE";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

/** @deprecated Prefer money(amount, company.currency) */
export function inr(amount: number): string {
  return money(amount, "INR");
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Round to 2 decimal places (money). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Line amount excluding tax.
 * Legacy rows stored (qty×rate after discount)×(1+tax%); current rows store taxable only.
 */
export function lineAmountExTax(line: {
  qty: number;
  rate: number;
  taxPercent: number;
  amount: number;
  discountPercent?: number | null;
}): number {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rate) || 0;
  const tax = Number(line.taxPercent) || 0;
  const discount = Number(line.discountPercent) || 0;
  const amount = Number(line.amount) || 0;
  if (tax <= 0) return roundMoney(amount);
  const base = roundMoney(qty * rate * (1 - discount / 100));
  const inclusive = roundMoney(base * (1 + tax / 100));
  if (Math.abs(amount - inclusive) < 0.05) return base;
  return roundMoney(amount);
}

/** Tax amount for a line (handles legacy tax-inclusive amount rows). */
export function lineTaxAmount(line: {
  qty: number;
  rate: number;
  taxPercent: number;
  amount: number;
  discountPercent?: number | null;
}): number {
  const tax = Number(line.taxPercent) || 0;
  if (tax <= 0) return 0;
  const exclusive = lineAmountExTax(line);
  return roundMoney((exclusive * tax) / 100);
}
