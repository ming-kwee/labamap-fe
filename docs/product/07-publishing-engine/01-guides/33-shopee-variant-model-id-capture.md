# 33 — Shopee variant model_id capture (UPDATE reconciliation)

**Status:** implemented (bff-v15, Option A — BFF-only). **Area:** Shopee variant CREATE→UPDATE.
**Symptom fixed:** a Shopee re-publish (UPDATE) failed at `add_model` with
`product.error_param: Model tier_index error : model in position [0 0]` — the UPDATE tried to ADD
models that already exist.

## Why it happened
Shopee's variant UPDATE uses DiffEngine Mode B: the sync splits variant groups by `skus.model_id`
presence — models WITH an id → `update_price`/`update_stock`; models WITHOUT → `add_model`. On UPDATE
the BFF injects each SKU's known model id (from `channel_product_data.variantChannelIds`) via
`VariantModelIdInjector`. If those ids were never captured, every model looks NEW → `add_model` at a
tier_index that is already occupied → Shopee rejects.

The model ids come back from CREATE's `init_tier_variation` response
(`response.model[] = [{tier_index, model_id, model_sku, …}]`). The whole capture chain was already
wired and correct **except one link**:

| # | Step | Where | Status before |
|---|---|---|---|
| 1 | Sync writes `model_id` → `skus.model_id` from the response | sync `applyWriteBack` | ❌ broken |
| 2 | Sync `captureVariantIds` reads `skus.model_id` → `ws.variantIds` (via `idtracking#variants`) | sync workflow | ✅ |
| 3 | Sync returns `ws.getVariantIds()` to the BFF | `PublishProductResponse.variantChannelIds` | ✅ |
| 4 | BFF persists → `channel_product_data.variantChannelIds` | `updateVariantChannelIds` | ✅ |
| 5 | BFF re-injects `skus.model_id` on UPDATE | `VariantModelIdInjector` | ✅ |

### The broken link (#1)
`create_CP_Variants` (and `update_CP_Variants_Add`) declared:

```json
"response-update-to":{"responsePaths":["[*].response.model"],
  "updatePaths":[{"get":"response.model.model_id","to":"skus.model_id","in":"variants",
                  "match":["response.model.model_sku=skus.model_sku"]}]}
```

The sync's `applyWriteBack` routes a `responsePaths` containing **`[*]`** to
`applyAggregatedResponseUpdate`, which only handles `in:"attribute"` and **silently skips
`in:"variants"`** (`if (… || !"attribute".equals(in)) continue;`). So the model_id write-back was a
no-op → `skus.model_id` stayed blank → nothing captured downstream.

The per-response path — `processResponseUpdateTo` → `updateResponseVariants` — DOES honour
`in:"variants"` + `match`, and already iterates a `response.model` **array** (matching each entry by
`model_sku`). It just wasn't being reached, because of the `[*]`.

## The fix (Option A — BFF-only)
Drop the `[*]` list marker from the two Shopee variant workflows in `ChannelMetadataMigration`
(`shopeeCreateVariantsWorkflow`, `shopeeAddVariantsWorkflow`):

```diff
- "responsePaths":["[*].response.model"]
+ "responsePaths":["response.model"]
```

`responsePaths` is used ONLY by `hasStarResponsePath` to choose aggregated-vs-per-response routing
(verified — no other consumer). Without `[*]`, the write-back runs per response via
`processResponseUpdateTo` → `updateResponseVariants`, which captures `model_id` from
`init_tier_variation`'s `model[]` array. No sync change.

**No regression:** the aggregated path was a no-op for `in:"variants"`, so nothing is lost — only the
capture is gained. `create_CP_Media_Pre` keeps `["[*].response.image_info"]` (a genuine aggregated
`in:"attribute"` case) untouched.

## Important: existing listings
This captures ids for FUTURE creates only. A product listed BEFORE this fix has no captured
`variantChannelIds`, so its UPDATE still hits `add_model`. To get a clean, updatable listing, delist
and re-CREATE it (its model ids are then captured). A no-recreate backfill would need a new
`get_model_list` read step (separate follow-up).

## Verify
1. Clean CREATE. Sync log: `[workflow] captured 2 variant id(s) via idtracking#variants`.
2. `db.channel_product_data.findOne(...).variantChannelIds` → `{SKU-XS-BLACK:<id>, SKU-S-BLACK:<id>}`.
3. UPDATE. BFF log: `DiffEngine BUCKETS: injected 2 variant model id(s)` → sync runs `update_price` /
   `update_stock` (not `add_model`) → `error:""`.

**Related:** guide 31 (Shopee UPDATE item_id — flagged this as the "known next gate"), guide 30
(success-check that surfaced it), [[sync-service-workaction-model]].
