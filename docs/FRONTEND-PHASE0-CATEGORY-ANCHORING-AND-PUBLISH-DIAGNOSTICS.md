# Frontend Notes — Phase 0 (Category Anchoring) + New Publish Diagnostics Endpoint

**Audience:** Frontend team
**Backend branch:** `bff-v8`
**Status:** Implemented, compiles clean, additive & backward-compatible
**TL;DR:** Category is now a **derived property of Product Type**, not a loose manual field. And there is a **new product-aware Publish Diagnostics endpoint** that should replace the raw schema-matching call currently used on the Publish Diagnostics screen.

---

## Frontend implementation status (2026-07-08) — ✅ DONE

Implemented on branch `v7`. All items in the §6 checklist are addressed:

| Area | Change |
|---|---|
| **Product Types type** | `ProductType.categorySlug` added (type + `ProductTypeDoc` + `docToProductType` mapper). |
| **Publish Diagnostics** | "Dari My Products" mode now calls `POST /channels/publish/analyze` (`analyzePublish` service + `PublishAnalysisResponse` types). Renders verdict + `readinessScore` bar, issues table, suggestions, 7-stage pipeline summary, transformed output + raw. `readyToPublish:false` treated as a valid 200; 400/500 surface `issues[0].message` (service returns the body, never throws on those). Store is now **optional** (endpoint only needs `masterProductId`; a store adds channel + Step-2 context). No manual `categoryId` sent — backend derives it. "Paste JSON" mode stays on `/adaptive-pattern-matching/analyze` (schema-level). |
| **JOLT Generation Console** | The shared `ProductTypeSampleLoader` picker now also reports the selected type (`onProductTypeChange`); the console passes `productTypeId` to `/admin/ai/generate-jolt` and shows the derived `categorySlug`. Manual Category ID becomes an **override**; run is enabled by either a product type or a category. |
| **Product Types page / Channel Category Rules** | Display the derived `categorySlug` (read-only chip) for context; product-type search includes it. |
| **Channel Category Schemas** | No code change needed — `categorySlug` is a free-text input, so `jewelry`/`baby` already work; placeholder hint updated to include them. |
| **Master Attributes** | No change needed — jewelry/baby `categoryRequirements` flow through the existing Step-2 `categoryAttributeSection` (backend-side), not this admin screen. |

Verification: typecheck + eslint clean on touched files; e2e `publish-diagnostics` (3), `sample-from-product-type` (2), `channel-fields-product-type-missing` (2), `jolt-specs-provenance` (3) all pass. `PublishProductRequest` / submit contracts unchanged.

> ⚠ Live note: `/channels/publish/analyze` verified against the typed contract via mocked e2e. Once deployed on the dev backend, re-verify the 200/400/500 body shapes live.

---

## 1. What changed, in one picture

```
BEFORE:  category = a loose, manually-typed/selected field on the product
AFTER:   category = DERIVED from ProductType.categorySlug  (manual value only as override/fallback)
```

Nothing you send today breaks. The changes add a **preferred, canonical source** for category and a **new endpoint**. You only need to adjust where it improves UX (details below).

---

## 2. NEW endpoint — Publish Diagnostics (product-aware)

### `POST /labamap/api/v1/channels/publish/analyze`

A **pre-flight dry-run** of the full publish pipeline. **Nothing is published.** Returns a readiness report.

**Request body** — same DTO as the publish endpoint (`PublishProductRequest`):

```jsonc
{
  "masterProductId": "prod_1766814653023",  // REQUIRED
  "storeId": "shopify-us-store",            // optional — enables Step 2 channel-data load
  "channelId": "shopify",                   // optional when storeId present
  "categoryId": "clothing",                 // optional — auto-derived from productType if omitted
  "organizationId": "org_123"               // optional
}
```

**Response** (`PublishAnalysisResponse`, `200 OK`):

```jsonc
{
  "masterProductId": "prod_...",
  "storeId": "shopify-us-store",
  "channelType": "shopify",
  "categoryId": "clothing",          // the category that was actually resolved (see §3)
  "readyToPublish": false,
  "readinessScore": 75,              // 0–100: starts 100; -30 not found; -10/ERROR; -5/WARNING
  "masterProduct":   { "source": "mongodb", "found": true, "fieldCount": 24, "hasVariants": true, "variantCount": 6, "...": "..." },
  "channelData":     { "step2DataFound": true, "completionPercentage": 80, "missingRequiredFields": ["material"], "...": "..." },
  "mergedData":      { "fieldCount": 31, "...": "..." },
  "adaptiveMapping": { "status": "WARNING", "overallConfidence": 88.0, "totalMappings": 22, "warnings": ["[MAPPING-CONFLICT] ..."], "...": "..." },
  "joltSpec":        { "found": true, "source": "adaptive_pattern_matching", "operationCount": 5, "...": "..." },
  "transformation":  { "success": true, "outputTopLevelKeys": ["product"], "transformedData": { "...": "..." } },
  "postProcessing":  { "ruleCount": 3, "rules": [ { "name": "...", "priority": 10, "...": "..." } ] },
  "issues":      [ { "severity": "WARNING", "category": "CHANNEL_DATA", "field": "material", "message": "..." } ],
  "suggestions": [ "Fill required field 'material' in Step 2" ]
}
```

### Status semantics (important for error handling)

This is a **diagnostics** endpoint. A product that is **not** ready still returns **`200 OK`** — the verdict is in the body (`readyToPublish` / `readinessScore` / `issues`). Do **not** treat `readyToPublish: false` as an HTTP error.

| HTTP | When | Body |
|------|------|------|
| `200` | Analysis ran (ready **or** not ready) | Full report |
| `400` | `masterProductId` missing/blank | Same shape, one `ERROR` issue |
| `500` | Unexpected server error | Same shape, one `ERROR` issue |

→ All three return the **same `PublishAnalysisResponse` shape**, so you render one component. On 400/500 just show `issues[0].message`.

---

## 3. This is NOT the same as `/adaptive-pattern-matching/analyze` — use the right one

The Publish Diagnostics screen today likely calls `/api/v1/adaptive-pattern-matching/analyze`. That endpoint is **schema-level** and **product-agnostic** — it cannot see real product data.

| | `/adaptive-pattern-matching/analyze` | `/channels/publish/analyze` (NEW) |
|---|---|---|
| Question answered | "Is my JOLT **spec** correct?" | "Is **this product** ready to publish?" |
| Input | 2 raw schemas | `masterProductId` (real product) |
| Sees real values? | ❌ No | ✅ Yes (loads product + Step 2 from DB) |
| Can flag data issues (dup SKU/price, empty required values)? | ❌ No | ✅ Yes |
| Keep using for | **JOLT Generation Console** (generate/tune specs) | **Publish Diagnostics** (per-product readiness) |

**Action:** Point the **Publish Diagnostics** screen at the new endpoint. Keep the **JOLT Generation Console** on `/adaptive-pattern-matching/*` — it is unchanged and still the JOLT-generation engine. (Internally, `/publish/analyze` calls that same engine at its Stage 4, so results stay consistent.)

**Why this matters:** it fixes the earlier complaint that duplicate SKU/price were not surfaced — the schema-only endpoint literally cannot see those values; the new one can.

---

## 4. Category is now derived from Product Type (Phase 0A + 0B)

### 4A — New field: `ProductType.categorySlug`

`GET /labamap/api/v1/admin/product-types` now returns a `categorySlug` on each product type (omitted when null on legacy docs — `NON_NULL`):

```jsonc
{ "id": "665...", "name": "Apparel", "slug": "apparel", "categorySlug": "clothing", "...": "..." }
```

**Cardinality is N:1** — many product types roll up to one category slug. Current seeded mapping (24 types):

| category slug | product types |
|---|---|
| `electronics` | smartphone, laptop, audio-device, camera, tv-display, wearable, gaming-product, computer-peripheral |
| `clothing` | apparel, footwear, bag |
| `home-garden` | home-product, tool |
| `jewelry` | jewelry |
| `baby` | baby-product |
| `beauty` | beauty-product |
| `sports` | sports-equipment |
| `food` | food-product |
| `toys` | toy |
| `books` | book |
| `motors` | automotive-accessory |
| `default` | general-product, pet-product, office-supply |

> `default` = the type has no specific target category (catch-all). `jewelry` and `baby` are **new** category slugs (see §5).

### 4B — How category is resolved now (priority chain)

When the backend needs a category (in `/publish/analyze` and in JOLT generation), it resolves in this order:

```
1. Explicit categoryId in the request        (manual override — still honored)
2. ProductType.categorySlug                  (canonical, preferred)   ← NEW
3. loose product.category attribute          (legacy fallback)
4. "default"
```

**What this means for you:**
- You **no longer need to send `categoryId`** to `/publish/analyze` (or to JOLT generation) if the product has a `productTypeId` — the backend derives it. Sending it still works as an explicit override.
- The **manual "category" form field** (the generic `CATEGORY_SELECT`) is now redundant for products that have a product type. It is **not removed yet** (that's Phase 0C, needs FE coordination), but you can start treating it as an **override**, not a required input. Recommended UX: show the derived category (read-only or pre-filled), let the user override only if needed.

### 4C — JOLT Generation Console can pass `productTypeId`

`POST /labamap/api/v1/admin/ai/generate-jolt` now accepts an optional `productTypeId` query param:

```
POST /api/v1/admin/ai/generate-jolt?channelId=shopify&productTypeId=<objectId>
```

When `productTypeId` is present, the category is derived from `ProductType.categorySlug` (the manual `categoryId` param becomes a fallback). If you already wire the console with a productType picker, pass its id here instead of asking for a separate category.

> Note: this path still depends on the AI/Gemini generation step; unrelated to the new diagnostics endpoint.

---

## 5. New category slugs: `jewelry` and `baby` (attribute requirements)

Two category slugs are new, so their `categoryRequirements` were seeded for Shopify / Wix / eBay:

- **`jewelry`** — required: `material`/`metal-type`, `gemstone`; recommended: `carat_weight`, `certification`, `gender`
- **`baby`** — required: `safety_warnings`, `age_range`; recommended: `material`, `care_instructions`

Also, eBay namespace was aligned to internal slugs: `fashion` → `clothing`, `sporting-goods` → `sports`.

**FE impact:** if you render category-specific required/recommended fields in Step 2 (`categoryAttributeSection`), products under jewelry/baby will now return these new fields. No new UI needed — they flow through the existing category-attributes mechanism.

> ⚠️ These `categoryRequirements` are only seeded on **fresh** DBs (the migration skips if requirements already exist). If a shared/staging DB already has requirements, ask backend to re-seed jewelry/baby manually.

---

## 6. Frontend checklist

- [x] **Publish Diagnostics screen** → switch from `/adaptive-pattern-matching/analyze` to `POST /channels/publish/analyze`. Send `masterProductId` (+ `storeId` when a store is selected). Render `readyToPublish`, `readinessScore`, `issues`, `suggestions`, and the per-stage sections. *(product mode; JSON-paste mode stays schema-level)*
- [x] Treat `readyToPublish: false` as a **valid 200 report**, not an error. Only 400/500 are errors (still same body shape — show `issues[0].message`).
- [x] **Stop requiring** a manual `categoryId` where a `productTypeId` exists — let the backend derive it. Keep any category input as an **override** only. *(diagnostics sends none; JOLT console category is now an override)*
- [x] Optionally read `ProductType.categorySlug` from `/admin/product-types` to **display** the derived category (read-only/pre-fill) in product/Step-2 UI. *(Product Types page + Channel Category Rules chip)*
- [x] **JOLT Generation Console** → if it has a product-type picker, pass `productTypeId` to `/admin/ai/generate-jolt` instead of a separate category. Keep the console on the `/adaptive-pattern-matching/*` engine (unchanged).
- [x] Nothing to change for jewelry/baby beyond confirming your `categoryAttributeSection` renderer handles their new required/recommended fields (it already should). *(confirmed — no change)*

---

## 7. What did NOT change (so you don't over-adjust)

- `PublishProductRequest` shape is unchanged (new endpoint reuses it; `categoryId` still optional).
- The publish endpoints (`/channels/publish`, `/channels/publish/batch`) are unchanged.
- `/adaptive-pattern-matching/*` endpoints are unchanged — still the JOLT-generation engine for the console.
- Existing products without `productTypeId` or `categorySlug` keep working via the legacy `product.category` fallback.
