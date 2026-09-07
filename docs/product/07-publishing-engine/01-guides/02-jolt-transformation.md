# JOLT Transformation & Post-Processing

## JoltTransformationService

**Package:** `channel/service/`  
**Library:** `com.bazaarvoice.jolt`

```java
Map<String, Object> transform(Map<String, Object> sourceData, List<Map<String, Object>> joltSpec)
boolean validateJoltSpec(List<Map<String, Object>> joltSpec)
TransformationStats getTransformationStats(Map<String, Object> source, Map<String, Object> transformed)
```

`transform()` wraps `Chainr.fromSpec(joltSpec).transform(sourceData)`. The result must be a `Map<String, Object>` — any other result type throws `IllegalStateException`.

`validateJoltSpec()` is called during request validation when a `joltSpec` is provided in the request. It is NOT called for specs loaded from `channel_jolt_specs`.

`TransformationStats` tracks: `fieldsTransformed`, `fieldsDropped`, `fieldsAdded`, `totalSourceFields`, `totalTargetFields`. Returned in `PublishProductResponse.transformationApplied`.

---

## JOLT Spec Resolution Priority

```
1. channel_jolt_specs collection — category-aware lookup (fast path, ~20ms)
2. request.joltSpec              — fallback from analyze response (~1000ms on first run)
→ neither found                  → 400 error
```

For the `channel_jolt_specs` lookup, the system selects using a priority score:

| Match | Score |
|-------|-------|
| Org-specific + exact category | 30 |
| System default + exact category | 20 |
| Org-specific + "default" category | 25 |
| System default + "default" category | 15 |

The spec with the highest score wins. The 4-level fallback order is:

```
1. org-specific + requested category    (org_123, clothing)
2. system default + requested category  (null, clothing)
3. org-specific + "default" catch-all   (org_123, default)
4. system default + "default" catch-all (null, default)
```

See `06-adaptive-pattern-matching/01-guides/03-jolt-persistence.md` for the full JOLT persistence guide.

---

## mainImage Handling

Before JOLT runs, `ChannelPublishService` normalises the `mainImage` field:

- `List<String>` — used as-is
- Primitive array — converted to `List`
- `String` with bracket wrapping (`"[url1, url2]"`) — parsed to `List<String>`
- Plain `String` (single URL) — wrapped in `List`

This ensures the JOLT shift spec for images (which expects an array) always receives an array input.

---

## Post-Processing Engine

`GenericPostProcessingEngine` (`channel/service/`) runs after JOLT when `channelConfig.postProcessingRules` is non-empty. Each rule defines an `operations[]` pipeline — an ordered list of atomic ops applied to the document.

### Operation Scopes

| Scope    | Where it runs                       | Operations                                                                                                                                                |
|----------|-------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| DOCUMENT | Top-level transformed map           | `SET_FIELD`, `CONDITIONAL_SET`, `CROSS_LINK`, `CONCAT_INTO`                                                                                               |
| LIST     | List at `rule.sourcePath`           | `FOR_EACH`, `EXTRACT_DIMENSIONS`, `MAP_TO_INDEXED`, `FILTER`, `BUILD_CHOICES_MAP`, `ENRICH_VARIANT_MEDIA`                                                 |
| PER_ITEM | Each item inside `FOR_EACH.steps[]` | `SET_DEFAULT`, `UNWRAP_FIELD`, `STRING_TO_OBJECT`, `AUTO_INCREMENT`, `RENAME_FIELD`, `REMOVE_FIELD`, `COPY_FIELD`, `COERCE_TYPE`, `WRAP_ARRAY_TO_OBJECTS` |

### Quick-Start Example (Shopify Variants)

```json
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
        { "op": "SET_DEFAULT", "field": "taxable", "value": true },
        { "op": "SET_DEFAULT", "field": "weight",  "value": 0 },
        { "op": "COERCE_TYPE", "field": "price",   "toType": "string" }
      ]
    }
  ]
}
```

The legacy single-`type` rule format was removed (`operations[]` is the only form now) — see guide
`39-post-processing-legacy-op-decommission-plan.md`.

For all 19 implemented operations with full parameter tables see [`../02-api-reference/04-post-processing-operations.md`](../02-api-reference/04-post-processing-operations.md).  
For rule JSON structure, channel examples, naming conventions, and pitfalls see [`05-post-processing-config.md`](05-post-processing-config.md).

**Catalog API** — inspect and validate rules without restarting the server:

```bash
# List all registered operations
curl http://localhost:8888/labamap/api/v1/post-processing/catalog

# Validate rule JSON before saving to MongoDB
curl -X POST http://localhost:8888/labamap/api/v1/post-processing/validate \
     -H 'Content-Type: application/json' \
     -d '{"rules": [{"name": "my-rule", "operations": [{"op": "FOR_EACH", "steps": [{"op": "SET_DEFAULT", "field": "x", "value": 1}]}]}]}'
```

---

## FieldTransformationService

**Package:** `publishing/service/`

Atomic field-level type conversions used by post-processing rules and attribute conversion.

```java
TransformationResult applyTransformation(
    String originalFieldName,
    Object value,
    String transformationType,
    String targetFieldNameOverride,
    Map<String, Object> transformationConfig)
```

### Transformation Types

| Type                       | Input              | Output                               | Config key                         |
|----------------------------|--------------------|--------------------------------------|------------------------------------|
| `URL_ARRAY_TO_SRC_OBJECTS` | `["url1", "url2"]` | `[{"src": "url1"}, {"src": "url2"}]` | `propertyName` (default `"src"`)   |
| `SIMPLE_ARRAY`             | any value or list  | JSON-serialized array                | —                                  |
| `STRING_TO_ARRAY`          | any single value   | `["value"]`                          | —                                  |
| `OBJECT_WRAPPER`           | any value          | `{"propertyName": value}`            | `propertyName` (default `"value"`) |

`TransformationResult` carries: `fieldName` (possibly overridden by `targetFieldNameOverride`), `fieldValue` (always a String), `wasTransformed` (boolean).

---

## Post-JOLT Variant Override Merge

After JOLT and post-processing, the service applies `variantOverrides` directly onto the output's variant nodes. This guarantees that channel-specific variant fields (`barcode`, `inventory_policy`, `condition_type`, etc.) reach the channel API even if the JOLT spec does not map them.

**Algorithm:**

```
findVariantsInOutput(transformedData):
  1. Check transformedData["variants"] (top-level)
  2. Check transformedData[anyKey]["variants"] (one level deep — covers "product.variants")

For each variant node:
  if variant["sku"] matches a key in variantOverrides:
    merge non-null fields from variantOverrides[sku] onto variant node
```

---

## Payload Wrapping

After all transformations, the service checks whether the output already has the channel's `rootKey`:

```java
boolean alreadyWrapped = rootKey != null && transformedData.containsKey(rootKey);
```

- `alreadyWrapped = true` (JOLT produced `{"product": {...}}`) → use as-is
- `alreadyWrapped = false` (JOLT produced flat map) → `ApiWrapperService.wrapPayload()`

JOLT specs generated by the Adaptive Pattern Matching engine always produce nested output (e.g., shifting `name` → `product.title`), so the wrapped path is the standard one.

---

## Variant Images

Variant images are **not** handled by post-processing rules. They are included in each individual variant's attribute group (as a regular field named `variantImages`) during the `ChannelAttributeConverterService` step. The sync API extracts images from each variant group directly.

The old `buildVariantImagesGroup()` helper — which created a separate group — is deprecated and commented out.
