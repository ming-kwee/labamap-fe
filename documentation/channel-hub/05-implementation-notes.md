# 05 — Implementation Notes & Open Decisions

## Routing conflict: channelId vs storeId

**The problem:**
The existing route `/channels/[channelId]/page.tsx` uses `ChannelId` (a platform type
string like `"shopify"`). The "View" link on `ChannelCard` navigates to
`/channels/${channel.id}` where `channel.id` is `"shopify"`, `"amazon"`, etc.

Once the Hub is rebuilt on `ChannelStoreConnection`, "View" on a store card should
navigate to a store-specific detail page using `storeId` (e.g. `"shopify-us-store"`),
not the channel type. But the current `/channels/[channelId]` route only knows how to
look up channels by type from mock data.

**Options:**

1. **Rename the route to `/channels/stores/[storeId]`** — cleanest. Create a new
   route folder, build a new store detail page backed by real API. The old
   `/channels/[channelId]` route stays as-is for now (still serves `ChannelDetailView`
   which uses mock data) and is removed when it is eventually migrated.
   _Recommended._

2. **Overload the existing `[channelId]` route** — detect if the param looks like a
   `storeId` (contains hyphens, longer string) vs a `ChannelId` (short platform slug).
   Fragile; not recommended.

3. **Keep `/channels/[channelId]` but change what it renders** — replace
   `ChannelDetailView` with a new store-aware component that fetches by storeId.
   Works but requires migrating `ChannelDetailView` at the same time as the Hub.

**Decision needed from team.** For the Hub implementation, link "View" to
`/channels/stores/{storeId}` which does not exist yet. The button can be shown
as disabled or omitted until that route is built.

---

## Phase strategy: what to build in what order

### Phase 1 — Page exists, basic store list (no new backend needed)
- Create `src/app/(admin)/channels/page.tsx`
- Rewrite `ChannelHubDashboard.tsx` to call `ChannelStoreService.listStores(orgId)`
- Create `StoreCard.tsx` accepting `ChannelStoreConnection` only (no stats yet)
- Cards show: badge, store name, URL, region, connected date, isActive status
- KPI tiles show loading skeleton / zeros (no stats endpoint yet)
- Activity feed hidden
- "Sync All" button → navigates to `/channels/sync-queue`
- "Connect Store" button → navigates to `/channels/stores`
- "View" button on card → disabled or links to `/channels/stores/{storeId}` (404 for now)

**Result:** Page loads, no 404, shows real connected stores. Safe to ship.

### Phase 2 — Stats tiles (requires new backend endpoint)
- Backend delivers `GET /api/v1/channel-stores/stats?organizationId=...`
- Create `channelHubService.ts` with `getStoreStats(orgId)`
- Add stats fetching to `ChannelHubDashboard`
- Merge stats into `StoreCardViewModel`, populate KPI tiles
- Add `HealthScoreBar` to each `StoreCard`

### Phase 3 — Activity feed (requires new backend endpoint)
- Backend delivers `GET /api/v1/channel-stores/activity?organizationId=...&limit=20`
- Create `HubActivityFeed.tsx`
- Wire into dashboard, show only on 200 OK

### Phase 4 — Per-store sync actions (requires new backend endpoints)
- Backend delivers `POST /channel-stores/{storeId}/sync`
- Enable the "Sync" button on each card

---

## The `organizationId` hardcoding

All channel API calls currently use `organizationId: "org_123"` hardcoded in
components. The Hub will inherit this. This is a known issue tracked in `MEMORY.md`.
Do not invest in fixing this as part of the Hub — just copy the same pattern.

---

## Do not fix ChannelDetailView as part of this work

`ChannelDetailView.tsx` is still on mock data, uses the old `ChannelPlatform` type,
and is linked from the `/channels/[channelId]` route. Migrating it to real data is a
separate task. When implementing the Hub, treat `ChannelDetailView` as untouchable.

---

## Loading and error states

The Hub must handle three states for the store list:

| State | What to show |
|-------|-------------|
| Loading | Skeleton cards (3 grey placeholder cards in the grid) |
| Error | Error banner: "Could not load stores. Check your connection." + retry button |
| Empty (no stores) | Empty state with illustration + "Connect your first store →" button |

For KPI tiles while stats are unavailable: show `—` in the value, not `0`.
Showing `0` would mislead the merchant into thinking they have zero synced products.

---

## Dark mode

`ChannelHubDashboard.tsx` already uses proper dark mode classes (`dark:bg-...`,
`dark:text-...`, `dark:border-...`). The new `StoreCard.tsx` must follow the same
pattern. All existing shared components (`HealthScoreBar`, `SyncStatusBadge`) already
support dark mode.

---

## `CHANNEL_VISUAL` constant — where to put it

The visual mapping (badge colour, code, label per channel type) defined in
`02-data-model.md` should live at:

```
src/modules/channel-platform/constants/channelVisuals.ts
```

This should be the ONLY place this mapping is defined. Currently:
- `ChannelHubDashboard` (mock) has colours baked into `mockData.ts`
- `ConnectStoreModal` has its own `CHANNEL_OPTIONS` array (label only, no colours)
- `ChannelTypeBadge.tsx` (stores module) has yet another colour map

All three should eventually import from `channelVisuals.ts`. Do this consolidation
as part of the Phase 1 Hub work since `StoreCard.tsx` will be the first real consumer.

---

## Open Questions

1. **Who owns the Hub header's "Sync All" action?** Navigate to sync queue (safe, no backend)
   or trigger a real sync (needs backend)? Recommend navigation for Phase 1.

2. **Should the Hub show inactive stores?** `isActive: false` stores are soft-deleted.
   Probably should not be shown on the Hub, but confirm with product.

3. **What does "health score" mean exactly?**
   `failedProducts / totalProducts * 100` inverted? Or does the backend compute it?
   The existing mock data has arbitrary 0–100 values. Need a definition before Phase 2.

4. **Real-time updates?** Should the Hub auto-refresh while open (e.g. when a sync job
   completes)? Polling every 30s would be simplest. WebSocket would be ideal but
   requires backend infrastructure.
