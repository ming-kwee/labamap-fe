export interface AdminChannelStore {
  storeId: string;
  channelType: string;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;
  isActive: boolean;
  displayOrder: number;
  connectedAt: string | number;
  lastSyncedAt?: string | number;
  connectionStatus?: "ACTIVE" | "RECONNECT_REQUIRED" | "DISCONNECTED" | "INACTIVE";
  reconnectRequired?: boolean;
  disconnectedAt?: string;
  disconnectReason?: string;
  /** Phase 3 per-store channel API version pin. null/absent = follow the channel's ACTIVE version. */
  apiVersion?: string | null;
}

export interface CredentialFieldSchema {
  credId: string;
  chnlCredName: string;
  label: string;
  inputType: "text" | "password" | "email" | "url" | "number";
  sensitive: boolean;
  required: boolean;
  helpText?: string;
}

export interface CredentialEntry {
  credId: string;
  chnlCredName: string;
  chnlCredValue: string;
}

export interface StoreConnectionRequest {
  channelType: string;
  storeName: string;
  storeUrl: string;
  storeId?: string;
  region?: string;
  displayOrder?: number;
  credentials: CredentialEntry[];
}

export interface UpdateStoreRequest {
  storeName?: string;
  storeUrl?: string;
  region?: string;
  displayOrder?: number;
  credentials?: CredentialEntry[];
}

export const CHANNEL_TYPES = [
  "shopify", "wix", "amazon", "ebay", "tiktok",
  "lazada", "tokopedia", "facebook", "shopee", "walmart",
] as const;

export const CHANNEL_LABELS: Record<string, string> = {
  shopify:   "Shopify",
  wix:       "Wix",
  amazon:    "Amazon",
  ebay:      "eBay",
  tiktok:    "TikTok Shop",
  lazada:    "Lazada",
  tokopedia: "Tokopedia",
  facebook:  "Facebook",
  shopee:    "Shopee",
  walmart:   "Walmart",
};

export const CHANNEL_COLORS: Record<string, string> = {
  shopify:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  wix:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  amazon:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ebay:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  tiktok:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  lazada:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  facebook:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shopee:    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  walmart:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
};

export function mapRawStore(raw: unknown): AdminChannelStore {
  const r = raw as Record<string, unknown>;
  return {
    storeId:          String(r.storeId ?? ""),
    channelType:      String(r.channelType ?? ""),
    storeName:        String(r.storeName ?? ""),
    storeUrl:         String(r.storeUrl ?? ""),
    region:           r.region ? String(r.region) : undefined,
    organizationId:   String(r.organizationId ?? ""),
    credentials:      (r.credentials as Record<string, string>) ?? {},
    isActive:         Boolean(r.isActive ?? r.active ?? false),
    displayOrder:     Number(r.displayOrder ?? 0),
    connectedAt:      (r.connectedAt as string | number) ?? "",
    lastSyncedAt:     r.lastSyncedAt as string | number | undefined,
    connectionStatus: r.connectionStatus as AdminChannelStore["connectionStatus"],
    reconnectRequired: r.reconnectRequired as boolean | undefined,
    disconnectedAt:   r.disconnectedAt as string | undefined,
    disconnectReason: r.disconnectReason as string | undefined,
    apiVersion:       (r.apiVersion as string | null | undefined) ?? null,
  };
}
