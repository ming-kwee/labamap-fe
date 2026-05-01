# 13 — New Endpoints Required: Edit, Delete, Reactivate

> **Date:** 2026-02-25
> **Raised by:** Frontend team after implementing store management (edit / delete / reactivate)
> **Affects:** `ChannelStoreController.java`, `ChannelStoreService.java`

Three new backend endpoints are required to support the store management UI.
The frontend service stubs and modal/dashboard are fully implemented and waiting
for these endpoints.

---

## Endpoint 1 — Update store details

```
PUT /api/v1/channel-stores/{storeId}?organizationId={organizationId}
Content-Type: application/json
```

### Request body

```json
{
  "storeName":    "My Shopify US Store",
  "storeUrl":     "mystore.myshopify.com",
  "region":       "US",
  "displayOrder": 2,
  "credentials":  {
    "accessToken": "shpat_newtoken",
    "apiKey":      "abc123",
    "apiSecret":   "secret"
  }
}
```

All fields are **optional in the update**. Only send what the user changed.

### Credential handling

- If `credentials` is present and non-empty → replace all credential fields.
- If `credentials` is absent or an empty object `{}` → keep existing credentials unchanged.

The frontend sends an empty `credentials: {}` when the user left all credential
fields blank ("keep existing"). The backend must treat an empty credentials
object as "no change".

### Response

```json
HTTP 200
ChannelStoreConnection  (same shape as POST /channel-stores response)
```

### Error responses

```json
HTTP 404  { "error": "STORE_NOT_FOUND",     "message": "Store not found: <storeId>" }
HTTP 409  { "error": "DUPLICATE_STORE",     "message": "Store already connected: <storeUrl>" }
HTTP 400  { "error": "VALIDATION_FAILED",   "message": "..." }
```

### Backend notes

- Run `normalizeUrl()` on `storeUrl` before the duplicate check and before save
  (same as `connectStore`).
- The `channelType` field is **not** updatable. Ignore it if present.
- Verify that the store belongs to the given `organizationId` before updating.

---

## Endpoint 2 — Reactivate a store

```
PUT /api/v1/channel-stores/{storeId}/activate?organizationId={organizationId}
```

No request body required.

### Response

```json
HTTP 200
ChannelStoreConnection  (with isActive: true)
```

### Error responses

```json
HTTP 404  { "error": "STORE_NOT_FOUND",  "message": "Store not found: <storeId>" }
HTTP 409  { "error": "ALREADY_ACTIVE",   "message": "Store is already active" }
```

### Backend notes

- Sets `isActive = true` on the entity and saves.
- Symmetric to the existing `PUT /channel-stores/{storeId}/deactivate`.

---

## Endpoint 3 — Permanently delete a store

```
DELETE /api/v1/channel-stores/{storeId}?organizationId={organizationId}
```

### Response

```
HTTP 204 No Content
```

### Error responses

```json
HTTP 404  { "error": "STORE_NOT_FOUND", "message": "Store not found: <storeId>" }
```

### Backend notes

- Hard delete — removes the document from MongoDB.
- Consider also cleaning up any `ChannelProductData` documents referencing this
  `storeId` (or document the cascade behaviour for the frontend).
- Verify `organizationId` ownership before deleting.

---

## Additional note — `listStores` and inactive stores

Currently `GET /api/v1/channel-stores?organizationId=...` returns only active
stores. After the user deactivates a store, the frontend keeps it in local state
with `isActive: false` so the user can reactivate it from the same session.

However, on the next page load the inactive store will disappear from the list
because the API does not return it.

**Recommended:** add an optional query parameter to control this behaviour:

```
GET /api/v1/channel-stores?organizationId=...&includeInactive=true
```

When `includeInactive=true`, return all stores regardless of `isActive`.
The frontend will start sending this flag once the backend supports it.

Until then, deactivated stores are only visible within the same browser session.

---

## Summary

| # | Endpoint | Method | Priority |
|---|----------|--------|----------|
| 1 | `/channel-stores/{storeId}` | PUT | **HIGH** — edit button in UI is non-functional without this |
| 2 | `/channel-stores/{storeId}/activate` | PUT | **HIGH** — reactivate button non-functional without this |
| 3 | `/channel-stores/{storeId}` | DELETE | **MEDIUM** — delete button non-functional without this |
| 4 | `/channel-stores?includeInactive=true` | GET (param addition) | **LOW** — UX improvement only; in-session reactivation works without it |
