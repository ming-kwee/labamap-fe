"use client";

import React from "react";
import type { ReversePreviewSummary } from "../types/reverse";

/** Top-of-preview number strip summarising the classification (P2). */
export function ReverseSummaryBar({
  summary,
  notesCount = 0,
}: {
  summary: ReversePreviewSummary;
  notesCount?: number;
}) {
  const items: Array<{ n: number; label: string; strong?: boolean }> = [
    { n: summary.wouldChangeMaster, label: "would change master", strong: true },
    { n: summary.channelOnly, label: "channel-only" },
    { n: summary.discarded, label: "discarded" },
    { n: notesCount, label: notesCount === 1 ? "note" : "notes" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm dark:border-gray-800 dark:bg-white/[0.02]">
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {i > 0 && <span className="text-gray-300 dark:text-gray-600">·</span>}
          <span className={it.strong ? "font-semibold text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}>
            <span className="tabular-nums">{it.n}</span> {it.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export default ReverseSummaryBar;
