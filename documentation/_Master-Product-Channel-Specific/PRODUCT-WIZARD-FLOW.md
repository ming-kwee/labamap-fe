# Product Creation Wizard — Complete Flow

## The Three Steps

```
Step 1: Master Product          Step 2: Channel Fields          Step 3: Preview & Publish
─────────────────────           ──────────────────────          ──────────────────────────
Category-aware form             One tab per connected store     Per-store preview + publish
EcommerceMasterAttribute        channel_store_connections        channel_product_data status
(isChannelField = false)        + channel_configurations         + channelCredentials
                                + EcommerceMasterAttribute
                                  (isChannelField = true)
         │                               │                                │
         ▼                               ▼                                ▼
 MasterProductDocument          ChannelProductData × N            sync_channel_product_impl
 (one per product)              (one per product × store)         (per store, in parallel)
```

---

## Step 1: Create Master Product

### UI Entry Points

The wizard starts from either:
- "New Product" button → creates a fresh master product
- "Edit Product" → loads existing and jumps to the right step

### API Call

```
POST /api/v1/ecommerce/master-product

Body (core fields only — full schema from form-schema/generate):
{
  "name":        "Wireless Earbuds Pro",
  "sku":         "WE-PRO-001",
  "category":    "electronics",
  "price":       29.99,
  "description": "Premium wireless earbuds",
  "variants": [
    { "sku": "SKU-001", "color": "Black", "size": "One Size", "price": 29.99, "stock": 100 },
    { "sku": "SKU-002", "color": "White", "size": "One Size", "price": 29.99, "stock": 80 }
  ],
  "images": ["https://cdn.example.com/img1.jpg"]
}

Response:
{
  "masterProductId": "prod_abc123",
  "status": "DRAFT",
  "nextStep": 2,
  "nextStepUrl": "/wizard/prod_abc123/step-2"
}
```

### Transition to Step 2

On "Save & Continue →", the frontend:
1. Calls `POST /api/v1/ecommerce/master-product`
2. Receives `masterProductId`
3. Redirects to Step 2 passing `masterProductId`

---

## Step 2: Channel-Specific Fields

### Step 2 Entry

```
POST /api/v1/ecommerce/form-schema/channel-step

Body:
{
  "masterProductId": "prod_abc123",
  "organizationId":  "org_123"
}

Response: ChannelStepSchemaResponse (see STEP2-SCHEMA-GENERATION.md)
```

The response includes `currentValue` for every field — pre-populated from any
previously saved `channel_product_data`.

### Autosave Behavior

The frontend autosaves Step 2 data every 30 seconds and on tab change:

```
POST /api/v1/ecommerce/channel-product-data/save

Body:
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-us-store",
  "channelType":     "shopify",
  "channelData": {
    "vendor":       "TechBrand US",
    "product_type": "Electronics"
  },
  "variantOverrides": {
    "SKU-001": { "inventory_policy": "deny" }
  }
}
```

### Tab Navigation Rules

```
Tab status indicators:
  ⚪ Empty      — no data saved yet  (completionPercentage = 0)
  🟡 Partial   — some required fields filled  (0 < completionPercentage < 100)
  🟢 Complete  — all required fields filled  (completionPercentage = 100)
  🔴 Error     — previous publish failed

"Next: {nextStoreName} →" button:
  - Always available (user can skip a store's optional fields)
  - If current store has unfilled required fields: show warning toast but allow skip

"Continue to Preview →" button:
  - Enabled when at least ONE store is in READY status
  - If any store has unfilled required fields: show warning dialog listing them
```

### Progress Bar

```
GET /api/v1/ecommerce/channel-product-data/{masterProductId}/completion-summary

Response:
{
  "overallReady": false,
  "stores": [
    { "storeId": "shopify-us-store", "storeName": "My Shopify US",
      "channelType": "shopify", "completionPercentage": 100, "status": "READY" },
    { "storeId": "wix-main-site", "storeName": "My WIX Store",
      "channelType": "wix", "completionPercentage": 60, "status": "DRAFT" }
  ]
}
```

Frontend renders: `Shopify US ████████████ 100%   WIX ████████░░░░ 60%`

---

## Step 3: Preview & Publish

### Step 3 Entry

```
GET /api/v1/ecommerce/channel-product-data/{masterProductId}

Response: Array of ChannelProductData, one per store.
Each contains: storeId, storeName, channelType, status, completionPercentage,
               channelData (preview values), variantOverrides
```

The frontend renders a preview card per store using channelData values.

### Publish Single Store

```
POST /api/v1/channels/publish

Body:
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-us-store",
  "organizationId":  "org_123"
}
```

The publish pipeline (see below) handles the rest.

### Publish All Ready Stores

```
POST /api/v1/channels/publish/batch

Body:
{
  "masterProductId": "prod_abc123",
  "organizationId":  "org_123",
  "storeIds": ["shopify-us-store", "wix-main-site"]  // only READY stores
}

Response (streaming or polling):
{
  "batchId": "batch_xyz",
  "results": [
    { "storeId": "shopify-us-store", "status": "PUBLISHED", "publishedAt": "..." },
    { "storeId": "wix-main-site",    "status": "FAILED",    "error": "..." }
  ]
}
```

---

## Publish Pipeline — How Step 2 Data Flows In

The existing publish flow at `POST /api/v1/channels/publish` currently takes
`masterProductId` + `channelId` (the platform type). After this module is implemented,
it takes `masterProductId` + `storeId` instead.

### Updated Publish Pipeline Steps

```
POST /api/v1/channels/publish
  { masterProductId, storeId, organizationId }
                    │
                    ▼
  1. Load ChannelStoreConnection(storeId)
        → gets channelType, storeUrl, credentials

  2. Load ChannelConfiguration(channelType)        ← UNCHANGED
        → gets joltSpec, postProcessingRules, attributeMappings

  3. Load MasterProduct(masterProductId)            ← UNCHANGED
        → gets name, sku, price, variants, images

  4. Load ChannelProductData(masterProductId, storeId)
        → gets channelData, variantOverrides (Step 2 values)

  5. Merge: master product + channelData
        → for each variant: apply variantOverrides[sku] on top of variant data

  6. Build masterProductData (existing format):
        → masterProductData.attributes += channelData fields
        → masterProductData.variants[i] += variantOverrides[sku] fields

  7. Run JOLT transformation                        ← UNCHANGED
        → masterProductData → joltSpec → transformed

  8. Run PostProcessing                              ← UNCHANGED
        → transformed → postProcessingRules → enriched

  9. Build sync API request:
        → channelCredentials from store.credentials  ← NEW: from store connection
        → metadataGroups workaction URLs using store.storeUrl  ← NEW

  10. Call sync_channel_product_impl                ← UNCHANGED

  11. On success: ChannelProductDataService.markPublished(masterProductId, storeId)
      On failure: ChannelProductDataService.markFailed(masterProductId, storeId, error)
```

### Merge Logic (Step 5 in Detail)

```java
// Master product's flat attribute list
List<MasterAttribute> attributes = masterProductData.getAttributes();

// Inject channelData fields as channel-specific attributes
channelData.forEach((fieldName, value) -> {
    // Check if field already exists (override) or is new (add)
    Optional<MasterAttribute> existing = attributes.stream()
            .filter(a -> a.getMstrAttrName().equalsIgnoreCase(fieldName))
            .findFirst();

    if (existing.isPresent()) {
        existing.get().setMstrAttrValue(String.valueOf(value));
        existing.get().setIsChannelField(true);
    } else {
        attributes.add(MasterAttribute.builder()
                .attrId("ch_" + fieldName)
                .mstrAttrName(fieldName)
                .mstrAttrValue(String.valueOf(value))
                .isChannelField(true)
                .build());
    }
});

// Apply variant overrides on top of each variant
for (VariantGroup variant : masterProductData.getVariantGroups()) {
    String sku = getSkuFromVariant(variant);
    Map<String, Object> overrides = variantOverrides.getOrDefault(sku, Map.of());
    overrides.forEach((fieldName, value) -> {
        // inject into variant's attribute list
        variant.getAttributes().add(
            VariantAttribute.builder()
                .vrntId("ch_" + fieldName)
                .chnlVrntName(fieldName)
                .chnlVrntValue(String.valueOf(value))
                .build());
    });
}
```

---

## Wizard State Management

### Persistent State (MongoDB)

```
wizard_state (optional — can be derived from MasterProduct + ChannelProductData)
  _id:             ObjectId
  masterProductId: "prod_abc123"
  organizationId:  "org_123"
  currentStep:     2
  step1CompletedAt: "2026-02-21T09:00:00"
  step2CompletedAt: null
  step3CompletedAt: null
```

Alternatively, the wizard state is **derived** at runtime:
- Step 1 complete = `MasterProductDocument` exists with non-null `name` and `sku`
- Step 2 complete = all `ChannelProductData` for this product are `READY`
- Step 3 complete = at least one `ChannelProductData` is `PUBLISHED`

The derived approach avoids an extra collection and is always consistent.

### Wizard State API

```
GET /api/v1/ecommerce/wizard/{masterProductId}/state
  ?organizationId=org_123

Response:
{
  "masterProductId": "prod_abc123",
  "currentStep": 2,
  "steps": {
    "step1": { "completed": true,  "completedAt": "2026-02-21T09:00:00" },
    "step2": { "completed": false, "completionByStore": {
                 "shopify-us-store": 100,
                 "wix-main-site": 60
               }},
    "step3": { "completed": false, "locked": true }
  }
}
```
