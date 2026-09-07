# 27 — TikTok live category attributes → `product_attributes` in the body

**Status:** implemented (bff-v15). **Area:** publish → category-attribute assembly.
**Symptom fixed:** live category attributes render in Step 2 and are saved, but never appear in the
TikTok create-body — the category's required product attributes are silently missing.

## Root cause (analysis)

The Step-2 category attributes flow end-to-end until the final assembly:

1. saved into `channel_product_data.channelData` keyed by native attribute_id (`ChannelProductDataService`).
2. merged into `masterProductData` at publish (`ChannelPublishService:858`).
3. staged JOLT-independently as `_categoryAttributes = [{id, value}]` by
   `ChannelPublishService.stageCategoryAttributes` — **this runs in the real publish path**
   (`:1867`, log `Staged … capability key(s): [_categoryAttributes]`), not only in the trace.
4. **consumed by a channel post-processing rule** — and here TikTok had **none**. Shopee has
   `shopee-build-attribute-list` (`_categoryAttributes` → `attribute_list`); TikTok had no rule to
   build `product_attributes`. So the staged `_categoryAttributes` (a reserved `_`-key) was skipped by
   `buildChannelAttributes` (it drops `_`-prefixed keys) → never in the body.

apiSchema already had the correct 202309 target (`product_attributes:[{attribute_id, attribute_values:
[{value_id, value_name}]}]`); only the assembly rule was missing.

## What the stored value is (decides whether a value→id translation is needed)

`GenericCategoryService:388-394` builds each option as `value = valueIdField`, `label = valueNameField`;
TikTok's `attributeConfig` sets `valueIdField="id"`, `valueNameField="name"`
(`CategoryApiConfigDataLoader:172-174`). The Step-2 form submits `option.value`. Therefore:

- **enumerated attribute** (SELECT/MULTISELECT, has options) → stored value = **`value_id`** already.
- **free-text attribute** (TEXT, no options) → stored value = the typed text = **`value_name`**.

So TikTok needs **no** value-name→value_id translation (unlike Shopee's rule 5). The only signal the
builder needs is *which kind* each attribute is — carried now as `hasOptions`.

## The fix (3 data-driven changes, BFF-only)

1. **Enrich staging** — `stageCategoryAttributes` now emits `[{id, value, hasOptions}]`
   (`hasOptions = field has options`). Channel-agnostic; Shopee ignores the extra key.
2. **Generalize `BUILD_ATTRIBUTE_LIST`** — operation params make the op serve any channel; defaults
   reproduce Shopee EXACTLY:
   | param | default (Shopee) | TikTok |
   |---|---|---|
   | `valuesKey` | `attribute_value_list` | `attribute_values` |
   | `valueIdKey` / `nameKey` | `value_id` / `original_value_name` | `value_id` / `value_name` |
   | `coerceNumeric` | `true` (ids are ints) | `false` (ids are string tokens) |
   | `useHasOptions` | `false` (numeric heuristic) | `true` (enumerated→value_id, free-text→value_name) |

   `useHasOptions` matters because TikTok value_ids are numeric-looking strings the legacy
   numeric heuristic would misread; the `hasOptions` flag is deterministic.
3. **Seed the TikTok rule** — `tiktok-build-product-attributes` in `createTiktokshopPostProcessingRules`
   (`sourcePath=_categoryAttributes`, `targetPath=product_attributes`, the params above). No-op when the
   merchant selected no category attributes.

Result:
```json
"product_attributes": [
  { "attribute_id": "100089", "attribute_values": [ { "value_id": "1729401" } ] },        // enumerated
  { "attribute_id": "100091", "attribute_values": [ { "value_name": "Cotton Combed" } ] }  // free-text
]
```
Then `product_attributes` (a normal key) is auto-enumerated into the body by `buildChannelAttributes`.

No FE change, no sync change, no apiSchema change. Shopee behaviour unchanged (verified: defaults →
`{attribute_id:<int>, attribute_value_list:[{value_id:<int>|original_value_name}]}`).

**Related:** [[shopee-image-two-step-flow]] (the JOLT-independent `_`-staging pattern),
guide 26 (variantGroups→skus), the Shopee `shopee-build-attribute-list` rule this mirrors.
