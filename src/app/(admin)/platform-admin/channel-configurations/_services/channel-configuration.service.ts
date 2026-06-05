/**
 * Channel Configuration Admin Service
 * Wraps /api/v1/admin/channel-configurations
 * Read + targeted sub-field updates only — no full document replace.
 * Backend status: Not Yet Implemented.
 */

import {
  ChannelConfiguration,
  FieldBoost,
  PostProcessingRule,
  FieldBoostRequest,
  PostProcessingRuleRequest,
  mapRawConfig,
  mapRawConfig as _mapRaw,
} from "../_types/channel-configuration";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-configurations";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back */ }
    throw new Error(`[ChannelConfigService] ${res.status} ${message}`);
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

export const ChannelConfigService = {
  /** GET /admin/channel-configurations — list all (sensitive fields omitted by backend) */
  async listConfigs(): Promise<ChannelConfiguration[]> {
    const res = await fetch(BASE, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);

    if (process.env.NODE_ENV === "development") {
      console.log("[ChannelConfigService] listConfigs raw:", raw);
    }

    return normaliseArray(raw).map(mapRawConfig);
  },

  /** GET /admin/channel-configurations/{channelId} */
  async getConfig(channelId: string): Promise<ChannelConfiguration> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelId)}`, {
      method: "GET", headers: JSON_HEADERS,
    });
    return handleResponse<unknown>(res).then(_mapRaw);
  },

  /**
   * PUT /admin/channel-configurations/{channelId}/field-boosts
   * Actions: add | remove | replace
   * Returns updated fieldBoosts list.
   */
  async updateFieldBoosts(channelId: string, request: FieldBoostRequest): Promise<FieldBoost[]> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelId)}/field-boosts`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    const raw = await handleResponse<unknown>(res);
    const arr = normaliseArray(raw);
    return arr.map((item) => {
      const r = item as Record<string, unknown>;
      return {
        sourcePattern:   String(r.sourcePattern  ?? ""),
        targetPattern:   String(r.targetPattern  ?? ""),
        confidenceBoost: Number(r.confidenceBoost ?? 0),
        reason:          r.reason    as string | undefined,
        condition:       r.condition as string | null | undefined,
      };
    });
  },

  /**
   * PUT /admin/channel-configurations/{channelId}/post-processing-rules
   * Actions: upsert | remove | enable | disable
   * Returns updated postProcessingRules list.
   */
  async updatePostProcessingRules(channelId: string, request: PostProcessingRuleRequest): Promise<PostProcessingRule[]> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelId)}/post-processing-rules`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    const raw = await handleResponse<unknown>(res);
    const arr = normaliseArray(raw);
    return arr.map((item) => {
      const r = item as Record<string, unknown>;
      return {
        name:       String(r.name ?? ""),
        enabled:    Boolean(r.enabled ?? true),
        operations: Array.isArray(r.operations) ? r.operations as import("../_types/channel-configuration").PostProcessingOperation[] : [],
      };
    });
  },

  /**
   * GET /admin/channel-configurations/{channelId}/field-boosts
   * Optional condition filter.
   */
  async getFieldBoosts(channelId: string, condition?: string): Promise<FieldBoost[]> {
    const qs = condition ? `?condition=${encodeURIComponent(condition)}` : "";
    const res = await fetch(`${BASE}/${encodeURIComponent(channelId)}/field-boosts${qs}`, {
      method: "GET", headers: JSON_HEADERS,
    });
    const raw = await handleResponse<unknown>(res);
    return normaliseArray(raw).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        sourcePattern:   String(r.sourcePattern  ?? ""),
        targetPattern:   String(r.targetPattern  ?? ""),
        confidenceBoost: Number(r.confidenceBoost ?? 0),
        reason:          r.reason    as string | undefined,
        condition:       r.condition as string | null | undefined,
      };
    });
  },
};
