// ─── Channel Platform Types ───────────────────────────────────────────────────

export type ChannelId =
  | "shopify"
  | "amazon"
  | "lazada"
  | "ebay"
  | "tokopedia"
  | "facebook"
  | "shopee"
  | "tiktok"
  | "walmart";

export type ChannelStatus = "active" | "warning" | "error" | "idle" | "disconnected";

export type SyncStatus = "synced" | "pending" | "syncing" | "failed" | "draft" | "conflict";

export type SyncOperationType = "publish" | "update" | "delete" | "sync_inventory";

// ─── Channel Definition ────────────────────────────────────────────────────────

export interface ChannelPlatform {
  id: ChannelId;
  name: string;
  /** 2-letter display code e.g. "SH" */
  code: string;
  /** Tailwind background color class for the badge */
  colorClass: string;
  /** Tailwind text color class */
  textColorClass: string;
  logoUrl?: string;
  status: ChannelStatus;
  healthScore: number; // 0-100
  totalProducts: number;
  syncedProducts: number;
  pendingProducts: number;
  failedProducts: number;
  lastSyncAt: Date;
  region: string;
  currency: string;
  storeUrl?: string;
}

// ─── Channel Product Entry ─────────────────────────────────────────────────────
// Represents a master product as it appears on a specific channel

export interface ChannelProductEntry {
  /** master product id */
  masterProductId: string;
  masterSku: string;
  masterName: string;
  masterPrice: number;
  masterCurrency: string;
  masterCategory: string;
  masterBrand: string;
  thumbnailUrl?: string;
  hasVariants: boolean;
  variantCount: number;
  totalStock: number;
  /** Per-channel listing info */
  channelListings: ChannelListing[];
  publishedAt: Date;
  updatedAt: Date;
}

export interface ChannelListing {
  channelId: ChannelId;
  channelProductId: string;
  channelSku: string;
  channelPrice: number;
  channelStock: number;
  syncStatus: SyncStatus;
  lastSyncAt: Date;
  errorMessage?: string;
  warningMessages?: string[];
  channelUrl?: string;
}

// ─── Sync Operation ───────────────────────────────────────────────────────────

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  channelId: ChannelId;
  channelName: string;
  masterProductId: string;
  productName: string;
  status: SyncStatus;
  progress: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  errorCode?: string;
  retryCount: number;
  priority: "high" | "normal" | "low";
}

// ─── Inventory Row ────────────────────────────────────────────────────────────

export interface InventoryRow {
  masterProductId: string;
  masterSku: string;
  productName: string;
  thumbnailUrl?: string;
  category: string;
  totalStock: number;
  /** keyed by channelId */
  channelStock: Partial<Record<ChannelId, number | null>>;
  lowStockThreshold: number;
}

// ─── Channel Activity Feed ────────────────────────────────────────────────────

export type ActivityType = "sync_success" | "sync_failed" | "inventory_update" | "product_added" | "error_fixed" | "bulk_sync";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  message: string;
  channelId?: ChannelId;
  channelName?: string;
  productName?: string;
  timestamp: Date;
}

// ─── KPI Summary ─────────────────────────────────────────────────────────────

export interface ChannelKpiSummary {
  totalSynced: number;
  totalPending: number;
  totalFailed: number;
  totalOosAlerts: number;
  lastFullSyncAt: Date;
}
