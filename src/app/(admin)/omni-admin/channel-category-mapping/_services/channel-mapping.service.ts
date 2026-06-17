import type { TaxonomyCategory } from "../_types/channel-mapping";

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

export const ChannelMappingService = {
  /**
   * GET /admin/channel-category-mappings/taxonomy/{channelType}/children
   * Returns direct children of a taxonomy node for tree-capable channels.
   * Omit parentId to get root nodes.
   * Used by CategoryBrowseModal for ProductTypeRulesTab and BulkAssignTab.
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
};
