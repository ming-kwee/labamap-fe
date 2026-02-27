# Step 2 Variant Grid — Full Configuration Plan

**Date:** 2026-02-27
**Branch:** v4
**Topic:** Making the variant table in Step 2 fully data-driven for both master overridable fields and channel-specific variant fields

---

## Problem Statement

The variant grid in Step 2 currently:

- ✅ Already renders both master overridable and channel-specific columns via `variantFields[]`
- ✅ Already uses `isMasterField` to select the correct render path per cell
- ✅ Already saves all column types into the same `variantOverrides[sku]` map
- ❌ Has a hardcoded type on `MasterProductSnapshot.variants[]` — only `price` and `quantity` are typed, so any other master variant attribute (e.g. `weight`, `barcode`) is invisible to the frontend even if the backend sends it
- ❌ Has a hardcoded field-name cast in `VariantOverridesTable.tsx` — master value lookup is `masterVariant?.[field.fieldName as "price" | "quantity"]`, which silently returns `undefined` for any other `isMasterField: true` column

---

## Current State — What Already Works

### Architecture is data-driven end-to-end

The `variant_overrides` section in the schema carries two arrays:

```
variantFields: ChannelFormField[]   — column definitions (any number, any type)
variants:      VariantOverrideRow[] — row definitions (one per SKU)
```

`ChannelFormField.isMasterField` drives which UX path the table renders per cell:

| `isMasterField` | Render path |
|-----------------|-------------|
| `true` + no override set | Master value grayed out + "✏ Override" button |
| `true` + override set | Editable input + "↩ master: {value}" reset link |
| `false` / absent | Plain always-editable `ChannelFieldInput` |

`ChannelFieldInput` already handles all `ChannelFieldType` values — TEXT, NUMBER, SELECT, MULTISELECT, CHECKBOX, DATE, URL, TEXTAREA. Channel-specific variant fields that use SELECT (e.g. `inventory_policy`) get the correct dropdown automatically.

### What the table looks like today (Shopify example)

```
SKU          | Price (Override) | Stock (Override) | Barcode
             | master           | master           |
────────────────────────────────────────────────────────────
WHP-BLK-S    | $29.99 [master]  | 100 [master]     | [       ]
Black / S    | ✏ Override        | ✏ Override        |
────────────────────────────────────────────────────────────
WHP-WHT-M    | $34.99 [✏]       | 80 [✏]           | 978123…
White / M    | ↩ master $29.99   | ↩ master 100      |
```

`price` and `quantity` are master fields (inherited/overridable). `barcode` is a channel-specific field (always editable). This already works — IF the backend sends `barcode` in `variantFields` with `isMasterField: false`.

---

## The Two Hardcoded Problems

### Problem 1 — `MasterProductSnapshot.variants[]` has a fixed shape

**Location:** `src/modules/channel-platform/types/channelStore.ts`

```typescript
// CURRENT — typed, only holds price and quantity
variants?: Array<{
  sku: string;
  variantLabel: string;
  price?: number;       // ← hardcoded
  quantity?: number;    // ← hardcoded
}>;
```

If the backend sends `weight`, `barcode`, `compareAtPrice`, or any other master variant attribute in this array, TypeScript silently ignores the extra keys. The field is invisible at runtime even though the JSON data contains it.

**Consequence:** Only `price` and `quantity` can be shown as "master" values in the variant table. Any future master variant attribute added in the backend has no effect on the frontend.

---

### Problem 2 — Hardcoded field-name cast in `VariantOverridesTable.tsx`

**Location:** `src/modules/channel-platform/components/wizard/VariantOverridesTable.tsx` — the master value lookup

```typescript
// CURRENT — hardcoded to only resolve price and quantity
const masterCellValue = isMasterField
  ? masterVariant?.[field.fieldName as "price" | "quantity"]   // ← HARDCODED CAST
  : undefined;
```

The TypeScript cast `as "price" | "quantity"` tells the compiler to allow the property access, but the actual JavaScript does work for any string key. However:

1. It is semantically wrong — it implies only two fields can ever be master variant fields
2. If TypeScript ever enforces stricter index access (with `noUncheckedIndexedAccess`), this will silently return `undefined` instead of the actual value
3. It communicates wrong intent to the next developer reading the code

**Consequence:** Even after fixing Problem 1, any `isMasterField: true` column whose `fieldName` is not `"price"` or `"quantity"` shows `—` instead of the actual master value.

---

## Frontend Fixes (2 lines of code)

### Fix 1 — Open `MasterProductSnapshot.variants[]`

**File:** `src/modules/channel-platform/types/channelStore.ts`

```typescript
// BEFORE
variants?: Array<{
  sku: string;
  variantLabel: string;
  price?: number;
  quantity?: number;
}>;

// AFTER — index signature makes it data-driven for any fieldName
variants?: Array<{
  sku: string;
  variantLabel: string;
  [fieldName: string]: unknown;
}>;
```

The index signature `[fieldName: string]: unknown` means the compiler accepts any string key, so `masterVariant["weight"]`, `masterVariant["barcode"]`, `masterVariant["compareAtPrice"]` all resolve correctly at both compile time and runtime.

---

### Fix 2 — Remove the hardcoded cast in `VariantOverridesTable`

**File:** `src/modules/channel-platform/components/wizard/VariantOverridesTable.tsx`

```typescript
// BEFORE
const masterCellValue = isMasterField
  ? masterVariant?.[field.fieldName as "price" | "quantity"]
  : undefined;

// AFTER — dynamic lookup works for any fieldName
const masterCellValue = isMasterField
  ? (masterVariant as Record<string, unknown> | undefined)?.[field.fieldName]
  : undefined;
```

With Fix 1 applied, the `MasterProductSnapshot.variants[]` elements already have `[fieldName: string]: unknown`, so the cast can be simplified even further — but the explicit `Record<string, unknown>` cast is kept for clarity and safety.

---

## What Needs to Change on the Backend

### BE-1 — `EcommerceMasterAttributeDocument` — add `appliesTo`

The document currently does not distinguish whether a master attribute applies at product level, variant level, or both. Without this, the schema generator cannot know which attributes go into `master_overrides` (product section) vs `variant_overrides` (variant table columns).

```json
// BEFORE
{
  "fieldName": "price",
  "isChannelField": false,
  "isChannelOverridable": true,
  "isVariantChannelOverridable": true,
  "fieldType": "NUMBER",
  "label": "Price"
}

// AFTER
{
  "fieldName": "price",
  "isChannelField": false,
  "isChannelOverridable": true,
  "isVariantChannelOverridable": true,
  "appliesTo": "both",
  "fieldType": "NUMBER",
  "label": "Price"
}
```

**`appliesTo` values:**

| Value | Goes into `master_overrides` section | Goes into `variant_overrides.variantFields` |
|-------|--------------------------------------|----------------------------------------------|
| `"product"` | Yes | No |
| `"variant"` | No | Yes |
| `"both"` | Yes (product-level) | Yes (variant table column) |

**Recommended assignments:**

| fieldName | `appliesTo` | Reason |
|-----------|-------------|--------|
| `name` | `"product"` | Product title only, not per-variant |
| `description` | `"product"` | Product description only |
| `price` | `"both"` | Product-level and per-SKU override |
| `compareAtPrice` | `"both"` | Product-level and per-SKU sale price |
| `quantity` | `"both"` | Product-level and per-SKU stock |
| `weight` | `"product"` | Shared across variants in most platforms |
| `barcode` | `"variant"` | Lives on the variant record, not product root |

---

### BE-2 — New: `EcommerceChannelVariantAttributeDocument`

Channel-specific variant fields (e.g. Shopify `inventory_policy`, Amazon `condition_type`) have no master equivalent. They need their own document type, separate from `EcommerceMasterAttributeDocument`.

```json
// New collection: ecommerce_channel_variant_attributes
{
  "fieldName": "inventory_policy",
  "channelType": "shopify",
  "fieldType": "SELECT",
  "label": "Inventory Policy",
  "required": true,
  "isMasterField": false,
  "appliesTo": "variant",
  "displayOrder": 10,
  "options": [
    { "value": "deny",     "label": "Stop selling when out of stock" },
    { "value": "continue", "label": "Continue selling when out of stock" }
  ],
  "helpText": "Controls Shopify behaviour when stock hits zero"
}
```

**Examples by channel:**

| Channel | fieldName | fieldType | required | Notes |
|---------|-----------|-----------|----------|-------|
| Shopify | `inventory_policy` | SELECT | true | `deny` / `continue` |
| Shopify | `fulfillment_service` | SELECT | false | `manual` / `shopify` / `amazon_marketplace_web` |
| Shopify | `requires_shipping` | CHECKBOX | false | Whether variant requires shipping |
| Amazon | `condition_type` | SELECT | true | `New` / `UsedLikeNew` / `UsedVeryGood` / `Used` |
| Amazon | `asin` | TEXT | false | Per-variant ASIN if different from parent |
| Amazon | `merchant_shipping_group` | TEXT | false | Shipping template name |
| eBay | `item_condition` | SELECT | true | `New` / `Used` / `Refurbished` |
| eBay | `listing_format` | SELECT | false | `FixedPrice` / `Auction` |
| TikTok | `product_id_type` | SELECT | false | `EAN` / `UPC` / `ISBN` / `GTIN` |
| TikTok | `seller_tiktok_sku` | TEXT | false | TikTok seller SKU |
| Lazada | `special_price` | NUMBER | false | Lazada promo price per variant |
| Lazada | `seller_sku` | TEXT | false | Lazada-specific SKU |
| Shopee | `variation_status` | SELECT | false | `MODEL_LIST` / `NORMAL` |
| Shopee | `shopee_item_id` | TEXT | false | Shopee platform variant ID |
| Tokopedia | `product_url` | URL | false | Per-variant product URL |
| Walmart | `wfs_eligible` | CHECKBOX | false | Walmart Fulfillment Services eligible |

---

### BE-3 — Schema Generation Endpoint — updated build logic

**`POST /api/v1/ecommerce/form-schema/channel-step`**

Request body: **no change.**

#### How to build `variant_overrides.variantFields`

```
Step 1: Master overridable variant columns
  Query: EcommerceMasterAttributeDocument
  where isVariantChannelOverridable = true
    AND (appliesTo = "variant" OR appliesTo = "both")
    AND channelType ∈ supportedChannels   (or supportedChannels is empty = all channels)
  Map each to:
  {
    fieldName:   attribute.fieldName,
    fieldType:   attribute.fieldType,
    label:       attribute.label + " (Channel Override)",   // distinguish from master_overrides section
    required:    false,                                      // master overrides are never required
    isMasterField: true,
    helpText:    attribute.channelOverrideConstraints[channelType]?.helpText,
    validationRules: attribute.channelOverrideConstraints[channelType],
    displayOrder: attribute.displayOrder ?? 0
  }

Step 2: Channel-specific variant columns
  Query: EcommerceChannelVariantAttributeDocument
  where channelType = store.channelType
  Map each to:
  {
    fieldName:    attribute.fieldName,
    fieldType:    attribute.fieldType,
    label:        attribute.label,
    required:     attribute.required,
    isMasterField: false,
    options:      attribute.options,
    helpText:     attribute.helpText,
    validationRules: attribute.validationRules,
    displayOrder: attribute.displayOrder
  }

Step 3: Merge and sort by displayOrder
  variantFields = sort([...step1Results, ...step2Results], by displayOrder)

Step 4: Build variant rows
  For each MasterProduct.variant:
    Load saved ChannelProductData.variantOverrides[sku] (may be empty map)
    Build currentOverrides:
      For master fields:
        currentOverrides[fieldName] = savedOverrides[fieldName] ?? null   (null = not overridden)
      For channel-specific fields:
        currentOverrides[fieldName] = savedOverrides[fieldName] ?? null   (null = not yet filled)
```

#### `masterProduct.variants[]` in the response — open the shape

```json
// BEFORE — fixed shape
"variants": [
  { "sku": "WHP-BLK-S", "variantLabel": "Black / S", "price": 29.99, "quantity": 100 }
]

// AFTER — include all master variant attributes as a flat map
"variants": [
  {
    "sku": "WHP-BLK-S",
    "variantLabel": "Black / S",
    "price": 29.99,
    "quantity": 100,
    "compareAtPrice": 39.99,
    "weight": 0.30,
    "barcode": "9781234567890"
  }
]
```

The rule: for each attribute in `EcommerceMasterAttributeDocument` where `appliesTo = "variant"` or `"both"`, include the resolved value from the master product's variant record in this map.

---

### BE-4 — Save Endpoint — no contract change, internal notes only

**`POST /api/v1/ecommerce/channel-product-data/save`**

Request body: **no change.** All variant column types — master overridable and channel-specific — save into the same `variantOverrides[sku]` map. The backend does not need to distinguish them at save time.

```json
"variantOverrides": {
  "WHP-BLK-S": {
    "price": 34.99,              // master override (isMasterField: true)
    "quantity": 80,              // master override (isMasterField: true)
    "barcode": "9781234567890",  // channel-specific (isMasterField: false)
    "inventory_policy": "deny"   // channel-specific required (isMasterField: false)
  }
}
```

**Null handling rule (unchanged):** keys with `null` value = user reset to master. For channel-specific fields, `null` means "user cleared the field" — treat as empty/unset.

---

### BE-5 — Completion Counting — include required channel-specific variant fields

Currently `completionPercentage` ignores `variant_overrides` entirely. With channel-specific required variant fields (e.g. `inventory_policy` on Shopify), this must change.

**Recommended completion logic for variant section:**

```
For each variant in masterProduct.variants:
  For each variantField in variantFields where required = true AND isMasterField = false:
    Check: variantOverrides[sku][fieldName] is non-null and non-empty
    If any SKU is missing a required channel-specific variant field → store is not READY

Master overridable variant fields (isMasterField: true, required: false):
  NEVER count toward completion — inheriting master value is always valid
```

---

### BE-6 — Publish Endpoint — variant merge logic

**`POST /api/v1/channels/publish`** — internal change only, request unchanged.

```
CURRENT variant merge:
  mergedVariant = { ...masterVariant, ...variantOverrides[sku] }

AFTER:
  effectiveVariantBase = { ...masterVariant }

  // Apply product-level master overrides to base (if price or quantity was overridden at product level)
  if (masterOverrides["price"] != null AND variantOverrides[sku]["price"] == null):
    effectiveVariantBase["price"] = masterOverrides["price"]
  if (masterOverrides["quantity"] != null AND variantOverrides[sku]["quantity"] == null):
    effectiveVariantBase["quantity"] = masterOverrides["quantity"]

  // Apply per-SKU overrides (highest priority)
  mergedVariant = { ...effectiveVariantBase, ...variantOverrides[sku] }

  // Channel-specific variant fields go through JOLT as part of mergedVariant
```

**Priority chain at variant level (lowest → highest):**
```
masterProduct.variant  <  masterOverrides (product-level)  <  variantOverrides[sku]
```

Product-level `masterOverrides["price"]` acts as a fallback for any SKU that doesn't have its own per-SKU price override. If a SKU has its own override in `variantOverrides[sku]["price"]`, that wins.

---

## Full Variant Table After All Changes

### Shopify US — example with all column types

```
SKU          | Price         | Stock         | Barcode   | Inv. Policy *
             | [master]      | [master]       |           |
─────────────────────────────────────────────────────────────────────────
WHP-BLK-S    | $29.99        | 100            | [       ] | [deny    ▼]
Black / S    | ↓ inherited   | ↓ inherited    |           |
             | [✏ Override]  | [✏ Override]   |           |
─────────────────────────────────────────────────────────────────────────
WHP-WHT-M    | $34.99        | 80             | 978123… | [continue ▼]
White / M    | [✏ Overridden]| [✏ Overridden] |           |
             | ↩ master$29.99| ↩ master 100   |           |
```

Column classification:
- `Price`, `Stock` — `isMasterField: true` — 2-state inherited/overridable UX
- `Barcode` — `isMasterField: false` — always editable TEXT input
- `Inventory Policy` — `isMasterField: false, required: true` — always editable SELECT with asterisk

### Amazon US — different channel-specific columns

```
SKU          | Price         | Stock         | Condition *   | ASIN
             | [master]      | [master]      |               |
───────────────────────────────────────────────────────────────────────
WHP-BLK-S    | $29.99        | 100           | [New      ▼]  | [       ]
Black / S    | ↓ inherited   | ↓ inherited   |               |
─────────────────────────────────────────────────────────────────────────
WHP-WHT-M    | $36.99 [✏]   | 50 [✏]       | [New      ▼]  | B09XYZ…
White / M    | ↩ master$29.99| ↩ master 100  |               |
```

The two tables share `price` and `stock` columns (master overridable) but have completely different channel-specific columns — driven entirely by what the backend sends in `variantFields`.

---

## Data Flow Summary

```
EcommerceMasterAttributeDocument
  isVariantChannelOverridable: true, appliesTo: "variant"|"both"
    → becomes isMasterField: true column in variantFields[]
    → masterValue resolved from MasterProduct.variant[fieldName]

EcommerceChannelVariantAttributeDocument (new)
  channelType: "shopify", appliesTo: "variant"
    → becomes isMasterField: false column in variantFields[]
    → always editable, required ones count toward completionPercentage

Schema response
  masterProduct.variants[] = open flat map (all master variant attributes)
  sections[variant_overrides].variantFields = [...masterOverridable, ...channelSpecific]
  sections[variant_overrides].variants[sku].currentOverrides = saved values or null

Frontend render
  for each cell:
    if isMasterField and no override → show master value, "✏ Override" button
    if isMasterField and override set → editable input, "↩ master: {value}" reset
    if NOT isMasterField → plain editable ChannelFieldInput (always)

Save
  variantOverrides[sku] = { ...masterOverrideFields, ...channelSpecificFields }
  all in same map — backend does not need to distinguish them

Completion
  required channel-specific variant fields → count toward completionPercentage
  master overridable variant fields → never count (inheriting is valid)

Publish merge (per SKU)
  effectiveBase = masterVariant + product-level masterOverrides (for "both" fields)
  final = effectiveBase + variantOverrides[sku]
  priority: masterVariant < masterOverrides < variantOverrides[sku]
```

---

## Files Changed Summary

| File | Change type | Detail |
|------|-------------|--------|
| `src/modules/channel-platform/types/channelStore.ts` | **Frontend fix** | `MasterProductSnapshot.variants[]` — add `[fieldName: string]: unknown` index signature |
| `src/modules/channel-platform/components/wizard/VariantOverridesTable.tsx` | **Frontend fix** | Remove `as "price" \| "quantity"` cast, use `Record<string, unknown>` dynamic lookup |
| `EcommerceMasterAttributeDocument` | **Backend schema** | Add `appliesTo: "product" \| "variant" \| "both"` field |
| `ecommerce_channel_variant_attributes` | **Backend new collection** | Channel-specific variant fields per channelType |
| `POST /form-schema/channel-step` | **Backend logic** | Build `variantFields[]` from both attribute sources; send open `masterProduct.variants[]` map |
| `completionPercentage` logic | **Backend logic** | Count required channel-specific variant fields (isMasterField: false, required: true) |
| `POST /channels/publish` | **Backend internal** | Apply product-level `masterOverrides` as fallback before `variantOverrides[sku]` |

---

*Generated: 2026-02-27 — Branch v4*
*Related docs: `STEP2-OMNICHANNEL-OVERRIDE-ANALYSIS.md`, `STEP2-SCHEMA-GENERATION.md`*
