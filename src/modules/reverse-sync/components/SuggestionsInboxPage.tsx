"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useReverseSuggestions } from "../hooks/useReverseSuggestions";
import { SuggestionCard } from "./SuggestionCard";

const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={spinning ? "animate-spin" : ""}>
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

/** Roles allowed to accept a suggestion (writes master global). */
const CAN_ACCEPT_ROLES = new Set(["ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "BUSINESS_MANAGER"]);

/**
 * P3 — "Suggestions from Channel" inbox (draft-review). Org-wide list of PENDING
 * reverse suggestions across all products. Accept writes master global (role-gated +
 * confirm dialog); reject leaves master untouched.
 */
export default function SuggestionsInboxPage() {
  const { organization, user } = useAuth();
  const orgId = organization?.organizationId ?? "";
  const { suggestions, loading, error, refresh, accept, reject, pendingIds } = useReverseSuggestions({
    organizationId: orgId,
  });

  const canAccept = useMemo(() => CAN_ACCEPT_ROLES.has(user?.role ?? ""), [user?.role]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel Updates</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Draft-review changes pulled from your channels. Accepting a suggestion updates the master
            product for <span className="font-medium">all channels</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshIcon spinning={loading} /> Refresh
        </button>
      </div>

      {!canAccept && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-400">
          Your role can review but not accept suggestions — accepting changes the shared master product.
          Ask an admin or manager to approve.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {/* Content */}
      {loading && suggestions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-700">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-2xl dark:bg-gray-800">
            📭
          </div>
          <p className="font-medium text-gray-800 dark:text-gray-200">No suggestions waiting</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Reverse-sync suggestions appear here when a channel reports changes to fields that need review.
            Pull a product from{" "}
            <Link href="/products" className="text-brand-500 hover:underline">My Products</Link> to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onAccept={accept}
              onReject={reject}
              busy={pendingIds.has(s.id)}
              canAccept={canAccept}
            />
          ))}
        </div>
      )}
    </div>
  );
}
