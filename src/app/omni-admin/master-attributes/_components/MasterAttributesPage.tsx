"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { MasterAttribute, AttributeCategory, AttributeType, AttributeFilters } from "../_types/attribute";
import { AttributeService } from "../_services/attribute.service";
import { CategoryService } from "../../product-categories/_services/category.service";
import { ProductTypeService } from "../../product-types/_services/product-type.service";
import type { ProductType } from "../../product-types/_types/product-type";
import { AddEditAttributeModal } from "./AddEditAttributeModal";

// ─── Inline SVG icon helpers ──────────────────────────────────────────────────

const GripIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="5"  r="1.5"/><circle cx="15" cy="5"  r="1.5"/>
    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
    <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
  </svg>
);
const ChevronDownIcon = ({ className = "" }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
);
const ChevronRightIcon = ({ className = "" }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const FilterIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);
const ArrowUpDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const LayoutListIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const LayoutGroupIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/>
    <rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/>
  </svg>
);
const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const UnlockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
  </svg>
);
const PlugIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/>
    <path d="M18 8H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/>
  </svg>
);

// ─── Type config: color + icon per AttributeType ──────────────────────────────

const TYPE_CONFIG: Record<AttributeType, { label: string; bg: string; text: string; darkBg: string; darkText: string; abbr: string }> = {
  TEXT:         { label: "Text",         abbr: "Aa",  bg: "bg-blue-50",    text: "text-blue-700",    darkBg: "dark:bg-blue-500/10",    darkText: "dark:text-blue-400"    },
  LONG_TEXT:    { label: "Long Text",    abbr: "¶",   bg: "bg-violet-50",  text: "text-violet-700",  darkBg: "dark:bg-violet-500/10",  darkText: "dark:text-violet-400"  },
  NUMBER:       { label: "Number",       abbr: "#",   bg: "bg-emerald-50", text: "text-emerald-700", darkBg: "dark:bg-emerald-500/10", darkText: "dark:text-emerald-400" },
  DECIMAL:      { label: "Decimal",      abbr: "0.0", bg: "bg-teal-50",    text: "text-teal-700",    darkBg: "dark:bg-teal-500/10",    darkText: "dark:text-teal-400"    },
  BOOLEAN:      { label: "Boolean",      abbr: "✓",   bg: "bg-amber-50",   text: "text-amber-700",   darkBg: "dark:bg-amber-500/10",   darkText: "dark:text-amber-400"   },
  SELECT:       { label: "Select",       abbr: "▾",   bg: "bg-purple-50",  text: "text-purple-700",  darkBg: "dark:bg-purple-500/10",  darkText: "dark:text-purple-400"  },
  MULTI_SELECT: { label: "Multi-Select", abbr: "☑",   bg: "bg-pink-50",    text: "text-pink-700",    darkBg: "dark:bg-pink-500/10",    darkText: "dark:text-pink-400"    },
  DATE:         { label: "Date",         abbr: "📅",  bg: "bg-cyan-50",    text: "text-cyan-700",    darkBg: "dark:bg-cyan-500/10",    darkText: "dark:text-cyan-400"    },
  DATE_RANGE:   { label: "Date Range",   abbr: "↔",   bg: "bg-sky-50",     text: "text-sky-700",     darkBg: "dark:bg-sky-500/10",     darkText: "dark:text-sky-400"     },
  COLOR:        { label: "Color",        abbr: "◉",   bg: "bg-rose-50",    text: "text-rose-700",    darkBg: "dark:bg-rose-500/10",    darkText: "dark:text-rose-400"    },
  URL:          { label: "URL",          abbr: "🔗",  bg: "bg-sky-50",     text: "text-sky-700",     darkBg: "dark:bg-sky-500/10",     darkText: "dark:text-sky-400"     },
  IMAGE_URL:    { label: "Image URL",    abbr: "🖼",  bg: "bg-orange-50",  text: "text-orange-700",  darkBg: "dark:bg-orange-500/10",  darkText: "dark:text-orange-400"  },
  TAGS:         { label: "Tags",         abbr: "⚑",   bg: "bg-lime-50",    text: "text-lime-700",    darkBg: "dark:bg-lime-500/10",    darkText: "dark:text-lime-400"    },
};

// ─── Section config ───────────────────────────────────────────────────────────

// Actual section values returned by backend
const SECTION_ORDER = [
  "product_info", "pricing_inventory", "variants", "shipping",
  "media", "publishing", "tax", "channel",
];

const SECTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  product_info:       { label: "Product Info",       icon: "📝", color: "#3b82f6" },
  pricing_inventory:  { label: "Pricing & Inventory", icon: "💰", color: "#10b981" },
  variants:           { label: "Variants",            icon: "🔀", color: "#ec4899" },
  shipping:           { label: "Shipping",            icon: "🚚", color: "#0ea5e9" },
  media:              { label: "Media",               icon: "🖼",  color: "#8b5cf6" },
  publishing:         { label: "Publishing",          icon: "📢", color: "#6366f1" },
  tax:                { label: "Tax",                 icon: "🧾", color: "#f59e0b" },
  channel:            { label: "Channel",             icon: "📡", color: "#6366f1" },
  "":                 { label: "General",             icon: "📋", color: "#6b7280" },
};

function getSectionCfg(section: string | undefined) {
  const key = (section ?? "").toLowerCase();
  return SECTION_CONFIG[key] ?? SECTION_CONFIG[""];
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  attribute,
  onConfirm,
  onCancel,
}: {
  attribute: MasterAttribute;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === attribute.name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
            <TrashIcon />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">Delete Attribute</h2>
            <p className="text-xs text-red-500/80 dark:text-red-500 mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            You are about to permanently delete{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{attribute.name}</span>
            {attribute.usageCount > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {" "}which is used in <strong>{attribute.usageCount}</strong> product{attribute.usageCount !== 1 ? "s" : ""}
              </span>
            )}
            . Deleting it may break existing product data.
          </div>

          {/* Attribute info card */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${(TYPE_CONFIG[attribute.type] ?? TYPE_CONFIG["TEXT"]).bg} ${(TYPE_CONFIG[attribute.type] ?? TYPE_CONFIG["TEXT"]).text}`}>
              {(TYPE_CONFIG[attribute.type] ?? TYPE_CONFIG["TEXT"]).abbr}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{attribute.name}</p>
              <code className="text-xs text-gray-400">{attribute.code}</code>
            </div>
          </div>

          {/* Type-to-confirm input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Type <span className="font-bold text-gray-900 dark:text-white">{attribute.name}</span> to confirm deletion
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={attribute.name}
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
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
            <TrashIcon /> Delete Attribute
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Attribute Preview Panel ───────────────────────────────────────────────────

function AttributePreviewPanel({ attribute, onClose }: { attribute: MasterAttribute; onClose: () => void }) {
  const [value, setValue] = useState<string | boolean | string[]>(
    attribute.type === "BOOLEAN" ? false :
    attribute.type === "MULTI_SELECT" || attribute.type === "TAGS" ? [] : ""
  );

  const renderField = () => {
    switch (attribute.type) {
      case "TEXT":
      case "URL":
      case "IMAGE_URL":
        return (
          <input
            type="text"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            placeholder={attribute.placeholder ?? `Enter ${attribute.name?.toLowerCase() ?? "value"}...`}
            value={value as string}
            onChange={e => setValue(e.target.value)}
          />
        );
      case "LONG_TEXT":
        return (
          <textarea
            rows={3}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none"
            placeholder={attribute.placeholder ?? `Enter ${attribute.name?.toLowerCase() ?? "value"}...`}
            value={value as string}
            onChange={e => setValue(e.target.value)}
          />
        );
      case "NUMBER":
      case "DECIMAL":
        return (
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-400">
            <input
              type="number"
              className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              placeholder={attribute.placeholder ?? "0"}
              value={value as string}
              onChange={e => setValue(e.target.value)}
            />
          </div>
        );
      case "BOOLEAN":
        return (
          <button
            onClick={() => setValue(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${value ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        );
      case "SELECT":
        return (
          <select
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 appearance-none"
            value={value as string}
            onChange={e => setValue(e.target.value)}
          >
            <option value="">Select {attribute.name}...</option>
            {attribute.options?.map(o => (
              <option key={o.id} value={o.value}>{o.label}</option>
            ))}
          </select>
        );
      case "MULTI_SELECT":
        return (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 min-h-[80px] bg-white dark:bg-gray-900">
            <div className="flex flex-wrap gap-1 mb-2">
              {(value as string[]).map(v => {
                const opt = attribute.options?.find(o => o.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-1 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 text-xs rounded-md px-2 py-0.5">
                    {opt?.label ?? v}
                    <button onClick={() => setValue(prev => (prev as string[]).filter(x => x !== v))}><XIcon /></button>
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1">
              {attribute.options?.filter(o => !(value as string[]).includes(o.value)).map(o => (
                <button
                  key={o.id}
                  onClick={() => setValue(prev => [...(prev as string[]), o.value])}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-0.5 text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
                >
                  + {o.label}
                </button>
              ))}
            </div>
          </div>
        );
      case "COLOR":
        return (
          <div className="flex items-center gap-3">
            <input type="color" className="h-10 w-16 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer p-1 bg-white dark:bg-gray-900" />
            <input type="text" placeholder="#000000" className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
        );
      case "DATE":
        return (
          <input type="date" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400" />
        );
      case "TAGS":
        return (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 min-h-[60px] bg-white dark:bg-gray-900">
            <div className="flex flex-wrap gap-1 mb-1">
              {(value as string[]).map(t => (
                <span key={t} className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-md px-2 py-0.5">
                  {t}
                  <button onClick={() => setValue(prev => (prev as string[]).filter(x => x !== t))}><XIcon /></button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder={attribute.placeholder ?? "Type and press Enter..."}
              className="text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none w-full"
              onKeyDown={e => {
                if (e.key === "Enter" && e.currentTarget.value) {
                  setValue(prev => [...(prev as string[]), e.currentTarget.value]);
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
        );
      default:
        return <input type="text" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none" />;
    }
  };

  const cfg = TYPE_CONFIG[attribute.type] ?? TYPE_CONFIG["TEXT"];

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Field Preview</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
          <XIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Attribute identity */}
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${cfg.bg} ${cfg.text} ${cfg.darkBg} ${cfg.darkText}`}>
            {cfg.abbr}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{attribute.name}</h3>
            <code className="text-xs text-gray-400 dark:text-gray-500">{attribute.code}</code>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.text} ${cfg.darkBg} ${cfg.darkText}`}>{cfg.label}</span>
              {attribute.required && <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">Required</span>}
              {attribute.scope === "GLOBAL" && <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Global</span>}
            </div>
          </div>
        </div>

        {/* Simulated product form preview */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">As it appears in product form</span>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {attribute.name}
              {attribute.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            {attribute.description && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 leading-relaxed">{attribute.description.slice(0, 100)}{attribute.description.length > 100 ? "..." : ""}</p>
            )}
            {renderField()}
            {attribute.maxLength && (
              <p className="mt-1 text-xs text-gray-400">Max {attribute.maxLength} characters</p>
            )}
          </div>
        </div>

        {/* Channel mappings preview */}
        {attribute.channelMappings && attribute.channelMappings.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Channel Mappings</h4>
            <div className="space-y-1.5">
              {attribute.channelMappings.map(m => (
                <div key={m.channelType} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{m.channelLabel}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">→</span>
                    <code className="text-brand-600 dark:text-brand-400">{m.channelFieldName}</code>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      m.transform === "DIRECT" ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400" :
                      m.transform === "MAP"    ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                                                 "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                    }`}>{m.transform}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Properties */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Properties</h4>
          <div className="space-y-1.5">
            {[
              { label: "Required",        val: attribute.required },
              { label: "Channel Override", val: attribute.isChannelOverridable },
              { label: "Variant Override", val: attribute.isVariantChannelOverridable },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className={`h-4 w-4 rounded flex items-center justify-center flex-shrink-0 ${p.val ? "bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}>
                  {p.val ? <CheckIcon /> : <XIcon />}
                </span>
                {p.label}
              </div>
            ))}
            {attribute.displayLevel && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="text-gray-400">Level:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{attribute.displayLevel}</span>
              </div>
            )}
            {attribute.appliesTo && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="text-gray-400">Applies to:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{attribute.appliesTo}</span>
              </div>
            )}
          </div>
        </div>

        {/* Usage stat */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400 dark:text-gray-500">Used in products</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{attribute.usageCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Attribute List Item ───────────────────────────────────────────────────────

interface AttributeListItemProps {
  attribute: MasterAttribute;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  categories: AttributeCategory[];
  showSection?: boolean;   // flat mode: show section badge on the card
  reorderMode?: boolean;   // drag-drop only active when reorder mode is on
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onEdit: (attr: MasterAttribute) => void;
  onDelete: (id: string) => void;
  onInsertAfter?: () => void;
  // drag
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

function AttributeListItem({
  attribute, index, isExpanded, isSelected, categories,
  showSection = false, reorderMode = false,
  onToggleExpand, onSelect, onEdit, onDelete, onInsertAfter,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
}: AttributeListItemProps) {
  const cfg = TYPE_CONFIG[attribute.type] ?? TYPE_CONFIG["TEXT"];
  const assignedCategories = categories.filter(c => attribute.categoryIds.includes(c.id));

  return (
    <div
      draggable={reorderMode}
      onDragStart={reorderMode ? () => onDragStart(index) : undefined}
      onDragOver={reorderMode ? e => onDragOver(e, index) : undefined}
      onDrop={reorderMode ? e => onDrop(e, index) : undefined}
      onDragEnd={reorderMode ? onDragEnd : undefined}
      className={`
        group/item rounded-xl border transition-all duration-150 overflow-hidden
        ${reorderMode && isDragging ? "opacity-40 scale-[0.98]" : "opacity-100"}
        ${reorderMode && isDragOver ? "border-brand-400 shadow-lg shadow-brand-500/10 ring-2 ring-brand-400/20" : "border-gray-200 dark:border-gray-700/60"}
        ${isSelected ? "ring-2 ring-brand-400/30 border-brand-300 dark:border-brand-500/40" : ""}
        bg-white dark:bg-gray-800/40 hover:bg-gray-50/50 dark:hover:bg-gray-800/70
        hover:border-gray-300 dark:hover:border-gray-600
        hover:shadow-sm
      `}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle — only shown/active in reorder mode */}
        <div className={`flex-shrink-0 transition-colors opacity-0 group-hover/item:opacity-100 ${
          reorderMode
            ? "cursor-grab active:cursor-grabbing text-amber-400 dark:text-amber-500 hover:text-amber-600 dark:hover:text-amber-400"
            : "cursor-not-allowed text-gray-200 dark:text-gray-700"
        }`} title={reorderMode ? "Drag to reorder" : "Enable reorder mode to drag"}>
          <GripIcon />
        </div>

        {/* Position badge */}
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[11px] font-bold flex items-center justify-center">
          {attribute.sortOrder}
        </span>

        {/* Type badge */}
        <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${cfg.bg} ${cfg.text} ${cfg.darkBg} ${cfg.darkText}`} title={cfg.label}>
          {cfg.abbr}
        </span>

        {/* Name + code */}
        <div className="flex-1 min-w-0" onClick={() => onToggleExpand(attribute.id)} style={{ cursor: "pointer" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">{attribute.name}</span>
            {attribute.required && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 uppercase tracking-wide">
                Required
              </span>
            )}
            {attribute.scope === "GLOBAL" ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                Global
              </span>
            ) : (
              assignedCategories.slice(0, 2).map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: c.color + "18", color: c.color }}>
                  {c.icon ? <span>{c.icon}</span> : (
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  )}
                  {c.name}
                </span>
              ))
            )}
            {attribute.scope === "CATEGORY_SPECIFIC" && assignedCategories.length > 2 && (
              <span className="text-[10px] text-gray-400">+{assignedCategories.length - 2}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <code className="text-[11px] text-gray-400 dark:text-gray-500">{attribute.code}</code>
            <span className={`text-[11px] font-medium ${cfg.text} ${cfg.darkText}`}>{cfg.label}</span>
          </div>
        </div>

        {/* Meta chips */}
        <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
          {showSection && attribute.section && (() => {
            const sc = getSectionCfg(attribute.section);
            return (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: sc.color + "18", color: sc.color }}
                title={`Section: ${sc.label}`}
              >
                {sc.icon} {sc.label}
              </span>
            );
          })()}
          {attribute.displayLevel && attribute.displayLevel !== "basic" && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
              attribute.displayLevel === "essential"        ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
              attribute.displayLevel === "enhanced"         ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" :
              attribute.displayLevel === "advanced"         ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
              attribute.displayLevel === "category-specific"? "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" :
              "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
            }`} title={`Display level: ${attribute.displayLevel}`}>
              {attribute.displayLevel}
            </span>
          )}
          {attribute.supportedChannels && attribute.supportedChannels.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" title={`Channels: ${attribute.supportedChannels.join(", ")}`}>
              {attribute.supportedChannels.length} ch
            </span>
          )}
          {attribute.isChannelOverridable && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400" title="Channel overridable">
              Override
            </span>
          )}
        </div>

        {/* Usage count */}
        <div className="hidden xl:flex flex-col items-end flex-shrink-0 min-w-[52px]">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{attribute.usageCount.toLocaleString()}</span>
          <span className="text-[10px] text-gray-400">products</span>
        </div>

        {/* Status dot */}
        <div className="flex-shrink-0">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
            attribute.status === "ACTIVE"   ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400" :
            attribute.status === "DRAFT"    ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                                              "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              attribute.status === "ACTIVE" ? "bg-green-500" :
              attribute.status === "DRAFT"  ? "bg-amber-500" : "bg-gray-400"
            }`} />
            {attribute.status}
          </span>
        </div>

        {/* Action buttons — preview only; edit/delete/insert live in the expanded panel */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
          <button
            onClick={() => onSelect(attribute.id)}
            title="Preview"
            className="p-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/10 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            <EyeIcon />
          </button>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => onToggleExpand(attribute.id)}
          className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronDownIcon className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Expanded Detail Panel */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/20 px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Col 1: Description + Options */}
            <div className="space-y-3">
              {attribute.description && (
                <div>
                  <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Description</h5>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{attribute.description}</p>
                </div>
              )}

              {/* Validation info */}
              {(attribute.maxLength || attribute.minValue !== undefined || attribute.maxValue !== undefined) && (
                <div>
                  <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Validation</h5>
                  <div className="space-y-0.5">
                    {attribute.maxLength && <p className="text-xs text-gray-500 dark:text-gray-400">Max length: <strong className="text-gray-700 dark:text-gray-300">{attribute.maxLength} chars</strong></p>}
                    {attribute.minValue !== undefined && <p className="text-xs text-gray-500 dark:text-gray-400">Min: <strong className="text-gray-700 dark:text-gray-300">{attribute.minValue}</strong></p>}
                    {attribute.maxValue !== undefined && <p className="text-xs text-gray-500 dark:text-gray-400">Max: <strong className="text-gray-700 dark:text-gray-300">{attribute.maxValue}</strong></p>}
                  </div>
                </div>
              )}

              {/* Options for SELECT/MULTI_SELECT */}
              {attribute.options && attribute.options.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                    Options <span className="text-gray-400">({attribute.options.length})</span>
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {attribute.options.map(o => (
                      <span key={o.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                        {o.color && <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: o.color }} />}
                        {o.label}
                      </span>
                    ))}
                    {attribute.optionsSource === "MERCHANT_API" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md border border-dashed border-indigo-300 dark:border-indigo-500/40 text-indigo-500 dark:text-indigo-400 italic">
                        merchant API
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Col 2: Channel Mappings */}
            <div>
              <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                Channel Mappings
                {attribute.channelMappings && attribute.channelMappings.length > 0 && (
                  <span className="ml-1 text-gray-400">({attribute.channelMappings.length})</span>
                )}
              </h5>
              {attribute.channelMappings && attribute.channelMappings.length > 0 ? (
                <div className="space-y-1">
                  {attribute.channelMappings.map(m => (
                    <div key={m.channelType} className="flex items-center justify-between text-[11px] bg-white dark:bg-gray-700/50 rounded-lg px-2 py-1.5 border border-gray-100 dark:border-gray-700">
                      <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{m.channelLabel}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-gray-400">→</span>
                        <code className="text-brand-600 dark:text-brand-400 truncate max-w-[80px]">{m.channelFieldName}</code>
                        <span className={`text-[9px] uppercase font-bold px-1 py-0.5 rounded ${
                          m.transform === "DIRECT" ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400" :
                          m.transform === "MAP"    ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                                                     "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                        }`}>{m.transform}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No channel mappings configured</p>
              )}
            </div>

            {/* Col 3: Properties */}
            <div className="space-y-3">
              <div>
                <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Properties</h5>
                <div className="space-y-1">
                  {[
                    { label: "Required",          val: attribute.required },
                    { label: "Channel Override",  val: attribute.isChannelOverridable },
                    { label: "Variant Override",  val: attribute.isVariantChannelOverridable },
                  ].map(p => (
                    <div key={p.label} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className={`h-3.5 w-3.5 rounded flex items-center justify-center flex-shrink-0 ${p.val ? "text-green-500" : "text-gray-300 dark:text-gray-600"}`}>
                        {p.val ? <CheckIcon /> : <XIcon />}
                      </span>
                      {p.label}
                    </div>
                  ))}
                  {attribute.appliesTo && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="text-gray-400">Applies to:</span>
                      <span className="capitalize font-medium">{attribute.appliesTo}</span>
                    </div>
                  )}
                  {attribute.variantScope && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="text-gray-400">Variant scope:</span>
                      <span className="capitalize font-medium">{attribute.variantScope.replace("_", " ")}</span>
                    </div>
                  )}
                  {attribute.displayLevel && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                      <span className="text-gray-400">Display level:</span>
                      <span className="capitalize font-medium">{attribute.displayLevel}</span>
                    </div>
                  )}
                </div>
                {attribute.supportedChannels && attribute.supportedChannels.length > 0 && (
                  <div className="mt-2">
                    <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Supported Channels</h5>
                    <div className="flex flex-wrap gap-1">
                      {attribute.supportedChannels.map(ch => (
                        <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 capitalize">{ch}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Action footer ────────────────────────────────────────────────────── */}
          <div className="mt-4 pt-3 border-t border-gray-200/70 dark:border-gray-700/40 flex items-center justify-between">
            {/* Left: primary actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(attribute)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white transition-colors shadow-sm"
              >
                <EditIcon /> Edit
              </button>
              <button
                onClick={() => onSelect(attribute.id)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <EyeIcon /> Preview
              </button>
            </div>

            {/* Right: contextual actions */}
            <div className="flex items-center gap-1">
              {onInsertAfter && (
                <button
                  onClick={onInsertAfter}
                  title="Insert a new attribute after this one"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <PlusIcon /> Insert after
                </button>
              )}
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
              <button
                onClick={() => onDelete(attribute.id)}
                title="Delete this attribute"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <TrashIcon /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MasterAttributesPage() {
  const [attributes, setAttributes] = useState<MasterAttribute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null); // attribute being saved/deleted
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [filters, setFilters] = useState<AttributeFilters>({
    search: "", categoryId: "all", productTypeId: "all", status: "all", type: "all", required: "all",
    sortField: "sortOrder", sortDir: "asc",
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<MasterAttribute | null>(null);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [showFilterBar, setShowFilterBar] = useState(false);

  // Drag state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Category sidebar collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Phase 4: sidebar mode — "productType" | "category"
  const [sidebarMode, setSidebarMode] = useState<"productType" | "category">("productType");
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [ptLoading, setPtLoading] = useState(true);
  const [ptError, setPtError] = useState(false);

  // View mode: flat list vs grouped by section
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Tab: master attributes vs channel fields
  const [activeTab, setActiveTab] = useState<"master" | "channel">("master");

  // Reorder mode — drag is disabled until explicitly enabled
  const [reorderMode, setReorderMode] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MasterAttribute | null>(null);

  const [categories, setCategories] = useState<AttributeCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catsError, setCatsError] = useState(false);

  // Level → accent color
  const CAT_LEVEL_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#6b7280"];

  const loadCats = useCallback(() => {
    setCatsLoading(true);
    setCatsError(false);
    CategoryService.getSlugs()
      .then(slugs => {
        setCategories(
          slugs
            .sort((a, b) => a.path.localeCompare(b.path))
            .map(s => ({
              id:    s.id,
              name:  s.name,
              icon:  "",
              color: CAT_LEVEL_COLORS[s.level] ?? CAT_LEVEL_COLORS[CAT_LEVEL_COLORS.length - 1],
              level: s.level,
              path:  s.path,
              attributeCount: 0,
            }))
        );
      })
      .catch(() => setCatsError(true))
      .finally(() => setCatsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadCats(); }, [loadCats]);

  const loadProductTypes = useCallback(() => {
    setPtLoading(true);
    setPtError(false);
    ProductTypeService.list()
      .then(setProductTypes)
      .catch(() => setPtError(true))
      .finally(() => setPtLoading(false));
  }, []);

  useEffect(() => { loadProductTypes(); }, [loadProductTypes]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    AttributeService.listAttributes()
      .then(data => {
        if (process.env.NODE_ENV === "development") {
          console.log("[MasterAttributesPage] mapped attributes:", data);
          if (data.length > 0) console.log("[MasterAttributesPage] first item:", data[0]);
        }
        if (!cancelled) setAttributes(data);
      })
      .catch(err => { if (!cancelled) setLoadError(String(err?.message ?? err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Split by isChannelField
  const masterAttributes  = useMemo(() => attributes.filter(a => !a.isChannelField), [attributes]);
  const channelAttributes = useMemo(() => attributes.filter(a =>  a.isChannelField), [attributes]);

  // ── Phase 2: path-inheritance subtree sets ─────────────────────────────────
  // For each category, precompute the Set of IDs that belong to it OR any descendant,
  // using materialized-path prefix matching (e.g. "electronics" matches "electronics/smartphones").
  // This lets sidebar clicks on a parent category show attrs assigned to any child too.
  const categorySubtreeIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of categories) {
      if (!cat.path) continue;
      const prefix = cat.path + "/";
      const ids = new Set(
        categories
          .filter(c => c.path === cat.path || c.path?.startsWith(prefix))
          .map(c => c.id)
      );
      map.set(cat.id, ids);
    }
    return map;
  }, [categories]);

  // ── Filtered & sorted attribute list ─────────────────────────────────────────
  const filteredAttributes = useMemo(() => {
    // Work from the correct tab's source
    let list = [...(activeTab === "channel" ? channelAttributes : masterAttributes)];

    // Phase 4: ProductType filter (mutually exclusive with category filter)
    if (filters.productTypeId !== "all") {
      if (filters.productTypeId === "unassigned") {
        list = list.filter(a => a.productTypeIds.length === 0);
      } else {
        list = list.filter(a => a.productTypeIds.includes(filters.productTypeId));
      }
    } else {
      // Category filter — Phase 2: exact match OR any descendant via path-prefix subtree
      if (filters.categoryId === "unassigned") {
        list = list.filter(a => a.categoryIds.length === 0 && a.scope === "CATEGORY_SPECIFIC");
      } else if (filters.categoryId !== "all") {
        const subtreeIds = categorySubtreeIds.get(filters.categoryId);
        if (subtreeIds) {
          list = list.filter(a => a.scope === "GLOBAL" || a.categoryIds.some(id => subtreeIds.has(id)));
        } else {
          list = list.filter(a => a.scope === "GLOBAL" || a.categoryIds.includes(filters.categoryId));
        }
      }
    }

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q)
      );
    }

    // Status
    if (filters.status !== "all") list = list.filter(a => a.status === filters.status);

    // Type
    if (filters.type !== "all") list = list.filter(a => a.type === filters.type);

    // Required
    if (filters.required !== "all") list = list.filter(a => a.required === filters.required);

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (filters.sortField === "sortOrder") cmp = a.sortOrder - b.sortOrder;
      else if (filters.sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (filters.sortField === "type") cmp = a.type.localeCompare(b.type);
      else if (filters.sortField === "usageCount") cmp = a.usageCount - b.usageCount;
      return filters.sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [masterAttributes, channelAttributes, activeTab, filters, categorySubtreeIds]);

  // Category attribute counts (master tab only) — Phase 2: counts include descendants
  const categoryCounts = useMemo(() => {
    const src = masterAttributes;
    const counts: Record<string, number> = { all: src.length, unassigned: 0 };
    for (const cat of categories) {
      const subtreeIds = categorySubtreeIds.get(cat.id);
      counts[cat.id] = subtreeIds
        ? src.filter(a => a.scope === "GLOBAL" || a.categoryIds.some(id => subtreeIds.has(id))).length
        : src.filter(a => a.scope === "GLOBAL" || a.categoryIds.includes(cat.id)).length;
    }
    counts.unassigned = src.filter(a => a.scope === "CATEGORY_SPECIFIC" && a.categoryIds.length === 0).length;
    return counts;
  }, [masterAttributes, categories, categorySubtreeIds]);

  // Phase 4: ProductType attribute counts (master tab only)
  const productTypeCounts = useMemo(() => {
    const src = masterAttributes;
    const counts: Record<string, number> = { all: src.length, unassigned: 0 };
    for (const pt of productTypes) {
      counts[pt.id] = src.filter(a => a.productTypeIds.includes(pt.id)).length;
    }
    counts.unassigned = src.filter(a => a.productTypeIds.length === 0).length;
    return counts;
  }, [masterAttributes, productTypes]);

  // Attributes grouped by section (used in grouped view mode)
  const groupedAttributes = useMemo(() => {
    const map = new Map<string, MasterAttribute[]>();
    for (const attr of filteredAttributes) {
      const key = (attr.section ?? "").toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(attr);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ai = SECTION_ORDER.indexOf(a);
      const bi = SECTION_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      if (!a) return 1;   // unsectioned always last
      if (!b) return -1;
      return a.localeCompare(b);
    });
  }, [filteredAttributes]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSelectPreview = useCallback((id: string) => {
    if (!id) return; // guard: empty/undefined id would make previewId falsy and break lookup
    setPreviewId(prev => (prev === id ? null : id));
  }, []);

  const handleEdit = (attr: MasterAttribute) => {
    setEditingAttribute(attr);
    setShowModal(true);
  };

  // Opens confirmation modal — actual delete runs in confirmDelete
  const handleDelete = (id: string) => {
    const attr = attributes.find(a => a.id === id);
    if (attr) setDeleteTarget(attr);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    setAttributes(prev => prev.filter(a => a.id !== id));
    if (previewId === id) setPreviewId(null);
    setSavingId(id);
    try {
      await AttributeService.deleteAttribute(id);
    } catch (err) {
      setLoadError(`Delete failed: ${(err as Error).message}`);
      AttributeService.listAttributes().then(setAttributes).catch(() => {});
    } finally {
      setSavingId(null);
    }
  };

  const handleInsertAt = (index: number) => {
    setInsertAtIndex(index);
    setEditingAttribute(null);
    setShowModal(true);
  };

  const handleModalSave = async (attr: MasterAttribute) => {
    setShowModal(false);
    // Snapshot the original for targeted rollback (before any state changes)
    const originalAttribute = editingAttribute;
    setSavingId(attr.id);
    try {
      const { id, usageCount, createdAt, updatedAt, createdBy, updatedBy, ...payload } = attr;
      let saved: MasterAttribute;

      if (originalAttribute) {
        // Guard: can't update without a valid id
        if (!id) throw new Error("Attribute has no id — cannot update");

        // Optimistic update — show user's edits immediately
        setAttributes(prev => prev.map(a => a.id === id ? attr : a));

        // Persist to backend
        saved = await AttributeService.updateAttribute(id, payload);

        // PUT succeeded. Keep the user's edited values as source of truth.
        // Only pick server-managed timestamps from the response so we don't
        // overwrite user edits with a stale pre-flush snapshot from Spring Boot.
        setAttributes(prev => prev.map(a =>
          a.id === id
            ? {
                ...attr,
                updatedAt: (saved.updatedAt && saved.updatedAt !== "") ? saved.updatedAt : attr.updatedAt,
                updatedBy: saved.updatedBy ?? attr.updatedBy,
              }
            : a
        ));
      } else {
        // Determine insertion position
        const insertPos = insertAtIndex !== null ? insertAtIndex + 1 : attributes.length;
        const withOrder = { ...payload, sortOrder: insertPos + 1 };
        saved = await AttributeService.createAttribute(withOrder);
        setAttributes(prev => {
          const next = [...prev];
          next.splice(insertPos, 0, saved);
          return next.map((a, i) => ({ ...a, sortOrder: i + 1 }));
        });
      }
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      setLoadError(`Save failed: ${message}`);
      // Precise rollback: revert only the attribute that failed, not the entire list.
      // This avoids a full refetch blowing away any other in-flight optimistic updates.
      if (originalAttribute) {
        setAttributes(prev => prev.map(a => a.id === originalAttribute.id ? originalAttribute : a));
      }
    } finally {
      setSavingId(null);
      setEditingAttribute(null);
      setInsertAtIndex(null);
    }
  };

  // Drag and drop reorder
  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    // Optimistic reorder
    let reordered: MasterAttribute[] = [];
    setAttributes(prev => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, removed);
      reordered = next.map((a, i) => ({ ...a, sortOrder: i + 1 }));
      return reordered;
    });
    dragIndexRef.current = null;
    setDragOverIndex(null);
    // Persist to backend (workaround — see reorderAttributes recommendation)
    AttributeService.reorderAttributes(reordered).catch(err => {
      setLoadError(`Reorder failed: ${(err as Error).message}`);
      AttributeService.listAttributes().then(setAttributes).catch(() => {});
    });
  };
  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const previewAttribute = previewId !== null
    ? (attributes.find(a => a.id === previewId) ?? null)
    : null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* ── Left: Sidebar (ProductType or Category filter) ─────────────────── */}
      <aside className={`flex-shrink-0 border-r border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 flex flex-col transition-all duration-300 overflow-hidden ${sidebarCollapsed ? "w-12" : "w-60"}`}>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-3.5 border-b border-gray-100 dark:border-gray-700/50">
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 flex gap-0.5 rounded-lg bg-gray-100 dark:bg-gray-700/60 p-0.5">
              <button
                onClick={() => { setSidebarMode("productType"); setFilters(f => ({ ...f, productTypeId: "all", categoryId: "all" })); }}
                className={`flex-1 text-[11px] font-medium py-1 px-1.5 rounded-md transition-colors truncate ${sidebarMode === "productType" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}
              >By Type</button>
              <button
                onClick={() => { setSidebarMode("category"); setFilters(f => ({ ...f, productTypeId: "all", categoryId: "all" })); }}
                className={`flex-1 text-[11px] font-medium py-1 px-1.5 rounded-md transition-colors truncate ${sidebarMode === "category" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}
              >By Category</button>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors"
            title={sidebarCollapsed ? "Expand" : "Collapse"}
          >
            <ChevronRightIcon className={`transition-transform duration-200 ${sidebarCollapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* Nav — scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {/* ── Fixed top: All + Unassigned ─────────────────────────── */}
          <div className="py-1.5 border-b border-gray-100 dark:border-gray-700/40">
            {/* All */}
            <button
              type="button"
              onClick={() => sidebarMode === "productType"
                ? setFilters(f => ({ ...f, productTypeId: "all" }))
                : setFilters(f => ({ ...f, categoryId: "all" }))}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors cursor-pointer ${
                (sidebarMode === "productType" ? filters.productTypeId : filters.categoryId) === "all"
                  ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <span className={`flex-shrink-0 w-2 h-2 rounded-full ${
                (sidebarMode === "productType" ? filters.productTypeId : filters.categoryId) === "all" ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
              }`} />
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">All Attributes</span>
                  <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {(sidebarMode === "productType" ? productTypeCounts : categoryCounts)["all"] ?? 0}
                  </span>
                </>
              )}
            </button>

            {/* Unassigned */}
            <button
              type="button"
              onClick={() => sidebarMode === "productType"
                ? setFilters(f => ({ ...f, productTypeId: "unassigned" }))
                : setFilters(f => ({ ...f, categoryId: "unassigned" }))}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors cursor-pointer ${
                (sidebarMode === "productType" ? filters.productTypeId : filters.categoryId) === "unassigned"
                  ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <span className={`flex-shrink-0 w-2 h-2 rounded-full ${
                (sidebarMode === "productType" ? filters.productTypeId : filters.categoryId) === "unassigned"
                  ? "bg-amber-500" : "bg-amber-300 dark:bg-amber-500/40"
              }`} />
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">Unassigned</span>
                  {((sidebarMode === "productType" ? productTypeCounts : categoryCounts)["unassigned"] ?? 0) > 0 && (
                    <span className="flex-shrink-0 text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full tabular-nums">
                      {(sidebarMode === "productType" ? productTypeCounts : categoryCounts)["unassigned"]}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>

          {/* ── ProductType list (sidebarMode === "productType") ──────── */}
          {sidebarMode === "productType" && (
            <div className="py-1">
              {ptLoading ? (
                !sidebarCollapsed ? (
                  <div className="px-3 py-2 space-y-2">
                    {[75, 60, 80, 55].map((w, i) => (
                      <div key={i} className="flex items-center gap-2 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                        <div className="h-3 rounded bg-gray-200 dark:bg-gray-700" style={{ width: `${w}%` }} />
                      </div>
                    ))}
                  </div>
                ) : null
              ) : ptError ? (
                !sidebarCollapsed ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[11px] text-red-500 dark:text-red-400 mb-1">Failed to load</p>
                    <button type="button" onClick={loadProductTypes} className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline">Retry</button>
                  </div>
                ) : null
              ) : productTypes.length === 0 ? (
                !sidebarCollapsed ? (
                  <div className="px-3 py-5 text-center">
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">No product types yet.</p>
                    <Link href="/omni-admin/product-types" className="mt-2 inline-block text-[11px] text-brand-600 dark:text-brand-400 hover:underline">
                      Create types →
                    </Link>
                  </div>
                ) : null
              ) : (
                productTypes.map(pt => {
                  const isActive = filters.productTypeId === pt.id;
                  const dims = pt.variantDimensions.sort((a, b) => a.order - b.order).map(d => d.attributeCode).join("×");
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => setFilters(f => ({ ...f, productTypeId: pt.id }))}
                      title={sidebarCollapsed ? pt.name : (dims ? `${pt.name} (${dims})` : pt.name)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                        isActive
                          ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${isActive ? "bg-brand-500" : "bg-violet-300 dark:bg-violet-500/50"}`} />
                      {!sidebarCollapsed && (
                        <>
                          <span className="flex-1 text-left font-medium truncate">{pt.name}</span>
                          <span className={`flex-shrink-0 text-[10px] tabular-nums ${isActive ? "opacity-80" : "text-gray-400 dark:text-gray-500"}`}>
                            {productTypeCounts[pt.id] ?? 0}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* ── Category list (sidebarMode === "category") ────────────── */}
          {sidebarMode === "category" && <div className="py-1">
            {catsLoading ? (
              /* Loading skeleton */
              !sidebarCollapsed ? (
                <div className="px-3 py-2 space-y-2">
                  {[80, 60, 70, 55, 65].map((w, i) => (
                    <div key={i} className="flex items-center gap-2 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                      <div className="h-3 rounded bg-gray-200 dark:bg-gray-700" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-3 px-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  ))}
                </div>
              )
            ) : catsError ? (
              /* Error state */
              !sidebarCollapsed ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-[11px] text-red-500 dark:text-red-400 mb-1">Failed to load</p>
                  <button
                    type="button"
                    onClick={loadCats}
                    className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                  >Retry</button>
                </div>
              ) : (
                <div className="flex justify-center py-3">
                  <span className="text-red-400 text-xs">!</span>
                </div>
              )
            ) : categories.length === 0 ? (
              /* Empty state */
              !sidebarCollapsed ? (
                <div className="px-3 py-5 text-center">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
                    No categories yet.<br />Set them up first.
                  </p>
                  <Link
                    href="/omni-admin/product-categories"
                    className="mt-2 inline-block text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Create categories →
                  </Link>
                </div>
              ) : null
            ) : (
              /* Category tree — indented by level */
              categories.map(cat => {
                const level = cat.level ?? 0;
                const isActive = filters.categoryId === cat.id;
                const leftPad = sidebarCollapsed ? 14 : 12 + level * 12;
                // Phase 2: detect whether this category has descendants in the tree
                const subtreeSize = categorySubtreeIds.get(cat.id)?.size ?? 1;
                const hasDescendants = subtreeSize > 1;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilters(f => ({ ...f, categoryId: cat.id }))}
                    title={
                      sidebarCollapsed
                        ? `${cat.name}${cat.path ? ` (${cat.path})` : ""}${hasDescendants ? ` — includes ${subtreeSize - 1} subcategor${subtreeSize - 1 === 1 ? "y" : "ies"}` : ""}`
                        : isActive && hasDescendants
                          ? `Showing ${cat.name} and ${subtreeSize - 1} subcategor${subtreeSize - 1 === 1 ? "y" : "ies"}`
                          : undefined
                    }
                    className={`w-full flex items-center gap-2 py-1.5 pr-3 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? "font-semibold"
                        : level === 0
                          ? "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    }`}
                    style={{
                      paddingLeft: leftPad,
                      ...(isActive ? { background: cat.color + "18", color: cat.color } : {}),
                    }}
                  >
                    {/* Tree guide line for children */}
                    {level > 0 && !sidebarCollapsed && (
                      <span className="flex-shrink-0 w-3 border-l border-b border-gray-200 dark:border-gray-700 rounded-bl"
                        style={{ height: 10, marginTop: -2 }} />
                    )}
                    {/* Color dot */}
                    <span
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width:  level === 0 ? 7 : 5,
                        height: level === 0 ? 7 : 5,
                        background: cat.color + (isActive ? "" : level === 0 ? "aa" : "66"),
                      }}
                    />
                    {!sidebarCollapsed && (
                      <>
                        <span className={`flex-1 text-left truncate ${level === 0 ? "font-medium" : ""}`}>
                          {cat.name}
                        </span>
                        {/* Count badge — when active and spanning descendants, show subtree indicator */}
                        {isActive && hasDescendants ? (
                          <span className="flex-shrink-0 text-[10px] font-medium tabular-nums opacity-80">
                            {categoryCounts[cat.id] ?? 0}
                            <span className="ml-0.5 opacity-60">⊃</span>
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                            {categoryCounts[cat.id] ?? 0}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>}
        </div>

        {/* Footer — manage link (contextual) */}
        <div className={`flex-shrink-0 border-t border-gray-100 dark:border-gray-700/50 ${sidebarCollapsed ? "p-1.5" : "px-2 py-2.5"}`}>
          {sidebarMode === "productType" ? (
            <Link
              href="/omni-admin/product-types"
              title="Manage product types"
              className={`flex items-center gap-2 rounded-lg text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors ${
                sidebarCollapsed ? "justify-center p-1.5" : "px-2 py-1.5"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/>
                <rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/>
              </svg>
              {!sidebarCollapsed && <span>Manage Product Types</span>}
            </Link>
          ) : (
            <Link
              href="/omni-admin/product-categories"
              title="Manage product categories"
              className={`flex items-center gap-2 rounded-lg text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors ${
                sidebarCollapsed ? "justify-center p-1.5" : "px-2 py-1.5"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                <path d="M2 10h20"/>
              </svg>
              {!sidebarCollapsed && <span>Manage Categories</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* ── Center: Main Content ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Page header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/60 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Master Attributes</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Define product attributes for omnichannel sync
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative hidden md:block">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
                <input
                  type="text"
                  placeholder="Search attributes..."
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  className="pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 w-56"
                />
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilterBar(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
                  showFilterBar
                    ? "bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-500/10 dark:border-brand-500/30 dark:text-brand-400"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <FilterIcon /> Filters
              </button>

              {/* Import */}
              <button className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Import CSV
              </button>

              {/* Add attribute */}
              <button
                onClick={() => { setEditingAttribute(null); setInsertAtIndex(null); setShowModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors shadow-sm shadow-brand-500/20"
              >
                <PlusIcon /> Add Attribute
              </button>
            </div>
          </div>

          {/* Filter bar */}
          {showFilterBar && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center gap-3 flex-wrap">
              <select
                value={filters.type}
                onChange={e => setFilters(f => ({ ...f, type: e.target.value as AttributeType | "all" }))}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
              >
                <option value="all">All Types</option>
                {(Object.keys(TYPE_CONFIG) as AttributeType[]).map(t => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
              <select
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value as "all" | "ACTIVE" | "INACTIVE" | "DRAFT" }))}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <select
                value={String(filters.required)}
                onChange={e => setFilters(f => ({ ...f, required: e.target.value === "all" ? "all" : e.target.value === "true" }))}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
              >
                <option value="all">Required: All</option>
                <option value="true">Required only</option>
                <option value="false">Optional only</option>
              </select>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-gray-400">Sort:</span>
                <select
                  value={filters.sortField}
                  onChange={e => setFilters(f => ({ ...f, sortField: e.target.value as "sortOrder" | "name" | "type" | "usageCount" | "updatedAt" }))}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                >
                  <option value="sortOrder">Position</option>
                  <option value="name">Name</option>
                  <option value="type">Type</option>
                  <option value="usageCount">Usage</option>
                </select>
                <button
                  onClick={() => setFilters(f => ({ ...f, sortDir: f.sortDir === "asc" ? "desc" : "asc" }))}
                  className="p-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  title={`Sort ${filters.sortDir === "asc" ? "descending" : "ascending"}`}
                >
                  <ArrowUpDownIcon />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Tab strip ──────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/60 px-6 flex items-end gap-0">
          <button
            onClick={() => { setActiveTab("master"); setFilters(f => ({ ...f, categoryId: "all" })); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "master"
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <span className="text-base leading-none">📦</span>
            Master Attributes
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
              activeTab === "master"
                ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            }`}>{masterAttributes.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab("channel"); setFilters(f => ({ ...f, categoryId: "all" })); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "channel"
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <PlugIcon />
            Channel Fields
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
              activeTab === "channel"
                ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            }`}>{channelAttributes.length}</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-700/30 px-6 py-2.5 flex items-center gap-4">
          <span className="text-xs text-gray-400">{filteredAttributes.length} attribute{filteredAttributes.length !== 1 ? "s" : ""}</span>

          <div className="ml-auto flex items-center gap-3">
            {/* Reorder mode toggle */}
            {viewMode === "flat" && (
              <button
                onClick={() => setReorderMode(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                  reorderMode
                    ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 shadow-sm"
                    : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                title={reorderMode ? "Lock reordering" : "Unlock reordering"}
              >
                {reorderMode ? <UnlockIcon /> : <LockIcon />}
                <span className="hidden sm:inline">{reorderMode ? "Reorder On" : "Reorder"}</span>
              </button>
            )}
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" title="List layout">
              <button
                onClick={() => setViewMode("flat")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                  viewMode === "flat"
                    ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                title="Flat list"
              >
                <LayoutListIcon />
                <span className="hidden sm:inline">Flat</span>
              </button>
              <button
                onClick={() => setViewMode("grouped")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  viewMode === "grouped"
                    ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                title="Group by section"
              >
                <LayoutGroupIcon />
                <span className="hidden sm:inline">By Section</span>
              </button>
            </div>
          </div>
        </div>

        {/* Attribute list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Error banner */}
          {loadError && (
            <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              <div className="flex-1">
                <span className="font-medium">Error: </span>{loadError}
              </div>
              <button onClick={() => setLoadError(null)} className="flex-shrink-0 hover:opacity-70 transition-opacity">
                <XIcon />
              </button>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 px-4 py-3 flex items-center gap-3 animate-pulse">
                  <div className="h-3.5 w-3.5 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-700/50" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-700/50" />
                  <div className="h-5 w-14 rounded-full bg-gray-100 dark:bg-gray-700/50" />
                </div>
              ))}
            </div>
          ) : filteredAttributes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">📦</div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">No attributes found</h3>
              <p className="text-sm text-gray-400 mt-1">
                {filters.search ? `No results for "${filters.search}"` : "Add your first attribute to get started"}
              </p>
              <button
                onClick={() => { setEditingAttribute(null); setShowModal(true); }}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
              >
                <PlusIcon /> Add Attribute
              </button>
            </div>
          ) : viewMode === "grouped" ? (
            /* ── Grouped by section ───────────────────────────────────────── */
            <div className="space-y-5">
              {groupedAttributes.map(([sectionKey, sectionAttrs]) => {
                const sc = getSectionCfg(sectionKey);
                const isCollapsed = collapsedSections.has(sectionKey);
                const toggleSection = () =>
                  setCollapsedSections(prev => {
                    const next = new Set(prev);
                    next.has(sectionKey) ? next.delete(sectionKey) : next.add(sectionKey);
                    return next;
                  });

                return (
                  <div key={sectionKey || "__general__"}>
                    {/* Section header */}
                    <button
                      onClick={toggleSection}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl mb-2 text-left transition-colors hover:opacity-90"
                      style={{ background: sc.color + "12" }}
                    >
                      <span className="text-base leading-none">{sc.icon}</span>
                      <span className="font-semibold text-sm" style={{ color: sc.color }}>{sc.label}</span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full ml-0.5"
                        style={{ background: sc.color + "22", color: sc.color }}
                      >
                        {sectionAttrs.length}
                      </span>
                      <ChevronDownIcon
                        className={`ml-auto transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>

                    {/* Attributes in this section */}
                    {!isCollapsed && (
                      <div className="space-y-2 pl-1">
                        {sectionAttrs.map(attr => {
                          const globalIndex = filteredAttributes.indexOf(attr);
                          return (
                            <AttributeListItem
                              key={attr.id}
                              attribute={attr}
                              index={globalIndex}
                              isExpanded={expandedIds.has(attr.id)}
                              isSelected={previewId === attr.id}

                              categories={categories}
                              showSection={false}
                              reorderMode={false}
                              onToggleExpand={handleToggleExpand}
                              onSelect={handleSelectPreview}

                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              isDragging={false}
                              isDragOver={false}
                              onDragStart={handleDragStart}
                              onDragOver={handleDragOver}
                              onDrop={handleDrop}
                              onDragEnd={handleDragEnd}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Flat list ────────────────────────────────────────────────── */
            <div className="space-y-1.5">
              {filteredAttributes.map((attr, index) => (
                <AttributeListItem
                  key={attr.id ?? `attr-${index}`}
                  attribute={attr}
                  index={index}
                  isExpanded={expandedIds.has(attr.id)}
                  isSelected={previewId === attr.id}
                  categories={categories}
                  showSection={true}
                  reorderMode={reorderMode}
                  onToggleExpand={handleToggleExpand}
                  onSelect={handleSelectPreview}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onInsertAfter={() => handleInsertAt(index)}
                  isDragging={dragIndexRef.current === index}
                  isDragOver={dragOverIndex === index}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          ) /* end list render */}
        </div>
      </main>

      {/* ── Right: Preview Panel ──────────────────────────────────────────────── */}
      {previewAttribute && (
        <aside className="flex-shrink-0 w-80 border-l border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 overflow-hidden flex flex-col">
          <AttributePreviewPanel
            attribute={previewAttribute}
            onClose={() => setPreviewId(null)}
          />
        </aside>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <AddEditAttributeModal
          attribute={editingAttribute}
          productTypes={productTypes}
          onSave={handleModalSave}
          onClose={() => { setShowModal(false); setEditingAttribute(null); setInsertAtIndex(null); }}
        />
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirmModal
          attribute={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

    </div>
  );
}
