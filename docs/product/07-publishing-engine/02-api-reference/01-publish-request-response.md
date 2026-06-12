# API Reference — Publish Request & Response

Base path: `/labamap/api/v1/channels/publish`

---

## POST `/channels/publish`

Publishes a master product to a single channel store.

**Request body:** `PublishProductRequest`

```json
{
  "masterProductId":   "prod_abc123",
  "masterProductData": {
    "name":     "Wireless Earbuds Pro",
    "price":    29.99,
    "sku":      "WE-PRO-001",
    "brand":    "Labamap"
  },
  "channelId":    "shopify",
  "storeId":      "shopify-us-store",
  "categoryId":   "electronics",
  "fieldMappings": [...],
  "joltSpec":     [...],
  "dryRun":       false,
  "organizationId": "org_123",
  "userId":         "user_456",
  "variantOverrides": {
    "SKU-BLACK-64GB": {
      "inventory_policy": "deny",
      "barcode":          "1234567890123"
    }
  },
  "publishOptions": {
    "skipValidation": false,
    "autoPublish":    true,
    "syncInventory":  true,
    "customOptions":  {}
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `masterProductId` | Yes | |
| `masterProductData` | Yes | Flat source schema. The `transformMasterProductToSourceSchema()` output merged with `store.channelData` |
| `channelId` | Yes (unless `storeId` provided) | Derived automatically from store when `storeId` is present |
| `storeId` | No | Store instance from `channel_store_connections`. Enables store-aware flow (credentials, Step 2 data merge, status update) |
| `categoryId` | No | Used for category-aware JOLT lookup. Defaults to `"default"` |
| `fieldMappings` | No | From APM `/analyze` response. Informational — not used directly in transformation |
| `joltSpec` | No | From APM `/analyze` response. Used only when no JOLT found in `channel_jolt_specs` |
| `dryRun` | No | `false` by default. `true` runs full pipeline but skips sync API call |
| `variantOverrides` | No | Per-SKU variant fields from Step 2. Applied post-JOLT. See gap note below. |
| `publishOptions.skipValidation` | No | Default `false` |
| `publishOptions.autoPublish` | No | Default `true` |
| `publishOptions.syncInventory` | No | Default `true` |
| `publishOptions.customOptions` | No | Injected with decrypted credentials by the store-aware flow |

**`FieldMapping` nested type:**

```json
{
  "sourcePath":         "name",
  "targetPath":         "product.title",
  "sourceFieldName":    "name",
  "targetFieldName":    "title",
  "sourceSemanticType": "PRODUCT_NAME",
  "targetSemanticType": "PRODUCT_NAME",
  "matchStrategy":      "CHANNEL_SPECIFIC",
  "confidence":         95.0,
  "sourceType":         "string",
  "targetType":         "string",
  "additionalContext":  {}
}
```

---

**Response (success):** `PublishProductResponse`

```json
{
  "success":      true,
  "publishId":    "pub_1746000000000_shopify_prod_abc123",
  "channelProductId": "8234567890123",
  "channelUrl":   "https://admin.shopify.com/products/8234567890123",
  "publishedData": { "product": { "title": "Wireless Earbuds Pro", ... } },
  "transformationApplied": {
    "fieldsTransformed": 8,
    "fieldsDropped":     2,
    "fieldsAdded":       1,
    "totalSourceFields": 12,
    "totalTargetFields": 9
  },
  "warnings":     [],
  "errors":       [],
  "publishedAt":  "2026-04-30T10:00:00",
  "syncStatus":   "COMPLETED",
  "isDryRun":     false,
  "performanceMetrics": {
    "transformationTimeMs": 45,
    "channelApiCallTimeMs": 1200,
    "totalTimeMs":          1280,
    "channelResponseTime":  "1.2s"
  }
}
```

**Response (failure, HTTP 400):**

```json
{
  "success":    false,
  "publishId":  "pub_1746000000000_shopify_prod_abc123",
  "syncStatus": "FAILED",
  "errors": [
    {
      "field":      "title",
      "errorCode":  "SHOPIFY_VALIDATION_ERROR",
      "message":    "Title is too long (max 255 characters)",
      "suggestion": "Shorten the product title"
    }
  ],
  "publishedAt": "2026-04-30T10:00:00"
}
```

**Response (dry run, HTTP 200):**

```json
{
  "success":      true,
  "publishId":    "pub_1746000000000_shopify_prod_abc123",
  "publishedData": { "product": { "title": "Wireless Earbuds Pro", ... } },
  "syncStatus":   "DRY_RUN",
  "isDryRun":     true,
  "warnings":     ["DRY RUN MODE - Product was transformed but NOT published to channel"]
}
```

`syncStatus` values: `"COMPLETED"`, `"FAILED"`, `"DRY_RUN"`, `"PENDING"`.

---

## POST `/channels/publish/batch`

Publishes a master product to multiple stores in parallel (`Flux.merge`).

**Request body:**

```json
{
  "masterProductId":   "prod_abc123",
  "masterProductData": { ... },
  "storeIds":          ["shopify-us-store", "wix-main-site"],
  "organizationId":    "org_123",
  "dryRun":            false
}
```

`masterProductId` and `storeIds` are required; returns 400 if either is missing or empty.

**Response:**

```json
{
  "masterProductId": "prod_abc123",
  "allSuccess":      false,
  "results": [
    {
      "storeId":         "shopify-us-store",
      "success":         true,
      "publishId":       "pub_1746000000000_shopify_prod_abc123",
      "syncStatus":      "COMPLETED",
      "channelProductId": "8234567890123"
    },
    {
      "storeId":    "wix-main-site",
      "success":    false,
      "publishId":  "pub_1746000000001_wix_prod_abc123",
      "syncStatus": "FAILED",
      "error":      "Missing required field: vendor"
    }
  ]
}
```

Note: the batch endpoint uses `Map<String, Object>` for request and response — a looser shape than the single-store endpoint. Each per-store publish runs independently via the same `publishProduct()` pipeline.

---

## GET `/channels/publish/health`

Returns service health status.

```json
{
  "status":    "UP",
  "service":   "ChannelPublishService",
  "timestamp": "2026-04-30T10:00:00",
  "features":  ["JOLT Transformation", "API Wrapper", "Dry Run Mode", "Multi-channel Support"],
  "supportedChannels": ["shopify", "amazon", "walmart", "ebay"]
}
```

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step3-publish/types/publish.ts

interface FieldMapping {
  sourcePath:          string;
  targetPath:          string;
  sourceFieldName:     string;
  targetFieldName:     string;
  sourceSemanticType?: string;
  targetSemanticType?: string;
  matchStrategy:       MatchStrategy;
  confidence:          number;
  sourceType?:         string;
  targetType?:         string;
  additionalContext?:  Record<string, unknown>;
}

type MatchStrategy =
  | 'CHANNEL_SPECIFIC'
  | 'SEMANTIC_KNOWLEDGE'
  | 'ALIAS_MAPPING'
  | 'PATTERN_MAPPING'
  | 'KEYWORD_SIMILARITY';

interface PublishOptions {
  skipValidation?: boolean;  // default false
  autoPublish?:    boolean;  // default true
  syncInventory?:  boolean;  // default true
  customOptions?:  Record<string, unknown>;
}

interface PublishProductRequest {
  masterProductId:   string;
  masterProductData: Record<string, unknown>;
  channelId?:        string;
  storeId?:          string;
  categoryId?:       string;
  fieldMappings?:    FieldMapping[];
  joltSpec?:         unknown[];
  dryRun?:           boolean;
  organizationId?:   string;
  userId?:           string;
  variantOverrides?: Record<string, Record<string, unknown>>;
  publishOptions?:   PublishOptions;
}

interface TransformationInfo {
  fieldsTransformed: number;
  fieldsDropped:     number;
  fieldsAdded:       number;
  totalSourceFields: number;
  totalTargetFields: number;
}

interface PublishError {
  field:       string;
  errorCode:   string;
  message:     string;
  suggestion?: string;
}

interface PerformanceMetrics {
  transformationTimeMs: number;
  channelApiCallTimeMs: number;
  totalTimeMs:          number;
  channelResponseTime:  string;
}

interface PublishProductResponse {
  success:               boolean;
  publishId:             string;
  channelProductId?:     string;
  channelUrl?:           string;
  publishedData?:        Record<string, unknown>;
  transformationApplied?: TransformationInfo;
  warnings:              string[];
  errors:                PublishError[];
  publishedAt:           string;  // ISO LocalDateTime
  syncStatus:            'COMPLETED' | 'FAILED' | 'DRY_RUN' | 'PENDING';
  isDryRun?:             boolean;
  performanceMetrics?:   PerformanceMetrics;
}

interface BatchPublishRequest {
  masterProductId:   string;
  masterProductData?: Record<string, unknown>;
  storeIds:          string[];
  organizationId?:   string;
  dryRun?:           boolean;
}

interface BatchPublishResult {
  storeId:          string;
  success:          boolean;
  publishId?:       string;
  syncStatus?:      string;
  channelProductId?: string;
  error?:           string;
}

interface BatchPublishResponse {
  masterProductId: string;
  allSuccess:      boolean;
  results:         BatchPublishResult[];
}
```

---

## ⚠ Backend Gap — `variantOverrides` Apply Order for Shopify Option Values (2026-06-09)

**Status: Needs verification and possible fix.**

### Context

From Step 2, sellers now save per-variant Shopify option values in `variantOverrides`:

```json
{
  "variantOverrides": {
    "SKU-XS-BLACK": { "inventory_policy": "deny", "option1": "Black", "option2": "XS" },
    "SKU-S-BLACK":  { "inventory_policy": "deny", "option1": "Black", "option2": "S"  }
  }
}
```

The `option1` / `option2` keys must reach the sync API as `product.variants.option1` and
`product.variants.option2` per variant — the paths that the Shopify `attributeMappings.variantFields`
pre-registers as `product@variants@option1` and `product@variants@option2`.

### The ambiguity: "applied post-JOLT" — before or after `buildVariantGroups`?

| Apply timing | Effect |
|---|---|
| **Before** `buildVariantGroups` | `variantOverrides` patch `productData.variants[n].option1` in-place; the pre-registered mapping emits `product.variants.option1 = "Black"` correctly in Pass 1 — **no code change needed** |
| **After** `buildVariantGroups` | The sync request's `ChannelVariant` entries for `product.variants.option1` already contain the JOLT-derived value; the variantOverride value is ignored unless there is explicit patching logic — **code change required** |

### Action required

1. Locate `ChannelPublishService.publishProduct()` and find where `variantOverrides` are applied.
2. If applied **before** `buildVariantGroups` (i.e., merged into `productData.variants` first) — no change needed; passthrough or pre-registered mapping handles it.
3. If applied **after** — add a patch step in `ChannelAttributeConverterService.buildVariantGroups()` that updates existing `ChannelVariant.chnlVrntValue` for matching `chnlVrntName`, or adds a new passthrough entry if the field is not pre-registered:

```java
// After Pass 1 + Pass 2 complete, apply variantOverrides as a patch pass:
for (Map.Entry<String, Map<String, Object>> overrideEntry : variantOverrides.entrySet()) {
    String sku = overrideEntry.getKey();
    variantGroups.stream()
        .filter(vg -> sku.equals(vg.getSku()))
        .findFirst()
        .ifPresent(vg -> overrideEntry.getValue().forEach((fieldName, value) -> {
            String targetPath = "product.variants." + fieldName;
            vg.getChannelVariant().stream()
                .filter(cv -> targetPath.equals(cv.getChnlVrntName()))
                .findFirst()
                .ifPresentOrElse(
                    cv  -> cv.setChnlVrntValue(String.valueOf(value)),
                    ()  -> vg.addPassthrough(fieldName, value, "TEXT")
                );
        }));
}
```

### Why this matters specifically for option values

`inventory_policy`, `barcode` etc. in `variantOverrides` worked before this gap was identified
because they were likely passthrough (not pre-registered). `option1`/`option2` ARE pre-registered
(`product@variants@option1` → `vrntId: "color"`), so they go through Pass 1. If the
variantOverride value doesn't patch the pre-registered entry, the JOLT-derived color value (from
the master product's `color` field) would be published instead of the seller's explicit selection.

### Affected files

`channel/service/ChannelPublishService.java` — verify apply order.
`channel/service/ChannelAttributeConverterService.java` — add patch pass if needed.
