"use client";

/**
 * ProductFieldPicker — after a product is chosen, let the admin focus what to load into the
 * playground input: either the WHOLE document, or a subset of parent (top-level) fields they tick.
 * Object / array-of-object values can be EXPANDED to inspect their contents before deciding.
 *
 * Selection granularity is the parent field (matches "load per parent field"); expand is inspect-only.
 */

import React, { useMemo, useState } from "react";

const ChevronRight = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-transform ${open ? "rotate-90" : ""}`}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

type FieldKind = "object" | "array-obj" | "array" | "scalar";

function describe(v: unknown): { kind: FieldKind; hint: string; expandable: boolean } {
  if (Array.isArray(v)) {
    const isObjArr = v.some((x) => x !== null && typeof x === "object");
    return {
      kind: isObjArr ? "array-obj" : "array",
      hint: `array · ${v.length} ${v.length === 1 ? "item" : "items"}`,
      expandable: v.length > 0,
    };
  }
  if (v !== null && typeof v === "object") {
    const n = Object.keys(v as object).length;
    return { kind: "object", hint: `object · ${n} ${n === 1 ? "key" : "keys"}`, expandable: n > 0 };
  }
  if (v === null) return { kind: "scalar", hint: "null", expandable: false };
  return { kind: "scalar", hint: typeof v, expandable: false };
}

/** Short inline preview for a scalar value (truncated). */
function scalarPreview(v: unknown): string {
  if (typeof v === "string") return v.length > 44 ? `"${v.slice(0, 44)}…"` : `"${v}"`;
  return String(v);
}

const kindBadgeCls: Record<FieldKind, string> = {
  object: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300",
  "array-obj": "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
  array: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
  scalar: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function ProductFieldPicker({
  data,
  onLoad,
}: {
  data: Record<string, unknown>;
  onLoad: (subset: Record<string, unknown>) => void;
}) {
  const entries = useMemo(() => Object.entries(data), [data]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const loadSelected = () => {
    const subset: Record<string, unknown> = {};
    for (const [k, v] of entries) if (selected.has(k)) subset[k] = v;
    onLoad(subset);
  };

  if (entries.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        This product has no fields to load.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
      {/* Toolbar */}
      <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${collapsed ? "" : "border-b border-gray-200 dark:border-gray-700"}`}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 min-w-0"
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Minimize"}
        >
          <span className="shrink-0 text-gray-400"><ChevronRight open={!collapsed} /></span>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Fields to load</span>
          {collapsed && selected.size > 0 && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">· {selected.size} selected</span>
          )}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setSelected(new Set(entries.map(([k]) => k)))}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Select all
            </button>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {collapsed ? null : (
      <>
      {/* Field rows */}
      <div className="max-h-56 overflow-auto py-1">
        {entries.map(([key, value]) => {
          const { kind, hint, expandable } = describe(value);
          const isOpen = expanded.has(key);
          const isChecked = selected.has(key);
          return (
            <div key={key} className="px-2">
              <div className="flex items-center gap-2 py-1 rounded-md hover:bg-white dark:hover:bg-gray-800/60">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => setSelected((s) => toggle(s, key))}
                  aria-label={`Load field ${key}`}
                  className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-400"
                />
                <button
                  onClick={() => expandable && setExpanded((s) => toggle(s, key))}
                  disabled={!expandable}
                  className={`flex-1 flex items-center gap-1.5 text-left min-w-0 ${expandable ? "" : "cursor-default"}`}
                >
                  <span className={`shrink-0 text-gray-400 ${expandable ? "" : "opacity-0"}`}>
                    <ChevronRight open={isOpen} />
                  </span>
                  <span className="font-mono text-xs text-gray-800 dark:text-gray-200 truncate">{key}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${kindBadgeCls[kind]}`}>{hint}</span>
                  {kind === "scalar" && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">
                      {scalarPreview(value)}
                    </span>
                  )}
                </button>
              </div>
              {isOpen && expandable && (
                <pre className="ml-6 mb-1 max-h-48 overflow-auto rounded-md bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 p-2 text-[11px] font-mono leading-relaxed text-gray-700 dark:text-gray-300">
                  {JSON.stringify(value, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => onLoad({ ...data })}
          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          Load all
        </button>
        <button
          onClick={loadSelected}
          disabled={selected.size === 0}
          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Load selected{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>
      </>
      )}
    </div>
  );
}
