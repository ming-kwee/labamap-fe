"use client";

/**
 * ChannelRulePicker — after a channel is chosen, let the admin pick WHICH real post-processing
 * rules to load into the pipeline (instead of always all of them). Each rule can be expanded to
 * preview its operations before deciding. Load all, or load the ticked subset.
 */

import React, { useMemo, useState } from "react";
import { ChannelRule } from "../_services/playground.service";

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

/** Collect op codes of a rule (flattening a FOR_EACH's nested steps into "FOR_EACH(child,…)"). */
function opCodesOf(rule: ChannelRule): string[] {
  const ops = Array.isArray(rule.operations) ? rule.operations : [];
  return ops.map((o) => {
    const code = String(o.op ?? "op");
    if (code === "FOR_EACH" && Array.isArray(o.steps)) {
      const inner = (o.steps as Record<string, unknown>[]).map((s) => String(s.op ?? "op")).join(", ");
      return `FOR_EACH(${inner})`;
    }
    return code;
  });
}

export default function ChannelRulePicker({
  rules,
  onLoad,
}: {
  rules: ChannelRule[];
  onLoad: (rules: ChannelRule[]) => void;
}) {
  // Default: nothing selected — admins usually load rules one at a time. "Load all" ignores the selection.
  const allIdx = useMemo(() => rules.map((_, i) => i), [rules]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };

  const loadSelected = () => {
    onLoad(rules.filter((_, i) => selected.has(i)));
    setCollapsed(true); // minimize after loading so the Input JSON below is more visible
  };

  if (rules.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        This channel has no post-processing rules.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40">
      {/* Toolbar */}
      <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${collapsed ? "" : "border-b border-gray-200 dark:border-gray-700"}`}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 min-w-0"
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Minimize"}
        >
          <span className="shrink-0 text-gray-400"><ChevronRight open={!collapsed} /></span>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Choose rules to load</span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">· {selected.size}/{rules.length}</span>
        </button>
        {!collapsed && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setSelected(new Set(allIdx))}
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
          {/* Rule rows */}
          <div className="max-h-56 overflow-auto py-1">
            {rules.map((rule, i) => {
              const ops = opCodesOf(rule);
              const isOpen = expanded.has(i);
              const disabled = rule.enabled === false;
              return (
                <div key={i} className="px-2">
                  <div className="flex items-center gap-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => setSelected((s) => toggle(s, i))}
                      aria-label={`Load rule ${rule.name ?? i}`}
                      className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-400"
                    />
                    <button
                      onClick={() => setExpanded((s) => toggle(s, i))}
                      className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                    >
                      <span className="shrink-0 text-gray-400"><ChevronRight open={isOpen} /></span>
                      <span className="font-mono text-xs text-gray-800 dark:text-gray-200 truncate">{rule.name ?? `rule ${i + 1}`}</span>
                      {typeof rule.priority === "number" && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">p{rule.priority}</span>
                      )}
                      {disabled && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300">disabled</span>
                      )}
                    </button>
                  </div>
                  {/* op badges (always visible, wrap) */}
                  <div className="ml-6 mb-0.5 flex flex-wrap gap-1">
                    {ops.map((op, k) => (
                      <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">{op}</span>
                    ))}
                  </div>
                  {isOpen && (
                    <pre className="ml-6 mb-1 max-h-48 overflow-auto rounded-md bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 p-2 text-[11px] font-mono leading-relaxed text-gray-700 dark:text-gray-300">
                      {JSON.stringify({ sourcePath: rule.sourcePath, targetPath: rule.targetPath, operations: rule.operations }, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={loadSelected}
              disabled={selected.size === 0}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Load selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
