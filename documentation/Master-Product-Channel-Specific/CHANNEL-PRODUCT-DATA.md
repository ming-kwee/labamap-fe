# Channel Product Data

## Purpose

`channel_product_data` stores the channel-specific field values the user fills in
**Step 2** of the product wizard. One document per master product per connected store.

This collection answers: **"What channel-specific data has the user entered for this
product on this specific store?"**

---

## MongoDB Document

```json
{
  "_id": "67a1b2c3d4e5f6a7b8c9d0e1",
  "masterProductId": "prod_abc123",
  "storeId": "shopify-us-store",
  "channelType": "shopify",
  "organizationId": "org_123",
  "status": "READY",
  "channelData": {
    "vendor": "TechBrand US",
    "product_type": "Electronics",
    "tags": ["electronics", "wireless", "earbuds"],
    "published_scope": "web",
    "fulfillment_service": "manual"
  },
  "variantOverrides": {
    "SKU-001": {
      "inventory_policy": "deny",
      "barcode": "1234567890123",
      "weight": 0.15,
      "weight_unit": "kg"
    },
    "SKU-002": {
      "inventory_policy": "deny",
      "barcode": "1234567890124"
    }
  },
  "completionPercentage": 100,
  "readyToPublish": true,
  "publishedAt": null,
  "publishError": null,
  "savedAt": "2026-02-21T10:00:00",
  "publishedAt": null
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `masterProductId` | String | References the master product |
| `storeId` | String | References `channel_store_connections.storeId` |
| `channelType` | String | Denormalized for efficient queries (e.g. "shopify") |
| `organizationId` | String | Tenant — always filter by this |
| `status` | Enum | `DRAFT` → `READY` → `PUBLISHED` \| `FAILED` |
| `channelData` | Map | Product-level channel values. Keys are channel field names |
| `variantOverrides` | Map | Outer key = SKU string. Inner map = variant-level channel values |
| `completionPercentage` | Integer | 0–100. Calculated from required + recommended fill rate |
| `readyToPublish` | Boolean | True when all required fields for this store are filled |
| `publishedAt` | DateTime | Set when status becomes PUBLISHED |
| `publishError` | String | Last publish error message if status = FAILED |
| `savedAt` | DateTime | Last save timestamp |

### Status Lifecycle

```
DRAFT ──────────────────────► READY ──────────────────────► PUBLISHED
  │                              │                               │
  │ (user fills required fields) │ (user clicks Publish)         │
  │                              │                               │
  │                              └──────────────────────► FAILED │
  │                                                         │    │
  └─────────────────────────────────────────────────────────┘    │
                        (user retries)                           (done)
```

Transition rules:
- `DRAFT → READY`: engine sets this when `completionPercentage` reaches 100%
  of required fields (not optional fields)
- `READY → PUBLISHED`: set by publish pipeline on success
- `READY → FAILED`: set by publish pipeline on error; `publishError` is populated
- `FAILED → READY`: allowed when user corrects data and re-saves

---

## Java Entity

**Package:** `com.labamap.labamapomnichannelbe4fe.ecommerce.channelproduct.model.entity`
**File:** `ChannelProductData.java`

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "channel_product_data")
@CompoundIndexes({
    @CompoundIndex(name = "product_store_unique_idx",
                   def = "{'masterProductId': 1, 'storeId': 1}", unique = true),
    @CompoundIndex(name = "org_status_idx",
                   def = "{'organizationId': 1, 'status': 1}"),
    @CompoundIndex(name = "product_channel_idx",
                   def = "{'masterProductId': 1, 'channelType': 1}")
})
public class ChannelProductData {

    @Id
    private String id;

    @Indexed
    private String masterProductId;

    @Indexed
    private String storeId;

    private String channelType;         // denormalized

    @Indexed
    private String organizationId;

    private ChannelProductStatus status;

    // Product-level channel-specific values
    // Keys = channel field names (e.g. "vendor", "tags", "product_type")
    private Map<String, Object> channelData;

    // Variant overrides keyed by SKU (not index — SKUs are stable)
    // e.g. { "SKU-001": { "inventory_policy": "deny", "barcode": "..." } }
    private Map<String, Map<String, Object>> variantOverrides;

    private Integer completionPercentage;
    private Boolean readyToPublish;

    private LocalDateTime publishedAt;
    private String publishError;
    private LocalDateTime savedAt;

    public enum ChannelProductStatus {
        DRAFT, READY, PUBLISHED, FAILED
    }
}
```

---

## Repository

**Package:** `com.labamap.labamapomnichannelbe4fe.ecommerce.channelproduct.repository`
**File:** `ChannelProductDataRepository.java`

```java
public interface ChannelProductDataRepository
        extends ReactiveMongoRepository<ChannelProductData, String> {

    // Load Step 2 data for a specific product + store
    Mono<ChannelProductData> findByMasterProductIdAndStoreId(
            String masterProductId, String storeId);

    // Load all store data for one product (Step 3 overview)
    Flux<ChannelProductData> findByMasterProductId(String masterProductId);

    // Load all product data for one store (bulk operations)
    Flux<ChannelProductData> findByStoreIdAndOrganizationId(
            String storeId, String organizationId);

    // Find products ready to publish for a store
    Flux<ChannelProductData> findByStoreIdAndStatus(
            String storeId, ChannelProductData.ChannelProductStatus status);

    // Find all FAILED publishes for an org (monitoring dashboard)
    Flux<ChannelProductData> findByOrganizationIdAndStatus(
            String organizationId, ChannelProductData.ChannelProductStatus status);
}
```

---

## Service

**Package:** `com.labamap.labamapomnichannelbe4fe.ecommerce.channelproduct.service`
**File:** `ChannelProductDataService.java`

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelProductDataService {

    private final ChannelProductDataRepository repository;
    private final ChannelStoreConnectionService storeConnectionService;
    private final ChannelService channelService;  // to get requiredFieldObjects

    /**
     * Load existing channel data for a product+store, or return empty DRAFT.
     * Called by Step 2 to pre-populate saved values.
     */
    public Mono<ChannelProductData> getOrCreate(
            String masterProductId, String storeId, String organizationId) {
        return repository.findByMasterProductIdAndStoreId(masterProductId, storeId)
                .switchIfEmpty(Mono.just(ChannelProductData.builder()
                        .masterProductId(masterProductId)
                        .storeId(storeId)
                        .organizationId(organizationId)
                        .status(ChannelProductData.ChannelProductStatus.DRAFT)
                        .channelData(new LinkedHashMap<>())
                        .variantOverrides(new LinkedHashMap<>())
                        .completionPercentage(0)
                        .readyToPublish(false)
                        .build()));
    }

    /**
     * Save Step 2 form values for a product+store.
     * Calculates completion percentage and readyToPublish flag.
     * Uses upsert: creates if not exists, updates if exists.
     */
    public Mono<ChannelProductData> saveChannelData(
            String organizationId, ChannelStepSaveRequest request) {

        return Mono.zip(
                storeConnectionService.getStore(organizationId, request.getStoreId()),
                channelService.getChannelById(request.getChannelType())
        ).flatMap(tuple -> {
            ChannelStoreConnection store = tuple.getT1();
            ChannelConfiguration channelConfig = tuple.getT2();

            // Calculate completion
            int completionPct = calculateCompletion(
                    request.getChannelData(), channelConfig.getRequiredFieldObjects());

            return repository.findByMasterProductIdAndStoreId(
                    request.getMasterProductId(), request.getStoreId())
                    .defaultIfEmpty(ChannelProductData.builder()
                            .masterProductId(request.getMasterProductId())
                            .storeId(request.getStoreId())
                            .channelType(store.getChannelType())
                            .organizationId(organizationId)
                            .status(ChannelProductData.ChannelProductStatus.DRAFT)
                            .build())
                    .flatMap(existing -> {
                        existing.setChannelData(request.getChannelData());
                        existing.setVariantOverrides(request.getVariantOverrides());
                        existing.setCompletionPercentage(completionPct);
                        existing.setReadyToPublish(completionPct == 100);
                        if (completionPct == 100) {
                            existing.setStatus(ChannelProductData.ChannelProductStatus.READY);
                        }
                        existing.setSavedAt(LocalDateTime.now());
                        return repository.save(existing);
                    });
        });
    }

    /**
     * Returns all store data for one product.
     * Used by Step 3 to show completion status per store.
     */
    public Flux<ChannelProductData> getAllStoreDataForProduct(String masterProductId) {
        return repository.findByMasterProductId(masterProductId);
    }

    /**
     * Called by publish pipeline to load merged data.
     * Returns channelData + variantOverrides for a specific store.
     */
    public Mono<ChannelProductData> getForPublish(
            String masterProductId, String storeId, String organizationId) {
        return repository.findByMasterProductIdAndStoreId(masterProductId, storeId)
                .filter(data -> data.getReadyToPublish() != null && data.getReadyToPublish())
                .switchIfEmpty(Mono.error(
                        new IllegalStateException("Channel data not ready for " + storeId)));
    }

    /**
     * Marks a store's product data as published. Called by publish pipeline on success.
     */
    public Mono<ChannelProductData> markPublished(String masterProductId, String storeId) {
        return repository.findByMasterProductIdAndStoreId(masterProductId, storeId)
                .flatMap(data -> {
                    data.setStatus(ChannelProductData.ChannelProductStatus.PUBLISHED);
                    data.setPublishedAt(LocalDateTime.now());
                    data.setPublishError(null);
                    return repository.save(data);
                });
    }

    /**
     * Marks a store's product data as failed. Called by publish pipeline on error.
     */
    public Mono<ChannelProductData> markFailed(
            String masterProductId, String storeId, String errorMessage) {
        return repository.findByMasterProductIdAndStoreId(masterProductId, storeId)
                .flatMap(data -> {
                    data.setStatus(ChannelProductData.ChannelProductStatus.FAILED);
                    data.setPublishError(errorMessage);
                    return repository.save(data);
                });
    }

    private int calculateCompletion(
            Map<String, Object> channelData,
            List<ChannelConfiguration.RequiredField> requiredFields) {
        if (requiredFields == null || requiredFields.isEmpty()) return 100;

        long filled = requiredFields.stream()
                .filter(f -> channelData.containsKey(f.getFieldName())
                        && channelData.get(f.getFieldName()) != null
                        && !channelData.get(f.getFieldName()).toString().isBlank())
                .count();

        return (int) ((filled * 100) / requiredFields.size());
    }
}
```

---

## Request DTO

**File:** `ChannelStepSaveRequest.java`

```java
@Data
public class ChannelStepSaveRequest {
    private String masterProductId;           // Required
    private String storeId;                   // Required: "shopify-us-store"
    private String channelType;               // Required: "shopify"
    private Map<String, Object> channelData;  // Product-level channel values
    private Map<String, Map<String, Object>> variantOverrides; // keyed by SKU
}
```

---

## REST API

**Controller:** `ChannelProductDataController.java`
**Base URL:** `/api/v1/ecommerce/channel-product-data`

```
GET  /api/v1/ecommerce/channel-product-data/{masterProductId}
     → All store data for this product (Step 3 overview)
     Response: [ { storeId, channelType, status, completionPercentage, ... } ]

GET  /api/v1/ecommerce/channel-product-data/{masterProductId}/{storeId}
     → Single store data (pre-populate Step 2 form)
     Response: { storeId, channelData, variantOverrides, completionPercentage }

POST /api/v1/ecommerce/channel-product-data/save
     Body: ChannelStepSaveRequest
     → Upsert channel-specific values for one product+store
     Response: { status, completionPercentage, readyToPublish }

GET  /api/v1/ecommerce/channel-product-data/{masterProductId}/completion-summary
     → Completion status across all stores (Step 2 progress bar)
     Response: {
       "overallReady": false,
       "stores": [
         { "storeId": "shopify-us-store", "storeName": "My Shopify US",
           "completionPercentage": 100, "status": "READY" },
         { "storeId": "wix-main-site",    "storeName": "My WIX Store",
           "completionPercentage": 60,  "status": "DRAFT" }
       ]
     }
```

### Example: Save Step 2 Data

```bash
curl -X POST http://localhost:8888/labamap/api/v1/ecommerce/channel-product-data/save \
  -H 'Content-Type: application/json' \
  -d '{
    "masterProductId": "prod_abc123",
    "storeId": "shopify-us-store",
    "channelType": "shopify",
    "channelData": {
      "vendor": "TechBrand US",
      "product_type": "Electronics",
      "tags": ["electronics", "gadget"],
      "published_scope": "web"
    },
    "variantOverrides": {
      "SKU-001": { "inventory_policy": "deny", "barcode": "1234567890" },
      "SKU-002": { "inventory_policy": "deny", "barcode": "1234567891" }
    }
  }'
```

Response:
```json
{
  "storeId": "shopify-us-store",
  "status": "READY",
  "completionPercentage": 100,
  "readyToPublish": true,
  "savedAt": "2026-02-21T10:00:00"
}
```
