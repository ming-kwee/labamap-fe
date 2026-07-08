/**
 * Publish Diagnostics (product-aware) — POST /api/v1/channels/publish/analyze.
 *
 * A pre-flight dry-run of the full publish pipeline (nothing is published). Unlike
 * /adaptive-pattern-matching/analyze (schema-level, product-agnostic), this loads the
 * REAL product + Step-2 channel data from the DB, so it can surface data issues the
 * schema-only endpoint cannot (duplicate SKU/price, empty required values, …).
 *
 * Backend branch `bff-v8`; docs/FRONTEND-PHASE0-CATEGORY-ANCHORING-AND-PUBLISH-DIAGNOSTICS.md §2.
 *
 * Status semantics: `readyToPublish: false` is a valid **200** verdict, NOT an error.
 * Only 400 (missing masterProductId) / 500 are errors — and they return the SAME shape
 * (one ERROR issue), so one renderer handles every case.
 */

export type PublishIssueSeverity = "ERROR" | "WARNING" | "INFO";

export interface PublishIssue {
  severity: PublishIssueSeverity;
  category?: string; // e.g. "MASTER_PRODUCT" | "CHANNEL_DATA" | "MAPPING" | "TRANSFORMATION"
  field?: string;
  message: string;
  [k: string]: unknown;
}

// ─── Per-stage sub-reports (7 stages) ────────────────────────────────────────
// Known fields typed; each keeps an index signature for backend-added extras.

export interface PublishStageMasterProduct {
  source?: string; // "mongodb"
  found?: boolean;
  fieldCount?: number;
  hasVariants?: boolean;
  variantCount?: number;
  [k: string]: unknown;
}

export interface PublishStageChannelData {
  step2DataFound?: boolean;
  completionPercentage?: number;
  missingRequiredFields?: string[];
  [k: string]: unknown;
}

export interface PublishStageMergedData {
  fieldCount?: number;
  [k: string]: unknown;
}

export interface PublishStageAdaptiveMapping {
  status?: string; // "OK" | "WARNING" | "ERROR"
  overallConfidence?: number;
  totalMappings?: number;
  warnings?: string[];
  [k: string]: unknown;
}

export interface PublishStageJoltSpec {
  found?: boolean;
  source?: string; // "adaptive_pattern_matching" | "ai" | …
  operationCount?: number;
  [k: string]: unknown;
}

export interface PublishStageTransformation {
  success?: boolean;
  outputTopLevelKeys?: string[];
  transformedData?: unknown;
  [k: string]: unknown;
}

export interface PublishStagePostProcessing {
  ruleCount?: number;
  rules?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

// ─── Request / Response ──────────────────────────────────────────────────────

/** Same DTO as the publish endpoint (`PublishProductRequest`). */
export interface PublishAnalysisRequest {
  masterProductId: string; // REQUIRED
  storeId?: string; // enables Step-2 channel-data load
  channelId?: string; // optional when storeId present
  categoryId?: string; // optional — auto-derived from ProductType.categorySlug when omitted
  organizationId?: string;
}

export interface PublishAnalysisResponse {
  masterProductId?: string;
  storeId?: string;
  channelType?: string;
  categoryId?: string; // the category that was actually resolved (priority chain)
  readyToPublish?: boolean;
  readinessScore?: number; // 0–100
  masterProduct?: PublishStageMasterProduct;
  channelData?: PublishStageChannelData;
  mergedData?: PublishStageMergedData;
  adaptiveMapping?: PublishStageAdaptiveMapping;
  joltSpec?: PublishStageJoltSpec;
  transformation?: PublishStageTransformation;
  postProcessing?: PublishStagePostProcessing;
  issues?: PublishIssue[];
  suggestions?: string[];
  [k: string]: unknown;
}
