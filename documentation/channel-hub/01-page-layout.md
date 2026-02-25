# 01 — Page Layout & Anatomy

## Route
```
/channels  →  src/app/(admin)/channels/page.tsx  (needs to be created)
```
The page renders `<ChannelHubDashboard />` from
`src/modules/channel-platform/components/ChannelHubDashboard.tsx`.

---

## Section Map (top to bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER ROW                                                     │
│  "Channel Platform"   [N connected · Last full sync: Xm ago]   │
│                        [Sync All Channels]  [+ Connect Store]  │
├─────────────────────────────────────────────────────────────────┤
│  KPI ROW  (4 tiles)                                            │
│  ✓ Synced  |  ⟳ Pending  |  ✗ Failed  |  ⚠ OOS Alerts        │
├─────────────────────────────────────────────────────────────────┤
│  STORE CARDS GRID  (1–3 columns, responsive)                   │
│  One card per connected ChannelStoreConnection                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ Shopify  │ │ WIX      │ │ Amazon   │                       │
│  │ US Store │ │ My Site  │ │ US (FBA) │                       │
│  └──────────┘ └──────────┘ └──────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│  ACTIVITY FEED                                                  │
│  Recent sync events, failures, OOS triggers — newest first     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section Details

### Header Row
- **Title:** "Channel Platform" (static)
- **Subtitle:** "{N} connected · Last full sync: {relative time}"
  - N = count of active `ChannelStoreConnection` records
  - Last sync time = `max(lastSyncedAt)` across all stores
- **"Sync All Channels" button:** triggers batch re-sync for all active stores.
  Backend endpoint needed — see `03-api-requirements.md`.
  Show spinner on the button while in-flight, disable during sync.
- **"+ Connect Store" button:** opens `ConnectStoreModal` (already exists in
  `ChannelStoresDashboard`). The Hub can either inline the modal or navigate to
  `/channels/stores` — navigating is simpler and avoids duplicating modal state.

### KPI Row
Four coloured stat tiles in a responsive 2×2 → 4×1 grid.

| Tile | Icon | Colour | Value source |
|------|------|--------|--------------|
| Synced | ✓ | green | sum of `syncedProducts` across all stores |
| Pending | ⟳ | amber | sum of `pendingProducts` |
| Failed | ✗ | red | sum of `failedProducts` |
| OOS Alerts | ⚠ | orange | count of products with stock = 0 on any store |

These values are **aggregated** — they cannot be computed from `ChannelStoreConnection`
alone. A dedicated summary endpoint is needed. See `03-api-requirements.md`.

### Store Cards Grid
- One `<StoreCard />` per `ChannelStoreConnection`
- Cards are ordered by `displayOrder` (already on the model)
- Each card shows:
  - Channel type badge (colour-coded, 2-letter code — same visual as existing `ChannelCard`)
  - Store name + store URL
  - Region (if set)
  - Status indicator dot: Active / Warning / Error / Idle
  - Mini-stats: Synced / Pending / Failed product counts
  - Health score bar (0–100)
  - Last synced timestamp (relative)
  - Two action buttons: **View** (→ `/channels/{storeId}`) · **Sync** (POST sync for this store)
- Clicking "View" navigates to a store-specific detail page. Note: the existing
  `/channels/[channelId]` route uses `ChannelId` (platform type), not `storeId`.
  This routing will need to change to `/channels/stores/{storeId}` or the param
  should be renamed. See `05-implementation-notes.md`.

### Activity Feed
- Chronological list of recent events across all stores
- Event types: `sync_success`, `sync_failed`, `inventory_update`, `product_added`,
  `error_fixed`, `bulk_sync`
- Each row: coloured icon · message · channel/store name · relative timestamp
- Requires a backend endpoint — does not exist yet. See `03-api-requirements.md`.
- Maximum display: last 20–30 events. No pagination needed at this stage.
- If the endpoint is not available: hide the section entirely rather than showing
  mock data or an error state. A "coming soon" placeholder is acceptable.

---

## Responsive Behaviour

| Breakpoint | Store Cards Grid | KPI Tiles |
|-----------|------------------|-----------|
| Mobile (<640px) | 1 column | 2×2 |
| Tablet (640–1024px) | 2 columns | 2×2 |
| Desktop (>1024px) | 3 columns | 4×1 |

---

## Empty States

| Condition | What to show |
|-----------|--------------|
| No stores connected | Large illustrated empty state: "No stores connected yet" + "Connect your first store →" button linking to `/channels/stores` |
| Stores connected but all inactive | KPI tiles show zeros, cards shown with "Inactive" status |
| Activity feed unavailable | Hide feed section entirely (no error, no mock) |

---

## Navigation Context
- Sidebar: "Channel Hub" → `/channels` (active when pathname === "/channels")
- Breadcrumb: none needed (it IS the root of the channels section)
- From Channel Hub → Store detail: currently `/channels/{channelId}` but should
  become `/channels/stores/{storeId}` — see routing note in `05-implementation-notes.md`
