/**
 * Channel Store Service
 * API calls for channel store connections, channel product data, Step 2 schema, and publish.
 * No fallback/mock data — all calls go to the real backend.
 */

import type {
  ChannelStoreConnection,
  StoreConnectionRequest,
  ChannelProductData,
  ChannelStepSaveRequest,
  CompletionSummaryResponse,
  ChannelStepSchemaResponse,
  ChannelStepRequest,
  PublishSingleRequest,
  BatchPublishRequest,
  BatchPublishResponse,
  PublishAnalysisRequest,
  PublishAnalysisResponse,
} from "../types/channelStore";

const BASE = "http://localhost:8888/labamap/api/v1";

/** Parse the most useful message out of a non-2xx response body. */
async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.message ?? body.error ?? res.statusText;
  } catch {
    return res.text().catch(() => res.statusText);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json() as Promise<T>;
}

async function handleEmptyResponse(res: Response): Promise<void> {
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

/**
 * Normalise a raw API response object into a typed ChannelStoreConnection.
 * Exported so other services (e.g. channelOAuthService) can reuse the same mapping.
 *
 * Handles the historical Jackson `isActive`→`active` serialisation bug defensively:
 * reads whichever key is present so the frontend stays correct regardless of
 * which backend version it talks to.
 */
export function mapStore(raw: unknown): ChannelStoreConnection {
  const r = raw as Record<string, unknown>;
  return {
    storeId:        r.storeId        as string,
    channelType:    r.channelType    as ChannelStoreConnection["channelType"],
    storeName:      r.storeName      as string,
    storeUrl:       r.storeUrl       as string,
    region:         r.region         as string | undefined,
    organizationId: r.organizationId as string,
    credentials:    r.credentials    as Record<string, string>,
    isActive:       Boolean(r.isActive ?? r.active),
    displayOrder:   r.displayOrder   as number,
    connectedAt:    r.connectedAt    as string,
    lastSyncedAt:   r.lastSyncedAt   as string | undefined,
  };
}

// ─── Channel Store Connections ────────────────────────────────────────────────

export const ChannelStoreService = {
  /**
   * List all active stores for an organization
   * GET /api/v1/channel-stores?organizationId=...
   */
  listStores(organizationId: string): Promise<ChannelStoreConnection[]> {
    return fetch(`${BASE}/channel-stores?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "GET",
    }).then((r) => handleResponse<unknown[]>(r)).then((arr) => arr.map(mapStore));
  },

  /**
   * Get a single store
   * GET /api/v1/channel-stores/{storeId}?organizationId=...
   */
  getStore(storeId: string, organizationId: string): Promise<ChannelStoreConnection> {
    return fetch(
      `${BASE}/channel-stores/${encodeURIComponent(storeId)}?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "GET" }
    ).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },

  /**
   * Connect a new store
   * POST /api/v1/channel-stores?organizationId=...
   */
  connectStore(organizationId: string, request: StoreConnectionRequest): Promise<ChannelStoreConnection> {
    return fetch(`${BASE}/channel-stores?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },

  /**
   * Update store details (storeName, storeUrl, region, credentials, displayOrder)
   * PUT /api/v1/channel-stores/{storeId}?organizationId=...
   * Credentials are optional — omit to keep existing values.
   */
  updateStore(storeId: string, organizationId: string, request: Partial<StoreConnectionRequest>): Promise<ChannelStoreConnection> {
    return fetch(
      `${BASE}/channel-stores/${encodeURIComponent(storeId)}?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    ).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },

  /**
   * Deactivate (soft-delete) a store
   * PUT /api/v1/channel-stores/{storeId}/deactivate?organizationId=...
   */
  deactivateStore(storeId: string, organizationId: string): Promise<void> {
    return fetch(
      `${BASE}/channel-stores/${encodeURIComponent(storeId)}/deactivate?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "PUT" }
    ).then(handleEmptyResponse);
  },

  /**
   * Reactivate a previously deactivated store
   * PUT /api/v1/channel-stores/{storeId}/activate?organizationId=...
   */
  reactivateStore(storeId: string, organizationId: string): Promise<ChannelStoreConnection> {
    return fetch(
      `${BASE}/channel-stores/${encodeURIComponent(storeId)}/activate?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "PUT" }
    ).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },

  /**
   * Permanently delete a store and all associated data
   * DELETE /api/v1/channel-stores/{storeId}?organizationId=...
   */
  deleteStore(storeId: string, organizationId: string): Promise<void> {
    return fetch(
      `${BASE}/channel-stores/${encodeURIComponent(storeId)}?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "DELETE" }
    ).then(handleEmptyResponse);
  },

  /**
   * Update display order of a store
   * PUT /api/v1/channel-stores/{storeId}/display-order?organizationId=...
   */
  updateDisplayOrder(storeId: string, organizationId: string, displayOrder: number): Promise<ChannelStoreConnection> {
    return fetch(
      `${BASE}/channel-stores/${encodeURIComponent(storeId)}/display-order?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayOrder }),
      }
    ).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },
};

// ─── Channel Product Data ─────────────────────────────────────────────────────

export const ChannelProductDataService = {
  /**
   * Get all store data for a master product (Step 3 overview)
   * GET /api/v1/ecommerce/channel-product-data/{masterProductId}
   */
  getAllStoreData(masterProductId: string): Promise<ChannelProductData[]> {
    return fetch(`${BASE}/ecommerce/channel-product-data/${encodeURIComponent(masterProductId)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }).then((r) => handleResponse<ChannelProductData[]>(r));
  },

  /**
   * Get store data for one product × store pair
   * GET /api/v1/ecommerce/channel-product-data/{masterProductId}/{storeId}
   */
  getStoreData(masterProductId: string, storeId: string): Promise<ChannelProductData> {
    return fetch(
      `${BASE}/ecommerce/channel-product-data/${encodeURIComponent(masterProductId)}/${encodeURIComponent(storeId)}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    ).then((r) => handleResponse<ChannelProductData>(r));
  },

  /**
   * Save / upsert Step 2 form values for one store
   * POST /api/v1/ecommerce/channel-product-data/save?organizationId=...
   */
  saveChannelData(organizationId: string, request: ChannelStepSaveRequest): Promise<ChannelProductData> {
    return fetch(
      `${BASE}/ecommerce/channel-product-data/save?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    ).then((r) => handleResponse<ChannelProductData>(r));
  },

  /**
   * Get completion summary for all stores of a product
   * GET /api/v1/ecommerce/channel-product-data/{masterProductId}/completion-summary
   */
  getCompletionSummary(masterProductId: string): Promise<CompletionSummaryResponse> {
    return fetch(
      `${BASE}/ecommerce/channel-product-data/${encodeURIComponent(masterProductId)}/completion-summary`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    ).then((r) => handleResponse<CompletionSummaryResponse>(r));
  },
};

// ─── Step 2 Schema ────────────────────────────────────────────────────────────

export const ChannelSchemaService = {
  /**
   * Generate the Step 2 tabbed form schema
   * POST /api/v1/ecommerce/form-schema/channel-step
   */
  generateChannelStepSchema(request: ChannelStepRequest): Promise<ChannelStepSchemaResponse> {
    return fetch(`${BASE}/ecommerce/form-schema/channel-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<ChannelStepSchemaResponse>(r));
  },
};

// ─── Publish ──────────────────────────────────────────────────────────────────

export const PublishService = {
  /**
   * Publish a product to a single store
   * POST /api/v1/channels/publish
   */
  publishToStore(request: PublishSingleRequest): Promise<{ status: string; publishedAt: string }> {
    return fetch(`${BASE}/channels/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<{ status: string; publishedAt: string }>(r));
  },

  /**
   * Batch publish to multiple stores in parallel
   * POST /api/v1/channels/publish/batch
   */
  publishBatch(request: BatchPublishRequest): Promise<BatchPublishResponse> {
    return fetch(`${BASE}/channels/publish/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<BatchPublishResponse>(r));
  },

  /**
   * Run a full JOLT pipeline analysis for a product × store pair
   * POST /api/v1/channels/publish/analyze
   */
  analyzePublish(request: PublishAnalysisRequest): Promise<PublishAnalysisResponse> {
    return fetch(`${BASE}/channels/publish/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<PublishAnalysisResponse>(r));
  },
};
