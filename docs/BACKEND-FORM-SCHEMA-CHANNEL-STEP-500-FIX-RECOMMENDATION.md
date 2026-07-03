# Backend Fix Recommendation — `form-schema/channel-step` returns 500 for products with null `productTypeId`

**Date:** 2026-07-03
**Author:** Frontend Team
**Status:** 🔴 Open — backend fix required (frontend can only mitigate, not fix root cause)
**Severity:** High — Step 2 (Channel Fields) unusable for any product without a Product Type; dead-ends the merchant with an unactionable "Internal Server Error".
**Endpoint:** `POST /api/v1/ecommerce/form-schema/channel-step`

---

## 1. Summary

`POST /ecommerce/form-schema/channel-step` throws an **unhandled 500** (empty body) when the
target master product has **`productTypeId = null`**. The Step 2 wizard cannot render and shows
`"Failed to load channel schema — Internal Server Error"` with no way forward.

Expected: a **graceful 4xx** (e.g. `422`/`400`) with an actionable message such as
*"Product has no product type assigned"* — so the frontend can guide the merchant to fix it.

---

## 2. Impact / how it surfaces to users

Reproduced flow (real data, org `org-e7dac9f8-…`, product `test 1`):

1. **My Products → open product** → lands on **Step 3 "Publish to Sales Channel"**. Works
   (Step 3 only reads `getAllStoreData` / `channel-product-data`, which does not need the form schema).
2. **Step 3 → "Back to Channel Fields"** → **Step 2 wizard** → calls this endpoint → **500**.
3. UI renders: **"Failed to load channel schema / Internal Server Error"** + Retry (retry also 500s).

> Note: this is **not** navigation-specific. The request body is identical from any entry path
> (`{ masterProductId, organizationId }` only). Step 2 500s for this product **always**; it just
> happens that entering via My Products drops the user straight into Step 3, so "Back to Channel
> Fields" is the first action that hits the product-type-dependent Step 2. Through the normal
> create wizard (Step 1 → 2 → 3), Step 1 assigns a Product Type first, so Step 2 succeeds.

---

## 3. Reproduction (verified live 2026-07-03)

```bash
ORG="org-e7dac9f8-6353-4168-b9a1-6a7791d71b02"
PID="ccf4bce7-4e5f-4a0a-b88a-e5d216daa8c0"   # product "test 1"

# The failing call:
curl -i -X POST "http://localhost:8888/labamap/api/v1/ecommerce/form-schema/channel-step" \
  -H "Content-Type: application/json" \
  -d "{\"masterProductId\":\"$PID\",\"organizationId\":\"$ORG\"}"
```

**Actual response:**
```
HTTP/1.1 500 Internal Server Error
X-Content-Type-Options: nosniff
content-length: 0            ← empty body (unhandled exception, no error JSON)
```

A **non-existent** `masterProductId` also returns `500` (not `404`) — consistent with the
endpoint failing before/instead of resolving the product+type gracefully.

---

## 4. Root cause (primary suspect)

The product has **`productTypeId = null`**:

```jsonc
// GET /admin/master-products/{PID}?organizationId={ORG}
{ "productId": "ccf4bce7-…", "name": "test 1",
  "productTypeId": null,   // ← no product type
  "category": null, "variantCount": 2, "status": "ACTIVE" }
```

The Step 2 form schema is built from the **Product Type's attribute definitions** (that's what
drives the per-channel tabbed form). With `productTypeId = null`, the schema builder most likely
dereferences a null product-type → **NPE → 500**.

*(We can't 100% confirm the exact line without the server stack trace — please check the backend
log for the exception on this endpoint. All circumstantial evidence points to the null product type:
empty 500 body, null productTypeId, and the fact that Step 3 — which doesn't touch the product type —
works for the same product.)*

How can a product reach this state? `test 1` appears to be a **legacy/orphan** product with channel
stores already connected (3 stores in `channel-product-data`) but **no Product Type** — likely
created before Product Type became required, or via a path that skipped the assignment.

---

## 5. Requested fix (backend)

**Primary:** make `POST /ecommerce/form-schema/channel-step` **fail gracefully** when the product
has no product type (or the product/type cannot be resolved):

- Return **`422 Unprocessable Entity`** (or `400`) with a JSON body, e.g.:
  ```jsonc
  { "error": "PRODUCT_TYPE_MISSING",
    "message": "Product 'ccf4bce7-…' has no product type assigned. Assign a product type in Step 1 before configuring channel fields." }
  ```
- Same treatment for a non-existent `masterProductId` → **`404`** with a message (currently `500`).

**Optional (nice to have):** if a product with connected stores but no product type is considered a
valid state, define a **default/fallback product type** so the schema can still render — otherwise
the graceful 4xx above is sufficient and the frontend will route the user to fix it.

---

## 6. Frontend side (what we will do once the contract is graceful)

We will **not** work around a raw 500 by guessing. Once the endpoint returns a meaningful 4xx we will:
- Detect `PRODUCT_TYPE_MISSING` (or the 4xx) and show an **actionable message** + link to Step 1
  (Master Product) instead of the current "Internal Server Error" dead-end.
- Optionally pre-guard: if `productTypeId` is null on the loaded product, show that guidance
  **before** calling the endpoint.

Until then, Step 2 remains blocked for product `test 1` (and any product without a product type).

---

## 7. Quick reference

| | Value |
|---|---|
| Endpoint | `POST /api/v1/ecommerce/form-schema/channel-step` |
| Request body | `{ "masterProductId": "...", "organizationId": "..." }` |
| Trigger | product with `productTypeId = null` (also: non-existent productId) |
| Actual | `500 Internal Server Error`, empty body |
| Expected | `422`/`400` with `{ error, message }` (and `404` for unknown productId) |
| Frontend caller | `ChannelFieldsWizard.loadSchema()` → `ChannelSchemaService.generateChannelStepSchema()` |
| Also affected | any Step 2 entry for a product missing its Product Type |
