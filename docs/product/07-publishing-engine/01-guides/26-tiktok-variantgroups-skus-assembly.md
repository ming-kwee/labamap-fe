# 26 — TikTok `Skus is a required field` (variantGroups → body.skus assembly)

**Status:** implemented (bff-v14). **Area:** publish → sync variant-group assembly.
**Symptom fixed:** TikTok create returns `{"code":36009004,"message":"Skus is a required field and has not been provided."}`
even though `variantGroups` arrives at the sync fully populated (2 SKUs).

Follows [[24-tiktok-publish-signing]], [[25-tiktok-media-pre-upload]] — the next gate after those pass.

---

## 1. How the sync builds `body.skus`

TikTok has **no** dedicated variant endpoint, so the sync **inlines** variants into the create body
(`Create_CP.transform_AttributeToJson`): for each `variantGroups[].channelVariant[]` it builds a per-group
map from each entry's dotted `chnlVrntName` (`skus.price` → `{skus:{price}}`), then `mergeMaps` collapses
the list into `{skus:[{…},{…}]}`. The container key comes from the `chnlVrntName` prefix, and
`mergeMaps` keys off **one** top-level segment (`allKeys[0]`).

## 2. Root cause — a poisoned passthrough entry

A read-only diagnostic (`[create-body-diag]`) proved the command reached create correctly but the body
came out wrong:

```
hasDedicatedVariantsEndpoint=false variantGroupsFromCmd=2
bodyKeys=[product, category_id, category_version, description, package_weight, title, main_images]
bodyHasSkus=false skusCount=-1
```

`variantGroupsFromCmd=2` (groups arrived) but `bodyHasSkus=false` and a stray **`product`** key. The
culprit was an extra variant entry in every group:

```json
{ "vrntId":"passthrough_name", "chnlVrntName":"product.variants.name", "value":"<product title>" }
```

That made each group map hold **two** top-level keys — `{skus:{…}, product:{variants:{name}}}`. Since the
sync's `mergeMaps` keys off a single `allKeys[0]` derived from a **HashMap** (unordered), it picked
`product` and **dropped `skus`** → body has no skus. (Non-deterministic: an emulation with an ordered map
"happened" to pick skus, which is why this didn't reproduce until the real HashMap ordering surfaced it.)

Two BFF bugs combined to produce that poison entry:

### Bug 1 — hard-coded passthrough prefix (`ChannelAttributeConverterService.buildVariantGroups`)
Pass-2 (passthrough of variant fields not in the registered mapping) hard-coded:
```java
.chnlVrntName("product.variants." + fieldName)   // wrong for flat channels
```
For TikTok the variant container is **`skus`**, not `product.variants`. So any unmapped sku field became
`product.variants.<field>` — injecting a foreign `product` top-level key. This is exactly the kind of
per-channel literal the repo bans (CLAUDE.md “no hardcoded domain knowledge”).

### Bug 2 — product-only master field broadcast onto variants (`ChannelPublishService`, ~line 895)
The masterOverrides "fallback" broadcasts product-level overrides (name/description/price/qty/weight) onto
every variant when the variant lacks its own value. For per-variant fields (price/qty/weight) that is
correct; for **product-only** fields (`name`, `description`) it is not — they end up on each sku, flow
through JOLT (`variants.*.* → skus[&1].&`), and become the passthrough above.

## 3. The fixes

### Fix A — derive the passthrough prefix from data (Bug 1)
`resolveVariantPassthroughPrefix(channelConfig)` reads the channel's registered `variantFields` keys and
uses their container prefix (they all share one):

| Channel | variantFields key | derived prefix |
|---|---|---|
| TikTok, Shopee | `skus@price` | `skus` |
| Shopify, WIX | `product@variants@price` | `product.variants` |

Pass-2 now emits `<prefix>.<field>`, so a passthrough lands in the **same** container as mapped fields —
never a foreign top-level key. Falls back to `product.variants` when no variantFields are registered
(unchanged behaviour for Shopify/WIX; an improvement for flat channels).

### Fix B — gate the masterOverride→variant broadcast by data (Bug 2, root)
The real originator: `ChannelPublishService`'s masterOverride "fallback" broadcast copied **every**
masterOverride key onto each variant, guarded only structurally (variant lacks the field). It ignored the
field's scope — even though the data already records it: `ecommerce_master_attributes.isVariantChannelOverridable`
is `true` for genuinely per-variant fields (price/comparePrice/inventory/weight) and **absent** for
product-only fields (name/description). The broadcast now consults that flag
(`variantOverridableFieldNames()` → `findByIsVariantChannelOverridableTrue()`), so **only per-variant
fields broadcast** — name/description never reach a SKU, on **any** channel. This is the data-driven root
fix (a field's scope is data, not a code literal).

A secondary safety net remains in `cleanup-sku-source-fields` (drops `name`/`description` from the sku)
for any *other* path that could still set a non-202309 field on a sku (e.g. a per-SKU variantOverride).

Fix A is the structural guard (any stray field stays inside `skus`, never a foreign top-level key); Fix B
stops the leak at its source. Together:

```json
"skus": [
  {"price":{"amount":"11000","currency":"USD"}, "sales_attributes":[…], "inventory":[{"warehouse_id":"…","quantity":1}], "seller_sku":"SKU-XS-BLACK"},
  {"price":{"amount":"10000","currency":"USD"}, …, "inventory":[{…,"quantity":2}], "seller_sku":"SKU-S-BLACK"}
]
```

## 4. Not the fix
- **Don't** author `create_CP_Variants` for TikTok — that flags `hasDedicatedVariantsEndpoint=true` and
  DISABLES inline assembly (that key is only for channels with a separate variant endpoint, e.g. Shopee
  `add_model`). TikTok create takes skus inline in one call.
- **Don't** send skus as a product attribute blob — the excluded-container path ([[variant-scope-both]]
  era) is superseded; variantGroups is the contract.

## 5. Re-seed & verify
Both fixes re-seed on restart: Fix A is converter code (recompile); Fix B is a post-processing rule
(`ChannelConfigurationDataLoader`, Order 5, overwrites on restart). Republish, then the `[create-body-diag]`
line should read `bodyHasSkus=true skusCount=2` and TikTok returns `code:0`.

Remove the temporary `[create-body-diag]` log in the sync (`Create_CP.transform_AttributeToJson`) once
confirmed — it is a diagnostic, not a permanent line.

## 6. Chain recap (TikTok publish)
1. signing ([[24-tiktok-publish-signing]]) → `36009004`/`106001`
2. price/stock shape → `12052571`
3. media pre-upload ([[25-tiktok-media-pre-upload]]) → `12052300`
4. **variantGroups → body.skus** (*this guide*) → `36009004 Skus required`
