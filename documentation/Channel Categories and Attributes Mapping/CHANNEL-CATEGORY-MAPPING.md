# Channel Category Mapping — Detailed Reference

> **Related:** `CATEGORY-OWNERSHIP-AND-PRODUCT-TYPE-ARCHITECTURE.md` (Section 7) introduces
> the concept of link vs sync. This document goes deeper on every aspect of the mapping
> itself: the data model, per-channel behaviour, API operations, state machine edge cases,
> and the merchant-facing UX for each scenario.

---

## 1. What Is a Channel Category Mapping?

Every `ProductCategory` in the platform can be connected to a corresponding category on
one or more sales channels. Each connection is stored as **its own document** in the
`channel_category_mappings` collection (see Section 9 for why a separate collection
is the correct design, not an embedded array).

```
product_categories document: "Smartphones"
  _id: 64f3a1b2c3d4e5f6a7b8c9d0    ← stable MongoDB ObjectId
  name: "Smartphones"
  ...
  channelSyncSummary: {             ← denormalized summary only (no full mapping data)
    totalMapped:  3,
    totalDrifted: 0,
    totalUnmapped: 0,
    lastSyncedAt: "2026-04-05T14:30:00Z"
  }


channel_category_mappings documents — one per (category × store):

  { categoryId: 64f3a1b2c3d4e5f6a7b8c9d0,
    storeId:    64f3a1b2c3d4e5f6a7b8c9d1,   ← Shopify store
    channelType: "shopify",
    externalId:  "gid://shopify/Collection/987654321",
    externalSlug: "smartphones",
    externalName: "Smartphones",             ← snapshot for drift detection
    syncStatus:  "MAPPED",
    importedFrom: true,
    lastSyncedAt: "2026-04-01T09:00:00Z",
    lastDriftAt: null, driftReason: null }

  { categoryId: 64f3a1b2c3d4e5f6a7b8c9d0,
    storeId:    64f3a1b2c3d4e5f6a7b8c9d2,   ← WooCommerce store
    channelType: "woocommerce",
    externalId:  "42",
    externalSlug: "smartphones",
    externalName: "Smartphones",
    syncStatus:  "MAPPED",
    importedFrom: false,                     ← linked manually (2nd channel)
    lastSyncedAt: "2026-04-05T14:30:00Z",
    lastDriftAt: null, driftReason: null }

  { categoryId: 64f3a1b2c3d4e5f6a7b8c9d0,
    storeId:    64f3a1b2c3d4e5f6a7b8c9d3,   ← Amazon store
    channelType: "amazon",
    externalId:  "2407749011",               ← Amazon Browse Node ID
    externalSlug: null,                      ← Amazon has no slug concept
    externalName: "Cell Phones",
    syncStatus:  "MAPPED",
    importedFrom: false,
    lastSyncedAt: "2026-04-03T11:00:00Z",
    lastDriftAt: null, driftReason: null }
```

**Key point:** One platform category → many mapping documents, each independent.
A DRIFTED status on Shopify has zero effect on the WooCommerce or Amazon document.

---

## 2. Full Field Definitions

```
Field             Type        Description
─────────────────────────────────────────────────────────────────────────────
storeId           ObjectId    Reference to the ChannelStoreConnection document.
                              Identifies which connected store account this
                              mapping belongs to (one merchant may have multiple
                              Shopify stores).

channelType       string      The platform's internal channel identifier.
                              Values: "shopify" | "woocommerce" | "amazon" |
                              "tiktok" | "ebay" | "etsy" | "lazada" | ...
                              Used to route API calls to the right adapter.

externalId        string      The channel's own identifier for this category.
                              Always stored as a string even if the channel uses
                              integers. Examples:
                                Shopify:      "gid://shopify/Collection/987654321"
                                WooCommerce:  "42"
                                Amazon:       "2407749011"  (browse node)
                                TikTok:       "600001"
                                eBay:         "9355"
                              Product sync uses this ID — not the name.

externalSlug      string?     The channel's URL handle or slug. Used for
                              reconciliation and display. Null for channels that
                              have no slug concept (Amazon, eBay).

externalName      string      Snapshot of the category name on the channel
                              at the time of last sync. Used to detect drift:
                              if the channel's current name ≠ externalName,
                              the rename happened externally.

syncStatus        enum        Current health of this mapping:
                                MAPPED          — aligned, sync works normally
                                DRIFTED         — channel renamed/moved externally
                                UNMAPPED        — no channel link exists yet
                                PENDING_IMPORT  — import in progress, unconfirmed

importedFrom      boolean     true = this platform category was created BY importing
                              this channel's category (Shopify was the origin source).
                              false = category was created in platform or linked manually.
                              Affects how drift resolution is presented to merchant.

lastSyncedAt      DateTime    Timestamp of the last successful sync operation
                              (push-out or pull-confirm). Used for staleness checks.

lastDriftAt       DateTime?   When drift was first detected. Null if never drifted.

driftReason       string?     Human-readable explanation of what changed:
                              e.g. "Collection renamed from 'Smartphones' to
                              'Mobile Devices' on 2026-04-02".
                              Shown in the drift resolution UI.
```

---

## 3. Per-Channel Behaviour Differences

Different channels have fundamentally different category systems. The mapping adapts
to each one rather than forcing a single model.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SHOPIFY — Collections                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Type:       Manual collections (merchant-created) and smart collections     │
│  ID format:  GraphQL GID  "gid://shopify/Collection/987654321"               │
│  REST ID:    987654321  (numeric, used in older REST API calls)              │
│  Hierarchy:  Flat — no native parent/child. Platform stores hierarchy.       │
│                                                                              │
│  Import:     Fetch GET /admin/api/collections.json                           │
│              Only manual collections → import candidates                     │
│              Smart collections (auto-rules) → skip, they are transient      │
│                                                                              │
│  Push-out:   POST /admin/api/collections.json  (create)                     │
│              PUT  /admin/api/collections/{id}.json  (rename/update)         │
│                                                                              │
│  Drift:      Webhook: collections/update, collections/delete                 │
│              Detect: current title ≠ externalName → DRIFTED                 │
│              Detect: collection deleted → syncStatus = UNMAPPED             │
│                                                                              │
│  Notes:      Shopify collections are flat. The platform category hierarchy  │
│              is maintained only in the platform. All Shopify collections     │
│              appear at the same level in Shopify's UI regardless of how      │
│              deep they are in the platform tree.                             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  WOOCOMMERCE — Product Categories                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Type:       Hierarchical categories (native parent/child support)           │
│  ID format:  Integer term ID  "42"                                           │
│  Hierarchy:  Native — WooCommerce supports parent_id on categories           │
│                                                                              │
│  Import:     GET /wp-json/wc/v3/products/categories?per_page=100            │
│              Hierarchy is preserved — parent category imported first,        │
│              child categories linked via parent_id                           │
│                                                                              │
│  Push-out:   POST /wp-json/wc/v3/products/categories  (create)             │
│              PUT  /wp-json/wc/v3/products/categories/{id}  (update)        │
│              When pushing a child category, set parent to WooCommerce        │
│              term ID of the parent (looked up from parent's channelMapping)  │
│                                                                              │
│  Drift:      WooCommerce has no native webhooks for category changes.        │
│              Platform runs a scheduled reconciliation job (daily) that       │
│              fetches all categories and compares externalName.               │
│              Drift detected → syncStatus = DRIFTED                           │
│                                                                              │
│  Notes:      Best channel for hierarchy sync. The platform can mirror        │
│              the full tree in WooCommerce natively.                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  AMAZON — Browse Nodes                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Type:       Fixed, Amazon-owned taxonomy. Merchant cannot create nodes.     │
│  ID format:  Numeric string  "2407749011"                                    │
│  Hierarchy:  Extremely deep (10+ levels). Amazon owns all of it.            │
│                                                                              │
│  Import:     NEVER import Amazon Browse Nodes as platform categories.        │
│              They are meaningless outside Amazon and change without notice.  │
│                                                                              │
│  Push-out:   Not applicable — the merchant picks a browse node from          │
│              Amazon's catalog when listing a product. The mapping records    │
│              which browse node this platform category maps to so it can      │
│              pre-fill the Amazon listing form automatically.                 │
│                                                                              │
│  Drift:      Amazon Browse Node IDs rarely change but Amazon sometimes       │
│              deprecates old nodes. Platform checks quarterly.                │
│              If a browse node is deprecated: syncStatus = DRIFTED           │
│              Merchant must pick a replacement node.                          │
│                                                                              │
│  Notes:      This is TYPE 2 (channel-defined taxonomy — see main doc).       │
│              The externalId stored here is used as a lookup, not a sync     │
│              target. No collection is created or updated on Amazon.          │
│              Amazon products are listed individually, not in collections.    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  TIKTOK SHOP — Categories                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Type:       Fixed, TikTok-owned taxonomy. Merchant selects, cannot create. │
│  ID format:  Numeric string  "600001"                                        │
│                                                                              │
│  Import:     NEVER import TikTok categories as platform categories.          │
│              Same reason as Amazon — owned by TikTok, opaque IDs.           │
│                                                                              │
│  Push-out:   Same as Amazon — externalId is stored so product listings can  │
│              be pre-filled with the correct TikTok category ID.              │
│                                                                              │
│  Drift:      TikTok updates their category tree periodically.                │
│              Platform pulls the TikTok category tree monthly and checks      │
│              if any stored externalIds have been removed or remapped.        │
│                                                                              │
│  Notes:      TYPE 2 channel-defined taxonomy.                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  EBAY — Categories                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Type:       Fixed, eBay-owned category tree. Different per marketplace      │
│              (eBay US, eBay UK, eBay DE each have their own tree).           │
│  ID format:  Numeric string  "9355"                                          │
│                                                                              │
│  Import:     NEVER import. TYPE 2 — owned by eBay.                          │
│                                                                              │
│  Push-out:   externalId pre-fills eBay listing category selector.           │
│                                                                              │
│  Notes:      One platform category may need multiple eBay mappings —        │
│              one per eBay marketplace if merchant sells on multiple eBay     │
│              sites. The storeId differentiates them.                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. The Three Sync Operations — Full Detail

### The collection lookup chain (applies to all three operations)

Before the per-operation details, understand what the service reads from MongoDB
every time it needs to call a channel API:

```
The service always needs three things to make a channel API call:

  ① WHAT to update  → externalId  from channel_category_mappings
  ② WHERE to call   → apiBaseUrl  from channel_stores
  ③ HOW to auth     → accessToken from channel_stores

The storeId field on the mapping document is the bridge:

  channel_category_mappings               channel_stores
  ──────────────────────────              ─────────────────────────────────────
  _id:         <mappingId>                _id:          <same as storeId>
  categoryId:  <categoryId>   ┌─ FK ──→  merchantId:   <organizationId>
  storeId:     <storeId> ─────┘          channelType:  "shopify"
  channelType: "shopify"                 shopUrl:      "my-store.myshopify.com"
  externalId:  "gid://..."               apiBaseUrl:   "https://my-store.myshopify.com
  syncStatus:  "MAPPED"                                /admin/api/2024-01"
  ...                                    accessToken:  "shpat_xxxxxxxxxxxx"
                                         status:       "ACTIVE"
                                         scopes:       ["read_products",
                                                        "write_collections", ...]


LOOKUP SEQUENCE (every sync call):

  Step A  channel_category_mappings.find({ categoryId, syncStatus: "MAPPED" })
          → returns list of mappings, each with a storeId and externalId

  Step B  channel_stores.findById(mapping.storeId)
          → returns the store record with apiBaseUrl + accessToken

  Step C  Use mapping.channelType to select the right adapter class:
            "shopify"     → ShopifyCollectionAdapter
            "woocommerce" → WooCommerceTermAdapter
            "amazon"      → AmazonBrowseNodeAdapter  (read-only reference)
            "tiktok"      → TikTokCategoryAdapter    (read-only reference)

  Step D  Call adapter.push(store, mapping, categoryData)
          Adapter assembles the API call:
            URL:     store.apiBaseUrl + adapter-specific path + mapping.externalId
            Auth:    Authorization: Bearer {store.accessToken}
            Body:    { title: category.name, handle: category.slug, ... }


EXAMPLE — push "Smartphones" rename to Shopify:

  mapping  = channel_category_mappings.findOne({ categoryId: "...", channelType: "shopify" })
             → { externalId: "gid://shopify/Collection/987654321", storeId: "..." }

  store    = channel_stores.findById(mapping.storeId)
             → { apiBaseUrl: "https://my-store.myshopify.com/admin/api/2024-01",
                 accessToken: "shpat_xxxxxxxxxxxx" }

  API call → PUT https://my-store.myshopify.com/admin/api/2024-01/collections/987654321.json
             Authorization: Bearer shpat_xxxxxxxxxxxx
             { "collection": { "id": 987654321, "title": "Smartphones" } }
```

**channel_stores is the credentials store.** It is NOT specific to categories — it is
the same collection used by all sync operations across the entire platform (product sync,
order sync, inventory sync). Category sync reads from it the same way product sync does.

---

### ① IMPORT — channel → platform (one-time)

```
TRIGGER:
  Merchant clicks "Import from [channel]" during onboarding,
  or manually triggers "Re-import" from the channel mapping admin page.

COLLECTIONS READ:
  channel_stores.findById(storeId)
  → get apiBaseUrl + accessToken to call the channel's category list API

STEPS:
  1. Read channel_stores by storeId → get API credentials
  2. Call channel category list API:
       Shopify:     GET {apiBaseUrl}/collections.json
       WooCommerce: GET {apiBaseUrl}/products/categories?per_page=100
  3. Filter: remove smart collections (Shopify), transient/seasonal categories
  4. Build import preview — show merchant what will be created
  5. Merchant selects/deselects which to import
  6. For each selected:
     a. Insert into product_categories: { name, slug, path, level, parentId }
     b. Insert into channel_category_mappings:
           { categoryId: new _id, storeId, channelType,
             externalId, externalName,
             importedFrom: true, syncStatus: "PENDING_IMPORT" }
  7. Merchant confirms → updateMany on channel_category_mappings:
       syncStatus: "PENDING_IMPORT" → "MAPPED"
  8. Recompute channelSyncSummary on each affected product_categories document
  9. Auto-suggest ProductType based on category name (NLP matching)

IDEMPOTENCY:
  Before step 6, check:
    channel_category_mappings.findOne({ storeId, externalId })
  If already exists → skip insert, just update externalName snapshot.
  Prevents duplicate categories on re-import.

PARENT RESOLUTION (WooCommerce — hierarchical):
  Sort imported items by level ascending (parents first).
  When inserting a child:
    Look up its WooCommerce parent_id in the in-memory batch results
    to find the platform parentId already inserted in this batch.
  If parent was skipped by merchant → insert child at root level.
```

### ② PUSH OUT — platform → all channels (ongoing)

```
TRIGGER:
  Merchant saves any change to a category in the platform:
    • Create new category
    • Rename a category
    • Change category's parent (reparent)
    • Toggle active/inactive
    • Delete (if no children or products)

COLLECTIONS READ:
  ① channel_category_mappings.find({ categoryId, syncStatus: "MAPPED" })
     → get all active links for this category (externalId per store)
  ② channel_stores.findById(mapping.storeId)   [once per mapping]
     → get apiBaseUrl + accessToken for that store

STEPS:
  1. product_categories save completes
  2. Query channel_category_mappings: find({ categoryId, syncStatus: "MAPPED" })
     → returns N mapping documents (one per connected store)
  3. For each mapping:
     a. Query channel_stores: findById(mapping.storeId)
        → { apiBaseUrl, accessToken, channelType }
     b. Select adapter by channelType
     c. Call adapter.push(store, mapping, categoryData)
     d. On success: updateOne on channel_category_mappings
           { lastSyncedAt: now() }
        Recompute channelSyncSummary on product_categories
     e. On failure: updateOne on channel_category_mappings
           { syncStatus: "PUSH_FAILED" }
        Queue retry (exponential backoff, 3 attempts)

PARENT PUSH (WooCommerce — needs parent term ID):
  Before calling adapter for a child category:
    Query channel_category_mappings:
      findOne({ categoryId: parentCategory._id, storeId: mapping.storeId })
    → get parent's externalId (WooCommerce parent term ID)
    Pass it as parent_id in the API body.
  If parent has no mapping for this store → push parent first, then child.

CHANNELS THAT DO NOT SUPPORT PUSH (Amazon, TikTok, eBay):
  These channels own their taxonomy. externalId is a reference, not a target.
  Adapter.push() for these is a no-op — only updates lastSyncedAt.
  The stored externalId is used downstream when publishing products
  (pre-fills the listing's category/browse-node field automatically).
```

### ③ DRIFT DETECT — reactive (webhook) + scheduled (polling)

```
WEBHOOK-BASED (Shopify — real-time):

  COLLECTIONS READ:
    channel_category_mappings.findOne({ storeId, externalId })
    → identify which platform mapping this webhook is about

  FLOW:
    Shopify fires: collections/update  or  collections/delete
    Webhook payload contains: shop domain + collection id + new title

    Lookup:
      store   = channel_stores.findOne({ shopUrl: payload.domain })
      mapping = channel_category_mappings.findOne({
                  storeId:    store._id,
                  externalId: payload.id  (converted to GID format)
                })

    Compare: payload.title vs mapping.externalName
      If title changed → updateOne on channel_category_mappings:
                           { syncStatus: "DRIFTED",
                             driftReason: "Renamed from '...' to '...' on Shopify",
                             lastDriftAt: now() }
      If deleted       → updateOne: { syncStatus: "UNMAPPED", externalId: null }

    Recompute channelSyncSummary on product_categories for the affected categoryId
    Notify merchant (push notification / dashboard badge)


POLLING-BASED (WooCommerce — no category webhooks):

  COLLECTIONS READ:
    channel_stores.find({ channelType: "woocommerce", status: "ACTIVE" })
    channel_category_mappings.find({ storeId, syncStatus: { $in: ["MAPPED","DRIFTED"] } })

  FLOW (scheduled daily):
    For each active WooCommerce store:
      store = channel_stores.findById(storeId) → get apiBaseUrl + accessToken
      Fetch: GET {apiBaseUrl}/products/categories?per_page=100
        → currentCategories map: { termId → { name, slug } }

      mappings = channel_category_mappings.find({ storeId, syncStatus: $in[MAPPED,DRIFTED] })
      For each mapping:
        current = currentCategories[mapping.externalId]
        If current not found    → syncStatus = "UNMAPPED"
        If current.name ≠ mapping.externalName → syncStatus = "DRIFTED", driftReason set

      Batch updateMany for changed statuses
      Recompute channelSyncSummary for all affected categoryIds
      Generate drift digest notification per merchant


DRIFT RESOLUTION FLOW (merchant UI):
  ┌──────────────────────────────────────────────────────────────┐
  │  ⚠ Channel Drift Detected — Shopify                          │
  │                                                              │
  │  Platform category:   "Smartphones"                          │
  │  Shopify collection:  "Mobile Devices"   (renamed externally)│
  │  Detected:            2026-04-02 at 14:32                    │
  │                                                              │
  │  Choose how to resolve:                                      │
  │                                                              │
  │  ○ Rename platform category to "Mobile Devices"              │
  │    (updates platform name, triggers PUSH OUT to all channels)│
  │                                                              │
  │  ○ Rename Shopify collection back to "Smartphones"           │
  │    (calls Shopify API to revert — reads channel_stores       │
  │     for credentials, uses mapping.externalId as target)      │
  │                                                              │
  │  ○ Keep both — they can have different names                 │
  │    (updates externalName snapshot on mapping, clears DRIFTED)│
  │                                                              │
  │  [Confirm resolution]                           [Ignore]     │
  └──────────────────────────────────────────────────────────────┘

  All three options ultimately write to channel_category_mappings
  (syncStatus back to MAPPED) and recompute channelSyncSummary.
```

---

## 5. syncStatus State Machine — All Transitions

```
                         ┌─────────────────────────────┐
                         │                             │
         Category created without mapping              │
         (platform-only, no channel connected)         │
                         │                             │
                         ▼                             │
               ┌──────────────────┐                    │
               │    UNMAPPED      │ ◄──── Channel       │
               │                  │       deleted       │
               └────────┬─────────┘       externally   │
                        │                              │
          Merchant maps / import starts               │
                        │                              │
                        ▼                              │
               ┌──────────────────┐                    │
               │  PENDING_IMPORT  │ ◄── Import wizard  │
               │                  │     in progress    │
               └────────┬─────────┘                    │
                        │                              │
          Merchant confirms / auto-confirm             │
                        │                              │
                        ▼                              │
          ┌─────────────────────────────┐              │
          │           MAPPED            │ ──────────────┘
          │  (normal operating state)   │ ◄──────────────────┐
          └──────┬─────────────┬────────┘                    │
                 │             │                             │
         Channel name    Channel deleted                     │
         changed on       externally                Merchant resolves
         channel side         │                       drift or
                 │             │                   un-deletes/remaps
                 ▼             ▼                             │
          ┌───────────┐  ┌───────────┐                      │
          │  DRIFTED  │  │  UNMAPPED │ ─────────────────────┘
          │           │  │           │
          └───────────┘  └───────────┘

  PUSH_FAILED (transient — not shown above):
    syncStatus = PUSH_FAILED when a push-out API call to channel fails.
    Platform retries with exponential backoff (3×).
    After 3 failures: merchant notified. Status stays PUSH_FAILED until
    either retry succeeds (→ MAPPED) or merchant intervenes.
```

---

## 6. Second Channel Connection — Mapping, Not Importing

When a merchant connects a second channel (e.g., WooCommerce after Shopify), the
platform already has a full category tree from the first import. The second channel's
categories need to be **linked to existing platform categories**, not imported as new ones.

```
SCENARIO:
  Platform already has:         WooCommerce has:
  • Smartphones                 • "Phones & Tablets"  (term/42)
  • Laptops                     • "Computers"         (term/17)
  • Men's Clothing              • "Men"               (term/8)
  • Women's Clothing            • "Women"             (term/9)
  • Home & Garden               • "Deals"             (term/55) ← seasonal

MATCHING STEP (automated):
  Platform runs fuzzy name matching:
    "Phones & Tablets" → 87% match → "Smartphones"
    "Computers"        → 91% match → "Laptops"
    "Men"              → 82% match → "Men's Clothing"
    "Women"            → 82% match → "Women's Clothing"
    "Deals"            → 0% match  → no suggestion (seasonal)

MERCHANT SEES:
  ┌──────────────────────────────────────────────────────────────────┐
  │  Link WooCommerce categories to your master categories           │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  WooCommerce              →  Platform category                   │
  │  ─────────────────────────────────────────────────               │
  │  ✓ Phones & Tablets       →  [ Smartphones         ▾ ]  87%     │
  │  ✓ Computers              →  [ Laptops             ▾ ]  91%     │
  │  ✓ Men                    →  [ Men's Clothing      ▾ ]  82%     │
  │  ✓ Women                  →  [ Women's Clothing    ▾ ]  82%     │
  │  ? Deals                  →  [ — skip (seasonal)  ▾ ]  —       │
  │                                                                  │
  │  [Accept all suggestions]                 [Review manually]      │
  └──────────────────────────────────────────────────────────────────┘

AFTER MERCHANT CONFIRMS:
  Platform category "Smartphones" gains a new channelMapping entry:
    { channelType: "woocommerce", externalId: "42", syncStatus: "MAPPED",
      importedFrom: false, externalName: "Phones & Tablets" }

  No new ProductCategory records created.
  The mapping is stored on the EXISTING platform category.

NOTE:
  importedFrom: false  here because this platform category was originally
  created from Shopify, not WooCommerce. This distinction matters for
  drift resolution phrasing:
    importedFrom: true  → "You imported this from Shopify. Shopify renamed it."
    importedFrom: false → "Your WooCommerce category name no longer matches."
```

---

## 7. New Category Created in Platform (After Onboarding)

After initial setup, the platform is the master. New categories flow outward.

```
MERCHANT ACTION:
  Create "Gaming Laptops" under "Laptops" in platform

PLATFORM RESPONSE:
  1. Create ProductCategory:  "Gaming Laptops" (parentId → Laptops)
  2. Inherit ProductType from parent: "Laptop"
  3. Walk all channelMappings of parent "Laptops":
     a. Shopify store:
        → POST /admin/api/collections.json
        → body: { title: "Gaming Laptops", handle: "gaming-laptops" }
        → on success: add channelMapping { externalId: new GID, syncStatus: MAPPED }
     b. WooCommerce store:
        → POST /wp-json/wc/v3/products/categories
        → body: { name: "Gaming Laptops", slug: "gaming-laptops",
                  parent: <WooCommerce term ID of Laptops> }
        → on success: add channelMapping { externalId: "67", syncStatus: MAPPED }
     c. Amazon browse node:
        → Cannot create. Amazon owns their tree.
        → channelMapping for Amazon NOT created automatically
        → Merchant sees: "Select an Amazon Browse Node for Gaming Laptops"
        → Merchant picks browse node → MAPPED

RESULT:
  channelMappings on "Gaming Laptops":
  [
    { channelType: "shopify",     externalId: "gid://...",  syncStatus: "MAPPED" },
    { channelType: "woocommerce", externalId: "67",         syncStatus: "MAPPED" },
    { channelType: "amazon",      externalId: "...",        syncStatus: "MAPPED" }
    // (Amazon added after merchant selects browse node)
  ]
```

---

## 8. Category Mapping Admin Page — Merchant UX

This page lives at: `/merchant-admin/channels/category-mapping`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Channel Category Mapping                                                    │
│                                                                              │
│  Filter: [All channels ▾]  [All statuses ▾]  [Search categories...]         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Platform Category    Shopify           WooCommerce    Amazon       TikTok  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Electronics          —                 MAPPED ✓       —            —       │
│  ├ Smartphones        MAPPED ✓          MAPPED ✓       MAPPED ✓     MAPPED ✓│
│  ├ Laptops            MAPPED ✓          MAPPED ✓       MAPPED ✓     —       │
│  │  └ Gaming Laptops  MAPPED ✓          MAPPED ✓       [Map →]      —       │
│  Fashion              —                 MAPPED ✓       —            —       │
│  ├ Men's Clothing     DRIFTED ⚠         MAPPED ✓       MAPPED ✓     —       │
│  │  (renamed on       [Resolve]                                             │
│  │   Shopify)                                                               │
│  └ Women's Clothing   MAPPED ✓          MAPPED ✓       MAPPED ✓     —       │
│  Home & Garden        MAPPED ✓          MAPPED ✓       [Map →]      —       │
│                                                                              │
│  Legend:  ✓ MAPPED  ⚠ DRIFTED  [Map →] UNMAPPED  — not applicable          │
│                                                                              │
│  [+ Import from channel ▾]    [Sync all now]    [Download mapping report]   │
└──────────────────────────────────────────────────────────────────────────────┘

Key interactions:
  MAPPED ✓      → click to see link details (externalId, lastSyncedAt)
  DRIFTED ⚠    → click to open drift resolution modal
  [Map →]       → click to open mapping selector for that channel
  —             → channel does not support collections (Amazon/TikTok for push)
                  or merchant has not connected that channel
```

---

## 9. Backend Data Architecture

### Should channelMappings be embedded or a separate collection?

**The embedded design (shown in Section 1 of this document) is a starting point but
has three concrete problems that make a separate collection the right answer for this
system:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROBLEM 1 — Concurrent write contention                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MongoDB locks at the document level.                                        │
│  In a bulk sync, multiple webhooks fire for the SAME category at once:       │
│                                                                              │
│    Shopify webhook  ──→ update channelMappings[$shopify].syncStatus ─┐      │
│    WooCommerce job  ──→ update channelMappings[$woo].syncStatus     ─┤ same │
│    TikTok job       ──→ update channelMappings[$tiktok].lastSyncedAt┘ doc  │
│                                                                              │
│  All three queue up to write to the same product_categories document.        │
│  They serialize. At scale (500 categories × 10 channels = 5000 ops),        │
│  this becomes a bottleneck.                                                  │
│                                                                              │
│  With a separate collection → 5000 different documents → zero contention.   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PROBLEM 2 — Compound multikey index limitation                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  The webhook handler needs to find a category by externalId + storeId.      │
│  With embedding you need $elemMatch to ensure both fields come from the      │
│  SAME array element (not two different elements that each match one field):  │
│                                                                              │
│  // WRONG — may match across different array elements:                       │
│  db.product_categories.findOne({                                             │
│    "channelMappings.storeId":    ObjectId("..."),                            │
│    "channelMappings.externalId": "gid://shopify/Collection/123"              │
│  })                                                                          │
│                                                                              │
│  // CORRECT — but slower, requires $elemMatch:                               │
│  db.product_categories.findOne({                                             │
│    channelMappings: {                                                        │
│      $elemMatch: {                                                           │
│        storeId:    ObjectId("..."),                                          │
│        externalId: "gid://shopify/Collection/123"                            │
│      }                                                                       │
│    }                                                                         │
│  })                                                                          │
│                                                                              │
│  And updating that element requires arrayFilters syntax:                     │
│  db.product_categories.updateOne(                                            │
│    { _id: categoryId },                                                      │
│    { $set: { "channelMappings.$[m].syncStatus": "DRIFTED" } },              │
│    { arrayFilters: [{ "m.storeId": storeId, "m.externalId": externalId }] } │
│  )                                                                           │
│                                                                              │
│  With a separate collection → plain findOneAndUpdate, simple compound index. │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PROBLEM 3 — Drift detection polling is expensive                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  "Find all DRIFTED mappings for store X" with embedding:                    │
│                                                                              │
│  db.product_categories.find({                                                │
│    channelMappings: {                                                        │
│      $elemMatch: { storeId: ObjectId("..."), syncStatus: "DRIFTED" }        │
│    }                                                                         │
│  })                                                                          │
│                                                                              │
│  This returns entire product_categories documents just to extract one        │
│  matching mapping element. You then need $project + $unwind + $match        │
│  to get back just the mappings you wanted.                                   │
│                                                                              │
│  With a separate collection:                                                 │
│  db.channel_category_mappings.find({ storeId: ObjectId("..."),              │
│                                       syncStatus: "DRIFTED" })              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended design: separate collection + lightweight summary embedded

```
The pattern: write the full data to the separate collection,
denormalize a tiny summary back onto the parent document for fast UI reads.
```

```javascript
// ─────────────────────────────────────────────────────────────────────────
// Collection: product_categories
// Lightweight — no channelMappings array. Only a computed summary.
// ─────────────────────────────────────────────────────────────────────────
{
  _id: ObjectId("64f3a1b2c3d4e5f6a7b8c9d0"),
  name: "Smartphones",
  slug: "smartphones",
  path: "electronics/phones/smartphones",
  level: 2,
  parentId: ObjectId("..."),
  active: true,
  productTypeId: ObjectId("64f3a1b2c3d4e5f6a7b8c9e1"),
  sortOrder: 1,
  metaTitle: "Buy Smartphones Online",
  metaDescription: "...",

  // Denormalized summary — recomputed whenever any mapping changes.
  // Used by the category list page to show status badges without a join.
  channelSyncSummary: {
    totalMapped:   3,
    totalDrifted:  1,    // ← triggers the ⚠ badge in the admin table
    totalUnmapped: 0,
    lastSyncedAt:  ISODate("2026-04-05T14:30:00Z"),
  },

  createdAt: ISODate("2026-01-15T08:00:00Z"),
  updatedAt: ISODate("2026-04-05T14:30:00Z"),
}


// ─────────────────────────────────────────────────────────────────────────
// Collection: channel_category_mappings   (NEW — separate)
// One document per (category × store) pair.
// ─────────────────────────────────────────────────────────────────────────
{
  _id: ObjectId("..."),
  categoryId:   ObjectId("64f3a1b2c3d4e5f6a7b8c9d0"),  // FK → product_categories
  storeId:      ObjectId("64f3a1b2c3d4e5f6a7b8c9d1"),  // FK → channel_stores
  channelType:  "shopify",

  externalId:   "gid://shopify/Collection/987654321",
  externalSlug: "smartphones",
  externalName: "Smartphones",   // snapshot — compared on every drift check

  syncStatus:   "MAPPED",        // MAPPED | DRIFTED | UNMAPPED | PENDING_IMPORT
  importedFrom: true,
  lastSyncedAt: ISODate("2026-04-01T09:00:00Z"),
  lastDriftAt:  null,
  driftReason:  null,

  createdAt: ISODate("2026-01-15T08:00:00Z"),
  updatedAt: ISODate("2026-04-01T09:00:00Z"),
}
```

### Why this hybrid is the right tradeoff

```
                    Embedded array    Separate collection    Hybrid (recommended)
                    ──────────────    ───────────────────    ────────────────────
Category list UI    ✓ 1 query         ✗ N+1 or join         ✓ 1 query (summary)
Webhook lookup      ~ $elemMatch       ✓ simple findOne      ✓ simple findOne
Drift poll query    ✗ complex agg      ✓ simple find         ✓ simple find
Concurrent writes   ✗ contention       ✓ no contention       ✓ no contention
Update one mapping  ~ arrayFilters     ✓ plain updateOne     ✓ plain updateOne
Document size risk  ~ grows with ch.   ✓ fixed size          ✓ fixed (tiny summ.)
```

### Indexes

```javascript
// ── channel_category_mappings ─────────────────────────────────────────────

// Webhook handler: find mapping by externalId + storeId (most frequent write)
db.channel_category_mappings.createIndex({ storeId: 1, externalId: 1 }, { unique: true })

// Drift detection polling: all DRIFTED/MAPPED entries for a given store
db.channel_category_mappings.createIndex({ storeId: 1, syncStatus: 1 })

// Load all mappings for one category (detail page / push-out operation)
db.channel_category_mappings.createIndex({ categoryId: 1 })

// Push-out: find all MAPPED entries for a store to propagate a name change
db.channel_category_mappings.createIndex({ categoryId: 1, syncStatus: 1 })


// ── product_categories ────────────────────────────────────────────────────

// Path prefix: find all descendants of a category
db.product_categories.createIndex({ path: 1 })

// Attribute schema loading
db.product_categories.createIndex({ productTypeId: 1 })

// Admin list: filter categories that have any drifted channel
db.product_categories.createIndex({ "channelSyncSummary.totalDrifted": 1 })
```

### How the summary stays consistent

```
Any time a channel_category_mappings document changes syncStatus:

  1. Write the mapping update (syncStatus, lastSyncedAt, etc.)
  2. Recompute the summary for that categoryId:

     db.channel_category_mappings.aggregate([
       { $match: { categoryId: categoryId } },
       { $group: {
           _id: "$categoryId",
           totalMapped:   { $sum: { $cond: [{ $eq: ["$syncStatus","MAPPED"]  }, 1, 0] } },
           totalDrifted:  { $sum: { $cond: [{ $eq: ["$syncStatus","DRIFTED"] }, 1, 0] } },
           totalUnmapped: { $sum: { $cond: [{ $eq: ["$syncStatus","UNMAPPED"]}, 1, 0] } },
           lastSyncedAt:  { $max: "$lastSyncedAt" }
       }}
     ])

  3. Write the result to product_categories.channelSyncSummary

  These two writes do NOT need to be atomic — the summary is a display
  convenience, not a source of truth. Eventual consistency is fine here.
  The mapping collection is always authoritative.
```

### Spring Boot service responsibilities

```
CategoryChannelMappingService
  ├── importFromChannel(storeId, channelType, selectedExternalIds[])
  │     → inserts channel_category_mappings with PENDING_IMPORT
  │     → recomputes summary on parent category
  │
  ├── confirmImport(storeId, categoryIds[])
  │     → updateMany: PENDING_IMPORT → MAPPED on mapping documents
  │     → recomputes summary for each affected category
  │
  ├── pushCategoryToChannels(categoryId)
  │     → find({ categoryId, syncStatus: "MAPPED" }) on mapping collection
  │     → calls adapter per mapping, updates lastSyncedAt
  │     → recomputes summary
  │
  ├── handleWebhook(channelType, storeId, externalId, payload)
  │     → findOne({ storeId, externalId }) on mapping collection  ← simple
  │     → compare payload name vs externalName → set DRIFTED or UNMAPPED
  │     → recomputes summary for affected categoryId
  │
  ├── pollForDrift(storeId, channelType)
  │     → find({ storeId, syncStatus: { $in: ["MAPPED","DRIFTED"] } })
  │     → batch compare, batch updateMany
  │     → recomputes summaries
  │
  └── resolveDrift(mappingId, resolution)
        → updateOne on the mapping document
        → recomputes summary
```

---

## 10. Summary — What Requires Manual Merchant Action vs What Is Automatic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTOMATION vs MANUAL                                │
├────────────────────────────────┬────────────────────────────────────────────┤
│  AUTOMATIC (no merchant action)│  MANUAL (merchant decision required)       │
├────────────────────────────────┼────────────────────────────────────────────┤
│ Category created in platform   │ First import: merchant selects which       │
│ → pushed to all MAPPED         │ channel collections to bring in            │
│   channel stores               │                                            │
├────────────────────────────────┼────────────────────────────────────────────┤
│ Category renamed in platform   │ Second channel: merchant reviews           │
│ → name updated on all MAPPED   │ and confirms auto-suggested mappings       │
│   channel stores               │                                            │
├────────────────────────────────┼────────────────────────────────────────────┤
│ Drift detected by webhook      │ Drift resolution: merchant picks which     │
│ → syncStatus set to DRIFTED    │ name wins (platform or channel)            │
│ → merchant alerted             │                                            │
├────────────────────────────────┼────────────────────────────────────────────┤
│ ProductType assignment         │ Amazon/TikTok/eBay browse node:            │
│ auto-suggested by NLP          │ merchant must pick from fixed taxonomy      │
│ → merchant clicks Accept       │ (these cannot be auto-created)             │
├────────────────────────────────┼────────────────────────────────────────────┤
│ New child category created     │ Unmapped channel collection detected:      │
│ → inherits parent ProductType  │ merchant decides to map, link, or ignore   │
│ → auto-pushed to channels      │                                            │
└────────────────────────────────┴────────────────────────────────────────────┘

RULE OF THUMB:
  If the platform originates the change → fully automatic.
  If the channel originates the change  → requires merchant decision.
  If the taxonomy is channel-owned (Amazon, TikTok) → always manual browse node pick.
```
