/**
 * Types for P0-D (Recommendations Review Queue).
 * The AiRecommendation object is the trust surface — surface analysis,
 * ragEvidence and warnings so a reviewer decides consciously, not blindly.
 * Shape from recommendations doc §2 P0-D and PageResponse from live probe.
 */

export type RecommendationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | string;

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | string;

export interface TriggerContext {
  masterProductId?: string;
  publishAttemptId?: string;
  errorMessage?: string;
  joltSpecIdBefore?: string;
  sampleProductSnapshot?: unknown;
  [k: string]: unknown;
}

/**
 * A single post-processing gap suggestion. When the JOLT agent finds a required field it
 * CANNOT build via JOLT (image, tier_variation, model, dimension, …) AND no post-processing
 * rule exists yet, it emits one of these per gap. `suggestedOp` is best-effort — derived from
 * a precedent rule on another channel; empty means no precedent, developer decides.
 * Contract: docs/FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md §2.
 */
export interface PostProcessingGapSuggestion {
  field: string;
  suggestedOp?: string; // e.g. "BUILD_TIER_VARIATION" — best-effort, may be absent
  buildsTarget?: string; // channel field the op produces
  source?: string; // precedent rule, e.g. "shopee / shopee-build-tier-variation"
  [k: string]: unknown;
}

export interface RecommendationAnalysis {
  rootCause?: string;
  affectedFields?: string[];
  missingChannelRequirements?: string[]; // required missing — MAYBE fixable in JOLT alone
  postProcessingGaps?: string[]; // required fields JOLT CANNOT build → need a new rule (developer)
  postProcessingGapSuggestions?: PostProcessingGapSuggestion[]; // best-effort op per gap
  confidenceScore?: number; // 0–1
  confidenceLevel?: ConfidenceLevel;
  ragEvidence?: unknown[]; // which mappings/specs grounded the agent
  warnings?: string[]; // risks the reviewer must see
  [k: string]: unknown;
}

export interface ProposedFix {
  type?: string;
  currentJoltSpecId?: string;
  [k: string]: unknown;
}

export interface AiRecommendation {
  id: string;
  status: RecommendationStatus;
  priority?: string;
  channelId?: string;
  categoryId?: string;
  triggerType?: string;
  triggerContext?: TriggerContext;
  analysis?: RecommendationAnalysis;
  proposedFix?: ProposedFix;
  expiresAt?: string;
  agentSessionId?: string; // link to P1-E session
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  appliedJoltSpecId?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface RecommendationListParams {
  status?: RecommendationStatus;
  channelId?: string;
  page?: number;
  size?: number;
}
