import type { PermissionMap } from "../lib/permissions";
import type { AppRole } from "../lib/roles";
import type { CompanySettings } from "../lib/companySettings";

export type PartyType =
  | "not_specified"
  | "supplier"
  | "hospital"
  | "clinic"
  | "diagnostic_lab"
  | "research"
  | "dental"
  | "other"
  | "customer"
  | "both";

export const PARTY_TYPE_OPTIONS: { value: PartyType; label: string }[] = [
  { value: "not_specified", label: "Not specified" },
  { value: "supplier", label: "Supplier" },
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clinic" },
  { value: "diagnostic_lab", label: "Diagnostic Lab" },
  { value: "research", label: "Research" },
  { value: "dental", label: "Dental" },
  { value: "other", label: "Other" },
];

export interface PartyServiceType {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  builtin: boolean;
}

export function partyTypeLabel(
  type: string,
  typeOther?: string | null,
  extras?: { slug: string; name: string }[],
): string {
  if (type === "other") return typeOther?.trim() || "Other";
  const extra = extras?.find((o) => o.slug === type);
  if (extra) return extra.name;
  const match = PARTY_TYPE_OPTIONS.find((o) => o.value === type);
  if (match) return match.label;
  if (type === "customer") return "Customer";
  if (type === "both") return "Both";
  return type.replace(/_/g, " ");
}

export interface PartyExtraField {
  label: string;
  value: string;
}
export type TxnType = "sale" | "purchase" | "payment_in" | "payment_out";
export type PaymentKind = "cash" | "bank" | "cheque" | "upi" | "loan" | "other";

export interface AssignedRole {
  id: string;
  name: string;
  status: number;
}

export interface UserSession {
  id: string;
  username: string;
  phone?: string;
  name: string;
  email?: string;
  role: AppRole;
  userType: number;
  isSuperAdmin: boolean;
  modules: string[];
  permissions: PermissionMap;
  roles: AssignedRole[];
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
  /** Tax regime for line-item rate dropdowns: GST | VAT */
  taxType?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  defaultTerms?: string | null;
  /** Starting pattern, e.g. NEX-IT-001. Next tags increment: NEX-IT-002… */
  assetTagStart?: string | null;
  /** Persisted settings (transaction, print, party, item, and similar). */
  settings?: CompanySettings | null;
  createdAt: string;
}

export type QuotationStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "converted";

export interface DocLine {
  id: string;
  itemId?: string | null;
  name: string;
  qty: number;
  receivedQty?: number | null;
  rate: number;
  taxPercent: number;
  discountPercent?: number;
  unit?: string | null;
  amount: number;
}

export interface CommercialDoc {
  id: string;
  companyId: string;
  docType: string;
  number: string;
  date: string;
  partyId?: string | null;
  status: QuotationStatus | string;
  notes?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  followUpDate?: string | null;
  billingAddress?: string | null;
  stateOfSupply?: string | null;
  priceTaxMode?: "without" | "with" | string;
  roundOff?: boolean;
  discountTotal?: number;
  revision?: number;
  clonedFromId?: string | null;
  refNo?: string | null;
  originalBillNo?: string | null;
  stockPostedAt?: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  convertedToId?: string | null;
  convertedToType?: string | null;
  convertedFromId?: string | null;
  convertedFromType?: string | null;
  convertedFromNumber?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  lines: DocLine[];
}

export interface DocRevision {
  id: string;
  docId: string;
  revision: number;
  changedBy?: string | null;
  changeNote?: string | null;
  createdAt: string;
  snapshot?: CommercialDoc | null;
}

export interface Party {
  id: string;
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  type: PartyType;
  typeOther?: string | null;
  contactPerson?: string | null;
  city?: string | null;
  country?: string | null;
  licenseGst?: string | null;
  priceCategory?: string | null;
  deliveryAddress?: string | null;
  additionalFields?: PartyExtraField[] | null;
  notes?: string | null;
  openingBalance: number;
  balanceType: "to_receive" | "to_pay";
  address?: string;
  createdAt: string;
}

export type EquipmentCurrentStatus =
  | "in_service"
  | "in_repair"
  | "in_storage"
  | "decommissioned"
  | "disposed";

export interface Equipment {
  id: string;
  companyId: string;
  assetTag: string;
  name: string;
  model?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  serialNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  location?: string | null;
  installDate?: string | null;
  warrantyStart?: string | null;
  warrantyEnd?: string | null;
  noMachineWarranty: boolean;
  serviceWarrantyStart?: string | null;
  serviceWarrantyEnd?: string | null;
  noServiceWarranty: boolean;
  condition?: string | null;
  currentStatus: EquipmentCurrentStatus | string;
  additionalNote?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

/** 6-stage pipeline. Legacy `assigned`→inspection, `done`→billing. */
export type ServiceCallStatus =
  | "open"
  | "inspection"
  | "estimate"
  | "in_progress"
  | "qa"
  | "billing"
  | "closed"
  | "assigned" // legacy
  | "done"; // legacy
export type ServiceCallType = "Repair" | "Maintenance" | "Installation" | "Inspection" | "Other";
export type ServiceCallPriority = "normal" | "high" | "urgent";
export type ServiceVisitStatus = "planned" | "in_progress" | "completed";
export type ServiceSeverity = "Low" | "Medium" | "High" | "Critical";
export type ServiceRecommendation =
  | "Repair"
  | "Part Replacement"
  | "Service/Calibration"
  | "Unrepairable";

export interface ServiceLineItem {
  id?: string;
  itemId?: string | null;
  name?: string;
  description?: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
  total?: number;
}

export interface ServicePhoto {
  url: string;
  name?: string;
  caption?: string;
  kind?: "before" | "after" | "inspection" | "doc" | string;
}

export interface ServiceCall {
  id: string;
  companyId: string;
  callNo: string;
  customerId: string;
  customerName: string;
  equipmentId?: string | null;
  equipmentName?: string | null;
  equipmentIds?: string[];
  type: ServiceCallType | string;
  priority: ServiceCallPriority | string;
  status: ServiceCallStatus | string;
  description: string;
  assignedUserId?: string | null;
  assignedName?: string | null;
  inspectorId?: string | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
  findings?: string | null;
  severity?: ServiceSeverity | string | null;
  recommendation?: ServiceRecommendation | string | null;
  recommendationNotes?: string | null;
  workRequired?: string | null;
  workDetails?: string | null;
  requestedParts?: string | null;
  inspectorSignature?: string | null;
  inspectionPhotos?: ServicePhoto[];
  engineerUserId?: string | null;
  engineerName?: string | null;
  estimateLines?: ServiceLineItem[];
  estimateDiscount?: number;
  estimateNotes?: string | null;
  estimateFinalizedAt?: string | null;
  partsUsed?: ServiceLineItem[];
  servicePhotos?: ServicePhoto[];
  customerHandoff?: boolean;
  customerReceiverName?: string | null;
  customerSignature?: string | null;
  qaDecision?: "pass" | "fail" | string | null;
  qaRemarks?: string | null;
  qaVerifiedBy?: string | null;
  qaVerifiedByName?: string | null;
  qaVerifiedAt?: string | null;
  scheduledFor?: string | null;
  notes?: string | null;
  invoiceDocId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface AppNotification {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  body?: string | null;
  link?: string | null;
  kind?: string | null;
  refId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface ServiceVisit {
  id: string;
  companyId: string;
  serviceCallId: string;
  visitNo: string;
  visitDate: string;
  assignedUserId?: string | null;
  assignedName?: string | null;
  status: ServiceVisitStatus | string;
  workDone?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ItemCategory {
  id: string;
  companyId: string;
  name: string;
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
  itemType?: "product" | "service";
  imageUrl?: string | null;
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
  saleOrderId?: string | null;
  saleOrderNumber?: string | null;
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
