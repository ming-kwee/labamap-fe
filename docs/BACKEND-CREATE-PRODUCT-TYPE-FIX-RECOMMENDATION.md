# Backend Recommendation — `POST /ecommerce/dynamic-products/create` must persist `productTypeId`

**Audience:** Backend + Frontend teams
**Severity:** High — blocks Step 2 (Channel Fields) for every newly created product
**Backend status:** ✅ **FIXED & runtime-verified 2026-07-16** (branch `bff-v8`) — create now persists `productTypeId`. See §5 (history) and §9 (what shipped).
**Runtime verification (localhost:8888, 2026-07-16):** create-only (no follow-up update) → `channel-step` returns `productTypeId=…, name=Apparel`; create validation now logs *"System field 'productTypeId' processed"* (was *"Unknown field … ignored"*); create-without-type still 422s (no fabrication). AC#1–#4 pass.
**Frontend interim workaround:** ✅ **REMOVED 2026-07-16** (`useProductSubmit.ts`) now that the fix is runtime-verified — a single `createProduct(...)` persists the type.

---

## TL;DR

The **create** endpoint silently drops the product type: it discards `productData.productTypeId`
as an *"Unknown field ... ignored"* and does not read `context.productTypeId` either. The product is
saved with **no product type**, so Step 2's schema build (`POST /ecommerce/form-schema/channel-step`)
returns **422 `PRODUCT_TYPE_MISSING`**.

The **update** endpoint (`PUT /admin/master-products/{id}`) persists the product type correctly with
the *same payload*. So the two write paths are inconsistent. Fix create to persist `productTypeId`
the way update does.

---

## 1. User-facing symptom

1. Merchant creates a master product in Step 1 and selects a Product Type (e.g. **Apparel**).
2. Continues to Step 2 → the page shows **"Produk ini belum punya Product Type"**
   (backend `PRODUCT_TYPE_MISSING`).
3. Merchant goes **Previous** → re-selects the product type → **Continue** again → Step 2 now works.

Step (3) works because "Previous" re-opens Step 1 in **edit mode**, which saves via the **update**
endpoint — which *does* persist the product type. It is deterministic ("every initial create"),
because the create path never persists it.

---

## 2. Root cause

`productTypeId` is written to the master product **only by the update endpoint**, never by create.

| Write path | Endpoint | Persists `productTypeId`? |
|---|---|---|
| Create (Step 1 first submit) | `POST /ecommerce/dynamic-products/create` | ❌ **No** — dropped as "unknown field" |
| Update (Step 1 edit / "Previous") | `PUT /admin/master-products/{id}` | ✅ Yes |

The create endpoint's product-data validation only keeps recognized product-schema fields
(`name, sku, price, category, description, mainImage, brand, inventory, …`). `productTypeId` is not
in that schema, so it is stripped before persistence. `context.productTypeId` is also not consulted.

---

## 3. Reproduction & evidence (verified live)

Product type used: `69ef31373f090e6ccb469bf2` (**Apparel**), org
`org-e7dac9f8-6353-4168-b9a1-6a7791d71b02`, store `shopify-shopify-01`.

### 3.1 Create drops `productTypeId`

Request (abridged) — `productTypeId` supplied in **both** `productData` and `context`:

```jsonc
POST /labamap/api/v1/ecommerce/dynamic-products/create
{
  "productData": { "id": "...", "name": "...", "sku": "DBG-A1B2C3", "price": 10,
                   "category": "69ef31373f090e6ccb469bf2",
                   "productTypeId": "69ef31373f090e6ccb469bf2",   // ← dropped
                   "inventory": 1, "description": "...(≥50 chars)...",
                   "mainImage": "https://...", "brand": "DBG" },
  "context":     { "organizationId": "...", "userRole": "BUSINESS_USER",
                   "productCategory": "69ef31373f090e6ccb469bf2",
                   "productTypeId": "69ef31373f090e6ccb469bf2" }  // ← ignored
}
```

Response validation block (HTTP 200 create still succeeds, but note the warning):

```jsonc
"validation": {
  "warnings": [
    "System field 'id' processed without schema validation",
    "Unknown field 'productTypeId' ignored"          // ← the bug
  ],
  "validatedData": { "name": "...", "sku": "...", "price": 10, "category": "69ef31373f090e6ccb469bf2",
                     "inventory": 1, "description": "...", "mainImage": "...", "brand": "DBG" }
                     // note: NO productTypeId
}
```

### 3.2 Step 2 schema then 422s

```
POST /labamap/api/v1/ecommerce/form-schema/channel-step
{ "masterProductId": "<new id>", "organizationId": "...", "storeId": "shopify-shopify-01" }
→ HTTP 422   (masterProduct.productTypeId absent → PRODUCT_TYPE_MISSING)
```

### 3.3 Update with the same payload fixes it

```
PUT /labamap/api/v1/admin/master-products/<new id>?organizationId=...
{ "productData": { ...same..., "productTypeId": "69ef31373f090e6ccb469bf2" }, "context": {...} }
→ HTTP 200

POST /labamap/api/v1/ecommerce/form-schema/channel-step  (same body as 3.2)
→ HTTP 200   masterProduct.productTypeId = "69ef31373f090e6ccb469bf2", productTypeName = "Apparel"
```

**Same product, same payload — create loses the type, update keeps it.**

---

## 4. Expected behavior

After `POST /ecommerce/dynamic-products/create` with a product type supplied, the persisted
`master_product_data` MUST carry that `productTypeId`, such that an immediate
`POST /ecommerce/form-schema/channel-step` for the new id returns the resolved product type
(no `PRODUCT_TYPE_MISSING`). Create and update must be symmetric on this field.

---

## 5. Recommended fix

Persist `productTypeId` in the create pipeline, mirroring the update path. Any one of these is fine;
prefer (a) as it matches what the frontend already sends and what update accepts:

- **(a) Treat `productData.productTypeId` as a system/metadata field** (like `id`) — do not strip it
  as "unknown". Carry it through validation into `master_product_data.productTypeId`. This is exactly
  what the update endpoint already does with the same payload.
- **(b) Read `context.productTypeId`** (the frontend sends it in `context` too) and write it onto the
  master product during create.
- **(c) Derive from `productData.category`** — the frontend sets `category` to the product type id.
  Only viable if `category` is guaranteed to be a product type id; (a)/(b) are less ambiguous.

Whichever source is chosen, **align create with update** so both write `productTypeId` identically.

### Note on history (corrected 2026-07-16)
This was **not** a regression from a schema tightening. Git archaeology shows the create path
**never** persisted `productTypeId`:

- The create validation has dropped unknown fields since **2025-12-04** (`a294401`); `productTypeId`
  was never whitelisted there.
- `save()`/`update()` only started persisting `productTypeId` on **2026-06-19** (`68bb99f`) — but only
  the **update** path supplies it, because update passes `productData` through **raw**
  (`MasterProductAdminController`) while create routes it through the **dropping validation**. Create
  was broken-from-birth for this field.
- The Step 2 `PRODUCT_TYPE_MISSING` (422) gate only landed on **2026-07-05** (`bb14f90`).

So the FE's *"verified 2026-07-04"* was **one day before that gate existed** — nothing enforced
`productTypeId` yet, so a create with no type didn't fail visibly (and any "Previous"/edit re-save hit
the update path, which does persist it). A latent create-path gap simply met a new downstream gate;
the fix connects the create supply side that was never wired.

---

## 6. Acceptance criteria

1. `POST /ecommerce/dynamic-products/create` with `productTypeId` (in productData and/or context) →
   the created `master_product_data.productTypeId` equals the supplied id.
2. Immediately after (1), `POST /ecommerce/form-schema/channel-step` for the new id returns
   `masterProduct.productTypeId` = supplied id and **does not** 422.
3. Create and update produce identical `productTypeId` persistence for the same input.
4. Regression: creating a product **without** a product type still succeeds and Step 2 continues to
   surface `PRODUCT_TYPE_MISSING` (unchanged) — the fix must not fabricate a type.

---

## 7. Frontend interim workaround — REMOVED (2026-07-16)

> ✅ **Removed.** The backend fix (`bff-v8`, §9) is runtime-verified (see header), so the interim
> **create-then-update** in `useProductSubmit.submitProduct()` has been deleted — a single
> `createProduct(...)` persists the product type. `withProductType()` is retained (it injects
> `productData.productTypeId`, which the backend now reads on both create and update).

**History:** while the create endpoint dropped the type, the frontend called `createProduct(...)` then
immediately `updateProduct(createdId, …)` so the product carried its type before Step 2. That extra
round-trip is gone. Removal was gated on runtime verification (create-only → `channel-step` returns the
resolved `productTypeId`), which passed on `localhost:8888` on 2026-07-16.

---

## 8. Endpoints & fields reference

| Item | Value |
|---|---|
| Create | `POST /labamap/api/v1/ecommerce/dynamic-products/create` — body `{ productData, context }` |
| Update | `PUT /labamap/api/v1/admin/master-products/{id}?organizationId=…` — body `{ productData, context }` |
| Step 2 schema | `POST /labamap/api/v1/ecommerce/form-schema/channel-step` — body `{ masterProductId, organizationId, storeId }` |
| Field to persist | `productTypeId` on `master_product_data` |
| Error when missing | `PRODUCT_TYPE_MISSING` (422) from the Step 2 schema build |

---

## 9. Backend fix — SHIPPED (2026-07-16)

**What changed (recommendation (a)):** `productTypeId` is now treated as a system/metadata field
(like `id`) in the create validation, so it survives into the persisted product.

- `DynamicProductCreationService.isSystemField()` now includes `"productTypeId"`, so the create
  validation no longer drops it as *"Unknown field ignored"*. It then flows
  `validatedData` → `CreateMasterProductRequestDTO` → `MasterProductDataService.save()`, which already
  set `productTypeId` from `attrs` — **the exact same line `update()` uses**. No DTO/save changes were
  needed; only the create-path validation was missing the field.
- Tests: `DynamicProductCreationServiceTest` — `productTypeId` survives validation; genuinely-unknown
  fields are still dropped (regression guard).

**Result vs acceptance criteria (§6) — runtime-verified 2026-07-16 on localhost:8888:**
- AC#1 ✅ create with `productData.productTypeId` → persisted (`validatedData` now includes it).
- AC#2 ✅ immediate `channel-step` → `masterProduct.productTypeId=…, name=Apparel`, no 422.
- AC#3 ✅ create and update persist identically.
- AC#4 ✅ create **without** a type → `channel-step` still 422s (no type fabricated).

**Frontend action:** ✅ done — create-then-update workaround removed (§7).

**Not covered:** only `productData.productTypeId` is read (what the FE already sends and what update
accepts). A `context.productTypeId`-**only** request is not consulted; tell backend if you need that
fallback and we'll add it.
