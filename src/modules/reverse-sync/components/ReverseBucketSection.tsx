"use client";

import React, { useState } from "react";

const CHEVRON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Collapsible bucket wrapper for the P2 preview — a titled header with a count,
 * a right-aligned routing hint (e.g. "→ Step-2 channelData"), and collapsible body.
 */
export function ReverseBucketSection({
  title,
  count,
  hint,
  accent = "gray",
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  accent?: "blue" | "gray" | "muted";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const accentDot =
    accent === "blue" ? "bg-blue-500" : accent === "muted" ? "bg-gray-300 dark:bg-gray-600" : "bg-gray-400";
  const titleCls = accent === "muted" ? "text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-gray-100";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${accentDot}`} />
        <span className={`text-sm font-semibold ${titleCls}`}>{title}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 tabular-nums dark:bg-gray-800 dark:text-gray-300">
          {count}
        </span>
        {hint && <span className="ml-1 truncate text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
        <span className={`ml-auto flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
          {CHEVRON}
        </span>
      </button>
      {open && count > 0 && <div className="space-y-1.5 px-3 pb-3">{children}</div>}
      {open && count === 0 && (
        <p className="px-4 pb-3 text-xs italic text-gray-400 dark:text-gray-500">Nothing in this bucket.</p>
      )}
    </div>
  );
}

export default ReverseBucketSection;
