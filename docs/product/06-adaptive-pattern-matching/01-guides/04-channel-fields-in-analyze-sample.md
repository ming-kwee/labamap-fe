# 04 — Channel Fields in the Analyze Sample (making APM complete)

> **Status: IMPLEMENTED (A0, A1, A2, A2+, A3).** Analisis di bawah menjelaskan *mengapa* sample APM dulu tak
> memuat channel fields dan di mana itu membuat diagnostics tidak setia pada publish. Rekomendasi
> **A0–A3 sudah dikerjakan** — lihat [§7](#7-rekomendasi-implementasi-bertahap-additive) untuk status
> per-langkah dan commit. Semua behaviour-preserving (opt-in / no-op saat kosong).

## 0. Ringkas (TL;DR)

- Model APM = **source (master product) → target (channel apiSchema)**. Sample "Load from Product Type"
  membangun **source**, dan **sengaja** membuang channel fields (`isChannelField:true`) supaya tidak
  bocor ke form master Step-1.
- Tapi di **publish nyata**, Step-2 `channelData` **di-merge ke source SEBELUM JOLT**. Jadi input JOLT
  sungguhan memuat field channel-unique yang **tak pernah dilihat** oleh analisis → JOLT/mappings yang
  di-generate **buta** terhadapnya → diagnostics ≠ realita.
- Legend **Universal / Channel-shared / Channel-unique** sudah diimplementasi, tapi "kelaparan": karena
  sample tak memuat channel field, semuanya jatuh ke `UNIVERSAL`.
- Ada **dua jalur** di FE. Jalur **"Dari My Products" sudah lengkap**; jalur **"Paste JSON" dulu tidak
  lengkap di KEDUA sisi** (source tanpa channelData, target tanpa ekstensi kategori). **Kini diperbaiki**
  (A0–A3, lihat [§7](#7-rekomendasi-implementasi-bertahap-additive)): target category-aware (A0),
  sample bisa sertakan channel fields (A1), dan dua kotak paste opsional — channel fields → source (A3),
  live attributeConfig → target (A2).

---

## 1. Apa yang dikonsumsi `analyze` (source vs target)

`AdaptivePatternMatchingRequest` = `{ sourceSchema, targetSchema, channelId, categoryId, … }`
(`adaptivepattern/model/request/AdaptivePatternMatchingRequest.java`). `FieldMatchingService`
mencocokkan **source → target**; barisnya `price → product.variants[0].price` (mis. di gambar Field
mappings).

- **source** = master product (channel-agnostic).
- **target** = channel apiSchema (target-path), yang **spec-of-record** body channel.

## 2. Kenapa sample membuang channel fields — disengaja

Sample dibangun `MasterProductSampleService.buildSample()`
(`adaptivepattern/service/MasterProductSampleService.java`). Query sumbernya **eksplisit membuang**
channel fields:

```java
// EcommerceMasterAttributeMongoRepository.java:23-26
// "Step 1 (master product form) — excludes channel-specific fields (isChannelField: true)
//  so that MERCHANT_API fields like collection_id / location_id never leak into the master form."
{ active:true, $or:[{ isChannelField:{$ne:true} }, { isChannelField:{$exists:false} }] }
```

Komentar service (`MasterProductSampleService.java:38-40`) menegaskan: *"Channel-specific fields are
excluded at the query level — they belong to the target side, not the master product source."* Dari
sudut model APM lama itu konsisten (source = master murni; channel = target).

## 3. Legend sudah ada, tapi kelaparan

`attachSourceFieldClassification` (`AdaptivePatternMatchingCommandImpl.java:177-216`) menandai **tiap
source field** lewat query channel:
`findByIsChannelFieldTrueAndSupportedChannelsContaining(channelId)` (`:183`), dengan aturan
`supported.size() <= 1 ? CHANNEL_UNIQUE : CHANNEL_SHARED` (`:206`). Klasifikatornya **sudah tahu**
kosakata channel — tetapi karena sample tak memuat channel field, hasilnya selalu `UNIVERSAL`.

## 4. Gap nyata: publish memberi makan JOLT dengan field yang analisis tak lihat

`ChannelPublishService.loadAndMergeChannelData()` me-**merge Step-2 `channelData` ke `masterProductData`
SEBELUM JOLT** (`publishing/service/ChannelPublishService.java:171-172`), dengan prioritas
`masterProduct < masterOverrides < channelData < variantOverrides[sku]` (`:276`).

Konsekuensi: input JOLT nyata memuat field channel-unique Step-2. Tapi JOLT-nya di-generate dari sample
yang membuangnya → spec tak punya shift-rule untuk field itu → saat publish mereka bergantung pada
attribute-mappings / post-processing / passthrough, dan di diagnostics muncul (kalau muncul) sebagai
**unmapped target**, bukan baris mapping. **Diagnostics jadi tidak setia** pada apa yang benar-benar
ditransform.

## 5. Dua jalur FE — mana yang lengkap

FE: `PublishDiagnosticsPage.tsx` (repo `free-nextjs-admin-dashboard`).

### 5a. "Dari My Products" (product-aware) — SUDAH lengkap
→ `POST /channels/publish/analyze` → `PublishAnalysisService`:
- **source** = `buildSourceSchema(mergedData)` — `mergedData` sudah termasuk Step-2 `channelData`
  (via `loadAndMergeChannelData`). ✅ channel fields ada di source.
- **target** = `channelSchemaService.generateComplexTargetSchema(channelId, categorySlug)`
  (`PublishAnalysisService.java:368`) — base apiSchema **+ ekstensi kategori** dari
  `channel_category_api_schemas` (Fase 2d frozen / live attributeConfig). ✅ channel-unique target ada.

Jadi jalur ini sudah menyatukan kedua sisi.

### 5b. "Paste JSON" (schema-level) — TIDAK lengkap di kedua sisi
→ `generateMappingRequest` (`ecommerce-product-v2/utils/product-mapper.ts:278-314`):
- **source** = `transformMasterProductToSourceSchema(product)` — hanya master yang dipaste. Lalu
  `mergeStoreOverridesIntoRequest(request, null)` dipanggil dengan **store = null**
  (`PublishDiagnosticsPage.tsx:364`) → **tak ada `channelData` yang di-merge**. ❌ source tanpa channel.
- **target** = `GET /channels/{channelId}/schema/complex?format=nested` — endpoint ini
  (`ChannelController.java:330-334`) **tidak menerima `categoryId`** dan memanggil
  `generateSchemaWithFormat(channelId, format, organizationId)` (bukan
  `generateComplexTargetSchema(channelId, categorySlug)`). ❌ **base apiSchema saja — ekstensi kategori
  hilang**.

> Menariknya, mesin merge-nya **sudah ada**: `mergeStoreOverridesIntoRequest`
> (`product-mapper.ts:362-389`) menaruh `store.channelData` ke **`request.sourceSchema`** (`:368-370`).
> Ini menegaskan **sisi mana**: nilai channel yang diisi merchant = **SOURCE** (input yang di-merge ke
> master sebelum JOLT). Ia hanya dipanggil dengan `null` pada mode Paste JSON.

## 6. Jadi "lengkap" = penuhi KEDUA sisi (persis gambar)

Sebuah channel field punya **dua wujud** — inilah kunci "jangan salah sisi":

| Wujud | Sisi | Dari mana |
|---|---|---|
| **Nilai** yang diisi merchant (mis. `days_to_ship=3`) | **SOURCE** | Step-2 `channelData` (di-merge ke master sebelum JOLT) |
| **Path** tempat ia harus mendarat (mis. `logistic_info[].days_to_ship`) | **TARGET** | apiSchema + ekstensi kategori (attributeConfig / 2d frozen) |

APM baru bisa menarik **garis mapping** kalau **kedua** wujud hadir. Maka kelengkapan = union sumber
berikut (dua kotak tambahan di gambar Anda):

| Sumber | Sisi | Query/endpoint yang sudah ada |
|---|---|---|
| 1. Master product (sekarang) | source | `findMasterProductAttributes…` |
| 2. Step-2 channel attrs (statis) | source | `findByIsChannelFieldTrueAndSupportedChannelsContaining(channelId)` — sudah dipakai klasifikator |
| 3. Live attributeConfig per-kategori | **target** | `generateComplexTargetSchema(channelId, categorySlug)` (bukan `schema/complex` polos) |

## 7. Rekomendasi implementasi (bertahap, additive)

**Status: A0, A1, A2, A3 semua ✅ IMPLEMENTED.** Semua behaviour-preserving (opt-in / no-op saat kosong).
Repo: BE `labamap-omnichannel-be4fe` (branch `bff-v11`), FE `free-nextjs-admin-dashboard` (branch `v9`).

### A0 ✅ — Sisi TARGET jalur Paste JSON kini category-aware
`GET /channels/{id}/schema/complex` menerima `?categoryId=`; untuk `format=nested` dengan slug ia memanggil
`generateComplexTargetSchema(channelId, categorySlug)` (base + ekstensi kategori, frozen 2d → live). FE
`generateMappingRequest` meneruskan `options.categoryId`. `default`/blank/GID → base saja; alias resolve.
- BE `d0ce706` — `ChannelController.getComplexChannelSchema`, `ChannelSchemaService.generateSchemaWithFormat(…, categorySlug)`.
- FE `ec263a5` — `product-mapper.ts:generateMappingRequest`.

### A1 ✅ — Union sisi SOURCE di sample (opt-in, diagnostics-only)
`MasterProductSampleService.buildSample(productTypeId, channelId, includeChannelFields)` meng-union query
**channel-scoped** (`findByIsChannelFieldTrueAndSupportedChannelsContaining`) sebagai Source 3 — query master
Step-1 **tidak** disentuh (exclusion `collection_id`/`location_id` tetap). Overload 1-arg delegasi (no-op).
`SampleMeta.channelFieldCount` ditambahkan. FE: toggle "Sertakan channel fields" di `ProductTypeSampleLoader`
(muncul hanya bila `channelId` di-pass).
- BE `cddc5b2` — `MasterProductSampleService`, `AiAdminController.sampleMasterProduct(…, channelId, includeChannelFields)`.
- FE `4ccf655` — `ProductTypeSampleLoader`, `aiAdmin.service.getSampleMasterProduct`, `types/session.ts`.

### A2 ✅ — Live attributeConfig → TARGET (opt-in, paste)
Kotak paste opsional **"Live channel fields — attributeConfig (JSON)"** di mode Paste JSON; isinya
**deep-merge ke `targetSchema`** via `mergeLiveChannelFieldsIntoTarget` (mirror A3 di sisi target), jadi
field channel-unique yang hanya ada live per-kategori menjadi tujuan mapping. Invalid JSON blokir Run;
kosong = no-op.
- FE (`product-mapper.ts:mergeLiveChannelFieldsIntoTarget` + deep-merge helper, `PublishDiagnosticsPage.tsx`).

### A2+ ✅ — Auto-fetch live attributeConfig (bukan paste manual)
Tombol **"Fetch live"** di area A2: pilih **store** (untuk kredensial) + isi **channel categoryId (leaf)**,
lalu tarik atribut kategori live/cached dan isi otomatis kotak A2 (yang lalu deep-merge ke `targetSchema`).
- BE: endpoint baru `GET /api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}/schema?organizationId=`
  di `CategoryController.getCategoryAttributeSchema` — reuse `CategoryCacheService.getCategoryAttributes`
  (baca `channel_category_attributes_cache` dulu, fallback live), lalu flatten required+optional
  `ChannelFormField`. Fail-safe: error → schema kosong.
- FE: `pattern-matching.service.ts:fetchCategoryAttributeSchema` + store dropdown
  (`ChannelStoreService.listStores`, difilter per channel) + input categoryId + tombol Fetch di
  `PublishDiagnosticsPage.tsx` (menampilkan "N field · M ter-map ke apiSchema path").

#### Precise-path resolution (join via `attributeMappings`)
Tiap nama field di-*join* ke `attributeMappings` channel untuk memulihkan **path apiSchema** nyata:
`productFields`/`variantFields` kuncinya adalah path body bentuk `@` (mis. `product@variants@weight`,
segmen terakhir = nama field), `commonFields` bawa `chnlAttrName`. Bila cocok → kunci schema fragment
memakai path titik (mis. `product.variants.weight`) dan pasangannya dilaporkan di `resolvedPaths`
(+ `matchedCount`); bila tidak (kasus lazim untuk atribut **live-only** per-kategori yang belum punya
mapping) → tetap **nama field polos** — jujur, karena atribut kategori dikenali lewat `attrId` di dalam
wadah generik `attribute_list[]`, bukan path JSON unik (penempatan itu tetap urusan JOLT/post-processing).
Data-driven (baca `attributeMappings`, tanpa vocabulary hardcoded) & fail-safe (tak ada config → semua
nama polos). Paste manual tetap tersedia sebagai fallback.

### A3 ✅ — Sisi SOURCE jalur Paste JSON via kotak paste
Kotak paste opsional **"Channel fields — Step-2 (JSON)"**; isinya di-merge ke `sourceSchema` (sebagai
`channelData`) via `mergeStoreOverridesIntoRequest` — helper yang sama dengan alur publish. Ini mengganti
framing lama "wire store-context" (mode Paste JSON tak punya store; store picker hanya ada di mode
"Dari My Products" yang sudah merge server-side).
- FE `bb58957` — `PublishDiagnosticsPage.tsx`.

Hasil gabungan: legend Universal/Channel-shared/Channel-unique **hidup**, dan APM bisa menarik garis
mapping untuk field channel-unique di **kedua sisi** — setia pada publish. Field channel-unique **statis**
(terdaftar di `ecommerce_master_attributes`) ditutup A0+A1; yang **live per-kategori** ditutup A2 (paste)
dan A2+ (auto-fetch dari attribute API).

### UX diagnostics (offline vs online)
Perbaikan usability pada halaman Publish-Diagnostics (mode Paste JSON):
- **Initial load bersih** — textarea master mulai kosong (bukan dummy); contoh statis via "reset ke contoh statis".
- **Suggest (offline)** — kotak "Channel fields — Step-2" punya tombol Suggest yang mengisinya dengan nama
  field Step-2 channel dari `GET /api/v1/admin/ai/channel-fields?channelId=`
  (`MasterProductSampleService.buildChannelFieldNames`, data-driven, **tanpa kredensial channel**).
- **Browse kategori** — picker drill-down (`/categories/{channel}/{store}/root|children/{parentId}`) mengisi
  `channelCategoryId` (leaf id channel), + hint bahwa itu **bukan** slug master.
- **Batasan online** — A2+ Fetch live & Browse **memanggil channel sungguhan** → butuh store terhubung +
  kredensial valid. Channel taxonomy-only (WIX) tak punya attribute API. Untuk uji offline: Suggest + paste manual.

## 8. Caveat (agar benar, bukan sekadar "masukkan semua")

1. **Identity/passthrough bukan baris JOLT.** Field channel-unique yang **nama source == target**
   (`days_to_ship` → `days_to_ship`) cukup passthrough; hanya yang **beda** (`size_chart_id` →
   `attributes[].value`) yang butuh mapping JOLT. Kelengkapan bukan berarti "semua wajib baris JOLT".
2. **Jangan sentuh exclusion Step-1.** Union hanya di jalur diagnostics.
3. **apiSchema tetap spec-of-record.** Field channel-unique per-kategori sudah punya rumah sah:
   ekstensi kategori (`channel_category_api_schemas` / 2d `categoryApiSchemaExtensions`) — jangan
   tambah ke apiSchema base.
4. **Tetap data-driven.** Semua kosakata (`isChannelField`, `supportedChannels`, ekstensi kategori)
   sudah dari koleksi. Tak ada literal baru. (CLAUDE.md: no hardcoded domain knowledge.)
5. **Live fetch = opt-in.** Jaga analyze tetap murah untuk kasus master-only.

## 9. Peta kode (rujukan cepat)

| Hal | Lokasi |
|---|---|
| Request DTO (source/target) | `adaptivepattern/model/request/AdaptivePatternMatchingRequest.java` |
| Flatten + match + klasifikasi | `adaptivepattern/command/impl/AdaptivePatternMatchingCommandImpl.java:103,177,183,206` |
| Sample builder (source) | `adaptivepattern/service/MasterProductSampleService.java:38,72` |
| Sample query (exclude channel) | `ecommerce/repository/EcommerceMasterAttributeMongoRepository.java:23-26` |
| Sample endpoint | `adaptivepattern/controller/AiAdminController.java:402` (`GET /admin/ai/sample-master-product`) |
| channelData merge sebelum JOLT | `publishing/service/ChannelPublishService.java:171-172, 276` |
| target (product-aware, +ekstensi) | `publishing/service/PublishAnalysisService.java:368` |
| target (paste, base saja) | `channel/controller/ChannelController.java:330-334` (`schema/complex`, tanpa categoryId) |
| FE build request (paste) | `product-mapper.ts:278-314` (`generateMappingRequest`) |
| FE merge channelData→source | `product-mapper.ts:362-389` (`mergeStoreOverridesIntoRequest`) |
| FE diagnostics page | `ai-admin/components/diagnostics/PublishDiagnosticsPage.tsx:353-378` |
