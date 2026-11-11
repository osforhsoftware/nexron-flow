import { todayISO } from "./format";

export const ITEM_UNITS = ["pcs", "kg", "ltr", "box", "mtr", "BAG", "BTL", "BDL"] as const;

export type ItemFormState = {
  name: string;
  hsn: string;
  sku: string;
  unit: string;
  salePrice: string;
  salePriceTax: "without" | "with";
  saleDiscount: string;
  saleDiscountType: "Percentage" | "Amount";
  purchasePrice: string;
  purchasePriceTax: "without" | "with";
  stockQty: string;
  taxPercent: string;
  category: string;
  imageUrl: string;
  asOfDate: string;
  minStock: string;
  location: string;
};

export function emptyItemForm(overrides?: Partial<ItemFormState>): ItemFormState {
  return {
    name: "",
    hsn: "",
    sku: "",
    unit: "pcs",
    salePrice: "0",
    salePriceTax: "without",
    saleDiscount: "0",
    saleDiscountType: "Percentage",
    purchasePrice: "0",
    purchasePriceTax: "without",
    stockQty: "0",
    taxPercent: "5",
    category: "",
    imageUrl: "",
    asOfDate: todayISO(),
    minStock: "0",
    location: "Main warehouse",
    ...overrides,
  };
}

export function itemPayloadFromForm(form: ItemFormState, itemType: "product" | "service" = "product") {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || undefined,
    unit: form.unit.trim() || "pcs",
    salePrice: Number(form.salePrice) || 0,
    purchasePrice: Number(form.purchasePrice) || 0,
    stockQty: itemType === "service" ? 0 : Number(form.stockQty) || 0,
    taxPercent: Number(form.taxPercent) || 0,
    category: form.category.trim() || undefined,
    itemType,
    imageUrl: form.imageUrl.trim() || null,
  };
}
