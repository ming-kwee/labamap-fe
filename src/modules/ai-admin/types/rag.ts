/**
 * Types for P0-B (RAG Index Management) and P0-C (Search Playground).
 * Shapes verified against live `/admin/ai/embeddings/orphans-count`,
 * `/admin/ai/reindex`, `/admin/ai/embeddings/cleanup-orphans`, and
 * `/admin/ai/search/test` (2026-07-01).
 */

import { SourceType, SourceTypeOrAll } from "./common";

// ─── GET /admin/ai/embeddings/orphans-count ─────────────────────────────────

export interface OrphanDetail {
  sourceType: SourceType;
  orphanCount: number;
  liveCount: number;
  embeddedCount: number;
}

export interface OrphansCount {
  sourceType: SourceTypeOrAll;
  totalOrphans: number;
  queriedAt: string;
  details: OrphanDetail[];
}

// ─── POST /admin/ai/reindex ─────────────────────────────────────────────────
//
// "Job" endpoints return HTTP 200 with a status body — never trust the HTTP
// code alone (recommendations doc §5). status can be FAILED / SKIPPED / OK.

export interface ReindexResult {
  status?: string; // "COMPLETED" | "FAILED" | "SKIPPED" | ...
  sourceType?: string;
  total?: number;
  indexed?: number;
  skipped?: number;
  failed?: number;
  error?: string;
  [k: string]: unknown;
}

// ─── POST /admin/ai/embeddings/cleanup-orphans ──────────────────────────────

export interface CleanupResult {
  status?: string;
  sourceType?: string;
  orphansDeleted?: number;
  beforeCount?: number;
  afterCount?: number;
  error?: string;
  details?: Array<{
    sourceType: string;
    orphansDeleted: number;
    beforeCount?: number;
    afterCount?: number;
  }>;
  [k: string]: unknown;
}

// ─── POST /admin/ai/search/test ─────────────────────────────────────────────

export interface SearchHit {
  score: number;
  snippet: string;
  referenceId: string;
  channelId: string;
  categoryId: string;
}

export interface SearchTestResponse {
  query: string;
  channelId: string;
  sourceType: string;
  minScore: number; // effective threshold used by the backend
  resultCount: number;
  results: SearchHit[];
}

export interface SearchTestParams {
  query: string;
  sourceType?: SourceType;
  channelId?: string;
  limit?: number;
  minScore?: number;
}
