export type ChannelSyncStatus = "SYNCED" | "WARNING" | "FAILED" | "DRAFT" | "SYNCING";
export type OverallSyncStatus = "synced" | "warning" | "failed" | "draft" | "syncing";
export type MasterProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export interface MasterProductChannelSummary {
  storeId: string;
  storeName: string;
  channelType: string;
  syncStatus: ChannelSyncStatus;
  lastSyncedAt?: string | null;
  errorMessage?: string | null;
}

export interface MasterProduct {
  id: string;
  organizationId: string;
  name: string;
  sku?: string | null;
  basePrice?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  /** Phase 3 (2026-06-15): flat tag list for lightweight internal organization */
  tags?: string[];
  variantCount: number;
  channelSummary: MasterProductChannelSummary[];
  status: MasterProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MasterProductListResponse {
  content: MasterProduct[];
  totalElements: number;
  totalPages: number;
  page: number;   // 0-indexed
  size: number;
}

export interface MasterProductListParams {
  organizationId: string;
  page?: number;
  size?: number;
  q?: string;
  /** Filter by tags (AND logic — all tags must match) */
  tags?: string[];
  channelType?: string;
  channelStatus?: ChannelSyncStatus | "ALL";
  status?: MasterProductStatus | "ALL";
}

/** Worst-case sync status across all channel summaries */
export function overallSyncStatus(summaries: MasterProductChannelSummary[]): OverallSyncStatus {
  if (!summaries || summaries.length === 0) return "draft";
  if (summaries.some(s => s.syncStatus === "FAILED"))  return "failed";
  if (summaries.some(s => s.syncStatus === "WARNING")) return "warning";
  if (summaries.some(s => s.syncStatus === "SYNCING")) return "syncing";
  if (summaries.every(s => s.syncStatus === "DRAFT"))  return "draft";
  return "synced";
}

/** Count summaries by status */
export function countByStatus(summaries: MasterProductChannelSummary[], status: ChannelSyncStatus): number {
  return summaries.filter(s => s.syncStatus === status).length;
}

// ─── Phase 3: Product Detail ──────────────────────────────────────────────────

/** One channel store card in the Product Detail right column */
export interface ChannelDistributionCard {
  storeId: string;
  storeName: string;
  channelType: string;
  syncStatus: ChannelSyncStatus;
  lastSyncedAt?: string | null;
  errorMessage?: string | null;
  /** Channel-specific price override (from channelData or masterOverrides) */
  channelPrice?: number | null;
  /** Channel-specific SKU override */
  channelSku?: string | null;
  completionPercentage: number;
}

/** Phase 6: Payload for POST /admin/master-products/bulk-channel-category */
export interface BulkChannelCategoryRequest {
  productIds: string[];
  storeId: string;
  channelType: string;
  /** Channel-native category leaf node ID (same as ChannelStepSaveRequest.categoryId) */
  categoryId: string;
  categoryName: string;
  categoryFullPath: string;
}

/** Full product detail returned by GET /admin/master-products/{id} combined with channel data */
export interface MasterProductDetail {
  id: string;
  organizationId: string;
  name: string;
  sku?: string | null;
  basePrice?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  tags?: string[] | null;
  images?: string[] | null;
  /** The product's assigned product type. Needed so edit mode can restore the
   *  product-type selection (and its type-specific fields + variant option axes). */
  productTypeId?: string | null;
  variantCount: number;
  variants: Array<Record<string, unknown>>;
  status: MasterProductStatus;
  createdAt: string;
  updatedAt: string;
  channelDistribution: ChannelDistributionCard[];
}
