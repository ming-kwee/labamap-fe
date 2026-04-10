# Category Ownership, ProductType Architecture & Channel Category Sync

> **Scope:** Omnichannel ecommerce — multi-channel platform  
> **Audience:** Platform architects, backend engineers, catalog managers  
> **Purpose:** Explain who owns what, why ProductType is necessary, how categories
> evolve in production, and how channel categories sync into the platform as master

---

## 1. Who Owns What — The Critical Clarification

The biggest source of confusion is conflating two completely different actors.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      THE TWO ACTORS IN THIS PLATFORM                        │
├──────────────────────────────────┬──────────────────────────────────────────┤
│   THE MERCHANT                   │   YOU (THE PLATFORM OWNER / BUILDER)     │
│   (your business customer)       │   (the team building this system)        │
├──────────────────────────────────┼──────────────────────────────────────────┤
│                                  │                                          │
│  Uses your platform as a TOOL    │  Builds and operates the platform        │
│  to run their ecommerce business │                                          │
│                                  │                                          │
│  OWNS:                           │  OWNS:                                   │
│  • Their ProductCategories       │  • MasterAttributes (field definitions)  │
│  • Their product catalog         │  • ProductTypes (schema contracts)       │
│  • Their channel store accounts  │  • Channel field mappings                │
│  • Their variant values          │  • Variant dimension rules               │
│    (Black, 64GB, XL, etc.)       │  • The platform's data architecture      │
│                                  │                                          │
│  CANNOT touch:                   │  CANNOT be disrupted by:                 │
│  • MasterAttribute definitions   │  • Merchant renaming their categories    │
│  • ProductType schemas           │  • Merchant reorganizing their catalog   │
│  • Variant dimension rules       │  • Merchant adding seasonal categories   │
│                                  │                                          │
│  LOGS IN TO:                     │  LOGS IN TO:                             │
│  • /merchant-admin/categories    │  • /omni-admin/master-attributes         │
│  • /merchant-admin/products      │  • /omni-admin/product-types             │
│  • /merchant-admin/channels      │  • /omni-admin/product-categories        │
│                                  │    (template categories for merchants)   │
└──────────────────────────────────┴──────────────────────────────────────────┘
```

### The three questions — now correctly attributed

```
MERCHANT asks:             "Where does this product live in MY store?"
                            → Their ProductCategories

PLATFORM OWNER asks:       "What type of object is this product?"
                            → ProductTypes  (schema contracts you define)

PLATFORM OWNER asks:       "What fields does this product need to fill in?"
                            → MasterAttributes  (field definitions you define)
```

### Why this matters for the data flow

```
YOU define the schema      MERCHANT populates it       CHANNELS receive it
─────────────────────      ─────────────────────       ────────────────────
MasterAttributes           Product data                Shopify listing
ProductTypes               Category assignments        Amazon listing
Variant dimensions         Variant values              TikTok product
Channel field mappings     Channel selections          eBay listing
```

The merchant's `ProductCategory` tree is THEIR data. It is not a global catalog
administered by you — it is per-merchant, per-store, owned entirely by them.
This is why syncing from their existing channels into the platform makes sense:
they already have their category structure on Shopify or WooCommerce. The platform
should import it rather than make them rebuild it from scratch.

---

## 2. What ProductCategory Is For (and What It Is NOT For)

```
CORRECT use of ProductCategory  (merchant's data)
───────────────────────────────────────────────────────────

Storefront Navigation              SEO                  Channel Mapping
┌───────────────────┐         ┌──────────┐          ┌────────────────────┐
│ Electronics       │         │ /elec    │          │ Shopify Collection │
│  └ Phones         │  ──→    │ /phones  │  ──→     │ Amazon Browse Node │
│     └ Smartphones │         │ /smart   │          │ eBay Category ID   │
│  └ Laptops        │         │ /laptop  │          │ TikTok Shop Cat.   │
│ Fashion           │         │ /fashion │          │                    │
└───────────────────┘         └──────────┘          └────────────────────┘

   Customer-facing              URL structure           Per-channel taxonomy
   browsing / UX                                        cross-mapping


WRONG use of ProductCategory
──────────────────────────────────────────────────────

❌  "I put this attribute under Electronics category,
    so now it applies to every product in Electronics"

    WHY IT FAILS:
    ┌─────────────────────────────────────────────────────┐
    │  "Electronics" catalog category contains:           │
    │                                                     │
    │   TVs        → needs: screen_size, resolution,      │
    │                        panel_type, refresh_rate      │
    │   Headphones → needs: driver_size, impedance,       │
    │                        connectivity, noise_cancel    │
    │   Laptops    → needs: ram, storage, cpu, gpu        │
    │   Cables     → needs: length, connector_type        │
    │                                                     │
    │  These have ALMOST NO OVERLAP in attributes.        │
    │  Same catalog category, completely different schema.│
    └─────────────────────────────────────────────────────┘
```

The catalog category tells you WHERE the product lives.
It does not tell you WHAT the product is.

---

## 3. Why ProductType Is Necessary

```
WITHOUT ProductType (current state)
────────────────────────────────────────────────────────

Catalog Category      MasterAttribute.categoryIds
     │                          │
     │    direct many-to-many   │
     └──────────────────────────┘

Problems:
  [1] "Electronics" category → which attributes?
      → TV attributes? Phone attributes? Both? Neither?
      → Answer changes every time catalog team renames or splits the category

  [2] Catalog team renames "Smartphones" → "Mobile Devices"
      → All attribute assignments break (IDs change)
      → Platform team must manually re-assign every attribute

  [3] Marketing adds seasonal "Black Friday Electronics" category
      → Should TV attributes apply here too?
      → No automated answer exists

  [4] What creates a variant for a Smartphone?
      → color + storage = one SKU matrix
      → But how does the system know? It can't.
      → variantScope on individual attributes does not define combinations


WITH ProductType (proposed)
────────────────────────────────────────────────────────

Catalog Category      ProductType         MasterAttribute
     │                    │                    │
     │  many-to-one       │  one-to-many       │
     └────────────────────┴────────────────────┘

Benefits:
  [1] "Electronics > TV"    → ProductType: "Television"
      "Electronics > Phone" → ProductType: "Smartphone"
      Both clearly answered, no ambiguity

  [2] Catalog team renames "Smartphones" → "Mobile Devices"
      → ProductType "Smartphone" unchanged
      → All attribute assignments unchanged ✓

  [3] Marketing adds "Black Friday Electronics" category
      → Assign ProductType: "Television" to it
      → TV attributes automatically flow in ✓

  [4] Smartphone variant matrix:
      ProductType.variantDimensions = [
        { attributeCode: "color",   order: 1 },
        { attributeCode: "storage", order: 2 }
      ]
      → System knows: color × storage = SKU grid ✓
```

### The stability contract

```
 Changes Frequently              Stable Bridge            Changes Rarely
 ┌──────────────────┐           ┌────────────┐           ┌──────────────────┐
 │ ProductCategory  │ ←─────→   │ProductType │  ←─────→  │ MasterAttribute  │
 │                  │  merchant │            │  platform │                  │
 │ Merchant can     │  assigns  │ Platform   │  engineers│ Attribute team   │
 │ rename, move,    │  type     │ engineers  │  assign   │ changes only     │
 │ split, merge,    │           │ maintain   │  attrs    │ when new product │
 │ import from      │           │ this layer │           │ lines launch     │
 │ channels freely  │           │            │           │                  │
 └──────────────────┘           └────────────┘           └──────────────────┘
```

---

## 4. The Complete Data Model

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE DATA MODEL                                │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│            ProductCategory               │
│─────────────────────────────────────────│
│ id: ObjectId                            │  ← MongoDB ID, stable forever
│ name: string                            │  ← "Smartphones" (rename freely)
│ slug: string                            │  ← "smartphones"
│ path: string                            │  ← "electronics/phones/smartphones"
│ level: number                           │  ← 2
│ parentId: ObjectId | null               │
│ active: boolean                         │
│ metaTitle: string                       │  ← SEO
│ metaDescription: string                 │  ← SEO
│ productTypeId?: ObjectId                │  ← NEW: points to ProductType
│ sortOrder: number                       │
│                                         │
│ channelSyncSummary: {                   │  ← denormalized summary (display only)
│   totalMapped:   number,               │    recomputed when any mapping changes
│   totalDrifted:  number,               │    used for admin UI status badges
│   totalUnmapped: number,               │    without querying mapping collection
│   lastSyncedAt:  DateTime              │
│ }                                       │
│                                         │  ← Full mapping data lives in a separate
│                                         │    collection: channel_category_mappings
│                                         │    (see CHANNEL-CATEGORY-MAPPING.md §9)
│                                         │    One document per (category × store).
│                                         │    Fields: storeId, channelType,
│                                         │    externalId, externalSlug,
│                                         │    externalName, syncStatus,
│                                         │    importedFrom, lastSyncedAt,
│                                         │    lastDriftAt, driftReason            │
└──────────────┬──────────────────────────┘
               │ productTypeId  (many categories → one type)
               ▼
┌─────────────────────────────┐
│         ProductType          │
│─────────────────────────────│
│ id: ObjectId                │
│ name: string                │  ← "Smartphone"
│ slug: string                │  ← "smartphone"
│ description: string         │
│ attributeGroupIds: [        │  ← ordered groups of attributes
│   { sectionName: string,   │    e.g. "product_info", "variants"
│     attributeIds: [] }     │
│ ]                           │
│ variantDimensions: [        │  ← THE KEY FIELD — defines SKU matrix
│   { attributeCode: string, │    e.g. "color" → order 1
│     order: number,         │         "storage" → order 2
│     required: boolean }    │    This defines color × storage = grid
│ ]                           │
│ inheritFromTypeId?: ObjectId│  ← optional parent type inheritance
│ active: boolean             │
└──────────┬──────────────────┘
           │ attributeGroupIds (one type → many attributes)
           ▼
┌─────────────────────────────┐
│       MasterAttribute        │
│─────────────────────────────│
│ id: ObjectId                │
│ fieldName: string           │  ← "color", "storage_capacity"
│ description: string         │  ← "Color"
│ fieldType: string           │  ← "SELECT", "TEXT", etc.
│ section: string             │  ← "variants", "product_info"
│ required: boolean           │
│ variantScope: enum          │  ← product_only | variant_only | dual
│ appliesTo: enum             │  ← product | variant | both
│ displayLevel: enum          │  ← essential | basic | enhanced
│ options: []                 │  ← for SELECT/MULTI_SELECT types
│ channelMappings: []         │  ← Shopify field, Amazon field, etc.
│ applicableCategories?: []   │  ← LEGACY: direct category IDs (phase out)
│ productTypeIds?: []         │  ← NEW: which product types use this attr
└─────────────────────────────┘
```

---

## 5. How Category Evolution Affects Attributes in Running Operations

### Scenario A: Catalog Team Splits a Category

```
BEFORE                                    AFTER (catalog team action)
──────────────────────────────────────    ──────────────────────────────────────
Electronics                               Electronics
  └── Phones                                └── Phones
       └── Smartphones [L2]                      └── Budget Smartphones [L3]  ← NEW
                                                 └── Premium Smartphones [L3] ← NEW
                                                 └── Smartphones [L2] (archived)

                    ↓ What happens to attributes?

WITHOUT ProductType                       WITH ProductType
─────────────────────────────────────     ─────────────────────────────────────
"Smartphones" category renamed/split      "Smartphones" category split
→ All attribute.categoryIds pointing      → Both new categories reference
  to old "Smartphones" ID break              ProductType: "Smartphone"
→ Platform team must manually             → All attributes still flow through
  re-assign all affected attributes          the ProductType — no work needed
→ Risk: attributes temporarily lost      → Zero attribute reassignment required
  from new categories during migration

WIREFRAME: Category Split with ProductType
┌──────────────────────────────────────────────────────────────┐
│  Omni Admin › Catalog Setup › Product Categories             │
├──────────────────────────────────────────────────────────────┤
│  Smartphones                         [ProductType: Smartphone]│
│  ├─ Budget Smartphones               ←── inherits from parent │
│  └─ Premium Smartphones              ←── inherits from parent │
│                                                              │
│  When you split a category, child categories inherit the     │
│  parent's ProductType automatically.                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ⚠ Splitting "Smartphones" into 2 subcategories       │    │
│  │    Both subcategories will inherit:                  │    │
│  │    ProductType: Smartphone                           │    │
│  │    Attributes: color, storage, os, ram, screen_size  │    │
│  │    Variant dims: color × storage                     │    │
│  │                                                      │    │
│  │    [Override per subcategory]  [Keep inherited]      │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Scenario B: New Product Line Launches (Smart Watches)

```
SEQUENCE OF EVENTS IN RUNNING OPERATION:

Step 1: Platform Engineer (once)
─────────────────────────────────────────────────────────────────
Creates ProductType: "Smartwatch"
  ├── Attributes:    strap_material, screen_size, battery_life,
  │                  os_compatibility, health_sensors, connectivity
  ├── Variant dims:  color (order 1) × strap_material (order 2)
  └── Inherited from: "Wearable" ProductType (if exists)

                           ↓

Step 2: Catalog Manager / Merchant (ongoing)
─────────────────────────────────────────────────────────────────
Creates ProductCategory: "Smartwatches" under "Electronics > Wearables"
Assigns: productTypeId → "Smartwatch"

Result: All smartwatch products created in this category automatically:
  - See the correct attribute form (health_sensors, not laptop RAM)
  - Get the right variant matrix (color × strap, not color × storage)
  - Map to the right channel fields per platform


WIREFRAME: ProductType Assignment in Category Edit Modal
┌──────────────────────────────────────────────────────────┐
│  Edit Category — Smartwatches                        [×] │
├──────────────────────────────────────────────────────────┤
│  Name *                                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Smartwatches                                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Product Type *                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Smartwatch                                    ▾    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Smartwatch type includes:                          │  │
│  │    6 attributes  ·  2 variant dimensions           │  │
│  │    color × strap_material = SKU matrix             │  │
│  │                              [View full schema →]  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Parent Category        Sort Order                       │
│  ┌────────────────┐     ┌──────┐                         │
│  │ Wearables   ▾  │     │  3   │                         │
│  └────────────────┘     └──────┘                         │
│                                                          │
│  [Cancel]                               [Save Category]  │
└──────────────────────────────────────────────────────────┘
```

### Scenario C: Attribute Changed Mid-Operation

```
SCENARIO: Platform team adds "5G Support" attribute to Smartphone ProductType

Impact propagation:
──────────────────────────────────────────────────────────────────────────────

  ProductType: Smartphone
    + attribute: 5g_support (boolean, section: product_info)

        ↓ immediately affects

  All ProductCategories with productTypeId = "Smartphone"
    └── Budget Smartphones
    └── Premium Smartphones
    └── Refurbished Phones
    └── Mobile Deals (seasonal)

        ↓ immediately affects

  All EXISTING products in those categories
    └── New field appears in product edit form
    └── Field is empty (null) until merchant fills it
    └── displayLevel: "enhanced" → won't block publish

  All NEW products in those categories
    └── Field appears from creation
    └── If required: true → blocks publish until filled

  All Channel Schemas
    └── channelMappings on 5g_support attribute defines
        what field name this maps to on Shopify, Amazon, etc.


WIREFRAME: Attribute Change Impact Preview (in Master Attributes)
┌──────────────────────────────────────────────────────────────────┐
│  Add Attribute — 5G Support                                  [×] │
├──────────────────────────────────────────────────────────────────┤
│  ...                                                             │
│                                                                  │
│  Assign to Product Types                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ✓ Smartphone                                             │   │
│  │ ○ Television                                             │   │
│  │ ○ Laptop                                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ⚠  Impact Preview                                        │   │
│  │                                                          │   │
│  │  This attribute will appear in:                          │   │
│  │  • 4 categories  (Budget Phones, Premium Phones, +2)     │   │
│  │  • 1,247 existing products                               │   │
│  │  • 3 active channels  (Shopify, Amazon, TikTok)          │   │
│  │                                                          │   │
│  │  Since required = OFF, existing products are unaffected  │   │
│  │  until merchant edits them.                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Cancel]                                        [Add Attribute] │
└──────────────────────────────────────────────────────────────────┘
```

### Scenario D: Attribute Removed from a ProductType

```
KEY PRINCIPLE: Attributes are NEVER deleted from product data.
               They are removed from the SCHEMA (ProductType) so they
               stop appearing in forms. Historical data is preserved.

┌──────────────────────────────────────────────────────────────────┐
│  ProductType inheritance allows safe schema narrowing            │
│                                                                  │
│  Smartphone (base)              Budget Smartphone (derived)      │
│  ─────────────────              ─────────────────────────────   │
│  color ✓                        color ✓  (inherited)            │
│  storage ✓                      storage ✓  (inherited)          │
│  os ✓                           os ✓  (inherited)               │
│  ram ✓                          ram ✓  (inherited)              │
│  screen_size ✓                  screen_size ✗  (excluded)       │
│  camera_resolution ✓            camera_resolution ✓ (inherited) │
│                                                                  │
│  variant dims: color × storage  variant dims: color × storage   │
│                                 (inherited — no change)          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Variant Classification — The Full Picture

```
INDIVIDUAL ATTRIBUTE LEVEL (current model)
──────────────────────────────────────────
  color.variantScope = "variant_only"
  storage.variantScope = "variant_only"
  brand.variantScope = "product_only"

  → Tells you: color and storage CAN create variants
  → Does NOT tell you: which products use color × storage as the SKU matrix
  → Does NOT tell you: the ORDER (is color the first axis or storage?)


PRODUCT TYPE LEVEL (needed)
──────────────────────────────────────────
  ProductType: Smartphone
    variantDimensions: [
      { attributeCode: "color",   order: 1 },  ← rows
      { attributeCode: "storage", order: 2 },  ← columns
    ]

  This produces the SKU matrix:

                  64GB    128GB   256GB   512GB
  Midnight Black  SKU1    SKU2    SKU3    SKU4
  Silver          SKU5    SKU6    SKU7    SKU8
  Gold            SKU9    SKU10   SKU11   SKU12

  → The system knows the grid shape
  → Channel adapters know how to generate Shopify variants
  → Inventory knows how many SKU slots to pre-allocate


WIREFRAME: Variant Dimension Config on ProductType
┌──────────────────────────────────────────────────────────────────┐
│  Omni Admin › Catalog Setup › Product Types › Smartphone         │
├──────────────────────────────────────────────────────────────────┤
│  Variant Dimensions  ──── defines the SKU matrix ────────────    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Axis 1 (rows)     [Color              ▾]  ✓ Required     │   │
│  │ Axis 2 (columns)  [Storage Capacity   ▾]  ✓ Required     │   │
│  │ Axis 3 (depth)    [—  none  —         ▾]  ○ Optional     │   │
│  │                                                          │   │
│  │                              [+ Add dimension]           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Preview matrix (with sample values)                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              64GB     128GB    256GB                     │   │
│  │  Black        ○         ○        ○                       │   │
│  │  Silver       ○         ○        ○                       │   │
│  │  Gold         ○         ○        ○                       │   │
│  │                                                          │   │
│  │  9 potential SKUs per product using this type            │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Channel Category Link & Sync — The Missing Onboarding Layer

This section answers: **since the merchant owns their ProductCategories, why would
they rebuild them manually in the platform when they already exist on Shopify,
WooCommerce, or wherever they were before?**

They should not have to. The platform should import them.

---

### Link vs Sync — two distinct concepts

Before the details, understand what these two words mean precisely:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  A LINK is the data record                                                  │
│  — the persistent bridge between one platform category and one channel      │
│    category, stored inside channelMappings[] on ProductCategory             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Platform: "Smartphones"                                                    │
│                 │                                                           │
│                 │  channelMappings[] entry                                  │
│                 │  ┌─────────────────────────────────────────────────────┐ │
│                 └─▶│  storeId:      <store ObjectId>                     │ │
│                    │  channelType:  "shopify"                             │ │
│                    │  externalId:   "gid://shopify/Collection/123"        │ │
│                    │  externalSlug: "smartphones"                         │ │
│                    │  syncStatus:   "MAPPED"                              │ │
│                    │  importedFrom: true                                  │ │
│                    │  lastSyncedAt: 2026-04-01T09:00:00Z                  │ │
│                    └─────────────────────────────────────────────────────┘ │
│                                                                             │
│  One ProductCategory can have MANY links — one per connected channel store  │
│                                                                             │
│  "Smartphones" ──→ Shopify collection/123    syncStatus: MAPPED            │
│               ──→ WooCommerce term/42        syncStatus: MAPPED            │
│               ──→ Amazon browse node/...     syncStatus: MAPPED            │
│               ──→ TikTok category/600001     syncStatus: MAPPED            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  A SYNC is an operation — moving data through one or more links             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  There are three sync operations, each with a different direction:          │
│                                                                             │
│  ① IMPORT  (channel ──→ platform, one-time at onboarding)                  │
│    ─────────────────────────────────────────────────────                   │
│    Fetch the merchant's existing categories from the channel,               │
│    merchant picks which to bring in, platform creates ProductCategory       │
│    records and stores a link back to each channel category.                 │
│    This happens ONCE per channel connection (or on demand).                 │
│                                                                             │
│    Shopify: [Electronics, Smartphones, Laptops, Fashion, ...]               │
│                                  ↓  merchant confirms                       │
│    Platform: ProductCategory records created, each with a MAPPED link       │
│                                                                             │
│  ② PUSH OUT  (platform ──→ all channels, ongoing)                          │
│    ─────────────────────────────────────────────────────                   │
│    When the merchant creates, renames, or restructures a category IN the    │
│    platform, the platform walks all channelMappings[] entries and pushes    │
│    the change to each connected channel store via its API.                  │
│    Platform is the master. Channels are the sync targets.                   │
│                                                                             │
│    Merchant adds "Gaming Phones" in platform                                │
│                                  ↓                                          │
│    Platform creates Shopify collection "gaming-phones"  → link: MAPPED     │
│    Platform creates WooCommerce category "gaming-phones" → link: MAPPED    │
│    Amazon: merchant must manually select a browse node   → link: UNMAPPED  │
│                                                                             │
│  ③ DRIFT DETECT  (channel ──→ platform, reactive / webhook-driven)         │
│    ─────────────────────────────────────────────────────                   │
│    When something changes on the channel OUTSIDE the platform               │
│    (merchant edits directly in Shopify, Amazon updates its taxonomy),       │
│    a webhook fires, the platform marks the affected link DRIFTED, and       │
│    alerts the merchant to resolve it.                                        │
│                                                                             │
│    Shopify: collection "Smartphones" renamed → "Mobile Devices"             │
│                                  ↓  webhook                                  │
│    Platform: link syncStatus → DRIFTED                                      │
│    Other channels: completely unaffected (each link is independent)         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this separation matters:**
- The LINK is permanent data — it survives between operations and tracks state
- A SYNC operation reads the link to know WHERE to push, and writes back to update `lastSyncedAt` and `syncStatus`
- Deleting a link does NOT delete the category — it only severs the connection to that channel
- `syncStatus` on the link is the health indicator — MAPPED (good), DRIFTED (needs attention), UNMAPPED (not connected), PENDING_IMPORT (in progress)

---

### The two fundamentally different types of channel categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              TYPE 1: MERCHANT-CREATED CATEGORIES (on a channel)             │
│              → Should sync INTO the platform                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Shopify Collections    WooCommerce Categories    Etsy Sections             │
│  "Smartphones"          "Electronics > Phones"    "Phone Cases"             │
│  "Summer Sale"          "Accessories"             "Chargers"                │
│  "New Arrivals"         "Women's Clothing"        "Cables"                  │
│                                                                             │
│  Characteristics:                                                           │
│  • The MERCHANT created and named these                                     │
│  • They reflect the merchant's own catalog logic                            │
│  • They are meaningful to the merchant's business                           │
│  • They should become the platform's master category tree                   │
│  • Sync direction:  Channel ──import──→ Platform                           │
│                     Platform ──push──→  All Channels (ongoing)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│              TYPE 2: CHANNEL-DEFINED TAXONOMIES (owned by the channel)      │
│              → Should be MAPPED TO, never imported as platform categories   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Amazon Browse Nodes    Google Product Type       TikTok Category IDs      │
│  "2407749011"           "Electronics > Phones"    "600001"                  │
│  (Amazon owns this)     (Google owns this)        (TikTok owns this)       │
│                                                                             │
│  Characteristics:                                                           │
│  • The CHANNEL created and controls these                                   │
│  • The merchant just picks from a fixed, read-only list                     │
│  • They are meaningless outside of that specific channel                    │
│  • They should live in channelMappings on ProductCategory, not as           │
│    top-level platform categories                                            │
│  • Sync direction:  Platform Category ──maps to──→ Channel Taxonomy ID     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why this distinction is critical

```
WRONG: Importing Amazon Browse Nodes as platform categories
────────────────────────────────────────────────────────────────────
  Platform category tree becomes:
  ├── "2407749011"  (Smartphones)
  ├── "2407749012"  (Feature Phones)
  ├── "281407"      (Cell Phones & Accessories)
  ...thousands more Amazon IDs...

  → Meaningless to merchant
  → Useless on Shopify (different taxonomy entirely)
  → Merchant can't navigate or manage their own catalog
  → Amazon IDs change when Amazon updates taxonomy


CORRECT: Amazon Browse Node as a mapping on the platform category
──────────────────────────────────────────────────────────────────
  Platform category: "Smartphones"
    channelMappings: [
      { channelType: "shopify",    externalId: "gid://shopify/Collection/123" },
      { channelType: "amazon",     externalId: "2407749011" },
      { channelType: "tiktok",     externalId: "600001" },
      { channelType: "woocommerce",externalId: "42" }
    ]

  → Platform category name is human-readable (merchant's own name)
  → Each channel mapping is just a technical reference
  → Merchant manages ONE category tree, platform handles all mappings
```

### Onboarding flow — seeding platform categories from Shopify

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MERCHANT ONBOARDING STEP — Import Category Tree from Shopify                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Merchant connects Shopify store                                     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Connected: my-store.myshopify.com                          [✓ Active] │ │
│  │                                                                        │ │
│  │  We found 24 collections on your Shopify store.                        │ │
│  │  Import them as your master product categories?                        │ │
│  │                                                                        │ │
│  │  [Import Collections →]          [Set up categories manually]          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Step 2: Merchant reviews the import                                         │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Import Shopify Collections as Master Categories                    [×]│ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                        │ │
│  │  Select collections to import:                                         │ │
│  │                                                                        │ │
│  │  ✓  Electronics              (manual collection, 247 products)         │ │
│  │  ✓    └ Smartphones          (manual collection, 89 products)          │ │
│  │  ✓    └ Laptops              (manual collection, 43 products)          │ │
│  │  ✓  Fashion                  (manual collection, 312 products)         │ │
│  │  ✓    └ Men's Clothing       (manual collection, 156 products)         │ │
│  │  ✓    └ Women's Clothing     (manual collection, 156 products)         │ │
│  │  ✗  Summer Sale 2024         (smart collection — seasonal)  [Skip ▾]  │ │
│  │  ✗  New Arrivals             (smart collection — auto-rule) [Skip ▾]  │ │
│  │  ✓  Home & Garden            (manual collection, 78 products)          │ │
│  │                                                                        │ │
│  │  Smart collections are auto-generated by Shopify rules.                │ │
│  │  Importing them as master categories may not make sense.               │ │
│  │  Recommended: skip smart collections.                                  │ │
│  │                                                                        │ │
│  │  7 selected  ·  2 skipped                                              │ │
│  │                                                                        │ │
│  │  [Back]                                        [Import 7 collections]  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Step 3: Platform creates ProductCategories and links back to Shopify        │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Import complete                                                       │ │
│  │                                                                        │ │
│  │  ✓ 7 categories created in platform                                    │ │
│  │  ✓ Each linked back to its Shopify collection (syncStatus: MAPPED)     │ │
│  │  ✓ Products in those collections are now synced                        │ │
│  │                                                                        │ │
│  │  Next: assign Product Types to each category so the system             │ │
│  │  knows what attributes apply to each.                                  │ │
│  │                                                                        │ │
│  │  Electronics          → [Assign ProductType ▾]                        │ │
│  │    └ Smartphones      → [Assign ProductType ▾]  ← Smartphone suggested│ │
│  │    └ Laptops          → [Assign ProductType ▾]  ← Laptop suggested    │ │
│  │  Fashion              → [Assign ProductType ▾]                        │ │
│  │    └ Men's Clothing   → [Assign ProductType ▾]  ← Apparel suggested   │ │
│  │    └ Women's Clothing → [Assign ProductType ▾]  ← Apparel suggested   │ │
│  │  Home & Garden        → [Assign ProductType ▾]                        │ │
│  │                                                                        │ │
│  │  [Done — take me to my categories]                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Why platform becomes master after import (not a continuous channel sync)

```
SCENARIO: What if the merchant renames a Shopify collection AFTER import?

IF continuous sync (channel stays master):
──────────────────────────────────────────────────────────────────
  Merchant renames Shopify "Smartphones" → "Mobile Devices"
          ↓
  Platform renames ProductCategory to "Mobile Devices"
          ↓
  Amazon mapping was set to category "Smartphones" by name — breaks
  TikTok mapping breaks
  WooCommerce mapping breaks
  Any other channel using this category — breaks
  Attribute assignments may break if stored by name

  → One rename on one channel cascades destruction across all channels


IF platform is master after import (correct approach):
──────────────────────────────────────────────────────────────────
  Merchant renames Shopify "Smartphones" → "Mobile Devices"
          ↓
  Platform webhook detects: Shopify collection name changed
          ↓
  Platform category still named "Smartphones" (unchanged)
  Platform marks: channelMapping[shopify].syncStatus = "DRIFTED"
          ↓
  Merchant sees alert in platform UI:

  ┌──────────────────────────────────────────────────────────────┐
  │  ⚠ Channel Drift Detected                                    │
  │                                                              │
  │  Your Shopify collection was renamed externally.             │
  │  Platform category "Smartphones" is still correctly mapped   │
  │  to it, but the collection name no longer matches.           │
  │                                                              │
  │  Platform category:  Smartphones                             │
  │  Shopify collection: Mobile Devices  (renamed externally)    │
  │                                                              │
  │  • All other channels: unaffected                            │
  │  • Product sync: unaffected (mapped by ID, not name)         │
  │                                                              │
  │  [Rename platform category to match]  [Keep platform name]   │
  └──────────────────────────────────────────────────────────────┘
          ↓
  Amazon, TikTok, WooCommerce: completely unaffected ✓
  Products on those channels: sync continues normally ✓
```

### Ongoing operations — platform pushes to all channels

```
AFTER IMPORT — Platform is the single source of truth

Merchant creates "Gaming Phones" in Platform
        │
        ├──→ Creates collection "gaming-phones" in Shopify  (auto)
        ├──→ Maps to existing Amazon Browse Node (merchant selects)
        ├──→ Maps to TikTok category ID (merchant selects)
        └──→ Maps to WooCommerce category "gaming-phones" (auto)


EDGE CASE: Merchant adds a collection directly in Shopify (bypasses platform)
────────────────────────────────────────────────────────────────────────────────
  Merchant adds "Gaming Phones" collection in Shopify directly
          ↓
  Platform webhook detects unmapped collection
          ↓
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  ⚠ Unmapped Shopify Collection Detected                                  │
  │                                                                          │
  │  "Gaming Phones" was created directly in Shopify and is not              │
  │  mapped to a master category. Products in it won't sync to               │
  │  Amazon, TikTok, or any other connected channel.                         │
  │                                                                          │
  │  [Create master category and link to it]                                 │
  │  [Link to existing category:  Smartphones  ▾]                           │
  │  [Ignore — Shopify only, no cross-channel sync needed]                   │
  └──────────────────────────────────────────────────────────────────────────┘
```

### The sync state machine for each channel mapping

```
                    ┌─────────────────┐
                    │   NOT MAPPED    │
                    │   (UNMAPPED)    │◄──── Channel adds new collection
                    └────────┬────────┘      without going through platform
                             │
                  Merchant maps / import
                             │
                             ▼
                    ┌─────────────────┐
                    │    PENDING      │◄──── Import just completed,
                    │    IMPORT       │      awaiting confirmation
                    └────────┬────────┘
                             │
                  Confirmed / auto-confirmed
                             │
                             ▼
            ┌────────────────────────────────┐
            │           MAPPED               │◄─── Normal operating state
            │   (platform ↔ channel aligned) │
            └───────┬────────────────┬───────┘
                    │                │
           Channel renamed       Channel deleted
           externally             externally
                    │                │
                    ▼                ▼
            ┌──────────────┐  ┌──────────────┐
            │   DRIFTED    │  │   UNMAPPED   │
            │ (name/slug   │  │ (collection  │
            │  mismatch)   │  │  gone on ch.)│
            └──────┬───────┘  └──────┬───────┘
                   │                 │
           Merchant resolves  Merchant resolves
                   │                 │
                   └────────┬────────┘
                            ▼
                    ┌─────────────────┐
                    │     MAPPED      │
                    └─────────────────┘
```

---

## 8. Full Lifecycle Wireframe — From Onboarding to Live Variant on Channel

> **Common confusion:** Section 8 used to say "Platform Engineer assigns ProductTypes"
> after the merchant imports categories. That implies manual, unscalable work. It is wrong.
> See the clarification box below before reading the wireframe.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CLARIFICATION — Two separate one-time actions, different actors             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PLATFORM OWNER (you, before any merchant ever signs up):                    │
│  ─────────────────────────────────────────────────────────                   │
│  Create the ProductType catalog once.                                        │
│  This is your schema library:                                                │
│    "Smartphone", "Laptop", "TV", "Apparel", "Shoe", "Book", ...             │
│  Each ProductType defines which attributes and which variant dimensions      │
│  apply to that kind of product. You do this ONCE, like defining a template. │
│  This scales to all merchants — not per-merchant, not repeated.              │
│                                                                              │
│  MERCHANT (during their own onboarding, automated with suggestions):         │
│  ─────────────────────────────────────────────────────                       │
│  Assign one of your pre-defined ProductTypes to each of their categories.   │
│  The platform auto-suggests based on category name matching.                 │
│  Most merchants click "Accept all suggestions" and are done.                 │
│  They are choosing from YOUR template library — they are not creating types. │
│                                                                              │
│  ─────────────────────────────────────────────────────────                   │
│  ENGINEER work:  once, total (define types)                                  │
│  MERCHANT work:  seconds, auto-suggested (pick from types)                   │
│  ─────────────────────────────────────────────────────────                   │
│  This IS scalable. It IS automated. The engineer does not touch              │
│  each merchant's categories. Merchants do not build schemas.                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BEFORE MERCHANTS ARRIVE — Platform Owner sets up ProductType library        │
│                                                                              │
│  Omni Admin › Catalog Setup › Product Types                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  + Smartphone  — attributes: brand, os, ram, storage, battery…       │   │
│  │                  variantDimensions: [color, storage]                  │   │
│  │  + Laptop      — attributes: brand, cpu, ram, storage, display…      │   │
│  │                  variantDimensions: [ram, storage]                    │   │
│  │  + Apparel     — attributes: brand, material, gender, fit…           │   │
│  │                  variantDimensions: [size, color]                     │   │
│  │  + Shoe        — attributes: brand, material, sole_type…             │   │
│  │                  variantDimensions: [size, color]                     │   │
│  │  + HomeProduct — attributes: brand, dimensions, weight, material…    │   │
│  │                  variantDimensions: []  (no variants)                 │   │
│  │                                                                       │   │
│  │  [+ New ProductType]                                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Done once. All merchants share this library.                                │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
         (merchant signs up — no engineer involvement from this point)
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ONBOARDING DAY 1 — Merchant connects first channel                          │
│                                                                              │
│  Merchant connects: Shopify store  "my-store.myshopify.com"                 │
│  Platform detects:  24 collections found on Shopify                          │
│                                                                              │
│  Import wizard runs:                                                         │
│  • 7 manual collections selected for import                                  │
│  • 2 smart collections skipped                                               │
│  • 7 ProductCategory records created                                         │
│  • Each channelMapping[shopify].syncStatus = "MAPPED"                        │
│  • channelMapping[shopify].importedFrom = true                               │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ONBOARDING DAY 1 — Merchant assigns ProductTypes (auto-suggested, fast)     │
│                                                                              │
│  Platform analyses imported category names → suggests matching ProductTypes  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Assign product types to your categories (step 3 of 3)               │   │
│  │                                                                       │   │
│  │  Category           Suggested type         Confidence                 │   │
│  │  ─────────────────────────────────────────────────────                │   │
│  │  ✓ Smartphones   →  [Smartphone   ▾]       ████████░░ 94%  ←accept   │   │
│  │  ✓ Laptops       →  [Laptop       ▾]       █████████░ 97%  ←accept   │   │
│  │  ✓ Men's Clothing→  [Apparel      ▾]       ███████░░░ 83%  ←accept   │   │
│  │  ✓ Women's Cloth →  [Apparel      ▾]       ███████░░░ 81%  ←accept   │   │
│  │  ✓ Home & Garden →  [HomeProduct  ▾]       ██████░░░░ 75%  ←accept   │   │
│  │  ? Electronics   →  [— none —     ▾]       too broad — skip or pick  │   │
│  │  ? Fashion       →  [— none —     ▾]       too broad — skip or pick  │   │
│  │                                                                       │   │
│  │  [Accept all suggestions]              [Review one by one]            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Merchant clicks "Accept all suggestions" — done in seconds.                 │
│  Parent categories (Electronics, Fashion) are left unassigned on purpose:   │
│  they are navigation nodes, not product containers. Products live in the     │
│  leaf categories where a ProductType IS assigned.                            │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DAY 10 — Merchant connects second channel (WooCommerce)                     │
│                                                                              │
│  Platform detects: 12 WooCommerce categories                                 │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Map WooCommerce categories to existing platform categories          │   │
│  │                                                                      │   │
│  │  WooCommerce category       →  Platform category                     │   │
│  │  "Phones & Tablets"         →  [ Smartphones          ▾ ]  ←suggest │   │
│  │  "Computers"                →  [ Laptops              ▾ ]  ←suggest │   │
│  │  "Men"                      →  [ Men's Clothing        ▾ ]  ←suggest│   │
│  │  "Women"                    →  [ Women's Clothing      ▾ ]  ←suggest│   │
│  │  "Deals"                    →  [ — Skip / Shopify only ▾ ]          │   │
│  │                                                                      │   │
│  │  [Map all suggested]                   [Review individually]         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  After mapping:                                                              │
│  Platform "Smartphones" category now has:                                    │
│    channelMappings: [                                                        │
│      { channelType: "shopify",     externalId: "...", syncStatus: "MAPPED"}  │
│      { channelType: "woocommerce", externalId: "42",  syncStatus: "MAPPED"}  │
│    ]                                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DAY 30 — Merchant creates a new sub-category in Platform                    │
│                                                                              │
│  Merchant creates: "Budget Smartphones" under "Smartphones"                  │
│  Inherits ProductType: Smartphone (from parent)                              │
│                                                                              │
│  Platform auto-creates:                                                      │
│  • Shopify: new collection "budget-smartphones"   syncStatus: MAPPED         │
│  • WooCommerce: new category "budget-smartphones" syncStatus: MAPPED         │
│  • Amazon: no auto-create (merchant-defined taxonomy, not Amazon's)          │
│            → merchant manually selects Amazon Browse Node                    │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DAY 90 — Merchant creates a Smartphone product                              │
│                                                                              │
│  Merchant selects: Category → "Budget Smartphones"                           │
│  System derives:   ProductType → Smartphone                                  │
│  System loads:     Attribute schema for Smartphone                           │
│                                                                              │
│  Product Form                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Product Info          Variants              Channel Fields          │    │
│  │  ─────────────         ─────────────────     ─────────────────────   │    │
│  │  Brand *               Color *               [Shopify]               │    │
│  │  ┌──────────┐          ○ Black               metafield.5g_support    │    │
│  │  │ Samsung  │          ○ Silver              product_type: Phone     │    │
│  │  └──────────┘          ○ Gold                                        │    │
│  │                        [+ Add color]         [Amazon]                │    │
│  │  OS *                                        connectivity_technology │    │
│  │  ┌──────────┐          Storage *             item_type_keyword       │    │
│  │  │ Android  │          ○ 64GB                                        │    │
│  │  └──────────┘          ○ 128GB               [TikTok Shop]           │    │
│  │                        ○ 256GB               category_id: 600001     │    │
│  │  5G Support            [+ Add storage]                               │    │
│  │  ○ Yes  ● No                                                         │    │
│  │                        Variant Matrix                                │    │
│  │                        ┌──────────────────┐                          │    │
│  │                        │       64   128   │                          │    │
│  │                        │ Black  ✓    ✓    │                          │    │
│  │                        │ Silver ✓    ✗    │  ← merchant disables     │    │
│  │                        │ Gold   ✗    ✓    │     unwanted combos      │    │
│  │                        └──────────────────┘                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  PUBLISH — Sync to all channels via category channelMappings                 │
│                                                                              │
│  Product: Samsung Galaxy A35  ·  Category: Budget Smartphones                │
│  Variants: Black/64GB, Black/128GB, Silver/64GB, Gold/128GB  (4 active SKUs) │
│                                                                              │
│  Shopify ─────────────────────────────────────────────────                   │
│    collection: "budget-smartphones"  (from channelMappings[shopify])         │
│    variant option1: "Color"          (from variantDimensions[0])             │
│    variant option2: "Storage"        (from variantDimensions[1])             │
│    metafield.5g_support: false                                               │
│                                                                              │
│  WooCommerce ─────────────────────────────────────────────                   │
│    category_id: 48               (from channelMappings[woocommerce])         │
│    attributes: pa_color, pa_storage  (WooCommerce variation attributes)      │
│                                                                              │
│  Amazon ──────────────────────────────────────────────────                   │
│    browse_node: 2407749011       (from channelMappings[amazon].externalId)   │
│    color_name: "Midnight Black"  (channelMapping: color → color_name)        │
│    connectivity: "4G LTE"        (channelMapping: 5g_support=false→"4G LTE") │
│                                                                              │
│  TikTok Shop ─────────────────────────────────────────────                   │
│    category_id: 600001           (from channelMappings[tiktok].externalId)   │
│    sku_list: [...4 SKUs...]      (from variant matrix)                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. The Admin Page Architecture

Four pages — clear separation of concerns.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    OMNI ADMIN — CATALOG SETUP                                │
├──────────────────┬──────────────────┬────────────────┬────────────────────── ┤
│ Product          │  Product Types   │  Master        │  Channel Category     │
│ Categories       │  (Platform Eng.) │  Attributes    │  Mapping              │
│ (Merchant)       │                  │  (Platform Eng)│  (Merchant)           │
├──────────────────┼──────────────────┼────────────────┼───────────────────────┤
│                  │                  │                │                       │
│ Electronics      │ ○ Smartphone     │ SIDEBAR  MAIN  │ [Shopify connected]   │
│ ├─ Smartphones ──┼─→[Smartphone]    │ ──────── ────  │ Smartphones →         │
│ │  syncStatus:   │ ○ Television     │ All(48)  color │  collection/123 MAPPED│
│ │  MAPPED ✓      │ ○ Laptop         │ Unassig  store │ Laptops →             │
│ │  SHOPIFY ✓     │ ○ T-Shirt        │ ──────── ram   │  collection/456 MAPPED│
│ │  WOO ✓         │ ○ Dress          │ Smartph  os    │ Fashion →             │
│ ├─ Laptops ──────┼─→[Laptop]        │ Laptop   brand │  collection/789 MAPPED│
│ ⚠ Fashion        │                  │ Apparel        │ Home →                │
│ │  DRIFTED       │                  │                │  collection/101 DRIFT │
│ │  (renamed on   │                  │                │  ⚠ Renamed externally │
│ │   Shopify)     │ [+ New Type]     │                │  [Resolve drift]      │
│ [+ New Category] │                  │ [+ Add Attr]   │                       │
│ [Import from ▾]  │  Owned by:       │ Owned by:      │ Owned by:             │
│                  │  Platform Eng.   │ Platform Eng.  │ Merchant              │
│ Owned by:        │                  │                │                       │
│ Merchant         │                  │                │                       │
└──────────────────┴──────────────────┴────────────────┴───────────────────────┘

Full data flow:
  Import from Channel → Platform Category → ProductType → MasterAttributes
       (onboarding)         (where)           (what kind)    (what fields)
                               │
                               └──→ channelMappings → push to all channels
                                        (sync back out)
```

---

## 10. Summary — Ownership, Triggers, and Responsibilities

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          WHO DOES WHAT WHEN                                  │
├────────────────────────┬─────────────────────────────────────────────────────┤
│  TRIGGER               │  RESPONSIBLE PARTY + ACTION                         │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ Merchant onboards,     │  Platform: run collection import wizard             │
│ connects Shopify       │  Merchant: confirm which collections to import       │
│                        │  Result: ProductCategories seeded, Shopify mapped   │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ Merchant connects      │  Platform: detect existing categories               │
│ 2nd channel (WooComm.) │  Merchant: map WooCommerce cats → platform cats     │
│                        │  Result: channelMappings gains WooCommerce entry    │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ New category needed    │  Merchant: create in platform → auto-pushes to      │
│ (by merchant)          │  all connected channels via channelMappings         │
│                        │  If new ProductType needed: engineer creates first  │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ Merchant renames       │  Merchant: rename in ProductCategory admin          │
│ a category             │  Impact on attributes: ZERO (ProductType unchanged) │
│                        │  Impact on channels: platform pushes new name       │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ Channel renames        │  Webhook detects drift                              │
│ collection externally  │  syncStatus → DRIFTED                               │
│                        │  Merchant notified, resolves in platform UI         │
│                        │  Other channels: completely unaffected              │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ New category added     │  Webhook detects unmapped collection                │
│ directly on channel    │  Platform prompts merchant: map or ignore           │
│                        │  Until mapped: products won't cross-sync            │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ New product line       │  Engineer: create ProductType + MasterAttributes    │
│ (e.g. Drones)          │  Merchant: create category, assign ProductType      │
│                        │  Time: 1-2 hours vs days without this system        │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ New attribute needed   │  Engineer: add MasterAttribute, assign to type(s)   │
│                        │  Auto-flows to all categories using that type       │
│                        │  Auto-flows to all channel schemas via mappings     │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ Variant combo changes  │  Engineer: edit ProductType.variantDimensions       │
│                        │  New products: see new matrix immediately           │
│                        │  Existing products: keep old variant structure      │
└────────────────────────┴─────────────────────────────────────────────────────┘

GOLDEN RULES:
  1. Merchant category changes NEVER break attributes.
     ProductType is the buffer.

  2. Attributes NEVER need manual reassignment.
     ProductType assignment on a category handles everything.

  3. One channel change NEVER breaks other channels.
     channelMappings are per-channel, per-store, fully independent.

  4. Platform is always the master after first import.
     Channels are sync targets, not sources of truth.
```

---

## 11. Implementation Priority for This Platform

```
Phase 1 (Current — pragmatic)
──────────────────────────────────────────────────────────────────
  attribute.categoryIds → ProductCategory.id  (MongoDB ObjectId)
  Sidebar filter works via exact ID match
  ✓ Functional, good enough for initial build

Phase 2 (Next — path inheritance on sidebar filter)
──────────────────────────────────────────────────────────────────
  Clicking "Electronics" shows attributes scoped to Electronics
  AND all child categories via path prefix matching
  ✓ Solves deep-tree without full ProductType

Phase 3 (Recommended — channel category sync)
──────────────────────────────────────────────────────────────────
  Add channelMappings[] to ProductCategory backend schema
  Build collection import wizard for Shopify/WooCommerce onboarding
  Webhook handler: detect unmapped collections, mark DRIFTED
  UI: drift notification + resolution flow in category admin
  ✓ Merchant onboarding time drops from days to minutes

Phase 4 (Required for scale — ProductType entity)
──────────────────────────────────────────────────────────────────
  Backend: new collection product_types
  ProductCategory gains: productTypeId field
  MasterAttribute gains: productTypeIds[] replacing categoryIds
  Master Attributes sidebar: filter by ProductType
  Category edit modal: ProductType selector with preview
  ✓ Full ownership separation, merchant fully independent

Phase 5 (Complete — variant matrix)
──────────────────────────────────────────────────────────────────
  ProductType gains: variantDimensions[]
  Product create form generates SKU matrix from type definition
  Channel adapters read variant dimensions to generate variants
  Import wizard: detect Shopify product options → suggest variant dims
  ✓ End-to-end variant handling, fully type-driven, omnichannel-ready
```
