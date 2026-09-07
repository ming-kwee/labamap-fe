# 38 — TikTok Shop variant images (per-SKU `sku_img`), image-first

**Status:** built end-to-end (bff-v16 + sync temp-v2), unit-tested; **needs a live verify** with a product
whose SKUs carry per-variant images. Closes guide 12 item 5.

## The shape TikTok wants

TikTok 202309 puts the per-SKU image **inside** the sales attribute, not as a top-level SKU field:

```json
"skus": [{
  "seller_sku": "R-M",
  "sales_attributes": [
    {"name":"Color","value_name":"Red","sku_img":{"uri":"tos-…"}},
    {"name":"Size","value_name":"M"}
  ],
  "price": {…}, "inventory": [{…}]
}]
```

Two hard constraints drive the design:

1. **`sku_img.uri` must be an upload-API uri** (a raw GCS URL is rejected) — like `main_images` and the
   size chart, the image is uploaded first (`POST /product/{v}/images/upload`) to get a TikTok uri.
2. **`sku_img` is nested** at `sales_attributes[axis].sku_img`, but the sync's per-SKU media write-back can
   only set a **flat** variant field. So we stage it flat, upload+write-back flat, then **relocate** it into
   `sales_attributes` via the sync's GENERIC `relocate` primitive (`Create_CP.applyRelocate`) — path-driven,
   no field/channel knowledge in the code (contrast Shopee's bespoke `image-to-first-tier-option`, guide 36).

## Part 0 — getting `variantImages` onto the SKUs (the input)

The six parts below all assume each transformed SKU carries `variantImages`. Two ways it gets there after JOLT:

- **Default JOLT seed** (`buildTiktokshopJoltSpec`): `skus[&1].&` passes *every* master SKU field through, so
  `variantImages` survives as `skus[*].variantImages`. ✓
- **AI-generated per-category spec** (the runtime-preferred spec): maps only apiSchema paths, and `variantImages`
  is a support field **absent from apiSchema** → it is **dropped**. The fallback that re-attaches it is
  `ChannelPublishService.stageVariantImages`.

`stageVariantImages` previously wrote to a hard-coded `"variants"` key — correct for Shopee/Shopify but a **silent
no-op for TikTok**, whose post-JOLT SKU list is under `skus`. So with an AI spec active (very likely once a
category has been published), variant images vanished before any of the parts below ran. **Fixed:** it now
resolves the transformed list key data-drivenly (`ChannelAttributeConverterService.resolveVariantBodyKey` →
`skus` for TikTok) and, if a by-`sku` match finds nothing (the AI spec renamed the id field, e.g. `sku →
seller_sku`), falls back to **positional** attach (master `variants[i]` ↔ transformed `skus[i]`, 1:1 by JOLT
order, before any reordering rule). Safe for Shopee (still resolves `variants`, by-sku match unchanged).

## The six moving parts (all data-driven)

| # | Where | What |
|---|---|---|
| 1 | BFF `GenericPostProcessingEngine` | new op **`BUILD_VARIANT_IMAGE_UPLOAD`** — per SKU, from `variantImages[0]` stage the upload SOURCE `sku_img_upload={uri:<gcsUrl>}` + the write-back placeholder `sku_img={uri:""}`. Only for SKUs that HAVE an image. Generic (field names are params). |
| 2 | BFF `ChannelConfigurationDataLoader.createTiktokshopPostProcessingRules` | rule **`tiktok-build-sku-image-upload`** (priority 22, before `cleanup-sku-source-fields` at 45) runs op #1. Replaced the disabled `transform-sku-images`. |
| 3 | BFF `ChannelAttributeMappingsMigration.buildTiktokshopAttributeMappings` | register `skus@sku_img_upload` (object, **support** — upload-only) + `skus@sku_img` (object, **non-support** — reaches the sync as the write-back target, then scattered). |
| 4 | BFF `ChannelMetadataMigration` | `tiktokshopVariantsMediaPreWorkflow()` seeded under **`create_CP_Variants_Media_Pre`** + **`update_CP_Variants_Media_Pre`**. Uploads each `sku_img_upload` (Base64 `data` + `use_case`), positional write-back → flat `skus.sku_img={uri:<tiktokUri>}`. |
| 5 | BFF `ChannelMetadataMigration` | generic **`relocate`** spec-list on **`create_CP`** + **`update_CP`** `body-reshape-to`: `[{arrayPath:"skus", field:"sku_img", intoArray:"sales_attributes", intoIndex:0}]`. Single source: `tiktokSkuImgRelocateSpec()`. |
| 6 | SYNC `Create_CP.applyRelocate` (generic) | for each `relocate` spec, moves `element[field]` into `element[intoArray][intoIndex][field]` and drops the flat field; skips a recursively-blank value (e.g. `{uri:""}` placeholder, via `isBlankNode`), never overwrites a populated target. **No field/channel literals** — every path is data. Gated → no-op for channels that seed no `relocate` (Shopify inline variants untouched). |

Flow: **BFF stages flat** → **variants media_pre uploads + writes back flat** → **`Create_CP.applyRelocate` moves
it into `sales_attributes`**. The image lands on the SKU's `intoIndex`-th sales attribute (`0` = the colour/image
axis, which `build-sales-attributes` emits first from `variantDimensions` order). Any channel can express a
"flat field → nested array element" move as `relocate` data — no new sync code.

## `use_case`

The upload injects `use_case=ATTRIBUTE_IMAGE` (the sku_img destination) via a JOLT `preTransform` default in
the workflow — exactly the mechanism the size chart uses for `SIZE_CHART_IMAGE`. It is a **metadata literal**,
so if TikTok names it differently the fix is a migration reseed, **no code change**. `main_images` still upload
with no `use_case` (default `MAIN_IMAGE`).

## Known limitation (same as Shopee)

The write-back is **positional** — the upload response echoes only `data.uri`, no SKU key, so `responses[i]`
pairs with `variantGroups[i]` by index. This assumes **every** SKU carries an image; a partial image set can
mis-align (guide 36 documents the identical Shopee constraint). Image-less SKUs correctly emit nothing (no
placeholder, no upload).

## Tests

- BFF `TikTok202309PipelineTest`: `producesTiktok202309Body` (imaged SKU has `sku_img_upload`+`sku_img`
  placeholder, image-less SKU has neither) + `buildsSkuImageUploadFromVariantImages`.
- SYNC `SkuImgScatterTest` (5): relocate onto the axis, blank placeholder skipped, no-field untouched,
  `intoIndex` data-driven, existing target not overwritten.

## Live verify checklist

1. Create a product whose SKUs each have a per-variant image (Step-1), publish to TikTok.
2. Sync log: `create_CP_Variants_Media_Pre` uploads N images; `[positional-variant] wrote N variant field(s)`.
3. `create_CP` body: each `skus[].sales_attributes[0].sku_img.uri = tos-…`, **no** top-level `skus[].sku_img`.
4. If upload rejects `use_case` → reseed the workflow with the enum TikTok's error names.
