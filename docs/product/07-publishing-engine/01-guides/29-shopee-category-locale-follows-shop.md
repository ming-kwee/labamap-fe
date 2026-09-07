# 29 — Shopee category/attribute display language follows the shop locale

**Status:** implemented (bff-v15). **Area:** Step 2 category + attribute fetch (`GenericCategoryService`).
**Change:** Shopee category tree + attribute display names were fetched in a fixed `language=en`; now
they follow the shop's region (e.g. an Indonesian shop → `language=id`), so Step 2 shows the same
language buyers see on Shopee.

## Why this is only cosmetic (and why matching never depended on it)

Publish matches by **`value_id`**, not by the display label. For an enumerated attribute the Step-2
option's `value` IS the `value_id` (`GenericCategoryService` sets `option.value = valueIdField`;
Shopee `valueIdField="value_id"`), and `BUILD_ATTRIBUTE_LIST` sends
`attribute_value_list:[{value_id:<int>}]`. Shopee then renders that id in the shop's own language. So
"English in Step 2 vs Indonesian on Shopee" was always a display mismatch only — the id matched
regardless. (Free-text attributes carry the typed text as `original_value_name`; there the language is
whatever the merchant typed — unchanged by this.)

The one genuinely language-sensitive spot is variant-axis detection by NAME
(`variantOptionAttributeNames`), already defended by listing both English and Indonesian
(`[S]Color`/`[S]Warna`, `[S]Size`/`[S]Ukuran`, `[S]Pattern`/`[S]Motif`).

## How it works (lightest approach — no builder signature changes)

The `language` param is applied to BOTH the tree and attribute requests via `treeApiConfig`
(the attribute request reuses `tc.getFixedQueryParams()` + `tc.getCredentialQueryParams()`), so there
is ONE control point. Rather than thread `region` through every request builder, the locale is resolved
once at the `getStore` boundary and carried via the **existing, signing-aware `credentialQueryParams`
plumbing**:

1. **Config (`CategoryTreeApiConfig`)** — two additive fields:
   - `localeByRegion: Map<region → language>` (Shopee: `ID→id, SG→en, MY→en, TH→th, VN→vi, PH→en,
     BR→pt-br, TW→zh-Hant`).
   - `defaultLocale` (Shopee: `en`) — fallback when the store has no region or an unmapped region.
2. **Shopee config** — moved `language` OUT of `fixedQueryParams` (was `en`) and added a
   `credentialQueryParams` entry `language → _categoryLocale`.
3. **`GenericCategoryService.withCategoryLocale(creds, config, region)`** — resolves the locale from
   `localeByRegion[region]` (fallback `defaultLocale`) and puts it under the reserved cred key
   `_categoryLocale`. Called at each `getStore` site (children/attribute/single-call) with
   `store.getRegion()`, and at the platform-seeding path with `null` (→ `defaultLocale`). Returns the
   input **unchanged** when `localeByRegion` is empty → every non-opted-in channel is byte-identical.

`_categoryLocale` survives the signer's `prepareCreds` (`injectPlatformSigningId` preserves all cred
keys), so `credentialQueryParams` picks it up and appends `language=<locale>`. It is NOT part of
Shopee's fixed-template HMAC sign (`partner_id + path + timestamp + access_token + shop_id`), so signing
is unaffected.

## Prerequisite & fallback

The effect requires the store's `region` to be set to a code in `localeByRegion` (e.g. `"ID"`). When a
Shopee store has no region (or an unmapped one), `defaultLocale="en"` applies — i.e. **prior behaviour,
no regression**. Non-Shopee channels set no `localeByRegion` → unchanged.

## Not touched
- No builder signature changes; no per-channel branch in runtime code (region→language is DATA in
  config, resolved at runtime — CLAUDE.md compliant).
- Matching / publish body unchanged (value_id).
- Only Shopee opted in; other channels can opt in later by seeding `localeByRegion` + a
  `credentialQueryParams` language entry.

**Related:** guide 27 (category attributes → body; value_id analysis), the Shopee `attributeConfig`
(`valueIdField="value_id"`), [[variant-scope-both]].
