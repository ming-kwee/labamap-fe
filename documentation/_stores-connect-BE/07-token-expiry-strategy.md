# Token Expiry & Refresh Strategy

## Channel Token Lifetimes

| Channel | Access Token Expiry | Refresh Token Expiry | Auto-refresh |
|---------|--------------------|-----------------------|--------------|
| Shopify | Never | N/A | No — static (`enabled: false`) |
| Wix | ~1 hour | Indefinite | Yes — `GenericTokenRefreshService` |
| Amazon SP-API | 1 hour | 1 year | Not yet configured |
| eBay | 2 hours | 18 months | Not yet configured |
| TikTok Shop | Varies | Varies | Yes — `GenericTokenRefreshService` |
| Lazada | 30 days | ~90 days | Not yet configured |
| Tokopedia | ~1 hour | Varies | Not yet configured |
| Shopee | 4 hours | N/A (re-authorize) | HMAC-signed |
| Facebook | 60 days | N/A | Manual rotation |
| Walmart | 15 minutes | N/A (client credentials) | On every call |

---

## Implementation: GenericTokenRefreshService

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store.service`

The refresh strategy is **data-driven**: all refresh logic is read from `ChannelConfiguration.IntegrationConfig.TokenRefreshConfig`. There are no `if (channelType == "wix")` blocks in service code — channel-specific behaviour lives entirely in `ChannelConfigurationDataLoader`.

### Refresh Flow

```
POST /api/v1/channels/publish  (with storeId)
         │
         ▼  ChannelPublishService.resolveStoreAndPublish()
         │
         ├─ Load ChannelStoreConnection (getStore)
         │
         ├─ Load ChannelConfiguration (findSystemDefaultByChannelId)
         │
         ▼  GenericTokenRefreshService.getValidCredentials(orgId, store, channelConfig)
         │
         ├─ tokenRefresh.enabled == false?
         │       └─ YES → decrypt + return immediately (Shopify)
         │
         ├─ Read store.tokenExpiry[accessTokenKey]
         │
         ├─ expiry < now + bufferMinutes?
         │       │
         │       ├─ NO  → decrypt + return (still valid)
         │       │
         │       └─ YES → executeRefresh():
         │                 ├─ Decrypt current credentials
         │                 ├─ Build request params (resolve {credentials.X} placeholders)
         │                 ├─ POST to tokenRefresh.endpoint
         │                 ├─ Parse response via tokenRefresh.responseMapping (dot-notation paths)
         │                 ├─ Re-encrypt updated credentials
         │                 ├─ Update store.tokenExpiry map
         │                 ├─ Save to DB (ChannelStoreConnectionRepository.save)
         │                 └─ Return fresh decrypted credentials
         │
         └─ injectDecryptedCredentials() with fresh creds
```

---

## Configuration: TokenRefreshConfig

Defined as a nested class in `ChannelConfiguration.IntegrationConfig`:

```java
public static class TokenRefreshConfig {
    Boolean enabled;                     // false = skip refresh check entirely
    String endpoint;                     // OAuth token refresh URL
    String method;                       // "POST" or "GET"
    Map<String, String> requestParams;   // Params with {credentials.X} placeholders
    Map<String, String> responseMapping; // credentialKey → JSON dot-path in response
    String accessTokenKey;               // Credential map key for access token
    String refreshTokenKey;              // Credential map key for refresh token
    String accessTokenExpiryKey;         // tokenExpiry map key for access token
    Integer bufferMinutes;               // Refresh this many minutes before actual expiry
}
```

### WIX Configuration

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

**Required WIX credentials at connect time:** `accessToken`, `refreshToken`, `wixSiteId`, `clientId`

### TikTok Shop Configuration

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
        "accessToken",             "data.access_token",
        "refreshToken",            "data.refresh_token",
        "accessTokenExpiresIn",    "data.access_token_expire_in",
        "refreshTokenExpiresIn",   "data.refresh_token_expire_in"
    ))
    .accessTokenKey("accessToken")
    .refreshTokenKey("refreshToken")
    .accessTokenExpiryKey("accessToken")
    .bufferMinutes(5)
    .build()
```

**Required TikTok credentials at connect time:** `accessToken`, `refreshToken`, `appKey`, `appSecret`, `shopCipher`

### Shopify Configuration (no refresh)

```java
TokenRefreshConfig.builder()
    .enabled(false)   // Shopify access tokens are permanent
    .build()
```

---

## Token Expiry Storage: ChannelStoreConnection.tokenExpiry

The `tokenExpiry` field on `ChannelStoreConnection` stores absolute expiry datetimes per credential key:

```json
{
  "storeId": "tiktokshop-ph-store",
  "channelType": "tiktokshop",
  "credentials": {
    "accessToken":  "AES256GCM:...",
    "refreshToken": "AES256GCM:...",
    "appKey":       "AES256GCM:...",
    "appSecret":    "AES256GCM:...",
    "shopCipher":   "AES256GCM:..."
  },
  "tokenExpiry": {
    "accessToken":  "2026-03-05T10:00:00",
    "refreshToken": "2026-06-05T10:00:00"
  }
}
```

`GenericTokenRefreshService` writes to this map after a successful refresh:
- `accessToken` expiry: `now + accessTokenExpiresIn seconds` (from `data.access_token_expire_in`)
- `refreshToken` expiry: `now + refreshTokenExpiresIn seconds` (from `data.refresh_token_expire_in`)

If `expires_in` is not in the response, defaults to 23 hours (`82800` seconds).

---

## Placeholder Resolution

Request params may contain `{credentials.X}` placeholders:

```
"{credentials.refreshToken}" → decryptedCreds.get("refreshToken")
"{credentials.appKey}"       → decryptedCreds.get("appKey")
```

Resolution is done by `GenericTokenRefreshService.resolveTemplate()` before the HTTP call.

---

## Response Mapping (Dot-Notation Path)

Response JSON paths support nested dot-notation:

```
"data.access_token"    → responseBody["data"]["access_token"]
"access_token"         → responseBody["access_token"]      (WIX — flat response)
```

Implemented by `GenericTokenRefreshService.extractJsonPath()`.

---

## Adding Refresh Support for a New Channel

1. Add `tokenRefresh` config to the channel builder in `ChannelConfigurationDataLoader`
2. Add `credentialMapping` to the channel's `AuthenticationConfig`
3. Ensure the store's credentials map includes `refreshToken` (and any other required fields)

No code changes to service layer are required.

---

## Walmart — Token Generated Per Call

Walmart tokens expire in 15 minutes. The backend generates a fresh token before **every** API call:

```java
// Before any Walmart API call
String bearerToken = walmartAuthService.getAccessToken(
    decryptedCreds.get("clientId"),
    decryptedCreds.get("clientSecret")
);
```

No token is stored for Walmart — only `clientId` and `clientSecret` are persisted. `TokenRefreshConfig` is not used for Walmart.

---

## Shopee — HMAC Signing (No Token Refresh)

Shopee does not use Bearer tokens for API calls. Every request is signed with:

```
sign = SHA256(partnerId + apiPath + timestamp + accessToken + shopId)
```

The `accessToken` (valid 4 hours) is included in the signature. When it expires, the merchant re-authorizes through the OAuth flow and the new `accessToken` is saved via `PATCH /credentials`.

---

## Security Notes

- Refresh tokens must be stored encrypted — they are **long-lived and high-value**
- Never log decrypted token values (the service logs only key names, not values)
- Decrypted credentials never leave the service layer — `customOptions` receives decrypted values in-memory only for the request lifetime
- If a refresh token is compromised, deactivate the store via `PUT /{storeId}/deactivate` and re-authorize from scratch
- Always use HTTPS for OAuth callbacks (tokens in query strings / body)
