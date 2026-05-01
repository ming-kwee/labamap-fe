# API Reference — Step 3: Publish and Pattern Matching

Base path: `/labamap/api/v1`

---

## POST `/channels/publish`

Publishes a master product to a single channel store.

**Request body:** `PublishSingleRequest`
```json
{
  "masterProductId":  "prod_abc123",
  "storeId":          "shopify-us-store",
  "organizationId":   "org_123",
  "masterProductData": {
    "name": "Wireless Earbuds Pro",
    "price": 29.99,
    "sku": "WE-PRO-001"
  },
  "channelId":        "shopify",
  "fieldMappings":    [...],
  "joltSpec":         [...],
  "variantOverrides": {
    "SKU-BLACK-64GB":  { "inventory_policy": "deny", "barcode": "1234567890123" },
    "SKU-BLACK-128GB": { "inventory_policy": "continue" }
  },
  "masterOverrides": {
    "title": "Wireless Earbuds Pro — US Edition"
  },
  "dryRun": false
}
```

**`masterProductData`** is the flat source schema from `transformMasterProductToSourceSchema(masterProduct)` merged with `store.channelData`.

**`variantOverrides`** are the per-SKU field values from Step 2 variant table. The backend applies these in a post-JOLT step (BE-PUBLISH-3) so channel-specific variant fields are always present in the final payload even if not in the JOLT spec.

**`dryRun: true`** runs the full pipeline (JOLT, post-processing, validation) but does not call the channel's API. Use for testing.

**Response:** `StorePublishResult`
```json
{
  "storeId":     "shopify-us-store",
  "storeName":   "My Shopify US Store",
  "status":      "PUBLISHED",
  "publishedAt": "2026-04-29T10:00:00Z"
}
```

On failure:
```json
{
  "storeId":  "shopify-us-store",
  "status":   "FAILED",
  "error":    "Shopify API error: title is too long (max 255 chars)"
}
```

---

## POST `/channels/publish/batch`

Publishes a master product to multiple stores in parallel.

**Request body:** `BatchPublishRequest`
```json
{
  "masterProductId": "prod_abc123",
  "organizationId":  "org_123",
  "storeIds":        ["shopify-us-store", "amazon-my", "tiktok-sg"]
}
```

**Response:** `BatchPublishResponse`
```json
{
  "results": [
    { "storeId": "shopify-us-store", "status": "PUBLISHED", "publishedAt": "..." },
    { "storeId": "amazon-my",        "status": "FAILED",    "error": "Missing required field: bullet_point" },
    { "storeId": "tiktok-sg",        "status": "PUBLISHED", "publishedAt": "..." }
  ],
  "totalPublished": 2,
  "totalFailed": 1
}
```

---

## POST `/channels/publish/analyze`

Analyzes publish readiness before committing. Does not call the channel API.

**Request body:**
```json
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-us-store",
  "organizationId":  "org_123"
}
```

**Response:** `PublishAnalysisResponse`
```json
{
  "readinessScore": 92,
  "issues": [
    {
      "stage":    "channel_data",
      "severity": "WARNING",
      "message":  "tags field has 15 entries; Shopify recommends fewer than 10"
    }
  ],
  "stageBreakdown": {
    "master_product":    "OK",
    "channel_data":      "WARNING",
    "merged_input":      "OK",
    "jolt_spec":         "OK",
    "transformation":    "OK",
    "post_processing":   "OK"
  }
}
```

---

## Publish Pipeline (Backend)

For each `storeId`-aware publish request the backend runs:

```
1.  Load ChannelStoreConnection (credentials, channelType, tokenExpiry)
2.  Load ChannelConfiguration for channelType
3.  Token refresh (GenericTokenRefreshService):
    - Compare now vs tokenExpiry[credKey] minus buffer (default 5 min)
    - If expiring: call channel's token refresh endpoint, update credentials + tokenExpiry
    - If refresh token invalid (401/403): set reconnectRequired=true, abort publish
4.  Inject decrypted credentials into publishOptions.customOptions
    (data-driven via channelConfig.integrationConfig.authentication.credentialMapping)
5.  Load channel_product_data for this product × store, merge into masterProductData:
    a. masterOverrides (lowest priority — overrides master product fields)
    b. channelData (higher priority — channel-specific values like vendor, product_type)
    c. variantOverrides[sku] — per-SKU fields merged onto each variant map
    DB-loaded variantOverrides are the base; any request-level overrides win per SKU.
6.  Inject _productTypeVariantDimensions into masterProductData:
    Ordered list of {attributeCode, attributeName, order, required} from ProductType.
    Also injects _productTypeName. Fire-and-forget on error.
    JOLT specs read this key to build per-channel variant payloads in the correct axis order.
7.  Apply JOLT transformation spec
    Priority: channel_jolt_specs collection (category-aware, org-specific > system default)
              → request.joltSpec as fallback
8.  Apply postProcessingRules (FOR_EACH, EXTRACT_DIMENSIONS, UNWRAP_FIELD, etc.)
9.  Post-JOLT variant override merge (BE-PUBLISH-3):
    For each SKU in variantOverrides:
      Find the matching variant node in the output (top-level or one level deep, e.g. product.variants)
      Merge non-null fields from variantOverrides[sku] onto the variant node.
    Channel-specific variant fields (barcode, inventory_policy, etc.) that are not in the
    JOLT spec reach the channel API through this step.
10. Wrap payload if not already nested under root key (apiWrapperConfig.rootKey)
11. Convert to SyncChannelProductRequest via ChannelAttributeConverterService
    (builds channelAttributes, variantGroups, optionGroups, metadataGroups, channelCredentials)
12. Call Sync API: POST localhost:9000/sync_channel_product_impl
13. Update channel_product_data.status = PUBLISHED / FAILED
```

**Merge priority (lowest → highest):**
```
masterProduct  <  masterOverrides  <  channelData  <  variantOverrides[sku]
```

`dryRun: true` runs steps 1–10 and returns the transformed payload, skipping steps 11–13.

---

## Adaptive Pattern Matching

Step 3 calls the Adaptive Pattern Matching engine to generate field mappings and a JOLT spec before publishing. The full engine is documented in [06-adaptive-pattern-matching](../../06-adaptive-pattern-matching/02-api-reference/01-pattern-matching.md).

**Endpoint:** `POST /api/v1/adaptive-pattern-matching/analyze`

For the Step 3 use case, the key fields are:

```json
{
  "sourceSchema":    { ...flat master product fields },
  "targetSchema":    { ...from GET /channels/{channelId}/schema/complex?format=nested },
  "channelId":       "shopify",
  "categoryId":      "clothing",
  "persistJolt":     true,
  "confidenceThreshold": 70.0
}
```

The response `joltSpec` is passed as `PublishSingleRequest.joltSpec` in the publish call. If `persistJolt=true` and confidence exceeds the threshold, the JOLT is saved to `channel_jolt_specs` for the fast path on subsequent publishes.

**Channel schema for targetSchema:**
`GET /api/v1/channels/{channelId}/schema/complex?format=nested` — see [02-channel-schema.md](../../06-adaptive-pattern-matching/02-api-reference/02-channel-schema.md).

**Not yet implemented (services exist, no controller endpoint):**
- `POST /channels/publish/analyze` — `PublishAnalysisService` is complete but not exposed
- `POST /channels/preview-jolt` — no controller endpoint exists

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts

interface PublishSingleRequest {
  masterProductId:   string;
  storeId:           string;
  organizationId:    string;
  masterProductData?: Record<string, unknown>;
  channelId?:        string;
  fieldMappings?:    unknown[];
  joltSpec?:         unknown[];
  variantOverrides?: Record<string, Record<string, unknown>>;
  masterOverrides?:  Record<string, unknown>;
  dryRun?:           boolean;
}

interface StorePublishResult {
  storeId:      string;
  storeName?:   string;
  status:       "PUBLISHED" | "FAILED";
  publishedAt?: string;
  error?:       string;
}

interface BatchPublishRequest {
  masterProductId: string;
  organizationId:  string;
  storeIds:        string[];
}

interface BatchPublishResponse {
  results:        StorePublishResult[];
  totalPublished: number;
  totalFailed:    number;
}
```

```typescript
// src/modules/ecommerce-product-v2/types/channel-mapping.ts
// See 06-adaptive-pattern-matching for full APM types.

type MatchStrategy =
  | 'CHANNEL_SPECIFIC'
  | 'SEMANTIC_KNOWLEDGE'
  | 'ALIAS_MAPPING'
  | 'PATTERN_MAPPING'
  | 'KEYWORD_SIMILARITY';

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
}

interface AdaptivePatternMatchingRequest {
  sourceSchema:               Record<string, unknown>;
  targetSchema:               Record<string, unknown>;
  channelId:                  string;
  categoryId?:                string;
  organizationId?:            string;
  confidenceThreshold?:       number;
  autoApprove?:               boolean;
  forceReanalyze?:            boolean;
  persistJolt?:               boolean;
  persistConfidenceThreshold?: number;
}

interface AdaptivePatternMatchingResponse {
  joltSpec:                    unknown[];
  fieldMappings:               FieldMapping[];
  overallConfidence:           number;
  status:                      'EXCELLENT' | 'GOOD' | 'POOR' | 'ERROR';
  message?:                    string;
  unmappedSourceFields:        string[];
  unmappedTargetFields:        string[];
  postProcessingHandledFields: string[];
}
```
