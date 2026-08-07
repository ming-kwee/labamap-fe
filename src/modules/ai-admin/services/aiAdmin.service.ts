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
  AiMappingMaturity,
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
import { PostProcessingCatalog } from "../types/opCatalog";
import {
  AiAgentSession,
  GenerateJoltParams,
  GenerateJoltResult,
  SampleMasterProductResponse,
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
  } catch (e) {
    // Cancelled by the caller (Cancel button) or a client-side timeout.
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new AiApiError("Permintaan dibatalkan", "aborted");
    }
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

  /**
   * Sample master product derived from a Product Type — used to seed the "Master Product
   * (JSON)" input in the JOLT Generation Console and Publish Diagnostics (instead of a
   * hardcoded/blind example). Values are synthetic; the accurate part is the field names &
   * structure (what matching uses).
   * GET /admin/ai/sample-master-product?productTypeId=
   *
   * Backend update #2 (2026-07-08): response is the envelope `{ sample, meta }` (was raw
   * sample JSON) — populate the textarea from `.sample`, use `.meta` for an accurate
   * composition label. The sample also carries variant dimensions from
   * ProductType.variantDimensions (variants[0].<code>), so a Product Type with
   * attributeCount: 0 is NOT "global only" — it may still have color/size axes.
   * 404 (AiApiError kind "not_found") only when the catalog has no master attributes at
   * all — surface the message, do NOT fall back to a hardcoded example.
   */
  getSampleMasterProduct(
    productTypeId: string,
    opts?: { channelId?: string; includeChannelFields?: boolean },
  ): Promise<SampleMasterProductResponse> {
    // A1: opt-in — when includeChannelFields + channelId are set, the sample also carries that channel's
    // Step-2 channel-specific fields, so the schema-level path sees the real publish source picture.
    const qs = buildQs({
      productTypeId,
      channelId: opts?.includeChannelFields ? opts?.channelId : undefined,
      includeChannelFields: opts?.includeChannelFields ? true : undefined,
    });
    return request<SampleMasterProductResponse>(`${BASE}/sample-master-product${qs}`);
  },

  /**
   * Runtime kill-switch for AI Mapping Enrichment (addendum §8.4).
   * PUT /admin/ai/config/enrich-mappings?enabled= → { enrichMappings, scope, note }.
   * scope="runtime": reverts to AI_ENRICH_MAPPINGS on restart.
   */
  setEnrichMappings(enabled: boolean): Promise<{ enrichMappings: boolean; scope?: string; note?: string }> {
    return request(`${BASE}/config/enrich-mappings${buildQs({ enabled })}`, { method: "PUT" });
  },

  /**
   * AI mapping maturity (addendum §8.5) — how much the agent has enriched the
   * APM table (AI Mapping Enrichment) and how much is proven. Derived from field-mappings;
   * we fetch all and filter client-side (createdBy startsWith "ai").
   */
  async getAiMappingMaturity(): Promise<AiMappingMaturity> {
    const raw = await request<{ content?: unknown[] } | unknown[]>(
      `${API_ROOT}/admin/channel-field-mappings?size=500`,
    );
    const arr = (Array.isArray(raw) ? raw : (raw?.content ?? [])) as Array<Record<string, unknown>>;
    const ai = arr.filter((m) => {
      const by = String(m.createdBy ?? "").toLowerCase();
      return by.startsWith("ai") || m.mappingStrategy === "AI_GENERATED";
    });
    const isPromoted = (m: Record<string, unknown>) => {
      const t = m.verificationTier;
      return t != null && t !== "UNVERIFIED";
    };
    const promoted = ai.filter(isPromoted).length;
    const rates = ai.map((m) => Number(m.successRate ?? 0)).filter((n) => !Number.isNaN(n));
    const byChannelMap = new Map<string, { total: number; promoted: number }>();
    for (const m of ai) {
      const ch = String(m.channelId ?? "—");
      const e = byChannelMap.get(ch) ?? { total: 0, promoted: 0 };
      e.total += 1;
      if (isPromoted(m)) e.promoted += 1;
      byChannelMap.set(ch, e);
    }
    return {
      total: ai.length,
      promoted,
      unverified: ai.length - promoted,
      provenSuccessRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
      byChannel: [...byChannelMap.entries()]
        .map(([channelId, v]) => ({ channelId, ...v }))
        .sort((a, b) => b.total - a.total),
    };
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

  /**
   * Post-processing op catalog (engine source of truth). Lives under the publishing engine,
   * NOT /admin/ai — so it uses API_ROOT directly. Used to show a developer what a gap's
   * suggestedOp actually does (description, params, jsonExample). Cached by the caller.
   * GET /post-processing/catalog
   */
  getPostProcessingCatalog(): Promise<PostProcessingCatalog> {
    return request<PostProcessingCatalog>(`${API_ROOT}/post-processing/catalog`);
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

  /**
   * Runs the agent to analyze a channel and create recommendations. Like
   * generate-jolt this can take minutes under LLM 429 retry/backoff — pass an
   * AbortSignal to support timeout / user-cancel.
   *
   * Phase 0B parity with generate-jolt: pass `productTypeId` (the ObjectId) and let the
   * backend derive the category from ProductType.categorySlug — single source of truth, so
   * the generated JOLT is stored under the same categoryId that publish resolves. `categoryId`
   * stays available as an explicit override/fallback. `sampleProduct` (optional) is the
   * request body: a representative product so the agent analyses real field structure.
   */
  triggerAnalysis(
    params: { channelId: string; productTypeId?: string; categoryId?: string; sampleProduct?: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<unknown> {
    const qs = buildQs({
      channelId: params.channelId,
      productTypeId: params.productTypeId,
      categoryId: params.categoryId,
    });
    return request<unknown>(`${BASE}/recommendations/trigger-analysis${qs}`, {
      method: "POST",
      body: params.sampleProduct ? JSON.stringify(params.sampleProduct) : undefined,
      signal,
    });
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

  /**
   * Best-effort "latest agent activity" across channels (addendum §3.1).
   * The sessions list requires channelId (no global endpoint), so we probe each
   * channel's most-recent session in parallel and return the globally newest.
   * Failures are ignored (best-effort); returns null if nothing found.
   */
  async getMostRecentSession(channels: string[]): Promise<AiAgentSession | null> {
    const results = await Promise.allSettled(
      channels.map((ch) => this.listSessions({ channelId: ch, page: 0, size: 1 })),
    );
    let latest: AiAgentSession | null = null;
    const ts = (s?: AiAgentSession | null) => (s?.createdAt ? new Date(s.createdAt).getTime() : 0);
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const s = r.value.content?.[0];
      if (s && ts(s) > ts(latest)) latest = s;
    }
    return latest;
  },

  // ─── P1-F · JOLT Generation Console ───────────────────────────────────────

  /**
   * Slow: agent tool-loop + LLM retry/backoff can take minutes when the LLM is
   * rate-limited (429). Pass an AbortSignal to support timeout / user-cancel.
   * body = master product JSON.
   */
  generateJolt(params: GenerateJoltParams, signal?: AbortSignal): Promise<GenerateJoltResult> {
    // productTypeId (when set) lets the backend derive the category from
    // ProductType.categorySlug; categoryId stays as an explicit override/fallback.
    const qs = buildQs({
      channelId: params.channelId,
      categoryId: params.categoryId,
      productTypeId: params.productTypeId,
    });
    return request<GenerateJoltResult>(`${BASE}/generate-jolt${qs}`, {
      method: "POST",
      body: JSON.stringify(params.product),
      signal,
    });
  },
};
