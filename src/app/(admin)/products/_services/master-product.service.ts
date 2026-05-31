import type {
  MasterProduct,
  MasterProductDetail,
  ChannelDistributionCard,
  MasterProductListParams,
  MasterProductListResponse,
  ChannelSyncStatus,
} from "../_types/master-product";

const BASE      = "http://localhost:8888/labamap/api/v1/admin/master-products";
const BASE_API  = "http://localhost:8888/labamap/api/v1";
const JSON_HEADERS = { "Content-Type": "application/json" };

function mapProduct(r: Record<string, unknown>): MasterProduct {
  const channelSummary = Array.isArray(r.channelSummary) ? r.channelSummary : [];
  const attrs = (r.productAttributes ?? {}) as Record<string, unknown>;
  return {
    id:             String(r.productId ?? r.id ?? r._id ?? ""),
    organizationId: String(r.organizationId ?? ""),
    name:           String(r.name ?? attrs.name ?? ""),
    sku:            (r.sku ?? attrs.sku) != null ? String(r.sku ?? attrs.sku) : null,
    categoryId:     r.categoryId != null ? String(r.categoryId) : null,
    categoryName:   (r.categoryName ?? attrs.category) != null ? String(r.categoryName ?? attrs.category) : null,
    basePrice:      (r.basePrice ?? attrs.price ?? attrs.basePrice) != null ? Number(r.basePrice ?? attrs.price ?? attrs.basePrice) : null,
    currency:       (r.currency ?? attrs.currency) != null ? String(r.currency ?? attrs.currency) : null,
    imageUrl:       (r.imageUrl ?? attrs.mainImage ?? attrs.imageUrl) != null ? String(r.imageUrl ?? attrs.mainImage ?? attrs.imageUrl) : null,
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
  /** GET /admin/master-products/{id} — product detail + channel distribution cards */
  async getById(productId: string, organizationId: string): Promise<MasterProductDetail> {
    const [masterRes, channelRes] = await Promise.allSettled([
      fetch(`${BASE}/${encodeURIComponent(productId)}?organizationId=${encodeURIComponent(organizationId)}`, { headers: JSON_HEADERS }),
      fetch(`${BASE_API}/ecommerce/channel-product-data/${encodeURIComponent(productId)}`, { headers: JSON_HEADERS }),
    ]);

    // Master product — required, throw on error
    if (masterRes.status === "rejected") throw new Error(masterRes.reason as string);
    const mRes = masterRes.value;
    if (!mRes.ok) {
      let msg = mRes.statusText;
      try { const b = await mRes.json(); msg = b.message ?? b.error ?? msg; } catch { /**/ }
      throw new Error(`[MasterProductService] ${mRes.status} ${msg}`);
    }
    const raw = await mRes.json() as Record<string, unknown>;

    // Channel product data — optional, degrade gracefully
    let channelDataArr: Record<string, unknown>[] = [];
    if (channelRes.status === "fulfilled" && channelRes.value.ok) {
      try { channelDataArr = await channelRes.value.json() as Record<string, unknown>[]; } catch { /**/ }
    }

    // Build a storeId → channel data map for merging
    const channelDataMap = new Map<string, Record<string, unknown>>();
    for (const cd of channelDataArr) {
      if (typeof cd.storeId === "string") channelDataMap.set(cd.storeId, cd);
    }

    // Merge channelSummary (sync status) + channelProductData (price/sku/completion)
    const channelSummary = Array.isArray(raw.channelSummary)
      ? (raw.channelSummary as Record<string, unknown>[])
      : [];

    const channelDistribution: ChannelDistributionCard[] = channelSummary.map((s) => {
      const storeId = String(s.storeId ?? "");
      const cd = channelDataMap.get(storeId);
      const channelData = (cd?.channelData ?? {}) as Record<string, unknown>;
      const masterOverrides = (cd?.masterOverrides ?? {}) as Record<string, unknown>;
      const channelPrice = channelData.price ?? masterOverrides.price;
      const channelSku   = channelData.sku   ?? masterOverrides.sku;
      return {
        storeId,
        storeName:           String(s.storeName ?? ""),
        channelType:         String(s.channelType ?? ""),
        syncStatus:          (s.syncStatus as ChannelSyncStatus) ?? "DRAFT",
        lastSyncedAt:        s.lastSyncedAt != null ? String(s.lastSyncedAt) : null,
        errorMessage:        s.errorMessage != null ? String(s.errorMessage) : null,
        channelPrice:        channelPrice != null ? Number(channelPrice) : null,
        channelSku:          channelSku   != null ? String(channelSku)   : null,
        completionPercentage: Number(cd?.completionPercentage ?? 0),
      };
    });

    // Extract attributes
    const attrs = (raw.productAttributes ?? {}) as Record<string, unknown>;
    const rawTags = attrs.tags ?? attrs.tag;
    const tags: string[] = Array.isArray(rawTags)
      ? rawTags.map(String)
      : typeof rawTags === "string" && rawTags
        ? rawTags.split(/[,;]+/).map(t => t.trim()).filter(Boolean)
        : [];

    const rawImages = attrs.images ?? attrs.gallery;
    const images: string[] = Array.isArray(rawImages)
      ? rawImages.filter((u): u is string => typeof u === "string")
      : [];
    if (raw.imageUrl && !images.includes(String(raw.imageUrl))) {
      images.unshift(String(raw.imageUrl));
    }

    return {
      id:            String(raw.productId ?? raw.id ?? raw._id ?? ""),
      organizationId: String(raw.organizationId ?? ""),
      name:          String(raw.name ?? attrs.name ?? ""),
      sku:           (raw.sku ?? attrs.sku) != null ? String(raw.sku ?? attrs.sku) : null,
      categoryId:    raw.categoryId   != null ? String(raw.categoryId)   : null,
      categoryName:  raw.categoryName != null ? String(raw.categoryName) : null,
      basePrice:     (raw.basePrice ?? attrs.price ?? attrs.basePrice) != null ? Number(raw.basePrice ?? attrs.price ?? attrs.basePrice) : null,
      currency:      (raw.currency ?? attrs.currency) != null ? String(raw.currency ?? attrs.currency) : null,
      imageUrl:      (raw.imageUrl ?? attrs.mainImage ?? attrs.imageUrl) != null ? String(raw.imageUrl ?? attrs.mainImage ?? attrs.imageUrl) : null,
      description:      attrs.description   != null ? String(attrs.description)   : null,
      categorySlug:     attrs.category     != null ? String(attrs.category)     : null,
      categoryObjectId: raw.categoryObjectId != null ? String(raw.categoryObjectId) : null,
      tags:          tags.length > 0 ? tags : null,
      images:        images.length > 0 ? images : null,
      variantCount:  Number(raw.variantCount ?? 0),
      variants:      Array.isArray(raw.variants) && raw.variants.length > 0
                       ? raw.variants as Record<string, unknown>[]
                       : Array.isArray(attrs.variants)
                         ? attrs.variants as Record<string, unknown>[]
                         : [],
      status:        (raw.status as MasterProductDetail["status"]) ?? "ACTIVE",
      createdAt:     String(raw.createdAt ?? ""),
      updatedAt:     String(raw.updatedAt ?? ""),
      channelDistribution,
    };
  },

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
