import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Camera, Plus, Settings, X } from "lucide-react";
import { api } from "../lib/api";
import type { Item } from "../db/types";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { taxOptionsForCountry } from "../lib/companyLocale";
import { useAsync } from "../lib/useAsync";

const emptyForm = {
  name: "",
  sku: "",
  unit: "pcs",
  salePrice: "0",
  purchasePrice: "0",
  stockQty: "0",
  taxPercent: "5",
  category: "",
  itemType: "product" as "product" | "service",
};

type EditorTab = "pricing" | "stock";

export function ItemsPage() {
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);
  const taxOptions = taxOptionsForCountry(company?.country);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editorTab, setEditorTab] = useState<EditorTab>("pricing");

  const { data: items, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
    return rows;
  }, [companyId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        !term ||
        i.name.toLowerCase().includes(term) ||
        i.sku?.toLowerCase().includes(term) ||
        i.category?.toLowerCase().includes(term),
    );
  }, [items, q]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setEditorTab("pricing");
    setOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setForm({
      name: item.name,
      sku: item.sku ?? "",
      unit: item.unit,
      salePrice: String(item.salePrice),
      purchasePrice: String(item.purchasePrice),
      stockQty: String(item.stockQty),
      taxPercent: String(item.taxPercent),
      category: item.category ?? "",
      itemType: "product",
    });
    setEditorTab("pricing");
    setOpen(true);
  }

  async function persist(keepOpen: boolean) {
    if (!companyId) return;
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      unit: form.unit.trim() || "pcs",
      salePrice: Number(form.salePrice) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      stockQty: Number(form.stockQty) || 0,
      taxPercent: Number(form.taxPercent) || 0,
      category: form.category.trim() || undefined,
    };
    if (!payload.name) return;

    if (editing) {
      await api.items.update(editing.id, payload);
    } else {
      await api.items.create({
        companyId,
        ...payload,
      });
    }
    reload();

    if (keepOpen) {
      setEditing(null);
      setForm(emptyForm);
      setEditorTab("pricing");
      return;
    }
    setOpen(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await persist(false);
  }

  if (open) {
    return (
      <div className="full-editor item-editor">
        <div className="editor-heading">
          <div className="editor-heading-left">
            <h1>{editing ? "Edit Item" : "Add Item"}</h1>
            <button
              className="product-toggle"
              type="button"
              onClick={() => {
                const nextType = form.itemType === "product" ? "service" : "product";
                setForm({ ...form, itemType: nextType });
                if (nextType === "service") setEditorTab("pricing");
              }}
              aria-label="Toggle product or service"
            >
              <strong className={form.itemType === "product" ? "on" : ""}>Product</strong>
              <span className={`switch${form.itemType === "product" ? " on" : ""}`} aria-hidden>
                <span />
              </span>
              <strong className={form.itemType === "service" ? "on" : ""}>Service</strong>
            </button>
          </div>
          <div className="editor-icons">
            <Settings size={16} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X size={19} />
            </button>
          </div>
        </div>

        <form id="item-full-form" className="item-editor-form" onSubmit={save}>
          <div className="item-editor-scroll">
            <div className="item-identity-grid">
              <label className="field">
                Item Name *
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                Item HSN
                <input placeholder="Search HSN" />
              </label>
              <button className="unit-select" type="button">
                Select Unit
              </button>
              <button className="image-upload" type="button">
                <Camera size={16} />
                Add Item Image
              </button>
              <label className="field">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Category</option>
                  <option>Electronics</option>
                  <option>General</option>
                </select>
              </label>
              <label className="field">
                Item Code
                <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </label>
            </div>

            <div className="tabs item-editor-tabs" role="tablist">
              <button
                className={`tab${editorTab === "pricing" ? " active" : ""}`}
                type="button"
                role="tab"
                aria-selected={editorTab === "pricing"}
                onClick={() => setEditorTab("pricing")}
              >
                Pricing
              </button>
              {form.itemType === "product" ? (
                <button
                  className={`tab${editorTab === "stock" ? " active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={editorTab === "stock"}
                  onClick={() => setEditorTab("stock")}
                >
                  Stock
                </button>
              ) : null}
            </div>

            <div className="item-editor-body" role="tabpanel">
              {editorTab === "pricing" ? (
                <>
                  <section className="editor-section full-span">
                    <h3>Sale Price</h3>
                    <div className="inline-fields joined">
                      <label className="field">
                        Sale Price
                        <input
                          type="number"
                          value={form.salePrice}
                          onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Tax
                        <select defaultValue="Without Tax">
                          <option>Without Tax</option>
                          <option>With Tax</option>
                        </select>
                      </label>
                      <label className="field">
                        Disc. on Sale Price
                        <input placeholder="0" />
                      </label>
                      <label className="field">
                        Type
                        <select defaultValue="Percentage">
                          <option>Percentage</option>
                          <option>Amount</option>
                        </select>
                      </label>
                    </div>
                    <button className="link-button" type="button">
                      + Add Wholesale Price
                    </button>
                  </section>

                  <section className="editor-section">
                    <h3>Purchase Price</h3>
                    <div className="inline-fields joined">
                      <label className="field">
                        Purchase Price
                        <input
                          type="number"
                          value={form.purchasePrice}
                          onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Tax
                        <select defaultValue="Without Tax">
                          <option>Without Tax</option>
                          <option>With Tax</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="editor-section">
                    <h3>Taxes</h3>
                    <label className="field">
                      Tax Rate
                      <select
                        value={form.taxPercent}
                        onChange={(e) => setForm({ ...form, taxPercent: e.target.value })}
                      >
                        <option value="0">None</option>
                        {taxOptions.map((opt) => (
                          <option key={`${opt.value}-${opt.label}`} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                </>
              ) : (
                <section className="editor-section full-span">
                  <h3>Stock</h3>
                  <div className="inline-fields stock-fields">
                    <label className="field">
                      Opening Quantity
                      <input
                        type="number"
                        value={form.stockQty}
                        onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      At Price
                      <input type="number" value={form.purchasePrice} readOnly />
                    </label>
                    <label className="field">
                      As Of Date
                      <input type="date" defaultValue="2026-11-10" />
                    </label>
                    <label className="field">
                      Min Stock To Maintain
                      <input type="number" placeholder="0" />
                    </label>
                    <label className="field">
                      Location
                      <input placeholder="Main warehouse" defaultValue="Main warehouse" />
                    </label>
                  </div>
                </section>
              )}
            </div>
          </div>

          <div className="editor-footer">
            <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void persist(true)}>
              Save &amp; New
            </button>
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Items</h1>
          <p className="muted">Item details · stock · sale &amp; purchase price</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> Add Item
          </button>
        </div>
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              className="search"
              placeholder="Search by name / code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="filter-chip">All items</span>
          </div>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Sale</th>
                  <th>Purchase</th>
                  <th>Tax %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.category ? (
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {item.category}
                        </div>
                      ) : null}
                    </td>
                    <td>{item.sku || "—"}</td>
                    <td>
                      {item.stockQty} {item.unit}
                    </td>
                    <td className="money">{fmtMoney(item.salePrice)}</td>
                    <td className="money">{fmtMoney(item.purchasePrice)}</td>
                    <td>{item.taxPercent}%</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">No items yet.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
