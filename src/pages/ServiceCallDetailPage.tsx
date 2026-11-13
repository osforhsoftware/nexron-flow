import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Download, Printer, Save } from "lucide-react";
import { api, type ApiUser } from "../lib/api";
import type { Company, Equipment, Party, ServiceCall, ServicePhoto } from "../db/types";
import { useApp } from "../lib/AppContext";
import { useAsync } from "../lib/useAsync";
import { InspectionPhotoGrid } from "../components/InspectionPhotoGrid";
import { SignaturePadField } from "../components/SignaturePadField";
import { StaffAssignFields, roleIdForUser } from "../components/StaffAssignFields";
import { downloadInspectionPdf, openInspectionReport } from "../lib/serviceCallReports";

type Tab = "overview" | "inspection" | "report";

function normalizeStatus(value?: string | null) {
  if (value === "assigned") return "inspection";
  if (value === "done") return "billing";
  return value || "open";
}

function statusLabel(value?: string | null) {
  const map: Record<string, string> = {
    open: "Open",
    inspection: "Inspection",
    estimate: "Estimate",
    in_progress: "In Progress",
    qa: "QA",
    billing: "Billing",
    closed: "Closed",
  };
  return map[normalizeStatus(value)] || "Open";
}

function datetimeLocal(value?: string | null) {
  if (!value) return "";
  const d = value.replace("Z", "").slice(0, 16);
  return d.length >= 16 ? d : `${value.slice(0, 10)}T09:00`;
}

export function ServiceCallDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { company } = useApp();
  const companyId = company?.id;

  const initialTab = (searchParams.get("tab") as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(
    initialTab === "inspection" || initialTab === "report" ? initialTab : "overview",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [call, setCall] = useState<ServiceCall | null>(null);

  const [inspectorRoleId, setInspectorRoleId] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [findings, setFindings] = useState("");
  const [workRequired, setWorkRequired] = useState("");
  const [workDetails, setWorkDetails] = useState("");
  const [requestedParts, setRequestedParts] = useState("");
  const [recommendationNotes, setRecommendationNotes] = useState("");
  const [photos, setPhotos] = useState<ServicePhoto[]>([]);
  const [inspectorSignature, setInspectorSignature] = useState<string | null>(null);

  const { data: assignOptions } = useAsync(async () => {
    try {
      return await api.staffAssignOptions();
    } catch {
      return { users: [] as ApiUser[], roles: [] };
    }
  }, []);
  const users = assignOptions?.users;
  const roles = assignOptions?.roles;

  const { data: equipment } = useAsync(async () => {
    if (!companyId || !call?.equipmentId) return null;
    try {
      const { equipment: list } = await api.equipment.list(companyId);
      return list.find((e) => e.id === call.equipmentId) ?? null;
    } catch {
      return null;
    }
  }, [companyId, call?.equipmentId]);

  const { data: party } = useAsync(async () => {
    if (!companyId || !call?.customerId) return null;
    try {
      const { parties } = await api.parties.list(companyId);
      return parties.find((p) => p.id === call.customerId) ?? null;
    } catch {
      return null;
    }
  }, [companyId, call?.customerId]);

  function hydrate(item: ServiceCall) {
    setCall(item);
    setInspectorId(item.inspectorId ?? item.assignedUserId ?? "");
    setInspectorName(item.inspectorName ?? item.assignedName ?? "");
    setInspectorRoleId(
      roleIdForUser(
        (users ?? []).find((u) => u.id === (item.inspectorId ?? item.assignedUserId)),
        roles ?? [],
      ),
    );
    setInspectionDate(datetimeLocal(item.inspectionDate) || new Date().toISOString().slice(0, 16));
    setFindings(item.findings ?? "");
    setWorkRequired(item.workRequired ?? "");
    setWorkDetails(item.workDetails ?? "");
    setRequestedParts(item.requestedParts ?? "");
    setRecommendationNotes(item.recommendationNotes ?? "");
    setPhotos(item.inspectionPhotos ?? []);
    setInspectorSignature(item.inspectorSignature ?? null);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const { serviceCall } = await api.serviceCalls.get(id);
        if (!cancelled) hydrate(serviceCall);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load service call.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!call || !users) return;
    if (inspectorRoleId) return;
    setInspectorRoleId(
      roleIdForUser(
        users.find((u) => u.id === (call.inspectorId ?? call.assignedUserId)),
        roles ?? [],
      ),
    );
  }, [call, users, roles, inspectorRoleId]);

  const pipeline = useMemo(
    () =>
      [
        { id: "open", label: "Open" },
        { id: "inspection", label: "Inspection" },
        { id: "estimate", label: "Estimate", later: true },
        { id: "in_progress", label: "Job", later: true },
        { id: "qa", label: "QA", later: true },
        { id: "billing", label: "Billing", later: true },
      ] as const,
    [],
  );

  const currentStatus = normalizeStatus(call?.status);

  async function saveInspection(opts?: { complete?: boolean }) {
    if (!call) return;
    setSaving(true);
    setError("");
    try {
      let name = inspectorName.trim();
      if (inspectorId && !name) {
        name = (users ?? []).find((u) => u.id === inspectorId)?.name ?? "";
      }
      const payload = {
        inspectorId: inspectorId || null,
        inspectorName: name || null,
        assignedUserId: inspectorId || call.assignedUserId || null,
        assignedName: name || call.assignedName || null,
        inspectionDate: inspectionDate || null,
        findings: findings.trim() || null,
        workRequired: workRequired.trim() || null,
        workDetails: workDetails.trim() || null,
        requestedParts: requestedParts.trim() || null,
        recommendationNotes: recommendationNotes.trim() || null,
        inspectionPhotos: photos,
        inspectorSignature: inspectorSignature || null,
        ...(opts?.complete ? { action: "complete_inspection" as const } : {}),
      };
      const { serviceCall } = await api.serviceCalls.update(call.id, payload);
      hydrate(serviceCall);
      if (opts?.complete) {
        setTab("report");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save inspection.");
    } finally {
      setSaving(false);
    }
  }

  if (!call && !error) {
    return (
      <div className="content">
        <p className="muted">Loading service call…</p>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="content">
        <p className="form-error">{error}</p>
        <Link className="btn btn-ghost" to="/service/calls">
          Back to list
        </Link>
      </div>
    );
  }

  const reportPayload = {
    ...call,
    findings,
    workRequired,
    workDetails,
    recommendationNotes,
    inspectionPhotos: photos,
    inspectorSignature,
    inspectionDate,
    inspectorName: inspectorName || call.inspectorName,
  };

  return (
    <>
      <header className="topbar">
        <div className="svc-page-title">
          <button type="button" className="btn btn-ghost svc-back-btn" onClick={() => navigate("/service/calls")}>
            <ChevronLeft size={14} /> Service Calls
          </button>
          <div>
            <h1>{call.callNo}</h1>
            <p className="muted">
              {call.customerName}
              {call.equipmentName ? ` · ${call.equipmentName}` : ""} ·{" "}
              <span className={`service-status-${normalizeStatus(call.status)}`}>{statusLabel(call.status)}</span>
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn btn-ghost" onClick={() => openInspectionReport(reportPayload, company, { party, equipment })}>
            <Printer size={13} /> Print
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => downloadInspectionPdf(reportPayload, company, { party, equipment })}
          >
            <Download size={13} /> Download PDF
          </button>
        </div>
      </header>

      <div className="content svc-page">
        <div className="svc-pipeline" aria-label="Service flow">
          {pipeline.map((step, idx) => {
            const activeIdx = pipeline.findIndex((s) => s.id === currentStatus);
            const done = activeIdx > idx;
            const active = step.id === currentStatus || (currentStatus === "closed" && step.id === "billing");
            return (
              <div
                key={step.id}
                className={`svc-pipe-step${active ? " active" : ""}${done ? " done" : ""}${step.later ? " later" : ""}`}
                title={step.later ? "Coming in a later phase" : step.label}
              >
                <span>{idx + 1}</span>
                <strong>{step.label}</strong>
              </div>
            );
          })}
        </div>

        <div className="service-detail-tabs" role="tablist">
          {(
            [
              ["overview", "Overview"],
              ["inspection", "Inspection"],
              ["report", "Report"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`filter-chip${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {tab === "overview" ? (
          <div className="panel">
            <div className="panel-head">
              <h2>Call summary</h2>
              <button type="button" className="btn btn-primary" onClick={() => setTab("inspection")}>
                Conduct inspection
              </button>
            </div>
            <div className="panel-pad svc-summary-grid">
              <div>
                <small>Customer</small>
                <strong>{call.customerName}</strong>
              </div>
              <div>
                <small>Equipment</small>
                <strong>{call.equipmentName || "—"}</strong>
              </div>
              <div>
                <small>Type</small>
                <strong>{call.type}</strong>
              </div>
              <div>
                <small>Priority</small>
                <strong>{String(call.priority)}</strong>
              </div>
              <div>
                <small>Assigned</small>
                <strong>{call.assignedName || call.inspectorName || "Unassigned"}</strong>
              </div>
              <div>
                <small>Schedule</small>
                <strong>{(call.scheduledFor || "").slice(0, 10) || "—"}</strong>
              </div>
              <div className="full">
                <small>Problem description</small>
                <strong className="svc-pre">{call.description}</strong>
              </div>
              {call.notes ? (
                <div className="full">
                  <small>Internal notes</small>
                  <strong className="svc-pre">{call.notes}</strong>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "inspection" ? (
          <div className="panel svc-inspect-panel">
            <div className="panel-head">
              <h2>Conduct inspection</h2>
              <div className="svc-form-actions">
                <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => void saveInspection()}>
                  <Save size={13} /> Save draft
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void saveInspection({ complete: true })}
                >
                  {saving ? "Saving…" : "Complete inspection"}
                </button>
              </div>
            </div>

            <div className="panel-pad svc-inspect-body">
              <div className="svc-form-grid svc-form-grid-3">
                <StaffAssignFields
                  users={users}
                  roles={roles}
                  roleId={inspectorRoleId}
                  userId={inspectorId}
                  onChange={({ roleId, userId, name }) => {
                    setInspectorRoleId(roleId);
                    setInspectorId(userId);
                    setInspectorName(name);
                  }}
                />
                <label className="field">
                  <span>Inspection date & time</span>
                  <input
                    type="datetime-local"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                  />
                </label>
              </div>

              <div className="svc-form-grid svc-form-grid-2">
                <label className="field span-2">
                  <span>Findings & Observations</span>
                  <textarea
                    rows={3}
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                    placeholder="Describe what you found during inspection"
                  />
                </label>
                <label className="field">
                  <span>
                    Work Required <em className="muted">optional</em>
                  </span>
                  <textarea
                    rows={3}
                    value={workRequired}
                    onChange={(e) => setWorkRequired(e.target.value)}
                    placeholder="What work is required?"
                  />
                </label>
                <label className="field">
                  <span>Work Details</span>
                  <textarea
                    rows={3}
                    value={workDetails}
                    onChange={(e) => setWorkDetails(e.target.value)}
                    placeholder="Detailed work notes from the visit"
                  />
                </label>
                <label className="field">
                  <span>Requested parts & services</span>
                  <textarea
                    rows={3}
                    value={requestedParts}
                    onChange={(e) => setRequestedParts(e.target.value)}
                    placeholder="Parts / services needed for estimate"
                  />
                </label>
                <label className="field">
                  <span>Recommendations</span>
                  <textarea
                    rows={3}
                    value={recommendationNotes}
                    onChange={(e) => setRecommendationNotes(e.target.value)}
                    placeholder="Recommendations for the client"
                  />
                </label>
              </div>

              <div className="svc-inspect-split">
                <div className="svc-inspect-col">
                  <div className="svc-subhead">
                    <strong>Inspection photos</strong>
                    {photos.length ? (
                      <span className="insp-photo-status">
                        {photos.length} ready
                      </span>
                    ) : null}
                  </div>
                  <InspectionPhotoGrid photos={photos} onChange={setPhotos} onError={setError} label="" />
                </div>
                <div className="svc-inspect-col">
                  <div className="svc-subhead">
                    <strong>Inspector signature</strong>
                    <span className="muted">Client signs on print</span>
                  </div>
                  <SignaturePadField
                    title="Inspector Signature"
                    subtitle="Draw or upload"
                    value={inspectorSignature}
                    onChange={setInspectorSignature}
                    onError={setError}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "report" ? (
          <div className="panel">
            <div className="panel-head">
              <h2>Inspection report</h2>
              <div className="svc-form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => openInspectionReport(reportPayload, company, { party, equipment })}
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => downloadInspectionPdf(reportPayload, company, { party, equipment })}
                >
                  <Download size={13} /> Download PDF
                </button>
              </div>
            </div>
            <div className="panel-pad">
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                Client and equipment sit side by side. Each photo caption is next to its image.
              </p>
              <div className="insp-report-frame">
                <InspectionReportPreview
                  call={reportPayload}
                  company={company}
                  party={party}
                  equipment={equipment}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

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

function noteText(value?: string | null) {
  const text = (value || "").trim();
  return text || "";
}

function InspectionReportPreview({
  call,
  company,
  party,
  equipment,
}: {
  call: ServiceCall;
  company: Company | null;
  party: Party | null | undefined;
  equipment: Equipment | null | undefined;
}) {
  const dateLabel = reportDate(call.inspectionDate || call.createdAt);
  const site = (party?.deliveryAddress || party?.address || "").trim();
  const photos = call.inspectionPhotos ?? [];
  const brandLines = [company?.address, company?.state, company?.phone, company?.email]
    .filter(Boolean)
    .join(" · ");
  const priority = (call.priority || "").trim();
  const context = [
    call.type,
    priority ? `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority` : "",
    statusLabel(call.status),
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean);
  const notes = (
    [
      ["Problem", noteText(call.description)],
      ["Findings", noteText(call.findings)],
      ["Work required", noteText(call.workRequired)],
      ["Work details", noteText(call.workDetails)],
      ["Requested parts", noteText(call.requestedParts)],
      ["Recommendation", noteText(call.recommendation)],
      ["Recommendations", noteText(call.recommendationNotes)],
    ] as const
  ).filter((row): row is readonly [string, string] => Boolean(row[1]));

  return (
    <article className="insp-report-doc">
      <header className="insp-report-header">
        <div className="insp-report-brand-block">
          <strong className="insp-report-brand">{company?.name || "Company"}</strong>
          {brandLines ? <p>{brandLines}</p> : null}
        </div>
        <div className="insp-report-meta">
          <p className="insp-report-kicker">Inspection Report</p>
          <strong className="insp-report-no">{call.callNo}</strong>
          <p className="insp-report-sub">{[dateLabel, ...context].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="insp-report-facts">
        <section>
          <h2>Client</h2>
          <dl className="insp-report-dl">
            <div className="full">
              <dt>Name</dt>
              <dd>{call.customerName || "—"}</dd>
            </div>
            {party?.phone ? (
              <div>
                <dt>Phone</dt>
                <dd>{party.phone}</dd>
              </div>
            ) : null}
            {party?.email ? (
              <div>
                <dt>Email</dt>
                <dd>{party.email}</dd>
              </div>
            ) : null}
            {site ? (
              <div className="full">
                <dt>Site</dt>
                <dd>{site}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section>
          <h2>Equipment</h2>
          <dl className="insp-report-dl">
            <div className="full">
              <dt>Description</dt>
              <dd>{equipment?.name || call.equipmentName || "—"}</dd>
            </div>
            {equipment?.manufacturer ? (
              <div>
                <dt>Manufacturer</dt>
                <dd>{equipment.manufacturer}</dd>
              </div>
            ) : null}
            {equipment?.model ? (
              <div>
                <dt>Model</dt>
                <dd>{equipment.model}</dd>
              </div>
            ) : null}
            {equipment?.serialNumber ? (
              <div>
                <dt>Serial</dt>
                <dd>{equipment.serialNumber}</dd>
              </div>
            ) : null}
            {equipment?.assetTag ? (
              <div>
                <dt>Asset</dt>
                <dd>{equipment.assetTag}</dd>
              </div>
            ) : null}
            {equipment?.location ? (
              <div className="full">
                <dt>Location</dt>
                <dd>{equipment.location}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      {notes.length ? (
        <section className="insp-report-notes" aria-label="Inspection notes">
          {notes.map(([label, value]) => (
            <div key={label} className="insp-report-note">
              <h2>{label}</h2>
              <p>{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="insp-report-photo-section">
        <h2>Photos</h2>
        {photos.length ? (
          <div className="insp-report-photos">
            {photos.map((p, i) => (
              <figure key={`${p.url.slice(0, 24)}_${i}`}>
                <img src={p.url} alt="" />
                <figcaption>
                  <em>Photo {String(i + 1).padStart(2, "0")}</em>
                  <span>{p.caption || p.name || "No description"}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="insp-report-empty">No photos attached.</p>
        )}
      </section>

      <footer className="insp-report-signs">
        <div>
          <div className="insp-sign-slot">
            {call.inspectorSignature ? (
              <img src={call.inspectorSignature} alt="Inspector signature" className="insp-sign-img" />
            ) : null}
          </div>
          <strong>Inspector signature</strong>
          <span>{call.inspectorName || call.assignedName || "Inspector"}</span>
        </div>
        <div>
          <div className="insp-sign-slot" />
          <strong>Client signature</strong>
          <span>{call.customerName || "Client"}</span>
        </div>
      </footer>
    </article>
  );
}
