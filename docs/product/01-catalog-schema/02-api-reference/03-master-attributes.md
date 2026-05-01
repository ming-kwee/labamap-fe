# API Reference — Master Attributes

Base path: `/labamap/api/v1/admin/master-attributes`

---

## MongoDB Collection: `master_attributes`

```json
{
  "_id":          "ObjectId",
  "fieldName":    "color",
  "description":  "Color",
  "fieldType":    "SELECT",
  "section":      "variants",
  "required":     false,
  "variantScope": "variant_only",
  "displayLevel": "basic",
  "options": [
    { "value": "black",  "label": "Midnight Black" },
    { "value": "silver", "label": "Silver" },
    { "value": "gold",   "label": "Gold" }
  ],
  "applicableCategories": ["ObjectId_Smartphones"],
  "productTypeIds":        ["ObjectId_Smartphone"],
  "channelMappings": [
    { "channelType": "shopify", "fieldName": "Color",      "required": true  },
    { "channelType": "amazon",  "fieldName": "color_name", "required": true  },
    { "channelType": "tiktok",  "fieldName": "sku_attr_color", "required": false }
  ],
  "validationRules": {
    "required": false,
    "maxItems":  1
  },
  "createdAt": "2026-01-10T08:00:00Z",
  "updatedAt": "2026-04-20T14:00:00Z"
}
```

---

## Field Reference

| Field | Description |
|-------|-------------|
| `fieldName` | Unique code, used as form field key and in `variantDimensions.attributeCode` |
| `fieldType` | Java enum — serialises uppercase+underscore (e.g., `CATEGORY_SELECT`) |
| `variantScope` | `"product_only"` \| `"variant_only"` \| `"dual"` |
| `displayLevel` | `"essential"` \| `"basic"` \| `"advanced"` \| `"optional"` \| `"category-specific"` |
| `applicableCategories` | Phase 1 legacy: category ObjectIds — used when `productTypeIds` is empty |
| `productTypeIds` | Phase 4: ProductType ObjectIds — takes priority over `applicableCategories` |
| `channelMappings` | How this attribute maps to channel-specific field names for channel adapters |

**Dual-mode filter rule:** if `productTypeIds` is non-empty, use Phase 4 filter. Otherwise fall back to Phase 1 `applicableCategories`. If neither is set, the attribute is global (always included).

---

## Indexes

```javascript
db.master_attributes.createIndex({ applicableCategories: 1 })     // Phase 1 legacy filter
db.master_attributes.createIndex({ productTypeIds: 1 })           // Phase 4 filter
db.master_attributes.createIndex({ fieldType: 1 })                // variant option lookup
db.master_attributes.createIndex({ fieldName: 1 }, { unique: true })
```

---

## GET `/admin/master-attributes`

**Query params:**

| Param | Behaviour |
|-------|-----------|
| `categoryId` | Phase 1+2 hybrid: includes descendants via path prefix; also filters Phase 4 by category's `productTypeId` |
| `productTypeId` | Phase 4 direct: `productTypeIds ∋ productTypeId` |
| `section` | Filter by section name (e.g., `variants`) |
| `fieldType` | Filter by type (e.g., `SELECT`) |

When `categoryId` is provided, the response includes attributes matching either the Phase 4 or Phase 1 filter (OR condition).

**Response:**
```json
[
  {
    "fieldName":    "color",
    "fieldType":    "SELECT",
    "label":        "Color",
    "section":      "variants",
    "required":     false,
    "displayLevel": "basic",
    "variantScope": "variant_only",
    "options": [
      { "value": "black",  "label": "Midnight Black" },
      { "value": "silver", "label": "Silver" }
    ],
    "validationRules": { "maxItems": 1 },
    "productTypeIds": ["6623a1b2..."]
  }
]
```

---

## GET `/admin/master-attributes/category-counts`

Returns the number of applicable attributes per category. Used for admin badge display.

**Response:**
```json
{
  "64f3a1b2c3d4e5f6a7b8c9d0": 12,
  "64f3a1b2c3d4e5f6a7b8c9d1": 8
}
```

Keys are category ObjectId strings, values are attribute counts.

Per-category logic:
- If category has `productTypeId`: count = `{ productTypeIds: categoryTypeId }` MongoDB count
- If no `productTypeId`: in-memory legacy subtree count

---

## POST `/admin/master-attributes`

**Request body:**
```json
{
  "fieldName":    "5g_support",
  "description":  "5G Support",
  "fieldType":    "BOOLEAN",
  "section":      "product_info",
  "required":     false,
  "displayLevel": "advanced",
  "variantScope": "product_only",
  "productTypeIds": ["6623a1b2c3d4e5f6a7b8c9e1"],
  "channelMappings": [
    { "channelType": "amazon", "fieldName": "connectivity_technology", "required": false }
  ]
}
```

**Backend side effects:**
- Increments `attributeCount` on each ProductType in `productTypeIds`
- Invalidates form schema cache for each affected `productTypeId`

---

## PUT `/admin/master-attributes/{id}`

All fields optional.

**Side effects on `productTypeIds` change:**
- Recomputes `attributeCount` on all affected ProductTypes (both old and new lists)
- Invalidates form schema cache for all affected `productTypeId` values

---

## DELETE `/admin/master-attributes/{id}`

Marks attribute as deleted. Existing product data retaining the field value is preserved — the attribute is removed from forms but historical values are kept.

---

## fieldType Values

| Value | Rendered as |
|-------|------------|
| `TEXT` | `<input type="text">` |
| `NUMBER` | `<input type="number">` |
| `SELECT` | `<select>` with options (drives variant dimensions) |
| `MULTI_SELECT` | Multi-checkbox or multi-select |
| `BOOLEAN` | Checkbox |
| `TEXTAREA` | `<textarea>` |
| `DATE` | Date picker |
| `IMAGE` / `FILE` / `MEDIA` | `ImageUploadField` |
| `CATEGORY_SELECT` | `CategorySelectField` (live category tree picker) |

The backend enum serialises as uppercase + underscore (e.g., `CATEGORY_SELECT`). The frontend `FieldRenderer` normalises before matching: `.toLowerCase().replace(/_/g, '-')` → `"category-select"`.
