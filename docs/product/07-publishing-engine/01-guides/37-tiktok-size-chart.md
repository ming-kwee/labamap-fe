# 37 — TikTok Shop size chart (image-first)

**Status:** LIVE-VERIFIED (CREATE+UPDATE, 2026-09-02 — product APPROVED). **Area:** TikTok Shop size chart.
**Goal:** satisfy TikTok's category size-chart rule (e.g. `12052673 size_chart_image required`, apparel category
`835720`) by letting the merchant upload one size-chart image that reaches the create body as
`size_chart:{image:{uri}}`.

Full design + traced sync mechanics: `docs/product/07-publishing-engine/SizeChart/01-tiktok-size-chart-plan.md`.

## Decision: image, not template
TikTok 202309 accepts `size_chart.image.uri` (uploaded image) **or** `size_chart.template.id` (a structured
template). **Image-first, template deferred** — the image form is universal/portable and reuses the existing image
upload; templates are TikTok-specific with no listing capability yet. The build path is template-ready: the same
COPY_PATH rule relocates a future `{template:{id}}` staging untouched, so adding templates needs only a Step-2
picker + capability + staging, no body-build change.

## Pipeline (all data-driven, no channel literals in runtime)
```
Step-2 (FE): merchant uploads one image → GCS publicUrl → channelData.sizeChart (a plain URL string)
     │  ChannelFieldInput IMAGE case (fieldType "image"); orgId=useAuth(), productId=/products/[masterProductId]
     ▼
ChannelPublishService.stageSizeChart():  _sizeChart = { image: { uri: <gcsUrl> } }   (backend owns the body shape)
     ▼
post-processing rule tiktok-build-size-chart:  COPY_PATH  _sizeChart → body `size_chart`   (priority 36)
     ▼
attribute mapping: size_chart = object, non-support (ChannelAttributeMappingsMigration.buildTiktokshopAttributeMappings)
     ▼
workaction create_CP_Media_Pre (2nd instruction, appended to the LIST the sync loops → NO sync change):
     download size_chart.image.uri → POST /product/{v}/images/upload with use_case=SIZE_CHART_IMAGE
     → write the TikTok uri back into size_chart.image.uri
     ▼
create_CP: body carries size_chart:{image:{uri:<tiktok-uri>}}   → TikTok accepts
```

## Sync mechanics that make the upload instruction work (traced, read-only)
- **`from:"size_chart"` (single object) is fine** — `Create_CP_Media.extractJsonNodes` turns an object into 1 node.
- **Reshape is JOLT-capable** — `ReshapePaylodBuilder.processNodes` runs `aggregation.preTransform` (Chainr). Used
  to flatten `{image:{uri}}` → `{uri}` and inject `use_case`.
- **`output.fields` `X_key` reads source field `X`** (via `ServiceFunctions.addToResult` + nested `getNestedValue`)
  and writes it under the mapped name: `uri_key`→`data` (the uri), `use_case_key`→`use_case`.
- **Multipart sends every node field** (`HttpFunctions.buildMultipartEntity`): a Base64 value → file part, others →
  text parts. So `use_case=SIZE_CHART_IMAGE` rides along (mandatory — else the uri is invalid for `size_chart`).
- **Write-back needs the AGGREGATED mode** — `applyAggregatedResponseUpdate` (triggered by `[*]` in responsePaths)
  runs the `transformPaths` JOLT over the response list and stores **any shape** as the attribute value. The
  per-response mode (`processResponseUpdateTo`) only writes scalar strings, so it can't build the nested object.
  The 1-element response `[{data:{uri:U}}]` is shifted `{"*":{"data":{"uri":"image.uri"}}}` → `{image:{uri:U}}` →
  written to the bare `size_chart` attribute (chnlAttrType object → `create_CP` parses it back to an object).

## CREATE and UPDATE both wired
The sync resolves the UPDATE media_pre to `update_CP_Media_Pre` (a different key). TikTok's `update_CP` body is
built from **all** non-support attributes (empty body-reshape output), so it re-sends `main_images` **and**
`size_chart` on every edit — with raw GCS URLs unless a media pre-step uploads them. TikTok originally seeded only
`create_CP_Media_Pre`, so edits sent un-uploaded URLs (a latent bug for main images too). Now `update_CP_Media_Pre`
is seeded with the **same** workflow as create (both the main-images and size-chart instructions), mirroring
Shopee — so an edit re-uploads and carries valid TikTok uris. Idempotent (images replaced, not appended).

## Scope / limitations
- **Re-uploads every update** (no dirty-detection) — same wasteful-but-correct trade-off as create; a "only when
  the image changed" gate is a follow-up.
- **No "required per category" signal yet.** The field is a plain optional TikTok channel field (Optional section);
  it builds `size_chart` only when the merchant provides an image. The pre-flight WARN ("category requires a size
  chart but none provided") is **already handled data-drivenly** by `PublishPreflightGate.check` — it emits a
  `MISSING_REQUIRED_FIELD` blocker for any empty *visible required* field. So to enforce it, mark
  `sizeChart` **required** for the category in data (category requirements) — no code, no hardcoded
  category list (CLAUDE.md). It stays optional until such a signal exists.
- One image (the merchant uploads a single size-chart image).

## Verify (needs a real size-chart image + running sync)
1. Step-2 for a TikTok apparel product → the size chart field renders an image upload → upload one image → save →
   `channel_product_data.channelData.sizeChart` holds the GCS URL string.
2. Publish (CREATE) to apparel category 835720. Sync log: `create_CP_Media_Pre` uploads main images **then one
   more** for the size chart (`use_case=SIZE_CHART_IMAGE`); the `size_chart` attribute is rewritten to
   `{image:{uri:<tiktok-uri>}}`; `create_CP` returns success (no `12052673 size_chart_image required`).
3. A product without a size chart → the 2nd instruction is a no-op (0 uploads); publish unchanged (no regression).

## Related
guide 25 (main media pre-upload — the reused `create_CP_Media_Pre` pattern), guide 12 (202309 payload gaps —
size_chart trimmed as optional), guide 30 (Shopee size_chart/gtin warning — the pre-flight-warn pattern),
[[tiktok-publish-pipeline-complete]], [[chnlattrtype-inference-gotcha]], SizeChart/01 (the full plan).
