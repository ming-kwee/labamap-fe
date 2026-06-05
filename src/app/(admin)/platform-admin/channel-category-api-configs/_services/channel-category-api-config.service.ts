/**
 * Channel Category API Config Admin Service
 * Wraps /api/v1/admin/channel-category-api-configs
 * Supports: list, get, create, update tree-api sub-doc, update attribute-api sub-doc, enable/disable.
 * importConfig and taxonomyConfig are read-only — no update endpoints.
 */

import {
  ChannelCategoryApiConfig,
  CategoryTreeApiConfig,
  AttributeApiConfig,
  CreateChannelCategoryApiConfigRequest,
  mapRawConfig,
} from "../_types/channel-category-api-config";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-category-api-configs";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back */ }
    throw new Error(`[ChannelCategoryApiConfigService] ${res.status} ${message}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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

export const ChannelCategoryApiConfigService = {
  /**
   * GET /admin/channel-category-api-configs
   * @param channelType optional filter to a single channel
   * @param enabled  when false, returns disabled channels too (default: backend returns enabled only)
   */
  async listConfigs(channelType?: string, enabled?: boolean): Promise<ChannelCategoryApiConfig[]> {
    const params = new URLSearchParams();
    if (channelType) params.set("channelType", channelType);
    if (enabled === false) params.set("enabled", "false");
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);

    if (process.env.NODE_ENV === "development") {
      console.log("[ChannelCategoryApiConfigService] listConfigs raw:", raw);
    }

    return normaliseArray(raw).map(mapRawConfig);
  },

  /** GET /admin/channel-category-api-configs/{channelType} */
  async getConfig(channelType: string): Promise<ChannelCategoryApiConfig> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelType)}`, {
      method: "GET", headers: JSON_HEADERS,
    });
    return handleResponse<unknown>(res).then(mapRawConfig);
  },

  /**
   * POST /admin/channel-category-api-configs
   * Create a config for a new channel.
   */
  async createConfig(body: CreateChannelCategoryApiConfigRequest): Promise<ChannelCategoryApiConfig> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    return handleResponse<unknown>(res).then(mapRawConfig);
  },

  /**
   * PUT /admin/channel-category-api-configs/{channelType}/tree-api
   * Full replacement of the treeApiConfig sub-document.
   * Side effect: clears channel_category_cache for this channel.
   */
  async updateTreeApi(channelType: string, treeApiConfig: CategoryTreeApiConfig): Promise<CategoryTreeApiConfig> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelType)}/tree-api`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(treeApiConfig),
    });
    return handleResponse<CategoryTreeApiConfig>(res);
  },

  /**
   * PUT /admin/channel-category-api-configs/{channelType}/attribute-api
   * Full replacement of the attributeConfig sub-document.
   */
  async updateAttributeApi(channelType: string, attributeConfig: AttributeApiConfig): Promise<AttributeApiConfig> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelType)}/attribute-api`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(attributeConfig),
    });
    return handleResponse<AttributeApiConfig>(res);
  },

  /**
   * PUT /admin/channel-category-api-configs/{channelType}/disable
   * CategorySyncJob and CategoryDriftPollingJob will skip this channel.
   */
  async disableChannel(channelType: string): Promise<ChannelCategoryApiConfig> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelType)}/disable`, {
      method: "PUT", headers: JSON_HEADERS,
    });
    return handleResponse<unknown>(res).then(mapRawConfig);
  },

  /**
   * PUT /admin/channel-category-api-configs/{channelType}/enable
   */
  async enableChannel(channelType: string): Promise<ChannelCategoryApiConfig> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelType)}/enable`, {
      method: "PUT", headers: JSON_HEADERS,
    });
    return handleResponse<unknown>(res).then(mapRawConfig);
  },
};
