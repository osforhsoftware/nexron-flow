import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, LayoutGrid, List, Plus, Printer } from "lucide-react";
import { api, type ApiUser } from "../lib/api";
import type {
  Item,
  ServiceCall,
  ServiceCallPriority,
  ServiceCallStatus,
  ServiceCallType,
  ServiceLineItem,
  ServicePhoto,
  ServiceVisit,
  ServiceVisitStatus,
} from "../db/types";
import { useApp } from "../lib/AppContext";
import { useAsync } from "../lib/useAsync";
import { Modal } from "../components/Modal";
import { StaffAssignFields, roleIdForUser } from "../components/StaffAssignFields";
import { TablePagination, usePagedRows } from "../components/TablePagination";
import { PageHeader } from "../components/UI";
import { nextAssetTag } from "../lib/assetTag";
import { fileToItemImageDataUrl } from "../lib/itemImage";
import {
  downloadEstimatePdf,
  downloadServiceInvoicePdf,
  downloadServiceJobPdf,
  openInspectionReport,
} from "../lib/serviceCallReports";

const EQUIP_STATUS_OPTIONS = [
  { value: "in_service", label: "In service" },
  { value: "in_repair", label: "In repair" },
  { value: "in_storage", label: "In storage" },
  { value: "decommissioned", label: "Decommissioned" },
  { value: "disposed", label: "Disposed" },
] as const;

const emptyAddEquipForm = {
  name: "",
  serialNumber: "",
  model: "",
  manufacturer: "",
  category: "",
  location: "",
  installDate: "",
  warrantyStart: "",
  warrantyEnd: "",
  noMachineWarranty: true,
  serviceWarrantyStart: "",
  serviceWarrantyEnd: "",
  noServiceWarranty: true,
  condition: "",
  currentStatus: "in_service",
  additionalNote: "",
};

const STATUS_OPTIONS: { value: ServiceCallStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "inspection", label: "Inspection" },
  { value: "estimate", label: "Estimate" },
  { value: "in_progress", label: "In Progress" },
  { value: "qa", label: "QA" },
  { value: "billing", label: "Billing" },
  { value: "closed", label: "Closed" },
];

const TYPE_OPTIONS: ServiceCallType[] = ["Repair", "Maintenance", "Installation", "Inspection", "Other"];
const PRIORITY_OPTIONS: { value: ServiceCallPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];
const SEVERITY_OPTIONS = ["Low", "Medium", "High", "Critical"] as const;
const RECOMMENDATION_OPTIONS = ["Repair", "Part Replacement", "Service/Calibration", "Unrepairable"] as const;
const VISIT_STATUS_OPTIONS: { value: ServiceVisitStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

type DetailTab = "overview" | "inspection" | "estimate" | "job" | "qa" | "billing";
type ListView = "table" | "kanban";

function normalizeStatus(value?: string | null): ServiceCallStatus {
  if (value === "assigned") return "inspection";
  if (value === "done") return "billing";
  return (value as ServiceCallStatus) || "open";
}

function statusLabel(value?: string | null) {
  const n = normalizeStatus(value);
  return STATUS_OPTIONS.find((o) => o.value === n)?.label ?? "Open";
}

function visitStatusLabel(value?: string | null) {
  return VISIT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Planned";
}

function dateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function datetimeLocal(value?: string | null) {
  if (!value) return "";
  const d = value.replace("Z", "").slice(0, 16);
  return d.length >= 16 ? d : value.slice(0, 10) + "T09:00";
}

function lineAmount(line: ServiceLineItem) {
  const qty = Number(line.qty) || 0;
  const unit = Number(line.unitPrice) || 0;
  const tax = Number(line.taxPercent) || 0;
  return qty * unit * (1 + tax / 100);
}

function emptyLine(): ServiceLineItem {
  return { id: `tmp_${Math.random().toString(36).slice(2, 8)}`, description: "", qty: 1, unitPrice: 0, taxPercent: 0 };
}

const emptyForm = {
  customerId: "",
  equipmentIds: [] as string[],
  type: "Repair" as ServiceCallType,
  priority: "normal" as ServiceCallPriority,
  description: "",
  assignedUserId: "",
  assignedName: "",
  assignedRoleId: "",
  inspectorId: "",
  inspectorName: "",
  inspectorRoleId: "",
  engineerUserId: "",
  engineerName: "",
  engineerRoleId: "",
  scheduledFor: "",
  notes: "",
  status: "open" as ServiceCallStatus,
  inspectionDate: "",
  findings: "",
  severity: "Medium",
  recommendation: "Repair",
  recommendationNotes: "",
  inspectionPhotos: [] as ServicePhoto[],
  estimateLines: [] as ServiceLineItem[],
  estimateDiscount: 0,
  estimateNotes: "",
  partsUsed: [] as ServiceLineItem[],
  servicePhotos: [] as ServicePhoto[],
  customerHandoff: false,
  customerReceiverName: "",
  customerSignature: "",
  qaRemarks: "",
};

const emptyVisitForm = {
  visitDate: new Date().toISOString().slice(0, 10),
  assignedUserId: "",
  assignedName: "",
  assignedRoleId: "",
  status: "planned" as ServiceVisitStatus,
  workDone: "",
  notes: "",
};

export function ServiceCallsPage() {
  const { company, session } = useApp();
  const companyId = company?.id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [listView, setListView] = useState<ListView>("table");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceCall | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<ServiceVisit | null>(null);
  const [visitForm, setVisitForm] = useState(emptyVisitForm);
  const [visitError, setVisitError] = useState("");
  const [visitSaving, setVisitSaving] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [addEquipOpen, setAddEquipOpen] = useState(false);
  const [addEquipSaving, setAddEquipSaving] = useState(false);
  const [addEquipError, setAddEquipError] = useState("");
  const [addEquipForm, setAddEquipForm] = useState(emptyAddEquipForm);
  const [pendingStatus, setPendingStatus] = useState<ServiceCallStatus | null>(null);
  const openedFromSearch = useRef<string | null>(null);
  const itemsRef = useRef<Item[]>([]);

  const { data: rows, error: loadError, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { serviceCalls } = await api.serviceCalls.list(companyId);
    return serviceCalls;
  }, [companyId]);

  const { data: parties } = useAsync(async () => {
    if (!companyId) return [];
    const { parties: list } = await api.parties.list(companyId);
    return list;
  }, [companyId]);

  const { data: equipment, reload: reloadEquipment } = useAsync(async () => {
    if (!companyId) return [];
    const { equipment: list } = await api.equipment.list(companyId);
    return list;
  }, [companyId]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    const { items: list } = await api.items.list(companyId);
    itemsRef.current = list;
    return list;
  }, [companyId]);

  const { data: assignOptions } = useAsync(async () => {
    try {
      return await api.staffAssignOptions();
    } catch {
      return { users: [] as ApiUser[], roles: [] };
    }
  }, []);
  const users = assignOptions?.users;
  const roles = assignOptions?.roles;

  const {
    data: notifications,
    reload: reloadNotifs,
  } = useAsync(async () => {
    if (!companyId) return [];
    try {
      const { notifications: list } = await api.notifications.list(companyId);
      return list;
    } catch {
      return [];
    }
  }, [companyId]);

  const {
    data: visits,
    error: visitsError,
    reload: reloadVisits,
  } = useAsync(async () => {
    if (!companyId || !editing?.id) return [];
    const { visits: list } = await api.serviceVisits.list(companyId, editing.id);
    return list;
  }, [companyId, editing?.id, open]);

  const equipmentForCustomer = useMemo(() => {
    const list = equipment ?? [];
    if (!form.customerId) return list;
    return list.filter((e) => !e.customerId || e.customerId === form.customerId);
  }, [equipment, form.customerId]);

  const nextEquipTag = useMemo(
    () => nextAssetTag(company?.assetTagStart, (equipment ?? []).map((e) => e.assetTag)),
    [company?.assetTagStart, equipment],
  );

  function openRegisterEquipment() {
    if (!form.customerId) return;
    setAddEquipForm(emptyAddEquipForm);
    setAddEquipError("");
    setAddEquipOpen(true);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const status = normalizeStatus(row.status);
      if (statusFilter && status !== statusFilter) return false;
      if (priorityFilter && row.priority !== priorityFilter) return false;
      if (typeFilter && row.type !== typeFilter) return false;
      if (assigneeFilter) {
        const names = [row.assignedName, row.inspectorName, row.engineerName].filter(Boolean).join(" ").toLowerCase();
        const ids = [row.assignedUserId, row.inspectorId, row.engineerUserId].filter(Boolean);
        if (!ids.includes(assigneeFilter) && !names.includes(
          (users ?? []).find((u) => u.id === assigneeFilter)?.name.toLowerCase() || "",
        )) {
          return false;
        }
      }
      if (dateFrom) {
        const created = (row.createdAt || "").slice(0, 10);
        if (created && created < dateFrom) return false;
      }
      if (dateTo) {
        const created = (row.createdAt || "").slice(0, 10);
        if (created && created > dateTo) return false;
      }
      if (!term) return true;
      return (
        row.callNo.toLowerCase().includes(term) ||
        row.customerName.toLowerCase().includes(term) ||
        row.description.toLowerCase().includes(term) ||
        (row.equipmentName ?? "").toLowerCase().includes(term) ||
        (row.assignedName ?? "").toLowerCase().includes(term) ||
        (row.inspectorName ?? "").toLowerCase().includes(term) ||
        (row.engineerName ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, statusFilter, assigneeFilter, priorityFilter, typeFilter, dateFrom, dateTo, users]);

  const listPage = usePagedRows(filtered, `${q}|${statusFilter}|${assigneeFilter}|${priorityFilter}|${typeFilter}|${dateFrom}|${dateTo}`);
  const unreadCount = (notifications ?? []).filter((n) => !n.readAt).length;

  const estimateTotals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const line of form.estimateLines) {
      const qty = Number(line.qty) || 0;
      const unit = Number(line.unitPrice) || 0;
      const tax = Number(line.taxPercent) || 0;
      subtotal += qty * unit;
      taxAmount += qty * unit * (tax / 100);
    }
    const discount = Number(form.estimateDiscount) || 0;
    return { subtotal, taxAmount, discount, grand: Math.max(0, subtotal - discount) + taxAmount };
  }, [form.estimateLines, form.estimateDiscount]);

  function openCreate() {
    navigate("/service/calls/new");
  }

  async function createEquipmentInline(e?: FormEvent) {
    e?.preventDefault();
    if (!companyId || !form.customerId) return;
    const name = addEquipForm.name.trim();
    const serialNumber = addEquipForm.serialNumber.trim();
    if (!name || !serialNumber) {
      setAddEquipError("Name and serial number are required.");
      return;
    }
    const customerName = (parties ?? []).find((p) => p.id === form.customerId)?.name;
    setAddEquipSaving(true);
    setAddEquipError("");
    try {
      const { equipment: created } = await api.equipment.create({
        companyId,
        name,
        serialNumber,
        model: addEquipForm.model.trim() || null,
        manufacturer: addEquipForm.manufacturer.trim() || null,
        category: addEquipForm.category.trim() || null,
        location: addEquipForm.location.trim() || null,
        installDate: addEquipForm.installDate || null,
        noMachineWarranty: addEquipForm.noMachineWarranty,
        warrantyStart: addEquipForm.noMachineWarranty ? null : addEquipForm.warrantyStart || null,
        warrantyEnd: addEquipForm.noMachineWarranty ? null : addEquipForm.warrantyEnd || null,
        noServiceWarranty: addEquipForm.noServiceWarranty,
        serviceWarrantyStart: addEquipForm.noServiceWarranty ? null : addEquipForm.serviceWarrantyStart || null,
        serviceWarrantyEnd: addEquipForm.noServiceWarranty ? null : addEquipForm.serviceWarrantyEnd || null,
        condition: addEquipForm.condition.trim() || null,
        currentStatus: addEquipForm.currentStatus || "in_service",
        additionalNote: addEquipForm.additionalNote.trim() || null,
        customerId: form.customerId,
        customerName: customerName || null,
      });
      await reloadEquipment();
      setForm((prev) => ({
        ...prev,
        equipmentIds: prev.equipmentIds.includes(created.id)
          ? prev.equipmentIds
          : [...prev.equipmentIds, created.id],
      }));
      setAddEquipForm(emptyAddEquipForm);
      setAddEquipOpen(false);
    } catch (err) {
      setAddEquipError(err instanceof Error ? err.message : "Could not add equipment.");
    } finally {
      setAddEquipSaving(false);
    }
  }

  function hydrateForm(item: ServiceCall) {
    const equipmentIds =
      item.equipmentIds?.length ? item.equipmentIds : item.equipmentId ? [item.equipmentId] : [];
    setForm({
      customerId: item.customerId,
      equipmentIds,
      type: (item.type as ServiceCallType) || "Repair",
      priority: (item.priority as ServiceCallPriority) || "normal",
      description: item.description,
      assignedUserId: item.assignedUserId ?? "",
      assignedName: item.assignedName ?? "",
      assignedRoleId: roleIdForUser((users ?? []).find((u) => u.id === item.assignedUserId), roles ?? []),
      inspectorId: item.inspectorId ?? item.assignedUserId ?? "",
      inspectorName: item.inspectorName ?? item.assignedName ?? "",
      inspectorRoleId: roleIdForUser(
        (users ?? []).find((u) => u.id === (item.inspectorId ?? item.assignedUserId)),
        roles ?? [],
      ),
      engineerUserId: item.engineerUserId ?? "",
      engineerName: item.engineerName ?? "",
      engineerRoleId: roleIdForUser((users ?? []).find((u) => u.id === item.engineerUserId), roles ?? []),
      scheduledFor: dateInput(item.scheduledFor),
      notes: item.notes ?? "",
      status: normalizeStatus(item.status),
      inspectionDate: datetimeLocal(item.inspectionDate),
      findings: item.findings ?? "",
      severity: item.severity || "Medium",
      recommendation: item.recommendation || "Repair",
      recommendationNotes: item.recommendationNotes ?? "",
      inspectionPhotos: item.inspectionPhotos ?? [],
      estimateLines: (item.estimateLines ?? []).map((l) => ({ ...l, id: l.id || `ln_${Math.random().toString(36).slice(2, 7)}` })),
      estimateDiscount: item.estimateDiscount ?? 0,
      estimateNotes: item.estimateNotes ?? "",
      partsUsed: (item.partsUsed ?? []).map((l) => ({ ...l, id: l.id || `pt_${Math.random().toString(36).slice(2, 7)}` })),
      servicePhotos: item.servicePhotos ?? [],
      customerHandoff: !!item.customerHandoff,
      customerReceiverName: item.customerReceiverName ?? "",
      customerSignature: item.customerSignature ?? "",
      qaRemarks: item.qaRemarks ?? "",
    });
  }

  function openEdit(item: ServiceCall) {
    navigate(`/service/calls/${item.id}`);
  }

  function applyCallUpdate(serviceCall: ServiceCall) {
    setEditing(serviceCall);
    hydrateForm(serviceCall);
  }

  function openVisitCreate() {
    if (!editing) return;
    setEditingVisit(null);
    setVisitForm({
      ...emptyVisitForm,
      visitDate: new Date().toISOString().slice(0, 10),
      assignedUserId: form.engineerUserId || editing.engineerUserId || editing.assignedUserId || "",
      assignedName: form.engineerName || editing.engineerName || editing.assignedName || "",
      assignedRoleId:
        roleIdForUser(
          (users ?? []).find((u) => u.id === (form.engineerUserId || editing.engineerUserId || editing.assignedUserId)),
          roles ?? [],
        ) || form.engineerRoleId,
    });
    setVisitError("");
    setVisitOpen(true);
  }

  function openVisitEdit(visit: ServiceVisit) {
    setEditingVisit(visit);
    setVisitForm({
      visitDate: dateInput(visit.visitDate) || emptyVisitForm.visitDate,
      assignedUserId: visit.assignedUserId ?? "",
      assignedName: visit.assignedName ?? "",
      assignedRoleId: roleIdForUser((users ?? []).find((u) => u.id === visit.assignedUserId), roles ?? []),
      status: (visit.status as ServiceVisitStatus) || "planned",
      workDone: visit.workDone ?? "",
      notes: visit.notes ?? "",
    });
    setVisitError("");
    setVisitOpen(true);
  }

  async function persistVisit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !editing) return;
    if (!visitForm.visitDate) {
      setVisitError("Visit date is required.");
      return;
    }
    if (visitForm.status === "completed" && !visitForm.workDone.trim()) {
      setVisitError("Add work done notes before completing the visit.");
      return;
    }

    let assignedUserId = visitForm.assignedUserId || undefined;
    let assignedName = visitForm.assignedName.trim() || undefined;
    if (assignedUserId && !assignedName) {
      assignedName = (users ?? []).find((u) => u.id === assignedUserId)?.name;
    }

    const payload = {
      companyId,
      serviceCallId: editing.id,
      visitDate: visitForm.visitDate,
      assignedUserId: assignedUserId || null,
      assignedName: assignedName || null,
      status: visitForm.status,
      workDone: visitForm.workDone.trim() || null,
      notes: visitForm.notes.trim() || null,
    };

    setVisitSaving(true);
    setVisitError("");
    try {
      const res = editingVisit
        ? await api.serviceVisits.update(editingVisit.id, payload)
        : await api.serviceVisits.create(payload);
      applyCallUpdate(res.serviceCall);
      await Promise.all([reload(), reloadVisits()]);
      setVisitOpen(false);
      setEditingVisit(null);
    } catch (err) {
      setVisitError(err instanceof Error ? err.message : "Could not save visit.");
    } finally {
      setVisitSaving(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      navigate("/service/calls/new", { replace: true });
      return;
    }
    const id = searchParams.get("id");
    if (!id) return;
    if (openedFromSearch.current === id) return;
    openedFromSearch.current = id;
    navigate(`/service/calls/${id}`, { replace: true });
  }, [searchParams, navigate]);

  function staffPayload() {
    let assignedUserId = form.assignedUserId || form.inspectorId || undefined;
    let assignedName = form.assignedName.trim() || form.inspectorName.trim() || undefined;
    if (assignedUserId && !assignedName) {
      assignedName = (users ?? []).find((u) => u.id === assignedUserId)?.name;
    }
    let inspectorId = form.inspectorId || assignedUserId || undefined;
    let inspectorName = form.inspectorName.trim() || assignedName || undefined;
    if (inspectorId && !inspectorName) {
      inspectorName = (users ?? []).find((u) => u.id === inspectorId)?.name;
    }
    let engineerUserId = form.engineerUserId || undefined;
    let engineerName = form.engineerName.trim() || undefined;
    if (engineerUserId && !engineerName) {
      engineerName = (users ?? []).find((u) => u.id === engineerUserId)?.name;
    }
    return { assignedUserId, assignedName, inspectorId, inspectorName, engineerUserId, engineerName };
  }

  function buildPayload(statusOverride?: ServiceCallStatus) {
    const description = form.description.trim();
    const staff = staffPayload();
    return {
      companyId: companyId!,
      customerId: form.customerId,
      equipmentId: form.equipmentIds[0] || null,
      equipmentIds: form.equipmentIds,
      type: form.type,
      priority: form.priority,
      description,
      assignedUserId: staff.assignedUserId || null,
      assignedName: staff.assignedName || null,
      inspectorId: staff.inspectorId || null,
      inspectorName: staff.inspectorName || null,
      engineerUserId: staff.engineerUserId || null,
      engineerName: staff.engineerName || null,
      scheduledFor: form.scheduledFor || null,
      notes: form.notes.trim() || null,
      status: statusOverride ?? form.status,
      inspectionDate: form.inspectionDate || null,
      findings: form.findings.trim() || null,
      severity: form.severity || null,
      recommendation: form.recommendation || null,
      recommendationNotes: form.recommendationNotes.trim() || null,
      inspectionPhotos: form.inspectionPhotos,
      estimateLines: form.estimateLines,
      estimateDiscount: Number(form.estimateDiscount) || 0,
      estimateNotes: form.estimateNotes.trim() || null,
      partsUsed: form.partsUsed,
      servicePhotos: form.servicePhotos,
      customerHandoff: form.customerHandoff,
      customerReceiverName: form.customerReceiverName.trim() || null,
      customerSignature: form.customerSignature || null,
      qaRemarks: form.qaRemarks.trim() || null,
    };
  }

  async function persist(statusOverride?: ServiceCallStatus, action?: Parameters<typeof api.serviceCalls.update>[1]["action"]) {
    if (!companyId) return;
    if (!form.customerId || !form.description.trim()) {
      setError("Customer and problem description are required.");
      setDetailTab("overview");
      return;
    }
    const payload = { ...buildPayload(statusOverride), ...(action ? { action } : {}) };

    setSaving(true);
    setError("");
    try {
      if (editing) {
        const { serviceCall } = await api.serviceCalls.update(editing.id, payload);
        applyCallUpdate(serviceCall);
        await reload();
      } else {
        const { serviceCall } = await api.serviceCalls.create(payload);
        setEditing(serviceCall);
        hydrateForm(serviceCall);
        await reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save service call.");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await persist();
  }

  function requestStatusChange(next: ServiceCallStatus) {
    if (!editing) {
      setForm((prev) => ({ ...prev, status: next }));
      return;
    }
    const current = normalizeStatus(editing.status);
    if (current === next) return;
    setPendingStatus(next);
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    const next = pendingStatus;
    setPendingStatus(null);
    await persist(next);
  }

  async function runAction(action: NonNullable<Parameters<typeof api.serviceCalls.update>[1]["action"]>) {
    if (!editing) return;
    await persist(undefined, action);
  }

  async function createInvoice() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await persist();
      const res = await api.serviceCalls.toInvoice(editing.id);
      applyCallUpdate(res.serviceCall);
      await reload();
      if (res.transactionId) {
        navigate("/sales");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice.");
    } finally {
      setSaving(false);
    }
  }

  function printInspection() {
    if (!editing) return;
    const party = (parties ?? []).find((p) => p.id === (form.customerId || editing.customerId)) ?? null;
    const equipId = form.equipmentIds[0] || editing.equipmentId || null;
    const selectedEquipment = (equipment ?? []).find((item) => item.id === equipId) ?? null;
    openInspectionReport(
      {
        ...editing,
        customerName: party?.name || editing.customerName,
        equipmentId: equipId,
        equipmentName: selectedEquipment?.name || editing.equipmentName,
        type: form.type,
        priority: form.priority,
        description: form.description.trim() || editing.description,
        status: form.status,
        notes: form.notes,
        inspectorName: form.inspectorName || editing.inspectorName,
        assignedName: form.assignedName || editing.assignedName,
        inspectionDate: form.inspectionDate || editing.inspectionDate,
        findings: form.findings,
        severity: form.severity,
        recommendation: form.recommendation,
        recommendationNotes: form.recommendationNotes,
        inspectionPhotos: form.inspectionPhotos,
      },
      company,
      { party, equipment: selectedEquipment },
    );
    setPdfOpen(false);
  }

  async function addPhotos(kind: "inspection" | "before" | "after" | "doc", files: FileList | null) {
    if (!files?.length) return;
    const next: ServicePhoto[] = [];
    for (const file of Array.from(files)) {
      try {
        if (file.type.startsWith("image/")) {
          const url = await fileToItemImageDataUrl(file);
          next.push({ url, name: file.name, kind, caption: "" });
        } else {
          // Store non-image as data URL lightly skipped — only images for now
          setError("Only image uploads are supported for photos.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not process image.");
      }
    }
    if (!next.length) return;
    if (kind === "inspection") {
      setForm((prev) => ({ ...prev, inspectionPhotos: [...prev.inspectionPhotos, ...next] }));
    } else {
      setForm((prev) => ({ ...prev, servicePhotos: [...prev.servicePhotos, ...next] }));
    }
  }

  function pickCatalogItem(lineIndex: number, itemId: string, target: "estimate" | "parts") {
    const item = (items ?? itemsRef.current).find((i) => i.id === itemId);
    if (!item) return;
    setForm((prev) => {
      const key = target === "estimate" ? "estimateLines" : "partsUsed";
      const lines = [...prev[key]];
      const cur = { ...lines[lineIndex] };
      cur.itemId = item.id;
      cur.name = item.name;
      cur.description = item.name;
      cur.unitPrice = item.salePrice;
      cur.taxPercent = item.taxPercent;
      lines[lineIndex] = cur;
      return { ...prev, [key]: lines };
    });
  }

  async function markNotifsRead() {
    if (!companyId) return;
    await api.notifications.markRead({ companyId });
    await reloadNotifs();
    setNotifOpen(false);
  }

  const kanbanColumns = STATUS_OPTIONS.filter((s) => s.value !== "closed").concat(
    STATUS_OPTIONS.filter((s) => s.value === "closed"),
  );

  return (
    <>
      <PageHeader
        title="Service Calls"
        subtitle="Open → Inspection → Estimate → Job → QA → Billing — no approval maze"
        actions={
          <div className="service-header-actions">
            <div className="service-notif-wrap">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unreadCount > 0 ? <span className="service-notif-dot">{unreadCount}</span> : null}
              </button>
              {notifOpen ? (
                <div className="service-notif-panel">
                  <div className="service-notif-head">
                    <strong>Notifications</strong>
                    <button className="btn btn-ghost" type="button" onClick={() => void markNotifsRead()}>
                      Mark all read
                    </button>
                  </div>
                  {(notifications ?? []).length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>No notifications yet.</p>
                  ) : (
                    <ul className="service-notif-list">
                      {(notifications ?? []).slice(0, 20).map((n) => (
                        <li key={n.id} className={n.readAt ? "" : "unread"}>
                          <button
                            type="button"
                            onClick={() => {
                              if (n.link?.includes("id=")) {
                                const id = new URL(n.link, "http://local").searchParams.get("id");
                                const hit = (rows ?? []).find((r) => r.id === id);
                                if (hit) openEdit(hit);
                              }
                              setNotifOpen(false);
                            }}
                          >
                            <strong>{n.title}</strong>
                            {n.body ? <span>{n.body}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              <Plus size={16} /> New Service Call
            </button>
          </div>
        }
      />

      <div className="content">
        <div className="toolbar service-toolbar">
          <div className="toolbar-left">
            <input
              className="search"
              placeholder="Search call no, customer, problem, equipment…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="service-view-switch" role="group" aria-label="View">
              <button
                type="button"
                className={`filter-chip${listView === "table" ? " active" : ""}`}
                onClick={() => setListView("table")}
              >
                <List size={14} /> Table
              </button>
              <button
                type="button"
                className={`filter-chip${listView === "kanban" ? " active" : ""}`}
                onClick={() => setListView("kanban")}
              >
                <LayoutGrid size={14} /> Kanban
              </button>
            </div>
          </div>
          <div className="toolbar-right" role="tablist" aria-label="Status filter">
            <button
              type="button"
              className={`filter-chip${statusFilter === "" ? " active" : ""}`}
              onClick={() => setStatusFilter("")}
            >
              All
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`filter-chip${statusFilter === s.value ? " active" : ""}`}
                onClick={() => setStatusFilter(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="service-quick-filters">
          <label>
            <span>Assignee</span>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">Anyone</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">Any</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Any</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        {loadError ? (
          <p className="form-error" style={{ padding: "0 0 10px" }}>{loadError}</p>
        ) : null}

        {listView === "table" ? (
          <div className="panel">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Call</th>
                    <th>Customer</th>
                    <th>Problem</th>
                    <th>Assigned</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {listPage.pageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.callNo}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {row.type} · {PRIORITY_OPTIONS.find((p) => p.value === row.priority)?.label || row.priority}
                        </div>
                      </td>
                      <td>
                        {row.customerName}
                        {row.equipmentName ? (
                          <div className="muted" style={{ fontSize: 12 }}>{row.equipmentName}</div>
                        ) : null}
                      </td>
                      <td className="service-call-desc">{row.description}</td>
                      <td>
                        {row.engineerName || row.inspectorName || row.assignedName || "—"}
                      </td>
                      <td>
                        <span className={`badge badge-muted service-status-${normalizeStatus(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost" type="button" onClick={() => openEdit(row)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                  {listPage.pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">No service calls yet. Create one when a customer reports an issue.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <TablePagination pager={listPage} />
          </div>
        ) : (
          <div className="service-kanban">
            {kanbanColumns.map((col) => {
              const cards = filtered.filter((r) => normalizeStatus(r.status) === col.value);
              return (
                <div key={col.value} className="service-kanban-col">
                  <header>
                    <strong>{col.label}</strong>
                    <span>{cards.length}</span>
                  </header>
                  <div className="service-kanban-cards">
                    {cards.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="service-kanban-card"
                        onClick={() => openEdit(row)}
                      >
                        <strong>{row.callNo}</strong>
                        <span>{row.customerName}</span>
                        <em className="service-call-desc">{row.description}</em>
                        <small>{row.engineerName || row.inspectorName || row.assignedName || "Unassigned"}</small>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open ? (
        <Modal
          className="modal-service-call"
          title={editing ? `Service Call ${editing.callNo}` : "New Service Call"}
          onClose={() => !saving && setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => setOpen(false)}>
                {editing ? "Close" : "Cancel"}
              </button>
              <button className="btn btn-primary" type="submit" form="service-call-form" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create call"}
              </button>
            </>
          }
        >
          <form id="service-call-form" className="form-grid" onSubmit={(e) => void onSubmit(e)}>
            {editing ? (
              <div className="full service-detail-tools">
                <div className="quote-status-actions" style={{ marginTop: 0, marginBottom: 0 }}>
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      className={`btn btn-ghost${normalizeStatus(editing.status) === s.value ? " active-status" : ""}`}
                      type="button"
                      disabled={saving}
                      onClick={() => requestStatusChange(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                  {normalizeStatus(editing.status) === "closed" ? (
                    <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => requestStatusChange("open")}>
                      Reopen
                    </button>
                  ) : null}
                </div>
                <div className="service-pdf-wrap">
                  <button className="btn btn-ghost" type="button" onClick={() => setPdfOpen((v) => !v)}>
                    <Printer size={14} /> Print / PDF
                  </button>
                  {pdfOpen ? (
                    <div className="service-pdf-menu">
                      <button type="button" onClick={() => printInspection()}>
                        Inspection Report
                      </button>
                      <button type="button" onClick={() => { downloadEstimatePdf(editing, company); setPdfOpen(false); }}>
                        Estimate / Quotation
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          downloadServiceJobPdf(editing, visits ?? [], company);
                          setPdfOpen(false);
                        }}
                      >
                        Service Job Report
                      </button>
                      <button type="button" onClick={() => { downloadServiceInvoicePdf(editing, company); setPdfOpen(false); }}>
                        Service Invoice Summary
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {editing ? (
              <div className="full service-detail-tabs" role="tablist">
                {(
                  [
                    ["overview", "Overview"],
                    ["inspection", "Inspection"],
                    ["estimate", "Estimate"],
                    ["job", "Service Job"],
                    ["qa", "QA"],
                    ["billing", "Billing"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className={`filter-chip${detailTab === id ? " active" : ""}`}
                    onClick={() => setDetailTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {(detailTab === "overview" || !editing) && (
              <>
                <label className="field">
                  <span>Customer</span>
                  <select
                    required
                    value={form.customerId}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        customerId: e.target.value,
                        equipmentIds: [],
                      }));
                      setAddEquipOpen(false);
                      setAddEquipError("");
                      setAddEquipForm(emptyAddEquipForm);
                    }}
                  >
                    <option value="">Select customer</option>
                    {(parties ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>

                <div className="field">
                  <div className="service-equip-label-row">
                    <span>
                      Equipment
                      <em className="service-equip-count"> optional</em>
                      {form.equipmentIds.length > 0 ? (
                        <em className="service-equip-count"> · {form.equipmentIds.length} selected</em>
                      ) : null}
                    </span>
                    {form.customerId ? (
                      <button
                        type="button"
                        className="btn btn-ghost service-equip-add-btn"
                        disabled={addEquipSaving}
                        onClick={openRegisterEquipment}
                      >
                        <Plus size={14} /> Add equipment
                      </button>
                    ) : null}
                  </div>
                  {!form.customerId ? (
                    <div className="service-equip-empty">Select a customer to see their equipment.</div>
                  ) : equipmentForCustomer.length === 0 ? (
                    <div className="service-equip-empty">
                      No equipment for this customer yet. Use <strong>Add equipment</strong> to register one.
                    </div>
                  ) : (
                    <div className="service-equip-picker" role="group" aria-label="Customer equipment">
                      {equipmentForCustomer.map((eq) => {
                        const selected = form.equipmentIds.includes(eq.id);
                        return (
                          <button
                            key={eq.id}
                            type="button"
                            className={`service-equip-option${selected ? " selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                equipmentIds: selected
                                  ? prev.equipmentIds.filter((id) => id !== eq.id)
                                  : [...prev.equipmentIds, eq.id],
                              }))
                            }
                          >
                            <span className="service-equip-check" aria-hidden>{selected ? "✓" : ""}</span>
                            <span className="service-equip-meta">
                              <strong>{eq.name}</strong>
                              <span>
                                {[eq.model, eq.serialNumber ? `S/N ${eq.serialNumber}` : "", eq.assetTag]
                                  .filter(Boolean)
                                  .join(" · ") || "No model / serial"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <label className="field">
                  <span>Service type</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ServiceCallType }))}
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Priority</span>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as ServiceCallPriority }))}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>

                <label className="field full">
                  <span>Problem description</span>
                  <textarea
                    rows={3}
                    required
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="What is the customer reporting?"
                  />
                </label>

                <div className="full">
                  <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>Inspection technician / assignee</p>
                  <StaffAssignFields
                    users={users}
                    roles={roles}
                    roleId={form.inspectorRoleId || form.assignedRoleId}
                    userId={form.inspectorId || form.assignedUserId}
                    onChange={({ roleId, userId, name }) =>
                      setForm((prev) => ({
                        ...prev,
                        inspectorRoleId: roleId,
                        inspectorId: userId,
                        inspectorName: name,
                        assignedRoleId: roleId,
                        assignedUserId: userId,
                        assignedName: name,
                        status: prev.status === "open" && userId ? "inspection" : prev.status,
                      }))
                    }
                  />
                </div>

                <label className="field">
                  <span>Schedule date</span>
                  <input
                    type="date"
                    value={form.scheduledFor}
                    onChange={(e) => setForm((prev) => ({ ...prev, scheduledFor: e.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => {
                      const next = e.target.value as ServiceCallStatus;
                      if (editing) {
                        requestStatusChange(next);
                        return;
                      }
                      setForm((prev) => ({ ...prev, status: next }));
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>

                <label className="field full">
                  <span>Internal notes</span>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Internal notes (optional)"
                  />
                </label>
              </>
            )}

            {editing && detailTab === "inspection" ? (
              <>
                <div className="full">
                  <StaffAssignFields
                    users={users}
                    roles={roles}
                    roleId={form.inspectorRoleId}
                    userId={form.inspectorId}
                    onChange={({ roleId, userId, name }) =>
                      setForm((prev) => ({
                        ...prev,
                        inspectorRoleId: roleId,
                        inspectorId: userId,
                        inspectorName: name,
                      }))
                    }
                  />
                </div>
                <label className="field">
                  <span>Inspection date & time</span>
                  <input
                    type="datetime-local"
                    value={form.inspectionDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, inspectionDate: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Severity</span>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
                  >
                    {SEVERITY_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>Findings / root cause</span>
                  <textarea
                    rows={4}
                    value={form.findings}
                    onChange={(e) => setForm((prev) => ({ ...prev, findings: e.target.value }))}
                    placeholder="Detailed inspection findings"
                  />
                </label>
                <label className="field">
                  <span>Recommended action</span>
                  <select
                    value={form.recommendation}
                    onChange={(e) => setForm((prev) => ({ ...prev, recommendation: e.target.value }))}
                  >
                    {RECOMMENDATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Recommendation notes</span>
                  <input
                    value={form.recommendationNotes}
                    onChange={(e) => setForm((prev) => ({ ...prev, recommendationNotes: e.target.value }))}
                  />
                </label>
                <div className="field full">
                  <span>Inspection photos</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => void addPhotos("inspection", e.target.files)} />
                  <div className="service-photo-rows">
                    {form.inspectionPhotos.map((p, i) => (
                      <div key={`${p.url.slice(0, 24)}_${i}`} className="service-photo-row">
                        <img src={p.url} alt="" />
                        <div className="service-photo-row-copy">
                          <textarea
                            rows={2}
                            value={p.caption ?? ""}
                            placeholder="Description beside this photo"
                            aria-label={`Photo ${i + 1} description`}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                inspectionPhotos: prev.inspectionPhotos.map((photo, idx) =>
                                  idx === i ? { ...photo, caption: e.target.value } : photo,
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                inspectionPhotos: prev.inspectionPhotos.filter((_, idx) => idx !== i),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="full quote-status-actions">
                  <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void runAction("complete_inspection")}>
                    Complete Inspection → Estimate
                  </button>
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void runAction("skip_estimate")}>
                    Skip Estimate → In Progress
                  </button>
                </div>
              </>
            ) : null}

            {editing && detailTab === "estimate" ? (
              <>
                {form.findings ? (
                  <p className="full muted" style={{ margin: 0, fontSize: 13 }}>
                    From inspection: {form.findings.slice(0, 180)}{form.findings.length > 180 ? "…" : ""}
                  </p>
                ) : null}
                <div className="full service-lines">
                  <div className="service-visits-head">
                    <strong>Line items</strong>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, estimateLines: [...prev.estimateLines, emptyLine()] }))}
                    >
                      <Plus size={14} /> Add line
                    </button>
                  </div>
                  {form.estimateLines.map((line, idx) => (
                    <div key={line.id || idx} className="service-line-row">
                      <select
                        value={line.itemId || ""}
                        onChange={(e) => pickCatalogItem(idx, e.target.value, "estimate")}
                      >
                        <option value="">Catalog / custom</option>
                        {(items ?? []).map((it) => (
                          <option key={it.id} value={it.id}>{it.name}</option>
                        ))}
                      </select>
                      <input
                        placeholder="Description"
                        value={line.description || line.name || ""}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.estimateLines];
                            lines[idx] = { ...lines[idx], description: e.target.value, name: e.target.value };
                            return { ...prev, estimateLines: lines };
                          })
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Qty"
                        value={line.qty}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.estimateLines];
                            lines[idx] = { ...lines[idx], qty: Number(e.target.value) };
                            return { ...prev, estimateLines: lines };
                          })
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Unit"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.estimateLines];
                            lines[idx] = { ...lines[idx], unitPrice: Number(e.target.value) };
                            return { ...prev, estimateLines: lines };
                          })
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Tax %"
                        value={line.taxPercent}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.estimateLines];
                            lines[idx] = { ...lines[idx], taxPercent: Number(e.target.value) };
                            return { ...prev, estimateLines: lines };
                          })
                        }
                      />
                      <strong>{lineAmount(line).toFixed(2)}</strong>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            estimateLines: prev.estimateLines.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <label className="field">
                  <span>Discount</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.estimateDiscount}
                    onChange={(e) => setForm((prev) => ({ ...prev, estimateDiscount: Number(e.target.value) }))}
                  />
                </label>
                <div className="field service-totals">
                  <span>Subtotal {estimateTotals.subtotal.toFixed(2)}</span>
                  <span>Tax {estimateTotals.taxAmount.toFixed(2)}</span>
                  <strong>Grand {estimateTotals.grand.toFixed(2)}</strong>
                </div>
                <label className="field full">
                  <span>Estimate notes</span>
                  <textarea
                    rows={2}
                    value={form.estimateNotes}
                    onChange={(e) => setForm((prev) => ({ ...prev, estimateNotes: e.target.value }))}
                  />
                </label>
                <div className="full">
                  <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>Assign service engineer (prompted on finalize)</p>
                  <StaffAssignFields
                    users={users}
                    roles={roles}
                    roleId={form.engineerRoleId}
                    userId={form.engineerUserId}
                    onChange={({ roleId, userId, name }) =>
                      setForm((prev) => ({
                        ...prev,
                        engineerRoleId: roleId,
                        engineerUserId: userId,
                        engineerName: name,
                      }))
                    }
                  />
                </div>
                <div className="full quote-status-actions">
                  <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void runAction("finalize_estimate")}>
                    Save & Finalize Estimate → In Progress
                  </button>
                </div>
              </>
            ) : null}

            {editing && detailTab === "job" ? (
              <>
                <div className="full">
                  <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>Assigned service engineer</p>
                  <StaffAssignFields
                    users={users}
                    roles={roles}
                    roleId={form.engineerRoleId}
                    userId={form.engineerUserId}
                    onChange={({ roleId, userId, name }) =>
                      setForm((prev) => ({
                        ...prev,
                        engineerRoleId: roleId,
                        engineerUserId: userId,
                        engineerName: name,
                      }))
                    }
                  />
                </div>

                <div className="full service-visits-block">
                  <div className="service-visits-head">
                    <div>
                      <strong>Visits / field work</strong>
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>Service report log — no approvals</p>
                    </div>
                    <button className="btn btn-ghost" type="button" disabled={saving || visitSaving} onClick={openVisitCreate}>
                      <Plus size={14} /> Add Visit
                    </button>
                  </div>
                  {visitsError ? <p className="form-error" style={{ padding: 0 }}>{visitsError}</p> : null}
                  {(visits ?? []).length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>No visits yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Visit</th>
                            <th>Date</th>
                            <th>Assigned</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {(visits ?? []).map((visit) => (
                            <tr key={visit.id}>
                              <td>
                                <strong>{visit.visitNo}</strong>
                                {visit.workDone ? (
                                  <div className="muted service-call-desc" style={{ fontSize: 12 }}>{visit.workDone}</div>
                                ) : null}
                              </td>
                              <td>{dateInput(visit.visitDate) || "—"}</td>
                              <td>{visit.assignedName || "—"}</td>
                              <td>
                                <span className={`badge badge-muted visit-status-${visit.status}`}>
                                  {visitStatusLabel(visit.status)}
                                </span>
                              </td>
                              <td>
                                <button className="btn btn-ghost" type="button" disabled={visitSaving} onClick={() => openVisitEdit(visit)}>
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="full service-lines">
                  <div className="service-visits-head">
                    <strong>Parts / materials used</strong>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, partsUsed: [...prev.partsUsed, emptyLine()] }))}
                    >
                      <Plus size={14} /> Add part
                    </button>
                  </div>
                  {form.partsUsed.map((line, idx) => (
                    <div key={line.id || idx} className="service-line-row">
                      <select value={line.itemId || ""} onChange={(e) => pickCatalogItem(idx, e.target.value, "parts")}>
                        <option value="">Catalog / custom</option>
                        {(items ?? []).map((it) => (
                          <option key={it.id} value={it.id}>{it.name} (stock {it.stockQty})</option>
                        ))}
                      </select>
                      <input
                        placeholder="Name"
                        value={line.name || line.description || ""}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.partsUsed];
                            lines[idx] = { ...lines[idx], name: e.target.value, description: e.target.value };
                            return { ...prev, partsUsed: lines };
                          })
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.qty}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.partsUsed];
                            lines[idx] = { ...lines[idx], qty: Number(e.target.value) };
                            return { ...prev, partsUsed: lines };
                          })
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setForm((prev) => {
                            const lines = [...prev.partsUsed];
                            lines[idx] = { ...lines[idx], unitPrice: Number(e.target.value) };
                            return { ...prev, partsUsed: lines };
                          })
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            partsUsed: prev.partsUsed.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={saving}
                    onClick={() => void runAction("deduct_parts_stock")}
                  >
                    Deduct listed parts from stock
                  </button>
                </div>

                <div className="field full">
                  <span>Before / after photos</span>
                  <div className="service-photo-actions">
                    <label className="btn btn-ghost">
                      Before
                      <input hidden type="file" accept="image/*" multiple onChange={(e) => void addPhotos("before", e.target.files)} />
                    </label>
                    <label className="btn btn-ghost">
                      After
                      <input hidden type="file" accept="image/*" multiple onChange={(e) => void addPhotos("after", e.target.files)} />
                    </label>
                  </div>
                  <div className="service-photo-grid">
                    {form.servicePhotos.map((p, i) => (
                      <div key={`${p.url.slice(0, 24)}_${i}`} className="service-photo-thumb">
                        <img src={p.url} alt={p.name || p.kind || "photo"} />
                        <small>{p.kind}</small>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              servicePhotos: prev.servicePhotos.filter((_, idx) => idx !== i),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="field full service-visit-done-check">
                  <input
                    type="checkbox"
                    checked={form.customerHandoff}
                    onChange={(e) => setForm((prev) => ({ ...prev, customerHandoff: e.target.checked }))}
                  />
                  <span>Customer handoff confirmed</span>
                </label>
                <label className="field">
                  <span>Receiver name</span>
                  <input
                    value={form.customerReceiverName}
                    onChange={(e) => setForm((prev) => ({ ...prev, customerReceiverName: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Signature (type name as sign-off)</span>
                  <input
                    value={form.customerSignature}
                    onChange={(e) => setForm((prev) => ({ ...prev, customerSignature: e.target.value }))}
                    placeholder="Customer signature / typed name"
                  />
                </label>

                <div className="full quote-status-actions">
                  <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void runAction("submit_for_qa")}>
                    Submit Service Report for QA
                  </button>
                </div>
              </>
            ) : null}

            {editing && detailTab === "qa" ? (
              <>
                <p className="full muted" style={{ margin: 0, fontSize: 13 }}>
                  Fast pass/fail — Fail returns to In Progress; Pass moves to Billing. Verified as {session?.name || "you"}.
                </p>
                <label className="field full">
                  <span>QA remarks / checklist notes</span>
                  <textarea
                    rows={3}
                    value={form.qaRemarks}
                    onChange={(e) => setForm((prev) => ({ ...prev, qaRemarks: e.target.value }))}
                  />
                </label>
                {editing.qaDecision ? (
                  <p className="full">
                    Last decision: <strong>{editing.qaDecision.toUpperCase()}</strong>
                    {editing.qaVerifiedByName ? ` by ${editing.qaVerifiedByName}` : ""}
                    {editing.qaVerifiedAt ? ` · ${editing.qaVerifiedAt.slice(0, 16).replace("T", " ")}` : ""}
                  </p>
                ) : null}
                <div className="full quote-status-actions">
                  <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void runAction("qa_pass")}>
                    QA Pass → Billing
                  </button>
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void runAction("qa_fail")}>
                    QA Fail → In Progress
                  </button>
                </div>
              </>
            ) : null}

            {editing && detailTab === "billing" ? (
              <>
                <p className="full muted" style={{ margin: 0, fontSize: 13 }}>
                  One-click handoff of estimate lines + parts used into Sales Invoice. No approval pause.
                </p>
                {editing.invoiceDocId ? (
                  <p className="full">
                    Invoice linked: <strong>{editing.invoiceDocId}</strong>{" "}
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => navigate("/sales")}
                    >
                      Open invoices
                    </button>
                  </p>
                ) : null}
                <div className="full quote-status-actions">
                  <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void createInvoice()}>
                    Generate / Convert to Invoice
                  </button>
                  <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => void runAction("close")}>
                    Close call
                  </button>
                  {normalizeStatus(editing.status) === "closed" ? (
                    <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => requestStatusChange("open")}>
                      Reopen
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {error ? <p className="form-error full" style={{ padding: 0 }}>{error}</p> : null}
          </form>
        </Modal>
      ) : null}

      {pendingStatus && editing ? (
        <Modal
          nested
          className="modal-confirm"
          title="Update status?"
          onClose={() => !saving && setPendingStatus(null)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={saving}
                onClick={() => setPendingStatus(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={saving}
                onClick={() => void confirmStatusChange()}
              >
                {saving ? "Updating…" : "Update status"}
              </button>
            </>
          }
        >
          <p>
            Change <strong>{editing.callNo}</strong> from{" "}
            <strong>{statusLabel(editing.status)}</strong> to{" "}
            <strong>{statusLabel(pendingStatus)}</strong>?
          </p>
        </Modal>
      ) : null}

      {addEquipOpen && form.customerId ? (
        <Modal
          nested
          className="modal-service-register-equip"
          title="Register Equipment"
          onClose={() => !addEquipSaving && setAddEquipOpen(false)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={addEquipSaving}
                onClick={() => setAddEquipOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="service-register-equip-form"
                disabled={addEquipSaving}
              >
                {addEquipSaving ? "Saving…" : "Register & select"}
              </button>
            </>
          }
        >
          <form
            id="service-register-equip-form"
            className="form-grid"
            onSubmit={(e) => void createEquipmentInline(e)}
          >
            <p className="full muted" style={{ margin: 0, fontSize: 13 }}>
              Customer: <strong>{(parties ?? []).find((p) => p.id === form.customerId)?.name || "—"}</strong>
              {" · "}Asset tag auto: <strong>{nextEquipTag}</strong>
            </p>
            <label className="field">
              <span>Equipment name *</span>
              <input
                required
                value={addEquipForm.name}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Serial number *</span>
              <input
                required
                value={addEquipForm.serialNumber}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Manufacturer</span>
              <input
                value={addEquipForm.manufacturer}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, manufacturer: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                value={addEquipForm.model}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, model: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <input
                value={addEquipForm.category}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, category: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Location</span>
              <input
                value={addEquipForm.location}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, location: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Install / received date</span>
              <input
                type="date"
                value={addEquipForm.installDate}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, installDate: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Current status</span>
              <select
                value={addEquipForm.currentStatus}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, currentStatus: e.target.value }))}
              >
                {EQUIP_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="field full service-visit-done-check">
              <input
                type="checkbox"
                checked={addEquipForm.noMachineWarranty}
                onChange={(e) =>
                  setAddEquipForm((prev) => ({
                    ...prev,
                    noMachineWarranty: e.target.checked,
                    warrantyStart: e.target.checked ? "" : prev.warrantyStart,
                    warrantyEnd: e.target.checked ? "" : prev.warrantyEnd,
                  }))
                }
              />
              <span>No machine warranty</span>
            </label>
            {!addEquipForm.noMachineWarranty ? (
              <>
                <label className="field">
                  <span>Machine warranty start</span>
                  <input
                    type="date"
                    value={addEquipForm.warrantyStart}
                    onChange={(e) => setAddEquipForm((prev) => ({ ...prev, warrantyStart: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Machine warranty end</span>
                  <input
                    type="date"
                    value={addEquipForm.warrantyEnd}
                    onChange={(e) => setAddEquipForm((prev) => ({ ...prev, warrantyEnd: e.target.value }))}
                  />
                </label>
              </>
            ) : null}
            <label className="field full service-visit-done-check">
              <input
                type="checkbox"
                checked={addEquipForm.noServiceWarranty}
                onChange={(e) =>
                  setAddEquipForm((prev) => ({
                    ...prev,
                    noServiceWarranty: e.target.checked,
                    serviceWarrantyStart: e.target.checked ? "" : prev.serviceWarrantyStart,
                    serviceWarrantyEnd: e.target.checked ? "" : prev.serviceWarrantyEnd,
                  }))
                }
              />
              <span>No service warranty</span>
            </label>
            {!addEquipForm.noServiceWarranty ? (
              <>
                <label className="field">
                  <span>Service warranty start</span>
                  <input
                    type="date"
                    value={addEquipForm.serviceWarrantyStart}
                    onChange={(e) => setAddEquipForm((prev) => ({ ...prev, serviceWarrantyStart: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Service warranty end</span>
                  <input
                    type="date"
                    value={addEquipForm.serviceWarrantyEnd}
                    onChange={(e) => setAddEquipForm((prev) => ({ ...prev, serviceWarrantyEnd: e.target.value }))}
                  />
                </label>
              </>
            ) : null}
            <label className="field">
              <span>Condition</span>
              <input
                value={addEquipForm.condition}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, condition: e.target.value }))}
                placeholder="e.g. operational"
              />
            </label>
            <label className="field full">
              <span>Additional note</span>
              <textarea
                rows={3}
                value={addEquipForm.additionalNote}
                onChange={(e) => setAddEquipForm((prev) => ({ ...prev, additionalNote: e.target.value }))}
              />
            </label>
            {addEquipError ? <p className="form-error full" style={{ padding: 0 }}>{addEquipError}</p> : null}
          </form>
        </Modal>
      ) : null}

      {visitOpen && editing ? (
        <Modal
          nested
          title={editingVisit ? `Visit ${editingVisit.visitNo}` : "Add Visit"}
          onClose={() => !visitSaving && setVisitOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" type="button" disabled={visitSaving} onClick={() => setVisitOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="service-visit-form" disabled={visitSaving}>
                {visitSaving ? "Saving…" : editingVisit ? "Save visit" : "Create visit"}
              </button>
            </>
          }
        >
          <form id="service-visit-form" className="form-grid" onSubmit={(e) => void persistVisit(e)}>
            <label className="field">
              <span>Visit date</span>
              <input
                type="date"
                required
                value={visitForm.visitDate}
                onChange={(e) => setVisitForm((prev) => ({ ...prev, visitDate: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={visitForm.status}
                onChange={(e) =>
                  setVisitForm((prev) => ({
                    ...prev,
                    status: e.target.value as ServiceVisitStatus,
                  }))
                }
              >
                {VISIT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <StaffAssignFields
              users={users}
              roles={roles}
              roleId={visitForm.assignedRoleId}
              userId={visitForm.assignedUserId}
              onChange={({ roleId, userId, name }) =>
                setVisitForm((prev) => ({
                  ...prev,
                  assignedRoleId: roleId,
                  assignedUserId: userId,
                  assignedName: name,
                }))
              }
            />
            <label className="field full">
              <span>Work done</span>
              <textarea
                rows={3}
                value={visitForm.workDone}
                onChange={(e) => setVisitForm((prev) => ({ ...prev, workDone: e.target.value }))}
                placeholder="What was done on site?"
              />
            </label>
            <label className="field full">
              <span>Notes</span>
              <textarea
                rows={2}
                value={visitForm.notes}
                onChange={(e) => setVisitForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional visit notes"
              />
            </label>
            {visitError ? <p className="form-error full" style={{ padding: 0 }}>{visitError}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
