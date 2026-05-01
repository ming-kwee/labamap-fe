# Stores-Connect Module Documentation

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store`
**Collection:** `channel_store_connections`
**Base URL:** `http://localhost:8888/labamap/api/v1/channel-stores`

---

## Documents

| # | File | Topic |
|---|------|-------|
| 01 | [01-overview.md](./01-overview.md) | Module structure, endpoints, security rules |
| 02 | [02-credential-encryption.md](./02-credential-encryption.md) | AES-256-GCM encryption, key management, rotation |
| 03 | [03-connect-store-flow.md](./03-connect-store-flow.md) | End-to-end connect flow, credential fields per channel |
| 04 | [04-channel-credentials-guide.md](./04-channel-credentials-guide.md) | How to obtain credentials from each marketplace |
| 05 | [05-publish-pipeline-integration.md](./05-publish-pipeline-integration.md) | How store creds flow into the publish pipeline |
| 06 | [06-api-reference.md](./06-api-reference.md) | Full REST API reference with request/response examples |
| 07 | [07-token-expiry-strategy.md](./07-token-expiry-strategy.md) | Token lifetimes, refresh-on-demand, Walmart/Shopee |
| 08 | [08-oauth-full-automation.md](./08-oauth-full-automation.md) | Full OAuth lifecycle: install → code exchange → auto-refresh; gap analysis + phased plan |
| 09 | [09-oauth-phases-a-to-e-implementation.md](./09-oauth-phases-a-to-e-implementation.md) | Implementation summary for Phases A–E: all files, endpoints, MongoDB fields, audit events |

---

## Quick Reference

### Connect a Store

```http
POST /labamap/api/v1/channel-stores?organizationId=org_123
Content-Type: application/json

{
  "channelType": "shopify",
  "storeName": "My US Store",
  "storeUrl": "my-brand.myshopify.com",
  "region": "US",
  "credentials": {
    "accessToken": "shpat_xxx",
    "apiKey": "xxx",
    "apiSecret": "xxx"
  }
}
```

### List Stores

```http
GET /labamap/api/v1/channel-stores?organizationId=org_123
GET /labamap/api/v1/channel-stores?organizationId=org_123&channelType=shopify
```

### Rotate Credentials

```http
PATCH /labamap/api/v1/channel-stores/{storeId}/credentials?organizationId=org_123
Content-Type: application/json

{ "accessToken": "shpat_new", "apiKey": "same", "apiSecret": "same" }
```

### Deactivate a Store

```http
PUT /labamap/api/v1/channel-stores/{storeId}/deactivate?organizationId=org_123
```

---

## What Was Implemented (2026-02-25)

Starting from a basic scaffold (`entity`, `repository`, `service`, `controller`), the following was added:

1. **`CredentialEncryptionService`** — AES-256-GCM encrypt/decrypt/maskAll for credentials at rest
2. **`DuplicateStoreException`** — 409 Conflict when same channelType+storeUrl already exists
3. **`ChannelConnectionException`** — 400/401 for credential validation failures
4. **Repository query** — `existsByOrganizationIdAndChannelTypeAndStoreUrl()` for duplicate detection
5. **Service updates**:
   - `connectStore()` now checks duplicates + encrypts credentials before save
   - `updateCredentials()` — new method to rotate credentials (PATCH endpoint)
   - `getDecryptedCredentials()` — internal-only decryption for publish pipeline
6. **Controller updates**:
   - `GET` supports optional `?channelType=` filter
   - `PATCH /{storeId}/credentials` — new endpoint for credential rotation
   - `409 Conflict` response for `DuplicateStoreException`
7. **`application.yml`** — `app.credential.key` configuration (env-var backed)
8. **This documentation**

## Data-Driven Token Refresh (2026-03-04)

9. **`GenericTokenRefreshService`** — data-driven OAuth token refresh; all logic read from `ChannelConfiguration.TokenRefreshConfig`; no channel-type `if/switch` in service code
10. **`ChannelConfiguration.TokenRefreshConfig`** — new nested class: `endpoint`, `requestParams` (with `{credentials.X}` placeholders), `responseMapping` (dot-notation JSON paths), `accessTokenKey`, `bufferMinutes`
11. **`ChannelConfiguration.AuthenticationConfig.credentialMapping`** — new field: maps credential key → `customOptions` key; replaces hardcoded injection logic in `ChannelPublishService`
12. **`ChannelStoreConnection.tokenExpiry`** — new field: `Map<String, LocalDateTime>`; stores absolute expiry per credential key; written by `GenericTokenRefreshService` after each refresh
13. **`ChannelPublishService`** — replaced `injectStoreCredentials()` (hardcoded) with `injectDecryptedCredentials()` (data-driven); now calls `GenericTokenRefreshService` before inject
14. **`ChannelConfigurationDataLoader`** — added `integrationConfig` (with `credentialMapping` + `tokenRefresh`) for Shopify, WIX, and TikTok Shop
