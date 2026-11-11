import { useRef, useState } from "react";
import {
  Barcode,
  BookOpenCheck,
  Cloud,
  FileSpreadsheet,
  PackageOpen,
  ShieldCheck,
  Store,
  Upload,
  UsersRound,
} from "lucide-react";
import { Modal } from "../components/Modal";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { PageHeader } from "../components/UI";

const utilityItems = [
  [PackageOpen, "Import Items", "Import your inventory from Excel or CSV"],
  [Store, "Set Up My Business", "Configure company, invoice and tax details"],
  [UsersRound, "Accountant Access", "Share secure access with your accountant"],
  [Barcode, "Barcode Generator", "Create and print item barcode labels"],
  [FileSpreadsheet, "Update Items In Bulk", "Edit prices and stock from a spreadsheet"],
  [Upload, "Export To Tally", "Export transactions in Tally-compatible format"],
  [BookOpenCheck, "Verify My Data", "Run checks across books and inventory"],
  [ShieldCheck, "Close Financial Year", "Archive and begin a new financial year"],
] as const;

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function BusinessToolsPage({ kind }: { kind: "utilities" | "backup" }) {
  const { company } = useApp();
  const title = kind === "utilities" ? "Utilities" : "Sync, Share & Backup";
  const items = kind === "utilities"
    ? utilityItems
    : [[Cloud, "Auto Backup", "Keep an encrypted copy of your business data"], [Upload, "Create Manual Backup", "Download a local backup file"], [UsersRound, "Share Business", "Invite staff with controlled access"], [ShieldCheck, "Restore Data", "Restore from an earlier backup"]] as const;

  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function onTool(name: string) {
    if (kind === "utilities" && name === "Import Items") {
      setMessage("");
      setError("");
      setImportOpen(true);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || !company?.id) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        setError("No rows found. Use a CSV with a header row.");
        return;
      }
      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const name = row.name || row.item || row.itemname || "";
        if (!name) {
          skipped += 1;
          continue;
        }
        const itemType = (row.itemtype || row.type || "product").toLowerCase() === "service"
          ? "service"
          : "product";
        await api.items.create({
          companyId: company.id,
          name,
          sku: row.sku || row.code || row.itemcode || undefined,
          unit: row.unit || "pcs",
          salePrice: Number(row.saleprice || row.sale || 0) || 0,
          purchasePrice: Number(row.purchaseprice || row.purchase || 0) || 0,
          stockQty: itemType === "service" ? 0 : Number(row.stockqty || row.stock || 0) || 0,
          taxPercent: Number(row.taxpercent || row.tax || 0) || 0,
          category: row.category || undefined,
          itemType,
        });
        created += 1;
      }
      setMessage(`Imported ${created} item${created === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader title={title} subtitle="Everything you need to manage and grow your business" />
      <div className="content">
        <div className="tool-grid">
          {items.map(([Icon, name, description]) => (
            <button className="tool-card" type="button" key={name} onClick={() => onTool(name)}>
              <Icon size={22} />
              <span><strong>{name}</strong><small>{description}</small></span>
              <b>›</b>
            </button>
          ))}
        </div>
      </div>

      {importOpen ? (
        <Modal
          title="Import Items"
          onClose={() => !busy && setImportOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setImportOpen(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? "Uploading…" : "Upload CSV"}
              </button>
            </>
          }
        >
          <p className="muted">
            Upload a CSV with columns: <strong>name</strong>, sku, unit, salePrice, purchasePrice, stockQty, taxPercent, category, itemType (product or service).
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {message ? <p>{message}</p> : null}
          {error ? <p className="muted" style={{ color: "#c0392b" }}>{error}</p> : null}
        </Modal>
      ) : null}
    </>
  );
}
