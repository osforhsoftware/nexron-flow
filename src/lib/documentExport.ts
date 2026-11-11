import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportMetaField = { label: string; value: string };
export type ExportColumn = { header: string; align?: "left" | "right" | "center"; width?: number };
export type ExportRow = (string | number)[];
export type ExportTotal = { label: string; value: string; emphasize?: boolean };

export type DocumentExportSpec = {
  filename: string;
  companyName: string;
  companyLines?: string[];
  title: string;
  docNumber?: string;
  meta?: ExportMetaField[];
  columns: ExportColumn[];
  rows: ExportRow[];
  totals?: ExportTotal[];
  notes?: string;
  terms?: string;
  footerNote?: string;
};

export type TableExportSpec = {
  filename?: string;
  title: string;
  companyName?: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  summary?: ExportMetaField[];
};

const PRINT_CSS = `
*{box-sizing:border-box}
body{font-family:Segoe UI,Arial,sans-serif;padding:28px;color:#20242b;margin:0}
h1{font-size:20px;margin:0 0 4px;letter-spacing:.2px}
h2{font-size:16px;margin:22px 0 12px;border-bottom:2px solid #20242b;padding-bottom:8px;display:flex;justify-content:space-between;gap:16px;align-items:baseline}
.meta{color:#59616d;font-size:12px;margin:3px 0;line-height:1.45}
.meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:18px 0}
.meta-grid div{display:grid;gap:4px}
.meta-grid small{color:#6f7782;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
.meta-grid strong{font-size:13px;font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border-bottom:1px solid #dfe3e8;padding:9px 10px;text-align:left;font-size:12px;vertical-align:top}
th{background:#f4f6f8;text-transform:uppercase;font-size:10px;letter-spacing:.03em;font-weight:600}
.money,.right{text-align:right}.center{text-align:center}
.summary{display:flex;flex-wrap:wrap;gap:18px;margin:14px 0;font-size:12px}
.summary strong{margin-right:auto}
.invoice-totals{margin:18px 0 0 auto;width:280px;display:grid;gap:7px}
.invoice-totals span{display:flex;justify-content:space-between;font-size:12px}
.invoice-totals .grand{font-size:15px;border-top:2px solid #20242b;padding-top:8px;font-weight:700}
.notes{font-size:12px;margin-top:22px;line-height:1.5;white-space:pre-wrap}
.sign{margin-top:44px;text-align:right;font-size:11px;color:#6f7782}
@page{margin:14mm}
@media print{body{padding:0}}
`;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function cellText(value: string | number): string {
  return String(value ?? "");
}

function pdfSafe(text: string): string {
  // jsPDF default fonts are WinAnsi; replace unsupported chars
  return text
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u20B9/g, "Rs.")
    .replace(/\u20AE/g, "AED ")
    .replace(/[^\x00-\xFF]/g, "");
}

function ensurePdfName(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function ensureExcelName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv")) return name;
  return `${name}.xls`;
}

function flattenExportLines(lines: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of lines ?? []) {
    for (const part of String(raw).split(/\r?\n/)) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function drawHeader(doc: jsPDF, spec: DocumentExportSpec, startY: number): number {
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(32, 36, 43);
  doc.text(pdfSafe(spec.companyName || "Company"), 14, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(89, 97, 109);
  const lineHeight = 4.2;
  for (const line of flattenExportLines(spec.companyLines)) {
    const wrapped = doc.splitTextToSize(pdfSafe(line), 182);
    doc.text(wrapped, 14, y);
    y += Math.max(1, wrapped.length) * lineHeight;
  }

  y += 4;
  doc.setDrawColor(32, 36, 43);
  doc.setLineWidth(0.5);
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(32, 36, 43);
  doc.text(pdfSafe(spec.title), 14, y);
  if (spec.docNumber) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(pdfSafe(spec.docNumber), 196, y, { align: "right" });
  }
  y += 3;
  doc.setLineWidth(0.3);
  doc.line(14, y, 196, y);
  y += 8;

  if (spec.meta?.length) {
    const colW = 182 / Math.min(3, spec.meta.length);
    spec.meta.forEach((field, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 14 + col * colW;
      const yy = y + row * 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(111, 119, 130);
      doc.text(pdfSafe(field.label.toUpperCase()), x, yy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(32, 36, 43);
      const lines = doc.splitTextToSize(pdfSafe(field.value || "—"), colW - 4);
      doc.text(lines, x, yy + 4.5);
    });
    y += Math.ceil(spec.meta.length / 3) * 12 + 2;
  }

  return y;
}

export function downloadDocumentPdf(spec: DocumentExportSpec) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, spec, 16);

  const alignMap = spec.columns.map((c) => c.align ?? "left");
  autoTable(doc, {
    startY: y,
    head: [spec.columns.map((c) => c.header)],
    body: spec.rows.map((row) => row.map((cell) => pdfSafe(cellText(cell)))),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 2.4, right: 2, bottom: 2.4, left: 2 },
      textColor: [32, 36, 43],
      lineColor: [223, 227, 232],
      lineWidth: 0.1,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [244, 246, 248],
      textColor: [32, 36, 43],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 2.8, right: 2, bottom: 2.8, left: 2 },
    },
    columnStyles: Object.fromEntries(
      spec.columns.map((col, i) => [
        i,
        {
          halign: alignMap[i],
          cellWidth: col.width,
        },
      ]),
    ),
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(32, 36, 43);
        doc.text(pdfSafe(`${spec.companyName} — ${spec.title}`), 14, 12);
        if (spec.docNumber) doc.text(pdfSafe(spec.docNumber), 196, 12, { align: "right" });
      }
    },
  });

  const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = lastTable?.finalY ?? y + 10;
  y += 8;

  if (spec.totals?.length) {
    const boxX = 126;
    for (const total of spec.totals) {
      if (total.emphasize) {
        // Draw separator above the row, then leave clear space before the text baseline.
        doc.setDrawColor(32, 36, 43);
        doc.setLineWidth(0.4);
        doc.line(boxX, y, 196, y);
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }
      doc.setTextColor(32, 36, 43);
      doc.text(pdfSafe(total.label), boxX, y);
      doc.text(pdfSafe(total.value), 196, y, { align: "right" });
      y += total.emphasize ? 7 : 5.5;
    }
  }

  if (spec.notes?.trim()) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes", 14, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(89, 97, 109);
    const noteLines = doc.splitTextToSize(pdfSafe(spec.notes), 182);
    doc.text(noteLines, 14, y);
    y += noteLines.length * 4.2;
  }

  if (spec.terms?.trim()) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(32, 36, 43);
    doc.text("Terms & Conditions", 14, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(89, 97, 109);
    const termLines = doc.splitTextToSize(pdfSafe(spec.terms), 182);
    doc.text(termLines, 14, y);
    y += termLines.length * 4.2;
  }

  if (spec.footerNote) {
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(111, 119, 130);
    doc.text(pdfSafe(spec.footerNote), 196, pageH - 10, { align: "right" });
  }

  doc.save(ensurePdfName(spec.filename));
}

export function downloadTablePdf(spec: TableExportSpec) {
  downloadDocumentPdf({
    filename: spec.filename || spec.title.replace(/\s+/g, "-").toLowerCase(),
    companyName: spec.companyName || "",
    title: spec.title,
    meta: spec.summary,
    columns: spec.columns,
    rows: spec.rows,
    notes: spec.subtitle,
  });
}

export function downloadExcelTable(spec: {
  filename: string;
  sheetTitle?: string;
  columns: string[];
  rows: ExportRow[];
  metaRows?: [string, string][];
}) {
  const metaHtml = (spec.metaRows ?? [])
    .map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  const head = spec.columns.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = spec.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cellText(cell))}</td>`).join("")}</tr>`,
    )
    .join("");
  const title = spec.sheetTitle ? `<h2>${escapeHtml(spec.sheetTitle)}</h2>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
    ${title}
    ${metaHtml ? `<table>${metaHtml}</table><br/>` : ""}
    <table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`;
  downloadBlob(html, ensureExcelName(spec.filename), "application/vnd.ms-excel");
}

export function openPrintWindow(title: string, body: string, autoPrint = true) {
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) {
    alert("Please allow pop-ups to print / save PDF.");
    return;
  }
  win.opener = null;
  const script = autoPrint ? `<script>window.onload=()=>window.print();<\/script>` : "";
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>${PRINT_CSS}</style></head><body>${body}
    ${script}</body></html>`);
  win.document.close();
}

export function previewDocument(spec: DocumentExportSpec) {
  openPrintWindow(spec.docNumber || spec.title, documentPrintHtml(spec), false);
}

export function documentPrintHtml(spec: DocumentExportSpec): string {
  const company = flattenExportLines(spec.companyLines)
    .map((line) => `<p class="meta">${escapeHtml(line)}</p>`)
    .join("");
  const meta = (spec.meta ?? [])
    .map(
      (field) =>
        `<div><small>${escapeHtml(field.label)}</small><strong>${escapeHtml(field.value || "—")}</strong></div>`,
    )
    .join("");
  const head = spec.columns
    .map((c) => {
      const cls = c.align === "right" ? " class=\"money\"" : c.align === "center" ? " class=\"center\"" : "";
      return `<th${cls}>${escapeHtml(c.header)}</th>`;
    })
    .join("");
  const body = spec.rows
    .map((row) => {
      const cells = row
        .map((cell, i) => {
          const align = spec.columns[i]?.align;
          const cls = align === "right" ? " class=\"money\"" : align === "center" ? " class=\"center\"" : "";
          return `<td${cls}>${escapeHtml(cellText(cell))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const totals = (spec.totals ?? [])
    .map(
      (t) =>
        `<span class="${t.emphasize ? "grand" : ""}">${escapeHtml(t.label)} <strong>${escapeHtml(t.value)}</strong></span>`,
    )
    .join("");
  return `
    <h1>${escapeHtml(spec.companyName)}</h1>
    ${company}
    <h2>${escapeHtml(spec.title)}${spec.docNumber ? `<span>${escapeHtml(spec.docNumber)}</span>` : ""}</h2>
    ${meta ? `<div class="meta-grid">${meta}</div>` : ""}
    <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${spec.columns.length}">No line items</td></tr>`}</tbody></table>
    ${totals ? `<div class="invoice-totals">${totals}</div>` : ""}
    ${spec.notes ? `<p class="notes"><strong>Notes:</strong> ${escapeHtml(spec.notes)}</p>` : ""}
    ${spec.terms ? `<p class="notes"><strong>Terms & Conditions:</strong><br/>${escapeHtml(spec.terms).replaceAll("\n", "<br/>")}</p>` : ""}
    ${spec.footerNote ? `<div class="sign">${escapeHtml(spec.footerNote)}</div>` : ""}
  `;
}

export function printDocument(spec: DocumentExportSpec) {
  openPrintWindow(spec.docNumber || spec.title, documentPrintHtml(spec));
}

export function printTable(spec: TableExportSpec) {
  const head = spec.columns
    .map((c) => {
      const cls = c.align === "right" ? " class=\"money\"" : "";
      return `<th${cls}>${escapeHtml(c.header)}</th>`;
    })
    .join("");
  const body = spec.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => {
            const align = spec.columns[i]?.align;
            const cls = align === "right" ? " class=\"money\"" : "";
            return `<td${cls}>${escapeHtml(cellText(cell))}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const summary = (spec.summary ?? [])
    .map((s) => `<span>${escapeHtml(s.label)}: <strong>${escapeHtml(s.value)}</strong></span>`)
    .join("");
  openPrintWindow(
    spec.title,
    `<h1>${escapeHtml(spec.companyName || "")}</h1>
     <h2>${escapeHtml(spec.title)}</h2>
     ${spec.subtitle ? `<p class="meta">${escapeHtml(spec.subtitle)}</p>` : ""}
     ${summary ? `<div class="summary">${summary}</div>` : ""}
     <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${spec.columns.length}">No rows</td></tr>`}</tbody></table>`,
  );
}
