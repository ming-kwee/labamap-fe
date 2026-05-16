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
  "categoryApiSchemas": {
    "clothing": { "product": { "color": {}, "size": {} } }
  },
  "requiredFieldObjects": ["title", "body_html", "vendor"],
  "apiWrapperConfig": { "product": {} },
  "attributeMappings": [...],
  "fieldBoosts": [...]
}
```

This collection is managed by the platform team — never by merchants. Do not add per-store fields here.

**`apiSchema`** is the base channel target schema used by APM. It is a single schema per channel and is correct for Shopify/WIX (uniform structure). For Amazon, eBay, and Walmart it is an oversimplification — category-specific fields are absent, so APM cannot suggest mappings for them.

**`categoryApiSchemas`** (planned) — per-category schema extensions merged on top of `apiSchema` at APM request time. Keyed by category slug. When `GET /channels/{channelId}/schema/complex?categoryId=clothing` is called, the response merges `categoryApiSchemas["clothing"]` over `apiSchema`. Not yet implemented. See `docs/product/06-adaptive-pattern-matching/02-api-reference/02-channel-schema.md` → `apiSchema — Current State and Category Gap`.

**`fieldBoosts`** — channel-level confidence boosts applied after tier matching (e.g. Shopify `brand→vendor`). Seeded by `ChannelFieldBoostsMigration`. The `FieldBoost.condition` field exists in the schema but is never evaluated — planned for category-specific boosting. See `docs/product/06-adaptive-pattern-matching/01-guides/02-matching-tiers.md` → `Channel Boost`.

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

### GET `/oauth/initiate` (Phase B+ — current)

Unified OAuth initiation endpoint for all channels. The frontend redirects the browser
to the returned `authorizationUrl`.

**Query params:**
```
channelType=shopify          ← required
organizationId=org_123       ← required
storeName=My+Shopify+Store   ← required
region=US                    ← optional
shop=my-brand                ← Shopify only: subdomain (no protocol, no .myshopify.com)
storeId=shopify-us-store     ← reconnect mode only: tells backend to update this store
```

**Response:**
```json
{
  "authorizationUrl": "https://my-brand.myshopify.com/admin/oauth/authorize?client_id=...&scope=...&state=...",
  "nonce": "abc123xyz",
  "channelType": "shopify"
}
```

The frontend calls `window.location.href = authorizationUrl`. The backend handles the
channel's callback GET, exchanges the code, saves the store, and redirects to
`/channels/stores?connected={channelType}`.

**Note on `shop` for Shopify:** pass only the subdomain. The backend builds the full
`{shop}.myshopify.com` URL internally. Passing the full `.myshopify.com` domain will
result in a double-suffix URL and a failed redirect.

---

### GET `/oauth/{channelType}/initiate` (Legacy — do not use)

Per-channel path, superseded by the unified endpoint above. Still active on the backend
for backwards compatibility. The frontend no longer calls this path.

---

### POST `/oauth/{channelType}/callback` (Legacy — do not use)

Manual code-exchange endpoint. In Phase B+, the backend handles the OAuth provider's
GET callback directly and redirects to `/channels/stores`. The frontend `ChannelOAuthCallbackPage`
and `ChannelOAuthService.completeOAuth()` are kept for backwards compatibility but are
not called in the current flow.

---

### PUT `/channel-stores/{storeId}/deactivate`

Soft-disables the store (sets `isActive = false`, `disconnectReason = "manual"`).
The store remains in the database. Returns `204 No Content`.

Note: the API reference originally showed `PATCH` — the actual method is `PUT`.

---

### PUT `/channel-stores/{storeId}/activate`

Re-enables a deactivated store (sets `isActive = true`, clears `reconnectRequired`).

**Response:** Updated `ChannelStoreConnection`

Note: the API reference originally showed `PATCH /reactivate` — the actual path is
`PUT /activate`.

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts

type ChannelType =
  | "shopify" | "wix" | "amazon" | "ebay" | "tiktok"
  | "lazada" | "tokopedia" | "facebook" | "shopee" | "walmart";

// Phase E: derived by backend from isActive + reconnectRequired + disconnectedAt
type ConnectionStatus = "ACTIVE" | "RECONNECT_REQUIRED" | "DISCONNECTED" | "INACTIVE";

interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;   // masked to "***MASKED***" in GET responses
  tokenExpiry?: Record<string, string>;  // credential key → ISO datetime
  isActive: boolean;
  displayOrder: number;
  connectedAt: string | number;          // ISO string or epoch-seconds; use formatDate() helper
  lastSyncedAt?: string | number;
  reconnectRequired?: boolean;           // true = merchant must re-authorize
  connectionStatus?: ConnectionStatus;   // Phase E — preferred over isActive for UI logic
  disconnectedAt?: string;               // set by webhook deactivation
  disconnectReason?: string;             // "app_uninstalled" | "deauthorize" | "app_removed" | "manual" | ...
  taxonomyEnabled?: boolean;             // from ChannelCategoryApiConfig.taxonomyEnabled (true = fixed channel-owned taxonomy tree)
  importCapable?: boolean;               // from ChannelCategoryApiConfig.importCapable (true = import wizard for merchant collections)
  // Note: both flags are independent. Shopify has taxonomyEnabled=true AND importCapable=true.
}

// credentials field is CredentialEntry[] in POST/PUT requests (NOT Record<string,string>)
interface CredentialEntry {
  credId: string;        // from CredentialFieldSchema.credId
  chnlCredName: string;  // canonical credential key stored in the map
  chnlCredValue: string;
}

interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;          // present in edit mode
  region?: string;
  displayOrder?: number;
  credentials: CredentialEntry[];  // ← structured list, not flat map
}

interface CredentialFieldSchema {
  credId: string;         // backend schema identifier
  chnlCredName: string;   // key used in the credentials map
  label: string;
  inputType: "text" | "password" | "email" | "url" | "number";
  sensitive: boolean;
  required: boolean;
  helpText?: string;
}

interface OAuthInitiateRequest {
  channelType: ChannelType;
  organizationId: string;
  storeName: string;
  region?: string;
  shop?: string;    // Shopify only: subdomain without protocol or .myshopify.com
  storeId?: string; // reconnect mode: update this store instead of creating new
}

interface OAuthInitiateResponse {
  authorizationUrl: string;
  nonce: string;
  channelType: ChannelType;
}
```
