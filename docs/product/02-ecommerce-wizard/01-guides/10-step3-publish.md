# Step 3 — Publish

## What This Step Does

Step 3 is the final stage of the product wizard. It shows per-store preview cards with readiness scores, effective field values (master vs channel override), and publish buttons. Sellers can publish to individual stores or batch-publish to all at once.

```
/products/{masterProductId}/publish
      │
      ├─ Shopify Store A   — readiness 92%  [Analyze] [Publish]
      ├─ Amazon Malaysia   — readiness 74%  [Analyze] [Publish]
      └─ TikTok Shop       — readiness 100% [Analyze] [Publish]
                                               [Publish All]
```

---

## Data Loading

On mount, `PublishDashboard` loads two sources in parallel:

| Source | How | Purpose |
|--------|-----|---------|
| Master product | `sessionStorage["product_{masterProductId}"]` | Product fields (written by Step 1) |
| Channel data | `GET /channel-product-data/{masterProductId}` | All stores' saved Step 2 values |

---

## Per-Store Preview Cards

Each store card shows:
- **Channel type badge** (color-coded)
- **Readiness score** — percentage of required fields filled
- **Status indicator** — DRAFT / READY / PUBLISHED / FAILED
- **Effective values** — shows whether each field is from the master product or a channel override from Step 2
- **Publish Readiness panel** — Adaptive Pattern Matching analysis (expandable)
- **JOLT Preview panel** — raw transformation output (expandable, for power users)

### Effective value display

```
Price        $29.99     ✏ Overridden      ← Step 2 master_overrides value
Name         Blue Widget  master           ← From master product
SKU          BW-001       master
```

Fields not overridden in Step 2 fall back to the master product automatically — no duplication.

---

## Readiness Analysis

Before enabling the publish button (or on user request), the dashboard calls:

```
POST /api/v1/channels/publish/analyze
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-01",
  "organizationId":  "org_123"
}
```

Response (`PublishAnalysisResponse`) includes:
- `readinessScore` — 0–100
- `issues` — array of `AnalysisIssue` with severity: `ERROR | WARNING | INFO`
- Stage-by-stage breakdown: master product → channel data → merged input → JOLT spec → transformation → post-processing

---

## Adaptive Pattern Matching (5-Tier Cascade)

The dashboard uses pattern matching to analyze how master product fields map to the channel's schema:

| Tier | Method | Description |
|------|--------|-------------|
| 1 | Knowledge-Based | Hard-coded platform rules (e.g. Shopify `title` ← `name`) |
| 2 | Semantic | Embedding similarity between field labels |
| 3 | Similarity | Fuzzy string matching on field names |
| 4 | Pattern | Regex / structural pattern rules |
| 5 | Boost | Confidence boosts from historical publish data |

```typescript
import { analyzePatternMatching, generateMappingRequest } from '@/modules/ecommerce-product-v2/services/pattern-matching.service';

const request = await generateMappingRequest(masterProduct, "shopify");
const analysis = await analyzePatternMatching(request);
// → { fieldMappings, joltSpec, confidence, ... }
```

The JOLT spec from this analysis is passed to the publish call as `PublishSingleRequest.joltSpec`.

---

## Backend Publish Pipeline

When `storeId` is present, the backend runs the following steps:

```
1. Load ChannelStoreConnection (credentials, channelType)
2. Load ChannelConfiguration for channelType
3. Refresh token if needed (GenericTokenRefreshService checks tokenExpiry;
   calls channel's token endpoint if expiring within buffer window)
4. Inject decrypted credentials into publish options
   (data-driven via channelConfig.credentialMapping)
5. Load Step 2 data from channel_product_data and merge into masterProductData:
   a. Apply masterOverrides (lowest priority)
   b. Apply channelData (overrides master values)
   c. Apply variantOverrides[sku] onto each variant in masterProductData
6. Inject _productTypeVariantDimensions into masterProductData
   (ordered list of variant dimensions from ProductType; used by JOLT specs
    to build per-channel variant payloads in the correct axis order)
7. Apply JOLT transformation
   (category-aware: channel_jolt_specs collection → request.joltSpec as fallback)
8. Apply postProcessingRules (FOR_EACH, EXTRACT_DIMENSIONS, etc.)
9. Post-JOLT variant override merge (BE-PUBLISH-3):
   For each SKU in variantOverrides, inject remaining channel-specific variant
   fields (barcode, inventory_policy, etc.) directly onto the output variant nodes
10. Wrap payload if not already nested (apiWrapperConfig)
11. Call Sync API (localhost:9000/sync_channel_product_impl)
12. Update channel_product_data.status = PUBLISHED / FAILED
```

**Merge priority (lowest → highest):**
```
masterProduct  <  masterOverrides  <  channelData  <  variantOverrides[sku]
```

---

## Publishing

### Single store

```
POST /api/v1/channels/publish
{
  "masterProductId":  "prod_abc123",
  "storeId":          "shopify-01",
  "organizationId":   "org_123",
  "masterProductData": { ...flat sourceSchema },
  "channelId":        "shopify",
  "fieldMappings":    [...],        // from pattern matching
  "joltSpec":         [...],        // from pattern matching
  "variantOverrides": { "SKU-001": { "inventory_policy": "deny", ... } },
  "masterOverrides":  { "title": "Shorter title for Shopify" },
  "dryRun":           false
}
```

### Batch publish (all stores)

```
POST /api/v1/channels/publish/batch
{
  "masterProductId":  "prod_abc123",
  "organizationId":   "org_123",
  "storeIds":         ["shopify-01", "amazon-my", "tiktok-sg"]
}
```

---

## Variant Override Bug — Known Issue

Fields entered in the Step 2 variant table (barcode, inventory_policy, per-SKU price) were historically dropped during publish due to a 4-layer failure chain. The backend was fixed (layers 1–3 below); the frontend fixes are still pending:

| Layer | Location | Status |
|-------|----------|--------|
| 1 | `channelStore.ts` — `PublishSingleRequest` missing `variantOverrides` field | ⚠️ Frontend pending |
| 2 | `PublishDashboard.tsx` — `handlePublishSingle` never reads `store.variantOverrides` | ⚠️ Frontend pending |
| 3 | `PublishDashboard.tsx` — `handleAnalyze` missing `variantOverrides` in sourceSchema | ⚠️ Frontend pending |
| 4 | `product-mapper.ts` — `transformMasterProductToSourceSchema` reduces variants to a count | ⚠️ Frontend pending |
| 5 | `ChannelAttributeConverterService.java` — variant node fields not in pre-registered mapping silently dropped | ✅ Backend fixed |

Backend additionally added:
- `variantOverrides` to `PublishProductRequest` Java type (BE-PUBLISH-1)
- `loadAndMergeChannelData()` now carries `variantOverrides` from DB onto the request (BE-PUBLISH-2)
- Post-JOLT variant override merge step in `processPublish()` (BE-PUBLISH-3)

**To complete the frontend fix:** Add `variantOverrides?: Record<string, Record<string, unknown>>` to `PublishSingleRequest` in `channelStore.ts`, then read `store.variantOverrides` in `handlePublishSingle` and merge it into the publish request.

---

## UI States

| State | User sees |
|-------|-----------|
| Loading | Skeleton cards with spinner |
| Empty | "No channel data found" + link back to Step 2 |
| Ready | Preview cards with publish buttons |
| Publishing (single) | Spinner on that store's button; other buttons remain active |
| Publishing (batch) | "Publishing All…" spinner; all buttons disabled |
| Published | Card changes to PUBLISHED status (green badge) |
| Failed | Error message on card; red status badge |

---

## JOLT Preview

Sellers can expand a collapsible panel per store card to see the raw JOLT transformation output — what the final channel API payload will look like. Useful for debugging publish failures.

```typescript
import { previewJoltTransformation } from '@/modules/ecommerce-product-v2/services/pattern-matching.service';
// POST /api/v1/channels/preview-jolt
```

---

## Codebase

| File | Purpose |
|------|---------|
| `step3-publish/components/PublishDashboard.tsx` | Entire Step 3 UI — data loading, preview cards, publish actions |
| `services/pattern-matching.service.ts` | `analyzePatternMatching`, `previewJoltTransformation`, `generateMappingRequest` |
| `step2-channel-fields/services/channelStore.service.ts` | `ChannelProductDataService.getAllStoreData`, `PublishService.publishToStore`, `PublishService.publishBatch`, `PublishService.analyzePublish` |
| `step2-channel-fields/types/channelStore.ts` | `PublishSingleRequest`, `BatchPublishRequest`, `StorePublishResult`, `PublishAnalysisResponse` |
