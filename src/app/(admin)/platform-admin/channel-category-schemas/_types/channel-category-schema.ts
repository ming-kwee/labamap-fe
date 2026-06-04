// Channel Category API Schema types
// Corresponds to the `channel_category_api_schemas` MongoDB collection

export type ChannelCategorySchemaChannelType =
  | "shopify"
  | "wix"
  | "amazon"
  | "ebay"
  | "walmart"
  | "tiktok"
  | "lazada"
  | "tokopedia"
  | "facebook"
  | "shopee";

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  shopify:    "Shopify",
  wix:        "WIX",
  amazon:     "Amazon",
  ebay:       "eBay",
  walmart:    "Walmart",
  tiktok:     "TikTok Shop",
  tiktokshop: "TikTok Shop", // backend merchant-api-operations uses this key
  lazada:     "Lazada",
  tokopedia:  "Tokopedia",
  facebook:   "Facebook",
  shopee:     "Shopee",
};

/** One document in `channel_category_api_schemas` */
export interface ChannelCategoryApiSchema {
  id: string;
  channelType: string;
  categorySlug: string;
  version: number;
  /** Nested map of channel-specific API schema extension fields (deep-merged onto base schema) */
  apiSchemaExtension: Record<string, unknown>;
  isActive: boolean;
  changeNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** Request body for POST (create) */
export interface CreateChannelCategorySchemaRequest {
  channelType: string;
  categorySlug: string;
  apiSchemaExtension: Record<string, unknown>;
  changeNote: string;
}

/** Request body for PUT (update extension + bump version) */
export interface UpdateChannelCategorySchemaRequest {
  apiSchemaExtension: Record<string, unknown>;
  changeNote: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapRawSchema(raw: unknown): ChannelCategoryApiSchema {
  const r = raw as Record<string, unknown>;
  return {
    id:                 (r.id ?? r._id ?? "") as string,
    channelType:        (r.channelType ?? "") as string,
    categorySlug:       (r.categorySlug ?? "") as string,
    version:            (r.version ?? 1) as number,
    apiSchemaExtension: (r.apiSchemaExtension ?? {}) as Record<string, unknown>,
    isActive:           Boolean(r.isActive ?? r.active),
    changeNote:         r.changeNote as string | undefined,
    createdAt:          (r.createdAt ?? "") as string,
    updatedAt:          (r.updatedAt ?? "") as string,
  };
}
