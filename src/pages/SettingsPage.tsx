import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "../lib/AppContext";
import { ROLE_LABELS } from "../lib/roles";
import { Modal } from "../components/Modal";
import { SettingCheck, Toggle } from "../components/UI";
import {
  COMPANY_CURRENCIES,
  COMPANY_ORIGINS,
  defaultCurrencyForCountry,
  originOf,
  type CompanyCountry,
  type CompanyCurrency,
} from "../lib/companyLocale";

const sections = ["General", "Transaction", "Print", "Taxes & GST", "Transaction Message", "Party", "Item", "Service Reminders", "Accounting", "Multi Currency"];

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
  });
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState("Item");
  const [customFields, setCustomFields] = useState(false);
  const [regularPrinter, setRegularPrinter] = useState(true);
  const [options, setOptions] = useState<Record<string, boolean>>({
    enableItem: true, stock: true, lowStock: true, units: true, category: true,
    tax: true, discount: true, reminder: true, shipping: false, repeatHeader: true,
  });
  const setOption = (key: string) => (value: boolean) => setOptions((current) => ({ ...current, [key]: value }));
  const origin = originOf(form.country);

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name,
      phone: company.phone,
      email: company.email ?? "",
      gstin: company.gstin ?? "",
      address: company.address ?? "",
      state: company.state ?? "",
      country: (company.country === "IN" ? "IN" : "AE") as CompanyCountry,
      currency: (company.currency === "INR" ? "INR" : "AED") as CompanyCurrency,
    });
  }, [company]);

  async function persistProfile() {
    if (!company) return;
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
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await persistProfile();
  }

  async function resetDemo() {
    alert(
      "Demo data lives in the PHP SQLite database now.\n\nRun:\nC:\\xampp\\php\\php.exe scripts\\seed.php\nfrom the backend folder to reseed.",
    );
  }

  return (
    <div className="settings-shell">
      <aside className="settings-nav">
        <div className="settings-title">Settings <span>⌕</span></div>
        {sections.map((item) => <button key={item} type="button" className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item}</button>)}
      </aside>
      <main className="settings-main">
        <button className="settings-close" type="button"><X size={18}/></button>
        {section === "General" ? (
          <form className="settings-general" onSubmit={save}>
            <h2>Business Profile</h2>
            <p className="muted">
              Signed in as {session?.name}
              {session?.role ? ` · ${ROLE_LABELS[session.role]}` : ""} (PHP API)
            </p>
            <div className="form-grid">
              <label className="field">Company name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label className="field">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
              <label className="field">Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
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
                    });
                  }}
                >
                  {COMPANY_ORIGINS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
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
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">{origin.taxIdLabel}<input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></label>
              <label className="field">{origin.regionLabel}<input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
              <label className="field full">Address<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            </div>
            <div className="settings-actions"><button className="btn btn-primary" type="submit">Save Profile</button>{saved ? <span className="badge badge-ok">Saved</span> : null}<button className="btn btn-danger" type="button" onClick={resetDemo}>Reset Demo</button></div>
          </form>
        ) : section === "Item" ? (
          <div className="item-settings">
            <SettingsColumn title="Item Settings">
              <SettingCheck label="Enable Item" checked={options.enableItem} onChange={setOption("enableItem")} hint="Show inventory item features" />
              <label className="setting-inline">What do you sell?<select><option>Product/Service</option></select></label>
              <SettingCheck label="Barcode Scan" checked={false} onChange={() => {}} />
              <SettingCheck label="Stock Maintenance" checked={options.stock} onChange={setOption("stock")} />
              <SettingCheck label="Manufacturing" checked={false} onChange={() => {}} />
              <SettingCheck label="Show Low Stock Dialog" checked={options.lowStock} onChange={setOption("lowStock")} />
              <SettingCheck label="Items Unit" checked={options.units} onChange={setOption("units")} />
              <SettingCheck label="Default Unit" checked={false} onChange={() => {}} />
              <SettingCheck label="Item Category" checked={options.category} onChange={setOption("category")} />
              <SettingCheck label="Party Wise Item Rate" checked={false} onChange={() => {}} />
              <SettingCheck label="Description" checked={false} onChange={() => {}} />
              <SettingCheck label="Item wise Tax" checked={options.tax} onChange={setOption("tax")} />
              <SettingCheck label="Item wise Discount" checked={options.discount} onChange={setOption("discount")} />
              <SettingCheck label="Update Sale Price from Transaction" checked={false} onChange={() => {}} />
            </SettingsColumn>
            <SettingsColumn title="Additional Item Fields">
              <h3>MRP/Price</h3><SettingCheck label="MRP" checked={false} onChange={() => {}} /><SettingCheck label="Calculate Tax based on MRP" checked={false} onChange={() => {}} />
              <h3>Serial No. Tracking</h3><SettingCheck label="Serial No. / IMEI No. etc" checked={false} onChange={() => {}} />
              <h3>Batch Tracking</h3>{["Batch No.","Exp Date","Mfg Date","Model No.","Size"].map((label) => <SettingCheck key={label} label={label} checked={false} onChange={() => {}} />)}
            </SettingsColumn>
            <SettingsColumn title="Item Custom Fields"><button className="link-button" type="button" onClick={() => setCustomFields(true)}>Add Custom Fields &gt;</button></SettingsColumn>
          </div>
        ) : section === "Party" ? (
          <div className="item-settings">
            <SettingsColumn title="Party Settings">{["Party Grouping","Shipping Address","Manage Party Status"].map((label) => <SettingCheck key={label} label={label} checked={label === "Shipping Address" ? options.shipping : false} onChange={label === "Shipping Address" ? setOption("shipping") : () => {}} />)}<SettingCheck label="Enable Payment Reminder" checked={options.reminder} onChange={setOption("reminder")} /><label className="setting-inline">Remind me for payment due in <input type="number" defaultValue="1" /> days</label></SettingsColumn>
            <SettingsColumn title="Additional fields">{[1,2,3,4].map((i) => <div className="custom-field-row" key={i}><input type="checkbox"/><input placeholder={`Additional Field ${i}`} /><Toggle checked={false} onChange={() => {}} label="Show In Print" /></div>)}</SettingsColumn>
            <SettingsColumn title="Enable Loyalty Point"><SettingCheck label="Enable Loyalty Point" checked={false} onChange={() => {}} /></SettingsColumn>
          </div>
        ) : section === "Print" ? (
          <PrintSettings regular={regularPrinter} setRegular={setRegularPrinter} options={options} setOption={setOption} company={form.name} />
        ) : section === "Transaction Message" ? (
          <MessageSettings />
        ) : section === "Multi Currency" ? (
          <div className="generic-settings">
            <h2>Multi Currency</h2>
            <p className="muted">
              Company origin is {origin.label}. Base currency options work the same as INR — pick AED or INR for this company.
            </p>
            <label className="field" style={{ maxWidth: 320 }}>
              Base currency
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as CompanyCurrency })}
              >
                {COMPANY_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
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
        ) : (
          <GenericSettings section={section} />
        )}
      </main>
      {customFields ? <CustomFields onClose={() => setCustomFields(false)} /> : null}
    </div>
  );
}

function SettingsColumn({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-column"><h2>{title}</h2>{children}</section>;
}

function PrintSettings({ regular, setRegular, options, setOption, company }: { regular: boolean; setRegular: (v:boolean)=>void; options: Record<string,boolean>; setOption:(key:string)=>(value:boolean)=>void; company:string }) {
  return <div className="print-settings"><div className="print-config"><div className="tabs"><button className={`tab${regular ? " active":""}`} onClick={() => setRegular(true)} type="button">REGULAR PRINTER</button><button className={`tab${!regular ? " active":""}`} onClick={() => setRegular(false)} type="button">THERMAL PRINTER</button></div><h3>CHANGE LAYOUT</h3><div className="theme-thumbs">{[1,2,3,4].map(i => <button key={i} className={i===1?"active":""} type="button"><span>▤</span>Theme {i}</button>)}</div><SettingCheck label={`Make ${regular ? "Regular" : "Thermal"} Printer Default`} checked={true} onChange={()=>{}}/><SettingCheck label="Print repeat header in all pages" checked={options.repeatHeader} onChange={setOption("repeatHeader")}/>{["Company Name","Company Logo","Address","Email","Phone Number","GSTIN on Sale","Tax Details","You Saved","Print Terms and Conditions","Authorized Signatory"].map(label => <SettingCheck key={label} label={label} checked={true} onChange={()=>{}}/>)}</div><InvoiceDocument company={company} compact={!regular}/></div>;
}

function InvoiceDocument({ company, compact=false }: { company:string; compact?:boolean }) {
  return <div className={`settings-invoice${compact ? " thermal":""}`}><h2>Tax Invoice</h2><div className="doc-company"><strong>{company || "My Company"}</strong><small>Phone: 8111985559</small></div><div className="doc-row"><span>Bill To:<br/>Classic enterprises</span><span>Invoice Details:<br/>No: Inv/01<br/>Date: 02-07-2019</span></div><table><thead><tr><th>#</th><th>Item name</th><th>HSN/SAC</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>{[1,2].map(i => <tr key={i}><td>{i}</td><td>ITEM {i}</td><td>1234</td><td>1</td><td>₹ 10.00</td><td>₹ 10.00</td></tr>)}</tbody></table><div className="doc-total"><span>Total</span><strong>₹ 45.80</strong><span>Balance</span><strong>₹ 30.32</strong></div><div className="doc-sign">Authorized Signatory</div></div>;
}

function MessageSettings() {
  return <div className="message-settings"><section><h2>Transaction Message</h2><div className="tabs"><button className="tab active" type="button">Send via NEXRON Flow</button><button className="tab" type="button">Send via Personal WhatsApp</button></div><h3>Message Recipient Settings:</h3>{["Send Message to Party","Send Transaction Update Message","Send Message Copy to Self","Auto Share Invoices on NEXRON Network"].map(label => <SettingCheck key={label} label={label} checked={label==="Send Message to Party"} onChange={()=>{}}/>)}<h3>Message Content:</h3>{["Party Current Balance in Message","Web invoice link in Message","Send payment link in Message"].map(label => <SettingCheck key={label} label={label} checked={label.includes("Web")} onChange={()=>{}}/>)}</section><aside><label>Transaction Type: <select><option>Sales Transaction</option></select></label><div className="message-phone"><strong>Thanks for your purchase with us!!</strong><p>Invoice Amount: 792<br/>Received: 300<br/>Balance: 492<br/>Total Balance: 800</p></div><div className="message-preview">📎 Transaction Image Attached<br/><br/>Thanks for your purchase with us!!<br/>Purchase Details:<br/>Invoice Amount: 792<br/>Received: 300<br/>Balance: 492</div></aside></div>;
}

function GenericSettings({ section }: { section:string }) {
  return <div className="generic-settings"><h2>{section} Settings</h2><p className="muted">Configure how {section.toLowerCase()} works for your business.</p>{["Enable feature","Show additional fields","Use company defaults","Show in print","Allow reminders"].map((label,i) => <SettingCheck key={label} label={label} checked={i < 2} onChange={()=>{}} />)}</div>;
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

  function updateField(
    id: number,
    patch: Partial<(typeof fields)[number]>,
  ) {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
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
          <div
            className={`custom-field-entry${field.enabled ? " enabled" : ""}`}
            key={field.id}
          >
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
