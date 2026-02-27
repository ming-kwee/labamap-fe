# Step 2 Omnichannel Master Override — Implementation Changelog & Backend Guide

**Date:** 2026-02-27
**Branch:** v4

---

## What Changed on the Frontend

### 1. Types — `src/modules/channel-platform/types/channelStore.ts`

#### `ChannelFormField` — two new optional fields added

```typescript
// BEFORE
interface ChannelFormField {
  fieldName: string;
  fieldType: ChannelFieldType;
  label: string;
  required: boolean;
  helpText?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validationRules?: { minLength?; maxLength?; pattern?; min?; max? };
  currentValue?: unknown;
}

// AFTER
interface ChannelFormField {
  // ...all existing fields unchanged...
  isMasterField?: boolean;  // true = driven from EcommerceMasterAttributeDocument.isChannelOverridable
  masterValue?: unknown;    // resolved from MasterProduct document at schema-gen time
}
```

#### `SectionName` — new union member

```typescript
// BEFORE
type SectionName = "required" | "recommended" | "variant_overrides" | "optional";

// AFTER
type SectionName =
  | "required"
  | "recommended"
  | "variant_overrides"
  | "optional"
  | "master_overrides";   // NEW
```

#### `MasterProductSnapshot` — new interface (added)

```typescript
// NEW
interface MasterProductSnapshot {
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  quantity?: number;
  sku?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number; unit: string };
  mainImage?: string;
  variants?: Array<{
    sku: string;
    variantLabel: string;
    price?: number;
    quantity?: number;
  }>;
}
```

#### `ChannelStepSchemaResponse` — added `masterProduct`

```typescript
// BEFORE
interface ChannelStepSchemaResponse {
  step: 2;
  masterProductId: string;
  channels: ChannelSchemaPerStore[];
}

// AFTER
interface ChannelStepSchemaResponse {
  step: 2;
  masterProductId: string;
  masterProduct?: MasterProductSnapshot;  // NEW
  channels: ChannelSchemaPerStore[];
}
```

#### `ChannelProductData` — added `masterOverrides`

```typescript
// BEFORE
interface ChannelProductData {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  organizationId: string;
  status: ChannelProductStatus;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
  completionPercentage: number;
  readyToPublish: boolean;
  publishedAt?: string;
  publishError?: string;
  savedAt: string;
}

// AFTER
interface ChannelProductData {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  organizationId: string;
  status: ChannelProductStatus;
  masterOverrides: Record<string, unknown>;  // NEW
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
  completionPercentage: number;
  readyToPublish: boolean;
  publishedAt?: string;
  publishError?: string;
  savedAt: string;
}
```

#### `ChannelStepSaveRequest` — added `masterOverrides`

```typescript
// BEFORE
interface ChannelStepSaveRequest {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

// AFTER
interface ChannelStepSaveRequest {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  masterOverrides: Record<string, unknown>;  // NEW
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}
```

---

### 2. Service — `src/modules/channel-platform/services/channelStoreService.ts`

`saveChannelData` now serializes an explicit field list so `masterOverrides` is never accidentally dropped:

```typescript
// BEFORE
body: JSON.stringify(request)

// AFTER
body: JSON.stringify({
  masterProductId:  request.masterProductId,
  storeId:          request.storeId,
  channelType:      request.channelType,
  masterOverrides:  request.masterOverrides,  // NEW
  channelData:      request.channelData,
  variantOverrides: request.variantOverrides,
})
```

---

### 3. Wizard orchestrator — `src/modules/channel-platform/components/wizard/ChannelFieldsWizard.tsx`

#### `StoreFormValues` — added `masterOverrides`

```typescript
// BEFORE
interface StoreFormValues {
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

// AFTER
interface StoreFormValues {
  masterOverrides: Record<string, unknown>;  // NEW
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}
```

#### `extractInitialValues` — reads `master_overrides` section

```typescript
// BEFORE — master_overrides section fields fell through to channelData
} else {
  for (const field of section.fields ?? []) {
    if (field.currentValue !== undefined && field.currentValue !== null) {
      channelData[field.fieldName] = field.currentValue;
    }
  }
}

// AFTER — separate routing by sectionName
} else if (section.sectionName === "master_overrides") {
  for (const field of section.fields ?? []) {
    if (field.currentValue !== undefined && field.currentValue !== null) {
      masterOverrides[field.fieldName] = field.currentValue;
    }
  }
} else {
  for (const field of section.fields ?? []) {
    if (field.currentValue !== undefined && field.currentValue !== null) {
      channelData[field.fieldName] = field.currentValue;
    }
  }
}
```

#### `isLocallyComplete` — skips `master_overrides`

```typescript
// ADDED: master_overrides fields are never required, never block navigation
if (section.sectionName === "master_overrides") continue;
```

#### `saveStore` — passes `masterOverrides` to service

```typescript
// ADDED field in save request
masterOverrides: values.masterOverrides,
```

#### `activeValues` fallback — includes `masterOverrides: {}`

```typescript
// BEFORE
const activeValues = storeValues[activeStoreId] ?? { channelData: {}, variantOverrides: {} };

// AFTER
const activeValues = storeValues[activeStoreId] ?? { masterOverrides: {}, channelData: {}, variantOverrides: {} };
```

#### `ChannelStoreTab` — new `masterProduct` prop forwarded

```tsx
// ADDED
<ChannelStoreTab
  ...
  masterProduct={schemaResponse?.masterProduct}
/>
```

---

### 4. New file — `src/modules/channel-platform/components/wizard/MasterOverrideField.tsx`

Single-field widget with two render states:

| State | Condition | Renders |
|-------|-----------|---------|
| **Inherited** | `value === null \|\| undefined` | Input disabled with `masterValue` shown grayed out · gray "Inherited ↓" badge · "Override for {channel}" button |
| **Overridden** | `value !== null && value !== undefined` | Input enabled · blue "✏ Overridden" badge · "↩ Master: {masterValue}" hint · "Reset to master" button |

- Calls `onChange(fieldName, null)` on reset → caller removes the key from `masterOverrides`
- Reuses `ChannelFieldInput` for the actual input element, passing `disabled={isInherited}`

---

### 5. New file — `src/modules/channel-platform/components/wizard/MasterOverrideSection.tsx`

Collapsible section container for the `master_overrides` section:

- **Collapsed by default** when `overrideCount === 0` → header shows "None — using master values"
- **Auto-expands** when `overrideCount > 0` → header shows `{n} overridden` badge
- Info banner when expanded: "Fields changed here only apply to {channelName}."
- Renders a 2-column grid of `MasterOverrideField` (TEXTAREA spans both columns)

---

### 6. Tab renderer — `src/modules/channel-platform/components/wizard/ChannelStoreTab.tsx`

- Added `masterProduct?: MasterProductSnapshot` prop

- New handler `handleMasterOverrideChange`:
  ```typescript
  // null → delete key (reset to inherited); any value → set override
  function handleMasterOverrideChange(fieldName: string, value: unknown | null) {
    const next = { ...values.masterOverrides };
    if (value === null) {
      delete next[fieldName];
    } else {
      next[fieldName] = value;
    }
    onChange({ ...values, masterOverrides: next });
  }
  ```

- `handleVariantChange` extended to support `undefined` to **remove** a key from `variantOverrides[sku]`:
  ```typescript
  // ADDED: undefined = reset variant field to master
  if (value === undefined) {
    const { [fieldName]: _removed, ...rest } = existing;
    onChange({ ...values, variantOverrides: { ...values.variantOverrides, [sku]: rest } });
  }
  ```

- `renderSection` — new branch for `sectionName === "master_overrides"`:
  ```tsx
  if (section.sectionName === "master_overrides") {
    return (
      <MasterOverrideSection
        key="master_overrides"
        fields={section.fields ?? []}
        values={values.masterOverrides}
        channelName={schema.storeName}
        onChange={handleMasterOverrideChange}
      />
    );
  }
  ```

- `VariantOverridesTable` now receives `masterVariants={masterProduct?.variants}`

---

### 7. Variant table — `src/modules/channel-platform/components/wizard/VariantOverridesTable.tsx`

Added `masterVariants?: MasterProductSnapshot["variants"]` prop.

Column headers for `isMasterField` columns show a gray `master` tag.

Per-cell logic is now conditional on `isMasterField`:

| `isMasterField` | Override set? | Cell renders |
|-----------------|---------------|--------------|
| `false` | — | Editable `ChannelFieldInput` (existing behavior) |
| `true` | No | Master value grayed out + "✏ Override" link |
| `true` | Yes | Editable `ChannelFieldInput` + "↩ master: {value}" reset link |

Clicking "↩ master" calls `onChange(sku, fieldName, undefined)` → tab handler removes the key from `variantOverrides[sku]`.

---

### 8. Publish dashboard — `src/modules/channel-platform/components/wizard/PublishDashboard.tsx`

Added two pure helpers above the main component:

```typescript
function getEffectiveValue(
  fieldName: string,
  storeData: ChannelProductData,
  master: MasterProduct | null
): { value: unknown; source: "overridden" | "master" }

function EffectiveValueRow({ label, fieldName, storeData, master })
// → renders one row: label · value · [✏ Overridden] or [master] badge
```

Inside the "Ready to Publish?" card, a new **Effective Values panel** appears before the publish button:

```
Effective Values for amazon
────────────────────────────────────────────
Title     Wireless Headphones Pro — Amazon…  [✏ Overridden]
Price     $29.99                              [master]
Stock     500                                 [master]
```

Fields shown: `name`, `price`, `quantity`, `compareAtPrice`.
`source = "overridden"` if `storeData.masterOverrides[fieldName]` is non-null.
`source = "master"` otherwise (value read from `product` in sessionStorage).

---

## Files Changed Summary

| File | Changed / New | Summary |
|------|--------------|---------|
| `types/channelStore.ts` | Changed | New `MasterProductSnapshot`; `isMasterField`, `masterValue` on `ChannelFormField`; `master_overrides` on `SectionName`; `masterProduct` on schema response; `masterOverrides` on save request and product data |
| `services/channelStoreService.ts` | Changed | Explicit body serialization in `saveChannelData` including `masterOverrides` |
| `wizard/ChannelFieldsWizard.tsx` | Changed | `StoreFormValues`, `extractInitialValues`, `isLocallyComplete`, `saveStore`, `activeValues` fallback, `masterProduct` prop forwarding |
| `wizard/ChannelStoreTab.tsx` | Changed | `masterProduct` prop; `handleMasterOverrideChange`; variant reset on `undefined`; `master_overrides` section branch; `masterVariants` forwarding |
| `wizard/VariantOverridesTable.tsx` | Changed | `masterVariants` prop; 3-state cell rendering for `isMasterField` columns |
| `wizard/PublishDashboard.tsx` | Changed | `getEffectiveValue`, `EffectiveValueRow`, effective values panel in publish card |
| `wizard/MasterOverrideField.tsx` | **New** | 3-state single-field override widget (inherited / overridden) |
| `wizard/MasterOverrideSection.tsx` | **New** | Collapsible container with override count badge and info banner |

---

## Backend Recommendations

### MongoDB Collection — `channel_product_data`

Add `masterOverrides` field to the document schema:

```
// BEFORE — stored document shape
{
  masterProductId, storeId, channelType, organizationId,
  status, channelData, variantOverrides,
  completionPercentage, readyToPublish, savedAt
}

// AFTER
{
  masterProductId, storeId, channelType, organizationId,
  status,
  masterOverrides: {},   // NEW — keys = master fieldNames user explicitly overrode
  channelData, variantOverrides,
  completionPercentage, readyToPublish, savedAt
}
```

**Merge strategy on save:** Frontend sends the full `masterOverrides` object each time. Replace strategy is safe. Keys with `null` values must be **deleted** from the stored document (null = user reset to inherited).

**`completionPercentage` logic: unchanged.** `master_overrides` fields are always optional and must never be counted toward completion. Only channel-specific `required` section fields count.

---

### `EcommerceMasterAttributeDocument` — two new flags

These flags are the single source of truth for which fields appear in the override UI. Nothing is hardcoded on the frontend.

```json
// BEFORE
{
  "fieldName": "name",
  "isChannelField": false,
  "supportedChannels": ["shopify", "amazon"],
  "fieldType": "TEXT",
  "label": "Product Name"
}

// AFTER
{
  "fieldName": "name",
  "isChannelField": false,
  "isChannelOverridable": true,
  "channelOverrideConstraints": {
    "amazon":  { "maxLength": 200, "helpText": "Amazon titles max 200 chars" },
    "shopify":  { "maxLength": 255 },
    "tiktok":  { "maxLength": 100, "helpText": "TikTok titles max 100 chars" },
    "lazada":  { "maxLength": 300 }
  },
  "supportedChannels": ["shopify", "amazon"],
  "fieldType": "TEXT",
  "label": "Product Name"
}
```

**Recommended attributes to flag `isChannelOverridable: true`:**

| fieldName | Reason |
|-----------|--------|
| `name` | Title optimization per platform |
| `description` | Different char limits and formats per channel |
| `price` | Fee markup adjustments per marketplace |
| `quantity` | Stock allocation per channel |
| `compareAtPrice` | Platform-specific sale pricing |
| `weight` | Units differ by platform requirement |

**Variant-level — flag `isVariantChannelOverridable: true`:**

| fieldName | Reason |
|-----------|--------|
| `price` (variant) | Per-SKU per-channel pricing |
| `quantity` (variant) | Per-SKU stock allocation per channel |

---

### Endpoint 1 — Schema Generation

**`POST /api/v1/ecommerce/form-schema/channel-step`**

Request body: **no change.**

#### Response — BEFORE

```json
{
  "step": 2,
  "masterProductId": "prod_abc",
  "channels": [
    {
      "channelType": "amazon",
      "storeId": "store_amz_01",
      "storeName": "Amazon US",
      "storeUrl": "...",
      "displayOrder": 1,
      "completionStatus": "DRAFT",
      "completionPercentage": 0,
      "sections": [
        { "sectionName": "required",     "label": "Required Fields",     "priority": 1, "fields": [...] },
        { "sectionName": "recommended",  "label": "Recommended Fields",  "priority": 2, "fields": [...] },
        { "sectionName": "variant_overrides", "displayAs": "TABLE", "priority": 3,
          "variantFields": [
            { "fieldName": "barcode", "fieldType": "TEXT", "label": "Barcode", "required": false }
          ],
          "variants": [
            { "sku": "WHP-BLK-S", "variantLabel": "Black / S", "currentOverrides": {} }
          ]
        }
      ],
      "completionStats": { "requiredTotal": 3, "requiredFilled": 0 }
    }
  ]
}
```

#### Response — AFTER

```json
{
  "step": 2,
  "masterProductId": "prod_abc",
  "masterProduct": {
    "name": "Wireless Headphones Pro",
    "description": "Full product description...",
    "price": 29.99,
    "compareAtPrice": 39.99,
    "quantity": 500,
    "sku": "WHP-001",
    "weight": 0.35,
    "variants": [
      { "sku": "WHP-BLK-S", "variantLabel": "Black / S", "price": 29.99, "quantity": 100 },
      { "sku": "WHP-WHT-M", "variantLabel": "White / M", "price": 29.99, "quantity": 150 }
    ]
  },
  "channels": [
    {
      "channelType": "amazon",
      "storeId": "store_amz_01",
      "storeName": "Amazon US",
      "storeUrl": "...",
      "displayOrder": 1,
      "completionStatus": "DRAFT",
      "completionPercentage": 0,
      "sections": [
        {
          "sectionName": "master_overrides",
          "label": "Product Data Override",
          "priority": 0,
          "fields": [
            {
              "fieldName": "name",
              "fieldType": "TEXT",
              "label": "Product Title",
              "required": false,
              "isMasterField": true,
              "masterValue": "Wireless Headphones Pro",
              "currentValue": null,
              "helpText": "Override title for this channel only",
              "validationRules": { "maxLength": 200 }
            },
            {
              "fieldName": "description",
              "fieldType": "TEXTAREA",
              "label": "Description",
              "required": false,
              "isMasterField": true,
              "masterValue": "Full product description...",
              "currentValue": null
            },
            {
              "fieldName": "price",
              "fieldType": "NUMBER",
              "label": "Price",
              "required": false,
              "isMasterField": true,
              "masterValue": 29.99,
              "currentValue": null
            },
            {
              "fieldName": "quantity",
              "fieldType": "NUMBER",
              "label": "Stock",
              "required": false,
              "isMasterField": true,
              "masterValue": 500,
              "currentValue": null
            }
          ]
        },
        { "sectionName": "required",    "label": "Required Fields",    "priority": 1, "fields": [...] },
        { "sectionName": "recommended", "label": "Recommended Fields", "priority": 2, "fields": [...] },
        {
          "sectionName": "variant_overrides",
          "label": "Variant Overrides",
          "displayAs": "TABLE",
          "priority": 3,
          "variantFields": [
            { "fieldName": "price",    "fieldType": "NUMBER", "label": "Price",   "required": false, "isMasterField": true  },
            { "fieldName": "quantity", "fieldType": "NUMBER", "label": "Stock",   "required": false, "isMasterField": true  },
            { "fieldName": "barcode",  "fieldType": "TEXT",   "label": "Barcode", "required": false, "isMasterField": false }
          ],
          "variants": [
            {
              "sku": "WHP-BLK-S",
              "variantLabel": "Black / S",
              "currentOverrides": { "price": null, "quantity": null }
            }
          ]
        }
      ],
      "completionStats": { "requiredTotal": 3, "requiredFilled": 0 }
    }
  ]
}
```

**Build logic for backend:**
1. Load `MasterProduct` by `masterProductId` → build `masterProduct` snapshot
2. Load `EcommerceMasterAttributeDocument[]` where `isChannelOverridable = true`
3. For each store: filter attributes where `channelType ∈ supportedChannels`
4. Build `master_overrides` section fields, resolving `masterValue` from `MasterProduct[fieldName]`
5. Load existing `ChannelProductData` for `(masterProductId, storeId)` → populate `currentValue` from saved `masterOverrides[fieldName]` (return `null` if not previously overridden)
6. For `variant_overrides`: include fields where `isVariantChannelOverridable = true` in `variantFields` with `isMasterField: true`
7. Apply `channelOverrideConstraints[channelType]` as `validationRules` on each master_overrides field

---

### Endpoint 2 — Save Channel Data

**`POST /api/v1/ecommerce/channel-product-data/save?organizationId={org}`**

#### Request Body — BEFORE

```json
{
  "masterProductId": "prod_abc",
  "storeId": "store_amz_01",
  "channelType": "amazon",
  "channelData": {
    "browse_node": "123456",
    "vendor": "Acme"
  },
  "variantOverrides": {
    "WHP-BLK-S": { "barcode": "9781234567890" }
  }
}
```

#### Request Body — AFTER

```json
{
  "masterProductId": "prod_abc",
  "storeId": "store_amz_01",
  "channelType": "amazon",
  "masterOverrides": {
    "name": "Wireless Headphones Pro — Amazon Edition",
    "price": 34.99
  },
  "channelData": {
    "browse_node": "123456",
    "vendor": "Acme"
  },
  "variantOverrides": {
    "WHP-BLK-S": { "barcode": "9781234567890", "price": 36.99, "quantity": 80 }
  }
}
```

`masterOverrides` will be `{}` if the user has not overridden any field. Never omitted.

#### Response — BEFORE

```json
{
  "masterProductId": "prod_abc",
  "storeId": "store_amz_01",
  "channelType": "amazon",
  "organizationId": "org_123",
  "status": "READY",
  "channelData": { "browse_node": "123456" },
  "variantOverrides": { "WHP-BLK-S": { "barcode": "9781234567890" } },
  "completionPercentage": 100,
  "readyToPublish": true,
  "savedAt": "2026-02-27T10:00:00Z"
}
```

#### Response — AFTER

```json
{
  "masterProductId": "prod_abc",
  "storeId": "store_amz_01",
  "channelType": "amazon",
  "organizationId": "org_123",
  "status": "READY",
  "masterOverrides": { "name": "Wireless Headphones Pro — Amazon Edition", "price": 34.99 },
  "channelData": { "browse_node": "123456" },
  "variantOverrides": { "WHP-BLK-S": { "barcode": "9781234567890", "price": 36.99, "quantity": 80 } },
  "completionPercentage": 100,
  "readyToPublish": true,
  "savedAt": "2026-02-27T10:00:00Z"
}
```

**Backend notes:**
- Keys with `null` values in the incoming `masterOverrides` must be **deleted** from the stored document — `null` means the user clicked "Reset to master"
- `variantOverrides[sku]["price"]` and `variantOverrides[sku]["quantity"]` are now valid keys — store them as-is
- `completionPercentage` is **unchanged** — master override fields never count toward completion

---

### Endpoint 3 — Get Channel Product Data (Step 3)

**`GET /api/v1/ecommerce/channel-product-data/{masterProductId}`**

Request: **no change.**

#### Response — BEFORE

```json
[
  {
    "masterProductId": "prod_abc",
    "storeId": "store_amz_01",
    "channelType": "amazon",
    "status": "READY",
    "channelData": { "browse_node": "123456" },
    "variantOverrides": {},
    "completionPercentage": 100,
    "readyToPublish": true,
    "savedAt": "2026-02-27T10:00:00Z"
  }
]
```

#### Response — AFTER

```json
[
  {
    "masterProductId": "prod_abc",
    "storeId": "store_amz_01",
    "channelType": "amazon",
    "status": "READY",
    "masterOverrides": { "name": "Wireless Headphones Pro — Amazon Edition" },
    "channelData": { "browse_node": "123456" },
    "variantOverrides": {},
    "completionPercentage": 100,
    "readyToPublish": true,
    "savedAt": "2026-02-27T10:00:00Z"
  }
]
```

No logic change — just include `masterOverrides` from the stored document. Return `{}` for documents saved before this feature was deployed.

---

### Endpoint 4 — Publish (Single & Batch) — Internal Merge Change

**`POST /api/v1/channels/publish`** and **`POST /api/v1/channels/publish/batch`**

Request bodies: **no change.**

#### Internal Merge Pipeline — BEFORE

```
1. Load MasterProduct
2. Load ChannelProductData → { channelData, variantOverrides }
3. merged = { ...masterProduct, ...channelData }
4. Per variant: mergedVariant = { ...masterVariant, ...variantOverrides[sku] }
5. Run JOLT
```

#### Internal Merge Pipeline — AFTER

```
1. Load MasterProduct
2. Load ChannelProductData → { masterOverrides, channelData, variantOverrides }
3. effectiveMaster = { ...masterProduct, ...masterOverrides }
4. merged = { ...effectiveMaster, ...channelData }
5. Per variant:
     effectiveVariantBase = {
       ...masterVariant,
       price:    masterOverrides["price"]    ?? masterVariant.price,
       quantity: masterOverrides["quantity"] ?? masterVariant.quantity,
     }
     mergedVariant = { ...effectiveVariantBase, ...variantOverrides[sku] }
6. Run JOLT
```

**Priority chain (lowest → highest):**
```
masterProduct  <  masterOverrides  <  channelData  <  variantOverrides[sku]
```

This preserves backward compatibility: `channelData` channel-specific fields (e.g. `browse_node`, `vendor`) still win over everything. `masterOverrides` only affect fields that `channelData` does not set.

---

## Data Flow Summary

```
EcommerceMasterAttributeDocument
  isChannelOverridable: true          → drives master_overrides section fields
  isVariantChannelOverridable: true   → drives variant table master columns
  channelOverrideConstraints          → per-channel validationRules on override fields

Step 2 Schema Load
  POST /ecommerce/form-schema/channel-step
  ← masterProduct snapshot (name, price, qty, variants, ...)
  ← channels[].sections[master_overrides] with masterValue + currentValue per field
  ← variant_overrides.variantFields includes price/quantity (isMasterField: true)

Step 2 Frontend Init
  master_overrides section fields  → storeValues[storeId].masterOverrides
  required/recommended/optional    → storeValues[storeId].channelData
  variant_overrides rows           → storeValues[storeId].variantOverrides

Step 2 User Override
  clicks "Override for Amazon" on title field
    → masterOverrides["name"] = masterValue (user starts editing)
  edits value
    → masterOverrides["name"] = "Amazon Long Title..."
  clicks "Reset to master"
    → delete masterOverrides["name"]

Step 2 Autosave (every 30s or on tab switch)
  POST /ecommerce/channel-product-data/save
  { masterOverrides, channelData, variantOverrides }
  completionPercentage: unchanged (overrides are never required)

Step 3 Load
  GET /ecommerce/channel-product-data/{masterProductId}
  ← ChannelProductData[] now includes masterOverrides

Step 3 Effective Values (frontend, read-only display)
  title = masterOverrides["name"]  ?? sessionStorage product.name   → badge
  price = masterOverrides["price"] ?? sessionStorage product.price  → badge

Step 3 Publish
  POST /channels/publish (request body unchanged)
  ← Backend: effectiveMaster = masterProduct + masterOverrides
  ← Backend: merged = effectiveMaster + channelData
  ← Backend: per-SKU = effectiveVariantBase + variantOverrides[sku]
  Priority: masterProduct < masterOverrides < channelData < variantOverrides[sku]
```

---

*Generated: 2026-02-27 — Branch v4*
*Related docs: `STEP2-SCHEMA-GENERATION.md`, `CHANNEL-PRODUCT-DATA.md`, `IMPLEMENTATION-PLAN.md`*
