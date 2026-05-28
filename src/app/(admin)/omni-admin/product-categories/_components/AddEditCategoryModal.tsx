"use client";

import React, { useState, useEffect } from "react";
import { ProductCategory, ProductCategoryTree, flattenTree } from "../_types/category";
import { CategoryService } from "../_services/category.service";
import { ProductTypeService } from "../../product-types/_services/product-type.service";
import type { ProductType } from "../../product-types/_types/product-type";

// ─── Icons ─────────────────────────────────────────────────────────────────────
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  category: ProductCategory | null;       // null = create new
  parentId?: string | null;               // pre-selected parent for "Add child"
  tree: ProductCategoryTree[];            // for parent picker
  orgId?: string;
  onSave: (cat: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">) => void;
  onClose: () => void;
}

const EMPTY: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt"> = {
  name: "",
  slug: "",
  description: "",
  parentId: null,
  sortOrder: 0,
  active: true,
  productTypeId: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AddEditCategoryModal({ category, parentId, tree, orgId, onSave, onClose }: Props) {
  const isEdit = !!category;
  const [form, setForm] = useState<Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">>(() =>
    category
      ? { name: category.name, slug: category.slug, description: category.description ?? "", imageUrl: category.imageUrl, parentId: category.parentId ?? null, sortOrder: category.sortOrder, active: category.active, metaTitle: category.metaTitle, metaDescription: category.metaDescription, productTypeId: category.productTypeId ?? null }
      : { ...EMPTY, parentId: parentId ?? null }
  );
  const [slugManual, setSlugManual] = useState(isEdit);

  // ProductType picker
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [ptLoading, setPtLoading] = useState(true);
  useEffect(() => {
    ProductTypeService.list({ active: true })
      .then(setProductTypes)
      .catch(() => {/* non-fatal */})
      .finally(() => setPtLoading(false));
  }, []);

  // Effective product type (inherited from ancestor when category has none directly set)
  type EffectiveType = { productTypeId: string; productTypeName: string; inheritedFrom: string | null; inheritedFromName: string | null };
  const [effectiveType, setEffectiveType] = useState<EffectiveType | null>(null);
  const [effectiveTypeLoading, setEffectiveTypeLoading] = useState(false);
  useEffect(() => {
    if (!isEdit || !category?.id) return;
    setEffectiveTypeLoading(true);
    CategoryService.getEffectiveProductType(category.id, orgId)
      .then(setEffectiveType)
      .catch(() => {/* non-fatal */})
      .finally(() => setEffectiveTypeLoading(false));
  }, [isEdit, category?.id]);

  // Auto-generate slug from name in create mode
  useEffect(() => {
    if (!slugManual && !isEdit) {
      setForm(f => ({ ...f, slug: toSlug(f.name) }));
    }
  }, [form.name, slugManual, isEdit]);

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  // Flatten tree for parent picker (exclude self and own descendants)
  const parentOptions = flattenTree(tree).filter(n => {
    if (!isEdit) return true;
    // Cannot set self or descendant as parent
    return n.id !== category?.id && !n.path.startsWith(category?.path + "/");
  });

  const isValid = form.name.trim().length > 0 && form.slug.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {isEdit ? "Edit Category" : "New Category"}
            </h2>
            {isEdit && <code className="text-[11px] text-gray-400">{category.path}</code>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="e.g. Electronics, Men's Clothing…"
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            />
          </div>

          {/* Slug */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Slug <span className="text-red-500">*</span></label>
              {!slugManual && !isEdit && (
                <button onClick={() => setSlugManual(true)} className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline">Edit manually</button>
              )}
            </div>
            <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800/80 focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-400">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0">/</span>
              <input
                type="text"
                value={form.slug}
                onChange={e => { setSlugManual(true); set("slug", e.target.value); }}
                className="flex-1 text-sm font-mono bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none min-w-0"
                placeholder="auto-generated"
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Stable URL key used by attributes and products. Avoid changing after creation.</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Description</label>
            <textarea
              rows={2}
              value={form.description ?? ""}
              onChange={e => set("description", e.target.value)}
              placeholder="Brief description shown to merchants…"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
            />
          </div>

          {/* Product Type */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                Product Type
              </label>
              {effectiveTypeLoading && (
                <span className="text-[10px] text-gray-400 animate-pulse">Resolving…</span>
              )}
            </div>

            {/* Inherited-type banner (shown when no direct assignment but ancestor has one) */}
            {isEdit && !form.productTypeId && effectiveType?.inheritedFrom && (
              <div className="mb-2 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-blue-500 dark:text-blue-400">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    Inheriting <span className="font-bold">{effectiveType.productTypeName}</span> from{" "}
                    <span className="font-semibold">{effectiveType.inheritedFromName ?? "a parent category"}</span>
                  </p>
                  <p className="text-[11px] text-blue-500/80 dark:text-blue-400/70 mt-0.5">
                    No direct assignment — type resolved from ancestor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => set("productTypeId", effectiveType.productTypeId)}
                  className="flex-shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Override
                </button>
              </div>
            )}

            <select
              value={form.productTypeId ?? ""}
              onChange={e => set("productTypeId", e.target.value || null)}
              disabled={ptLoading}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 appearance-none disabled:opacity-50"
            >
              <option value="">— No direct assignment —</option>
              {productTypes.map(pt => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>

            {/* Info box for directly-selected type */}
            {form.productTypeId && (() => {
              const selected = productTypes.find(pt => pt.id === form.productTypeId);
              if (!selected) return null;
              const dims = [...selected.variantDimensions]
                .sort((a, b) => a.order - b.order)
                .map(d => d.attributeName || d.attributeCode)
                .join(" × ");
              const isOverride = isEdit && effectiveType?.inheritedFrom && form.productTypeId !== category?.productTypeId;
              return (
                <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 text-xs text-brand-700 dark:text-brand-400">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{selected.name}</span>
                    {selected.attributeCount > 0 && <span className="ml-2 opacity-70">{selected.attributeCount} attr{selected.attributeCount !== 1 ? "s" : ""}</span>}
                    {dims && <span className="ml-2 opacity-70">· {dims}</span>}
                    {isOverride && <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">(override)</span>}
                  </div>
                  {isOverride && (
                    <button
                      type="button"
                      onClick={() => set("productTypeId", null)}
                      className="flex-shrink-0 text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Keep inherited
                    </button>
                  )}
                </div>
              );
            })()}

            <p className="mt-1 text-[11px] text-gray-400">
              Determines which attributes and variant matrix apply to products in this category.
              {isEdit && !form.productTypeId && !effectiveType?.inheritedFrom && " Leave blank to inherit from parent."}
            </p>
          </div>

          {/* Parent + Sort Order */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Parent Category</label>
              <select
                value={form.parentId ?? ""}
                onChange={e => set("parentId", e.target.value || null)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 appearance-none"
              >
                <option value="">— Root (no parent)</option>
                {parentOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {"  ".repeat(opt.level)}{opt.level > 0 ? "└ " : ""}{opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={e => set("sortOrder", Number(e.target.value))}
                min={0}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          {/* Active */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Inactive categories are hidden from product forms</p>
            </div>
            <button
              onClick={() => set("active", !form.active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.active ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* SEO (collapsed section) */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer list-none text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide py-1 hover:text-gray-700 dark:hover:text-gray-300">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><path d="m9 18 6-6-6-6"/></svg>
              SEO Metadata (optional)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Meta Title</label>
                <input type="text" value={form.metaTitle ?? ""} onChange={e => set("metaTitle", e.target.value || undefined)}
                  placeholder="Page title for search engines…"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Meta Description</label>
                <textarea rows={2} value={form.metaDescription ?? ""} onChange={e => set("metaDescription", e.target.value || undefined)}
                  placeholder="Brief summary for search engine results…"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none" />
              </div>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => isValid && onSave(form)}
            disabled={!isValid}
            className="px-5 py-2 text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm"
          >
            {isEdit ? "Save Changes" : "Create Category"}
          </button>
        </div>
      </div>
    </div>
  );
}
