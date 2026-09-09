# Desain: Mengganti "Staging" dengan satu reserved key `_source`

> **Status:** Proposal (untuk dievaluasi tim). Ditulis 2026-07-28.
> **Masalah yang dipecahkan:** "staging" di pipeline publish adalah kode Java hardcoded per-field yang
> bertentangan dengan filosofi data-driven sistem, sulit di-maintain, dan memperberat onboarding channel.
> **Ringkas usulan:** ekspos seluruh data sumber di **satu key reserved `_source`**, dan biarkan **rule
> post-processing membacanya lewat path bertitik biasa** (`_source.channelCategoryId`) — memakai resolver
> yang sudah ada, tanpa grammar baru — sehingga lapisan staging Java per-field **lenyap**.
> *(Iterasi awal memakai grammar `$prefix`; ditinggalkan demi `_source` yang lebih sederhana — lihat §6.0.)*
>
> Dokumen ini ditulis **pelan-pelan**: konsep dibangun dari dasar. Kalau Anda sudah paham pipeline, lompat
> ke §6 (solusi) dan §8 (rencana).

---

## 0. TL;DR

- Rule post-processing sekarang **hanya bisa membaca output JOLT** (satu map datar).
- Nilai lain yang dibutuhkan rule (kategori Step-2, dimensi master, hasil konversi) **disuntik tangan**
  lewat kode Java "staging" ke key `_`-prefixed. Kode itu **hardcode nama field + logika** per channel.
- Itu melanggar prinsip *"No hardcoded domain knowledge in runtime code"* (CLAUDE.md), tumbuh tanpa batas,
  dan sudah menyebabkan bug (trace ≠ publish).
- **Solusi:** ekspos data sumber di satu key `_source`; rule membacanya via path titik biasa
  (`_source.<field>`). Staging Java per-field tak diperlukan lagi. **Slice 1 sudah terbukti** (§8).
- Modelnya **sudah ada** di kode: `CapabilityEnrichmentService` (staging logistik yang 100% data-driven).

---

## 1. Latar: pipeline publish dalam 1 gambar

Saat sebuah produk dipublish ke channel, datanya melewati tahap-tahap ini:

```
masterProductData (dari frontend + merge Step-2)
   │
   ▼  JOLT transform  ── memetakan field master → path payload channel (deklaratif, per-kategori)
transformedData (satu map datar: hasil JOLT)
   │
   ▼  STAGING          ── ⚠️ kode Java menyuntik nilai bantu ke key "_..." (topik dokumen ini)
   │
   ▼  post-processing  ── rule data-driven mengubah/membangun bentuk payload channel
   │
   ▼  buildChannelAttributes ── buang key "_", filter support-field
   ▼
payload → sync-service → API channel
```

Fokus kita: **panah "STAGING"** di tengah.

---

## 2. Apa itu "staging" — pelan-pelan

### 2.1 Definisi

**Staging** = kode Java yang, setelah JOLT dan sebelum post-processing, **menaruh nilai bantu** ke dalam
`transformedData` di key yang diawali garis bawah (`_sourceImages`, `_channelCategoryId`,
`_packageDimension`, `_categoryAttributes`, `_resolvedLogistics`).

Key `_`-prefixed dipakai karena `buildChannelAttributes` nanti **membuangnya** — jadi nilai bantu ini tak
pernah bocor ke payload channel; ia hanya "bahan" untuk rule post-processing.

### 2.2 Contoh paling sederhana: `_channelCategoryId`

Merchant memilih kategori Shopee di Step-2 → tersimpan sebagai `channelCategoryId` di `masterProductData`.
Tapi JOLT tak memetakannya, jadi **hilang** dari `transformedData`. Supaya rule bisa mengisinya ke
`category_id`, kode Java ini menyuntiknya kembali:

```java
// ChannelPublishService (staging)
Object channelCategoryId = request.getMasterProductData().get("channelCategoryId");
if (channelCategoryId != null && !String.valueOf(channelCategoryId).isBlank()) {
    transformedData.put("_channelCategoryId", channelCategoryId);   // ← staging
}
```

Lalu rule membacanya:

```java
// rule shopee-set-category-id
sourcePath = "_channelCategoryId";  targetPath = "category_id";  op = COPY_PATH
```

Perhatikan: untuk memindahkan **satu nilai** dari A ke B, kita butuh **kode Java + satu key perantara +
satu rule**. Itu tiga lapisan untuk satu penyalinan.

### 2.3 Di mana kodenya

Semua di `ChannelPublishService`, tersebar sebagai helper:
`collectSourceImageUrls` → `_sourceImages`; inline → `_channelCategoryId`; `buildPackageDimensionCm`
→ `_packageDimension`; `stageCategoryAttributes` → `_categoryAttributes`. (`_resolvedLogistics` beda —
lihat §7.)

---

## 3. Kenapa staging bikin galau (masalahnya)

1. **Hardcoded domain knowledge di runtime.** `buildPackageDimensionCm` menuliskan nama field
   (`dimensions/length/width/height/unit`) dan konversi (`inci ×2.54`) **sebagai literal Java**. Ini
   persis yang dilarang CLAUDE.md — "field-name vocabularies" dan aturan bisnis tak boleh jadi literal
   runtime.
2. **Tumbuh tanpa batas.** Tiap field baru / channel baru = helper Java baru + key baru + rule baru.
   Shopee sudah ~14 rule; tiap satunya mungkin bergantung pada staging Java tersembunyi.
3. **Dua salinan yang gampang divergen.** Staging ditulis di `processPublish` (publish nyata) **dan**
   `buildTrace` (inspector). Sudah **dua kali** salah satu ketinggalan → trace menampilkan hasil berbeda
   dari publish nyata (bug `_channelCategoryId`, lalu `_packageDimension`). Inspector yang seharusnya
   jujur malah bisa bohong.
4. **Onboarding berat.** Untuk paham nasib satu field, orang baru harus tahu ada **kode Java tersembunyi**
   yang menyuapi rule — bukan cukup membaca rule-nya. Permukaan tersebar: helper Java + katalog op +
   konvensi key `_` + urutan priority.

---

## 4. Akar masalah: engine cuma bisa melihat OUTPUT JOLT

Kenapa staging harus ada? Karena engine post-processing membaca dari **satu map datar** — hasil JOLT:

```java
// GenericPostProcessingEngine.getNestedValue(data, path)
// 'data' = HANYA output JOLT. Path "category_id" dicari di dalam map itu saja.
```

Dan JOLT (operasi `shift`) **hanya mengeluarkan field yang dipetakan**; sisanya dibuang. Jadi:
- `channelCategoryId` (tak dipetakan) → hilang → **harus di-stage balik**.
- nilai master mentah (dimensi) → hilang → **harus di-stage**.
- pilihan Step-2 → tak pernah masuk JOLT → **harus di-stage**.

> **Inti:** staging adalah **gejala**. Penyakitnya = *rule tidak bisa membaca sumber apa pun selain output
> JOLT.* Kalau rule bisa membaca sumber lain langsung, staging tak perlu ada.

---

## 5. Tiga jenis staging (klasifikasi — penting, karena solusinya beda)

| Jenis | Contoh | Yang dilakukan | Solusi ideal |
|---|---|---|---|
| **Passthrough** | `_channelCategoryId` | cuma menyalin nilai yang sudah ada di master | rule baca `_source.<field>` langsung → **staging hilang** ✅ |
| **Reshape** | `_packageDimension`, `_sourceImages` | konversi/kumpul (in→cm, dedupe URL) | op data generik baca `_source.<field>` → **helper Java dibuang** |
| **Enrich** | `_categoryAttributes`, `_resolvedLogistics` | butuh data eksternal (DB/API) | tetap butuh service, **tapi data-driven** (pola capability) |

---

## 6. Solusi: satu reserved key `_source` (bukan grammar `$prefix`)

> **Status: sebagian sudah terbukti.** Slice 1 (passthrough `channelCategoryId`) sudah diimplementasikan &
> lulus golden test — lihat §8. Bagian reshape/enrich masih rencana.

### 6.0 Kenapa BUKAN grammar `$prefix`

Iterasi pertama desain ini mengusulkan namespace `$master.` / `$step2.` / `$capability.` — engine perlu
**parser prefix baru**. Itu menambah satu "bahasa mini" untuk dipelajari. Kita tinggalkan demi pendekatan
yang lebih sederhana di bawah: **tak ada grammar baru, tak ada perubahan resolver.**

### 6.1 Ide inti (satu kalimat)

Taruh **seluruh data sumber** (master + Step-2 yang sudah ter-merge) di **satu key reserved `_source`** pada
data kerja, lalu biarkan rule membacanya lewat **path bertitik biasa** (`_source.channelCategoryId`) —
memakai `getNestedValue` yang **sudah ada**.

### 6.2 Kenapa ini bekerja tanpa perubahan engine

`getNestedValue` sudah bisa menelusuri map nested lewat titik. `_source` hanyalah **satu map nested biasa**
di dalam data kerja, jadi `_source.dimensions.length` = jalan map biasa. **Nol parser baru.** Key `_`-prefixed
otomatis dibuang `buildChannelAttributes`, jadi `_source` tak pernah bocor ke payload.

### 6.3 Staging: dari N helper → SATU baris

```java
// SEBELUM — satu helper per field, diduplikasi di processPublish + buildTrace (sumber drift):
transformedData.put("_sourceImages", collectSourceImageUrls(master));
transformedData.put("_channelCategoryId", master.get("channelCategoryId"));
transformedData.put("_packageDimension", buildPackageDimensionCm(master));   // hardcode nama field + ×2.54
// … tumbuh tiap field

// SESUDAH — satu baris, universal, melayani semua field & channel:
transformedData.put("_source", request.getMasterProductData());
```

### 6.4 Before / after per jenis

**Passthrough — HILANG TOTAL.** ✅ *(sudah diimplementasikan — slice 1)*
```jsonc
{ "name": "shopee-set-category-id",
  "sourcePath": "_source.channelCategoryId", "targetPath": "category_id",
  "operations": [ { "op": "COPY_PATH" } ] }
```
Runtime membuktikan: `COPY_PATH: _source.channelCategoryId → category_id = 300242`. Staging key
`_channelCategoryId` **dihapus total** (dua konsumen — Shopee & TikTok — kini baca `_source` yang sama).

**Reshape — jadi OP DATA (bukan Java).** *(rencana)* `buildPackageDimensionCm` yang hardcode dibuang; jadi
op generik yang membaca `_source.dimensions`, dengan nama field & satuan sebagai **config**:
```jsonc
{ "name": "shopee-set-dimension",
  "sourcePath": "_source.dimensions", "targetPath": "dimension",
  "operations": [ { "op": "BUILD_DIMENSION", "unitField": "unit", "toUnit": "cm",
      "map": { "length": "package_length", "width": "package_width", "height": "package_height" } } ] }
```

**Enrich — tetap service, tapi data-driven.** Lihat §7 — modelnya sudah ada (`CapabilityEnrichmentService`).

### 6.5 Sebelum vs sesudah (ringkas)

| | Sekarang | `_source` |
|---|---|---|
| Tambah field baru | edit Java `ChannelPublishService` | edit **config rule** (`_source.<field>`) |
| Nama field / konversi | literal di Java | **data** di rule/op |
| Konsep baru yang dipelajari | — | **nol** (path titik yang sudah ada) |
| Staging Java | N helper (2 salinan) | **1 baris** (`put("_source", master)`) |
| Trace vs publish | bisa divergen | **hampir nol** (1 baris identik) |
| Onboarding | Java tersembunyi + rule + priority | **baca rule saja** |

---

## 7. Teladan yang SUDAH ADA di kode Anda: `CapabilityEnrichmentService`

Kabar baik: pola yang benar untuk jenis **Enrich** sudah dipraktikkan. `_resolvedLogistics` **tidak**
di-hardcode — ia di-resolve oleh `CapabilityEnrichmentService` yang:
- membaca config `channel_capability_operations` dari MongoDB (endpoint, field, filter),
- service-nya **generik** (tak ada pengetahuan logistik Shopee sebagai literal),
- hasilnya di-stage di bawah `stagingKey` yang **juga dari config**.

Artinya "staging" untuk logistik **sudah data-driven**. Usulan ini pada dasarnya = *menjadikan semua
staging seperti CapabilityEnrichmentService* — dan untuk passthrough/reshape, bahkan lebih sederhana lagi
(cukup rule baca `_source.<field>`, tanpa service sama sekali).

---

## 8. Rencana migrasi bertahap (jangan sekaligus)

Pipeline baru saja jalan; refactor ini **inkremental & aman**, bukan rewrite.

| Slice   | Isi                                                                                                                                                                       | Risiko | Status         |
|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|----------------|
| **1**   | Stage `_source` (satu baris) + migrasi passthrough `channelCategoryId` (Shopee + TikTok) ke `_source.channelCategoryId`; hapus staging `_channelCategoryId`. Golden test identik. | rendah | **✅ selesai**  |
| **2**   | Migrasi passthrough lain (mis. field Step-2) ke `_source.<field>`.                                                                                                         | rendah | rencana        |
| **3**   | Op reshape generik (`BUILD_DIMENSION`, `COLLECT_URLS`) baca `_source.<field>` → buang `buildPackageDimensionCm`, `collectSourceImageUrls`, hapus `_packageDimension`/`_sourceImages`. | sedang | rencana        |
| **4**   | Samakan `_categoryAttributes` ke pola `CapabilityEnrichmentService`.                                                                                                        | sedang | rencana        |
| **5**   | Hapus sisa helper staging Java di `processPublish`/`buildTrace`.                                                                                                            | rendah | rencana        |

Tiap slice dijaga **golden test** (`ShopeePostProcessingGoldenTest`) + **publish-trace inspector** — jadi
setiap langkah bisa diverifikasi output payload-nya tak berubah sebelum lanjut.

---

## 9. Ongkos, risiko, dan non-goal (jujur)

**Ongkos.** Slice 1 kecil (sudah selesai); sisanya 3–4 slice. Perlu re-authoring rule (sourcePath →
`_source.<field>`) + beberapa op reshape baru. Bukan 15 menit, tapi juga bukan rewrite.

**Risiko.** (a) Rule lama tanpa prefix tetap jalan (path tanpa `_source.` = output JOLT) → sudah
backward-compatible. (b) Op reshape baru harus punya golden test sebelum menggantikan helper Java.
(c) `_source` sebaiknya diperlakukan read-only oleh rule (jangan menulis balik ke dalamnya); nilainya
menunjuk map master yang sama, jadi mutasi tak sengaja akan mengubah master.

**Non-goal.**
- Bukan menghapus JOLT — JOLT tetap untuk mapping master→payload yang lurus.
- Bukan menghapus enrichment service — DB/API lookup memang butuh kode (tapi data-driven).
- Bukan menyentuh kontrak sync-service (metadata workflow) — itu isu terpisah.

---

## 10. Keputusan terbuka (untuk tim)

1. **Nama key.** `_source` vs `_src` vs `_input` — pilih yang paling jelas. (Sudah dipakai: `_source`.)
2. **Perlu memisah master vs Step-2?** Step-2 sudah di-merge ke masterProductData sebelum JOLT (lihat
   `loadAndMergeChannelData`), jadi satu `_source` sudah memuat keduanya. Kalau kelak perlu bedakan
   asal, bisa tambah `_source.step2.*` — tapi sekarang tak perlu.
3. **Sampai mana reshape jadi op generik vs tetap kode?** Konversi satuan & kumpul-URL layak jadi op;
   logika yang sangat channel-spesifik mungkin lebih jujur sebagai kode teruji (lihat diskusi
   "channel adapter" di [[ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS]]).

---

## 11. Contoh lengkap end-to-end: `dimension`

**Sekarang (hardcoded):**
1. `ensureShippingAttributes` (Java) — backfill `dimensions` dari master.
2. `buildPackageDimensionCm` (Java) — baca `dimensions.{length,width,height,unit}`, konversi in→cm,
   hasilkan `{package_length,width,height}`. ← **hardcode nama field + ×2.54**
3. stage ke `_packageDimension` (di 2 tempat: processPublish + buildTrace). ← **sumber drift**
4. rule `shopee-set-dimension`: `COPY_PATH _packageDimension → dimension`.

Empat lapisan, dua di antaranya Java hardcoded.

**Sesudah (data-driven) — Slice 3:**
1. rule `shopee-set-dimension`:
   ```jsonc
   { "sourcePath": "_source.dimensions", "targetPath": "dimension",
     "operations": [ { "op": "BUILD_DIMENSION", "unitField": "unit", "toUnit": "cm",
        "map": {"length":"package_length","width":"package_width","height":"package_height"} } ] }
   ```

Satu lapisan. Nama field & satuan jadi **data**. Tak ada Java staging, tak ada key perantara, tak ada
kemungkinan trace divergen. Menambah channel lain yang butuh dimensi = tambah rule serupa dengan `toUnit`
sesuai channel — **tanpa menyentuh Java**.

> Bandingkan dengan **passthrough `category_id` (Slice 1, sudah selesai)**: bahkan lebih sederhana —
> `{ "sourcePath": "_source.channelCategoryId", "targetPath": "category_id", "op": "COPY_PATH" }`, tanpa op
> baru sama sekali.

---

## 12. Sampai mana flatten menghapus post-processing? (batas & inti irreducible)

Pertanyaan wajar: *"kalau master di-flatten (dimensi jadi flat, field non-spesial jadi datar), apakah
post-processing bisa hilang sama sekali?"* Jawaban jujur: **tidak** — tapi bisa **mengecil signifikan**.
Bagian ini menjelaskan kenapa, supaya ekspektasi realistis.

### 12.1 Kesalahpahaman yang harus diluruskan

> Post-processing **tidak** ada karena master "nested/berantakan". Ia ada karena **BENTUK PAYLOAD CHANNEL ≠
> BENTUK MASTER**, dan selisih itu kerja domain nyata.

Flatten master **mengecilkan selisih** untuk field sederhana, tapi bentuk yang **dituntut channel** tetap
harus dibangun di suatu tempat — apa pun bentuk master-nya.

### 12.2 Apa yang flatten HAPUS vs SISAKAN (contoh Shopee, ~14 rule)

| Kategori | Contoh rule | Flatten menghapusnya? | Kenapa |
|---|---|---|---|
| Passthrough / rename | `set-category-id` | ✅ ya → jadi JOLT mapping | master field = payload field |
| Konversi | `set-dimension` | ✅ ya, **jika satuan dinormalkan di input** | JOLT bisa map, tak bisa konversi |
| Reshape skalar→struktur | `seller_stock` `N→[{stock:N}]`, `brand`, `image {}` | ❌ tidak | channel **wajib** bentuk itu; master tak punya |
| Agregasi atas list | item `weight=MAX`, `price=MIN(variants)` | ❌ tidak | butuh komputasi lintas varian |
| Build list-of-object | `tier_variation`, `model` | ❌ (field spesial varian) | logika varian |
| Enrich eksternal | `logistic_info`, `attribute_list` | ❌ tidak | butuh data DB/API |

**Hitungannya:** flatten + normalisasi-satuan menghapus **~2** rule (category, dimension). **~12 sisanya
irreducible** — bukan karena master nested, tapi karena channel menuntut bentuk/nilai yang **tak ada di
master mana pun** (array `seller_stock`, default `brand`, alur 2-langkah `image`, agregasi item-level,
enrichment).

### 12.3 Lever terbesar: normalisasi DI INPUT, bukan di pipeline

Contoh dimensi memperjelas: yang memaksa post-processing bukan "nested"-nya, tapi **konversi in→cm** (JOLT
tak bisa). Kalau dimensi disimpan **flat + satuan kanonik (cm) saat input**, maka:

```jsonc
// dimensi jadi JOLT mapping MURNI — tanpa op, tanpa post-processing:
"length": "dimension.package_length", "width": "dimension.package_width", "height": "dimension.package_height"
```

Jadi strategi paling ampuh menyusutkan post-processing = **normalkan master di titik simpan** (flat +
satuan kanonik + skalar channel-agnostik), sehingga field sederhana runtuh jadi mapping JOLT dan rule-nya
lenyap. Ini juga membuat `BUILD_DIMENSION` (Slice 3) tak perlu untuk dimensi.

### 12.4 Kesimpulan realistis (80%, bukan 100%)

- **Kejar:** flatten + normalisasi-di-input → bunuh rule sederhana (passthrough, konversi). Field skalar
  jadi JOLT murni.
- **Terima:** inti kecil post-processing untuk **bentuk channel-spesifik + agregasi + enrichment +
  default**. Itu tak lenyap dengan flatten — cuma pindah tempat (JOLT tak sanggup → post-processing **atau**
  kode adapter, lihat [[ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS]] §opsi B).

> Analogi: flatten master = merapikan bahan mentah. Tapi resep tiap channel (bentuk payload) tetap harus
> dimasak. Merapikan bahan mempercepat masakan sederhana; hidangan kompleks (`seller_stock`, `model`,
> logistik) tetap perlu dimasak.

---

## Lampiran: file yang terdampak (untuk implementasi)

- `publishing/service/ChannelPublishService.java` — stage `_source` (satu baris, di processPublish +
  buildTrace); hapus helper staging bertahap. **(Slice 1: selesai)**
- `channel/config/ChannelConfigurationDataLoader.java` — rule pakai `sourcePath` = `_source.<field>`.
  **(Slice 1: `shopee`/`tiktokshop-set-category-id` selesai)**
- `channel/service/GenericPostProcessingEngine.java` — op reshape baru (`BUILD_DIMENSION`, `COLLECT_URLS`)
  untuk Slice 3. Resolusi path `_source.<field>` **tak perlu perubahan** — `getNestedValue` sudah cukup.
- `channel/service/catalog/OperationCatalogService.java` — daftarkan op reshape baru (Slice 3).
- Test: `ShopeePostProcessingGoldenTest` sebagai jaring tiap slice.
