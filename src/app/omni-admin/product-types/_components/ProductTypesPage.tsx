"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ProductType, VariantDimension } from "../_types/product-type";
import { ProductTypeService } from "../_services/product-type.service";
import SkuMatrixPreview from "../../../../modules/ecommerce-product-v2/step1-create/components/SkuMatrixPreview";

// ─── Icons ──────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const LayersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
);

const LinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const DragHandleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none"/>
  </svg>
);

const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ─── Slug generator ────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  type,
  onConfirm,
  onCancel,
}: {
  type: ProductType;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === type.name.trim();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
            <TrashIcon />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">Delete Product Type</h2>
            <p className="text-xs text-red-500/80 dark:text-red-500 mt-0.5">This action cannot be undone</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            You are about to permanently delete{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{type.name}</span>.
          </p>
          {type.attributeCount > 0 && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">
              <AlertIcon />
              <p>This type is referenced by <strong>{type.attributeCount}</strong> attribute{type.attributeCount !== 1 ? "s" : ""}. The backend may reject this deletion.</p>
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{type.name}</p>
              <code className="text-[11px] text-gray-400">{type.slug}</code>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Type <span className="font-bold text-gray-900 dark:text-white">{type.name}</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={type.name}
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              confirmed
                ? "bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20"
                : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit Modal ────────────────────────────────────────────────────────────

interface AddEditModalProps {
  type: ProductType | null;
  allTypes: ProductType[];
  onSave: (
    pt: Omit<ProductType, "id" | "attributeCount" | "createdAt" | "updatedAt" | "inheritFromTypeName">
  ) => Promise<void>;
  onClose: () => void;
}

function AddEditModal({ type, allTypes, onSave, onClose }: AddEditModalProps) {
  const isCreate = type === null;

  const [name, setName] = useState(type?.name ?? "");
  const [slug, setSlug] = useState(type?.slug ?? "");
  const [slugLocked, setSlugLocked] = useState(!isCreate);
  const [description, setDescription] = useState(type?.description ?? "");
  const [inheritFromTypeId, setInheritFromTypeId] = useState<string>(
    type?.inheritFromTypeId ?? ""
  );
  const [dimensions, setDimensions] = useState<VariantDimension[]>(
    type?.variantDimensions ?? []
  );
  const [active, setActive] = useState(type?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name in create mode
  useEffect(() => {
    if (isCreate && !slugLocked) {
      setSlug(generateSlug(name));
    }
  }, [name, isCreate, slugLocked]);

  const isValid = name.trim().length > 0 && slug.trim().length > 0;

  // Eligible parent types: all active types except the type being edited
  const eligibleParents = useMemo(
    () => allTypes.filter(t => t.active && t.id !== (type?.id ?? "")),
    [allTypes, type]
  );

  const addDimension = () => {
    setDimensions(prev => [
      ...prev,
      { attributeCode: "", attributeName: "", order: prev.length + 1, required: true },
    ]);
  };

  const removeDimension = (idx: number) => {
    setDimensions(prev =>
      prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, order: i + 1 }))
    );
  };

  const updateDimension = (idx: number, patch: Partial<VariantDimension>) => {
    setDimensions(prev =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        inheritFromTypeId: inheritFromTypeId || null,
        variantDimensions: dimensions.map((d, i) => ({ ...d, order: i + 1 })),
        active,
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <LayersIcon />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-gray-900 dark:text-white">
                {isCreate ? "New Product Type" : `Edit — ${type.name}`}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isCreate ? "Create a new type to group related master attributes" : "Update type definition"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
              <AlertIcon />
              <p>{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Smartphone"
              required
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            />
          </div>

          {/* Slug */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Slug <span className="text-red-500">*</span>
              </label>
              {isCreate && (
                <button
                  type="button"
                  onClick={() => setSlugLocked(v => !v)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {slugLocked ? "Auto-generate" : "Edit manually"}
                </button>
              )}
            </div>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              readOnly={isCreate && !slugLocked}
              placeholder="e.g. smartphone"
              required
              className={`w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 ${
                isCreate && !slugLocked ? "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-default" : ""
              }`}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this product type…"
              rows={3}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 resize-none"
            />
          </div>

          {/* Inherits from */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Inherits from <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={inheritFromTypeId}
              onChange={e => setInheritFromTypeId(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            >
              <option value="">— None —</option>
              {eligibleParents.map(pt => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Attributes of the parent type will be inherited by this type.
            </p>
          </div>

          {/* Variant Dimensions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Variant Dimensions</span>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Define the SKU matrix axes (e.g. Color × Storage)
                </p>
              </div>
              <button
                type="button"
                onClick={addDimension}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/40 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
              >
                <PlusIcon /> Add dimension
              </button>
            </div>

            {dimensions.length === 0 ? (
              <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-6 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No dimensions yet — click "Add dimension" to define SKU axes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {dimensions.map((dim, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"
                  >
                    {/* Drag handle (non-functional visual) */}
                    <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 cursor-grab">
                      <DragHandleIcon />
                    </span>

                    {/* Order badge */}
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-4 text-center flex-shrink-0">
                      {idx + 1}
                    </span>

                    {/* Attribute code */}
                    <input
                      type="text"
                      value={dim.attributeCode}
                      onChange={e => updateDimension(idx, { attributeCode: e.target.value })}
                      placeholder="code (e.g. color)"
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/40 focus:border-indigo-400"
                    />

                    {/* Attribute name */}
                    <input
                      type="text"
                      value={dim.attributeName}
                      onChange={e => updateDimension(idx, { attributeName: e.target.value })}
                      placeholder="label (e.g. Color)"
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/40 focus:border-indigo-400"
                    />

                    {/* Required toggle */}
                    <button
                      type="button"
                      onClick={() => updateDimension(idx, { required: !dim.required })}
                      title={dim.required ? "Required — click to make optional" : "Optional — click to make required"}
                      className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                        dim.required
                          ? "bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-400"
                          : "bg-gray-100 border-gray-200 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {dim.required ? <><CheckIcon /> Req</> : "Opt"}
                    </button>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeDimension(idx)}
                      className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SKU Matrix Preview — static demo using placeholder options */}
          {dimensions.length > 0 && dimensions.some(d => d.attributeCode || d.attributeName) && (() => {
            const SAMPLE_OPTIONS = ["Option A", "Option B", "Option C"];
            const validDims = dimensions.filter(d => d.attributeCode || d.attributeName);
            const previewDims = validDims.map(d => ({
              name: d.attributeCode || "dim",
              label: d.attributeName || d.attributeCode || "Dimension",
              selectedOptions: SAMPLE_OPTIONS.slice(0, 2),
            }));
            const totalSkus = previewDims.reduce((acc, _) => acc * 2, 1);
            return (
              <div>
                <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1.5">
                  Matrix preview <span className="font-normal">(using 2 sample options per dimension)</span>
                </p>
                <SkuMatrixPreview dimensions={previewDims} totalSkus={totalSkus} />
              </div>
            );
          })()}

          {/* Active toggle */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Active</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                Inactive types are hidden from selection in categories
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActive(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                active ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  active ? "translate-x-4.5" : "translate-x-0.5"
                }`}
                style={{ transform: active ? "translateX(19px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              isValid && !saving
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
                : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>{isCreate ? <PlusIcon /> : <EditIcon />} {isCreate ? "Create" : "Save changes"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProductType Card ──────────────────────────────────────────────────────────

interface ProductTypeCardProps {
  type: ProductType;
  savingId: string | null;
  onEdit: (t: ProductType) => void;
  onToggleActive: (t: ProductType) => void;
  onDelete: (t: ProductType) => void;
}

function ProductTypeCard({ type, savingId, onEdit, onToggleActive, onDelete }: ProductTypeCardProps) {
  const isSaving = savingId === type.id;

  const dimensionPreview = useMemo(() => {
    if (type.variantDimensions.length === 0) return null;
    return [...type.variantDimensions]
      .sort((a, b) => a.order - b.order)
      .map(d => d.attributeName || d.attributeCode)
      .join(" × ");
  }, [type.variantDimensions]);

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border transition-all duration-150 overflow-hidden ${
        isSaving ? "opacity-60 pointer-events-none" : ""
      } ${
        type.active
          ? "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md"
          : "bg-gray-50 dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/40 opacity-60"
      }`}
    >
      {/* Card header stripe */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-400 to-purple-400 opacity-60" />

      <div className="flex flex-col flex-1 px-5 py-4 gap-3">
        {/* Top row: name + active toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className={`font-bold text-base leading-tight ${type.active ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
              {type.name}
            </h3>
            <code className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5 block">{type.slug}</code>
          </div>

          {/* Active/Inactive pill */}
          <button
            onClick={() => onToggleActive(type)}
            title={type.active ? "Click to deactivate" : "Click to activate"}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${
              type.active
                ? "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30 hover:bg-green-100 dark:hover:bg-green-500/20"
                : "bg-gray-100 border-gray-200 dark:bg-gray-700/50 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${type.active ? "bg-green-500" : "bg-gray-400 dark:bg-gray-500"}`} />
            <span className={`text-[11px] font-semibold ${type.active ? "text-green-700 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
              {type.active ? "Active" : "Inactive"}
            </span>
          </button>
        </div>

        {/* Description */}
        {type.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
            {type.description}
          </p>
        )}

        {/* Inherits from */}
        {type.inheritFromTypeId && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
            <LinkIcon />
            <span>Inherits from:</span>
            <span className="font-medium text-gray-600 dark:text-gray-400">
              {type.inheritFromTypeName ?? type.inheritFromTypeId}
            </span>
          </div>
        )}

        {/* Variant dimensions */}
        <div className="flex items-center gap-2">
          {dimensionPreview ? (
            <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 px-2 py-0.5 rounded-md">
              {dimensionPreview}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">No variants</span>
          )}
        </div>

        {/* Footer: attr count + actions */}
        <div className="flex items-center justify-between gap-2 pt-1 mt-auto border-t border-gray-100 dark:border-gray-700/50">
          {/* Attribute count badge */}
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            type.attributeCount > 0
              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
              : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
          }`}>
            {type.attributeCount} attr{type.attributeCount !== 1 ? "s" : ""}
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(type)}
              title="Edit"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <EditIcon />
            </button>
            <button
              onClick={() => onDelete(type)}
              title="Delete"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden"
          style={{ opacity: 1 - (i - 1) * 0.15 }}
        >
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-gray-100 dark:bg-gray-700/50 rounded-full animate-pulse" />
            </div>
            <div className="h-8 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
            <div className="h-5 w-24 bg-gray-100 dark:bg-gray-700/50 rounded-md animate-pulse" />
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700/50">
              <div className="h-4 w-14 bg-gray-100 dark:bg-gray-700/50 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-4 text-indigo-500 dark:text-indigo-400">
        <LayersIcon />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No product types yet</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
        Create your first product type to bridge categories and master attributes.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-sm"
      >
        <PlusIcon /> Create first type
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductTypesPage() {
  const [types, setTypes] = useState<ProductType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<ProductType | null>(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<ProductType | null>(null);

  // Toolbar
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadTypes = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await ProductTypeService.list();
      setTypes(data);
    } catch (err) {
      setLoadError((err as Error).message ?? String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  // ── Toast ────────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Stats ────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total: types.length,
    active: types.filter(t => t.active).length,
  }), [types]);

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return types.filter(t => {
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.slug.includes(q) || (t.description ?? "").toLowerCase().includes(q);
      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" ? t.active : !t.active);
      return matchesSearch && matchesActive;
    });
  }, [types, searchQuery, activeFilter]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────────

  const handleOpenAdd = useCallback(() => {
    setEditingType(null);
    setShowModal(true);
  }, []);

  const handleOpenEdit = useCallback((t: ProductType) => {
    setEditingType(t);
    setShowModal(true);
  }, []);

  const handleToggleActive = useCallback(async (t: ProductType) => {
    setSavingId(t.id);
    // Optimistic update
    setTypes(prev => prev.map(pt => pt.id === t.id ? { ...pt, active: !pt.active } : pt));
    try {
      await ProductTypeService.setActive(t.id, !t.active);
      showToast(`"${t.name}" ${t.active ? "deactivated" : "activated"}`);
    } catch (err) {
      // Rollback
      setTypes(prev => prev.map(pt => pt.id === t.id ? { ...pt, active: t.active } : pt));
      showToast((err as Error).message, "err");
    } finally {
      setSavingId(null);
    }
  }, [showToast]);

  const handleModalSave = async (
    pt: Omit<ProductType, "id" | "attributeCount" | "createdAt" | "updatedAt" | "inheritFromTypeName">
  ) => {
    setShowModal(false);
    try {
      if (editingType) {
        const updated = await ProductTypeService.update(editingType.id, pt);
        setTypes(prev => prev.map(t => t.id === editingType.id ? updated : t));
        showToast(`"${pt.name}" updated`);
      } else {
        const created = await ProductTypeService.create(pt);
        setTypes(prev => [...prev, created]);
        showToast(`"${pt.name}" created`);
      }
    } catch (err) {
      showToast((err as Error).message, "err");
    }
  };

  const handleDelete = useCallback((t: ProductType) => {
    setDeleteTarget(t);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setSavingId(target.id);
    try {
      await ProductTypeService.delete(target.id);
      setTypes(prev => prev.filter(t => t.id !== target.id));
      showToast(`"${target.name}" deleted`);
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setSavingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center flex-shrink-0 text-indigo-600 dark:text-indigo-400">
              <LayersIcon />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Product Types</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isLoading
                  ? "Loading…"
                  : `${stats.total} type${stats.total !== 1 ? "s" : ""} · ${stats.active} active`}
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl transition-colors shadow-sm shadow-indigo-600/20"
          >
            <PlusIcon /> New Product Type
          </button>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 px-6 py-3 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name, slug or description…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>

        {/* Active filter */}
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(["all", "active", "inactive"] as const).map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeFilter === f
                  ? "bg-indigo-600 text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Count label */}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <main className="px-6 py-6 max-w-5xl mx-auto">
        {/* Error banner */}
        {loadError && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
            <AlertIcon />
            <div>
              <p className="font-medium">Failed to load product types</p>
              <p className="text-xs mt-0.5 text-red-500/80">{loadError}</p>
            </div>
            <button onClick={loadTypes} className="ml-auto text-xs underline flex-shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && <LoadingSkeleton />}

        {/* Empty state — no types at all */}
        {!isLoading && !loadError && types.length === 0 && (
          <EmptyState onAdd={handleOpenAdd} />
        )}

        {/* No results from filter */}
        {!isLoading && !loadError && types.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No types match your search</p>
            <button
              onClick={() => { setSearchQuery(""); setActiveFilter("all"); }}
              className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Grid of cards */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(t => (
              <ProductTypeCard
                key={t.id}
                type={t}
                savingId={savingId}
                onEdit={handleOpenEdit}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "ok"
              ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
              : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400"
          }`}
        >
          {toast.type === "ok" ? "✓" : <AlertIcon />}
          {toast.msg}
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────────── */}
      {showModal && (
        <AddEditModal
          type={editingType}
          allTypes={types}
          onSave={handleModalSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirmModal
          type={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
