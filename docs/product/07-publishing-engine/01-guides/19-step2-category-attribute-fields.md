# Step 2 — Category Attribute Fields (promote-by-reference + data-driven cardinality)

Status: implemented on `bff-v14` (2026-08-24). Scope: Shopify `clothing` seeded with refs; mechanism
is generic for every channel/category.

## The two pipelines behind the Step 2 tab

`ChannelStepSchemaService` fills each store's Step 2 form from **two independent sources** that the
frontend renders together:

| | Source of truth | Produces | Field type |
|---|---|---|---|
| **A — overlay / static** | `ChannelConfiguration.categoryRequirements[slug]` (seeded by `ChannelCategoryRequirementsMigration`) | `additionalRequiredFields` / `additionalRecommendedFields` | whatever the seed says (was `string` → `TEXT`) |
| **B — live API** | `channel_category_api_config.attributeConfig` (Shopify = GraphQL taxonomy) → `GenericCategoryService.mapToAttributeFields` | live attributes, split into required / optional / `variantOptionSuggestions` by `variantOptionAttributeNames` | inferred from options |

The panel the seller sees is **`ChannelSchemaPerStore.categoryAttributeSection`**, built by
`enrichCategoryAttrsSection` (which MERGES A into B). The separate `sections[].required/recommended/optional`
is the generic form; labels such as *"Fabric/material composition"* are the overlay `description`, which is
how you know a screenshot is showing the enriched category section.

### The problem this guide fixes

Because A used semantic slugs (`material`, `care_instructions`, `pattern`) while B uses the channel's display
labels (`Fabric`, `Care instructions`, `Pattern`), the old exact-`fieldName` dedup missed them:

- the same concept appeared **twice** — once as an overlay `TEXT` required field and once as a live `SELECT`
  optional field (`material` + `Fabric`, `care_instructions` + `Care instructions`);
- `Pattern` showed up twice (live + overlay-recommended);
- live choice-lists rendered as single-select even though Shopify accepts **multiple** values per attribute.

## Fix 1 — data-driven cardinality (`SELECT` vs `MULTISELECT`)

`AttributeApiConfig.choiceListFieldType` decides the control for an option-bearing attribute. Seeded per
channel — no runtime literals:

- `GenericCategoryService.mapToAttributeFields` emits `choiceListFieldType` (default `SELECT`) for attributes
  that carry values, `TEXT` otherwise.
- `CategoryCacheServiceImpl.toFormField` derives `multiple=true` from a `MULTISELECT` type.
- Shopify seed (`CategoryApiConfigDataLoader`): `choiceListFieldType("MULTISELECT")`.

To make another channel multi-value, set `choiceListFieldType` on its `channel_category_api_config` doc. To
make it per-attribute instead of per-channel, add a response-path field to `AttributeApiConfig` and read it in
`mapToAttributeFields` the same way `isCustomizedField`/`requiredField` are read.

## Fix 2 — promote-by-reference (`channelAttributeRef`)

`ChannelConfiguration.RequiredField` / `RecommendedField` now carry **`channelAttributeRef`** — the live
attribute's fieldName/label the overlay entry maps to. `enrichCategoryAttrsSection` matches by `canonicalKey`
(lower-case, non-alphanumeric → `-`; purely structural, bridges `care_instructions`↔`Care instructions` but
**not** synonyms — that is exactly what the ref is for):

- **required overlay with a live twin** → the live attribute is **promoted** to required (keeping its real
  input type + option values) and its twin is **removed from optional** → shown once, correctly typed;
- **recommended overlay with a live twin** → **de-duplicated** (the live optional field is kept, the overlay
  copy dropped);
- **no live twin** (e.g. Shopify `size_type`, which has no taxonomy attribute) → standalone field from the
  overlay's own `fieldType`/`description` (unchanged behavior).

`variantOptionSuggestions` are intentionally excluded from the promotable pool — a genuine variant axis must
not be pulled into the product-attribute lists.

The `sections[].required/recommended` form path also adopts the live input type via `liveByKey` +
`buildFormField(..., liveMatch)`, so both representations stay consistent. `ChannelFormField` gained
`@Builder(toBuilder = true)` so a live field can be promoted with `.required(true)` cleanly.

### ⚠️ Frontend cross-section dedup is keyed by `fieldName` — keep the overlay fieldName when promoting

The frontend renders **both** `sections[]` (the generic "Required to publish" card) **and**
`categoryAttributeSection` (the "Category details" card) at once, and de-duplicates across them **by
`fieldName`** (`ChannelStoreTab.tsx` ~L576-589: `categorySpecificFieldNames` = the set of
`categoryAttributeSection.requiredFields/optionalFields` fieldNames; `renderSection` filters
`sections[].fields` whose `fieldName` is in that set). So a category field renders once — only in the
category card — **iff its `fieldName` is identical in both surfaces.**

Because `sections[].required` carries the overlay fieldName (`material`, `care_instructions`), the
promoted twin in `categoryAttributeSection` MUST also use the **overlay fieldName**, not the live
attribute label (`Fabric`). An early version of this feature promoted under the live fieldName and the
fields rendered **twice** (top + category). `enrichCategoryAttrsSection` therefore does
`live.toBuilder().fieldName(rf.getFieldName()).required(true)` — adopt the live control, keep the overlay
identity. This also keeps the save key stable (`channelData` was already keyed by the overlay fieldName).

### How to add refs for another category / channel

1. Get the channel's **live attribute labels** for that category (for Shopify: the GraphQL taxonomy attribute
   `name`s — the same list the Step 2 "OPTIONAL" panel shows). Do **not** guess; a ref that matches nothing is
   a harmless no-op, but a coincidental wrong match mis-promotes.
2. In `ChannelCategoryRequirementsMigration`, pass the ref as the 4th/5th arg:
   `rf("material", "string", "…", "Fabric")` / `rec("pattern", "string", "…", 0.65, "Pattern")`.
3. Reseed (below). Refs are only needed for **true synonyms**; when the overlay `fieldName` already equals the
   live label up to case/format, `canonicalKey` matches automatically — leave the ref null.

### Two overlay shapes: pure-promote vs standalone

An overlay entry can take either shape (both are just `RequiredField`/`RecommendedField` data):

- **Pure-promote** — `promote("Fabric")` (fieldName only, IS the live attribute id). No fieldType/
  description; the live attribute owns the control + values, and the **save key equals the live id** so
  it also lines up with the publish staging key (`stageCategoryAttributes`). Use this when the
  requirement genuinely IS a live category attribute. This is the preferred shape — one input-component
  door (Pipeline B), no `channelAttributeRef` indirection, no key mismatch.
- **Standalone / ref** — `rf(name, type, desc[, ref])`. Renders its own input when there is no live twin
  (e.g. `model_number`, `isbn`). A `ref` that fails to match a live label degrades gracefully to a
  standalone input, so ref-shape is the lower-risk choice for **unverified** live labels.

### No `additionalRecommendedFields` for Shopify (dropped 2026-08-24)

Because Shopify has a live category attribute section (Pipeline B), the live API **already** surfaces
every category attribute — as an `optionalFields` entry, or as a `variantOptionSuggestions` entry for a
declared axis (Fit, Pattern, …). An overlay *recommended* entry was therefore always one of:

- **redundant** — its live twin is already in `optionalFields` (deduped away by `enrichCategoryAttrsSection`); or
- **fallback noise** — its twin is a *variant axis* (so not in `optionalFields`) or simply absent, so it
  rendered as a standalone input that duplicated/confused the form (e.g. the old
  `Fit style (slim, regular, relaxed)` + `Pattern (solid, striped, floral)` standalones).

So all 8 inline Shopify categories now seed `additionalRequiredFields` only; optional/recommended fields
come purely from live (single source). `additionalRecommendedFields` is still supported by the model and
retained for **WIX/eBay** (left untouched) and the shared `jewelryOverride()`/`babyOverride()` — the flow
that populates the main *Recommended* section (`effectiveRecommended`) only runs when there is **no** live
category attribute section (`categoryAttrsForSchema == null`), i.e. channels without Pipeline B.

Currently seeded (Shopify), required-only:

- **`clothing`** — pure-promote `promote("Fabric")`, `promote("Care instructions")` (store-verified,
  live 2024-01). `size_type` **dropped** (no Shopify taxonomy twin — model as a master attribute with
  `requiredByChannel` if ever needed).
- **`electronics`** `connectivity→Connectivity technology` (+ standalone `model_number`);
  **`home-garden`** `material→Material` (+ standalone `dimensions`); **`sports`** `sport_type→Activity`
  — refs sourced from Shopify's **public** product-taxonomy (`main`); a ref that fails to match the
  store's live label degrades to a standalone required input.
- **`food`/`beauty`/`books`/`toys`** — standalone required only (generic concepts with no live twin).

Also removed: the orphan `size_type` **field-boost** for Shopify in `ChannelCategoryFieldBoostsMigration`
(field-boosts drive JOLT generation, a separate system; Shopify has no `size_type` target so the boost
was inert). Amazon/eBay `size_type` boosts are kept (still legitimate there).

> **Version caveat.** The public taxonomy (`main`) has drifted from the 2024-01 API: it lists `Material`
> (not `Fabric`), `Sleeve length type` (not `Sleeve length`), and drops `Care instructions` — yet a 2024-01
> store returns the latter set. So public-taxonomy-derived refs may not match a 2024-01 store's live labels
> and then act as harmless no-ops (field stays a text input). For exact matches, source labels from the
> store's own `channel_category_attributes_cache` / the Step 2 OPTIONAL panel, or pin the taxonomy release
> matching the store's `apiVersion`. `jewelry`/`baby` are left refless because their overrides are shared
> across channels (`jewelryOverride()`/`babyOverride()`) — give Shopify a dedicated override before adding
> Shopify-specific refs there.

## Making it visible at runtime (reseed + cache)

Two seeders are non-destructive on an existing DB, so a plain restart is **not** enough:

- `ChannelCategoryRequirementsMigration.applyRequirements` merges **missing slugs only** and never overwrites an
  existing slug → the new refs on an already-seeded `clothing` are **not** written until the slug is removed.
- `CategoryApiConfigDataLoader` **does** overwrite on restart (so `choiceListFieldType` lands), but
  `channel_category_attributes_cache` (TTL 24 h) keeps returning the old `SELECT` until the entry expires or is
  dropped.

Both are gated by `DATA_SEED_ON_STARTUP` (see the seed-on-startup toggle) — set from the IntelliJ run config,
not the YAML default.

```js
// mongosh — reset so the refs + MULTISELECT take effect on the next startup
// 1) drop the shopify system-default clothing slug so the migration re-merges it WITH refs
db.channel_configurations.updateOne(
  { channelId: "shopify", is_system_default: true, isActive: true },
  { $unset: { "categoryRequirements.clothing": "" } }
);
// 2) clear cached Shopify category attributes so choiceListFieldType (MULTISELECT) is re-resolved
db.channel_category_attributes_cache.deleteMany({ channelType: "shopify" });
```

Then restart with `DATA_SEED_ON_STARTUP=true` and reopen Step 2 for a clothing product.

## Files touched

- `channel/category/config/ChannelCategoryApiConfig.java` — `AttributeApiConfig.choiceListFieldType`
- `channel/category/service/GenericCategoryService.java` — consume `choiceListFieldType`
- `channel/category/service/CategoryCacheServiceImpl.java` — derive `multiple` from `MULTISELECT`
- `channel/category/loader/CategoryApiConfigDataLoader.java` — Shopify `choiceListFieldType("MULTISELECT")`
- `channel/model/entity/ChannelConfiguration.java` — `channelAttributeRef` on Required/RecommendedField
- `config/ChannelCategoryRequirementsMigration.java` — ref-carrying `rf()/rec()` + Shopify clothing refs
- `ecommerce/channelproduct/model/dto/ChannelFormField.java` — `@Builder(toBuilder = true)`
- `ecommerce/channelproduct/service/ChannelStepSchemaService.java` — `enrichCategoryAttrsSection`
  promote-by-reference, `liveByKey` type adoption, `canonicalKey`/`liveMatch`/`addKey` helpers
