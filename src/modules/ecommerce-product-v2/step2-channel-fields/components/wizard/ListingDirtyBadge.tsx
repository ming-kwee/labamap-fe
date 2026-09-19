"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "@/shared/ui/icons/Icons";
import { PublishService } from "../../services/channelStore.service";
import type { PublishDiffResponse } from "../../types/channelStore";
import { TONE_PILL } from "../../../step3-publish/utils/listing-lifecycle";
import { useT } from "@/shared/contexts/LocaleContext";

/**
 * Live-listing dirty-state badge for the Step-2 editor (DiffEngine 02-frontend-dirty-state §4.2).
 *
 * While the merchant edits channel fields for a store whose listing is ALREADY live, this asks the
 * read-only `publish-diff` endpoint — DEBOUNCED (~500ms) and with the current DRAFT desired-state —
 * whether those (possibly unsaved) edits differ from what's on the channel, so the merchant knows a
 * re-publish is needed. Best-effort: if the endpoint isn't deployed (404) the badge stays hidden.
 */

/** Debounced, latest-wins publish-diff. Skips entirely when `enabled` is false. */
export function usePublishDiff(params: {
  masterProductId: string;
  storeId: string;
  enabled: boolean;
  desired?: Record<string, unknown>;
  debounceMs?: number;
}): { diff: PublishDiffResponse | null; loading: boolean } {
  const { masterProductId, storeId, enabled, desired, debounceMs = 500 } = params;
  const [diff, setDiff] = useState<PublishDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Re-run only when the desired-state content changes (not on every render / new object identity).
  const desiredKey = useMemo(() => (desired ? JSON.stringify(desired) : ""), [desired]);
  // Monotonic request token so a slow earlier response can't clobber a newer one (latest-wins).
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled || !masterProductId || !storeId) {
      setDiff(null);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const d = await PublishService.publishDiff({
          masterProductId,
          storeId,
          ...(desired ? { masterProductData: desired } : {}),
        });
        if (seq === seqRef.current) setDiff(d);
      } catch {
        // Endpoint absent / listing not live yet — hide the badge, don't surface an error.
        if (seq === seqRef.current) setDiff(null);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // desiredKey stands in for `desired`; debounceMs is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, masterProductId, storeId, desiredKey]);

  return { diff, loading };
}

export interface ListingDirtyBadgeProps {
  masterProductId: string;
  storeId: string;
  /** Only fetch/show for listings that are actually live on the channel. */
  live: boolean;
  /** Current draft desired-state (master snapshot + Step-2 overrides + channelData). */
  desired?: Record<string, unknown>;
}

export default function ListingDirtyBadge({ masterProductId, storeId, live, desired }: ListingDirtyBadgeProps) {
  const t = useT();
  const { diff, loading } = usePublishDiff({ masterProductId, storeId, enabled: live, desired });

  if (!live) return null;

  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

  // First resolution — show a subtle "checking" chip so the badge doesn't pop in late.
  if (loading && !diff) {
    return (
      <span className={`${base} ${TONE_PILL.neutral}`}>
        <RefreshCw className="h-3 w-3 animate-spin" /> {t("dirty.checking", "Checking changes…")}
      </span>
    );
  }
  if (!diff) return null; // endpoint absent / not live — stay silent

  if (!diff.dirty) {
    return (
      <span className={`${base} ${TONE_PILL.success}`}>
        <CheckCircle2 className="h-3 w-3" /> {t("dirty.upToDate", "Up to date")}
      </span>
    );
  }

  const blocked = diff.decision === "UPDATE_BLOCKED" || diff.updateSupported === false;
  const n = diff.summary?.totalChanges;
  return (
    <span
      className={`${base} ${blocked ? TONE_PILL.warning : TONE_PILL.brand}`}
      title={blocked
        ? t("dirty.blockedTooltip", "There are changes, but updating this channel isn't supported yet — delist then re-publish in Step 3.")
        : t("dirty.pendingTooltip", "These changes aren't on the channel yet — go to Step 3 and update the listing.")}
    >
      <AlertTriangle className="h-3 w-3" />
      {blocked
        ? t("dirty.held", "Changes held")
        : t("dirty.nChanges", "{n} changes not yet published")
            .replace("{n}", n ? String(n) : "")
            .replace(/\s+/g, " ")
            .trim()}
    </span>
  );
}
