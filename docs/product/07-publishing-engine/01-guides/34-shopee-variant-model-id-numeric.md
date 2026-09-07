# 34 — Shopee variant model_id must be numeric uint64 (UPDATE price/stock)

**Status:** implemented (bff-v15 + sync temp-v2). **Area:** Shopee variant UPDATE.
**Symptom fixed:** after Fix B (guide 33) captured model ids, the UPDATE correctly routed to
`update_price` (not `add_model`) but failed with
`product.error_param: json: cannot unmarshal string into Go struct field PriceInfo.price_list.model_id of type uint64`.

## Root cause
Shopee's `update_price` / `update_stock` / `delete_model` bodies expect `model_id` as **uint64** (a JSON
number). The BFF declared the `skus.model_id` variant field `chnlVrntType: "string"`, so the sync emitted
it as a quoted string → Shopee rejected it.

Two coupled facts made a one-line type flip insufficient:
- **item_id works, model_id didn't** — for the same reason as guide 31 in reverse: `item_id` reaches the
  body via `body-reshape-to.inject`, which uses `objectMapper.readTree(value)` (handles a Long). `model_id`
  reaches the body via `output.fields` → `Utils.typeConverter`, a different path.
- **model_id exceeds int32** — e.g. `10007957611` (~10 billion) > `Integer.MAX_VALUE` (2,147,483,647).
  `typeConverter`'s `"int"/"number"` branch used `Integer.parseInt`, which **overflows → NumberFormatException
  → returns 0**. So merely declaring the field `"number"` would have sent `model_id: 0`.

## The fix (BFF + sync, coupled)
1. **BFF** (`ChannelAttributeMappingsMigration`): `skus@model_id` `chnlVrntType` `"string"` → `"number"`.
   - Safe for CREATE: `model_id` is an empty support field there, skipped before `typeConverter`
     (`if (!variant.getIsSupportField())`), so no `parseInt("")`.
   - Safe for DiffEngine bucketing: `keepVariantGroupsByModelId` reads the **raw** variant string value,
     not the type-converted one — presence/`$ne` checks are unaffected.
   - Only affects UPDATE body emission (`update_price`/`update_stock`/`delete_model`), which is exactly
     where a numeric id is required.
2. **sync** (`Utils.typeConverter`): the `"int"/"number"` branch now parses **`Long`** (fractional → `Double`)
   instead of `Integer`:
   ```java
   String v = value.trim();
   return v.contains(".") ? Double.parseDouble(v) : Long.parseLong(v);
   ```
   This brings the `output.fields` path to parity with `inject`'s `readTree` (both handle uint64), and
   future-proofs large prices. Channel-agnostic: `Long`/`Double` serialise to the same JSON number as
   `Integer` for in-range values, so every channel's existing `"int"/"number"` fields are unchanged; only
   previously-overflowing values (which returned 0) are now correct.

Both changes are required together: BFF-only overflows to 0; sync-only still ships a quoted string.

## Verify
Re-publish (UPDATE) a Shopee product that already has captured `variantChannelIds` (guide 33). The
`update_price` body carries `price_list:[{model_id: 10007957611, original_price: …}]` (a number) →
`error:""`. Same for `update_stock`.

## Related
guide 33 (model_id capture that made this reachable), guide 31 (the item_id numeric analogue),
[[sync-service-workaction-model]].
