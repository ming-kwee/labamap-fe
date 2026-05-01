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
| `variantOverrides` | No | Per-SKU variant fields from Step 2. Applied post-JOLT |
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
