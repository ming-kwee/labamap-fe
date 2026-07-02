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

export interface RecommendationAnalysis {
  rootCause?: string;
  affectedFields?: string[];
  missingChannelRequirements?: string[];
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
