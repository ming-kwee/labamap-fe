# API Reference — Channel Field Mappings Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/channel-field-mappings`

Manages `channel_field_mappings` collection — APM Tier 1 (CHANNEL_SPECIFIC) mappings.

**Status: Implemented** (2026-06-04)

**Files:**
- `adaptivepattern/controller/ChannelFieldMappingAdminController.java`
- `adaptivepattern/model/dto/ChannelFieldMappingRequest.java`

---

## GET `/admin/channel-field-mappings`

List mappings with optional filters. Filter priority (most specific wins for the base query):
1. `channelId` + `sourceField` + `targetField` → exact triple lookup
2. `channelId` + `sourceField` → all mappings for that source field on that channel
3. `channelId` + `strategy` → all mappings for that strategy on that channel
4. `channelId` only → all active mappings for that channel
5. No params → all active mappings across all channels

Additional filters `isRequired`, `isActive`, `minConfidence` are applied reactively on top.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `channelId` | String | — | Filter by channel — "shopify", "amazon", etc. |
| `sourceField` | String | — | Filter by exact source field name |
| `targetField` | String | — | Filter by exact target field name (use with channelId+sourceField) |
| `strategy` | String | — | Filter by mappingStrategy — EXACT_OVERRIDE, EXACT, EXCLUDE, EXCLUDE_SOURCE |
| `isRequired` | Boolean | — | Filter required-only mappings |
| `isActive` | Boolean | `true` | Pass `false` to include deactivated mappings |
| `minConfidence` | Double | — | Filter by confidence >= value |

**Response:** `ChannelFieldMapping[]`

```json
[
  {
    "id": "6612a3f400000000",
    "channelId": "shopify",
    "sourceField": "name",
    "sourceAliases": ["product_name", "item_name", "productName"],
    "targetField": "product.title",
    "targetAliases": ["title"],
    "confidence": 99.0,
    "mappingStrategy": "EXACT_OVERRIDE",
    "isRequired": false,
    "isActive": true,
    "successRate": 100.0,
    "usageCount": 1240,
    "description": "Override semantic matching — map name directly to product.title",
    "createdAt": "2026-01-01T00:00:00",
    "updatedAt": "2026-06-01T00:00:00"
  }
]
```

---

## GET `/admin/channel-field-mappings/{id}`

Get a single mapping by MongoDB `_id`.

**Response:** `ChannelFieldMapping` or `404`

---

## POST `/admin/channel-field-mappings`

Create a new explicit field mapping.

**Request body:**

```json
{
  "channelId": "walmart",
  "sourceField": "barcode",
  "sourceAliases": ["upc", "ean", "gtin"],
  "targetField": "productIdentifiers.productId",
  "targetAliases": [],
  "confidence": 99.0,
  "mappingStrategy": "EXACT_OVERRIDE",
  "isRequired": false,
  "description": "Walmart product identifier — barcode maps to productId"
}
```

**Defaults applied when not provided in request:**
- `mappingStrategy` → `"EXACT_OVERRIDE"`
- `confidence` → `99.0`
- `isRequired` → `false`
- `isActive` → `true`
- `successRate` → `100.0` (initial; updated by publish history)
- `usageCount` → `0`

**Returns `409 Conflict`** if a mapping already exists for the same `(channelId, sourceField, targetField)` triple — use `PUT /{id}` to update the existing one.

**Response:** `201 Created` — saved `ChannelFieldMapping`

**Side effect:** Invalidates all `channel_jolt_specs` for the affected `channelId` via `deleteByChannelId()`. Next analyse call regenerates a fresh JOLT spec.

---

## PUT `/admin/channel-field-mappings/{id}`

Update an existing mapping. All fields are optional — only provided fields are updated.

**Request body:**

```json
{
  "targetField": "product.title",
  "mappingStrategy": "EXACT_OVERRIDE",
  "confidence": 99.0,
  "isRequired": true,
  "description": "Corrected mapping — was incorrectly pointing to product.options[0].name"
}
```

**Immutable fields (ignored if provided in body):** `channelId`, `sourceField`, `targetField`, `successRate`, `usageCount`, `lastUsedAt`

**Response:** `200 OK` — updated `ChannelFieldMapping` or `404`

**Side effect:** Invalidates all `channel_jolt_specs` for the affected `channelId`.

---

## PUT `/admin/channel-field-mappings/{id}/deactivate`

Soft-delete — sets `isActive=false`. Document is retained for audit.

**Response:** `200 OK` — updated document or `404`

---

## PUT `/admin/channel-field-mappings/{id}/activate`

Re-activate a deactivated mapping.

**Response:** `200 OK` — updated document or `404`

---

## DELETE `/admin/channel-field-mappings/{id}`

Hard delete. Use `deactivate` for audit-safe removal.

**Response:** `204 No Content`

---

## Implementation Notes

**Controller:** `adaptivepattern/controller/ChannelFieldMappingAdminController.java`
**DTO:** `adaptivepattern/model/dto/ChannelFieldMappingRequest.java`
**Repository:** `ChannelFieldMappingRepository` — all needed query methods already exist.

**JOLT invalidation:** All mutating operations (create, update, deactivate, activate, delete) call `joltSpecRepository.deleteByChannelId(channelId)`. Field mappings are channel-wide (not category-scoped), so all category JOLT specs for the channel are invalidated. Invalidation uses `.onErrorComplete()` — failure logs a warning but does not fail the parent operation.

**Fields never editable:** `successRate`, `usageCount`, `lastUsedAt` — learned from publish history.

**Fields immutable after creation:** `channelId`, `sourceField`, `targetField` — delete and recreate if identity needs to change.

**Duplicate guard:** `POST` returns `409 Conflict` when `(channelId, sourceField, targetField)` already exists. The compound index on the collection enforces this at DB level too.
