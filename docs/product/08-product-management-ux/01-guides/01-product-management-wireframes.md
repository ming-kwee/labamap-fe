# Product Management UX — Wireframes & Design Recommendation

> **Author perspective:** Omnichannel product UX design  
> **Date:** 2026-05-29  
> **Status:** Recommendation — approved for phased implementation

---

## 1. Current State Problems

### The wizard has no library

The 3-step creation wizard (Master Product → Channel Fields → Publish) is well-built and
uses real APIs. But after the merchant clicks "Publish" in Step 3, the product disappears
into the void. There is no:
- Master product list to return to
- Way to find and edit a product created yesterday
- Way to add a new channel to an existing product
- Way to re-sync after a price change

### Two orphaned "channel product" pages

| Route | Name | Reality |
|---|---|---|
| `/products/channel-list` | Channel Product List | Component removed — shows placeholder text |
| `/channels/products` | Channel Products | Mock data, UI polished but actions are stubs |

Both pages attempt to solve the same problem and both fail. They need to be replaced
by one coherent system.

### Fundamental UX gap

Omnichannel product management has two distinct modes merchants switch between daily:

1. **Master view** — "What products do I have? What is my canonical data?"
2. **Channel view** — "What is live on each platform? What failed to sync? What needs fixing?"

Currently neither mode is functional.

---

## 2. Recommended Architecture

### Three pages replace the current confusion

```
BEFORE                          AFTER
──────────────────────          ──────────────────────────────────────────
/products/create     ──────►   /products/v2/create     (keep — wizard)
/products/channel-list  ──X    
/channels/products      ──X    /products              (NEW — My Products)
                               /products/{id}         (NEW — Product Detail)
                               /channels/products     (REDESIGN — Channel Sync)
```

### How the three pages relate

```
                    ┌─────────────────────┐
                    │   My Products       │  Master-first view
                    │   /products         │  "All my products, any channel"
                    └─────────┬───────────┘
                              │ click product
                    ┌─────────▼───────────┐
                    │   Product Detail    │  Single product hub
                    │   /products/{id}    │  Master data + all channel cards
                    └──┬──────────────────┘
           edit master │          │ manage channel
      ┌────────────────▼──┐   ┌───▼────────────────┐
      │  Step 1 (edit)    │   │  Step 2 (edit)     │
      │  /products/{id}/  │   │  /channel-fields   │
      │  edit             │   │  existing wizard   │
      └───────────────────┘   └────────────────────┘

                    ┌─────────────────────┐
                    │  Channel Sync       │  Channel-first view
                    │  /channels/products │  "Per-channel health & errors"
                    └─────────────────────┘
```

---

## 3. User Journey Map

### Journey A — Create and publish a new product

```
1. Click "Create Product" in sidebar
2. Step 1: Fill master product form → Submit
3. Step 2: Configure channel-specific fields per store → Save
4. Step 3: Preview effective values → Click "Publish"
5. ✅ Redirect to Product Detail page for the new product
6. See all channel cards: which are synced, which failed, re-sync if needed
```

**Current:** Step 4 dumps user at top of publish page with no clear next step.  
**Fixed:** After publish, redirect to `/products/{id}` — the product's permanent home.

---

### Journey B — Edit an existing product's master data

```
1. Go to My Products (/products)
2. Find the product (search, filter by category or channel status)
3. Click product row → Product Detail (/products/{id})
4. Click "Edit Master" → opens edit mode of the creation form (/products/{id}/edit)
5. Save → back to Product Detail → channel cards show "Pending re-sync"
6. Click "Re-sync all" or re-sync per channel
```

---

### Journey C — Fix a sync error on one channel

```
1. Red badge on sidebar ("3 sync errors") — or via Channel Sync page
2. Open Channel Sync (/channels/products)
3. See Wix card showing 2 failed products
4. Click "View errors" on Wix card
5. See product list filtered to failed products on Wix
6. Click product → Product Detail → Wix card shows error detail
7. Click "Edit channel fields" on Wix card → Step 2 for that product + Wix tab active
8. Fix the field → Save → Re-sync → Status turns green
```

---

### Journey D — Add a new channel to an existing product

```
1. Go to Product Detail (/products/{id})
2. See channel cards: Shopify ✓, Wix ✓, [+ Add channel]
3. Click "+ Add channel" → opens Step 2 with the new channel tab active
4. Fill fields → Save → Step 3 → Publish to new channel only
5. Back to Product Detail — new channel card appears
```

---

## 4. Wireframes

### 4.1 My Products — `/products`

The master product library. Entry point for product management.

```
┌──────────────────────────────────────────────────────────────────────┐
│  My Products                                      [+ Create Product]  │
│  142 products · Published to 3 channels                              │
├──────────────────────────────────────────────────────────────────────┤
│  [🔍 Search products…]  [Category ▼]  [Channel ▼]  [Status ▼]       │
│                                                             Sort: ▼   │
├───┬─────────┬──────────────────────┬────────────┬──────────┬─────────┤
│ □ │  Image  │ Name / SKU           │ Category   │ Channels │ Status  │
├───┼─────────┼──────────────────────┼────────────┼──────────┼─────────┤
│ □ │ [img]  │ Wireless Earbuds     │ Electronics│ 🛍 ⬛ 🎵  │ ● All   │
│   │         │ SKU: WE-001 · 3 var  │            │          │  synced │
├───┼─────────┼──────────────────────┼────────────┼──────────┼─────────┤
│ □ │ [img]  │ Cotton Batik Shirt   │ Clothing   │ 🛍 ⬛    │ ⚠ 1    │
│   │         │ SKU: BS-002 · 2 var  │            │          │ warning │
├───┼─────────┼──────────────────────┼────────────┼──────────┼─────────┤
│ □ │ [img]  │ Organic Coffee 250g  │ F&B        │ 🛍       │ ✗ Sync  │
│   │         │ SKU: OC-003 · 1 var  │            │          │  failed │
├───┴─────────┴──────────────────────┴────────────┴──────────┴─────────┤
│  □ 2 selected    [Sync selected ▼]  [Export ▼]                        │
│                                     ← 1  2  3 … 15 →   10 per page   │
└──────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- Channel icons in the Channels column are clickable → filter to that channel's view
- Status badge shows worst-case status across all channels for this product:
  ● All synced (green) / ⚠ N warnings (amber) / ✗ N failed (red) / ◌ Draft (gray)
- Row click → Product Detail
- "Sync selected" dropdown: Sync all channels / Sync specific channel
- Bulk actions: Export CSV, archive, duplicate

---

### 4.2 Product Detail — `/products/{id}`

The permanent home for one master product. Two-column layout.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← My Products                                                        │
│  Wireless Earbuds                           [Edit Master]  [⋯ More]  │
│  SKU: WE-001  ·  Electronics  ·  Last edited 2 days ago              │
├────────────────────────────┬─────────────────────────────────────────┤
│  MASTER DATA               │  CHANNEL DISTRIBUTION                    │
│                            │                                          │
│  Name                      │  [+ Add channel]    [↺ Sync all]        │
│  Wireless Earbuds          │                                          │
│                            │  ┌───────────────────────────────────┐  │
│  Base Price                │  │ 🛍  Shopify — Main Store  ● Synced│  │
│  Rp 299.000                │  │ Last sync: 14 minutes ago         │  │
│                            │  │ Channel price:  Rp 299.000        │  │
│  Category                  │  │ Channel SKU:    WE-SHP-001        │  │
│  Electronics > Earbuds     │  │ Mapped to:      Electronics > ...  │  │
│                            │  │          [Edit fields]  [Re-sync]  │  │
│  Variants  (3)             │  └───────────────────────────────────┘  │
│  ┌──────┬────────────────┐ │                                          │
│  │ Red  │ Rp 299.000     │ │  ┌───────────────────────────────────┐  │
│  │ Blue │ Rp 299.000     │ │  │ ⬛  Wix — My Wix Store   ⚠ Warn │  │
│  │ Blk  │ Rp 319.000     │ │  │ 1 variant mapping warning         │  │
│  └──────┴────────────────┘ │  │ Channel price:  Rp 289.000        │  │
│                            │  │ Channel SKU:    WIX-WE-001        │  │
│  Description               │  │ ⚠ Black variant: category not    │  │
│  Premium wireless …        │  │   mapped on Wix                   │  │
│                            │  │     [View warning] [Edit] [Sync]  │  │
│  Images  (4)               │  └───────────────────────────────────┘  │
│  [□][□][□][□][+]           │                                          │
│                            │  ┌───────────────────────────────────┐  │
│  Tags                      │  │ 🎵  TikTok Shop          ✗ Failed │  │
│  earbuds, wireless, audio  │  │ Category mapping missing           │  │
│                            │  │             [Fix issue]  [Remove]  │  │
└────────────────────────────┴──┴───────────────────────────────────┘──┘
```

**Notes:**
- Left column: master data summary. Read-only by default. "Edit Master" → `/products/{id}/edit`
- Right column: one card per connected channel store
- Card states:
  - ● Synced (green) — last sync time shown
  - ⚠ Warning (amber) — expandable warning detail, non-blocking
  - ✗ Failed (red) — error message + "Fix issue" button
  - ◌ Draft (gray) — saved to master but not yet pushed to channel
  - ↻ Syncing (blue pulsing) — push in progress
- "Edit fields" button on each card → Step 2 with that store's tab active
- "Fix issue" → Step 2 with the problem field highlighted

---

### 4.3 Channel Sync — `/channels/products`

Channel-first view. The operator sees product health per store, not per product.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Channel Sync                            Last refresh: 3 min ago [↺] │
│  3 stores · 24 synced · 3 warnings · 1 failed                        │
├──────────────────────────────────────────────────────────────────────┤
│  [🔍 Search…]  [Status: All ▼]                      [Sync All Stores]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ⬛  Wix — My Wix Store                              [Sync all] │  │
│  │ Health: ████████░░  80%   · 18 products                        │  │
│  │ ● 16 synced  · ⚠ 1 warning  · ✗ 1 failed  · ◌ 0 draft        │  │
│  │                                      [View all products →]     │  │
│  │ ✗ Cotton Batik Shirt — Category mapping missing on Wix         │  │
│  │                                 [Fix now]                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🛍  Shopify — Main Store                            [Sync all] │  │
│  │ Health: ██████████  100%  · 12 products                        │  │
│  │ ● 12 synced  · ⚠ 0 warning  · ✗ 0 failed  · ◌ 0 draft        │  │
│  │                                      [View all products →]     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🎵  TikTok Shop                                     [Sync all] │  │
│  │ Health: ██████░░░░  60%   · 5 products                         │  │
│  │ ● 3 synced  · ⚠ 2 warning  · ✗ 0 failed  · ◌ 0 draft         │  │
│  │ ⚠ 2 products have category drift — channel renamed category    │  │
│  │                              [Resolve all]  [View products →]  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- Store cards show health bar and error count by default
- Most critical 1–2 errors surfaced inline per card with direct "Fix now" action
- "View all products →" opens per-store product table (§4.4)
- Replaces the current mock `/channels/products` placeholder

---

### 4.4 Per-store product table — `/channels/products?store={storeId}`

Drill-down from Channel Sync card:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Channel Sync                                                       │
│  ⬛ Wix — My Wix Store                          ● 16 · ⚠ 1 · ✗ 1    │
│  API Health: 80%  ·  Last sync: 5 minutes ago       [Sync all]       │
├──────────────────────────────────────────────────────────────────────┤
│  [🔍 Search…]  [Status: All ▼]   [Bulk sync ▼]                       │
├───┬──────────────────────┬───────────────┬────────────┬──────────────┤
│ □ │ Product              │ Channel Price │ Channel SKU│ Status       │
├───┼──────────────────────┼───────────────┼────────────┼──────────────┤
│ □ │ Wireless Earbuds     │ Rp 289.000    │ WIX-WE-001 │ ● Synced     │
│   │ 3 variants           │ (master: 299) │            │ 2h ago       │
├───┼──────────────────────┼───────────────┼────────────┼──────────────┤
│ □ │ Cotton Batik Shirt ▼ │ Rp 189.000    │ WIX-BS-002 │ ✗ Failed     │
│   │ ⤷ Category: not mapped on Wix          [Fix field] [View master] │
├───┼──────────────────────┼───────────────┼────────────┼──────────────┤
│ □ │ Organic Coffee 250g  │ Rp 79.000     │ WIX-OC-003 │ ● Synced     │
│   │ 1 variant            │               │            │ 5min ago     │
└───┴──────────────────────┴───────────────┴────────────┴──────────────┘
```

---

### 4.5 Post-wizard redirect (Step 3 done screen)

After publish completes, replace the current stranded state with clear exits:

```
Step 3 (Publish) — merchant clicks "Publish to all channels"
         │
         ▼  (loading: "Publishing to 2 channels…")
         ▼
┌────────────────────────────────────────────────┐
│  ✓ Product published!                          │
│                                                │
│  Wireless Earbuds                              │
│  ● Shopify — Synced                           │
│  ● Wix     — Synced                           │
│                                                │
│  [View product]      [Create another]          │
└────────────────────────────────────────────────┘
         │ "View product"
         ▼
Product Detail  /products/{masterProductId}
```

The "done" phase already exists in `PublishDashboard.tsx`. It only needs two exit buttons
instead of the current single "Done" button that navigates nowhere useful.

---

## 5. What to Replace / Keep / Build

### Keep as-is
| Component | Route | Reason |
|---|---|---|
| Step 1 wizard | `/products/v2/create` | Mature, real API |
| Step 2 channel fields | `/products/{id}/channel-fields` | Mature, real API |
| Step 3 publish | `/products/{id}/publish` | Mature — only exit redirect needs fixing |
| My Categories | `/channels/categories` | New, keep |
| Channel Category Mapping | `/omni-admin/channel-category-mapping` | Mature, keep |

### Replace / build new
| What | Route | Replaces |
|---|---|---|
| My Products list | `/products` | `/products/channel-list` placeholder |
| Product Detail | `/products/{id}` | (missing — new page) |
| Edit Master | `/products/{id}/edit` | (missing — reuses Step 1 form) |
| Channel Sync | `/channels/products` | mock ChannelProductsGrid |

---

## 6. Navigation Flow

```
Sidebar: "My Store"
│
├── Products
│   ├── Create Product   → /products/v2/create  (Step 1 → 2 → 3 → redirect)
│   └── My Products      → /products
│                               └── /products/{id}  (Product Detail)
│                                         ├── /products/{id}/edit  (edit master)
│                                         └── /products/{id}/channel-fields  (Step 2)
│
└── Channel Platform
    ├── Channel Stores   → /channels/stores
    ├── My Categories    → /channels/categories
    ├── Channel Sync     → /channels/products
    │                               └── /channels/products?store={id}  (per-store table)
    ├── Channel Category Mapping → /omni-admin/channel-category-mapping
    └── Sync Queue       → /channels/sync-queue
```

---

## 7. Key UX Decisions

### Why master-first, not channel-first?

In omnichannel commerce, the master product is the single source of truth. Price changes,
descriptions, and images always update at master level and cascade to channels. Channels
are distribution targets, not data owners.

Organising by master product first matches this mental model. The merchant thinks
"I need to update my Wireless Earbuds" — not "I need to update my Shopify listing".
Channel Sync is the secondary operations view for monitoring sync health and fixing errors.

### Why reuse the wizard for editing?

Step 1's form is already complete and well-validated. Reusing it in edit mode (pre-filled,
"Save changes" instead of "Create") avoids maintaining two forms with identical fields.

### Why keep Step 2/3 for channel field editing?

Steps 2 and 3 already fetch existing channel data — they are already edit-capable.
The flow is: open Step 2 from a channel card → edit → Save → Step 3 re-publishes
only the edited channel → redirect back to Product Detail.

---

## 8. Implementation Phases

Phased delivery prioritised by merchant impact and backend dependency.

---

### Phase 1 — Fix the wizard exit *(no new backend required)*

**Timeline:** 1–2 days  
**Impact:** Merchants are no longer stranded after completing the wizard

**Frontend changes only:**

1. **`PublishDashboard.tsx` — Update done screen**
   - Replace the single "Done" button with two: "View product" and "Create another"
   - "View product" → `router.push('/products/${masterProductId}')`
   - "Create another" → `router.push('/products/v2/create')`
   - The `masterProductId` is already in scope from the URL params

2. **Sidebar — rename and re-route "Channel Product List"**
   - Change label: `"Channel Product List"` → `"My Products"`
   - Change path: `/products/channel-list` → `/products`
   - The `/products` route will show an interim "coming in Phase 2" placeholder until
     the full list page is built — better than the current broken placeholder

**Delivers:** A clear exit from the wizard. Merchants know where their product lives.

---

### Phase 2 — My Products list *(backend required)*

**Timeline:** 1–2 weeks  
**Depends on:** Backend `GET /admin/master-products` listing endpoint (see §9)

**Frontend:**
- New page: `src/app/(admin)/products/page.tsx` → `MyProductsPage`
- Renders a searchable, filterable table of master products
- Each row shows: thumbnail, name, SKU, variant count, category, channel icons, sync status badge
- Row click → `/products/{id}` (Product Detail, built in Phase 3)
- Interim: clicking a row shows a toast "Product detail coming soon" until Phase 3 lands

**Delivers:** Merchants can find their products. The library exists.

---

### Phase 3 — Product Detail *(backend required)*

**Timeline:** 2–3 weeks  
**Depends on:** Backend `GET /admin/master-products/{id}` with channel sync data

**Frontend:**
- New page: `src/app/(admin)/products/[masterProductId]/page.tsx` → `ProductDetailPage`
- Two-column layout: master data left, channel cards right (see wireframe §4.2)
- Channel card states: Synced / Warning / Failed / Draft / Syncing
- "Edit fields" button on each card → opens existing Step 2 (`channel-fields`)
- "Re-sync" button on each card → calls sync endpoint for that product + store
- "Edit Master" button → `/products/{id}/edit` (Phase 4)
- "+ Add channel" → opens Step 2 with the new store tab active

**Delivers:** Merchants can see and manage every channel a product is on from one screen.

---

### Phase 4 — Edit master product *(backend required)*

**Timeline:** 1–2 weeks  
**Depends on:** Backend `PUT /admin/master-products/{id}` (or reuse existing create endpoint
with an update flag)

**Frontend:**
- New route: `src/app/(admin)/products/[masterProductId]/edit/page.tsx`
- Reuses `ProductCreatePage` (Step 1 component) with `mode="edit"` and pre-filled data
- After save → redirect to Product Detail → all channel cards show "◌ Pending re-sync"
- Backend automatically queues re-sync for all mapped channel stores on master update

**Delivers:** Merchants can change product names, prices, descriptions and push the
update across all their channels.

---

### Phase 5 — Channel Sync dashboard *(backend required)*

**Timeline:** 2–3 weeks  
**Depends on:** Backend `GET /admin/channel-sync/summary` and `GET /admin/channel-sync/products`

**Frontend:**
- Replaces current mock `ChannelProductsGrid` at `/channels/products`
- Store health cards with health bar, error counts, top errors inline (see wireframe §4.3)
- "View all products →" expands to per-store product table at `?store={storeId}` (§4.4)
- Per-store table: channel price, channel SKU, sync status, inline error expansion
- "Fix field" on error row → opens Step 2 for that product at the relevant store tab
- "Sync all" triggers a full sync for that store

**Delivers:** Operators can monitor all channels at a glance and fix errors without
hunting through individual product pages.

---

### Phase 6 — Polish & integration *(no new backend)*

**Timeline:** 1 week  
**Depends on:** Phases 2–5 complete

- **Sidebar error badge:** red count of total failed syncs across all stores, shown next
  to "Channel Sync" nav item (data from Channel Sync summary API already built in Phase 5)
- **Bulk sync from My Products:** "Sync selected" dropdown calls sync per product
- **Breadcrumb depth:** Channel Sync → Per-store table → Product Detail → Edit
  all navigate back correctly
- **Empty states:** consistent empty state copy across all new pages
- **Mobile responsiveness:** Product Detail column layout collapses gracefully on small screens

**Delivers:** The system feels complete. The end-to-end flow is polished.

---

## 9. Data Requirements (Backend)

| Phase | Endpoint | Purpose |
|---|---|---|
| 2 | `GET /admin/master-products?organizationId=&page=&limit=&q=&categoryId=&channelStatus=` | My Products list |
| 2 | Response shape: paginated list with per-product `channelSyncSummary[]` (one per store) | — |
| 3 | `GET /admin/master-products/{id}?organizationId=` | Product Detail — full data |
| 3 | Response includes: master fields + `channelDistribution[]` (per-store: price, SKU, syncStatus, errors) | — |
| 3 | `POST /admin/master-products/{id}/sync?storeId=` | Re-sync one product on one store |
| 4 | `PUT /admin/master-products/{id}` | Edit master product |
| 4 | On update: backend queues re-sync for all mapped stores automatically | — |
| 5 | `GET /admin/channel-sync/summary?organizationId=` | Channel Sync — store health cards |
| 5 | Response: `[{ storeId, storeName, channelType, health, synced, warnings, failed, draft, topErrors[] }]` | — |
| 5 | `GET /admin/channel-sync/products?organizationId=&storeId=&status=&q=&page=` | Per-store product table |
| 5 | Response: paginated list with channelPrice, channelSku, syncStatus, errors per product | — |

Steps 2 and 3 endpoints already exist and are production-ready.
The missing piece is the listing, detail, and sync-status retrieval of master products.
