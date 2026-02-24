# Architecture — Channel Stores & Channel-Specific Data

## The Core Separation

The system distinguishes three completely different concerns that must not be mixed:

```
1. CHANNEL TYPE CONFIG     2. STORE CONNECTION          3. PRODUCT-STORE DATA
   (transformation             (physical store                (what the user
    contract)                   credentials)                   fills in Step 2)

channel_configurations     channel_store_connections      channel_product_data
────────────────────────   ─────────────────────────────  ────────────────────
How to transform data      Where to send the data         What data to send
for a channel type         and with what auth             for this product+store
```

### Why `channel_configurations` Must Stay Per Channel Type

Every field in `channel_configurations` is the same for all stores of the same
channel platform:

| Field | Shared? | Reason |
|-------|---------|--------|
| `joltSpec` | YES — all Shopify stores | Shopify's API structure is the same everywhere |
| `postProcessingRules` | YES — all Shopify stores | FOR_EACH, EXTRACT_DIMENSIONS etc. are platform rules |
| `apiSchema` | YES — all Shopify stores | Shopify's required API fields don't change per store |
| `requiredFieldObjects` | YES — all Shopify stores | Platform-level requirements |
| `apiWrapperConfig` | YES — all Shopify stores | `{"product":{...}}` wrapper is Shopify-specific |
| `attributeMappings` | YES — all Shopify stores | masterProductId → product.id is platform-defined |

Changing `channel_configurations` to per-store would mean duplicating all of the above
for every single store connection. An org with 3 Shopify stores would have 3 identical
JOLT specs. Any pipeline change requires updating 3 documents. This is wrong.

### Why `channel_store_connections` Must Be Per Store

Every field in `channel_store_connections` is different per store:

| Field | Per Store? | Reason |
|-------|-----------|--------|
| `credentials.accessToken` | YES | Each Shopify store has its own OAuth token |
| `credentials.shopDomain` | YES | mystore-us.myshopify.com ≠ mystore-eu.myshopify.com |
| `storeName` | YES | Display name differs per store |
| `region` | YES | US store vs EU store vs APAC store |
| `organizationId` | YES | Belongs to a specific tenant |

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRODUCT CREATION WIZARD                             │
│                                                                              │
│  STEP 1: Master Product                                                      │
│  ──────────────────────                                                      │
│  User fills: name, SKU, price, variants, images, category                   │
│                                                                              │
│  POST /api/v1/ecommerce/master-product                                       │
│    → creates MasterProductDocument in MongoDB                                │
│    → returns masterProductId                                                 │
│                                                                              │
│  STEP 2: Channel-Specific Fields                                             │
│  ─────────────────────────────────                                           │
│  System loads:                                                               │
│    channel_store_connections WHERE organizationId = org                      │
│      → finds "shopify-us-store", "shopify-eu-store", "wix-main"             │
│    For each store: channel_configurations WHERE channelId = channelType      │
│      → loads requiredFieldObjects, recommendedFields (the SCHEMA)           │
│    EcommerceMasterAttributeDocument WHERE isChannelField=true                │
│      AND supportedChannels CONTAINS channelType                              │
│      → loads the actual field definitions (labels, types, validation)        │
│                                                                              │
│  Frontend renders: one tab per connected store                               │
│  User fills: vendor, product_type, tags (per store, can differ)             │
│                                                                              │
│  POST /api/v1/ecommerce/channel-product-data/save                           │
│    → creates/updates ChannelProductDataDocument per store                    │
│    → { masterProductId, storeId, channelType, channelData: {...} }          │
│                                                                              │
│  STEP 3: Preview & Publish                                                   │
│  ───────────────────────────                                                 │
│  For each store the user chooses to publish:                                 │
│    1. Load channel_product_data (step 2 values for this product+store)       │
│    2. Load channel_store_connections (credentials + storeUrl)                │
│    3. Load channel_configurations (channelType) → JOLT + postProcess        │
│    4. Merge: masterProduct + channelData → transform → publish              │
│    5. Update channel_product_data.status = PUBLISHED                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## MongoDB Collections Overview

### Existing Collection (unchanged)

```
channel_configurations
  _id:                  ObjectId
  channelId:            "shopify"                    ← platform type
  channelName:          "Shopify"
  organizationId:       null                         ← null = system default
  isSystemDefault:      true
  joltSpec:             [...]
  postProcessingRules:  [...]
  apiSchema:            { title: {...}, price: {...} }
  requiredFieldObjects: [{ fieldName: "vendor", ... }]
  recommendedFields:    [{ fieldName: "tags", ... }]
  apiWrapperConfig:     { rootKey: "product" }
  attributeMappings:    { productFields: [...] }
  channelMetadataList:  [...]
```

### New Collection 1

```
channel_store_connections
  _id:          ObjectId
  storeId:      "shopify-us-store"          ← unique instance ID (slug)
  channelType:  "shopify"                   ← references channel_configurations.channelId
  storeName:    "My Shopify US Store"       ← display name shown in tabs
  storeUrl:     "mystore.myshopify.com"     ← used in sync API metadata
  region:       "US"                        ← optional label
  organizationId: "org_123"                 ← tenant
  credentials:  {                           ← encrypted at rest
                  accessToken: "shpat_...",
                  apiKey: "...",
                  apiSecret: "..."
                }
  isActive:     true
  displayOrder: 1                           ← tab order in Step 2
  connectedAt:  "2026-01-15T10:00:00"
  lastSyncedAt: "2026-02-20T08:30:00"

Indexes:
  { organizationId: 1, storeId: 1 }   UNIQUE
  { organizationId: 1, channelType: 1 }        ← find all Shopify stores for org
```

### New Collection 2

```
channel_product_data
  _id:              ObjectId
  masterProductId:  "prod_abc123"           ← references master product
  storeId:          "shopify-us-store"      ← references channel_store_connections
  channelType:      "shopify"               ← denormalized for query convenience
  organizationId:   "org_123"
  status:           "DRAFT"                 ← DRAFT | READY | PUBLISHED | FAILED
  channelData: {                            ← product-level channel values
    vendor:           "TechBrand US",
    product_type:     "Electronics",
    tags:             ["electronics", "gadget"],
    published_scope:  "web"
  }
  variantOverrides: {                       ← per-variant overrides keyed by SKU
    "SKU-001": { inventory_policy: "deny", barcode: "1234567890" },
    "SKU-002": { inventory_policy: "deny", barcode: "1234567891" }
  }
  completionPercentage: 80
  readyToPublish:   false
  publishedAt:      null
  publishError:     null
  savedAt:          "2026-02-21T10:00:00"

Indexes:
  { masterProductId: 1, storeId: 1 }   UNIQUE
  { organizationId: 1, status: 1 }           ← find all drafts for org
  { masterProductId: 1, channelType: 1 }     ← find all shopify data for product
```

---

## Relationship Diagram

```
EcommerceMasterAttributeDocument
  fieldName: "vendor"
  isChannelField: true
  supportedChannels: ["shopify"]          ─────────────────────────────────────┐
  section: "basic_info"                                                        │
  required: true                                                               │
                                                                               │
channel_configurations                   channel_store_connections             │
  channelId: "shopify"          ◄────    channelType: "shopify"               │
  requiredFieldObjects:                  storeId: "shopify-us-store"          │
    [{ fieldName: "vendor" }]            storeName: "My Shopify US"           │
  recommendedFields:                     credentials: { accessToken }         │
    [{ fieldName: "tags" }]              organizationId: "org_123"            │
                                                                               │
                                    Schema: which fields ◄────────────────────┘
                                    are required/recommended
                                    for this channel type?

MasterProductDocument                    channel_product_data
  _id: "prod_abc123"          ◄────      masterProductId: "prod_abc123"
  name: "Wireless Earbuds"               storeId: "shopify-us-store"
  variants: [...]                        channelType: "shopify"
                                         channelData: { vendor: "TechBrand" }
                                         status: "DRAFT"
```

---

## Key Design Decisions

### Decision 1: `channelData` is a free Map, not typed fields

`channel_product_data.channelData` is `Map<String, Object>` rather than a typed class
because channel-specific fields are driven by `EcommerceMasterAttributeDocument` at
runtime, not compiled Java classes. New channel fields can be added to MongoDB without
any Java code changes.

### Decision 2: `variantOverrides` keyed by SKU not variant index

Variants can be reordered. Keying overrides by `sku` (stable) rather than array index
(unstable) prevents data corruption if the master product's variant order changes.

### Decision 3: Credentials stored in `channel_store_connections`, not `channel_configurations`

Credentials are per-store and per-organization. Storing them in `channel_configurations`
(which is system-wide and shared) would be a security violation. The store connections
collection is always filtered by `organizationId`.

### Decision 4: `channelType` is denormalized onto `channel_product_data`

`channel_product_data` stores `channelType` in addition to `storeId` so that queries
like "find all Shopify product data for this master product" don't require a join through
`channel_store_connections`. MongoDB has no joins; denormalization is intentional.

### Decision 5: Status lifecycle is on `channel_product_data`, not master product

Each store independently moves through DRAFT → READY → PUBLISHED. The master product
has no publish status — it is always the source of truth. Publish state is a property
of the product-store relationship, not the product itself.
