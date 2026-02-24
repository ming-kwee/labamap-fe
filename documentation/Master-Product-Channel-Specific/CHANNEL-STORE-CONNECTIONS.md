# Channel Store Connections

## Purpose

`channel_store_connections` stores one document per connected store instance.
An organization with 2 Shopify stores and 1 WIX site has 3 documents in this collection.

This collection answers the question: **"Which real stores does this org have connected,
and how do we authenticate with each one?"**

---

## MongoDB Document

```json
{
  "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
  "storeId": "shopify-us-store",
  "channelType": "shopify",
  "storeName": "My Shopify US Store",
  "storeUrl": "mystore.myshopify.com",
  "region": "US",
  "organizationId": "org_123",
  "credentials": {
    "accessToken": "shpat_xxxxxxxxxxxxxxxxxxxx",
    "apiKey": "abc123",
    "apiSecret": "secret456"
  },
  "isActive": true,
  "displayOrder": 1,
  "connectedAt": "2026-01-15T10:00:00",
  "lastSyncedAt": "2026-02-20T08:30:00"
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `storeId` | String | Yes | URL-safe unique identifier per org. Convention: `{channelType}-{label}`, e.g. `shopify-us-store` |
| `channelType` | String | Yes | Platform type — must match `channel_configurations.channelId` (e.g. `shopify`, `wix`, `amazon`) |
| `storeName` | String | Yes | Human-readable name shown in Step 2 tabs (e.g. "My Shopify US Store") |
| `storeUrl` | String | Yes | Store domain — used in sync API `workaction` metadata |
| `region` | String | No | Optional region label: `US`, `EU`, `APAC`, `PH`, etc. |
| `organizationId` | String | Yes | Tenant ID — all queries always filter by this |
| `credentials` | Object | Yes | Encrypted at rest. Contents vary per channel type |
| `credentials.accessToken` | String | Shopify/WIX | OAuth access token |
| `credentials.apiKey` | String | Shopify | API key |
| `credentials.apiSecret` | String | Shopify | API secret |
| `credentials.wixSiteId` | String | WIX | WIX site identifier |
| `credentials.appKey` | String | TikTok | TikTok app_key |
| `credentials.appSecret` | String | TikTok | TikTok app_secret |
| `credentials.shopCipher` | String | TikTok | TikTok shop_cipher |
| `credentials.sellerId` | String | Amazon/eBay | Marketplace seller ID |
| `isActive` | Boolean | Yes | When false, store is excluded from Step 2 tabs and publish |
| `displayOrder` | Integer | No | Tab order in Step 2 UI. Lower = leftmost tab |
| `connectedAt` | DateTime | Auto | When the store was first connected |
| `lastSyncedAt` | DateTime | Auto | Timestamp of last successful publish |

### Credentials Per Channel

```
Shopify:    { accessToken, apiKey, apiSecret }
WIX:        { accessToken, wixSiteId }
TikTok:     { appKey, appSecret, accessToken, shopCipher }
Amazon:     { sellerId, marketplaceId, accessKey, secretKey }
eBay:       { accessToken, refreshToken, siteId }
```

---

## Java Entity

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store.model.entity`
**File:** `ChannelStoreConnection.java`

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "channel_store_connections")
@CompoundIndexes({
    @CompoundIndex(name = "org_store_unique_idx",
                   def = "{'organizationId': 1, 'storeId': 1}", unique = true),
    @CompoundIndex(name = "org_channel_idx",
                   def = "{'organizationId': 1, 'channelType': 1}")
})
public class ChannelStoreConnection {

    @Id
    private String id;

    @Indexed
    private String storeId;           // e.g. "shopify-us-store"

    @Indexed
    private String channelType;       // e.g. "shopify"

    private String storeName;         // e.g. "My Shopify US Store"
    private String storeUrl;          // e.g. "mystore.myshopify.com"
    private String region;            // e.g. "US"

    @Indexed
    private String organizationId;

    // NOTE: credentials encrypted at rest via MongoDB field-level encryption
    // or application-level AES-256 before storage
    private Map<String, String> credentials;

    private Boolean isActive;
    private Integer displayOrder;

    private LocalDateTime connectedAt;
    private LocalDateTime lastSyncedAt;
}
```

---

## Repository

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store.repository`
**File:** `ChannelStoreConnectionRepository.java`

```java
public interface ChannelStoreConnectionRepository
        extends ReactiveMongoRepository<ChannelStoreConnection, String> {

    // All active stores for an org (used to build Step 2 tabs)
    Flux<ChannelStoreConnection> findByOrganizationIdAndIsActiveTrueOrderByDisplayOrderAsc(
            String organizationId);

    // All stores of a specific channel type for an org
    Flux<ChannelStoreConnection> findByOrganizationIdAndChannelTypeAndIsActiveTrue(
            String organizationId, String channelType);

    // Single store by storeId (used during publish to get credentials)
    Mono<ChannelStoreConnection> findByOrganizationIdAndStoreId(
            String organizationId, String storeId);

    // Check if a storeId is already taken within an org
    Mono<Boolean> existsByOrganizationIdAndStoreId(
            String organizationId, String storeId);
}
```

---

## Service

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store.service`
**File:** `ChannelStoreConnectionService.java`

### Key Methods

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelStoreConnectionService {

    private final ChannelStoreConnectionRepository repository;
    private final ChannelService channelService; // to validate channelType exists

    /**
     * Returns all active stores for an organization, ordered by displayOrder.
     * Used by Step 2 schema generation to build the channel tabs list.
     */
    public Flux<ChannelStoreConnection> getActiveStores(String organizationId) {
        return repository.findByOrganizationIdAndIsActiveTrueOrderByDisplayOrderAsc(
                organizationId);
    }

    /**
     * Returns all stores of a specific channel type for an organization.
     * Example: getAllShopifyStores("org_123") → [shopify-us-store, shopify-eu-store]
     */
    public Flux<ChannelStoreConnection> getStoresByChannelType(
            String organizationId, String channelType) {
        return repository.findByOrganizationIdAndChannelTypeAndIsActiveTrue(
                organizationId, channelType);
    }

    /**
     * Returns a single store by storeId.
     * Used during publish to retrieve credentials and storeUrl.
     */
    public Mono<ChannelStoreConnection> getStore(String organizationId, String storeId) {
        return repository.findByOrganizationIdAndStoreId(organizationId, storeId)
                .switchIfEmpty(Mono.error(new StoreNotFoundException(storeId)));
    }

    /**
     * Connects a new store. Validates that channelType exists in channel_configurations.
     * storeId is auto-generated if not provided: "{channelType}-{slugified storeName}"
     */
    public Mono<ChannelStoreConnection> connectStore(
            String organizationId, StoreConnectionRequest request) {
        return channelService.getChannelById(request.getChannelType())
                .switchIfEmpty(Mono.error(
                        new IllegalArgumentException("Unknown channelType: " + request.getChannelType())))
                .flatMap(channel -> {
                    String storeId = request.getStoreId() != null
                            ? request.getStoreId()
                            : generateStoreId(request.getChannelType(), request.getStoreName());

                    ChannelStoreConnection conn = ChannelStoreConnection.builder()
                            .storeId(storeId)
                            .channelType(request.getChannelType())
                            .storeName(request.getStoreName())
                            .storeUrl(request.getStoreUrl())
                            .region(request.getRegion())
                            .organizationId(organizationId)
                            .credentials(request.getCredentials())
                            .isActive(true)
                            .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 99)
                            .connectedAt(LocalDateTime.now())
                            .build();

                    return repository.save(conn);
                });
    }

    /**
     * Deactivates a store without deleting it.
     * Preserves channel_product_data history.
     */
    public Mono<ChannelStoreConnection> deactivateStore(
            String organizationId, String storeId) {
        return getStore(organizationId, storeId)
                .flatMap(store -> {
                    store.setIsActive(false);
                    return repository.save(store);
                });
    }

    private String generateStoreId(String channelType, String storeName) {
        return channelType + "-" + storeName.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }
}
```

---

## Request DTO

**File:** `StoreConnectionRequest.java`

```java
@Data
public class StoreConnectionRequest {
    private String channelType;       // Required: "shopify", "wix", etc.
    private String storeName;         // Required: "My Shopify US Store"
    private String storeUrl;          // Required: "mystore.myshopify.com"
    private String storeId;           // Optional: auto-generated if null
    private String region;            // Optional: "US", "EU"
    private Integer displayOrder;     // Optional: tab order
    private Map<String, String> credentials;  // Required: { accessToken, ... }
}
```

---

## REST API

**Controller:** `ChannelStoreController.java`
**Base URL:** `/api/v1/channel-stores`

```
GET  /api/v1/channel-stores
     ?organizationId=org_123
     → List all active stores for the org (used to populate Step 2 tabs)

GET  /api/v1/channel-stores/{storeId}
     ?organizationId=org_123
     → Get a single store (credentials are masked in response)

POST /api/v1/channel-stores
     Body: StoreConnectionRequest
     → Connect a new store

PUT  /api/v1/channel-stores/{storeId}/deactivate
     ?organizationId=org_123
     → Deactivate a store (soft delete)

PUT  /api/v1/channel-stores/{storeId}/display-order
     Body: { "displayOrder": 2 }
     → Reorder tabs in Step 2
```

### Example: List Stores Response

```json
[
  {
    "storeId": "shopify-us-store",
    "channelType": "shopify",
    "storeName": "My Shopify US Store",
    "storeUrl": "mystore.myshopify.com",
    "region": "US",
    "isActive": true,
    "displayOrder": 1,
    "credentials": {
      "accessToken": "shpat_***MASKED***",
      "apiKey": "***MASKED***"
    },
    "connectedAt": "2026-01-15T10:00:00",
    "lastSyncedAt": "2026-02-20T08:30:00"
  },
  {
    "storeId": "wix-main-site",
    "channelType": "wix",
    "storeName": "My WIX Store",
    "storeUrl": "mysite.wixsite.com/store",
    "region": null,
    "isActive": true,
    "displayOrder": 2
  }
]
```

### Example: Connect a Shopify Store

```bash
curl -X POST http://localhost:8888/labamap/api/v1/channel-stores \
  -H 'Content-Type: application/json' \
  -d '{
    "channelType": "shopify",
    "storeName": "My Shopify EU Store",
    "storeUrl": "mystore-eu.myshopify.com",
    "region": "EU",
    "displayOrder": 2,
    "credentials": {
      "accessToken": "shpat_eu_xxxx",
      "apiKey": "eukey",
      "apiSecret": "eusecret"
    }
  }'
```

---

## Integration with Publish Pipeline

When publishing, `ChannelPublishService` currently reads credentials from a hardcoded
or static source. After this module is implemented, it should:

```java
// 1. Resolve store connection → get credentials + storeUrl
ChannelStoreConnection store = storeConnectionService
    .getStore(organizationId, storeId).block();

// 2. Resolve channel config → get JOLT + postProcessing (unchanged)
ChannelConfiguration channelConfig = channelService
    .getChannelById(store.getChannelType()).block();

// 3. Use store.getCredentials() in channelCredentials[] of sync API request
// 4. Use store.getStoreUrl() in workaction metadata URLs
```

See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) Phase 4 for the exact publish
integration changes.
