/**
 * AI Admin Console service — wraps all `/api/v1/admin/ai/*` endpoints.
 *
 * Design notes (from docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §5):
 *  - Two error contracts coexist. "Job" endpoints (reindex / cleanup) return
 *    HTTP 200 with a status body; callers must read `status`, not just the code.
 *    All other endpoints throw Spring's standard error JSON on 4xx/5xx.
 *  - Connection-refused (server down) is surfaced as AiApiError("server_down").
 *  - Auth is a JWT Bearer header when real auth is enabled.
 */

import { AiApiError, PageResponse } from "../types/common";
import {
  AiConfig,
  EmbeddingsStats,
  LearningStats,
  RecommendationsStats,
} from "../types/health";
import {
  CleanupResult,
  OrphansCount,
  ReindexResult,
  SearchTestParams,
  SearchTestResponse,
} from "../types/rag";
import {
  AiRecommendation,
  RecommendationListParams,
} from "../types/recommendation";
import {
  AiAgentSession,
  GenerateJoltParams,
  GenerateJoltResult,
  SessionListParams,
} from "../types/session";

const API_ROOT =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ??
  "http://localhost:8888/labamap/api/v1";
const BASE = `${API_ROOT}/admin/ai`;
const JSON_HEADERS: Record<string, string> = { "Content-Type": "application/json" };

/** Attach the admin JWT when real auth is on. Whitelist-only backend today. */
function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token =
    window.localStorage.getItem("access_token") ??
    window.localStorage.getItem("token") ??
    "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildQs(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...JSON_HEADERS, ...authHeaders(), ...(init?.headers ?? {}) },
    });
  } catch {
    // TypeError: Failed to fetch → backend unreachable.
    throw new AiApiError("AI server unreachable", "server_down");
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch {
      /* keep statusText */
    }
    const kind =
      res.status === 401 || res.status === 403
        ? "auth"
        : res.status === 404
          ? "not_found"
          : "http";
    throw new AiApiError(`${res.status} ${message}`, kind, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const AiAdminService = {
  // ─── P0-A · Health & Config ───────────────────────────────────────────────

  getEmbeddingsStats(): Promise<EmbeddingsStats> {
    return request<EmbeddingsStats>(`${BASE}/embeddings/stats`);
  },

  getLearningStats(days = 30): Promise<LearningStats> {
    return request<LearningStats>(`${BASE}/learning/stats${buildQs({ days })}`);
  },

  getRecommendationsStats(): Promise<RecommendationsStats> {
    return request<RecommendationsStats>(`${BASE}/recommendations/stats`);
  },

  getConfig(): Promise<AiConfig> {
    return request<AiConfig>(`${BASE}/config`);
  },

  // ─── P0-B · RAG Index Management ──────────────────────────────────────────

  /** Read-only orphan scan — heavier than /stats, call on-demand. */
  getOrphansCount(sourceType: string = "ALL"): Promise<OrphansCount> {
    return request<OrphansCount>(
      `${BASE}/embeddings/orphans-count${buildQs({ sourceType })}`,
    );
  },

  /** Async job — returns 200 + status body. Read `status`, not just HTTP code. */
  reindex(sourceType: string = "ALL"): Promise<ReindexResult> {
    return request<ReindexResult>(`${BASE}/reindex${buildQs({ sourceType })}`, {
      method: "POST",
    });
  },

  /** Destructive job — confirm in UI first. Returns 200 + status body. */
  cleanupOrphans(sourceType: string = "ALL"): Promise<CleanupResult> {
    return request<CleanupResult>(
      `${BASE}/embeddings/cleanup-orphans${buildQs({ sourceType })}`,
      { method: "POST" },
    );
  },

  // ─── P0-C · RAG Search Playground ─────────────────────────────────────────

  searchTest(params: SearchTestParams): Promise<SearchTestResponse> {
    const qs = buildQs({
      sourceType: params.sourceType,
      channelId: params.channelId,
      limit: params.limit,
      minScore: params.minScore,
    });
    return request<SearchTestResponse>(`${BASE}/search/test${qs}`, {
      method: "POST",
      body: JSON.stringify({ query: params.query }),
    });
  },

  // ─── P0-D · Recommendations Review Queue ──────────────────────────────────

  listRecommendations(
    params?: RecommendationListParams,
  ): Promise<PageResponse<AiRecommendation>> {
    const qs = buildQs({
      status: params?.status,
      channelId: params?.channelId,
      page: params?.page ?? 0,
      size: params?.size ?? 20,
    });
    return request<PageResponse<AiRecommendation>>(`${BASE}/recommendations${qs}`);
  },

  getRecommendation(id: string): Promise<AiRecommendation> {
    return request<AiRecommendation>(`${BASE}/recommendations/${id}`);
  },

  /** reviewedBy required; note optional — both are QUERY params. */
  approveRecommendation(
    id: string,
    reviewedBy: string,
    note?: string,
  ): Promise<AiRecommendation> {
    return request<AiRecommendation>(
      `${BASE}/recommendations/${id}/approve${buildQs({ reviewedBy, note })}`,
      { method: "POST" },
    );
  },

  /** ⚠ reason goes in the BODY, reviewedBy in the query (doc §2 P0-D). */
  rejectRecommendation(
    id: string,
    reviewedBy: string,
    reason: string,
  ): Promise<AiRecommendation> {
    return request<AiRecommendation>(
      `${BASE}/recommendations/${id}/reject${buildQs({ reviewedBy })}`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  triggerAnalysis(channelId: string): Promise<unknown> {
    return request<unknown>(
      `${BASE}/recommendations/trigger-analysis${buildQs({ channelId })}`,
      { method: "POST" },
    );
  },

  // ─── P1-E · Agent Sessions / Observability ────────────────────────────────

  /** channelId is REQUIRED — backend returns 400 without it. */
  listSessions(params: SessionListParams): Promise<PageResponse<AiAgentSession>> {
    const qs = buildQs({
      channelId: params.channelId,
      triggerType: params.triggerType,
      page: params.page ?? 0,
      size: params.size ?? 20,
    });
    return request<PageResponse<AiAgentSession>>(`${BASE}/sessions${qs}`);
  },

  /** Detail does NOT require channelId (verified). 404 → "Session not found". */
  getSession(id: string): Promise<AiAgentSession> {
    return request<AiAgentSession>(`${BASE}/sessions/${id}`);
  },

  // ─── P1-F · JOLT Generation Console ───────────────────────────────────────

  /** Slow (10–20s): agent tool-loop + retry. body = master product JSON. */
  generateJolt(params: GenerateJoltParams): Promise<GenerateJoltResult> {
    const qs = buildQs({ channelId: params.channelId, categoryId: params.categoryId });
    return request<GenerateJoltResult>(`${BASE}/generate-jolt${qs}`, {
      method: "POST",
      body: JSON.stringify(params.product),
    });
  },
};
