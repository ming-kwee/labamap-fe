/**
 * Merchant API Operation Admin Service
 * Wraps /api/v1/admin/merchant-api-operations
 * Backend status: Not Yet Implemented — UI is ready for when it ships.
 */

import {
  MerchantApiOperation,
  CreateOperationRequest,
  UpdateOperationRequest,
  OperationListParams,
  mapRawOperation,
} from "../_types/merchant-api-operation";

const BASE = "http://localhost:8888/labamap/api/v1/admin/merchant-api-operations";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall back */ }
    throw new Error(`[MerchantApiOperationService] ${res.status} ${message}`);
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

function normaliseArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const inner = obj.content ?? obj.data ?? obj.items ?? obj.results ?? [];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export const MerchantApiOperationService = {
  /**
   * GET /admin/merchant-api-operations
   * Pass enabled=false to include disabled operations alongside active ones.
   */
  async listOperations(params?: OperationListParams): Promise<MerchantApiOperation[]> {
    const qs = buildQs({
      channelType:   params?.channelType,
      operationName: params?.operationName,
      enabled:       params?.enabled,
    });
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);

    if (process.env.NODE_ENV === "development") {
      console.log("[MerchantApiOperationService] listOperations raw:", raw);
    }

    return normaliseArray(raw).map(mapRawOperation);
  },

  /** GET /admin/merchant-api-operations/{id} */
  async getOperation(id: string): Promise<MerchantApiOperation> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawOperation);
  },

  /**
   * POST /admin/merchant-api-operations
   * Returns 409 if (channelType, operationName) already exists.
   */
  async createOperation(request: CreateOperationRequest): Promise<MerchantApiOperation> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawOperation);
  },

  /** PUT /admin/merchant-api-operations/{id} */
  async updateOperation(id: string, request: UpdateOperationRequest): Promise<MerchantApiOperation> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawOperation);
  },

  /** PUT /admin/merchant-api-operations/{id}/disable */
  async disableOperation(id: string): Promise<MerchantApiOperation> {
    const res = await fetch(`${BASE}/${id}/disable`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawOperation);
  },

  /** PUT /admin/merchant-api-operations/{id}/enable */
  async enableOperation(id: string): Promise<MerchantApiOperation> {
    const res = await fetch(`${BASE}/${id}/enable`, { method: "PUT", headers: JSON_HEADERS });
    return handleResponse<unknown>(res).then(mapRawOperation);
  },

  /** DELETE /admin/merchant-api-operations/{id} — hard delete */
  async deleteOperation(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[MerchantApiOperationService] DELETE ${id}: ${res.status} ${message}`);
    }
  },
};
