"use client";

import React, { useState } from "react";
import { getChannelMeta } from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import type { ReverseSuggestion } from "../types/reverse";
import { formatReverseValue, isEmptyValue } from "./format";

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * P3 — one draft-review suggestion card. Accepting WRITES MASTER GLOBAL for all
 * channels, so Accept opens an explicit confirmation dialog first. Reject leaves
 * master unchanged. Neither action is optimistic — the parent hook drops the card
 * only after the server confirms (200).
 *
 * `canAccept=false` (role-gated) disables Accept with a tooltip — the master-global
 * write should be limited to admin/manager roles.
 */
export function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  busy,
  canAccept = true,
}: {
  suggestion: ReverseSuggestion;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  busy?: boolean;
  canAccept?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const meta = getChannelMeta(suggestion.channelType.toLowerCase() as ChannelType);
  const isNew = isEmptyValue(suggestion.currentValue);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Left — identity + diff */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${meta.bg} ${meta.text}`} title={meta.label}>
              {meta.code}
            </span>
            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{suggestion.masterAttrId}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isNew ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}>
              {isNew ? "new" : "changed"}
            </span>
          </div>

          {/* Diff */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="max-w-[45%] truncate rounded bg-gray-100 px-1.5 py-0.5 text-gray-400 line-through dark:bg-gray-800 dark:text-gray-500">
              {formatReverseValue(suggestion.currentValue)}
            </span>
            <span className="text-gray-400">→</span>
            <span className="max-w-[45%] truncate rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {formatReverseValue(suggestion.suggestedValue)}
            </span>
          </div>

          {/* Meta */}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
            <span>{meta.label}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="font-mono">{suggestion.storeId}</span>
            {suggestion.channelProductId && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="font-mono">{suggestion.channelProductId}</span>
              </>
            )}
            {suggestion.createdAt && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span>{formatRelativeTime(suggestion.createdAt)}</span>
              </>
            )}
          </p>
        </div>

        {/* Right — actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onReject(suggestion.id)}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy || !canAccept}
            title={canAccept ? "Accept — writes master global" : "You don't have permission to accept (writes master global)"}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? "…" : "Accept"}
          </button>
        </div>
      </div>

      {/* Accept confirmation — master global write */}
      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Change master value?</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Master <span className="font-mono font-semibold">{suggestion.masterAttrId}</span> will change from{" "}
              <span className="font-medium text-gray-900 dark:text-white">{formatReverseValue(suggestion.currentValue)}</span> to{" "}
              <span className="font-medium text-brand-600 dark:text-brand-400">{formatReverseValue(suggestion.suggestedValue)}</span>{" "}
              for <span className="font-semibold">ALL channels</span>. This cannot be undone automatically.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onAccept(suggestion.id);
                  } finally {
                    setConfirming(false);
                  }
                }}
                disabled={busy}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy ? "Accepting…" : "Yes, change master"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuggestionCard;
