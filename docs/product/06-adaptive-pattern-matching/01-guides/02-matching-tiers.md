# Matching Tiers

## 5-Tier Matching Strategy

`KnowledgeBasedFieldMatchingService.findBestMatchForField()` runs all 5 tiers in sequence using `Flux.concat`, collects non-null results, sorts by confidence descending, and takes the best match.

```
For each source field:
  Run tiers in order → collect results → sort by confidence → take best
  → apply channel boost
  → record usage (fire-and-forget)
```

### Tier Summary

| Tier | `matchStrategy` value | Data source | Confidence range |
|------|----------------------|-------------|-----------------|
| 1 | `CHANNEL_SPECIFIC` | `channel_field_mappings` collection | 90–98% |
| 2 | `SEMANTIC_KNOWLEDGE` | `field_semantic_knowledge` (by semanticType) | 85–95% |
| 3 | `ALIAS_MAPPING` | `field_semantic_knowledge` (by aliases list) | 80–95% |
| 4 | `PATTERN_MAPPING` | `field_semantic_knowledge.commonPatterns` (regex) | 70–85% |
| 5 | `KEYWORD_SIMILARITY` | `field_semantic_knowledge.keywords` (Jaccard) | 50–80% |

---

## Tier 1: CHANNEL_SPECIFIC

Looks up pre-configured or learned mappings from `channel_field_mappings` for this specific channel.

These mappings are either seeded from `channel-field-mappings.json` (curated) or recorded from successful publishes (learned). They represent verified field relationships and are the most reliable tier.

```
channel_field_mappings document:
  channelId:   "shopify"
  sourceField: "name"
  targetField: "title"
  confidence:  95.0
  successRate: 98.5  ← learned from publish history
  mappingStrategy: "EXACT" | "SEMANTIC" | "SIMILARITY" | "PATTERN" | "CUSTOM"
```

---

## Tier 2: SEMANTIC_KNOWLEDGE

Identifies the semantic type of the source field (e.g., `PRODUCT_NAME`, `PRICE`, `SKU`) and matches all target fields of the same semantic type. Base confidence: 85%; +5% for exact name match; +5% for type compatibility; +channel boost.

**Path depth preference:** Shallower paths win over deeper ones.
```
product.title       (depth 2)  ← preferred
product.info.title  (depth 3)
```

**Critical uniqueness constraint in `field_semantic_knowledge`:**

`fieldName` is unique per document. `semanticType` is NOT unique — many documents can share the same type. When looking up by `aliases`, multiple documents may match the same alias. The service resolves this by selecting the document with the **highest `baseConfidence`**:

```
alias "name" matches:
  productName   → PRODUCT_NAME  (baseConfidence: 95.0)  ← selected
  itemTitle     → PRODUCT_NAME  (baseConfidence: 90.0)
  shopName      → SHOP_NAME     (baseConfidence: 85.0)
  brandName     → BRAND         (baseConfidence: 80.0)
```

---

## Tier 3: ALIAS_MAPPING

Matches source and target fields that share common aliases from the `field_semantic_knowledge.aliases` list. More common shared aliases → higher confidence.

```
Base: 80% + (number of common aliases × 5%)
Example: "productName" and "name" share aliases ["name", "title", "product_name"]
Confidence: 80% + (3 × 5%) = 95%
```

---

## Tier 4: PATTERN_MAPPING

Uses regex patterns from `field_semantic_knowledge.commonPatterns` to match similar field names.

```
Pattern ".*price.*"           matches: salePrice, regularPrice, unitPrice
Pattern ".*image.*|.*img.*"   matches: mainImage, thumbnailImg
```

Confidence range: 70–85%.

---

## Tier 5: KEYWORD_SIMILARITY

Splits field names into keywords and computes Jaccard similarity coefficient.

```
Jaccard = |Intersection| / |Union|

"product_name" → ["product", "name"]
"item_name"    → ["item",    "name"]
Intersection:  ["name"]         → 1
Union:         ["product", "name", "item"] → 3
Similarity:    1/3 = 0.33
Confidence:    50% + (0.33 × 30%) = 60%
```

This is the fallback tier. High usage of Tier 5 in practice indicates gaps in the semantic knowledge base.

---

## Channel Boost

After the best tier match is selected, confidence scores are adjusted by channel-specific boosts defined in `ChannelConfiguration.fieldBoosts`. For example, a Shopify boost for `title` adds +5% to any match targeting that field. This is how `BOOST` confidence adjustments happen — it's not a separate tier but a post-match step.

---

## Organization-Aware Matching

When `organizationId` is provided, `FieldMatchingService.findMatchesForOrganization()` uses an extended priority order:

```
1. tryOrganizationChannelMapping()   ← org-specific channel mappings
2. tryOrganizationSemanticMapping()  ← domain-filtered semantic matching
3. tryChannelSpecificMapping()       ← standard Tier 1
4. trySemanticKnowledgeMapping()     ← standard Tier 2
5. tryOrganizationPatternMatching()  ← org custom patterns
```

Domain-specific filtering (based on `organization.businessDomain`) suppresses irrelevant semantic types. For example, `fashion` orgs filter out `voltage` and `power` fields; `electronics` orgs filter out `fabric` and `season`.

Organizations can also define custom field mappings in their `businessRulesConfig.ruleCategories.PRE_PROCESSING.rules[].configuration.organizationSpecific.fieldMappings`.
