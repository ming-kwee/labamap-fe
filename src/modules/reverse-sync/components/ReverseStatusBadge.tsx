"use client";

import React from "react";

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

/** Is the channel's own update newer than our last reverse pull? → "update available". */
export function hasChannelUpdate(
  channelUpdatedAt: string | null | undefined,
  lastReverseSyncedAt: string | null | undefined,
): boolean {
  if (!channelUpdatedAt) return false;
  if (!lastReverseSyncedAt) return true; // channel has changes and we've never pulled
  const cu = new Date(channelUpdatedAt).getTime();
  const lr = new Date(lastReverseSyncedAt).getTime();
  return !Number.isNaN(cu) && !Number.isNaN(lr) && cu > lr;
}

/**
 * P4 — compact reverse-sync status indicator for a (product × store) row.
 *  • "Update available" (amber pulse) when the channel changed after our last pull.
 *  • "Pulled {relative}" when we have a lastReverseSyncedAt.
 *  • nothing when the product isn't linked / never reverse-synced.
 */
export function ReverseStatusBadge({
  channelProductId,
  channelUpdatedAt,
  lastReverseSyncedAt,
}: {
  channelProductId?: string | null;
  channelUpdatedAt?: string | null;
  lastReverseSyncedAt?: string | null;
}) {
  if (!channelProductId && !lastReverseSyncedAt && !channelUpdatedAt) return null;

  const updateAvailable = hasChannelUpdate(channelUpdatedAt, lastReverseSyncedAt);

  if (updateAvailable) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        title={`Channel updated ${formatRelativeTime(channelUpdatedAt)} — pull to refresh`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        Update available
      </span>
    );
  }

  if (lastReverseSyncedAt) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        title={`Last reverse pull ${formatRelativeTime(lastReverseSyncedAt)}`}
      >
        Pulled {formatRelativeTime(lastReverseSyncedAt)}
      </span>
    );
  }

  return null;
}

export default ReverseStatusBadge;
