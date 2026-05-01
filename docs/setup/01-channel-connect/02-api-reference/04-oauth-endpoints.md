# OAuth Endpoints Reference

---

## Environment Variables

```bash
# Credential encryption (required)
CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>

# OAuth app credentials — per channel
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

---

## application.yml — `app.oauth` Block

```yaml
app:
  credential:
    key: ${CREDENTIAL_ENCRYPTION_KEY:dev-only-key}
  oauth:
    callback-base-url: ${OAUTH_CALLBACK_BASE_URL}
    channels:
      shopify:
        client-id:              ${SHOPIFY_CLIENT_ID}
        client-secret:          ${SHOPIFY_CLIENT_SECRET}
        authorization-endpoint: https://{shop}.myshopify.com/admin/oauth/authorize
        token-endpoint:         https://{shop}.myshopify.com/admin/oauth/access_token
        scopes:                 read_products,write_products,read_inventory,write_inventory
        callback-verification:  hmac_sha256
      wix:
        client-id:              ${WIX_CLIENT_ID}
        client-secret:          ${WIX_CLIENT_SECRET}
        authorization-endpoint: https://www.wix.com/installer/install
        token-endpoint:         https://www.wixapis.com/oauth/access
        callback-verification:  state_nonce
      tiktokshop:
        client-id:              ${TIKTOKSHOP_CLIENT_ID}
        client-secret:          ${TIKTOKSHOP_CLIENT_SECRET}
        authorization-endpoint: https://auth.tiktok-shops.com/api/v2/oauth/connect
        token-endpoint:         https://auth.tiktok-shops.com/api/v2/token/get
        callback-verification:  sign_param
      amazon:
        client-id:              ${AMAZON_CLIENT_ID}
        client-secret:          ${AMAZON_CLIENT_SECRET}
        authorization-endpoint: https://sellercentral.amazon.com/apps/authorize/consent
        token-endpoint:         https://api.amazon.com/auth/o2/token
      ebay:
        client-id:              ${EBAY_CLIENT_ID}
        client-secret:          ${EBAY_CLIENT_SECRET}
        authorization-endpoint: https://auth.ebay.com/oauth2/authorize
        token-endpoint:         https://api.ebay.com/identity/v1/oauth2/token
```

**Redirect URI to register in each marketplace portal:**
```
https://api.yourdomain.com/labamap/api/v1/oauth/{channelType}/callback
```

---

## OAuthAppConfig (Java)

**Package:** `com.labamap.labamapomnichannelbe4fe.configuration`  
**Annotation:** `@ConfigurationProperties("app.oauth")`

```java
public static class ChannelOAuthConfig {
    private String clientId;
    private String clientSecret;
    private String authorizationEndpoint;   // may contain {shop} placeholder (Shopify)
    private String tokenEndpoint;
    private String scopes;
    private String callbackVerification;    // "hmac_sha256" | "state_nonce" | "sign_param"
    private String grantType;
}
```

`getCallbackUrl(channelType)` → `callbackBaseUrl + "/" + channelType + "/callback"`

---

## GET /api/v1/oauth/initiate

Generate an authorization URL for the merchant's browser redirect. Called by the frontend `ConnectStoreModal` when the selected channel is in `OAUTH_CHANNELS`.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `channelType` | Yes | e.g. `shopify`, `wix`, `tiktokshop`, `amazon`, `ebay` |
| `organizationId` | Yes | tenant ID |
| `storeName` | Yes | display name for the new store |
| `region` | No | e.g. `US`, `MY`, `PH` |
| `shop` | Shopify only | merchant's `.myshopify.com` domain |
| `storeId` | Reconnect only | existing store's `storeId` (re-authorization flow) |

**Request:**
```http
GET /labamap/api/v1/oauth/initiate
  ?channelType=shopify
  &organizationId=org_123
  &storeName=My+Brand+US
  &region=US
  &shop=my-brand.myshopify.com
```

**Response `200 OK`:**
```json
{
  "authorizationUrl": "https://my-brand.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_products,write_products&redirect_uri=https://api.yourdomain.com/labamap/api/v1/oauth/shopify/callback&state=<base64>",
  "nonce": "550e8400-e29b-41d4-a716-446655440000",
  "channelType": "shopify"
}
```

**Backend flow (`OAuthInitiationService`):**
1. Generate UUID nonce
2. Save `OAuthStateNonce` to MongoDB (TTL 10 min, auto-expires)
3. Build state payload: `base64url(JSON({ nonce, organizationId, channelType, storeName, region, storeId }))`
4. Resolve `{shop}` placeholder in `authorizationEndpoint` (Shopify)
5. Build marketplace authorization URL with `client_id`, `scope`, `redirect_uri`, `state`
6. Return `authorizationUrl` + `nonce`

**Frontend usage:**
```typescript
const { authorizationUrl } = await ChannelOAuthService.initiateOAuth({
  channelType, organizationId, storeName, region, shop: storeUrl,
});
window.location.href = authorizationUrl;
```

---

## GET /api/v1/oauth/{channelType}/callback

Receives the marketplace redirect after the merchant approves the app. Exchanges the one-time code for real tokens and saves them encrypted to MongoDB.

**Path params:** `channelType` (e.g. `shopify`)

**Query params** (set by marketplace):

| Param | Channels | Description |
|-------|----------|-------------|
| `code` | All | one-time authorization code |
| `state` | All | base64url-encoded `OAuthStatePayload` containing nonce |
| `hmac` | Shopify | HMAC-SHA256 of query params for signature verification |
| `shop` | Shopify | merchant's `.myshopify.com` domain |

**Response:**
- `302 Redirect` to `/channels/stores?connected={channelType}` — success
- `302 Redirect` to `/channels/stores?error=REASON` — failure

**Backend flow (`OAuthCallbackService`):**
1. Verify marketplace signature (channel-specific):
   - **Shopify:** `HMAC-SHA256(sorted_query_params, clientSecret)` → compare to `hmac` param
   - **Wix / TikTok Shop:** body HMAC via `X-Wix-Signature` / `X-Tts-Open-Hmac-Signature` header
2. Decode `state` → extract `nonce`
3. Validate nonce via `OAuthStateNonceRepository.findByNonceAndConsumedFalseAndExpiresAtAfter(nonce, now)` → mark consumed
4. Exchange code for tokens via `OAuthTokenExchangeService` (per-channel dispatch):
   - **Shopify:** `POST {shop}/admin/oauth/access_token` with JSON `{client_id, client_secret, code}`
   - **Wix:** `POST tokenEndpoint` with JSON `{grant_type, client_id, client_secret, code}`
   - **TikTok Shop:** `POST tokenEndpoint` with `{app_key, app_secret, auth_code, grant_type:"authorized_code"}`
   - **Amazon:** `POST tokenEndpoint` with JSON `{grant_type, code, client_id, client_secret, redirect_uri}`
   - **eBay:** `POST tokenEndpoint` form-urlencoded with `Authorization: Basic base64(clientId:clientSecret)`
5. Encrypt tokens via `CredentialEncryptionService.encryptAll()`
6. Write `tokenExpiry` map from `expires_in` fields
7. Save to `channel_store_connections` (new connect or `reconnectStore()` for re-auth)
8. Emit `CONNECTED` or `RECONNECTED` audit event
9. Redirect browser to frontend

**Token Exchange Result per channel:**

| Channel | `access_token` | `refresh_token` | Extras |
|---------|----------------|-----------------|--------|
| Shopify | `access_token` (permanent) | N/A | — |
| Wix | `access_token` | `refresh_token` | `wixSiteId`, `clientId` |
| TikTok Shop | `data.access_token` | `data.refresh_token` | `data.authorized_shop[0].cipher` → `shopCipher` |
| Amazon | `access_token` | `refresh_token` | `sellerId` |
| eBay | `access_token` | `refresh_token` | `refresh_token_expires_in` |

---

## POST /api/v1/oauth/{channelType}/callback

Same as the `GET` variant but accepts form-POST callbacks (used by some channels that send credentials in the request body). Always returns `200 OK` rather than a browser redirect.

---

## POST /api/v1/webhooks/{channelType}/{event}

Receive marketplace uninstall / deauthorization webhooks. Always returns `200 OK` — errors are logged, never surfaced (marketplace retries on non-200).

**Path params:**
- `channelType` — e.g. `shopify`, `wix`, `tiktokshop`
- `event` — e.g. `app/uninstalled`, `deauthorize`, `app_removed`

**Headers (signature verification):**

| Channel | Header | Algorithm |
|---------|--------|-----------|
| Shopify | `X-Shopify-Hmac-SHA256` | `base64(HMAC-SHA256(rawBody, clientSecret))` |
| Wix | `X-Wix-Signature` | `base64(HMAC-SHA256(rawBody, clientSecret))` |
| TikTok Shop | `X-Tts-Open-Hmac-Signature` | `hex(HMAC-SHA256(timestamp + body, appSecret))` where timestamp from `X-Timestamp` header |
| Amazon | — | SNS certificate chain (logged only — not enforced) |
| eBay | — | HTTPS endpoint security only |

**Response:**
- `200 OK` — always (errors logged, not returned)
- `401 Unauthorized` — signature invalid

**Backend flow (`WebhookService`):**
1. Verify signature per channel
2. Parse store URL / seller ID from webhook body
3. `findByChannelTypeAndStoreUrl()` → cross-org lookup
4. `deactivateByWebhook(channelType, storeUrl, disconnectReason)` → sets `isActive = false`, `disconnectedAt = now`, writes `disconnectReason`
5. Emit `DISCONNECTED` audit event

**`disconnectReason` values:**

| Value | Source |
|-------|--------|
| `app_uninstalled` | Shopify `app/uninstalled` webhook |
| `deauthorize` | TikTok Shop deauthorize webhook |
| `app_removed` | Wix `app_removed` webhook |
| `app_deauthorized` | Amazon webhook |
| `manual` | `PUT /{storeId}/deactivate` API call |

---

## MongoDB: `oauth_state_nonces`

TTL collection — documents auto-expire after 10 minutes (MongoDB TTL index on `expiresAt`).

```json
{
  "_id": "...",
  "nonce": "550e8400-e29b-41d4-a716-446655440000",
  "organizationId": "org_123",
  "channelType": "shopify",
  "storeName": "My Brand US",
  "region": "US",
  "storeId": null,
  "consumed": false,
  "createdAt": "2026-04-29T10:00:00",
  "expiresAt": "2026-04-29T10:10:00"
}
```

`consumed: true` is set immediately when the nonce is validated in the callback — prevents replay attacks.

---

## MongoDB: `oauth_audit_log`

Immutable event log. Never stores credential values. Never deleted or updated.

```json
{
  "_id": "...",
  "eventType": "CONNECTED",
  "channelType": "shopify",
  "organizationId": "org_123",
  "storeId": "shopify-my-brand-us-store",
  "storeName": "My Brand US",
  "timestamp": "2026-04-29T10:05:00",
  "detail": null
}
```

**Event types (`OAuthAuditLogService` constants):**

| Constant | Emitted By | When |
|----------|-----------|------|
| `CONNECTED` | `OAuthCallbackService` | New store connected via OAuth |
| `RECONNECTED` | `OAuthCallbackService` | Existing store re-authorized via OAuth |
| `REFRESHED` | `GenericTokenRefreshService` | Access token auto-refreshed |
| `REFRESH_FAILED` | `GenericTokenRefreshService` | Token refresh HTTP call failed |
| `RECONNECT_FLAGGED` | `GenericTokenRefreshService` | Refresh token expired or refresh failed — merchant must re-authorize |
| `DISCONNECTED` | `ChannelStoreConnectionService` | Deactivated via marketplace webhook |
| `DEACTIVATED` | `ChannelStoreConnectionService` | Manually deactivated via `PUT /deactivate` |

**Querying audit history:**
```
GET /api/v1/oauth/audit?organizationId=org_123&storeId=shopify-my-brand-us-store
→ OAuthAuditLogRepository.findByOrganizationIdAndStoreIdOrderByTimestampDesc()
```

---

## File Inventory (Phases A–E)

### New files

```
src/main/java/.../
├── configuration/
│   └── OAuthAppConfig.java                          (Phase A)
└── channel/store/
    ├── controller/
    │   ├── OAuthController.java                     (Phase B — /oauth/initiate)
    │   ├── OAuthCallbackController.java             (Phase C — /oauth/{ch}/callback)
    │   └── WebhookController.java                   (Phase D — /webhooks/{ch}/{event})
    ├── service/
    │   ├── OAuthInitiationService.java              (Phase B)
    │   ├── OAuthTokenExchangeService.java           (Phase C)
    │   ├── OAuthCallbackService.java                (Phase C — full rewrite)
    │   ├── WebhookService.java                      (Phase D)
    │   └── OAuthAuditLogService.java                (Phase E)
    ├── model/entity/
    │   ├── OAuthStateNonce.java                     (Phase B — TTL doc)
    │   └── OAuthAuditLog.java                       (Phase E — immutable)
    ├── model/dto/
    │   ├── OAuthInitiateRequest.java                (Phase B)
    │   ├── OAuthInitiateResponse.java               (Phase B)
    │   └── TokenExchangeResult.java                 (Phase C)
    └── repository/
        ├── OAuthStateNonceRepository.java           (Phase B)
        └── OAuthAuditLogRepository.java             (Phase E)
```
