import type { TaxonomyCategory } from "../_types/channel-mapping";

const BASE = "http://localhost:8888/labamap/api/v1";
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

function normalizeNodes(raw: unknown): Record<string, unknown>[] {
  const r = raw as Record<string, unknown>;
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (Array.isArray(r?.nodes))   return r.nodes as Record<string, unknown>[];
  if (Array.isArray(r?.content)) return r.content as Record<string, unknown>[];
  return [];
}

export const ChannelMappingService = {
  /**
   * GET /merchant-data/{channelType}/{storeId}/categories?organizationId=...&parentId=...
   *
   * Uses the same endpoint as CategoryTreePicker in Step 2 — backed by channel_category_cache
   * for Shopee/Amazon/TikTok/Lazada/eBay and channel_taxonomy_cache for Shopify.
   * Works for ALL treeCapable channels.
   *
   * The old /admin/channel-category-mappings/taxonomy/{channelType}/children endpoint only
   * served Shopify's BFS taxonomy cache and returned 404 for all other channels.
   */
  async browseTaxonomy(
    channelType: string,
    storeId: string,
    organizationId: string,
    parentId?: string,
  ): Promise<TaxonomyCategory[]> {
    // Endpoint pattern from Step 2 categoryTreeConfig (authoritative source):
    //   root:     GET /categories/{channelType}/{storeId}/root?organizationId=...
    //   children: GET /categories/{channelType}/{storeId}/children/{parentId}?organizationId=...
    // Response: { channelType, storeId, parentId, nodes: CategoryTreeNode[] }
    const ch  = encodeURIComponent(channelType);
    const sid = encodeURIComponent(storeId);
    const qs  = `organizationId=${encodeURIComponent(organizationId)}`;
    const url = parentId
      ? `${BASE}/categories/${ch}/${sid}/children/${encodeURIComponent(parentId)}?${qs}`
      : `${BASE}/categories/${ch}/${sid}/root?${qs}`;

    const res = await fetch(url, { method: "GET", headers: JSON_HEADERS });
    if (res.status === 404) {
      throw new Error(`Category tree not available for "${channelType}" — check that ChannelCategoryApiConfig is deployed for this channel.`);
    }
    const raw = await handleResponse<unknown>(res);
    const arr = normalizeNodes(raw);
    return arr.map(r => ({
      id:          String(r.id ?? ""),
      name:        String(r.name ?? ""),
      fullName:    String(r.fullName ?? r.name ?? ""),
      level:       Number(r.level ?? 0),
      isLeaf:      r.isLeaf !== undefined ? Boolean(r.isLeaf) : !Boolean(r.hasChildren),
      isRoot:      Boolean(r.isRoot),
      childrenIds: Array.isArray(r.childrenIds) ? (r.childrenIds as string[]) : [],
      ancestorIds: Array.isArray(r.ancestorIds) ? (r.ancestorIds as string[]) : [],
    }));
  },
};
