# API Reference — Channel Configurations Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/channel-configurations`

Targeted read + sub-field update API for `channel_configurations` collection. Full document replace is intentionally not exposed — only safe sub-structures are editable.

**Status: Implemented** (2026-06-04)

**Files:**
- `channel/controller/ChannelConfigurationAdminController.java`
- `channel/model/dto/ChannelFieldBoostRequest.java`
- `channel/model/dto/ChannelPostProcessingRuleRequest.java`

---

## GET `/admin/channel-configurations`

List all channel configurations (system defaults).

**Response:** `ChannelConfiguration[]` — sensitive fields (`integrationConfig`, `oauthConfig`) omitted.

```json
[
  {
    "channelId": "shopify",
    "channelName": "Shopify",
    "isActive": true,
    "version": "1.0",
    "fieldBoosts": [
      {
        "sourcePattern": "brand",
        "targetPattern": "vendor",
        "confidenceBoost": 10.0,
        "reason": "Shopify uses 'vendor' for brand",
        "condition": null
      }
    ],
    "postProcessingRules": [...],
    "categoryRequirements": {...},
    "metadata": {...},
    "updatedAt": "2026-06-04T08:00:00"
  }
]
```

---

## GET `/admin/channel-configurations/{channelId}`

Get a single channel configuration by `channelId`.

**Response:** `ChannelConfiguration` (sensitive fields omitted) or `404`

---

## PUT `/admin/channel-configurations/{channelId}/field-boosts`

Add, update, or remove a field boost entry.

**Request body:**

```json
{
  "action": "add",
  "boost": {
    "sourcePattern": "barcode",
    "targetPattern": ".*upc.*",
    "confidenceBoost": 12.0,
    "reason": "Walmart UPC field naming",
    "condition": null
  }
}
```

**Actions:**

| Action | Effect |
|---|---|
| `add` | Appends the boost to the `fieldBoosts` list |
| `remove` | Removes the first boost matching `sourcePattern + targetPattern` |
| `replace` | Replaces the entire `fieldBoosts` list with the provided array |

**Request body for `remove`:**
```json
{
  "action": "remove",
  "sourcePattern": "stock_quantity",
  "targetPattern": "inventory_quantity"
}
```

**Request body for `replace` (full list replacement):**
```json
{
  "action": "replace",
  "boosts": [
    { "sourcePattern": "brand", "targetPattern": "vendor", "confidenceBoost": 10.0, "reason": "...", "condition": null },
    { "sourcePattern": "barcode", "targetPattern": ".*upc.*", "confidenceBoost": 12.0, "reason": "...", "condition": null }
  ]
}
```

**Response:** `200 OK` — full updated `fieldBoosts` list

**Side effect:** Should invalidate `channel_jolt_specs` for `channelId` — boost changes affect APM confidence scores which affect JOLT spec quality.

---

## PUT `/admin/channel-configurations/{channelId}/post-processing-rules`

Add, update, or remove a post-processing rule.

**Request body:**
```json
{
  "action": "upsert",
  "rule": {
    "name": "enrich-images",
    "enabled": true,
    "sourcePath": "product.images",
    "targetPath": "product.images",
    "operations": [
      {
        "op": "FOR_EACH",
        "steps": [
          { "op": "STRING_TO_OBJECT", "keyField": "src" },
          { "op": "SET_DEFAULT", "field": "alt", "value": "" }
        ]
      }
    ]
  }
}
```

**Actions:** `upsert` (create or update by `name`), `remove` (by `name`), `enable`, `disable`

**Request body for `disable`:**
```json
{ "action": "disable", "name": "enrich_images" }
```

**Response:** `200 OK` — full updated `postProcessingRules` list

---

## GET `/admin/channel-configurations/{channelId}/field-boosts`

Get only the `fieldBoosts` list for a channel.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `condition` | String | Filter by condition — e.g., "category=electronics" |

**Response:** `FieldBoost[]`

---

## Fields NOT Editable via Admin API

| Field | Reason |
|---|---|
| `apiSchema` | Base schema — managed by `ChannelConfigurationDataLoader` (code); extensions via `channel_category_api_schemas` |
| `apiWrapperConfig` | Wrong rootKey breaks every publish — must go through code review |
| `integrationConfig` | Contains credential schemas and auth flows |
| `oauthConfig` | OAuth endpoints/scopes require app re-authorization |
| `categoryRequirements` | Seeded by `ChannelCategoryRequirementsMigration` @Order(111); edit via future admin endpoint |
| `isActive`, `isSystemDefault` | Managed by platform lifecycle, not ops tuning |

---

## `categoryRequirements` — Analisis & Relevansi

> **Dianalisis 2026-06-17** setelah penghapusan `product_categories`. Konfirmasi: **masih aktif dan relevan**.

### Apa itu `categoryRequirements`

Map keyed by generic category slug (`"electronics"`, `"clothing"`, `"food"`, dll.) yang berisi dua list:

- `additionalRequiredFields` — field tambahan yang wajib diisi ketika merchant memilih kategori tersebut di Step 2
- `additionalRecommendedFields` — field yang direkomendasikan (dengan `recommendationScore`)

```json
"categoryRequirements": {
  "clothing": {
    "additionalRequiredFields": [
      { "fieldName": "material",          "fieldType": "string" },
      { "fieldName": "care_instructions", "fieldType": "string" },
      { "fieldName": "size_type",         "fieldType": "string" }
    ],
    "additionalRecommendedFields": [
      { "fieldName": "fit",           "recommendationScore": 0.75 },
      { "fieldName": "sleeve_length", "recommendationScore": 0.70 }
    ]
  }
}
```

### Sumber `categorySlug` — Bukan dari `product_categories`

Ini poin kritis. `ChannelStepSchemaService.resolveCategorySlug()` mengambil slug dari **Step 2 channel data**, bukan dari merchant's `product_categories`:

```
Priority 1: ChannelProductData.channelData["categoryId"]
            → slug yang merchant ketik/simpan langsung (e.g. "clothing")

Priority 2: ChannelProductData.channelData["category"]
            → fallback key

Priority 3: Path B taxonomy resolution
            → channelAttrsForSchema.categoryPath() = ["Apparel & Accessories", "Clothing"]
            → slugFromLabel() → CATEGORY_SLUG_ALIASES.get("apparel") = "clothing"
```

Dengan kata lain: slug datang dari **channel-side category picker** di Step 2 wizard, bukan dari deprecated `product_categories` collection. Penghapusan `product_categories` tidak berdampak pada `categoryRequirements`.

### Flow Lengkap

```
Merchant pilih CATEGORY_TREE field di Step 2 (e.g. Shopify taxonomy "Shirts")
  ↓
ChannelProductData.channelData["categoryId"] = "clothing"   (atau Path B resolved)
  ↓
ChannelStepSchemaService.resolveCategorySlug() = "clothing"
  ↓
channelConfig.getCategoryRequirements().get("clothing")
  ↓
effectiveRequired += [material, care_instructions, size_type]
effectiveRecommended += [fit, sleeve_length, pattern]
  ↓
Section "required" + "recommended" di Step 2 form punya field tambahan
```

### Channel yang Menggunakan `categoryRequirements`

Seeded oleh `ChannelCategoryRequirementsMigration` @Order(111) untuk:

| Channel | Kategori yang Diseed |
|---|---|
| Shopify | clothing, electronics, home-garden, books, toys, sports, beauty, food |
| WIX | clothing, electronics, home-living, beauty, food |
| eBay | electronics, clothing, home-garden, sports, automotive, books |

### Hubungan dengan `fieldBoosts.condition`

`fieldBoosts` di dokumen yang sama juga menggunakan format `"condition": "category=clothing"`. Ini dievaluasi oleh `KnowledgeBasedFieldMatchingService.matchesCondition()` selama APM menggunakan `categorySlug` yang sama. Dua mekanisme ini bekerja dari sumber data yang sama — channel-side category selection.

```json
{
  "sourcePattern": "material",
  "targetPattern": ".*material.*",
  "confidenceBoost": 8,
  "condition": "category=clothing"
}
```

Boost ini hanya aktif ketika product di-analyse dalam konteks kategori "clothing".

---

## Implementation Notes

**Controller:** `channel/controller/ChannelConfigurationAdminController.java`
**DTOs:** `channel/model/dto/ChannelFieldBoostRequest.java`, `channel/model/dto/ChannelPostProcessingRuleRequest.java`
**Repository:** `ChannelConfigurationRepository` — uses `findSystemDefaultByChannelId` and `findAllSystemDefaults`.

**Sensitive field redaction:** `integrationConfig` and `oauthConfig` are set to null before returning any response — they are never exposed via this API.

**Update strategy:** Load document → modify only the targeted sub-field → save. Prevents accidental overwrite of other fields.

**Concurrency note:** Last-write-wins. Low risk for infrequent admin operations.

**Implemented endpoints:**
- `GET /` → `findAllSystemDefaults()` + redact
- `GET /{channelId}` → `findSystemDefaultByChannelId` + redact + 404
- `GET /{channelId}/field-boosts` → returns only fieldBoosts list; optional `?condition=` filter
- `PUT /{channelId}/field-boosts` → actions: `add`, `remove`, `replace`; returns updated list
- `PUT /{channelId}/post-processing-rules` → actions: `upsert`, `remove`, `enable`, `disable`; returns updated list
