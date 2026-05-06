# Channel Category Mapping — Frontend Implementation

## Status: Complete

All components are built and wired to the real API. The taxonomy browser child-level
query issue is resolved (see Backend Fix Summary below).

---

## Files

| File | Purpose |
|------|---------|
| `_types/channel-mapping.ts` | All TypeScript types |
| `_services/channel-mapping.service.ts` | API calls |
| `_components/ChannelCategoryMappingPage.tsx` | Main matrix page |
| `_components/TaxonomyMapperModal.tsx` | Batch mapper for Type 2 channels |
| `_components/ImportWizardModal.tsx` | Import wizard for WooCommerce / Etsy |
| `_components/DriftResolutionModal.tsx` | Drift resolution for Type 1 channels |

All under `src/app/omni-admin/channel-category-mapping/`.

---

## User Flow: Mapping a Category to Shopify

1. Merchant clicks the **Map** button in the Fashion & Apparel × Shopify cell.
2. `handleOpenMap()` checks `store.taxonomyEnabled`. Shopify has `taxonomyEnabled = true`
   → opens `TaxonomyMapperModal`.
3. **Batch design**: the modal receives *all* unmapped categories for the store, not just
   the one that was clicked. `initialCategoryId` is passed so the modal scrolls to and
   highlights Fashion & Apparel. The subtitle reads "N unmapped categories · scrolled to
   your selection" to make this clear.
4. On open, the modal calls `previewSecondChannel(storeId, orgId)` — the backend returns
   fuzzy-match suggestions (channel taxonomy nodes matched against platform categories).
   Rows with confidence ≥ 80 are pre-accepted (green). Rows below 80 show an amber pending
   badge the merchant must accept. Rows with no suggestion show "Browse to select".
5. Merchant clicks **Browse to select** for Fashion & Apparel → opens the browse panel.
6. Browse panel calls `browseTaxonomy(shopify, storeId, orgId)` (no `parentId`) → backend
   returns Shopify taxonomy root nodes (e.g., "Apparel & Accessories").
7. Merchant clicks a non-leaf node → `browseSelectNode(node)` → `browseTaxonomy(..., parentId: node.id)`.
8. On a leaf node click → selection is applied to the row and browse panel closes.
9. After all rows are resolved, merchant clicks **Confirm N mappings** → `mapSecondChannel`
   → `POST /second-channel` → status transitions `UNMAPPED → MAPPED`.

---

## Taxonomy Capability: No Hardcoded Channel List

There is no `TAXONOMY_CHANNELS` constant in the frontend. The routing decision is:

```typescript
if (store.taxonomyEnabled === true)  → TaxonomyMapperModal
if (store.importCapable === true)    → ImportWizardModal
```

Both flags come from the backend per-store response (`ChannelStoreConnectionResponse`).
`taxonomyEnabled` is derived from `ChannelConfiguration.taxonomyConfig.enabled` in MongoDB.
If a new taxonomy channel is activated by a backend data change, the frontend picks it
up automatically — no code change needed.

---

## `browseTaxonomy` Error Handling

The service throws on HTTP 404 — it does not return an empty array:

```typescript
// channel-mapping.service.ts
if (res.status === 404) {
  throw new Error(
    `Taxonomy browser not available for "${channelType}" — the backend taxonomy ` +
    `endpoint returned 404. Check that the channel_category_cache is seeded and ` +
    `the taxonomy children endpoint is deployed.`
  );
}
```

The browse panel in `TaxonomyMapperModal` shows this error message directly. The empty
state ("No sub-categories at this level") is only shown when the API genuinely returns
an empty array — a real leaf/empty level. The two states are visually distinct:

- **Error state**: red text with the full error message — always indicates a backend problem
- **Empty state**: grey text with context-aware hint (root-level vs. sub-level)

---

## Backend Fix Summary

### Taxonomy children returned empty for `parentId` queries — Resolved

**Root cause (diagnosed via logs):** Shopify's `taxonomy.categories` connection returns
only the 26 root-level nodes with `hasNextPage: false`. Child nodes (e.g., `aa-1` through
`aa-8` under "Apparel & Accessories") were in the parent's `childrenIds` but never stored
in `channel_taxonomy_cache` — so every child lookup returned empty.

**Fixes applied:**

1. **BFS traversal** — after the initial flat-list fetch, `ChannelTaxonomyService`
   now BFS-traverses the tree: collects all `childrenIds` not yet cached and batch-fetches
   them via Shopify's `nodes(ids: $ids)` query (`... on TaxonomyCategory` fragment,
   250 IDs/batch) until no missing IDs remain. The full tree (~10,000 nodes) is upserted.

2. **Child lookup by `nodeId` field** — previously used
   `findByChannelTypeAndAncestorIdsContainingAndLevel`. Replaced with
   `findByChannelTypeAndNodeId(channelType, parentId)` to find the parent, then
   `findByChannelTypeAndNodeIdIn(channelType, parent.getChildrenIds())` for children.
   Direct `nodeId` field lookup avoids format dependency on the `_id` prefix.

3. **Cache completeness threshold** — `ensureCache` now checks count against
   `config.minCacheSize` (default 500). If count < threshold, partial cache is deleted
   and a full re-fetch (including BFS) is triggered. Prevents the old "26 nodes = warm"
   false-positive.

4. **Reactive auth header** — `resolveAuthHeader` was blocking (`.blockOptional()`),
   now fully reactive via `resolveAuthHeaderAsync()` + `Mono.zip()`.

5. **Cursor bug** — first-page cursor was sent as `""` (empty string) instead of JSON
   `null`; fixed by using a `HashMap` with explicit `null` value.

---

## `TaxonomyMapperModal` Phase State Machine

```
"loading"     Initial state. previewSecondChannel call in progress.
"review"      Suggestions loaded. Shows full category list with accept/browse controls.
"browse"      Taxonomy tree browser open. Shows breadcrumb + level nodes.
"confirming"  mapSecondChannel call in progress.
"done"        Success. Shows count + done button.
```

Errors during `mapSecondChannel` reset to `"review"` and show an inline error banner.
Errors during `browseTaxonomy` stay in `"browse"` and show the error in the panel.

---

## `FuzzyMatchSuggestion` Direction

`previewSecondChannel` returns one entry per *channel taxonomy node*, each with an
optional `suggestedCategoryId` pointing to the *platform category* it best matches.

The modal re-indexes this by platform category (`suggestedCategoryId` as map key) so
each platform category row can look up whether it has a suggestion:

```typescript
const bestSuggestion = new Map<string, FuzzyMatchSuggestion>();
for (const s of suggestions) {
  if (!s.suggestedCategoryId || s.matchConfidence <= 0) continue;
  const existing = bestSuggestion.get(s.suggestedCategoryId);
  if (!existing || s.matchConfidence > existing.matchConfidence) {
    bestSuggestion.set(s.suggestedCategoryId, s);  // key = platform categoryId
  }
}
// Then per row: const sug = bestSuggestion.get(cat.id);
```

This means if the backend returns two taxonomy nodes that both suggest the same platform
category, only the higher-confidence one is shown.

---

## `TAXONOMY_CHANNELS` — Removed

The documentation previously described a `TAXONOMY_CHANNELS` constant. It does not exist
in the current types file. Do not re-add it. All routing decisions use `store.taxonomyEnabled`.

The only exported constant for channel classification is:
```typescript
export const IMPORT_CAPABLE_CHANNELS = ["woocommerce", "etsy"] as const;
export type ImportCapableChannel = typeof IMPORT_CAPABLE_CHANNELS[number];

export function isImportCapable(channelType: string): boolean {
  return IMPORT_CAPABLE_CHANNELS.includes(channelType as ImportCapableChannel);
}
```

This exists only to gate the import wizard UI (Type 1 flow). The taxonomy mapper is gated
by `store.taxonomyEnabled`, which comes from the backend.
