import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronDown, Eye, Pencil, Plus, QrCode, Settings, X } from "lucide-react";
import { Modal } from "../components/Modal";
import { QrCodeModal } from "../components/QrCodeModal";
import { api } from "../lib/api";
import type { Item } from "../db/types";
import { useApp } from "../lib/AppContext";
import { money } from "../lib/format";
import { taxOptionsForCountry } from "../lib/companyLocale";
import { fileToItemImageDataUrl } from "../lib/itemImage";
import { useAsync } from "../lib/useAsync";
import { TablePagination, usePagedRows } from "../components/TablePagination";

const emptyForm = {
  name: "",
  sku: "",
  unit: "pcs",
  salePrice: "0",
  purchasePrice: "0",
  stockQty: "0",
  taxPercent: "5",
  category: "",
  imageUrl: "" as string,
};

type EditorTab = "pricing" | "stock";
type ItemKind = "product" | "service";

export function ItemsPage({ kind = "product" }: { kind?: ItemKind }) {
  const { company } = useApp();
  const companyId = company?.id;
  const fmtMoney = (n: number) => money(n, company?.currency);
  const taxOptions = taxOptionsForCountry(company?.country);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low_stock" | "out">("all");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [qrItem, setQrItem] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editorTab, setEditorTab] = useState<EditorTab>("pricing");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: items, reload } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId, kind);
    return rows;
  }, [companyId, kind]);

  const { data: savedCategories, reload: reloadCategories } = useAsync(async () => {
    if (!companyId) return [];
    const { categories: rows } = await api.itemCategories.list(companyId);
    return rows;
  }, [companyId]);

  const [newCategory, setNewCategory] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryPopup, setCategoryPopup] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of savedCategories ?? []) {
      const cat = row.name?.trim();
      if (cat) set.add(cat);
    }
    for (const item of items ?? []) {
      const cat = item.category?.trim();
      if (cat) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items, savedCategories]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (categoryFilter && (i.category ?? "") !== categoryFilter) return false;
      if (stockFilter === "in_stock" && i.stockQty <= 0) return false;
      if (stockFilter === "out" && i.stockQty > 0) return false;
      if (stockFilter === "low_stock" && (i.stockQty <= 0 || i.stockQty > 5)) return false;
      if (!term) return true;
      return (
        i.name.toLowerCase().includes(term) ||
        i.sku?.toLowerCase().includes(term) ||
        i.category?.toLowerCase().includes(term)
      );
    });
  }, [items, q, categoryFilter, stockFilter]);

  const listPage = usePagedRows(filtered, `${kind}|${q}|${categoryFilter}|${stockFilter}`);

  function fillForm(item: Item) {
    setForm({
      name: item.name,
      sku: item.sku ?? "",
      unit: item.unit,
      salePrice: String(item.salePrice),
      purchasePrice: String(item.purchasePrice),
      stockQty: String(item.stockQty),
      taxPercent: String(item.taxPercent),
      category: item.category ?? "",
      imageUrl: item.imageUrl ?? "",
    });
  }

  function openCreate() {
    setEditing(null);
    setViewing(false);
    setForm(emptyForm);
    setNewCategory("");
    setImageError("");
    setEditorTab("pricing");
    setOpen(true);
  }

  function openView(item: Item) {
    setEditing(item);
    fillForm(item);
    setNewCategory("");
    setImageError("");
    setEditorTab("pricing");
    setViewing(true);
    setOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    fillForm(item);
    setNewCategory("");
    setImageError("");
    setEditorTab("pricing");
    setViewing(false);
    setOpen(true);
  }

  function closeEditor() {
    setOpen(false);
    setViewing(false);
  }

  async function onImagePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const imageUrl = await fileToItemImageDataUrl(file);
      setForm((prev) => ({ ...prev, imageUrl }));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setImageBusy(false);
    }
  }

  function clearImage() {
    setForm((prev) => ({ ...prev, imageUrl: "" }));
    setImageError("");
  }

  async function addCategory() {
    if (!companyId) return;
    const name = newCategory.trim();
    if (!name) return;
    setSavingCategory(true);
    try {
      const { category } = await api.itemCategories.create({ companyId, name });
      setForm((prev) => ({ ...prev, category: category.name }));
      setNewCategory("");
      setCategoryPopup(false);
      reloadCategories();
    } finally {
      setSavingCategory(false);
    }
  }

  async function persist(keepOpen: boolean) {
    if (!companyId) return;
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      unit: form.unit.trim() || "pcs",
      salePrice: Number(form.salePrice) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      stockQty: kind === "service" ? 0 : Number(form.stockQty) || 0,
      taxPercent: Number(form.taxPercent) || 0,
      category: form.category.trim() || undefined,
      itemType: kind,
      imageUrl: form.imageUrl.trim() || null,
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
      setViewing(false);
      setForm(emptyForm);
      setImageError("");
      setEditorTab("pricing");
      return;
    }
    closeEditor();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await persist(false);
  }

  if (open && viewing && editing) {
    const taxLabel =
      taxOptions.find((opt) => String(opt.value) === String(editing.taxPercent))?.label ??
      `${editing.taxPercent}%`;
    const stockStatus =
      editing.stockQty <= 0 ? "Out of stock" : editing.stockQty <= 5 ? "Low stock" : "In stock";

    return (
      <div className="full-editor item-editor item-detail-view">
        <div className="editor-heading">
          <div className="editor-heading-left">
            <h1>{kind === "service" ? "Service Details" : "Product Details"}</h1>
          </div>
          <div className="editor-icons">
            <button type="button" onClick={closeEditor} aria-label="Close">
              <X size={19} />
            </button>
          </div>
        </div>

        <div className="item-editor-form">
          <div className="item-editor-scroll">
            <div className="item-detail-hero">
              <div className={`item-detail-image${editing.imageUrl ? "" : " empty"}`}>
                {editing.imageUrl ? (
                  <img src={editing.imageUrl} alt={editing.name} />
                ) : (
                  <Camera size={28} />
                )}
              </div>
              <div className="item-detail-hero-copy">
                <h2>{editing.name}</h2>
                <p className="muted">
                  {[editing.category, editing.sku ? `SKU ${editing.sku}` : null]
                    .filter(Boolean)
                    .join(" · ") || (kind === "service" ? "Service item" : "Product item")}
                </p>
                {kind === "product" ? (
                  <span className={`item-stock-pill ${editing.stockQty <= 0 ? "out" : editing.stockQty <= 5 ? "low" : "ok"}`}>
                    {stockStatus} · {editing.stockQty} {editing.unit}
                  </span>
                ) : null}
              </div>
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
              {kind === "product" ? (
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
                  <section className="editor-section">
                    <h3>Item Info</h3>
                    <div className="item-detail-grid">
                      <div>
                        <small>Item Name</small>
                        <strong>{editing.name}</strong>
                      </div>
                      <div>
                        <small>Category</small>
                        <strong>{editing.category || "—"}</strong>
                      </div>
                      <div>
                        <small>Item Code / SKU</small>
                        <strong>{editing.sku || "—"}</strong>
                      </div>
                      <div>
                        <small>Unit</small>
                        <strong>{editing.unit}</strong>
                      </div>
                      <div>
                        <small>Item Type</small>
                        <strong>{kind === "service" ? "Service" : "Product"}</strong>
                      </div>
                      <div>
                        <small>Created</small>
                        <strong>
                          {editing.createdAt
                            ? new Date(editing.createdAt).toLocaleDateString()
                            : "—"}
                        </strong>
                      </div>
                    </div>
                  </section>

                  <section className="editor-section">
                    <h3>Sale Price</h3>
                    <div className="item-detail-grid">
                      <div>
                        <small>Sale Price</small>
                        <strong className="money">{fmtMoney(editing.salePrice)}</strong>
                      </div>
                      <div>
                        <small>Tax Rate</small>
                        <strong>{taxLabel}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="editor-section">
                    <h3>Purchase Price</h3>
                    <div className="item-detail-grid">
                      <div>
                        <small>Purchase Price</small>
                        <strong className="money">{fmtMoney(editing.purchasePrice)}</strong>
                      </div>
                      <div>
                        <small>Margin</small>
                        <strong className="money">
                          {fmtMoney(editing.salePrice - editing.purchasePrice)}
                        </strong>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <section className="editor-section full-span">
                  <h3>Stock</h3>
                  <div className="item-detail-grid">
                    <div>
                      <small>Current Quantity</small>
                      <strong>
                        {editing.stockQty} {editing.unit}
                      </strong>
                    </div>
                    <div>
                      <small>Status</small>
                      <strong>{stockStatus}</strong>
                    </div>
                    <div>
                      <small>At Price</small>
                      <strong className="money">{fmtMoney(editing.purchasePrice)}</strong>
                    </div>
                    <div>
                      <small>Stock Value</small>
                      <strong className="money">
                        {fmtMoney(editing.stockQty * editing.purchasePrice)}
                      </strong>
                    </div>
                    <div>
                      <small>Location</small>
                      <strong>Main warehouse</strong>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>

          <div className="editor-footer">
            <button className="btn btn-ghost" type="button" onClick={closeEditor}>
              Close
            </button>
            <button className="btn btn-primary" type="button" onClick={() => openEdit(editing)}>
              <Pencil size={14} /> Edit
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (open) {
    return (
      <div className="full-editor item-editor">
        <div className="editor-heading">
          <div className="editor-heading-left">
            <h1>
              {editing
                ? kind === "service"
                  ? "Edit Service"
                  : "Edit Item"
                : kind === "service"
                  ? "Add Service"
                  : "Add Item"}
            </h1>
          </div>
          <div className="editor-icons">
            <Settings size={16} />
            <button type="button" onClick={closeEditor} aria-label="Close">
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
              <div className={`image-upload${form.imageUrl ? " has-image" : ""}`}>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={(e) => void onImagePicked(e)}
                />
                {form.imageUrl ? (
                  <>
                    <img src={form.imageUrl} alt="Item" className="image-upload-preview" />
                    <div className="image-upload-actions">
                      <button
                        type="button"
                        className="link-button"
                        disabled={imageBusy}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        Change
                      </button>
                      <button type="button" className="link-button" disabled={imageBusy} onClick={clearImage}>
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="image-upload-trigger"
                    disabled={imageBusy}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Camera size={16} />
                    {imageBusy ? "Uploading…" : "Add Item Image"}
                  </button>
                )}
                {imageError ? <span className="image-upload-error">{imageError}</span> : null}
              </div>
              <label className="field">
                Category
                <select
                  value={form.category}
                  onChange={(e) => {
                    if (e.target.value === "__add__") {
                      setNewCategory("");
                      setCategoryPopup(true);
                      return;
                    }
                    setForm({ ...form, category: e.target.value });
                  }}
                >
                  <option value="">Category</option>
                  {categories.map((cat) => (
                    <option value={cat} key={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__add__">+ Add Category</option>
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
              {kind === "product" ? (
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
            <button className="btn btn-ghost" type="button" onClick={closeEditor}>
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

        {categoryPopup
          ? createPortal(
              <Modal
                nested
                className="modal-party-types"
                title="Add Category"
                onClose={() => setCategoryPopup(false)}
                footer={
                  <>
                    <button className="btn btn-ghost" type="button" onClick={() => setCategoryPopup(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={savingCategory || !newCategory.trim()}
                      onClick={() => void addCategory()}
                    >
                      Add
                    </button>
                  </>
                }
              >
                <label className="field">
                  Category name
                  <input
                    autoFocus
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. Electronics"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addCategory();
                      }
                    }}
                  />
                </label>
              </Modal>,
              document.body,
            )
          : null}
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{kind === "service" ? "Services" : "Products"}</h1>
          <p className="muted">
            {kind === "service"
              ? "Service items · sale price · tax"
              : "Item details · stock · sale & purchase price"}
          </p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <Plus size={14} /> {kind === "service" ? "Add Service" : "Add Item"}
          </button>
        </div>
      </header>

      <div className="content">
        <div className="filter-bar">
          <span className="filter-label">Filter by :</span>
          <label className="filter-pill sale-filter-select">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Category filter"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option value={cat} key={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </label>
          {kind === "product" ? (
            <label className="filter-pill sale-filter-select">
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
                aria-label="Stock filter"
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock (≤ 5)</option>
                <option value="out">Out of Stock</option>
              </select>
              <ChevronDown size={13} />
            </label>
          ) : null}
          <input
            className="search"
            placeholder="Search by name / code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginLeft: "auto" }}
          />
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Item</th>
                  <th>SKU</th>
                  {kind === "product" ? <th>Stock</th> : null}
                  <th>Sale</th>
                  <th>Purchase</th>
                  <th>Tax %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((item) => (
                  <tr key={item.id}>
                    <td className="item-thumb-cell">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="item-thumb" />
                      ) : (
                        <span className="item-thumb placeholder" aria-hidden>
                          <Camera size={14} />
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="linkish" type="button" onClick={() => openView(item)}>
                        <strong>{item.name}</strong>
                      </button>
                      {item.category ? (
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {item.category}
                        </div>
                      ) : null}
                    </td>
                    <td>{item.sku || "—"}</td>
                    {kind === "product" ? (
                      <td>
                        {item.stockQty} {item.unit}
                      </td>
                    ) : null}
                    <td className="money">{fmtMoney(item.salePrice)}</td>
                    <td className="money">{fmtMoney(item.purchasePrice)}</td>
                    <td>{item.taxPercent}%</td>
                    <td>
                      <div className="purchase-row-actions">
                        {kind === "product" ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            title="QR code"
                            onClick={() => setQrItem(item)}
                          >
                            <QrCode size={14} /> QR
                          </button>
                        ) : null}
                        <button
                          className="btn btn-ghost"
                          type="button"
                          title="View details"
                          onClick={() => openView(item)}
                        >
                          <Eye size={14} /> View
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil size={14} /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={kind === "product" ? 8 : 7}>
                      <div className="empty">
                        {kind === "service" ? "No services yet." : "No items yet."}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination pager={listPage} />
        </div>
      </div>
      {qrItem ? (
        <QrCodeModal
          kind="product"
          id={qrItem.id}
          title={qrItem.name}
          subtitle={qrItem.sku ? `SKU ${qrItem.sku}` : "No SKU"}
          onClose={() => setQrItem(null)}
        />
      ) : null}
    </>
  );
}
