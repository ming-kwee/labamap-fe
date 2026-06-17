/** Denormalized summary embedded on product_categories (no join needed for list UI).
 *  Populated by the backend — kept on the frontend type so product-categories UI
 *  can display sync counts without an extra fetch. */
export interface ChannelSyncSummary {
  totalMapped: number;
  totalDrifted: number;
  totalUnmapped: number;
  lastSyncedAt: string | null;
}

// ─── Type 1: merchant-owned collections (WooCommerce, Etsy, Wix) ──────────────
export const IMPORT_CAPABLE_CHANNELS = ["woocommerce", "etsy", "wix"] as const;
export type ImportCapableChannel = typeof IMPORT_CAPABLE_CHANNELS[number];

export function isImportCapable(channelType: string): boolean {
  return IMPORT_CAPABLE_CHANNELS.includes(channelType as ImportCapableChannel);
}

// ─── Category tree node — returned by GET /merchant-data/{ch}/{store}/categories ─
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
