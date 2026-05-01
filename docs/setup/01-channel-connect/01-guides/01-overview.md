# Channel Connect — Overview

This module manages the lifecycle of marketplace store connections: credential storage, multi-tenant isolation, publish-time credential injection, and automatic OAuth token refresh.

Module root (backend): `com.labamap.labamapomnichannelbe4fe.channel.store`
Module root (frontend): `src/modules/ecommerce-product-v2/step2-channel-fields/` + `src/modules/channel-platform/`

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  FRONTEND (Next.js)                       │
│                                                           │
│  ChannelStoresDashboard                                   │
│    ├── ConnectStoreModal  ──► StoreConnectionRequest      │
│    └── StoreCard (per connected store)                    │
└───────────────────────┬──────────────────────────────────┘
                        │  HTTPS
                        ▼
┌──────────────────────────────────────────────────────────┐
│              BACKEND (Spring Boot / Java)                 │
│                                                           │
│  POST /api/v1/channel-stores                             │
│    ├── Validate channelType                              │
│    ├── Duplicate check (channelType + storeUrl + orgId)  │
│    ├── Encrypt credentials (AES-256-GCM)                 │
│    └── Save to MongoDB → return masked response          │
│                                                           │
│  GET /api/v1/channel-stores  (credentials masked)        │
│                                                           │
│  POST /api/v1/channels/publish  (storeId triggers        │
│    GenericTokenRefreshService + credential injection)    │
└───────────────────────┬──────────────────────────────────┘
                        │  HTTPS API calls
                        ▼
           ┌───────────────────────────┐
           │   Marketplace APIs        │
           │  Shopify / Amazon /       │
           │  TikTok / eBay / ...      │
           └───────────────────────────┘
```

---

## MongoDB Data Model

**Collection:** `channel_store_connections`

**Compound indexes:**
| Index | Fields | Unique |
|-------|--------|--------|
| `org_store_unique_idx` | `organizationId + storeId` | Yes |
| `org_channel_idx` | `organizationId + channelType` | No |

Duplicate prevention is also enforced in service code: `existsByOrganizationIdAndChannelTypeAndStoreUrl()` → `409 Conflict`.

**Document at rest:**
```json
{
  "_id":           "66b1a2c3d4e5f6g7h8i9j0k1",
  "storeId":       "shopify-my-brand-us-store",
  "channelType":   "shopify",
  "storeName":     "My Brand US Store",
  "storeUrl":      "my-brand.myshopify.com",
  "region":        "US",
  "organizationId":"org_123",
  "credentials": {
    "accessToken":  "AES256GCM:A3k9xPqR...",
    "apiKey":       "AES256GCM:Bx7mLwQp...",
    "apiSecret":    "AES256GCM:Cz2nRvTs..."
  },
  "tokenExpiry": {
    "accessToken": "2026-05-01T10:00:00"
  },
  "isActive":      true,
  "displayOrder":  1,
  "connectedAt":   "2026-01-15T08:00:00Z",
  "lastSyncedAt":  "2026-04-28T14:30:00Z"
}
```

`tokenExpiry` is written by `GenericTokenRefreshService` after each successful token refresh. Only channels with auto-refresh populate this field.

---

## Security Principles

1. **Credentials are encrypted before `save()`** — `CredentialEncryptionService.encryptAll()` is called in `connectStore()`, `updateCredentials()`, and after every token refresh.
2. **API responses always mask credentials** — `ChannelStoreConnectionResponse.from()` replaces all credential values with `"***MASKED***"`.
3. **Decrypted credentials never leave the service layer** — `GenericTokenRefreshService` decrypts in-memory for the request lifetime only.
4. **Token refresh is automatic** — `GenericTokenRefreshService` checks `tokenExpiry` before each publish and refreshes inline when within `bufferMinutes` of expiry. No background job needed.
5. **Tenant isolation** — every query includes `organizationId`.
6. **Duplicate prevention** — same `channelType + storeUrl` for the same `organizationId` returns `409 Conflict`.

---

## Supported Channels

| Channel | Auth Model | Credential Keys | Auto-Refresh |
|---------|-----------|-----------------|-------------|
| `shopify` | Static Admin API token | `accessToken`, `apiKey`, `apiSecret` | No — tokens never expire |
| `wix` | OAuth 2.0 | `accessToken`, `refreshToken`, `wixSiteId`, `clientId` | Yes |
| `amazon` | LWA + SigV4 | `sellerId`, `marketplaceId`, `accessKey`, `secretKey` | Not yet |
| `ebay` | OAuth 2.0 | `accessToken`, `refreshToken`, `siteId` | Not yet |
| `tiktokshop` | OAuth 2.0 + HMAC | `appKey`, `appSecret`, `accessToken`, `refreshToken`, `shopCipher` | Yes |
| `lazada` | OAuth + App Key signing | `accessToken`, `appKey`, `appSecret` | Not yet |
| `tokopedia` | OAuth 2.0 | `accessToken`, `shopId` | Not yet |
| `shopee` | HMAC request signing | `accessToken`, `shopId`, `partnerId`, `partnerKey` | No — HMAC, no token refresh |
| `facebook` | System user token | `accessToken`, `catalogId` | No — manual rotation |
| `walmart` | Client credentials | `clientId`, `clientSecret` | Per-call (15 min tokens) |

---

## Token Lifetimes

| Channel | Access Token Expiry | Refresh Token Expiry |
|---------|--------------------|-----------------------|
| Shopify | Never | N/A |
| Wix | ~1 hour | Indefinite |
| Amazon SP-API | 1 hour | 1 year |
| eBay | 2 hours | 18 months |
| TikTok Shop | Varies | Varies |
| Lazada | 30 days | ~90 days |
| Tokopedia | ~1 hour | Varies |
| Shopee | 4 hours | N/A (re-authorize) |
| Facebook | 60 days | N/A |
| Walmart | 15 minutes | N/A (client credentials) |

---

## Connection to the Publish Pipeline

When `POST /api/v1/channels/publish` is called with a `storeId`, the publish service:

1. Loads `ChannelStoreConnection` by `storeId`
2. Loads `ChannelConfiguration` (system default) for the store's `channelType`
3. Calls `GenericTokenRefreshService.getValidCredentials()` — refreshes if needed
4. Injects decrypted credentials into `publishOptions.customOptions` via `credentialMapping`
5. `ChannelAttributeConverterService.buildChannelCredentials()` reads from `customOptions`

See `docs/02-ecommerce-wizard/02-api-reference/05-step3-publish-and-pattern-matching.md` for the full publish pipeline.

---

## Connect Flow (End-to-End)

```
1. User clicks "+ Connect Store" → ConnectStoreModal opens
2. Selects channelType → credential fields update dynamically
3. Pastes credentials → clicks "Connect Store"
4. handleSubmit() → onConnect(StoreConnectionRequest)
5. ChannelStoresDashboard.handleConnect()
   → ChannelStoreService.connectStore(orgId, request)
   → POST /api/v1/channel-stores?organizationId=org_123
6. Backend: validate → duplicate check → encrypt → save → return masked
7. Frontend: optimistic update — new StoreCard appears immediately
```

**Error responses:** `400` unknown channelType · `409` duplicate store · `500` encryption/DB error
