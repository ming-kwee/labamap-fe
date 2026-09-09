# Rencana Refactor: Dekomposisi `ChannelPublishService` (God Class)

**Status:** ✅ **SELESAI — Fase 1–8 LENGKAP** (branch `bff-v19`). `ChannelPublishService` dipecah dari
**3.944 → ~2.055 baris (−48%)** menjadi **orchestrator ramping + 9 collaborator kohesif**, secara
**bertahap, behavior-preserving, dan test-guarded** — tanpa mengubah perilaku publish sedikit pun.
Semua 111 test penjaga hijau di setiap fase. API publik (6 metode) tak berubah.

> **Progress:**
> - **Fase 1 ✅ (bff-v19):** `PublishResponseFactory` diekstrak — 6 metode perakitan response
>   (`buildDryRunResponse`, `buildProcessingResponse`, `buildNoOpResponse`, `buildBlockedUpdateResponse`,
>   `buildChannelUrl`, `generatePublishId`) dipindah ke collaborator **murni tanpa dependency**; 8 call-site
>   di orchestrator kini mendelegasikan. `ChannelPublishService` turun **3.944 → 3.787 baris** (−157).
>   102 test penjaga hijau (BUILD SUCCESS). Dokumen tersinkron: `01-overview`, `07-data-driven-channel-config`,
>   `arsitektur/03,04,05`.
> - **Fase 2 ✅ SCOPED (bff-v19):** `PublishTraceService` (murni, dep `objectMapper`) — memuat
>   `snapshot` + `deepCopySpec` (util JSON trace-only) + `assembleTraceResponse` (perakitan
>   `PublishTraceResponse` + gerbang preflight/semantic dari nilai tahap yang sudah dihitung). `buildTrace`
>   kini mendelegasikan ekor perakitannya. Turun **3.787 → 3.713 baris** (−74). 102 test penjaga hijau.
>   Dokumen tersinkron: `01-overview`, `14-publish-trace-inspector`, `BACKEND-PUBLISH-TRACE-GATE-RECOMMENDATION`.
>   **⚠️ Temuan audit (ubah urutan):** `tracePublish` + inti `buildTrace` TIDAK dipindah karena
>   menjalankan ulang pipeline produksi & **berbagi 5 helper staging/guard instance-private**
>   (`collectSourceImageUrls`, `stageVariantImages`, `sourceImagesForOp`, `stageSizeChart`,
>   `normalizeCategoryGid`) dengan `processPublish` — itu milik **Fase 4** (`PublishPayloadStagingService`).
>   Ekstraksi trace PENUH baru bersih **setelah Fase 4**. Memaksanya sekarang = duplikasi (dilarang
>   CLAUDE.md) atau circular-dep. Jadi urutan efektif: **… → Fase 4 (staging) → sisa trace**.
> - **Fase 3 ✅ (bff-v19):** `PublishImageDiffPlanner` (dep `imageService`) — seluruh logika image-diff
>   UPDATE DiffEngine M1–M5 + M4/V2–V5 (~17 metode: `filterProduct/VariantImagesForUpdate`,
>   `applyVariantImageAddOnly`, `computeDeleteImageIds`/`computeOrphanedImageIds`,
>   `computeVariantImageAssociations`, `mergeImageChannelIds`, `computeImageOrder`/`applyImageReorder`/
>   `reorderNeeded`/`keptImageIds`, `removeSrclessImages`, `productImagesChanged`, `channelTracksImages`)
>   dipindah; metode pure static tetap static (dipanggil test via `PublishImageDiffPlanner.<m>`).
>   Orchestrator mendelegasikan 11 call-site. Turun **3.713 → 3.263 baris** (−450). 102 test penjaga hijau
>   (BUILD SUCCESS); 6 test image-diff di-repoint tanpa ubah asersi. Dokumen tersinkron: `01-overview`,
>   `DiffEngine/01` (catatan lokasi kode terpusat), `DiffEngine/10`, `reversesync/07`.
> - **Fase 2 ✅ LENGKAP (bff-v19):** `buildTrace` PENUH (~135 baris) dipindah dari orchestrator ke
>   `PublishTraceService` (+dep pipeline: joltSemanticValidator, postProcessingContractService,
>   joltTransformationService, genericPostProcessingEngine, apiWrapperService, channelAttributeConverterService,
>   payloadStaging — semua @Service singleton, searah tanpa cycle; util static ApiSchemaFingerprint/
>   PublishImageDiffPlanner/PublishPayloadStagingService dipakai apa adanya). Ini baru mungkin setelah staging
>   pindah (Fase 4a/4b) — `buildTrace` kini tak menyentuh metode private CPS. `tracePublish` TETAP di orchestrator
>   sebagai entry publik tipis (guide 41: pertahankan 6 API publik) — ia mengorkestrasi core publish yang dibagi
>   (`loadAndMergeChannelData` + `findJoltSpecWithFallback` = Fase 5/6; `collectPreflight` = preflight) lalu delegasi
>   ke `publishTraceService.buildTrace`. Turun **2.798 → 2.665 baris** (−133). 108 test hijau (BUILD SUCCESS).
>   Dokumen tersinkron: `14-publish-trace-inspector`, `BACKEND-PUBLISH-TRACE-GATE-RECOMMENDATION`, `01-overview`.
> - **Fase 4b ✅ (bff-v19):** `PublishPayloadStagingService` +grup staging REAKTIF (backfill master + kategori):
>   `ensureProductTypeId`, `ensureShippingAttributes`, `ensureProductImages`(+`hasNonEmpty`),
>   `injectProductTypeVariantDimensions`, `stageCategoryAttributes` (~250 baris). +dep masterProductDataService,
>   productTypeRepository, categoryCacheService, genericCategoryService (searah, tanpa cycle). Orchestrator
>   mendelegasikan 6 call-site (termasuk method-ref `this::` di 2 chain publish + tracePublish); field
>   productTypeRepository & genericCategoryService dihapus dari orchestrator (tak lagi dipakai; masterProductDataService
>   & categoryCacheService tetap — dipakai persistence/preflight). Turun **3.048 → 2.798 baris** (−250). 108 test
>   hijau (BUILD SUCCESS). `collectPreflight` SENGAJA tetap di orchestrator (konsern preflight, bukan staging).
>   Dokumen tersinkron: `01-overview`, `03-attribute-conversion`, `27-tiktok-category-attributes`, `SizeChart/01`,
>   `reversesync/08`. **Kini sisa `buildTrace`/`tracePublish` (Fase 2) bisa diekstrak penuh.**
> - **Fase 4a ✅ (bff-v19):** `PublishPayloadStagingService` (dep `imageService`, `channelAttributeConverterService`,
>   `imageDiffPlanner` — searah, tanpa cycle) — 7 helper staging/shaping payload SINKRON yang dibagi
>   `processPublish`↔`buildTrace` (helper yang memblokir trace di Fase 2): `collectSourceImageUrls`,
>   `sourceImagesForOp`, `stageVariantImages`, `stageSizeChart`, `buildPackageDimensionCm`(+`toCm`),
>   `normalizeCategoryGid`. Orchestrator mendelegasikan 12 call-site; field `imageService` dihapus dari
>   orchestrator (tak lagi dipakai langsung). Turun **3.263 → 3.048 baris** (−215). **106 test hijau**
>   (BUILD SUCCESS): +`StageVariantImagesTest` (4 test, guard bug variant-image Shopee) & `BuildPackageDimensionCmTest`
>   di-repoint. Dokumen tersinkron: `01-overview`, `07-data-driven-channel-config`, `11/13/37/38`,
>   `DiffEngine/05`, `SizeChart/01`, `images/README`.
>   **Fase 4b (sisa staging):** backfill reaktif + kategori (`ensureProductTypeId`, `ensureShippingAttributes`,
>   `injectProductTypeVariantDimensions`, `stageCategoryAttributes`, `collectPreflight`) — dep berat & reaktif;
>   setelah itu barulah sisa `buildTrace`/`tracePublish` (Fase 2) bisa diekstrak penuh.

> - **Fase 6 ✅ (bff-v19):** `PublishJoltResolver` (dep tunggal `channelJoltSpecRepository`, searah tanpa cycle)
>   — resolusi JOLT spec: `findJoltSpecWithFallback` (fallback priority + version-match Fase 3), `calculatePriority`
>   (delegasi `ChannelJoltSpec.resolutionPriority`), `logSpecStalenessIfAny` (telemetri observe-only), `shouldAttemptJoltRecovery`
>   /`isJoltRelatedError` (gerbang auto-recovery LLM). Orchestrator mendelegasikan 4 call-site (2 di tracePublish+executePublish,
>   1 staleness di processPublish, 1 recovery-gate); field `channelJoltSpecRepository` + import repo dihapus dari orchestrator.
>   Turun **2.665 → 2.545 baris** (−120). 111 test hijau (BUILD SUCCESS); `ChannelPublishServiceJoltPriorityTest` di-repoint.
>   **Sengaja TIDAK ikut:** injeksi critical-field (`ensureCriticalFields`), remediation ownership-contract, gerbang
>   semantic+collision, trigger LLM jolt-gen — semua terjalin INLINE di `processPublish` (orkestrasi reaktif), bukan
>   helper berdiri sendiri; ekstraksinya = refactor orkestrasi (risiko tinggi, di luar scope Fase 6). `findJoltSpecWithFallback`
>   kini di collaborator → satu dari dua penghalang ekstraksi penuh `tracePublish` hilang (sisa: `loadAndMergeChannelData`).
>   Dokumen tersinkron: `01-overview`, `ai/EXAMPLE-WALKTHROUGH-SHOPIFY`.

> - **Fase 5 ✅ (bff-v19):** `PublishOutcomeWriter` (dep `channelProductDataService` + `publishHistoryService`, searah
>   tanpa cycle) — 6 leaf-helper persistensi pasca-publish (`persistChannelIds`, `persistContentHashes`, `persistImageOrder`,
>   `persistPublishedApiVersion`, `persistPushedCategory` [signature di-decouple: `categorySyncNeeded`+`desiredCategory`
>   params, bukan `request`+`resolveDesiredCategory`], `recordHistory`) + util static `contentHashOfChannelPayload`
>   (dipindah dari CPS; dipakai bersama recordHistory + 2 call-site CPS via `PublishOutcomeWriter.contentHashOfChannelPayload`).
>   Orchestrator mendelegasikan 15 call-site (persist ×5, recordHistory ×10). Field `publishHistoryService` + import
>   `PublishHistoryEntry`/`ContentHash` dihapus dari orchestrator; `channelProductDataService` TETAP (22 pemakaian).
>   Turun **2.545 → 2.374 baris** (−171). 111 test hijau (BUILD SUCCESS); `ContentHashPayloadTest` di-repoint.
>   **Sengaja TIDAK ikut:** orkestrator outcome `updateChannelProductStatus`/`recordFailedOutcome`/`updateDelistOutcome`
>   — menjalin banyak dep (publishJobService/publishRetryService/masterProductDataService/imageDiffPlanner + helper
>   status opOf/isBlockedSyncStatus/isAmbiguousCreateFailure) & terikat orkestrasi reaktif; mereka mendelegasikan ke
>   leaf-helper. Dokumen tersinkron: `01-overview`, `arsitektur/02,03`.

> - **Fase 7 ✅ (bff-v19):** `PublishCredentialInjector` (dep tunggal `oauthAppConfig`, searah tanpa cycle) —
>   `injectDecryptedCredentials` (MURNI: map kredensial ter-dekripsi → customOptions via `credentialMapping`),
>   `enrichHmacSignedPublishOptions` (pra-hitung HMAC-SHA256 sign, mis. Shopee `add_item`), `hmacSha256Hex`.
>   Orchestrator mendelegasikan 5 call-site; field `oauthAppConfig` + import OAuthAppConfig/EndpointVersionTemplate/
>   Mac/SecretKeySpec/StandardCharsets/HexFormat dihapus (+ pembersihan import mati lain: ApiSchemaFingerprint/
>   Comparator/LinkedHashMap dari fase sebelumnya). Turun **2.374 → 2.247 baris** (−127). 111 test hijau (BUILD SUCCESS).
>   Audit menyempurnakan plan: dep RINGAN `oauthAppConfig` saja — dekripsi kredensial (credentialEncryptionService) +
>   token-refresh (tokenRefreshService) + resolve store (storeConnectionService) yang plan cantumkan TETAP di
>   `resolveStoreAndPublish` (orkestrasi reaktif); collaborator hanya memetakan kredensial yang SUDAH didekripsi.
>   Dokumen tersinkron: `01-overview`, `07-data-driven-channel-config`, `versioning/05`.

> - **Fase 8 ✅ (bff-v19):** `PublishDiffService` (MURNI & stateless — TANPA dep injected) — komputasi diff
>   read-only DiffEngine 02: `buildDiffResponse` (+bucket `diffVariants`/`diffImages`/`allNoopBucket`/`changeCount`/
>   `hashesOf`/`mergeHashes`), `diffProbeResponse`, `diffFallback`. Orchestrator mendelegasikan 4 call-site.
>   Turun **2.247 → 2.055 baris** (−192). 111 test hijau (BUILD SUCCESS); `PublishDiffResponseTest` di-repoint.
>   **Sengaja TIDAK ikut:** `publishDiff`/`computeDesiredContentHash`/`stampDesiredResourceHashes` (API publik) —
>   menjalankan ULANG pipeline via `executePublish` + `loadAndMergeChannelData` + `storeConnectionService`
>   (orkestrasi reaktif); memindahnya = circular-dep (sama seperti `tracePublish`). Dokumen: `01-overview`.
>
> **🏁 SELESAI (8/8 fase).** 9 collaborator: PublishResponseFactory, PublishTraceService, PublishImageDiffPlanner,
> PublishPayloadStagingService, PublishOutcomeWriter, PublishJoltResolver, PublishCredentialInjector,
> PublishDiffService (+DTO/util yang sudah ada). Kumulatif **3.944 → 2.055 baris (−1.889, −48%)**; dep turun
> dari 37 → ~29 (imageService, productTypeRepository, genericCategoryService, channelJoltSpecRepository,
> publishHistoryService, oauthAppConfig dipindah). Sisa di orchestrator = **entry-point + orkestrasi reaktif
> murni** (resolveStoreAndPublish, executePublish, processPublish, doChannelSyncPublish, publishDiff/tracePublish
> shell, updateChannelProductStatus) + helper orkestrasi yang tak layak dipindah tanpa memecah alur reaktif.

> ## ⚠️ DISIPLIN DOKUMENTASI (WAJIB di SETIAP fase)
> Kelas ini dirujuk **~66 file** di `docs/` (dan nama-metodenya di ~32 file). Maka **setiap** fase refactor
> WAJIB menyertakan langkah **"periksa & update MD"**:
> 1. `grep -rIn "<namaMetodeYangDipindah>" docs/` → untuk tiap hit yang menyebut metode + lokasi lamanya
>    (`ChannelPublishService`), **perbarui** ke collaborator baru.
> 2. Perbarui guide ikhtisar `01-overview.md` (peta komponen) + **Status** di dokumen ini.
> 3. Rujukan **tingkat-tinggi** ("ChannelPublishService mem-publish produk") **tetap valid** — orchestrator-nya
>    tetap ada & tetap entry point; jangan diubah. Yang diperbarui **hanya** rujukan ke **metode spesifik** yang
>    pindah.
> 4. Tree usang `src/main/resources/Documentation/` **di luar lingkup** (CLAUDE.md: jangan diedit).
> **Refactor dianggap belum selesai bila dokumennya belum sinkron.**

---

## 1. Kondisi saat ini (kenapa perlu)

| Metrik | Nilai | Catatan |
|---|---|---|
| Baris | 3.944 | God Class |
| Metode | 85 | ~79 private helper; **API publik hanya 6** |
| Dependency (constructor) | **37** | idealnya <10 |
| API publik (harus dipertahankan) | `publishProduct`, `publishDiff`, `delistProduct`, `tracePublish`, `computeDesiredContentHash`, `stampDesiredResourceHashes` | dipanggil 6 tempat di prod |

**Bukan** bug/lambat — kelasnya bekerja & **teruji** (~19 file test). Masalahnya murni **maintainability**:
satu kelas memikul ~10 konsern; 37 kolaborator = terlalu banyak alasan berubah; sulit dipahami/ditest/diubah
per-bagian. Kode tumbuh **akretif** (penanda `Phase 0..6` di seluruh file).

## 2. Target arsitektur

`ChannelPublishService` tetap **orchestrator** (entry point + rangkai pipeline), turun ke **~500–800 baris,
~10 dep**. Konsern-konsern inline dipindah ke collaborator (`@Service`) yang masing-masing memegang **hanya
dep-nya sendiri**. Pipeline sah yang tersisa:

```
validateRequest → resolveStore+injectCredentials → stagePayload → resolveJoltSpec
  → transform+postProcess → (diff bila mode diff) → publishToChannel → persistOutcome → buildResponse
```

## 3. Prinsip & kendala (jaga ketat)

- **Behavior-preserving**: publish = jalur kritis produksi. Tiap fase harus lulus **seluruh** ~19 test.
- **WebFlux reactive**: pertahankan rantai `Mono/Flux`; jangan ubah threading/eager-vs-lazy.
- **`request` = state mutable**: banyak metode mengembalikan `Mono<PublishProductRequest>` (mengoper request
  yang dimutasi). Saat pindah metode, **eksplisitkan** siapa yang memutasi `request` (masuk sbg param, keluar
  sbg hasil) — jangan ada mutasi tersembunyi lintas collaborator.
- **Metode `static`/pure** dipindah lebih dulu (nol risiko wiring).
- **Satu collaborator per commit**; jangan sekali besar.

## 4. Peta ekstraksi (klaster → collaborator)

| Fase | Collaborator baru | ~Metode | Dep yang ikut pindah | Test penjaga | Dok terdampak (utama) |
|---|---|---|---|---|---|
| 1 ✅ | `PublishResponseFactory` (pure) — **SELESAI** (6 metode, −157 baris, 102 test hijau) | 6 | — (murni) | ContentHash*, PublishDiffResponse* | `01-overview`, `07-data-driven-channel-config`, `arsitektur/03,04,05` |
| 2 ✅ | `PublishTraceService` — **LENGKAP**: `snapshot`/`deepCopySpec` + `assembleTraceResponse` + **`buildTrace` penuh** (−74 baris scoped, lalu −133 baris buildTrace). `tracePublish` tetap entry publik tipis di CPS. | 4 (scoped) + 7 (buildTrace) | objectMapper + joltSemanticValidator/postProcessingContractService/joltTransformationService/genericPostProcessingEngine/apiWrapperService/channelAttributeConverterService/payloadStaging | — (trace) | `14-publish-trace-inspector`, `BACKEND-PUBLISH-TRACE-GATE`, `01-overview` |
| 3 ✅ | `PublishImageDiffPlanner` — **SELESAI** (~17 metode, −450 baris, 102 test hijau). Audit: hanya butuh `imageService` (bukan `imageAssetService` — itu cuma dipakai `guardNonPlatformImages` yang di luar scope) | ~17 | imageService | ImageReorder, VariantImageAssociation, OrphanedImageIds, VariantImageAddOnly, RemoveSrclessImages, MediaSyncGate | `DiffEngine/01,10`, `reversesync/07`, `01-overview` |
| 4a ✅ | `PublishPayloadStagingService` (SINKRON) — **SELESAI** (7 metode staging/shaping, −215 baris, 106 test). Dep RINGAN: imageService, channelAttributeConverterService, imageDiffPlanner (audit: BUKAN dep berat — itu Fase 4b) | 7 | imageService, channelAttributeConverterService, imageDiffPlanner | BuildPackageDimensionCm, **StageVariantImages (baru)**, Shopee/TikTok/Image golden | `01-overview`, `07`, `11/13/37/38`, `DiffEngine/05`, `SizeChart/01` |
| 4b ✅ | `PublishPayloadStagingService` (REAKTIF + kategori) — **SELESAI** (6 metode, −250 baris, 108 test). `collectPreflight` DIKELUARKAN (konsern preflight, bukan staging) | 6 | masterProductDataService, productTypeRepository, categoryCacheService, genericCategoryService | Shopee/TikTok/Image golden | `01-overview`, `03-attribute-conversion`, `27-tiktok-category-attributes`, `SizeChart/01`, `reversesync/08` |
| 5 ✅ | `PublishOutcomeWriter` — **SELESAI** (6 leaf-helper persist + `contentHashOfChannelPayload` static, −171 baris, 111 test). Orkestrator outcome (`updateChannelProductStatus` dst.) TETAP di CPS (menjalin publishJobService/publishRetryService/masterProductDataService/imageDiffPlanner) & mendelegasikan | 2 | channelProductDataService, publishHistoryService | ContentHashPayload | `01-overview`, `arsitektur/02,03` |
| 6 ✅ | `PublishJoltResolver` — **SELESAI** (5 metode resolusi/staleness/recovery-gate, −120 baris, 111 test). Audit: dep RINGAN `channelJoltSpecRepository` saja — dep berat plan (joltSpecGeneratorService/joltGenerationAgentService/joltSemanticValidator/joltTargetCollisionValidator/channelFieldMappingRepository/learningFeedbackService) dipakai logika INLINE `processPublish`, bukan helper → di luar scope | 1 | channelJoltSpecRepository | JoltPriority | `01-overview`, `ai/EXAMPLE-WALKTHROUGH-SHOPIFY` |
| 7 ✅ | `PublishCredentialInjector` — **SELESAI** (3 metode, −127 baris, 111 test). Audit: dep RINGAN `oauthAppConfig` saja — credentialEncryptionService/tokenRefreshService/storeConnectionService TETAP di `resolveStoreAndPublish` (dekripsi+token-refresh = orkestrasi, bukan injeksi) | 1 | oauthAppConfig | — | `01-overview`, `07-data-driven-channel-config`, `versioning/05` |
| 8 ✅ | `PublishDiffService` — **SELESAI** (9 metode komputasi-diff, −192 baris, 111 test). Audit: MURNI/stateless TANPA dep (channelProductDataService yang plan cantumkan dipakai `stampDesiredResourceHashes`/`publishDiff` yang TETAP di orchestrator) | 0 | — (pure static/DTO) | `01-overview` |

Urutan = **nilai × keamanan** (pure/kecil dulu → klaster besar-tapi-teruji → yang paling terjalin terakhir).

## 5. Prosedur baku per fase

Tiap fase mengikuti langkah identik:
1. **Audit**: baca body metode klaster; petakan dep yang benar-benar dipakai + siapa yang menyentuh `request`.
2. **Ekstrak**: buat collaborator `@Service`; pindah metode; `ChannelPublishService` meng-inject collaborator &
   mendelegasikan. Pertahankan signature reactive.
3. **Kompilasi** + **jalankan test penjaga fase** (lihat kolom "Test penjaga") → harus hijau.
4. **Test regresi luas**: jalankan seluruh paket test publishing (`*PublishService*`, `DiffEngine`, pipeline)
   → hijau.
5. **📄 UPDATE DOKUMEN (wajib)** — jalankan disiplin di banner atas: grep docs untuk nama metode yang dipindah,
   perbarui rujukan `ChannelPublishService.<metode>` → `<Collaborator>.<metode>`; update `01-overview` + Status
   dok ini.
6. **Commit** (satu collaborator/fase). Reversible.

## 6. Verifikasi keseluruhan (Definition of Done)
- [ ] `ChannelPublishService` ≤ ~800 baris, ≤ ~12 dependency.
- [ ] API publik (6 metode) **tak berubah** signature-nya; 6 pemanggil prod tak perlu diubah.
- [ ] Seluruh ~19 test publishing hijau tanpa perubahan asersi (bukti behavior-preserving).
- [ ] Tiap collaborator punya batas tanggung jawab jelas + hanya dep-nya sendiri.
- [ ] **Semua MD terdampak sudah disinkronkan** (grep nama-metode di `docs/` bersih dari lokasi lama).
- [ ] `01-overview.md` memuat peta komponen baru.

## 7. Lampiran — permukaan dokumentasi & perintah audit

```bash
# Dok yang menyebut kelas (rujukan tingkat-tinggi umumnya TETAP valid — orchestrator tetap ada)
grep -rIl "ChannelPublishService" docs/ | sort            # ~66 file

# Dok yang menyebut nama-metode klaster (INI yang diperiksa saat metode-nya pindah)
grep -rInE "stageCategoryAttributes|computeVariantImageAssociations|filterProductImagesForUpdate|applyImageReorder|loadAndMergeChannelData|findJoltSpecWithFallback|injectDecryptedCredentials|computeDesiredContentHash|handlePublishError|buildTrace|persist(ChannelIds|ContentHashes|ImageOrder|PushedCategory)" docs/

# Test penjaga (jaring pengaman refactor)
ls src/test/java/**/publishing/ 2>/dev/null; grep -rIl "ChannelPublishService" src/test/java
```

**Kaitan:** guide `01-overview.md` (peta komponen) · `DiffEngine/` (konsern diff) · `14-publish-trace-inspector`
(trace). Reverse-sync (`ReverseOps`) = interpreter terpisah, **tak terpengaruh**.

> **Catatan kejujuran:** peta klaster (jumlah metode & dep per fase) berbasis nama-metode + signature + penanda
> section + nama test — sinyal kuat, tapi **belum baca tiap body baris-per-baris**. Fase 1 (Audit) tiap fase-lah
> yang memfinalkan daftar metode & dep persisnya sebelum memindah.
