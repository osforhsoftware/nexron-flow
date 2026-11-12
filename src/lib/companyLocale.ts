export type CompanyCountry = "AE" | "IN";
export type CompanyCurrency = "AED" | "INR";
export type TaxType = "GST" | "VAT";

export const COMPANY_ORIGINS: {
  code: CompanyCountry;
  label: string;
  currency: CompanyCurrency;
  taxIdLabel: string;
  regionLabel: string;
}[] = [
  {
    code: "AE",
    label: "United Arab Emirates",
    currency: "AED",
    taxIdLabel: "TRN",
    regionLabel: "Emirate",
  },
  {
    code: "IN",
    label: "India",
    currency: "INR",
    taxIdLabel: "GSTIN",
    regionLabel: "State",
  },
];

export const COMPANY_CURRENCIES: { code: CompanyCurrency; label: string }[] = [
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "INR", label: "INR — Indian Rupee" },
];

export const TAX_TYPES: { code: TaxType; label: string; hint: string }[] = [
  { code: "GST", label: "GST (India)", hint: "IGST / GST slab rates for Indian invoices" },
  { code: "VAT", label: "VAT (Dubai / UAE)", hint: "Only UAE VAT rates: 5% standard and 0% zero-rated" },
];

export function normalizeCountry(value?: string | null): CompanyCountry {
  return value === "IN" ? "IN" : "AE";
}

export function normalizeCurrency(value?: string | null): CompanyCurrency {
  return value === "INR" ? "INR" : "AED";
}

export function defaultTaxTypeForCountry(country?: string | null): TaxType {
  return normalizeCountry(country) === "IN" ? "GST" : "VAT";
}

export function normalizeTaxType(
  value?: string | null,
  country?: string | null,
): TaxType {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "GST" || code === "VAT") return code;
  return defaultTaxTypeForCountry(country);
}

export function originOf(country?: string | null) {
  const code = normalizeCountry(country);
  return COMPANY_ORIGINS.find((o) => o.code === code) ?? COMPANY_ORIGINS[0];
}

export function defaultCurrencyForCountry(country?: string | null): CompanyCurrency {
  return originOf(country).currency;
}

/** Dubai / UAE VAT — only applicable rates. */
const VAT_OPTIONS = [
  { value: "5", label: "VAT@5% (Standard)" },
  { value: "0", label: "VAT@0% (Zero Rated)" },
] as const;

const GST_OPTIONS = [
  { value: "0", label: "IGST@0%" },
  { value: "5", label: "GST@5%" },
  { value: "12", label: "GST@12%" },
  { value: "18", label: "GST@18%" },
  { value: "28", label: "GST@28%" },
] as const;

export function taxOptionsForTaxType(taxType?: string | null): { value: string; label: string }[] {
  if (normalizeTaxType(taxType) === "GST") {
    return [...GST_OPTIONS];
  }
  return [...VAT_OPTIONS];
}

export function defaultTaxPercentForTaxType(taxType?: string | null): string {
  return normalizeTaxType(taxType) === "GST" ? "18" : "5";
}

/** Prefer company.taxType; fall back to country default (IN→GST, AE→VAT). */
export function taxOptionsForCompany(company?: {
  taxType?: string | null;
  country?: string | null;
} | null): { value: string; label: string }[] {
  return taxOptionsForTaxType(normalizeTaxType(company?.taxType, company?.country));
}

/** @deprecated Use taxOptionsForCompany / taxOptionsForTaxType */
export function taxOptionsForCountry(country?: string | null): { value: string; label: string }[] {
  return taxOptionsForTaxType(defaultTaxTypeForCountry(country));
}
