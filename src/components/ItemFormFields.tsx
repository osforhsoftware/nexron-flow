import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/AppContext";
import { taxOptionsForCountry } from "../lib/companyLocale";
import { emptyItemForm, ITEM_UNITS, type ItemFormState } from "../lib/itemForm";
import { fileToItemImageDataUrl } from "../lib/itemImage";
import { useAsync } from "../lib/useAsync";
import { Modal } from "./Modal";

type EditorTab = "pricing" | "stock";

export function ItemFormFields({
  form,
  onChange,
  formId = "item-add-form",
  onSubmit,
  editorTab,
  onEditorTabChange,
  showStock = true,
  compact = false,
}: {
  form: ItemFormState;
  onChange: (next: ItemFormState) => void;
  formId?: string;
  onSubmit?: (e: FormEvent) => void;
  editorTab?: EditorTab;
  onEditorTabChange?: (tab: EditorTab) => void;
  showStock?: boolean;
  compact?: boolean;
}) {
  const { company } = useApp();
  const companyId = company?.id;
  const taxOptions = taxOptionsForCountry(company?.country);
  const [tab, setTab] = useState<EditorTab>(editorTab ?? "pricing");
  const activeTab = editorTab ?? tab;
  const setActiveTab = onEditorTabChange ?? setTab;

  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: savedCategories, reload: reloadCategories } = useAsync(async () => {
    if (!companyId) return [];
    const { categories: rows } = await api.itemCategories.list(companyId);
    return rows;
  }, [companyId]);

  const { data: items } = useAsync(async () => {
    if (!companyId) return [];
    const { items: rows } = await api.items.list(companyId);
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

  useEffect(() => {
    if (editorTab) setTab(editorTab);
  }, [editorTab]);

  function set<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  async function onImagePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const imageUrl = await fileToItemImageDataUrl(file);
      set("imageUrl", imageUrl);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setImageBusy(false);
    }
  }

  function clearImage() {
    set("imageUrl", "");
    setImageError("");
  }

  async function addCategory() {
    if (!companyId) return;
    const name = newCategory.trim();
    if (!name) return;
    setSavingCategory(true);
    try {
      const { category } = await api.itemCategories.create({ companyId, name });
      set("category", category.name);
      setNewCategory("");
      setCategoryPopup(false);
      reloadCategories();
    } finally {
      setSavingCategory(false);
    }
  }

  return (
    <>
      <form
        id={formId}
        className={`item-editor-form${compact ? " item-form-compact" : ""}`}
        onSubmit={onSubmit}
      >
        <div className="item-editor-scroll">
          <div className="item-identity-grid">
            <label className="field">
              Item Name *
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="field">
              Item HSN
              <input
                placeholder="Search HSN"
                value={form.hsn}
                onChange={(e) => set("hsn", e.target.value)}
              />
            </label>
            <label className="field unit-select-field">
              Select Unit
              <select
                className="unit-select"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              >
                {ITEM_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
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
                    <button
                      type="button"
                      className="link-button"
                      disabled={imageBusy}
                      onClick={clearImage}
                    >
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
                  set("category", e.target.value);
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
              <input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </label>
          </div>

          <div className="tabs item-editor-tabs" role="tablist">
            <button
              className={`tab${activeTab === "pricing" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "pricing"}
              onClick={() => setActiveTab("pricing")}
            >
              Pricing
            </button>
            {showStock ? (
              <button
                className={`tab${activeTab === "stock" ? " active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "stock"}
                onClick={() => setActiveTab("stock")}
              >
                Stock
              </button>
            ) : null}
          </div>

          <div className="item-editor-body" role="tabpanel">
            {activeTab === "pricing" ? (
              <>
                <section className="editor-section full-span">
                  <h3>Sale Price</h3>
                  <div className="inline-fields joined">
                    <label className="field">
                      Sale Price
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.salePrice}
                        onChange={(e) => set("salePrice", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Tax
                      <select
                        value={form.salePriceTax}
                        onChange={(e) =>
                          set("salePriceTax", e.target.value as ItemFormState["salePriceTax"])
                        }
                      >
                        <option value="without">Without Tax</option>
                        <option value="with">With Tax</option>
                      </select>
                    </label>
                    <label className="field">
                      Disc. on Sale Price
                      <input
                        placeholder="0"
                        value={form.saleDiscount}
                        onChange={(e) => set("saleDiscount", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Type
                      <select
                        value={form.saleDiscountType}
                        onChange={(e) =>
                          set(
                            "saleDiscountType",
                            e.target.value as ItemFormState["saleDiscountType"],
                          )
                        }
                      >
                        <option value="Percentage">Percentage</option>
                        <option value="Amount">Amount</option>
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
                        min="0"
                        step="any"
                        value={form.purchasePrice}
                        onChange={(e) => set("purchasePrice", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Tax
                      <select
                        value={form.purchasePriceTax}
                        onChange={(e) =>
                          set(
                            "purchasePriceTax",
                            e.target.value as ItemFormState["purchasePriceTax"],
                          )
                        }
                      >
                        <option value="without">Without Tax</option>
                        <option value="with">With Tax</option>
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
                      onChange={(e) => set("taxPercent", e.target.value)}
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
                      min="0"
                      step="any"
                      value={form.stockQty}
                      onChange={(e) => set("stockQty", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    At Price
                    <input type="number" value={form.purchasePrice} readOnly />
                  </label>
                  <label className="field">
                    As Of Date
                    <input
                      type="date"
                      value={form.asOfDate}
                      onChange={(e) => set("asOfDate", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Min Stock To Maintain
                    <input
                      type="number"
                      placeholder="0"
                      value={form.minStock}
                      onChange={(e) => set("minStock", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Location
                    <input
                      placeholder="Main warehouse"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                    />
                  </label>
                </div>
              </section>
            )}
          </div>
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
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setCategoryPopup(false)}
                  >
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
    </>
  );
}

export { emptyItemForm };
