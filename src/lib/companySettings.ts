import type { CompanyCountry } from "./companyLocale";

export type LedgerMapKey =
  | "sales"
  | "purchase"
  | "salesReturn"
  | "purchaseReturn"
  | "debtors"
  | "creditors"
  | "taxPayable"
  | "taxReceivable"
  | "discountAllowed"
  | "discountReceived"
  | "roundOff"
  | "cash"
  | "bank";

export const LEDGER_FIELDS: { key: LedgerMapKey; label: string; hint: string }[] = [
  { key: "sales", label: "Sales / Income", hint: "Credit for sale invoices" },
  { key: "purchase", label: "Purchase / Expense", hint: "Debit for purchase bills" },
  { key: "salesReturn", label: "Sales Return", hint: "Credit notes / sale returns" },
  { key: "purchaseReturn", label: "Purchase Return", hint: "Debit notes / purchase returns" },
  { key: "debtors", label: "Sundry Debtors", hint: "Party receivables" },
  { key: "creditors", label: "Sundry Creditors", hint: "Party payables" },
  { key: "taxPayable", label: "Output Tax Payable", hint: "GST/VAT collected on sales" },
  { key: "taxReceivable", label: "Input Tax Receivable", hint: "GST/VAT paid on purchases" },
  { key: "discountAllowed", label: "Discount Allowed", hint: "Discounts given to parties" },
  { key: "discountReceived", label: "Discount Received", hint: "Discounts from suppliers" },
  { key: "roundOff", label: "Round Off", hint: "Invoice rounding differences" },
  { key: "cash", label: "Cash-in-Hand", hint: "Default cash ledger" },
  { key: "bank", label: "Bank Accounts", hint: "Default bank ledger" },
];

export type FyPreset = "india" | "calendar" | "custom";

export interface AccountingSettings {
  fyPreset: FyPreset;
  fyStartMonth: number;
  fyStartDay: number;
  bookBeginningDate: string;
  lockOutsideFy: boolean;
  preventBackdatedBeforeBooks: boolean;
  ledgers: Record<LedgerMapKey, string>;
  defaultCashAccountId: string;
  defaultBankAccountId: string;
}

export interface TransactionSettings {
  invoicePrefix: string;
  estimatePrefix: string;
  enableCreditSale: boolean;
  defaultDueDays: number;
  enableRoundOff: boolean;
  updateStockOnSale: boolean;
  allowNegativeStock: boolean;
}

export interface ServiceReminderSettings {
  enabled: boolean;
  daysBeforeDue: number;
  notifyOnOverdue: boolean;
  includeEquipment: boolean;
}

export interface PartySettings {
  enableGrouping: boolean;
  enableShippingAddress: boolean;
  managePartyStatus: boolean;
  paymentReminderEnabled: boolean;
  paymentReminderDays: number;
}

export interface ItemSettings {
  enableItems: boolean;
  sellType: "product_service" | "product" | "service";
  stockMaintenance: boolean;
  showLowStock: boolean;
  enableUnits: boolean;
  enableCategory: boolean;
  itemWiseTax: boolean;
  itemWiseDiscount: boolean;
  enableMrp: boolean;
  enableBatchNo: boolean;
  enableSerialTracking: boolean;
}

export interface PrintSettingsState {
  printerMode: "regular" | "thermal";
  layoutTheme: 1 | 2 | 3 | 4;
  makeDefault: boolean;
  repeatHeader: boolean;
  showCompanyName: boolean;
  showLogo: boolean;
  showAddress: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  showTaxDetails: boolean;
  showYouSaved: boolean;
  showTerms: boolean;
  showSignatory: boolean;
}

export interface MessageSettingsState {
  channel: "nexron" | "whatsapp";
  sendToParty: boolean;
  sendUpdate: boolean;
  sendCopyToSelf: boolean;
  includeBalance: boolean;
  includeWebLink: boolean;
  includePaymentLink: boolean;
  template: string;
}

export interface CompanySettings {
  transaction: TransactionSettings;
  serviceReminders: ServiceReminderSettings;
  party: PartySettings;
  item: ItemSettings;
  print: PrintSettingsState;
  message: MessageSettingsState;
  accounting: AccountingSettings;
}

export function emptyLedgers(): Record<LedgerMapKey, string> {
  return {
    sales: "",
    purchase: "",
    salesReturn: "",
    purchaseReturn: "",
    debtors: "",
    creditors: "",
    taxPayable: "",
    taxReceivable: "",
    discountAllowed: "",
    discountReceived: "",
    roundOff: "",
    cash: "",
    bank: "",
  };
}

export function defaultLedgersForCountry(country: CompanyCountry): Record<LedgerMapKey, string> {
  const tax = country === "IN" ? "GST" : "VAT";
  return {
    sales: "Sales Account",
    purchase: "Purchase Account",
    salesReturn: "Sales Return",
    purchaseReturn: "Purchase Return",
    debtors: "Sundry Debtors",
    creditors: "Sundry Creditors",
    taxPayable: `Output ${tax}`,
    taxReceivable: `Input ${tax}`,
    discountAllowed: "Discount Allowed",
    discountReceived: "Discount Received",
    roundOff: "Round Off",
    cash: "Cash",
    bank: "Bank",
  };
}

export function defaultFyForCountry(country: CompanyCountry): Pick<AccountingSettings, "fyPreset" | "fyStartMonth" | "fyStartDay"> {
  if (country === "IN") {
    return { fyPreset: "india", fyStartMonth: 4, fyStartDay: 1 };
  }
  return { fyPreset: "calendar", fyStartMonth: 1, fyStartDay: 1 };
}

function currentBookDate(country: CompanyCountry): string {
  const { fyStartMonth, fyStartDay } = defaultFyForCountry(country);
  const now = new Date();
  let year = now.getFullYear();
  const startThisYear = new Date(year, fyStartMonth - 1, fyStartDay);
  if (now < startThisYear) year -= 1;
  return `${year}-${String(fyStartMonth).padStart(2, "0")}-${String(fyStartDay).padStart(2, "0")}`;
}

export function defaultCompanySettings(country: CompanyCountry = "AE"): CompanySettings {
  const fy = defaultFyForCountry(country);
  return {
    transaction: {
      invoicePrefix: "INV-",
      estimatePrefix: "EST-",
      enableCreditSale: true,
      defaultDueDays: 7,
      enableRoundOff: true,
      updateStockOnSale: true,
      allowNegativeStock: false,
    },
    serviceReminders: {
      enabled: true,
      daysBeforeDue: 7,
      notifyOnOverdue: true,
      includeEquipment: true,
    },
    party: {
      enableGrouping: true,
      enableShippingAddress: true,
      managePartyStatus: false,
      paymentReminderEnabled: true,
      paymentReminderDays: 7,
    },
    item: {
      enableItems: true,
      sellType: "product_service",
      stockMaintenance: true,
      showLowStock: true,
      enableUnits: true,
      enableCategory: true,
      itemWiseTax: true,
      itemWiseDiscount: true,
      enableMrp: false,
      enableBatchNo: false,
      enableSerialTracking: false,
    },
    print: {
      printerMode: "regular",
      layoutTheme: 1,
      makeDefault: true,
      repeatHeader: true,
      showCompanyName: true,
      showLogo: true,
      showAddress: true,
      showEmail: true,
      showPhone: true,
      showTaxId: true,
      showTaxDetails: true,
      showYouSaved: false,
      showTerms: true,
      showSignatory: true,
    },
    message: {
      channel: "nexron",
      sendToParty: true,
      sendUpdate: false,
      sendCopyToSelf: false,
      includeBalance: false,
      includeWebLink: true,
      includePaymentLink: false,
      template:
        "Thanks for your purchase with us!!\nInvoice Amount: {amount}\nReceived: {received}\nBalance: {balance}",
    },
    accounting: {
      ...fy,
      bookBeginningDate: currentBookDate(country),
      lockOutsideFy: true,
      preventBackdatedBeforeBooks: true,
      ledgers: defaultLedgersForCountry(country),
      defaultCashAccountId: "",
      defaultBankAccountId: "",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function mergeCompanySettings(
  raw: unknown,
  country: CompanyCountry = "AE",
): CompanySettings {
  const base = defaultCompanySettings(country);
  if (!isRecord(raw)) return base;

  const tx = isRecord(raw.transaction) ? raw.transaction : {};
  const sr = isRecord(raw.serviceReminders) ? raw.serviceReminders : {};
  const party = isRecord(raw.party) ? raw.party : {};
  const item = isRecord(raw.item) ? raw.item : {};
  const print = isRecord(raw.print) ? raw.print : {};
  const message = isRecord(raw.message) ? raw.message : {};
  const accounting = isRecord(raw.accounting) ? raw.accounting : {};
  const ledgersRaw = isRecord(accounting.ledgers) ? accounting.ledgers : {};
  const ledgers = emptyLedgers();
  for (const field of LEDGER_FIELDS) {
    ledgers[field.key] = asString(ledgersRaw[field.key], base.accounting.ledgers[field.key]);
  }

  const sellTypeRaw = asString(item.sellType, base.item.sellType);
  const sellType =
    sellTypeRaw === "product" || sellTypeRaw === "service" || sellTypeRaw === "product_service"
      ? sellTypeRaw
      : base.item.sellType;

  const fyPresetRaw = asString(accounting.fyPreset, base.accounting.fyPreset);
  const fyPreset: FyPreset =
    fyPresetRaw === "india" || fyPresetRaw === "calendar" || fyPresetRaw === "custom"
      ? fyPresetRaw
      : base.accounting.fyPreset;

  const theme = asNumber(print.layoutTheme, base.print.layoutTheme);
  const layoutTheme = ([1, 2, 3, 4].includes(theme) ? theme : 1) as 1 | 2 | 3 | 4;

  return {
    transaction: {
      invoicePrefix: asString(tx.invoicePrefix, base.transaction.invoicePrefix),
      estimatePrefix: asString(tx.estimatePrefix, base.transaction.estimatePrefix),
      enableCreditSale: asBool(tx.enableCreditSale, base.transaction.enableCreditSale),
      defaultDueDays: Math.max(0, Math.min(365, asNumber(tx.defaultDueDays, base.transaction.defaultDueDays))),
      enableRoundOff: asBool(tx.enableRoundOff, base.transaction.enableRoundOff),
      updateStockOnSale: asBool(tx.updateStockOnSale, base.transaction.updateStockOnSale),
      allowNegativeStock: asBool(tx.allowNegativeStock, base.transaction.allowNegativeStock),
    },
    serviceReminders: {
      enabled: asBool(sr.enabled, base.serviceReminders.enabled),
      daysBeforeDue: Math.max(0, Math.min(365, asNumber(sr.daysBeforeDue, base.serviceReminders.daysBeforeDue))),
      notifyOnOverdue: asBool(sr.notifyOnOverdue, base.serviceReminders.notifyOnOverdue),
      includeEquipment: asBool(sr.includeEquipment, base.serviceReminders.includeEquipment),
    },
    party: {
      enableGrouping: asBool(party.enableGrouping, base.party.enableGrouping),
      enableShippingAddress: asBool(party.enableShippingAddress, base.party.enableShippingAddress),
      managePartyStatus: asBool(party.managePartyStatus, base.party.managePartyStatus),
      paymentReminderEnabled: asBool(party.paymentReminderEnabled, base.party.paymentReminderEnabled),
      paymentReminderDays: Math.max(
        1,
        Math.min(365, asNumber(party.paymentReminderDays, base.party.paymentReminderDays)),
      ),
    },
    item: {
      enableItems: asBool(item.enableItems, base.item.enableItems),
      sellType,
      stockMaintenance: asBool(item.stockMaintenance, base.item.stockMaintenance),
      showLowStock: asBool(item.showLowStock, base.item.showLowStock),
      enableUnits: asBool(item.enableUnits, base.item.enableUnits),
      enableCategory: asBool(item.enableCategory, base.item.enableCategory),
      itemWiseTax: asBool(item.itemWiseTax, base.item.itemWiseTax),
      itemWiseDiscount: asBool(item.itemWiseDiscount, base.item.itemWiseDiscount),
      enableMrp: asBool(item.enableMrp, base.item.enableMrp),
      enableBatchNo: asBool(item.enableBatchNo, base.item.enableBatchNo),
      enableSerialTracking: asBool(item.enableSerialTracking, base.item.enableSerialTracking),
    },
    print: {
      printerMode: asString(print.printerMode, base.print.printerMode) === "thermal" ? "thermal" : "regular",
      layoutTheme,
      makeDefault: asBool(print.makeDefault, base.print.makeDefault),
      repeatHeader: asBool(print.repeatHeader, base.print.repeatHeader),
      showCompanyName: asBool(print.showCompanyName, base.print.showCompanyName),
      showLogo: asBool(print.showLogo, base.print.showLogo),
      showAddress: asBool(print.showAddress, base.print.showAddress),
      showEmail: asBool(print.showEmail, base.print.showEmail),
      showPhone: asBool(print.showPhone, base.print.showPhone),
      showTaxId: asBool(print.showTaxId, base.print.showTaxId),
      showTaxDetails: asBool(print.showTaxDetails, base.print.showTaxDetails),
      showYouSaved: asBool(print.showYouSaved, base.print.showYouSaved),
      showTerms: asBool(print.showTerms, base.print.showTerms),
      showSignatory: asBool(print.showSignatory, base.print.showSignatory),
    },
    message: {
      channel: asString(message.channel, base.message.channel) === "whatsapp" ? "whatsapp" : "nexron",
      sendToParty: asBool(message.sendToParty, base.message.sendToParty),
      sendUpdate: asBool(message.sendUpdate, base.message.sendUpdate),
      sendCopyToSelf: asBool(message.sendCopyToSelf, base.message.sendCopyToSelf),
      includeBalance: asBool(message.includeBalance, base.message.includeBalance),
      includeWebLink: asBool(message.includeWebLink, base.message.includeWebLink),
      includePaymentLink: asBool(message.includePaymentLink, base.message.includePaymentLink),
      template: asString(message.template, base.message.template),
    },
    accounting: {
      fyPreset,
      fyStartMonth: Math.max(1, Math.min(12, asNumber(accounting.fyStartMonth, base.accounting.fyStartMonth))),
      fyStartDay: Math.max(1, Math.min(28, asNumber(accounting.fyStartDay, base.accounting.fyStartDay))),
      bookBeginningDate: asString(accounting.bookBeginningDate, base.accounting.bookBeginningDate),
      lockOutsideFy: asBool(accounting.lockOutsideFy, base.accounting.lockOutsideFy),
      preventBackdatedBeforeBooks: asBool(
        accounting.preventBackdatedBeforeBooks,
        base.accounting.preventBackdatedBeforeBooks,
      ),
      ledgers,
      defaultCashAccountId: asString(accounting.defaultCashAccountId, ""),
      defaultBankAccountId: asString(accounting.defaultBankAccountId, ""),
    },
  };
}

export function applyFyPreset(preset: FyPreset): Pick<AccountingSettings, "fyPreset" | "fyStartMonth" | "fyStartDay"> {
  if (preset === "india") return { fyPreset: "india", fyStartMonth: 4, fyStartDay: 1 };
  if (preset === "calendar") return { fyPreset: "calendar", fyStartMonth: 1, fyStartDay: 1 };
  return { fyPreset: "custom", fyStartMonth: 4, fyStartDay: 1 };
}

export function financialYearRange(
  refDate: string,
  fyStartMonth: number,
  fyStartDay: number,
): { start: string; end: string; label: string } {
  const d = new Date(`${refDate}T00:00:00`);
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const month = Number.isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
  const day = Number.isNaN(d.getTime()) ? new Date().getDate() : d.getDate();

  let startYear = year;
  if (month < fyStartMonth || (month === fyStartMonth && day < fyStartDay)) {
    startYear = year - 1;
  }
  const endYear = startYear + 1;
  const start = `${startYear}-${String(fyStartMonth).padStart(2, "0")}-${String(fyStartDay).padStart(2, "0")}`;
  const endDate = new Date(endYear, fyStartMonth - 1, fyStartDay);
  endDate.setDate(endDate.getDate() - 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  const label =
    fyStartMonth === 1 && fyStartDay === 1
      ? `${startYear}`
      : `${startYear}-${String(endYear).slice(-2)}`;
  return { start, end, label };
}

export function validateAccountingSettings(accounting: AccountingSettings): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(accounting.bookBeginningDate)) {
    startError(errors, "Book beginning date is required (YYYY-MM-DD).");
  } else {
    const parsed = new Date(`${accounting.bookBeginningDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      startError(errors, "Book beginning date is invalid.");
    }
  }
  if (accounting.fyStartMonth < 1 || accounting.fyStartMonth > 12) {
    startError(errors, "Financial year start month must be between 1 and 12.");
  }
  if (accounting.fyStartDay < 1 || accounting.fyStartDay > 28) {
    startError(errors, "Financial year start day must be between 1 and 28.");
  }
  for (const field of LEDGER_FIELDS) {
    const value = accounting.ledgers[field.key]?.trim() ?? "";
    if (!value) {
      startError(errors, `${field.label} ledger mapping is required.`);
    } else if (value.length > 120) {
      startError(errors, `${field.label} ledger name is too long.`);
    }
  }
  const names = LEDGER_FIELDS.map((f) => accounting.ledgers[f.key].trim().toLowerCase()).filter(Boolean);
  const unique = new Set(names);
  if (unique.size < names.length) {
    startError(errors, "Ledger mappings must use unique ledger names.");
  }
  return errors;
}

function startError(errors: string[], message: string) {
  if (!errors.includes(message)) errors.push(message);
}

export function validateTransactionSettings(tx: TransactionSettings): string[] {
  const errors: string[] = [];
  if (!tx.invoicePrefix.trim()) errors.push("Invoice prefix is required.");
  if (!tx.estimatePrefix.trim()) errors.push("Estimate prefix is required.");
  if (tx.defaultDueDays < 0 || tx.defaultDueDays > 365) {
    errors.push("Default due days must be between 0 and 365.");
  }
  return errors;
}

export function validateServiceReminderSettings(sr: ServiceReminderSettings): string[] {
  const errors: string[] = [];
  if (sr.enabled && (sr.daysBeforeDue < 0 || sr.daysBeforeDue > 365)) {
    errors.push("Reminder days must be between 0 and 365.");
  }
  return errors;
}

export function validatePartySettings(party: PartySettings): string[] {
  const errors: string[] = [];
  if (party.paymentReminderEnabled && (party.paymentReminderDays < 1 || party.paymentReminderDays > 365)) {
    errors.push("Payment reminder days must be between 1 and 365.");
  }
  return errors;
}
