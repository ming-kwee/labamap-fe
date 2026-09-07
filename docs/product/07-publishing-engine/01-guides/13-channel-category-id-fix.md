# Channel-native `category_id` — Fix "CategoryId is required" (4-step, JOLT-spec-independent)

> **Berlaku lintas-channel.** Mekanisme ini generic untuk **semua** channel yang punya field
> `CATEGORY_TREE` (Shopee, TikTok, Lazada, Amazon, eBay, WIX, Shopify, WooCommerce). **Shopee dipakai
> sebagai contoh kerja** karena di situlah bug pertama muncul. Hanya **satu** dari empat step yang
> per-channel (rule `<channel>-set-category-id`); tiga sisanya sudah otomatis untuk semua channel — lihat
> §7 "Menambah channel lain". **Rule yang sudah aktif: Shopee (`category_id`, int) & TikTok Shop
> (`category_id`, string).**

> **Gejala (Shopee).** Publish gagal di sync-service meski di frontend Step-2 kategori sudah dipilih:
>
> ```
> HttpFunctions - Response Body:
> {"error":"product.error_param",
>  "message":"invalid AddItemRequest.CategoryId: CategoryId is required",
>  "debug_message":"parameter invalid"}
> ```
>
> **Akar masalah singkat.** `category_id` tidak pernah terbentuk di payload create-item karena
> (a) kategori native tersimpan di `channelData["<channel>_category_id"]` (mis. `shopee_category_id`),
> bukan di field khusus `channelCategoryId`; dan (b) spec JOLT **AI-generated per-kategori menang** atas
> seed default dan **tidak** memetakan kategori ke `category_id` (agent hanya melihat
> *master fields → apiSchema*, sedangkan id kategori channel ada di `channelData` Step-2, bukan di master
> product).

---

## 1. Kenapa gagal — trace lengkap (contoh Shopee)

`ChannelProductData` yang dipublish tersimpan seperti ini:

```jsonc
{
  "masterProductId": "6b94ba9a-…",
  "storeId": "shopee-shopee-01",
  "channelType": "shopee",
  "channelData": {
    "shopee_category_id": "300242",     // ← kategori pilihan merchant ADA DI SINI
    "logistics_channel_id": "81017",
    "200134": "1221", "200162": "1428"
  },
  "channelCategoryId": null             // ← field khusus (Phase 6) KOSONG
}
```

Alur resolve spec JOLT dan kenapa `category_id` hilang:

```
                         ┌──────────────────────── PUBLISH ────────────────────────┐
ChannelProductData       │  loadAndMergeChannelData:                                 │
  channelData            │    channelData → masterProductData                        │
   shopee_category_id ───┼──►  masterProductData["shopee_category_id"]="300242"      │
  channelCategoryId=null │    Phase-6 inject di-SKIP (channelCategoryId null)         │
                         │                                                            │
                         │  categoryResolver.resolveForPublish(masterProductData)     │
                         │    = productType.categorySlug  (mis. "clothing")           │  ← kunci lookup spec
                         │       BUKAN shopee_category_id=300242                       │
                         │                                                            │
                         │  findJoltSpecWithFallback(shopee, "clothing", orgId)       │
                         │    org+category > system+category > org+default > SEED     │
                         └───────────────────────────┬──────────────────────────────┘
                                                     │
                         ┌───────────────────────────┴──────────────────────────────┐
      Spec mana yang menang?                                                          │
      ┌──────────────────────────────┐        ┌──────────────────────────────────┐  │
      │ SEED default (buildShopee-    │        │ AI-GENERATED per-kategori         │  │
      │ JoltSpec)                     │        │ (generatedBy="ai-agent-v1")       │  │
      │                               │        │                                   │  │
      │ shopee_category_id→category_id│  MENANG│ master fields → apiSchema paths    │  │
      │  ⇒ category_id="300242" ✅    │  ◄──── │ TIDAK tahu shopee_category_id      │  │
      │  (kalau seed dipakai, sukses) │ (lebih │  ⇒ TIDAK ada mapping category_id ❌ │  │
      └──────────────────────────────┘ spesifik)└──────────────────────────────────┘  │
                                                     │                                 │
                                          category_id ABSEN dari output JOLT           │
                                          post-processing tak menambal (tak ada rule)  │
                                          ⇒ payload create-item tanpa category_id ❌    │
                                          ⇒ channel: "CategoryId is required"          │
                         └────────────────────────────────────────────────────────────┘
```

> **Kesimpulan diagnostik.** Fakta bahwa publish gagal = **ada spec generated** untuk kategori master
> produk ini, dan spec itu tidak memproduksi `category_id`. Ini persis skenario yang diperingatkan di
> `CLAUDE.md`: *"adding a channel-specific output field inside the default JOLT seed is of limited value —
> any category with a generated spec won't have it."*

Selain itu ada **temuan sekunder**: karena kategori ada di `channelData["<channel>_category_id"]` dan bukan
di `channelCategoryId`, maka pre-flight gate (`preflightCategoryId`) dan lookup atribut-kategori
(`getCategoryAttributes`) — yang membaca `channelCategoryId` — **juga buta** terhadap kategori merchant.
Model data-nya terpecah dua.

---

## 2. Prinsip perbaikan

`category_id` adalah field create-item yang **sah** (ada di `apiSchema`), **tetapi sumbernya**
(`<channel>_category_id` dari Step-2 `channelData`) adalah **urusan pipeline** yang tidak diketahui agent AI.
Maka `category_id` harus diproduksi **independen dari spec JOLT** — pola yang sama persis dengan
`_sourceImages` dan `_resolvedLogistics`. Sekaligus, sumber-kebenaran kategori dinormalisasi ke satu field
(`channelCategoryId`) supaya semua konsumen konsisten.

Target akhir setelah perbaikan:

```
             SEBELUM (rusak)                          SESUDAH (4 step)
   ┌───────────────────────────────┐      ┌────────────────────────────────────────┐
   │ channelData[<ch>_category_id]  │      │ channelData[<ch>_category_id]="300242"   │
   │  hanya kebaca kalau seed dipakai│      │      │ (Step 1/2: dinormalisasi)          │
   │                               │      │      ▼                                    │
   │ generated spec ⇒ category_id ✗│      │ channelCategoryId="300242" (1 sumber)    │
   │                               │      │      │ Phase-6 inject → masterProductData  │
   │                               │      │      ▼                                    │
   │                               │      │ _channelCategoryId (staging, Step 3)     │
   │                               │      │      │ COPY_PATH (rule, Step 4)            │
   │                               │      │      ▼                                    │
   │                               │      │ category_id="300242"  ✅ (seed & generated)│
   └───────────────────────────────┘      └────────────────────────────────────────┘
```

---

## 3. Empat step yang diimplementasikan

| # | Step | File | Peran | Cakupan |
|---|------|------|-------|---------|
| 1 | Normalisasi saat simpan | `ChannelProductDataService.saveChannelData` | Promosikan `channelData[<CATEGORY_TREE field>]` → `channelCategoryId` | **semua channel** |
| 2 | Backfill data lama | `ChannelProductCategoryBackfillMigration` (`@Order(150)`) | Isi `channelCategoryId` untuk baris lama (mis. yang `FAILED`) | **semua channel** |
| 3 | Staging JOLT-independent | `ChannelPublishService` (dekat staging `_sourceImages`) | `masterProductData.channelCategoryId` → `transformedData["_channelCategoryId"]` | **semua channel** |
| 4a | Operasi engine `COPY_PATH` | `GenericPostProcessingEngine` (+ `OperationCatalogService`) | Salin skalar `sourcePath` → `targetPath`, reusable | **generic** |
| 4b | Rule `<channel>-set-category-id` | `create<Channel>PostProcessingRules` | Salin `_channelCategoryId` → field kategori payload channel | **per-channel** (aktif: Shopee, TikTok Shop) |

Step **3 + 4** yang langsung menyembuhkan error `CategoryId`. Step **1 + 2** menyatukan sumber-kebenaran
sehingga pre-flight gate & lookup atribut-kategori ikut konsisten.

### Step 1 — Normalisasi saat simpan (server-side, generic)

Frontend Step-2 mengirim kategori sebagai entri `channelData` biasa (keyed `<channel>_category_id`), bukan
lewat field khusus `channelCategoryId`. Karena frontend tak bisa diubah dari backend, normalisasi
dilakukan di `saveChannelData`: cari nama field `CATEGORY_TREE` channel ini (**data-driven** dari
`ecommerce_master_attributes`, mis. shopee → `shopee_category_id`, tiktokshop → `tiktok_category_id`), lalu
bila `channelCategoryId` request kosong tetapi `channelData[field]` ada, promosikan nilainya ke
`channelCategoryId`.

```java
// resolveCategoryTreeFieldName(channelType): "shopee" → "shopee_category_id" (data-driven, tanpa hardcode)
if (request.getChannelCategoryId() != null && !request.getChannelCategoryId().isBlank()) {
    existing.setChannelCategoryId(request.getChannelCategoryId());          // (a) client baru
} else if (categoryTreeField != null && !categoryTreeField.isBlank()
        && request.getChannelData() != null) {
    Object picked = request.getChannelData().get(categoryTreeField);         // (b) dari channelData
    if (picked != null && !String.valueOf(picked).isBlank()) {
        existing.setChannelCategoryId(String.valueOf(picked));
    }
}
```

> Tidak ada literal `"shopee_category_id"` di runtime — nama field diambil dari attribute `CATEGORY_TREE`
> di MongoDB (patuh aturan *"No hardcoded domain knowledge in runtime code"* di `CLAUDE.md`), jadi otomatis
> berlaku untuk channel apa pun.

### Step 2 — Backfill baris lama (generic)

Baris `channel_product_data` yang tersimpan **sebelum** Step 1 (termasuk dokumen `FAILED` Anda) belum punya
`channelCategoryId`. Migrasi `ChannelProductCategoryBackfillMigration` (`@Order(150)`, setelah
`CategoryTreeAttributesMigration` @141) mengisi `channelCategoryId` dari `channelData[<CATEGORY_TREE field>]`
untuk **semua** channel sekaligus.

- **Idempoten** — hanya mengisi bila `channelCategoryId` kosong.
- **Non-destruktif** — tak pernah menghapus key `channelData` asli.
- **Data-driven** — peta `channelType → field` dibangun dari semua attribute `CATEGORY_TREE`.

### Step 3 — Staging `_channelCategoryId` (generic)

`loadAndMergeChannelData` (Phase-6) sudah meng-inject `channelCategoryId` ke `masterProductData`. Tapi JOLT
membaca `category_id`/`<channel>_category_id`, **bukan** `channelCategoryId`. Maka setelah JOLT dan sebelum
post-processing, nilainya di-*stage* ke key reserved `_channelCategoryId` di `transformedData` — untuk
channel apa pun:

```java
Object channelCategoryId = request.getMasterProductData().get("channelCategoryId");
if (channelCategoryId != null && !String.valueOf(channelCategoryId).isBlank()) {
    transformedData.put("_channelCategoryId", channelCategoryId);   // reserved "_" key → di-strip dari payload
}
```

> Untuk channel yang belum punya rule `set-category-id`, `_channelCategoryId` hanyalah key reserved yang
> tak dipakai (di-strip dari payload) — jadi staging ini aman untuk semua channel.

### Step 4 — Rule `<channel>-set-category-id` + operasi `COPY_PATH`

**4a — operasi generic.** `COPY_PATH` menyalin skalar/objek dari `sourcePath` → `targetPath`. No-op bila
source kosong. **Bukan** anggota `CONSTRUCTOR_OPS`, jadi tidak "memiliki" target-nya (lihat catatan
desain).

**4b — rule per-channel.** Tiap channel mendeklarasikan rule sendiri karena **nama field kategori di
payload berbeda**. Contoh Shopee:

```java
PostProcessingRule.builder()
    .name("shopee-set-category-id")
    .sourcePath("_channelCategoryId")
    .targetPath("category_id")          // ← Shopee add_item field
    .priority(6).enabled(true)
    .operations(List.of(Map.of("op", "COPY_PATH")))
    .build();
```

- Berjalan untuk **seed default MAUPUN semua spec generated** → memutus akar bug.
- Koersi ke `int` ditangani mapping `category_id → chnlAttrType "int"` yang ada
  (`ChannelAttributeMappingsMigration`) — `"300242"` (String) → `300242` (int) di payload.
- **No-op** bila `_channelCategoryId` tak ada (publish non-store / tanpa kategori Step-2).
- `COPY_PATH` **sengaja BUKAN** `CONSTRUCTOR_OPS` di `PostProcessingContractService`, sehingga ia
  **tidak "memiliki"** target `category_id`. Ini penting: kalau memiliki, `JoltTargetCollisionValidator`
  bisa memblokir/meremediasi spec seed yang juga menulis `category_id`. Karena tidak, seed & rule hidup
  berdampingan menghasilkan nilai sama.

---

## 4. Perbandingan dengan `_sourceImages` (agar jelas bedanya)

Ketiga staging (`_sourceImages`, `_resolvedLogistics`, `_channelCategoryId`) memakai **pola yang sama**:
key reserved `_`-prefixed di `transformedData`, dibaca oleh post-processing rule, JOLT-spec-independent.
Perbedaannya ada pada **asal data**, **bentuk data**, dan **operasi** yang mengonsumsinya.

```
                 SUMBER                     STAGING KEY          BENTUK        RULE / OP            TARGET PAYLOAD
 _sourceImages   masterProductData          _sourceImages        List<String>  shopee-build-image-  images.image_url_list
                 (image/images URLs)                             (list URL)    url-list / FOR_EACH   [{uri,scene}]
                 di-collect collectSource-                                     (STRING_TO_OBJECT +
                 ImageUrls()                                                    SET_DEFAULT scene)

 _resolvedLogis- CapabilityEnrichment-      _resolvedLogistics   List<Map>     shopee-build-        logistic_info
 tics            Service (live API          {value,label}        (list obj)    logistics / FOR_EACH  [{logistic_id,enabled}]
                 GetChannelList) +                                            (RENAME + COERCE)
                 selectionField

 _channelCatego- masterProductData          _channelCategoryId   String        <channel>-set-cate-  category_id
 ryId (BARU)     .channelCategoryId                              (skalar)      gory-id / COPY_PATH   (Shopee: int via
                 (dari Step-2, di-stage                                                             mapping; TikTok:
                 di ChannelPublishService)                                                          string apa adanya)
```

### Kenapa `_channelCategoryId` pakai `COPY_PATH`, bukan `FOR_EACH` seperti `_sourceImages`?

| Aspek | `_sourceImages` | `_channelCategoryId` |
|---|---|---|
| Bentuk data | **List** URL → butuh iterasi + reshape tiap item | **Skalar** tunggal ("300242") |
| Transformasi | Bungkus tiap URL jadi `{uri, scene:"normal"}` | Salin apa adanya (int coercion di layer mapping) |
| Operasi | `FOR_EACH` + `STRING_TO_OBJECT` + `SET_DEFAULT` | `COPY_PATH` (satu langkah) |
| Kepemilikan target | Rule membangun struktur baru di endpoint **lain** (`media_space/upload_image`) — support data | `category_id` adalah field create-item **asli** — bukan support data |
| Ada di `apiSchema`? | **Tidak** (`image.image_id_list` yang di apiSchema, bukan `image_url_list`) | **Ya** (`category_id` memang field create-item) |

> **Inti perbedaan.** `_sourceImages` membangun **struktur support** untuk endpoint upload gambar (bukan
> bagian body create-item) — makanya bentuknya list objek `{uri,scene}` dan pakai `FOR_EACH`.
> `_channelCategoryId` hanya **mengisi satu field skalar** yang memang bagian create-item, tapi yang
> sumbernya tak diketahui agent JOLT — makanya cukup `COPY_PATH`. Keduanya sama-sama JOLT-independent,
> sehingga bekerja identik untuk seed default maupun spec generated per-kategori.

Lihat juga: `[[shopee-image-two-step-flow]]` untuk detail alur `_sourceImages`.

---

## 5. Verifikasi

Setelah restart aplikasi (loader `@Order(5)` me-refresh `postProcessingRules`, sehingga rule
`<channel>-set-category-id` ter-apply ke DB yang sudah ada — lihat `existing.setPostProcessingRules(...)`):

1. **Log migrasi backfill** — cari:
   `ChannelProductCategoryBackfill: filled channelCategoryId on N record(s) from channelData`
   dan verifikasi dokumen `FAILED` Anda kini punya `channelCategoryId:"300242"`.
2. **Re-save Step-2** (opsional) untuk produk baru — pastikan `channelCategoryId` terisi di DB.
3. **Publish ulang** — log post-processing memuat:
   `COPY_PATH: _channelCategoryId → category_id = 300242`
   dan payload create-item ke sync-service memuat `"category_id": 300242` (int, bukan `"300242"`).
4. **Regenerasi spec** — bahkan setelah agent AI membuat spec baru per-kategori, `category_id` tetap
   terisi karena diproduksi di post-processing, bukan di JOLT.

## 6. Yang SENGAJA tidak dilakukan

- ❌ Menambah `spec.put("<channel>_category_id","category_id")` di `build<Channel>JoltSpec` — hanya menolong
  produk yang jatuh ke seed default; spec generated tetap tak punya. (Lihat `CLAUDE.md`.)
- ❌ Menambah `category_id` khusus ke `apiSchema` — `category_id` sudah ada; masalahnya di *sourcing*,
  bukan skema. `apiSchema` adalah cermin body create-item, jangan dibengkokkan untuk kebutuhan pipeline.

---

## 7. Menambah channel lain

Karena Step 1–3 + operasi `COPY_PATH` sudah generic, mengaktifkan fix ini untuk channel lain **hanya
butuh satu rule**:

1. Pastikan channel punya attribute `CATEGORY_TREE` di `ecommerce_master_attributes`
   (`CategoryTreeAttributesMigration` sudah menyeed untuk semua channel) → Step 1/2/3 otomatis jalan.
2. Tambah rule di `create<Channel>PostProcessingRules` (`ChannelConfigurationDataLoader`):

   ```java
   PostProcessingRule.builder()
       .name("<channel>-set-category-id")
       .sourcePath("_channelCategoryId")
       .targetPath("<field kategori di body create-item channel>")   // Shopee/TikTok: category_id;
       .priority(6).enabled(true)                                    // eBay: category id taksonomi; dst.
       .operations(List.of(Map.of("op", "COPY_PATH")))
       .build();
   ```
3. Bila field kategori channel harus bertipe numerik, pin lewat productField mapping
   `chnlAttrType "int"` (seperti Shopee `category_id`) — lihat `[[chnlattrtype-inference-gotcha]]`. Bila
   string (seperti TikTok `category_id`), tak perlu pin apa pun — `inferAttrType` sudah menghasilkan
   `string` untuk nilai String.

Tidak perlu menyentuh Java runtime lain: staging, normalisasi, backfill, dan operasi `COPY_PATH` sudah
dipakai bersama.

**Contoh yang sudah aktif:**

| Channel | Rule | targetPath | Tipe | Pin `int`? |
|---|---|---|---|---|
| Shopee | `shopee-set-category-id` | `category_id` | int | ya (`category_id → int`) |
| TikTok Shop | `tiktokshop-set-category-id` | `category_id` | string | tidak (String lewat apa adanya) |

---

## 8. KONTRAS penting: field yang diisi sync-service (Shopee `image.image_id_list`)

`add_item` gagal `invalid AddItemRequest.Image: Image is required` meski upload gambar sukses. Ini **BUKAN**
kasus yang sama dengan `category_id` — dan membedakannya adalah kunci arsitekturnya.

**Pembeda inti: kapan nilai field itu ADA.**

| | `category_id` | `image.image_id_list` |
|---|---|---|
| Nilai diketahui saat **BFF publish**? | **Ya** (merchant pilih Step-2) | **Tidak** — `image_id` (`sg-…`) baru ada **setelah** `upload_image` |
| Pemilik nilai | BFF | Channel API (via sync-service) |
| Pola benar | **BFF isi** (COPY_PATH dari staging) | **BFF kirim placeholder `{}`; sync-service isi** via `updatePaths.to` |

Jadi untuk `image`, tugas BFF **hanya menyediakan placeholder kosong `{}`**; sync-service (`create_CP_Media_Pre`
workflow) meng-upload lalu menulis `image_id` ke `image.image_id_list` via `response-update-to.updatePaths`.
Yang salah adalah **spec JOLT generated menjatuhkan atribut `image`** (agent memetakan master → apiSchema,
dan `image.image_id_list` adalah target write-back milik workflow) → placeholder absen → "Image is required".

Fix yang benar — **jamin placeholder, JANGAN isi nilainya**:

```java
// createShopeePostProcessingRules — rule shopee-seed-image-placeholder (priority 16)
PostProcessingRule.builder()
    .name("shopee-seed-image-placeholder")
    .priority(16).enabled(true)
    .operations(List.of(Map.of("op", "SET_FIELD", "path", "image", "value", new HashMap<>())))  // image = {}
    .build();
```

> **Anti-pattern yang dihindari.** Percobaan awal mengisi `image.image_id_list` dengan URL sumber (COPY_PATH
> dari `_sourceImages`). Itu **melawan** write-back sync-service: URL bukan `image_id` valid, dan mengisi
> target milik workflow dari BFF memecah `updatePaths` (penyebab error `Transformed object is neither a List
> nor a Map`). Placeholder `{}` cocok dengan payload terverifikasi:
> `{"chnlAttrName":"image","chnlAttrType":"object","chnlAttrValue":"{}"}`.

**Prinsip umum yang berlaku:**

| Sumber nilai field | Pola | Contoh |
|---|---|---|
| Diketahui BFF saat publish | BFF **isi** (post-processing bila perlu JOLT-independent) | `category_id`, brand, logistik terpilih |
| Lahir dari **panggilan channel** | BFF **sediakan placeholder**; sync-service isi via `updatePaths.to` | `image.image_id_list`, `item_id` (add_item), `model_id` (add_model) |

---

## File yang diubah

| File | Perubahan | Cakupan |
|---|---|---|
| `channel/service/GenericPostProcessingEngine.java` | + operasi `COPY_PATH` (`executeCopyPath`) | generic |
| `channel/service/catalog/OperationCatalogService.java` | + registrasi katalog `COPY_PATH` | generic |
| `channel/config/ChannelConfigurationDataLoader.java` | + rule `shopee-set-category-id` & `shopee-seed-image-placeholder` (`createShopeePostProcessingRules`) & `tiktokshop-set-category-id` (`createTiktokshopPostProcessingRules`) | per-channel (Shopee, TikTok Shop) |
| `publishing/service/ChannelPublishService.java` | + staging `_channelCategoryId` | generic |
| `ecommerce/channelproduct/service/ChannelProductDataService.java` | + normalisasi `channelData[CATEGORY_TREE]` → `channelCategoryId` | generic |
| `config/ChannelProductCategoryBackfillMigration.java` | **baru** — backfill `channelCategoryId` (`@Order(150)`) | generic |

---

## Addendum (2026-08-22) — Shopify taxonomy category tidak nempel: GID ke-strip jadi kode telanjang

**Gejala.** Produk hasil import/publish ke Shopify sukses (ada `channelProductId`, varian & gambar
nempel), tetapi field **Category** di admin Shopify tetap kosong ("Choose a product category"),
padahal `channel_product_data` menyimpan `shopify_taxonomy_category_id` /`channelCategoryId` =
`gid://shopify/TaxonomyCategory/aa-1-15` dan Step-2 sudah menampilkannya (centang hijau).

**Diagnosis (via publish-trace).** Body payload **sudah berisi** `product.category`, tetapi valuenya
`"aa-1-15"` — **prefix `gid://shopify/TaxonomyCategory/` ke-strip**. Identifier kategori Shopify Product
Taxonomy adalah **GID penuh**; `aa-1-15` telanjang bukan id taxonomy valid untuk API Shopify manapun →
kategori tak ter-resolve → kosong.

**Akar.** `ChannelPublishService.normalizeCategoryGid` (dipanggil di jalur output publish) meng-strip
prefix berdasar metadata Shopify `categoryGidPrefix` + `categoryGidFieldPath`
(`ChannelConfigurationDataLoader.createShopifyConfiguration`). Asumsi "Shopify REST expects plain code"
itu **salah** untuk taxonomy baru.

**Fix (langkah 1, data-only).** Hapus kedua key metadata itu dari seed Shopify → `normalizeCategoryGid`
jadi no-op (ia satu-satunya konsumen kedua key tsb, dan hanya di jalur publish; import pakai
`importConfig.categoryFetch` terpisah → tak terpengaruh). Update loader menimpa `metadata` penuh
(`setMetadata`, `ChannelConfigurationDataLoader:142`) → key basi hilang dari dokumen DB saat restart, tanpa
utak-atik DB manual. GID penuh kini mengalir apa adanya ke payload.

**Catatan lapisan-2 (belum dikerjakan — verifikasi dulu).** Publish Shopify lewat **REST**
(`POST/PUT products.json`). Bila Shopify memperlakukan `product.category` sebagai **read-only** di REST
(lihat catatan `ChannelMetadataMigration.updateProductWorkflow`: *"fields Shopify treats as read-only are
ignored"*), maka GID penuh via REST pun tetap diabaikan → butuh langkah **GraphQL
`productUpdate(input:{ id, category })`** (pola dua-langkah seperti upload media). Alur uji: terapkan
langkah 1 → publish ulang → cek admin. Muncul = REST menerima; masih kosong = tambah step GraphQL.

---

## Langkah 2 — GraphQL `productUpdate(category:)` (REST tak bisa set taxonomy)

**Konfirmasi lapangan.** Setelah langkah 1, publish-trace menunjukkan body sudah membawa
`product.category = gid://shopify/TaxonomyCategory/aa-1-15` (GID penuh), **tetapi kategori tetap tidak
nempel** — membuktikan `product.category` **read-only di REST** `products.json`. Taxonomy category baru
hanya bisa di-set via **GraphQL Admin API** `productUpdate(input:{ id, category })`.

Karena semua panggilan channel dieksekusi oleh **sync-service** (Temporal, repo
`"/Users/admin/MyKalix/notifikasi temporal"`), langkah ini = **workaction baru + implementasi sync**.

### Sisi BFF (SUDAH dikerjakan)

`ChannelMetadataMigration.buildShopifyMetadata()` menambah workaction **generik + array-capable**
(`graphqlPostWriteWorkflow()`), di-seed di DUA key (mirror create_CP_Media / update_CP_Media):

- `workaction#create_CP_Graphql`
- `workaction#update_CP_Graphql`

Value = JSON **array** operasi GraphQL (saat ini 1: `set_category`). Bentuk per-op:

```json
[{
  "name": "set_category",
  "endpoint": {
    "url": "https://labamap.myshopify.com/admin/api/{apiVersion}/graphql.json",
    "method": "POST", "action": "ON_GRAPHQL", "contentType": "application/json",
    "headers": { "X-Shopify-Access-Token": "<token>" }
  },
  "graphql": {
    "query": "mutation SetProductCategory($id: ID!, $category: ID!) { productUpdate(input: { id: $id, category: $category }) { product { id category { id fullName } } userErrors { field message } } }",
    "variables": { "id": "gid://shopify/Product/${product.id}", "category": "${product.category}" },
    "guard": "${product.category}",
    "errorPaths": ["errors", "data.productUpdate.userErrors"]
  }
}]
```

Semua data yang dibutuhkan sudah tersedia sebagai **channelAttribute**: `product.id` (ditulis-balik oleh
`create_CP` response-update-to) dan `product.category` (GID penuh, hasil langkah 1). Seed OVERWRITE untuk
system-default + MERGE untuk config org → kedua key otomatis masuk saat restart.

### SYNC-SERVICE-SPEC (yang harus diimplementasikan)

Model eksekusi sync = pipeline **14 langkah tetap** di `ChannelProductWorkflowImpl.syncProduct()`; key baru
**tidak** jalan otomatis. Tambahkan:

1. **Konstanta** — `io/products/shared/Constants.java` (`SyncMetadata`), ikuti pola
   `INSTRUCTION_SETUP__WORKACTION$…` (composite key `grouping.subGrouping:key`):
   ```java
   public static final String INSTRUCTION_SETUP__WORKACTION$CREATE_CP_GRAPHQL =
       "instruction.setup:workaction#create_CP_Graphql";
   public static final String INSTRUCTION_SETUP__WORKACTION$UPDATE_CP_GRAPHQL =
       "instruction.setup:workaction#update_CP_Graphql";
   ```

2. **Langkah baru** di `ChannelProductWorkflowImpl.syncProduct()` — sisipkan **setelah** langkah "Update
   Crud State" (product.id sudah tertangkap), sebelum langkah media. Pilih key per-operasi seperti langkah
   lain (CREATE→`CREATE_CP_GRAPHQL`, UPDATE→`UPDATE_CP_GRAPHQL`); SKIP bila key absen (`hasMetadataKey`).
   Ini **array-instruction loop** (value = array) — iterasi tiap op.

3. **Activity `executeGraphql`** (loop-type; daftarkan di dispatcher `invokeActivity` bila perlu). Per op:
   - Resolve `endpoint.url` (`{apiVersion}` + `${attr}`) & headers (`<token>`→kredensial) — **reuse**
     `HttpFunctions` yang sama dengan `Create_CP`.
   - **Guard**: resolve `graphql.guard` dari attributeMap; bila blank/null → **skip op** (produk tanpa kategori).
   - **Variables**: untuk tiap entry `graphql.variables`, resolve `${attr}` dari attributeMap (mekanisme
     substitusi sama dengan URL). Contoh: `${product.id}`→`10139992883490`,
     `${product.category}`→`gid://shopify/TaxonomyCategory/aa-1-15`.
   - **Body** yang dikirim: `{"query": <graphql.query>, "variables": <resolvedVariables>}` (Content-Type
     application/json). Ini masuk ke jalur HTTP generik yang sudah ada — tak perlu reshape khusus.
   - **Deteksi error** (GraphQL balas HTTP 200 walau gagal): setelah sukses transport, untuk tiap path di
     `graphql.errorPaths`, cek nilai di response JSON; bila **non-empty** (mis. `data.productUpdate.userErrors`
     berisi item, atau top-level `errors` ada) → tandai **ERROR** + log isinya. Jangan hanya andalkan HTTP status.
   - `response-update-to` opsional (tak diperlukan untuk set_category).

4. **Idempotensi / determinisme Temporal**: activity ini murni satu HTTP call + parsing — aman. Karena
   productUpdate idempotent, aman dijalankan di CREATE maupun UPDATE.

**Verifikasi mutation vs versi API.** Contoh di atas untuk Admin API **2024-01** (`productUpdate(input:
ProductInput!)`, `ProductInput.category: ID`, `Product.category: TaxonomyCategory`). Bila store dipin ke
versi lain, sesuaikan bentuk mutation.

**Uji end-to-end.** Restart BFF (seed workaction) → implement sync sesuai spec → publish ulang → cek admin
Shopify: field Category harus terisi "Apparel & Accessories › Clothing › Skirts". Bila `userErrors` muncul,
kemungkinan GID kategori tidak valid untuk versi taxonomy store, atau butuh scope `write_products`.

### Sisi sync-service (SUDAH diimplementasikan)

Repo `"/Users/admin/MyKalix/notifikasi temporal"` (Temporal, Maven), branch `temp-v2`. Kompilasi hijau.

| File | Perubahan |
|---|---|
| `io/products/shared/Constants.java` | + `INSTRUCTION_SETUP__WORKACTION$CREATE_CP_GRAPHQL` / `…UPDATE_CP_GRAPHQL` |
| `io/products/channelProduct/service/Graphql_CP.java` | **baru** — eksekusi satu op GraphQL: guard + substitusi `${attr}` pada variables, bangun body `{query,variables}`, reuse `HttpFunctions` (URL `{apiVersion}`/`${attr}`, header `<token>`) |
| `io/products/channelProduct/activities/ChannelProductActivities.java` | + `executeGraphqlPostWrite(cmd)` |
| `io/products/channelProduct/activities/ChannelProductActivitiesImpl.java` | + impl: loop semua op di array; validasi HTTP 2xx + deteksi `errorPaths` (GraphQL 200-with-errors); agregasi OK/ERROR |
| `io/products/channelProduct/workflow/ChannelProductWorkflowImpl.java` | + langkah opsional `graphql_post_write_channel_product` setelah reorder, sebelum persist akhir; non-fatal (tidak compensate); jalan untuk CREATE & UPDATE via `opKey` |

Perilaku: langkah SKIP bila key `*_CP_Graphql` absen; op `set_category` self-skip bila `${product.category}` kosong; error GraphQL (mis. `data.productUpdate.userErrors` non-empty) → step ERROR (masuk `step_results`) tapi publish tetap sukses (produk sudah ada). Deteksi error pakai `errorPaths` dari metadata BFF — tidak hardcode.

**Uji E2E:** restart BFF (seed workaction) + jalankan sync-service build baru → publish ulang → cek admin Shopify Category terisi. Bila `userErrors` muncul di `step_results`, sesuaikan bentuk mutation ke versi API store / scope token `write_products`.

---

## Langkah 3 — Clear-category + optimasi "hanya saat kategori berubah"

Setelah set/ganti kategori bekerja (log konfirmasi `userErrors: []`), dua penyempurnaan:

**(b) Menghapus kategori kini ter-propagate.** Sebelumnya guard `${product.category}` mem-skip op saat
kategori kosong → clear tak pernah terkirim. Sekarang mutation pakai `$category: **ID**` (nullable) + op
punya `nullableVariables: ["category"]`: bila `${product.category}` kosong/tak-resolve, sync mengirim
`category: null` (bukan skip) → `productUpdate(input:{category:null})` mengosongkan kategori di channel.

**Optimasi "berubah saja".** Guard dipindah dari `${product.category}` ke trigger baru
`${product.category_sync}` yang **hanya** di-inject BFF saat kategori memang berubah:
- CREATE: kategori ada.
- UPDATE: `desired != pushedChannelCategoryId` (mencakup set, ganti, DAN clear).
- UPDATE tanpa perubahan kategori → trigger tak di-inject → guard kosong → op **skip** (hemat 1 GraphQL call).

**State baru:** `ChannelProductData.pushedChannelCategoryId` — kategori yang **terakhir dikirim** ke channel
(≠ `channelCategoryId` yang = pilihan merchant). Di-stamp setelah publish sukses (hanya saat op dijalankan).
Gate: `ChannelPublishService.categoryChanged(request, state)` (static, pure, unit-tested di
`CategorySyncGateTest`).

**File (BFF):** `ChannelProductData` (+`pushedChannelCategoryId`), `ChannelProductDataRepository`/`Service`
(+`updatePushedChannelCategoryId`), `PublishProductRequest` (+`categorySyncNeeded`), `ChannelPublishService`
(gate di CREATE/UPDATE + `persistPushedCategory` di rantai sukses + `resolveDesiredCategory`/`categoryChanged`),
`ChannelAttributeConverterService` (stage support-attr `product.category_sync`), `ChannelMetadataMigration`
(seed op: `$category: ID`, `nullableVariables`, guard `${product.category_sync}`).
**File (sync):** `Graphql_CP` (dukungan `nullableVariables` → kirim JSON null saat kosong).

**Batas jujur (edge):** stamping `pushedChannelCategoryId` bersifat **optimistik** — di-stamp = desired setelah
publish diterima, padahal op GraphQL berjalan async di sync. Bila op itu **gagal** di channel (mis. `userErrors`),
BFF tetap menstamp desired → publish berikutnya menganggap "tidak berubah" → op tak retry sampai kategori
berubah lagi. Kegagalan tampil di `step_results` (non-fatal). Jarang (GID valid + scope `write_products`);
kalau butuh anti-gap sejati, perlu round-trip hasil op dari sync ke BFF (seperti imageChannelIds).
