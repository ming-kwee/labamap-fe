/**
 * Channel API Contract Admin Service
 * Wraps /api/v1/admin/channel-api-contracts (Phase 2c, bff-v11).
 *
 * Read-only list/get + lifecycle transitions (promote/deprecate/retire). Transitions are
 * inherently human-driven; illegal ones return 409 (message names from→to), missing contracts
 * return 404 — both surfaced via ContractApiError.status so the UI can craft precise copy.
 */

import {
  ChannelApiContract,
  ContractListParams,
  LifecycleAction,
  mapRawContract,
} from "../_types/channel-api-contract";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-api-contracts";
const JSON_HEADERS = { "Content-Type": "application/json" };

/** Error that preserves the HTTP status so callers can distinguish 409 (illegal transition) from 404. */
export class ContractApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ContractApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back to statusText */ }
    throw new ContractApiError(res.status, message);
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

export const ChannelApiContractService = {
  /** GET /admin/channel-api-contracts?channelId=&status= — list (both filters optional). */
  async listContracts(params?: ContractListParams): Promise<ChannelApiContract[]> {
    const qs = buildQs({ channelId: params?.channelId, status: params?.status });
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);

    if (process.env.NODE_ENV === "development") {
      console.log("[ChannelApiContractService] listContracts raw:", raw);
    }

    return normaliseArray(raw).map(mapRawContract);
  },

  /** GET /admin/channel-api-contracts/{channelId} — every version of one channel. */
  async listByChannel(channelId: string): Promise<ChannelApiContract[]> {
    const res = await fetch(`${BASE}/${encodeURIComponent(channelId)}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    return normaliseArray(raw).map(mapRawContract);
  },

  /** GET /admin/channel-api-contracts/{channelId}/{apiVersion} — one contract (404 if absent). */
  async getContract(channelId: string, apiVersion: string): Promise<ChannelApiContract> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(channelId)}/${encodeURIComponent(apiVersion)}`,
      { method: "GET", headers: JSON_HEADERS },
    );
    return handleResponse<unknown>(res).then(mapRawContract);
  },

  /**
   * PUT /admin/channel-api-contracts/{channelId}/{apiVersion}/{action}
   * action ∈ promote | deprecate | retire. Illegal transition → 409; unknown contract → 404.
   */
  async transition(channelId: string, apiVersion: string, action: LifecycleAction): Promise<ChannelApiContract> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(channelId)}/${encodeURIComponent(apiVersion)}/${action}`,
      { method: "PUT", headers: JSON_HEADERS },
    );
    return handleResponse<unknown>(res).then(mapRawContract);
  },

  /** → ACTIVE (demotes any other ACTIVE version of the same channel → DEPRECATED). */
  promote(channelId: string, apiVersion: string) {
    return this.transition(channelId, apiVersion, "promote");
  },

  /** → DEPRECATED. */
  deprecate(channelId: string, apiVersion: string) {
    return this.transition(channelId, apiVersion, "deprecate");
  },

  /** → RETIRED (terminal). */
  retire(channelId: string, apiVersion: string) {
    return this.transition(channelId, apiVersion, "retire");
  },
};
