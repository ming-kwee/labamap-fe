# 32 — Shopee delist: `workaction#delete_CP` seeder

**Status:** implemented (bff-v15). **Area:** Shopee delete/delist.
**Gap fixed:** Shopee had no `workaction#delete_CP`, so delist did nothing.

## Why the old metadata didn't work
Shopee's delete was seeded in the LEGACY format — a pair of `service#delete_CP` items
(`delete.endpoint` = URL, `body.content` = `{"product_id":"[<product.id>]"}`). But the sync's
`Delete_CP.deleteChannelProduct` reads **`instruction.setup:workaction#delete_CP`** (Constants) and
requires `body-reshape-to.from`; it never looks at `service#delete_CP`. So the delete step found no
metadata and delist was a no-op. (The old body was also wrong for Shopee — `product_id` array vs the
`{item_id}` delete_item expects.)

## The seeder (`ChannelMetadataMigration.buildShopeeMetadata`)
Replaced the two `service#delete_CP` items with one `workaction#delete_CP` (new method
`shopeeDeleteProductWorkflow`):

```json
{
  "endpoint": {
    "url": ".../api/{apiVersion}/product/delete_item", "method": "POST", "action": "ON_REST_DELETE",
    "params": {"partner_id":"partner_id","timestamp":"TIMESTAMP","access_token":"token","shop_id":"shop_id"},
    "signature": {"paramOrder":["partner_id","timestamp","access_token","shop_id"],
                  "formula":"${partner_id}${PATH}${timestamp}${access_token}${shop_id}",
                  "algorithm":"HmacSHA256","includeBody":true}
  },
  "body-reshape-to": {
    "from": "id",
    "output": {"fields": {"id_key": "item_id"}}
  }
}
```

### Building `{item_id}` — use `output.fields`, NOT `preTransform` (the subtle part)
Shopee `delete_item` needs a body `{"item_id": <uint64>}`. The delete body is built by `Delete_CP` from
`body-reshape-to`:
- `from:"id"` → `transformAttributeToJson_WithSpecificField` emits `{"id": 803854746}` **numeric**, because
  the Shopee `id` common field is typed `"number"` (guide 31). (A "string"-typed field would quote it →
  Shopee `cannot unmarshal string into ... item_id of type uint64`.)
- `output.fields:{"id_key":"item_id"}` renames `id → item_id`, preserving the numeric type
  (`ServiceFunctions.addToResult` emits `asInt()` / the node) → `{"item_id": 803854746}`.

**Why NOT `aggregation.preTransform` (the original bug):** the sync's `addToResult` builds the outgoing
body **strictly from `output.fields`**. With **no `output` block**, `output.fields` is empty → the body
comes out **`{}`** — even though a `preTransform` JOLT shift `{"id":"item_id"}` did produce
`{id, item_id}`, `addToResult` then discards every field not named in `output.fields`. Result:
`delete_item` received `{}` → `invalid DeleteItemRequest.ItemId: ItemId is required`. `output.fields` is
the mechanism `addToResult` actually honours (same as every create/update workaction), so use it.

## Scope
- BFF-only. The sync `Delete_CP` already reads `workaction#delete_CP` and supports `from` +
  `aggregation.preTransform` — no sync change.
- Re-seed: `workaction#delete_CP` is a NEW key → `applyChannelMetadata` adds it on restart (system-default
  configs are overwritten; user-customised get the new key merged). The stale `service#delete_CP` keys, if
  present, linger harmlessly (no loop reads them).
- Delist is triggered by a DELETE publish (operation=DELETE / `deleted=true`); the sync then runs
  `runDeleteFlow` → `deleteChannelProduct` → this workaction.

## Verify
Restart BFF, trigger a delist for a Shopee product. Sync log:
```
[HTTP] POST .../product/delete_item   (body {"item_id":803822202,...})
response {"error":"", ...}   → success-check passes (guide 30)
```

**Related:** guide 31 (numeric id / inject), guide 30 (Shopee success-check),
[[sync-service-workaction-model]].
