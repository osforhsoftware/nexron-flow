import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../lib/api";
import { money } from "../lib/format";
import {
  downloadItemImportTemplate,
  parseItemImportFile,
  type ParsedItemImportRow,
} from "../lib/itemBulkImport";
import { useApp } from "../lib/AppContext";

type Phase = "pick" | "preview" | "done";

type ImportSummary = {
  created: number;
  skipped: number;
  failed: number;
  errors?: string[];
};

export function ItemBulkImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: () => void;
}) {
  const { company } = useApp();
  const fmtMoney = (n: number) => money(n, company?.currency);
  const [phase, setPhase] = useState<Phase>("pick");
  const [busy, setBusy] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [rows, setRows] = useState<ParsedItemImportRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r.errors.length === 0);
    const invalid = rows.filter((r) => r.errors.length > 0);
    return { valid: valid.length, invalid: invalid.length };
  }, [rows]);

  function reset() {
    setPhase("pick");
    setBusy(false);
    setSourceLabel("");
    setRows([]);
    setParseError("");
    setSummary(null);
  }

  async function onFileSelected(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setParseError("");
    try {
      const parsed = await parseItemImportFile(file);
      if (!parsed.rows.length) {
        throw new Error("No item rows found. Blank rows are skipped.");
      }
      setRows(parsed.rows);
      setSourceLabel(parsed.sourceLabel);
      setPhase("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Unable to read import file.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!company?.id) {
      setParseError("Select a company first.");
      return;
    }
    const validRows = rows.filter((r) => r.errors.length === 0);
    if (!validRows.length) {
      setParseError("Fix row errors before importing.");
      return;
    }
    setBusy(true);
    setParseError("");
    try {
      const payload = validRows.map((r) => ({
        name: r.name,
        sku: r.sku || undefined,
        unit: r.unit,
        salePrice: r.salePrice,
        purchasePrice: r.purchasePrice,
        stockQty: r.itemType === "service" ? 0 : r.stockQty,
        taxPercent: r.taxPercent,
        category: r.category || undefined,
        itemType: r.itemType,
      }));
      let result: ImportSummary;
      try {
        result = await api.items.bulkCreate({ companyId: company.id, items: payload });
      } catch {
        let created = 0;
        let failed = 0;
        const errors: string[] = [];
        for (const item of payload) {
          try {
            await api.items.create({
              companyId: company.id,
              ...item,
            });
            created += 1;
          } catch (err) {
            failed += 1;
            errors.push(err instanceof Error ? err.message : "Create failed");
          }
        }
        result = { created, skipped: 0, failed, errors };
      }
      setSummary({
        created: result.created,
        skipped: result.skipped + stats.invalid,
        failed: result.failed,
        errors: result.errors,
      });
      setPhase("done");
      if (result.created > 0) onImported?.();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Import Items"
      className="modal-item-import"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          {phase === "preview" ? (
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={reset}>
              Back
            </button>
          ) : (
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>
              Close
            </button>
          )}
          {phase === "pick" ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => document.getElementById("item-import-file")?.click()}
            >
              {busy ? "Reading…" : "Upload file"}
            </button>
          ) : null}
          {phase === "preview" ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || stats.valid === 0}
              onClick={() => void runImport()}
            >
              {busy ? "Importing…" : `Import ${stats.valid} item${stats.valid === 1 ? "" : "s"}`}
            </button>
          ) : null}
          {phase === "done" ? (
            <button className="btn btn-primary" type="button" onClick={onClose}>
              Done
            </button>
          ) : null}
        </>
      }
    >
      {phase === "pick" ? (
        <div className="item-import-pick">
          <p className="muted">
            Columns: <strong>name</strong>, sku, category, unit, stockQty, purchasePrice, salePrice,
            taxPercent, itemType (product or service). Max 2000 rows.
          </p>
          <div className="item-import-actions">
            <button className="btn btn-ghost" type="button" onClick={() => downloadItemImportTemplate("csv")}>
              <Download size={14} /> Template CSV
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => downloadItemImportTemplate("xlsx")}>
              <Download size={14} /> Template Excel
            </button>
          </div>
          <label className={`item-import-drop${busy ? " is-busy" : ""}`}>
            <Upload size={22} />
            <strong>{busy ? "Reading file…" : "Drop or choose CSV / Excel"}</strong>
            <small>.csv, .xlsx, .xls — ZIP + images later</small>
            <input
              id="item-import-file"
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onFileSelected(file);
              }}
            />
          </label>
          {parseError ? <p className="item-import-error">{parseError}</p> : null}
        </div>
      ) : null}

      {phase === "preview" ? (
        <div className="item-import-preview">
          <div className="item-import-meta">
            <span>
              <FileSpreadsheet size={14} /> {sourceLabel}
            </span>
            <span>{rows.length} rows</span>
            <span className="ok">{stats.valid} ready</span>
            {stats.invalid ? <span className="bad">{stats.invalid} errors</span> : null}
          </div>
          {parseError ? <p className="item-import-error">{parseError}</p> : null}
          <div className="table-wrap item-import-table">
            <table className="data">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Stock</th>
                  <th>Sale</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.sku || "—"}</td>
                    <td>{row.name || "—"}</td>
                    <td>{row.itemType}</td>
                    <td>{row.stockQty}</td>
                    <td>{fmtMoney(row.salePrice)}</td>
                    <td className={row.errors.length ? "item-import-error" : "ok"}>
                      {row.errors.length ? row.errors.join(" ") : "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {phase === "done" && summary ? (
        <div className="item-import-summary">
          <div className="item-import-stats">
            <div>
              <small>Created</small>
              <strong>{summary.created}</strong>
            </div>
            <div>
              <small>Skipped</small>
              <strong>{summary.skipped}</strong>
            </div>
            <div>
              <small>Failed</small>
              <strong>{summary.failed}</strong>
            </div>
          </div>
          {summary.errors?.length ? (
            <ul className="muted">
              {summary.errors.slice(0, 8).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
