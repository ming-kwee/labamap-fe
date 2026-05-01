# JOLT Persistence

## Why Category-Aware?

Early versions matched the incoming request schema to a hash and regenerated the JOLT whenever optional fields differed — effectively on every request.

```
Product A (clothing): { name, price, color, size, material }  → hash aaa → regenerate
Product B (clothing): { name, price, color, size, brand }     → hash bbb → regenerate
Product C (clothing): { name, price, color, size }            → hash ccc → regenerate
```

The category-aware approach stores one JOLT per `(channelId, categoryId, organizationId)` combination using a **superset schema** that covers all possible fields within a category. The same JOLT handles all field variations for that category:

```
Product A (clothing): category = "clothing" → use clothing JOLT (fast path)
Product B (clothing): category = "clothing" → use clothing JOLT (fast path)
Product C (clothing): category = "clothing" → use clothing JOLT (fast path)
```

JOLT naturally handles missing fields by skipping mappings that have no matching input.

**Performance:**
| Scenario | Before (schema hash) | After (category-aware) |
|----------|---------------------|----------------------|
| Same category, different optional fields | ~1000ms (regenerate) | ~20ms (stored) |
| Same category, same fields | ~20ms | ~20ms |
| Different category | ~1000ms | ~1000ms (new JOLT generated) |

---

## Decision Logic: `canUseStoredJoltSpec()`

Called before every analyze request to decide whether to use the stored JOLT or run full field analysis.

| Check | Value | Decision |
|-------|-------|----------|
| `forceReanalyze` flag | `true` | Generate new |
| No stored JOLT for this channel/category | — | Generate new |
| JOLT spec is empty | — | Generate new |
| JOLT `isActive = false` | — | Generate new |
| `isManuallyConfigured = true` | — | **Always use stored** (admin override) |
| Stored confidence < `confidenceThreshold` | — | Generate new |
| All checks pass | — | **Use stored (fast path)** |

**Note:** The check does NOT compare the request's schema hash. Optional field differences within the same category never trigger regeneration.

---

## Lookup Fallback Priority

When looking up a JOLT spec, the system tries in this order:

```
1. org-specific + requested category      (org_123, clothing)
2. system default + requested category    (null, clothing)
3. org-specific + "default" catch-all     (org_123, default)
4. system default + "default" catch-all   (null, default)
   → if none found: generate new
```

---

## Version Numbering

Each persist increments the version:

| Old version | New version |
|------------|-------------|
| (new record) | `v1.0` |
| `v1.0` | `v1.1` |
| `v1.9` | `v2.0` |

---

## `channel_jolt_specs` Collection Document

Full schema from `ChannelJoltSpec.java`:

```json
{
  "_id":                "...",
  "channel_id":         "shopify",
  "category_id":        "clothing",
  "organization_id":    null,
  "is_system_default":  true,

  "jolt_spec": [
    {
      "operation": "shift",
      "spec": {
        "name":  "product.title",
        "price": "product.variants[0].price",
        "color": "product.variants[0].option1",
        "size":  "product.variants[0].option2"
      }
    }
  ],

  "jolt_metadata": {
    "version":               "v1.2",
    "superset_schema_hash":  "a1b2c3d4...",
    "confidence":            92.5,
    "mapping_count":         15,
    "is_manually_configured": false,
    "generated_at":          "2026-02-06T10:30:00Z",
    "generated_by":          "adaptive-pattern-matching",
    "strategy_breakdown": {
      "CHANNEL_SPECIFIC":  5,
      "SEMANTIC_KNOWLEDGE": 4,
      "ALIAS_MAPPING":      3,
      "PATTERN_MAPPING":    2,
      "KEYWORD_SIMILARITY": 1
    }
  },

  "superset_schema": {
    "required_fields": ["name", "price"],
    "optional_fields": ["color", "size", "material", "brand"],
    "field_definitions": {
      "name":  { "name": "name",  "type": "string",  "semantic_type": "PRODUCT_NAME", "is_required": true,  "target_path": "product.title" },
      "price": { "name": "price", "type": "number",  "semantic_type": "PRICE",        "is_required": true,  "target_path": "product.variants[0].price" },
      "color": { "name": "color", "type": "string",  "semantic_type": "COLOR",        "is_required": false, "target_path": "product.variants[0].option1" }
    },
    "schema_hash": "abc123...",
    "updated_at":  "2026-02-06T10:30:00Z"
  },

  "is_active":   true,
  "description": "Auto-generated JOLT for shopify/clothing",
  "created_at":  "2026-02-01T00:00:00Z",
  "updated_at":  "2026-02-06T10:30:00Z"
}
```

**Unique compound index:** `(channel_id, category_id, organization_id)` — enforced by `@CompoundIndex`.

---

## Integration with Publish Pipeline

`ChannelPublishService` uses the same category-aware fallback when publishing:

```
JOLT lookup priority in ChannelPublishService.processPublish():
  1. channel_jolt_specs  (by channelId + categoryId + organizationId)
  2. channel_configurations.joltSpec  (legacy, backward-compatible)
  3. request.joltSpec  (from analyze request)
  → if none: error
```

Include `categoryId` in `PublishProductRequest` to enable the fast path. When omitted it defaults to `"default"`.

---

## Typical Flow: Analyze Once, Publish Many

```
1. Run /analyze once per channel/category with persistJolt=true
   → JOLT generated (~1000ms) and saved to channel_jolt_specs

2. All subsequent publishes for that category
   → JOLT loaded from channel_jolt_specs (~20ms)
   → No field matching needed

3. To update the JOLT:
   → Run /analyze again with forceReanalyze=true, persistJolt=true
   → Version increments (v1.0 → v1.1)
   → or: set is_manually_configured=true in MongoDB to pin a specific version
```
