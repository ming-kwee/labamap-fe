"use client";

/**
 * StoreSidebar — vertical store navigator for Step 2 (replaces the horizontal tab bar).
 * Scales past ~10 stores: scrollable list, per-store channel avatar + completion badge,
 * and a search box (appears once there are enough stores to warrant filtering).
 */

import React, { useMemo, useState } from "react";
import type { ChannelType } from "../../types/channelStore";
import { getChannelMeta } from "../stores/ChannelTypeBadge";

export interface StoreSidebarItem {
  storeId: string;
  storeName: string;
  storeUrl?: string;
  channelType: ChannelType;
  /** Live completion % for this store (0–100). */
  livePct: number;
  isDone: boolean;
  isPartial: boolean;
}

interface Props {
  items: StoreSidebarItem[];
  activeStoreId: string;
  doneCount: number;
  onSelect: (storeId: string) => void;
}

// Show the search field only when the list is long enough to need it.
const SEARCH_THRESHOLD = 8;

export default function StoreSidebar({ items, activeStoreId, doneCount, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const showSearch = items.length >= SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.storeName.toLowerCase().includes(q) ||
        it.channelType.toLowerCase().includes(q) ||
        (it.storeUrl ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] lg:sticky lg:top-6">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Stores</h3>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            {doneCount}/{items.length} done
          </span>
        </div>

        {showSearch && (
          <div className="relative mt-2.5">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search store or channel…"
              aria-label="Search stores"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-8 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Store list */}
      <div className="max-h-[60vh] space-y-0.5 overflow-y-auto p-1.5 lg:max-h-[calc(100vh-13rem)]">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            No stores match “{query}”.
          </p>
        ) : (
          filtered.map((it) => {
            const meta = getChannelMeta(it.channelType);
            const isActive = it.storeId === activeStoreId;
            return (
              <button
                key={it.storeId}
                type="button"
                onClick={() => onSelect(it.storeId)}
                aria-current={isActive}
                className={`flex w-full items-center gap-2.5 rounded-xl py-2 pl-1.5 pr-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-500/10"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                }`}
              >
                {/* Active accent bar */}
                <span
                  className={`h-9 w-1 flex-shrink-0 rounded-full ${
                    isActive ? "bg-brand-500" : "bg-transparent"
                  }`}
                />
                {/* Channel avatar */}
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${meta.bg} ${meta.text}`}
                  title={meta.label}
                >
                  {meta.code}
                </span>
                {/* Name + url */}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-medium ${
                      isActive
                        ? "text-brand-700 dark:text-brand-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {it.storeName}
                  </span>
                  {it.storeUrl && (
                    <span className="block truncate text-xs text-gray-400 dark:text-gray-500">
                      {it.storeUrl}
                    </span>
                  )}
                </span>
                {/* Completion badge */}
                <span
                  className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    it.isDone
                      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                      : it.isPartial
                      ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                      : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                  }`}
                >
                  {it.isDone ? "✓" : `${it.livePct}%`}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
