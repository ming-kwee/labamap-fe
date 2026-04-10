# Phase 4 — ProductType Entity: Backend Contract Changes

> **Context:** Phase 4 introduces `ProductType` as a stable schema contract that decouples
> `ProductCategory` (merchant data, changes freely) from `MasterAttribute` (platform-engineer
> data, changes rarely). Frontend implementation lives in
> `src/app/omni-admin/product-types/`.

---

## 1. New Collection — `product_types`

```js
{
  _id:                 ObjectId,
  name:                String,              // "Smartphone"
  slug:                String,              // "smartphone" (unique)
  description:         String | null,
  inheritFromTypeId:   ObjectId | null,     // optional parent for attribute inheritance
  variantDimensions:   [                   // THE KEY FIELD — defines SKU matrix axes
    {
      attributeCode:   String,             // e.g. "color"
      attributeName:   String,             // e.g. "Color" (denormalized for display)
      order:           Number,             // 1 = rows, 2 = columns, 3 = depth
      required:        Boolean,
    }
  ],
  attributeCount:      Number,             // denormalized: how many MasterAttributes reference this type
                                           // updated when any attribute's productTypeIds changes
  active:              Boolean,
  createdAt:           ISODate,
  updatedAt:           ISODate,
}
```

### Indexes

```js
{ slug: 1 }                              // unique
{ active: 1 }
{ inheritFromTypeId: 1 }                 // for inheritance chain queries
```

---

## 2. New Endpoints — `ProductTypeAdminController`

Base path: `/labamap/api/v1/admin/product-types`

### 2.1 List all product types

```
GET /?active=true|false
```

Response: `ProductTypeDto[]`

```json
[
  {
    "id": "...",
    "name": "Smartphone",
    "slug": "smartphone",
    "description": "Handheld mobile devices with touchscreen",
    "inheritFromTypeId": null,
    "inheritFromTypeName": null,
    "variantDimensions": [
      { "attributeCode": "color",   "attributeName": "Color",   "order": 1, "required": true },
      { "attributeCode": "storage", "attributeName": "Storage", "order": 2, "required": true }
    ],
    "attributeCount": 14,
    "active": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

---

### 2.2 Get single product type

```
GET /{id}
```

Response: `ProductTypeDto` (same shape as above)

---

### 2.3 Create product type

```
POST /
```

Body:
```json
{
  "name": "Smartphone",
  "slug": "smartphone",
  "description": "...",
  "inheritFromTypeId": null,
  "variantDimensions": [
    { "attributeCode": "color",   "attributeName": "Color",   "order": 1, "required": true },
    { "attributeCode": "storage", "attributeName": "Storage", "order": 2, "required": true }
  ],
  "active": true
}
```

Validation:
- `slug` must be unique (409 if duplicate)
- `attributeCode` in `variantDimensions` should reference a real `fieldName` in `master_attributes` (warn, not block)
- `inheritFromTypeId` must reference an existing product type (400 if not found)

Response: `ProductTypeDto` (with server-assigned `_id`, `createdAt`, `updatedAt`)

---

### 2.4 Full update

```
PUT /{id}
```

Same body shape as POST. Preserves `createdAt`.

Response: `ProductTypeDto` or `204 No Content`

---

### 2.5 Toggle active

```
PATCH /{id}/active?active=true|false
```

Response: `204 No Content` (or updated `ProductTypeDto`)

---

### 2.6 Delete

```
DELETE /{id}
```

- Block with `409 Conflict` if any `product_categories` document has `productTypeId = this id`.
- Response body on 409: `{ "message": "This type is assigned to N categories. Reassign or remove them first." }`
- On success: `204 No Content`

---

## 3. Changes to `master_attributes` Collection

### 3.1 New field: `productTypeIds`

Add to `EcommerceMasterAttributeDocument`:

```java
@Field("productTypeIds")
private List<ObjectId> productTypeIds = new ArrayList<>();
```

**Behaviour:**
- Phase 4 preferred field (replaces `applicableCategories` for new code)
- Phase 1/2 `applicableCategories` field is kept for backwards compatibility
- Both fields can coexist: `categoryIds` for legacy path-inheritance filtering, `productTypeIds` for type-based filtering

**Index:**
```js
{ "productTypeIds": 1 }
```

### 3.2 Updated POST / PUT payload acceptance

```json
{
  ...existing fields...,
  "productTypeIds": ["<productTypeId1>", "<productTypeId2>"]
}
```

Backend validates each ID against the `product_types` collection (warn, not block if unknown).

### 3.3 Updated GET response

Include `productTypeIds` in `EcommerceMasterAttributeDto`:

```json
{
  "id": "...",
  "fieldName": "color",
  ...
  "applicableCategories": ["<categoryId>"],
  "productTypeIds": ["<productTypeId1>"]
}
```

### 3.4 Denormalized `attributeCount` on ProductType

When any attribute's `productTypeIds` changes (POST or PUT), trigger an async update:
```java
productTypeRepository.findAllById(changedTypeIds)
  .forEach(pt -> pt.setAttributeCount(
    masterAttributeRepository.countByProductTypeIdsContaining(pt.getId())
  ));
```

---

## 4. Changes to `product_categories` Collection

### 4.1 New field: `productTypeId`

Add to `ProductCategoryDocument`:

```java
@Field("productTypeId")
private ObjectId productTypeId;   // nullable

// denormalized for fast list display (avoid join)
@Field("productTypeName")
private String productTypeName;   // nullable
```

Keep `productTypeName` in sync whenever:
- `productTypeId` changes on a category (PUT `/{id}`)
- A `ProductType` is renamed (PUT `/product-types/{id}`)

### 4.2 Updated POST / PUT payload acceptance

```json
{
  "name": "Smartphones",
  "slug": "smartphones",
  ...
  "productTypeId": "<productTypeObjectId>"
}
```

If `productTypeId` changes:
1. Validate the new ID exists in `product_types`
2. Copy `productType.name` into `productTypeName` for denormalization

### 4.3 Updated GET responses

Include `productTypeId` and `productTypeName` in all `ProductCategoryDto` responses:
```json
{
  "id": "...",
  "name": "Smartphones",
  "productTypeId": "<id>",
  "productTypeName": "Smartphone",
  ...
}
```

Applies to: `GET /`, `GET /tree`, `GET /{id}`, `GET /{id}/children`, `GET /slugs`

---

## 5. Inheritance Chain (server-side resolution)

When a `ProductCategory` has no `productTypeId` of its own, the attribute schema should
be inherited from the nearest ancestor that does have one.

**Recommended backend implementation:**

```
GET /product-categories/{id}/effective-product-type
```

Response:
```json
{
  "productTypeId": "<id>",
  "productTypeName": "Smartphone",
  "inheritedFrom": "<ancestorCategoryId>",
  "inheritedFromName": "Electronics > Phones"
}
```

Alternatively, compute `effectiveProductTypeId` on the client using the flattened category tree
and the path — walk up ancestors until one has `productTypeId` set.

---

## 6. Auto-Suggest ProductType on Category Import (Phase 3 integration)

When `POST /channel-category-mappings/import/start` creates new `ProductCategory` records,
run a fuzzy name match against `product_types.name`:

```java
String suggestedTypeId = productTypeRepository.findAll()
  .stream()
  .max(Comparator.comparingInt(pt -> FuzzyMatcher.score(importedName, pt.getName())))
  .filter(pt -> FuzzyMatcher.score(importedName, pt.getName()) >= 70)
  .map(ProductTypeDocument::getId)
  .orElse(null);
```

Include in import response:
```json
{ "categoryId": "...", "categoryName": "Smartphones", "suggestedProductTypeId": "...", "suggestedProductTypeName": "Smartphone", "matchConfidence": 94 }
```

Frontend shows this suggestion during the post-import "assign types" step.

---

## 7. MongoDB Indexes Summary

```js
// product_types
db.product_types.createIndex({ slug: 1 }, { unique: true })
db.product_types.createIndex({ active: 1 })

// master_attributes
db.master_attributes.createIndex({ productTypeIds: 1 })

// product_categories
db.product_categories.createIndex({ productTypeId: 1 })
```

---

## 8. Summary of New / Changed Endpoints

| Method | Path | Change |
|--------|------|--------|
| GET | `/product-types/` | **NEW** — list all types |
| GET | `/product-types/{id}` | **NEW** — get one type |
| POST | `/product-types/` | **NEW** — create type |
| PUT | `/product-types/{id}` | **NEW** — update type |
| PATCH | `/product-types/{id}/active` | **NEW** — toggle active |
| DELETE | `/product-types/{id}` | **NEW** — delete (blocked if categories reference it) |
| GET | `/master-attributes/` | **CHANGED** — response includes `productTypeIds` |
| POST | `/master-attributes/` | **CHANGED** — accepts `productTypeIds` in body |
| PUT | `/master-attributes/{id}` | **CHANGED** — accepts `productTypeIds` in body |
| GET | `/product-categories/` (all variants) | **CHANGED** — response includes `productTypeId`, `productTypeName` |
| POST | `/product-categories/` | **CHANGED** — accepts `productTypeId` in body |
| PUT | `/product-categories/{id}` | **CHANGED** — accepts `productTypeId`; denormalizes `productTypeName` |
