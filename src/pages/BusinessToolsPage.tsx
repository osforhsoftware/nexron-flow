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

export function BusinessToolsPage({ kind }: { kind: "utilities" | "backup" }) {
  const title = kind === "utilities" ? "Utilities" : "Sync, Share & Backup";
  const items = kind === "utilities"
    ? utilityItems
    : [[Cloud, "Auto Backup", "Keep an encrypted copy of your business data"], [Upload, "Create Manual Backup", "Download a local backup file"], [UsersRound, "Share Business", "Invite staff with controlled access"], [ShieldCheck, "Restore Data", "Restore from an earlier backup"]] as const;

  return (
    <>
      <PageHeader title={title} subtitle="Everything you need to manage and grow your business" />
      <div className="content">
        <div className="tool-grid">
          {items.map(([Icon, name, description]) => (
            <button className="tool-card" type="button" key={name}>
              <Icon size={22} />
              <span><strong>{name}</strong><small>{description}</small></span>
              <b>›</b>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
