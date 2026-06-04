/**
 * Field Semantic Knowledge Admin Service
 * Wraps /api/v1/admin/field-semantic-knowledge — APM Tiers 2/3/4 knowledge base.
 */

import {
  FieldSemanticKnowledge,
  CreateKnowledgeRequest,
  UpdateKnowledgeRequest,
  KnowledgeListParams,
  mapRawKnowledge,
} from "../_types/field-semantic-knowledge";

const BASE = "http://localhost:8888/labamap/api/v1/admin/field-semantic-knowledge";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back */ }
    throw new Error(`[FieldSemanticKnowledgeService] ${res.status} ${message}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function buildQs(params: Record<string, string | boolean | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const FieldSemanticKnowledgeService = {
  /**
   * GET /admin/field-semantic-knowledge
   * Pass isActive=false per API doc — "include deactivated" returns all records (active + inactive).
   * Status filtering (active / inactive / all) is done client-side in the page component.
   */
  async listEntries(params?: KnowledgeListParams): Promise<FieldSemanticKnowledge[]> {
    const qs = buildQs({
      semanticType:  params?.semanticType,
      category:      params?.category,
      channelId:     params?.channelId,
      search:        params?.search,
      isCommon:      params?.isCommon,
      isRequired:    params?.isRequired,
      // "pass isActive=false to include deactivated" — ensures all records are returned
      isActive:      params?.isActive ?? false,
      minConfidence: params?.minConfidence,
    });
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);

    // Normalise any Spring Boot response shape to a plain array (same pattern as attribute.service.ts)
    let arr: unknown[];
    if (Array.isArray(raw)) {
      arr = raw;
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const inner = obj.content ?? obj.data ?? obj.items ?? obj.entries ?? obj.results ?? [];
      arr = Array.isArray(inner) ? inner : [];
    } else {
      arr = [];
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[FieldSemanticKnowledgeService] listEntries raw response:", raw);
      console.log("[FieldSemanticKnowledgeService] parsed array length:", arr.length);
      if (arr.length > 0) {
        console.log("[FieldSemanticKnowledgeService] first entry keys:", Object.keys(arr[0] as object));
        console.log("[FieldSemanticKnowledgeService] first entry:", arr[0]);
      }
    }

    return arr.map(mapRawKnowledge);
  },

  /**
   * GET /admin/field-semantic-knowledge/{id}
   */
  async getEntry(id: string): Promise<FieldSemanticKnowledge> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawKnowledge);
  },

  /**
   * GET /admin/field-semantic-knowledge/by-name/{fieldName}
   */
  async getByName(fieldName: string): Promise<FieldSemanticKnowledge> {
    const res = await fetch(`${BASE}/by-name/${encodeURIComponent(fieldName)}`, {
      method: "GET", headers: JSON_HEADERS,
    });
    return handleResponse<unknown>(res).then(mapRawKnowledge);
  },

  /**
   * POST /admin/field-semantic-knowledge
   * Returns 409 if fieldName already exists.
   * No JOLT invalidation — changes affect APM match quality on next analyse call.
   */
  async createEntry(request: CreateKnowledgeRequest): Promise<FieldSemanticKnowledge> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawKnowledge);
  },

  /**
   * PUT /admin/field-semantic-knowledge/{id}
   * fieldName is immutable — backend ignores it if included.
   * No JOLT invalidation.
   */
  async updateEntry(id: string, request: UpdateKnowledgeRequest): Promise<FieldSemanticKnowledge> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawKnowledge);
  },

  /** PUT /admin/field-semantic-knowledge/{id}/deactivate */
  async deactivateEntry(id: string): Promise<FieldSemanticKnowledge> {
    const res = await fetch(`${BASE}/${id}/deactivate`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawKnowledge);
  },

  /** PUT /admin/field-semantic-knowledge/{id}/activate */
  async activateEntry(id: string): Promise<FieldSemanticKnowledge> {
    const res = await fetch(`${BASE}/${id}/activate`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawKnowledge);
  },

  /** DELETE /admin/field-semantic-knowledge/{id} — hard delete */
  async deleteEntry(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[FieldSemanticKnowledgeService] DELETE ${id}: ${res.status} ${message}`);
    }
  },
};
