export type CompanyCountry = "AE" | "IN";
export type CompanyCurrency = "AED" | "INR";

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

export function normalizeCountry(value?: string | null): CompanyCountry {
  return value === "IN" ? "IN" : "AE";
}

export function normalizeCurrency(value?: string | null): CompanyCurrency {
  return value === "INR" ? "INR" : "AED";
}

export function originOf(country?: string | null) {
  const code = normalizeCountry(country);
  return COMPANY_ORIGINS.find((o) => o.code === code) ?? COMPANY_ORIGINS[0];
}

export function defaultCurrencyForCountry(country?: string | null): CompanyCurrency {
  return originOf(country).currency;
}

export function taxOptionsForCountry(country?: string | null): { value: string; label: string }[] {
  if (normalizeCountry(country) === "IN") {
    return [
      { value: "0", label: "IGST@0%" },
      { value: "5", label: "GST@5%" },
      { value: "12", label: "GST@12%" },
      { value: "18", label: "GST@18%" },
      { value: "28", label: "GST@28%" },
    ];
  }
  return [
    { value: "0", label: "VAT@0%" },
    { value: "5", label: "VAT@5%" },
  ];
}
