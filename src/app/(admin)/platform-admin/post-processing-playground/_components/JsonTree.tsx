"use client";

/**
 * JsonTree — read-only collapsible JSON viewer. Each parent (object/array) has a ▸/▾ toggle so the
 * user can fold fields they don't care about. Purely visual — the data is never mutated.
 * Used by the output panel's "Tree" view (the editable input stays a textarea).
 */

import React, { useMemo, useState } from "react";

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-90" : ""}`}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

function valueClass(v: unknown): string {
  if (typeof v === "string") return "text-green-600 dark:text-green-400";
  if (typeof v === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof v === "boolean") return "text-purple-600 dark:text-purple-400";
  return "text-gray-400"; // null
}
function scalar(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}
function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === "object";
}

/** All container paths (for Collapse all). */
function collectContainers(v: unknown, path: string, out: string[]) {
  if (isContainer(v)) {
    out.push(path);
    const entries: [string, unknown][] = Array.isArray(v)
      ? v.map((x, i) => [String(i), x])
      : Object.entries(v);
    for (const [k, child] of entries) collectContainers(child, `${path}/${k}`, out);
  }
}

function TreeNode({
  keyName,
  value,
  path,
  depth,
  isLast,
  collapsed,
  onToggle,
}: {
  keyName: string | null;
  value: unknown;
  path: string;
  depth: number;
  isLast: boolean;
  collapsed: Set<string>;
  onToggle: (p: string) => void;
}) {
  const pad = { paddingLeft: `${depth * 14}px` };
  const label = keyName !== null ? <span className="text-gray-500 dark:text-gray-400">{keyName}: </span> : null;
  const comma = isLast ? "" : ",";

  if (!isContainer(value)) {
    return (
      <div style={pad} className="whitespace-pre-wrap break-words">
        {label}
        <span className={valueClass(value)}>{scalar(value)}</span>
        <span className="text-gray-400">{comma}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((x, i) => [String(i), x])
    : Object.entries(value as Record<string, unknown>);
  const open = entries.length > 0 && !collapsed.has(path);
  const openBrace = isArray ? "[" : "{";
  const closeBrace = isArray ? "]" : "}";
  const count = isArray
    ? `${entries.length} item${entries.length !== 1 ? "s" : ""}`
    : `${entries.length} key${entries.length !== 1 ? "s" : ""}`;

  return (
    <div>
      <div
        style={pad}
        className="flex items-start gap-1 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-800/60"
        onClick={() => entries.length > 0 && onToggle(path)}
      >
        <span className={`mt-0.5 shrink-0 text-gray-400 ${entries.length === 0 ? "opacity-0" : ""}`}>
          <Chevron open={open} />
        </span>
        <span className="min-w-0">
          {label}
          <span className="text-gray-400">{openBrace}</span>
          {!open && (
            <span className="text-gray-400">
              {entries.length === 0 ? "" : ` … ${count} `}{closeBrace}{comma}
            </span>
          )}
        </span>
      </div>
      {open && (
        <>
          {entries.map(([k, child], i) => (
            <TreeNode
              key={k}
              keyName={isArray ? null : k}
              value={child}
              path={`${path}/${k}`}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
          <div style={pad} className="text-gray-400">{closeBrace}{comma}</div>
        </>
      )}
    </div>
  );
}

export default function JsonTree({ data }: { data: unknown }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const containers = useMemo(() => {
    const out: string[] = [];
    collectContainers(data, "$", out);
    return out;
  }, [data]);

  const toggle = (p: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  // Collapse-all keeps the ROOT open (folding everything one level down is the useful default).
  const collapseAll = () => setCollapsed(new Set(containers.filter((p) => p !== "$")));
  const expandAll = () => setCollapsed(new Set());

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5 mb-1">
        <button onClick={collapseAll} className="text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Collapse all</button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button onClick={expandAll} className="text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Expand all</button>
      </div>
      <div className="h-64 resize-y overflow-auto font-mono text-[11px] leading-relaxed bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-gray-800 dark:text-gray-200">
        <TreeNode keyName={null} value={data} path="$" depth={0} isLast collapsed={collapsed} onToggle={toggle} />
      </div>
    </div>
  );
}
