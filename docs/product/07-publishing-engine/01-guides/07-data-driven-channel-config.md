# Data-Driven Channel Configuration — Removing Hardcoded Channel Logic

**Refactored:** 2026-06-12  
**Relates to:** `05-post-processing-config.md`, `06-variant-value-id-translation.md`

---

## Problem Statement

Before this refactoring, several service methods contained hardcoded channel-type checks:

```java
// Before — every new channel requires a code change:
private String buildChannelUrl(ChannelConfiguration channelConfig, String productId) {
    switch (channelConfig.getChannelId().toLowerCase()) {
        case "shopify": return "https://admin.shopify.com/products/%s";
        case "shopee":  return "https://seller.shopee.co.id/portal/product/edit/%s";
        // ...add new case for every new channel
    }
}

private void normalizeShopifyCategoryGid(...) {
    if (!"shopify".equalsIgnoreCase(channelId)) return; // Shopify-only
    // GID prefix hardcoded
}

private void enrichShopeePublishOptions(...) {
    if (!"shopee".equalsIgnoreCase(channelId)) return; // Shopee-only
    // API path hardcoded
}
```

The same pattern appeared in `OAuthCallbackService.resolveStoreUrl` and
`GenericCategoryService.applyShopeeHmacSigning`.

---

## Solution — Config-Driven Behaviour

All channel-specific values are now stored in MongoDB (`channel_configurations`) or
`application.yml` (`app.oauth.channels`). Adding a new channel requires **zero Java
code changes** for these functions.

---

## 1. Product Admin URL — `metadata["productAdminUrlTemplate"]`

### Where it lives
`ChannelConfiguration.metadata` — set in `ChannelConfigurationDataLoader` at startup.

### How it works
```java
// PublishResponseFactory.buildChannelUrl()  (Fase 1 dekomposisi guide 41 — sebelumnya di ChannelPublishService)
public String buildChannelUrl(ChannelConfiguration channelConfig, String productId) {
    Map<String, Object> meta = channelConfig.getMetadata();
    if (meta != null && meta.get("productAdminUrlTemplate") instanceof String template) {
        return String.format(template, productId);  // %s → productId
    }
    return String.format("https://%s.com/admin/products/%s", channelId, productId); // fallback
}
```

### Current values
| Channel | Template |
|---|---|
| shopify | `https://admin.shopify.com/products/%s` |
| amazon | `https://sellercentral.amazon.com/product/%s` |
| walmart | `https://seller.walmart.com/items/%s` |
| ebay | `https://www.ebay.com/sh/lst/active/%s` |
| wix | `https://manage.wix.com/dashboard/products/%s` |
| tiktokshop | `https://seller.tiktok.com/product/%s` |
| shopee | `https://seller.shopee.co.id/portal/product/edit/%s` |

### To add a new channel
```java
// In ChannelConfigurationDataLoader.createXxxConfiguration():
metadata.put("productAdminUrlTemplate", "https://seller.xxx.com/products/%s");
```

---

## 2. Category GID Stripping — `metadata["categoryGidPrefix"]` + `["categoryGidFieldPath"]`

### Problem
Shopify REST API 2024-01 expects `product.category` as a plain code (`aa-1-13-7`),
**not** a full GraphQL GID (`gid://shopify/TaxonomyCategory/aa-1-13-7`).

### Where it lives
`ChannelConfiguration.metadata` — set only for channels that need GID stripping.

### How it works
```java
// PublishPayloadStagingService.normalizeCategoryGid()
private void normalizeCategoryGid(ChannelConfiguration channelConfig,
                                   Map<String, Object> transformedData) {
    String prefix    = meta.get("categoryGidPrefix");    // e.g. "gid://shopify/..."
    String fieldPath = meta.get("categoryGidFieldPath"); // e.g. "product.category"
    // Navigate dot-notation path → strip prefix
}
```

### Current values (Shopify only)
```java
metadata.put("categoryGidPrefix",    "gid://shopify/TaxonomyCategory/");
metadata.put("categoryGidFieldPath", "product.category");
```

### To add a new channel with GID-style category IDs
```java
metadata.put("categoryGidPrefix",    "gid://channel/Category/");
metadata.put("categoryGidFieldPath", "data.categoryId");  // dot-notation path
```

---

## 3. Per-Request HMAC Signing for Publish — `IntegrationConfig.publishApiPath`

### Problem
Channels like Shopee require HMAC-SHA256 signing on **every** API call, including
product creation. The signature formula is:
```
sign = HMAC-SHA256(credentialId + apiPath + timestamp, platformSecret)
```
The computed `sign` + `timestamp` must reach the sync API as `customOptions` entries.

### Where it lives
`ChannelConfiguration.IntegrationConfig` — two new fields:

| Field | Type | Description |
|---|---|---|
| `publishApiPath` | `String` | API path to sign (e.g. `"/api/v2/product/add_item"`). Non-null activates signing. |
| `publishHmacSigningCredentialKey` | `String` | Credential key whose value is the signing identity (e.g. `"partnerId"` for Shopee). |

The signing **secret** always comes from `OAuthAppConfig.channels[channelType].clientSecret`
(platform-level, never stored per-store).

### How it works
```java
// PublishCredentialInjector.enrichHmacSignedPublishOptions()
private void enrichHmacSignedPublishOptions(PublishProductRequest request,
                                             ChannelConfiguration channelConfig) {
    String apiPath      = ic.getPublishApiPath();           // "/api/v2/product/add_item"
    String credKey      = ic.getPublishHmacSigningCredentialKey(); // "partnerId"
    String credentialId = creds.get(credKey);               // partner_id from store creds
    String secret       = oauthAppConfig.getChannel(channelType).getClientSecret();
    long   timestamp    = currentTimeMillis() / 1000;
    String sign         = hmacSha256Hex(credentialId + apiPath + timestamp, secret);

    opts.put("hmac_api_path",      apiPath);
    opts.put("hmac_timestamp",     timestamp);
    opts.put("hmac_sign",          sign);
    opts.put("hmac_credential_id", credentialId);
    opts.put("hmac_shop_id",       creds.get("shopId"));
}
```

The sync API reads `hmac_*` keys from `customOptions` to build the signed channel API URL:
```
POST {channelBaseUrl}{hmac_api_path}
     ?partner_id={hmac_credential_id}&shop_id={hmac_shop_id}
     &timestamp={hmac_timestamp}&sign={hmac_sign}
```

### Current values (Shopee only)
```java
// In ChannelConfigurationDataLoader.createShopeeConfiguration():
.publishApiPath("/api/v2/product/add_item")
.publishHmacSigningCredentialKey("partnerId")
```

### To enable for a new channel
```java
// In IntegrationConfig builder:
.publishApiPath("/path/to/create/product")
.publishHmacSigningCredentialKey("appId")   // whatever the channel uses as signing identity
```
No other code changes needed.

---

## 4. Generic HMAC Signing for Category API — `CategoryTreeApiConfig.hmacSigningCredentialKey`

The same HMAC signing pattern applies to category API calls (e.g. fetching Shopee
categories). `GenericCategoryService` applies signing when `authStrategy == HMAC_SHA256`.

### Config fields on `CategoryTreeApiConfig`

| Field | Default | Description |
|---|---|---|
| `hmacSigningCredentialKey` | `"partnerId"` | Credential key prepended to sign message |
| `hmacTimestampParam` | `"timestamp"` | Query param name for timestamp |
| `hmacSignParam` | `"sign"` | Query param name for signature |

### Message formula
```
message = creds[hmacSigningCredentialKey] + urlPath + timestamp
sign    = hex(HMAC-SHA256(message, OAuthAppConfig[channelType].clientSecret))
```

Override the defaults in `CategoryApiConfigDataLoader` for channels with different
signing conventions.

---

## Files Changed

| File | Change |
|---|---|
| `ChannelConfiguration.IntegrationConfig` | +`publishApiPath`, +`publishHmacSigningCredentialKey` |
| `ChannelConfigurationDataLoader` | +`productAdminUrlTemplate` (all channels), +`categoryGidPrefix`/`categoryGidFieldPath` (Shopify), +`publishApiPath`/`publishHmacSigningCredentialKey` (Shopee) |
| `ChannelPublishService` | `buildChannelUrl` → metadata (metode kini di `PublishResponseFactory`, Fase 1 dekomposisi guide 41); `normalizeShopifyCategoryGid` → `normalizeCategoryGid`; `enrichShopeePublishOptions` → `enrichHmacSignedPublishOptions`; `shopeeHmacSha256Hex` → `hmacSha256Hex` |
| `ChannelCategoryApiConfig.CategoryTreeApiConfig` | +`hmacSigningCredentialKey`, +`hmacTimestampParam`, +`hmacSignParam` |
| `GenericCategoryService` | `applyShopeeHmacSigning` → `applyHmacSha256Signing` (reads from config) |
