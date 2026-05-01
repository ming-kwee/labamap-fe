# OAuth Marketplace Connection — Wireframes Phase A → E

Visual walkthrough of every screen and data flow a merchant and the system go through
when connecting a marketplace store, from first setup through automated token lifecycle.

---

## Actors & Notation

```
[MERCHANT]   = the person using the UI
[FRONTEND]   = Next.js browser app  (localhost:3000)
[BACKEND]    = Spring Boot API      (localhost:8888)
[MARKETPLACE] = Shopify / WIX / TikTok / Amazon / eBay
[MONGODB]    = database
```

---

## PHASE A — App Credential Configuration (Developer, one-time)

This phase happens before any merchant ever clicks anything.
The developer registers the platform app on each marketplace's developer portal
and stores the credentials in backend config.

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEVELOPER ACTION — NOT a UI screen                                  │
│                                                                      │
│  1. Go to Shopify Partners → Create App → Copy clientId + secret    │
│  2. Go to WIX Dev Center  → Create App → Copy clientId + secret     │
│  3. Go to TikTok Open Platform → App Key + App Secret               │
│  4. Go to Amazon SP-API  → LWA clientId + secret                    │
│  5. Go to eBay Developer → App ID + Cert ID                         │
│                                                                      │
│  Paste all into application.yml / environment variables:            │
│                                                                      │
│  SHOPIFY_CLIENT_ID=shp_xxxxx                                        │
│  SHOPIFY_CLIENT_SECRET=shpss_xxxxx                                  │
│  WIX_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx                │
│  WIX_CLIENT_SECRET=xxxxx                                            │
│  TIKTOKSHOP_CLIENT_ID=xxxxxx   (= app_key)                         │
│  TIKTOKSHOP_CLIENT_SECRET=xxxxx (= app_secret)                     │
│  AMAZON_CLIENT_ID=amzn1.application-xxx                             │
│  AMAZON_CLIENT_SECRET=xxxxx                                         │
│  EBAY_CLIENT_ID=xxxxx-xxxxx-xxx-xxxx                               │
│  EBAY_CLIENT_SECRET=xxxxx                                           │
│  OAUTH_CALLBACK_BASE_URL=https://api.yourdomain.com/labamap/api/v1/oauth │
│                                                                      │
│  Result: backend can now build authorization URLs and exchange codes │
└─────────────────────────────────────────────────────────────────────┘

  DATA STORED IN BACKEND CONFIG (application.yml)

  app.oauth:
    callback-base-url: ${OAUTH_CALLBACK_BASE_URL}
    channels:
      shopify:
        client-id: ${SHOPIFY_CLIENT_ID}
        client-secret: ${SHOPIFY_CLIENT_SECRET}
        authorization-endpoint: https://{shop}.myshopify.com/admin/oauth/authorize
        token-endpoint: https://{shop}.myshopify.com/admin/oauth/access_token
        scopes: read_products,write_products,...
        callback-verification: hmac_sha256
      wix:
        authorization-endpoint: https://www.wix.com/installer/install
        token-endpoint: https://www.wixapis.com/oauth/access
        ...
      tiktokshop: ...
      amazon: ...
      ebay: ...
```

---

## PHASE B — OAuth Initiation (Merchant clicks "Connect Store")

### Screen 1 — Channel Stores page (before any connection)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Channel Stores                                         [+ Connect Store] │
│  Manage connected store integrations for your organization           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   2          │  │   0          │  │   0          │  │   0          │ │
│  │   stores  ✓  │  │   need    ⚠  │  │   by mkt  ✗  │  │   paused  –  │ │
│  │   Active     │  │   action     │  │   Disconnected│  │   Inactive   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                      │
│                  ┌───────────────────────────────────┐              │
│                  │  🔌  No stores connected           │              │
│                  │  Connect your first store to       │              │
│                  │  start publishing products.        │              │
│                  │                                    │              │
│                  │       [ Connect Store ]            │ ← click this │
│                  └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### Screen 2 — ConnectStoreModal opens (channel picker)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════════╗   │
│  ║  Connect Store                                            ✕  ║   │
│  ╠══════════════════════════════════════════════════════════════╣   │
│  ║                                                              ║   │
│  ║  Channel *                                                   ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  Select a marketplace channel          ▼             │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          ║   │
│  ║  │   SHP   │ │   WIX   │ │   TTK   │ │   AMZ   │  ...     ║   │
│  ║  │ Shopify │ │  WIX    │ │ TikTok  │ │ Amazon  │          ║   │
│  ║  │ OAuth ↗ │ │ OAuth ↗ │ │ OAuth ↗ │ │ OAuth ↗ │          ║   │
│  ║  └─────────┘ └─────────┘ └─────────┘ └─────────┘          ║   │
│  ║  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          ║   │
│  ║  │   LZD   │ │   TKP   │ │   SPE   │ │   WAL   │          ║   │
│  ║  │ Lazada  │ │Tokopedia│ │ Shopee  │ │Walmart  │          ║   │
│  ║  │ Manual  │ │ Manual  │ │ Manual  │ │ Manual  │          ║   │
│  ║  └─────────┘ └─────────┘ └─────────┘ └─────────┘          ║   │
│  ║                                                              ║   │
│  ╚══════════════════════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────────────────────┘

  OAuth channels  → Shopify, WIX, TikTok Shop, Amazon, eBay
  Manual channels → Lazada, Tokopedia, Shopee, Facebook, Walmart
```

### Screen 3a — OAuth channel selected (e.g. Shopify)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════════╗   │
│  ║  Connect Shopify Store                                    ✕  ║   │
│  ╠══════════════════════════════════════════════════════════════╣   │
│  ║                                                              ║   │
│  ║  Store Name *                                                ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  My Brand Store                                      │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  Shopify Store Domain *                                      ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  your-brand.myshopify.com                            │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║  Your Shopify store domain, e.g. my-brand.myshopify.com     ║   │
│  ║                                                              ║   │
│  ║  Region                                                      ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  ID (Indonesia)                           ▼          │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  ↗  You'll be redirected to Shopify to authorize     │   ║   │
│  ║  │     this connection. You'll return here after.       │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║                      [ Authorize with Shopify ]             ║   │
│  ╚══════════════════════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────────────────────┘

  Merchant fills "Store Name" + "Shopify domain"
  Clicks [Authorize with Shopify]
```

### Data Flow — Phase B (Initiation)

```
[MERCHANT]          [FRONTEND]              [BACKEND]              [MONGODB]
    │                    │                      │                      │
    │  Click Authorize   │                      │                      │
    │──────────────────► │                      │                      │
    │                    │  GET /oauth/initiate  │                      │
    │                    │   ?channelType=shopify│                      │
    │                    │   &organizationId=... │                      │
    │                    │   &storeName=...      │                      │
    │                    │   &shop=my-brand      │                      │
    │                    │──────────────────────►│                      │
    │                    │                       │  Generate UUID nonce │
    │                    │                       │─────────────────────►│
    │                    │                       │  Save OAuthStateNonce│
    │                    │                       │  {nonce, orgId,      │
    │                    │                       │   channelType,       │
    │                    │                       │   consumed:false,    │
    │                    │                       │   expiresAt:+10min}  │
    │                    │                       │◄─────────────────────│
    │                    │                       │                      │
    │                    │                       │  Build authUrl:      │
    │                    │                       │  https://my-brand    │
    │                    │                       │  .myshopify.com/     │
    │                    │                       │  admin/oauth/        │
    │                    │                       │  authorize?          │
    │                    │                       │  client_id=...       │
    │                    │                       │  &scope=...          │
    │                    │                       │  &redirect_uri=...   │
    │                    │                       │  &state=base64(nonce)│
    │                    │                       │                      │
    │                    │◄──────────────────────│                      │
    │                    │  {authorizationUrl,   │                      │
    │                    │   nonce, channelType} │                      │
    │                    │                       │                      │
    │  Browser redirect  │                       │                      │
    │◄───────────────────│                       │                      │
    │  to Shopify...     │                       │                      │
```

---

## PHASE C — Marketplace Authorization & Code Exchange (Backend only)

### Screen 4 — Merchant sees Shopify permission screen (NOT our UI)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [SHOPIFY.COM — external page, not our app]                         │
│                                                                      │
│  ╔══════════════════════════════════════════════════════════════╗   │
│  ║                                                              ║   │
│  ║  my-brand.myshopify.com                                      ║   │
│  ║                                                              ║   │
│  ║  Labamap Omnichannel wants to access your store:             ║   │
│  ║                                                              ║   │
│  ║  ✓ Read and write products                                   ║   │
│  ║  ✓ Read and write inventory                                  ║   │
│  ║  ✓ Read and write orders                                     ║   │
│  ║  ✓ Read and write fulfillments                               ║   │
│  ║                                                              ║   │
│  ║          [ Cancel ]  [ Install app ]                        ║   │
│  ║                           ▲                                  ║   │
│  ╚═══════════════════════════╪════════════════════════════════╝   │
│                              │                                       │
│                    Merchant clicks "Install app"                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow — Phase C (Callback & Code Exchange)

```
[MARKETPLACE]          [BACKEND]                              [MONGODB]
     │                     │                                      │
     │  GET /oauth/shopify/ │                                      │
     │  callback            │                                      │
     │  ?code=AUTH_CODE     │                                      │
     │  &state=base64nonce  │                                      │
     │  &hmac=SHA256SIG     │                                      │
     │  &shop=my-brand...   │                                      │
     │────────────────────► │                                      │
     │                      │  1. VERIFY HMAC signature            │
     │                      │     HMAC-SHA256(query-hmac,          │
     │                      │     clientSecret) == hmac param?     │
     │                      │                                      │
     │                      │  2. VERIFY NONCE                     │
     │                      │     findByNonce(nonce) →             │
     │                      │     not consumed + not expired?      │
     │                      │─────────────────────────────────────►│
     │                      │◄─────────────────────────────────────│
     │                      │     nonce.consumed = true → save     │
     │                      │─────────────────────────────────────►│
     │                      │                                      │
     │                      │  3. EXCHANGE CODE FOR TOKENS         │
     │                      │     POST shop/admin/oauth/           │
     │◄─────────────────────│     access_token                     │
     │  {access_token: ...} │     {client_id, client_secret, code} │
     │────────────────────► │                                      │
     │                      │  4. ENCRYPT & SAVE credentials       │
     │                      │     AES-256 encrypt(access_token)    │
     │                      │     connectStore({                   │
     │                      │       channelType: "shopify",        │
     │                      │       storeName: "My Brand",         │
     │                      │       credentials: [                 │
     │                      │         {credId, name, value:***}   │
     │                      │       ],                             │
     │                      │       connectionStatus: "ACTIVE"     │
     │                      │     })                               │
     │                      │─────────────────────────────────────►│
     │                      │     audit: CONNECTED event logged    │
     │                      │─────────────────────────────────────►│
     │                      │                                      │
     │                      │  5. REDIRECT merchant back to UI     │
     │◄─────────────────────│     302 → /channels/stores           │
     │                      │           ?connected=shopify         │
```

### Screen 5 — Back on Channel Stores (success toast)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Channel Stores                                   [+ Connect Store]  │
│  Manage connected store integrations                                 │
├─────────────────────────────────────────────────────────────────────┤
│        ┌──────────────────────────────────────────────┐             │
│        │  ✓  Shopify store connected successfully!   ✕│ ← TOAST    │
│        └──────────────────────────────────────────────┘             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   1          │  │   0          │  │   0          │  │   0          │ │
│  │   stores  ✓  │  │   need    ⚠  │  │   by mkt  ✗  │  │   paused  –  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                      │
│  1 active store                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  My Brand Store                         ● Active             │   │
│  │  my-brand.myshopify.com                                      │   │
│  │  [SHP] Shopify          ID                            #99    │   │
│  │  Connected: 04 Mar 2026                                      │   │
│  │  ─────────────────────────────────────────────────────────   │   │
│  │                              [ Deactivate ]                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

  Note: OAuth channels show no "Edit" button — credentials managed by OAuth only.
  Manual channels (Walmart, Lazada, etc.) show [Edit] [Deactivate] buttons.
```

---

## PHASE D — Marketplace Uninstall Webhook (Automatic)

When a merchant removes the app from Shopify/WIX/TikTok, the marketplace sends a
webhook to the backend — no UI action involved.

### Data Flow — Phase D (Webhook deactivation)

```
[MARKETPLACE]          [BACKEND]                              [MONGODB]
     │                     │                                      │
     │  POST /webhooks/     │                                      │
     │  shopify/            │                                      │
     │  app_uninstalled     │                                      │
     │  X-Shopify-Hmac-     │                                      │
     │  SHA256: base64sig   │                                      │
     │  Body: {shop:...}    │                                      │
     │────────────────────► │                                      │
     │                      │  1. VERIFY SIGNATURE                 │
     │                      │     base64(HMAC-SHA256(rawBody,      │
     │                      │     clientSecret)) == header?        │
     │                      │     → 401 if invalid                 │
     │                      │                                      │
     │                      │  2. FIND STORE by storeUrl           │
     │                      │     findByChannelTypeAndStoreUrl(    │
     │                      │     "shopify", "my-brand...")        │
     │                      │─────────────────────────────────────►│
     │                      │◄─────────────────────────────────────│
     │                      │                                      │
     │                      │  3. DEACTIVATE store                 │
     │                      │     isActive = false                 │
     │                      │     disconnectedAt = now()           │
     │                      │     disconnectReason =               │
     │                      │       "app_uninstalled"              │
     │                      │     connectionStatus → DISCONNECTED  │
     │                      │─────────────────────────────────────►│
     │                      │     audit: DISCONNECTED logged       │
     │                      │─────────────────────────────────────►│
     │                      │                                      │
     │◄─────────────────────│  200 OK (always — errors logged)     │
```

### Screen 6 — Channel Stores after webhook (next visit)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Channel Stores                                   [+ Connect Store]  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   0          │  │   0          │  │   1          │  │   0          │ │
│  │   stores  ✓  │  │   need    ⚠  │  │   by mkt  ✗  │  │   paused  –  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                      │
│  ● Attention required (1)                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  My Brand Store                         ✗ Disconnected       │   │
│  │  my-brand.myshopify.com                                      │   │
│  │  [SHP] Shopify          ID                            #99    │   │
│  │  Connected: 04 Mar 2026                                      │   │
│  │  Disconnected: 04 Mar 2026 (app uninstalled)                 │   │
│  │  ─────────────────────────────────────────────────────────   │   │
│  │  [ Reconnect ]                           [ Delete ]          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

  disconnectReason values:
  "app_uninstalled" = Shopify
  "app_removed"     = WIX
  "deauthorize"     = TikTok Shop
  "app_deauthorized"= Amazon
  "manual"          = merchant clicked [Deactivate] in our UI
```

---

## PHASE E — Token Lifecycle (Automatic, Background)

No UI during normal operation. The backend auto-refreshes tokens before they expire.
UI is only involved when auto-refresh fails (reconnect required).

### Normal flow — token auto-refresh (invisible to merchant)

```
[PRODUCT PUBLISH JOB]    [BACKEND]               [MARKETPLACE]       [MONGODB]
        │                     │                        │                  │
        │  Publish product     │                        │                  │
        │  to Shopify store    │                        │                  │
        │────────────────────► │                        │                  │
        │                      │  getValidCredentials() │                  │
        │                      │─────────────────────────────────────────► │
        │                      │  Load store + tokenExpiry                 │
        │                      │◄───────────────────────────────────────── │
        │                      │                        │                  │
        │                      │  Token expiry > now+buffer?               │
        │                      │  YES → use stored token (no refresh)      │
        │                      │                        │                  │
        │                      │  Token expiry < now+buffer?               │
        │                      │  → call refresh endpoint                  │
        │                      │──────────────────────► │                  │
        │                      │  new access_token      │                  │
        │                      │◄───────────────────────│                  │
        │                      │  encrypt + save token  │                  │
        │                      │  audit: REFRESHED      │                  │
        │                      │─────────────────────────────────────────► │
        │                      │                        │                  │
        │  API call proceeds   │                        │                  │
        │  with fresh token    │                        │                  │
```

### Failure flow — refresh token expired → reconnect required

```
[PRODUCT PUBLISH JOB]    [BACKEND]                                [MONGODB]
        │                     │                                       │
        │  Publish product     │                                       │
        │────────────────────► │                                       │
        │                      │  getValidCredentials()                │
        │                      │  refreshToken.expiry < now           │
        │                      │                                       │
        │                      │  store.reconnectRequired = true       │
        │                      │  audit: RECONNECT_FLAGGED             │
        │                      │  "Refresh token expired at ..."       │
        │                      │──────────────────────────────────────►│
        │                      │  returns stale token (best-effort)    │
        │  Publish may fail    │                                       │
        │  (stale token)       │                                       │
```

### Screen 7 — Channel Stores after RECONNECT_FLAGGED

```
┌─────────────────────────────────────────────────────────────────────┐
│  Channel Stores                                   [+ Connect Store]  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   0          │  │   1          │  │   0          │  │   0          │ │
│  │   stores  ✓  │  │   need    ⚠  │  │   by mkt  ✗  │  │   paused  –  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                      │
│  ● Attention required (1)                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  My Brand Store               ⚠ Reconnect Required           │   │
│  │  my-brand.myshopify.com                                      │   │
│  │  [SHP] Shopify          ID                            #99    │   │
│  │  Connected: 04 Mar 2026                                      │   │
│  │  ─────────────────────────────────────────────────────────   │   │
│  │  [ Reconnect ]                    [ Deactivate ]             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Screen 8 — Merchant clicks [Reconnect]

```
┌─────────────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════════╗   │
│  ║  Reconnect Shopify Store                              ✕     ║   │
│  ╠══════════════════════════════════════════════════════════════╣   │
│  ║                                                              ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  ⚠  Reconnection Required                            │   ║   │
│  ║  │  Re-authorize "My Brand Store" to restore access.    │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  Store Name                                                  ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  My Brand Store                    (pre-filled)      │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  Shopify Store Domain                                        ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  my-brand.myshopify.com            (pre-filled)      │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  ↗  You'll be redirected to Shopify to re-authorize  │   ║   │
│  ║  │     this connection.                                  │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║                   [ Re-authorize with Shopify ]              ║   │
│  ╚══════════════════════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────────────────────┘

  Backend receives callback → calls reconnectStore() instead of connectStore():
    - re-encrypts new tokens
    - clears reconnectRequired = false
    - updates tokenExpiry
    - audit: RECONNECTED
  Frontend: redirects to /channels/stores?reconnected=shopify → success toast
```

---

## Complete Lifecycle State Machine

```
                        Developer registers
                        app credentials
                              │
                              ▼
                        ┌─────────┐
                        │  READY  │  Phase A complete
                        └────┬────┘
                             │  Merchant clicks Connect
                             │  Backend generates nonce + authUrl (Phase B)
                             ▼
                        ┌─────────┐
                        │PENDING  │  Waiting at marketplace
                        │REDIRECT │  permission screen
                        └────┬────┘
                             │  Merchant approves
                             │  Marketplace → Backend callback (Phase C)
                             │  Code exchanged → tokens saved
                             ▼
                        ┌─────────┐
               ┌───────►│ ACTIVE  │◄──────────────────────┐
               │        └────┬────┘                        │
               │             │                             │
               │  Token      │  Refresh token              │  Merchant
               │  refresh    │  expired (Phase E)          │  reconnects
               │  succeeds   ▼  or refresh fails           │  (Phase B→C
               │        ┌──────────────┐                   │  again)
               │        │  RECONNECT   │                   │
               └────────│  REQUIRED   │───────────────────┘
                        └──────────────┘
                             │  Marketplace webhook
                             │  app_uninstalled (Phase D)
                             ▼
                        ┌─────────────┐
                        │ DISCONNECTED│  isActive=false
                        │             │  disconnectReason=app_uninstalled
                        └──────┬──────┘
                               │  Merchant clicks Reconnect
                               └──────────────────────────►  (back to ACTIVE)

                               │  Merchant clicks Deactivate
                               ▼
                        ┌─────────┐
                        │INACTIVE │  isActive=false
                        │         │  disconnectReason="manual"
                        └─────────┘
                               │  Merchant clicks Reactivate
                               └──────────────────────────►  (back to ACTIVE)
```

---

## Audit Log — What Gets Recorded (Phase E)

```
┌──────────────────┬─────────────────────────────────────┬───────────────────┐
│  Event           │  When                               │  Triggered by      │
├──────────────────┼─────────────────────────────────────┼───────────────────┤
│  CONNECTED       │  New store connected via OAuth      │  OAuthCallbackSvc  │
│  RECONNECTED     │  Existing store re-authorized       │  OAuthCallbackSvc  │
│  REFRESHED       │  Access token auto-refreshed        │  TokenRefreshSvc   │
│  REFRESH_FAILED  │  Token refresh HTTP call failed     │  TokenRefreshSvc   │
│  RECONNECT_FLAGGED│  Refresh token expired/failed      │  TokenRefreshSvc   │
│  DISCONNECTED    │  Deactivated via marketplace webhook│  StoreService      │
│  DEACTIVATED     │  Manually deactivated via API       │  StoreService      │
└──────────────────┴─────────────────────────────────────┴───────────────────┘

  Stored in MongoDB collection: oauth_audit_log
  Never stores credential values — event type + metadata only.
```

---

## Manual Channel Flow (Lazada, Tokopedia, Shopee, Facebook, Walmart)

These channels do not support OAuth — credentials are entered manually.
Phases B/C/D (OAuth redirect, callback, webhook) do not apply.

### Screen 3b — Manual channel selected (e.g. Walmart)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════════╗   │
│  ║  Connect Walmart Store                                    ✕  ║   │
│  ╠══════════════════════════════════════════════════════════════╣   │
│  ║                                                              ║   │
│  ║  Store Name *                                                ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  My Walmart Store                                    │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  Store URL                                                   ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  walmart.com/seller/my-store                         │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║  Credentials                                                 ║   │
│  ║  Client ID *                                                 ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  ••••••••••••••••••••••••••••••                      │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║  Walmart Developer Portal client ID                          ║   │
│  ║                                                              ║   │
│  ║  Client Secret *                                             ║   │
│  ║  ┌──────────────────────────────────────────────────────┐   ║   │
│  ║  │  ••••••••••••••••••••••••••••••                      │   ║   │
│  ║  └──────────────────────────────────────────────────────┘   ║   │
│  ║                                                              ║   │
│  ║                          [ Connect Store ]                   ║   │
│  ╚══════════════════════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────────────────────┘

  POST /channel-stores?organizationId=org_123
  Body: {
    channelType: "walmart",
    storeName: "My Walmart Store",
    storeUrl: "walmart.com/seller/my-store",
    credentials: [
      { credId: "walmart_client_id",     chnlCredName: "clientId",     chnlCredValue: "..." },
      { credId: "walmart_client_secret", chnlCredName: "clientSecret", chnlCredValue: "..." }
    ]
  }
  → 201 Created → store shown as ACTIVE immediately
```
