"use client";

/**
 * OpPalette — searchable operation picker.
 * Groups operations by scope (DOCUMENT / LIST / PER_ITEM) with counts, filters
 * by opCode/description, and closes on select, ESC, or outside-click.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { OP_SCOPES, OperationSpec, OpScope } from "../_types/playground";

const SCOPE_META: Record<OpScope, { label: string; cls: string }> = {
  DOCUMENT: {
    label: "Document",
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  LIST: {
    label: "List",
    cls: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
  PER_ITEM: {
    label: "Per-item",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
};

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export default function OpPalette({
  operations,
  onSelect,
  onClose,
  scopeFilter,
  title = "Add operation",
}: {
  operations: OperationSpec[];
  onSelect: (spec: OperationSpec) => void;
  onClose: () => void;
  /** Restrict the palette to these scopes (e.g. root = DOCUMENT+LIST, mouth = PER_ITEM). */
  scopeFilter?: OpScope[];
  /** Dialog heading (defaults to "Add operation"). */
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const scopeAllowed = useMemo(
    () => (scopeFilter && scopeFilter.length > 0 ? new Set(scopeFilter) : null),
    [scopeFilter],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const byScope = scopeAllowed ? operations.filter((o) => scopeAllowed.has(o.scope)) : operations;
    if (!q) return byScope;
    return byScope.filter(
      (o) =>
        o.opCode.toLowerCase().includes(q) ||
        (o.description ?? "").toLowerCase().includes(q),
    );
  }, [operations, query, scopeAllowed]);

  const grouped = useMemo(() => {
    const map = new Map<OpScope, OperationSpec[]>();
    for (const scope of OP_SCOPES) map.set(scope, []);
    for (const op of filtered) {
      const arr = map.get(op.scope) ?? [];
      arr.push(op);
      map.set(op.scope, arr);
    }
    // keep insertion order but drop empty groups
    return OP_SCOPES.map((s) => [s, (map.get(s) ?? []).slice().sort((a, b) => a.opCode.localeCompare(b.opCode))] as const).filter(
      ([, arr]) => arr.length > 0,
    );
  }, [filtered]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-20 bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label={title}
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[70vh]"
      >
        {/* Header / search */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close operation picker"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <SearchIcon />
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search operations by name or description…"
              aria-label="Search operations"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto p-2 space-y-3">
          {grouped.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No operations match “{query}”.</p>
          ) : (
            grouped.map(([scope, ops]) => (
              <div key={scope}>
                <div className="flex items-center gap-2 px-1.5 mb-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${SCOPE_META[scope].cls}`}>
                    {SCOPE_META[scope].label}
                  </span>
                  <span className="text-[11px] text-gray-400">{ops.length}</span>
                </div>
                <ul className="space-y-1">
                  {ops.map((op) => (
                    <li key={op.opCode}>
                      <button
                        onClick={() => onSelect(op)}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
                      >
                        <code className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">{op.opCode}</code>
                        {op.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{op.description}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
