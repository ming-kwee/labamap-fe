# OAuth Full Automation — From Install to Access Token

## Overview

This document explains how real-world omnichannel platforms (Shopify, WIX, TikTok Shop, etc.)
integrate with channel marketplaces end-to-end — from a merchant clicking "Connect" in the UI
all the way to a stored, auto-refreshing access token — and maps this against the current
Labamap system to identify what is implemented, what is a stub, and what needs to be built.

### The Five-Phase Journey at a Glance

```
  DEVELOPER                MERCHANT                    AUTOMATIC
  (one-time)               (per store)                 (every publish)
  ─────────────────────────────────────────────────────────────────────────
  Phase 1                  Phase 2 → 3 → 4             Phase 5
  App Registration         Connect Flow                 Token Lifecycle
       │                        │                            │
  Register app at          Click "Connect"             Refresh-on-demand
  marketplace portals   →  → Authorize in          →   before each API call
  Get clientId/secret       marketplace               via GenericTokenRefresh
       │                   → Backend exchanges            Service
  Store in yml/env          code for real token
                            → Save encrypted
                              to MongoDB
  ─────────────────────────────────────────────────────────────────────────
  ✅ Done (config only)    ❌ Phase A-C to build       ✅ Implemented
```

---

## Part 1: How Real Omnichannel Platforms Do It

---

### Phase 1 — App Registration (One-Time, Developer Does This)

Before any merchant can connect, the platform operator registers the Labamap application
in each marketplace's developer portal. This is a **one-time step per channel**.

#### Wireframe 1-A — Shopify Partners App Creation

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  partners.shopify.com  ›  Apps  ›  Create app                       │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  App name         [ Labamap Omnichannel                    ]        │
  │  App URL          [ https://app.labamap.com                ]        │
  │                                                                      │
  │  Allowed redirection URL(s)                                          │
  │  [ https://api.labamap.com/labamap/api/v1/oauth/callback/shopify  ] │
  │  [ + Add URL ]                                                       │
  │                                                                      │
  │  API access scopes                                                   │
  │  ┌───────────────────────────────────────────────────────────────┐  │
  │  │ Admin API                                                     │  │
  │  │  [x] write_products      [x] read_products                   │  │
  │  │  [x] write_inventory     [x] read_inventory                  │  │
  │  │  [x] read_orders         [ ] write_orders                    │  │
  │  └───────────────────────────────────────────────────────────────┘  │
  │                                                                      │
  │                                  [ Cancel ]  [ Create app  ▶ ]      │
  └──────────────────────────────────────────────────────────────────────┘
            │
            │  Created
            ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  API credentials                                                     │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  API key          abc123xxxxxxxxxxxxxxxxxxxxxxxx         [ Copy ]   │
  │                   ↑ This is APP_CLIENT_ID                           │
  │                                                                      │
  │  API secret key   ●●●●●●●●●●●●●●●●●●●●●●●●●●●●         [ Reveal ] │
  │                   ↑ This is APP_CLIENT_SECRET                       │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │  These go into application.yml / environment variables:             │
  │                                                                      │
  │  app.oauth.shopify.client-id:     ${SHOPIFY_APP_CLIENT_ID}         │
  │  app.oauth.shopify.client-secret: ${SHOPIFY_APP_CLIENT_SECRET}     │
  │                                                                      │
  │  ⚠  NEVER commit these to git. Use env vars in production.         │
  └──────────────────────────────────────────────────────────────────────┘
```

#### Wireframe 1-B — Same Pattern Repeated Per Channel

```
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │  dev.wix.com/apps   │  │ partner.tiktokshop  │  │ developer.ebay.com  │
  │                     │  │   .com              │  │                     │
  │  App ID   ──────────┼─▶│  App Key ───────────┼─▶│  Client ID ─────────┼─┐
  │  App Secret         │  │  App Secret         │  │  Client Secret      │ │
  │  Redirect URI       │  │  Redirect URI       │  │  RuName             │ │
  │  Permissions        │  │  Permissions        │  │  Scopes             │ │
  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
                                                                              │
  ┌───────────────────────────────────────────────────────────────────────┐  │
  │  application.yml                                                      │◀─┘
  │                                                                       │
  │  app:                                                                 │
  │    oauth:                                                             │
  │      shopify:                                                         │
  │        client-id:      ${SHOPIFY_APP_CLIENT_ID}                      │
  │        client-secret:  ${SHOPIFY_APP_CLIENT_SECRET}                  │
  │        scopes:         "write_products,read_products,write_inventory" │
  │      wix:                                                             │
  │        client-id:      ${WIX_APP_CLIENT_ID}                          │
  │        client-secret:  ${WIX_APP_CLIENT_SECRET}                      │
  │      tiktokshop:                                                      │
  │        app-key:        ${TIKTOK_APP_KEY}                             │
  │        app-secret:     ${TIKTOK_APP_SECRET}                          │
  │      amazon:                                                          │
  │        lwa-client-id:  ${AMAZON_LWA_CLIENT_ID}                       │
  │        lwa-client-secret: ${AMAZON_LWA_CLIENT_SECRET}                │
  │      ebay:                                                            │
  │        client-id:      ${EBAY_CLIENT_ID}                             │
  │        client-secret:  ${EBAY_CLIENT_SECRET}                         │
  │        ru-name:        ${EBAY_RU_NAME}                               │
  └───────────────────────────────────────────────────────────────────────┘
```

---

### Phase 2 — OAuth Initiation (Merchant Clicks "Connect Store")

The merchant is in the Labamap frontend, on the Store Connect page. They click
**"Connect Shopify Store"**. The frontend calls the backend to get the OAuth URL,
then redirects the merchant's browser to the marketplace.

#### Wireframe 2-A — Labamap Store Connect Page

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Labamap  ›  Channels  ›  Connect Store                                 │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  Connect a new marketplace store                                         │
  │                                                                          │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
  │  │  🛍  Shopify      │  │  🌐  WIX          │  │  🎵  TikTok Shop  │      │
  │  │                  │  │                  │  │                  │      │
  │  │  [ Connect ▶ ]   │  │  [ Connect ▶ ]   │  │  [ Connect ▶ ]   │      │
  │  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
  │                                                                          │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
  │  │  📦  Amazon       │  │  🏷  eBay         │  │  🛒  Walmart      │      │
  │  │                  │  │                  │  │                  │      │
  │  │  [ Connect ▶ ]   │  │  [ Connect ▶ ]   │  │  [ Connect ▶ ]   │      │
  │  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
  │                                                                          │
  │  Connected stores (2)                                                    │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │ shopify  my-brand.myshopify.com     US   ● Active   Last sync 2h  │  │
  │  │ wix      www.mybrand.com            US   ● Active   Last sync 5h  │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────┘
```

#### Wireframe 2-B — Shopify Needs Store URL First (Pre-Initiation Modal)

```
  ┌────────────────────────────────────────────────────┐
  │  Connect Shopify Store                    [  ×  ]  │
  ├────────────────────────────────────────────────────┤
  │                                                    │
  │  Your Shopify store URL                            │
  │  ┌──────────────────────────────────────────────┐ │
  │  │ my-brand.myshopify.com                       │ │
  │  └──────────────────────────────────────────────┘ │
  │  e.g. your-store.myshopify.com                     │
  │                                                    │
  │  Store name (for your reference)                   │
  │  ┌──────────────────────────────────────────────┐ │
  │  │ My Shopify US Store                          │ │
  │  └──────────────────────────────────────────────┘ │
  │                                                    │
  │  Region                                            │
  │  ┌────────────┐                                    │
  │  │ US       ▼ │                                    │
  │  └────────────┘                                    │
  │                                                    │
  │         [ Cancel ]   [ Continue to Shopify  ▶ ]   │
  └────────────────────────────────────────────────────┘
```

#### Wireframe 2-C — Initiation Sequence (Browser ↔ Backend ↔ Marketplace)

```
  MERCHANT BROWSER          LABAMAP FRONTEND        LABAMAP BACKEND          SHOPIFY
  ────────────────          ────────────────        ───────────────          ───────
       │                          │                        │                    │
       │── clicks "Continue" ────▶│                        │                    │
       │                          │                        │                    │
       │                          │── GET /api/v1/oauth ──▶│                    │
       │                          │   /initiate            │                    │
       │                          │   ?channelType=shopify │                    │
       │                          │   &shop=my-brand...    │                    │
       │                          │   &organizationId=...  │                    │
       │                          │   &storeName=...       │                    │
       │                          │   &region=US           │                    │
       │                          │                        │                    │
       │                          │                        │─ generate nonce ──▶│
       │                          │                        │  (UUID random)     │
       │                          │                        │                    │
       │                          │                        │─ save nonce to DB  │
       │                          │                        │  oauth_state_nonces│
       │                          │                        │  TTL: 10 minutes   │
       │                          │                        │                    │
       │                          │                        │─ build state param │
       │                          │                        │  base64({          │
       │                          │                        │   orgId, storeName,│
       │                          │                        │   region, nonce }) │
       │                          │                        │                    │
       │                          │◀── 200 { authUrl } ───│                    │
       │                          │                        │                    │
       │◀── redirect to authUrl ──│                        │                    │
       │                                                                         │
       │── GET /admin/oauth/authorize ──────────────────────────────────────────▶│
       │   ?client_id=APP_CLIENT_ID                                              │
       │   &scope=write_products,read_products,write_inventory                   │
       │   &redirect_uri=https://api.labamap.com/.../callback/shopify            │
       │   &state=BASE64({orgId,storeName,region,nonce})                         │
```

**The `state` parameter carries two roles:**

```
  state = BASE64( JSON payload )
                  │
                  ├── organizationId: "org_123"   ← who to save the store under
                  ├── storeName:      "My US Store" ← display name
                  ├── region:         "US"          ← optional label
                  └── nonce:          "a7f3k9..."   ← CSRF protection token
                                                       verified on callback receipt
```

---

### Phase 3 — Merchant Authorizes in Marketplace (Entirely in Marketplace UI)

The merchant sees the marketplace's own OAuth consent screen. Labamap has no control
over this UI — it is rendered by the marketplace.

#### Wireframe 3-A — Shopify Consent Screen

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  my-brand.myshopify.com                          [Shopify Logo]  │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │              ┌────────────────────────────────────┐             │
  │              │                                    │             │
  │              │    [  Labamap  ]                   │             │
  │              │    wants to access your store      │             │
  │              │                                    │             │
  │              └────────────────────────────────────┘             │
  │                                                                  │
  │  my-brand.myshopify.com                                          │
  │                                                                  │
  │  This app would like to:                                         │
  │                                                                  │
  │    ✓  View and manage your products and collections              │
  │    ✓  View and manage your inventory and fulfillment services    │
  │    ✓  Read orders, fulfillments, and transactions                │
  │                                                                  │
  │  ┌─────────────────────────┐  ┌───────────────────────────────┐ │
  │  │         Decline         │  │       Install app  ▶          │ │
  │  └─────────────────────────┘  └───────────────────────────────┘ │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Merchant clicks "Install app"
                                  ▼
  Shopify redirects merchant browser to:
  ┌──────────────────────────────────────────────────────────────────┐
  │  https://api.labamap.com/labamap/api/v1/oauth/callback/shopify  │
  │    ?code=     AUTHORIZATION_CODE_abc123xyz                       │
  │    &hmac=     sha256_of_query_params_abc...                      │
  │    &shop=     my-brand.myshopify.com                             │
  │    &state=    BASE64({orgId,storeName,region,nonce})             │
  │    &timestamp=1709123456                                         │
  └──────────────────────────────────────────────────────────────────┘
  code is valid for ~10 minutes. Must be exchanged immediately.
```

#### Wireframe 3-B — WIX Consent Screen (Different Layout)

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  wix.com                                              [WIX Logo] │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  [Labamap Logo]  is requesting permission to:                    │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │  Wix Stores                                              │   │
  │  │    • Read and manage your product catalog               │   │
  │  │    • Manage product inventory                           │   │
  │  │                                                          │   │
  │  │  Wix Catalog                                             │   │
  │  │    • Access product collections and categories           │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                  │
  │  Site: www.mybrand.com  (instanceId: 1234-abcd-5678-efgh)        │
  │                                                                  │
  │  ┌─────────────────┐  ┌───────────────────────────────────────┐ │
  │  │     Decline     │  │   Allow & Add to Site  ▶              │ │
  │  └─────────────────┘  └───────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
  WIX callback includes: ?code=...&instanceId=SITE_UUID&state=...
                                  ↑
                    instanceId becomes wixSiteId in credentials
```

---

### Phase 4 — Code Exchange (Backend, Fully Automatic)

The backend receives the marketplace redirect. The merchant's browser hits the callback URL.
This is where real tokens are obtained — entirely server-side, invisible to the merchant.

#### Wireframe 4-A — Callback Security Checks

```
  Merchant browser hits:
  GET /api/v1/oauth/callback/shopify?code=abc&hmac=xyz&shop=...&state=...
                │
                ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  STEP 1: HMAC Verification  (Shopify-specific)                      │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │  Query params (sorted, without "hmac"):                             │
  │    code=abc123&shop=my-brand...&state=BASE64(...)&timestamp=...     │
  │                                                                     │
  │  Expected HMAC = SHA256(above_string, APP_CLIENT_SECRET)            │
  │  Received HMAC = xyz...  from query param                           │
  │                                                                     │
  │  Match? ──▶ YES → continue    NO → 400 Bad Request (drop it)       │
  └─────────────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  STEP 2: State Nonce Verification  (CSRF Protection)                │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │  Decode state → extract nonce "a7f3k9..."                          │
  │                                                                     │
  │  DB lookup: oauth_state_nonces.findByNonce("a7f3k9...")             │
  │                                                                     │
  │  Found + not used? ──▶ YES → mark consumed → continue              │
  │                         NO  → 400 Bad Request (replay attack)       │
  └─────────────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  STEP 3: Code → Token Exchange  (the real tokens arrive here)       │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │  Labamap backend sends:                                             │
  │                                                                     │
  │  POST https://my-brand.myshopify.com/admin/oauth/access_token       │
  │  Content-Type: application/json                                     │
  │  {                                                                  │
  │    "client_id":     "SHOPIFY_APP_CLIENT_ID",     ← app-level cred  │
  │    "client_secret": "SHOPIFY_APP_CLIENT_SECRET", ← app-level cred  │
  │    "code":          "abc123"                     ← from callback   │
  │  }                                                                  │
  │                                                                     │
  │  Shopify responds:                                                  │
  │  {                                                                  │
  │    "access_token": "shpat_xxxxxxxxxxxxxxxxxxx",  ← REAL token      │
  │    "scope":        "write_products,read_products,write_inventory"   │
  │  }                                                                  │
  └─────────────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  STEP 4: Encrypt & Save to MongoDB                                  │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │  Decode state → { orgId: "org_123", storeName: "My US Store", ... } │
  │                                                                     │
  │  encryptAll({                                                       │
  │    accessToken: "shpat_xxx"   → "AES256GCM:A3k9x..."              │
  │  })                                                                 │
  │                                                                     │
  │  channel_store_connections.save({                                   │
  │    storeId:        "shopify-my-us-store",                          │
  │    channelType:    "shopify",                                       │
  │    storeName:      "My US Store",                                   │
  │    storeUrl:       "my-brand.myshopify.com",                       │
  │    organizationId: "org_123",                                       │
  │    credentials: { accessToken: "AES256GCM:..." },                  │
  │    tokenExpiry:  null,  ← Shopify never expires                    │
  │    isActive:     true                                               │
  │  })                                                                 │
  └─────────────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  STEP 5: Redirect Merchant Back to Labamap Frontend                 │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │  302  →  https://app.labamap.com/channels/stores?connected=shopify  │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘
```

#### Wireframe 4-B — Token Exchange vs WIX (with Refresh Token)

```
  POST https://www.wixapis.com/oauth/access
  {
    "grant_type":    "authorization_code",
    "client_id":     "WIX_APP_CLIENT_ID",
    "client_secret": "WIX_APP_CLIENT_SECRET",
    "code":          "code_from_callback",
    "redirect_uri":  "https://api.labamap.com/.../callback/wix"
  }
           │
           ▼
  {
    "access_token":  "eyJhbGci...",     ← expires in 1 hour
    "refresh_token": "eyJhbGci...",     ← long-lived, use to get new access tokens
    "expires_in":    3600,
    "token_type":    "Bearer"
  }
           │
           ▼
  Save to DB:
  ┌───────────────────────────────────────────────────────────────────┐
  │  credentials: {                                                   │
  │    accessToken:  "AES256GCM:...",   ← encrypted                  │
  │    refreshToken: "AES256GCM:...",   ← encrypted                  │
  │    wixSiteId:    "AES256GCM:...",   ← from callback.instanceId   │
  │    clientId:     "AES256GCM:..."    ← needed for refresh calls   │
  │  },                                                               │
  │  tokenExpiry: {                                                   │
  │    accessToken: "2026-03-04T11:00:00"  ← now + 3600s             │
  │  }                                                                │
  └───────────────────────────────────────────────────────────────────┘
```

#### Wireframe 4-C — Token Exchange vs TikTok Shop (Extra Fields)

```
  POST https://auth.tiktok-shops.com/api/v2/token/get
  {
    "app_key":    "TIKTOK_APP_KEY",
    "app_secret": "TIKTOK_APP_SECRET",
    "auth_code":  "code_from_callback",
    "grant_type": "authorized_code"
  }
           │
           ▼
  {
    "code": 0,
    "message": "Success",
    "data": {
      "access_token":             "TT_AT_xxxxxxxxx",
      "refresh_token":            "TT_RT_xxxxxxxxx",
      "access_token_expire_in":   86400,       ← 24 hours (seconds)
      "refresh_token_expire_in":  2592000,     ← 30 days (seconds)
      "authorized_shop": [
        {
          "cipher":    "ROW_xxxxxxxx",          ← shopCipher per shop
          "shop_id":   "7123456789",
          "shop_name": "My TikTok US Shop"
        }
      ]
    }
  }
           │
           ▼  Extract shopCipher from data.authorized_shop[0].cipher
           │  If multiple shops → create one ChannelStoreConnection per shop
           │
           ▼
  Save to DB:
  ┌───────────────────────────────────────────────────────────────────┐
  │  credentials: {                                                   │
  │    accessToken:  "AES256GCM:...",                                 │
  │    refreshToken: "AES256GCM:...",                                 │
  │    appKey:       "AES256GCM:...",   ← needed for HMAC signing     │
  │    appSecret:    "AES256GCM:...",   ← needed for HMAC signing     │
  │    shopCipher:   "AES256GCM:..."    ← needed for all API calls    │
  │  },                                                               │
  │  tokenExpiry: {                                                   │
  │    accessToken:  "2026-03-05T10:00:00",  ← now + 86400s          │
  │    refreshToken: "2026-04-03T10:00:00"   ← now + 2592000s        │
  │  }                                                                │
  └───────────────────────────────────────────────────────────────────┘
```

#### Wireframe 4-D — What the Merchant Sees (End-to-End View)

```
  t=0s   Merchant clicks "Connect Shopify"
           │
           ▼  (their browser redirected to Shopify)
  t=2s   Merchant is on Shopify consent page
           │
           ▼  (merchant clicks "Install app")
  t=5s   Shopify redirects browser to Labamap callback URL
           │
           ▼  (backend silently: verifies, exchanges, saves — ~300ms)
  t=5.3s Merchant's browser arrives at:
           https://app.labamap.com/channels/stores?connected=shopify

  ┌──────────────────────────────────────────────────────────────────────┐
  │  Labamap  ›  Channels  ›  Stores                                    │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  ✅  Shopify store connected successfully!                           │
  │      my-brand.myshopify.com  is ready to publish products           │
  │                                                                      │
  │  Connected stores (3)                                                │
  │  ┌─────────────────────────────────────────────────────────────┐    │
  │  │ shopify  my-brand.myshopify.com  US  ● Active  Just now     │    │
  │  │ shopify  my-brand-eu.myshopify.com EU ● Active  3 days ago  │    │
  │  │ wix      www.mybrand.com         US  ● Active  2 hours ago  │    │
  │  └─────────────────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────────────────┘

  The merchant never saw a token. The merchant never copied anything.
  The backend has a real, encrypted access_token in MongoDB.
```

---

### Phase 5 — Ongoing Automatic Lifecycle

After Phase 4, credentials are in MongoDB. Every publish call goes through the
token refresh check — the merchant and developer never intervene again.

#### Wireframe 5-A — Token State Machine

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        TOKEN STATE MACHINE                             │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌────────────────┐    code exchange     ┌────────────────────────────────┐
  │  NOT CONNECTED │ ──────────────────▶  │  CONNECTED (token valid)       │
  │  (Phase 4)     │                      │                                │
  └────────────────┘                      │  tokenExpiry.accessToken       │
                                          │  = 2026-03-05T10:00:00         │
                                          └────────────────────────────────┘
                                                          │
                                         publish called   │   within buffer window
                                         token NOT expired│   (bufferMinutes before expiry)
                                                          │
                                                          ▼
                                          ┌──────────────────────────────────┐
                                          │  CONNECTED (refresh needed)      │
                                          │                                  │
                                          │  tokenExpiry < now + bufferMins  │
                                          └──────────────────────────────────┘
                                                          │
                                          GenericTokenRefreshService
                                          POST to tokenRefresh.endpoint
                                                          │
                             ┌────────────────────────────┴──────────────────┐
                             │ success                                        │ failure
                             ▼                                                ▼
                ┌─────────────────────────────┐          ┌────────────────────────────────┐
                │  CONNECTED (token refreshed) │          │  DEGRADED                      │
                │                             │          │  (fallback: stale token used,  │
                │  New token saved to DB       │          │   warning logged)              │
                │  tokenExpiry updated         │          │                                │
                └─────────────────────────────┘          │  If refresh token also expired:│
                                                          │  → set reconnectRequired=true  │
                                                          │  → frontend shows "Reconnect"  │
                                                          └────────────────────────────────┘
                                                                        │
                                                          merchant re-runs OAuth flow
                                                                        │
                                                                        ▼
                                                          CONNECTED (token valid) ←──
```

#### Wireframe 5-B — Publish Pipeline with Refresh Inline

```
  POST /api/v1/channels/publish
  { storeId: "wix-main-site", masterProductId: "prod_123", ... }
          │
          ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  ChannelPublishService.resolveStoreAndPublish()                       │
  └───────────────────────────────────────────────────────────────────────┘
          │
          ├─▶  getStore("org_123", "wix-main-site")
          │         └──▶  channel_store_connections
          │                  tokenExpiry.accessToken = "2026-03-04T09:50:00"
          │                  (10 minutes ago — EXPIRED)
          │
          ├─▶  findSystemDefaultByChannelId("wix")
          │         └──▶  tokenRefresh.enabled = true
          │               tokenRefresh.bufferMinutes = 10
          │               tokenRefresh.endpoint = "wixapis.com/oauth2/token"
          │
          ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  GenericTokenRefreshService.getValidCredentials()                     │
  │                                                                       │
  │  expiry(2026-03-04T09:50:00) < now(10:00) + 10min → REFRESH NEEDED   │
  │                                                                       │
  │  POST wixapis.com/oauth2/token                                        │
  │  { grant_type: refresh_token, client_id: ..., refresh_token: ... }   │
  │                                                                       │
  │  Response: { access_token: "eyNew...", expires_in: 3600 }            │
  │                                                                       │
  │  → re-encrypt new accessToken                                         │
  │  → store.tokenExpiry.accessToken = now + 3600s = 2026-03-04T11:00:00 │
  │  → save to DB                                                         │
  │  → return decrypted { accessToken: "eyNew...", wixSiteId: "..." }     │
  └───────────────────────────────────────────────────────────────────────┘
          │
          ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  injectDecryptedCredentials()  (data-driven via credentialMapping)    │
  │                                                                       │
  │  credentialMapping: { accessToken→token, wixSiteId→wix-site-id }     │
  │                                                                       │
  │  customOptions = {                                                    │
  │    token:       "eyNew...",        ← mapped from accessToken          │
  │    wix-site-id: "1234-abcd-...",   ← mapped from wixSiteId           │
  │    storeId:     "wix-main-site",   ← always injected                 │
  │    storeUrl:    "www.mybrand.com", ← always injected                 │
  │    credentials: { accessToken, wixSiteId, ... }  ← full map         │
  │  }                                                                    │
  └───────────────────────────────────────────────────────────────────────┘
          │
          ▼
  Merge channelData → JOLT transform → POST to WIX API → update status
```

---

## Part 2: Channel-by-Channel Token Exchange Details

Each marketplace has a different token exchange endpoint and response shape.

### Shopify

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  SHOPIFY  OAuth 2.0 — Permanent Token                               │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Authorization URL                                                   │
  │  https://{shop}/admin/oauth/authorize                                │
  │    ?client_id={APP_CLIENT_ID}                                        │
  │    &scope=write_products,read_products,write_inventory               │
  │    &redirect_uri=https://api.labamap.com/.../callback/shopify        │
  │    &state={STATE}                                                    │
  │                                                                      │
  │  Token Exchange                                                      │
  │  POST https://{shop}/admin/oauth/access_token                        │
  │  { client_id, client_secret, code }                                  │
  │                                                                      │
  │  Response: { "access_token": "shpat_xxx", "scope": "..." }          │
  │                                                                      │
  │  Token lifetime: PERMANENT (no refresh token issued)                │
  │  Verification:   HMAC-SHA256 of sorted query params                  │
  └──────────────────────────────────────────────────────────────────────┘
```

### WIX

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  WIX  OAuth 2.0 — Short-Lived + Refresh Token                       │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Authorization URL                                                   │
  │  https://www.wix.com/installer/install                               │
  │    ?appId={APP_CLIENT_ID}&redirectUrl={CALLBACK_URL}&state={STATE}   │
  │                                                                      │
  │  Callback params: code, instanceId (= wixSiteId), state              │
  │                                                                      │
  │  Token Exchange                                                      │
  │  POST https://www.wixapis.com/oauth/access                           │
  │  { grant_type: "authorization_code", client_id, client_secret, code }│
  │                                                                      │
  │  Response:                                                           │
  │  { "access_token": "...", "refresh_token": "...",                   │
  │    "expires_in": 3600 }                                              │
  │                                                                      │
  │  Token lifetime: 1 hour  │  Refresh token: indefinite               │
  │  Verification: State nonce                                           │
  └──────────────────────────────────────────────────────────────────────┘
```

### TikTok Shop

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  TIKTOK SHOP  OAuth 2.0 + HMAC Signing                              │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Authorization URL                                                   │
  │  https://auth.tiktok-shops.com/oauth/authorize                       │
  │    ?app_key={APP_KEY}&state={STATE}                                  │
  │                                                                      │
  │  Token Exchange                                                      │
  │  POST https://auth.tiktok-shops.com/api/v2/token/get                 │
  │  { app_key, app_secret, auth_code, grant_type: "authorized_code" }  │
  │                                                                      │
  │  Response:                                                           │
  │  { "data": {                                                         │
  │      "access_token": "...",  "refresh_token": "...",                │
  │      "access_token_expire_in":  86400,   ← 24 hours                 │
  │      "refresh_token_expire_in": 2592000, ← 30 days                  │
  │      "authorized_shop": [{ "cipher": "ROW_xxx" }]  ← shopCipher     │
  │    } }                                                               │
  │                                                                      │
  │  Token lifetime: 24h access / 30d refresh                           │
  │  Verification: sign param (HMAC-SHA256)                              │
  └──────────────────────────────────────────────────────────────────────┘
```

### Amazon (SP-API)

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  AMAZON SP-API  LWA (Login With Amazon) OAuth                       │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Authorization URL                                                   │
  │  https://sellercentral.amazon.com/apps/authorize/consent             │
  │    ?application_id={APP_CLIENT_ID}&state={STATE}&version=beta        │
  │                                                                      │
  │  Callback params: spapi_oauth_code (NOT "code"), state, selling_partner_id
  │                                                                      │
  │  Token Exchange                                                      │
  │  POST https://api.amazon.com/auth/o2/token                           │
  │  { grant_type: "authorization_code",                                 │
  │    code: spapi_oauth_code,                                           │
  │    redirect_uri, client_id: LWA_CLIENT_ID,                          │
  │    client_secret: LWA_CLIENT_SECRET }                                │
  │                                                                      │
  │  Response: { "access_token": "...", "refresh_token": "...",         │
  │              "expires_in": 3600 }                                    │
  │                                                                      │
  │  Token lifetime: 1 hour  │  Refresh token: 1 year                   │
  │  Verification: State nonce                                           │
  └──────────────────────────────────────────────────────────────────────┘
```

### eBay

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  EBAY  OAuth 2.0 — Basic Auth Token Exchange                        │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Authorization URL                                                   │
  │  https://auth.ebay.com/oauth2/authorize                              │
  │    ?client_id={CLIENT_ID}&redirect_uri={RU_NAME}                     │
  │    &response_type=code&scope={SCOPES}&state={STATE}                  │
  │                                                                      │
  │  Token Exchange                                                      │
  │  POST https://api.ebay.com/identity/v1/oauth2/token                  │
  │  Headers: Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)       │
  │  Body: grant_type=authorization_code&code={code}&redirect_uri={RU}  │
  │                                                                      │
  │  Response: { "access_token": "...", "refresh_token": "...",         │
  │              "expires_in": 7200,                                     │
  │              "refresh_token_expires_in": 47304000 }                  │
  │                                                                      │
  │  Token lifetime: 2 hours  │  Refresh token: 18 months               │
  │  Verification: State nonce                                           │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Current System Analysis

### What Is Implemented

| Capability | Status | Location |
|-----------|--------|----------|
| Credential storage (encrypted) | ✅ Done | `CredentialEncryptionService` |
| Manual credential save (copy-paste flow) | ✅ Done | `POST /channel-stores` |
| Token auto-refresh on publish | ✅ Done | `GenericTokenRefreshService` |
| Data-driven credential injection | ✅ Done | `ChannelPublishService.injectDecryptedCredentials()` |
| Credential rotation endpoint | ✅ Done | `PATCH /{storeId}/credentials` |
| OAuth callback endpoint (struct) | ✅ Stub | `OAuthCallbackController + OAuthCallbackService` |
| OAuth state decode | ✅ Done | `OAuthCallbackService.decodeState()` |
| Callback → save store | ✅ Done (with code placeholder) | `OAuthCallbackService.handleCallback()` |

### What Is a Stub or Missing

| Capability | Gap | Impact |
|-----------|-----|--------|
| **App credentials config** | No `app.oauth.{channel}.clientId/secret` in yml | Token exchange cannot proceed — no app secret to send |
| **OAuth initiation endpoint** | No `GET /oauth/initiate` | Frontend has no URL to redirect merchants to |
| **State nonce / CSRF guard** | No nonce storage/verification | State decoded but not verified against server-side store |
| **HMAC verification (Shopify)** | Callback skips HMAC check | Callbacks can be forged — security vulnerability |
| **Code → token exchange** | `OAuthCallbackService` saves raw `code`, not real tokens | Stored credentials are not usable; publish will fail |
| **Channel-specific exchange logic** | No per-channel POST to `/oauth/token` endpoint | Each channel has different request format and response shape |
| **tokenExpiry write on connect** | Token exchange doesn't set `tokenExpiry` | First refresh cycle has no baseline |
| **Uninstall / deauthorize webhook** | No endpoint for app_uninstalled events | Store stays "active" in DB after merchant uninstalls |
| **Multi-shop handling (TikTok)** | `shopCipher` not extracted from token response | TikTok connections missing the cipher |

#### Wireframe 3-A — Current System Gap Visualised

```
  CURRENT STATE                         MISSING (GAP)
  ─────────────────────────────────     ─────────────────────────────────────
                                        ┌─────────────────────────────────┐
                                        │  Phase A: OAuthAppConfig        │
                                        │  SHOPIFY_APP_CLIENT_ID/SECRET   │
                                        │  WIX_APP_CLIENT_ID/SECRET       │
                                        │  TIKTOK_APP_KEY/SECRET          │
                                        └────────────────┬────────────────┘
                                                         │
  ✅ POST /channel-stores                                │ needed for
      (manual copy-paste)                                ▼
                                        ┌─────────────────────────────────┐
                                        │  Phase B: GET /oauth/initiate   │
                                        │  → generate nonce               │
                                        │  → build authorizationUrl       │
                                        └────────────────┬────────────────┘
                                                         │
                                                         ▼
  ✅ GET /oauth/callback/{channelType}   ┌─────────────────────────────────┐
      (struct exists)                   │  Phase C: OAuthTokenExchange    │
      but:                              │  → verify HMAC/nonce            │
      ❌ saves raw code instead         │  → POST to marketplace          │
         of real token          ──────▶ │  → save real accessToken        │
      ❌ no HMAC verification           │  → set tokenExpiry              │
      ❌ no nonce check                 └────────────────┬────────────────┘
                                                         │
  ✅ GenericTokenRefreshService                          │
      (auto-refresh works once                           ▼
       real token is stored)           ┌─────────────────────────────────┐
                                        │  Phase D: Uninstall Webhooks    │
                                        │  POST /webhooks/shopify/...     │
                                        │  → deactivate store in DB       │
                                        └────────────────┬────────────────┘
                                                         │
                                                         ▼
                                        ┌─────────────────────────────────┐
                                        │  Phase E: reconnectRequired     │
                                        │  flag + audit log               │
                                        └─────────────────────────────────┘
```

---

## Part 4: Phased Implementation Plan

### Phase A — App Credential Configuration (Foundation)
*Prerequisite for all OAuth phases. No code change to service layer.*

**Goal:** Store platform-level app credentials (clientId/secret) as server config.

#### Wireframe A — OAuthAppConfig Architecture

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  application.yml  (env-var backed, never committed)                 │
  │                                                                      │
  │  app.oauth:                                                          │
  │    shopify:                                                          │
  │      client-id:              ${SHOPIFY_APP_CLIENT_ID}               │
  │      client-secret:          ${SHOPIFY_APP_CLIENT_SECRET}           │
  │      authorization-endpoint: https://{shop}/admin/oauth/authorize   │
  │      token-endpoint:         https://{shop}/admin/oauth/access_token│
  │      scopes:                 "write_products,read_products"          │
  │    wix:                                                              │
  │      client-id:              ${WIX_APP_CLIENT_ID}                   │
  │      ...                                                             │
  └───────────────────────────┬──────────────────────────────────────────┘
                               │  @ConfigurationProperties
                               ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  OAuthAppConfig.java                                                 │
  │                                                                      │
  │  @ConfigurationProperties("app.oauth")                               │
  │  public class OAuthAppConfig {                                       │
  │    Map<String, ChannelOAuthConfig> channels;                         │
  │                                                                      │
  │    public ChannelOAuthConfig getChannel(String channelType) { ... }  │
  │                                                                      │
  │    @Data                                                             │
  │    public static class ChannelOAuthConfig {                          │
  │      String clientId;                                                │
  │      String clientSecret;                                            │
  │      String authorizationEndpoint;                                   │
  │      String tokenEndpoint;                                           │
  │      String scopes;                                                  │
  │    }                                                                 │
  │  }                                                                   │
  └───────────────────────┬──────────────────────────────────────────────┘
                           │  @Autowired into
                           ├──▶  OAuthInitiationService   (Phase B)
                           └──▶  OAuthTokenExchangeService (Phase C)
```

**Tasks:**
1. Add `OAuthAppConfig.java` — `@ConfigurationProperties("app.oauth")` bean
2. Add config entries in `application.yml` for each channel (backed by env vars)
3. Add `ChannelConfiguration.OAuthAppConfig` nested class so OAuth endpoints can optionally be driven from MongoDB instead of yml

**Deliverable:** `OAuthAppConfig` bean injectable into any service that needs to perform token exchange.

---

### Phase B — OAuth Initiation Endpoint
*Enables merchant to start the connect flow from the frontend with one click.*

**Goal:** Backend generates the authorization URL and returns it (or redirects) to frontend.

#### Wireframe B — Initiation Service Design

```
  GET /api/v1/oauth/initiate
    ?channelType=shopify
    &shop=my-brand.myshopify.com      ← required for Shopify (per-shop URL)
    &organizationId=org_123
    &storeName=My+US+Store
    &region=US
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  OAuthInitiationService.buildAuthorizationUrl()                     │
  │                                                                      │
  │  1. Generate nonce = UUID.randomUUID().toString()                   │
  │                                                                      │
  │  2. Save nonce to DB:                                                │
  │     oauth_state_nonces {                                             │
  │       nonce: "a7f3k9...",                                           │
  │       organizationId: "org_123",                                    │
  │       channelType: "shopify",                                        │
  │       createdAt: now(),                                              │
  │       expiresAt: now() + 10min,    ← TTL index                      │
  │       consumed: false                                                │
  │     }                                                                │
  │                                                                      │
  │  3. Build state:                                                     │
  │     state = base64(JSON({ orgId, storeName, region, nonce }))       │
  │                                                                      │
  │  4. Build authorization URL from OAuthAppConfig + state:            │
  │     https://my-brand.myshopify.com/admin/oauth/authorize            │
  │       ?client_id=APP_CLIENT_ID                                       │
  │       &scope=write_products,read_products,write_inventory            │
  │       &redirect_uri=https://api.labamap.com/.../callback/shopify    │
  │       &state=BASE64(...)                                             │
  │                                                                      │
  │  5. Return { authorizationUrl: "https://my-brand..." }              │
  │     (or 302 redirect for Shopify embedded app scenarios)            │
  └──────────────────────────────────────────────────────────────────────┘

  New MongoDB collection: oauth_state_nonces
  ┌────────────────────┬─────────────┬─────────────┬───────────┬──────────┐
  │ nonce              │ orgId       │ channelType │ expiresAt │ consumed │
  ├────────────────────┼─────────────┼─────────────┼───────────┼──────────┤
  │ "a7f3k9..."        │ "org_123"   │ "shopify"   │ +10min    │ false    │
  │ "b9x2m4..."        │ "org_456"   │ "wix"       │ +10min    │ true     │
  └────────────────────┴─────────────┴─────────────┴───────────┴──────────┘
  TTL index on expiresAt — MongoDB auto-deletes expired nonces
```

**Tasks:**
1. Create `OAuthInitiationService.buildAuthorizationUrl(channelType, orgId, storeName, region, shop)`
2. Create `OAuthStateNonce` MongoDB document + repository
3. Add `OAuthController.initiateOAuth(...)` → `GET /api/v1/oauth/initiate`

**Deliverable:** Frontend can redirect merchant to marketplace OAuth page with a single API call.

---

### Phase C — Secure Callback & Code Exchange
*The most critical phase — this is where real tokens are obtained.*

**Goal:** Receive the OAuth callback, verify it, exchange the code for real tokens, save to DB.

#### Wireframe C-1 — Updated Callback Flow

```
  GET /api/v1/oauth/callback/shopify?code=abc&hmac=xyz&shop=...&state=...
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  OAuthCallbackService.handleCallback()  ← updated from stub         │
  │                                                                      │
  │  1. verifyHmac(queryParams, APP_CLIENT_SECRET)                       │
  │     HMAC = HMAC-SHA256(sortedQueryWithoutHmac, secret)               │
  │     ❌ mismatch → 400 Bad Request                                    │
  │                                                                      │
  │  2. decodeState(state) → { orgId, storeName, region, nonce }        │
  │                                                                      │
  │  3. verifyNonce(nonce) → lookup in oauth_state_nonces                │
  │     ❌ not found or consumed → 400 Bad Request                       │
  │     ✅ found → mark consumed                                          │
  │                                                                      │
  │  4. OAuthTokenExchangeService.exchangeCode(                          │
  │       channelType="shopify", code="abc123", shop="my-brand...")      │
  │       ↓                                                              │
  │     POST https://my-brand.../admin/oauth/access_token               │
  │     { client_id, client_secret, code }                               │
  │       ↓                                                              │
  │     TokenExchangeResult {                                            │
  │       accessToken:  "shpat_xxx",                                    │
  │       refreshToken: null,        ← Shopify has no refresh token     │
  │       expiresIn:    null,        ← Shopify token never expires      │
  │       extras: {}                                                     │
  │     }                                                                │
  │                                                                      │
  │  5. buildCredentials(channelType, result, callbackParams):          │
  │     { accessToken: "shpat_xxx" }                                    │
  │                                                                      │
  │  6. encryptAll(credentials) → save to channel_store_connections     │
  │     set tokenExpiry if expiresIn present                            │
  │                                                                      │
  │  7. 302 → https://app.labamap.com/channels/stores?connected=shopify │
  └──────────────────────────────────────────────────────────────────────┘
```

#### Wireframe C-2 — OAuthTokenExchangeService Design

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  OAuthTokenExchangeService                                           │
  │                                                                      │
  │  exchangeCode(channelType, code, callbackParams)                     │
  │       │                                                              │
  │       ├─ "shopify"    → exchangeShopifyCode(code, shop)              │
  │       │                  POST {shop}/admin/oauth/access_token        │
  │       │                  { client_id, client_secret, code }          │
  │       │                  → { access_token }                          │
  │       │                                                              │
  │       ├─ "wix"        → exchangeWixCode(code)                        │
  │       │                  POST wixapis.com/oauth/access               │
  │       │                  { grant_type, client_id, client_secret,     │
  │       │                    code }                                    │
  │       │                  → { access_token, refresh_token,            │
  │       │                       expires_in }                           │
  │       │                  extras: { wixSiteId: callback.instanceId }  │
  │       │                                                              │
  │       ├─ "tiktokshop" → exchangeTikTokCode(code)                     │
  │       │                  POST auth.tiktok-shops.com/.../token/get    │
  │       │                  { app_key, app_secret, auth_code,           │
  │       │                    grant_type }                               │
  │       │                  → { data.access_token, data.refresh_token,  │
  │       │                       data.access_token_expire_in,           │
  │       │                       data.authorized_shop[0].cipher }       │
  │       │                  extras: { shopCipher, appKey, appSecret }   │
  │       │                                                              │
  │       ├─ "amazon"     → exchangeAmazonCode(spaCode, sellerId)        │
  │       │                  POST api.amazon.com/auth/o2/token           │
  │       │                  { grant_type, code: spapi_oauth_code,       │
  │       │                    client_id, client_secret, redirect_uri }  │
  │       │                  extras: { sellerId }                        │
  │       │                                                              │
  │       └─ "ebay"       → exchangeEbayCode(code)                       │
  │                          POST api.ebay.com/identity/v1/oauth2/token  │
  │                          Headers: Basic base64(clientId:secret)      │
  │                          Body: grant_type=authorization_code&code=...│
  │                                                                      │
  │  Returns: TokenExchangeResult {                                      │
  │    accessToken:  String                                              │
  │    refreshToken: String (null if channel doesn't issue one)         │
  │    expiresIn:    Long   (seconds, null if permanent)                │
  │    refreshExpiresIn: Long (seconds, null if unknown)                │
  │    extras:       Map<String, String>  (shopCipher, wixSiteId, etc.) │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘
```

**Tasks:**
1. Nonce verification in `OAuthCallbackService`
2. HMAC/signature verification per channel
3. `OAuthTokenExchangeService` with per-channel exchange methods
4. Update `OAuthCallbackService.handleCallback()` to call exchange + save real tokens
5. Set `tokenExpiry` from `expiresIn` at save time

**Deliverable:** After clicking "Allow" in the marketplace, the merchant has a connected store with real working tokens, with no manual copy-paste.

---

### Phase D — Uninstall & Deauthorization Webhooks
*Keeps the system in sync when merchants remove the app from the marketplace side.*

**Goal:** Auto-deactivate the store connection when a merchant uninstalls the app.

#### Wireframe D — Webhook Handling Flow

```
  Merchant in Shopify Admin:                 Shopify servers:
  "Apps" → "Uninstall Labamap"
         │
         ▼
  Shopify sends webhook:
  ┌─────────────────────────────────────────────────────────────────┐
  │  POST https://api.labamap.com/labamap/api/v1/webhooks/shopify/  │
  │       app-uninstalled                                           │
  │                                                                 │
  │  Headers:                                                       │
  │    X-Shopify-Topic: app/uninstalled                             │
  │    X-Shopify-Hmac-SHA256: base64(HMAC of body)                  │
  │    X-Shopify-Shop-Domain: my-brand.myshopify.com                │
  │                                                                 │
  │  Body:                                                          │
  │  { "id": 123456, "myshopify_domain": "my-brand.myshopify.com" }│
  └─────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  WebhookController.shopifyAppUninstalled()                       │
  │                                                                  │
  │  1. Verify HMAC: SHA256(body, APP_CLIENT_SECRET)                 │
  │     ❌ mismatch → 401 Unauthorized                               │
  │                                                                  │
  │  2. Extract shop domain from body or header                      │
  │                                                                  │
  │  3. Find store:                                                  │
  │     repository.findByChannelTypeAndStoreUrl("shopify", domain)  │
  │                                                                  │
  │  4. Deactivate:                                                  │
  │     store.isActive = false                                       │
  │     store.disconnectedAt = now()                                 │
  │     store.disconnectReason = "app_uninstalled"                   │
  │     repository.save(store)                                       │
  │                                                                  │
  │  5. 200 OK (marketplace expects quick 200 or retries)           │
  └──────────────────────────────────────────────────────────────────┘
         │
         ▼
  Next time merchant opens Labamap:
  ┌──────────────────────────────────────────────────────────────────┐
  │  Connected stores                                                │
  │                                                                  │
  │  shopify  my-brand.myshopify.com  ⚠ Disconnected  [ Reconnect ] │
  │  wix      www.mybrand.com         ● Active                      │
  └──────────────────────────────────────────────────────────────────┘

  New webhook endpoints to register (during Phase A app registration):
  ┌──────────────────────────────────────────────────────────────────┐
  │  Shopify:     POST /webhooks/shopify/app-uninstalled             │
  │  TikTok Shop: POST /webhooks/tiktokshop/deauthorize             │
  │  WIX:         POST /webhooks/wix/app-removed                    │
  │  Amazon:      POST /webhooks/amazon/app-deauthorized            │
  │  eBay:        POST /webhooks/ebay/marketplace-account-deletion  │
  └──────────────────────────────────────────────────────────────────┘
```

**Tasks:**
1. `WebhookController` with endpoints per channel
2. Webhook signature verification per channel
3. On verified event: `deactivateStore()` + set `disconnectReason`
4. Register webhook URLs in developer portals

**Deliverable:** Store auto-deactivated when merchant uninstalls; no stale credentials in DB.

---

### Phase E — Full Lifecycle Polish
*Operational hardening for production readiness.*

#### Wireframe E — Full Store Card States in Frontend

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Possible states of a store card in the UI after Phase E               │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │ ● Active                                                           │
  │ shopify  my-brand.myshopify.com   US   Last sync: 2 hours ago      │
  │                                        [ Publish ]  [ Settings ]   │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │ ⚠ Reconnect Required                                               │
  │ wix  www.mybrand.com   US   Refresh token expired — re-authorize   │
  │                                        [ Reconnect ▶ ]             │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │ ○ Disconnected                                                     │
  │ tiktokshop  my-shop   US   Uninstalled from TikTok Shop            │
  │                                        [ Reconnect ▶ ]             │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │ ○ Inactive                                                         │
  │ amazon  mystore   EU   Manually deactivated                        │
  │                                        [ Reactivate ] [ Delete ]   │
  └────────────────────────────────────────────────────────────────────┘

  Driven by new fields on ChannelStoreConnection:
  ┌───────────────────────┬───────────────┬────────────────────────────┐
  │  isActive             │ reconnectReq  │  State shown               │
  ├───────────────────────┼───────────────┼────────────────────────────┤
  │  true                 │  false        │  ● Active                  │
  │  true                 │  true         │  ⚠ Reconnect Required      │
  │  false (webhook)      │  —            │  ○ Disconnected            │
  │  false (manual)       │  —            │  ○ Inactive                │
  └───────────────────────┴───────────────┴────────────────────────────┘
```

**Tasks:**
1. `reconnectRequired: Boolean` field on `ChannelStoreConnection`
2. `GenericTokenRefreshService` sets `reconnectRequired = true` when refresh token is also expired
3. `GET /channel-stores` response includes `reconnectRequired`
4. Audit log collection `oauth_audit_log` — timestamp, orgId, channelType, event (CONNECTED / REFRESHED / REFRESH_FAILED / DISCONNECTED / RECONNECTED), no credential values

---

## Part 5: Summary — Current State vs Target State

```
                        NOW                         TARGET (after all phases)
                        ─────────────────────────── ──────────────────────────────────

Merchant connects:      Copy-paste tokens from      Click "Connect" → authorize in
                        developer portal manually   marketplace → done automatically
                                                    (Phase B + C)

Token obtained by:      Developer / merchant        Backend via code exchange
                                                    (Phase C)

Token refresh:          ✅ Automatic                ✅ Already done
                           (implemented)

Callback handling:      Saves raw auth code,        Saves real access token from
                        not real tokens (stub)      exchange response
                                                    (Phase C)

CSRF protection:        State decoded only,         Nonce stored + verified
                        no nonce verification       (Phase B + C)

HMAC verification:      ❌ Not implemented          ✅ Per-channel signature verify
                                                    (Phase C)

App uninstall:          Store stays active          Auto-deactivate via webhook
                                                    (Phase D)

Reconnect prompt:       None                        reconnectRequired flag + UI badge
                                                    (Phase E)

Scope management:       Manual                      Defined in OAuthAppConfig
                                                    (Phase A)

Audit trail:            None                        oauth_audit_log collection
                                                    (Phase E)
```

---

## Part 6: Quick Reference — OAuth Endpoints Per Channel

| Channel | Authorization URL | Token Exchange URL | Callback Verification |
|---------|------------------|-------------------|----------------------|
| Shopify | `https://{shop}/admin/oauth/authorize` | `POST https://{shop}/admin/oauth/access_token` | HMAC-SHA256 of query params |
| WIX | `https://www.wix.com/installer/install` | `POST https://www.wixapis.com/oauth/access` | State nonce |
| TikTok Shop | `https://auth.tiktok-shops.com/oauth/authorize` | `POST https://auth.tiktok-shops.com/api/v2/token/get` | Sign param |
| Amazon SP-API | `https://sellercentral.amazon.com/apps/authorize/consent` | `POST https://api.amazon.com/auth/o2/token` | State nonce |
| eBay | `https://auth.ebay.com/oauth2/authorize` | `POST https://api.ebay.com/identity/v1/oauth2/token` | State nonce |
| Lazada | `https://auth.lazada.com/oauth/authorize` | `POST https://auth.lazada.com/rest/auth/token/create` | HMAC-SHA256 |
| Shopee | `https://partner.shopeemobile.com/api/v2/shop/auth_partner` | (code in callback URL, no exchange) | HMAC-SHA256 |
| Tokopedia | `https://accounts.tokopedia.com/oauth/authorize` | `POST https://accounts.tokopedia.com/token` | State nonce |
| Facebook | `https://www.facebook.com/v19.0/dialog/oauth` | `GET https://graph.facebook.com/v19.0/oauth/access_token` | State nonce |
| Walmart | N/A (client credentials) | `POST https://marketplace.walmartapis.com/v3/token` | N/A |

---

## Related Files

| File | Topic |
|------|-------|
| `03-connect-store-flow.md` | Current manual connect flow |
| `04-channel-credentials-guide.md` | How to get credentials manually per channel |
| `05-publish-pipeline-integration.md` | How credentials flow into publish |
| `07-token-expiry-strategy.md` | Token refresh implementation (GenericTokenRefreshService) |
| `OAuthCallbackService.java` | Current stub callback handler (Phase C target) |
| `GenericTokenRefreshService.java` | Refresh-on-demand (Phase 5, already done) |
| `ChannelConfigurationDataLoader.java` | TokenRefreshConfig per channel |
