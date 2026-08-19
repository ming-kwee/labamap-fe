"use client";

import { useCallback, useEffect, useState } from "react";
import { ReverseSyncService, ReverseApiError } from "../services/reverse.service";
import type { ReverseSuggestion, ReverseSuggestionStatus } from "../types/reverse";

export interface UseReverseSuggestionsResult {
  suggestions: ReverseSuggestion[];
  loading: boolean;
  error: string | null;
  /** Reload the list from the server. */
  refresh: () => Promise<void>;
  /** Accept (writes master GLOBAL). Resolves on 200; removes the card from PENDING view. */
  accept: (id: string) => Promise<void>;
  /** Reject (master unchanged). */
  reject: (id: string) => Promise<void>;
  /** Ids currently mutating (accept/reject in flight) — for per-card disabled state. */
  pendingIds: Set<string>;
}

/**
 * Loads reverse draft-review suggestions and exposes accept/reject.
 *
 * Two modes:
 *  - Org-wide inbox  → pass `{ organizationId }` (uses `GET /suggestions?organizationId=`).
 *  - Per-product     → pass `{ masterProductId }` (uses `GET /suggestions/{masterProductId}`).
 *
 * Accept/reject are NOT optimistic — the master-global write must land (200) before the
 * card is removed. On success the row is dropped from the local list (it leaves PENDING).
 */
export function useReverseSuggestions(opts: {
  organizationId?: string;
  masterProductId?: string;
  status?: ReverseSuggestionStatus;
}): UseReverseSuggestionsResult {
  const { organizationId, masterProductId, status = "PENDING" } = opts;
  const [suggestions, setSuggestions] = useState<ReverseSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!organizationId && !masterProductId) return;
    setLoading(true);
    setError(null);
    try {
      const list = masterProductId
        ? await ReverseSyncService.listProductSuggestions(masterProductId)
        : await ReverseSyncService.listSuggestions(organizationId as string, status);
      setSuggestions(list);
    } catch (err) {
      setError(err instanceof ReverseApiError ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [organizationId, masterProductId, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (id: string, action: "accept" | "reject") => {
      setPendingIds((prev) => new Set(prev).add(id));
      setError(null);
      try {
        if (action === "accept") await ReverseSyncService.acceptSuggestion(id);
        else await ReverseSyncService.rejectSuggestion(id);
        // Resolved → drop from the PENDING list once the write has landed.
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        setError(err instanceof ReverseApiError ? err.message : `Failed to ${action} suggestion`);
        throw err;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const accept = useCallback((id: string) => mutate(id, "accept"), [mutate]);
  const reject = useCallback((id: string) => mutate(id, "reject"), [mutate]);

  return { suggestions, loading, error, refresh, accept, reject, pendingIds };
}
