# API Reference — Post-Processing Operations

All operations implemented in `GenericPostProcessingEngine` (`channel/service/`). Use `GET /labamap/api/v1/post-processing/catalog` for the live JSON version.

Operations are grouped by scope. DOCUMENT and LIST ops appear at the top level of `operations[]`. PER_ITEM ops are valid only inside `FOR_EACH.steps[]`.

---

## DOCUMENT Scope

Act on the top-level transformed map.

---

### SET_FIELD

Sets a value at any dot-notation path in the document. Creates intermediate maps if needed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | String | Yes | Dot-notation path to write (e.g. `"product.status"`) |
| `value` | Object | Yes | Value to set — any JSON-compatible type |

**Channels:** All

```json
{ "op": "SET_FIELD", "path": "product.status", "value": "active" }
```

---

### CONDITIONAL_SET

Sets a value only when a condition evaluates to true. Commonly used to set `manageVariants` only when variants exist.

| Parameter | Type | Required | Allowed values | Description |
|-----------|------|----------|----------------|-------------|
| `condition` | String | Yes | `SOURCE_NOT_EMPTY`, `SOURCE_EMPTY`, `FIELD_EXISTS`, `FIELD_EQUALS` | Condition to evaluate |
| `path` | String | Yes | — | Dot-notation path to write when condition is true |
| `value` | Object | Yes | — | Value to write |
| `fieldPath` | String | No | — | Required for `FIELD_EXISTS` and `FIELD_EQUALS` |
| `expectedValue` | Object | No | — | Required for `FIELD_EQUALS` |

**Channels:** WIX, Shopify

```json
{
  "op": "CONDITIONAL_SET",
  "condition": "SOURCE_NOT_EMPTY",
  "path": "product.manageVariants",
  "value": true
}
```

---

### CROSS_LINK

Groups variant media URLs by a dimension value, producing `{choiceValue, optionKey, mediaUrls}` objects. Required before WIX Link Media to Choices API call. Must run before `ENRICH_VARIANT_MEDIA` (which removes the source `variantImages` field).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `matchField` | String | No | `"auto"` | Dimension field to group by; `"auto"` = first detected dimension |
| `mediaField` | String | No | `"variantImages"` | Field on each variant holding the media URL array |
| `outputPath` | String | No | `rule.targetPath` | Dot-notation path for the output array |

**Channels:** WIX

```json
{
  "op": "CROSS_LINK",
  "matchField": "auto",
  "mediaField": "variantImages",
  "outputPath": "product.variantMediaLinks"
}
```

---

### CONCAT_INTO

Appends all items from `sourcePath` array into `targetPath` array. Null and blank-string items are filtered out before merging (prevents empty image slots from producing objects with no `src`). Optionally removes the source field after merging.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sourcePath` | String | Yes | — | Dot-notation path to the source array |
| `targetPath` | String | Yes | — | Dot-notation path to the destination array |
| `removeSource` | Boolean | No | `false` | Delete the source field after merging |

**Channels:** All (typically used to merge gallery images into the main images array before enrichment)

```json
{
  "op": "CONCAT_INTO",
  "sourcePath": "product.galleryImages",
  "targetPath": "product.images",
  "removeSource": true
}
```

---

## LIST Scope

Act on the list resolved from `rule.sourcePath`.

---

### FOR_EACH

Iterates each item in the source list and applies an ordered set of PER_ITEM operations. Writes the result to `rule.targetPath`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `steps` | List\<Map\> | Yes | Ordered PER_ITEM operations applied to each item |

**Channels:** All

```json
{
  "op": "FOR_EACH",
  "steps": [
    { "op": "SET_DEFAULT", "field": "taxable", "value": true },
    { "op": "COERCE_TYPE", "field": "price",   "toType": "string" }
  ]
}
```

---

### EXTRACT_DIMENSIONS

Extracts unique dimension values from a variant list and builds a channel-ready options or attributes structure. Writes to `rule.targetPath`.

| Parameter | Type | Required | Default | Allowed values | Description |
|-----------|------|----------|---------|----------------|-------------|
| `dimensionFields` | List\<String\> | No | auto-detected | — | Explicit dimension field names |
| `outputPath` | String | No | `rule.targetPath` | — | Override output path |
| `nameTransform` | String | No | — | `CAPITALIZE` | Transform applied to dimension names |
| `valueStructure` | String | No | `FLAT_LIST` | `FLAT_LIST`, `OBJECT_LIST` | Output shape |
| `valueTemplate` | Map | No | — | — | Template for `OBJECT_LIST`; use `${item}` placeholder |
| `optionTypeMap` | Map | No | — | — | Map of field → optionType string |
| `maxOptions` | Integer | No | `6` | — | Maximum dimensions to process |

**Channels:** Shopify (`FLAT_LIST`), WIX (`OBJECT_LIST`)

```json
{ "op": "EXTRACT_DIMENSIONS", "nameTransform": "CAPITALIZE", "valueStructure": "FLAT_LIST", "maxOptions": 3 }
```

---

### MAP_TO_INDEXED

Writes each variant's dimension value into indexed fields (`option1`, `option2`, `option3`) directly on each variant map. Modifies items in-place at `rule.sourcePath`, not `rule.targetPath`. Usually chained with `EXTRACT_DIMENSIONS` in the same rule.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dimensionFields` | List\<String\> | No | auto-detected | Explicit dimension fields |
| `fieldPrefix` | String | No | `"option"` | Prefix for indexed field names |
| `startIndex` | Integer | No | `1` | Starting index |
| `maxOptions` | Integer | No | — | Maximum dimensions to map |

**Channels:** Shopify

```json
{ "op": "MAP_TO_INDEXED", "fieldPrefix": "option", "startIndex": 1, "maxOptions": 3 }
```

---

### FILTER

Removes list items that do not match a condition.

| Parameter | Type | Required | Allowed values | Description |
|-----------|------|----------|----------------|-------------|
| `field` | String | Yes | — | Item field to evaluate |
| `condition` | String | Yes | `NOT_NULL`, `EQUALS`, `NOT_EQUALS`, `NOT_EMPTY` | Filtering condition |
| `value` | Object | No | — | Comparison value for `EQUALS` / `NOT_EQUALS` |

**Channels:** All

```json
{ "op": "FILTER", "field": "sku", "condition": "NOT_EMPTY" }
```

---

### BUILD_CHOICES_MAP

Adds a `choices` map to each variant containing its dimension key→value pairs. Required by WIX before the variants API call.

| Parameter | Type | Required | Default | Allowed values | Description |
|-----------|------|----------|---------|----------------|-------------|
| `dimensionFields` | List\<String\> | No | auto-detected | — | Explicit dimension fields |
| `outputField` | String | No | `"choices"` | — | Field name to write on each item |
| `nameTransform` | String | No | — | `CAPITALIZE` | Transform applied to dimension key names |

**Channels:** WIX

```json
{ "op": "BUILD_CHOICES_MAP", "nameTransform": "CAPITALIZE", "outputField": "choices" }
```

---

### ENRICH_VARIANT_MEDIA

Transforms a URL array field on each variant into channel-ready media objects with optional choice anchors. Run after `CROSS_LINK` — this op removes the source `variantImages` field.

| Parameter | Type | Required | Default | Allowed values | Description |
|-----------|------|----------|---------|----------------|-------------|
| `sourceField` | String | No | `"variantImages"` | — | Field holding the URL array on each variant |
| `targetField` | String | No | `"media"` | — | Output field for media objects |
| `urlKey` | String | No | `"url"` | — | Key for the URL value in each media object |
| `choiceField` | String | No | `"auto"` | — | Dimension field to attach as a choice anchor |
| `choiceKeyTransform` | String | No | — | `CAPITALIZE` | Transform applied to the choice option key name |

**Channels:** WIX

```json
{
  "op": "ENRICH_VARIANT_MEDIA",
  "sourceField": "variantImages",
  "targetField": "media",
  "urlKey": "url",
  "choiceField": "auto",
  "choiceKeyTransform": "CAPITALIZE"
}
```

---

## PER_ITEM Scope

Valid **only** inside `FOR_EACH.steps[]`. Applied to each list item independently.

---

### SET_DEFAULT

Sets a field only if absent or null. Never overwrites existing values.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field` | String | Yes | Field name to set |
| `value` | Object | Yes | Default value to assign |

```json
{ "op": "SET_DEFAULT", "field": "taxable", "value": true }
```

---

### UNWRAP_FIELD

Unwraps a single-element list to a scalar, or strips `[...]` from string values like `"[https://...]"`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field` | String | Yes | Field to unwrap |

```json
{ "op": "UNWRAP_FIELD", "field": "url" }
```

---

### STRING_TO_OBJECT

Converts a raw string list item (stored as `_raw_value`) to a keyed field. Must be the **first** step when list items are plain strings (e.g. image URLs produced by JOLT).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyField` | String | Yes | Field name to assign the string value to |

```json
{ "op": "STRING_TO_OBJECT", "keyField": "src" }
```

---

### AUTO_INCREMENT

Assigns a sequentially increasing integer across items. Counter resets at the start of each `FOR_EACH` execution. Must be the **last** step in the pipeline.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `field` | String | Yes | — | Field to write the counter into |
| `startAt` | Integer | No | `1` | Starting value for the first item |

```json
{ "op": "AUTO_INCREMENT", "field": "position", "startAt": 1 }
```

---

### RENAME_FIELD

Renames a field key while preserving its value. No-op if source field does not exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | String | Yes | Existing field name |
| `to` | String | Yes | New field name |

```json
{ "op": "RENAME_FIELD", "from": "inventory_quantity", "to": "stock" }
```

---

### REMOVE_FIELD

Removes a field entirely from the item. No-op if the field does not exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field` | String | Yes | Field to remove |

```json
{ "op": "REMOVE_FIELD", "field": "_internalId" }
```

---

### COPY_FIELD

Copies a field value to another field without removing the source.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | String | Yes | Source field name |
| `to` | String | Yes | Destination field name |

```json
{ "op": "COPY_FIELD", "from": "sku", "to": "seller_sku" }
```

---

### COERCE_TYPE

Converts a field value to a JSON primitive type. Commonly required by TikTok Shop (price and weight must be strings).

| Parameter | Type | Required | Allowed values | Description |
|-----------|------|----------|----------------|-------------|
| `field` | String | Yes | — | Field to coerce |
| `toType` | String | Yes | `string`, `number`, `boolean` | Target type |

```json
{ "op": "COERCE_TYPE", "field": "price", "toType": "string" }
```

---

### WRAP_ARRAY_TO_OBJECTS

Converts a flat string array to single-key objects. Example: `["S", "M"]` → `[{"value": "S"}, {"value": "M"}]`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field` | String | Yes | Source array field name |
| `wrapKey` | String | Yes | Key name for each wrapped value |
| `toField` | String | No | Destination field; defaults to source (in-place replace) |

```json
{ "op": "WRAP_ARRAY_TO_OBJECTS", "field": "tags", "wrapKey": "value" }
```

---

## LEGACY Scope

Old `type`-based rules are auto-converted at runtime by `convertLegacyRule()`. No data migration is required, but new rules should use the `operations[]` format.

| Legacy type | Generic equivalent |
|-------------|-------------------|
| `ENRICH_IMAGES` | `FOR_EACH` → `STRING_TO_OBJECT(src)` + `SET_DEFAULT(alt,"")` + `AUTO_INCREMENT(position)` |
| `ENRICH_MEDIA` | `FOR_EACH` → `UNWRAP_FIELD(url)` + `SET_DEFAULT(altText,"")` + `SET_DEFAULT(mediaType,"image")` |
| `GENERATE_OPTIONS` | `EXTRACT_DIMENSIONS` + `MAP_TO_INDEXED` |
| `MAP_DIMENSIONS` | `MAP_TO_INDEXED` |
| `ENRICH_VARIANTS` | `FOR_EACH` → `SET_DEFAULT` per addField + `CONDITIONAL_SET(manageVariants, true)` |
| `LINK_MEDIA_TO_CHOICES` | `CROSS_LINK` |

---

## Condition Values

Used by `CONDITIONAL_SET` (`condition` parameter) and `FILTER` (`condition` parameter).

### CONDITIONAL_SET conditions

| Value | Evaluates true when |
|-------|-------------------|
| `SOURCE_NOT_EMPTY` | The list at `rule.sourcePath` has at least one item |
| `SOURCE_EMPTY` | The list at `rule.sourcePath` is empty or absent |
| `FIELD_EXISTS` | The field at `fieldPath` exists in the document |
| `FIELD_EQUALS` | The field at `fieldPath` equals `expectedValue` |

### FILTER conditions

| Value | Evaluates true (item is kept) when |
|-------|----------------------------------|
| `NOT_NULL` | The item field is not null |
| `EQUALS` | The item field equals `value` |
| `NOT_EQUALS` | The item field does not equal `value` |
| `NOT_EMPTY` | The item field is not null and not an empty string |
