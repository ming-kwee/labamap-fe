# Token Refresh Reference

## GenericTokenRefreshService

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store.service`

The refresh strategy is **data-driven**: all channel-specific refresh logic lives in `ChannelConfiguration.IntegrationConfig.TokenRefreshConfig` (seeded by `ChannelConfigurationDataLoader`). There are no `if (channelType == "wix")` branches in service code.

---

## Decision Flow

Called inline from `ChannelPublishService.resolveStoreAndPublish()` before every publish:

```
getValidCredentials(orgId, store, channelConfig)
│
├─ tokenRefresh.enabled = false / null
│    └─ return decryptAll(store.credentials)                    ← Shopify path
│
├─ token still valid (expiry > now + bufferMinutes)
│    └─ return decryptAll(store.credentials)
│
├─ token expired or expiring soon
│    │
│    ├─ refreshToken.expiry < now                               ← Phase E guard
│    │    ├─ store.reconnectRequired = true
│    │    ├─ audit: RECONNECT_FLAGGED("Refresh token expired at ...")
│    │    ├─ save store
│    │    └─ return stored (stale) credentials
│    │
│    └─ call refresh endpoint
│         │
│         ├─ SUCCESS
│         │    ├─ store.reconnectRequired = false
│         │    ├─ re-encrypt + update credentials + tokenExpiry
│         │    ├─ save store
│         │    └─ audit: REFRESHED → return fresh credentials
│         │
│         └─ FAILURE
│              ├─ store.reconnectRequired = true
│              ├─ audit: REFRESH_FAILED(error message)
│              ├─ audit: RECONNECT_FLAGGED("Auto-refresh failed: ...")
│              ├─ save store
│              └─ return stored (stale) credentials
```

---

## TokenRefreshConfig (nested class)

Defined in `ChannelConfiguration.IntegrationConfig`:

```java
public static class TokenRefreshConfig {
    Boolean enabled;                     // false = skip refresh check entirely
    String endpoint;                     // OAuth token refresh URL
    String method;                       // "POST" or "GET"
    Map<String, String> requestParams;   // params with {credentials.X} placeholders
    Map<String, String> responseMapping; // credentialKey → JSON dot-path in response body
    String accessTokenKey;               // key in credentials map for access token
    String refreshTokenKey;              // key in credentials map for refresh token
    String accessTokenExpiryKey;         // key in tokenExpiry map for access token expiry
    Integer bufferMinutes;               // refresh this many minutes before actual expiry
}
```

---

## Channel Configurations

### Shopify — no refresh

```java
TokenRefreshConfig.builder()
    .enabled(false)   // Shopify access tokens are permanent
    .build()
```

### Wix — auto-refresh

```java
TokenRefreshConfig.builder()
    .enabled(true)
    .endpoint("https://www.wixapis.com/oauth2/token")
    .method("POST")
    .requestParams(Map.of(
        "grant_type",    "refresh_token",
        "client_id",     "{credentials.clientId}",
        "refresh_token", "{credentials.refreshToken}"
    ))
    .responseMapping(Map.of(
        "accessToken",  "access_token",
        "refreshToken", "refresh_token"
    ))
    .accessTokenKey("accessToken")
    .refreshTokenKey("refreshToken")
    .accessTokenExpiryKey("accessToken")
    .bufferMinutes(10)
    .build()
```

Required credentials at connect time: `accessToken`, `refreshToken`, `wixSiteId`, `clientId`

### TikTok Shop — auto-refresh

```java
TokenRefreshConfig.builder()
    .enabled(true)
    .endpoint("https://auth.tiktok-shops.com/api/v2/token/refresh")
    .method("POST")
    .requestParams(Map.of(
        "app_key",       "{credentials.appKey}",
        "app_secret",    "{credentials.appSecret}",
        "refresh_token", "{credentials.refreshToken}",
        "grant_type",    "refresh_token"
    ))
    .responseMapping(Map.of(
        "accessToken",           "data.access_token",
        "refreshToken",          "data.refresh_token",
        "accessTokenExpiresIn",  "data.access_token_expire_in",
        "refreshTokenExpiresIn", "data.refresh_token_expire_in"
    ))
    .accessTokenKey("accessToken")
    .refreshTokenKey("refreshToken")
    .accessTokenExpiryKey("accessToken")
    .bufferMinutes(5)
    .build()
```

Required credentials at connect time: `accessToken`, `refreshToken`, `appKey`, `appSecret`, `shopCipher`

---

## tokenExpiry Storage

`ChannelStoreConnection.tokenExpiry` stores absolute expiry datetimes per credential key:

```json
{
  "tokenExpiry": {
    "accessToken":  "2026-05-01T10:00:00",
    "refreshToken": "2026-08-01T10:00:00"
  }
}
```

After a successful refresh, `GenericTokenRefreshService` writes:
- `accessToken` expiry: `now + accessTokenExpiresIn seconds` (from `data.access_token_expire_in`)
- `refreshToken` expiry: `now + refreshTokenExpiresIn seconds` (from `data.refresh_token_expire_in`)

Default if the response omits `expires_in`: 23 hours (`82800` seconds).

---

## Placeholder Resolution

Request params may use `{credentials.X}` placeholders, resolved by `resolveTemplate()`:

```
"{credentials.refreshToken}" → decryptedCreds.get("refreshToken")
"{credentials.appKey}"       → decryptedCreds.get("appKey")
```

---

## Response Mapping — Dot-Notation

`responseMapping` values are dot-notation paths into the token refresh response body, resolved by `extractJsonPath()`:

```
"data.access_token"  → responseBody["data"]["access_token"]   (TikTok — nested)
"access_token"       → responseBody["access_token"]            (Wix — flat)
```

---

## Walmart — Token Per Call

Walmart tokens expire in 15 minutes. The backend generates a fresh token before **every** Walmart API call:

```java
String bearerToken = walmartAuthService.getAccessToken(
    decryptedCreds.get("clientId"),
    decryptedCreds.get("clientSecret")
);
```

`TokenRefreshConfig` is not used for Walmart. Only `clientId` and `clientSecret` are stored.

---

## Shopee — HMAC Signing

Shopee does not use Bearer tokens. Every request is signed:

```
sign = SHA256(partnerId + apiPath + timestamp + accessToken + shopId)
```

The `accessToken` (valid 4 hours) is part of the signature. When it expires, the merchant re-authorizes via the OAuth flow and the new token is saved via `PATCH /credentials`. `TokenRefreshConfig` is not used for Shopee.

---

## Channel Auto-Refresh Status

| Channel | Access Token Expiry | Refresh Token Expiry | Auto-Refresh |
|---------|--------------------|-----------------------|-------------|
| Shopify | Never | N/A | No — `enabled: false` |
| Wix | ~1 hour | Indefinite | Yes |
| TikTok Shop | Varies | Varies | Yes |
| Amazon SP-API | 1 hour | 1 year | Not yet configured |
| eBay | 2 hours | 18 months | Not yet configured |
| Lazada | 30 days | ~90 days | Not yet configured |
| Tokopedia | ~1 hour | Varies | Not yet configured |
| Shopee | 4 hours | N/A | HMAC signing — no refresh |
| Facebook | 60 days | N/A | Manual rotation |
| Walmart | 15 minutes | N/A | Generated per call |

---

## Adding Refresh Support for a New Channel

No changes to service code are needed. Add to `ChannelConfigurationDataLoader`:

1. Add `TokenRefreshConfig` to the channel builder with the correct endpoint, params, and response mapping
2. Add `credentialMapping` to the channel's `AuthenticationConfig`
3. Ensure the store's credentials map includes `refreshToken` (and any other params the refresh endpoint requires)
