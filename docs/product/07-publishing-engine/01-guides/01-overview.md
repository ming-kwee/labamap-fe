# Publishing Engine — Overview

## Purpose

The publishing engine transforms a master product into a channel-ready payload and delivers it to the downstream sync API. It is the backend implementation of Step 3 in the ecommerce wizard, but it is also callable directly for programmatic integrations and batch operations.

Base path: `/labamap/api/v1/channels/publish`

---

## Service Architecture

```
ChannelPublishController
  └── ChannelPublishService
        ├── ChannelStoreConnectionService    (resolve store, decrypt credentials)
        ├── GenericTokenRefreshService       (OAuth token refresh before publish)
        ├── ChannelProductDataService        (load Step 2 channelData + variantOverrides)
        ├── ProductCategoryRepository        (resolve category → ProductType)
        ├── ProductTypeRepository            (load variant dimension order)
        ├── ChannelJoltSpecRepository        (category-aware JOLT lookup)
        ├── JoltTransformationService        (apply JOLT spec)
        ├── GenericPostProcessingEngine      (post-processing rules)
        ├── ApiWrapperService                (wrap flat output under rootKey)
        ├── ChannelAttributeConverterService (build SyncChannelProductRequest)
        ├── PublishResponseFactory           (rakit PublishProductResponse — collaborator murni, Fase 1 guide 41)
        └── WebClient → localhost:9000/sync_channel_product_impl
```

> **Dekomposisi God Class (guide 41) — SELESAI (8/8 fase).** `ChannelPublishService` dipecah menjadi
> orchestrator ramping + 9 collaborator kohesif; turun **3.944 → ~2.055 baris (−48%)**. Orchestrator tetap
> entry point dan hanya mendelegasikan.
> - **Fase 1 (selesai):** perakitan `PublishProductResponse` (dry-run / processing / no-op /
>   blocked-update + `buildChannelUrl` + `generatePublishId`) → `PublishResponseFactory` (murni).
> - **Fase 2 (LENGKAP):** seluruh mesin trace → `PublishTraceService`. Awalnya scoped (`snapshot`/
>   `deepCopySpec` + `assembleTraceResponse`) karena `buildTrace` berbagi helper staging dengan jalur
>   publish; setelah staging diekstrak (Fase 4a/4b), **`buildTrace` PENUH dipindah** (dep = collaborator +
>   service pipeline injectable, searah tanpa cycle). `tracePublish` tetap di orchestrator sebagai entry
>   publik TIPIS (orkestrasi core publish yang dibagi `loadAndMergeChannelData`/`findJoltSpecWithFallback`/
>   `collectPreflight` → delegasi ke `publishTraceService.buildTrace`).
> - **Fase 3 (selesai):** seluruh logika image-diff UPDATE (DiffEngine M1–M5 + M4/V2–V5, ~17 metode)
>   → `PublishImageDiffPlanner` (dep `imageService`). Orchestrator mendelegasikan 11 call-site. Detail
>   kode ada di `DiffEngine/01-update-diff-engine`.
> - **Fase 4a (selesai):** helper staging/shaping payload sinkron (7 metode: `collectSourceImageUrls`,
>   `sourceImagesForOp`, `stageVariantImages`, `stageSizeChart`, `buildPackageDimensionCm`+`toCm`,
>   `normalizeCategoryGid`) → `PublishPayloadStagingService`. Inilah helper yang dulu memblokir ekstraksi
>   trace penuh (Fase 2). Orchestrator mendelegasikan 12 call-site; unit-test `stageVariantImages` ditambahkan.
> - **Fase 4b (selesai):** grup staging REAKTIF (backfill master + kategori, 6 metode: `ensureProductTypeId`,
>   `ensureShippingAttributes`, `ensureProductImages`(+`hasNonEmpty`), `injectProductTypeVariantDimensions`,
>   `stageCategoryAttributes`) → `PublishPayloadStagingService` (+dep masterProductDataService/
>   productTypeRepository/categoryCacheService/genericCategoryService, searah tanpa cycle). `collectPreflight`
>   SENGAJA tetap di orchestrator (konsern preflight/validasi, bukan staging). Kini sisa `buildTrace`/
>   `tracePublish` (Fase 2) bisa diekstrak penuh kapan pun.
> - **Fase 8 (selesai):** komputasi diff read-only (`buildDiffResponse` + bucket helpers, `diffProbeResponse`,
>   `diffFallback`) → `PublishDiffService` (murni & stateless, tanpa dep). `publishDiff`/`computeDesiredContentHash`/
>   `stampDesiredResourceHashes` (API publik) tetap di orchestrator — menjalankan ulang pipeline via `executePublish`
>   (orkestrasi reaktif, tak bisa dipindah tanpa circular-dep).
> - **Fase 7 (selesai):** injeksi kredensial + HMAC-sign ke `publishOptions.customOptions`
>   (`injectDecryptedCredentials` murni, `enrichHmacSignedPublishOptions`, `hmacSha256Hex`) →
>   `PublishCredentialInjector` (dep tunggal `oauthAppConfig`, searah tanpa cycle). Dekripsi kredensial +
>   token-refresh TETAP di `resolveStoreAndPublish` (orkestrasi reaktif) — collaborator hanya memetakan
>   kredensial yang SUDAH didekripsi.
> - **Fase 5 (selesai):** leaf-helper persistensi pasca-publish (`persistChannelIds`, `persistContentHashes`,
>   `persistImageOrder`, `persistPublishedApiVersion`, `persistPushedCategory`, `recordHistory` + util static
>   `contentHashOfChannelPayload`) → `PublishOutcomeWriter` (dep `channelProductDataService`/`publishHistoryService`,
>   searah tanpa cycle). Orkestrator outcome (`updateChannelProductStatus`/`recordFailedOutcome`/`updateDelistOutcome`)
>   tetap di orchestrator (menjalin banyak dep + helper status) & mendelegasikan ke leaf-helper.
> - **Fase 6 (selesai):** resolusi JOLT spec — `findJoltSpecWithFallback` (fallback priority + version-match),
>   `calculatePriority`, `logSpecStalenessIfAny` (telemetri observe-only), `shouldAttemptJoltRecovery`/
>   `isJoltRelatedError` (gerbang auto-recovery) → `PublishJoltResolver` (dep tunggal `channelJoltSpecRepository`,
>   dihapus dari orchestrator). Injeksi critical-field / remediation ownership-contract / gerbang semantic+collision
>   / trigger LLM jolt-gen TIDAK ikut — terjalin inline di `processPublish` (orkestrasi reaktif), bukan helper.

---

## Full Pipeline

For each publish request:

```
1.  STORE-AWARE SETUP (only when storeId is present)
    a. Load ChannelStoreConnection (channelType, credentials, tokenExpiry)
    b. Derive channelId from store's channelType
    c. Load ChannelConfiguration for channelType
    d. Token refresh: compare now vs tokenExpiry[credKey] - bufferMinutes
       - If expiring: call channel token refresh endpoint, update store credentials
       - If refresh token invalid (401/403): reconnectRequired=true, abort
    e. Data-driven credential injection into request.publishOptions.customOptions
       (via channelConfig.integrationConfig.authentication.credentialMapping)
       Also injects: storeId, storeUrl, full decrypted credentials map
    f. Load channel_product_data for (masterProductId × storeId)
       Merge priority (lowest → highest):
         masterProduct < masterOverrides < channelData < variantOverrides[sku]
    g. Inject _productTypeVariantDimensions into masterProductData
       (resolved from masterProductData.categoryId → ProductCategory → ProductType)
       Also injects _productTypeName. Fire-and-forget on error.

2.  VALIDATION
    - masterProductId required
    - masterProductData required and non-empty
    - channelId required
    - joltSpec validated only if provided in request (it is optional — stored JOLT is loaded in step 3)

3.  CHANNEL CONFIG
    - Load active ChannelConfiguration for channelId

4.  JOLT SPEC RESOLUTION
    Priority (highest wins):
      a. channel_jolt_specs (by channelId + categoryId + organizationId, with 4-level fallback)
      b. request.joltSpec
    If neither found → 400 error with guidance to run /analyze with persistJolt=true

5.  JOLT TRANSFORMATION
    JoltTransformationService.transform(masterProductData, joltSpec)
    → Map<String, Object> transformedData

6.  POST-PROCESSING RULES
    GenericPostProcessingEngine.process(transformedData, channelConfig)
    Applied only when channelConfig.postProcessingRules is non-empty.

7.  POST-JOLT VARIANT OVERRIDE MERGE
    For each SKU in request.variantOverrides:
      Find matching variant in transformedData (top-level "variants" key, or one level deep)
      Merge non-null fields from variantOverrides[sku] onto variant node.
    Channel-specific variant fields (barcode, inventory_policy, etc.) that were not in
    the JOLT spec reach the channel API through this step.

8.  PAYLOAD WRAPPING
    If transformedData already has the rootKey (e.g. "product") → already wrapped, skip.
    Otherwise → ApiWrapperService.wrapPayload(transformedData, channelConfig)

9.  DRY RUN GATE
    dryRun=true → return wrapped transformedData, syncStatus="DRY_RUN", skip steps 10–12.

10. SYNC API CONVERSION
    ChannelAttributeConverterService.convertToSyncRequest(wrappedData, request, channelConfig, publishId)
    Builds: channelAttributes, variantGroups, optionGroups, metadataGroups, channelCredentials

11. SYNC API CALL
    POST localhost:9000/sync_channel_product_impl
    → SyncApiResponse: success, channelProductId, eventId, status, warnings, errors

12. STATUS UPDATE
    channel_product_data.status = PUBLISHED (success) or FAILED (failure)
    Skipped on dryRun.
```

---

## Two Publish Flows

### Store-aware flow (preferred)

When `storeId` is provided the service resolves the full store context automatically:
- credentials are decrypted and injected via the credential mapping in `ChannelConfiguration`
- Step 2 channel data and variant overrides are loaded and merged
- `channel_product_data` status is updated after publish

### Legacy flow (channelId-only)

When only `channelId` is provided (no `storeId`), credentials must be supplied explicitly in `publishOptions.customOptions`. Step 2 data is not merged. Status is not updated.

---

## Publish ID Format

```
pub_{epoch_ms}_{channelId}_{masterProductId}
```

Example: `pub_1746000000000_shopify_prod_abc123`

This ID is the `eventId` in the `SyncChannelProductRequest`, and is returned as `publishId` in the response.
Dibangun oleh `PublishResponseFactory.generatePublishId(request)` (Fase 1 dekomposisi guide 41).

---

## dryRun Mode

`dryRun: true` runs steps 1–8 (all transformation steps) and returns the wrapped, post-processed payload as `publishedData` without calling the sync API. No status update occurs.

Use for: testing JOLT specs, validating step 2 data merges, previewing channel payloads.

`syncStatus` = `"DRY_RUN"` in the response.

---

## Services in this Module

| Service | Package | Role |
|---------|---------|------|
| `ChannelPublishService` | `publishing/service/` | Orchestrates the full pipeline |
| `PublishResponseFactory` | `publishing/service/` | Merakit `PublishProductResponse` (dry-run/processing/no-op/blocked) + `buildChannelUrl`/`generatePublishId` — collaborator murni tanpa dependency (Fase 1 dekomposisi guide 41) |
| `PublishTraceService` | `publishing/service/` | Mesin publish-trace inspector: `snapshot`/`deepCopySpec`, `assembleTraceResponse` (gerbang preflight/semantic), + **`buildTrace` penuh** (replikasi pipeline produksi). Dep = collaborator + service pipeline injectable, searah tanpa cycle (Fase 2 LENGKAP, guide 41) |
| `PublishImageDiffPlanner` | `publishing/service/` | Perencana image-diff UPDATE (DiffEngine M1–M5 + M4/V2–V5): add-only product/variant image, hitung delete/orphan, re-asosiasi variant, merge id, urutan+reorder, scrub srcless, gerbang media-sync — dep `imageService` (Fase 3 dekomposisi guide 41) |
| `PublishPayloadStagingService` | `publishing/service/` | Helper staging/shaping payload. **Sinkron** (4a): `collectSourceImageUrls`, `sourceImagesForOp`, `stageVariantImages`, `stageSizeChart`, `buildPackageDimensionCm`, `normalizeCategoryGid`. **Reaktif** (4b): `ensureProductTypeId`/`ensureShippingAttributes`/`ensureProductImages` (backfill dari master), `injectProductTypeVariantDimensions`, `stageCategoryAttributes`. Dep: imageService/channelAttributeConverterService/imageDiffPlanner + masterProductDataService/productTypeRepository/categoryCacheService/genericCategoryService (Fase 4a+4b dekomposisi guide 41) |
| `PublishJoltResolver` | `publishing/service/` | Resolusi JOLT spec: `findJoltSpecWithFallback` (fallback priority + version-match), `calculatePriority`, `logSpecStalenessIfAny` (telemetri staleness observe-only), `shouldAttemptJoltRecovery`/`isJoltRelatedError` (gerbang auto-recovery). Dep tunggal `channelJoltSpecRepository`, searah tanpa cycle (Fase 6 dekomposisi guide 41) |
| `PublishOutcomeWriter` | `publishing/service/` | Leaf-helper persistensi pasca-publish (best-effort): `persistChannelIds`, `persistContentHashes`, `persistImageOrder`, `persistPublishedApiVersion`, `persistPushedCategory`, `recordHistory` (`publish_history`) + util static `contentHashOfChannelPayload`. Dep `channelProductDataService`/`publishHistoryService`. Orkestrator outcome (`updateChannelProductStatus`/`recordFailedOutcome`/`updateDelistOutcome`) tetap di orchestrator & mendelegasikan (Fase 5 dekomposisi guide 41) |
| `PublishCredentialInjector` | `publishing/service/` | Injeksi kredensial & HMAC-sign ke `publishOptions.customOptions`: `injectDecryptedCredentials` (murni — map kredensial ter-dekripsi via `credentialMapping`), `enrichHmacSignedPublishOptions` (pra-hitung HMAC-SHA256 sign, mis. Shopee) + `hmacSha256Hex`. Dep tunggal `oauthAppConfig`. Dekripsi+token-refresh tetap di orkestrasi (Fase 7 dekomposisi guide 41) |
| `PublishDiffService` | `publishing/service/` | Komputasi diff read-only (DiffEngine 02): `buildDiffResponse` (+bucket `diffVariants`/`diffImages`/`allNoopBucket`/`changeCount`/`hashesOf`/`mergeHashes`), `diffProbeResponse`, `diffFallback`. **Murni & stateless** (tanpa dep injected). `publishDiff`/`computeDesiredContentHash`/`stampDesiredResourceHashes` (API publik) tetap di orchestrator — menjalankan ulang pipeline via `executePublish` (Fase 8 dekomposisi guide 41) |
| `ChannelAttributeConverterService` | `publishing/service/` | Converts transformed data → `SyncChannelProductRequest` |
| `FieldTransformationService` | `publishing/service/` | Atomic field-level type conversions |
| `PublishAnalysisService` | `publishing/service/` | Pre-flight analysis (service complete, no endpoint yet) |
| `JoltTransformationService` | `channel/service/` | Applies JOLT transformation spec |
| `GenericPostProcessingEngine` | `channel/service/` | Applies post-processing rules |
| `ApiWrapperService` | `channel/service/` | Wraps flat payload under rootKey |
| `GenericTokenRefreshService` | `channel/store/service/` | Data-driven OAuth token refresh |

---

## Error Handling

| Scenario | HTTP status | syncStatus |
|----------|-------------|------------|
| Invalid request (missing required fields) | 400 | FAILED |
| No JOLT spec available | 400 | FAILED |
| Sync API HTTP error | 200 (body success=false) | FAILED |
| Unexpected exception | 500 | FAILED |
| Partial sync API response (success=false) | 400 | per sync response |

All error responses include a `PublishError` with `field`, `errorCode`, `message`, and `suggestion`.

---

## Related Guides — AI JOLT-Generation Agent

The JOLT spec applied in step 5 can be **generated by an AI agent** (`JoltGenerationAgentService`) rather
than hand-written. These guides explain how that agent respects the **JOLT ↔ post-processing split** so it
converges instead of looping, and how it turns genuine gaps into developer recommendations:

- [15-jolt-agent-post-processing-split-konvergensi.md](15-jolt-agent-post-processing-split-konvergensi.md)
  — why the agent used to get stuck (it tried to map fields post-processing owns, e.g. images → collision),
  and the two fixes that make it converge: **#1** stripping post-processing-owned mappings at validation,
  and **#2** coverage-aware completeness (post-processing-built required fields are not "missing").
- [16-jolt-agent-gap-recommendations.md](16-jolt-agent-gap-recommendations.md)
  — **#3** the data-driven post-processing **op catalog** surfaced to the agent, and how genuine gaps are
  routed to the review queue via `AiRecommendation.Analysis.postProcessingGaps`.
