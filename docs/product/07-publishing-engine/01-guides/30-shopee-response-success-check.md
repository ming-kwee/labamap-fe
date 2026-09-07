# 30 — Shopee publish response handling: success-check + external-id capture

**Status:** implemented (bff-v15). **Area:** publish → sync response classification.

## Context (a real sync log)

Shopee `add_item` returned **HTTP 200** with:
```
error: ""      message: ""      warning: "The size chart / gtin is a mandatory field for some category..."
response: { item_id: 803822202, ... }
```
This is a **success** (item created) with a soft **warning** — not an error.

## Two questions answered

### 1. Was it "not caught" because there is no `servflow#response#success-check`? — the direction is inverted

The sync's `checkResponseSuccess` **returns (no check) when the success-check metadata is absent** → any
HTTP 2xx is treated as success. So:
- This response (200, `error:""`) → correctly success. It WAS caught.
- The risk of the MISSING check is the **opposite**: a Shopee business failure (200 + `error:"..."`)
  would be silently reported as a **successful** publish (false positive) — because Shopee (like
  TikTok) returns 200 even on failure, distinguishing via `error`.

So the missing check does not drop a real success; it lets a real **failure** pass as success.

**Fix (added):** `servflow#response#success-check = {"path":"error","equals":""}` in
`buildShopeeMetadata`. `error==""` → success; non-empty → the activity fails. Applies uniformly to every
Shopee v2 step (add_item / init_tier_variation / add_model — all use the `error` convention). A soft
`warning` is ignored (only `error` gates success), so a created-with-warning item still succeeds.

### 2. Is the created item's id captured? — yes, data-driven

The sync's `captureExternalId` reads the create_CP `response-update-to` target attribute
(`createResponseTargetAttribute` → for Shopee that is **`id`**, from
`updatePaths:[{get:"response.item_id", to:"id"}]`) and surfaces that attribute's value as
`externalChannelProductId`. The BFF reads it from the polled workflow status
(`ws.getExternalChannelProductId()`). So for this log the external id `803822202` is captured — no
per-channel code (TikTok uses `product_id`, Shopee `id`; both resolved from the create_CP metadata).

## If the BFF still shows a failure for a Shopee publish

It is NOT the success-check (a genuine success is caught). Check the FULL sync log for the later variant
steps — a variant product runs `add_item → init_tier_variation → add_model`. Two possibilities:
- A variant step returned 200 + `error` → **before this fix** it was masked as success; **now** the
  success-check fails the step (visible). 
- A variant step threw a real HTTP error → the workflow FAILS even though `add_item` created the item
  (compensation territory). That is a separate concern from response classification.

## Note: size_chart / gtin warning
Shopee's warning mirrors TikTok's size_chart requirement — those fields will become mandatory for some
categories. Deferred (same class as the TikTok size_chart feature, guide 25 §3 / the Shopify follow-up
guide 28). The item still publishes today.

**Related:** the TikTok success-check (`{"path":"code","equals":"0"}`, guide 24 §4), guide 27
(category attributes), [[sync-service-workaction-model]].
