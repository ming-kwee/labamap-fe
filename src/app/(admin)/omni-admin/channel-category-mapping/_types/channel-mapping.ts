// Types for Phase 3 — Channel Category Sync
// Corresponds to the channel_category_mappings MongoDB collection

export type SyncStatus = "MAPPED" | "DRIFTED" | "UNMAPPED" | "PENDING_IMPORT" | "PUSH_FAILED";

export type DriftResolution = "RENAME_PLATFORM" | "RENAME_CHANNEL" | "KEEP_BOTH";

/** One document in channel_category_mappings — one per (ProductCategory × ChannelStoreConnection) pair */
export interface ChannelCategoryMapping {
  id: string;
  organizationId: string;
  categoryId: string;         // FK → product_categories._id
  categoryName: string;       // denormalized for display
  storeId: string;            // FK → channel_stores._id
  channelType: string;        // "shopify" | "woocommerce" | "amazon" | …
  externalId: string;         // Shopify: "gid://shopify/TaxonomyCategory/aa-1-1-1"
  externalSlug: string | null;  // null for all taxonomy channels
  externalName: string;       // snapshot of channel category name — display only for taxonomy channels
  syncStatus: SyncStatus;
  importedFrom: boolean;      // always false for taxonomy channels
  lastSyncedAt?: string;
  lastDriftAt?: string | null;
  driftReason?: string | null;
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

/** One channel collection returned by the import preview endpoint (Type 1: WooCommerce, Etsy only) */
export interface ImportableCollection {
  externalId: string;
  externalName: string;
  externalSlug: string;
  /** manual = merchant-created; smart = Shopify auto-rule (recommend skip) */
  collectionType: "manual" | "smart";
  productCount: number | null;
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

// ─── Type 1: merchant-owned collections — import wizard creates platform categories ──
export const IMPORT_CAPABLE_CHANNELS = ["woocommerce", "etsy", "wix"] as const;
export type ImportCapableChannel = typeof IMPORT_CAPABLE_CHANNELS[number];

export function isImportCapable(channelType: string): boolean {
  return IMPORT_CAPABLE_CHANNELS.includes(channelType as ImportCapableChannel);
}

// ─── Taxonomy capability is determined per-store from the backend ─────────────
// DO NOT add a hardcoded TAXONOMY_CHANNELS list here.
// Use store.taxonomyEnabled (from ChannelConfiguration.taxonomyConfig.enabled)
// and store.importCapable from the channel store API response instead.

// ─── Type 3: platform-defined category trees (REST/HMAC) — browse & link ──────
// Channels with a browsable category tree via GenericCategoryService (not GraphQL taxonomy).
//
// Backend deployed 2026-06-15: `ChannelStoreConnectionResponse` now returns
// `treeCapable: true` for shopee, amazon, tiktokshop, ebay, lazada.
// `store.treeCapable === true` always fires first in the routing check.
//
// This list is a safety net only — fires when store.treeCapable is null
// (e.g., stale cached response or pre-release test environment).
// It can be removed once deployment is confirmed stable in all envs.
//
// Note: both "tiktok" and "tiktokshop" are included — backend uses "tiktokshop"
// but older stores may carry "tiktok" as channelType. Both are safe to match.
export const TREE_CAPABLE_CHANNELS = ["shopee", "amazon", "tiktok", "tiktokshop", "ebay", "lazada"] as const;
export type TreeCapableChannel = typeof TREE_CAPABLE_CHANNELS[number];

export function isTreeCapable(channelType: string): boolean {
  return TREE_CAPABLE_CHANNELS.includes(channelType as TreeCapableChannel);
}

// ─── One node from GET /taxonomy/{channelType}/children ────────────────────────
export interface TaxonomyCategory {
  id: string;          // e.g. "gid://shopify/TaxonomyCategory/aa-1-1-1"
  name: string;        // "Smartphones"
  fullName: string;    // "Electronics > Phones > Smartphones"
  level: number;       // 0 = root
  isLeaf: boolean;
  isRoot: boolean;
  childrenIds: string[];
  ancestorIds: string[];
}
