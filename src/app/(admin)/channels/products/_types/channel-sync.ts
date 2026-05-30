export type ChannelSyncStatus = "SYNCED" | "WARNING" | "FAILED" | "DRAFT" | "SYNCING";

export interface ChannelSyncTopError {
  masterProductId: string;
  productName: string;
  errorMessage: string;
}

/** Per-store health card data — GET /admin/channel-sync/summary */
export interface ChannelSyncSummary {
  storeId: string;
  storeName: string;
  channelType: string;
  totalProducts: number;
  synced: number;
  warnings: number;
  failed: number;
  draft: number;
  syncing: number;
  /** 0-100 — synced * 100 / totalProducts */
  health: number;
  topErrors: ChannelSyncTopError[];
}

/** One row in the per-store product table — GET /admin/channel-sync/products */
export interface ChannelSyncProduct {
  masterProductId: string;
  productName: string;
  masterSku: string | null;
  imageUrl: string | null;
  variantCount: number;
  syncStatus: ChannelSyncStatus;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  channelSku: string | null;
  channelPrice: number | null;
}

export interface ChannelSyncProductPage {
  content: ChannelSyncProduct[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
