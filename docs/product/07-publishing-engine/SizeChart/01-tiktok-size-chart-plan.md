# 01 — TikTok Shop Size Chart: rencana implementasi (image-first)

**Status:** ✅ **LIVE-VERIFIED (CREATE+UPDATE, 2026-09-02 — produk APPROVED)**. Size chart + category attributes +
main image + variants semua masuk; `size_chart={image:{uri:tos-...}}`. Commits: P1 `ab54136`, P2 `4ce27c4`,
P4 `a9c18e1`+FE `d475dd9`, P3-CREATE `a1bf387`, P3-UPDATE `3de2b32`, P5 guide `e633259`; plus fixes: multipart
text-part sync `6a71ded` (use_case []uint8), product_attributes 202309 shape `b8f5aa0`. Template ditunda (jalur
siap). **Area:** TikTok Shop publish — size chart.
**Goal:** memenuhi aturan kategori TikTok `size_chart` (mis. error live `12052673 size_chart_image required`,
kategori apparel `835720`) agar publish/UPDATE produk apparel lolos, dengan cara **paling portabel + paling ringkas**.
**Keputusan arah:** **image-first** (unggah gambar size-chart), **template ditunda** — lihat §2.

> Ini gate terakhir yang tertunda dari pipeline TikTok. Sisanya sudah end-to-end (signing, media pre-upload,
> price/stock, `variantGroups→skus`, live category attributes → `product_attributes`). Lihat
> [[tiktok-publish-pipeline-complete]] dan guide `12-tiktok-202309-payload-gaps.md`.

---

## 1. Kondisi saat ini (terverifikasi 2026-09-01)

| Komponen | Status | Anchor (line drift — grep, jangan andalkan nomor) |
|---|---|---|
| apiSchema `size_chart` | ❌ **dihapus** dari default | `ChannelConfigurationDataLoader.createTiktokshopApiSchema` (komentar "…size_chart…were removed") |
| Master attr `sizeChart` | ⚠️ **ada, tak terpakai** (Object, optional, `section=variants`, visibilitas hardcode `category==='clothing'`) | `json/ecommerce/master-attributes-ecommerce.json` (`"fieldName":"sizeChart"`) |
| Kapabilitas list template TikTok | ❌ **tidak ada** (`GetSizeChartList` yang ada = **Shopee**, `shopeeBase()`) | `ChannelCapabilityOperationDataLoader` |
| Merchant ops TikTok | `GetWarehouses` dll — **tak ada** padanan size-chart | `MerchantApiOperationDataLoader` |
| Pola upload gambar TikTok | ✅ `create_CP_Media_Pre` → `POST /product/{v}/images/upload` (tanpa `use_case`, default MAIN_IMAGE). **Nilainya LIST** yang di-loop sync | `ChannelMetadataMigration.tiktokshopCreateMediaPreWorkflow` (return `List.of(workflow)`) |
| Pola staging body JOLT-independent | ✅ `_categoryAttributes` (+ `BUILD_ATTRIBUTE_LIST`), `_sourceImages` | `ChannelPublishService.stageCategoryAttributes` / `collectSourceImageUrls` |
| Op pemindah objek → body | ✅ `COPY_PATH` (`getNestedValue`→`setNestedValue`, mendukung subtree objek) | `GenericPostProcessingEngine.executeCopyPath` |

**Bentuk body TikTok 202309:** `size_chart: { image: {uri}, template: {id} }` — **uploaded image** ATAU
**template id**. `uri` berasal dari langkah upload (`/images/upload`), bukan URL sumber langsung.

---

## 2. Analisis real-world & keputusan arah

TikTok punya dua bentuk yang setara di body tapi beda makna:

| | **image** (`image.uri`) | **template** (`template.id`) |
|---|---|---|
| Isi | Foto/JPG tabel ukuran buatan seller | Data terstruktur (baris/kolom) dibuat di Seller Center / API `sizecharts` |
| Ketersediaan | **Universal** semua market/kategori apparel | Region/kategori-spesifik |
| Sumber | Seller umumnya sudah punya gambar (lowest common denominator) | Seller harus buat template dulu |
| Error 835720 | ✅ inilah yang diminta (`size_chart_image required`) | ❓ belum tentu memuaskan |

**Praktik hub omnichannel (Ginee/ChannelAdvisor/SellerCloud):** menjadikan **image** sebagai baseline (satu UX
"unggah gambar" berlaku lintas channel & market, memetakan langsung ke pipeline upload gambar); **template**
terstruktur jarang dibangun generik karena TikTok-spesifik → fitur lanjutan, bukan inti. Selaras prinsip repo:
hub = lowest-common-denominator portabel, bukan replikasi tiap fitur native.

**Keputusan: image-first, template ditunda (BUKAN keduanya sekarang).**
1. Langsung membuka blocker (835720 minta image; template belum tentu lolos).
2. Reuse penuh pipeline `create_CP_Media_Pre` + `/images/upload`.
3. Portabel (image relevan bila channel lain butuh size chart); template mengunci ke TikTok.
4. Template = kerja jauh lebih besar (kapabilitas baru + picker + resolusi + cabang body) untuk manfaat
   region/kategori-terbatas → spekulatif sekarang.

**Kunci desain agar nol rework:** rule `tiktok-build-size-chart` memindah staging `_sizeChart` secara umum.
Isi URL gambar → `size_chart.image.uri`; (kelak) isi template id → `size_chart.template.id`. Menambah template =
picker Step-2 + kapabilitas + staging, **tanpa** menyentuh body-build.

---

## 3. Desain alur (image-first, template-ready)

```
Step-2 (FE): merchant unggah gambar size-chart → GCS URL → channelData.sizeChart
        │
        ▼
ChannelPublishService.stageSizeChart():  _sizeChart = { image: { uri: <gcsUrl> } }   (reserved "_"-key)
        │  (staged di kedua call-site: real publish + analyze)
        ▼
post-processing rule "tiktok-build-size-chart":  COPY_PATH  _sizeChart → size_chart   (body field)
        │
        ▼
workaction create_CP_Media_Pre (instruksi #2, DITAMBAHKAN ke list yang sudah ada):
        download size_chart.image.uri → upload /images/upload (use_case=SIZE_CHART_IMAGE)
        → tulis balik uri TikTok ke size_chart.image.uri
        │
        ▼
create_CP: body membawa size_chart:{image:{uri:<tiktok-uri>}}   → TikTok terima
```

Prinsip yang dipatuhi (CLAUDE.md):
- Support/intermediate shape **tidak** dibaked di `apiSchema` — `size_chart` dibangun **JOLT-spec-independent**
  via rule membaca staging `_`-key (sama seperti `_sourceImages`/`_categoryAttributes`).
- Nol literal channel di runtime; semua bentuk = data di seed/rule.
- Nol per-channel runtime branch: `stageSizeChart` no-op untuk channel non-TikTok karena hanya membaca
  `sizeChart` dari channelData (data-gated), bukan `if channel==tiktok`.

---

## 4. Rencana file-per-file

### BFF (repo `labamap-omnichannel-be4fe`)

**F1 — `publishing/service/ChannelPublishService.java`**
- Method baru `stageSizeChart(request, orgId) : Mono<Map<String,Object>>`.
  - Baca URL gambar dari `masterProductData`/channelData key `sizeChart` (sudah di-merge saat publish).
  - Bila ada & non-blank → `{ "_sizeChart": { "image": { "uri": <url> } } }`; else `Map.of()`.
  - Data-gated: kosong bila field tak ada → otomatis no-op untuk channel lain. Best-effort (error → kosong).
- Panggil di **dua** call-site staging (mirror `stageCategoryAttributes`):
  - real publish (~`transformed.putAll(staging)` setelah `_sourceImages`),
  - analyze/transform (~`transformedData.put("_sourceImages", …)`).
  - Gabung ke map `staging` yang sudah ada (jangan bikin pipeline terpisah).

**F2 — `channel/config/ChannelConfigurationDataLoader.java`**
- Di `createTiktokshopPostProcessingRules`, rule baru (model persis `tiktok-build-product-attributes`):
  ```
  name        : "tiktok-build-size-chart"
  sourcePath  : "_sizeChart"
  targetPath  : "size_chart"
  priority    : 36            // setelah build-product-attributes (35)
  enabled     : true
  operations  : [ { "op": "COPY_PATH" } ]
  ```
- Tidak menambah `size_chart` ke `createTiktokshopApiSchema` (kondisional; rule yang memunculkannya).

**F3 — `config/ChannelMetadataMigration.java` (`tiktokshopCreateMediaPreWorkflow`)**
- **Tambah instruksi kedua** ke list `create_CP_Media_Pre` (list sudah di-loop sync → **NOL perubahan sync**):
  - `endpoint`: sama (`/product/{v}/images/upload`, multipart, signed params/signature).
  - `body-reshape-to`: `from:"size_chart"`, baca `image.uri`; `output.fields`:{ `uri_key`:`data` } + **field statis
    `use_case`:`"SIZE_CHART_IMAGE"`}; `conversion`:{ `uri_key`:`Base64` }.
  - `response-update-to`: **single-image** (bukan `[*]` agregat). `responsePaths`:[`data.uri`]; `transformPaths`
    JOLT `{data:{uri}} → {image:{uri}}`; `updatePaths`:[{ `get`:`size_chart`, `to`:`size_chart` (bare attr),
    `in`:`attribute` }].
  - **Verify-point V1** (lihat §5): pastikan `from` menerima objek tunggal; bila sync `from` mewajibkan array,
    fallback = stage `_sizeChart` sebagai array 1-elemen lalu reshape balik ke objek.

**F4 — `config/ChannelAttributeMappingsMigration.java`**
- Daftarkan channel field `size_chart` untuk `tiktokshop`: `chnlAttrType:"object"`, **`isSupportField:false`**
  (body field asli yang TikTok baca; bukan staging). Staging `_sizeChart` otomatis di-drop `buildChannelAttributes`
  (aturan `_`-prefix).

**F5 — `json/ecommerce/master-attributes-ecommerce.json` (`sizeChart`)**
- `dataType` tetap `Object` (menampung `{image:{uri}}`); alternatif: simpan URL string di channelData dan
  `stageSizeChart` yang membungkus ke objek — lebih sederhana untuk FE (input = 1 URL). **Pilih: simpan URL string**;
  `stageSizeChart` yang bentuk objeknya.
- Ganti `fieldType` agar Step-2 render **input unggah gambar** (reuse tipe upload gambar yang ada).
- **Visibilitas data-driven** (buang hardcode `category==='clothing'`): tampilkan bila category requirement
  menandai size-chart relevan; bila sinyal belum ada, tampilkan sebagai **optional** untuk kategori apparel via
  **data** category-requirements — bukan literal kode. Lihat §6 (titik terlunak).

### FE (repo `free-nextjs-admin-dashboard`)

**F6 — Step-2 form renderer**
- Dukung field-type "image upload" untuk `sizeChart`: unggah ke GCS via endpoint `/media/upload` yang
  sudah ada → simpan URL hasil ke `channelData.sizeChart`. Reuse komponen unggah gambar yang ada
  (main image / variant image). Satu gambar, bukan galeri.

### Test & docs

**F7 — test golden (BFF)**
- Rule `tiktok-build-size-chart`: input transformed `{_sizeChart:{image:{uri:"gcs://x"}}}` → output berisi
  `size_chart:{image:{uri:"gcs://x"}}`; pastikan `_sizeChart` (dan semua `_`-key) **tak bocor** ke channelAttributes.
- (Opsional) test `stageSizeChart`: channelData punya `sizeChart` → map `_sizeChart` benar; kosong → no-op.

**F8 — guide**
- `docs/.../01-guides/37-tiktok-size-chart.md` (angka berikutnya): alur image-first as-built + verify + catatan
  template ditunda. Tautkan balik ke folder ini.

---

## 5. Verify-points (pastikan saat eksekusi)

1. **V1 — bentuk write-back single-image.** `main_images` meng-iterasi array (`from:main_images`, `[*]` agregat);
   `size_chart` objek tunggal. Pastikan `from:"size_chart"` + baca `image.uri` bekerja untuk 1 gambar; jika sync
   `from` mewajibkan array, fallback stage `_sizeChart` = array 1-elemen lalu reshape ke objek. **Titik uji utama.**
2. **V2 — `use_case=SIZE_CHART_IMAGE`.** TikTok `/images/upload` perlu ini agar uri sah untuk `size_chart`
   (main_images default MAIN_IMAGE). Pastikan terkirim sebagai field multipart statis.
3. **V3 — `chnlAttrType` `size_chart`.** Pastikan ter-infer `object` (via mapping F4), bukan auto-enumerasi salah
   tipe. Bandingkan gotcha [[chnlattrtype-inference-gotcha]].

---

## 6. Titik terlunak: sinyal "size_chart wajib per-kategori"

Belum ada sumber data yang menyatakan sebuah kategori TikTok **mewajibkan** size chart. Opsi (urut preferensi):
- (a) **Category requirement (Path B)** bila live attribute API mengekspos flag wajib size-chart → paling benar.
- (b) **Build saat merchant menyediakan gambar** (data-gated) — cukup untuk membuka blocker; tak memaksa.
- (c) **Pre-flight WARN** saat kategori wajib tapi kosong — sekelas warning Shopee gtin/size_chart
  (guide `30-shopee-response-success-check.md`). Lanjutan.

**Rencana:** mulai dari (b) (nol prasyarat data), siapkan (c) sebagai lanjutan, adopsi (a) begitu sinyalnya tersedia.
Jangan meng-hardcode daftar kategori di runtime (CLAUDE.md: no hardcoded domain knowledge).

---

## 7. Di luar lingkup (sengaja)

- **Template** (`GetSizeChartList` TikTok + picker Step-2 + resolusi + cabang body) — jalur sudah disiapkan di rule
  F2 (COPY_PATH generik). Tambah bila ada market/kategori yang mewajibkan struktur.
- **Perubahan sync** — TIDAK ada. Upload numpang list `create_CP_Media_Pre` yang sudah di-loop.
- **Data sumber uji** — butuh 1 gambar size-chart nyata; produk uji saat ini belum punya.

---

## 8. Urutan eksekusi (tiap fase = slice teruji, aditif)

| Fase | Isi | Uji sukses | Bergantung | Status |
|---|---|---|---|---|
| **P1** | F1 (staging) + F2 (rule) | test golden: `_sizeChart` → `size_chart` di body; `_`-key tak bocor | — | ✅ `ab54136` (TikTok202309PipelineTest +2) |
| **P2** | F4 (mapping) | `size_chart` channel attribute `chnlAttrType=object` | P1 | ✅ `4ce27c4` |
| **P3** | F3 (upload instruksi #2, CREATE **+ UPDATE**) | (butuh sync jalan + gambar) log media_pre upload size-chart → uri TikTok ditulis balik | P1–P2, V1/V2 | ✅ CREATE `a1bf387` + **UPDATE** `3de2b32` (§5b) — **tunggu uji live** |
| **P4** | F5 + F6 (Step-2 input + visibilitas) | merchant bisa unggah gambar di Step-2 → tersimpan channelData | P1 | ✅ BFF `a9c18e1` (fieldType image, section media, buang visibilitas literal rusak) + FE `3b8c8e2` (IMAGE case → upload → URL string) |
| **P5** | F8 (guide) + F-warn pre-flight | dokumentasi + warning kategori-wajib | P1–P4 | ✅ guide `37-tiktok-size-chart.md`; F-warn **sudah ter-cover** `PublishPreflightGate` data-driven (§5c) — tinggal tandai required per-kategori di data |

**Catatan P4:** `sizeChart` kini masuk section **Optional** Step-2 (tak ada `variantScope` → lolos filter
`buildOptionalSection`), render `IMAGE` (`mapFieldType "image"→IMAGE`), value = URL string (GCS `publicUrl`).
Visibilitas literal lama `category === 'clothing'` DIBUANG — di Step-2 nilai `category` = productTypeId, jadi literal
itu tak pernah cocok (dead config + langgar no-hardcoded-domain-knowledge). Sinyal "wajib per-kategori" tetap
follow-up (P5/§6); sekarang field optional, build saat merchant sediakan gambar.

Urutan wajib: **P1 dulu** (staging+rule fondasi). P3 (upload) baru bisa diuji live setelah ada gambar sumber **dan**
P4 (input Step-2) supaya merchant bisa menyediakannya.

### 5a. P3 — mekanika sync ter-trace (2026-09-01): V1 & V2 TERPECAHKAN

Ditelusuri di repo sync (`notifikasi temporal`, read-only) — bukan tebakan:

- **`from` objek tunggal OK (V1).** `Create_CP_Media.extractJsonNodes`: array → N node; **objek → 1 node**. Jadi
  `from:"size_chart"` (objek `{image:{uri}}`) menghasilkan 1 node upload.
- **Reshape sepenuhnya JOLT-mampu.** `ReshapePaylodBuilder.processNodes` menjalankan `aggregation.preTransform`
  (JOLT Chainr) — persis pola Shopee media_pre. Bisa flatten `image.uri` → `uri` (top-level) + inject `use_case`.
- **Output = peran→nama, mendukung path nested.** `ServiceFunctions.addToResult`: tiap `output.fields` `X_key`
  membaca field sumber `X` (`getNestedValue`, **mendukung dot-path**) → tulis ke nama output-nya. Node output
  dibangun ULANG hanya dari `output.fields`.
- **Multipart mengirim SEMUA field node (V2).** `HttpFunctions.buildMultipartEntity`: nilai Base64 → file-part;
  lainnya → text-part. Jadi `use_case` dalam node → terkirim sebagai field multipart `use_case`.

**Instruksi upload size-chart yang tersepesifikasi (append ke list `create_CP_Media_Pre`):**
```jsonc
{
  "endpoint": { /* sama spt main_images: /product/{v}/images/upload, multipart, signed */ },
  "body-reshape-to": {
    "from": "size_chart",
    "aggregation": { "preTransform": [
      { "operation": "shift",   "spec": { "image": { "uri": "uri" } } },   // {image:{uri}} → {uri}
      { "operation": "default", "spec": { "use_case": "SIZE_CHART_IMAGE" } }
    ]},
    "output": {
      "fields": { "uri_key": "data", "use_case_key": "use_case" },          // uri→data(file), use_case→text
      "conversion": { "uri_key": "BinaryFile" }
    }
  },
  "response-update-to": { /* ⚠ BELUM PASTI — lihat V-writeback */ }
}
```

**Write-back objek-tunggal nested — TERPECAHKAN via mode agregat.** `applyWriteBack` punya 3 mode; per-response
(`processResponseUpdateTo`) hanya menulis STRING skalar (tak ada transformPaths) → tak bisa bikin `{image:{uri}}`.
Mode **agregat** (`hasStarResponsePath` → responsePaths mengandung `[*]`) menerapkan `transformPaths` JOLT ke daftar
respons lalu menyimpan **bentuk apa pun** sebagai nilai atribut (`valueToString(transformed)`). Jadi untuk 1 upload
size-chart: respons `[{data:{uri:U}}]` → JOLT shift `{"*":{"data":{"uri":"image.uri"}}}` → objek `{image:{uri:U}}` →
tulis ke atribut bare `size_chart` (chnlAttrType object → `create_CP` parse balik jadi objek JSON). **Bukan tebakan
lagi** — mengikuti persis pola aggregated main_images + mekanika ter-trace. **Sisa: verifikasi live** (respons
`/images/upload` untuk `use_case=SIZE_CHART_IMAGE` diasumsikan `data.uri` sama spt main_images). Produk TANPA
size_chart = no-op aman (0 upload).

### 5b. P3 UPDATE-side — TERIMPLEMENTASI (verified, aman)

`resolveMetadataKeyForCallType(MEDIA_PRE)` pada **UPDATE** membaca kunci `update_CP_Media_Pre`. **Terverifikasi**:
TikTok `update_CP` membangun body dari **semua** atribut non-support (`body-reshape.output` kosong), jadi ia
me-resend `main_images` **dan** `size_chart` tiap edit — dg URL GCS mentah kecuali ada media pre-step. Awalnya TikTok
hanya menyeed `create_CP_Media_Pre` → edit mengirim URL tak-terupload (**bug laten** yg juga kena main_images, bukan
cuma size-chart). Karena itu menambah `update_CP_Media_Pre` **memperbaiki**, bukan berisiko. Sekarang di-seed dg
workflow **sama** persis dg create (dua instruksi: main_images + size-chart), **mirror Shopee** (yg memang sudah
begitu, `shopeeCreateMediaPreWorkflow()` dipakai utk kedua kunci). Idempoten (gambar diganti, bukan di-append);
re-upload tiap update (no dirty-detection) = follow-up. Uji: `WixTiktokUpdateMetadataTest` (+1). Butuh uji live.

### 5c. Pre-flight warn — SUDAH ter-cover data-driven (nol kode)

`PublishPreflightGate.check` sudah **sepenuhnya data-driven**: ia mengeluarkan blocker `MISSING_REQUIRED_FIELD` untuk
tiap field **visible + required** yang kosong (`resolver.resolveMissing`). Jadi "warn saat kategori mewajibkan size
chart" = cukup tandai `sizeChart` **required** utk kategori itu di DATA (category requirements) — nol kode,
nol daftar-kategori hardcode (CLAUDE.md). Selama belum ada sinyal itu, field tetap optional (tak diblok).

---

## 9. Kriteria terima (acceptance)

1. Produk apparel dg gambar size-chart di Step-2 → publish kategori 835720 → `create_CP` **tanpa** error
   `12052673 size_chart_image required`; body memuat `size_chart:{image:{uri:<tiktok-uri>}}`.
2. Produk **tanpa** size chart, kategori non-wajib → publish normal (size_chart absen; nol regresi).
3. Channel non-TikTok → `stageSizeChart` no-op; nol perubahan payload (nol regresi lintas-channel).
4. Semua bentuk = data (seed/rule/mapping); nol literal channel/kategori di runtime.

---

## Related
- [[tiktok-publish-pipeline-complete]], [[chnlattrtype-inference-gotcha]], [[sync-service-workaction-model]]
- guide `12-tiktok-202309-payload-gaps.md` (§ apiSchema ramping; size_chart dikeluarkan sebagai opsional)
- guide `25-tiktok-media-pre-upload.md` (pola `create_CP_Media_Pre` yang di-reuse)
- guide `30-shopee-response-success-check.md` (warning size_chart/gtin — pola pre-flight warn)
