# API Reference — Channel Stores

Base path: `/labamap/api/v1/channel-stores`

---

## MongoDB Collection: `channel_store_connections`

One document per connected store instance. An organization with 2 Shopify stores and 1 WiX site has 3 documents.

```json
{
  "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
  "storeId":        "shopify-us-store",
  "channelType":    "shopify",
  "storeName":      "My Shopify US Store",
  "storeUrl":       "mystore.myshopify.com",
  "region":         "US",
  "organizationId": "org_123",
  "credentials": {
    "accessToken": "shpat_xxxxxxxxxxxxxxxxxxxx"
  },
  "tokenExpiry": {
    "accessToken": "2026-06-01T10:00:00"
  },
  "isActive":           true,
  "displayOrder":       1,
  "connectedAt":        "2026-01-15T08:00:00Z",
  "lastSyncedAt":       "2026-04-28T14:00:00Z",
  "reconnectRequired":  false,
  "disconnectedAt":     null,
  "disconnectReason":   null
}
```

| Field | Description |
|-------|-------------|
| `credentials` | Encrypted at rest (AES-256-GCM). Masked to `"***MASKED***"` in GET responses — only readable server-side. |
| `tokenExpiry` | Map of credential key → expiry datetime. Read by `GenericTokenRefreshService` before each publish to decide whether to refresh. |
| `reconnectRequired` | `true` when the refresh token is expired or revoked and the merchant must re-authorize. Set by `GenericTokenRefreshService` on 401/403 or token expiry with no valid refresh token. Cleared to `false` by `OAuthCallbackService` after successful re-authorization. |
| `disconnectedAt` | Non-null when the store was deactivated via a marketplace webhook (app_uninstalled, deauthorize, etc.). Null for manually deactivated or active stores. |
| `disconnectReason` | Machine-readable deactivation reason. Values: `"app_uninstalled"` (Shopify), `"deauthorize"` (TikTok Shop), `"app_removed"` (WIX), `"app_deauthorized"` (Amazon), `"account_deletion"` (eBay), `"manual"` (API deactivation). |

---

## MongoDB Collection: `channel_configurations`

One document per channel type (Shopify, Amazon, TikTok, etc.). Shared across all stores of the same type.

```json
{
  "_id":           "64f3a1b2c3d4e5f6a7b8c9d0",
  "channelId":     "shopify",
  "joltSpec":      [...],
  "postProcessingRules": [...],
  "apiSchema":     { "product": { "title": { "required": true } } },
  "requiredFieldObjects": ["title", "body_html", "vendor"],
  "apiWrapperConfig": { "product": {} },
  "attributeMappings": [...]
}
```

This collection is managed by the platform team — never by merchants. Do not add per-store fields here.

---

## Endpoints

### GET `/channel-stores?organizationId={orgId}`

Lists all store connections for the organization (active and inactive).

**Response:** `ChannelStoreConnection[]`
```json
[
  {
    "storeId":       "shopify-us-store",
    "channelType":   "shopify",
    "storeName":     "My Shopify US Store",
    "storeUrl":      "mystore.myshopify.com",
    "region":        "US",
    "organizationId":"org_123",
    "credentials":   { "accessToken": "***MASKED***" },
    "isActive":      true,
    "displayOrder":  1,
    "connectedAt":   "2026-01-15T08:00:00Z"
  }
]
```

---

### GET `/channel-stores/{storeId}?organizationId={orgId}`

Returns a single store.

---

### GET `/channel-stores/credential-schema/{channelType}`

Returns credential field definitions for a channel type. Used by `ConnectStoreModal` to dynamically render credential inputs.

**Response:** `CredentialFieldSchema[]`
```json
[
  {
    "credId":       "wix_access_token",
    "chnlCredName": "accessToken",
    "label":        "API Access Token",
    "inputType":    "password",
    "sensitive":    true,
    "required":     true,
    "helpText":     "Wix API access token from the Wix Developers portal"
  },
  {
    "credId":       "wix_site_id",
    "chnlCredName": "wixSiteId",
    "label":        "Wix Site ID",
    "inputType":    "text",
    "sensitive":    false,
    "required":     true,
    "helpText":     "Found in your Wix dashboard URL after /dashboard/"
  }
]
```

`chnlCredName` is the key used in the `credentials` map when submitting. The frontend iterates this array to render inputs; the submission payload keys are `chnlCredName` values by construction.

---

### POST `/channel-stores`

Connects a new store. Creates a `channel_store_connections` document.

**Request body:**
```json
{
  "channelType":  "shopify",
  "storeName":    "My Shopify US Store",
  "storeUrl":     "mystore.myshopify.com",
  "region":       "US",
  "displayOrder": 1,
  "credentials": {
    "accessToken": "shpat_xxxxxxxxxxxxxxxxxxxx"
  }
}
```

**Response:** `ChannelStoreConnection` (with credentials masked)

---

### PUT `/channel-stores/{storeId}`

Updates store settings or credentials.

**Request body:** Same shape as POST. `credentials` fields left blank are not updated — only provided values overwrite.

**Response:** Updated `ChannelStoreConnection`

---

### PATCH `/channel-stores/{storeId}/deactivate`

Soft-disables the store. The store remains in the database but is excluded from Step 2 tabs and Step 3 publish targets. No request body needed.

---

### PATCH `/channel-stores/{storeId}/reactivate`

Re-enables a deactivated store. No request body needed.

**Response:** Updated `ChannelStoreConnection`

---

### DELETE `/channel-stores/{storeId}`

Hard-deletes the store connection. Returns `204 No Content`.

All `channel_product_data` documents for this store are **not** automatically deleted — consider whether to cascade or retain for audit.

---

### PATCH `/channel-stores/{storeId}/display-order`

Updates the tab order in the Step 2 wizard.

**Request body:**
```json
{ "displayOrder": 3 }
```

---

## OAuth Endpoints

### GET `/oauth/{channelType}/initiate`

Initiates OAuth for a channel. The frontend redirects the user's browser to the returned `authUrl`.

**Query params:**
```
organizationId=org_123
returnUrl=/channels/oauth/callback?channelType=shopify
shopDomain=mystore.myshopify.com   ← channel-specific extras as query params
```

**Response:**
```json
{ "authUrl": "https://mystore.myshopify.com/admin/oauth/authorize?client_id=...&scope=...&state=..." }
```

---

### POST `/oauth/{channelType}/callback`

Exchanges the OAuth code for a token, creates the `channel_store_connections` document, returns the store.

**Request body:**
```json
{
  "code":  "abc123",
  "state": "state_xyz",
  "shop":  "mystore.myshopify.com",
  "hmac":  "abcdef123456"
}
```

**Response:** `ChannelStoreConnection`

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts

type ChannelType =
  | "shopify" | "wix" | "amazon" | "ebay" | "tiktok"
  | "lazada" | "tokopedia" | "facebook" | "shopee" | "walmart";

interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;  // masked in GET responses
  tokenExpiry?: Record<string, string>; // credential key → ISO datetime
  isActive: boolean;
  displayOrder: number;
  connectedAt: string | number;
  lastSyncedAt?: string | number;
  reconnectRequired?: boolean;          // true = merchant must re-authorize
  disconnectedAt?: string;              // set by webhook deactivation
  disconnectReason?: string;            // "app_uninstalled" | "deauthorize" | "manual" | ...
}

interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;          // present in edit mode
  region?: string;
  displayOrder?: number;
  credentials: Record<string, string>;
}

interface CredentialFieldSchema {
  credId: string;
  chnlCredName: string;
  label: string;
  inputType: "text" | "password" | "email" | "url" | "number";
  sensitive: boolean;
  required: boolean;
  helpText?: string;
}
```
