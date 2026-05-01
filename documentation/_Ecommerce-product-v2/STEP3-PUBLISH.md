# Step 3 — Preview & Publish

## What This Step Does

Step 3 is the final stage of the omnichannel product wizard. It shows a **per-store preview
card** with readiness scores, effective field values (master value vs channel override),
and a publish button for each store. Sellers can publish to a single store or batch-publish
to all stores at once.

```
After Step 2 (channel fields saved)
              │
              ▼
  /products/{masterProductId}/publish
              │
              ├─ Preview card: Shopify Store A  — readiness 92%  [Publish]
              ├─ Preview card: Amazon Malaysia  — readiness 74%  [Publish]
              └─ Preview card: TikTok Shop      — readiness 100% [Publish]
                                                              [Publish All]
```

---

## Location

```
src/modules/ecommerce-product-v2/step3-publish/
```

---

## Directory Structure

```
step3-publish/
└── components/
    ├── PublishDashboard.tsx  ← Top-level Step 3 UI
    └── index.ts
```

---

## Entry Point

```tsx
import PublishDashboard from '@/modules/ecommerce-product-v2/step3-publish/components/PublishDashboard';
// or via the v2 root barrel:
import { PublishDashboard } from '@/modules/ecommerce-product-v2';

// Usage — page just passes masterProductId
<PublishDashboard masterProductId={params.masterProductId} />
```

**Props**

| Prop | Type | Description |
|------|------|-------------|
| `masterProductId` | `string` | ID of the master product created in Step 1 |

---

## Data Flow

### 1. Loading Data

On mount, `PublishDashboard` calls two endpoints in parallel:

| Call | Endpoint | Purpose |
|------|----------|---------|
| `ChannelProductDataService.getAllStoreData` | `GET /channel-product-data/{masterProductId}` | All stores' saved channel data |
| Master product from sessionStorage | `sessionStorage["product_{masterProductId}"]` | Master product fields (written by Step 1) |

### 2. Per-Store Preview Cards

Each store renders a card showing:
- **Channel type badge** (color-coded, e.g. Shopify = green)
- **Readiness score** — percentage of required fields filled
- **Status indicator** — DRAFT / READY / PUBLISHED / FAILED
- **Effective values** — shows whether a field is coming from master or a channel override
- **Publish Readiness** section — Adaptive Pattern Matching tier information
- **Publish button** — publishes this store immediately

### 3. Readiness Analysis

Before enabling the publish button, the dashboard calls:

```
POST /api/v1/channels/publish/analyze
Body: { masterProductId, storeId, organizationId }
```

The response (`PublishAnalysisResponse`) includes:
- `readinessScore` — 0–100
- `issues` — array of `AnalysisIssue` with severity: `ERROR | WARNING | INFO`
- Stage-by-stage breakdown: master product, channel data, merged input, JOLT spec, transformation, post-processing

### 4. Pattern Matching (Adaptive AI Mapping)

The dashboard uses the pattern-matching service from the v2 module to analyse how master
product fields map to the channel's schema. The 5-tier cascade:

| Tier | Method | Description |
|------|--------|-------------|
| 1 | Knowledge-Based | Hard-coded platform rules (e.g. Shopify title → name) |
| 2 | Semantic | Embedding similarity between field labels |
| 3 | Similarity | Fuzzy string matching on field names |
| 4 | Pattern | Regex/structural pattern rules |
| 5 | Boost | Confidence score boosts from historical publish data |

```ts
import { analyzePatternMatching } from '@/modules/ecommerce-product-v2/services/pattern-matching.service';
```

---

## Publishing

### Single Store Publish

```
POST /api/v1/channels/publish
Body: PublishSingleRequest
```

```ts
interface PublishSingleRequest {
  masterProductId: string;
  storeId: string;
  organizationId: string;
  masterProductData?: Record<string, unknown>;  // flattened master fields
  channelId?: string;                           // "shopify", "amazon", etc.
  fieldMappings?: unknown[];                    // from pattern matching (optional)
  joltSpec?: unknown[];                         // JOLT transform (optional)
  variantOverrides?: Record<string, Record<string, unknown>>;
  masterOverrides?: Record<string, unknown>;
  dryRun?: boolean;
}
```

### Batch Publish (All Stores)

```
POST /api/v1/channels/publish/batch
Body: BatchPublishRequest
```

```ts
interface BatchPublishRequest {
  masterProductId: string;
  organizationId: string;
  storeIds: string[];  // all store IDs for this product
}
```

Returns a `BatchPublishResponse` with individual `StorePublishResult` per store.

### Publish Result

```ts
interface StorePublishResult {
  storeId: string;
  storeName?: string;
  status: "PUBLISHED" | "FAILED";
  publishedAt?: string;
  error?: string;
}
```

---

## UI States

| State | What the user sees |
|-------|--------------------|
| Loading | Skeleton cards with spinner |
| Empty | "No channel data found" — link back to Step 2 |
| Ready | Preview cards with publish buttons enabled |
| Publishing (single) | Spinner on the store's button, other buttons remain enabled |
| Publishing (batch) | "Publishing All…" spinner, all buttons disabled |
| Published | Card status changes to PUBLISHED, green badge |
| Failed | Error message on card, red status badge |

---

## Effective Value Display

Each store card shows selected master product fields alongside whether the value shown
is from the **master product** or a **channel override** (set in Step 2):

```
Price           $29.99    ✏ Overridden      ← Step 2 master_overrides value
Name            Blue Widget  master          ← From master product
SKU             BW-001    master
```

Fields not overridden fall back to the master product automatically — no duplication
of data required.

---

## JOLT Preview

Sellers can expand a collapsible panel on each store card to see the raw JOLT
transformation output (what the final channel payload will look like). This uses:

```ts
import { previewJoltTransformation } from '@/modules/ecommerce-product-v2/services/pattern-matching.service';
```

```
POST /api/v1/channels/preview-jolt
Body: { masterProductData, channelType, fieldMappings, joltSpec }
```

---

## Services Used

All services imported from within `ecommerce-product-v2`:

| Import | Purpose |
|--------|---------|
| `ChannelProductDataService.getAllStoreData` | Load all stores' channel data |
| `PublishService.publishToStore` | Single store publish |
| `PublishService.publishBatch` | Batch publish |
| `PublishService.analyzePublish` | Readiness analysis |
| `analyzePatternMatching` | AI field mapping analysis |
| `previewJoltTransformation` | JOLT output preview |
| `generateMappingRequest` | Build the `AdaptivePatternMatchingRequest` |
| `transformMasterProductToSourceSchema` | Flatten master product for JOLT |

---

## Types Reference

```ts
// Channel data types (from step2-channel-fields)
import type {
  ChannelProductData,
  ChannelProductStatus,
  StorePublishResult,
  BatchPublishRequest,
  BatchPublishResponse,
  PublishSingleRequest,
  PublishAnalysisResponse,
  AnalysisIssue,
} from '@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore';

// Master product + mapping types (from v2 root)
import type { MasterProduct } from '@/modules/ecommerce-product-v2/types/product';
import type {
  AdaptivePatternMatchingResponse,
  FieldMapping,
} from '@/modules/ecommerce-product-v2/types/channel-mapping';
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Master product from sessionStorage | Avoids a redundant GET for already-loaded data; Step 1 stores it there |
| Per-store readiness analysis on demand | Only called when user expands the analysis panel — not on page load |
| Effective value display (master vs override) | Gives the seller full transparency into what will be sent to each channel |
| Batch publish via dedicated endpoint | Backend can parallelise and track results atomically per store |
| JOLT preview collapsible | Advanced feature for power users; hidden by default to keep the UI clean |

---

## Navigation

| Action | Destination |
|--------|-------------|
| Back button | `/products/{masterProductId}/channel-fields` (Step 2) |
| Publish single | In-page feedback; no navigation |
| Publish All | In-page feedback; no navigation |
| After all published | Manual navigation (no auto-redirect yet) |
