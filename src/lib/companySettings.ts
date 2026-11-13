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
}

export function defaultCompanySettings(): CompanySettings {
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

export function mergeCompanySettings(raw: unknown): CompanySettings {
  const base = defaultCompanySettings();
  if (!isRecord(raw)) return base;

  const tx = isRecord(raw.transaction) ? raw.transaction : {};
  const sr = isRecord(raw.serviceReminders) ? raw.serviceReminders : {};
  const party = isRecord(raw.party) ? raw.party : {};
  const item = isRecord(raw.item) ? raw.item : {};
  const print = isRecord(raw.print) ? raw.print : {};
  const message = isRecord(raw.message) ? raw.message : {};

  const sellTypeRaw = asString(item.sellType, base.item.sellType);
  const sellType =
    sellTypeRaw === "product" || sellTypeRaw === "service" || sellTypeRaw === "product_service"
      ? sellTypeRaw
      : base.item.sellType;

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
  };
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
