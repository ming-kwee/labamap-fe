import {
  AdminChannelStore,
  CredentialEntry,
  CredentialFieldSchema,
  StoreConnectionRequest,
  UpdateStoreRequest,
  mapRawStore,
} from "../_types/channel-store-admin";

const BASE = "http://localhost:8888/labamap/api/v1/channel-stores";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* fall through */ }
    throw new Error(`[ChannelStoreAdminService] ${res.status} ${message}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function qs(params: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function normaliseList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const inner = obj.content ?? obj.data ?? obj.items ?? obj.results ?? [];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export const ChannelStoreAdminService = {
  /** GET /api/v1/channel-stores?organizationId=X&channelType=...&includeInactive=true */
  async listStores(
    organizationId: string,
    channelType?: string,
    includeInactive = true,
  ): Promise<AdminChannelStore[]> {
    const res = await fetch(
      `${BASE}${qs({ organizationId, channelType, includeInactive })}`,
      { headers: JSON_HEADERS },
    );
    const raw = await handleResponse<unknown>(res);
    return normaliseList(raw).map(mapRawStore);
  },

  /** GET /api/v1/channel-stores/credential-schema/{channelType} */
  async getCredentialSchema(channelType: string): Promise<CredentialFieldSchema[]> {
    const res = await fetch(`${BASE}/credential-schema/${encodeURIComponent(channelType)}`, {
      headers: JSON_HEADERS,
    });
    if (res.status === 404) return [];
    const raw = await handleResponse<unknown>(res);
    return normaliseList(raw) as CredentialFieldSchema[];
  },

  /** POST /api/v1/channel-stores?organizationId=X */
  async createStore(organizationId: string, request: StoreConnectionRequest): Promise<AdminChannelStore> {
    const res = await fetch(`${BASE}${qs({ organizationId })}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawStore);
  },

  /** PUT /api/v1/channel-stores/{storeId}?organizationId=X */
  async updateStore(
    organizationId: string,
    storeId: string,
    request: UpdateStoreRequest,
  ): Promise<AdminChannelStore> {
    const res = await fetch(`${BASE}/${encodeURIComponent(storeId)}${qs({ organizationId })}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    return handleResponse<unknown>(res).then(mapRawStore);
  },

  /** PATCH /api/v1/channel-stores/{storeId}/credentials?organizationId=X */
  async updateCredentials(
    organizationId: string,
    storeId: string,
    credentials: CredentialEntry[],
  ): Promise<AdminChannelStore> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(storeId)}/credentials${qs({ organizationId })}`,
      { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(credentials) },
    );
    return handleResponse<unknown>(res).then(mapRawStore);
  },

  /** PUT /api/v1/channel-stores/{storeId}/activate?organizationId=X */
  async activateStore(organizationId: string, storeId: string): Promise<AdminChannelStore> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(storeId)}/activate${qs({ organizationId })}`,
      { method: "PUT", headers: JSON_HEADERS },
    );
    return handleResponse<unknown>(res).then(mapRawStore);
  },

  /**
   * PUT /api/v1/channel-stores/{storeId}/api-version?organizationId=X[&apiVersion=Y]
   * Phase 3 per-store version pin. apiVersion set → pin the store to that frozen contract version;
   * omitted/empty → CLEAR the pin (store follows the channel's ACTIVE version). 404 if store not found.
   * Returns the updated store (response now carries `apiVersion`).
   */
  async setApiVersionPin(
    organizationId: string,
    storeId: string,
    apiVersion?: string,
  ): Promise<AdminChannelStore> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(storeId)}/api-version${qs({ organizationId, apiVersion })}`,
      { method: "PUT", headers: JSON_HEADERS },
    );
    return handleResponse<unknown>(res).then(mapRawStore);
  },

  /** PUT /api/v1/channel-stores/{storeId}/deactivate?organizationId=X */
  async deactivateStore(organizationId: string, storeId: string): Promise<void> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(storeId)}/deactivate${qs({ organizationId })}`,
      { method: "PUT", headers: JSON_HEADERS },
    );
    await handleResponse<void>(res);
  },

  /** DELETE /api/v1/channel-stores/{storeId}?organizationId=X */
  async deleteStore(organizationId: string, storeId: string): Promise<void> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(storeId)}${qs({ organizationId })}`,
      { method: "DELETE", headers: JSON_HEADERS },
    );
    await handleResponse<void>(res);
  },
};
