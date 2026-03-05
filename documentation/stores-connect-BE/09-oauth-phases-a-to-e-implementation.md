# OAuth Full Automation — Phases A–E Implementation Summary

**Implemented:** 2026-03-04
**Branch:** `bff-v1`
**Relates to:** `08-oauth-full-automation.md` (the original plan + gap analysis)

---

## Overview

Phases A through E implement the complete OAuth lifecycle for marketplace channel connections — from a merchant clicking "Connect Store" in the UI, through the authorization code flow, token storage, automatic token refresh, webhook-driven deactivation, and audit logging. After these phases, no manually-entered credential injection is required for Shopify, WIX, or TikTok Shop; the system handles the full lifecycle automatically.

```
  PHASE A               PHASE B               PHASE C
  App Credentials  →    OAuth Initiation  →   Callback + Code Exchange
  (config + model)      (redirect URL)        (real tokens saved to DB)
       │                                            │
       └────────────────────────────────────────────┘
                              │
                         PHASE D                     PHASE E
                   Uninstall Webhooks        Lifecycle Polish
                   (deactivate on remove)    (refresh guard + audit log)
```

---

## Phase A — OAuth App Credential Configuration

**Goal:** Store per-channel OAuth app credentials (clientId, clientSecret, endpoints) in configuration — not hardcoded in service logic.

### Files Created

| File | Package | Purpose |
|------|---------|---------|
| `OAuthAppConfig.java` | `configuration/` | `@ConfigurationProperties("app.oauth")` bean; holds all channel configs |

### Files Modified

| File | Change |
|------|--------|
| `application.yml` | Added full `app.oauth:` block — `callback-base-url` + per-channel entries for all 10 channels (shopify, wix, tiktokshop, amazon, ebay, lazada, tokopedia, shopee, facebook, walmart) |
| `ChannelConfiguration.java` | Added `OAuthConfig` nested class + `oauthConfig` field on the root entity |
| `ChannelConfigurationDataLoader.java` | Added `oauthConfig(...)` builder call to all 6 actively seeded channels |

### Key Design

```java
// OAuthAppConfig.java — inner class
public static class ChannelOAuthConfig {
    private String clientId;
    private String clientSecret;
    private String authorizationEndpoint;   // may contain {shop} placeholder (Shopify)
    private String tokenEndpoint;
    private String scopes;
    private String callbackVerification;    // hmac_sha256 | state_nonce | sign_param
    private String grantType;
}
```

`getCallbackUrl(channelType)` → `callbackBaseUrl + "/" + channelType + "/callback"`
Environment-variable backed: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `OAUTH_CALLBACK_BASE_URL`, etc.

---

## Phase B — OAuth Initiation Endpoint

**Goal:** When a merchant clicks "Connect Store", the backend generates a signed state nonce, builds the marketplace authorization URL, and returns it to the frontend for redirect.

### Files Created

| File | Package | Purpose |
|------|---------|---------|
| `OAuthStateNonce.java` | `channel/store/model/entity/` | MongoDB TTL document storing nonce → orgId/channel/storeName; auto-expires after 10 min |
| `OAuthStateNonceRepository.java` | `channel/store/repository/` | Reactive repository; `findByNonceAndConsumedFalseAndExpiresAtAfter()` for CSRF validation |
| `OAuthInitiateRequest.java` | `channel/store/model/dto/` | Request DTO: `channelType`, `organizationId`, `storeName`, `region`, `shop` |
| `OAuthInitiateResponse.java` | `channel/store/model/dto/` | Response DTO: `authorizationUrl`, `nonce`, `channelType` |
| `OAuthInitiationService.java` | `channel/store/service/` | Generates nonce, saves to DB, builds authorization URL per channel |
| `OAuthController.java` | `channel/store/controller/` | `GET /api/v1/oauth/initiate` |

### Files Modified

| File | Change |
|------|--------|
| `OAuthStatePayload.java` | Added `nonce: String` field (embedded in base64-encoded state param) |

### Key Design

- Nonce stored as `java.util.Date` (not `LocalDateTime`) for MongoDB TTL index (`@Indexed(expireAfterSeconds=0)`) to function correctly.
- State param: `Base64.getUrlEncoder().withoutPadding().encodeToString(objectMapper.writeValueAsBytes(payload))` — URL-safe base64, no padding.
- Shopify: `{shop}` placeholder in `authorizationEndpoint` resolved from `request.shop` at initiation time.
- TikTok adds `app_key` param; Amazon adds `version=beta&application_id`; others use standard `response_type=code`.

### Endpoint

```
GET /labamap/api/v1/oauth/initiate
  ?channelType=shopify
  &organizationId=org_123
  &storeName=My+Brand
  &region=US
  &shop=my-brand.myshopify.com

Response 200:
{
  "authorizationUrl": "https://my-brand.myshopify.com/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=<base64>",
  "nonce": "550e8400-e29b-41d4-a716-446655440000",
  "channelType": "shopify"
}
```

---

## Phase C — Secure Callback & Code Exchange

**Goal:** Receive the marketplace authorization callback, verify its authenticity, exchange the one-time code for real access/refresh tokens, and persist them encrypted to MongoDB.

### Files Created

| File | Package | Purpose |
|------|---------|---------|
| `TokenExchangeResult.java` | `channel/store/model/dto/` | Normalized result from any channel's token exchange: `accessToken`, `refreshToken`, `expiresIn`, `refreshExpiresIn`, `extras` |
| `OAuthTokenExchangeService.java` | `channel/store/service/` | Per-channel token exchange; dispatches via `switch` to channel-specific methods |

### Files Modified

| File | Change |
|------|--------|
| `StoreConnectionRequest.java` | Added `tokenExpiry: Map<String, LocalDateTime>` field |
| `ChannelStoreConnectionService.java` | `connectStore()` now persists `request.getTokenExpiry()` on the entity |
| `OAuthCallbackService.java` | **Full rewrite** — added HMAC verification, nonce validation, real token exchange, credential + expiry assembly |
| `OAuthCallbackController.java` | Added `GET /{channelType}/callback` endpoint (marketplace redirects here); GET returns 302 to frontend; POST still supported |

### Token Exchange — Per Channel

| Channel | Endpoint | Request Format | Key Response Fields |
|---------|----------|----------------|---------------------|
| **Shopify** | `https://{shop}/admin/oauth/access_token` | JSON `{client_id, client_secret, code}` | `access_token` (permanent, no expiry) |
| **WIX** | Config `tokenEndpoint` | JSON `{grant_type, client_id, client_secret, code}` | `access_token`, `refresh_token`, `expires_in`; extras: `wixSiteId`, `clientId` |
| **TikTok Shop** | Config `tokenEndpoint` | JSON `{app_key, app_secret, auth_code, grant_type:"authorized_code"}` | `data.access_token`, `data.refresh_token`, `data.access_token_expire_in`, `data.authorized_shop[0].cipher` |
| **Amazon** | Config `tokenEndpoint` | JSON `{grant_type, code, client_id, client_secret, redirect_uri}` | `access_token`, `refresh_token`, `expires_in`; extras: `sellerId` |
| **eBay** | Config `tokenEndpoint` | Form-urlencoded; `Authorization: Basic base64(id:secret)` | `access_token`, `refresh_token`, `expires_in`, `refresh_token_expires_in` |

### Shopify HMAC Verification

```
1. Remove "hmac" key from query params
2. Sort remaining keys alphabetically
3. Join as "key=value&key=value"
4. HMAC-SHA256(message, clientSecret) → hex-encode
5. Compare to "hmac" param (case-insensitive)
```

### State Nonce CSRF Guard

```
verifyAndConsumeNonce(nonce):
  1. findByNonceAndConsumedFalseAndExpiresAtAfter(nonce, new Date())
  2. switchIfEmpty → Mono.error("Invalid or expired OAuth state nonce")
  3. nonceDoc.setConsumed(true) → save
```

### Callback Endpoint

```
GET /labamap/api/v1/oauth/{channelType}/callback
  ?code=AUTH_CODE&state=BASE64_STATE&hmac=SHOPIFY_HMAC&shop=my-brand.myshopify.com

→ 302 Redirect: /channels/stores?connected=shopify    (success)
→ 302 Redirect: /channels/stores?error=REASON         (failure)
```

---

## Phase D — Uninstall & Deauthorization Webhooks

**Goal:** When a merchant uninstalls the app from the marketplace, receive the webhook and automatically deactivate the matching store connection.

### Files Created

| File | Package | Purpose |
|------|---------|---------|
| `WebhookService.java` | `channel/store/service/` | Signature verification + per-channel deactivation dispatch |
| `WebhookController.java` | `channel/store/controller/` | `POST /api/v1/webhooks/{channelType}/{event}`; always returns 200 |

### Files Modified

| File | Change |
|------|--------|
| `ChannelStoreConnection.java` | Added `disconnectedAt: LocalDateTime`, `disconnectReason: String` |
| `ChannelStoreConnectionRepository.java` | Added `findByChannelTypeAndStoreUrl(channelType, storeUrl)` — cross-org lookup needed for webhooks |
| `ChannelStoreConnectionService.java` | Added `deactivateByWebhook(channelType, storeUrl, reason)` method; `deactivateStore()` now sets `disconnectReason="manual"` + `disconnectedAt` |

### Signature Verification — Per Channel

| Channel | Header | Algorithm |
|---------|--------|-----------|
| **Shopify** | `X-Shopify-Hmac-SHA256` | `base64(HMAC-SHA256(rawBody, clientSecret))` |
| **WIX** | `X-Wix-Signature` | `base64(HMAC-SHA256(rawBody, clientSecret))` |
| **TikTok Shop** | `X-Tts-Open-Hmac-Signature` | `hex(HMAC-SHA256(timestamp+body, appSecret))` where timestamp from `X-Timestamp` header |
| **Amazon** | SNS certificate | Logged only — not enforced (SNS certificate chain verification not implemented) |
| **eBay** | None | HTTPS endpoint security only |

### Store URL Matching for Webhook Lookup

| Channel | `storeUrl` pattern stored at connect time |
|---------|-------------------------------------------|
| Shopify | `my-brand.myshopify.com` (raw shop domain) |
| WIX | `manage.wix.com/dashboard/{instanceId}` |
| TikTok Shop | `tiktokshop.com/shop/{shop_id}` |
| Amazon | `sellercentral.amazon.com/{sellerId}` |
| eBay | Not canonical — webhook logs only, no deactivation |

### Webhook Endpoint

```
POST /labamap/api/v1/webhooks/{channelType}/{event}
  Headers: X-Shopify-Hmac-SHA256 / X-Wix-Signature / X-Tts-Open-Hmac-Signature
  Body: raw JSON bytes

Response: 200 OK (always — errors are logged, not surfaced)
Response: 401 Unauthorized (signature invalid)
```

### `disconnectReason` Values

| Value | Source |
|-------|--------|
| `app_uninstalled` | Shopify webhook |
| `deauthorize` | TikTok Shop webhook |
| `app_removed` | WIX webhook |
| `app_deauthorized` | Amazon webhook |
| `manual` | `PUT /{storeId}/deactivate` API call |

---

## Phase E — Full Lifecycle Polish

**Goal:** Complete the lifecycle loop — track when reconnection is required, emit an immutable audit log for every OAuth event, and have the token refresh service correctly handle expired refresh tokens.

### Files Created

| File | Package | Purpose |
|------|---------|---------|
| `OAuthAuditLog.java` | `channel/store/model/entity/` | Immutable audit record; collection `oauth_audit_log`; never stores credential values |
| `OAuthAuditLogRepository.java` | `channel/store/repository/` | `findByOrganizationIdAndStoreIdOrderByTimestampDesc()` + org-level history |
| `OAuthAuditLogService.java` | `channel/store/service/` | Fire-and-forget `record()` (uses `.subscribe()` internally); constants for all event types |

### Files Modified

| File | Change |
|------|--------|
| `ChannelStoreConnection.java` | Added `reconnectRequired: Boolean` field |
| `ChannelStoreConnectionResponse.java` | Added `reconnectRequired`, `connectionStatus` (derived), `disconnectedAt`, `disconnectReason`; new `deriveStatus()` static method |
| `GenericTokenRefreshService.java` | Refresh token expiry guard; `reconnectRequired` management; REFRESHED / REFRESH_FAILED / RECONNECT_FLAGGED audit events |
| `ChannelStoreConnectionService.java` | Injected `OAuthAuditLogService`; `deactivateStore()` emits DEACTIVATED; `deactivateByWebhook()` emits DISCONNECTED per store; new `reconnectStore()` method |
| `OAuthCallbackService.java` | Injected `OAuthAuditLogService`; new connection emits CONNECTED; re-authorization uses `reconnectStore()` + emits RECONNECTED; `isNewConnection` flag is now accurate |

---

### `connectionStatus` Truth Table

| `isActive` | `reconnectRequired` | `disconnectReason` | `connectionStatus` |
|-----------|--------------------|--------------------|-------------------|
| `true` | `false` / `null` | any | **ACTIVE** |
| `true` | `true` | any | **RECONNECT_REQUIRED** |
| `false` | any | `"manual"` | **INACTIVE** |
| `false` | any | `null` | **INACTIVE** (legacy) |
| `false` | any | anything else | **DISCONNECTED** |

---

### Audit Event Constants (`OAuthAuditLogService`)

| Constant | Emitted By | When |
|----------|-----------|------|
| `CONNECTED` | `OAuthCallbackService` | New store successfully connected via OAuth |
| `RECONNECTED` | `OAuthCallbackService` | Existing store re-authorized via OAuth |
| `REFRESHED` | `GenericTokenRefreshService` | Access token auto-refreshed successfully |
| `REFRESH_FAILED` | `GenericTokenRefreshService` | Token refresh HTTP call failed |
| `RECONNECT_FLAGGED` | `GenericTokenRefreshService` | Refresh token expired or refresh failed — reconnect required |
| `DISCONNECTED` | `ChannelStoreConnectionService` | Store deactivated via marketplace webhook |
| `DEACTIVATED` | `ChannelStoreConnectionService` | Store manually deactivated via API |

---

### `GenericTokenRefreshService` — Full Decision Flow

```
getValidCredentials(orgId, store, channelConfig)
│
├─ tokenRefresh.enabled = false / null
│    └─ return decryptAll(store.credentials)
│
├─ token still valid (expiry > now + bufferMinutes)
│    └─ return decryptAll(store.credentials)
│
├─ token expired or expiring soon
│    │
│    ├─ refreshToken.expiry < now  ← NEW (Phase E)
│    │    ├─ store.reconnectRequired = true
│    │    ├─ audit: RECONNECT_FLAGGED("Refresh token expired at ...")
│    │    ├─ save store
│    │    └─ return stored (stale) credentials
│    │
│    └─ call refresh endpoint
│         │
│         ├─ SUCCESS
│         │    ├─ store.reconnectRequired = false
│         │    ├─ update credentials + tokenExpiry
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

### `reconnectStore()` — New Service Method

`ChannelStoreConnectionService.reconnectStore(orgId, storeId, newCredentials, tokenExpiry)` combines:
1. Re-encrypts and replaces credentials
2. Updates `tokenExpiry` map if provided
3. Clears `reconnectRequired = false`
4. Saves — single atomic DB write

Used by `OAuthCallbackService` instead of the previous `updateCredentials()` call (which did not update tokenExpiry or clear reconnectRequired).

---

## Complete File Inventory — All Phases A–E

### New Files

```
src/main/java/.../
├── configuration/
│   └── OAuthAppConfig.java                          (Phase A)
│
└── channel/store/
    ├── controller/
    │   ├── OAuthController.java                     (Phase B)
    │   ├── OAuthCallbackController.java             (Phase C — rewritten)
    │   └── WebhookController.java                   (Phase D)
    │
    ├── service/
    │   ├── OAuthInitiationService.java              (Phase B)
    │   ├── OAuthTokenExchangeService.java           (Phase C)
    │   ├── OAuthCallbackService.java                (Phase C — full rewrite)
    │   ├── WebhookService.java                      (Phase D)
    │   └── OAuthAuditLogService.java                (Phase E)
    │
    ├── model/
    │   ├── entity/
    │   │   ├── OAuthStateNonce.java                 (Phase B)
    │   │   └── OAuthAuditLog.java                   (Phase E)
    │   │
    │   └── dto/
    │       ├── OAuthInitiateRequest.java            (Phase B)
    │       ├── OAuthInitiateResponse.java           (Phase B)
    │       └── TokenExchangeResult.java             (Phase C)
    │
    └── repository/
        ├── OAuthStateNonceRepository.java           (Phase B)
        └── OAuthAuditLogRepository.java             (Phase E)
```

### Modified Files

```
src/main/resources/
└── application.yml                                  (Phase A — app.oauth block)

src/main/java/.../
├── configuration/
│   └── ChannelConfigurationDataLoader.java          (Phase A — oauthConfig per channel)
│
├── channel/
│   └── model/entity/
│       └── ChannelConfiguration.java                (Phase A — OAuthConfig nested class)
│
└── channel/store/
    ├── model/
    │   ├── entity/
    │   │   └── ChannelStoreConnection.java          (Phase D: disconnectedAt, disconnectReason)
    │   │                                             (Phase E: reconnectRequired)
    │   └── dto/
    │       ├── OAuthStatePayload.java               (Phase B — nonce field)
    │       ├── StoreConnectionRequest.java          (Phase C — tokenExpiry field)
    │       └── ChannelStoreConnectionResponse.java  (Phase E — reconnectRequired, connectionStatus,
    │                                                             disconnectedAt, disconnectReason)
    ├── repository/
    │   └── ChannelStoreConnectionRepository.java    (Phase D — findByChannelTypeAndStoreUrl)
    │
    └── service/
        ├── ChannelStoreConnectionService.java       (Phase C — tokenExpiry in connectStore)
        │                                             (Phase D — deactivateByWebhook, deactivateStore reason)
        │                                             (Phase E — OAuthAuditLogService, reconnectStore,
        │                                                         DEACTIVATED + DISCONNECTED events)
        └── GenericTokenRefreshService.java          (Phase E — refresh token expiry guard,
                                                                  reconnectRequired management,
                                                                  REFRESHED/REFRESH_FAILED/RECONNECT_FLAGGED events)
```

---

## New MongoDB Collections

| Collection | Introduced | Purpose |
|------------|-----------|---------|
| `oauth_state_nonces` | Phase B | CSRF nonce storage; TTL-indexed, auto-expires after 10 min |
| `oauth_audit_log` | Phase E | Immutable event log for all OAuth lifecycle events |

### New Fields on `channel_store_connections`

| Field | Type | Introduced | Purpose |
|-------|------|-----------|---------|
| `tokenExpiry` | `Map<String, LocalDateTime>` | Phase C (via token refresh plan) | Per-credential absolute expiry datetime |
| `disconnectedAt` | `LocalDateTime` | Phase D | When the store was deactivated via webhook |
| `disconnectReason` | `String` | Phase D | Machine-readable reason: `app_uninstalled`, `manual`, etc. |
| `reconnectRequired` | `Boolean` | Phase E | True when merchant must re-authorize via OAuth |

---

## New REST Endpoints

| Method | Path | Phase | Description |
|--------|------|-------|-------------|
| `GET` | `/api/v1/oauth/initiate` | B | Generate authorization URL + CSRF nonce |
| `GET` | `/api/v1/oauth/{channelType}/callback` | C | Receive marketplace redirect; exchange code for tokens |
| `POST` | `/api/v1/oauth/{channelType}/callback` | C | Alternative callback (form-post channels) |
| `POST` | `/api/v1/webhooks/{channelType}/{event}` | D | Receive marketplace uninstall / deauthorize webhooks |

---

## Environment Variables — Complete List (After Phases A–E)

```bash
# Credential encryption (pre-existing)
CREDENTIAL_ENCRYPTION_KEY=<32-byte base64>

# OAuth app credentials — per channel (Phase A)
OAUTH_CALLBACK_BASE_URL=https://yourdomain.com/labamap/api/v1/oauth
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
WIX_CLIENT_ID=...
WIX_CLIENT_SECRET=...
TIKTOKSHOP_CLIENT_ID=...      # app_key
TIKTOKSHOP_CLIENT_SECRET=...  # app_secret
AMAZON_CLIENT_ID=...
AMAZON_CLIENT_SECRET=...
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
```
