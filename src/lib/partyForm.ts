import type { Party, PartyExtraField, PartyType } from "../db/types";

export type PartyFormState = {
  name: string;
  type: PartyType;
  typeOther: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  licenseGst: string;
  gstin: string;
  priceCategory: string;
  deliveryAddress: string;
  additionalFields: PartyExtraField[];
  notes: string;
  openingBalance: string;
  balanceType: "to_receive" | "to_pay";
};

export const emptyPartyForm = (seed?: Partial<PartyFormState>): PartyFormState => ({
  name: "",
  type: "not_specified",
  typeOther: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  country: "",
  licenseGst: "",
  gstin: "",
  priceCategory: "",
  deliveryAddress: "",
  additionalFields: [],
  notes: "",
  openingBalance: "0",
  balanceType: "to_receive",
  ...seed,
});

export function partyToForm(p: Party): PartyFormState {
  return emptyPartyForm({
    name: p.name,
    type: p.type,
    typeOther: p.typeOther ?? "",
    contactPerson: p.contactPerson ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    country: p.country ?? "",
    licenseGst: p.licenseGst ?? p.gstin ?? "",
    gstin: p.gstin ?? p.licenseGst ?? "",
    priceCategory: p.priceCategory ?? "",
    deliveryAddress: p.deliveryAddress ?? "",
    additionalFields: p.additionalFields?.length ? p.additionalFields : [],
    notes: p.notes ?? "",
    openingBalance: String(p.openingBalance ?? 0),
    balanceType: p.balanceType,
  });
}

export function partyPayloadFromForm(form: PartyFormState) {
  const license = form.licenseGst.trim() || form.gstin.trim();
  return {
    name: form.name.trim(),
    type: form.type,
    typeOther: form.type === "other" ? form.typeOther.trim() || undefined : undefined,
    contactPerson: form.contactPerson.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    address: form.address.trim() || undefined,
    city: form.city.trim() || undefined,
    country: form.country.trim() || undefined,
    licenseGst: license || undefined,
    gstin: license || undefined,
    priceCategory: form.priceCategory.trim() || undefined,
    deliveryAddress: form.deliveryAddress.trim() || undefined,
    additionalFields: form.additionalFields.filter((f) => f.label.trim() || f.value.trim()),
    notes: form.notes.trim() || undefined,
    openingBalance: Number(form.openingBalance) || 0,
    balanceType: form.balanceType,
  };
}
