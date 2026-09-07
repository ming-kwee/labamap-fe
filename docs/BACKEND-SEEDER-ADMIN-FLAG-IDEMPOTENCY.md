# Seeder idempotency vs admin-mutable flags

> Why a startup seeder can silently undo an admin's disable/enable, and the two shapes of the bug —
> with the fixes applied and an audit of every seeder.

## The bug class

Reference-data seeders (`*DataLoader`, `*Migration`) run on every startup (gated by
`app.data.seed-on-startup`, default `true`) and upsert their seed docs. They become **unsafe** the
moment a collection has an **admin-mutable flag** (`active` / `isActive` / `enabled`) that the seed
does not itself model, because the upsert can undo the admin's change. Two distinct shapes:

- **(A) invisible → duplicate.** The existence-check lookup **filters on the flag**
  (`{ 'active': true, … }`). An admin-disabled doc is invisible to it, so `switchIfEmpty(save)` (or a
  `find…filter(…).next().switchIfEmpty(save)`) **re-inserts an active duplicate every startup** —
  resurrecting the disabled thing. If the collection has a **non-unique** index on the natural key,
  you accumulate duplicates; a **unique** index instead makes the insert fail (noisy but non-silent).

- **(B) overwrite.** The lookup is unfiltered (finds the disabled doc), but the update path **writes
  the flag from the seed default** (e.g. saves a freshly-built config whose `enabled=true`),
  **clobbering the admin's `false` on every restart**.

**The safe pattern** (both shapes): look up by the natural key **unfiltered by the flag**; when
duplicates exist, keep one — **preferring a disabled doc** so the admin's intent survives a collapse;
refresh the definition fields but **never write the flag**; delete duplicates.

## Fixes applied

### 1. `ecommerce_channel_variant_attributes` — shape (A) — commit `d4b9f1d`
`ChannelVariantAttributesMigration` looked up via `findByChannelType` (`@Query("{ 'active': true, … }")`),
so an admin's `active:false` (e.g. Shopify `inventory_policy`) was invisible → an active duplicate was
re-inserted every startup and the field kept reappearing in the Step-2 variant grid.
**Fix:** added unfiltered `findByChannelTypeAndFieldName`; `chooseDocToKeep` prefers a disabled doc;
update refreshes definition but not `active`; duplicates deleted.

### 2. `channel_category_api_schemas` — shape (A) — this change
`ChannelCategoryApiSchemaDataLoader.upsert` looked up via
`findByChannelTypeAndCategorySlugAndIsActiveTrue`. Admin `/deactivate`
(`ChannelCategoryApiSchemaAdminController`) sets `isActive:false`, and the compound index
`{channelType, categorySlug, isActive}` is **non-unique** → `switchIfEmpty(save)` inserted an active
duplicate every startup, resurrecting a deactivated schema extension.
**Fix:** reuse the existing unfiltered `findAllByChannelTypeAndCategorySlug`; `chooseDocToKeep` prefers
a deactivated doc; keep the version-guard on the kept doc; refresh extension/version/changeNote but not
`isActive`; delete duplicates first. Unit-tested (`ChannelCategoryApiSchemaDataLoaderTest`).

### 3. `channel_category_api_configs` — shape (B) — this change
`CategoryApiConfigDataLoader.upsert` found the existing doc (unfiltered `findByChannelType`) but saved
the **whole rebuilt seed** (default `enabled=true`), copying only `id`+`createdAt` → an admin's
`/disable` (`ChannelCategoryApiConfigAdminController`) was reverted on every restart.
**Fix (narrow):** carry `existing.isEnabled()` onto the rebuilt config before saving. The loader still
owns the API-schema shape (`treeApiConfig`/`attributeConfig`); only the admin toggle is preserved.

## Audit — every startup seeder (2026-08-22)

| Seeder / collection | Verdict | Note |
|---|---|---|
| `ChannelVariantAttributesMigration` / `ecommerce_channel_variant_attributes` | ✅ fixed (A) | commit `d4b9f1d` |
| `ChannelCategoryApiSchemaDataLoader` / `channel_category_api_schemas` | ✅ fixed (A) | this change |
| `CategoryApiConfigDataLoader` / `channel_category_api_configs` | ✅ fixed (B) | this change — preserves `enabled` |
| `AiPromptSnippetDataLoader` / `ai_prompt_snippets` | 🟡 latent (B) | update writes `enabled` from seed, but **no admin disable endpoint is wired** → not exploitable today. If a toggle is added, stop overwriting `enabled`. |
| `ShopifyChannelAttributesMigration` / `ecommerce_master_attributes` | ✅ safe (reference) | `findByFieldName` unfiltered; never writes `active` |
| `MasterProductOverridableAttributesMigration` / same | ✅ safe | `findByFieldName` unfiltered; never writes `active` (sets it only to deactivate orphans, by design) |
| `ChannelValueMappingDataLoader` / `channel_field_value_mappings` | ✅ safe | doc has no `active`/`enabled` flag to lose |
| `MasterAttributeDataLoader`, `SeedDataLoader`, `ChannelSchemaMigration`, `ChannelConfigurationMigration`, `ChannelFieldBoostsMigration` | ✅ safe | seed-once guards (`count()==0`) — no per-doc resurrection |

## Rule of thumb for new seeders

If the collection has (or may gain) an admin-mutable flag: **look it up unfiltered by that flag, and
never write the flag on the update path.** Reserve the flag-filtered repo queries (`findBy…ActiveTrue`)
for the runtime read path — not for the seeder's existence-check.
