/**
 * Channel Category Mapping Service — Phase 3
 *
 * All endpoints are under /labamap/api/v1/admin/channel-category-mappings
 * See PHASE3-BACKEND-CONTRACT-CHANGES.md for required backend implementation.
 */

import type {
  ChannelCategoryMapping,
  ImportableCollection,
  FuzzyMatchSuggestion,
  ImportCategoriesRequest,
  ConfirmImportRequest,
  MapSecondChannelRequest,
  ResolveDriftRequest,
  TaxonomyCategory,
} from "../_types/channel-mapping";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-category-mappings";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* ignore */ }
    throw new Error(`[ChannelMappingService] ${res.status} ${message}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

function mapMappingDoc(raw: unknown): ChannelCategoryMapping {
  const r = raw as Record<string, unknown>;
  return {
    id:             String(r.id ?? r._id ?? ""),
    organizationId: String(r.organizationId ?? ""),
    categoryId:     String(r.categoryId ?? ""),
    categoryName:   String(r.categoryName ?? ""),
    storeId:        String(r.storeId ?? ""),
    channelType:    String(r.channelType ?? ""),
    externalId:     String(r.externalId ?? ""),
    externalSlug:   r.externalSlug != null ? String(r.externalSlug) : null,
    externalName:   String(r.externalName ?? ""),
    syncStatus:     (r.syncStatus as ChannelCategoryMapping["syncStatus"]) ?? "UNMAPPED",
    importedFrom:   Boolean(r.importedFrom),
    lastSyncedAt:   r.lastSyncedAt != null ? String(r.lastSyncedAt) : undefined,
    lastDriftAt:    r.lastDriftAt  != null ? String(r.lastDriftAt)  : null,
    driftReason:    r.driftReason  != null ? String(r.driftReason)  : null,
    createdAt:      String(r.createdAt ?? ""),
    updatedAt:      String(r.updatedAt ?? ""),
  };
}

export const ChannelMappingService = {
  /**
   * GET /admin/channel-category-mappings?organizationId=...
   * Returns all mappings for the organization (used to build the mapping grid).
   */
  async listAll(organizationId: string): Promise<ChannelCategoryMapping[]> {
    const res = await fetch(`${BASE}?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "GET", headers: JSON_HEADERS,
    });
    // 404 = backend Phase 3 endpoint not yet deployed; return empty so page still renders
    if (res.status === 404) return [];
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.content as unknown[] ?? []);
    return (arr as unknown[]).map(mapMappingDoc);
  },

  /**
   * GET /admin/channel-category-mappings?organizationId=...&categoryId=...
   * Returns mappings for a single category across all stores.
   */
  async listForCategory(organizationId: string, categoryId: string): Promise<ChannelCategoryMapping[]> {
    const res = await fetch(
      `${BASE}?organizationId=${encodeURIComponent(organizationId)}&categoryId=${encodeURIComponent(categoryId)}`,
      { method: "GET", headers: JSON_HEADERS }
    );
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as unknown[]).map(mapMappingDoc);
  },

  /**
   * GET /admin/channel-category-mappings/import/preview?storeId=...&organizationId=...
   * Fetches collections from the channel via the backend proxy (backend calls Shopify/WooCommerce API).
   * Returns the list for the merchant to review.
   */
  async previewImport(storeId: string, organizationId: string): Promise<ImportableCollection[]> {
    const res = await fetch(
      `${BASE}/import/preview?storeId=${encodeURIComponent(storeId)}&organizationId=${encodeURIComponent(organizationId)}`,
      { method: "GET", headers: JSON_HEADERS }
    );
    if (res.status === 404) {
      throw new Error("Import preview endpoint not found (404). The server may need a restart to load Phase 3 code.");
    }
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as Record<string, unknown>[]).map(r => ({
      externalId:      String(r.externalId   ?? ""),
      externalName:    String(r.externalName ?? ""),
      externalSlug:    String(r.externalSlug ?? ""),
      collectionType:  ((r.collectionType ?? r.type ?? "manual") === "smart" ? "smart" : "manual") as ImportableCollection["collectionType"],
      productCount:    r.productCount != null ? Number(r.productCount) : null,
    }));
  },

  /**
   * POST /admin/channel-category-mappings/import
   * Creates ProductCategory records + PENDING_IMPORT mapping documents.
   */
  async startImport(request: ImportCategoriesRequest): Promise<{ importedCount: number; categoryIds: string[] }> {
    const res = await fetch(`${BASE}/import`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    const data = await handleResponse<{ importedCount: number; categoryIds: string[] }>(res);
    return data ?? { importedCount: 0, categoryIds: [] };
  },

  /**
   * POST /admin/channel-category-mappings/import/confirm
   * Promotes PENDING_IMPORT → MAPPED for confirmed categories.
   */
  async confirmImport(request: ConfirmImportRequest): Promise<void> {
    const res = await fetch(`${BASE}/import/confirm`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    await handleResponse<unknown>(res);
  },

  /**
   * GET /admin/channel-category-mappings/second-channel/preview?storeId=...&organizationId=...
   * Fetches channel categories + fuzzy-matched suggestions for second-channel linking.
   */
  async previewSecondChannel(storeId: string, organizationId: string): Promise<FuzzyMatchSuggestion[]> {
    const res = await fetch(
      `${BASE}/second-channel/preview?storeId=${encodeURIComponent(storeId)}&organizationId=${encodeURIComponent(organizationId)}`,
      { method: "GET", headers: JSON_HEADERS }
    );
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as Record<string, unknown>[]).map(r => ({
      externalId:            String(r.externalId ?? ""),
      externalName:          String(r.externalName ?? ""),
      externalSlug:          r.externalSlug != null ? String(r.externalSlug) : null,
      suggestedCategoryId:   r.suggestedCategoryId != null ? String(r.suggestedCategoryId) : null,
      suggestedCategoryName: r.suggestedCategoryName != null ? String(r.suggestedCategoryName) : null,
      matchConfidence:       Number(r.matchConfidence ?? 0),
    }));
  },

  /**
   * POST /admin/channel-category-mappings/second-channel
   * Creates MAPPED mapping documents for an already-established platform category tree.
   */
  async mapSecondChannel(request: MapSecondChannelRequest): Promise<void> {
    const res = await fetch(`${BASE}/second-channel`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    await handleResponse<unknown>(res);
  },

  /**
   * PATCH /admin/channel-category-mappings/{mappingId}/drift/resolve
   * Resolves a DRIFTED mapping with the merchant's chosen resolution strategy.
   */
  async resolveDrift(mappingId: string, request: ResolveDriftRequest): Promise<ChannelCategoryMapping> {
    const res = await fetch(`${BASE}/${encodeURIComponent(mappingId)}/drift/resolve`, {
      method: "PATCH", headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
    const data = await handleResponse<unknown>(res);
    return mapMappingDoc(data ?? {});
  },

  /**
   * POST /admin/channel-category-mappings/sync-all?organizationId=...
   * Triggers a push-out sync for all MAPPED categories across all connected stores.
   */
  async syncAll(organizationId: string): Promise<{ syncedCount: number }> {
    const res = await fetch(
      `${BASE}/sync-all?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "POST", headers: JSON_HEADERS }
    );
    const data = await handleResponse<{ syncedCount: number }>(res);
    return data ?? { syncedCount: 0 };
  },

  /**
   * GET /admin/channel-category-mappings/taxonomy/{channelType}/children
   * Returns direct children of a taxonomy node for Type 2 channels (Shopify, Amazon, TikTok, eBay).
   * Omit parentId to get root nodes.
   */
  async browseTaxonomy(
    channelType: string,
    storeId: string,
    organizationId: string,
    parentId?: string,
  ): Promise<TaxonomyCategory[]> {
    const params = new URLSearchParams({ storeId, organizationId });
    if (parentId) params.set("parentId", parentId);
    const res = await fetch(
      `${BASE}/taxonomy/${encodeURIComponent(channelType)}/children?${params}`,
      { method: "GET", headers: JSON_HEADERS },
    );
    if (res.status === 404) {
      throw new Error(`Taxonomy browser not available for "${channelType}" — the backend taxonomy endpoint returned 404. Check that the channel_category_cache is seeded and the taxonomy children endpoint is deployed.`);
    }
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as Record<string, unknown>[]).map(r => ({
      id:          String(r.id ?? ""),
      name:        String(r.name ?? ""),
      fullName:    String(r.fullName ?? r.name ?? ""),
      level:       Number(r.level ?? 0),
      isLeaf:      Boolean(r.isLeaf),
      isRoot:      Boolean(r.isRoot),
      childrenIds: Array.isArray(r.childrenIds) ? (r.childrenIds as string[]) : [],
      ancestorIds: Array.isArray(r.ancestorIds) ? (r.ancestorIds as string[]) : [],
    }));
  },

  /**
   * DELETE /admin/channel-category-mappings/{mappingId}
   * Removes a mapping (severs the link without deleting the category).
   */
  async deleteMapping(mappingId: string): Promise<void> {
    const res = await fetch(`${BASE}/${encodeURIComponent(mappingId)}`, { method: "DELETE" });
    if (!res.ok) {
      let message = res.statusText;
      try { const b = await res.json(); message = b.message ?? b.error ?? message; } catch { /* ignore */ }
      throw new Error(`[ChannelMappingService] DELETE ${mappingId}: ${res.status} ${message}`);
    }
  },
};
