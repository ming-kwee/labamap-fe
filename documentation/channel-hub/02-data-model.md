# 02 — Data Model & Types

## The Core Problem: Two Competing Data Models

The codebase currently has **two separate type systems** for channel data.
Understanding the difference is critical before touching any Channel Hub code.

---

### Model A — Legacy (channel-type-centric)
**File:** `src/modules/channel-platform/types/index.ts`

```typescript
// One entry = one channel PLATFORM (e.g. "shopify", "amazon")
export interface ChannelPlatform {
  id: ChannelId;           // "shopify" | "amazon" | "lazada" | ...
  name: string;            // "Shopify"
  code: string;            // "SH"
  colorClass: string;      // Tailwind bg class
  textColorClass: string;  // Tailwind text class
  status: ChannelStatus;
  healthScore: number;
  totalProducts: number;
  syncedProducts: number;
  pendingProducts: number;
  failedProducts: number;
  lastSyncAt: Date;
  region: string;
  currency: string;
  storeUrl?: string;
}
```

**Used by:** `ChannelHubDashboard.tsx`, `ChannelCard.tsx`, `ChannelDetailView.tsx`
**Data source:** `mockData.ts` (hardcoded, no API call)
**Limitation:** Cannot represent a merchant with two Shopify stores (e.g. US + EU).
  It models the *channel type*, not the *store instance*.

---

### Model B — Current (store-instance-centric)
**File:** `src/modules/channel-platform/types/channelStore.ts`

```typescript
// One entry = one connected STORE INSTANCE (e.g. "My Shopify US Store")
export interface ChannelStoreConnection {
  storeId: string;         // "shopify-my-us-store" — unique per store instance
  channelType: ChannelType;// "shopify" — the platform type
  storeName: string;       // "My Shopify US Store"
  storeUrl: string;        // "mystore.myshopify.com"
  region?: string;         // "US"
  organizationId: string;
  credentials: Record<string, string>; // always "***MASKED***" in responses
  isActive: boolean;
  displayOrder: number;
  connectedAt: string;     // ISO 8601
  lastSyncedAt?: string;   // ISO 8601 | undefined if never synced
}
```

**Used by:** `ChannelStoresDashboard.tsx`, `ConnectStoreModal.tsx`, `channelStoreService.ts`
**Data source:** `GET /api/v1/channel-stores?organizationId=...` (real API)
**This is the correct model for the Channel Hub going forward.**

---

## What the Channel Hub Needs

The Hub needs to display a card per `ChannelStoreConnection` enriched with
live sync statistics. `ChannelStoreConnection` alone does NOT contain sync counts
or health scores — those require a separate aggregation.

### Required shape per store card (derived type):

```typescript
// NOT yet a real type — define this when implementing
export interface StoreCardViewModel {
  // From ChannelStoreConnection (available now)
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  isActive: boolean;
  displayOrder: number;
  connectedAt: string;
  lastSyncedAt?: string;

  // From aggregation endpoint (NOT yet available — see 03-api-requirements.md)
  syncedProducts: number;
  pendingProducts: number;
  failedProducts: number;
  totalProducts: number;
  healthScore: number;        // 0–100, computed from failedProducts / totalProducts
  oosProductCount: number;    // products with stock = 0 on this store
}
```

### KPI totals (page-level aggregation):

```typescript
// Summed across ALL active stores
export interface ChannelHubKpi {
  totalSynced: number;
  totalPending: number;
  totalFailed: number;
  totalOosAlerts: number;
  lastFullSyncAt: string | null; // max(lastSyncedAt) across all stores
}
```

These KPI values can be computed client-side by summing `StoreCardViewModel[]`
once the per-store stats are available — no separate endpoint needed IF the
per-store aggregation endpoint returns the data.

### Activity feed items:

```typescript
export interface ChannelActivityItem {
  id: string;
  type: "sync_success" | "sync_failed" | "inventory_update"
      | "product_added" | "error_fixed" | "bulk_sync";
  message: string;
  storeId?: string;
  storeName?: string;
  productName?: string;
  timestamp: string; // ISO 8601
}
```

---

## Data Flow

```
Component renders
      │
      ├─ 1. GET /api/v1/channel-stores?organizationId=org_123
      │       → ChannelStoreConnection[]  (list of connected stores)
      │
      ├─ 2. GET /api/v1/channel-stores/stats?organizationId=org_123
      │       → StoreStatsSummary[]       (sync counts per storeId)  ← MISSING
      │       OR: client-side derive from channel_product_data if acceptable
      │
      ├─ 3. Merge (1) + (2) by storeId → StoreCardViewModel[]
      │
      ├─ 4. Compute KPI totals by reducing StoreCardViewModel[]
      │
      └─ 5. GET /api/v1/channel-stores/activity?organizationId=org_123&limit=20
              → ChannelActivityItem[]     ← MISSING
              (show section only if 200 OK, hide on any error)
```

---

## channelType → Visual Mapping

The existing `ChannelCard` uses `colorClass` and `textColorClass` from `ChannelPlatform`
mock data. For the real implementation, these must be derived from `channelType`:

```typescript
// Define this mapping in a shared constants file
export const CHANNEL_VISUAL: Record<ChannelType, {
  code: string;
  colorClass: string;
  textColorClass: string;
  label: string;
}> = {
  shopify:   { code: "SH", colorClass: "bg-green-100 dark:bg-green-500/20",  textColorClass: "text-green-700 dark:text-green-300",  label: "Shopify" },
  wix:       { code: "WX", colorClass: "bg-blue-100 dark:bg-blue-500/20",    textColorClass: "text-blue-700 dark:text-blue-300",    label: "WIX" },
  amazon:    { code: "AZ", colorClass: "bg-orange-100 dark:bg-orange-500/20",textColorClass: "text-orange-700 dark:text-orange-300",label: "Amazon" },
  ebay:      { code: "EB", colorClass: "bg-yellow-100 dark:bg-yellow-500/20",textColorClass: "text-yellow-700 dark:text-yellow-300",label: "eBay" },
  tiktok:    { code: "TT", colorClass: "bg-pink-100 dark:bg-pink-500/20",    textColorClass: "text-pink-700 dark:text-pink-300",    label: "TikTok Shop" },
  lazada:    { code: "LZ", colorClass: "bg-purple-100 dark:bg-purple-500/20",textColorClass: "text-purple-700 dark:text-purple-300",label: "Lazada" },
  tokopedia: { code: "TP", colorClass: "bg-teal-100 dark:bg-teal-500/20",   textColorClass: "text-teal-700 dark:text-teal-300",   label: "Tokopedia" },
  facebook:  { code: "FB", colorClass: "bg-indigo-100 dark:bg-indigo-500/20",textColorClass: "text-indigo-700 dark:text-indigo-300",label: "Facebook Shop" },
  shopee:    { code: "SP", colorClass: "bg-orange-100 dark:bg-orange-500/20",textColorClass: "text-orange-700 dark:text-orange-300",label: "Shopee" },
  walmart:   { code: "WM", colorClass: "bg-blue-100 dark:bg-blue-500/20",   textColorClass: "text-blue-700 dark:text-blue-300",   label: "Walmart" },
};
```

This mapping should live in
`src/modules/channel-platform/constants/channelVisuals.ts`
and be shared between the Hub, the Stores page, and anywhere a channel badge is rendered.
Currently each component defines its own ad-hoc version — this is a duplication problem.

---

## organizationId

Currently hardcoded as `"org_123"` in the Channel Stores dashboard and elsewhere.
For the Hub, use the same pattern for now. Noted in `MEMORY.md` as a known issue —
should eventually come from auth context.
