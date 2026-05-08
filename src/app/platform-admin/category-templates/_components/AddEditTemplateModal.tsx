"use client";

import React, { useState, useEffect } from "react";
import {
  PlatformCategoryTemplate,
  PlatformCategoryTemplateTree,
  flattenTemplateTree,
} from "../_types/platform-category-template";

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type SavePayload = Pick<PlatformCategoryTemplate, 'name' | 'slug' | 'parentId' | 'description' | 'sortOrder'>;

interface Props {
  node: PlatformCategoryTemplate | null;
  parentId?: string | null;
  tree: PlatformCategoryTemplateTree[];
  onSave: (payload: SavePayload) => void;
  onClose: () => void;
}

const EMPTY: SavePayload = {
  name: "",
  slug: "",
  description: "",
  parentId: null,
  sortOrder: 0,
};

export default function AddEditTemplateModal({ node, parentId, tree, onSave, onClose }: Props) {
  const isEdit = !!node;
  const [form, setForm] = useState<SavePayload>(() =>
    node
      ? { name: node.name, slug: node.slug, description: node.description ?? "", parentId: node.parentId ?? null, sortOrder: node.sortOrder }
      : { ...EMPTY, parentId: parentId ?? null }
  );
  const [slugManual, setSlugManual] = useState(isEdit);

  useEffect(() => {
    if (!slugManual && !isEdit) {
      setForm(f => ({ ...f, slug: toSlug(f.name) }));
    }
  }, [form.name, slugManual, isEdit]);

  const set = <K extends keyof SavePayload>(key: K, val: SavePayload[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const parentOptions = flattenTemplateTree(tree).filter(n => {
    if (!isEdit) return true;
    return n.id !== node?.id && !n.path.startsWith((node?.path ?? "") + "/");
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
              {isEdit ? "Edit Template Node" : "New Template Node"}
            </h2>
            {isEdit && <code className="text-[11px] text-gray-400">{node.path}</code>}
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
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
            />
          </div>

          {/* Slug */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Slug <span className="text-red-500">*</span></label>
              {!slugManual && !isEdit && (
                <button onClick={() => setSlugManual(true)} className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline">Edit manually</button>
              )}
            </div>
            <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800/80 focus-within:ring-2 focus-within:ring-amber-500/30 focus-within:border-amber-400">
              <span className="text-xs text-gray-400 font-mono flex-shrink-0">/</span>
              <input
                type="text"
                value={form.slug}
                onChange={e => { setSlugManual(true); set("slug", e.target.value); }}
                className="flex-1 text-sm font-mono bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none min-w-0"
                placeholder="auto-generated"
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Globally unique across all template nodes. Used when provisioning org trees.</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Description</label>
            <textarea
              rows={2}
              value={form.description ?? ""}
              onChange={e => set("description", e.target.value)}
              placeholder="Brief description of this category…"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
          </div>

          {/* Parent + Sort Order */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Parent Node</label>
              <select
                value={form.parentId ?? ""}
                onChange={e => set("parentId", e.target.value || null)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 appearance-none"
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
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
          </div>

          {/* Note about templateVersion */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
            <span>Template nodes do not carry ProductType assignments — those are merchant-specific and set per-org after provisioning.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => isValid && onSave(form)}
            disabled={!isValid}
            className="px-5 py-2 text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm"
          >
            {isEdit ? "Save Changes" : "Create Node"}
          </button>
        </div>
      </div>
    </div>
  );
}
