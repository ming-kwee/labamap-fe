/**
 * Listing lifecycle state machine (Step 3) — the single source of truth for the
 * status badge + contextual primary action per (product × store), implementing the
 * §3 "status → UI" table of docs/FRONTEND-LISTING-LIFECYCLE-UPDATE-DELETE.md.
 *
 * Publish is no longer a fire-once button: a live listing that is edited becomes an
 * UPDATE (or, while `channel-update-enabled` is off, a BLOCKED that routes through
 * delist → re-publish), an unchanged one is a NO-OP, and a delisted one re-publishes
 * as a brand-new CREATE. This helper collapses the persisted status + the transient
 * publish/sync signals into one derived state so every screen renders consistently.
 */

import type {
  ChannelProductData,
  ChannelProductStatus,
  PublishOperation,
  PublishDiffResponse,
  StorePublishResult,
} from "../../step2-channel-fields/types/channelStore";

export type LifecycleState =
  | "draft"          // not live, still missing required info
  | "ready"          // all required info filled, not live yet
  | "publishing"     // a publish call is in flight (local)
  | "processing"     // async — sync workflow still running after the FE poll window
  | "live"           // PUBLISHED + listing id, content matches last publish (up to date)
  | "live_changed"   // PUBLISHED but local edits are not yet on the channel (→ Update)
  | "blocked"        // update gated (channel-update-enabled off) → Delist & re-publish
  | "update_failed"  // PUBLISHED + publishError — still live, last UPDATE failed (G7)
  | "failed"         // FAILED — create never went live
  | "delisted";      // removed from channel — re-publish creates a new listing

export type LifecycleTone = "success" | "brand" | "warning" | "error" | "neutral";

export interface LifecycleBadge {
  label: string;
  tone: LifecycleTone;
  /** true → render an animated/pulsing dot (in-flight states). */
  pulse?: boolean;
}

export interface Lifecycle {
  state: LifecycleState;
  badge: LifecycleBadge;
  /** Listing is live on the channel right now (covers live / live_changed / update_failed). */
  isLive: boolean;
  /** Delist is allowed: live on the channel with a known listing id (§6.1 `isDelistable`). */
  isDelistable: boolean;
  /** Deep-link to the listing on the channel — hidden once delisted. */
  channelUrl?: string;
  /** External listing id, when known. */
  channelProductId?: string;
  /**
   * Authoritative dirty-state answer is available (a `publish-diff` was resolved). When true and
   * the listing is live with no changes, the update action can be disabled ("Up to date").
   */
  diffKnown: boolean;
  /** Number of pending changes from the diff summary (variants + images + product), when known. */
  changeCount?: number;
  /** The listing has changes but the channel cannot push them yet (decision=UPDATE_BLOCKED). */
  updateBlocked: boolean;
}

/** Minimal diff shape consumed by the state machine (subset of PublishDiffResponse). */
type DiffLike = Pick<PublishDiffResponse, "dirty" | "decision" | "updateSupported" | "summary">;

export interface DeriveOptions {
  /** Local in-flight flag — a publish/delist call is running for this store. */
  inFlight?: boolean;
  /** Transient result of the latest publish attempt (overrides the persisted status). */
  result?: StorePublishResult;
  /**
   * Authoritative dirty-state from `POST /channels/publish/diff` (DiffEngine). When present it drives
   * `hasUnpublishedChanges`, `changeCount` and `updateBlocked` — the FE no longer guesses.
   */
  diff?: DiffLike | null;
  /**
   * Fallback optimistic flag when no diff is available. Superseded by `diff.dirty` when a diff
   * is present. Left for callers that track dirty-state themselves.
   */
  hasUnpublishedChanges?: boolean;
}

const BADGES: Record<LifecycleState, LifecycleBadge> = {
  draft:         { label: "Draft",                     tone: "neutral" },
  ready:         { label: "Siap",                      tone: "brand" },
  publishing:    { label: "Publishing…",               tone: "brand",   pulse: true },
  processing:    { label: "Processing…",               tone: "warning", pulse: true },
  live:          { label: "Live",                       tone: "success" },
  live_changed:  { label: "Live • ada perubahan",       tone: "success" },
  blocked:       { label: "Perlu tindakan",             tone: "warning" },
  update_failed: { label: "Live • update gagal",        tone: "success" },
  failed:        { label: "Gagal",                      tone: "error" },
  delisted:      { label: "Delisted",                   tone: "neutral" },
};

const isLiveStatus = (s: LifecycleState): boolean =>
  s === "live" || s === "live_changed" || s === "update_failed";

/**
 * Collapse the persisted listing status + the transient publish result into one derived
 * lifecycle. Precedence: in-flight → transient result → persisted status. The persisted
 * `PUBLISHED + channelProductId` is what makes a listing "live" (and therefore delistable);
 * a bare `PUBLISHED` with no id (legacy/unlinked) is treated as live-but-not-delistable.
 */
export function deriveLifecycle(data: ChannelProductData, opts: DeriveOptions = {}): Lifecycle {
  const { inFlight, result, diff } = opts;
  const channelProductId = result?.channelProductId ?? data.channelProductId;
  const channelUrl = result?.channelUrl ?? data.channelUrl;

  // Authoritative dirty-state wins over the optimistic fallback (DiffEngine 02).
  const diffKnown = diff != null;
  const hasUnpublishedChanges = diffKnown ? !!diff!.dirty : !!opts.hasUnpublishedChanges;
  const updateBlocked = diff?.decision === "UPDATE_BLOCKED" || diff?.updateSupported === false;
  const changeCount = diff?.summary?.totalChanges;

  const state = ((): LifecycleState => {
    if (inFlight) return "publishing";

    // Transient result wins — it reflects the just-completed attempt.
    const rs = result?.status;
    if (rs === "PROCESSING") return "processing";
    if (rs === "BLOCKED") return "blocked";
    if (rs === "PUBLISHED" || rs === "COMPLETED") return "live";
    if (rs === "DELISTED") return "delisted";
    if (rs === "FAILED") {
      // A FAILED result on a still-live listing = update-failed (G7), not a lost listing.
      return data.status === "PUBLISHED" && channelProductId ? "update_failed" : "failed";
    }

    // Persisted status.
    switch (data.status) {
      case "DELISTED":
        return "delisted";
      case "FAILED":
        return "failed";
      case "PUBLISHED":
        if (data.publishError) return "update_failed"; // still live, last update failed (G7)
        return hasUnpublishedChanges ? "live_changed" : "live";
      case "READY":
        return "ready";
      case "DRAFT":
      default:
        return data.completionPercentage >= 100 ? "ready" : "draft";
    }
  })();

  // The live_changed badge is dynamic: count of pending changes, and a warning tone when the
  // channel cannot push the update yet (UPDATE_BLOCKED) so it reads distinctly from a clean "Live".
  const badge: LifecycleBadge =
    state === "live_changed"
      ? updateBlocked
        ? { label: "Live • perubahan tertahan", tone: "warning" }
        : { label: changeCount ? `Live • ${changeCount} perubahan` : "Live • ada perubahan", tone: "success" }
      : BADGES[state];

  return {
    state,
    badge,
    isLive: isLiveStatus(state),
    isDelistable: isLiveStatus(state) && !!channelProductId,
    channelUrl: state === "delisted" ? undefined : channelUrl,
    channelProductId,
    diffKnown,
    changeCount,
    updateBlocked,
  };
}

/**
 * Merchant-facing message for an idempotent publish operation (§4a). Distinguishes a
 * NO-OP ("nothing changed") from a fresh success so re-publishing an unchanged product
 * does not read as a confusing new success.
 */
export function operationMessage(op: PublishOperation | undefined): { tone: LifecycleTone; text: string } {
  switch (op) {
    case "CREATE": return { tone: "success", text: "Listing dibuat di channel." };
    case "UPDATE": return { tone: "success", text: "Listing diperbarui." };
    case "NOOP":   return { tone: "neutral", text: "Tidak ada perubahan sejak publish terakhir." };
    case "DELIST": return { tone: "neutral", text: "Listing dihapus dari channel." };
    default:       return { tone: "success", text: "Listing dipublish." };
  }
}

/** Tailwind classes for a lifecycle tone — pill background + text (light/dark). */
export const TONE_PILL: Record<LifecycleTone, string> = {
  success: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-400",
  brand:   "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  warning: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400",
  error:   "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-400",
  neutral: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

/** Tailwind dot colour for a lifecycle tone. */
export const TONE_DOT: Record<LifecycleTone, string> = {
  success: "bg-success-500",
  brand:   "bg-brand-500",
  warning: "bg-warning-500",
  error:   "bg-error-500",
  neutral: "bg-gray-400",
};

/** Whether a persisted status counts as a terminal listing state for polling purposes. */
export const TERMINAL_STATUSES: ChannelProductStatus[] = ["PUBLISHED", "FAILED", "DELISTED"];
