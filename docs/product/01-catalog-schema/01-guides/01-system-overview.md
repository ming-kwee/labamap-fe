# System Overview

## The Two Actors

The single most important thing to understand: there are **two completely different actors**
in this platform, and they own completely different things.

```
┌──────────────────────────────────┬──────────────────────────────────────────┐
│   THE MERCHANT                   │   THE PLATFORM OWNER (you)               │
│   (your business customer)       │   (the team building this system)        │
├──────────────────────────────────┼──────────────────────────────────────────┤
│ OWNS:                            │ OWNS:                                    │
│ • Their ProductCategories        │ • MasterAttributes (field definitions)   │
│ • Their product catalog          │ • ProductTypes (schema contracts)        │
│ • Their channel store accounts   │ • Channel field mappings                 │
│ • Their variant values           │ • Variant dimension rules                │
│   (Black, 64GB, XL, etc.)        │ • The platform's data architecture       │
│                                  │                                          │
│ LOGS IN TO:                      │ LOGS IN TO:                              │
│ • /merchant-admin/categories     │ • /omni-admin/master-attributes          │
│ • /merchant-admin/products       │ • /omni-admin/product-types              │
│ • /merchant-admin/channels       │ • /omni-admin/product-categories         │
└──────────────────────────────────┴──────────────────────────────────────────┘
```

The merchant's ProductCategory tree is **their data** — per-merchant, per-store, fully
owned by them. When a merchant onboards, the platform imports their existing Shopify or
WooCommerce categories rather than forcing them to rebuild from scratch.

---

## What Each Layer Is For

```
MERCHANT asks:        "Where does this product live in MY store?"
                       → Their ProductCategories

PLATFORM OWNER asks:  "What type of object is this product?"
                       → ProductTypes  (schema contracts defined once)

PLATFORM OWNER asks:  "What fields does this product need?"
                       → MasterAttributes  (field definitions defined once)
```

A ProductCategory tells you **where** a product lives. It does NOT tell you **what** the
product is or what attributes it needs. A single "Electronics" category contains TVs,
headphones, laptops, and cables — four completely different attribute schemas.

ProductType is the bridge between "where the product lives" and "what fields it needs".

---

## Why ProductType Exists — The Core Problem

Without ProductType, attributes are assigned directly to categories. This creates three failures:

1. **Rename breaks everything.** Merchant renames "Smartphones" → "Mobile Devices". All
   attribute assignments break instantly.
2. **No schema per category.** "Electronics" contains TVs, headphones, cables. No correct
   attribute set exists without knowing the product type.
3. **No variant matrix.** `variantScope: "variant_only"` on an attribute says color CAN
   create variants. It does NOT say a Smartphone uses color × storage as its SKU grid.

With ProductType:
```
ProductCategory ──many-to-one──▶ ProductType ──one-to-many──▶ MasterAttribute

• Merchant renames "Smartphones" → ProductType "Smartphone" unchanged → zero reassignment
• "Electronics > Smartphones" → ProductType: Smartphone → correct schema
• ProductType.variantDimensions: [color, storage] → system knows the SKU grid shape
```

---

## The Stability Contract

```
 Changes Frequently        Stable Bridge         Changes Rarely
 ┌──────────────────┐     ┌────────────┐        ┌──────────────────┐
 │ ProductCategory  │────▶│ ProductType│────────▶│ MasterAttribute  │
 │ Merchant can     │     │ Platform   │         │ Attribute team   │
 │ rename, move,    │     │ defines    │         │ changes when new │
 │ split, import    │     │ once       │         │ product lines    │
 │ freely           │     │            │         │ launch           │
 └──────────────────┘     └────────────┘         └──────────────────┘
```

---

## The Five Phases

| Phase | What it introduced | Status |
|-------|-------------------|--------|
| Phase 1 | `applicableCategories` on MasterAttribute stores ObjectIds | ✅ Done |
| Phase 2 | Path-inheritance: selecting a category includes all descendants in sidebar | ✅ Done |
| Phase 3 | `channel_category_mappings` collection — tracks platform↔channel links | ✅ Done |
| Phase 4 | ProductType entity + `productTypeIds` on attributes | ✅ Done |
| Phase 5 | ProductType drives variant matrix; cache key is productTypeId | ✅ Done |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OMNI-ADMIN (Platform Owner)                          │
├─────────────────┬──────────────────┬─────────────────┬──────────────────────┤
│ Product         │  Product Types   │  Master         │  Channel Category    │
│ Categories      │                  │  Attributes     │  Mapping             │
├─────────────────┼──────────────────┼─────────────────┼──────────────────────┤
│ product_        │  product_types   │  master_        │  channel_category_   │
│ categories      │  collection      │  attributes     │  mappings collection │
└────────┬────────┴────────┬─────────┴─────────────────┴──────────────────────┘
         │ productTypeId   │ productTypeIds[]
         └────────┬────────┘
                  │
                  ▼
         Form Schema Generation
         POST /form-schema/generate   (initial: global fields only)
         POST /form-schema/refresh    (category selected: type-specific fields)
                  │
                  ▼
         Frontend Step 1 Form
         useFormSchema → useFieldHandler → useProductTypeVariants
         CategorySelectField → VariantConfigurator
```

---

## Full Data Flow — Category to Published Listing

```
1. Merchant selects category "Smartphones" in CategorySelectField
2. POST /form-schema/refresh { productCategory: "smartphones" }
   → Response: Smartphone attributes + metadata.productTypeId = "6623a1b2..."
3. useProductTypeVariants("6623a1b2...") fires
   → GET /admin/product-types/6623a1b2... → variantDimensions: [color, storage]
   → GET /admin/master-attributes?productTypeId=... → options arrays
   → VariantConfigurator renders color × storage matrix
4. Merchant fills form, selects variants, saves product
5. Step 2: channel fields use category channelMappings for Shopify/Amazon externalIds
6. Step 3: publish pushes to all channels using stored externalIds
```

---

## Platform Setup vs Merchant Onboarding

**Platform engineer does once** (before any merchant signs up):
- Creates ProductType library: Smartphone, Laptop, TV, Apparel, Shoe, ...
- Each defines which MasterAttributes and variant dimensions apply.

**Merchant does during onboarding** (automated, seconds):
- Connects first channel (e.g., Shopify) → import wizard
- Accepts auto-suggested ProductType assignments (NLP-matched, 94% confidence)
- Result: full attribute schema and variant matrix configured with minimal effort.

---

## The Golden Rules

1. **Merchant category changes NEVER break attributes.** ProductType is the buffer.
2. **Attributes NEVER need manual reassignment.** ProductType assignment handles everything.
3. **One channel change NEVER breaks other channels.** Each channelMapping is independent.
4. **Platform is always master after first import.** Channels are sync targets.
