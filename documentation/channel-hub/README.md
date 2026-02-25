# Channel Hub — Documentation Index

> Central command centre for all connected channel stores.
> Route: `/channels` → `src/app/(admin)/channels/page.tsx` (does not exist yet)

---

## Documents

| # | File | What it covers |
|---|------|----------------|
| 01 | [Page Layout & Anatomy](./01-page-layout.md) | Sections, wireframe, UX behaviour |
| 02 | [Data Model & Types](./02-data-model.md) | Source of truth, type mapping, the old-vs-new type conflict |
| 03 | [API Requirements](./03-api-requirements.md) | Which endpoints exist, which are missing, what to request from backend |
| 04 | [Component Reuse Analysis](./04-components.md) | What survives, what must be rebuilt, what is net-new |
| 05 | [Implementation Notes](./05-implementation-notes.md) | Gotchas, phasing strategy, open decisions |

---

## One-Paragraph Summary

The Channel Hub is the top-level dashboard at `/channels`. Its job is to give a merchant an
at-a-glance view of every store they have connected — across all channel types — with health
status, product sync counts, and quick-action buttons. It is the natural landing page after
the merchant finishes connecting stores at `/channels/stores`.

The page **already has a working visual shell** (`ChannelHubDashboard.tsx`) but it is
entirely wired to **hardcoded mock data** using an older, channel-type-centric data model
(`ChannelPlatform`). The real implementation must replace that with live data from
`GET /api/v1/channel-stores` using the newer store-instance model (`ChannelStoreConnection`).
Some aggregated KPI data (sync counts, OOS alerts, activity feed) requires new backend
endpoints that do not yet exist.
