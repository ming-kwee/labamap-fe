# Phase 5 — Form Schema: ProductType-Based Cache Key

**Effective date:** 2026-04-28  
**Affects endpoints:** `POST /generate`, `GET /generate`, `POST /refresh`, `DELETE /cache`, `DELETE /cache/product-type/{productTypeId}`

---

## Background

Before Phase 5, the `ecommerce_form_schemas` cache was keyed by:

```
{userId}_{organizationId}_{productCategorySlug}_{channels}
```

This was incorrect because the actual schema content (which attributes appear) is determined by the **ProductType** assigned to the category, not the category slug itself. Two categories sharing the same ProductType produced identical schemas but were cached separately — and when a ProductType's attributes changed, the admin had to know all affected category slugs to invalidate correctly.

Phase 5 changes the discriminator to `productTypeId`:

| Before | After |
|--------|-------|
| `user1_org1_electronics_shopify` | `user1_org1_type_<productTypeId>_shopify` |
| `user1_org1_laptops_shopify` | `user1_org1_type_<productTypeId>_shopify` *(same key if same type)* |
| `user1_org1_general_shopify` | `user1_org1_cat_general_shopify` *(no type assigned → slug fallback)* |

---

## What Changes for the Frontend

### 1. New fields in `metadata` of all schema responses

All three schema endpoints — `POST /generate`, `GET /generate`, `POST /refresh` — now include two additional fields inside the `metadata` object:

```json
{
  "success": true,
  "formSchema": { ... },
  "metadata": {
    "generatedAt": "2026-04-28T10:00:00",
    "generatedFor": { ... },
    "schemaVersion": "1.0.0",
    "productTypeId": "6623a1b2c3d4e5f6a7b8c9d0",
    "productTypeName": "Laptop"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `productTypeId` | `string \| null` | MongoDB ObjectId of the ProductType resolved from `productCategory`. `null` when no category was passed or the category has no ProductType assigned yet. |
| `productTypeName` | `string \| null` | Human-readable name of the ProductType (e.g., `"Laptop"`, `"Apparel"`). `null` when `productTypeId` is `null`. |

**No breaking change.** These are new keys added to an existing object. Existing consumers that ignore unknown keys are unaffected.

### 2. Use `productTypeId` as the canonical form-context identifier

The frontend should use `productTypeId` (when non-null) as the key for any client-side caching, form-state restoration, or analytics:

```js
// Before
const cacheKey = `${orgId}:${productCategory}:${channels.join(',')}`;

// After
const cacheKey = productTypeId
  ? `${orgId}:type:${productTypeId}:${channels.join(',')}`
  : `${orgId}:cat:${productCategory ?? 'general'}:${channels.join(',')}`;
```

This ensures two products in different categories but the same ProductType share a single cached schema on the client.

### 3. Category selector UX guidance

When a user selects a product category:

1. Call `POST /refresh` with the new `productCategory`.
2. Read `metadata.productTypeId` and `metadata.productTypeName` from the response.
3. Display `productTypeName` as a contextual hint (e.g., *"Fields shown for: Laptop"*) so the user understands why certain attribute sections appeared.
4. If `productTypeId` is `null`, the category exists but has no ProductType yet — show a neutral hint (e.g., *"Category-specific fields loading — contact your admin"*).

---

## New Cache Invalidation Endpoint

### `DELETE /api/v1/ecommerce/form-schema/cache/product-type/{productTypeId}`

Invalidates all cached schemas for every user/org/channel combination that used the given ProductType. Call this after:

- Adding or removing attributes from a ProductType (changing `productTypeIds` on master attributes).
- Changing which ProductType is assigned to a category.
- Any admin action that alters what fields a ProductType exposes.

**Request**

```
DELETE /api/v1/ecommerce/form-schema/cache/product-type/6623a1b2c3d4e5f6a7b8c9d0
```

No request body required.

**Response `200 OK`**

```json
{
  "success": true,
  "deletedCount": 42,
  "productTypeId": "6623a1b2c3d4e5f6a7b8c9d0",
  "message": "Cached schemas invalidated for productTypeId: 6623a1b2c3d4e5f6a7b8c9d0"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deletedCount` | `number` | Number of cache documents deleted. |

The existing `DELETE /api/v1/ecommerce/form-schema/cache` (delete all) remains available for full cache wipe.

---

## Migration Notes for Existing Cache Documents

Existing documents in `ecommerce_form_schemas` have `schema_key` values using the old slug-based format. They will not match new-format keys and will be treated as cache misses, triggering fresh generation. Old documents will age out naturally via the 30-day TTL (`cache_ttl` field).

To force an immediate clean slate, run:

```
DELETE /api/v1/ecommerce/form-schema/cache
```

---

## Summary of Endpoint Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/ecommerce/form-schema/generate` | `metadata` now includes `productTypeId`, `productTypeName` |
| `GET /api/v1/ecommerce/form-schema/generate` | `metadata` now includes `productTypeId`, `productTypeName` |
| `POST /api/v1/ecommerce/form-schema/refresh` | `metadata` now includes `productTypeId`, `productTypeName` |
| `DELETE /api/v1/ecommerce/form-schema/cache` | Unchanged (still deletes all) |
| `DELETE /api/v1/ecommerce/form-schema/cache/product-type/{productTypeId}` | **New** — type-scoped invalidation |
