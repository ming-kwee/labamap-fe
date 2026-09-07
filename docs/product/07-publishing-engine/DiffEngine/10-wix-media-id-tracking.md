# WIX media id-tracking (safe in-place media UPDATE) — design + IMPLEMENTED (v1)

> **Status: IMPLEMENTED (v1, 2026-08-23) — pending E2E on a live WIX store.** Model A (replace-on-change) is
> wired across both repos (see §8). All API facts confirmed (§5, §5b, §5c). The historical design/analysis
> below is retained; §8 is what shipped.

## 1. Goal

Make Shopify-style surgical media UPDATE work for WIX so "Perbarui" can add/remove product images in place
without duplicating them. Mirrors the Shopify **M1 (id round-trip) → M2 (add-only) → M3 (delete-removed)**
flow, mapped onto WIX's separate-endpoint media model.

## 2. Why WIX can't reuse the Shopify path as-is

| Aspect | Shopify | WIX |
|---|---|---|
| Media in payload | `product.images = [{src}]` | `product.media = [{url, altText, mediaType}]` (rule `enrich-media-for-wix`) |
| Add endpoint | `POST /products/{id}/images.json` | `POST /stores/{v}/products/{id}/media` |
| Delete endpoint | `DELETE /products/{id}/images/{image_id}.json` | **§5 unknown** (likely `POST …/media/delete {mediaIds}`) |
| id round-trip | `idtracking#images {srcKey:image.src, id:image.id}` | **§5 unknown** — POST-media response media-id path |
| src stability | Shopify rewrites `…_<uuid>.jpg?v=…` → stem cut at first `_` | WIX url is our GCS url (stable) → key by full stem, no `_`-cut needed |

The BFF add-only filter (`filterProductImagesForUpdate`) is **Shopify-shaped**: it hardcodes `product.images`
with `{src}`. **Do NOT add a per-channel twin** (`filterWixMediaForUpdate` etc.) — that repeats the
hardcoded-channel-knowledge anti-pattern (CLAUDE.md "No hardcoded domain knowledge in runtime code"). The fix
is to make ONE **data-driven** filter whose media-container path + item-url key come from channel config
(see §4.1), so it serves Shopify, WIX, and future channels without new code.

## 3. What's already generic (reuse verbatim)

- **Capture** — `ChannelProductActivitiesImpl.captureMediaIds` reads the `idtracking#images` spec
  `{srcKey, id}` from the response generically; it works for ANY channel whose media response exposes a
  url + id at declared JSON paths. **WIX just needs the right two paths (§5).**
- **Baseline persistence** — `imageChannelIds` on `channel_product_data`, stamped by publish
  (`persistChannelIds`) and import (`ReverseImportService`). Channel-agnostic.
- **Diff safety** — `filterProductImagesForUpdate` empty-baseline branch **clears to 0** (never pass-all), so
  a missing/failed capture can never duplicate. The WIX filter (§4) MUST copy this safe-by-default rule.
- **Delete plumbing** — `Delete_CP_Media` fans `product.delete_image_ids` over the `delete_CP_Media` endpoint
  from metadata; endpoint/verb/body are data. **WIX just needs the right endpoint (§5).**

## 4. What to build — DATA-DRIVEN, not per-channel

1. **Generic add-only media filter (config-driven).** Refactor the Shopify-hardcoded
   `filterProductImagesForUpdate` into ONE filter that reads the media shape from channel config, e.g. an
   `imageSpec` on `ChannelConfiguration` (or reuse `ChannelImageSpecMigration`): `{ mediaContainerPath:
   "product.images"|"product.media", urlKey: "src"|"url" }`. The filter then keeps only NEW items (url/src
   stem ∉ baseline), safe-by-default (empty baseline → clear, never re-post) — identical logic for every
   channel, ZERO channel literals in the method. WIX becomes a config row (`product.media`,`url`), not a
   Java method. (A previous attempt added a `filterWixMediaForUpdate` method — reverted; it re-introduced the
   hardcoded-channel anti-pattern.)
2. **BFF `computeDeleteImageIds`** already generic — reads `masterProductData.images` (desired) vs baseline;
   emits `product.delete_image_ids` = known ids no longer desired. Works for WIX once the baseline holds WIX
   media ids. No change needed beyond confirming WIX keys product images (not `sku::stem`) — they do.
3. **Seed (BFF `ChannelMetadataMigration.buildWixMetadata`)** — three DATA items:
   - `idtracking#images` = `{"srcKey":"<§5-a>","id":"<§5-a>"}`
   - `workaction#update_CP_Media` = add-only POST /media (reuse `wixCreateVariantMediaWorkflow` shape, but
     product-media not variant-choice; may need a plain `wixCreateProductMediaWorkflow`)
   - `workaction#delete_CP_Media` = `<§5-b>` endpoint + body `{mediaIds}` reshape from `product.delete_image_ids`
4. **Baseline seeding at import** — WIX import currently parses **no** media (no `imageInverse` in
   `wixReverse`). An imported WIX listing therefore has an empty media baseline → the safe filter clears media
   on first UPDATE (no dup, but no sync) until a create/publish round-trips ids. Optional later: add a WIX
   `imageInverse` so imports seed the media baseline (needs §5-a read shape too).

## 5. FINDING (2026-08-23) — the Shopify model does NOT port to WIX

Real WIX calls (from the operator) invalidate the M1 capture-from-response plan:

- **`POST /stores/v1/products/{id}/media` → response body `{}` (EMPTY).** Unlike Shopify's `/images.json`
  (which returns `image.id`+`image.src`), WIX returns **no ids** — so `idtracking#images` (capture stem→id
  from the add response) is **impossible** for WIX. The generic capture cannot run.
- **WIX ingests the url** (item is `{url}` or a pre-existing `{mediaId}`); after ingestion the media is
  WIX-hosted with its own `mediaId` (e.g. `11062b_382eeb…`), NOT our GCS url — so the source-stem ↔ channel-id
  correlation Shopify gives for free is **broken**.
- **Delete = `POST /stores/v1/products/{id}/media/delete` body `{"mediaIds":[...]}` → `{}`** (confirmed) —
  needs WIX mediaIds, which we cannot learn from the add response.

**Consequence:** M1/M2/M3 (capture id from response, diff by source stem, add-only + delete-by-id) does NOT
map to WIX. The add-only filter is useless without a `stem→id` baseline that WIX won't give from the POST.

### Viable WIX models (pick one — each needs one more fact)

| Model | Mechanism | Extra fact needed | Trade-off |
|---|---|---|---|
| **0. POST dedups?** | If WIX `POST /media` skips/replaces a url already present, just POST the desired set on update | confirm WIX dedup behaviour (one test) | trivial + safe if true |
| **A. Replace-on-update** | On UPDATE: GET current media ids → DELETE all → POST all desired | `GET /stores/v1/products/{id}` media-collection JSON shape (path to current `mediaId`s) | robust, no dup, no baseline; re-uploads all each update, churns ids |
| **B. Media-Manager id-tracking** | Upload each image to WIX Media Manager first → stable `mediaId` → POST `{mediaId}` → persist `stem→mediaId` → surgical add/delete | WIX Media Manager import endpoint (returns mediaId) | true surgical (Shopify-parity); a 3rd endpoint + new upload flow |
| **C. Status quo** | keep delist & re-publish for WIX media | — | loses old listing id/reviews on media change |

**Recommendation:** verify Model 0 first (cheapest). If POST does not dedup, do **Model A** (needs the GET
media shape) — strictly better than delist+republish (keeps listing id/reviews, only media churns). Reserve
Model B for when true surgical WIX media is required. Whatever is chosen, the add/delete steps must obey the
§6 safety contract (never re-post the full set without first removing what's there, or duplication results).

### 5b. Confirmed WIX media endpoint set (operator, 2026-08-23) → Model A chosen

The COMPLETE WIX media API is four write endpoints — **no read/GET-media endpoint, no Media-Manager import**:

| Action | Product-level | Choice-level (variant) |
|---|---|---|
| Add | `POST /stores/v1/products/{id}/media` | `PATCH /stores/v1/products/{id}/choices/media` |
| Remove | `POST /stores/v1/products/{id}/media/delete` `{mediaIds}` | `POST /stores/v1/products/{id}/choices/media/delete` |

Implications that force **Model A (replace-on-change)**:
- A separate delete endpoint ⇒ `POST /media` **appends** (not replace) ⇒ re-post duplicates ⇒ must delete first.
- Delete needs `mediaIds` ⇒ must know current media ⇒ must **GET `/products/{id}`** (the only way to read media;
  reverse-import already fetches it). Model B (surgical) is out — no Media-Manager import endpoint exists.

**Model A flow (per UPDATE, only when the SOURCE image set changed vs our own `imageContentHashes` baseline —
NOT WIX ids):** GET `/products/{id}` → current `mediaId`s → `POST /media/delete {mediaIds}` → `POST /media
{desired urls}` (+ choice-media analogues for variant images). No WIX-id tracking, no duplication, gated so an
unchanged update makes zero media calls. Strictly better than delist+republish (listing id/reviews kept).

**LAST blocking fact:** the `GET /stores/v1/products/{id}` response `media` JSON shape — the path to the list
of current media items + each item's `id` (the `mediaId` for `/media/delete`). Expected Catalog-V1 shape
`product.media.mainMedia.id` + `product.media.items[].id`, but must be confirmed by one real GET (WebFetch
could not reach the WIX docs). Do NOT guess it — a wrong delete-id path either no-ops or deletes nothing.

**Implementation note (when unblocked):** data-driven only — WIX media endpoints + the GET media-list path
live in channel config/metadata, consumed by ONE generic replace-on-change media path that also subsumes the
Shopify-hardcoded `filterProductImagesForUpdate`. No per-channel Java methods (see the earlier reverted
`filterWixMediaForUpdate` mistake). Gate safe: no baseline / failed GET → skip media step (never dup).

### 5c. GET shape CONFIRMED (operator sample, 2026-08-23) + the one sync gap

Confirmed `GET /stores/v1/products/{id}` → `product.media`:
```
product.media.mainMedia.{ id, image.url }
product.media.items[].{ id, image.url }       // id = mediaId (e.g. "nsplsh_…~mv2_…jpg") → for /media/delete
                                              // image.url = WIX-hosted (static.wixstatic.com), NOT our GCS url
```
So the stored url is WIX-hosted after ingestion ⇒ our-source ↔ WIX-id correlation is impossible (surgical
out, confirmed) — but `items[].id` is exactly the `mediaId` `/media/delete` needs. **Model A locked.**

**Capture is feasible with EXISTING generic sync code:** `read_CP`'s `response-update-to` +
`getNestedValue` traverses a list mid-path, so a plain dotted `get:"product.media.items.id"` collects ALL
item ids into a JSON array → write to attribute `product.delete_image_ids`. No `[*]`/Jolt needed. (WIX seeds
no `restore_CP`, so repurposing `read_CP` for capture doesn't disturb rollback.)

**The one gap — bulk delete.** `Delete_CP_Media` (sync) only does Shopify's **per-id URL fan-out**
(`DELETE …/images/${image_id}`, one call per id). WIX needs **one** `POST …/media/delete` with
`{"mediaIds":[all ids]}`. Fix = a small **channel-agnostic** extension: when the delete metadata declares a
body ids-field (e.g. `body-reshape-to.output.idsField:"mediaIds"`), collect all ids into ONE request body
and POST once; else keep per-id URL fan-out. Data-driven, no channel literals.

### Full build plan (all shapes known — mechanical)

**Sync (1 generic change):** extend `Delete_CP_Media` to bulk-array mode as above (Shopify path unchanged).

**BFF (data-driven seeds in `buildWixMetadata`):**
- `workaction#read_CP` = `GET /products/{id}`, `response-update-to`: `get:"product.media.items.id"` →
  `to:"product.delete_image_ids"`, `in:"attribute"`. (Runs at UPDATE start → captures current media ids.)
- `workaction#delete_CP_Media` = `POST /products/{id}/media/delete`, bulk body `{mediaIds}` (idsField) from
  `product.delete_image_ids`.
- `workaction#update_CP_Media` = `POST /products/{id}/media` add desired product media (from the
  `enrich-media-for-wix` `product.media`); + choice-media analogues via `PATCH /choices/media` for variant
  images if needed.

**Sequence on WIX UPDATE:** read_CP (capture current ids) → PATCH product → … → delete_CP_Media (delete
captured ids) → update_CP_Media (add desired). CREATE unchanged (nothing to delete).

**Known v1 limitation — churn/no gating.** With the steps always present, a WIX UPDATE replaces media every
time (even a price-only edit re-ingests all images, churning WIX media ids). Correct (no dup) but wasteful.
Gating on "image set actually changed" needs a guard the current step infra lacks (the graphql-op `guard`
pattern, or BFF-side conditional metadata) — do as a follow-up; do NOT hardcode WIX keys in runtime to gate.

**E2E (required before trusting):** create → GET returns items → edit an image → update: read captures ids →
old media deleted → desired added → GET shows exactly desired (no dup); price-only edit → (v1) media churns
but stays correct.

## 6. Safety contract (must hold when enabled)

- Empty/failed baseline ⇒ WIX filter **clears** media on UPDATE (send none). NEVER re-post the full set.
- `delete_CP_Media` only ever deletes ids present in the persisted `imageChannelIds` baseline (known-safe),
  never ids derived from the desired set.
- Enable only after an E2E run on a real WIX store confirms: create → ids captured into `imageChannelIds`;
  add one image → only it is POSTed; remove one → only it is DELETEd; unchanged → NOOP (no media calls).

## 7. Sync-service impact

The workflow already has the media add (`create/update_CP_Media`) + delete (`delete_CP_Media`) steps and the
generic capture. If §5-a/§5-b hold, **no sync code change** — only BFF metadata (data). If WIX's media
response needs a non-`{srcKey,id}` traversal (e.g. nested under `mainMedia`+`items`), a small generic
extension to `captureMediaIds` (support a list-root path) may be needed — additive, channel-agnostic.

---

## 8. IMPLEMENTED (v1) — what shipped

**Model A (replace-on-change), gated, data-driven. Cross-repo. Pending E2E.**

**Sync-service (`notifikasi temporal`, generic/channel-agnostic):**
- **Generic workaction guard** (`ChannelProductActivitiesImpl.guardBlocks`): any workaction whose metadata
  declares a top-level `"guard": "${attr}"` runs only when that attribute resolves non-empty; else SKIP.
  Wired into `executeViaService` / `executeListViaService` / `executeArrayLoopViaService`.
- **Bulk-delete mode** (`Delete_CP_Media`): when `body-reshape-to.output.idsField` is set, send ONE request
  with `{<idsField>: [ids]}` (WIX `{mediaIds:[…]}`) instead of the per-id URL fan-out (Shopify path unchanged).

**BFF (`ChannelMetadataMigration.buildWixMetadata`, data — seeds only):**
- `workaction#read_CP` = GET `/products/{id}`, `response-update-to` `product.media.items.id →
  product.delete_image_ids` (capture current media ids), guard `${product.media_sync}`.
- `workaction#update_CP_Variants_Media` = the create-media workflow via `withGuard(…, ${product.media_sync})`
  (re-add all desired media).
- `workaction#delete_CP_Media` = `POST /media/delete`, `output.idsField:"mediaIds"` from
  `product.delete_image_ids`, guard `${product.media_sync}`.

**BFF gating:** `ChannelPublishService.productImagesChanged(request, state)` (UPDATE branch) sets
`request.mediaSyncNeeded` when the desired product-image URL set differs from the baseline
(`imageContentHashes` product-scope keys); no baseline ⇒ true (establish). `ChannelAttributeConverterService`
stages `product.media_sync="1"` when set. Unit tests: `MediaSyncGateTest`.

**Order insight (why it's correct):** the sync runs media-ADD (step 4/5) BEFORE media-DELETE (step 6).
`read_CP` captures the OLD ids at UPDATE start; add re-ingests all desired (channel transiently has old+new);
delete removes the OLD captured ids → end state = desired only. No net duplication. (Transient dup exists
between add and delete; a mid-sequence failure is forward-only — a later republish reconciles.)

**Known v1 limits (documented, not bugs):** (1) an image change re-ingests ALL images (WIX has no per-image
add-only) and churns mediaIds — but only when images changed (gated). (2) Variant/choice media replace is
covered by reusing the same create-media workflow, but the capture/delete keys off product-level media ids;
fine for typical stores, revisit if choice-media diverges. (3) `read_CP` is repurposed for WIX capture (WIX
seeds no `restore_CP`, so snapshot-rollback is unaffected).

**E2E before trusting (required):** create WIX product → GET shows media items → change an image → update:
read captures old ids → all desired re-added → old ids bulk-deleted → GET shows exactly desired (no dup);
price-only edit → `product.media_sync` absent → zero media calls.
