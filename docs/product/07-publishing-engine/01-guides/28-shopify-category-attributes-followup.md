# 28 — FOLLOW-UP: Shopify live category attributes → GraphQL metafields (DEFERRED)

**Status:** DEFERRED (not implemented). **Area:** publish → Shopify category attributes.
**Trigger to pick up:** when Shopify listings must carry taxonomy/category metafields (e.g. a
Shopify category that expects Color/Material/etc. as taxonomy metafields).

This is the Shopify counterpart of guide 27 (TikTok `product_attributes`). It records WHY the
bff-v15 TikTok fix does **not** wire Shopify, and exactly what Shopify would need.

## Why the TikTok fix does NOT carry over

Category attributes reach different targets per channel:

| | TikTok / Shopee | Shopify |
|---|---|---|
| Target | array in the REST create body (`product_attributes` / `attribute_list`) | **GraphQL metafields** (often `list.metaobject_reference` → Metaobject GIDs) |
| Transport | main create body | a **separate op** in the `workaction#create_CP_Graphql` array (a GraphQL mutation run AFTER the product upsert) |
| Assembler | post-processing rule `BUILD_ATTRIBUTE_LIST` reading `_categoryAttributes` | **none yet** — needs a `metafieldsSet` op |

So `BUILD_ATTRIBUTE_LIST` / `product_attributes` (a body array) simply doesn't apply to Shopify.
Shopify's category-attribute values are metafields, set by GraphQL, not a body field.

## The bff-v15 changes are compatible (non-breaking) with Shopify

- **Staging (`stageCategoryAttributes`)** is channel-agnostic → Shopify also gets
  `_categoryAttributes = [{id, value, hasOptions}]` staged. No Shopify rule consumes it, so it is
  dropped harmlessly (a reserved `_`-key, skipped by `buildChannelAttributes`). **Useful groundwork:**
  the filled Shopify category-attribute values are already staged in a neutral form — a future
  metafields op can read them without new staging.
- **`BUILD_ATTRIBUTE_LIST` generalization** — Shopify does not use this op; unaffected.
- **`tiktok-build-product-attributes`** — TikTok-only.

So nothing needs changing in bff-v15 for Shopify's sake.

## Where a Shopify metafields op would slot in

`ChannelMetadataMigration.graphqlPostWriteWorkflow()` seeds `workaction#create_CP_Graphql` (and
`update_CP_Graphql`) as a JSON **array** of ops. Today it holds ONE op — `set_category`
(`productUpdate(input:{id, category})`). It is explicitly designed to grow ("more ops — metafields,
publications, … — can be added later"). Category attributes would be a **second op**: a
`metafieldsSet` mutation. Each op has: `endpoint` (graphql.json, `ON_GRAPHQL`), `graphql.query`
(mutation), `graphql.variables` (var → `${...}` template resolved from the transformed data),
`nullableVariables`, `guard`, `errorPaths`.

Sketch (NOT implemented):
```graphql
mutation SetProductMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message } }
}
```
with `$metafields` built from `_categoryAttributes` as
`[{ownerId: <Product GID>, namespace: "...", key: <attr handle>, type: "list.metaobject_reference", value: "[<Metaobject GID>]"}]`.

## The two hard parts (why it was DEFERRED — see guides 20, 21)

1. ~~**List → GraphQL variable.**~~ ✅ **RESOLVED (sync temp-v3).** `Graphql_CP` now sends a variable whose
   resolved value is a JSON array/object as a real GraphQL array/object (`coerceStructured` → `readTree` when it
   starts with `[`/`{`), so `$metafields` can be a variable-length array built from a support field. Scalars stay
   strings → existing ops unchanged. Test `GraphqlCoerceStructuredTest`. The BFF just has to produce
   `product.category_metafields` as a JSON-array support field (part 2 below + Areas C–F).
2. **value → Metaobject GID.** For taxonomy `list.metaobject_reference` metafields, the filled
   `value_id` must resolve to a **Metaobject GID** (via `*_taxonomy_reference`; see guide 21). The
   Step-2 stored value is the taxonomy value id, not the Metaobject GID — a resolution step is
   required. This was the blocker that made the original spike a go/no-go **DEFER** (guide 20).

Note: simple (non-reference) metafields would skip part 2 but still hit part 1.

## Recommended first step when picked up

1. **Spike** (no productionizing): manually run `metafieldsSet` against the sandbox with ONE
   hand-resolved Metaobject GID → confirm the metafield attaches and the mutation shape. Separately,
   confirm in the sync whether a GraphQL op variable can be a list assembled from staged data.
2. If both pass, productionize: add the `metafieldsSet` op to `graphqlPostWriteWorkflow`, a Shopify
   post-processing/staging step that builds the metafields input from `_categoryAttributes` (already
   staged), and the value_id→Metaobject GID resolver.

**Related:** guide 27 (TikTok category attributes, the pattern this mirrors but via body not GraphQL),
guide 20 (Shopify category metafields spike + DEFER decision), guide 21 (Shopify category-attribute
GraphQL how-to), [[sync-service-workaction-model]] (graphql_CP is post-write, GraphQL for
taxonomy/metafields; REST is read-only for those).
