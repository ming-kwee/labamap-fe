# Backend Notes — Variant axis resolution (eligible ∩ Step-1)

**Audience:** Frontend team · **Canonical contract:** `docs/product/02-ecommerce-wizard/01-guides/18-variant-option-suggestions-frontend.md` + `.../02-api-reference/06-step2-category-attributes.md`
**Backend:** `VariantAxisResolver` wired into `ChannelStepSchemaService.buildStoreResult` and `MerchantDataController` (`GET /category-attributes`)
**Status:** ✅ **Phase 2 shipped** — backend now emits `variantAxes` + `axisValidation`.

> **Note:** an earlier revision of this doc described a Phase-1 "narrow-in-place" behaviour (no new
> fields; `variantOptionSuggestions` = the axis list). That was superseded on 2026-07-15 — the
> backend now ships the full contract below, matching what the frontend already prefers. Docs 18/06
> are canonical; this file is just the backend changelog.

---

## What the backend now emits

`categoryAttributeSection` (embedded in the Step 2 schema) and `GET /category-attributes` both carry:

| Field | Meaning |
|---|---|
| `variantAxes: ResolvedVariantAxis[]` | **Authoritative axes** = channel-permitted ∩ Step-1 dimensions, values realized from the product's SKUs. Render these directly — no selection UI, no client-side intersection. |
| `axisValidation: AxisValidationIssue[]` | Axis-level problems: `NOT_EXPRESSIBLE_ON_CHANNEL` (WARNING), `INCOMPLETE_MATRIX` (BLOCKING), `TOO_MANY_AXES` (BLOCKING). |
| `variantOptionSuggestions` | **Value-vocabulary hint only** (datalist). Non-axis eligible fields (e.g. Pattern) are demoted to `optionalFields`. Never derive the axis SET from this. |

Both new fields are **omitted from JSON when null** (`@JsonInclude(NON_NULL)`), so absence = "backend
didn't resolve axes for this response" and the frontend fallback still applies.

### `ResolvedVariantAxis`
```jsonc
{
  "optionIndex": 1,                 // 1-based, follows Step-1 dimension order
  "attributeCode": "color",         // Step-1 dimension code (join key)
  "name": "Color",                  // → option{n}_name
  "values": ["Black", "Red"],       // distinct values SKUs actually use → option{n}_values (never full taxonomy)
  "perSku": { "S1": "Black", "S2": "Red" },   // seeds variantOverrides[sku]["option{n}"]
  "valueVocabulary": [ { "label": "Black", "channelValueId": "gid-blk" } ]  // datalist hint, optional
}
```

### `AxisValidationIssue`
```jsonc
{ "dimension": "Fabric", "code": "NOT_EXPRESSIBLE_ON_CHANNEL", "severity": "WARNING", "message": "…" }
```

---

## Still required from the frontend

**1. Keep sending `masterProductId`.**
`GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes` resolves axes **only when
`masterProductId` is supplied** (it needs the product's Step-1 structure). Keep sending
`&masterProductId={id}` — the frontend already does this (commit `76bb011`). The embedded
`categoryAttributeSection` in the Step 2 schema resolves automatically (product context is
server-side).

**2. Recommended: gate the publish button on BLOCKING axis issues.**
The backend now **enforces** BLOCKING axis validation at publish pre-flight (see below), so a publish
with `INCOMPLETE_MATRIX` / `TOO_MANY_AXES` is rejected server-side — the FE will never let a broken
payload reach the channel silently. But relying on the pre-flight rejection is a late, round-trip
failure. For a better UX, **also disable the publish button locally** when any resolved issue is
BLOCKING:

```ts
const hasBlockingAxisIssue = axisValidation.some(i => i.severity === "BLOCKING");
// publish button: disabled={hasBlockingAxisIssue || …existing conditions}
```

`WARNING` issues (e.g. `NOT_EXPRESSIBLE_ON_CHANNEL`) are advisory — show the amber banner but keep
publish enabled. Today the FE colours the banner by severity (`ChannelStoreTab.tsx`) but does **not**
gate the button — this is the remaining gap.

### Backend enforcement (what backs the button gate)

`PublishPreflightGate` (commit `09ea300`) fails a publish before any channel call when a resolved axis
issue is BLOCKING, returning a per-field `PublishError`:

| `errorCode` | field | meaning |
|---|---|---|
| `INCOMPLETE_MATRIX` | the dimension name (e.g. `Size`) | some SKU lacks a value for a resolved axis |
| `TOO_MANY_AXES` | `variants` | product has more axes than the channel allows (>3) |

These arrive alongside the existing `MISSING_REQUIRED_FIELD` errors in the same `PreflightValidationException`
payload, so the existing per-field error rendering already handles them. `NOT_EXPRESSIBLE_ON_CHANNEL`
(WARNING) is intentionally **not** blocked here — it stays advisory.

## Contract impact

| Aspect | Status |
|---|---|
| `CategoryAttributesResponse` existing fields | unchanged |
| New fields `variantAxes`, `axisValidation` | additive, null-omitted |
| `variantOptionSuggestions` | now value-hint; non-axis fields demoted to `optionalFields` |
| `/category-attributes` query params | optional `masterProductId` (backward-compatible) |

No field removed or renamed. The frontend's `variantAxes ?? deriveFrom(variantOptionSuggestions)`
fallback means old and new backends both work; with Phase 2 the derivation path is no longer taken.

---

## Backend mechanics (for reference)

- `VariantAxisResolver.resolveAxes(base, productType, variants, channelType)` — narrows suggestions,
  builds `variantAxes` (order from `ProductType.variantDimensions`, values/perSku from variant maps,
  vocabulary from the matching suggestion's `options[]`), and computes `axisValidation`.
- Step-1 dimensions = declared `ProductType.variantDimensions` ∪ realized variant-map keys
  (case-insensitive match against the permitted pool).
- `TOO_MANY_AXES` uses a ceiling of 3 (Shopify option limit; typical for TikTok/Lazada too).
- No `productType`/variant signal → response returned unchanged (never drops data silently).
