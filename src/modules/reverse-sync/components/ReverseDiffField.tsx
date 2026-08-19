"use client";

import React from "react";
import { formatReverseValue } from "./format";

/**
 * One reverse diff row — used in the P2 preview (master-mapped bucket) and inside
 * the P3 suggestion card. Renders `channelPath`, an optional `current → incoming`
 * diff, and a changed/new/same badge.
 *
 *   changed === true  → the incoming value differs (badge "changed")
 *   changed === null  → master had no prior value (badge "new")
 *   changed === false → same value (badge "same", muted)
 */
export function ReverseDiffField({
  channelPath,
  label,
  currentValue,
  incomingValue,
  changed,
  note,
}: {
  channelPath: string;
  /** Optional human label (e.g. resolved category-attribute name or masterAttrId). */
  label?: string | null;
  currentValue: unknown;
  incomingValue: unknown;
  changed: boolean | null;
  note?: string | null;
}) {
  const showDiff = changed !== false; // hide the arrow when values are identical
  const badge =
    changed === null
      ? { text: "new", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" }
      : changed
        ? { text: "changed", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" }
        : { text: "same", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:gap-3">
      {/* Key */}
      <div className="flex min-w-0 flex-shrink-0 flex-col sm:w-44">
        <span className="truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-300" title={channelPath}>
          {label || channelPath}
        </span>
        {label && (
          <span className="truncate font-mono text-[10px] text-gray-400 dark:text-gray-500" title={channelPath}>
            {channelPath}
          </span>
        )}
      </div>

      {/* Diff */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
        {showDiff && (
          <>
            <span className="max-w-[45%] truncate rounded bg-white px-1.5 py-0.5 text-gray-400 line-through dark:bg-gray-900 dark:text-gray-500">
              {formatReverseValue(currentValue)}
            </span>
            <span className="text-gray-400 dark:text-gray-500">→</span>
          </>
        )}
        <span className="max-w-[45%] truncate rounded bg-white px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-900 dark:text-gray-100">
          {formatReverseValue(incomingValue)}
        </span>
      </div>

      {/* Badge + note */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {note && (
          <span className="truncate text-[11px] text-gray-400 dark:text-gray-500" title={note}>
            {note}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
    </div>
  );
}

export default ReverseDiffField;
