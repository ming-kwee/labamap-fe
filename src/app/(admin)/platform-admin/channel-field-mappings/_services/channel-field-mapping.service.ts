/**
 * Channel Field Mapping Admin Service
 * Wraps /api/v1/admin/channel-field-mappings — APM Tier 1 management.
 */

import {
  ChannelFieldMapping,
  CreateMappingRequest,
  UpdateMappingRequest,
  MappingListParams,
  VerificationTier,
  mapRawMapping,
} from "../_types/channel-field-mapping";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-field-mappings";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back to statusText */ }
    throw new Error(`[ChannelFieldMappingService] ${res.status} ${message}`);
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

export const ChannelFieldMappingService = {
  /**
   * GET /admin/channel-field-mappings
   * Default: active-only. Pass isActive=false to include deactivated mappings.
   * Filter priority is channel-based; see API docs.
   */
  async listMappings(params?: MappingListParams): Promise<ChannelFieldMapping[]> {
    const qs = buildQs({
      channelId:        params?.channelId,
      sourceField:      params?.sourceField,
      targetField:      params?.targetField,
      strategy:         params?.strategy,
      isRequired:       params?.isRequired,
      isActive:         params?.isActive,
      minConfidence:    params?.minConfidence,
      createdBy:        params?.createdBy,
      verificationTier: params?.verificationTier,
      // The endpoint returns a PageResponse (addendum §1) that defaults to size 20.
      // The page filters client-side, so pull the full set (backend caps size at 100).
      page:             0,
      size:             100,
    });
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.content ?? []);
    return (arr as unknown[]).map(mapRawMapping);
  },

  /**
   * GET /admin/channel-field-mappings/{id}
   */
  async getMapping(id: string): Promise<ChannelFieldMapping> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawMapping);
  },

  /**
   * POST /admin/channel-field-mappings
   * Returns 409 if (channelId, sourceField, targetField) already exists.
   * Side effect: invalidates all channel_jolt_specs for channelId.
   */
  async createMapping(request: CreateMappingRequest): Promise<ChannelFieldMapping> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawMapping);
  },

  /**
   * PUT /admin/channel-field-mappings/{id}
   * Immutable: channelId, sourceField, targetField, successRate, usageCount.
   * Side effect: invalidates all channel_jolt_specs for channelId.
   */
  async updateMapping(id: string, request: UpdateMappingRequest): Promise<ChannelFieldMapping> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawMapping);
  },

  /**
   * Promote a mapping's verification tier (addendum §8.1) via PUT /{id}.
   * Used on AI-generated mappings once real publish outcomes prove them.
   */
  async promoteMapping(id: string, tier: VerificationTier): Promise<ChannelFieldMapping> {
    return this.updateMapping(id, { verificationTier: tier });
  },

  /**
   * PUT /admin/channel-field-mappings/{id}/deactivate
   * Soft-delete. JOLT specs invalidated for channelId.
   */
  async deactivateMapping(id: string): Promise<ChannelFieldMapping> {
    const res = await fetch(`${BASE}/${id}/deactivate`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawMapping);
  },

  /**
   * PUT /admin/channel-field-mappings/{id}/activate
   * Re-activate a deactivated mapping. JOLT specs invalidated.
   */
  async activateMapping(id: string): Promise<ChannelFieldMapping> {
    const res = await fetch(`${BASE}/${id}/activate`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawMapping);
  },

  /**
   * DELETE /admin/channel-field-mappings/{id}
   * Hard delete — permanent. Use deactivate for audit-safe removal.
   */
  async deleteMapping(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[ChannelFieldMappingService] DELETE ${id}: ${res.status} ${message}`);
    }
  },
};
