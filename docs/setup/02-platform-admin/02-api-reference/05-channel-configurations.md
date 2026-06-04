# API Reference — Channel Configurations Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/channel-configurations`

Targeted read + sub-field update API for `channel_configurations` collection. Full document replace is intentionally not exposed — only safe sub-structures are editable.

**Status: Not Yet Implemented**

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
    "name": "enrich_images",
    "enabled": true,
    "operations": [
      {
        "type": "ENRICH_IMAGES",
        "sourceField": "galleryImages",
        "targetField": "product.images"
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
| `isActive`, `isSystemDefault` | Managed by platform lifecycle, not ops tuning |

---

## Implementation Notes

**Repository:** `ChannelConfigurationRepository` — `findActiveByChannelId`, `findSystemDefaultByChannelId`, `findAll`.

**Package:** `channel/repository/`

**Update strategy:** Load the document, modify only the targeted sub-field, save. Do not use `$set` with the full document to avoid overwriting other fields.

**Concurrency note:** If two admins update field boosts simultaneously, the second write wins (last-write-wins). This is acceptable for low-frequency admin operations.
