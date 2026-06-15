# Channel Stores API Reference

Base URL: `http://localhost:8888/labamap/api/v1`

All endpoints require `organizationId` as a query parameter. In production this is enforced by JWT claim validation.

---

## MongoDB Collection: `channel_store_connections`

**Compound indexes:**

| Index | Fields | Unique |
|-------|--------|--------|
| `org_store_unique_idx` | `organizationId + storeId` | Yes |
| `org_channel_idx` | `organizationId + channelType` | No |

**Document at rest:**
```json
{
  "_id":             "66b1a2c3d4e5f6g7h8i9j0k1",
  "storeId":         "shopify-my-brand-us-store",
  "channelType":     "shopify",
  "storeName":       "My Brand US Store",
  "storeUrl":        "my-brand.myshopify.com",
  "region":          "US",
  "organizationId":  "org_123",
  "credentials": {
    "accessToken":  "AES256GCM:A3k9xPqR...",
    "apiKey":       "AES256GCM:Bx7mLwQp...",
    "apiSecret":    "AES256GCM:Cz2nRvTs..."
  },
  "tokenExpiry": {
    "accessToken": "2026-05-01T10:00:00"
  },
  "isActive":         true,
  "reconnectRequired": false,
  "displayOrder":     1,
  "connectedAt":      "2026-01-15T08:00:00Z",
  "lastSyncedAt":     "2026-04-28T14:30:00Z",
  "disconnectedAt":   null,
  "disconnectReason": null
}
```

> **Lombok `isActive` quirk:** `ChannelStoreConnection.java` declares `private boolean isActive`. Lombok `@Data` generates getter `isActive()`, which Jackson serializes as `"active"` (strips the `"is"` prefix). The `ChannelStoreConnectionResponse` DTO re-exposes this as `"isActive"` correctly via an explicit getter annotated `@JsonProperty("isActive")`.

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts

export type ConnectionStatus = "ACTIVE" | "RECONNECT_REQUIRED" | "INACTIVE" | "DISCONNECTED";

export interface ChannelStoreConnection {
  id: string;
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;    // always "***MASKED***" in API responses
  tokenExpiry?: Record<string, string>;
  isActive: boolean;
  reconnectRequired?: boolean;
  connectionStatus?: ConnectionStatus;    // derived by backend ChannelStoreConnectionResponse
  displayOrder: number;
  connectedAt: string;
  lastSyncedAt?: string;
  disconnectedAt?: string;
  disconnectReason?: string;
  /** From ChannelCategoryApiConfig.taxonomyConfig.enabled — true = use TaxonomyMapperModal (Shopify) */
  taxonomyEnabled?: boolean;
  /** From ChannelCategoryApiConfig.importCapable — true = use ImportWizardModal (WooCommerce, Etsy, Wix) */
  importCapable?: boolean;
  /** From ChannelCategoryApiConfig.treeCapable — true = use TaxonomyMapperModal mode="tree" (Shopee, Amazon, TikTok, eBay, Lazada). */
  treeCapable?: boolean;
}

export interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;         // auto-generated if omitted: "{channelType}-{storeName-slug}"
  region?: string;
  displayOrder?: number;    // default 99
  credentials: Record<string, string>;
}
```

---

## `connectionStatus` Truth Table

Derived by `ChannelStoreConnectionResponse.deriveStatus()` — never stored in DB, computed on read.

| `isActive` | `reconnectRequired` | `disconnectReason` | `connectionStatus` |
|-----------|--------------------|--------------------|-------------------|
| `true` | `false` / `null` | any | `ACTIVE` |
| `true` | `true` | any | `RECONNECT_REQUIRED` |
| `false` | any | `"manual"` or `null` | `INACTIVE` |
| `false` | any | anything else | `DISCONNECTED` |

---

## Endpoints

### GET /api/v1/channel-stores

List stores for an organization.

**Query params:**
- `organizationId` (required)
- `channelType` (optional) — filter by channel
- `includeInactive` (optional, default `false`) — set `true` to include `INACTIVE` + `DISCONNECTED` stores

```http
GET /labamap/api/v1/channel-stores?organizationId=org_123&includeInactive=true
```

**Response `200 OK`:** array of `ChannelStoreConnectionResponse`

```json
[
  {
    "id": "66b1a2c3d4e5f6g7h8i9j0k1",
    "storeId": "shopify-my-brand-us-store",
    "channelType": "shopify",
    "storeName": "My Brand US Store",
    "storeUrl": "my-brand.myshopify.com",
    "region": "US",
    "organizationId": "org_123",
    "credentials": { "accessToken": "***MASKED***", "apiKey": "***MASKED***", "apiSecret": "***MASKED***" },
    "isActive": true,
    "reconnectRequired": false,
    "connectionStatus": "ACTIVE",
    "displayOrder": 1,
    "connectedAt": "2026-01-15T08:00:00",
    "lastSyncedAt": "2026-04-28T14:30:00",
    "disconnectedAt": null,
    "disconnectReason": null,
    "taxonomyEnabled": true,
    "importCapable": true,
    "treeCapable": false
  },
  {
    "id": "77c2b3d4e5f6g7h8i9j0k1l2",
    "storeId": "shopee-my-brand-id-store",
    "channelType": "shopee",
    "storeName": "My Brand ID Store",
    "storeUrl": "shopee.com/shop/123456",
    "region": "ID",
    "organizationId": "org_123",
    "credentials": { "accessToken": "***MASKED***", "shopId": "***MASKED***", "partnerId": "***MASKED***" },
    "isActive": true,
    "reconnectRequired": false,
    "connectionStatus": "ACTIVE",
    "displayOrder": 2,
    "connectedAt": "2026-02-10T09:00:00",
    "lastSyncedAt": "2026-04-28T14:30:00",
    "disconnectedAt": null,
    "disconnectReason": null,
    "taxonomyEnabled": false,
    "importCapable": false,
    "treeCapable": true
  }
]
```

> **`treeCapable`:** Deployed 2026-06-15. Returns `true` for Shopee, Amazon, TikTok Shop, eBay, Lazada.
> Frontend fallback `TREE_CAPABLE_CHANNELS` is now a no-op — backend always returns the correct value.

---

### GET /api/v1/channel-stores/{storeId}

Get a single store.

**Path params:** `storeId`  
**Query params:** `organizationId` (required)

**Response:**
- `200 OK` — `ChannelStoreConnectionResponse`
- `404 Not Found` — store not found or belongs to a different org

---

### POST /api/v1/channel-stores

Connect a new store (manual-credential channels only — OAuth channels use `/oauth/initiate`).

**Query params:** `organizationId` (required)  
**Body:** `StoreConnectionRequest`

```json
{
  "channelType": "shopify",
  "storeName": "My Brand US Store",
  "storeUrl": "my-brand.myshopify.com",
  "region": "US",
  "displayOrder": 1,
  "credentials": {
    "accessToken": "shpat_xxxx",
    "apiKey": "xxxx",
    "apiSecret": "xxxx"
  }
}
```

**Response:**
- `201 Created` — `ChannelStoreConnectionResponse` (credentials masked)
- `400 Bad Request` — unknown `channelType`
- `409 Conflict` — same `channelType + storeUrl` already connected for this org

---

### PATCH /api/v1/channel-stores/{storeId}/credentials

Rotate credentials for an existing store (used by manual channels when a token expires).

**Path params:** `storeId`  
**Query params:** `organizationId` (required)  
**Body:** updated credentials map

```json
{
  "accessToken": "shpat_new_rotated_token",
  "apiKey": "same_key",
  "apiSecret": "same_secret"
}
```

**Response:**
- `200 OK` — `ChannelStoreConnectionResponse`
- `404 Not Found`

---

### PUT /api/v1/channel-stores/{storeId}/deactivate

Soft-delete a store (`isActive = false`, `disconnectReason = "manual"`). The record stays in MongoDB for audit history.

**Path params:** `storeId`  
**Query params:** `organizationId` (required)

**Response:**
- `204 No Content`
- `404 Not Found`

---

### PUT /api/v1/channel-stores/{storeId}/display-order

Update display order for frontend sorting.

**Path params:** `storeId`  
**Query params:** `organizationId` (required)  
**Body:**

```json
{ "displayOrder": 2 }
```

**Response:**
- `200 OK` — `ChannelStoreConnectionResponse`
- `404 Not Found`

---

### Pending Endpoints (not yet implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/api/v1/channel-stores/{storeId}` | Update store name / URL / region |
| `PUT` | `/api/v1/channel-stores/{storeId}/activate` | Re-activate an INACTIVE store |
| `DELETE` | `/api/v1/channel-stores/{storeId}` | Hard-delete (permanent — no audit history) |

These are documented in `documentation/stores-connect-BE/13-edit-delete-endpoints.md`.

---

## Error Response Format

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| HTTP | Error Code | When |
|------|------------|------|
| `400` | `BAD_REQUEST` | Unknown `channelType` |
| `404` | `STORE_NOT_FOUND` | `storeId` not found in this org |
| `409` | `DUPLICATE_STORE` | Same `channelType + storeUrl` already active |
| `500` | `INTERNAL_ERROR` | Encryption failure or DB error |
