# Channel Credential Schema & Publish Flow

> **What this covers:** How the backend knows which credentials each channel needs (`channel_credential_schemas`), how those credentials are stored encrypted, and how they travel all the way to the sync API call at `localhost:9000/sync_channel_product_impl` as `channelCredentials`.

---

## Overview — The Three Layers

Think of credential handling as three separate concerns:

```
Layer 1 — SCHEMA        "What credentials does this channel need?"
                         (channel_credential_schemas collection)
               ↓
Layer 2 — STORAGE        "Store the merchant's actual values, encrypted"
                         (channel_store_connections collection)
               ↓
Layer 3 — DELIVERY       "Decrypt → re-key → send to sync API"
                         (channelCredentials in sync request payload)
```

Each layer has a clear responsibility. Understanding this separation makes it easy to debug problems or extend to new channels.

---

## Layer 1 — `channel_credential_schemas`

### What It Is

A MongoDB collection with **one document per channel type**. Each document tells the frontend and backend exactly what credential fields to ask for and how to handle them.

**Collection:** `channel_credential_schemas`  
**Seeded by:** `ChannelCredentialSchemaMigration` (@Order 106) — runs at every startup, idempotent

### The Schema Structure

```json
{
  "channelType": "shopify",
  "fields": [
    {
      "credId":       "shopify_access_token",
      "chnlCredName": "accessToken",
      "label":        "Access Token",
      "inputType":    "password",
      "sensitive":    true,
      "required":     true,
      "helpText":     "Shopify Admin API access token (starts with shpat_)"
    },
    {
      "credId":       "shopify_api_secret",
      "chnlCredName": "apiSecret",
      "label":        "API Secret Key",
      "inputType":    "password",
      "sensitive":    true,
      "required":     false,
      "helpText":     "Required for webhook signature verification"
    }
  ]
}
```

### What Each Field Means

| Field          | Purpose                                                              | Example                  |
|----------------|----------------------------------------------------------------------|--------------------------|
| `credId`       | Stable unique ID used as the key in frontend form state              | `"shopify_access_token"` |
| `chnlCredName` | The map key used when **storing** in MongoDB                         | `"accessToken"`          |
| `label`        | The human-readable form label shown to the merchant                  | `"Access Token"`         |
| `inputType`    | `"text"` or `"password"` — controls masking in the browser           | `"password"`             |
| `sensitive`    | `true` → mask value in UI after entry; also signals "don't log this" | `true`                   |
| `required`     | Must the merchant fill this before connecting?                       | `true`                   |
| `helpText`     | Short hint text shown below the input                                | `"Starts with shpat_"`   |

### Why Two Identifiers? `credId` vs `chnlCredName`

This is a common source of confusion.

- **`credId`** is for the **frontend form only**. It's a stable, globally unique string that a future frontend uses as a React/Vue form key and for display purposes. It is defined in the credential schema. **It is NOT the same `credId` that appears in the sync API `channelCredentials` array** — that `credId` is computed as `"auth_" + credentialMapping value` (e.g. `"auth_token"`), not from the schema.

- **`chnlCredName`** is for the **backend**. It's the key used inside `channel_store_connections.credentials` map in MongoDB. When the sync backend receives a credential, it looks it up by `chnlCredName`.

Think of `credId` as "the name on the label" and `chnlCredName` as "the name in the database".

### Per-Channel Schema Summary

| Channel         | Credentials (chnlCredName)                                           | Notes                                          |
|-----------------|----------------------------------------------------------------------|------------------------------------------------|
| **Shopify**     | `accessToken`, `apiSecret`                                           | Token never expires; secret for webhook verify |
| **Amazon**      | `sellerId`, `accessKey`, `secretKey`, `marketplaceId`                | SP-API IAM credentials                         |
| **Walmart**     | `clientId`, `clientSecret`                                           | OAuth2 client credentials                      |
| **eBay**        | `appId`, `certId`, `devId`, `oauthUserToken`                         | User-level OAuth token                         |
| **WIX**         | `accessToken`, `wixSiteId` (+ `refreshToken`, `clientId` from OAuth) | Site ID is UUID from dashboard                 |
| **TikTok Shop** | `appKey`, `appSecret`, `accessToken`, `shopCipher`                   | All four needed for HMAC signing               |

### How the Frontend Uses This

The frontend calls:

```
GET /api/v1/channel-stores/credential-schema/{channelType}
```

This returns the `fields` array. The frontend renders a credential form dynamically — no hardcoded per-channel UI code needed. If you add a new credential field to the schema migration, the form updates automatically on next startup.

---

## Who Populates What — Schema vs Credentials

This is one of the most important things to understand. The two collections are populated by **completely different actors at completely different times**.

```
channel_credential_schemas       ← Platform engineer writes this (once, in code)
channel_store_connections        ← Merchant fills this (every time they connect a store)
```

### `channel_credential_schemas` — Platform Engineer, at Startup

The schema is **platform-level configuration**. It is written entirely by the platform engineering team inside `ChannelCredentialSchemaMigration.java` and seeded automatically every time the application starts.

**No merchant action is required. No admin UI is needed. It is never touched by a store connection flow.**

The lifecycle looks like this:

```
Platform engineer edits ChannelCredentialSchemaMigration.java
    └── Adds or modifies a CredentialFieldSchema for a channel
    └── Commits and deploys

Application starts
    └── ChannelCredentialSchemaMigration runs (@Order 106)
        └── For each channel: findByChannelType → upsert document
        └── channel_credential_schemas now has the latest definition

Frontend calls GET /api/v1/channel-stores/credential-schema/shopify
    └── Reads from channel_credential_schemas
    └── Renders the connect-store form with the correct fields
```

The migration is **idempotent** — on every restart it replaces the `fields` array on each document with the latest version from code. This means you can safely update a schema (rename a label, add a field, change helpText) by editing the Java file and redeploying, with no manual MongoDB work.

**What happens if the schema document does not exist yet for a channel?**  
The migration inserts it. If a brand new channel type is added to `buildSchemas()` and deployed, the document is created on first startup.

**What happens if a channel is removed from `buildSchemas()`?**  
Nothing — the old document stays in MongoDB. The migration only upserts channels it knows about; it does not delete channels that are absent. To remove a channel schema, delete the document manually from MongoDB.

---

### `channel_store_connections` — Merchant, When Connecting a Store

The store connection is **merchant-level data**. It is created when a specific merchant (organisation) connects their marketplace account to the system. This happens in one of two ways:

**Path A — Manual credential entry (non-OAuth channels)**

> **Note:** This project is a backend-only service. There is no frontend credential form in this repository. Path A describes the contract the backend exposes so that a frontend application can build the form. Until a frontend is built, stores are connected by calling the API directly (e.g. from Postman or curl).

**Current usage (direct API call):**
```bash
POST /labamap/api/v1/channel-stores
{
  "organizationId": "org-123",
  "channelType":    "shopify",
  "storeName":      "My Store",
  "storeUrl":       "mystore.myshopify.com",
  "credentials": {
    "accessToken": "shpat_abc123",
    "apiSecret":   "mysecret"
  }
}
```

**When a frontend is built, the intended flow is:**
```
Frontend calls GET /api/v1/channel-stores/credential-schema/{channelType}
    └── Response contains the fields[] array from channel_credential_schemas
        └── Frontend renders input boxes based on field definitions
            (inputType, label, helpText, required, sensitive)
    └── Merchant fills in credential values
    └── Frontend POSTs to POST /api/v1/channel-stores with credentials map
        └── ChannelStoreConnectionService.connectStore()
            ├── Validates channelType exists in ChannelConfiguration
            ├── Checks for duplicate storeUrl
            ├── Encrypts each credential value (AES-256-GCM)
            └── Saves to channel_store_connections
```

The credential schema endpoint exists specifically to enable this dynamic form rendering — no hardcoded per-channel UI code should be needed in the frontend.

**Path B — OAuth flow (Shopify, WIX, TikTok, eBay, Amazon)**

```
Merchant clicks "Connect via OAuth"
    └── Frontend calls GET /api/v1/oauth/initiate?channelType=shopify&...
        └── OAuthInitiationService generates nonce → builds authorization URL
    └── Merchant is redirected to marketplace login page
    └── Marketplace redirects back to GET /api/v1/oauth/{channelType}/callback
        └── OAuthCallbackService:
            ├── Verifies HMAC/nonce
            ├── Exchanges auth code → access token + refresh token
            ├── Builds credentials map (all values from token response)
            ├── Encrypts credentials
            └── Calls connectStore() → saves to channel_store_connections
```

In both paths, the resulting document in `channel_store_connections` uses the **`chnlCredName` keys from the schema** as the map keys. That is the link between the two collections:

```
Schema defines:   { chnlCredName: "accessToken", ... }
                                        ↓
Storage contains: { credentials: { "accessToken": "AES256GCM:..." } }
```

---

### Side-by-Side Comparison

|                        | `channel_credential_schemas`             | `channel_store_connections`                    |
|------------------------|------------------------------------------|------------------------------------------------|
| **Who creates it**     | Platform engineer (in Java code)         | Merchant (via form or OAuth)                   |
| **When is it created** | Application startup                      | Store connect action                           |
| **One document per**   | Channel type (e.g. "shopify")            | Store instance (e.g. "shopify-us-store")       |
| **How many documents** | 6 (one per supported channel)            | Potentially thousands (one per merchant-store) |
| **Contains**           | Field definitions — labels, types, hints | Actual encrypted credential values             |
| **Modified by**        | Code change + redeploy                   | Merchant reconnecting or credential update     |
| **Key field**          | `channelType`                            | `storeId` + `organizationId`                   |
| **Credential values**  | None — only structure                    | Yes, encrypted with AES-256-GCM                |

---

### What Triggers Schema Population vs Credential Population

To be crystal clear:

- **Connecting a store does NOT populate the schema.** The schema must already exist before the connect-store form can be rendered. If the schema is missing for a channel, the frontend gets an empty fields array and cannot show the form.

- **Restarting the application does NOT populate credentials.** The migration only touches `channel_credential_schemas`. A merchant's `channel_store_connections` document is never created or modified by a startup migration.

- **They are independent.** You can have a schema with no connected stores (channel is supported but no merchant has connected yet). You can theoretically have a connected store with no schema (this would be a bug — the schema migration should have run first).

---

### Adding a New Channel — Who Does What

If a new marketplace (e.g. Lazada) needs to be supported:

| Step   | Actor             | Action                                                                                      |
|--------|-------------------|---------------------------------------------------------------------------------------------|
| 1      | Platform engineer | Add `lazada()` method to `ChannelCredentialSchemaMigration` with required credential fields |
| 2      | Platform engineer | Add `credentialMapping` in `ChannelConfigurationDataLoader` for Lazada                      |
| 3      | Platform engineer | Add `TokenRefreshConfig` if Lazada tokens expire                                            |
| 4      | Platform engineer | Deploy — schema auto-populates on startup                                                   |
| 5      | Merchant          | Opens connect-store form → sees Lazada credential fields → enters values → store connected  |

Steps 1–4 are **one-time platform setup**. Step 5 happens for every merchant, every time.

---

## Layer 2 — `channel_store_connections` (Encrypted Storage)

When the merchant submits the credential form (or completes OAuth), the backend:

1. Takes each `chnlCredName` → value pair from the form submission
2. **Encrypts** each value using `CredentialEncryptionService` (AES-256-GCM)
3. Saves the encrypted map in `channel_store_connections.credentials`

### What Gets Stored

```json
{
  "storeId":        "shopify-us-store",
  "channelType":    "shopify",
  "organizationId": "org-123",
  "storeUrl":       "mystore.myshopify.com",
  "credentials": {
    "accessToken": "AES256GCM:base64encodedIV+ciphertext...",
    "apiSecret":   "AES256GCM:base64encodedIV+ciphertext..."
  },
  "tokenExpiry": {
    "accessToken": null
  },
  "isActive": true
}
```

The `credentials` map uses `chnlCredName` as the key — this is how Layer 1 and Layer 2 stay connected.

> See `02-credential-security.md` for full details on the AES-256-GCM encryption format.

---

## Layer 3 — The Publish Flow: From Storage to Sync API

This is the most complex layer. Here is what happens step-by-step when `POST /api/v1/channels/publish` is called with a `storeId`.

### Step-by-Step Flow

```
POST /api/v1/channels/publish
  └── PublishProductRequest { storeId: "shopify-us-store", ... }

[ChannelPublishService.resolveStoreAndPublish()]

  1. Load ChannelStoreConnection from MongoDB
     storeConnectionService.getStore(orgId, storeId)
     → finds { channelType: "shopify", credentials: { encrypted } }

  2. Load ChannelConfiguration for this channelType
     channelConfigRepository.findSystemDefaultByChannelId("shopify")
     → finds { integrationConfig.authentication.credentialMapping: { ... } }

  3. Refresh token if needed (WIX, TikTok only)
     GenericTokenRefreshService.getValidCredentials()
     → checks tokenExpiry → calls refresh endpoint if expiring soon
     → returns fresh decrypted credentials map

  4. injectDecryptedCredentials()
     → applies credentialMapping: { "accessToken" → "token" }
     → puts mapped values into request.publishOptions.customOptions
     → also puts ALL credentials in customOptions["credentials"] map

  5. Execute publish (JOLT transform → post-processing → sync call)

[ChannelAttributeConverterService.buildChannelCredentials()]

  6. Reads customOptions["credentials"] map
     → converts each entry to ChannelCredential { credId, chnlCredName, chnlCredValue }

  7. HTTP POST to localhost:9000/sync_channel_product_impl
     → SyncChannelProductRequest.channelCredentials populated
```

### Understanding `credentialMapping` — Why Map Again?

This is the most confusing part of the credential flow, so it needs a full explanation.

`credentialMapping` and `channelCredentials` **serve completely different consumers**. They are not duplicates of each other — they exist for different reasons.

---

#### What `credentialMapping` Is For

`credentialMapping` renames MongoDB credential keys into **flat `customOptions` entries** consumed by the **publish pipeline itself** — specifically by the JOLT transform engine, post-processing rules, and any channel-specific HTTP client code (like token refresh).

MongoDB stores credentials under the `chnlCredName` keys defined in the credential schema (e.g. `"accessToken"`). But the publish pipeline was built to look for credentials under different names — for example, `"token"` for Shopify, `"wix-site-id"` for WIX. The `credentialMapping` bridges this gap by renaming the MongoDB keys into what the pipeline expects.

```java
// Shopify — maps MongoDB "accessToken" → flat customOptions key "token"
credentialMapping = Map.of("accessToken", "token")

// WIX — maps two keys
credentialMapping = Map.of(
    "accessToken", "token",
    "wixSiteId",   "wix-site-id"
)

// TikTok — maps four keys
credentialMapping = Map.of(
    "accessToken", "token",
    "appKey",      "app_key",
    "appSecret",   "app_secret",
    "shopCipher",  "shop_cipher"
)
```

After injection, `customOptions` contains flat, pipeline-ready keys:
```json
{
  "storeId":    "shopify-us-store",
  "storeUrl":   "mystore.myshopify.com",
  "token":      "shpat_abc123...",
  "credentials": { "accessToken": "shpat_abc123...", "apiSecret": "secret123..." }
}
```

The `"token"` key is what the publish pipeline reads — it's used by `ChannelAttributeConverterService` to build HTTP headers like `X-Shopify-Access-Token: {token}`. The token refresh service also references `"token"` to know which value to replace after a refresh.

---

#### What `channelCredentials` Is For

`channelCredentials` is a **structured array in the sync API payload** consumed by `sync_channel_product_impl`. It is completely separate from `credentialMapping`.

`buildChannelCredentials()` does **not** read the flat mapped keys (like `"token"`). It reads from `customOptions["credentials"]` — the full passthrough map that uses the original MongoDB keys (`"accessToken"`, `"apiSecret"`, etc.). Then it applies the credential schema to filter and label each entry:

```
Schema field:  { credId: "shopify_access_token", chnlCredName: "accessToken" }
Credentials:   { "accessToken": "shpat_abc123..." }
Result entry:  { credId: "shopify_access_token", chnlCredName: "accessToken", chnlCredValue: "shpat_abc123..." }
```

The schema is the only source for `credId` and `chnlCredName` in this array. `credentialMapping` has no influence over `channelCredentials`.

---

#### The Two Usages of `credentialMapping`

`credentialMapping` is used in **two places** during publish — for the pipeline AND for the sync payload. They read from the same mapping but produce different outputs.

```
credentialMapping = { "accessToken" → "token" }
decryptedCreds    = { "accessToken": "shpat_abc123", "apiSecret": "secret123" }

                              │
              ┌───────────────┴───────────────────────────┐
              │                                             │
  injectDecryptedCredentials()              buildChannelCredentials()
  (flat keys for pipeline use)             (structured array for sync API)
              │                                             │
              ↓                                             ↓
  customOptions["token"] = "shpat_abc123"   channelCredentials[]:
  (used by JOLT, HTTP headers,               { credId:       "auth_token",
   token refresh)                              chnlCredName:  "token",
                                               chnlCredValue: "shpat_abc123" }
```

- **Left** (`injectDecryptedCredentials`) → flat mapped keys in `customOptions` for the **publish pipeline** (this service)
- **Right** (`buildChannelCredentials`) → structured `channelCredentials` array for the **sync API** (`sync_channel_product_impl`)

Both derive from the same `credentialMapping` entry. The sync payload `chnlCredName` is always the mapping's value (`"token"`), never the MongoDB key (`"accessToken"`).

`apiSecret` does **not** appear in `channelCredentials` for Shopify because it is not in `credentialMapping`. Only mapped credentials reach the sync API — unmapped credentials (like `apiSecret`, used only for webhook signature verification in this service) are naturally excluded.

---

#### `credId` and `chnlCredName` in `channelCredentials` — Where They Come From

Both come from **`credentialMapping`** (in `ChannelConfiguration.integrationConfig.authentication`):

| Field in `channelCredentials` | Source | Example value |
|-------------------------------|--------|---------------|
| `credId` | `"auth_" + credentialMapping value` | `"auth_token"` |
| `chnlCredName` | `credentialMapping value` (the mapped/renamed key) | `"token"` |
| `chnlCredValue` | `customOptions["credentials"][credentialMapping key]` | `"shpat_abc123..."` |

Concretely for Shopify (`"accessToken" → "token"` mapping):
- MongoDB stores under key `"accessToken"`
- Sync payload uses `chnlCredName: "token"` (mapped name the sync API expects)
- `credId: "auth_token"` (prefix + mapped name)

The **credential schema** (`channel_credential_schemas`) does NOT contribute to `credId` or `chnlCredName` in the sync payload at all. It only drives the frontend connect-store form.

---

#### Per-Channel Credential Mapping Reference

| Channel   | MongoDB key (`chnlCredName`)  | Mapped to (flat `customOptions` key)  |
|-----------|-------------------------------|---------------------------------------|
| Shopify   | `accessToken`                 | `token`                               |
| WIX       | `accessToken`                 | `token`                               |
| WIX       | `wixSiteId`                   | `wix-site-id`                         |
| TikTok    | `accessToken`                 | `token`                               |
| TikTok    | `appKey`                      | `app_key`                             |
| TikTok    | `appSecret`                   | `app_secret`                          |
| TikTok    | `shopCipher`                  | `shop_cipher`                         |
| Amazon    | *(no mapping defined)*        | raw pass-through only                 |
| eBay      | *(no mapping defined)*        | raw pass-through only                 |

Amazon and eBay have no `credentialMapping` because the sync API for those channels reads directly from the `channelCredentials` array — it does not look for flat keys in `customOptions`. This is workable but fragile (see Issue 5 above).

### The Final `channelCredentials` Array (Step 6-7)

`buildChannelCredentials()` is **`credentialMapping`-driven**. It iterates every entry in `credentialMapping`, looks up the credential value from `customOptions["credentials"]` using the MongoDB key, and builds a `ChannelCredential` using the **mapped key** as `chnlCredName`.

For Shopify (`credentialMapping = { "accessToken" → "token" }`):

```json
"channelCredentials": [
  {
    "credId":        "auth_token",
    "chnlCredName":  "token",
    "chnlCredValue": "shpat_abc123..."
  }
]
```

`apiSecret` is absent — it is not in `credentialMapping`, so it never reaches the sync payload (it is only used internally for webhook verification).

Fallback: channels with no `credentialMapping` (Amazon, eBay) forward all entries from `customOptions["credentials"]` using MongoDB keys directly as `chnlCredName`, with `"auth_"` prefix as `credId`.

If the credentials map is empty, an `IllegalStateException` is thrown — no silent empty payload reaches the sync API.

---

## Complete End-to-End Example — WIX

WIX is the most complex channel because it needs two credentials (token + site-id) and has token refresh enabled. Here is a complete trace:

### 1. Schema Definition (MongoDB)
```json
{
  "channelType": "wix",
  "fields": [
    { "credId": "wix_access_token", "chnlCredName": "accessToken", "required": true },
    { "credId": "wix_site_id",      "chnlCredName": "wixSiteId",   "required": true }
  ]
}
```

### 2. Stored in `channel_store_connections`
```json
{
  "channelType": "wix",
  "credentials": {
    "accessToken":  "AES256GCM:...",
    "refreshToken": "AES256GCM:...",
    "wixSiteId":    "AES256GCM:...",
    "clientId":     "AES256GCM:..."
  },
  "tokenExpiry": {
    "accessToken": "2026-05-14T10:30:00"
  }
}
```

> `refreshToken` and `clientId` are not in the schema fields but are stored by the OAuth callback handler (`OAuthCallbackService`) because they are needed for token refresh.

### 3. credentialMapping in `ChannelConfiguration`
```java
credentialMapping = Map.of(
    "accessToken", "token",
    "wixSiteId",   "wix-site-id"
)
```

### 4. Token Refresh Check
Before injecting, `GenericTokenRefreshService` sees `tokenExpiry.accessToken` is near expiry → calls:
```
POST https://www.wixapis.com/oauth2/token
  { grant_type: "refresh_token", client_id: "...", refresh_token: "..." }
```
Gets back a fresh `access_token` → replaces in the decrypted creds map → updates MongoDB.

### 5. After `injectDecryptedCredentials()`
```json
{
  "storeId":    "wix-store-1",
  "storeUrl":   "www.mybrand.com",
  "token":      "IST.eyJ...",
  "wix-site-id":"53001808-f5c7-...",
  "credentials": {
    "accessToken":  "IST.eyJ...",
    "refreshToken": "...",
    "wixSiteId":    "53001808-f5c7-...",
    "clientId":     "..."
  }
}
```

### 6. Final `channelCredentials` in Sync Payload

`buildChannelCredentials()` iterates `credentialMapping` — only the two mapped entries are included. `refreshToken` and `clientId` are excluded (not in `credentialMapping`); `wixSiteId` appears exactly once under its mapped name.

```json
"channelCredentials": [
  { "credId": "auth_token",    "chnlCredName": "token",      "chnlCredValue": "IST.eyJ..." },
  { "credId": "auth_wix-site-id", "chnlCredName": "wix-site-id", "chnlCredValue": "53001808-..." }
]
```

`chnlCredName` values are the `credentialMapping` values (`"token"`, `"wix-site-id"`), which is exactly what the sync API expects. The MongoDB storage keys (`accessToken`, `wixSiteId`) never appear in the sync payload.

---

## Current Issues and Technical Debt

### ~~1. Hardcoded Fallback Credentials in `buildChannelCredentials`~~ ✅ RESOLVED

**Resolved in:** `ChannelAttributeConverterService.java` — `credentialMapping`-driven refactor

The hardcoded Shopify `shpat_` and WIX IST test tokens have been removed. If the credentials map is empty, `buildChannelCredentials` now throws `IllegalStateException` immediately rather than silently substituting hardcoded values.

### ~~2. WIX Credential Duplication~~ ✅ RESOLVED

**Resolved by:** `credentialMapping`-driven `buildChannelCredentials`

The old approach iterated the entire `customOptions["credentials"]` map. The new approach iterates only the `credentialMapping` entries (exactly 2 for WIX: `accessToken` and `wixSiteId`). Since each MongoDB key appears only once in `credentialMapping`, duplication is impossible by design.

### ~~3. `credentials` Map Passthrough Leaks Internal Keys~~ ✅ RESOLVED

**Resolved by:** `credentialMapping`-driven `buildChannelCredentials`

`refreshToken` and `clientId` are not in WIX's `credentialMapping` (they are stored for token refresh purposes only). Because `buildChannelCredentials` now only includes credentials that have a `credentialMapping` entry, these internal keys are silently excluded. The sync API never sees them.

### ~~4. `credId` Generation Disconnected from Schema~~ ✅ RESOLVED (differently)

**Resolved by:** `credentialMapping`-driven `buildChannelCredentials`

`credId` is now `"auth_" + mappedKey` (e.g., `"auth_token"` for Shopify and WIX, `"auth_wix-site-id"` for the WIX site ID). The `credId` is now consistent and predictable — it is always derived from the `credentialMapping` value, which the sync API uses as its stable identifier. Note: `credId` is no longer taken from the credential schema's `credId` field.

### 5. No Channel Config Fallback Mapping for Amazon and eBay ⚠️ OPEN

Amazon and eBay do not have `credentialMapping` defined in `ChannelConfigurationDataLoader`. Their credentials are passed through without renaming. If the sync API expects specific key names for Amazon (`sellerId`, `accessKey`, etc.), they work only because the storage key names (`chnlCredName`) happen to match what the sync API expects. This is fragile.

---

## Future Recommendations

### ~~Recommendation 1 — Remove Hardcoded Credentials Immediately~~ ✅ IMPLEMENTED

Hardcoded test credentials have been removed from `buildChannelCredentials`. The method now throws `IllegalStateException` if no credentials are present. See Issue 1 (resolved above).

### ~~Recommendation 2 — Explicit Credential Allowlist for Sync Payload~~ ✅ IMPLEMENTED

`buildChannelCredentials` now iterates the schema `fields` array rather than the entire credentials map. The schema fields implicitly serve as the allowlist — only credentials with a matching `chnlCredName` in the schema are included. Internal-only keys (`refreshToken`, `clientId`) are excluded automatically. See Issues 2 and 3 (resolved above).

> If finer-grained control is needed (e.g., some schema fields are UI-only and should not go to the sync API), a future `syncPayload: true/false` flag on `CredentialFieldSchema` can be added without changing `buildChannelCredentials` logic.

### ~~Recommendation 3 — Align `credId` Between Schema and Sync Payload~~ ✅ IMPLEMENTED

`buildChannelCredentials` now reads `credId` directly from the schema document. The sync payload `credId` (e.g., `"shopify_access_token"`) matches the schema definition exactly. See Issue 4 (resolved above).

### Recommendation 4 — Add `credentialMapping` for All Channels

Amazon and eBay should have explicit `credentialMapping` entries in `ChannelConfigurationDataLoader`, even if the current key names happen to work. This makes intent explicit and prevents silent breakage if the sync API changes its expected key names.

```java
// Amazon
credentialMapping(Map.of(
    "sellerId",       "seller_id",
    "accessKey",      "access_key",
    "secretKey",      "secret_key",
    "marketplaceId",  "marketplace_id"
))

// eBay
credentialMapping(Map.of(
    "appId",          "app_id",
    "certId",         "cert_id",
    "devId",          "dev_id",
    "oauthUserToken", "oauth_user_token"
))
```

### Recommendation 5 — Credential Schema as Source of Truth for the Form AND the Sync Payload

Currently the schema is only used by the frontend form. In future, the sync request building should also read from the schema:

1. Schema defines `syncPayloadKeys` (which creds to send)
2. Schema defines `credId` (stable identifier throughout)
3. `credentialMapping` in channel config handles the key rename
4. `buildChannelCredentials` uses schema + mapping instead of hardcoded logic

This creates a single source of truth: **change the schema document in MongoDB → the form updates AND the sync payload updates** with no code change.

### Recommendation 6 — Add Credential Validation on Publish

Before calling the sync API, validate that all required credentials (from the schema's `required: true` fields) are present. Return a clear error if any are missing, rather than sending a request that will fail at the sync API with an opaque error.

```java
List<String> missingCreds = schemaService.getRequiredFields(channelType)
    .stream()
    .filter(f -> !decryptedCreds.containsKey(f.getChnlCredName()))
    .map(CredentialFieldSchema::getLabel)
    .collect(toList());

if (!missingCreds.isEmpty()) {
    throw new PublishException("Missing required credentials: " + missingCreds);
}
```

---

## Quick Reference — Key Files

| What | File |
|------|------|
| Schema document (entity) | `channel/store/model/document/ChannelCredentialSchemaDocument.java` |
| Credential field definition | `channel/store/model/dto/CredentialFieldSchema.java` |
| Schema seeder | `channel/config/ChannelCredentialSchemaMigration.java` (@Order 106) |
| Schema service (API) | `channel/store/service/ChannelCredentialSchemaService.java` |
| Credential encryption | `channel/store/service/CredentialEncryptionService.java` |
| Store connection (storage) | `channel/store/model/entity/ChannelStoreConnection.java` |
| Credential injection | `publishing/service/ChannelPublishService.java` → `injectDecryptedCredentials()` |
| Credential mapping config | `channel/config/ChannelConfigurationDataLoader.java` → `credentialMapping` per channel |
| Token refresh | `channel/store/service/GenericTokenRefreshService.java` |
| Sync payload building | `publishing/service/ChannelAttributeConverterService.java` → `buildChannelCredentials()` |
| Sync request DTO | `publishing/model/request/SyncChannelProductRequest.java` → `ChannelCredential` |

---

## Related Docs

- `02-per-channel-credentials.md` — How to obtain credentials from each marketplace
- `02-api-reference/02-credential-security.md` — AES-256-GCM encryption details
- `02-api-reference/03-token-refresh.md` — Automatic token refresh for WIX and TikTok
- `02-api-reference/04-oauth-endpoints.md` — OAuth initiation and callback flow
