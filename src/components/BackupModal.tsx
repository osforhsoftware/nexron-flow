import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, type CompanyBackupFile, type CompanyBackupState } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { Modal } from "./Modal";

function monthLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupModal({ onClose }: { onClose: () => void }) {
  const { company, can } = useApp();
  const companyId = company?.id;
  const canRead = can("backup", "read");
  const canUpdate = can("backup", "update");
  const [state, setState] = useState<CompanyBackupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.backups
      .list(companyId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load backups");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, canRead]);

  async function setAuto(autoMonthly: boolean) {
    if (!companyId || !canUpdate) return;
    setSaving(true);
    setError("");
    try {
      setState(await api.backups.setAutoMonthly(companyId, autoMonthly));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save backup setting");
    } finally {
      setSaving(false);
    }
  }

  async function downloadManual() {
    if (!companyId) return;
    setDownloading("manual");
    setError("");
    try {
      await api.backups.downloadManual(companyId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not download backup");
    } finally {
      setDownloading(null);
    }
  }

  async function downloadStored(file: CompanyBackupFile) {
    if (!companyId) return;
    setDownloading(file.id);
    setError("");
    try {
      await api.backups.downloadStored(companyId, file.period);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not download backup");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Modal title="Backup" onClose={onClose} className="modal-backup">
      <div className="backup-panel">
        <p className="backup-note">
          {company?.name
            ? `Backups include ${company.name} only: parties, items, documents, payments, equipment, and service calls.`
            : "Select a company before taking a backup."}
        </p>

        {!canRead ? (
          <p className="backup-error">Backup is limited to users with the Backup permission.</p>
        ) : null}

        {canRead && loading ? <p className="backup-empty">Loading backups…</p> : null}

        {canRead && !loading ? (
          <>
            <label className="backup-option">
              <span>
                <strong>Automatic backup every month</strong>
                <small>
                  One file is saved the first time you use the app in a month. Download any month from the list below.
                </small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(state?.autoMonthly)}
                disabled={!canUpdate || saving || !companyId}
                onChange={(event) => void setAuto(event.target.checked)}
                aria-label="Automatic backup every month"
              />
            </label>

            <div className="backup-option">
              <span>
                <strong>Manual backup</strong>
                <small>Download a file of the current data onto this computer.</small>
              </span>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!companyId || downloading !== null}
                onClick={() => void downloadManual()}
              >
                <Download size={14} />
                {downloading === "manual" ? "Preparing…" : "Download"}
              </button>
            </div>

            <div className="backup-saved">
              <strong>Monthly backups</strong>
              {state && state.backups.length === 0 ? (
                <p className="backup-empty">
                  No monthly file yet. Turn automatic backup on and it is created for this month.
                </p>
              ) : null}
              {state && state.backups.length > 0 ? (
                <ul className="backup-list">
                  {state.backups.map((file) => (
                    <li key={file.id}>
                      <span>
                        <strong>{monthLabel(file.period)}</strong>
                        <small>
                          {formatBytes(file.bytes)} · {new Date(file.createdAt).toLocaleString()}
                        </small>
                      </span>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={downloading !== null}
                        onClick={() => void downloadStored(file)}
                      >
                        {downloading === file.id ? "Preparing…" : "Get file"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}

        {error ? <p className="backup-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
