# API Reference — Field Semantic Knowledge Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/field-semantic-knowledge`

Manages `field_semantic_knowledge` collection — the APM knowledge base for Tier 2 (SEMANTIC), Tier 3 (ALIAS), and Tier 4 (PATTERN) matching.

**Status: Not Yet Implemented**

---

## GET `/admin/field-semantic-knowledge`

List entries with optional filters.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `semanticType` | String | Filter by semantic type — "PRICE", "PRODUCT_NAME", "MATERIAL_TYPE", etc. |
| `category` | String | Filter by category — "product", "variant", "media" |
| `channelId` | String | Filter entries valid for a specific channel |
| `isCommon` | Boolean | Filter common fields only |
| `isRequired` | Boolean | Filter required fields only |
| `isActive` | Boolean | Default true |
| `search` | String | Free text search across fieldName, aliases, keywords |

**Response:** `FieldSemanticKnowledge[]`

```json
[
  {
    "id": "6612a3f400000001",
    "fieldName": "material",
    "semanticType": "MATERIAL_TYPE",
    "category": "product",
    "dataType": "string",
    "baseConfidence": 90.0,
    "aliases": ["fabric", "material_type", "cloth_type", "materialType"],
    "keywords": ["material", "fabric", "cloth", "fiber", "textile"],
    "commonPatterns": [".*material.*", ".*fabric.*"],
    "validChannels": [],
    "isCommon": true,
    "isRequired": false,
    "isActive": true,
    "description": "Product material or fabric composition"
  }
]
```

---

## GET `/admin/field-semantic-knowledge/{id}`

Get a single entry by `_id`.

---

## GET `/admin/field-semantic-knowledge/by-name/{fieldName}`

Get entry by unique `fieldName`.

---

## POST `/admin/field-semantic-knowledge`

Create a new semantic knowledge entry.

**Request body:**

```json
{
  "fieldName": "sustainability_cert",
  "semanticType": "SUSTAINABILITY",
  "category": "product",
  "dataType": "string",
  "baseConfidence": 90.0,
  "aliases": ["eco_cert", "green_cert", "sustainability_label", "carbon_neutral"],
  "keywords": ["sustainability", "eco", "green", "certified", "organic", "carbon"],
  "commonPatterns": [".*sustain.*", ".*eco.*cert.*", ".*green.*label.*"],
  "validChannels": [],
  "isCommon": false,
  "isRequired": false,
  "description": "Sustainability certification or eco-label for products"
}
```

**Response:** `201 Created` — saved entry

---

## PUT `/admin/field-semantic-knowledge/{id}`

Update an existing entry. All fields optional — only provided fields are updated.

**Common use cases:**

**Add new aliases to improve matching reach:**
```json
{
  "aliases": ["material", "fabric", "material_type", "cloth_type", "tejido", "matiere"]
}
```

**Add new regex patterns for Tier 4:**
```json
{
  "commonPatterns": [".*material.*", ".*fabric.*", ".*matl.*"]
}
```

**Adjust base confidence:**
```json
{
  "baseConfidence": 92.0
}
```

**Restrict to specific channels:**
```json
{
  "validChannels": ["amazon", "ebay"]
}
```

**Response:** `200 OK` — updated entry or `404`

---

## PUT `/admin/field-semantic-knowledge/{id}/deactivate`

Soft-delete an entry. APM will not use it in matching.

---

## PUT `/admin/field-semantic-knowledge/{id}/activate`

Re-activate a deactivated entry.

---

## DELETE `/admin/field-semantic-knowledge/{id}`

Hard delete. Use `deactivate` for audit-safe removal.

**Response:** `204 No Content`

---

## Semantic Types Reference

Common semantic types already seeded (not exhaustive):

| Type | Description | Example fields |
|---|---|---|
| `PRODUCT_NAME` | Product title | name, title, productName |
| `PRICE` | Price value | price, basePrice, salePrice |
| `SKU` | Stock-keeping unit | sku, seller_sku, itemCode |
| `BRAND` | Manufacturer/brand | brand, vendor, manufacturer |
| `PRODUCT_DESCRIPTION` | Long description | description, body_html, details |
| `CATEGORY` | Product category | category, productType, categoryId |
| `WEIGHT` | Product weight | weight, itemWeight, packageWeight |
| `SIZE` | Size dimension | size, dimensions, itemSize |
| `COLOR` | Product color | color, colour, colorName |
| `MATERIAL_TYPE` | Material composition | material, fabric, materialType |
| `IMAGES` | Product images | mainImage, images, gallery |
| `TAGS` | Product tags/keywords | tags, keywords, labels |
| `BARCODE` | Product barcode | barcode, upc, ean, gtin |
| `INVENTORY` | Stock quantity | inventory_quantity, stock, quantity |

---

## Implementation Notes

**Repository:** `FieldSemanticKnowledgeRepository` — already has all needed query methods.

**Package:** `adaptivepattern/repository/`

**No JOLT invalidation needed** — semantic knowledge changes affect match quality, not target schema structure. Existing JOLT specs continue to work. Merchants re-analyse to benefit from improved matching.

**Uniqueness:** `fieldName` must be unique. On duplicate POST, return `409 Conflict`.
