# P0-5 — Golden-Payload Tests (Jaring Regresi Transform)

> Turunan dari [`01-analisis-kesiapan-produksi-mvp.md`](01-analisis-kesiapan-produksi-mvp.md) §5 (P0-5) —
> **rekomendasi #1 sejak assessment awal**
> ([`ARCHITECTURE-ASSESSMENT`](../ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS.md) §7 #1). Menutup
> daftar P0 go-live.

---

## 1. Masalah

Pipeline transform (JOLT + post-processing) berlapis & data-driven. Tanpa test "master X ⇒ body HARUS
= Z", setiap perubahan spec/engine bisa **diam-diam** mengubah body yang diterima channel — regresi
yang baru ketahuan saat listing di produksi salah.

## 2. Desain

`JoltGoldenPayloadTest` mengunci **stage JOLT** untuk 7 channel:

- Mengambil **spec seeded REAL** dari `DefaultJoltSpecDataLoader.build*JoltSpec()` (builder-nya **murni**
  — hanya menyusun `List<Map>` dari literal, tak menyentuh repository) via `new DefaultJoltSpecDataLoader(null)`
  + refleksi. Jadi test menjaga **mapping produksi sebenarnya**, bukan salinan.
- Menjalankan `JoltTransformationService` **asli** (tanpa dependency) atas satu master fixture bersama
  `golden/jolt/source.json`.
- Membandingkan output dengan golden ter-commit `golden/jolt/<channel>.expected.json` (JsonNode equality —
  semantik, urutan-key tak masalah).

**Deterministik, tanpa Mongo, cepat, CI-friendly.** Contoh golden nyata yang dihasilkan:

```
shopify → { "product": { "title": "...", "body_html": "...", "variants": [...], "vendor": "..." } }
amazon  → { "Item": { "SKU": "...", "DescriptionData": { "Title", "Brand", "Description" }, "Price", "Quantity" } }
shopee  → { "item_name": "...", "original_price": 29.99, "normal_stock": 100, "logistic_info": {...}, "variants": [...] }
```

## 3. Layout fixture & alur update

```
src/test/resources/golden/jolt/
  source.json               ← master channel-agnostic bersama (name/description/price/variants/…)
  shopify.expected.json      ← golden per channel (ter-capture dari transform nyata)
  amazon.expected.json
  … (walmart, ebay, wix, shopee, tiktokshop)
```

**Meng-update golden itu disengaja** (bukan tambal): hapus `<channel>.expected.json` atau jalankan
`-Dgolden.capture=true`. Harness menulis output saat ini ke `src/test/resources` **lalu FAIL** agar
diff-nya ditinjau di PR. Jalankan ulang untuk konfirmasi hijau. **Jangan** edit golden manual demi
menghijaukan test tanpa memahami diff. Golden yang hilang di CI = **fail** (golden wajib ter-commit).

## 4. Cakupan & yang ditunda

**Tercakup:** stage **JOLT** untuk 7 channel (shopify, amazon, walmart, ebay, wix, shopee, tiktokshop),
memakai spec seeded real → regresi mapping produksi tertangkap.

**Ditunda (tipe fixture berikutnya):**
1. **Golden post-processing** — `GenericPostProcessingEngine.process(data, channelConfig)` deterministik
   tanpa Mongo (`OperationCatalogService` mengisi katalog **in-code**, bukan Mongo; `VariantAxisVocabulary`
   punya konstruktor test). Butuh fixture `ChannelConfiguration` (rules) — pola sama, tinggal ditambah.
2. **Golden full-pipeline** — `publishProduct(dryRun=true)` di atas `@SpringBootTest` + testcontainers Mongo
   (`AbstractMongoContainerTest` sudah ada) → menjaga JOLT+stage-`_`-keys+post-proc+wrap end-to-end.
   Fidelitas tertinggi, tapi butuh seed store/config/kredensial; sengaja ditunda dari slice ini.
3. **Fixture per-kategori** — golden untuk spec AI-generated per kategori (bukan hanya system-default).

## 5. Cara memperluas

- **Channel baru:** tambah di `@ValueSource` + pastikan `build<Channel>JoltSpec` ada → jalankan (capture) →
  review → commit golden.
- **Kasus/kategori baru:** perkaya `source.json` atau tambah fixture master kedua (mis. produk fashion
  bervarian) + parameterkan harness atas (channel × source).

## 6. Status

- **Build:** `BUILD SUCCESS`. **Test:** 33 hijau (golden 7 + P0-4 7 + P0-3 6 + P0-2 6 + kontrak sync 1 +
  steps 2 + hash 3 + listing-state 1).
- **Daftar P0 go-live LENGKAP:** P0-1 … P0-5 semua ✅. Jaring regresi determinisme kini aktif — fondasi
  yang diminta sejak assessment awal.
