// Types for Phase 3 — Channel Category Sync
// Corresponds to the channel_category_mappings MongoDB collection

export type SyncStatus = "MAPPED" | "DRIFTED" | "UNMAPPED" | "PENDING_IMPORT" | "PUSH_FAILED";

export type DriftResolution = "RENAME_PLATFORM" | "RENAME_CHANNEL" | "KEEP_BOTH";

/** One document in channel_category_mappings — one per (ProductCategory × ChannelStoreConnection) pair */
export interface ChannelCategoryMapping {
  id: string;
  categoryId: string;         // FK → product_categories._id
  categoryName: string;       // denormalized for display
  storeId: string;            // FK → channel_stores._id
  channelType: string;        // "shopify" | "woocommerce" | "amazon" | …
  externalId: string;         // channel's own ID for this category
  externalSlug: string | null;
  externalName: string;       // snapshot at time of last sync (used for drift detection)
  syncStatus: SyncStatus;
  importedFrom: boolean;      // true = this platform category was created by importing this channel
  lastSyncedAt: string | null;
  lastDriftAt: string | null;
  driftReason: string | null; // human-readable explanation shown in drift resolution UI
  createdAt: string;
  updatedAt: string;
}

/** Denormalized summary embedded on product_categories (no join needed for list UI) */
export interface ChannelSyncSummary {
  totalMapped: number;
  totalDrifted: number;
  totalUnmapped: number;
  lastSyncedAt: string | null;
}

/** One channel collection returned by the import preview endpoint */
export interface ImportableCollection {
  externalId: string;
  externalName: string;
  externalSlug: string | null;
  /** manual = merchant-created; smart = Shopify auto-rule (recommend skip) */
  collectionType: "manual" | "smart" | "unknown";
  productCount: number;
}

/** Mapping suggestion when connecting a second channel */
export interface FuzzyMatchSuggestion {
  externalId: string;
  externalName: string;
  externalSlug: string | null;
  /** null = no platform category matched */
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  /** 0–100 — how confident the fuzzy match is */
  matchConfidence: number;
}

// ─── API Request shapes ────────────────────────────────────────────────────────

export interface ImportCategoriesRequest {
  storeId: string;
  organizationId: string;
  /** externalIds of collections the merchant selected in step 2 of the wizard */
  selectedExternalIds: string[];
}

export interface ConfirmImportRequest {
  storeId: string;
  organizationId: string;
  /** categoryIds whose PENDING_IMPORT mappings should be promoted to MAPPED */
  categoryIds: string[];
}

export interface MapSecondChannelRequest {
  storeId: string;
  organizationId: string;
  mappings: Array<{
    externalId: string;
    externalName: string;
    externalSlug: string | null;
    categoryId: string;  // the platform category to link to
  }>;
}

export interface ResolveDriftRequest {
  resolution: DriftResolution;
}

// ─── Channels that support import (merchant-owned collections) ─────────────────
// Amazon / TikTok / eBay are TYPE 2 (fixed taxonomies owned by the channel)
// — they can only be MAPPED TO, never imported as platform categories.
export const IMPORT_CAPABLE_CHANNELS = ["shopify", "woocommerce", "etsy"] as const;
export type ImportCapableChannel = typeof IMPORT_CAPABLE_CHANNELS[number];

export function isImportCapable(channelType: string): boolean {
  return IMPORT_CAPABLE_CHANNELS.includes(channelType as ImportCapableChannel);
}
