# 36 — Shopee per-SKU variant (model) images

**Status:** implemented (bff-v15 + sync temp-v2), pending live verify. **Area:** Shopee variant images.
**Goal:** attach each SKU's own image to its Shopee model (`model.image.image_id`).

## The Shopee rule (researched)
Shopee variation images live on **`tier_variation[0].option_list[].image = {image_id}`** — the **FIRST
tier only**; the second/third tiers' options cannot have images, and **`model[].image` is IGNORED**
(sending it silently does nothing — the first attempt put images on `model.image` and they never
displayed). One image **per first-tier OPTION** (e.g. per Size value), not per SKU-combination. (v1 API
exposed this as `TierVariation.images_url[]`; v2 as `option_list[].image`.)

A per-variant image URL must be **uploaded** to `media_space/upload_image` first (→ image_id). The catch:
the upload response echoes only `image_id` — **no `model_sku`** — so the existing variant-media capture
(Shopify-style, keyed by `image.variant_ids`) and the match-based write-back can't bind an uploaded image
to its SKU.

## Design (upload → positional capture → inline model image)
Runs in the variants media_pre loop, BEFORE add_item/init_tier_variation.

**Sync** (`ChannelProductActivitiesImpl`) — new write-back mode:
- `applyWriteBack` routes a response-update-to whose updatePath has `in:"variants" + positional:true` to
  `applyPositionalVariantWriteBack`, which pairs `responses[i]` with `variantGroups[i]` **by index** (both
  in per-SKU upload order), reads the id at `get`, and writes it to `to`, wrapping as `{wrapKey:value}`.

**BFF**:
1. `BUILD_MODEL` stages, per SKU with a variant image: `model_image_upload = {uri:<url>, scene:"normal"}`
   (the upload descriptor) and `image = {image_id:""}` (placeholder).
2. `ChannelAttributeMappingsMigration`: register support variant fields `skus@image` (object) and
   `skus@model_image_upload` (object).
3. `ChannelMetadataMigration`: seed `create_CP_Variants_Media_Pre` + `update_CP_Variants_Media_Pre`
   (`shopeeVariantsMediaPreWorkflow`): `from:"model_image_upload"`, `output.conversion uri_key:BinaryFile`
   uploads each SKU's uri; `response-update-to` positional writes `response.image_info.image_id` →
   `skus.image` wrapped `{image_id:<id>}`.
4. `create_CP_Variants` / `update_CP_Variants_Add` `output.fields` gained `image_key:"image"` → the model
   carries `image:{image_id}` (the transport for the id; NOT sent to Shopee as a model field).

**Sync — scatter to the first tier** (`Create_CP_Variants.buildInitTierVariationRequest`): with
`create_CP_Variants_Init` `models.image-to-first-tier-option:true`, each model's image is moved onto
`tier_variation[0].option_list[tier_index[0]].image` (first non-empty image_id wins per option; the
`{image_id:""}` placeholder of an image-less SKU is skipped) and `model.image` is then dropped. This is
where the images actually take effect — Shopee reads them from the first tier's options.

Flow: media_pre uploads main images → **variants media_pre uploads per-SKU images, positional write-back
fills `skus.image`** → add_item → init_tier_variation builds models WITH `image:{image_id}`. The command is
threaded step-to-step (`cmd = runArrayInstructionLoop(...)`), so the filled `skus.image` reaches init.

> **`skus.image` must be NON-support.** The sync's model-list builder
> (`Create_CP_Variants.processVariantGroups`) SKIPS support fields, so if `skus@image` is registered
> `isSupportField:true` it never reaches `model.image` and the scatter has nothing to move — the images
> upload and positional-capture fine but silently never display. Register `skus@image` as **non-support**
> (`ChannelAttributeMappingsMigration`). `skus@model_image_upload` stays support (upload-only).

## UPDATE — re-push changed images (`update_tier_variation`)
init_tier_variation is CREATE-only; update_price/update_stock carry no image and add_model only fires for
NEW SKUs — so a cropped/replaced image on an EXISTING SKU otherwise never reaches the listing. Shopee's
**`product/update_tier_variation`** restates the whole `tier_variation` (incl. per-option images) + the
`model_id→tier_index` mapping in one call.

- **BFF** seeds `update_CP_Variants_Init` → `update_tier_variation` (`diff-id-field:skus.model_id`,
  `from:skus`, `tier-source:tier_variation`, `output.fields:{model_id,tier_index,image}` wrapper `model_list`,
  `models.image-to-first-tier-option:true`).
- **Sync** — `Create_CP_Variants.buildInitTierVariationRequest` is generalised: it fires for the CREATE base
  step (`create_CP_Variants` → separate `create_CP_Variants_Init`) AND when invoked directly with
  `update_CP_Variants_Init` (self — endpoint + reshape under the same key). Same aggregate-model_list +
  scatter path; `model_list` entries end up `{model_id, tier_index}` (image scattered onto the tier option,
  then dropped).
- New activity `updateTierVariationRestChannelProductVariants` + workflow step, in the `isUpdate` block
  **after add/delete**. `keepExisting=true` (model-id present) + drop to-delete; forward-only on error;
  SKIP when the metadata is absent or no existing model.
- **The tier step reads a PRE-DIFF snapshot, not the threaded `cmd`** (fixed temp-v2 fd920e8). The workflow
  threads `cmd = runVariantDiffStep(add)` → the add step filters to the NEW-model bucket (empty on a pure
  re-image) and returns that emptied command, so feeding it to the tier step made it SKIP ("no existing
  variants to re-tier") and the new image never reached the channel. Fix: snapshot the full variant command
  right after `variants_media_pre` fills `skus.image` and before any diff filtering (`variantSnapshotForTier`),
  and pass THAT to the tier step — the activity filters it to existing models (model-id present) itself. In
  Temporal the workflow's `cmd` is only changed via explicit `result.getCommand()`, so the snapshot is
  immune to what the add/delete activities do. (Depends on imported models carrying `model_id` — see the
  reverse-sync model-id baseline, docs/reversesync/08 — else they fall into the add bucket, not re-tier.)

## Scope / limitations
- A SKU without a variant image → BUILD_MODEL sets nothing → `output.fields` skips the absent `image` →
  no model image (fine; per-model image is optional). On UPDATE, an option left imageless in the sent
  `tier_variation` may clear its existing image — currently moot since variants_media_pre re-uploads every
  SKU image each run, so all options carry an image.
- One image per SKU (first `variantImages`); positional binding assumes one upload per SKU in order.
- UPDATE re-uploads + re-tiers every run (no dirty-detection). Idempotent but wasteful — a "only when the
  image changed" gate is a follow-up.

## Verify
CREATE — publish a Shopee variant product whose master variants have `variantImages`. Sync log: two
`media_space/upload_image` for main + **two more** for the SKUs; `[positional-variant] wrote N variant
field(s)`; `init_tier_variation` → `error:""`; the Shopee listing shows per-variant images.

UPDATE — crop/replace a variant image, publish again. Sync log: variants media_pre re-uploads the SKU
images + `[positional-variant] wrote N`; then, after add/delete, a
`update_tier_variation_rest_channel_product_variants` step → POST `product/update_tier_variation`
→ `error:""`; the listing's variant thumbnail changes to the cropped image.

## Related
guide 25 (main media pre-upload), guide 33 (model_id capture — same `[*]`/`in:variants` write-back family),
[[sync-service-workaction-model]].
