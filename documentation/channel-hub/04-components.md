# 04 — Component Reuse Analysis

## Existing components that touch the Channel Hub

```
src/modules/channel-platform/components/
├── ChannelHubDashboard.tsx      ← the shell — needs full rewrite
├── ChannelCard.tsx              ← needs adapter/rewrite (wrong prop type)
├── ChannelDetailView.tsx        ← separate page; not part of Hub rendering
├── shared/
│   ├── HealthScoreBar.tsx       ← reusable as-is ✅
│   └── SyncStatusBadge.tsx      ← reusable as-is ✅
└── data/
    └── mockData.ts              ← to be abandoned for Hub; keep for other pages
```

---

## Decision per component

### `ChannelHubDashboard.tsx` — REWRITE
**Current state:** Fully wired to `mockData.ts` using `ChannelPlatform[]` and
`ActivityItem[]` types. Calls `mockChannels`, `mockActivityFeed`, `mockKpiSummary`
at the top of the render function.

**Why not just "add an API call":** The component's structure is reasonable but every
data reference inside it is mock-typed. The stat tiles reference `kpi.totalSynced`
(from `ChannelKpiSummary`), the cards receive `ChannelPlatform` props, and even the
activity feed uses the old `ActivityItem` type (which has `channelId: ChannelId` not
`storeId: string`). Patching these types one by one would be messier than replacing
the data layer.

**Recommended approach:**
- Keep the JSX structure (it looks good and the sections are well-organised)
- Replace the data wiring entirely: remove all `mockData` imports, add API calls,
  use the new types from `channelStore.ts`
- The component itself should become a thin orchestrator; move each section into
  its own sub-component (see below)

**New component structure:**
```
ChannelHubDashboard.tsx     ← data fetching only; renders sub-components
├── HubHeader.tsx           ← title, subtitle, action buttons
├── HubKpiRow.tsx           ← 4 stat tiles (accepts ChannelHubKpi)
├── StoreCardGrid.tsx       ← grid wrapper
│   └── StoreCard.tsx       ← one card per ChannelStoreConnection + stats
└── HubActivityFeed.tsx     ← optional; hidden if endpoint unavailable
```

---

### `ChannelCard.tsx` — REPLACE with `StoreCard.tsx`
**Current state:** Accepts `channel: ChannelPlatform`. Uses `channel.colorClass`,
`channel.textColorClass`, `channel.code` — all of which are baked into the mock
data and do not exist on `ChannelStoreConnection`.

**Options:**
1. **Add an overloaded prop** — accept either `ChannelPlatform` or a new type.
   Messy; pollutes the interface.
2. **Replace entirely with `StoreCard.tsx`** — new component accepting
   `StoreCardViewModel` (defined in `02-data-model.md`). Derives `colorClass`,
   `code` etc. from `CHANNEL_VISUAL[channelType]` mapping.
3. **Adapt with a mapper function** — `toChannelPlatform(store: StoreCardViewModel): ChannelPlatform`
   and reuse the existing card. This is pragmatic but perpetuates the old type.

**Recommendation:** Option 2. The old `ChannelCard` is still used by `ChannelDetailView`
(which is backed by mock data). Create `StoreCard.tsx` as a new component for the Hub.
Do not delete `ChannelCard.tsx` until `ChannelDetailView` is also migrated.

---

### `HealthScoreBar.tsx` — REUSE AS-IS ✅
```typescript
// Props: { score: number; showLabel?: boolean }
```
Purely presentational, no data dependency. Works with any 0–100 number.

---

### `SyncStatusBadge.tsx` — REUSE AS-IS ✅
```typescript
// Props: { status: SyncStatus }
```
Purely presentational. The Hub does not directly show per-product sync status,
but `StoreCard` might use it to show the store's overall status.

---

### `ChannelDetailView.tsx` — NOT PART OF HUB
This component renders the per-channel product table at `/channels/{channelId}`.
It is currently linked from `ChannelCard` via `href={/channels/${channel.id}}`.

When the Hub is implemented, "View" on a `StoreCard` should go to
`/channels/stores/{storeId}` (the store-specific detail page). That routing change
is separate from the Hub work and documented in `05-implementation-notes.md`.

---

### `mockData.ts` — ABANDON FOR HUB (keep for other pages)
Located at `src/modules/channel-platform/data/mockData.ts`.
Used by: `ChannelHubDashboard`, `ChannelDetailView`, `ChannelProductsGrid`,
`SyncQueuePanel`, `InventorySyncTable`.

Do not delete this file — it is still needed by the other pages (`/channels/products`,
`/channels/sync-queue`, `/channels/inventory`) which are not yet migrated to real APIs.
When the Hub is implemented, it will simply stop importing from this file.

---

## Net-New Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `StoreCard.tsx` | `components/stores/` | Hub store card; accepts `StoreCardViewModel` |
| `HubKpiRow.tsx` | `components/hub/` | 4 KPI tiles; accepts `ChannelHubKpi` |
| `HubActivityFeed.tsx` | `components/hub/` | Optional activity list |
| `channelVisuals.ts` | `constants/` | `CHANNEL_VISUAL` mapping (shared constant) |
| `channelHubService.ts` | `services/` | API calls for stats + activity endpoints |

---

## Where NOT to Put Channel Hub Logic

The Hub orchestration (`useEffect`, API calls, loading state) should live inside
`ChannelHubDashboard.tsx` as a client component — not in the `page.tsx`.
The page file stays simple:

```typescript
// src/app/(admin)/channels/page.tsx
import { ChannelHubDashboard } from "@/modules/channel-platform/components/ChannelHubDashboard";
export const metadata = { title: "Channel Platform | Hub" };
export default function ChannelHubPage() {
  return <ChannelHubDashboard />;
}
```

This matches the existing pattern used by `/channels/[channelId]/page.tsx`.
