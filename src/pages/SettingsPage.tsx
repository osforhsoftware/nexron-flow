import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "../lib/AppContext";
import { ROLE_LABELS } from "../lib/roles";
import { Modal } from "../components/Modal";
import { SettingCheck, Toggle } from "../components/UI";
import { api } from "../lib/api";
import type { PaymentType } from "../db/types";
import {
  COMPANY_CURRENCIES,
  COMPANY_ORIGINS,
  TAX_TYPES,
  defaultCurrencyForCountry,
  defaultTaxTypeForCountry,
  normalizeTaxType,
  originOf,
  taxOptionsForTaxType,
  type CompanyCountry,
  type CompanyCurrency,
  type TaxType,
} from "../lib/companyLocale";
import {
  LEDGER_FIELDS,
  applyFyPreset,
  defaultCompanySettings,
  financialYearRange,
  mergeCompanySettings,
  validateAccountingSettings,
  validatePartySettings,
  validateServiceReminderSettings,
  validateTransactionSettings,
  type CompanySettings,
  type FyPreset,
  type LedgerMapKey,
} from "../lib/companySettings";

const sections = [
  "General",
  "Transaction",
  "Print",
  "Taxes",
  "Transaction Message",
  "Party",
  "Item",
  "Service Reminders",
  "Accounting",
  "Multi Currency",
] as const;

type Section = (typeof sections)[number];

export function SettingsPage() {
  const { company, updateCompany, session } = useApp();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
    state: "",
    country: "AE" as CompanyCountry,
    currency: "AED" as CompanyCurrency,
    taxType: "VAT" as TaxType,
    logoUrl: "",
    signatureUrl: "",
    defaultTerms: "",
    assetTagStart: "EQ-0001",
  });
  const [settings, setSettings] = useState<CompanySettings>(() => defaultCompanySettings("AE"));
  const [accounts, setAccounts] = useState<PaymentType[]>([]);
  const [saved, setSaved] = useState(false);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [section, setSection] = useState<Section>("Accounting");
  const [customFields, setCustomFields] = useState(false);
  const origin = originOf(form.country);

  useEffect(() => {
    if (!company) return;
    const country = (company.country === "IN" ? "IN" : "AE") as CompanyCountry;
    setForm({
      name: company.name,
      phone: company.phone,
      email: company.email ?? "",
      gstin: company.gstin ?? "",
      address: company.address ?? "",
      state: company.state ?? "",
      country,
      currency: (company.currency === "INR" ? "INR" : "AED") as CompanyCurrency,
      taxType: normalizeTaxType(company.taxType, company.country),
      logoUrl: company.logoUrl ?? "",
      signatureUrl: company.signatureUrl ?? "",
      defaultTerms: company.defaultTerms ?? "",
      assetTagStart: company.assetTagStart ?? "EQ-0001",
    });
    setSettings(mergeCompanySettings(company.settings, country));
  }, [company]);

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    void api.payments
      .accounts(company.id)
      .then((res) => {
        if (!cancelled) setAccounts(res.accounts ?? []);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [company?.id]);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "cash" || a.name.toLowerCase().includes("cash")),
    [accounts],
  );
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "bank" || !cashAccounts.some((c) => c.id === a.id)),
    [accounts, cashAccounts],
  );

  async function persistProfile(extra?: Partial<{ settings: CompanySettings }>) {
    if (!company) return;
    try {
    await updateCompany({
      id: company.id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      address: form.address.trim() || undefined,
      state: form.state.trim() || undefined,
        country: form.country,
        currency: form.currency,
        taxType: form.taxType,
        logoUrl: form.logoUrl.trim() || null,
        signatureUrl: form.signatureUrl.trim() || null,
        defaultTerms: form.defaultTerms.trim() || null,
        assetTagStart: form.assetTagStart.trim() || "EQ-0001",
        settings: extra?.settings ?? settings,
      });
      setSectionErrors([]);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      setSectionErrors([message]);
      throw err;
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSectionErrors([]);
    try {
      await persistProfile();
    } catch {
      /* shown via sectionErrors */
    }
  }

  async function saveSettingsSection(next: CompanySettings, validate: () => string[]) {
    const errors = validate();
    setSectionErrors(errors);
    if (errors.length) return;
    setSettings(next);
    try {
      await persistProfile({ settings: next });
    } catch {
      /* shown via sectionErrors */
    }
  }

  function patchSettings<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSectionErrors([]);
  }

  return (
    <div className="settings-shell">
      <aside className="settings-nav">
        <div className="settings-title">
          Settings <span>⌕</span>
        </div>
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            className={section === item ? "active" : ""}
            onClick={() => {
              setSection(item);
              setSectionErrors([]);
            }}
          >
            {item}
          </button>
        ))}
      </aside>
      <main className="settings-main">
        <button className="settings-close" type="button">
          <X size={18} />
        </button>

        {section === "General" ? (
          <form className="settings-general" onSubmit={saveProfile}>
            <h2>Business Profile</h2>
            <p className="muted">
              Signed in as {session?.name}
              {session?.role ? ` · ${ROLE_LABELS[session.role]}` : ""} (PHP API)
            </p>
            <div className="form-grid">
              <label className="field">
                Company name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label className="field">
                Phone
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </label>
              <label className="field">
                Email
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="field">
                Company origin
                <select
                  value={form.country}
                  onChange={(e) => {
                    const country = e.target.value as CompanyCountry;
                    setForm({
                      ...form,
                      country,
                      currency: defaultCurrencyForCountry(country),
                      taxType: defaultTaxTypeForCountry(country),
                    });
                    setSettings((current) => {
                      const next = mergeCompanySettings(current, country);
                      const fy = applyFyPreset(country === "IN" ? "india" : "calendar");
                      return {
                        ...next,
                        accounting: {
                          ...next.accounting,
                          ...fy,
                          ledgers: {
                            ...next.accounting.ledgers,
                            taxPayable: country === "IN" ? "Output GST" : "Output VAT",
                            taxReceivable: country === "IN" ? "Input GST" : "Input VAT",
                          },
                        },
                      };
                    });
                  }}
                >
                  {COMPANY_ORIGINS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Currency
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value as CompanyCurrency })}
                >
                  {COMPANY_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {origin.taxIdLabel}
                <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
              </label>
              <label className="field">
                {origin.regionLabel}
                <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </label>
              <label className="field full">
                Address
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="field full">
                Company logo URL
                <input
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  placeholder="https://… or data:image/…"
                />
              </label>
              <label className="field full">
                Authorized signature URL
                <input
                  value={form.signatureUrl}
                  onChange={(e) => setForm({ ...form, signatureUrl: e.target.value })}
                  placeholder="https://… or data:image/…"
                />
              </label>
              <label className="field full">
                Default quotation T&amp;C
                <textarea
                  rows={4}
                  value={form.defaultTerms}
                  onChange={(e) => setForm({ ...form, defaultTerms: e.target.value })}
                  placeholder="Used when adding Terms on a new quotation"
                />
              </label>
            </div>
            <SectionErrors errors={sectionErrors} />
            <div className="settings-actions">
              <button className="btn btn-primary" type="submit">
                Save Profile
              </button>
              {saved ? <span className="badge badge-ok">Saved</span> : null}
            </div>
          </form>
        ) : null}

        {section === "Transaction" ? (
          <div className="generic-settings">
            <h2>Transaction Settings</h2>
            <p className="muted">Document numbering, credit terms, stock, and round-off for sales and purchases.</p>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label className="field">
                Invoice prefix
                <input
                  value={settings.transaction.invoicePrefix}
                  onChange={(e) =>
                    patchSettings("transaction", { ...settings.transaction, invoicePrefix: e.target.value })
                  }
                  required
                />
              </label>
              <label className="field">
                Estimate / quotation prefix
                <input
                  value={settings.transaction.estimatePrefix}
                  onChange={(e) =>
                    patchSettings("transaction", { ...settings.transaction, estimatePrefix: e.target.value })
                  }
                  required
                />
              </label>
              <label className="field">
                Default payment due (days)
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={settings.transaction.defaultDueDays}
                  onChange={(e) =>
                    patchSettings("transaction", {
                      ...settings.transaction,
                      defaultDueDays: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
            </div>
            <div className="settings-checks" style={{ marginTop: 14 }}>
              <SettingCheck
                label="Enable credit sales"
                checked={settings.transaction.enableCreditSale}
                onChange={(checked) =>
                  patchSettings("transaction", { ...settings.transaction, enableCreditSale: checked })
                }
                hint="Allow invoices with unpaid balance"
              />
              <SettingCheck
                label="Round off invoice totals"
                checked={settings.transaction.enableRoundOff}
                onChange={(checked) =>
                  patchSettings("transaction", { ...settings.transaction, enableRoundOff: checked })
                }
              />
              <SettingCheck
                label="Update stock on sale / purchase"
                checked={settings.transaction.updateStockOnSale}
                onChange={(checked) =>
                  patchSettings("transaction", { ...settings.transaction, updateStockOnSale: checked })
                }
              />
              <SettingCheck
                label="Allow negative stock"
                checked={settings.transaction.allowNegativeStock}
                onChange={(checked) =>
                  patchSettings("transaction", { ...settings.transaction, allowNegativeStock: checked })
                }
              />
            </div>
            <SectionErrors errors={sectionErrors} />
            <div className="settings-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  void saveSettingsSection(settings, () => validateTransactionSettings(settings.transaction))
                }
              >
                Save Transaction Settings
              </button>
              {saved ? <span className="badge badge-ok">Saved</span> : null}
            </div>
          </div>
        ) : null}

        {section === "Item" ? (
          <div className="item-settings">
            <SettingsColumn title="Item Settings">
              <SettingCheck
                label="Enable items"
                checked={settings.item.enableItems}
                onChange={(checked) => patchSettings("item", { ...settings.item, enableItems: checked })}
                hint="Show inventory item features"
              />
              <label className="setting-inline">
                What do you sell?
                <select
                  value={settings.item.sellType}
                  onChange={(e) =>
                    patchSettings("item", {
                      ...settings.item,
                      sellType: e.target.value as CompanySettings["item"]["sellType"],
                    })
                  }
                >
                  <option value="product_service">Product / Service</option>
                  <option value="product">Product only</option>
                  <option value="service">Service only</option>
                </select>
              </label>
              <SettingCheck
                label="Stock maintenance"
                checked={settings.item.stockMaintenance}
                onChange={(checked) => patchSettings("item", { ...settings.item, stockMaintenance: checked })}
              />
              <SettingCheck
                label="Show low stock dialog"
                checked={settings.item.showLowStock}
                onChange={(checked) => patchSettings("item", { ...settings.item, showLowStock: checked })}
              />
              <SettingCheck
                label="Item units"
                checked={settings.item.enableUnits}
                onChange={(checked) => patchSettings("item", { ...settings.item, enableUnits: checked })}
              />
              <SettingCheck
                label="Item category"
                checked={settings.item.enableCategory}
                onChange={(checked) => patchSettings("item", { ...settings.item, enableCategory: checked })}
              />
              <SettingCheck
                label="Item-wise tax"
                checked={settings.item.itemWiseTax}
                onChange={(checked) => patchSettings("item", { ...settings.item, itemWiseTax: checked })}
              />
              <SettingCheck
                label="Item-wise discount"
                checked={settings.item.itemWiseDiscount}
                onChange={(checked) => patchSettings("item", { ...settings.item, itemWiseDiscount: checked })}
              />
            </SettingsColumn>
            <SettingsColumn title="Tracking & pricing">
              <SettingCheck
                label="MRP"
                checked={settings.item.enableMrp}
                onChange={(checked) => patchSettings("item", { ...settings.item, enableMrp: checked })}
              />
              <SettingCheck
                label="Serial / IMEI tracking"
                checked={settings.item.enableSerialTracking}
                onChange={(checked) =>
                  patchSettings("item", { ...settings.item, enableSerialTracking: checked })
                }
              />
              <SettingCheck
                label="Batch number"
                checked={settings.item.enableBatchNo}
                onChange={(checked) => patchSettings("item", { ...settings.item, enableBatchNo: checked })}
              />
              <button className="link-button" type="button" onClick={() => setCustomFields(true)}>
                Add custom fields &gt;
              </button>
            </SettingsColumn>
            <SettingsColumn title="Equipment asset tag">
              <p className="muted" style={{ marginBottom: 8 }}>
                Starting number. New equipment is assigned the next tag automatically and cannot be edited.
              </p>
              <label className="field">
                Default start
                <input
                  value={form.assetTagStart}
                  onChange={(e) => setForm({ ...form, assetTagStart: e.target.value.toUpperCase() })}
                  placeholder="NEX-IT-001"
                />
              </label>
              <p className="muted" style={{ marginTop: 6 }}>
                Example: NEX-IT-001 → next tags NEX-IT-002, NEX-IT-003, NEX-IT-004
              </p>
              <SectionErrors errors={sectionErrors} />
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void persistProfile().catch(() => undefined);
                }}
                style={{ marginTop: 10 }}
              >
                Save item settings
              </button>
              {saved ? (
                <span className="badge badge-ok" style={{ marginLeft: 8 }}>
                  Saved
                </span>
              ) : null}
            </SettingsColumn>
          </div>
        ) : null}

        {section === "Party" ? (
          <div className="generic-settings">
            <h2>Party Settings</h2>
            <p className="muted">Customer / supplier behaviour and payment follow-ups.</p>
            <div className="settings-checks" style={{ marginTop: 14 }}>
              <SettingCheck
                label="Party grouping"
                checked={settings.party.enableGrouping}
                onChange={(checked) => patchSettings("party", { ...settings.party, enableGrouping: checked })}
              />
              <SettingCheck
                label="Shipping address"
                checked={settings.party.enableShippingAddress}
                onChange={(checked) =>
                  patchSettings("party", { ...settings.party, enableShippingAddress: checked })
                }
              />
              <SettingCheck
                label="Manage party status"
                checked={settings.party.managePartyStatus}
                onChange={(checked) =>
                  patchSettings("party", { ...settings.party, managePartyStatus: checked })
                }
              />
              <SettingCheck
                label="Enable payment reminder"
                checked={settings.party.paymentReminderEnabled}
                onChange={(checked) =>
                  patchSettings("party", { ...settings.party, paymentReminderEnabled: checked })
                }
              />
            </div>
            <label className="field" style={{ maxWidth: 280, marginTop: 12 }}>
              Remind for payment due in (days)
              <input
                type="number"
                min={1}
                max={365}
                disabled={!settings.party.paymentReminderEnabled}
                value={settings.party.paymentReminderDays}
                onChange={(e) =>
                  patchSettings("party", {
                    ...settings.party,
                    paymentReminderDays: Number(e.target.value) || 1,
                  })
                }
              />
            </label>
            <SectionErrors errors={sectionErrors} />
            <div className="settings-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void saveSettingsSection(settings, () => validatePartySettings(settings.party))}
              >
                Save Party Settings
              </button>
              {saved ? <span className="badge badge-ok">Saved</span> : null}
            </div>
          </div>
        ) : null}

        {section === "Print" ? (
          <PrintSettings
            settings={settings.print}
            company={form.name}
            taxIdLabel={origin.taxIdLabel}
            onChange={(print) => patchSettings("print", print)}
            onSave={() => void persistProfile()}
            saved={saved}
          />
        ) : null}

        {section === "Transaction Message" ? (
          <MessageSettings
            settings={settings.message}
            onChange={(message) => patchSettings("message", message)}
            onSave={() => void persistProfile()}
            saved={saved}
          />
        ) : null}

        {section === "Multi Currency" ? (
          <div className="generic-settings">
            <h2>Multi Currency</h2>
            <p className="muted">
              Company origin is {origin.label}. Base currency options work the same as INR — pick AED or INR for this
              company.
            </p>
            <label className="field" style={{ maxWidth: 320 }}>
              Base currency
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as CompanyCurrency })}
              >
                {COMPANY_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-actions" style={{ marginTop: "1rem" }}>
              <button className="btn btn-primary" type="button" onClick={() => void persistProfile()}>
                Save Currency
              </button>
              {saved ? <span className="badge badge-ok">Saved</span> : null}
            </div>
          </div>
        ) : null}

        {section === "Taxes" ? (
          <TaxSettings
            taxType={form.taxType}
            onTaxTypeChange={(taxType) => setForm({ ...form, taxType })}
            onSave={() => void persistProfile()}
            saved={saved}
          />
        ) : null}

        {section === "Service Reminders" ? (
          <div className="generic-settings">
            <h2>Service Reminders</h2>
            <p className="muted">Reminders for service due dates and equipment maintenance follow-ups.</p>
            <div className="settings-checks" style={{ marginTop: 14 }}>
              <SettingCheck
                label="Enable service reminders"
                checked={settings.serviceReminders.enabled}
                onChange={(checked) =>
                  patchSettings("serviceReminders", { ...settings.serviceReminders, enabled: checked })
                }
              />
              <SettingCheck
                label="Notify when overdue"
                checked={settings.serviceReminders.notifyOnOverdue}
                onChange={(checked) =>
                  patchSettings("serviceReminders", {
                    ...settings.serviceReminders,
                    notifyOnOverdue: checked,
                  })
                }
              />
              <SettingCheck
                label="Include equipment service schedules"
                checked={settings.serviceReminders.includeEquipment}
                onChange={(checked) =>
                  patchSettings("serviceReminders", {
                    ...settings.serviceReminders,
                    includeEquipment: checked,
                  })
                }
              />
            </div>
            <label className="field" style={{ maxWidth: 280, marginTop: 12 }}>
              Remind before due (days)
              <input
                type="number"
                min={0}
                max={365}
                disabled={!settings.serviceReminders.enabled}
                value={settings.serviceReminders.daysBeforeDue}
                onChange={(e) =>
                  patchSettings("serviceReminders", {
                    ...settings.serviceReminders,
                    daysBeforeDue: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <SectionErrors errors={sectionErrors} />
            <div className="settings-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  void saveSettingsSection(settings, () =>
                    validateServiceReminderSettings(settings.serviceReminders),
                  )
                }
              >
                Save Reminder Settings
              </button>
              {saved ? <span className="badge badge-ok">Saved</span> : null}
            </div>
          </div>
        ) : null}

        {section === "Accounting" ? (
          <AccountingSettingsPanel
            accounting={settings.accounting}
            cashAccounts={cashAccounts.length ? cashAccounts : accounts}
            bankAccounts={bankAccounts.length ? bankAccounts : accounts}
            errors={sectionErrors}
            saved={saved}
            onChange={(accounting) => patchSettings("accounting", accounting)}
            onSave={() =>
              void saveSettingsSection(settings, () => validateAccountingSettings(settings.accounting))
            }
          />
        ) : null}
      </main>
      {customFields ? <CustomFields onClose={() => setCustomFields(false)} /> : null}
    </div>
  );
}

function SectionErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="settings-errors">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

function SettingsColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-column">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function AccountingSettingsPanel({
  accounting,
  cashAccounts,
  bankAccounts,
  errors,
  saved,
  onChange,
  onSave,
}: {
  accounting: CompanySettings["accounting"];
  cashAccounts: PaymentType[];
  bankAccounts: PaymentType[];
  errors: string[];
  saved: boolean;
  onChange: (value: CompanySettings["accounting"]) => void;
  onSave: () => void;
}) {
  const fy = financialYearRange(
    accounting.bookBeginningDate || new Date().toISOString().slice(0, 10),
    accounting.fyStartMonth,
    accounting.fyStartDay,
  );

  function setLedger(key: LedgerMapKey, value: string) {
    onChange({
      ...accounting,
      ledgers: { ...accounting.ledgers, [key]: value },
    });
  }

  function setPreset(preset: FyPreset) {
    if (preset === "custom") {
      onChange({ ...accounting, fyPreset: "custom" });
      return;
    }
    onChange({ ...accounting, ...applyFyPreset(preset) });
  }

  return (
    <div className="accounting-settings">
      <header className="accounting-head">
        <div>
          <h2>Accounting Settings</h2>
          <p className="muted">
            Financial year and mandatory ledger mapping keep books consistent across sales, purchase, tax, and cash.
          </p>
        </div>
        <div className="fy-badge">
          <span>Current FY</span>
          <strong>{fy.label}</strong>
          <small>
            {fy.start} → {fy.end}
          </small>
        </div>
      </header>

      <section className="accounting-card">
        <h3>Financial year</h3>
        <div className="form-grid">
          <label className="field">
            FY preset
            <select
              value={accounting.fyPreset}
              onChange={(e) => setPreset(e.target.value as FyPreset)}
            >
              <option value="india">India (Apr–Mar)</option>
              <option value="calendar">Calendar (Jan–Dec)</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="field">
            FY start month
            <select
              value={accounting.fyStartMonth}
              disabled={accounting.fyPreset !== "custom"}
              onChange={(e) =>
                onChange({
                  ...accounting,
                  fyPreset: "custom",
                  fyStartMonth: Number(e.target.value),
                })
              }
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {new Date(2000, month - 1, 1).toLocaleString("en", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            FY start day
            <input
              type="number"
              min={1}
              max={28}
              disabled={accounting.fyPreset !== "custom"}
              value={accounting.fyStartDay}
              onChange={(e) =>
                onChange({
                  ...accounting,
                  fyPreset: "custom",
                  fyStartDay: Number(e.target.value) || 1,
                })
              }
            />
          </label>
          <label className="field">
            Books beginning from
            <input
              type="date"
              value={accounting.bookBeginningDate}
              onChange={(e) => onChange({ ...accounting, bookBeginningDate: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="settings-checks" style={{ marginTop: 10 }}>
          <SettingCheck
            label="Lock transactions outside current financial year"
            checked={accounting.lockOutsideFy}
            onChange={(checked) => onChange({ ...accounting, lockOutsideFy: checked })}
            hint="Blocks posting outside the active FY until year is closed"
          />
          <SettingCheck
            label="Prevent backdated entries before books beginning"
            checked={accounting.preventBackdatedBeforeBooks}
            onChange={(checked) => onChange({ ...accounting, preventBackdatedBeforeBooks: checked })}
          />
        </div>
      </section>

      <section className="accounting-card">
        <h3>Ledger mapping (required)</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Every posting key must map to a unique ledger name. Cash and bank can also link to payment accounts.
        </p>
        <div className="ledger-grid">
          {LEDGER_FIELDS.map((field) => (
            <label className="field" key={field.key}>
              {field.label}
              <em className="ledger-hint">{field.hint}</em>
              <input
                value={accounting.ledgers[field.key]}
                onChange={(e) => setLedger(field.key, e.target.value)}
                placeholder={field.label}
                required
              />
            </label>
          ))}
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <label className="field">
            Default cash account
            <select
              value={accounting.defaultCashAccountId}
              onChange={(e) => onChange({ ...accounting, defaultCashAccountId: e.target.value })}
            >
              <option value="">Select cash account</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Default bank account
            <select
              value={accounting.defaultBankAccountId}
              onChange={(e) => onChange({ ...accounting, defaultBankAccountId: e.target.value })}
            >
              <option value="">Select bank account</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <SectionErrors errors={errors} />
      <div className="settings-actions">
        <button className="btn btn-primary" type="button" onClick={onSave}>
          Save Accounting Settings
        </button>
        {saved ? <span className="badge badge-ok">Saved</span> : null}
      </div>
    </div>
  );
}

function PrintSettings({
  settings,
  company,
  taxIdLabel,
  onChange,
  onSave,
  saved,
}: {
  settings: CompanySettings["print"];
  company: string;
  taxIdLabel: string;
  onChange: (value: CompanySettings["print"]) => void;
  onSave: () => void;
  saved: boolean;
}) {
  const regular = settings.printerMode === "regular";
  return (
    <div className="print-settings">
      <div className="print-config">
        <div className="tabs">
          <button
            className={`tab${regular ? " active" : ""}`}
            onClick={() => onChange({ ...settings, printerMode: "regular" })}
            type="button"
          >
            REGULAR PRINTER
          </button>
          <button
            className={`tab${!regular ? " active" : ""}`}
            onClick={() => onChange({ ...settings, printerMode: "thermal" })}
            type="button"
          >
            THERMAL PRINTER
          </button>
        </div>
        <h3>CHANGE LAYOUT</h3>
        <div className="theme-thumbs">
          {([1, 2, 3, 4] as const).map((theme) => (
            <button
              key={theme}
              className={settings.layoutTheme === theme ? "active" : ""}
              type="button"
              onClick={() => onChange({ ...settings, layoutTheme: theme })}
            >
              <span>▤</span>Theme {theme}
            </button>
          ))}
        </div>
        <SettingCheck
          label={`Make ${regular ? "Regular" : "Thermal"} Printer Default`}
          checked={settings.makeDefault}
          onChange={(checked) => onChange({ ...settings, makeDefault: checked })}
        />
        <SettingCheck
          label="Print repeat header in all pages"
          checked={settings.repeatHeader}
          onChange={(checked) => onChange({ ...settings, repeatHeader: checked })}
        />
        <SettingCheck
          label="Company Name"
          checked={settings.showCompanyName}
          onChange={(checked) => onChange({ ...settings, showCompanyName: checked })}
        />
        <SettingCheck
          label="Company Logo"
          checked={settings.showLogo}
          onChange={(checked) => onChange({ ...settings, showLogo: checked })}
        />
        <SettingCheck
          label="Address"
          checked={settings.showAddress}
          onChange={(checked) => onChange({ ...settings, showAddress: checked })}
        />
        <SettingCheck
          label="Email"
          checked={settings.showEmail}
          onChange={(checked) => onChange({ ...settings, showEmail: checked })}
        />
        <SettingCheck
          label="Phone Number"
          checked={settings.showPhone}
          onChange={(checked) => onChange({ ...settings, showPhone: checked })}
        />
        <SettingCheck
          label={`${taxIdLabel} on Sale`}
          checked={settings.showTaxId}
          onChange={(checked) => onChange({ ...settings, showTaxId: checked })}
        />
        <SettingCheck
          label="Tax Details"
          checked={settings.showTaxDetails}
          onChange={(checked) => onChange({ ...settings, showTaxDetails: checked })}
        />
        <SettingCheck
          label="You Saved"
          checked={settings.showYouSaved}
          onChange={(checked) => onChange({ ...settings, showYouSaved: checked })}
        />
        <SettingCheck
          label="Print Terms and Conditions"
          checked={settings.showTerms}
          onChange={(checked) => onChange({ ...settings, showTerms: checked })}
        />
        <SettingCheck
          label="Authorized Signatory"
          checked={settings.showSignatory}
          onChange={(checked) => onChange({ ...settings, showSignatory: checked })}
        />
        <div className="settings-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" onClick={onSave}>
            Save Print Settings
          </button>
          {saved ? <span className="badge badge-ok">Saved</span> : null}
        </div>
      </div>
      <InvoiceDocument company={company} compact={!regular} print={settings} taxIdLabel={taxIdLabel} />
    </div>
  );
}

function InvoiceDocument({
  company,
  compact = false,
  print,
  taxIdLabel,
}: {
  company: string;
  compact?: boolean;
  print: CompanySettings["print"];
  taxIdLabel: string;
}) {
  return (
    <div className={`settings-invoice${compact ? " thermal" : ""}`}>
      <h2>Tax Invoice</h2>
      <div className="doc-company">
        {print.showCompanyName ? <strong>{company || "My Company"}</strong> : null}
        {print.showPhone ? <small>Phone: 8111985559</small> : null}
        {print.showEmail ? <small>Email: accounts@company.demo</small> : null}
        {print.showAddress ? <small>Address on file</small> : null}
        {print.showTaxId ? <small>{taxIdLabel}: DEMO1234</small> : null}
      </div>
      <div className="doc-row">
        <span>
          Bill To:
          <br />
          Classic enterprises
        </span>
        <span>
          Invoice Details:
          <br />
          No: Inv/01
          <br />
          Date: 02-07-2019
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item name</th>
            <th>HSN/SAC</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2].map((i) => (
            <tr key={i}>
              <td>{i}</td>
              <td>ITEM {i}</td>
              <td>1234</td>
              <td>1</td>
              <td>10.00</td>
              <td>10.00</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-total">
        <span>Total</span>
        <strong>20.00</strong>
        {print.showTaxDetails ? (
          <>
            <span>Tax</span>
            <strong>0.00</strong>
          </>
        ) : null}
        {print.showYouSaved ? (
          <>
            <span>You saved</span>
            <strong>0.00</strong>
          </>
        ) : null}
        <span>Balance</span>
        <strong>20.00</strong>
      </div>
      {print.showTerms ? <div className="muted" style={{ marginTop: 8 }}>Terms &amp; Conditions apply.</div> : null}
      {print.showSignatory ? <div className="doc-sign">Authorized Signatory</div> : null}
    </div>
  );
}

function MessageSettings({
  settings,
  onChange,
  onSave,
  saved,
}: {
  settings: CompanySettings["message"];
  onChange: (value: CompanySettings["message"]) => void;
  onSave: () => void;
  saved: boolean;
}) {
  const preview = settings.template
    .replace("{amount}", "792")
    .replace("{received}", "300")
    .replace("{balance}", "492");

  return (
    <div className="message-settings">
      <section>
        <h2>Transaction Message</h2>
        <div className="tabs">
          <button
            className={`tab${settings.channel === "nexron" ? " active" : ""}`}
            type="button"
            onClick={() => onChange({ ...settings, channel: "nexron" })}
          >
            Send via NEXRON Flow
          </button>
          <button
            className={`tab${settings.channel === "whatsapp" ? " active" : ""}`}
            type="button"
            onClick={() => onChange({ ...settings, channel: "whatsapp" })}
          >
            Send via Personal WhatsApp
          </button>
        </div>
        <h3>Message recipient</h3>
        <SettingCheck
          label="Send message to party"
          checked={settings.sendToParty}
          onChange={(checked) => onChange({ ...settings, sendToParty: checked })}
        />
        <SettingCheck
          label="Send transaction update message"
          checked={settings.sendUpdate}
          onChange={(checked) => onChange({ ...settings, sendUpdate: checked })}
        />
        <SettingCheck
          label="Send message copy to self"
          checked={settings.sendCopyToSelf}
          onChange={(checked) => onChange({ ...settings, sendCopyToSelf: checked })}
        />
        <h3>Message content</h3>
        <SettingCheck
          label="Party current balance in message"
          checked={settings.includeBalance}
          onChange={(checked) => onChange({ ...settings, includeBalance: checked })}
        />
        <SettingCheck
          label="Web invoice link in message"
          checked={settings.includeWebLink}
          onChange={(checked) => onChange({ ...settings, includeWebLink: checked })}
        />
        <SettingCheck
          label="Send payment link in message"
          checked={settings.includePaymentLink}
          onChange={(checked) => onChange({ ...settings, includePaymentLink: checked })}
        />
        <label className="field" style={{ marginTop: 14 }}>
          Message template
          <textarea
            rows={5}
            value={settings.template}
            onChange={(e) => onChange({ ...settings, template: e.target.value })}
            placeholder="Use {amount}, {received}, {balance}"
          />
        </label>
        <div className="settings-actions">
          <button className="btn btn-primary" type="button" onClick={onSave}>
            Save Message Settings
          </button>
          {saved ? <span className="badge badge-ok">Saved</span> : null}
        </div>
      </section>
      <aside>
        <label>
          Preview
          <select disabled>
            <option>Sales Transaction</option>
          </select>
        </label>
        <div className="message-phone">
          <strong>Message preview</strong>
          <p style={{ whiteSpace: "pre-wrap" }}>{preview}</p>
        </div>
        <div className="message-preview" style={{ whiteSpace: "pre-wrap" }}>
          {settings.includeWebLink ? "🔗 Invoice link included\n\n" : ""}
          {preview}
          {settings.includeBalance ? "\nTotal Balance: 800" : ""}
          {settings.includePaymentLink ? "\nPay now: payment-link" : ""}
        </div>
      </aside>
    </div>
  );
}

function TaxSettings({
  taxType,
  onTaxTypeChange,
  onSave,
  saved,
}: {
  taxType: TaxType;
  onTaxTypeChange: (value: TaxType) => void;
  onSave: () => void;
  saved: boolean;
}) {
  const rates = taxOptionsForTaxType(taxType);
  const selected = TAX_TYPES.find((t) => t.code === taxType) ?? TAX_TYPES[1];

  return (
    <div className="generic-settings">
      <h2>Taxes</h2>
      <p className="muted">
        Choose the tax system used on invoices, quotations, items, and purchase documents. When VAT is selected, only
        Dubai / UAE VAT rates are shown.
      </p>
      <label className="field" style={{ maxWidth: 360 }}>
        Tax type
        <select value={taxType} onChange={(e) => onTaxTypeChange(e.target.value as TaxType)}>
          {TAX_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted" style={{ marginTop: 8 }}>
        {selected.hint}
      </p>
      <div style={{ marginTop: "1.25rem" }}>
        <h3 style={{ marginBottom: 8 }}>Rates shown in documents</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {rates.map((rate) => (
            <li key={`${rate.value}-${rate.label}`}>{rate.label}</li>
          ))}
        </ul>
      </div>
      <div className="settings-actions" style={{ marginTop: "1.25rem" }}>
        <button className="btn btn-primary" type="button" onClick={onSave}>
          Save Tax Settings
        </button>
        {saved ? <span className="badge badge-ok">Saved</span> : null}
      </div>
    </div>
  );
}

const CUSTOM_FIELD_PRESETS = ["Colour", "Material", "Mfg. Date", "Exp. Date", "Size", "Brand"] as const;

function CustomFields({ onClose }: { onClose: () => void }) {
  const [fields, setFields] = useState(() =>
    CUSTOM_FIELD_PRESETS.map((example, index) => ({
      id: index + 1,
      enabled: false,
      name: "",
      example,
      showInPrint: false,
    })),
  );

  function updateField(id: number, patch: Partial<(typeof fields)[number]>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  return (
    <Modal
      title="Add Custom Fields"
      className="modal-custom-fields"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Save
          </button>
        </>
      }
    >
      <div className="custom-fields-grid">
        {fields.map((field) => (
          <div className={`custom-field-entry${field.enabled ? " enabled" : ""}`} key={field.id}>
            <label className="custom-field-check">
              <input
                type="checkbox"
                checked={field.enabled}
                onChange={(e) =>
                  updateField(field.id, {
                    enabled: e.target.checked,
                    showInPrint: e.target.checked ? field.showInPrint : false,
                  })
                }
              />
              <span>
                Custom Field {field.id}
                <em>*</em>
              </span>
            </label>
            <div className="custom-field-controls">
              <input
                value={field.name}
                disabled={!field.enabled}
                placeholder={`E.g: ${field.example}`}
                onChange={(e) => updateField(field.id, { name: e.target.value })}
              />
              <Toggle
                checked={field.showInPrint}
                onChange={(checked) => {
                  if (!field.enabled) return;
                  updateField(field.id, { showInPrint: checked });
                }}
                label="Show in print"
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
