# API Reference — Field Semantic Knowledge Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/field-semantic-knowledge`

Manages `field_semantic_knowledge` collection — the APM knowledge base for Tier 2 (SEMANTIC), Tier 3 (ALIAS), and Tier 4 (PATTERN) matching.

**Status: Implemented** (2026-06-04)

**Files:**
- `adaptivepattern/controller/FieldSemanticKnowledgeAdminController.java`
- `adaptivepattern/model/dto/FieldSemanticKnowledgeRequest.java`

---

## GET `/admin/field-semantic-knowledge`

List entries with optional filters. Filter priority (most specific base query wins):
1. `channelId` → entries valid for that channel (`validChannels` contains channelId)
2. `semanticType` → all entries of that type
3. `category` → all entries in that category
4. `search` → text search across fieldName, aliases, keywords (regex, case-insensitive)
5. none → all active entries (pass `isActive=false` to include deactivated)

Additional filters `isActive`, `isRequired`, `isCommon`, `minConfidence` applied reactively on top of the base query.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `semanticType` | String | — | Filter by semantic type — "PRICE", "PRODUCT_NAME", "MATERIAL_TYPE", etc. |
| `category` | String | — | Filter by category — "product", "variant", "media", "pricing" |
| `channelId` | String | — | Filter entries valid for a specific channel |
| `search` | String | — | Text search across fieldName, aliases, keywords |
| `isCommon` | Boolean | — | Filter common fields only |
| `isRequired` | Boolean | — | Filter required fields only |
| `isActive` | Boolean | `true` | Pass `false` to include deactivated entries |
| `minConfidence` | Double | — | Filter by baseConfidence >= value |

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

**Defaults applied when not provided:**
- `baseConfidence` → `85.0`
- `isActive` → `true`
- `isCommon` → `false`
- `isRequired` → `false`
- `dataSource` → `"USER_DEFINED"`
- `usageCount` → `0`
- `successRate` → `0.0`

**Returns `400 Bad Request`** when `fieldName` or `semanticType` is missing.
**Returns `409 Conflict`** when `fieldName` already exists — use `PUT /{id}` to update.

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

**Controller:** `adaptivepattern/controller/FieldSemanticKnowledgeAdminController.java`
**DTO:** `adaptivepattern/model/dto/FieldSemanticKnowledgeRequest.java`
**Repository:** `FieldSemanticKnowledgeRepository` — all needed query methods already exist.

**No JOLT invalidation** — semantic knowledge changes affect APM match quality, not target schema structure. Existing JOLT specs continue to work. Merchants re-analyse to benefit from improved semantic matching.

**Uniqueness:** `fieldName` is `@Indexed(unique=true)` at DB level. `POST` returns `409 Conflict` on duplicate via application-level guard before the DB constraint fires.

**Immutable after creation:** `fieldName` — ignored if included in `PUT` body.

**Never editable:** `usageCount`, `successRate`, `lastUpdated` — learned from APM usage history. `lastUpdated` is set automatically by the service on every save.
