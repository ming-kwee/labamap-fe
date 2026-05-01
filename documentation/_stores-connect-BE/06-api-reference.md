# Stores-Connect API Reference

Base path: `http://localhost:8888/labamap`

All endpoints require `organizationId` as a query parameter. In production this is enforced by JWT claim validation.

---

## GET /api/v1/channel-stores

List all active stores for an organization.

**Query params:**
- `organizationId` (required) — tenant ID
- `channelType` (optional) — filter by channel (e.g. `shopify`, `wix`)

**Response:** `200 OK` — array of `ChannelStoreConnectionResponse`

```http
GET /labamap/api/v1/channel-stores?organizationId=org_123
GET /labamap/api/v1/channel-stores?organizationId=org_123&channelType=shopify
```

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
    "credentials": {
      "accessToken": "***MASKED***",
      "apiKey":      "***MASKED***",
      "apiSecret":   "***MASKED***"
    },
    "isActive": true,
    "displayOrder": 1,
    "connectedAt": "2026-02-25T10:00:00",
    "lastSyncedAt": "2026-02-25T14:30:00"
  }
]
```

---

## GET /api/v1/channel-stores/{storeId}

Get a single store by `storeId`.

**Path params:** `storeId`
**Query params:** `organizationId` (required)

**Response:**
- `200 OK` — `ChannelStoreConnectionResponse`
- `404 Not Found` — store not found or not in this org

---

## POST /api/v1/channel-stores

Connect a new store.

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
- `400 Bad Request` — unknown channelType
- `409 Conflict` — same channelType + storeUrl already connected

---

## PATCH /api/v1/channel-stores/{storeId}/credentials

Update (rotate) the credentials for an existing store.

**Path params:** `storeId`
**Query params:** `organizationId` (required)
**Body:** New credentials map

```json
{
  "accessToken": "shpat_new_rotated_token",
  "apiKey": "same_key",
  "apiSecret": "same_secret"
}
```

**Response:**
- `200 OK` — `ChannelStoreConnectionResponse` (credentials masked)
- `404 Not Found` — store not found

---

## PUT /api/v1/channel-stores/{storeId}/deactivate

Soft-delete a store (sets `isActive = false`). The store record remains in MongoDB for audit history.

**Path params:** `storeId`
**Query params:** `organizationId` (required)

**Response:**
- `204 No Content` — success
- `404 Not Found` — store not found

---

## PUT /api/v1/channel-stores/{storeId}/display-order

Update the display order (for frontend sorting).

**Path params:** `storeId`
**Query params:** `organizationId` (required)
**Body:**

```json
{ "displayOrder": 2 }
```

**Response:**
- `200 OK` — `ChannelStoreConnectionResponse`
- `404 Not Found` — store not found

---

## ChannelStoreConnectionResponse Schema

```json
{
  "id": "string (MongoDB _id)",
  "storeId": "string (human-readable, e.g. shopify-my-store)",
  "channelType": "string (shopify | wix | amazon | ebay | tiktokshop | ...)",
  "storeName": "string",
  "storeUrl": "string",
  "region": "string | null",
  "organizationId": "string",
  "credentials": {
    "<key>": "***MASKED***"
  },
  "isActive": "boolean",
  "displayOrder": "integer",
  "connectedAt": "ISO datetime string",
  "lastSyncedAt": "ISO datetime string | null"
}
```

---

## StoreConnectionRequest Schema

```json
{
  "channelType": "string (required)",
  "storeName": "string (required)",
  "storeUrl": "string (required)",
  "storeId": "string (optional — auto-generated if omitted)",
  "region": "string (optional)",
  "displayOrder": "integer (optional, default 99)",
  "credentials": {
    "<key>": "<value>"
  }
}
```

---

## Error Response Format

All errors return a consistent JSON body:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| HTTP | Error Code | When |
|------|------------|------|
| `400` | `BAD_REQUEST` | Unknown channelType |
| `404` | `STORE_NOT_FOUND` | storeId not in org |
| `409` | `DUPLICATE_STORE` | Same channelType+storeUrl already active |
| `500` | `INTERNAL_ERROR` | Encryption failure or DB error |
