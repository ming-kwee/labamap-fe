"use client";

import { useCallback, useState } from "react";
import { ReverseSyncService, ReverseApiError, isNotConfigured } from "../services/reverse.service";
import type { ReversePreview, ReversePullRequest } from "../types/reverse";

export interface UseReversePullState {
  loading: boolean;
  preview: ReversePreview | null;
  error: string | null;
  /** true when the channel does not support auto-pull (needs signing → manual preview). */
  notConfigured: boolean;
}

/**
 * Drives the P1 "Pull from Channel" action → P2 preview.
 *
 * `pull()` calls `POST /pull` and stores the resulting `ReversePreview`. A 400
 * "not configured" is surfaced (not thrown) via `notConfigured` so the UI can fall
 * back to a manual-preview state instead of showing an error.
 */
export function useReversePull() {
  const [state, setState] = useState<UseReversePullState>({
    loading: false,
    preview: null,
    error: null,
    notConfigured: false,
  });

  const pull = useCallback(async (req: ReversePullRequest): Promise<ReversePreview | null> => {
    setState({ loading: true, preview: null, error: null, notConfigured: false });
    try {
      const preview = await ReverseSyncService.pull(req);
      setState({ loading: false, preview, error: null, notConfigured: false });
      return preview;
    } catch (err) {
      if (isNotConfigured(err)) {
        setState({ loading: false, preview: null, error: null, notConfigured: true });
        return null;
      }
      const message = err instanceof ReverseApiError ? err.message : "Failed to pull from channel";
      setState({ loading: false, preview: null, error: message, notConfigured: false });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, preview: null, error: null, notConfigured: false });
  }, []);

  return { ...state, pull, reset };
}
