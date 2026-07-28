/**
 * Publish-Trace Inspector — POST /api/v1/channels/publish/trace.
 *
 * A dry-run that returns a STAGE-BY-STAGE snapshot of the publish pipeline
 * (merge → JOLT → staging → post-processing → channelAttributes) WITHOUT calling
 * the channel API or writing the DB. Answers "why is field X missing/wrong in the
 * channel payload?" — turning 5–7 layers of archaeology into a single lookup.
 *
 * Read-only + repeatable. Request body is IDENTICAL to the publish endpoint.
 *
 * docs/FRONTEND-PUBLISH-TRACE-INSPECTOR.md
 * docs/product/07-publishing-engine/01-guides/14-publish-trace-inspector.md
 *
 * Status semantics: 200 OK for any trace that RAN (issues live in the CONTENT, not
 * the HTTP status). 500 returns the SAME shape with `warnings:["Trace failed: ..."]`.
 * Empty `masterProductData` → 200 with `warnings:["masterProductData is required ..."]`.
 * Null-valued fields are omitted by the backend (@JsonInclude(NON_NULL)).
 */

/** Same DTO as the publish endpoint (`PublishProductRequest`). */
export interface PublishTraceRequest {
  masterProductId: string;
  /** Master product fields — the transform's starting point. Without it the response is warnings-only. */
  masterProductData?: Record<string, unknown>;
  /** e.g. "shopee", "tiktokshop", "shopify". */
  channelId?: string;
  /** Store instance, e.g. "shopee-shopee-01" — loads Step-2 channelData/overrides. */
  storeId?: string;
  organizationId?: string;
}

/**
 * Which JOLT spec won resolution — the single most common root cause.
 * `generatedBy: "ai-agent-v1"` = generated (can silently drop fields that were not
 * mapped master→apiSchema); `"system-default"` = seed spec.
 */
export interface PublishTraceJoltSpec {
  /** `channel_jolt_specs` | `request` | `none`. */
  source?: string;
  categoryId?: string;
  generatedBy?: string;
  version?: string;
  operations?: number;
  [k: string]: unknown;
}

/** One post-processing rule, captured per-rule in priority order. */
export interface PublishTracePostProcessingRule {
  rule?: string;
  priority?: number;
  source?: string;
  target?: string;
  keysAdded?: string[];
  keysRemoved?: string[];
  /** Deep-copied so a later rule cannot overwrite this snapshot. */
  targetValueAfter?: unknown;
  [k: string]: unknown;
}

/** One final channel attribute, exactly as `buildChannelAttributes` produced it. */
export interface PublishTraceChannelAttribute {
  chnlAttrName?: string;
  attrId?: string;
  type?: string;
  /** true → EXCLUDED from the channel body by the sync-service. */
  isSupportField?: boolean;
  value?: string;
  [k: string]: unknown;
}

export interface PublishTraceResponse {
  masterProductId?: string;
  channelId?: string;
  storeId?: string;
  /** Master category slug used for the JOLT lookup. */
  resolvedCategory?: string;
  /** Native channel category id (e.g. Shopee `300242`) from Step-2. */
  channelCategoryId?: string;
  joltSpec?: PublishTraceJoltSpec;
  /** Data after merging master + Step-2 (transform input). */
  afterMerge?: Record<string, unknown>;
  /** JOLT output, before post-processing — reveals which fields JOLT dropped. */
  afterJolt?: Record<string, unknown>;
  /** Reserved `_`-keys staged JOLT-independently (`_sourceImages`, `_channelCategoryId`, …). */
  stagedKeys?: string[];
  postProcessing?: PublishTracePostProcessingRule[];
  /** Document after all post-processing rules. */
  afterPostProcessing?: Record<string, unknown>;
  channelAttributes?: PublishTraceChannelAttribute[];
  /** `isSupportField=true` attribute names — EXCLUDED from the channel body. */
  supportFieldsExcludedBySync?: string[];
  /** `_`-keys stripped by `buildChannelAttributes` (never reach the body). */
  stagingKeysStripped?: string[];
  /** Includes v1 fidelity notes. */
  warnings?: string[];
  [k: string]: unknown;
}
