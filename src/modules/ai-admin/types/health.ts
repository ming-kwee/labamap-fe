/**
 * Types for the P0-A Health & Config dashboard and P1-L config panel.
 * Shapes verified against live `/admin/ai/embeddings/stats`, `/learning/stats`,
 * `/recommendations/stats`, and `/config` (2026-07-01).
 */

import { SourceType } from "./common";

// ─── GET /admin/ai/embeddings/stats ─────────────────────────────────────────

export interface EmbeddingsStats {
  embeddingEnabled: boolean;
  vectorStore: "pgvector" | "atlas" | string; // active store — source of truth
  embeddingProvider: "openai" | "gemini" | "disabled" | string;
  embeddingModel: string;
  dimensions: number;
  llmProvider: "anthropic" | "gemini" | string; // agent LLM
  llmModel: string;
  atlasIndexName: string; // only relevant when vectorStore === "atlas"
  counts: Record<SourceType, number> & { total: number }; // EMBEDDED counts
  sourceCounts: Record<SourceType, number>; // LIVE source-doc counts
  queriedAt: string;
}

// ─── GET /admin/ai/learning/stats?days= ─────────────────────────────────────

export interface LearningChannelStat {
  channelId?: string;
  approvalRate?: number;
  rejectionRate?: number;
  calibratedThreshold?: number;
  [k: string]: unknown;
}

export interface LearningStats {
  period: string;
  channels: LearningChannelStat[];
  fieldMappings: {
    avgSuccessRate: number; // 0–100
    totalMappings: number; // LIVE field-mapping count
    lowSuccessRate: number; // count of mappings < 50%
  };
  modelHealth: {
    mappingEmbeddingCount: number;
    joltEmbeddingCount: number;
    pendingRecommendations: number;
    agentEnabled: boolean;
    embeddingEnabled: boolean;
  };
  calibration: unknown[];
}

// ─── GET /admin/ai/recommendations/stats ────────────────────────────────────

export interface RecommendationsStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

// ─── AI mapping maturity (addendum §8.5) — derived from field-mappings ──────

export interface AiMappingMaturity {
  total: number; // field mappings authored by the AI agent (Jalur C)
  promoted: number; // verificationTier beyond UNVERIFIED
  unverified: number;
  provenSuccessRate: number; // avg live successRate across AI mappings (0–100)
  byChannel: Array<{ channelId: string; total: number; promoted: number }>;
}

// ─── GET /admin/ai/config (P1-L; also feeds P0-A degraded banners) ──────────

export interface AiConfig {
  enabled: boolean;
  llm: { provider: string; model: string; keyConfigured: boolean };
  embedding: {
    provider: string;
    model: string;
    dimensions: number;
    keyConfigured: boolean;
  };
  vectorStore: {
    provider: string;
    minSimilarityScore: number;
    searchLimit: number;
    atlasIndexName?: string;
  };
  agent: { maxTokens: number; maxToolRounds: number; agentTimeoutSeconds: number };
  recommendation: {
    autoApplyThreshold: number;
    recommendThreshold: number;
    expiryDays: number;
    /** AI enrichment of field mappings (Jalur C) — addendum §8.4. May be absent. */
    enrichMappings?: boolean;
  };
  cascade: {
    enabled: boolean;
    escalationThreshold: number;
    mode: string;
    escalationTimeoutSeconds: number;
  };
  reindexOnStartup: boolean;
}
