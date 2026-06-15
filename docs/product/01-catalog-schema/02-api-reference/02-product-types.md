# API Reference — Product Types

Base path: `/labamap/api/v1/admin/product-types`

---

## MongoDB Collection: `product_types`

```json
{
  "_id":            "ObjectId",
  "name":           "Kaos Pria",
  "slug":           "kaos-pria",
  "description":    "Kaos pria katun, polos dan bergambar",
  "variantDimensions": [
    { "attributeCode": "color",  "order": 1, "required": true },
    { "attributeCode": "size",   "order": 2, "required": true }
  ],
  "channelCategoryDefaults": [
    {
      "channelType":      "shopee",
      "categoryId":       "100001",
      "categoryName":     "Kaos",
      "categoryFullPath": "Pakaian › Pria › Atasan › Kaos",
      "updatedAt":        "2026-06-15T10:00:00Z"
    },
    {
      "channelType":      "tokopedia",
      "categoryId":       "30045",
      "categoryName":     "Kaos",
      "categoryFullPath":  "Fashion Pria › Baju Pria › Kaos",
      "updatedAt":        "2026-06-15T10:00:00Z"
    }
  ],
  "inheritFromTypeId": null,
  "attributeCount":    8,
  "active":            true,
  "createdAt": "2026-01-10T08:00:00Z",
  "updatedAt": "2026-06-15T10:00:00Z"
}
```

`attributeCount` is denormalized — updated whenever `MasterAttribute.productTypeIds` changes.

`channelCategoryDefaults` is an array of per-channel default categories. Set by platform admin via the Product Types page. Used by Step 2 to pre-fill `CATEGORY_TREE` fields when a merchant opens a channel tab and hasn't yet selected a category.

Each entry in `variantDimensions` references a MasterAttribute by `attributeCode`.

---

## Indexes

```javascript
db.product_types.createIndex({ slug: 1 }, { unique: true })
db.product_types.createIndex({ active: 1 })
```

---

## GET `/admin/product-types`

Returns all product types.

**Query params:**
- `?active=true` — filter to active only

**Response:**
```json
[
  {
    "id": "6623a1b2c3d4e5f6a7b8c9e1",
    "name": "Smartphone",
    "slug": "smartphone",
    "description": "...",
    "variantDimensions": [
      { "attributeCode": "color", "order": 1, "required": true },
      { "attributeCode": "storage_capacity", "order": 2, "required": true }
    ],
    "attributeCount": 12,
    "active": true
  }
]
```

---

## GET `/admin/product-types/{id}`

Returns a single ProductType with full `variantDimensions` array. This is the endpoint called by `useProductTypeVariants` to get the dimensions.

---

## POST `/admin/product-types`

**Request body:**
```json
{
  "name":           "Smartwatch",
  "slug":           "smartwatch",
  "description":    "Wearable with health sensors and connectivity",
  "variantDimensions": [
    { "attributeCode": "color",          "order": 1, "required": true },
    { "attributeCode": "strap_material", "order": 2, "required": false }
  ],
  "inheritFromTypeId": null,
  "active": true
}
```

**Backend validations:**
- Each `attributeCode` in `variantDimensions` must exist in `ecommerce_master_attributes`
- Initializes `attributeCount: 0`

---

## PUT `/admin/product-types/{id}`

All fields optional.

**Side effects on `variantDimensions` change:**
- Existing products keep their saved variant structure (no retroactive change)
- New products created with this type use the new dimensions immediately
- Form schema cache for this `productTypeId` is invalidated

---

## GET `/admin/product-types/{id}/channel-defaults/{channelType}` (Phase 2)

Returns the default channel category for a specific channel type, or `404` if none is set.

```
GET /admin/product-types/6623a1b2c3d4e5f6a7b8c9e1/channel-defaults/shopee

Response 200:
{
  "channelType":      "shopee",
  "categoryId":       "100001",
  "categoryName":     "Kaos",
  "categoryFullPath": "Pakaian › Pria › Atasan › Kaos",
  "updatedAt":        "2026-06-15T10:00:00Z"
}

Response 404: no default set for this channel type
```

Called by Step 2 `ChannelStoreTab` on mount to pre-fill the `CATEGORY_TREE` field when
the merchant hasn't yet selected a category for this product.

---

## PUT `/admin/product-types/{id}/channel-defaults/{channelType}` (Phase 2)

Set or replace the default channel category for a specific channel type.

```json
{
  "channelType":      "shopee",
  "categoryId":       "100001",
  "categoryName":     "Kaos",
  "categoryFullPath": "Pakaian › Pria › Atasan › Kaos"
}
```

**Response `200 OK`:** full updated `ProductType` document (with all `channelCategoryDefaults`).

Backend should upsert the entry — if a default already exists for this `channelType`, replace it.

---

## DELETE `/admin/product-types/{id}/channel-defaults/{channelType}` (Phase 2)

Remove the default for a specific channel type.

**Response `200 OK`:** full updated `ProductType` document.  
**Response `404`:** no default existed for this channel type (idempotent — treat as success on frontend).

---

## DELETE `/admin/product-types/{id}`

Returns `409 Conflict` if any `product_categories` document has `productTypeId` pointing to this type. Unassign from all categories first.

---

## PATCH `/admin/product-types/{id}/toggle-active`

Toggles the `active` boolean. No request body needed.

Inactive types:
- Hidden from the merchant's ProductType selector
- Still resolve correctly for existing products and categories that reference them
- Continue to drive variant matrices for existing products

---

## POST `/admin/product-types/match-by-options` (Phase 5)

Auto-suggests ProductTypes for unmapped channel categories during second-channel onboarding.

**Request body:**
```json
{
  "categoryNames": ["Phones & Tablets", "Computers", "Men's Clothing"]
}
```

**Response:**
```json
[
  {
    "categoryName":    "Phones & Tablets",
    "suggestedTypeId": "6623a1b2c3d4e5f6a7b8c9e1",
    "suggestedName":   "Smartphone",
    "matchConfidence": 87
  },
  {
    "categoryName":    "Men's Clothing",
    "suggestedTypeId": "6623a1d4c3d4e5f6a7b8c9e3",
    "suggestedName":   "Apparel",
    "matchConfidence": 83
  }
]
```

`matchConfidence` 0–100. Frontend shows suggestions ≥ 60 as pre-accepted; below 60 the merchant must manually choose.
