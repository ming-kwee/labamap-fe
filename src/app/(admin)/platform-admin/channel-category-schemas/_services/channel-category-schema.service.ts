/**
 * Channel Category API Schema Admin Service
 * Wraps the 7 admin endpoints at /api/v1/admin/channel-category-schemas
 */

import {
  ChannelCategoryApiSchema,
  CreateChannelCategorySchemaRequest,
  UpdateChannelCategorySchemaRequest,
  mapRawSchema,
} from "../_types/channel-category-schema";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-category-schemas";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back to statusText */ }
    throw new Error(`[ChannelCategorySchemaService] ${res.status} ${message}`);
  }
  return res.json() as Promise<T>;
}

export const ChannelCategorySchemaService = {
  /**
   * GET /api/v1/admin/channel-category-schemas
   * Optional ?channelType= filter to narrow results.
   */
  async listSchemas(channelType?: string): Promise<ChannelCategoryApiSchema[]> {
    const qs = channelType ? `?channelType=${encodeURIComponent(channelType)}` : "";
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).content ?? [];
    return (arr as unknown[]).map(mapRawSchema);
  },

  /**
   * GET /api/v1/admin/channel-category-schemas/active?channelType=&categorySlug=
   * Returns the single active document for a channel×category pair.
   */
  async getActiveSchema(channelType: string, categorySlug: string): Promise<ChannelCategoryApiSchema> {
    const qs = `?channelType=${encodeURIComponent(channelType)}&categorySlug=${encodeURIComponent(categorySlug)}`;
    const res = await fetch(`${BASE}/active${qs}`, { method: "GET", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawSchema);
  },

  /**
   * GET /api/v1/admin/channel-category-schemas/{id}
   * Fetches any document — active or inactive.
   */
  async getSchema(id: string): Promise<ChannelCategoryApiSchema> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawSchema);
  },

  /**
   * POST /api/v1/admin/channel-category-schemas
   * Creates a new document. Auto-deactivates existing active doc for the same pair.
   * JOLT specs for (channelType × categorySlug) are invalidated server-side.
   */
  async createSchema(request: CreateChannelCategorySchemaRequest): Promise<ChannelCategoryApiSchema> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawSchema);
  },

  /**
   * PUT /api/v1/admin/channel-category-schemas/{id}
   * Updates extension fields + bumps version. JOLT specs auto-invalidated.
   */
  async updateSchema(id: string, request: UpdateChannelCategorySchemaRequest): Promise<ChannelCategoryApiSchema> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawSchema);
  },

  /**
   * PUT /api/v1/admin/channel-category-schemas/{id}/deactivate
   * Soft-delete — isActive=false, data kept for rollback. JOLT specs invalidated.
   */
  async deactivateSchema(id: string): Promise<ChannelCategoryApiSchema> {
    const res = await fetch(`${BASE}/${id}/deactivate`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawSchema);
  },

  /**
   * PUT /api/v1/admin/channel-category-schemas/{id}/activate
   * Rollback — re-activates this version, auto-deactivates other active for same pair.
   * JOLT specs auto-invalidated.
   */
  async activateSchema(id: string): Promise<ChannelCategoryApiSchema> {
    const res = await fetch(`${BASE}/${id}/activate`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawSchema);
  },
};
