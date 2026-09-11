# 08 — Follow-up / riwayat: Shopify live category attributes → GraphQL metafields

> **STATUS (diperbarui bff-v20): DIIMPLEMENTASIKAN** (bukan lagi "DEFERRED"). Dokumen ini dipertahankan sebagai
> **riwayat** yang menjelaskan **kenapa** fix body TikTok (SHAPE A) **tidak** carry-over ke Shopify (SHAPE B) —
> analisis itu masih benar & mendidik. Desain/implementasi terkini:
> [01 write-through](01-category-attributes-write-through-generic.md) + Tahap
> [A](03-tahap-a-available-catalog.md)/[B](04-tahap-b-resolve-by-type.md)/[C](05-tahap-c-probe-enable.md).

**Area:** publish → Shopify category attributes (SHAPE B).
This is the Shopify counterpart of guide [27](../27-tiktok-category-attributes-to-product-attributes.md)
(TikTok `product_attributes`, SHAPE A). It records WHY the bff-v15 TikTok fix does **not** wire Shopify —
Shopify's values are GraphQL metafields (reference-object), not a body array.

## Why the TikTok fix does NOT carry over

Category attributes reach different targets per channel:

|           | TikTok / Shopee                                                           | Shopify                                                                                                         |
|-----------|---------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| Target    | array in the REST create body (`product_attributes` / `attribute_list`)   | **GraphQL metafields** (often `list.metaobject_reference` → Metaobject GIDs)                                    |
| Transport | main create body                                                          | a **separate op** in the `workaction#create_CP_Graphql` array (a GraphQL mutation run AFTER the product upsert) |
| Assembler | post-processing rule `BUILD_ATTRIBUTE_LIST` reading `_categoryAttributes` | **none yet** — needs a `metafieldsSet` op                                                                       |

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

## The two hard parts (dulu blocker DEFER — kini KEDUANYA RESOLVED)

1. ~~**List → GraphQL variable.**~~ ✅ **RESOLVED (sync temp-v3).** `Graphql_CP` now sends a variable whose
   resolved value is a JSON array/object as a real GraphQL array/object (`coerceStructured` → `readTree` when it
   starts with `[`/`{`), so `$metafields` can be a variable-length array built from a support field. Scalars stay
   strings → existing ops unchanged. Test `GraphqlCoerceStructuredTest`.
2. ~~**value → Metaobject GID.**~~ ✅ **RESOLVED (Area D + Jalur B, bff-v17..v20).** TaxonomyValue GID →
   Metaobject GID via `MetaobjectTaxonomyMapper` (`*_taxonomy_reference`); metaobject yang belum ada
   **di-upsert otomatis** (Jalur B), definisi yang belum ada **di-enable otomatis** (Tahap C). Tak ada lagi
   langkah manual. Detail: Tahap [B](04-tahap-b-resolve-by-type.md)/[C](05-tahap-c-probe-enable.md).

Note: simple (non-reference) metafields would skip part 2 but still hit part 1 (belum dibangun — Phase-2).

## Riwayat: langkah yang direkomendasikan saat "picked up" (SUDAH dikerjakan)

Spike + productionize di rekomendasi asli **sudah selesai**: op `set_category_metafields` +
`BUILD_METAFIELD_LIST` + resolver value + provisioning otomatis semuanya ada. Ringkas di
[01](01-category-attributes-write-through-generic.md).

**Related:** guide [27](../27-tiktok-category-attributes-to-product-attributes.md) (TikTok, SHAPE A body),
[07](07-spike-and-go-no-go.md) (spike + go/no-go historis), [02](02-value-journey-howto.md) (perjalanan satu
nilai), [[sync-service-workaction-model]] (graphql_CP post-write; REST read-only untuk taxonomy/metafields).
