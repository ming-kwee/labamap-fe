import type {
  MasterProduct,
  MasterProductListParams,
  MasterProductListResponse,
} from "../_types/master-product";

const BASE = "http://localhost:8888/labamap/api/v1/admin/master-products";
const JSON_HEADERS = { "Content-Type": "application/json" };

function mapProduct(r: Record<string, unknown>): MasterProduct {
  const channelSummary = Array.isArray(r.channelSummary) ? r.channelSummary : [];
  return {
    id:             String(r.id ?? r._id ?? ""),
    organizationId: String(r.organizationId ?? ""),
    name:           String(r.name ?? ""),
    sku:            r.sku != null ? String(r.sku) : null,
    categoryId:     r.categoryId != null ? String(r.categoryId) : null,
    categoryName:   r.categoryName != null ? String(r.categoryName) : null,
    basePrice:      r.basePrice != null ? Number(r.basePrice) : null,
    currency:       r.currency != null ? String(r.currency) : null,
    imageUrl:       r.imageUrl != null ? String(r.imageUrl) : null,
    variantCount:   Number(r.variantCount ?? 0),
    channelSummary: (channelSummary as Record<string, unknown>[]).map(s => ({
      storeId:       String(s.storeId ?? ""),
      storeName:     String(s.storeName ?? ""),
      channelType:   String(s.channelType ?? ""),
      syncStatus:    (s.syncStatus as MasterProduct["channelSummary"][number]["syncStatus"]) ?? "DRAFT",
      lastSyncedAt:  s.lastSyncedAt != null ? String(s.lastSyncedAt) : null,
      errorMessage:  s.errorMessage != null ? String(s.errorMessage) : null,
    })),
    status:    (r.status as MasterProduct["status"]) ?? "ACTIVE",
    createdAt: String(r.createdAt ?? ""),
    updatedAt: String(r.updatedAt ?? ""),
  };
}

const EMPTY_PAGE: MasterProductListResponse = {
  content: [], totalElements: 0, totalPages: 0, page: 0, size: 10,
};

export const MasterProductService = {
  async list(params: MasterProductListParams): Promise<MasterProductListResponse> {
    const qs = new URLSearchParams({
      organizationId: params.organizationId,
      page:  String(params.page  ?? 0),
      size:  String(params.size  ?? 10),
    });
    if (params.q)              qs.set("q",             params.q);
    if (params.categoryId)     qs.set("categoryId",    params.categoryId);
    if (params.channelType)    qs.set("channelType",   params.channelType);
    if (params.channelStatus && params.channelStatus !== "ALL")
      qs.set("channelStatus", params.channelStatus);
    if (params.status && params.status !== "ALL")
      qs.set("status", params.status);

    const res = await fetch(`${BASE}?${qs}`, { method: "GET", headers: JSON_HEADERS });

    // Backend endpoint not yet deployed — return empty gracefully
    if (res.status === 404) return EMPTY_PAGE;

    if (!res.ok) {
      let msg = res.statusText;
      try { const b = await res.json(); msg = b.message ?? b.error ?? msg; } catch { /* ignore */ }
      throw new Error(`[MasterProductService] ${res.status} ${msg}`);
    }

    const raw = await res.json();
    const arr: Record<string, unknown>[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.content) ? raw.content : [];

    return {
      content:       arr.map(mapProduct),
      totalElements: Number(raw.totalElements ?? arr.length),
      totalPages:    Number(raw.totalPages    ?? 1),
      page:          Number(raw.number ?? raw.page ?? 0),
      size:          Number(raw.size ?? 10),
    };
  },
};
