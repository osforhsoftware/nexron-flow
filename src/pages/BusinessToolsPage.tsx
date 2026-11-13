import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Barcode,
  BookOpenCheck,
  Briefcase,
  FileSpreadsheet,
  PackageOpen,
  QrCode,
  ShieldCheck,
  Store,
  Upload,
  UsersRound,
} from "lucide-react";
import { BackupModal } from "../components/BackupModal";
import { ItemBulkImportModal } from "../components/ItemBulkImportModal";
import { PageHeader } from "../components/UI";

const utilityItems = [
  [QrCode, "Scan QR", "Open product or equipment details from a camera or uploaded label"],
  [PackageOpen, "Import Items", "Import your inventory from Excel or CSV"],
  [Upload, "Backup", "Automatic backup every month, or download a file now"],
  [Store, "Set Up My Business", "Configure company, invoice and tax details"],
  [UsersRound, "Accountant Access", "Share secure access with your accountant"],
  [Barcode, "Barcode Generator", "Create and print item barcode labels"],
  [FileSpreadsheet, "Update Items In Bulk", "Edit prices and stock from a spreadsheet"],
  [Upload, "Export To Tally", "Export transactions in Tally-compatible format"],
  [BookOpenCheck, "Verify My Data", "Run checks across books and inventory"],
  [ShieldCheck, "Close Financial Year", "Archive and begin a new financial year"],
  [Briefcase, "Services", "Service items, sale price and tax"],
] as const;

export function BusinessToolsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("import") === "items") {
      setImportOpen(true);
    }
    if (searchParams.get("backup") === "1") {
      setBackupOpen(true);
    }
  }, [searchParams]);

  function closeImport() {
    setImportOpen(false);
    if (searchParams.get("import") === "items") {
      const next = new URLSearchParams(searchParams);
      next.delete("import");
      setSearchParams(next, { replace: true });
    }
  }

  function closeBackup() {
    setBackupOpen(false);
    if (searchParams.get("backup") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("backup");
      setSearchParams(next, { replace: true });
    }
  }

  function onTool(name: string) {
    if (name === "Scan QR") {
      navigate("/scan");
      return;
    }
    if (name === "Import Items") {
      setImportOpen(true);
      return;
    }
    if (name === "Backup") {
      setBackupOpen(true);
    }
    if (name === "Services") {
      navigate("/items/services");
    }
  }

  return (
    <>
      <PageHeader title="Utilities" subtitle="Everything you need to manage and grow your business" />
      <div className="content">
        <div className="tool-grid">
          {utilityItems.map(([Icon, name, description]) => (
            <button className="tool-card" type="button" key={name} onClick={() => onTool(name)}>
              <Icon size={22} />
              <span>
                <strong>{name}</strong>
                <small>{description}</small>
              </span>
              <b>›</b>
            </button>
          ))}
        </div>
      </div>

      {importOpen ? <ItemBulkImportModal onClose={closeImport} /> : null}
      {backupOpen ? <BackupModal onClose={closeBackup} /> : null}
    </>
  );
}
