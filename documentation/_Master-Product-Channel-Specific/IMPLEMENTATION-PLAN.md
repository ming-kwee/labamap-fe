# Implementation Plan — Channel Stores & Channel-Specific Fields

## Overview

This plan is split into 4 independent phases. Each phase can be reviewed and tested
before starting the next. Phases 1–3 add new code only; Phase 4 modifies the existing
publish pipeline.

**Total new files: ~14**
**Modified existing files: ~3**
**Zero changes to: `channel_configurations`, JOLT specs, post-processing engine**

---

## Phase 1: Channel Store Connections

**Goal:** Store and retrieve connected store instances per organization.

### New Package Structure

```
src/main/java/com/labamap/labamapomnichannelbe4fe/channel/store/
    model/
        entity/
            ChannelStoreConnection.java
        dto/
            ChannelStoreConnectionResponse.java
            StoreConnectionRequest.java
    repository/
        ChannelStoreConnectionRepository.java
    service/
        ChannelStoreConnectionService.java
    controller/
        ChannelStoreController.java
```

### File 1: `ChannelStoreConnection.java`

Full entity as documented in CHANNEL-STORE-CONNECTIONS.md.

Key points:
- `@Document(collection = "channel_store_connections")`
- Compound indexes: `{organizationId, storeId}` UNIQUE and `{organizationId, channelType}`
- `credentials` field: `Map<String, String>` — store encrypted/masked values
- `isActive: Boolean` — soft delete; never hard delete (preserve history)

### File 2: `ChannelStoreConnectionRepository.java`

```java
public interface ChannelStoreConnectionRepository
        extends ReactiveMongoRepository<ChannelStoreConnection, String> {

    Flux<ChannelStoreConnection> findByOrganizationIdAndIsActiveTrueOrderByDisplayOrderAsc(
            String organizationId);

    Flux<ChannelStoreConnection> findByOrganizationIdAndChannelTypeAndIsActiveTrue(
            String organizationId, String channelType);

    Mono<ChannelStoreConnection> findByOrganizationIdAndStoreId(
            String organizationId, String storeId);
}
```

### File 3: `ChannelStoreConnectionService.java`

Key methods:
- `getActiveStores(orgId)` → `Flux<ChannelStoreConnection>`
- `getStoresByChannelType(orgId, channelType)` → `Flux<ChannelStoreConnection>`
- `getStore(orgId, storeId)` → `Mono<ChannelStoreConnection>`
- `connectStore(orgId, request)` → `Mono<ChannelStoreConnection>`
- `deactivateStore(orgId, storeId)` → `Mono<ChannelStoreConnection>`

### File 4: `StoreConnectionRequest.java`

```java
@Data
public class StoreConnectionRequest {
    @NotBlank private String channelType;   // "shopify", "wix", "amazon"
    @NotBlank private String storeName;     // "My Shopify US Store"
    @NotBlank private String storeUrl;      // "mystore.myshopify.com"
    private String storeId;                 // optional; auto-generated if null
    private String region;                  // "US", "EU" — optional
    private Integer displayOrder;           // optional; defaults to 99
    @NotNull private Map<String, String> credentials;
}
```

### File 5: `ChannelStoreConnectionResponse.java`

Same as entity but `credentials` values are masked to `"***MASKED***"` in the response.

### File 6: `ChannelStoreController.java`

```java
@Slf4j
@RestController
@RequestMapping("/api/v1/channel-stores")
@RequiredArgsConstructor
public class ChannelStoreController {

    private final ChannelStoreConnectionService service;

    @GetMapping
    public Mono<ResponseEntity<List<ChannelStoreConnectionResponse>>> listStores(
            @RequestParam String organizationId) { ... }

    @GetMapping("/{storeId}")
    public Mono<ResponseEntity<ChannelStoreConnectionResponse>> getStore(
            @PathVariable String storeId,
            @RequestParam String organizationId) { ... }

    @PostMapping
    public Mono<ResponseEntity<ChannelStoreConnectionResponse>> connectStore(
            @RequestParam String organizationId,
            @RequestBody StoreConnectionRequest request) { ... }

    @PutMapping("/{storeId}/deactivate")
    public Mono<ResponseEntity<Void>> deactivateStore(
            @PathVariable String storeId,
            @RequestParam String organizationId) { ... }

    @PutMapping("/{storeId}/display-order")
    public Mono<ResponseEntity<ChannelStoreConnectionResponse>> updateDisplayOrder(
            @PathVariable String storeId,
            @RequestParam String organizationId,
            @RequestBody Map<String, Integer> body) { ... }
}
```

### Phase 1 Verification

```bash
# 1. Connect a Shopify store
curl -X POST http://localhost:8888/labamap/api/v1/channel-stores \
  -H 'Content-Type: application/json' \
  -d '{
    "channelType": "shopify",
    "storeName": "My Shopify US Store",
    "storeUrl": "mystore.myshopify.com",
    "credentials": { "accessToken": "shpat_xxx" }
  }'
# → 201 with storeId: "shopify-my-shopify-us-store"

# 2. Connect a WIX store
curl -X POST http://localhost:8888/labamap/api/v1/channel-stores \
  -H 'Content-Type: application/json' \
  -d '{
    "channelType": "wix",
    "storeName": "My WIX Site",
    "storeUrl": "mysite.wixsite.com/store",
    "credentials": { "accessToken": "wix_xxx", "wixSiteId": "site_abc" }
  }'

# 3. List stores
curl "http://localhost:8888/labamap/api/v1/channel-stores?organizationId=org_123"
# → 200 with array of 2 stores, credentials masked
```

---

## Phase 2: Channel Product Data

**Goal:** Store and retrieve Step 2 form values per product per store.

### New Package Structure

```
src/main/java/com/labamap/labamapomnichannelbe4fe/ecommerce/channelproduct/
    model/
        entity/
            ChannelProductData.java
        dto/
            ChannelStepSaveRequest.java
            ChannelProductDataResponse.java
            CompletionSummaryResponse.java
    repository/
        ChannelProductDataRepository.java
    service/
        ChannelProductDataService.java
    controller/
        ChannelProductDataController.java
```

### File 1: `ChannelProductData.java`

Full entity as documented in CHANNEL-PRODUCT-DATA.md.

Key points:
- `@Document(collection = "channel_product_data")`
- `channelData: Map<String, Object>` — free map, not typed
- `variantOverrides: Map<String, Map<String, Object>>` — outer key = SKU
- `status: ChannelProductStatus` enum: DRAFT / READY / PUBLISHED / FAILED
- `completionPercentage: Integer` — calculated on every save

### File 2: `ChannelProductDataRepository.java`

```java
public interface ChannelProductDataRepository
        extends ReactiveMongoRepository<ChannelProductData, String> {

    Mono<ChannelProductData> findByMasterProductIdAndStoreId(
            String masterProductId, String storeId);

    Flux<ChannelProductData> findByMasterProductId(String masterProductId);

    Flux<ChannelProductData> findByOrganizationIdAndStatus(
            String organizationId, ChannelProductData.ChannelProductStatus status);
}
```

### File 3: `ChannelProductDataService.java`

Key methods:
- `getOrCreate(masterProductId, storeId, orgId)` → `Mono<ChannelProductData>`
- `saveChannelData(orgId, request)` → `Mono<ChannelProductData>` (upsert)
- `getAllStoreDataForProduct(masterProductId)` → `Flux<ChannelProductData>`
- `getCompletionSummary(masterProductId)` → `Mono<CompletionSummaryResponse>`
- `markPublished(masterProductId, storeId)` → `Mono<ChannelProductData>`
- `markFailed(masterProductId, storeId, error)` → `Mono<ChannelProductData>`

### File 4: `ChannelProductDataController.java`

```java
@Slf4j
@RestController
@RequestMapping("/api/v1/ecommerce/channel-product-data")
@RequiredArgsConstructor
public class ChannelProductDataController {

    @GetMapping("/{masterProductId}")
    public Mono<ResponseEntity<List<ChannelProductDataResponse>>> getAllStoreData(
            @PathVariable String masterProductId) { ... }

    @GetMapping("/{masterProductId}/{storeId}")
    public Mono<ResponseEntity<ChannelProductDataResponse>> getStoreData(
            @PathVariable String masterProductId,
            @PathVariable String storeId) { ... }

    @PostMapping("/save")
    public Mono<ResponseEntity<ChannelProductDataResponse>> save(
            @RequestParam String organizationId,
            @RequestBody ChannelStepSaveRequest request) { ... }

    @GetMapping("/{masterProductId}/completion-summary")
    public Mono<ResponseEntity<CompletionSummaryResponse>> getCompletionSummary(
            @PathVariable String masterProductId) { ... }
}
```

### Phase 2 Verification

```bash
# 1. Save Step 2 data for Shopify US
curl -X POST "http://localhost:8888/labamap/api/v1/ecommerce/channel-product-data/save?organizationId=org_123" \
  -H 'Content-Type: application/json' \
  -d '{
    "masterProductId": "prod_abc123",
    "storeId": "shopify-us-store",
    "channelType": "shopify",
    "channelData": { "vendor": "TechBrand", "product_type": "Electronics" },
    "variantOverrides": { "SKU-001": { "inventory_policy": "deny" } }
  }'
# → 200 with { status: "READY", completionPercentage: 100, readyToPublish: true }

# 2. Get completion summary
curl http://localhost:8888/labamap/api/v1/ecommerce/channel-product-data/prod_abc123/completion-summary
# → { overallReady: false, stores: [{ storeId, completionPercentage, status }] }
```

---

## Phase 3: Step 2 Schema Generation

**Goal:** Generate the Step 2 tabbed form schema from stores + channel config + attributes.

### New File: `ChannelStepSchemaService.java`

**Package:** `com.labamap.labamapomnichannelbe4fe.ecommerce.channelproduct.service`

Dependencies (all existing):
- `ChannelStoreConnectionService` (Phase 1)
- `ChannelService` (existing)
- `EcommerceMasterAttributeMongoRepository` (existing — add one query method)
- `ChannelProductDataRepository` (Phase 2)

Algorithm (full code sketch in STEP2-SCHEMA-GENERATION.md):
1. Load active stores → build one tab per store
2. For each store: parallel-load channel config + attributes + saved data
3. Classify fields into sections: required → recommended → variant_overrides → optional
4. Inject `currentValue` from saved data
5. Return `ChannelStepSchemaResponse`

### New DTO Files

```
ChannelStepSchemaResponse.java     — top-level response
ChannelStepRequest.java            — { masterProductId, organizationId }
ChannelSchemaPerStore.java         — one tab's worth of schema
ChannelFormSection.java            — one section (required/recommended/etc.)
ChannelFormField.java              — one field definition with currentValue
VariantOverrideRow.java            — one variant row in the overrides table
CompletionStats.java               — { requiredTotal, requiredFilled, ... }
```

### Modified Existing File 1: `EcommerceMasterAttributeMongoRepository.java`

Add one query method:

```java
// Find all active channel-specific attributes for a channel type
@Query("{ 'active': true, 'isChannelField': true, 'supportedChannels': { $in: [?0] } }")
Flux<EcommerceMasterAttributeDocument> findByIsChannelFieldTrueAndSupportedChannelsContaining(
        String channelType);
```

### Modified Existing File 2: `FormSchemaController.java`

Add new endpoint to the existing controller:

```java
@PostMapping("/channel-step")
public Mono<ResponseEntity<ChannelStepSchemaResponse>> generateChannelStepSchema(
        @RequestBody ChannelStepRequest request) {
    log.info("POST /api/v1/ecommerce/form-schema/channel-step for product: {}",
             request.getMasterProductId());
    return channelStepSchemaService.generateSchema(
                    request.getMasterProductId(),
                    request.getOrganizationId(),
                    request.getMasterVariants())
            .map(ResponseEntity::ok)
            .onErrorResume(e -> {
                log.error("Failed to generate channel step schema", e);
                return Mono.just(ResponseEntity.status(500).build());
            });
}
```

### Phase 3 Verification

```bash
# Generate Step 2 schema
curl -X POST http://localhost:8888/labamap/api/v1/ecommerce/form-schema/channel-step \
  -H 'Content-Type: application/json' \
  -d '{
    "masterProductId": "prod_abc123",
    "organizationId": "org_123"
  }'
# → { step: 2, channels: [ { storeId, storeName, sections: [...] } ] }
# Verify: tabs match connected stores (not channel types)
# Verify: required section has fields from channel_configurations.requiredFieldObjects
# Verify: fields have currentValue populated from previously saved channel_product_data
```

---

## Phase 4: Publish Pipeline Integration

**Goal:** Make the publish endpoint store-aware. Use `storeId` instead of `channelId`
to look up both credentials (from store connection) and transformation config (from
channel config).

### Modified Existing File 3: Publish Service

The existing publish service currently uses `channelId` (platform type) to find a
`ChannelConfiguration`. After this change:

**Locate:** The service that handles `POST /api/v1/channels/publish`. Likely
`ChannelPublishService.java` or similar in `channel/service/`.

**Before (current):**
```java
// channelId = "shopify" (the platform type)
ChannelConfiguration config = channelService.getChannelById(channelId).block();
// credentials come from config.integrationConfig or hardcoded
```

**After (new):**
```java
// storeId = "shopify-us-store" (the specific store)
ChannelStoreConnection store = storeConnectionService.getStore(orgId, storeId).block();
ChannelConfiguration config = channelService.getChannelById(store.getChannelType()).block();
ChannelProductData channelData = channelProductDataService
        .getForPublish(masterProductId, storeId, orgId).block();

// Merge channelData into masterProductData BEFORE JOLT
mergeChannelDataIntoProduct(masterProductData, channelData);

// Use store credentials in channelCredentials[]
List<ChannelCredential> credentials = buildCredentials(store.getCredentials());

// Use store.getStoreUrl() in workaction metadata URLs
```

**Publish request endpoint update:**

```
Before: POST /api/v1/channels/publish
  Body: { masterProductId, channelId }    ← channelId was platform type

After:  POST /api/v1/channels/publish
  Body: { masterProductId, storeId, organizationId }  ← storeId is store instance
```

### Merge Method

```java
private void mergeChannelDataIntoProduct(
        MasterProductData masterProductData,
        ChannelProductData channelData) {

    // 1. Inject product-level channel fields
    Map<String, Object> data = channelData.getChannelData();
    if (data != null) {
        data.forEach((fieldName, value) -> {
            masterProductData.getAttributes().stream()
                    .filter(a -> a.getMstrAttrName().equalsIgnoreCase(fieldName))
                    .findFirst()
                    .ifPresentOrElse(
                            existing -> existing.setMstrAttrValue(String.valueOf(value)),
                            () -> masterProductData.getAttributes().add(
                                    buildChannelAttribute(fieldName, value)));
        });
    }

    // 2. Apply variant-level overrides by SKU
    Map<String, Map<String, Object>> overrides = channelData.getVariantOverrides();
    if (overrides != null && !overrides.isEmpty()) {
        for (VariantGroup variant : masterProductData.getVariantGroups()) {
            String sku = extractSku(variant);
            Map<String, Object> variantOverride = overrides.get(sku);
            if (variantOverride != null) {
                variantOverride.forEach((fieldName, value) ->
                        variant.getAttributes().add(
                                buildVariantAttribute(fieldName, value)));
            }
        }
    }
}
```

### Batch Publish

For "Publish All" (Step 3), publish each store independently using `Flux.merge`:

```java
public Mono<BatchPublishResponse> publishBatch(
        String masterProductId,
        List<String> storeIds,
        String organizationId) {

    List<Mono<StorePublishResult>> publishOps = storeIds.stream()
            .map(storeId -> publishToStore(masterProductId, storeId, organizationId)
                    .map(result -> StorePublishResult.success(storeId))
                    .onErrorResume(e -> Mono.just(StorePublishResult.failure(storeId, e.getMessage()))))
            .toList();

    return Flux.merge(publishOps)          // parallel publish
            .collectList()
            .map(results -> BatchPublishResponse.builder()
                    .masterProductId(masterProductId)
                    .results(results)
                    .build());
}
```

### Phase 4 Verification

```bash
# Publish to a specific store (not channel type)
curl -X POST http://localhost:8888/labamap/api/v1/channels/publish \
  -H 'Content-Type: application/json' \
  -d '{
    "masterProductId": "prod_abc123",
    "storeId": "shopify-us-store",
    "organizationId": "org_123"
  }'
# → verify: credentials in sync API request come from store_connections
# → verify: JOLT spec still comes from channel_configurations("shopify")
# → verify: channelData fields appear in channelAttributes of sync request
# → verify: channel_product_data.status becomes "PUBLISHED"
# → verify: existing WIX publish still works (no regression)
```

---

## Dependency Graph

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 4
(stores)    (data)       (schema)     (publish)
   ↓            ↓            ↓
 No deps    Needs P1     Needs P1+P2   Needs P1+P2
```

Phases 1 and 2 are fully independent of each other and can be developed in parallel.
Phase 3 requires Phase 1 (for store list) and Phase 2 (for currentValue injection).
Phase 4 requires Phase 1 (for credentials) and Phase 2 (for channel data merge).

---

## MongoDB Index Setup

Run after Phase 1 and Phase 2 deployment:

```javascript
// channel_store_connections
db.channel_store_connections.createIndex(
  { organizationId: 1, storeId: 1 }, { unique: true }
)
db.channel_store_connections.createIndex(
  { organizationId: 1, channelType: 1 }
)

// channel_product_data
db.channel_product_data.createIndex(
  { masterProductId: 1, storeId: 1 }, { unique: true }
)
db.channel_product_data.createIndex(
  { organizationId: 1, status: 1 }
)
db.channel_product_data.createIndex(
  { masterProductId: 1, channelType: 1 }
)
```

---

## What Does NOT Change

| Component | Status | Reason |
|-----------|--------|--------|
| `channel_configurations` | Unchanged | Still per channel type — transformation contract |
| JOLT specs | Unchanged | Same transform for all Shopify stores |
| `postProcessingRules` | Unchanged | Same pipeline for all Shopify stores |
| `GenericPostProcessingEngine` | Unchanged | Engine is data-driven; no store concept needed |
| `EcommerceMasterAttributeDocument` | Unchanged | `supportedChannels[]` uses channelType, not storeId |
| `DataDrivenSchemaGenerationService` | Unchanged | Handles Step 1 (master product form) only |
| `DynamicFormSchema` | Unchanged | Step 1 schema DTO — reuse for channel fields too |
| Sync API format | Unchanged | `sync_channel_product_impl` contract unchanged |
