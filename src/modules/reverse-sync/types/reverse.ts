/**
 * Reverse Sync (Channel → Platform) — types
 *
 * Mirrors the backend BFF contract under `{host}/labamap/api/v1/channels/reverse`
 * (see docs/FRONTEND-REVERSE-SYNC-IMPLEMENTATION-PLAN.md §2). Reverse "pulls" product
 * data FROM a channel back INTO the platform, classifying every incoming field into
 * one of three buckets before anything is written:
 *
 *   (a) master-mapped → draft-review suggestion OR per-store override (by policy)
 *   (b) channel-only  → Step-2 `channelData`
 *   (c) discarded     → dropped (operational / unknown)
 *
 * Master GLOBAL is never overwritten silently — only an explicit Accept-suggestion writes it.
 */

// ─── Three-bucket preview rows ────────────────────────────────────────────────

/** One row in the (a) master-mapped bucket — the diff the merchant decides on. */
export interface ReverseMasterMappedField {
  channelPath: string;
  channelValue: unknown;
  masterAttrId: string;
  /** Current master value (null when master has no value yet → rendered as "new"). */
  currentMasterValue: unknown;
  /** true = differs from master; false = same; null = master had no prior value ("new"). */
  changed: boolean | null;
  note?: string | null;
}

/** One row in the (b) channel-only bucket — valid channel field with no master mapping. */
export interface ReverseChannelOnlyField {
  channelPath: string;
  channelValue: unknown;
  note?: string | null;
}

/** One row in the (c) discarded bucket — operational / unknown, dropped. */
export interface ReverseDiscardedField {
  channelPath: string;
  channelValue: unknown;
  note?: string | null;
}

export interface ReversePreviewSummary {
  masterMapped: number;
  channelOnly: number;
  discarded: number;
  wouldChangeMaster: number;
}

/** `ReversePreview` — result of `/pull` or `/preview`. */
export interface ReversePreview {
  channelType: string;
  masterProductId: string;
  storeId: string;
  masterMapped: ReverseMasterMappedField[];
  channelOnly: ReverseChannelOnlyField[];
  discarded: ReverseDiscardedField[];
  /** Structures reverse could not safely un-build — informative, NOT errors. */
  deDerivationNotes: string[];
  summary: ReversePreviewSummary;
}

// ─── Apply / review results ───────────────────────────────────────────────────

/** `ReverseApplyResult` — result of `/apply` or `/pull/apply` (writes Step-2 per-store). */
export interface ReverseApplyResult {
  masterProductId: string;
  storeId: string;
  channelType: string;
  applied: boolean;
  masterOverridesWritten: string[];
  channelDataWritten: string[];
  variantsReconciled: string[];
  discarded: number;
  preview?: ReversePreview;
}

/** `ReverseReviewResult` — result of `/review` (classify + route by policy). */
export interface ReverseReviewResult {
  masterProductId: string;
  storeId: string;
  channelType: string;
  /** master-attr ids routed to draft-review (now waiting in the Inbox). */
  suggested: string[];
  /** master-attr ids written per-store (channel-authoritative). */
  perStoreApplied: string[];
  /** master-attr ids skipped (master-authoritative / ignore). */
  skipped: string[];
}

// ─── Suggestions (draft-review inbox) ─────────────────────────────────────────

export type ReverseSuggestionStatus = "PENDING" | "ACCEPTED" | "REJECTED";

/** `ReverseSuggestion` — one draft-review card. Accept writes master GLOBAL. */
export interface ReverseSuggestion {
  id: string;
  organizationId?: string;
  masterProductId: string;
  storeId: string;
  channelType: string;
  masterAttrId: string;
  suggestedValue: unknown;
  currentValue: unknown;
  status: ReverseSuggestionStatus;
  channelProductId?: string;
  createdAt: string;
  resolvedAt?: string | null;
}

// ─── Reverse-JOLT projection (admin/debug) ────────────────────────────────────

/** `GET /jolt-spec/{channelId}` — read-only projection of channel_field_mappings⁻¹. */
export interface ReverseJoltSpec {
  channelId: string;
  operation: string;
  /** `{ channelPath: masterField }` — injective EXACT rows only. */
  spec: Record<string, string>;
  /** Many-to-one channel paths skipped from the shift. */
  ambiguousExcluded: string[];
  generatedFrom: string;
  note: string;
}

// ─── Request payloads ─────────────────────────────────────────────────────────

/** `ReversePullRequest` — body for `/pull` and `/pull/apply`. */
export interface ReversePullRequest {
  organizationId: string;
  storeId: string;
  channelProductId: string;
  /** Optional — BFF resolves from linkage when omitted. */
  masterProductId?: string;
  /** Optional — defaults to the channel config's effective apiVersion. */
  apiVersion?: string;
}

/** `ReversePreviewRequest` — body for `/preview` (payload the FE supplies). */
export interface ReversePreviewRequest {
  channelType: string;
  masterProductId: string;
  storeId: string;
  channelPayload: Record<string, unknown>;
}

/** `ReverseApplyRequest` — body for `/apply` and `/review`. */
export interface ReverseApplyRequest {
  channelType: string;
  masterProductId: string;
  storeId: string;
  organizationId: string;
  channelProductId?: string;
  channelPayload: Record<string, unknown>;
}
