/**
 * P2-K · Channel Value Mapping Admin Service
 * Wraps /api/v1/admin/channel-mappings (ChannelMappingAdminController).
 * Master value → channel value mappings (e.g. material "cotton" → channel code).
 */

import {
  ChannelValueMapping,
  ChannelValueMappingRequest,
  ValueMappingListParams,
  mapRawValueMapping,
} from "../_types/channel-value-mapping";

const API_ROOT =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8888/labamap/api/v1";
const BASE = `${API_ROOT}/admin/channel-mappings`;
const JSON_HEADERS = { "Content-Type": "application/json" };

export interface ValueMappingPage {
  content: ChannelValueMapping[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch {
      /* fall back to statusText */
    }
    throw new Error(`[ChannelValueMappingService] ${res.status} ${message}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function buildQs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const ChannelValueMappingService = {
  /** GET /admin/channel-mappings?channelType=&masterFieldName=&page=&size= → PageResponse */
  async list(params?: ValueMappingListParams): Promise<ValueMappingPage> {
    const qs = buildQs({
      channelType: params?.channelType,
      masterFieldName: params?.masterFieldName,
      page: params?.page ?? 0,
      size: params?.size ?? 50,
    });
    const raw = await handleResponse<Record<string, unknown>>(
      await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS }),
    );
    const content = Array.isArray(raw?.content) ? raw.content : [];
    return {
      content: (content as unknown[]).map(mapRawValueMapping),
      page: Number(raw?.page ?? 0),
      size: Number(raw?.size ?? 50),
      totalElements: Number(raw?.totalElements ?? content.length),
      totalPages: Number(raw?.totalPages ?? 1),
      hasNext: Boolean(raw?.hasNext ?? false),
    };
  },

  /** POST /admin/channel-mappings */
  async create(request: ChannelValueMappingRequest): Promise<ChannelValueMapping> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawValueMapping);
  },

  /** PUT /admin/channel-mappings/{id} */
  async update(id: string, request: ChannelValueMappingRequest): Promise<ChannelValueMapping> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawValueMapping);
  },

  /** DELETE /admin/channel-mappings/{id} — hard delete. */
  async remove(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch {
        /* ignore */
      }
      throw new Error(`[ChannelValueMappingService] DELETE ${id}: ${res.status} ${message}`);
    }
  },
};
