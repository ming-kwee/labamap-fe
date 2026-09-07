# Analisa Kelengkapan Master Attributes & Prinsip Arsitektur Lapisan Field

> **Pembahasan.** Dokumen ini menjawab tiga pertanyaan yang saling terkait:
>
> 1. Master attribute yang **bukan** channel field (`isChannelField=false`) — apakah sudah cukup
>    *canonical* namun tetap cocok untuk semua channel?
> 2. Master attribute yang **channel field** (`isChannelField=true`) — apakah sudah cukup untuk
>    mendukung masing-masing channel-nya?
> 3. Jika gabungan kedua kelas field itu — dan payload hasil transformasinya — **tetap belum cukup**
>    mengakomodasi semua field di channel (mis. Shopee masih banyak field kosong walau sudah berhasil
>    sync), **prinsip arsitektur apa yang harus kita pegang?**
>
> Sumber angka: `src/main/resources/json/ecommerce/master-attributes-ecommerce.json` (seed yang benar-
> benar dimuat oleh `MasterAttributeMigrationService`, bukan `-comprehensive.json` yang sudah di-comment
> out di `MasterAttributeDataLoader`).

---

## 0. TL;DR — Jawaban Singkat

- **Master schema sekarang: 51 attribute** = **39 canonical** (`isChannelField=false`) + **12 channel-field**
  (`isChannelField=true`).
- Yang **39 canonical sudah benar sebagai lapisan canonical** — mereka konsep lintas-channel (name, price,
  sku, images, weight, variant axes). Yang perlu diperbaiki bukan "canonical atau tidak"-nya, tapi
  beberapa **gap cakupan** dan satu **kesalahan pemodelan** (dimensi & inventory yang seharusnya
  konsep tunggal, lihat §3).
- Yang **12 channel-field TIDAK, dan memang tidak dimaksudkan, untuk mendukung *semua* field tiap channel.**
  Mereka hanya sampel kurasi tangan untuk 5 channel (wix, tiktokshop, shopify, amazon/walmart, magento/
  woocommerce). **Shopee, Lazada, eBay, Etsy punya NOL channel-field master attribute** — dan Shopee
  tetap sync dengan sukses. Itu bukan bug; itu buktinya arsitektur bekerja sesuai desain.
- **Prinsip inti (§5):** *Master schema adalah irisan konseptual lintas-channel, BUKAN union dari semua
  field setiap channel.* "Ekor panjang" (long tail) field spesifik-channel/spesifik-kategori adalah
  **DATA**, bukan master attribute — ia dilayani oleh Path B (API kategori live), attribute mappings,
  post-processing, dan `apiSchema`, **tanpa pernah memperbesar master schema dan tanpa hardcode**.
  "Berhasil sync" ≠ "listing lengkap"; kelengkapan adalah spektrum yang di-*gate* oleh required-field,
  bukan oleh keberadaan master attribute.

---

## 1. Dua Kelas Field & Angka Faktualnya

`EcommerceMasterAttributeDocument.isChannelField` membelah master schema jadi dua kelas dengan tujuan
yang berbeda (lihat [08-step2-channel-fields.md](08-step2-channel-fields.md)):

| Kelas             | Flag                   | Muncul di                   | Bucket nilai                          | Jumlah   |
|-------------------|------------------------|-----------------------------|---------------------------------------|----------|
| **Canonical**     | `isChannelField=false` | Step 1 (form master produk) | field master produk                   | **39**   |
| **Channel-field** | `isChannelField=true`  | Step 2 (tab per store)      | `channelData` → di-merge sebelum JOLT | **12**   |

`targetChannels` seed: `shopify, amazon, walmart, ebay, etsy, magento, woocommerce, wix, tiktokshop`.

> **Temuan penting #1 — Shopee & Lazada tidak ada di master schema sama sekali.**
> Keduanya **tidak** tercantum di `targetChannels` maupun di `supportedChannels` attribute mana pun.
> Artinya, seluruh dukungan Shopee/Lazada **0% berasal dari master attribute** — 100% dari lapisan
> data-driven (`apiSchema`, attribute mappings, Path B, post-processing, channel metadata). Ini fondasi
> penting untuk menjawab pertanyaan ke-3.

### Frekuensi `supportedChannels` di 39+12 attribute

```
shopify      41    ebay         26
woocommerce  40    etsy         22
magento      37    (shopee)      0   ← tidak ada di master schema
amazon       31    (lazada)      0   ← tidak ada di master schema
walmart      31
wix          30
tiktokshop   30
```

Pola ini konsisten: makin "platform toko" (Shopify/Woo/Magento) makin banyak konsep master yang relevan;
makin "marketplace ketat" (eBay/Etsy, dan ekstrem: Shopee/Lazada) makin sedikit yang bisa dinyatakan
sebagai konsep master — sisanya adalah field spesifik-kategori yang hanya bisa datang dari API channel.

---

## 2. Analisa 1 — Apakah yang Non-Channel-Field Sudah Cukup Canonical & Cocok Semua Channel?

### 2.1 Definisi "canonical" yang kita pakai

Sebuah field layak jadi **canonical master attribute** jika memenuhi ketiga syarat:

1. **Konsep lintas-channel** — punya arti yang sama di ≥2 channel (bukan istilah milik satu platform).
2. **Diisi oleh seller sekali**, lalu diterjemahkan per channel (bukan nilai yang cuma bermakna di satu API).
3. **Stabil** — bukan field yang tiap kategori berganti bentuk (yang begitu adalah domain Path B).

### 2.2 Evaluasi ke-39 canonical attribute

Dikelompokkan per section (seed: 13 product_info, 2 media, 8 pricing_inventory, 8 variants, 11 shipping,
2 tax*, 7 publishing):

| Section             | Contoh field                                                                                  | Verdict canonical                                                                                                                     |
|---------------------|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `product_info`      | name, description, brand, condition, category, status, tags, material, warranty, author, isbn | ✅ Konsep universal. `author`/`isbn` sengaja `category-specific` displayLevel — benar.                                                 |
| `media`             | mainImage, galleryImages                                                                      | ✅ Sudah dinormalisasi jadi satu konsep `images` di input (lihat [[canonical-images-jolt-independent]]).                               |
| `pricing_inventory` | price, comparePrice, costPrice, sku, barcode, inventory, trackInventory, lowStockAlert        | ✅ Universal. Lihat catatan pemodelan §3.                                                                                              |
| `variants`          | size, color, flavor, storage-capacity, screen-size, hasVariants, variantConfigurator          | ⚠️ Lihat §2.3 — axis divariabelkan sebagai field tetap, padahal axis sebenarnya adalah **data** (`product_types.variantDimensions`).  |
| `shipping`          | weight, length, width, height, requiresShipping, shippingClass, vendor                        | ✅/⚠️ Universal, tapi 4 dimensi terpisah — lihat §3.                                                                                   |
| `publishing`/`tax`  | metaTitle, slug, channelSettings, taxable, taxCode                                            | ✅ (taxable/taxCode dipindah ke channel-field, benar — lihat §4).                                                                      |

**Kesimpulan Analisa 1:** ke-39 field **memang canonical dan cocok lintas-channel** — tidak ada satu pun
yang "menyusup" istilah milik satu platform (istilah platform sudah dipisah ke kelas channel-field).
Yang perlu diperbaiki bukan status canonical-nya, melainkan tiga hal berikut.

### 2.3 Tiga catatan perbaikan (bukan soal "canonical atau bukan")

1. **Variant axis sebagai field tetap (`size`, `color`, `flavor`, `storage-capacity`, `screen-size`).**
   Ini "canonical" tapi sekaligus melanggar semangat data-driven: axis sebenarnya adalah **data**
   (`product_types.variantDimensions`), bukan daftar field yang di-hardcode di master schema. Konsekuensi:
   produk dengan axis di luar 5 nama ini (mis. `voltage`, `length` untuk kain) tidak punya master attribute
   dan bergantung penuh pada resolver axis. **Prinsip:** master schema boleh menyimpan 5 axis "umum" sebagai
   *kenyamanan UI*, tetapi kebenaran axis harus tetap `variantDimensions` (sudah demikian — lihat
   [[variant-axes-data-driven]]). Jangan menambah axis baru ke master schema; tambahkan ke data.

2. **Dimensi & inventory ter-atomisasi** (lihat §3).

3. **Gap cakupan channel** — beberapa field yang mestinya lintas-channel malah bertanda `supportedChannels`
   sempit, mis. `comparePrice` chans=8 (kenapa bukan 9?), `costPrice`/`trackInventory`/`requiresShipping`
   chans=3–4. Ini bukan salah desain besar, tapi perlu di-audit: apakah pengecualiannya disengaja
   (channel benar-benar tak punya konsepnya) atau kelalaian seed.

---

## 3. Catatan Pemodelan: Dimensi & Inventory yang Ter-atomisasi

`weight`, `length`, `width`, `height` adalah **empat** attribute terpisah; `inventory`, `trackInventory`,
`lowStockAlert` juga terpisah. Secara canonical ini benar (tiap channel memang punya empat angka dimensi),
tetapi ada dua channel di mana bentuknya harus di-*rakit ulang* (mis. Shopee `dimension.{package_length,
package_width, package_height}` — lihat `createShopeeApiSchema()` L1496). **Perakitan ini benar dilakukan
di post-processing, BUKAN dengan menambah field gabungan ke master schema.** Poin ini menegaskan prinsip
inti: *bentuk payload channel ≠ bentuk master schema*; jembatannya adalah post-processing, bukan
memodifikasi master attribute.

---

## 4. Analisa 2 — Apakah yang Channel-Field Sudah Cukup Mendukung Tiap Channel?

Ke-12 channel-field attribute dan channel pemiliknya:

| Field                                                                                                                                                                                           | Channel                                        | Section      |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|--------------|
| `ribbon`                                                                                                                                                                                        | wix                                            | product_info |
| `productCertifications`, `sizeChart`, `tiktokshopWarehouseId`, `tiktokshopDeliveryServiceIds`, `codEnabled`, `tiktokshopCategoryId`, `tiktokshopExternalProductId` | tiktokshop                                     | (macam2)     |
| `taxable`                                                                                                                                                                                       | shopify, magento, woocommerce                  | tax          |
| `taxCode`                                                                                                                                                                                       | shopify, amazon, walmart, magento, woocommerce | tax          |
| `fulfillmentBy`                                                                                                                                                                                 | amazon, walmart                                | shipping     |
| `publishedScope`                                                                                                                                                                                | shopify                                        | publishing   |

**Verdict: TIDAK cukup untuk "mendukung semua field tiap channel" — dan memang tidak dimaksudkan begitu.**

- **Cakupan sangat timpang.** TikTok Shop punya 7 field; sisanya 0–2. **Shopee, Lazada, eBay, Etsy = 0
  channel-field.** Kalau tujuan kelas ini adalah "menutupi seluruh field unik tiap channel", ia gagal
  untuk 4 dari 9 channel.
- **Tapi itu bukan tujuannya.** `isChannelField=true` hanya untuk field yang: (a) **tidak punya padanan
  master**, DAN (b) **cukup stabil & sering diisi manual** sehingga layak diberi UI eksplisit di Step 2
  (mis. `warehouse_id`, `publishedScope`). Field ini adalah **sampel kurasi**, bukan cermin lengkap API
  channel.
- **Field unik channel yang spesifik-kategori TIDAK masuk sini** — itu domain Path B (§ berikut). Contoh:
  `voltage` untuk elektronik TikTok, `aspectConstraint` eBay, `attribute_list` Shopee — semuanya datang
  dari API kategori channel saat runtime, bukan dari master schema.

Jadi pertanyaan "apakah channel-field sudah cukup?" salah kaprah jika diukur sebagai "apakah menutupi
semua field channel". Ukuran yang benar: *"apakah setiap field channel-unik yang perlu input manual & stabil
sudah punya tempat?"* — dan jawabannya makin ke arah **ya** seiring field ditambahkan sesuai kebutuhan,
**tanpa** target menjadi lengkap.

---

## 5. Analisa 3 — Mengapa Shopee Tetap Banyak Field Kosong Walau Sync Sukses? (Inti Pembahasan)

### 5.1 Fakta di lapangan

- Master schema: **0 field Shopee** (§1).
- `createShopeeApiSchema()` hanya mendeklarasikan ~17 field: `category_id, item_name, description,
  normal_stock, original_price, currency, weight, item_dangerous, condition, image, dimension,
  attribute_list, seller_stock, logistic_info, brand, tier_variation, model`.
- API `add_item` Shopee v2 sesungguhnya punya **puluhan** field lain: `video`, `wholesale`, `pre_order`,
  `size_chart`, `description_type`/`description_info` (rich text), `tax_info`, `complaint_policy`,
  `gtin_code`, `foldable`, dst.
- **Tetap sync sukses.** Kenapa? Karena Shopee `add_item` hanya mewajibkan sebagian kecil field; sisanya
  optional dan Shopee mengisi default-nya sendiri (mis. `brand_id=0`/NoBrand, `condition=NEW`, `currency=
  IDR` di seed kita adalah default yang sengaja dipasang lewat post-processing rule).

### 5.2 Kenapa banyak field kosong itu **by design**, bukan bug

Sebuah field Shopee bisa "terisi" lewat **salah satu** dari lapisan berikut — dan sengaja **tidak** semuanya
diisi:

```
Lapisan pengisi field channel (urut prioritas saat publish)
─────────────────────────────────────────────────────────────────────────────
1. Canonical master attr        → name, price, sku, images, weight            (Step 1)
2. Master override              → nilai canonical yang di-tweak per channel   (Step 2)
3. Channel-field master attr    → field channel-unik yang stabil              (Step 2 · Shopee: 0)
4. Path A categoryRequirements  → required per-slug kurasi manual             (ChannelConfiguration)
5. Path B category attributes   → attribute per-kategori LIVE dari API channel (channel_category_api_config)
6. Value mappings               → terjemahan nilai master → nilai channel       (channel_field_value_mappings)
7. JOLT spec                    → peta field master → path body channel        (channel_jolt_specs)
8. Post-processing rules        → rakit struktur turunan + SET_DEFAULT          (tier_variation, model, brand…)
9. apiSchema defaults           → nilai default yang tertanam di schema         (condition=NEW, currency=IDR)
10. Sisanya: DIBIARKAN KOSONG   → Shopee pakai default platform-nya sendiri
```

Field seperti `wholesale`, `pre_order`, `size_chart` **sengaja jatuh ke baris 10**. Mengisinya berarti:
menuntut data yang seller belum tentu punya, atau memasukkan asumsi yang bisa salah. **Kosong = benar**
selama field itu optional di `add_item`.

### 5.3 Yang SALAH dilakukan (anti-pattern yang harus dihindari)

- ❌ Menambahkan `shopeeWholesale`, `shopeePreOrder`, dst. sebagai channel-field master attribute demi
  "melengkapi". Itu membengkakkan master schema dengan istilah satu platform, dan sebagian besar tak akan
  pernah diisi seller.
- ❌ Menambah field tersebut ke `createShopeeApiSchema()` supaya "muncul di payload". `apiSchema` adalah
  **cermin setia create-body** — menambah field pipeline/support ke situ melanggar aturan di `CLAUDE.md`
  ("*never bend apiSchema to fit the pipeline*"). Field pre-upload/derived tinggal di post-processing +
  attribute mappings.
- ❌ Hardcode daftar field Shopee di runtime service. Vokabuler field = data (lihat aturan "No hardcoded
  domain knowledge" di `CLAUDE.md`).

---

## 6. Prinsip Arsitektur yang Harus Dipegang

### P1 — Master schema = irisan konseptual lintas-channel, BUKAN union semua field channel

Master attribute hanya menampung konsep yang **berulang di banyak channel** dan **diisi seller sekali**.
Union dari seluruh field 9+ channel akan berjumlah ribuan dan mayoritas kosong — itu bukan tujuan master
schema. Uji masuk: *"Apakah konsep ini ada, dengan arti sama, di ≥2 channel, dan diisi seller manual?"*
Jika tidak → bukan master attribute.

### P2 — Ekor panjang (long tail) adalah DATA, bukan schema

Field spesifik-channel dan spesifik-kategori dilayani **tanpa** menyentuh master schema maupun kode runtime:

| Kebutuhan                                          | Rumahnya (semua data-driven)                                                                                                   |
|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Field wajib yang berubah per kategori              | **Path B** `channel_category_api_config` → API channel live (lihat [12-path-b…](12-path-b-category-attributes-explanation.md)) |
| Required per-slug kurasi manual                    | **Path A** `ChannelConfiguration.categoryRequirements`                                                                         |
| Field channel-unik yang stabil & manual            | **channel-field master attr** (`isChannelField=true`) — dipakai hemat                                                          |
| Peta master→path body                              | **JOLT spec** (`channel_jolt_specs`)                                                                                           |
| Rakit struktur turunan / default                   | **post-processing rule** (`GenericPostProcessingEngine`)                                                                       |
| Terjemahan nilai                                   | **value mapping** (`channel_field_value_mappings`)                                                                             |
| Alur multi-endpoint (upload → create → write-back) | **channel metadata** (`ChannelMetadataMigration`)                                                                              |

Menambah dukungan channel/kategori/field baru idealnya = **insert dokumen**, bukan tulis kode. Shopee
membuktikan ini: 0 baris master attribute, tetap sync.

### P3 — "Berhasil sync" ≠ "listing lengkap"; kelengkapan di-*gate* oleh required-field

Keberhasilan publish ditentukan oleh **apakah semua required-field (Path A + Path B) terisi**, bukan oleh
apakah setiap field yang channel *bisa* terima sudah terisi. Field optional yang kosong adalah keadaan
valid — channel mengisi default-nya. Completion score (lihat Path B §4) sengaja hanya menghitung
required, bukan seluruh permukaan API. **Jangan mengejar 100% field-fill; kejar 100% required-fill.**

### P4 — Field hanya "naik pangkat" jadi master attribute lewat uji canonical

Alur promosi sebuah field:

```
Field baru muncul di sebuah channel
        │
        ├─ Spesifik-kategori & berubah bentuk? ─────────────► Path B (API kategori). SELESAI.
        │
        ├─ Channel-unik, stabil, perlu input manual? ───────► channel-field master attr (isChannelField=true)
        │
        ├─ Cuma beda NAMA/format dari konsep master? ───────► JOLT + value mapping (tetap 1 canonical attr)
        │
        ├─ Turunan/rakitan dari data lain? ─────────────────► post-processing rule
        │
        └─ Konsep sama di ≥2 channel & diisi seller sekali? ► canonical master attr (isChannelField=false)
```

Default jawaban untuk field marketplace yang eksotik adalah **Path B / post-processing**, bukan master attr.

### P5 — `apiSchema` tetap cermin setia create-body

`apiSchema` bukan tempat menaruh field support/pipeline. Menambah field ke sana hanya sah bila field itu
benar-benar diterima endpoint create channel. Struktur pra-upload, write-back, dan turunan tinggal di
post-processing + attribute mappings (aturan penuh di `CLAUDE.md` → *"apiSchema is the channel's reference
spec — never bend it to fit the pipeline"* dan *"Don't bake channel payload shape into the default JOLT
seed"*).

---

## 7. Rekomendasi Konkret

1. **Audit gap `supportedChannels`** pada canonical attr yang chans<9 (comparePrice, costPrice,
   trackInventory, requiresShipping, barcode) — konfirmasi tiap pengecualian disengaja, dokumentasikan
   alasannya, atau perbaiki seed.
2. **Jangan** menambah channel-field master attr Shopee/Lazada untuk "melengkapi". Biarkan Path B +
   post-processing yang melayaninya. Tambahkan channel-field HANYA saat sebuah field lolos uji P4 cabang
   "channel-unik, stabil, manual".
3. **Instrumentasi keterisian (opsional, untuk visibilitas — bukan untuk gating):** log/rangkuman field
   `add_item` yang kosong per publish, agar operator tahu mana field optional yang *mungkin* ingin di-Path-B-
   kan bila permintaan pasar muncul — tanpa memaksa mengisinya sekarang.
4. **Pertegas variant axis sebagai data**: hentikan penambahan axis baru ke master schema; arahkan ke
   `product_types.variantDimensions` ([[variant-axes-data-driven]]).
5. **Perlakukan `add_item` field-count sebagai non-goal.** KPI kelengkapan = *required-fill rate* per
   (channel × kategori), bukan *field-fill rate*.

---

## 8. Ringkasan Prinsip (Satu Tabel)

| # | Prinsip                                              | Konsekuensi praktis                                                 |
|---|------------------------------------------------------|---------------------------------------------------------------------|
| P1 | Master schema = irisan konsep lintas-channel         | Tolak field satu-platform dari master schema                        |
| P2 | Long tail = data, bukan schema/kode                  | Path B + mapping + post-processing; tambah channel = insert dokumen |
| P3 | Sukses sync di-gate required-field, bukan field-fill | Field optional kosong = valid; KPI = required-fill                  |
| P4 | Promosi field lewat uji canonical                    | Default marketplace-eksotik → Path B/post-processing                |
| P5 | `apiSchema` cermin create-body                       | Field support/derived → post-processing, bukan apiSchema            |

**Intinya:** kekosongan field Shopee bukan indikator arsitektur kurang — justru sebaliknya. Arsitektur
berlapis ini sengaja menahan diri untuk **tidak** memaksa setiap field channel menjadi master attribute,
sehingga master schema tetap ramping & canonical, sementara keragaman tiap channel diserap oleh lapisan
data-driven yang bisa diubah tanpa redeploy.

---

## Rujukan Silang

- [08-step2-channel-fields.md](08-step2-channel-fields.md) — dua flag `isChannelField` vs `isChannelOverridable`
- [11-step2-category-required-fields.md](11-step2-category-required-fields.md) — required per kategori
- [12-path-b-category-attributes-explanation.md](12-path-b-category-attributes-explanation.md) — API kategori live
- [17-apischema-per-channel-per-category.md](17-apischema-per-channel-per-category.md) — kenapa apiSchema tak universal per kategori
- `CLAUDE.md` — aturan "apiSchema is the channel's reference spec" & "No hardcoded domain knowledge"
</content>
</invoke>
