# API Reference — Product Types

Base path: `/labamap/api/v1/admin/product-types`

---

## MongoDB Collection: `product_types`

```json
{
  "_id":            "ObjectId",
  "name":           "Smartphone",
  "slug":           "smartphone",
  "description":    "Mobile phones with touch interface and app ecosystem",
  "variantDimensions": [
    { "attributeCode": "color",            "order": 1, "required": true },
    { "attributeCode": "storage_capacity", "order": 2, "required": true }
  ],
  "inheritFromTypeId": null,
  "attributeCount":    12,
  "active":            true,
  "createdAt": "2026-01-10T08:00:00Z",
  "updatedAt": "2026-04-20T14:00:00Z"
}
```

`attributeCount` is denormalized — updated whenever `MasterAttribute.productTypeIds` changes. Used in the ProductType list view without querying `ecommerce_master_attributes`.

Each entry in `variantDimensions` references a MasterAttribute by `attributeCode`. The attribute must be `SELECT` or `MULTI_SELECT` with an `options[]` array populated. `order` determines which axis is rows (1) and which is columns (2, 3, ...) in the variant matrix.

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
