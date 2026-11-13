import { jsPDF } from "jspdf";
import type { Company, Equipment, Party, ServiceCall, ServiceVisit } from "../db/types";
import {
  downloadDocumentPdf,
  escapeHtml,
  openPrintWindow,
  type DocumentExportSpec,
} from "./documentExport";

function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function lineTotal(qty: number, unitPrice: number, taxPercent: number) {
  return qty * unitPrice * (1 + taxPercent / 100);
}

function estimateTotals(call: ServiceCall) {
  const lines = call.estimateLines ?? [];
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const qty = Number(line.qty) || 0;
    const unit = Number(line.unitPrice) || 0;
    const tax = Number(line.taxPercent) || 0;
    subtotal += qty * unit;
    taxAmount += qty * unit * (tax / 100);
  }
  const discount = Number(call.estimateDiscount) || 0;
  const grand = Math.max(0, subtotal - discount) + taxAmount;
  return { subtotal, taxAmount, discount, grand };
}

function companyLines(company?: Company | null): string[] {
  if (!company) return [];
  return [company.address, company.state, company.phone, company.email]
    .map((x) => (x || "").trim())
    .filter(Boolean);
}

function statusLabel(status?: string | null) {
  const map: Record<string, string> = {
    open: "Open",
    inspection: "Inspection",
    estimate: "Estimate",
    in_progress: "In Progress",
    qa: "QA",
    billing: "Billing",
    closed: "Closed",
    assigned: "Inspection",
    done: "Billing",
  };
  return map[status || ""] || status || "Open";
}

function pdfText(value: string) {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x00-\xFF]/g, "");
}

function imageKind(url: string): "PNG" | "JPEG" | "WEBP" {
  if (url.startsWith("data:image/png")) return "PNG";
  if (url.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

/** Save the inspection report as a PDF file (photos + inspector signature included). */
export function downloadInspectionPdf(
  call: ServiceCall,
  company?: Company | null,
  extras?: { party?: Party | null; equipment?: Equipment | null },
) {
  const party = extras?.party;
  const equipment = extras?.equipment;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const width = pageW - margin * 2;
  let y = 16;

  const nextPage = (need: number) => {
    if (y + need <= 286) return;
    doc.addPage();
    y = 16;
  };

  const writeLines = (text: string, x: number, maxW: number, size = 9.5, gap = 4.2) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(pdfText(text || "—"), maxW) as string[];
    doc.text(lines, x, y);
    y += Math.max(1, lines.length) * gap;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 95);
  doc.text(pdfText(company?.name || "Company"), margin, y);
  doc.setFontSize(12);
  doc.text("INSPECTION REPORT", pageW - margin, y, { align: "right" });
  y += 5.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(92, 107, 122);
  const brand = companyLines(company).join(" · ");
  const brandLines = brand ? (doc.splitTextToSize(pdfText(brand), width * 0.58) as string[]) : [];
  if (brandLines.length) doc.text(brandLines, margin, y);
  doc.setTextColor(20, 32, 51);
  doc.setFont("helvetica", "bold");
  doc.text(pdfText(call.callNo), pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(92, 107, 122);
  doc.text(pdfText(reportDate(call.inspectionDate || call.createdAt)), pageW - margin, y + 4.4, { align: "right" });
  y += Math.max(brandLines.length * 4.2, 9) + 2;

  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.45);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  const drawColumn = (title: string, rows: Array<[string, string]>, x: number, top: number, colW: number) => {
    let cy = top;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(92, 107, 122);
    doc.text(title, x, cy);
    cy += 5;
    for (const [label, value] of rows) {
      if (!value.trim()) continue;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x, cy);
      cy += 3.6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(20, 32, 51);
      const lines = doc.splitTextToSize(pdfText(value), colW) as string[];
      doc.text(lines, x, cy);
      cy += lines.length * 4.2 + 2.2;
    }
    return cy;
  };

  const site = (party?.deliveryAddress || party?.address || "").trim();
  const colW = width / 2 - 4;
  const leftBottom = drawColumn(
    "CLIENT DETAILS",
    [
      ["Name", call.customerName || "—"],
      ["Phone", party?.phone || ""],
      ["Email", party?.email || ""],
      ["Site", site],
    ],
    margin,
    y,
    colW,
  );
  const rightBottom = drawColumn(
    "EQUIPMENT",
    [
      ["Description", equipment?.name || call.equipmentName || "—"],
      ["Manufacturer", equipment?.manufacturer || ""],
      ["Model", equipment?.model || ""],
      ["Serial", equipment?.serialNumber || ""],
      ["Asset", equipment?.assetTag || ""],
      ["Location", equipment?.location || ""],
    ],
    margin + width / 2 + 4,
    y,
    colW,
  );
  y = Math.max(leftBottom, rightBottom) + 3;

  const sections: Array<[string, string]> = [
    ["INSPECTION FINDINGS", (call.findings || "").trim()],
    ["WORK REQUIRED", (call.workRequired || "").trim()],
    ["WORK DETAILS", (call.workDetails || "").trim()],
    ["REQUESTED PARTS", (call.requestedParts || "").trim()],
    ["RECOMMENDATIONS", (call.recommendationNotes || call.recommendation || "").trim()],
    ["PROBLEM", (call.description || "").trim()],
  ];
  for (const [title, body] of sections) {
    if (!body) continue;
    nextPage(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 95);
    doc.text(title, margin, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 32, 51);
    writeLines(body, margin, width, 10, 4.4);
    y += 2.5;
  }

  const photos = call.inspectionPhotos ?? [];
  if (photos.length) {
    nextPage(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 95);
    doc.text("INSPECTION PHOTOS", margin, y);
    y += 5;
    photos.forEach((photo, index) => {
      nextPage(34);
      const boxTop = y;
      if (photo.url?.startsWith("data:image/")) {
        try {
          doc.addImage(photo.url, imageKind(photo.url), margin, boxTop, 34, 26);
        } catch {
          /* skip unreadable image */
        }
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`PHOTO ${String(index + 1).padStart(2, "0")}`, margin + 38, boxTop + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(20, 32, 51);
      const caption = doc.splitTextToSize(pdfText(photo.caption || photo.name || "No description"), width - 40) as string[];
      doc.text(caption, margin + 38, boxTop + 9);
      y = boxTop + 30;
    });
  }

  nextPage(42);
  y += 6;
  const signW = width / 2 - 6;
  if (call.inspectorSignature?.startsWith("data:image/")) {
    try {
      doc.addImage(call.inspectorSignature, imageKind(call.inspectorSignature), margin, y, 48, 16);
    } catch {
      /* blank line if the signature cannot be drawn */
    }
  }
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.35);
  doc.line(margin, y + 20, margin + signW, y + 20);
  doc.line(margin + width / 2 + 6, y + 20, pageW - margin, y + 20);
  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text("INSPECTOR SIGNATURE", margin, y);
  doc.text("CLIENT SIGNATURE", margin + width / 2 + 6, y);
  y += 4.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(20, 32, 51);
  doc.text(pdfText(call.inspectorName || call.assignedName || "Inspector"), margin, y);
  doc.text(pdfText(call.customerName || "Client"), margin + width / 2 + 6, y);

  const filename = `${call.callNo || "inspection"}-inspection-report.pdf`;
  doc.save(filename);
}

const INSPECTION_REPORT_CSS = `
*{box-sizing:border-box}
body{font-family:"Segoe UI",system-ui,sans-serif;color:#142033;margin:0;padding:14px 16px 12px;background:#fff;font-size:12.5px;line-height:1.4}
.report-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1.5px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px}
.brand{font-size:16px;font-weight:700;color:#1e3a5f;margin:0}
.brand-lines{margin:3px 0 0;color:#5c6b7a;font-size:11px;line-height:1.35;max-width:420px}
.meta-box{text-align:right}
.kicker{margin:0;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5c6b7a}
.doc-no{display:block;margin-top:1px;font-size:16px;color:#1e3a5f;letter-spacing:.01em}
.sub{margin:2px 0 0;font-size:11.5px;color:#334155}
.sub span+span::before{content:" · "}
.facts{display:grid;grid-template-columns:1fr 1fr;border:1px solid #e2e8f0;border-radius:6px;margin:0 0 8px}
.facts section{margin:0;padding:8px 10px 9px}
.facts section+section{border-left:1px solid #e2e8f0}
.facts h2,.notes h2,.photo-section h2{margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5c6b7a}
.dl{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;margin:0}
.dl div{display:grid;gap:1px;min-width:0}
.dl .full{grid-column:1/-1}
.dl dt{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.dl dd{margin:0;font-size:12.5px;font-weight:600;color:#142033;white-space:pre-wrap}
.notes{border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin:0 0 8px}
.note{display:grid;grid-template-columns:118px minmax(0,1fr);gap:4px 10px;align-items:start;padding:6px 10px}
.note+.note{border-top:1px solid #eef2f6}
.note h2{margin:1px 0 0}
.note p{margin:0;font-size:12.5px;line-height:1.4;white-space:pre-wrap;color:#142033}
.photo-section{margin:0}
.photo-section h2{display:flex;align-items:center;gap:6px;color:#1e3a5f;margin-bottom:6px}
.photo-section h2::before{content:"";width:3px;height:11px;background:#1e3a5f;border-radius:2px}
.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}
.photos figure{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px;align-items:center;margin:0;padding:6px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;break-inside:avoid}
.photos img{display:block;width:96px;height:72px;object-fit:cover;border-radius:4px;background:#f1f5f9}
.photos figcaption{display:grid;gap:2px;align-content:center;min-width:0;padding:0;border:0}
.photos figcaption em{font-style:normal;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
.photos figcaption span{font-size:12.5px;line-height:1.35;color:#142033;white-space:pre-wrap}
.empty{margin:0;font-size:12px;color:#64748b}
.signs{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:28px}
.signs > div{display:grid;grid-template-rows:76px auto auto;gap:4px;align-content:start}
.sign-slot{height:76px;border-bottom:1.5px solid #1e3a5f;display:flex;align-items:flex-end;padding:0 2px 6px}
.sign-img{max-width:220px;max-height:64px;object-fit:contain;object-position:left bottom}
.signs strong{margin-top:2px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#334155}
.signs span{font-size:12.5px;font-weight:600;color:#142033}
@page{margin:10mm}
@media print{body{padding:0}}
@media (max-width:640px){
  .report-head,.facts,.signs{display:grid;grid-template-columns:1fr}
  .meta-box{text-align:left}
  .facts section+section{border-left:0;border-top:1px solid #e2e8f0}
  .note{grid-template-columns:1fr;gap:2px}
}
`;

function reportDate(value?: string | null) {
  const raw = (value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "—";
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function filled(value?: string | null) {
  const text = (value || "").trim();
  return text || "";
}

export function openInspectionReport(
  call: ServiceCall,
  company?: Company | null,
  extras?: { party?: Party | null; equipment?: Equipment | null },
) {
  const party = extras?.party;
  const equipment = extras?.equipment;
  const dateLabel = reportDate(call.inspectionDate || call.createdAt);
  const site = (party?.deliveryAddress || party?.address || "").trim();
  const photos = call.inspectionPhotos ?? [];
  const brandLines = companyLines(company).join(" · ");
  const priority = (call.priority || "").trim();
  const context = [
    call.type,
    priority ? `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority` : "",
    statusLabel(call.status),
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean);

  const fact = (label: string, value: string, full = false) =>
    `<div${full ? ' class="full"' : ""}><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;

  const clientFacts = [
    fact("Name", call.customerName || "—", true),
    party?.phone ? fact("Phone", party.phone) : "",
    party?.email ? fact("Email", party.email) : "",
    site ? fact("Site", site, true) : "",
  ].join("");

  const equipmentFacts = [
    fact("Description", equipment?.name || call.equipmentName || "—", true),
    equipment?.manufacturer ? fact("Manufacturer", equipment.manufacturer) : "",
    equipment?.model ? fact("Model", equipment.model) : "",
    equipment?.serialNumber ? fact("Serial", equipment.serialNumber) : "",
    equipment?.assetTag ? fact("Asset", equipment.assetTag) : "",
    equipment?.location ? fact("Location", equipment.location, true) : "",
  ].join("");

  const notes = (
    [
      ["Problem", filled(call.description)],
      ["Findings", filled(call.findings)],
      ["Work required", filled(call.workRequired)],
      ["Work details", filled(call.workDetails)],
      ["Requested parts", filled(call.requestedParts)],
      ["Recommendation", filled(call.recommendation)],
      ["Recommendations", filled(call.recommendationNotes)],
    ] as const
  ).filter((row) => row[1]);

  const notesHtml = notes.length
    ? `<section class="notes">${notes
        .map(
          ([label, value]) =>
            `<div class="note"><h2>${escapeHtml(label)}</h2><p>${escapeHtml(value)}</p></div>`,
        )
        .join("")}</section>`
    : "";

  const photoHtml = photos.length
    ? `<div class="photos">${photos
        .map(
          (p, i) =>
            `<figure><img src="${escapeHtml(p.url)}" alt=""/><figcaption><em>Photo ${String(i + 1).padStart(2, "0")}</em><span>${escapeHtml(
              p.caption || p.name || "No description",
            )}</span></figcaption></figure>`,
        )
        .join("")}</div>`
    : `<p class="empty">No photos attached.</p>`;

  const inspectorSign = call.inspectorSignature
    ? `<img class="sign-img" src="${escapeHtml(call.inspectorSignature)}" alt="Inspector signature"/>`
    : "";

  const html = `
    <style>${INSPECTION_REPORT_CSS}</style>
    <header class="report-head">
      <div>
        <p class="brand">${escapeHtml(company?.name || "Company")}</p>
        ${brandLines ? `<p class="brand-lines">${escapeHtml(brandLines)}</p>` : ""}
      </div>
      <div class="meta-box">
        <p class="kicker">Inspection Report</p>
        <strong class="doc-no">${escapeHtml(call.callNo)}</strong>
        <p class="sub">${escapeHtml([dateLabel, ...context].filter(Boolean).join(" · "))}</p>
      </div>
    </header>
    <div class="facts">
      <section>
        <h2>Client</h2>
        <dl class="dl">${clientFacts}</dl>
      </section>
      <section>
        <h2>Equipment</h2>
        <dl class="dl">${equipmentFacts}</dl>
      </section>
    </div>
    ${notesHtml}
    <section class="photo-section">
      <h2>Photos</h2>
      ${photoHtml}
    </section>
    <footer class="signs">
      <div>
        <div class="sign-slot">${inspectorSign}</div>
        <strong>Inspector signature</strong>
        <span>${escapeHtml(call.inspectorName || call.assignedName || "Inspector")}</span>
      </div>
      <div>
        <div class="sign-slot"></div>
        <strong>Client signature</strong>
        <span>${escapeHtml(call.customerName || "Client")}</span>
      </div>
    </footer>
  `;

  openPrintWindow(`${call.callNo} Inspection Report`, html, true);
}

export function downloadEstimatePdf(call: ServiceCall, company?: Company | null) {
  const lines = call.estimateLines ?? [];
  const totals = estimateTotals(call);
  const spec: DocumentExportSpec = {
    filename: `${call.callNo}-estimate`,
    companyName: company?.name || "Company",
    companyLines: companyLines(company),
    title: "Estimate / Quotation",
    docNumber: call.callNo,
    meta: [
      { label: "Customer", value: call.customerName },
      { label: "Equipment", value: call.equipmentName || "—" },
      { label: "Call", value: call.callNo },
      { label: "Finalized", value: (call.estimateFinalizedAt || "").slice(0, 10) || "Draft" },
    ],
    columns: [
      { header: "Item / Description" },
      { header: "Qty", align: "right", width: 22 },
      { header: "Unit", align: "right", width: 28 },
      { header: "Tax %", align: "right", width: 22 },
      { header: "Total", align: "right", width: 30 },
    ],
    rows: lines.map((line) => {
      const qty = Number(line.qty) || 0;
      const unit = Number(line.unitPrice) || 0;
      const tax = Number(line.taxPercent) || 0;
      return [
        line.description || line.name || "—",
        qty,
        money(unit),
        tax,
        money(lineTotal(qty, unit, tax)),
      ];
    }),
    totals: [
      { label: "Subtotal", value: money(totals.subtotal) },
      { label: "Discount", value: money(totals.discount) },
      { label: "Tax", value: money(totals.taxAmount) },
      { label: "Grand Total", value: money(totals.grand), emphasize: true },
    ],
    notes: call.estimateNotes || call.findings || undefined,
    footerNote: `Service estimate ${call.callNo}`,
  };
  downloadDocumentPdf(spec);
}

export function downloadServiceJobPdf(
  call: ServiceCall,
  visits: ServiceVisit[],
  company?: Company | null,
) {
  const parts = call.partsUsed ?? [];
  const visitRows = visits.flatMap((v) => [
    [`Visit ${v.visitNo}`, `${(v.visitDate || "").slice(0, 10)} · ${v.status} · ${v.assignedName || "—"}`],
    ["Work done", v.workDone || "—"],
    ["Visit notes", v.notes || "—"],
  ]);
  const partRows = parts.map((p) => [
    p.name || p.description || "Part",
    String(p.qty ?? 0),
    money(Number(p.unitPrice) || 0),
  ]);
  const photos = (call.servicePhotos ?? [])
    .map((p) => `${p.kind || "photo"}: ${p.name || "image"}`)
    .join("; ");
  const qaBadge =
    call.qaDecision === "pass" ? "QA PASS" : call.qaDecision === "fail" ? "QA FAIL" : "QA pending";

  const bodyRows: (string | number)[][] = [
    ...visitRows,
    ["Parts used", partRows.length ? partRows.map((r) => r.join(" × ")).join("; ") : "—"],
    ["Photos", photos || "—"],
    ["Customer handoff", call.customerHandoff ? `Yes · ${call.customerReceiverName || "—"}` : "No"],
    ["QA", `${qaBadge}${call.qaRemarks ? ` · ${call.qaRemarks}` : ""}`],
    ["Verified by", call.qaVerifiedByName || "—"],
  ];

  const spec: DocumentExportSpec = {
    filename: `${call.callNo}-service-report`,
    companyName: company?.name || "Company",
    companyLines: companyLines(company),
    title: "Service Job Report",
    docNumber: call.callNo,
    meta: [
      { label: "Customer", value: call.customerName },
      { label: "Equipment", value: call.equipmentName || "—" },
      { label: "Engineer", value: call.engineerName || call.assignedName || "—" },
      { label: "Status", value: statusLabel(call.status) },
      { label: "QA", value: qaBadge },
    ],
    columns: [
      { header: "Section" },
      { header: "Details" },
    ],
    rows: bodyRows,
    notes: call.description,
    footerNote: call.customerSignature ? "Customer signature on file" : `Service report ${call.callNo}`,
  };
  downloadDocumentPdf(spec);
}

export function downloadServiceInvoicePdf(call: ServiceCall, company?: Company | null) {
  const lines = [...(call.estimateLines ?? []), ...(call.partsUsed ?? [])];
  const totals = estimateTotals({
    ...call,
    estimateLines: lines.map((l) => ({
      ...l,
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      taxPercent: Number(l.taxPercent) || 0,
    })),
  });
  const spec: DocumentExportSpec = {
    filename: `${call.callNo}-invoice-summary`,
    companyName: company?.name || "Company",
    companyLines: companyLines(company),
    title: "Service Invoice Summary",
    docNumber: call.callNo,
    meta: [
      { label: "Customer", value: call.customerName },
      { label: "Invoice ref", value: call.invoiceDocId || "Not generated" },
      { label: "Call", value: call.callNo },
      { label: "Status", value: statusLabel(call.status) },
    ],
    columns: [
      { header: "Item" },
      { header: "Qty", align: "right", width: 22 },
      { header: "Rate", align: "right", width: 28 },
      { header: "Tax %", align: "right", width: 22 },
      { header: "Amount", align: "right", width: 30 },
    ],
    rows: lines.map((line) => {
      const qty = Number(line.qty) || 0;
      const unit = Number(line.unitPrice) || 0;
      const tax = Number(line.taxPercent) || 0;
      return [line.description || line.name || "—", qty, money(unit), tax, money(lineTotal(qty, unit, tax))];
    }),
    totals: [
      { label: "Subtotal", value: money(totals.subtotal) },
      { label: "Discount", value: money(totals.discount) },
      { label: "Tax", value: money(totals.taxAmount) },
      { label: "Grand Total", value: money(totals.grand), emphasize: true },
    ],
    notes: `Linked service call ${call.callNo}`,
  };
  downloadDocumentPdf(spec);
}

export function printServiceCallHtml(title: string, html: string) {
  openPrintWindow(title, html, true);
}
