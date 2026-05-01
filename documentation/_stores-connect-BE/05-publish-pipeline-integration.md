# Stores-Connect × Publish Pipeline Integration

## How Store Credentials Flow into Publishing

When a product is published to a specific store, the publish pipeline:
1. Loads the `ChannelStoreConnection` by `storeId`
2. Loads the `ChannelConfiguration` (system default) for the store's `channelType`
3. Calls `GenericTokenRefreshService.getValidCredentials()` — refreshes the token if expired
4. Injects decrypted credentials into `publishOptions.customOptions` using the channel config's `credentialMapping`
5. `ChannelAttributeConverterService.buildChannelCredentials()` reads from `customOptions`

```
POST /api/v1/channels/publish
{
  "masterProductId": "prod_123",
  "storeId":         "shopify-my-brand-us-store",   ← triggers store-aware flow
  "masterProductData": { ... }
}
          │
          ▼ ChannelPublishService.resolveStoreAndPublish()
          │
          ├─ ChannelStoreConnectionService.getStore(orgId, storeId)
          │
          ├─ ChannelConfigurationRepository.findSystemDefaultByChannelId(channelType)
          │
          ▼ GenericTokenRefreshService.getValidCredentials(orgId, store, channelConfig)
          │   ├─ Check tokenExpiry[accessTokenKey] vs now + bufferMinutes
          │   ├─ If expired: POST to tokenRefresh.endpoint → save new token to DB
          │   └─ Return fresh decrypted credentials
          │
          ▼ injectDecryptedCredentials(request, freshCreds, store, channelConfig)
          │   ├─ Read channelConfig.integrationConfig.authentication.credentialMapping
          │   ├─ For each (credKey → optionKey): customOptions.put(optionKey, creds.get(credKey))
          │   ├─ customOptions.put("storeId", store.getStoreId())
          │   ├─ customOptions.put("storeUrl", store.getStoreUrl())     [if present]
          │   └─ customOptions.put("credentials", decryptedCredsMap)    [passthrough]
          │
          ├─ Merge channelProductData.channelData into masterProductData
          │       (Step 2 channel-specific fields)
          │
          ├─ JOLT transform → channel payload
          │
          ├─ POST to marketplace API
          │
          └─ Update channel_product_data status → PUBLISHED / FAILED
```

---

## Data-Driven Credential Mapping

The `customOptions` key names are defined per channel in `ChannelConfiguration.IntegrationConfig.AuthenticationConfig.credentialMapping`. No hardcoded `if (channelType == "wix")` blocks exist in service code.

### Shopify

```java
credentialMapping: { "accessToken" → "token" }
```

### WIX

```java
credentialMapping: {
    "accessToken" → "token",
    "wixSiteId"   → "wix-site-id"
}
```

### TikTok Shop

```java
credentialMapping: {
    "accessToken" → "token",
    "appKey"      → "app_key",
    "appSecret"   → "app_secret",
    "shopCipher"  → "shop_cipher"
}
```

The resulting `customOptions` map is what `ChannelAttributeConverterService.buildChannelCredentials()` reads to build the `channelCredentials[]` array sent to the sync API.

---

## Fallback Behaviour

If no `ChannelConfiguration` exists for a channel type, credentials are injected without mapping (raw decrypted keys) and a warning is logged. This ensures backward compatibility with any channel not yet configured in the DataLoader.

---

## Batch Publish

```http
POST /api/v1/channels/publish/batch
{
  "masterProductId": "prod_123",
  "masterProductData": { ... },
  "targets": [
    { "channelType": "shopify", "storeId": "shopify-us" },
    { "channelType": "shopify", "storeId": "shopify-eu" },
    { "channelType": "wix",     "storeId": "wix-main"  }
  ]
}
```

Batch publish runs `Flux.merge()` across all targets in parallel. Each target independently loads its store connection, resolves credentials (with token refresh if needed), and publishes.

---

## updateLastSynced

After a successful publish, the pipeline calls:

```java
channelStoreConnectionService.updateLastSynced(organizationId, storeId)
```

This stamps `lastSyncedAt = now()` on the `ChannelStoreConnection`, which the frontend uses to show "Last synced: X minutes ago".

---

## Error Isolation

If one store in a batch publish fails, the others are not affected. Each `Flux` element is independently handled. Errors are caught per-element and returned in the batch response alongside successful results.

Token refresh failures also do not fail the publish — `GenericTokenRefreshService` falls back to stored (possibly stale) credentials and logs a warning.
