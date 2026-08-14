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
  ChannelStepStoresResponse,
  ChannelStepRequest,
  PublishSingleRequest,
  PublishSingleResponse,
  PublishFieldError,
  PublishOperation,
  BatchPublishRequest,
  BatchPublishResponse,
  CredentialFieldSchema,
  OAuthInitiateRequest,
  OAuthInitiateResponse,
  ChannelProductStatus,
  ListingState,
  PublishHistoryEntry,
  DelistRequest,
  DelistResponse,
  PublishDiffRequest,
  PublishDiffResponse,
} from "../types/channelStore";

const BASE = "http://localhost:8888/labamap/api/v1";

/**
 * Typed API error carrying the HTTP status and a machine `code` when the backend
 * embeds one as a leading `CODE: ...` prefix in the message (e.g. the
 * form-schema/channel-step contract: 422 `PRODUCT_TYPE_MISSING: ...`, 404
 * `Master product not found: ...`). Extends Error so existing
 * `err instanceof Error` / `err.message` handling keeps working.
 */
export class ChannelApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /**
   * Structured per-field errors when the body carries them (publish pre-flight gate,
   * Spring bean-validation). Lets callers highlight individual fields instead of only
   * rendering the joined `message`.
   */
  readonly fieldErrors?: PublishFieldError[];
  constructor(message: string, status: number, code?: string, fieldErrors?: PublishFieldError[]) {
    super(message);
    this.name = "ChannelApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Extract structured per-field errors from a parsed error body. Handles both shapes:
 *  - Publish pre-flight gate: `errors[] { field, errorCode, message, suggestion }`
 *  - Spring bean-validation:  `errors[]`/`fieldErrors[] { field, defaultMessage }`
 * Returns undefined when the body has no recognisable per-field array.
 */
function extractFieldErrors(body: Record<string, unknown> | undefined): PublishFieldError[] | undefined {
  const raw = (body?.errors ?? body?.fieldErrors) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((e): PublishFieldError => {
    if (typeof e === "string") return { field: "?", message: e };
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      field: (o.field as string) ?? "?",
      errorCode: o.errorCode as string | undefined,
      // Pre-flight gate uses `message`; bean-validation uses `defaultMessage`.
      message: (o.message ?? o.defaultMessage) as string | undefined,
      suggestion: o.suggestion as string | undefined,
    };
  });
}

/** Build a typed error from a non-2xx response, extracting any `CODE:` prefix + per-field errors. */
async function buildApiError(res: Response): Promise<ChannelApiError> {
  const rawText = await res.text().catch(() => "");
  let body: Record<string, unknown> | undefined;
  try {
    body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : undefined;
  } catch {
    // Non-JSON body (e.g. plain text / HTML error page) — fall through with rawText.
  }

  if (body && typeof body === "object") {
    // Log full body so backend validation detail is visible in the browser console.
    // Use warn (not error) — many 4xx here are expected/handled (e.g. 422
    // PRODUCT_TYPE_MISSING) and shouldn't trip the Next.js error overlay.
    console.warn(`[ChannelStoreService] ${res.status} ${res.url}`, body);
  }

  const fieldErrors = extractFieldErrors(body);
  const message =
    fieldErrors?.map((e) => `${e.field}: ${e.message ?? e.suggestion ?? "?"}`).join("; ") ||
    (body?.message as string | undefined) ||
    (body?.error as string | undefined) ||
    rawText ||
    res.statusText;

  const code = /^([A-Z][A-Z0-9_]{2,}):/.exec(message.trim())?.[1];
  return new ChannelApiError(message, res.status, code, fieldErrors);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await buildApiError(res);
  return res.json() as Promise<T>;
}

async function handleEmptyResponse(res: Response): Promise<void> {
  if (!res.ok) throw await buildApiError(res);
}

/**
 * Normalise a raw API response object into a typed ChannelStoreConnection.
 * Exported so other services (e.g. channelOAuth.service) can reuse the same mapping.
 *
 * Handles the historical Jackson `isActive`→`active` serialisation bug defensively:
 * reads whichever key is present so the frontend stays correct regardless of
 * which backend version it talks to.
 */
export function mapStore(raw: unknown): ChannelStoreConnection {
  const r = raw as Record<string, unknown>;
  return {
    storeId:           r.storeId           as string,
    channelType:       r.channelType       as ChannelStoreConnection["channelType"],
    storeName:         r.storeName         as string,
    storeUrl:          r.storeUrl          as string,
    region:            r.region            as string | undefined,
    organizationId:    r.organizationId    as string,
    credentials:       r.credentials       as Record<string, string>,
    isActive:          Boolean(r.isActive ?? r.active),
    displayOrder:      r.displayOrder      as number,
    connectedAt:       r.connectedAt       as string,
    lastSyncedAt:      r.lastSyncedAt      as string | undefined,
    // Phase D + E
    reconnectRequired: r.reconnectRequired as boolean | undefined,
    connectionStatus:  r.connectionStatus  as ChannelStoreConnection["connectionStatus"],
    disconnectedAt:    r.disconnectedAt    as string | undefined,
    disconnectReason:  r.disconnectReason  as string | undefined,
    taxonomyEnabled:   r.taxonomyEnabled   != null ? Boolean(r.taxonomyEnabled)  : undefined,
    importCapable:     r.importCapable     != null ? Boolean(r.importCapable)    : undefined,
    treeCapable:       r.treeCapable       != null ? Boolean(r.treeCapable)      : undefined,
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
    const body = JSON.stringify(request);
    console.log("[ChannelStoreService] connectStore →", body);
    return fetch(`${BASE}/channel-stores?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
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

  /**
   * List ALL stores for an organization — active, inactive, disconnected.
   * GET /api/v1/channel-stores?organizationId=...&includeInactive=true
   * Use this for dashboards that need to show RECONNECT_REQUIRED / DISCONNECTED stores.
   */
  listAllStores(organizationId: string): Promise<ChannelStoreConnection[]> {
    return fetch(
      `${BASE}/channel-stores?organizationId=${encodeURIComponent(organizationId)}&includeInactive=true`,
      { method: "GET" }
    ).then((r) => handleResponse<unknown[]>(r)).then((arr) => arr.map(mapStore));
  },

  /**
   * Initiate OAuth authorization for a channel (Phase B).
   * GET /api/v1/oauth/initiate?channelType=...&organizationId=...&storeName=...
   * Returns { authorizationUrl, nonce, channelType } — redirect the user to authorizationUrl.
   * Backend handles the callback and redirects to /channels/stores?connected={channelType}.
   */
  initiateOAuth(request: OAuthInitiateRequest): Promise<OAuthInitiateResponse> {
    const params = new URLSearchParams({
      channelType:    request.channelType,
      organizationId: request.organizationId,
      storeName:      request.storeName,
      ...(request.region   ? { region:   request.region }   : {}),
      ...(request.shop     ? { shop:     request.shop }     : {}),
      ...(request.storeId  ? { storeId:  request.storeId }  : {}),
    });
    return fetch(`${BASE}/oauth/initiate?${params.toString()}`, { method: "GET" })
      .then((r) => handleResponse<OAuthInitiateResponse>(r));
  },
};

// ─── Credential Schema ────────────────────────────────────────────────────────

export const ChannelCredentialSchemaService = {
  /**
   * Fetch the credential field schema for a channel type.
   * GET /api/v1/channel-stores/credential-schema/{channelType}
   */
  getCredentialSchema(channelType: string): Promise<CredentialFieldSchema[]> {
    return fetch(`${BASE}/channel-stores/credential-schema/${encodeURIComponent(channelType)}`, {
      method: "GET",
    }).then((r) => handleResponse<CredentialFieldSchema[]>(r));
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
   * Listing-state per store for one product (P0-1) — the badge + contextual-action source.
   * GET /api/v1/ecommerce/channel-product-data/{masterProductId}/listings
   * Returns `status, channelProductId, channelUrl, publishAttempts, publishedAt, lastAttemptAt,
   * publishError, syncWorkflowId` per store. Empty array when nothing has been published yet.
   */
  getListings(masterProductId: string): Promise<ListingState[]> {
    return fetch(
      `${BASE}/ecommerce/channel-product-data/${encodeURIComponent(masterProductId)}/listings`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    ).then((r) => handleResponse<ListingState[]>(r));
  },

  /**
   * Publish history for one listing (P0-1) — append-only audit timeline, newest first.
   * GET /api/v1/ecommerce/channel-product-data/{masterProductId}/{storeId}/history
   */
  getPublishHistory(masterProductId: string, storeId: string): Promise<PublishHistoryEntry[]> {
    return fetch(
      `${BASE}/ecommerce/channel-product-data/${encodeURIComponent(masterProductId)}/${encodeURIComponent(storeId)}/history`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    ).then((r) => handleResponse<PublishHistoryEntry[]>(r));
  },

  /**
   * Poll a store's persisted status until it reaches a terminal state
   * (`PUBLISHED` / `FAILED`), mirroring the backend's POST-then-poll cadence.
   *
   * This is the frontend half of the polling contract (doc 04-sync-api-integration.md
   * §"Workflow polling"): when a publish returns a non-terminal `PROCESSING` verdict —
   * the server-side poll timed out while the sync workflow keeps running — we reconcile
   * by re-reading `channel_product_data` instead of forcing the merchant to refresh.
   * Only `PUBLISHED`/`FAILED` are terminal; everything else means keep polling. On
   * timeout the last snapshot (still non-terminal) is returned, so callers leave the
   * prior status intact — a later manual refresh still reflects the true outcome.
   */
  async pollUntilTerminal(
    masterProductId: string,
    storeId: string,
    opts: {
      intervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      /** Statuses that end the poll. Default: publish terminals (PUBLISHED/FAILED).
       *  Delist passes ["DELISTED"] — on delist failure the listing stays PUBLISHED (unchanged),
       *  so only DELISTED is terminal; a timeout leaves the prior badge intact. */
      terminalStatuses?: ChannelProductStatus[];
    } = {},
  ): Promise<ChannelProductData> {
    const intervalMs = opts.intervalMs ?? 2000;   // match the backend's 2s poll cadence
    const timeoutMs = opts.timeoutMs ?? 60000;     // FE reconciliation window
    const terminals = opts.terminalStatuses ?? ["PUBLISHED", "FAILED"];
    const deadline = Date.now() + timeoutMs;
    let last = await this.getStoreData(masterProductId, storeId);
    while (!terminals.includes(last.status) && Date.now() < deadline) {
      if (opts.signal?.aborted) break;
      await new Promise((res) => setTimeout(res, intervalMs));
      if (opts.signal?.aborted) break;
      last = await this.getStoreData(masterProductId, storeId);
    }
    return last;
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
        body: JSON.stringify({
          masterProductId:  request.masterProductId,
          storeId:          request.storeId,
          channelType:      request.channelType,
          masterOverrides:  request.masterOverrides,
          channelData:      request.channelData,
          variantOverrides: request.variantOverrides,
          ...(request.categoryId != null ? { categoryId: request.categoryId } : {}),
        }),
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
   * Lightweight store list for the Step 2 tab bar (no field `sections`).
   * GET /api/v1/ecommerce/form-schema/channel-step/stores
   * O(1) regardless of store count — the wizard lazy-loads each store's full
   * schema on demand via generateChannelStepSchema({ storeId }).
   */
  getChannelStepStores(masterProductId: string, organizationId: string): Promise<ChannelStepStoresResponse> {
    const qs = `?masterProductId=${encodeURIComponent(masterProductId)}&organizationId=${encodeURIComponent(organizationId)}`;
    return fetch(`${BASE}/ecommerce/form-schema/channel-step/stores${qs}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }).then((r) => handleResponse<ChannelStepStoresResponse>(r));
  },

  /**
   * Generate the Step 2 tabbed form schema.
   * POST /api/v1/ecommerce/form-schema/channel-step
   * Pass `storeId` in the request to fetch a single store's schema (channels: [one]);
   * omit it for the full all-stores response.
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

// ─── Merchant Data (Scenario A — lazy-load options) ──────────────────────────

export const MerchantDataService = {
  /**
   * Fetch live options for a MERCHANT_API field from the merchant's connected account.
   * Used for the lazy-load path when the backend did not eager-embed options in the schema.
   *
   * GET /api/v1/merchant-data/{channelType}/{storeId}/field-options
   *   ?fieldName=...&organizationId=...
   *
   * The backend pre-builds optionsEndpoint on the ChannelFormField for lazy fields, so
   * callers can also simply fetch BASE + field.optionsEndpoint directly in the component.
   * This method is provided for imperative calls (e.g. refresh buttons) outside the component.
   */
  fetchFieldOptions(
    channelType: string,
    storeId: string,
    fieldName: string,
    organizationId: string,
  ): Promise<Array<{ value: string; label: string }>> {
    const url =
      `${BASE}/merchant-data/${encodeURIComponent(channelType)}/${encodeURIComponent(storeId)}/field-options` +
      `?fieldName=${encodeURIComponent(fieldName)}&organizationId=${encodeURIComponent(organizationId)}`;
    return fetch(url)
      .then((r) => handleResponse<{ fieldName: string; options: Array<{ value: string; label: string }> }>(r))
      .then((d) => d.options);
  },
};

/**
 * Terminal verdict for a publish/sync response.
 * `PROCESSING` is non-terminal — the sync workflow is still running (keep polling).
 * `BLOCKED` is the idempotent-update gate (P0-2 §5.3): editing a live listing while
 * `channel-update-enabled` is off. No channel call happened — actionable, NOT a failure.
 */
export type PublishOutcome = "PUBLISHED" | "FAILED" | "PROCESSING" | "BLOCKED";

const normStatus = (s?: string | null): string => (s ?? "").trim().toUpperCase();

/**
 * Classify a publish/sync response into a terminal verdict, mirroring the backend's
 * WHITELIST-terminal contract (doc 04-sync-api-integration.md §"Workflow polling"):
 *
 *  - status/syncStatus is `BLOCKED`                                        → `BLOCKED` (idempotent-update gate)
 *  - `success === true`, or status/syncStatus is `COMPLETED`/`PUBLISHED`  → `PUBLISHED` (terminal)
 *  - status/syncStatus is `FAILED`                                         → `FAILED` (terminal)
 *  - everything else — `PROCESSING`, `PENDING`, `null`, empty, unknown     → `PROCESSING` (non-terminal)
 *
 * Only `COMPLETED`/`PUBLISHED`/`FAILED`/`BLOCKED` are terminal. An unknown or blank status is NEVER
 * read as a failure — that blacklist bug is exactly what showed a live product as "failed"
 * until a refresh. `syncStatus` wins over `status` when both are present. BLOCKED is checked first
 * because the backend may set `success:false` alongside it, and it is not a hard failure.
 */
export function classifyPublishOutcome(
  r: { success?: boolean; status?: string; syncStatus?: string } | null | undefined,
): PublishOutcome {
  if (!r) return "PROCESSING";
  const s = normStatus(r.syncStatus) || normStatus(r.status);
  if (s === "BLOCKED") return "BLOCKED";
  if (r.success === true) return "PUBLISHED";
  if (s === "COMPLETED" || s === "PUBLISHED") return "PUBLISHED";
  if (s === "FAILED") return "FAILED";
  return "PROCESSING";
}

/** Normalise the idempotent `operation` off a publish/delist response (CREATE/NOOP/UPDATE/DELIST). */
export function operationOf(
  r: { operation?: string } | null | undefined,
): PublishOperation | undefined {
  const op = normStatus(r?.operation);
  return op === "CREATE" || op === "NOOP" || op === "UPDATE" || op === "DELIST" ? op : undefined;
}

export const PublishService = {
  /**
   * Publish a product to a single store
   * POST /api/v1/channels/publish
   *
   * The response mirrors the sync API's `SyncApiResponse`; on server-side poll timeout it is
   * NON-terminal (`success:false`, `syncStatus:"PROCESSING"`). Use `classifyPublishOutcome`
   * to interpret it — do NOT treat a non-`PUBLISHED` status as a failure.
   */
  publishToStore(request: PublishSingleRequest): Promise<PublishSingleResponse> {
    return fetch(`${BASE}/channels/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<PublishSingleResponse>(r));
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
   * Delist (remove) a live listing from its channel — P0-2/G6.
   * POST /api/v1/channels/publish/delist  { masterProductId, storeId, organizationId }
   *
   * Idempotent: a 404 on the channel (listing already gone) still resolves to DELISTED.
   * On the backend a delist failure leaves the listing PUBLISHED (unchanged) — the caller
   * polls the persisted status (terminal = DELISTED) to reconcile a `PROCESSING` verdict.
   * The 409 pre-condition ("nothing to delist": not PUBLISHED or no channelProductId) surfaces
   * as a ChannelApiError so callers can guard the button on `isDelistable`.
   */
  delist(request: DelistRequest): Promise<DelistResponse> {
    return fetch(`${BASE}/channels/publish/delist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<DelistResponse>(r));
  },

  /**
   * Read-only dirty-state diff for one (product × store) — DiffEngine 02-frontend-dirty-state.
   * POST /api/v1/channels/publish/diff  { masterProductId, storeId, masterProductData? }
   *
   * Runs the desired-state extractor + diff planner + operation decider WITHOUT publishing, so it
   * is the authoritative "is anything changed since last publish?" signal (cross-step, per-store).
   * Nothing is written and no channel call is made — safe to poll/debounce. Callers should treat
   * a 404 as "endpoint not deployed yet" and fall back to always-offering the update action.
   */
  publishDiff(request: PublishDiffRequest): Promise<PublishDiffResponse> {
    return fetch(`${BASE}/channels/publish/diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }).then((r) => handleResponse<PublishDiffResponse>(r));
  },

  // Publish readiness dry-run (POST /channels/publish/analyze) lives in
  // services/publish-analyze.service.ts (`analyzePublish`) — its 400/500 bodies are a valid
  // report, not an error, so it must NOT go through handleResponse (which throws on non-2xx).
};
