import type {
  ChannelSyncSummary,
  ChannelSyncProductPage,
  ChannelSyncStatus,
} from "../_types/channel-sync";

const BASE = "http://localhost:8888/labamap/api/v1/admin/channel-sync";
const H = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try { const b = await res.json(); msg = b.message ?? b.error ?? msg; } catch { /**/ }
    throw new Error(`[ChannelSyncService] ${res.status} ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const ChannelSyncService = {
  /** GET /admin/channel-sync/summary?organizationId= */
  async getSummary(organizationId: string): Promise<ChannelSyncSummary[]> {
    const res = await fetch(
      `${BASE}/summary?organizationId=${encodeURIComponent(organizationId)}`,
      { headers: H }
    );
    if (res.status === 404) return [];
    return handleResponse<ChannelSyncSummary[]>(res);
  },

  /** GET /admin/channel-sync/products?organizationId=&storeId=&... */
  async getProductsForStore(params: {
    organizationId: string;
    storeId: string;
    status?: ChannelSyncStatus | "ALL";
    q?: string;
    page?: number;
    size?: number;
  }): Promise<ChannelSyncProductPage> {
    const qs = new URLSearchParams({
      organizationId: params.organizationId,
      storeId:        params.storeId,
      page:           String(params.page  ?? 0),
      size:           String(params.size  ?? 10),
    });
    if (params.q)      qs.set("q",      params.q);
    if (params.status && params.status !== "ALL") qs.set("status", params.status);

    const res = await fetch(`${BASE}/products?${qs}`, { headers: H });
    if (res.status === 404) return { content: [], totalElements: 0, totalPages: 0, page: 0, size: 10 };
    return handleResponse<ChannelSyncProductPage>(res);
  },
};
