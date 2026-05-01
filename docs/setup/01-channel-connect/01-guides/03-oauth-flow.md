# OAuth Flow — 5-Phase Lifecycle

The complete journey from app registration to auto-refreshing tokens.

---

## Overview

```
  DEVELOPER                 MERCHANT                      AUTOMATIC
  (one-time setup)          (per store)                   (every publish)
  ──────────────────────────────────────────────────────────────────
  Phase A                   Phase B → C                   Phase D / E
  Register app at     →     Click "Connect Store"    →    Token lifecycle:
  marketplace portals       → Authorize in marketplace    auto-refresh before
  Store clientId/secret       → Backend exchanges           each API call,
  in application.yml /          code for real token          webhook-driven
  env vars                    → Save encrypted to DB         deactivation,
                                                             audit log
  ──────────────────────────────────────────────────────────────────
  ✅ Config only            ✅ Implemented (Phases A–C)   ✅ Implemented (E)
```

**OAuth channels** (Phases A–C active): Shopify, Wix, TikTok Shop, Amazon, eBay  
**Manual credential channels** (no OAuth redirect): Lazada, Tokopedia, Shopee, Facebook, Walmart

---

## Phase A — App Registration (Developer, one-time)

Before any merchant connects, the platform operator registers the Labamap app in each marketplace's developer portal to obtain `clientId` and `clientSecret`.

These go into `application.yml` (env-var backed) under `app.oauth.channels.<channelType>`:

```yaml
app:
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
        authorization-endpoint: https://www.wix.com/installer/install
        token-endpoint:         https://www.wixapis.com/oauth/access
        ...
      tiktokshop: ...
      amazon: ...
      ebay: ...
```

Per-channel redirect URI to register in the marketplace portal:
```
https://api.yourdomain.com/labamap/api/v1/oauth/callback/{channelType}
```

---

## Phase B — OAuth Initiation (Merchant clicks "Connect Store")

When the merchant selects an OAuth channel in `ConnectStoreModal` and clicks Connect, the frontend calls:

```
GET /labamap/api/v1/oauth/initiate
  ?channelType=shopify
  &organizationId=org_123
  &storeName=My+Brand+US
  &region=US
  &shop=my-brand.myshopify.com   ← Shopify-specific
```

The backend (`OAuthInitiationService`):
1. Generates a UUID nonce and saves it to `oauth_state_nonces` (MongoDB TTL doc — auto-expires in 10 min)
2. Builds the marketplace authorization URL with `state=base64(nonce + orgId + channel)` as the CSRF guard
3. Returns `{ authorizationUrl, nonce, channelType }`

The frontend redirects the browser to `authorizationUrl`. The merchant logs in and approves the app on the marketplace.

---

## Phase C — Callback & Code Exchange

The marketplace redirects back to:
```
GET /labamap/api/v1/oauth/{channelType}/callback?code=AUTH_CODE&state=BASE64&hmac=...&shop=...
```

`OAuthCallbackService`:
1. **Verifies signature** — Shopify: HMAC-SHA256 of query params against `clientSecret`; WIX/TikTok: body HMAC
2. **Validates nonce** — decodes `state`, looks up in `oauth_state_nonces`, marks consumed (CSRF protection)
3. **Exchanges code** — `OAuthTokenExchangeService` calls the channel's token endpoint:

| Channel | Token endpoint | Key response fields |
|---------|---------------|---------------------|
| Shopify | `https://{shop}/admin/oauth/access_token` | `access_token` (permanent) |
| Wix | `https://www.wixapis.com/oauth/access` | `access_token`, `refresh_token`, `expires_in` |
| TikTok Shop | `https://auth.tiktok-shops.com/api/v2/token/get` | `data.access_token`, `data.refresh_token`, `data.access_token_expire_in`, `data.authorized_shop[0].cipher` |
| Amazon | Config `tokenEndpoint` | `access_token`, `refresh_token`, `expires_in` |
| eBay | Config `tokenEndpoint` (form-urlencoded + Basic auth) | `access_token`, `refresh_token`, `expires_in`, `refresh_token_expires_in` |

4. **Encrypts and saves** credentials + `tokenExpiry` map to `channel_store_connections`
5. **Redirects** browser to:
   - Success: `/channels/stores?connected=shopify`
   - Failure: `/channels/stores?error=REASON`

The frontend `ChannelStoresDashboard` detects the `?connected=` query param and shows a success toast.

---

## Phase D — Uninstall Webhooks (Automatic Deactivation)

When a merchant uninstalls the app from the marketplace, the marketplace sends a webhook:

```
POST /labamap/api/v1/webhooks/{channelType}/{event}
  Headers: X-Shopify-Hmac-SHA256 / X-Wix-Signature / X-Tts-Open-Hmac-Signature
  Body: JSON with shop domain or seller ID
```

`WebhookService` verifies the signature, looks up the store by `channelType + storeUrl`, sets `isActive = false`, writes `disconnectedAt` + `disconnectReason`, and emits a `DISCONNECTED` audit event.

The endpoint always returns `200 OK` — errors are logged, not returned (marketplace expects `200`).

`disconnectReason` values: `app_uninstalled` (Shopify) · `deauthorize` (TikTok) · `app_removed` (Wix) · `app_deauthorized` (Amazon) · `manual` (API call)

---

## Phase E — Token Lifecycle (Auto-Refresh + Audit Log)

### Auto-refresh (before every publish)

`GenericTokenRefreshService.getValidCredentials()` runs inline when `POST /channels/publish` is called:

```
token still valid (expiry > now + bufferMinutes)?
  → YES: return decrypted credentials

  → NO: check refresh token expiry
         └─ refresh token expired?
                → YES: set reconnectRequired = true
                        emit RECONNECT_FLAGGED audit event
                        return stale credentials
                → NO: POST to tokenRefresh.endpoint
                        └─ SUCCESS: re-encrypt + save + audit REFRESHED → return fresh creds
                        └─ FAILURE: set reconnectRequired = true + audit REFRESH_FAILED + RECONNECT_FLAGGED
                                     return stale credentials
```

Channel-specific `TokenRefreshConfig` (in `ChannelConfigurationDataLoader`):
- **Wix**: `POST https://www.wixapis.com/oauth2/token` with `refresh_token` + `clientId`; `bufferMinutes=10`
- **TikTok Shop**: `POST https://auth.tiktok-shops.com/api/v2/token/refresh` with `appKey/appSecret/refresh_token`; `bufferMinutes=5`
- **Shopify**: `enabled=false` (tokens never expire)

### `connectionStatus` (derived, returned in API response)

| `isActive` | `reconnectRequired` | `disconnectReason` | `connectionStatus` |
|-----------|--------------------|--------------------|-------------------|
| `true` | `false`/`null` | any | **ACTIVE** |
| `true` | `true` | any | **RECONNECT_REQUIRED** |
| `false` | any | `"manual"` | **INACTIVE** |
| `false` | any | anything else | **DISCONNECTED** |

When `connectionStatus = RECONNECT_REQUIRED`, the `ChannelStoresDashboard` shows a "Reconnect" button that re-triggers Phase B for that store.

### Audit log

All OAuth events are written to `oauth_audit_log` (immutable, never stores credential values):

| Event | Emitted by | When |
|-------|-----------|------|
| `CONNECTED` | `OAuthCallbackService` | New store connected via OAuth |
| `RECONNECTED` | `OAuthCallbackService` | Existing store re-authorized |
| `REFRESHED` | `GenericTokenRefreshService` | Token auto-refreshed |
| `REFRESH_FAILED` | `GenericTokenRefreshService` | Token refresh HTTP call failed |
| `RECONNECT_FLAGGED` | `GenericTokenRefreshService` | Refresh token expired or refresh failed |
| `DISCONNECTED` | `ChannelStoreConnectionService` | Webhook deactivation |
| `DEACTIVATED` | `ChannelStoreConnectionService` | Manual deactivation via API |

---

## Manual-Credential Channels (No OAuth Redirect)

Lazada, Tokopedia, Shopee, Facebook, and Walmart use `ConnectStoreModal`'s credential form directly — the merchant pastes tokens from the marketplace portal. There is no browser redirect or code exchange.

For these channels, token rotation is handled via `PATCH /channel-stores/{storeId}/credentials` when the merchant obtains a new token.
