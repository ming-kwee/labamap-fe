/**
 * Types for P1-E (Agent Sessions / Observability) and P1-F (JOLT Generation).
 * Shapes verified against live `/admin/ai/sessions` (2026-07-01). Note: live
 * sessions are all FAILED (Gemini quota), so ragContext/agentSteps/summary/
 * totalTokensUsed arrive null — the populated shape follows the doc (§P1-E).
 */

// ─── GET /admin/ai/sessions (channelId REQUIRED) · /sessions/{id} ────────────

export interface RagContext {
  retrievedJoltSpecs?: number;
  retrievedFieldMappings?: number;
  topSimilarityScore?: number;
  [k: string]: unknown;
}

/** One tool-call in the agent's reasoning trace. Shape kept flexible. */
export type AgentStep = Record<string, unknown>;

export type SessionStatus = "COMPLETED" | "FAILED" | "RUNNING" | string;

/**
 * Outcome of the agent's attempt to write its JOLT spec (audit trail; backend
 * commit 2d09e96). `SKIPPED_PROTECTED` = the target spec is human-owned
 * (approved/manual), so auto-apply was skipped rather than overwriting it.
 */
export type ApplyOutcome =
  | "AUTO_APPLIED"
  | "SKIPPED_PROTECTED"
  | "RECOMMENDATION_CREATED"
  | "MANUAL_REVIEW_REQUIRED";

export interface AiAgentSession {
  id: string;
  triggerType: string; // e.g. "JOLT_GENERATION"
  channelId: string;
  categoryId?: string | null;
  status: SessionStatus;
  /** @Indexed audit field — how the agent's spec write resolved (may be null for non-write triggers). */
  applyOutcome?: ApplyOutcome | null;
  ragContext?: RagContext | null; // grounding proof (null on early failure)
  agentSteps?: AgentStep[] | null;
  summary?: unknown;
  totalTokensUsed?: number | null; // cost
  durationMs?: number | null;
  errorMessage?: string | null;
  createdAt?: string;
  completedAt?: string;
  [k: string]: unknown;
}

export interface SessionListParams {
  channelId: string; // REQUIRED — backend 400s without it
  triggerType?: string;
  page?: number;
  size?: number;
}

// ─── POST /admin/ai/generate-jolt (P1-F) ────────────────────────────────────

export type GenerateStatus =
  | "AUTO_APPLIED"
  | "RECOMMENDATION_CREATED"
  | "MANUAL_REVIEW_REQUIRED"
  | "AGENT_FAILED"
  // Auto-apply blocked because the target spec is human-owned (manually configured
  // or approved). A human *approve* may still overwrite. Backend commit f6c7b5e.
  | "SKIPPED_PROTECTED"
  | string;

export interface GenerateJoltResult {
  status: GenerateStatus;
  confidenceScore?: number;
  proposedJoltSpec?: unknown; // AUTO_APPLIED now includes this (addendum §1)
  joltSpecId?: string; // id of the written spec when AUTO_APPLIED
  /** May be a plain string OR a structured object (e.g. {rules, designDecisions, limitations}). */
  explanation?: string | Record<string, unknown>;
  validationSummary?: unknown;
  agentSessionId?: string;
  errorMessage?: string;
  [k: string]: unknown;
}

export interface GenerateJoltParams {
  channelId: string;
  categoryId: string;
  product: unknown; // master product JSON (request body)
  /**
   * Optional (Phase 0B, backend `bff-v8`). When present, the backend derives the
   * category from ProductType.categorySlug and `categoryId` becomes a fallback.
   * Sent as the `productTypeId` query param on POST /admin/ai/generate-jolt.
   */
  productTypeId?: string;
}

// ─── GET /admin/ai/sample-master-product (seed "Master Product (JSON)" input) ─
// Backend update #2 (2026-07-08): response is now an envelope `{ sample, meta }`
// (was raw sample JSON), and the sample includes variant dimensions from
// ProductType.variantDimensions as variants[0].<code>.

/** Composition summary of the generated sample — drives an accurate UI label. */
export interface SampleMasterProductMeta {
  globalFieldCount: number; // global/common fields (name, price, sku, …)
  typeSpecificFieldCount: number; // type-specific fields = ProductType.attributeCount
  variantDimensions: string[]; // variation axes, e.g. ["color", "size"]
  hasVariants: boolean; // whether the sample has variants[0].*
}

/** `.sample` seeds the textarea (editable); `.meta` describes the composition. */
export interface SampleMasterProductResponse {
  sample: Record<string, unknown>;
  meta: SampleMasterProductMeta;
}
