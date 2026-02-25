# 03 — API Requirements

## Existing Endpoints (usable now)

### List connected stores
```
GET /api/v1/channel-stores?organizationId={orgId}
Response: ChannelStoreConnection[]
Status: IMPLEMENTED ✅
```
This is the primary data source for the store cards grid and store count in the header.

---

## Missing Endpoints (need backend work)

### 1. Per-store sync statistics
The Hub needs sync counts (synced / pending / failed / OOS) per store to populate
cards and KPI tiles. These cannot be derived from `ChannelStoreConnection` alone.

**Option A — New dedicated endpoint (preferred):**
```
GET /api/v1/channel-stores/stats?organizationId={orgId}
Response:
[
  {
    storeId: string,
    totalProducts: number,
    syncedProducts: number,
    pendingProducts: number,
    failedProducts: number,
    oosProductCount: number,
    healthScore: number          // 0–100, server-computed
  }
]
```
Backend computes this by aggregating the `channel_product_data` collection grouped by
`storeId`. This is a straightforward MongoDB aggregation pipeline:
```javascript
db.channel_product_data.aggregate([
  { $match: { organizationId: "org_123" } },
  { $group: {
      _id: "$storeId",
      total: { $sum: 1 },
      synced:  { $sum: { $cond: [{ $eq: ["$status", "PUBLISHED"] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ["$status", "READY"] }, 1, 0] } },
      failed:  { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
  }}
])
```

**Option B — Derive client-side from existing endpoint:**
```
GET /api/v1/ecommerce/channel-product-data/{masterProductId}
```
This endpoint exists but is per-product, not per-org. To get Hub-level stats
you would need to fetch every product's data, which is impractical.

**Option C — Interim: show N/A on stat cells**
If the backend endpoint is not ready, the Hub can show stores without stats.
Cards display: store name, region, connected date, status = "Active" (based on
`isActive` field), with stat cells showing "—". This is the fallback phase.

**Recommendation:** Request Option A from backend. Meanwhile implement Option C
for the initial release so the page is not blocked.

---

### 2. Channel activity feed

The activity feed shows recent sync events across all stores. There is no endpoint
for this. The `channel_product_data` collection tracks `status` and `publishedAt` /
`publishError` but not a full event log.

**Proposed endpoint:**
```
GET /api/v1/channel-stores/activity?organizationId={orgId}&limit=20
Response:
[
  {
    id: string,
    type: "sync_success" | "sync_failed" | "inventory_update"
        | "product_added" | "error_fixed" | "bulk_sync",
    message: string,
    storeId: string,
    storeName: string,
    productName?: string,
    timestamp: string   // ISO 8601
  }
]
```

**Backend implementation path:**
- Requires either a separate `channel_activity_log` collection (event-sourcing approach)
  or a derived query from `channel_product_data` sorted by `savedAt` / `publishedAt`.
- The derived query approach is simpler but gives less granular event types.

**Frontend strategy:** This section is OPTIONAL for initial release. Do not block the
Hub on this. If the endpoint returns a non-200 or the section is not wired:
- Hide the activity feed panel entirely
- Do not show an error, do not show mock data

---

### 3. Trigger sync for all stores
```
POST /api/v1/channel-stores/sync-all
Body: { organizationId: string }
Response: { jobId: string, storeCount: number }
Status: MISSING ❌
```
The "Sync All Channels" button in the header needs this. Without it, the button
can be disabled or navigate to the Sync Queue page instead.

**Alternative:** Keep the button but on click navigate to `/channels/sync-queue`
which (when implemented) will handle bulk sync operations. This avoids blocking
on backend and is a valid UX choice.

---

### 4. Trigger sync for single store
```
POST /api/v1/channel-stores/{storeId}/sync
Body: { organizationId: string }
Response: { jobId: string }
Status: MISSING ❌
```
The "Sync" button on each store card needs this.

**Interim:** Disable the Sync button per-card, or show "Coming soon" tooltip.

---

## Summary Table

| Endpoint | Status | Blocks |
|----------|--------|--------|
| `GET /channel-stores` | ✅ Exists | Store cards list |
| `GET /channel-stores/stats` | ❌ Missing | KPI tiles, per-card stats |
| `GET /channel-stores/activity` | ❌ Missing | Activity feed |
| `POST /channel-stores/sync-all` | ❌ Missing | "Sync All" button |
| `POST /channel-stores/{id}/sync` | ❌ Missing | Per-card "Sync" button |

---

## What Can Be Built Without New Endpoints

The Hub page is still **fully buildable** without any missing endpoints:

1. Store cards rendered from `GET /channel-stores` — shows store name, type badge,
   region, connected date, `isActive` status
2. Store count in header subtitle
3. "Last full sync" time from `max(lastSyncedAt)` across all stores (available on model)
4. KPI tiles can show zeros / loading skeletons until stats endpoint exists
5. Activity feed section can be hidden until its endpoint exists
6. "Sync All" can navigate to `/channels/sync-queue` instead of firing API call
7. "Connect Store" navigates to `/channels/stores`

This gives a fully functional, non-broken page from day one.
