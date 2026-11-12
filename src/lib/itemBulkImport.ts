import * as XLSX from "xlsx";

export const ITEM_BULK_MAX_ROWS = 2000;

export const ITEM_BULK_TEMPLATE_HEADERS = [
  "name",
  "sku",
  "category",
  "unit",
  "stockQty",
  "purchasePrice",
  "salePrice",
  "taxPercent",
  "itemType",
] as const;

export type ItemBulkTemplateHeader = (typeof ITEM_BULK_TEMPLATE_HEADERS)[number];

export type ParsedItemImportRow = {
  row: number;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stockQty: number;
  purchasePrice: number;
  salePrice: number;
  taxPercent: number;
  itemType: "product" | "service";
  errors: string[];
};

const HEADER_ALIASES: Record<string, ItemBulkTemplateHeader> = {
  name: "name",
  item: "name",
  itemname: "name",
  "item name": "name",
  "product name": "name",
  sku: "sku",
  code: "sku",
  itemcode: "sku",
  "item code": "sku",
  "item sku": "sku",
  "part number": "sku",
  category: "category",
  unit: "unit",
  uom: "unit",
  "unit of measure": "unit",
  stockqty: "stockQty",
  stock: "stockQty",
  instock: "stockQty",
  "in stock": "stockQty",
  qty: "stockQty",
  quantity: "stockQty",
  "qty on hand": "stockQty",
  purchaseprice: "purchasePrice",
  purchase: "purchasePrice",
  unitcost: "purchasePrice",
  "unit cost": "purchasePrice",
  cost: "purchasePrice",
  "cost price": "purchasePrice",
  saleprice: "salePrice",
  sale: "salePrice",
  sellingprice: "salePrice",
  "selling price": "salePrice",
  price: "salePrice",
  taxpercent: "taxPercent",
  tax: "taxPercent",
  gst: "taxPercent",
  itemtype: "itemType",
  type: "itemType",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).replace(/[,₹$]/g, "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function parseItemType(value: unknown): "product" | "service" {
  const raw = cellString(value).toLowerCase();
  return raw === "service" ? "service" : "product";
}

function mapSheetRows(matrix: unknown[][]): ParsedItemImportRow[] {
  if (!matrix.length) return [];
  const headerCells = matrix[0] ?? [];
  const columnMap = new Map<number, ItemBulkTemplateHeader>();
  headerCells.forEach((cell, index) => {
    const alias = HEADER_ALIASES[normalizeHeader(cell)];
    if (alias) columnMap.set(index, alias);
  });
  if (![...columnMap.values()].includes("name")) {
    throw new Error('Spreadsheet must include a "name" column (or item / item name).');
  }

  const rows: ParsedItemImportRow[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] ?? [];
    const values: Partial<Record<ItemBulkTemplateHeader, string>> = {};
    let anyValue = false;
    columnMap.forEach((key, index) => {
      const text = cellString(line[index]);
      if (text) anyValue = true;
      values[key] = text;
    });
    if (!anyValue) continue;

    const errors: string[] = [];
    const name = values.name?.trim() ?? "";
    if (name.length < 2) errors.push("Name is required (min 2 characters).");

    const stockQtyRaw = cellNumber(values.stockQty);
    const purchasePriceRaw = cellNumber(values.purchasePrice);
    const salePriceRaw = cellNumber(values.salePrice);
    const taxPercentRaw = cellNumber(values.taxPercent);

    const numFields: Array<[string, number | null]> = [
      ["stockQty", stockQtyRaw],
      ["purchasePrice", purchasePriceRaw],
      ["salePrice", salePriceRaw],
      ["taxPercent", taxPercentRaw],
    ];
    for (const [label, n] of numFields) {
      if (n == null) continue;
      if (Number.isNaN(n) || n < 0) errors.push(`${label} must be a non-negative number.`);
    }

    const itemType = parseItemType(values.itemType);
    const stockQty =
      itemType === "service"
        ? 0
        : stockQtyRaw != null && !Number.isNaN(stockQtyRaw)
          ? stockQtyRaw
          : 0;

    rows.push({
      row: r + 1,
      name,
      sku: values.sku?.trim() ?? "",
      category: values.category?.trim() ?? "",
      unit: values.unit?.trim() || "pcs",
      stockQty,
      purchasePrice:
        purchasePriceRaw != null && !Number.isNaN(purchasePriceRaw) ? purchasePriceRaw : 0,
      salePrice: salePriceRaw != null && !Number.isNaN(salePriceRaw) ? salePriceRaw : 0,
      taxPercent: taxPercentRaw != null && !Number.isNaN(taxPercentRaw) ? taxPercentRaw : 18,
      itemType,
      errors,
    });
  }

  if (rows.length > ITEM_BULK_MAX_ROWS) {
    throw new Error(`Import is limited to ${ITEM_BULK_MAX_ROWS} rows. Split the file and try again.`);
  }
  return rows;
}

function workbookToMatrix(workbook: XLSX.WorkBook): unknown[][] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Spreadsheet has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
}

export async function parseItemImportFile(file: File): Promise<{
  rows: ParsedItemImportRow[];
  sourceLabel: string;
}> {
  const lower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
    const workbook = XLSX.read(text, { type: "string" });
    return { rows: mapSheetRows(workbookToMatrix(workbook)), sourceLabel: file.name };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "array" });
    return { rows: mapSheetRows(workbookToMatrix(workbook)), sourceLabel: file.name };
  }
  throw new Error("Upload a .xlsx, .xls, or .csv file.");
}

const SAMPLE_ROWS: Record<ItemBulkTemplateHeader, string | number>[] = [
  {
    name: "A4 Paper Ream",
    sku: "ST-A4-001",
    category: "Stationery",
    unit: "pcs",
    stockQty: 50,
    purchasePrice: 220,
    salePrice: 280,
    taxPercent: 18,
    itemType: "product",
  },
  {
    name: "Installation Service",
    sku: "SRV-INS",
    category: "Services",
    unit: "pcs",
    stockQty: 0,
    purchasePrice: 0,
    salePrice: 1500,
    taxPercent: 18,
    itemType: "service",
  },
];

export function downloadItemImportTemplate(format: "csv" | "xlsx") {
  const aoa = [
    [...ITEM_BULK_TEMPLATE_HEADERS],
    ...SAMPLE_ROWS.map((row) => ITEM_BULK_TEMPLATE_HEADERS.map((h) => row[h])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Items");
  XLSX.writeFile(wb, `item-import-template.${format}`);
}
