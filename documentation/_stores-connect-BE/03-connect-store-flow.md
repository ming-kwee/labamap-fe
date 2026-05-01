# Connect Store — End-to-End Flow

## Request Payload

```http
POST /labamap/api/v1/channel-stores?organizationId=org_123
Content-Type: application/json

{
  "channelType": "shopify",
  "storeName": "My Brand US Store",
  "storeUrl": "my-brand.myshopify.com",
  "region": "US",
  "displayOrder": 1,
  "credentials": {
    "accessToken": "shpat_xxxxxxxxxxxx",
    "apiKey":      "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "apiSecret":   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

## Service Flow

```
POST /api/v1/channel-stores
    │
    ▼ ChannelStoreController.connectStore()
    │
    ▼ ChannelStoreConnectionService.connectStore()
    │
    ├─ 1. channelService.getChannelById(channelType)
    │       → 400 if unknown channelType
    │
    ├─ 2. repository.existsByOrganizationIdAndChannelTypeAndStoreUrl(...)
    │       → 409 DuplicateStoreException if already connected
    │
    ├─ 3. encryptionService.encryptAll(credentials)
    │       → AES-256-GCM encrypt each credential value
    │
    ├─ 4. Build ChannelStoreConnection entity
    │       storeId = channelType + "-" + slug(storeName)
    │       (or use request.storeId if provided)
    │
    ├─ 5. repository.save(connection)
    │       → Saved to channel_store_connections
    │
    └─ 6. ChannelStoreConnectionResponse.from(entity)
            → maskAll(credentials) → "***MASKED***"
            → 201 Created
```

## Response

```json
{
  "id": "66b1a2c3d4e5f6g7h8i9j0k1",
  "storeId": "shopify-my-brand-us-store",
  "channelType": "shopify",
  "storeName": "My Brand US Store",
  "storeUrl": "my-brand.myshopify.com",
  "region": "US",
  "organizationId": "org_123",
  "credentials": {
    "accessToken": "***MASKED***",
    "apiKey":      "***MASKED***",
    "apiSecret":   "***MASKED***"
  },
  "isActive": true,
  "displayOrder": 1,
  "connectedAt": "2026-02-25T10:00:00",
  "lastSyncedAt": null
}
```

## Error Responses

| HTTP | Error | Cause |
|------|-------|-------|
| `400 Bad Request` | Unknown channelType | `channelType` not registered in `channel_configurations` |
| `409 Conflict` | DuplicateStoreException | Same `organizationId + channelType + storeUrl` already active |

## Credential Fields by Channel

| Channel | Required Credential Keys |
|---------|--------------------------|
| shopify | `accessToken`, `apiKey`, `apiSecret` |
| wix | `accessToken`, `wixSiteId` |
| amazon | `sellerId`, `marketplaceId`, `accessKey`, `secretKey` |
| ebay | `accessToken`, `refreshToken`, `siteId` |
| tiktokshop | `appKey`, `appSecret`, `accessToken`, `shopCipher` |
| lazada | `accessToken`, `appKey`, `appSecret` |
| tokopedia | `accessToken`, `shopId` |
| shopee | `accessToken`, `shopId`, `partnerId`, `partnerKey` |
| facebook | `accessToken`, `catalogId` |
| walmart | `clientId`, `clientSecret` |

## Rotating Credentials (Token Refresh)

When a marketplace token expires, update without deactivating the store:

```http
PATCH /labamap/api/v1/channel-stores/{storeId}/credentials?organizationId=org_123
Content-Type: application/json

{
  "accessToken": "shpat_new_rotated_token",
  "apiKey":      "same_key",
  "apiSecret":   "same_secret"
}
```

The new credentials are encrypted and saved. The `storeId`, `storeName`, and all other fields remain unchanged.

## Using Credentials Internally (Publish Pipeline)

When the publishing pipeline needs to call a marketplace API:

```java
// ChannelPublishService — load decrypted credentials for the target store
encryptionService.decryptAll(store.getCredentials())
// Returns: { "accessToken": "shpat_real_token", ... }
```

These decrypted values are placed into `publishOptions.customOptions` and consumed by `ChannelAttributeConverterService.buildChannelCredentials()`. They are never sent to the frontend.

## Multiple Stores per Channel

A merchant can connect multiple stores of the same channel type (e.g., separate regional Shopify stores):

```
shopify-my-brand-us  →  my-brand-us.myshopify.com  (region: US)
shopify-my-brand-eu  →  my-brand-eu.myshopify.com  (region: EU)
shopify-my-brand-au  →  my-brand-au.myshopify.com  (region: AU)
```

Each has its own `storeId` and independent credentials. The `POST /channel-stores` call is repeated for each.
