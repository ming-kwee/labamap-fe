# Step 2 — Variant Axes: Resolution & Rendering

**Original ("suggestions") design:** 2026-06-05 · **Superseded by axis-resolution design:** 2026-07-15
**Relates to:** `06-step2-category-attributes.md` (API reference), `12-path-b-category-attributes-explanation.md`
(category attribute fetch), `07-publishing-engine/01-guides/05-post-processing-config.md`
(`BUILD_OPTIONS_FROM_FLAT_KEYS`), `06-variant-value-id-translation.md` (label→ID translation at publish).

> **Read this first.** The variant *axis set* of a product (the dimensions its SKUs vary on) is a
> fact decided in **Step 1**, not something the seller re-picks from channel taxonomy in Step 2.
> The earlier "Suggested variant options" panel violated this and produced corrupt payloads.
> This document describes the corrected architecture and what replaced the panel.

---

## 1. Why the old "suggestions panel" was wrong

The channel returns, for a chosen category, a flat list of attributes it knows about (Shopify
"Shirts" → Color, Pattern, Size, Material, Neckline, …). A subset is tagged, via
`attributeConfig.variantOptionAttributeNames`, as *eligible to drive variants*:

```json
"variantOptionAttributeNames": ["Style","Color","Fit","Width","Length","Scent","Pattern","Size"]
```

The old UI treated this eligible list as **the product's variant axes**: it pre-checked all of them
and, on "Apply", wrote `option1_name/option2_name/option3_name` in order, and for any attribute the
product did *not* actually vary on it fell back to **the entire taxonomy value list**:

```ts
// OLD — the bug
updates[`${optionKey}_values`] = usedValues.size > 0 ? [...usedValues] : labels; // ← labels = all 51 patterns
```

For a 2-SKU product (Color=Black × Size={Xs,S}) that produced:

```
option1_name=Color  option1_values=["Black"]
option2_name=Pattern option2_values=[51 taxonomy patterns]   ← garbage: no SKU has a pattern
option3_name=Size   option3_values=["Xs","S"]
variants assign option1 + option3 only → option2 (Pattern) unassigned → INVALID → sync FAILED
```

**Root cause: conflating two independent facts.**

| Fact | Owner | The old code's mistake |
|---|---|---|
| *Which attributes CAN be an axis on this channel* (eligibility) | channel config `variantOptionAttributeNames` | used as if it were the next fact |
| *Which attributes this product ACTUALLY varies on* (the axis set) | **Step 1** SKU structure | never consulted as the source of truth |

An attribute's *role* (variant axis vs product-level attribute) is **not intrinsic** to the
attribute. "Pattern" is a variant axis for a merchant who sells Solid/Striped as separate SKUs, and a
single product attribute (Pattern="Solid") for one who does not. Only the product's Step-1 SKU set
decides which it is.

---

## 2. The rule: axes = permitted ∩ Step-1 dimensions

```
Actual variant axes  =  variantOptionAttributeNames (eligible / permitted, per channel)
                        ∩  Step-1 variant dimensions (declared, from ProductType)
                     ,  with values realized from the product's actual SKUs.
```

For the example: `{Style,Color,Fit,Width,Length,Scent,Pattern,Size} ∩ {Color,Size} = {Color,Size}`.
Pattern is *eligible but not a Step-1 dimension* → it becomes a **product-level attribute** (single
value, in `optionalFields`/`requiredFields`), never `option2`. It is structurally impossible to
inject it as an axis.

This also makes multi-channel correct **for free**: every channel intersects the *same* master
dimensions with *its own* permitted list. The master stays clean; per-channel differences are only
in vocabulary (value mapping) and product-level compliance attributes — never in the axis set.

### `variantOptionAttributeNames` is a *capability whitelist*, not an assignment

Reinterpret the config field: it declares which attributes a channel *permits* as axes, used to
**validate** that the master's dimensions are expressible — not to *inject* axes the master lacks.

- master dimension ∈ permitted → becomes an axis (values from SKUs).
- master dimension ∉ permitted → `axisValidation: NOT_EXPRESSIBLE_ON_CHANNEL`.
- permitted attribute ∉ master → **not** an axis; if the category requires it, show as a single-value
  product attribute.

---

## 3. Two backend layers — keep them separate

| Layer | Scope | Responsibility |
|---|---|---|
| **Taxonomy attribute cache** (`CategoryCacheServiceImpl`, cache key `channelType+storeId+categoryId`, TTL 24h) | **product-agnostic**, shared across all products in the category | Fetch category attributes; tag which are *eligible* axes (`∩ variantOptionAttributeNames`). Never decides per-product roles. |
| **Schema build** (`ChannelStepSchemaService.buildStoreResult`) | **product-aware** — `productType` (declared dims) + `masterVariants` (realized values) in scope | Compute `permitted ∩ declared`, realize values/per-SKU from SKUs, emit `variantAxes` + `axisValidation`, route eligible-non-axis attributes to required/optional. |

The intersection is **not** cacheable at the taxonomy layer (it varies per product) and **must not**
be computed on the client (the server owns SKU-structure authority and multi-channel validation).

### Two Step-1 representations — both needed

| Representation | Source | Answers | Used for |
|---|---|---|---|
| **Declared** | `ProductTypeDocument.variantDimensions` (`attributeCode`, `attributeName`, `order`, `required`) | *which axes, in what order, named what* | axis set, deterministic option1/2/3 order, `option{n}_name` |
| **Realized** | `MasterProductData.getVariants()` — flat maps `{sku, color:"Black", size:"S"}` | *what value each SKU uses* | `option{n}_values` (distinct), per-SKU assignment, `INCOMPLETE_MATRIX` check |

---

## 4. Contract: `categoryAttributeSection`

**Shipped delivery (2026-07-15, `VariantAxisResolver`):** the backend narrows
`variantOptionSuggestions` **in place** to `eligible ∩ Step-1 dimensions` and demotes non-axis
eligible fields (Pattern) into `optionalFields`. The response *shape* is unchanged — only the field
distribution changed. See `docs/FRONTEND-VARIANT-AXIS-NARROWING.md`. The frontend must send
`masterProductId` to `GET /category-attributes` for the narrowing to apply on that path (the embedded
schema section is narrowed automatically server-side).

`variantAxes` / `axisValidation` below are a **forward-compatible** fully-resolved contract the FE
already honors if a future backend emits them; today the FE realizes the same structure from the
narrowed `variantOptionSuggestions` + the master snapshot.

```typescript
interface CategoryAttributeSection {
  categoryId: string;
  categoryName: string;
  categoryPath: string[];
  requiredFields: ChannelFormField[];      // product-level, single value (incl. required eligible-non-axis)
  optionalFields: ChannelFormField[];      // product-level, single value (now incl. demoted Pattern, Style, …)
  variantOptionSuggestions?: ChannelFormField[]; // backend-NARROWED = the product's real axes (+ vocab)
  variantAxes?: ResolvedVariantAxis[];     // forward-compat: fully-resolved axes if a future backend sends them
  axisValidation?: AxisValidationIssue[];  // forward-compat: server-side axis problems
}

interface ResolvedVariantAxis {
  optionIndex: number;                       // 1..3, from Step-1 dimension order
  attributeCode: string;                     // "color"
  name: string;                              // "Color" → option{n}_name
  values: string[];                          // distinct realized values → option{n}_values (NEVER full taxonomy)
  perSku: Record<string, string>;            // sku → value → seeds variantOverrides[sku]["option{n}"]
  valueVocabulary?: { label: string; channelValueId?: string }[]; // datalist suggestions only
}

type AxisValidationSeverity = "WARNING" | "BLOCKING";
interface AxisValidationIssue {
  dimension: string;
  code: "NOT_EXPRESSIBLE_ON_CHANNEL" | "INCOMPLETE_MATRIX" | "TOO_MANY_AXES";
  severity: AxisValidationSeverity;
  message: string;
}
```

### Validation severity (default policy)

| Code | Meaning | Default severity | Rationale |
|---|---|---|---|
| `INCOMPLETE_MATRIX` | a SKU lacks a value for an axis | **BLOCKING** | produces an invalid channel payload |
| `TOO_MANY_AXES` | product has >3 variant dimensions | **BLOCKING** | channel option cap exceeded |
| `NOT_EXPRESSIBLE_ON_CHANNEL` | master dimension ∉ permitted | **WARNING** | soft limitation; product may still list without that axis |

`NOT_EXPRESSIBLE` as WARNING vs BLOCKING is a business-rule choice; keep it configurable per channel.
Blocking issues should feed the publish pre-flight gate (BLOCKED), consistent with the per-field gate.

---

## 5. Frontend behaviour (`ChannelStoreTab.tsx`)

The frontend is a **renderer**, not an axis chooser. There is no "Apply" button and no selection.

0. **Send `masterProductId`** on the `GET /category-attributes` fetch so the backend narrows
   `variantOptionSuggestions` to this product's real axes. (`ChannelStoreTab` receives `masterProductId`
   as a prop from `ChannelFieldsWizard` and appends it to the query.)

1. **`resolvedAxes`** (`useMemo`): prefer `categoryAttrs.variantAxes` if a future backend sends it;
   otherwise `buildAxesFromFields(categoryAttrs.variantOptionSuggestions, masterProduct)` — the axis SET
   comes from the **backend-narrowed** `variantOptionSuggestions` (channel-aware: empty for channels
   without the option{n} mechanism; product-aware: Pattern already demoted), while per-SKU values, the
   distinct value list, and option1/2/3 order are realized from the master snapshot. An axis whose SKUs
   carry no value is dropped — this also defends against a legacy un-narrowed response. `field.options`
   becomes `valueVocabulary` (datalist only). The seller never picks the axis set.

2. **Sync effect**: keeps `channelData.option{n}_name/_values` and per-SKU `option{n}` in sync with
   `resolvedAxes`:
   - seeds missing per-SKU values from `axis.perSku` (never overwrites a seller edit);
   - `option{n}_values` = distinct of the *effective* per-SKU values (edits included) — Shopify's own
     invariant, so the payload is always valid;
   - prunes stale `option{n}_name/_values` and orphaned per-SKU keys left by the old panel (skipping any
     `option{n}` the backend declares as a schema variant field);
   - guarded to converge in one pass — no render loop; does nothing until the master snapshot loads.

3. **`VariantAxisSummary`** (read-only): shows the resolved axes (`Option 1: Color — Black`, …) and
   `axisValidation` (amber warning / red blocking). Replaces the selectable suggestions panel.
   `axisValidation` = backend issues (when present) **plus** a client fail-loud check: if a declared
   Step-1 variant dimension whose SKUs genuinely vary (>1 distinct value) is absent from the resolved
   axes, warn `NOT_EXPRESSIBLE_ON_CHANNEL` — on Shopify those SKUs would collapse to one option combo
   and collide. Skipped when the channel uses no axes (avoids false positives on Lazada/TikTok).

4. **Variant table columns**: one TEXT column per resolved axis, pre-filled per SKU, with
   `valueVocabulary` as a datalist (suggestions, not constraints — channels accept any string).

### Save format (unchanged shape, now always correct)

```json
{
  "channelData": {
    "shopify_taxonomy_category_id": "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "option1_name": "Color", "option1_values": ["Black"],
    "option2_name": "Size",  "option2_values": ["Xs", "S"]
  },
  "variantOverrides": {
    "SKU-XS-BLACK": { "option1": "Black", "option2": "Xs" },
    "SKU-S-BLACK":  { "option1": "Black", "option2": "S"  }
  }
}
```

`option{n}_values` = distinct values the SKUs use — **never** the full taxonomy list. Store the
human-readable `label` (never the taxonomy GID); the backend resolves the channel ID at publish time
(`VariantValueTranslationService`, see `06-variant-value-id-translation.md`).

---

## 6. Vocabulary mismatch is a value concern, never an axis concern

If master values don't match taxonomy labels (master "Jet Black" vs Shopify "Black", or "Xs" vs "XS"),
the axis is still correct — only the *value spelling* differs. The seller edits the cell (datalist shows
taxonomy suggestions), or `channel_field_value_mappings` maps it systematically. A category whose
vocabulary is wholesale different (adult sizes vs baby sizes) is a signal the wrong category was chosen —
change the category, not the axes.

---

## 7. Migration of already-corrupted products

Products saved by the old panel may carry a bogus axis (e.g. `option2=Pattern` with 51 values, plus an
orphaned per-SKU `option3`). On next Step-2 load the sync effect re-resolves axes and: re-maps
`option{n}_name/_values` to the real axes, recomputes `option{n}_values` from SKUs, and prunes the
orphaned option slot and its per-SKU keys. The product converges to a valid structure without seller
action; re-save persists it.

---

## 8. Implementation status

### Frontend (this repo — done 2026-07-15)

| # | What | File | Status |
|---|---|---|---|
| 1 | `ResolvedVariantAxis` / `AxisValidationIssue` types; `variantAxes`/`axisValidation` (forward-compat) on `CategoryAttributeSection` | `types/channelStore.ts` | ✅ |
| 2 | Send `masterProductId` to `GET /category-attributes` (prop threaded from `ChannelFieldsWizard`) | `ChannelStoreTab.tsx`, `ChannelFieldsWizard.tsx` | ✅ |
| 3 | `buildAxesFromFields()` + `resolvedAxes` memo (axis set from backend-narrowed `variantOptionSuggestions`; values/order from master; drop empty-value axes) | `ChannelStoreTab.tsx` | ✅ |
| 4 | Sync effect: seed per-SKU, `option{n}_values`=distinct, prune stale/orphan, loop-safe | `ChannelStoreTab.tsx` | ✅ |
| 5 | `VariantAxisSummary` read-only panel; `axisValidation` = backend ∪ client fail-loud missing-axis warning | `ChannelStoreTab.tsx` | ✅ |
| 6 | Variant table columns from `resolvedAxes`; removed selectable panel, `handleVariantSuggestionsApply`, `: labels` fallback | `ChannelStoreTab.tsx` | ✅ |

### Backend

| # | What | Status |
|---|---|---|
| B1 | `VariantAxisResolver` narrows `variantOptionSuggestions` to `eligible ∩ Step-1 dims` in `buildStoreResult` + `/category-attributes` (needs `masterProductId`). | ✅ shipped 2026-07-15 |
| B2 | Demote non-axis eligible fields (Pattern, Style) into `optionalFields` as single-value attributes. | ✅ shipped |
| B3 | Keep the taxonomy cache product-agnostic (eligible pool only); resolve per-product in schema build. | ✅ shipped |
| B4 | Emit `axisValidation` (`INCOMPLETE_MATRIX`, `TOO_MANY_AXES`, `NOT_EXPRESSIBLE_ON_CHANNEL`) + wire BLOCKING into publish gate. | ⬜ follow-up (FE surfaces the missing-axis warning client-side meanwhile) |
| B5 | `BUILD_OPTIONS_FROM_FLAT_KEYS` invariant guard: drop any `option{n}` with zero variant coverage before publish. | ⬜ recommended |

---

## 9. `categoryId` key in `channelData` — do not store (unchanged)

Do not add a `categoryId` key inside `channelData` (causes a duplicate "Category" TEXT field). The
top-level `request.categoryId` (outside `channelData`) is still used for completion scoring.
