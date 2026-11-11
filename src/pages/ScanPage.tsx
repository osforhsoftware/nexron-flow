import { useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import type { Equipment, Item } from "../db/types";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const STATUS_LABELS: Record<string, string> = {
  in_service: "In service",
  in_repair: "In repair",
  in_storage: "In storage",
  decommissioned: "Decommissioned",
  disposed: "Disposed",
};

function showDate(value?: string | null) {
  return value ? value.slice(0, 10) : "—";
}

function warrantyText(none: boolean, start?: string | null, end?: string | null) {
  if (none) return "No warranty";
  if (!start && !end) return "—";
  return `${showDate(start)} to ${showDate(end)}`;
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "scan-field wide" : "scan-field"}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function ProductCard({
  companyName,
  currency,
  item,
}: {
  companyName: string;
  currency: string;
  item: Item;
}) {
  return (
    <article className="scan-card">
      <header className="scan-card-head">
        <BrandLogo size={36} showWordmark wordmarkSize="sm" />
        <span className="scan-kind">Product</span>
      </header>
      <div className="scan-hero">
        {item.imageUrl ? <img className="scan-photo" src={item.imageUrl} alt="" /> : null}
        <div>
          <h1>{item.name}</h1>
          <p className="muted">{companyName || "Product record"}</p>
        </div>
      </div>
      <div className="scan-fields">
        <Field label="SKU" value={item.sku || "—"} />
        <Field label="Category" value={item.category || "—"} />
        <Field label="Stock" value={`${item.stockQty} ${item.unit}`} />
        <Field label="Unit" value={item.unit} />
        <Field label="Sale price" value={money(item.salePrice, currency)} />
        <Field label="Purchase price" value={money(item.purchasePrice, currency)} />
        <Field label="Tax" value={`${item.taxPercent}%`} />
      </div>
    </article>
  );
}

function EquipmentCard({ companyName, item }: { companyName: string; item: Equipment }) {
  return (
    <article className="scan-card">
      <header className="scan-card-head">
        <BrandLogo size={36} showWordmark wordmarkSize="sm" />
        <span className="scan-kind">Equipment</span>
      </header>
      <div className="scan-hero">
        <div>
          <h1>{item.name}</h1>
          <p className="muted">{companyName || "Equipment record"}</p>
        </div>
      </div>
      <div className="scan-fields">
        <Field label="Asset tag" value={item.assetTag} />
        <Field label="Serial" value={item.serialNumber} />
        <Field label="Model" value={item.model || "—"} />
        <Field label="Manufacturer" value={item.manufacturer || "—"} />
        <Field label="Category" value={item.category || "—"} />
        <Field label="Status" value={STATUS_LABELS[item.currentStatus] ?? item.currentStatus} />
        <Field label="Customer" value={item.customerName || "—"} />
        <Field label="Location" value={item.location || "—"} />
        <Field label="Installed" value={showDate(item.installDate)} />
        <Field label="Condition" value={item.condition || "—"} />
        <Field
          label="Machine warranty"
          value={warrantyText(item.noMachineWarranty, item.warrantyStart, item.warrantyEnd)}
          wide
        />
        <Field
          label="Service warranty"
          value={warrantyText(item.noServiceWarranty, item.serviceWarrantyStart, item.serviceWarrantyEnd)}
          wide
        />
        <Field label="Note" value={item.additionalNote || "—"} wide />
      </div>
    </article>
  );
}

export function ScanPage() {
  const { kind, id } = useParams();
  const { data, error, loading } = useAsync(async () => {
    if (!id || (kind !== "product" && kind !== "equipment")) {
      throw new Error("This QR code is not valid.");
    }
    if (kind === "product") return api.scan.product(id);
    return api.scan.equipment(id);
  }, [kind, id]);

  return (
    <main className="scan-screen">
      {loading ? <p className="scan-status">Loading record…</p> : null}
      {!loading && error ? (
        <article className="scan-card">
          <header className="scan-card-head">
            <BrandLogo size={36} showWordmark wordmarkSize="sm" />
          </header>
          <div className="scan-hero">
            <div>
              <h1>Record not found</h1>
              <p className="muted">{error}</p>
            </div>
          </div>
        </article>
      ) : null}
      {data?.kind === "product" ? (
        <ProductCard companyName={data.companyName} currency={data.currency} item={data.record} />
      ) : null}
      {data?.kind === "equipment" ? <EquipmentCard companyName={data.companyName} item={data.record} /> : null}
    </main>
  );
}
