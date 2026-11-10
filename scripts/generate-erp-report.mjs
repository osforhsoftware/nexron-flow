import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, AlignmentType, PageNumber, Header, Footer,
  convertInchesToTwip } from "docx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "docs", "ERP_Ledgerly_vs_MESMS_Complete_Report.docx");

const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "1F4E79" };
const altShading = { fill: "F2F2F2" };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: opts.line },
    alignment: opts.align,
    ...opts.heading ? { heading: opts.heading } : {},
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        size: opts.size ?? 22,
        font: "Calibri",
        color: opts.color,
      }),
    ],
  });
}

function rich(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
    alignment: opts.align,
    ...opts.heading ? { heading: opts.heading } : {},
    children: runs.map((r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italics,
        size: r.size ?? 22,
        font: "Calibri",
        color: r.color,
      }),
    ),
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: "Calibri", color: "1F4E79" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 26, font: "Calibri", color: "2E75B6" })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: "Calibri", color: "404040" })],
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: convertInchesToTwip(0.25) },
    children: [
      new TextRun({ text: `• ${text}`, size: opts.size ?? 22, font: "Calibri", bold: opts.bold }),
    ],
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    borders,
    width: { size: opts.width ?? 2400, type: WidthType.DXA },
    shading: opts.header ? headerShading : opts.alt ? altShading : undefined,
    children: [
      new Paragraph({
        spacing: { after: 40, before: 40 },
        children: [
          new TextRun({
            text: String(text),
            bold: opts.header || opts.bold,
            size: opts.header ? 20 : 18,
            font: "Calibri",
            color: opts.header ? "FFFFFF" : "333333",
          }),
        ],
      }),
    ],
  });
}

function table(headers, rows, colWidths) {
  const widths = colWidths || headers.map(() => Math.floor(9000 / headers.length));
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => cell(h, { header: true, width: widths[i] })),
      }),
      ...rows.map(
        (row, ri) =>
          new TableRow({
            children: row.map((c, i) =>
              cell(c, { width: widths[i], alt: ri % 2 === 1, bold: i === 0 }),
            ),
          }),
      ),
    ],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

const doc = new Document({
  creator: "Cursor Analysis Report",
  title: "ERP Comparison — Ledgerly (Vyapar-like) vs MESMS",
  description: "Complete functional comparison, MESMS issues, and simplification recommendations",
  styles: {
    default: {
      document: {
        styles: [{ id: "Normal", run: { font: "Calibri", size: 22 } }],
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.9),
            bottom: convertInchesToTwip(0.9),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "ERP Feature & Issues Report — Ledgerly vs MESMS",
                  size: 16,
                  font: "Calibri",
                  color: "666666",
                  italics: true,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", size: 16, font: "Calibri", color: "666666" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Calibri", color: "666666" }),
                new TextRun({ text: " of ", size: 16, font: "Calibri", color: "666666" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Calibri", color: "666666" }),
              ],
            }),
          ],
        }),
      },
      children: [
        // COVER
        p("COMPLETE SOFTWARE DOCUMENTATION", { size: 24, color: "666666", align: AlignmentType.CENTER, after: 80 }),
        p("ERP Comparison, Functionalities & Issues Report", {
          size: 40, bold: true, color: "1F4E79", align: AlignmentType.CENTER, after: 200,
        }),
        p("Ledgerly (Vyapar-like Web App)  ↔  MESMS (Medical Equipment Service Management)", {
          size: 22, align: AlignmentType.CENTER, after: 80, italics: true,
        }),
        spacer(),
        table(
          ["Field", "Detail"],
          [
            ["Document type", "Full functional comparison + MESMS issues + recommendations"],
            ["Software A", "Ledgerly / vyapar-web (Vyapar-style billing demo)"],
            ["Software B", "MESMS — Medical Equipment Service Management"],
            ["Purpose", "Convert billing-style app toward ERP like MESMS; document gaps & client issues"],
            ["Language", "English (full technical report)"],
            ["Date", "10 November 2026"],
            ["Status", "Read-only analysis — no application code changes"],
            ["Audience", "Product owner, developers, client stakeholders"],
          ],
          [2800, 6200],
        ),
        spacer(),
        p("Paths analysed", { bold: true, size: 20 }),
        bullet("Ledgerly: C:\\Users\\USER\\Documents\\shabeeb\\memes_desgin\\vyapar-web-source\\vyapar-web"),
        bullet("MESMS: C:\\Users\\USER\\Documents\\shabeeb\\mems_software\\Medical-Equipment-Service-Management"),

        // TOC-ish overview
        h1("1. Executive Summary"),
        p("Ledgerly is a Vyapar-inspired SMB billing web prototype (parties, items, sale/purchase, cash & bank, reports UI). MESMS is a multi-module ERP for medical-equipment service companies (sales, service tickets, inspections, estimates, jobs, inventory, purchase, billing, finance, roles, reports, portal)."),
        p("Client feedback on MESMS: too many permissions, not smooth to use. The permission model has overlapping layers (roles + RBAC matrix + per-user module levels + hardcoded rules). Recommendation: simplify to 5 job roles + one company approval switch."),
        table(
          ["Aspect", "Ledgerly (Vyapar-like)", "MESMS (ERP)"],
          [
            ["Product type", "SMB billing / books UI", "Service + sales + supply-chain ERP"],
            ["Architecture", "Frontend only (Dexie/IndexedDB)", "React + Node/Express + Prisma/MySQL"],
            ["Users / auth", "Mock OTP / Google; single session", "JWT cookie; multi-role staff + portal"],
            ["Permissions", "None (open after login)", "Over-layered (client complaint)"],
            ["Core focus", "Sale / purchase / parties / GST UI", "Service lifecycle + inventory + finance"],
            ["Maturity", "Demo / prototype", "Broad UI + APIs; some Partial/Simulated"],
          ],
          [2200, 3400, 3400],
        ),

        h1("2. Software A — Ledgerly (Vyapar-like) Complete Functionalities"),
        h2("2.1 Product identity"),
        bullet("Brand in UI: Ledgerly"),
        bullet("Inspired by Vyapar desktop product structure"),
        bullet("Stack: React + Vite + TypeScript + Dexie + React Router + Framer Motion"),
        bullet("Demo login: any name/phone → OTP 123456, or mocked Google continue"),
        bullet("Data persists in browser IndexedDB; Settings → Reset & reseed restores demo"),

        h2("2.2 Modules that actually work (persisted locally)"),
        table(
          ["Module", "Functionality"],
          [
            ["Login / session", "Mock auth, protected routes, sign-out"],
            ["Companies", "Create/switch companies; company-scoped data"],
            ["Dashboard (Home)", "Sales total, to-receive, to-pay, stock value, recent txns, quick actions"],
            ["Parties", "Customers/suppliers CRUD, search, opening balance, party txn list, computed balance"],
            ["Items", "Product/service CRUD, SKU, unit, prices, tax %, category, stock qty"],
            ["Sale invoices", "Party, line items, qty/rate/discount/tax, notes/terms, round-off, list"],
            ["Purchase bills", "Same pattern for purchases"],
            ["Payments / Cash & Bank", "Accounts (cash/bank/cheque/UPI); payment-in/out; balances"],
            ["Reports (partial)", "Sales summary, party ledger/balances, lite P&L; GST-style shells"],
            ["Settings (partial)", "Business profile save; toggles; demo reset"],
          ],
          [2800, 6200],
        ),

        h2("2.3 Sidebar menu (Vyapar-like structure)"),
        bullet("Home"),
        bullet("Parties — Party Details, WhatsApp Connect, Ledgerly Network"),
        bullet("Items — Item Details, Categories, Stock Summary"),
        bullet("Sale — Sale Invoices, Estimate/Quotation, Proforma, Payment-In, Sale Order, Delivery Challan, Sale Return/Credit Note, POS"),
        bullet("Purchase & Expense — Purchase Bills, Payment-Out, Purchase Order, Expenses, Purchase Return"),
        bullet("Cash & Bank — Bank Accounts, Cash In Hand, Cheques, Loan Accounts"),
        bullet("Reports"),
        bullet("Sync, Share & Backup"),
        bullet("Utilities — Import Items, Set Up Business, Accountant Access, Barcode, Export To Tally"),
        bullet("Settings"),

        h2("2.4 UI-only / incomplete (labels without full engines)"),
        p("Many sale/purchase child document types are view titles on the same invoice page, not separate document workflows. Utilities and Backup cards are present without real import/export/backup engines. GST report catalog (GSTR-1/2/3B/9, Trial Balance, Balance Sheet, etc.) is largely menu/UI, not full statutory engines."),

        h2("2.5 Architecture limits (why it is not ERP yet)"),
        bullet("No server / multi-user concurrency"),
        bullet("No role permissions"),
        bullet("No workflow states (draft → approved → invoiced)"),
        bullet("No stock reservation / GRN / warehouse locations"),
        bullet("No service jobs, equipment, inspections, projects"),
        bullet("Data only in browser IndexedDB"),

        h1("3. Software B — MESMS Complete Functionalities"),
        h2("3.1 Product identity"),
        bullet("Medical Equipment Service Management System (MESMS)"),
        bullet("Multi-tenant / multi-branch oriented service ERP"),
        bullet("Staff app: /app · Customer portal: /portal (feature-flagged)"),
        bullet("Backend: Node.js + Express + Prisma + MySQL"),
        bullet("Auth: JWT in HTTP-only cookie"),
        bullet("Role-based sidebar + ModuleGuard on routes"),

        h2("3.2 Complete module map (website features)"),
        h3("Overview"),
        bullet("Dashboard (desktop + mobile variants)"),
        h3("Sales"),
        bullet("Sales Overview, Enquiry, Quotation, Sales Order (SO), Delivery, Invoice"),
        bullet("Customers (list + detail)"),
        h3("Operations"),
        bullet("Equipment (list + detail)"),
        bullet("Service Tickets — All / Pending / Inspection / Estimate / Approval / In Progress / Completed"),
        bullet("Inspections (+ report view)"),
        bullet("Estimates (builder, detail, preview)"),
        bullet("Service Jobs (desktop + mobile)"),
        bullet("Projects (stage filters)"),
        bullet("Service Catalog"),
        bullet("Warranty Claims"),
        h3("Supply Chain"),
        bullet("Inventory — Overview / Parts / Reserve / Stock issue / Locations / Reorder / Cost"),
        bullet("Inventory QR lookup"),
        bullet("Suppliers"),
        bullet("Purchase desk: Purchase request → RFQ → Supplier quote → PO → Shipment → Customs → GRN → Stock"),
        bullet("Purchase Returns"),
        bullet("Stock reservations, stock ledger, stock transfers/locations"),
        h3("Contracts & Finance"),
        bullet("Billing (job billing + invoice detail; mobile billing)"),
        bullet("Finance — Overview / Receivables / Payments / VAT / Profit / Credit"),
        h3("Insights"),
        bullet("Reports hub + Service / Financial / Inventory / Management reports"),
        bullet("Notifications, QR Tracking, Audit Logs"),
        h3("Administration"),
        bullet("Users (create/edit), Master Data, Office Assets, Settings (company, tax, logo, RBAC, automation, demo seed)"),
        h3("Customer portal (when enabled)"),
        bullet("Portal dashboard, Equipment, Estimates (approve/reject UI), Documents, History"),

        h2("3.3 Core operational workflow"),
        p("Request intake → Inspection → Estimate → Admin approval → Engineer assigned → Job execution → Change approval loop → Final approval → Invoice → Closed"),
        p("Supporting workflows: AMC, stock transfer, purchase order, QR asset lookup, notifications, audit."),

        h2("3.4 Roles currently in MESMS"),
        table(
          ["Role", "Primary job"],
          [
            ["Administrator", "Full control, users, settings, audit"],
            ["Coordinator", "Intake, assign, schedule, monitor"],
            ["Inspector", "Inspections & reports"],
            ["Estimator", "Quotes / estimates"],
            ["Sales", "Product sales desk"],
            ["Engineer", "Field jobs, parts use, sign-off"],
            ["Inventory", "Stock, suppliers, POs, transfers"],
            ["Billing", "Invoices, finance views"],
            ["QA", "Quality / review access"],
            ["Customer", "Portal only"],
          ],
          [2800, 6200],
        ),

        h2("3.5 Maturity snapshot"),
        p("Working well for staff demos: login, role nav, customers, equipment, tickets, inspections, estimate totals, jobs progress, inventory/supplier/PO records, billing list, users/settings.", { after: 120 }),
        p("Still partial / simulated in places: portal data, full PDF/email, estimate line-item depth, strict backend RBAC everywhere, full stock receive/ledger concurrency, payments linkage, automatic audit on every action."),

        h1("4. Side-by-Side Functionality Comparison"),
        table(
          ["ERP capability", "Ledgerly today", "MESMS today", "Needed for ERP like MESMS"],
          [
            ["Multi-user roles", "No", "Yes (nav + guards)", "Yes"],
            ["Backend + DB", "No (Dexie)", "Yes", "Yes"],
            ["Customers / parties", "Yes", "Yes", "Keep + deepen"],
            ["Items / inventory", "Simple stock", "Parts, reserve, locations", "Expand heavily"],
            ["Sales documents", "Sale invoice + labels", "Enquiry→Quote→SO→Delivery→Invoice", "Full pipeline"],
            ["Purchase chain", "Purchase bill + labels", "PR→RFQ→PO→GRN→Stock", "Full pipeline"],
            ["Cash / payments", "Working locally", "Finance payments/receivables", "Keep + link invoices"],
            ["Service operations", "None", "Tickets, inspection, jobs", "Add if service ERP"],
            ["Equipment / assets", "None", "Equipment + QR", "Add for asset ERP"],
            ["Billing from jobs", "N/A", "Billing module", "Required for service ERP"],
            ["Domain reports", "Billing/GST UI", "Service/Financial/Inventory/Mgmt", "Domain reports"],
            ["Notifications", "No", "Yes", "Yes"],
            ["Audit logs", "No", "Yes", "Yes"],
            ["Customer portal", "No", "Shell + mock", "Optional later"],
            ["Mobile field app", "No", "Jobs/QR/billing", "Optional"],
            ["GST / SME books", "Strong UI ambition", "Finance/VAT oriented", "Positioning decision"],
          ],
          [2200, 2000, 2400, 2400],
        ),

        h1("5. MESMS Issues — Client Complaint: Over-Permissions"),
        h2("5.1 Client complaint (summary)"),
        rich([
          { text: "Client feedback: ", bold: true },
          { text: "Too many permissions; application is not smooth to use. Staff get blocked menus/buttons; admins spend time on checkboxes instead of work." },
        ]),

        h2("5.2 Why permissions feel “over” (root cause)"),
        p("Access is controlled in 3–4 overlapping layers:"),
        table(
          ["Layer", "What it is", "Problem for client"],
          [
            ["1. Roles", "~9 roles (admin, coordinator, inspector…)", "Too many role names to understand"],
            ["2. RBAC matrix", "Settings: each menu × each role checkbox", "Big grid; easy to misconfigure"],
            ["3. Per-user permissions", "User form: read/crud + per-module none/read/crud + bypass approvals", "Same control again per person"],
            ["4. Hardcoded role lists", "Extra write rules in code (roles.ts, ModuleGuard)", "Settings save can still feel inconsistent"],
          ],
          [2200, 3400, 3400],
        ),
        p("Result: over-engineered for daily SME use. Fine security control became friction."),

        h2("5.3 Other MESMS issues / gaps (from project docs & analysis)"),
        table(
          ["Area", "Issue / gap"],
          [
            ["Customer portal", "Routes exist; much business data still mock / not fully API-backed"],
            ["PDFs & email", "Invoice/service report PDF and email delivery incomplete or simulated"],
            ["Estimate depth", "Line items, tax/discount/terms, customer approve API partial/missing"],
            ["Inventory movements", "PO receive → stock, transfer receipt, ledger/concurrency incomplete in places"],
            ["Payments linkage", "Invoice–payment–ticket close linkage weak vs full finance ERP"],
            ["Backend RBAC", "Matrix largely drives nav; not every write API strictly guarded"],
            ["Audit trail", "UI/API present; not always auto-written on every business action"],
            ["Approvals UX", "Many approval gates + per-user bypass → confusing for small teams"],
            ["Notifications", "List exists; not always per-user recipient model"],
            ["QR tracking", "UI present; some pages underuse live asset-tag lookup"],
          ],
          [2800, 6200],
        ),

        h2("5.4 Malayalam explanation (for client discussion)"),
        p("ക്ലയന്റ് പറയുന്നത്: Permission ധാരാളം ഉണ്ട്; ഉപയോഗിക്കാൻ സുഗമമല്ല. ഇപ്പോൾ അനുമതി ഒരു സ്ഥലത്തല്ല — Role, Settings matrix, User form module levels, code rules എന്നിവയെല്ലാം ഒരുമിച്ചുണ്ട്. പരിഹാരം: ലളിതമായ job role മാത്രം (Admin / Office / Field / Store / Accounts); ഒരാൾക്ക് ഒരു role; അധിക permission grids നീക്കം/മറയ്ക്കുക; Approvals-ന് ഒരു company ON/OFF switch."),

        h1("6. Recommended Simple Permission Model"),
        h2("6.1 Principle"),
        p("One rule only: pick a job role → that role opens the right screens. No per-module grid for normal users."),

        h2("6.2 Five simple roles"),
        table(
          ["Role", "Can do", "Cannot do"],
          [
            ["Admin", "Everything", "—"],
            ["Office", "Customers, tickets, estimates, sales docs, reports", "Stock receive / system settings"],
            ["Field", "Assigned inspections + jobs + QR", "Billing, users, purchase"],
            ["Store", "Inventory, suppliers, purchase, stock", "Approvals, users"],
            ["Accounts", "Billing, finance, invoices, payments", "Field jobs, stock edits"],
          ],
          [1800, 4200, 3000],
        ),
        bullet("Optional: Read-only toggle for auditors/accountants (view only)."),
        bullet("Company setting: Skip Approvals ON/OFF (small team → ON for speed)."),

        h2("6.3 What to remove / hide from client UI"),
        bullet("Big RBAC module × role matrix in Settings (or Admin advanced only)"),
        bullet("Per-user module none/read/crud grid on User form"),
        bullet("Multiple overlapping roles on one user (one primary role)"),
        bullet("bypassApprovals as a normal per-user checkbox (use company switch)"),

        h2("6.4 Client-facing statement"),
        p("“Earlier we built ERP-level permission (role + matrix + per-user). That is too heavy for your team. We will switch to simple job roles only (Admin / Office / Field / Store / Accounts). Each person gets one role, and the menu opens automatically. Extra permission grids will be removed or hidden.”"),

        h2("6.5 Decision options"),
        table(
          ["Option", "Smoothness", "Control", "Best for"],
          [
            ["A. Role-only", "High", "Medium", "Client complaint (recommended base)"],
            ["B. Role + company Skip Approvals", "Highest for small teams", "Medium", "5–15 staff (recommended)"],
            ["C. Keep current multi-layer", "Low", "High", "Large enterprise only"],
          ],
          [2800, 2000, 1800, 2400],
        ),
        p("Recommendation: Option B — simple roles + one approval switch. Keep MESMS ERP features without over-permission pain."),

        h1("7. Target ERP Feature List (Ledgerly → MESMS-like)"),
        h2("7.1 Foundation"),
        bullet("Multi-company / multi-branch"),
        bullet("User management + simple roles"),
        bullet("Secure login, sessions, password reset"),
        bullet("Master data (units, tax, categories, payment modes, document series)"),
        bullet("Settings (profile, tax, print, numbering, logo)"),
        bullet("Audit log of sensitive actions"),

        h2("7.2 CRM / Parties"),
        bullet("Customers & suppliers (contacts, GSTIN, addresses, credit limit)"),
        bullet("Party ledger & statements; opening balances"),
        bullet("Optional customer portal"),

        h2("7.3 Catalog & Inventory"),
        bullet("Products / services / spare parts; categories, SKU, barcode/QR"),
        bullet("Multi-location warehouses; stock in/out/transfer; reservations"),
        bullet("Stock ledger & valuation; low-stock / reorder; bulk import/export"),

        h2("7.4 Sales ERP chain"),
        bullet("Enquiry → Quotation/Estimate → Sales Order → Delivery → Tax Invoice → Credit Note"),
        bullet("Optional POS"),

        h2("7.5 Purchase ERP chain"),
        bullet("Purchase/stock request → RFQ & quotes → PO → GRN → Purchase bill → Return → Supplier payments"),

        h2("7.6 Finance"),
        bullet("Payment-in/out; cash & bank; receivables/payables aging; expenses"),
        bullet("Tax/GST or VAT reports; profit views; credit notes"),

        h2("7.7 Operations (MESMS-style service ERP)"),
        bullet("Equipment registry; service tickets with staged workflow"),
        bullet("Inspections + photos + spare recommendations; estimates with approval"),
        bullet("Job cards (mobile-friendly); warranty claims; projects/AMC; service catalog; QA/sign-off"),

        h2("7.8 Insights & platform"),
        bullet("Role dashboards; service/financial/inventory/management reports"),
        bullet("Notifications; QR tracking; backup/restore; PDF print/share; attachments; demo seed; mobile"),

        h1("8. Definition of “Fully Functioning” Module"),
        p("For a module to count as fully functioning (MESMS production standard), it must have:"),
        bullet("List + create + detail screens"),
        bullet("Persistent save through API/database (not only localStorage/toast)"),
        bullet("Status workflow where business requires approval"),
        bullet("Role access control (who can see/edit) — preferably simple roles"),
        bullet("Cross-module links (estimate → job → invoice → payment; PO → GRN → stock)"),
        bullet("Reports or auditability on the same data"),

        h1("9. Transformation Roadmap (Planning)"),
        table(
          ["Phase", "Focus", "Outcome"],
          [
            ["Phase 1", "Platform", "Backend, auth, simple roles, companies/branches, master data, settings, audit"],
            ["Phase 2", "Commercial core", "Parties, items, sales pipeline, purchase pipeline, payments, invoices"],
            ["Phase 3", "Inventory ERP", "Locations, reservations, ledger, GRN, returns, QR/barcode"],
            ["Phase 4", "Operations ERP", "Tickets → inspection → estimate → job → billing close"],
            ["Phase 5", "Insights & portal", "Domain reports, notifications, customer portal, mobile field tools"],
          ],
          [1600, 2400, 5000],
        ),

        h1("10. Final Conclusions"),
        bullet("Ledgerly = good Vyapar-like UI prototype for Indian SMB billing."),
        bullet("MESMS = much closer to a full ERP website (sales, operations, supply chain, finance, admin, portal)."),
        bullet("To make Ledgerly ERP-like MESMS: use MESMS as feature blueprint; keep Ledgerly billing UX patterns; rebuild on server + simple roles + workflows + linked modules."),
        bullet("Primary MESMS client issue today: over-permissions — simplify to 5 roles + optional Skip Approvals."),
        bullet("Secondary MESMS work: complete Partial/Simulated paths (portal, PDF, stock movements, payments, backend guards, auto-audit)."),

        h1("11. Related Source References"),
        bullet("MESMS: PROJECT_WORKFLOWS_ROLES_FEATURES.md"),
        bullet("MESMS: PROJECT_SCOPE_AND_GAP_ANALYSIS.md"),
        bullet("MESMS: frontend/src/config/nav.ts, defaultRbac.ts, roles.ts"),
        bullet("MESMS: frontend/src/lib/userPermissions.ts, pages/app/UserForm.tsx, Settings.tsx"),
        bullet("Ledgerly: src/App.tsx, AppLayout.tsx, db/types.ts, pages/*"),
        bullet("Ledgerly: README.md"),

        spacer(),
        p("— End of document —", { align: AlignmentType.CENTER, italics: true, color: "666666", after: 40 }),
        p("Generated as a read-only analysis document. No application code was modified for this report.", {
          align: AlignmentType.CENTER, size: 18, color: "888888",
        }),
      ],
    },
  ],
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log("Wrote:", outPath);
console.log("Size:", buffer.length, "bytes");
