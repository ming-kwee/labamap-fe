# 31 — Shopee UPDATE: item_id in the body (inject + numeric type)

**Status:** implemented (bff-v15 + sync temp-v2). **Area:** Shopee UPDATE (`update_item`).
**Symptoms fixed (in order):**
1. `product.error_param: invalid UpdateItemRequest.ItemId: ItemId is required`
2. `product.error_param: json: cannot unmarshal string into ... item_id of type uint64`

Both surfaced only because the new Shopee `servflow#response#success-check` (guide 30) now correctly
fails a 200-with-error — previously they were silent false-positive "successes".

## Context
A re-publish of an already-listed Shopee product routes to UPDATE (`update_item`). Shopee's
`update_item` needs `item_id` **in the request body** (unlike TikTok, whose id is in the URL path).
The BFF injects the existing listing id into the `id` attribute (support field), and `update_CP`
declares `body-reshape-to.inject: {"item_id":"id"}`.

## Two gaps, two fixes

### Fix 1 (sync repo `Create_CP`) — honor `body-reshape-to.inject`
`Create_CP` (reused for UPDATE) only processed `output.wrapperKey/wrapperType`; it ignored `inject`,
so `item_id` was never added → "ItemId is required". Now, after building the body, for each
`{bodyField: attrName}` it sets the body root field from the matching product attribute (string→text,
else parsed JSON). Mirrors `Create_CP_Variants`' existing inject. Fixes UPDATE for any channel that
injects a body-level id.

### Fix 2 (BFF) — the `id` attribute must be numeric for Shopee
With inject working, `item_id` went in as a **string** ("803822202") because the Shopee `id` common
field was typed `"string"` → Shopee rejects (item_id is `uint64`). Fix: type Shopee's `id` common field
`"number"`. The sync inject's non-string branch then `readTree`s the value into a JSON number.
TikTok keeps `id="string"` (its product_id is a string token) → unaffected. This is data-driven: the
value's JSON kind follows the attribute's declared type; no numeric-coercion guesswork.

The same numeric `id` also fixes the Shopee **variant** steps (`init_tier_variation` / `add_model` inject
`item_id` from `id` via `Create_CP_Variants`) — they need a numeric item_id too.

### Re-seed note
`ChannelAttributeMappingsMigration` merges commonFields **add-missing** (never full-replace), so a
changed seed type would NOT reach an already-seeded DB. The merge now also **reconciles the field type**
from the seed for matching attrIds (structural, not admin data), so Shopee `id` string→number propagates
on restart. Other properties + admin-added common fields are preserved.

## Verify
Rebuild+restart **both** services (sync for Fix 1, BFF for Fix 2), then re-publish. The `update_item`
body carries `"item_id": 803822202` (a number). Expected next: `update_item` returns `error:""` →
success-check passes → the UPDATE proceeds to the variant steps.

## Known next gate (UPDATE variant reconciliation)
The variants carry `skus.model_id = ""` (the earlier create was add_item-only and never captured model
ids — likely because its variant steps silently failed before the success-check existed). The UPDATE
variant flow (DiffEngine Mode B, split by `skus.model_id`) will treat them as new → `add_model`. That is
a separate concern; for a clean end-to-end test prefer a NEW product not yet bound to a Shopee item.

**Related:** guide 30 (success-check that surfaced these), [[sync-service-workaction-model]],
the TikTok signing helpers (guide 24).
