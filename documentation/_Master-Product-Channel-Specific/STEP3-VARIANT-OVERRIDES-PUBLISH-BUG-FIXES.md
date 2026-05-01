# STEP3-VARIANT-OVERRIDES-PUBLISH-BUG — Implementation Fixes

> **Source bug report:** `STEP3-VARIANT-OVERRIDES-PUBLISH-BUG.md`
> **Status:** Backend fixes implemented. Frontend fixes pending (separate repo).

---

## Overview

Fields entered in the Step 2 variant table (barcode, inventory_policy, per-SKU price, etc.)
were saved correctly into `ChannelProductData.variantOverrides` but were silently dropped
during publish. The bug report identified a 4-layer failure chain. During implementation
a **5th backend-only drop point** was discovered and fixed.

---

## Complete Failure Chain

| Layer | Location | Description | Status |
|-------|----------|-------------|--------|
| 1 | `channelStore.ts` — `PublishSingleRequest` type | `variantOverrides` field absent from TS type | ⚠️ Frontend fix pending |
| 2 | `PublishDashboard.tsx` — `handlePublishSingle` | `store.variantOverrides` never read or sent | ⚠️ Frontend fix pending |
| 3 | `PublishDashboard.tsx` — `handleAnalyze` | `variantOverrides` not merged into `sourceSchema` for pattern matching | ⚠️ Frontend fix pending |
| 4 | `productGenerationService.ts` — `transformMasterProductToSourceSchema` | `variants` array reduced to a count; per-SKU data lost | ⚠️ Frontend fix pending |
| **5** | **`ChannelAttributeConverterService.java` — `buildVariantGroups()`** | Variant node fields not in pre-registered mapping silently dropped | ✅ **Backend fixed** |

Backend additionally implemented:
- **BE-PUBLISH-1** — `variantOverrides` added to `PublishProductRequest` request contract
- **BE-PUBLISH-2** — `variantOverrides` carried from DB (`ChannelProductData`) onto the request in `loadAndMergeChannelData()`
- **BE-PUBLISH-3** — Post-JOLT variant override merge step in `processPublish()` (Step 3.5)

---

## Backend Fixes (Implemented)

### BE-PUBLISH-1 — `variantOverrides` added to `PublishProductRequest`

**File:** `src/main/java/com/labamap/labamapomnichannelbe4fe/publishing/model/request/PublishProductRequest.java`

```java
/**
 * Per-SKU variant field overrides from Step 2 variant table.
 * Keys are SKU strings; values are maps of fieldName → value.
 *
 * Applied in a post-JOLT step so channel-specific variant fields
 * (e.g. Shopify inventory_policy, barcode) are always present
 * in the final payload even if the JOLT spec does not forward them.
 *
 * Priority chain (lowest → highest):
 *   masterProduct.variants[i] < masterOverrides < variantOverrides[sku]
 */
private Map<String, Map<String, Object>> variantOverrides;
```

**Why:** The frontend needs a typed field to send per-SKU overrides. Without this, even
if the frontend sends the data, TypeScript would strip it and the backend contract would
have no place to receive it.

---

### BE-PUBLISH-2 — Carry `variantOverrides` from DB onto request

**File:** `src/main/java/com/labamap/labamapomnichannelbe4fe/publishing/service/ChannelPublishService.java`
**Method:** `loadAndMergeChannelData()`

Added **Step 4** after the existing pre-JOLT merge steps:

```java
// 4. Carry variantOverrides onto request for the post-JOLT merge step.
// DB-loaded values are the base; frontend-sent values (if any) win per-SKU.
if (cpd.getVariantOverrides() != null && !cpd.getVariantOverrides().isEmpty()) {
    Map<String, Map<String, Object>> effective = new HashMap<>(cpd.getVariantOverrides());
    if (request.getVariantOverrides() != null) {
        effective.putAll(request.getVariantOverrides()); // frontend-sent wins
    }
    request.setVariantOverrides(effective);
}
```

**Why:** The store-aware publish flow loads `ChannelProductData` from MongoDB. The variant
overrides saved by Step 2 autosave live there. This step carries them onto the request object
so `processPublish()` can access them for the post-JOLT step. Frontend-sent overrides take
precedence per-SKU (more recent / more specific), DB-loaded fill the rest.

---

### BE-PUBLISH-3 — Post-JOLT variant override merge step

**File:** `src/main/java/com/labamap/labamapomnichannelbe4fe/publishing/service/ChannelPublishService.java`
**Method:** `processPublish()`

Added **Step 3.5** between post-processing and payload wrapping:

```java
// Step 3.5: Post-JOLT variant override merge (BE-PUBLISH)
if (request.getVariantOverrides() != null && !request.getVariantOverrides().isEmpty()) {
    transformedData = applyVariantOverridesPostJolt(transformedData, request.getVariantOverrides());
}
```

**Why this is needed in addition to the pre-JOLT merge (BE-6):**

The pre-JOLT merge (BE-6, from STEP2-VARIANT-GRID-FULL-CONFIG.md) applies `variantOverrides[sku]`
to the INPUT variants before JOLT runs. This handles fields the JOLT spec explicitly maps (e.g.
price → formatted price). However:

- Channel-specific variant fields like `barcode` and `inventory_policy` are **not** in the master
  product schema and the JOLT spec has **no mapping for them** — JOLT drops them silently.
- The post-JOLT step re-applies overrides to the **output** variant nodes, ensuring these fields
  survive regardless of JOLT coverage.

**New helper — `applyVariantOverridesPostJolt()`:**

```java
private Map<String, Object> applyVariantOverridesPostJolt(
        Map<String, Object> transformedData,
        Map<String, Map<String, Object>> variantOverrides) {

    List<Map<String, Object>> variants = findVariantsInOutput(transformedData);
    // For each variant node with matching sku → merge override map on top
    for (Map<String, Object> variant : variants) {
        String sku = String.valueOf(variant.get("sku"));
        Map<String, Object> overrides = variantOverrides.get(sku);
        if (overrides != null) {
            overrides.forEach((key, value) -> { if (value != null) variant.put(key, value); });
        }
    }
    return transformedData;
}
```

**New helper — `findVariantsInOutput()`:**

Searches for the variants array in two locations to cover different channel output shapes:
1. Top-level `"variants"` key (flat output)
2. One level deep inside any nested `Map` value — covers `product.variants` (Shopify, Amazon, etc.)

---

### BE-PUBLISH-4 (Layer 5) — Passthrough for unmapped variant fields

**File:** `src/main/java/com/labamap/labamapomnichannelbe4fe/publishing/service/ChannelAttributeConverterService.java`
**Method:** `buildVariantGroups()`

**The drop point:** Even after the post-JOLT step correctly injects `barcode` into the variant
node, `buildVariantGroups()` only looped over `channelConfig.getAttributeMappings().getVariantFields()`
— a pre-registered map from the database. Any field not explicitly registered there was
never emitted into `SyncChannelProductRequest`.

**Fix — two-pass variant field emission:**

```java
// Track which fieldNames are handled by the pre-registered attribute mapping loop
Set<String> processedFieldNames = new HashSet<>();

// Pass 1: Convert pre-registered variant field mappings (existing behaviour, unchanged)
for (Map.Entry<String, ChannelConfiguration.VariantFieldMapping> entry : variantFields.entrySet()) {
    String fieldName = extractFieldNameFromPath(entry.getKey().replace("@", "."));
    processedFieldNames.add(fieldName);   // ← mark as handled
    Object value = variant.get(fieldName);
    if (value != null) {
        channelVariants.add(ChannelVariant.builder()
                .vrntId(mapping.getVrntId())
                .chnlVrntName(pathForExtraction)
                .chnlVrntValue(serialize(value))
                .chnlVrntType(mapping.getChnlVrntType())
                .isSupportField(mapping.getIsSupportField())
                .build());
    }
}

// Pass 2: Passthrough — emit any variant fields NOT covered by the pre-registered mapping
for (Map.Entry<String, Object> variantEntry : variant.entrySet()) {
    String fieldName = variantEntry.getKey();
    if (processedFieldNames.contains(fieldName)) continue;  // already handled in Pass 1

    Object value = variantEntry.getValue();
    if (value == null) continue;

    String fieldType = (value instanceof Number) ? "NUMBER"
            : (value instanceof Boolean) ? "BOOLEAN"
            : "TEXT";

    channelVariants.add(ChannelVariant.builder()
            .vrntId("passthrough_" + fieldName)
            .chnlVrntName("product.variants." + fieldName)
            .chnlVrntValue(serialize(value))
            .chnlVrntType(fieldType)
            .isSupportField(false)
            .build());
    log.debug("VARIANT PASSTHROUGH: added unmapped field '{}' = {}", fieldName, value);
}
```

**Result for a Shopify variant with `barcode` from Step 2 variant overrides:**

```
Pass 1 → sku, price, inventory_quantity, option1, option2, option3  (pre-registered)
Pass 2 → barcode, inventory_policy                                   (passthrough)
```

Both are now present in `SyncChannelProductRequest.variantGroups[].channelVariant[]`.

---

## Priority Chain (Final)

```
masterProduct.variants[i]          ← base variant data from master product
  ↑ BE-6 pre-JOLT merge
masterOverrides (product-level)    ← e.g. price override applies to all variants as fallback
variantOverrides[sku] (pre-JOLT)   ← injected into input before JOLT for mapped fields
  ↑ JOLT transformation
  ↑ Post-processing enrichment
  ↑ BE-PUBLISH-3 post-JOLT merge
variantOverrides[sku] (post-JOLT)  ← re-applied after JOLT for channel-specific fields
  ↑ BE-PUBLISH-4 passthrough
SyncChannelProductRequest          ← final output; all variant fields present
```

---

## Frontend Fixes Still Required (Separate Repo)

### Fix 1 — `channelStore.ts` — Add `variantOverrides` to `PublishSingleRequest`

```typescript
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
  variantOverrides?: Record<string, Record<string, unknown>>;  // NEW
  masterOverrides?: Record<string, unknown>;                   // NEW
}
```

### Fix 2 — `PublishDashboard.tsx` — `handlePublishSingle`

```typescript
const masterProductData: Record<string, unknown> = {
  ...(product ? transformMasterProductToSourceSchema(product) : {}),
  ...(store?.masterOverrides ?? {}),   // NEW: master-level overrides first
  ...(store?.channelData ?? {}),       // channel fields win
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
  variantOverrides: store?.variantOverrides ?? {},   // NEW
});
```

### Fix 3 — `PublishDashboard.tsx` — `handleAnalyze`

```typescript
// Flatten variant overrides into sourceSchema (prefix with variant_ to avoid collision)
const variantOverrides = store.variantOverrides ?? {};
const flatVariantFields: Record<string, unknown> = {};
for (const skuOverrides of Object.values(variantOverrides)) {
  for (const [fieldName, value] of Object.entries(skuOverrides)) {
    if (value != null && !(fieldName in flatVariantFields)) {
      flatVariantFields[`variant_${fieldName}`] = value;
    }
  }
}
if (Object.keys(flatVariantFields).length > 0) {
  request.sourceSchema = { ...request.sourceSchema, ...flatVariantFields };
}
```

### Fix 4 — `productGenerationService.ts` — `transformMasterProductToSourceSchema`

```typescript
if (product.variants && product.variants.length > 0) {
  sourceSchema['variant_count'] = product.variants.length;

  // Flatten first variant's fields as sample for pattern matching
  const firstVariant = product.variants[0];
  if (firstVariant) {
    Object.entries(firstVariant).forEach(([vKey, vVal]) => {
      if (vVal != null && vVal !== '') {
        sourceSchema[`variant_${vKey}`] = vVal;
      }
    });
  }

  // Emit full variants array for backend JOLT consumption
  sourceSchema['variants'] = product.variants;
}
```

---

## Files Changed (Backend)

| File | Change |
|------|--------|
| `publishing/model/request/PublishProductRequest.java` | Added `variantOverrides: Map<String, Map<String, Object>>` field |
| `publishing/service/ChannelPublishService.java` | Step 4 in `loadAndMergeChannelData()`: carry DB variantOverrides onto request |
| `publishing/service/ChannelPublishService.java` | Step 3.5 in `processPublish()`: call `applyVariantOverridesPostJolt()` |
| `publishing/service/ChannelPublishService.java` | New helpers: `applyVariantOverridesPostJolt()`, `findVariantsInOutput()` |
| `publishing/service/ChannelAttributeConverterService.java` | `buildVariantGroups()`: two-pass emission (pre-mapped + passthrough) |
