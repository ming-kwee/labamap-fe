"use client";

import React, { useState, useEffect } from "react";
import { MasterAttribute, AttributeType, AttributeStatus, AttributeOption, DisplayLevel, AppliesTo, VariantScope } from "../_types/attribute";
import type { ProductType } from "../../product-types/_types/product-type";

// ─── Inline icons ──────────────────────────────────────────────────────────────
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const GripIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
    <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
  </svg>
);

// ─── Type groups for picker ───────────────────────────────────────────────────
const TYPE_GROUPS = [
  {
    label: "Text",
    types: [
      { value: "TEXT" as AttributeType,      label: "Short Text",    desc: "Single line",         abbr: "Aa",  color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-500/10"    },
      { value: "LONG_TEXT" as AttributeType, label: "Long Text",     desc: "Multi-line textarea", abbr: "¶",   color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10" },
      { value: "TAGS" as AttributeType,      label: "Tags",          desc: "Free-form tag input", abbr: "⚑",   color: "text-lime-600 dark:text-lime-400",     bg: "bg-lime-50 dark:bg-lime-500/10"    },
      { value: "URL" as AttributeType,       label: "URL",           desc: "Web link",            abbr: "🔗",  color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-50 dark:bg-sky-500/10"      },
    ],
  },
  {
    label: "Numeric",
    types: [
      { value: "NUMBER" as AttributeType,    label: "Integer",       desc: "Whole number",        abbr: "#",   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
      { value: "DECIMAL" as AttributeType,   label: "Decimal",       desc: "Floating point",      abbr: "0.0", color: "text-teal-600 dark:text-teal-400",      bg: "bg-teal-50 dark:bg-teal-500/10"      },
    ],
  },
  {
    label: "Choice",
    types: [
      { value: "SELECT" as AttributeType,       label: "Single Select", desc: "Pick one option",     abbr: "▾",  color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-500/10" },
      { value: "MULTI_SELECT" as AttributeType, label: "Multi-Select",  desc: "Pick multiple",       abbr: "☑",  color: "text-pink-600 dark:text-pink-400",    bg: "bg-pink-50 dark:bg-pink-500/10"    },
      { value: "BOOLEAN" as AttributeType,      label: "Yes / No",      desc: "Toggle switch",       abbr: "✓",  color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-500/10"  },
    ],
  },
  {
    label: "Other",
    types: [
      { value: "DATE" as AttributeType,      label: "Date",          desc: "Calendar date",       abbr: "📅", color: "text-cyan-600 dark:text-cyan-400",   bg: "bg-cyan-50 dark:bg-cyan-500/10"   },
      { value: "COLOR" as AttributeType,     label: "Color",         desc: "Color picker",        abbr: "◉",  color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-50 dark:bg-rose-500/10"   },
      { value: "IMAGE_URL" as AttributeType, label: "Image URL",     desc: "Image link",          abbr: "🖼", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10" },
    ],
  },
];

type Step = "basic" | "config" | "assignment";

interface Props {
  attribute: MasterAttribute | null;
  productTypes?: ProductType[];
  onSave: (attr: MasterAttribute) => void;
  onClose: () => void;
}

function generateId() {
  return `attr_${Date.now().toString(36)}`;
}

function toCode(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const EMPTY_ATTRIBUTE: Omit<MasterAttribute, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  code: "",
  description: "",
  type: "TEXT",
  scope: "GLOBAL",
  required: false,
  sortOrder: 0,
  displayLevel: "basic",
  appliesTo: "both",
  variantScope: "product_only",
  isChannelField: false,
  isChannelOverridable: true,
  isVariantChannelOverridable: false,
  supportedChannels: [],
  optionsSource: "STATIC",
  maxLength: undefined,
  placeholder: "",
  options: [],
  categoryIds: [],
  productTypeIds: [],
  channelMappings: [],
  status: "ACTIVE",
  usageCount: 0,
};

export function AddEditAttributeModal({ attribute, productTypes = [], onSave, onClose }: Props) {
  const isEdit = !!attribute;
  const [step, setStep] = useState<Step>("basic");
  const [form, setForm] = useState<Omit<MasterAttribute, "id" | "createdAt" | "updatedAt">>(() =>
    attribute ? { ...attribute } : { ...EMPTY_ATTRIBUTE }
  );
  const [newOption, setNewOption] = useState("");
  const [nameEdited, setNameEdited] = useState(false);

  useEffect(() => {
    if (!nameEdited && !isEdit) {
      setForm(f => ({ ...f, code: toCode(f.name) }));
    }
  }, [form.name, nameEdited, isEdit]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    const opt: AttributeOption = {
      id: `o_${Date.now()}`,
      value: toCode(newOption.trim()),
      label: newOption.trim(),
      sortOrder: (form.options?.length ?? 0) + 1,
    };
    set("options", [...(form.options ?? []), opt]);
    setNewOption("");
  };

  const removeOption = (id: string) => {
    set("options", (form.options ?? []).filter(o => o.id !== id));
  };

  const handleSave = () => {
    const now = new Date().toISOString();
    const result: MasterAttribute = {
      ...form,
      id: attribute?.id ?? generateId(),
      createdAt: attribute?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(result);
  };

  const isValid = form.name.trim().length > 0 && form.code.trim().length > 0;
  const needsOptions = form.type === "SELECT" || form.type === "MULTI_SELECT";

  const STEPS: { id: Step; label: string; desc: string }[] = [
    { id: "basic",      label: "1. Basic Info",    desc: "Name, type, description" },
    { id: "config",     label: "2. Configuration", desc: "Type-specific settings" },
    { id: "assignment", label: "3. Assignment",     desc: "Categories & properties" },
  ];

  const currentStepIndex = STEPS.findIndex(s => s.id === step);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {isEdit ? "Edit Attribute" : "New Master Attribute"}
            </h2>
            {isEdit && (
              <code className="text-xs text-gray-400 dark:text-gray-500">{attribute.code}</code>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <XIcon />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex-1 px-4 py-3 text-left transition-colors relative ${
                s.id === step
                  ? "bg-brand-50 dark:bg-brand-500/10"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className={`text-xs font-semibold ${s.id === step ? "text-brand-700 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
                {s.label}
              </div>
              <div className={`text-[11px] mt-0.5 ${s.id === step ? "text-brand-600 dark:text-brand-400" : "text-gray-400"}`}>
                {s.desc}
              </div>
              {s.id === step && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1: Basic Info ─────────────────────────────────────────── */}
          {step === "basic" && (
            <>
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Attribute Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => { set("name", e.target.value); }}
                  placeholder="e.g. Product Color, Warranty Period..."
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                />
              </div>

              {/* System Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  System Code <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 font-mono">
                    {form.code || <span className="text-gray-300 dark:text-gray-600">auto-generated</span>}
                  </code>
                  <button
                    onClick={() => { setNameEdited(true); }}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
                  >
                    Edit
                  </button>
                </div>
                {nameEdited && (
                  <input
                    type="text"
                    value={form.code}
                    onChange={e => set("code", e.target.value)}
                    className="mt-1.5 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                )}
                <p className="mt-1 text-[11px] text-gray-400">Used as the system identifier. Cannot change after products are assigned.</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={form.description ?? ""}
                  onChange={e => set("description", e.target.value)}
                  placeholder="What does this attribute represent? How should merchants fill it in?"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
                />
              </div>

              {/* Type picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Field Type <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {TYPE_GROUPS.map(group => (
                    <div key={group.label}>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.types.map(t => (
                          <button
                            key={t.value}
                            onClick={() => set("type", t.value)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all ${
                              form.type === t.value
                                ? `border-brand-400 ring-2 ring-brand-400/20 ${t.bg}`
                                : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            }`}
                          >
                            <span className={`text-base flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm ${t.bg} ${t.color}`}>{t.abbr}</span>
                            <div>
                              <div className={`text-xs font-semibold ${form.type === t.value ? t.color : "text-gray-700 dark:text-gray-300"}`}>{t.label}</div>
                              <div className="text-[10px] text-gray-400">{t.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
                <div className="flex gap-2">
                  {(["ACTIVE", "DRAFT", "INACTIVE"] as AttributeStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => set("status", s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.status === s
                          ? s === "ACTIVE"   ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-500/10 dark:border-green-500/40 dark:text-green-400"
                          : s === "DRAFT"    ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-400"
                          :                   "bg-gray-100 border-gray-300 text-gray-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400"
                          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: Configuration ──────────────────────────────────────── */}
          {step === "config" && (
            <>
              {/* Options for SELECT / MULTI_SELECT */}
              {needsOptions && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Options <span className="text-gray-400 font-normal text-xs">({form.options?.length ?? 0})</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.optionsSource === "MERCHANT_API"}
                        onChange={e => set("optionsSource", e.target.checked ? "MERCHANT_API" : "STATIC")}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500"
                      />
                      Load from merchant API
                    </label>
                  </div>

                  {/* Existing options */}
                  <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
                    {(form.options ?? []).map((opt, i) => (
                      <div key={opt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 group">
                        <span className="text-gray-300 dark:text-gray-600 cursor-grab flex-shrink-0"><GripIcon /></span>
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          {opt.color && <div className="h-4 w-4 rounded-full border border-gray-200 dark:border-gray-600" style={{ background: opt.color }} />}
                          <input
                            type="color"
                            value={opt.color ?? "#6b7280"}
                            onChange={e => {
                              const updated = [...(form.options ?? [])];
                              updated[i] = { ...updated[i], color: e.target.value };
                              set("options", updated);
                            }}
                            className="h-5 w-5 rounded border-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity -ml-4 relative z-10"
                            title="Set option color"
                          />
                        </div>
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                        <code className="text-xs text-gray-400 dark:text-gray-500">{opt.value}</code>
                        <button onClick={() => removeOption(opt.id)} className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add option */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newOption}
                      onChange={e => setNewOption(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addOption()}
                      placeholder="Type option label and press Enter..."
                      className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                    />
                    <button
                      onClick={addOption}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <PlusIcon /> Add
                    </button>
                  </div>
                </div>
              )}

              {/* Text config */}
              {(form.type === "TEXT" || form.type === "LONG_TEXT") && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Max Length</label>
                    <input
                      type="number"
                      value={form.maxLength ?? ""}
                      onChange={e => set("maxLength", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Unlimited"
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Placeholder</label>
                    <input
                      type="text"
                      value={form.placeholder ?? ""}
                      onChange={e => set("placeholder", e.target.value)}
                      placeholder="Helper text shown in field..."
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                </div>
              )}

              {/* Numeric config */}
              {(form.type === "NUMBER" || form.type === "DECIMAL") && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Min Value</label>
                    <input
                      type="number"
                      value={form.minValue ?? ""}
                      onChange={e => set("minValue", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="No min"
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Max Value</label>
                    <input
                      type="number"
                      value={form.maxValue ?? ""}
                      onChange={e => set("maxValue", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="No max"
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                </div>
              )}

              {/* Placeholder for other types */}
              {!needsOptions && form.type !== "TEXT" && form.type !== "LONG_TEXT" && form.type !== "NUMBER" && form.type !== "DECIMAL" && (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 py-8 px-4 text-center">
                  <p className="text-sm text-gray-400">
                    {form.type === "BOOLEAN" ? "Toggle field — no additional configuration needed." :
                     form.type === "DATE" ? "Date picker — uses system locale format." :
                     form.type === "COLOR" ? "Color picker with hex input." :
                     form.type === "TAGS" ? "Free-form tag input." :
                     "No extra configuration for this type."}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Assignment ─────────────────────────────────────────── */}
          {step === "assignment" && (
            <>
              {/* Product Types (Phase 4 — preferred) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Product Types
                  </label>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    Preferred
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2 leading-relaxed">
                  Scope this attribute to one or more ProductTypes. New attributes should use this instead of the legacy Category Scope below.
                </p>
                {productTypes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 py-4 px-3 text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500">No product types configured yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {productTypes.filter(pt => pt.active).map(pt => {
                      const selected = form.productTypeIds.includes(pt.id);
                      return (
                        <label
                          key={pt.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            selected
                              ? "border-indigo-400 ring-2 ring-indigo-400/20 bg-indigo-50 dark:bg-indigo-500/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={e => {
                              set("productTypeIds", e.target.checked
                                ? [...form.productTypeIds, pt.id]
                                : form.productTypeIds.filter(id => id !== pt.id)
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{pt.name}</div>
                            {pt.variantDimensions.length > 0 && (
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate font-mono">
                                {[...pt.variantDimensions].sort((a, b) => a.order - b.order).map(d => d.attributeCode).join(" × ")}
                              </div>
                            )}
                          </div>
                          <span className={`flex-shrink-0 text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-full ${
                            selected
                              ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                          }`}>
                            {pt.attributeCount}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {form.productTypeIds.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-indigo-600 dark:text-indigo-400">
                    {form.productTypeIds.length} type{form.productTypeIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>

              {/* Behavior flags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Behavior</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "required" as const,                   label: "Required",               desc: "Merchants must fill this in" },
                    { key: "isChannelOverridable" as const,       label: "Channel Override",        desc: "Channel can provide a different value" },
                    { key: "isVariantChannelOverridable" as const, label: "Variant Ch. Override",   desc: "Channel can override per variant" },
                    { key: "isChannelField" as const,             label: "Channel-only Field",      desc: "Only visible in channel form" },
                  ].map(p => (
                    <label key={p.key} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form[p.key]}
                        onChange={e => set(p.key, e.target.checked as never)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-brand-500 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{p.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Display Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Display Level</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: "essential",        label: "Essential",         desc: "Always shown" },
                    { value: "basic",            label: "Basic",             desc: "Default visible" },
                    { value: "enhanced",         label: "Enhanced",          desc: "Show more" },
                    { value: "advanced",         label: "Advanced",          desc: "Power users" },
                    { value: "category-specific",label: "Category",          desc: "Per category" },
                  ] as { value: DisplayLevel; label: string; desc: string }[]).map(d => (
                    <button
                      key={d.value}
                      onClick={() => set("displayLevel", d.value)}
                      className={`p-2 rounded-lg border text-left text-xs transition-all ${
                        form.displayLevel === d.value
                          ? "border-brand-400 ring-2 ring-brand-400/20 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className="font-medium">{d.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Variant Scope (merged from appliesTo + variantScope) */}
              {(() => {
                const mode = form.appliesTo === "variant" ? "variant" : form.appliesTo === "product" ? "product" : "both";
                const setMode = (m: "product" | "variant" | "both") => {
                  const map = {
                    product: { appliesTo: "product" as AppliesTo, variantScope: "product_only" as VariantScope },
                    variant: { appliesTo: "variant" as AppliesTo, variantScope: "variant_only" as VariantScope },
                    both:    { appliesTo: "both"    as AppliesTo, variantScope: "dual"          as VariantScope },
                  };
                  setForm(f => ({ ...f, ...map[m] }));
                };
                const options: { value: "product" | "variant" | "both"; label: string; desc: string }[] = [
                  { value: "product", label: "Product only",   desc: "One value shared across all variants" },
                  { value: "variant", label: "Variant only",   desc: "A separate value stored per SKU" },
                  { value: "both",    label: "Product + Variant", desc: "Default at product level, overridable per variant" },
                ];
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Variant Scope</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {options.map(o => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setMode(o.value)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            mode === o.value
                              ? "border-brand-400 ring-2 ring-brand-400/20 bg-brand-50 dark:bg-brand-500/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          <div className={`text-xs font-semibold ${mode === o.value ? "text-brand-700 dark:text-brand-400" : "text-gray-700 dark:text-gray-300"}`}>{o.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{o.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={() => setStep(STEPS[currentStepIndex - 1].id)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                ← Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              Cancel
            </button>
            {currentStepIndex < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(STEPS[currentStepIndex + 1].id)}
                disabled={step === "basic" && !isValid}
                className="px-5 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={!isValid}
                className="px-5 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-sm shadow-brand-500/20"
              >
                {isEdit ? "Save Changes" : "Create Attribute"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
