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
