# Frontend Notes — Publish Pre-flight Gate (actionable Sync errors)

**Audience:** Frontend team
**Backend commit:** `18f9dee`
**FE status:** ✅ Implemented in this repo (v8) — see [Implementation status](#implementation-status-this-repo)

**TL;DR:** `POST /channels/publish` now validates **product content before calling the channel**. If a
merchant-fixable field is missing, it returns `400` with **per-field, actionable** errors — no channel
round-trip. The response **schema is unchanged**; only two field *values* are new (`syncStatus:"BLOCKED"`,
`errorCode:"MISSING_REQUIRED_FIELD"`), and `errors[].field` is now a real field name.

> ⚠️ **A FE change *was* required** (now done — see the status section). The original note said "no mandatory
> FE change"; that was wrong for the publish path. The Sync flow funneled the 400 through an error parser
> that only understood Spring bean-validation (`defaultMessage`), so the gate's new `message`/`suggestion`
> rendered as **`[object Object]`**. The parser now reads both shapes.

---

## What changed

Before, a Sync of an incomplete product went to the channel, got rejected, and returned a cryptic error
(`field:"general"`, raw channel/exception text, `suggestion:"Check logs…"`). Now a pre-flight gate runs
first and blocks with clear guidance.

Affected endpoints (store-based publish): `POST /api/v1/channels/publish` and `POST /api/v1/channels/publish/batch`
(the gate runs per store, so it appears inside each store's result in the batch response).

The gate blocks on **merchant-fixable** content only:
- **Universal:** product must have a `name` (or `title`).
- **Data-driven:** every visible required Step-2 field must be filled (same rules as the completion %).

System/config problems (missing JOLT spec, transformation failure) are **not** gated here — they stay as
generic errors (`errorCode:"PUBLISH_FAILED"`, `syncStatus:"FAILED"`).

---

## Contract — what stayed the same, what's new

| Aspect | Status |
|---|---|
| Request body (`PublishProductRequest`) | **unchanged** |
| Response shape (`PublishProductResponse`, incl. `errors[] {field, errorCode, message, suggestion}`) | **unchanged** |
| HTTP status: success = `200`, failure/block = `400` | **unchanged** (block reuses the existing 400 failure path) |
| `errors[].errorCode` | **new value** `"MISSING_REQUIRED_FIELD"` (alongside existing `"PUBLISH_FAILED"`) |
| `syncStatus` | **new value** `"BLOCKED"` (alongside existing `"FAILED"` / `"COMPLETED"`) |
| `errors[].field` | now a **real product field name** (e.g. `"material"`, `"name"`) instead of `"general"` |

### Blocked response example (`HTTP 400`)
```json
{
  "success": false,
  "syncStatus": "BLOCKED",
  "publishId": "…",
  "channelProductId": null,
  "errors": [
    { "field": "name",     "errorCode": "MISSING_REQUIRED_FIELD",
      "message": "Product name is required to publish to wix",
      "suggestion": "Add a name (or title) to your product" },
    { "field": "material", "errorCode": "MISSING_REQUIRED_FIELD",
      "message": "Material is required to publish to wix",
      "suggestion": "Fill in Material for this channel" }
  ]
}
```

### Generic failure (unchanged) — still `HTTP 400`
```json
{ "success": false, "syncStatus": "FAILED",
  "errors": [ { "field": "general", "errorCode": "PUBLISH_FAILED",
                "message": "…", "suggestion": "Check logs …" } ] }
```

---

## Implementation status (this repo)

All items below are ✅ done in `free-nextjs-admin-dashboard` (v8). File paths are under
`src/modules/ecommerce-product-v2/`.

**1. ✅ Actionable messages render correctly (no more `[object Object]`)**
`step2-channel-fields/services/channelStore.service.ts`
- `buildApiError` refactored: parse the 400 body **once**, extract structured errors via
  `extractFieldErrors()`, which understands **both** shapes — `message`/`suggestion` (pre-flight gate) and
  `defaultMessage` (Spring bean-validation). The summary string now uses `message ?? suggestion`, so the
  merchant sees the real sentence instead of `[object Object]`.
- The old `parseErrorMessage` (only used here) was removed.

**2. ✅ Structured errors propagated & highlighted per field**
`step2-channel-fields/types/channelStore.ts` + `step3-publish/components/PublishDashboard.tsx`
- Types: new `PublishFieldError { field, errorCode, message, suggestion }`; `StorePublishResult` gains
  `status:"BLOCKED"` + `fieldErrors?`; `ChannelApiError` carries `readonly fieldErrors?`.
- `handlePublishSingle` reads `err.fieldErrors`; when any `MISSING_REQUIRED_FIELD` is present → status
  **BLOCKED** (merchant-fixable) instead of FAILED (system error).
- The error box became a **per-field list**: friendly field label (`friendlyField`) + `message` +
  `suggestion` — **amber** styling for BLOCKED (with a "Lengkapi di Channel Fields →" link) vs **red** for
  FAILED. Falls back to a single message when there are no `fieldErrors`.

**3. ✅ Batch path + KPI aligned** — `step3-publish/components/PublishDashboard.tsx`
- In the batch path a BLOCKED store **collapses to a FAILED badge**, but `publishResults` keeps the raw
  `status` + `fieldErrors`; the "Failed" KPI tile counts BLOCKED too.

### Not adopted
- ❌ **"Retire the merchant readiness step (`handleAnalyze`)"** — **rejected.** The pre-flight gate (a hard
  publish block) and the readiness dry-run (Publish Diagnostics) are **complementary**, and Publish
  Diagnostics is an active surface. The gate does not replace it.

---

## Scope / limits (so expectations match backend)

- Gate runs on the **store-based** publish path (when `storeId` is present). A raw publish without a store
  is not gated here.
- Required channel fields depend on category resolution. When no `categoryId` is available, only the
  **universal name/title** check applies (channel-specific required fields are not checked) — best-effort by
  design, never blocks Sync from running.

---

## Known limitation (pre-existing — not introduced by this change)

The **single**-publish KPI can double-count on a re-sync. `handlePublishSingle`'s `catch` updates only
`publishResults` (not `storeData[].status`), so a store that was previously PUBLISHED and is then re-synced
into FAILED/BLOCKED keeps a stale `storeData.status = "PUBLISHED"`. The KPI tiles then count that store in
**both** `Published` (`storeData.status === "PUBLISHED"`, `PublishDashboard.tsx:546`) **and** `Failed`
(`publishResults.status === "FAILED"/"BLOCKED"`, `:551–552`), so `Published + Failed` can exceed `Total`.

- Affects **FAILED and BLOCKED equally** — it is **not** specific to the pre-flight gate; the gate work only
  reuses the existing single-path failure handling.
- The store **badge is unaffected** — it reads `publishResults.status` (`:717–720`), so it still shows FAILED.
- The **batch** path is unaffected — it always resets `storeData.status` (`:530–531`).
- Fix (small): in the `handlePublishSingle` `catch`, also `setStoreData(… status: "FAILED" …)` like the batch
  path, so `storeData.status` is never stale.
