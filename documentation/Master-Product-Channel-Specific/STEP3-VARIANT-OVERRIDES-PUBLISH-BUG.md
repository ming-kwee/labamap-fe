# Step 3 — Variant Overrides Not Published (Barcode / Per-SKU Fields Omitted)

## Summary

Fields entered in the **Step 2 variant table** (e.g. barcode, inventory policy, per-SKU price override) are saved correctly by the autosave call (`variantOverrides` key in `ChannelProductData`), but are **silently dropped** when the user clicks "Publish" in Step 3.

Root cause: a 4-layer failure chain spanning frontend type definition → frontend publish handler → pattern-matching analysis → backend publish pipeline.

---

## Failure Chain (Layer by Layer)

### Layer 1 — `PublishSingleRequest` type has no `variantOverrides` field

**File:** `src/modules/channel-platform/types/channelStore.ts` lines 207–221

```typescript
// BEFORE — variantOverrides absent from the publish request contract
export interface PublishSingleRequest {
  masterProductId: string;
  storeId: string;
  organizationId: string;
  masterProductData?: Record<string, unknown>;
  channelId?: string;
  fieldMappings?: unknown[];
  joltSpec?: unknown[];
  categoryId?: string;
  dryRun?: boolean;
}
```

Because the type does not declare `variantOverrides`, TypeScript will strip the field even if someone tries to include it. The backend never receives it.

---

### Layer 2 — `handlePublishSingle` never reads `store.variantOverrides`

**File:** `src/modules/channel-platform/components/wizard/PublishDashboard.tsx` lines 483–514

```typescript
// BEFORE — masterOverrides and variantOverrides both ignored
async function handlePublishSingle(storeId: string) {
  const store = storeData.find((d) => d.storeId === storeId);
  // ...
  const masterProductData: Record<string, unknown> = {
    ...(product ? transformMasterProductToSourceSchema(product) : {}),
    ...(store?.channelData ?? {}),   // ✅ channel fields merged
    // ❌ store?.masterOverrides — never applied
    // ❌ store?.variantOverrides — never included at all
  };

  const result = await PublishService.publishToStore({
    masterProductId,
    storeId,
    organizationId: ORGANIZATION_ID,
    masterProductData,               // only contains flat master + channel fields
    channelId: store?.channelType,
    fieldMappings: priorAnalysis?.fieldMappings ?? [],
    joltSpec:     priorAnalysis?.joltSpec ?? [],
    categoryId:   product?.category ?? "default",
    dryRun: false,
    // ❌ variantOverrides: never passed
  });
}
```

`store` is a `ChannelProductData` record which already contains `variantOverrides` from the saved autosave payload — but `handlePublishSingle` never reads that field.

---

### Layer 3 — `handleAnalyze` also misses `variantOverrides` in source schema

**File:** `src/modules/channel-platform/components/wizard/PublishDashboard.tsx` lines 423–462

```typescript
// BEFORE — pattern matching sees flat master + channelData only
const request = await generateMappingRequest(product, store.channelType, {...});

// Merge Step-2 channel-specific fields
const channelFields = store.channelData ?? {};
if (Object.keys(channelFields).length > 0) {
  request.sourceSchema = { ...request.sourceSchema, ...channelFields };
}
// ❌ No merge of store.variantOverrides — barcode etc. are invisible to pattern matcher
```

Because `variantOverrides` is not merged into `sourceSchema`, the pattern-matching engine reports `barcode` (and any other variant-level field) as an unmapped source field — even when the user explicitly entered a value in Step 2.

---

### Layer 4 — `transformMasterProductToSourceSchema` drops the variant array

**File:** `src/modules/ecommerce-product/services/productGenerationService.ts` lines 318–321

```typescript
// BEFORE — variant array becomes a count; all per-SKU data is lost
if (product.variants && product.variants.length > 0) {
  sourceSchema['variant_count'] = product.variants.length;
  // ❌ Individual variant data (barcode, price, sku, options) is never added
}
```

The reflection loop at line 264 skips all non-string arrays by doing nothing with objects (`return;` at line 284). The `variants` array falls into the non-string array path, so it is handed to `sourceSchema[key] = value` — but then immediately skipped by the object-detection guard. Only the count is preserved.

---

## Recommended Fixes

### Fix 1 — Add `variantOverrides` to `PublishSingleRequest`

**File:** `src/modules/channel-platform/types/channelStore.ts`

```typescript
// AFTER
export interface PublishSingleRequest {
  masterProductId: string;
  storeId: string;
  organizationId: string;
  masterProductData?: Record<string, unknown>;
  channelId?: string;
  fieldMappings?: unknown[];
  joltSpec?: unknown[];
  categoryId?: string;
  dryRun?: boolean;
  /** Per-SKU field overrides from Step 2 variant table — forwarded to backend publish pipeline */
  variantOverrides?: Record<string, Record<string, unknown>>;   // NEW
  /** Per-channel master field overrides from Step 2 master override section */
  masterOverrides?: Record<string, unknown>;                    // NEW (bonus, for completeness)
}
```

---

### Fix 2 — Include `variantOverrides` (and `masterOverrides`) in `handlePublishSingle`

**File:** `src/modules/channel-platform/components/wizard/PublishDashboard.tsx`

```typescript
// AFTER
const masterProductData: Record<string, unknown> = {
  ...(product ? transformMasterProductToSourceSchema(product) : {}),
  ...(store?.masterOverrides ?? {}),   // ← NEW: apply master-level overrides first
  ...(store?.channelData ?? {}),       // ← channel fields still win
};

const result = await PublishService.publishToStore({
  masterProductId,
  storeId,
  organizationId: ORGANIZATION_ID,
  masterProductData,
  channelId:        store?.channelType,
  fieldMappings:    priorAnalysis?.fieldMappings ?? [],
  joltSpec:         priorAnalysis?.joltSpec ?? [],
  categoryId:       product?.category ?? "default",
  dryRun:           false,
  variantOverrides: store?.variantOverrides ?? {},   // ← NEW
});
```

---

### Fix 3 — Include `variantOverrides` in `handleAnalyze` source schema

**File:** `src/modules/channel-platform/components/wizard/PublishDashboard.tsx`

The variant override values (e.g. `barcode = "123456789012"`) should be visible to the pattern matcher so it can discover new mappings (e.g. `barcode → variant.barcode`).

```typescript
// AFTER
const channelFields = store.channelData ?? {};
if (Object.keys(channelFields).length > 0) {
  request.sourceSchema = { ...request.sourceSchema, ...channelFields };
}

// NEW: Flatten variant overrides into sourceSchema so pattern matcher can see them.
// Strategy: union all values across SKUs (first non-null value wins per field).
const variantOverrides = store.variantOverrides ?? {};
const flatVariantFields: Record<string, unknown> = {};
for (const skuOverrides of Object.values(variantOverrides)) {
  for (const [fieldName, value] of Object.entries(skuOverrides)) {
    if (value !== undefined && value !== null && !(fieldName in flatVariantFields)) {
      flatVariantFields[`variant_${fieldName}`] = value;   // prefix to distinguish from product-level
    }
  }
}
if (Object.keys(flatVariantFields).length > 0) {
  request.sourceSchema = { ...request.sourceSchema, ...flatVariantFields };
}
```

---

### Fix 4 — Include variant data in `transformMasterProductToSourceSchema`

**File:** `src/modules/ecommerce-product/services/productGenerationService.ts`

The variants block (lines 318–321) should emit per-SKU fields so the JOLT engine can reference them. At a minimum, add the master variant data as indexed entries:

```typescript
// AFTER — emit per-variant data alongside the count
if (product.variants && product.variants.length > 0) {
  sourceSchema['variant_count'] = product.variants.length;

  // Flatten first variant's fields as representative sample for pattern matching
  const firstVariant = product.variants[0];
  if (firstVariant) {
    Object.entries(firstVariant).forEach(([vKey, vVal]) => {
      if (vVal !== null && vVal !== undefined && vVal !== '') {
        sourceSchema[`variant_${vKey}`] = vVal;   // e.g. variant_barcode, variant_sku, variant_price
      }
    });
  }

  // Emit full variants array for backend JOLT consumption
  sourceSchema['variants'] = product.variants;
}
```

---

## Backend Fix Required

### BE-PUBLISH: Post-JOLT Variant Override Merge Step

The backend publish endpoint currently receives `variantOverrides` in the save payload but does **not** use it during publish. The publish pipeline needs a post-JOLT step that injects per-SKU overrides into the transformed output.

#### Current backend publish pipeline (pseudocode)
```
1. Load MasterProduct
2. Load ChannelProductData → { masterOverrides, channelData, variantOverrides }
3. effectiveMaster = { ...masterProduct, ...masterOverrides }
4. merged = { ...effectiveMaster, ...channelData }
5. Run JOLT(merged) → transformedOutput  ← variants come from masterProduct only
6. POST to channel API
   ↑ variantOverrides are ignored — barcode, per-SKU price etc. never make it to channel
```

#### Recommended pipeline (pseudocode)
```
1. Load MasterProduct
2. Load ChannelProductData → { masterOverrides, channelData, variantOverrides }
3. effectiveMaster = { ...masterProduct, ...masterOverrides }
4. merged = { ...effectiveMaster, ...channelData }
5. Run JOLT(merged) → transformedOutput

6. ← NEW POST-JOLT STEP: apply variantOverrides into transformedOutput
   For each (sku, overrides) in variantOverrides:
     Find the variant node in transformedOutput.variants[] where variant.sku === sku
     (or equivalent channel-specific id field)
     Merge overrides into that variant node:
       transformedOutput.variants[i] = { ...transformedOutput.variants[i], ...overrides }

7. POST to channel API with variant overrides merged in
```

#### Priority chain (lowest → highest)
```
masterProduct.variants[i]
  < masterOverrides (product-level)
    < variantOverrides[sku] (per-SKU channel override)
```

#### Endpoint contract change

**Request** — add `variantOverrides` to the publish request body:

```
POST /api/v1/channels/publish
{
  masterProductId:    string,
  storeId:            string,
  organizationId:     string,
  masterProductData?: Record<string, unknown>,   // existing
  channelId?:         string,                    // existing
  fieldMappings?:     unknown[],                 // existing
  joltSpec?:          unknown[],                 // existing
  categoryId?:        string,                    // existing
  dryRun?:            boolean,                   // existing
  variantOverrides?:  Record<string, Record<string, unknown>>   // NEW
}
```

Backend can also read `variantOverrides` directly from the stored `ChannelProductData` document (using `masterProductId + storeId` lookup) instead of requiring the frontend to re-send it — but having the frontend send it as well simplifies atomicity and reduces one DB round-trip.

---

## Impact Assessment

| Field | Saved in Step 2? | Visible in Pattern Match? | Published to Channel? |
|-------|-----------------|--------------------------|----------------------|
| Barcode (variant) | ✅ Yes | ❌ No | ❌ No |
| Inventory Policy (variant) | ✅ Yes | ❌ No | ❌ No |
| Per-SKU Price Override | ✅ Yes | ❌ No | ❌ No |
| Per-SKU Stock Override | ✅ Yes | ❌ No | ❌ No |
| Channel fields (vendor, product_type) | ✅ Yes | ✅ Yes (merged) | ✅ Yes |
| Master override (title, price) | ✅ Yes | ❌ No | ❌ No |

---

## Files to Change

| File | Layer | Change |
|------|-------|--------|
| `src/modules/channel-platform/types/channelStore.ts` | Type | Add `variantOverrides` + `masterOverrides` to `PublishSingleRequest` |
| `src/modules/channel-platform/components/wizard/PublishDashboard.tsx` | Frontend | `handlePublishSingle`: include `variantOverrides`; `handleAnalyze`: flatten variant overrides into sourceSchema |
| `src/modules/ecommerce-product/services/productGenerationService.ts` | Frontend | `transformMasterProductToSourceSchema`: emit variant fields + full `variants` array |
| Backend publish endpoint | Backend | Post-JOLT step: iterate `variantOverrides`, merge into transformed variant nodes |
