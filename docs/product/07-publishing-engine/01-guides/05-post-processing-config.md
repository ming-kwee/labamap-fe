# Post-Processing Engine — Configuration & Best Practices

## Rule JSON Structure

```json
{
  "name":       "shopify-enrich-images",
  "sourcePath": "product.images",
  "targetPath": "product.images",
  "priority":   10,
  "enabled":    true,
  "operations": [
    {
      "op": "FOR_EACH",
      "steps": [
        { "op": "STRING_TO_OBJECT", "keyField": "src" },
        { "op": "SET_DEFAULT",      "field": "alt",      "value": "" },
        { "op": "AUTO_INCREMENT",   "field": "position", "startAt": 1 }
      ]
    }
  ],

  "type":       null,
  "sourceField": null,
  "targetField": null,
  "addFields":   null,
  "dimensionFields": null,
  "configuration":   null
}
```

The last five fields (`type` through `configuration`) are **legacy-only**. Omit them in new rules.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier within the channel's rule array. Use kebab-case, channel-prefixed |
| `sourcePath` | Yes | Dot-notation path to the input list or value in the JOLT-transformed map |
| `targetPath` | Yes | Dot-notation path to write results. Can equal `sourcePath` for in-place transforms |
| `priority` | Yes | Execution order — lower number runs first. See priority ranges below |
| `enabled` | Yes | Set `false` to skip without deleting |
| `operations` | Yes | Ordered pipeline of atomic operations |

### Dot-Notation Path Rules

- Paths reference the top-level transformed map (after JOLT, before wrapping)
- Separator is `.` (period) — e.g. `product.variants`, `product.images`
- `setNestedValue()` creates intermediate maps automatically when writing
- When `sourcePath == targetPath`, the list is transformed in-place
- DOCUMENT-scope ops (`SET_FIELD`, `CONDITIONAL_SET`, `CROSS_LINK`, `CONCAT_INTO`) use their own `path` / `outputPath` / `sourcePath` / `targetPath` params rather than the rule-level paths

---

## MongoDB Document Shape

Rules are embedded in `channel_configurations.postProcessingRules`:

```json
{
  "channelId": "shopify",
  "organizationId": null,
  "postProcessingRules": [
    {
      "name":       "shopify-enrich-images",
      "sourcePath": "product.images",
      "targetPath": "product.images",
      "priority":   10,
      "enabled":    true,
      "operations": [
        {
          "op": "FOR_EACH",
          "steps": [
            { "op": "STRING_TO_OBJECT", "keyField": "src" },
            { "op": "SET_DEFAULT",      "field": "alt",      "value": "" },
            { "op": "AUTO_INCREMENT",   "field": "position", "startAt": 1 }
          ]
        }
      ]
    },
    {
      "name":       "shopify-generate-options",
      "sourcePath": "product.variants",
      "targetPath": "product.options",
      "priority":   20,
      "enabled":    true,
      "operations": [
        { "op": "EXTRACT_DIMENSIONS", "nameTransform": "CAPITALIZE", "valueStructure": "FLAT_LIST" },
        { "op": "MAP_TO_INDEXED",     "fieldPrefix": "option", "startIndex": 1 }
      ]
    }
  ]
}
```

`ChannelConfigurationDataLoader` (@Order 5) seeds all channels on startup via upsert. Rules added directly in MongoDB are respected at runtime without a restart.

---

## Real-World Channel Examples

### Shopify — Complete Rule Set

```json
[
  {
    "name": "shopify-enrich-images",
    "sourcePath": "product.images",
    "targetPath": "product.images",
    "priority": 10,
    "enabled": true,
    "operations": [
      {
        "op": "FOR_EACH",
        "steps": [
          { "op": "STRING_TO_OBJECT", "keyField": "src" },
          { "op": "SET_DEFAULT",      "field": "alt",      "value": "" },
          { "op": "AUTO_INCREMENT",   "field": "position", "startAt": 1 }
        ]
      }
    ]
  },
  {
    "name": "shopify-enrich-variants",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 15,
    "enabled": true,
    "operations": [
      {
        "op": "FOR_EACH",
        "steps": [
          { "op": "SET_DEFAULT", "field": "taxable",               "value": true },
          { "op": "SET_DEFAULT", "field": "weight",                "value": 0 },
          { "op": "SET_DEFAULT", "field": "weight_unit",           "value": "kg" },
          { "op": "SET_DEFAULT", "field": "inventory_management",  "value": "shopify" }
        ]
      }
    ]
  },
  {
    "name": "shopify-options-from-channel-data",
    "sourcePath": "product",
    "targetPath": "product.options",
    "priority": 19,
    "enabled": true,
    "operations": [
      {
        "op": "BUILD_OPTIONS_FROM_FLAT_KEYS",
        "nameKeyPattern": "option{n}_name",
        "valuesKeyPattern": "option{n}_values",
        "maxOptions": 3,
        "fallbackToExtractDimensions": true,
        "fallbackSourcePath": "product.variants",
        "fallbackNameTransform": "CAPITALIZE",
        "fallbackValueStructure": "FLAT_LIST"
      }
    ]
  },
  {
    "name": "generate-options-from-variants",
    "sourcePath": "product.variants",
    "targetPath": "product.options",
    "priority": 20,
    "enabled": false,
    "operations": [
      { "op": "EXTRACT_DIMENSIONS", "nameTransform": "CAPITALIZE", "valueStructure": "FLAT_LIST", "maxOptions": 3 },
      { "op": "MAP_TO_INDEXED",     "fieldPrefix": "option", "startIndex": 1, "maxOptions": 3 }
    ]
  },
  {
    "name": "shopify-map-variants-to-options",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 21,
    "enabled": true,
    "operations": [
      {
        "op": "MAP_TO_INDEXED",
        "fieldPrefix": "option",
        "startIndex": 1,
        "maxOptions": 3,
        "dimensionSource": "product.options.name"
      }
    ]
  },
  {
    "name": "shopify-set-status",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 30,
    "enabled": true,
    "operations": [
      { "op": "SET_FIELD", "path": "product.status", "value": "active" }
    ]
  },
  {
    "name": "shopify-manage-variants",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 35,
    "enabled": true,
    "operations": [
      {
        "op": "CONDITIONAL_SET",
        "condition": "SOURCE_NOT_EMPTY",
        "path": "product.variants",
        "value": null
      }
    ]
  }
]
```

### WIX — Complete Rule Set

```json
[
  {
    "name": "wix-enrich-media",
    "sourcePath": "product.media.items",
    "targetPath": "product.media.items",
    "priority": 10,
    "enabled": true,
    "operations": [
      {
        "op": "FOR_EACH",
        "steps": [
          { "op": "UNWRAP_FIELD",  "field": "url" },
          { "op": "SET_DEFAULT",   "field": "altText",   "value": "" },
          { "op": "SET_DEFAULT",   "field": "mediaType", "value": "image" }
        ]
      }
    ]
  },
  {
    "name": "wix-generate-options",
    "sourcePath": "product.variants",
    "targetPath": "product.productOptions",
    "priority": 20,
    "enabled": true,
    "operations": [
      {
        "op": "EXTRACT_DIMENSIONS",
        "nameTransform": "CAPITALIZE",
        "valueStructure": "OBJECT_LIST",
        "valueTemplate": { "value": "${item}", "description": "" }
      }
    ]
  },
  {
    "name": "wix-build-choices",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 25,
    "enabled": true,
    "operations": [
      { "op": "BUILD_CHOICES_MAP", "nameTransform": "CAPITALIZE", "outputField": "choices" }
    ]
  },
  {
    "name": "wix-set-manage-variants",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 30,
    "enabled": true,
    "operations": [
      {
        "op": "CONDITIONAL_SET",
        "condition": "SOURCE_NOT_EMPTY",
        "path": "product.manageVariants",
        "value": true
      }
    ]
  },
  {
    "name": "wix-cross-link-media",
    "sourcePath": "product.variants",
    "targetPath": "product.variantMediaLinks",
    "priority": 40,
    "enabled": true,
    "operations": [
      { "op": "CROSS_LINK", "matchField": "auto", "mediaField": "variantImages" }
    ]
  },
  {
    "name": "wix-enrich-variant-media",
    "sourcePath": "product.variants",
    "targetPath": "product.variants",
    "priority": 50,
    "enabled": true,
    "operations": [
      {
        "op": "ENRICH_VARIANT_MEDIA",
        "sourceField": "variantImages",
        "targetField": "media",
        "urlKey": "url",
        "choiceField": "auto",
        "choiceKeyTransform": "CAPITALIZE"
      }
    ]
  }
]
```

### TikTok Shop — Variant Enrichment

```json
[
  {
    "name": "tiktok-enrich-variants",
    "sourcePath": "skus",
    "targetPath": "skus",
    "priority": 10,
    "enabled": true,
    "operations": [
      {
        "op": "FOR_EACH",
        "steps": [
          { "op": "COERCE_TYPE", "field": "price",  "toType": "string" },
          { "op": "COERCE_TYPE", "field": "weight", "toType": "string" },
          { "op": "SET_DEFAULT", "field": "currency_code", "value": "USD" }
        ]
      }
    ]
  },
  {
    "name": "tiktok-filter-valid-skus",
    "sourcePath": "skus",
    "targetPath": "skus",
    "priority": 15,
    "enabled": true,
    "operations": [
      { "op": "FILTER", "field": "seller_sku", "condition": "NOT_EMPTY" }
    ]
  }
]
```

---

## Naming Conventions

- Use **kebab-case** with a **channel prefix**: `shopify-enrich-images`, `wix-build-choices`
- Include the operation type in the name: `...-enrich-...`, `...-generate-...`, `...-filter-...`
- Names must be unique within a channel's `postProcessingRules` array
- System-wide defaults have no org prefix; org overrides add org suffix: `shopify-enrich-variants-org123`

---

## Priority Ranges

| Range | Purpose | Typical operations |
|-------|---------|-------------------|
| 1–9 | Schema fixes / structural corrections | Renaming mismatched JOLT output fields |
| 10–19 | Data enrichment (defaults, type coercions) | `SET_DEFAULT`, `COERCE_TYPE`, `AUTO_INCREMENT` |
| 20–29 | Dimension extraction (options / attributes) | `EXTRACT_DIMENSIONS`, `MAP_TO_INDEXED`, `BUILD_CHOICES_MAP` |
| 30–39 | Document-level defaults and flags | `SET_FIELD`, `CONDITIONAL_SET` |
| 40–49 | Cross-linking and media linking | `CROSS_LINK` |
| 50–99 | Final transforms (media enrichment, filtering) | `ENRICH_VARIANT_MEDIA`, `FILTER` |

---

## FOR_EACH Step Ordering

When combining multiple PER_ITEM steps inside `FOR_EACH.steps[]`, follow this order:

1. **STRING_TO_OBJECT** — must be first if list items are plain strings (e.g. image URLs from JOLT)
2. **UNWRAP_FIELD** — unwrap bracket-wrapped strings before reading values
3. **RENAME_FIELD** — rename before reading or defaulting
4. **REMOVE_FIELD** — remove unwanted fields early
5. **COPY_FIELD** — copy before potential rename of the source field
6. **SET_DEFAULT** — set defaults after structure is established
7. **COERCE_TYPE** — coerce types after all values are in place
8. **WRAP_ARRAY_TO_OBJECTS** — wrap arrays after other field ops
9. **AUTO_INCREMENT** — must be last (counter assigns final position)

---

## Common Pitfalls

### EXTRACT_DIMENSIONS and MAP_TO_INDEXED write to different places

`EXTRACT_DIMENSIONS` writes to `rule.targetPath` (e.g. `product.options`).  
`MAP_TO_INDEXED` modifies items in-place at `rule.sourcePath` (e.g. `product.variants`).

Chain them in the same rule's `operations[]` when the source list is the same:

```json
{
  "name": "shopify-generate-options",
  "sourcePath": "product.variants",
  "targetPath": "product.options",
  "operations": [
    { "op": "EXTRACT_DIMENSIONS", "nameTransform": "CAPITALIZE" },
    { "op": "MAP_TO_INDEXED", "fieldPrefix": "option", "startIndex": 1 }
  ]
}
```

### CROSS_LINK must run before ENRICH_VARIANT_MEDIA

`CROSS_LINK` (priority 40) reads `variantImages` from variants to build the media-link index.  
`ENRICH_VARIANT_MEDIA` (priority 50) transforms `variantImages` into `media` objects and removes the source field.

If their priorities are reversed, `ENRICH_VARIANT_MEDIA` deletes `variantImages` before `CROSS_LINK` can read it.

### FOR_EACH on plain-string lists requires STRING_TO_OBJECT first

If a JOLT spec produces a list of plain strings (e.g. image URLs), `FOR_EACH` stores each as `_raw_value` on the item map. Without `STRING_TO_OBJECT` as the first step, all subsequent steps are no-ops because the item has no named fields:

```json
// WRONG — steps read "src" but item only has "_raw_value"
{ "op": "FOR_EACH", "steps": [{ "op": "SET_DEFAULT", "field": "src", "value": "" }] }

// CORRECT
{
  "op": "FOR_EACH",
  "steps": [
    { "op": "STRING_TO_OBJECT", "keyField": "src" },
    { "op": "SET_DEFAULT", "field": "alt", "value": "" }
  ]
}
```

### Typos in op codes log a suggestion

Unknown `op` values fall to the default case and log:

```
Unknown atomic operation: 'SETDEFAULT'. Known operations: [SET_FIELD, CONDITIONAL_SET, ...]
```

Use `POST /labamap/api/v1/post-processing/validate` to catch typos before saving to MongoDB.

---

## New Channel Checklist

- [ ] Add channel entry in `ChannelConfigurationDataLoader` (upserts on startup)
- [ ] Define JOLT spec in `channel_jolt_specs` collection (or in channel config for no-category channels)
- [ ] Add `apiSchema` fields (attribute mappings) if the channel needs them
- [ ] Add `postProcessingRules` for the channel's required transformations
- [ ] Verify dimension field names match JOLT output (check `detectDimensionFields` excluded fields)
- [ ] Run `POST /labamap/api/v1/post-processing/validate` with sample rule JSON
- [ ] Publish a test product with `dryRun: true` and inspect `publishedData`
- [ ] Publish live and verify the channel API response

---

## ✅ Resolved — Shopify Variant Options from Step 2 Channel Data (2026-06-11)

**Status: Implemented. See changes below.**

### Problem (original)

Two separate issues caused the Shopify error `"Product options must have corresponding variants"`:

**Issue A — Wrong option names (`Option1` instead of `Color`):**
The existing `generate-options-from-variants` rule (priority 20, now disabled) derived
`product.options` names from variant field names via `EXTRACT_DIMENSIONS + nameTransform: CAPITALIZE`:
```
variants[n].color = "Black"  →  EXTRACT_DIMENSIONS  →  { name: "Color", values: ["Black"] }
```
This worked for simple cases but broke when the seller used the **Step 2 "Apply as variant options"
panel**, which saves named flat keys:
```json
{ "channelData": { "option1_name": "Color", "option1_values": ["Black"], "option2_name": "Size", ... } }
```
The old rule ignored these and would produce `options[0].name = "Color"` only by coincidence from
field-name capitalisation — not from the seller's explicit choice.

**Issue B — Missing `option1`/`option2` on variant items:**
Even after `product.options` was correctly built, each variant item still only had `color`/`size`
(from JOLT output) — never `option1`/`option2`. Shopify requires every variant to carry positional
`option1`, `option2`, `option3` fields matching the entries in `product.options`.

The `MAP_TO_INDEXED` operation that would add these keys was bundled in the disabled rule 2b and
never ran.

---

### Solution implemented

#### Rule 2a — `shopify-options-from-channel-data` (priority 19) — already existed

Uses `BUILD_OPTIONS_FROM_FLAT_KEYS` to read `option{n}_name` / `option{n}_values` from the merged
source document and write `product.options` with correct seller-chosen names. Falls back to
`EXTRACT_DIMENSIONS` when those flat keys are absent (products published without Step 2 panel).

#### Rule 2b — `generate-options-from-variants` (priority 20) — kept disabled

The `EXTRACT_DIMENSIONS` part is now fully handled by rule 2a's fallback path. Disabled to avoid
running twice.

#### Rule 2c — `shopify-map-variants-to-options` (priority 21) — **new**

Adds `option1`, `option2`, `option3` fields to each variant item using `MAP_TO_INDEXED` with the
new `dimensionSource` parameter:

```json
{
  "name": "shopify-map-variants-to-options",
  "sourcePath": "product.variants",
  "targetPath": "product.variants",
  "priority": 21,
  "enabled": true,
  "operations": [
    {
      "op": "MAP_TO_INDEXED",
      "fieldPrefix":     "option",
      "startIndex":      1,
      "maxOptions":      3,
      "dimensionSource": "product.options.name"
    }
  ]
}
```

`dimensionSource: "product.options.name"` reads the ordered list of option names from the
`product.options` array built by rule 2a, lowercases them, and uses them as the dimension→position
mapping. This guarantees the order matches what the seller chose, rather than relying on Map
key-iteration order from `detectDimensionFields`.

---

### New `dimensionSource` parameter for `MAP_TO_INDEXED`

Added to `GenericPostProcessingEngine.executeMapToIndexed()`. Resolution priority:

| Priority | Source | When used |
|----------|--------|-----------|
| 1 | `dimensionFields` list in op config | Explicit override |
| 2 | **`dimensionSource` path** | Reads names from a document path (e.g. `product.options.name`) |
| 3 | `detectDimensionFields(items)` | Auto-detect fallback |

The helper `resolveDimensionFieldsFromSource(data, path)` splits off a trailing field key from the
path (`"product.options.name"` → list path `"product.options"`, field key `"name"`), reads each
element's `name` value, and returns them lowercased.

`MAP_TO_INDEXED` also gained a **case-insensitive variant field lookup**: `"Color"` in the options
list matches `"color"` in the variant map, so casing differences between taxonomy labels and JOLT
output field names are handled transparently.

---

### Execution order after fix

```
priority 19  BUILD_OPTIONS_FROM_FLAT_KEYS  →  product.options = [{name:"Color",...},{name:"Size",...}]
priority 20  (disabled)
priority 21  MAP_TO_INDEXED (dimensionSource="product.options.name")
             →  variant.option1 = "Black",  variant.option2 = "Xs"   (in-place)
priority 25  transform-variant-images  →  variant.images wrapped
```

`applyVariantOverridesPostJolt` runs after all post-processing and merges Step 2 per-SKU overrides
(`barcode`, `inventory_policy`, etc.) on top. The `option1`/`option2` values are already present
at that point so they are not overwritten.

---

### Files changed

| File | Change |
|------|--------|
| `channel/service/GenericPostProcessingEngine.java` | Added `dimensionSource` resolution branch and `resolveDimensionFieldsFromSource()` helper to `executeMapToIndexed()`; added case-insensitive variant field lookup |
| `channel/config/ChannelConfigurationDataLoader.java` | Added `shopify-map-variants-to-options` rule (priority 21); updated rule 2b comment |
