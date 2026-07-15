# Variant Axis Resolution (eligible ∩ Step-1)

**Companion to:** `08-variant-options.md` (defines variant dimensions on the Step-1 side).
This guide covers the **channel side**: how Step-1 dimensions are resolved against a channel's
permitted axes to produce the authoritative `variantAxes` + `axisValidation` consumed in Step 2 and
at publish.

**Canonical FE contract:** `docs/product/02-ecommerce-wizard/01-guides/18-variant-option-suggestions-frontend.md`
+ `.../02-api-reference/06-step2-category-attributes.md`
**Backend:** `VariantAxisResolver` · `ChannelStepSchemaService.buildStoreResult` · `MerchantDataController` (`GET /category-attributes`)

---

## The core principle

The role of a field is **not** an intrinsic property of the field. The same field can play different
roles depending on the product:

| Field | Can be an axis | Can be a product attribute |
|-------|----------------|----------------------------|
| Color | shirt sold Black/Red → 2 SKUs | shirt sold only Black → 1 metadata value |
| Pattern | Solid/Striped → different SKUs | product is only "Solid" → 1 value |
| Size | S/M/L → different SKUs | one-size → 1 value |

So a field's role is a function of **(channel capability) × (this product's SKU structure)**. The
channel config only owns the first factor; only the product knows the second. The whole system rests
on one formula:

```
actual axes = eligible (channel whitelist)  ∩  Step-1 dimensions (this product)
```

- **Eligible** = `ChannelCategoryApiConfig.variantOptionAttributeNames`, e.g. Shopify
  `{Color, Size, Pattern, Style, Fit, Width, Length, Scent}`. It means "MAY be an axis", not "IS an axis".
- **Step-1 dimensions** = `ProductType.variantDimensions` ∪ the keys actually present in the product's
  variant maps.

A field like **Pattern** that is eligible but ∉ Step-1 is not an axis for this product — it is a
single-value product attribute. This closes the `option2_values: [51 pattern]` class of bug
structurally: a non-varying field can never pass the intersection.

---

## End-to-end flow

```
STEP 1 (product)                    CHANNEL CONFIG                 CATEGORY API (per leaf)
ProductType.variantDimensions       variantOptionAttributeNames    live taxonomy attributes
variants[] (flat maps in Mongo)     (eligibility whitelist)        + value vocabularies
        │                                   │                              │
        └───────────────┬───────────────────┴──────────────────────────────┘
                        ▼
        VariantAxisResolver.resolveAxes(base, productType, variants, channelType)
            1. narrow    : eligible ∩ Step-1 → keep axes, demote the rest to optionalFields
            2. variantAxes : order + values + perSku + valueVocabulary
            3. axisValidation : NOT_EXPRESSIBLE / INCOMPLETE_MATRIX / TOO_MANY_AXES
                        │
                        ▼
        CategoryAttributesResponse (embedded in Step 2 schema OR /category-attributes)
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
FRONTEND (Step 2)                 PUBLISH pipeline
- variant table filled from perSku   - option{n}_name  = axis.name
- value dropdowns from values        - option{n}_values = axis.values
- warning/blocking banners from      - per-SKU option{n} = axis.perSku[sku]
  axisValidation                     - label → channelValueId via valueVocabulary
```

The axis SET is **owned by the backend**. The frontend renders `variantAxes` verbatim — no selection
UI, no client-side intersection — and only realizes ordering/values from the master snapshot as a
transitional fallback when a backend hasn't shipped `variantAxes` yet.

---

## Stage by stage (worked example: a Color × Size shirt)

### Stage 1 — Step-1 raw data

The merchant creates a shirt with 4 SKUs. In Mongo, `variants` are flat maps:

```jsonc
[
  { "sku": "TS-BLK-S", "color": "Black", "size": "S", "price": 99000, "quantity": 10 },
  { "sku": "TS-BLK-M", "color": "Black", "size": "M", "price": 99000, "quantity": 8  },
  { "sku": "TS-RED-S", "color": "Red",   "size": "S", "price": 99000, "quantity": 5  },
  { "sku": "TS-RED-M", "color": "Red",   "size": "M", "price": 99000, "quantity": 0  }
]
```

`ProductType.variantDimensions` declares the axes and their order:
`[{color, order 1}, {size, order 2}]`.

### Stage 2 — channel eligibility

The category API returns the leaf's attributes; a subset is flagged eligible via
`variantOptionAttributeNames` and surfaces as `variantOptionSuggestions` (Color, Size, **Pattern**),
each carrying its full taxonomy `options[]`.

### Stage 3 — resolveAxes (the intersection)

```
eligible (this category) = { Color, Size, Pattern }
Step-1 dimensions        = { color, size }
─────────────────────────────────────────────
actual axes = ∩          = { Color, Size }
Pattern                  = eligible but ∉ Step-1  → demoted to optionalFields (single-value attribute)
```

### Stage 4 — the resolved output

```jsonc
"variantAxes": [
  {
    "optionIndex": 1, "attributeCode": "color", "name": "Color",
    "values": ["Black", "Red"],
    "perSku": { "TS-BLK-S": "Black", "TS-BLK-M": "Black", "TS-RED-S": "Red", "TS-RED-M": "Red" },
    "valueVocabulary": [ { "label": "Black", "channelValueId": "gid-blk" }, { "label": "Red", "channelValueId": "gid-red" } ]
  },
  {
    "optionIndex": 2, "attributeCode": "size", "name": "Size",
    "values": ["S", "M"],
    "perSku": { "TS-BLK-S": "S", "TS-BLK-M": "M", "TS-RED-S": "S", "TS-RED-M": "M" }
  }
]
```

### Stage 5 — frontend renders it directly

The variant table fills each cell from `perSku[sku]` — no guessing:

| SKU | Color (option1) | Size (option2) | Price | Qty |
|-----|-----------------|----------------|-------|-----|
| TS-BLK-S | Black | S | 99,000 | 10 |
| TS-BLK-M | Black | M | 99,000 | 8 |
| TS-RED-S | Red | S | 99,000 | 5 |
| TS-RED-M | Red | M | 99,000 | 0 |

### Stage 6 — publish payload

```jsonc
"options": [ { "name": "Color", "values": ["Black","Red"] }, { "name": "Size", "values": ["S","M"] } ],
// per variant:
{ "sku": "TS-RED-M", "option1": "Red", "option2": "M" }   // option1/2 from perSku
```

---

## The two deliverables in detail

### `variantAxes` — three parts, three jobs

| Field | Answers | Source | Role |
|-------|---------|--------|------|
| `values` | "which values does THIS product use?" | distinct realized values across SKUs | column headers / dropdown; → `option{n}_values` |
| `perSku` | "which value does THIS SKU use?" | per-variant map lookup | fills the variant table row; → per-SKU `option{n}` |
| `valueVocabulary` | "which values does the CHANNEL know?" | the suggestion's taxonomy `options[]` | datalist hint + label→`channelValueId` translation at publish |

The critical boundary: `valueVocabulary` may list all 51 channel colors, but only `values` (Black, Red)
ever reach the payload. **The menu is never the cart.** Dumping vocabulary into values is the original
bug.

### `axisValidation` — surface problems, don't drop silently

| Code | Severity | Trigger | If not caught |
|------|----------|---------|---------------|
| `NOT_EXPRESSIBLE_ON_CHANNEL` | WARNING | a Step-1 dimension the SKUs genuinely vary on (>1 distinct) is not permitted by the channel | SKUs differing only by that dimension collapse to the same option combo → collision, silent variant loss |
| `INCOMPLETE_MATRIX` | BLOCKING | a resolved axis has some SKUs missing a value | invalid payload (empty `option{n}`) |
| `TOO_MANY_AXES` | BLOCKING | resolved axes > 3 (option1/2/3 ceiling) | cannot map to `option{n}` |

Severity drives the UI: **WARNING** shows a banner but keeps publish enabled ("proceed if intended");
**BLOCKING** locks publish until fixed ("payload would be invalid").

---

## The symmetry of the two "leftovers"

The intersection produces two kinds of leftover, handled oppositely — and both are correct:

```
Pattern : eligible ✔  but  ∉ Step-1 ✘   →  demoted to optionalFields, SILENT (it's just an attribute)
Fabric  : ∈ Step-1 ✔  but  not permitted ✘  →  NOT_EXPRESSIBLE_ON_CHANNEL, LOUD WARNING (SKUs may collide)
```

A field that the product doesn't vary on is quietly a product attribute. A dimension the product DOES
vary on but the channel can't express is a warning the merchant must see.

---

## Contract & responsibilities

`CategoryAttributesResponse` (embedded as `categoryAttributeSection`, or returned by `/category-attributes`):

| Field | Produced by | Consumed by |
|-------|-------------|-------------|
| `variantAxes: ResolvedVariantAxis[]` | `VariantAxisResolver.resolveAxes` | FE variant table; publish `option{n}` |
| `axisValidation: AxisValidationIssue[]` | `VariantAxisResolver.resolveAxes` | FE banners; publish preflight |
| `variantOptionSuggestions` | category API (narrowed) | value-vocabulary hint only |

Both new fields are `@JsonInclude(NON_NULL)` — absent when the backend didn't resolve axes, in which
case the frontend's `variantAxes ?? deriveFromSuggestions(...)` fallback applies.

**Standalone endpoint requirement:** `GET /category-attributes` resolves axes only when
`&masterProductId={id}` is supplied (it needs the product's Step-1 structure). The embedded
`categoryAttributeSection` resolves automatically (product context is server-side).

---

## Why the backend owns this (single source of truth)

The SKU→value mapping lives only in the master variant maps, which the backend holds in full (the
frontend often has only a stripped `[{sku, label}]` stub). Resolving axes and validation server-side
means web, mobile, and the publish pipeline all receive one identical answer — no three competing
derivations.

## Phased rollout

- **Phase 1** — backend narrows `variantOptionSuggestions` to the real axes (`eligible ∩ Step-1`) and
  demotes the rest; the frontend derived values/validation itself as a stopgap.
- **Phase 2** — backend emits fully-resolved `variantAxes` + `axisValidation`; the frontend renders
  them verbatim and stops deriving. Backward-compatible via a 6-arg `CategoryAttributesResponse`
  constructor and null-omitted new fields.
