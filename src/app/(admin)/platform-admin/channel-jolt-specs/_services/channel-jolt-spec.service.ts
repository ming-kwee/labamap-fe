/**
 * Channel JOLT Spec Admin Service
 * Wraps /api/v1/admin/channel-jolt-specs
 * Backend status: Not Yet Implemented — UI is ready for when it ships.
 */

import {
  ChannelJoltSpec,
  UpdateJoltSpecRequest,
  BulkDeleteResponse,
  JoltSpecListParams,
  mapRawJoltSpec,
} from "../_types/channel-jolt-spec";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-jolt-specs";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back */ }
    throw new Error(`[ChannelJoltSpecService] ${res.status} ${message}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function buildQs(params: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function normaliseArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const inner = obj.content ?? obj.data ?? obj.items ?? obj.results ?? [];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export const ChannelJoltSpecService = {
  /**
   * GET /admin/channel-jolt-specs
   * List all specs. Note: no isActive filter — admin sees all stored specs.
   */
  async listSpecs(params?: JoltSpecListParams): Promise<ChannelJoltSpec[]> {
    const qs = buildQs({
      channelId:             params?.channelId,
      categoryId:            params?.categoryId,
      organizationId:        params?.organizationId,
      isSystemDefault:       params?.isSystemDefault,
      isManuallyConfigured:  params?.isManuallyConfigured,
    });
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);

    if (process.env.NODE_ENV === "development") {
      console.log("[ChannelJoltSpecService] listSpecs raw:", raw);
    }

    return normaliseArray(raw).map(mapRawJoltSpec);
  },

  /** GET /admin/channel-jolt-specs/{id} */
  async getSpec(id: string): Promise<ChannelJoltSpec> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawJoltSpec);
  },

  /**
   * PUT /admin/channel-jolt-specs/{id}
   * Edit joltSpec content + optionally lock/unlock from APM overwrite.
   */
  async updateSpec(id: string, request: UpdateJoltSpecRequest): Promise<ChannelJoltSpec> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawJoltSpec);
  },

  /**
   * DELETE /admin/channel-jolt-specs/{id}
   * Hard delete. Next publish/analyse regenerates a fresh spec via APM.
   */
  async deleteSpec(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[ChannelJoltSpecService] DELETE ${id}: ${res.status} ${message}`);
    }
  },

  /**
   * DELETE /admin/channel-jolt-specs?channelId=...&organizationId=...
   * Bulk delete all specs for a channel (force full APM regeneration).
   * channelId is required; organizationId is optional.
   */
  async bulkDeleteByChannel(channelId: string, organizationId?: string): Promise<BulkDeleteResponse> {
    const qs = buildQs({ channelId, organizationId });
    const res = await fetch(`${BASE}${qs}`, { method: "DELETE", headers: JSON_HEADERS });
    return handleResponse<BulkDeleteResponse>(res);
  },
};
