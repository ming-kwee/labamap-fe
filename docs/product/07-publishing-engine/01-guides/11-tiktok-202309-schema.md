# TikTok Shop — apiSchema & pipeline migration to Product API v202309

**Endpoint:** `POST /product/202309/products` (create). Media pre-upload:
`POST /product/202309/images/upload`. Both already wired in `ChannelMetadataMigration.buildTiktokshopMetadata`.

Prior to this migration the seeded config was **labelled** `202309` (`metadata.apiVersion`) but used the
**legacy** `/api/products` field names. This guide records the corrected 202309 shape and the
coordinated pipeline changes that produce it.

> **Verification caveat.** The official Partner Center pages are JS-rendered and could not be fetched
> for byte-exact confirmation. Field renames marked ✅ are corroborated by secondary sources
> (MindCloud REST wrapper, EcomPHP SDK `POST product/202309/products`, TikTok seller help). Fields
> tagged **VERIFY-202309** are from 202309-spec analysis and carry a `// VERIFY-202309` marker in code
> — reconcile them against a live doc/sandbox before relying on them in production.

## Field map: legacy → 202309

| Concern | Legacy (old seed) | 202309 | Source |
|---|---|---|---|
| Product title | `product_name` | `title` | ✅ |
| Images | `images:[{id}]` | `main_images:[{uri}]` (JOLT-independent — built from `_sourceImages`) | ✅ |
| COD flag | `is_cod_open` | `is_cod_allowed` | ✅ |
| Weight | `package_weight:""` (string) | `package_weight:{value, unit}` | ✅ (unit enum VERIFY) |
| Dimensions | `package_length/width/height` (flat) | `package_dimensions:{length,width,height,unit}` | ✅ (unit enum VERIFY) |
| Product attrs | `product_attributes:[{attribute_id, attribute_values:[{value_id,value_name}]}]` | `product_attributes:[{id, values:[{id,name}]}]` | ✅ |
| SKU stock | `skus[].stock_infos:[{warehouse_id, available_stock}]` | `skus[].inventory:[{warehouse_id, quantity}]` | ✅ |
| SKU price | `skus[].original_price:""` (string) | `skus[].price:{amount, currency}` | ✅ (currency per-region VERIFY) |
| Sales attrs | `sales_attributes:[{attribute_id, value_id, custom_value, sku_img:{id}}]` | `sales_attributes:[{id, name, value_id, value_name, sku_img:{uri}}]` | id/value_id ✅; name/value_name/sku_img placement VERIFY |
| Added | — | `save_mode` (LISTING\|AS_DRAFT), `identifier_code:{code,type}`, `external_sku_id`, `size_chart:{image:{uri}}` | save_mode ✅; rest VERIFY |

## How the pipeline produces the 202309 body

It is a **coordinated** change (apiSchema is spec-of-record; support/reshape lives in post-processing):

1. **apiSchema** — `ChannelConfigurationDataLoader.createTiktokshopApiSchema` mirrors the 202309 body.
   This is the authoritative target for APM / JOLT generation.
2. **Default JOLT seed** — `DefaultJoltSpecDataLoader.buildTiktokshopJoltSpec` maps master → 202309
   target names (`title`, `category_id`, `brand_id`) and passes
   the flat variant fields through at `skus[*].{color,size,price,stock,seller_sku,variantImages}`.
   Product images are **JOLT-independent** — the seed maps neither `mainImage` nor `images`; `main_images`
   is built in post-processing (see below). (Seed is a last-resort fallback; generated specs that target
   apiSchema win — keep them aligned.)
   > **`package_weight.value` is NO LONGER trusted to JOLT.** The seed still maps `weight → package_weight.value`,
   > but a generated per-category spec mis-targets the nested `package_weight` object (and the critical-field
   > injection's simple-field guard checks source-key presence, not target coverage, so it does not correct it) —
   > leaving `package_weight = {unit:KILOGRAM}` only → TikTok `36009004 "Value of PackageWeight is a required field"`.
   > It is now lifted JOLT-independently from `_source.weight` by the `tiktokshop-set-package-weight` rule (below),
   > exactly like `category_id`. See [[shopee-image-two-step-flow]] / `DESIGN-namespaced-source-context`.
   >
   > **`_source.weight` itself is backfilled.** The FE publish payload omits `weight` (like it omits dims),
   > and both live only in the stored master's `productAttributes`. `PublishPayloadStagingService.ensureShippingAttributes`
   > (pre-transform, reactive) backfills `weight` + `length/width/height/dimensionUnit` from the stored master
   > when absent — so `_source.weight` is populated and the rule fires WITHOUT needing a Step-2 override. Without
   > this backfill the rule no-ops (source null) and `package_weight.value` stays empty.
3. **Post-processing rules** — `createTiktokshopPostProcessingRules` reshapes the flat fields into
   202309 structures:
   | Rule | Produces |
   |---|---|
   | `set-product-defaults` | `save_mode=LISTING`, `package_weight.unit=KILOGRAM` (SET_FIELD) |
   | `tiktokshop-set-category-id` | `category_id` from `_source.channelCategoryId` (COPY_PATH) — JOLT-independent |
   | `tiktokshop-set-package-weight` | `package_weight.value` from `_source.weight` (TO_STRING: lift + stringify, whole-number safe; preserves sibling `unit`) — JOLT-independent, fixes required-field `36009004` |
   | `enrich-images` | `main_images:[{uri}]` from the canonical `_sourceImages` staging key (mainImage + gallery, de-duped; staged by `PublishPayloadStagingService.collectSourceImageUrls`), wrapped via STRING_TO_OBJECT keyField `uri`. Runs after JOLT and overwrites `main_images`, so it behaves identically for the seed spec and every generated spec. |
   | `build-sales-attributes` | `sales_attributes` with attribute key `id` (`attributeKey`) |
   | `build-inventory` | `inventory:[{warehouse_id, quantity}]` (BUILD_STOCK_INFOS `targetField`/`stockKey`) |
   | `build-price` | `price:{amount(string), currency}` (TO_STRING + SET_DEFAULT + NEST_FIELD×2) |
   | `transform-sku-images` | `sku_img:{uri}` (WRAP_ARRAY_TO_OBJECTS wrapKey `uri`, singleOnly) |
   | `cleanup-sku-source-fields` | drops consumed flat `color/size/stock/variantImages` |
4. **Engine op extensions** (backward-compatible — defaults unchanged, TikTok-only in effect):
   - `BUILD_STOCK_INFOS` gained `warehouseKey` / `stockKey` (default `warehouse_id` / `available_stock`).
   - `BUILD_SALES_ATTRIBUTES` gained `attributeKey` (default `attribute_id`).
5. **Variant value translation** — `VariantValueTranslationService` (Option B, `variantValueTranslation=true`)
   still replaces `custom_value` → taxonomy `value_id`; it scans `_dim` and does not depend on the
   attribute-id key, so the `attribute_id`→`id` rename is safe.

Verified self-consistent by `TikTok202309PipelineTest` (real loader rules + real engine → asserts the
202309 body). Shopify/WIX/Shopee are untouched (Shopee rule tests still green).

## Store connection

`TikTokShopStoreConnectionSeeder` seeds one `channel_store_connections` row at startup (Order 160,
gated by `app.data.seed-on-startup`). Stored credential keys match `createTiktokshopConfiguration`
(`accessToken`, `refreshToken`, `appKey`, `appSecret`, `shopCipher`). Two modes:

- **Real** — when `TIKTOK_ACCESS_TOKEN` **and** `TIKTOK_APP_KEY` are set, connect a genuine store via
  `connectStore` (encrypted, duplicate-guarded). Other creds from `TIKTOK_REFRESH_TOKEN` /
  `TIKTOK_APP_SECRET` / `TIKTOK_SHOP_CIPHER`.
- **Dev dummy** — otherwise, when `TIKTOK_SEED_DUMMY=true` (**default**), seed a placeholder store with
  `REPLACE_ME` credentials flagged `reconnectRequired=true` → `connectionStatus=RECONNECT_REQUIRED`.
  The row is visible in the store list but clearly unauthenticated; fill real credentials later via
  `PATCH /api/v1/channel-stores/{storeId}/credentials` (or the reconnect flow). Set
  `TIKTOK_SEED_DUMMY=false` to disable. Idempotent — skipped when a store with that URL already exists.

Non-secret identity is env-overridable: `TIKTOK_SEED_ORG_ID` (default `default`),
`TIKTOK_SEED_STORE_NAME`, `TIKTOK_SEED_STORE_URL`, `TIKTOK_SEED_STORE_ID` (default `tiktokshop-dev`),
`TIKTOK_SEED_REGION`.

## Follow-ups (need the live doc / sandbox)

- **`VERIFY-202309` fields**: `package_weight.unit` / `package_dimensions.unit` enums; `size_chart`
  (image vs `template_id`); `sales_attributes` `name`/`value_name`; `sku_img` placement (SKU-level vs
  inside a sales attribute); `identifier_code.type` enum; `external_sku_id`.
- **Media `uri` substitution**: `main_images[].uri` / `sku_img.uri` must be the value returned by the
  upload step (`workaction#upload_image`, response `data.img_id`/`uri`), not the raw source URL —
  confirm the upload response key and that the create workflow writes it back.
- **`package_dimensions` population**: JOLT does not yet map master length/width/height; it is
  reference-only until master dimension fields are wired (no default unit is set to avoid emitting an
  incomplete object).
- **Generated-spec price**: a generated spec that emits `skus[*].price.amount` directly leaves no flat
  `price`, so `build-price` no-ops — currency default would then be missing; revisit if generated
  specs become primary for TikTok.
