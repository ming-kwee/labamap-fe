# Update Diff Engine — Desain Pipeline UPDATE yang Data-Driven

> **Status:** rencana desain (belum diimplementasi). Sebagian fondasi sudah ada (lihat §14).
> **Tujuan:** UPDATE produk + variant + gambar berjalan lewat **satu pipeline generik**, bukan kode
> yang dijahit satu-per-satu per resource atau per channel.
> **Bahasa:** dokumen ini menjelaskan pelan-pelan, dari "kenapa" ke "bagaimana".

> **📍 Lokasi kode (Fase 3 dekomposisi guide 41).** Seluruh logika image-diff M1–M5 + M4/V2–V5 yang
> dirujuk di dokumen DiffEngine ini — `filterProductImagesForUpdate`, `filterVariantImagesForUpdate`,
> `applyVariantImageAddOnly`, `computeDeleteImageIds`, `computeOrphanedImageIds`,
> `computeVariantImageAssociations`, `mergeImageChannelIds`, `computeImageOrder`, `applyImageReorder`,
> `reorderNeeded`, `keptImageIds`, `removeSrclessImages`, `productImagesChanged`, `channelTracksImages` —
> kini berada di **`publishing/service/PublishImageDiffPlanner.java`** (bukan lagi `ChannelPublishService`).
> `ChannelPublishService` (orchestrator) mendelegasikan ke sana. Nama-metode di DiffEngine/05–10 merujuk
> ke kelas itu.

---

## 0. TL;DR

- **CREATE = "kirim semuanya". UPDATE = "kirim hanya yang berubah".** Untuk tahu mana yang "berubah",
  BFF harus tahu **apa yang channel simpan terakhir** — dan itu bukan hanya id produk, tapi juga id tiap
  **variant** (`model_id`) dan tiap **gambar** (`image_id`).
- Karena itu **fondasi tunggal** desain ini = **round-trip id channel**: setelah create/update, sync
  mengembalikan `sku→model_id` dan `imageKey→image_id`; BFF menyimpannya ke listing-state. Tanpa ini,
  tidak ada operasi surgical yang mungkin.
- Di atas fondasi itu: **satu mesin diff** (`ResourceDiffEngine`) untuk variant DAN gambar, **satu
  bucket-builder** yang menaruh hasil diff ke sync request, dan **semua perbedaan channel ada di metadata
  JSON** (bukan kode).
- Hasil: menambah channel / atribut / jenis gambar = **ubah data**, bukan tulis cabang `if channel==...`.

---

## 1. Masalah: kenapa UPDATE tidak sesederhana CREATE

Pada CREATE, pipeline yang ada sudah bekerja: master product → JOLT → post-processing → `buildChannelAttributes`
→ sync `create_CP` (+ langkah variant & media terpisah karena API channel granular). Semuanya "kirim penuh".

UPDATE berbeda secara mendasar karena **produk sudah hidup di channel** dan punya sub-resource yang
masing-masing punya identitas di sisi channel:

- **Item utama** (nama, deskripsi, harga produk) — 1 objek, id-nya = external product id.
- **Variant** — tiap SKU punya `model_id`/`variant_id` sendiri di channel.
- **Gambar** — tiap gambar punya `image_id` sendiri; gambar produk vs gambar variant berbeda asosiasi.

Kalau UPDATE "kirim penuh" seperti create, dua bencana terjadi:

1. **Duplikasi.** Menjalankan ulang `create_CP_Variants` / `create_CP_Media` akan **menambah** model &
   gambar baru di atas yang lama → produk punya variant/gambar ganda. (Ini kelas bug yang sama dengan
   "listing ganda" yang sudah dicegah idempotency P0-2 di level produk.)
2. **Tak bisa menghapus.** "Kirim penuh" tak punya cara menyatakan "variant X / gambar Y **dibuang**".

Kesimpulan: UPDATE **wajib** berbasis **selisih** (diff) antara *desired end-state* dan *keadaan terakhir
yang channel tahu*. Dan diff itu butuh **id per sub-resource** — bukan cuma id produk.

> **Kontrak sync (§5) sudah menegaskan ini:** *"sync tidak menghitung sendiri delta variant; BFF yang
> memutuskan."* Sync hanya **mengeksekusi** bucket yang dikirim. Otak diff = BFF.

---

## 2. Prinsip desain (agar tidak "dijahit")

Yang ingin kita hindari adalah kode seperti `if (shopify) {...} else if (shopee) {...}` atau logika
terpisah untuk "update variant" vs "update gambar". Alih-alih:

| Prinsip                                       | Wujud konkret                                                                                                                         |
|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| **Satu mesin diff untuk semua resource**      | `ResourceDiffEngine.compute(desired, known, identity, hash)` dipakai variant **dan** gambar                                           |
| **Identitas & deteksi-ubah dari data**        | SKU dari `product_types.variantDimensions`; `imageKey` = URL kanonik; "berubah?" via **content-hash per item** — bukan cek nama-field |
| **Bucket → endpoint/verb/body 100% metadata** | workaction JSON di `ChannelMetadataMigration` (rumah literal yang sah menurut `CLAUDE.md`)                                            |
| **Fondasi tunggal**                           | round-trip id channel (`model_id`, `image_id`) ke listing-state                                                                       |
| **Runtime nol pengetahuan channel**           | BFF hanya menaruh item + id ke *grouping* yang benar; sync mengeksekusi dari metadata                                                 |

Ukuran keberhasilan: **menambah channel baru = seed metadata, nol baris kode runtime.**

---

## 3. Konsep inti (empat kata kunci)

Sebelum masuk fase, empat konsep yang dipakai berulang:

1. **Desired end-state** — bentuk akhir yang diinginkan, dihitung dari master + override Step-2 lewat
   **pipeline yang sudah ada** (JOLT + post-processing). Sama persis dengan CREATE, hanya outputnya
   di-*diff* alih-alih langsung dikirim.

2. **Known state** — apa yang channel simpan terakhir kali, dibaca dari listing-state:
   `variantChannelIds{sku→model_id}`, `imageChannelIds{imageKey→image_id}`, dan hash per item.

3. **Diff → Ops** — hasil membandingkan desired vs known, untuk tiap resource:
   `toAdd` (baru), `toUpdate` (ada + hash berubah), `toDelete` (tak lagi desired), `noop` (ada + hash sama).

4. **Round-trip id** — setelah channel membuat variant/gambar baru, ia memberi id. BFF **menyimpan
   kembali** id itu, agar diff **berikutnya** tahu "ini variant yang mana". Ini rantai yang menyambungkan
   satu publish ke publish selanjutnya.

Alur besar:

```
desired-state (pipeline) ─┐
                          ├─► ResourceDiffEngine ─► Ops(add/update/delete/noop) ─► bucket builder ─► sync
known-state (listing) ────┘                                                                             │
        ▲                                                                                               │
        └──────────────── persistChannelIds (round-trip: model_id + image_id) ◄──── response-update-to ─┘
```

---

## 4. Phase 0 — Fondasi: round-trip id + per-item hash (WAJIB pertama)

**Kenapa duluan:** tanpa id per sub-resource dan hash per item, mesin diff tidak punya masukan. Ini
satu-satunya bagian yang benar-benar "hilang" hari ini dan **memblok semua fase lain**.

### 4.1 Tambahan pada listing-state (`ChannelProductData`)

| Field                                     | Arti                                 | Status                              |
|-------------------------------------------|--------------------------------------|-------------------------------------|
| `variantChannelIds: Map<sku, modelId>`    | id channel tiap variant              | ✅ field sudah ada, **belum terisi** |
| `imageChannelIds: Map<imageKey, imageId>` | id channel tiap gambar               | ➕ baru                              |
| `variantContentHashes: Map<sku, hash>`    | hash payload channel tiap variant    | ➕ baru                              |
| `imageContentHashes: Map<imageKey, hash>` | hash tiap gambar (mis. hash URL/isi) | ➕ baru                              |
| `productContentHash`                      | hash body produk                     | ✅ (`lastPublishedContentHash`)      |

`imageKey` = kunci stabil untuk gambar. Karena gambar kanonik disimpan sebagai URL (`mainImage` +
`galleryImages` digabung jadi `images[]`), **URL sumber** (atau hash-nya) dipakai sebagai `imageKey`.
Gambar variant di-key sebagai `sku:imageKey`. Ini murni data — tak ada logika per-channel.

### 4.2 Tambahan pada poll response (`SyncState` / `WorkflowStatusResponse`)

Sync harus **men-surface** id yang di-assign channel:

| Field                              | Arti                   | Status                                     |
|------------------------------------|------------------------|--------------------------------------------|
| `variantIds: Map<sku, modelId>`    | id model per variant   | ✅ field ada (JsonAlias), **sekarang null** |
| `imageIds: Map<imageKey, imageId>` | id gambar per imageKey | ➕ baru                                     |

### 4.3 Mekanisme (tetap data-driven)

Id di-surface memakai pola `response-update-to` yang **sudah dipakai** untuk external product id pada
`create_CP`. Untuk variant & gambar, metadata `create_CP_Variants` / `update_CP_Variants_Add` /
`create_CP_Media` diberi `response-update-to` yang memetakan respons channel → `sku→model_id` /
`imageKey→image_id`.

Di BFF, generalisasi `persistVariantChannelIds(...)` menjadi `persistChannelIds(...)` yang menyimpan
keempat map (ids + hashes) setelah **setiap** create/update.

> **Output Phase 0:** setelah sebuah produk pertama kali dipublish, listing-state-nya memuat peta id
> lengkap. Mulai titik ini, UPDATE apa pun bisa di-diff.

---

## 5. Phase 1 — `ResourceDiffEngine` (generik, murni, teruji) — ✅ IMPLEMENTED

> **Status: ✅ diimplementasi.** `ResourceDiffEngine` (pure, generic, hash-aware) + `VariantDiff`
> di-refactor menjadi adapter tipis di atasnya (API & perilaku lama dipertahankan). Diuji di
> `ResourceDiffEngineTest` (add/update/delete/noop, hash-aware skip, "no stored hash → update",
> blank-channelId, dedup, generik atas tipe item) + `VariantDiffTest` (5 kasus lama tetap hijau).
> **`ImageDiff` tidak jadi kelas terpisah** — gambar memanggil `ResourceDiffEngine.compute` langsung
> dengan `identity=imageKey`/`hash` gambar (satu mesin, nol duplikasi logika).

Satu fungsi murni, channel-agnostik, dipakai untuk **variant maupun gambar**:

```
ResourceDiffEngine.compute(
    desired : List<Item>,                    // dari pipeline (Phase 2)
    known   : Map<key, (channelId, hash)>,   // dari listing-state (Phase 0)
    identity: Item -> key,                    // sku  |  imageKey  |  sku:imageKey
    hash    : Item -> contentHash             // ContentHash.of(payload channel item)
) -> Ops {
    toAdd    : List<Item>,                     // key tak ada di known
    toUpdate : Map<key, channelId+Item>,       // key ada, hash beda
    toDelete : Map<key, channelId>,            // key ada di known, tak ada di desired
    noop     : List<key>                        // key ada, hash sama → TIDAK dikirim
}
```

Poin penting:

- **`VariantDiff` yang ada sekarang menjadi kasus-khusus dari engine ini** (di-refactor masuk, bukan
  logika terpisah). `ImageDiff` = pemanggilan yang sama dengan `identity`/`hash` berbeda.
- **`toUpdate` hanya item yang hash-nya berubah.** Item yang sama → `noop` → tidak dikirim. Ini yang
  memberi hemat call + anti-duplikat secara *by construction*.
- Pure function → gampang diuji tuntas dengan tabel kasus (add/update/delete/noop/campur).

---

## 6. Phase 2 — Desired-state builder (memakai ulang pipeline yang ada) — ✅ IMPLEMENTED

> **Status: ✅ diimplementasi.** `DesiredStateExtractor` (pure) mengubah **`masterProductData` yang sudah
> di-merge** (bukan output channel-transformed) menjadi desired sets: variants (key=`sku`, hash atas
> field variant **tanpa** field gambar), product images (key=URL, hash=URL), variant images (key=`sku::URL`).
> Sumber kanonik dipilih karena bentuknya seragam lintas channel (nol nama-field per-channel), sudah
> memuat override Step-2, dan transform deterministik → perubahan master ⟺ perubahan yang dikirim.
> Hash desired dipersist ke `listing-state.variantContentHashes`/`imageContentHashes` (via
> `persistContentHashes`, best-effort saat publish sukses) — mengisi field yang disiapkan P0. Diuji di
> `DesiredStateExtractorTest` (9 kasus). Belum di-*wire* ke diff dispatch (itu P3/P6).


**Tidak ada pipeline transform baru.** Pakai yang sudah ada — hanya outputnya di-*diff*, bukan langsung
dikirim:

| Resource | Sumber desired (sudah ada) |
|---|---|
| Body produk | JOLT + `GenericPostProcessingEngine` |
| Variants | `variants[]` transformed + `_productTypeVariantDimensions` |
| Gambar produk | `_sourceImages` (kanonik: `mainImage`+`galleryImages`→`images[]`) |
| Gambar variant | `variantImages` per-variant (kanonik) |

Yang **ditambah** hanyalah *extractor* tipis yang mengubah hasil pipeline menjadi **desired sets**
berkunci stabil + hash per item (pakai `ContentHash.of` yang sudah ada):

```
desiredVariants : List<{ sku, channelPayload, hash }>
desiredImages   : List<{ imageKey, scope=PRODUCT, channelPayload, hash }>
desiredVarImages: List<{ imageKey, scope=VARIANT, sku, channelPayload, hash }>
```

Konsekuensi penting: **CREATE dan UPDATE memakai pipeline yang identik.** UPDATE hanya menyisipkan
langkah diff **sebelum** dispatch. Tidak ada dua jalur yang harus dijaga sinkron.

---

## 7. Phase 3 — Bucket builder → sync request

> **Status: ✅ Mode A (Shopify) serialized + gated; ◑ Mode B di-defer.**
> Untuk channel `RECONCILE_IN_ITEM`, `ChannelAttributeConverterService` menyuntik `model_id` tiap variant
> (via `VariantModelIdInjector`, field dari `idtracking#variants`) ke `update_CP` → channel reconcile by id.
> UPDATE di-gate: hanya jalan bila `variantUpdateMode==RECONCILE_IN_ITEM` **dan** `channelUpdateEnabled`
> (master switch, **tetap default false** sampai E2E). Teruji `VariantModelIdInjectorTest`. Mode B
> (per-model buckets + diskriminator `_diffOp`) menunggu kebutuhan channel per-model.
> **`PublishDiffPlanner`** (pure) menyatukan DESIRED (P2) + KNOWN (P0) lewat engine (P1) → `Plan` berisi
> Ops add/update/delete/noop untuk variant, gambar-produk, dan gambar-variant (dengan `model_id`/`image_id`
> ter-resolve). Known image state dipartisi otomatis (`sku::URL` vs `URL`) agar diff gambar-produk tak
> mengusulkan hapus gambar-variant. Teruji `PublishDiffPlannerTest` (termasuk walkthrough §12).
>
> **Belum:** serialisasi `Plan` → bucket di `SyncChannelProductRequest`. Sebabnya ditemukan saat studi:
> fan-out variant sync mereshape **semua** variant di command per bucket (tak memfilter), jadi pemisahan
> add/update/delete bergantung **kontrak source-key sync** (mana yang dibaca `body-reshape-to.from` tiap
> workaction) yang **belum terverifikasi E2E** dan metadatanya **belum di-seed** (P5). Menyerialkan
> membabi-buta = risiko "dijahit". Langkah berikut: kunci kontrak bucket sync + seed metadata (P5), baru
> serialisasi `Plan`.

Perluas `SyncChannelProductRequest` + `ChannelAttributeConverterService` agar menaruh tiap item hasil
diff ke **grouping** yang tepat. BFF **tidak tahu** endpoint/verb/body — itu dari metadata.

| Ops item | Ditaruh di grouping | Workaction sync yang dijalankan |
|---|---|---|
| variant `toUpdate` | variantGroups tag `update` (+ inject `model_id`) | `update_CP_Variants` |
| variant `toAdd` | variantGroups tag `add` | `update_CP_Variants_Add` |
| variant `toDelete` | variantGroups tag `delete` (+ `model_id`) | `update_CP_Variants_Delete` |
| gambar-produk `toAdd` | mediaGroups tag `add` (scope produk) | `update_CP_Media(_Pre)` |
| gambar-produk `toDelete` | mediaGroups tag `delete` (+ `image_id`) | `delete_CP_Media` *(baru)* |
| gambar-variant `toAdd`/`toDelete` | mediaGroups tag + `model_id`/`image_id` | `update_CP_Variants_Media` / `delete_CP_Variants_Media` |

Tugas BFF di sini murni **routing data** (item + id → grouping/subGrouping). Nol pengetahuan channel.

### 7.1 Kontrak bucket sync — 🔒 DIKUNCI (hasil studi kode sync)

**Temuan.** Setiap variant workaction (`create/update_CP_Variants(_Add/_Delete)`) memanggil
`Create_CP_Variants.transformAttributeToJson_WithSplitVariants`, yang membaca **SELURUH**
`channelProductVariantGroupList` — **tidak ada filter per-bucket di sync**. Jadi mengirim semua variant
+ ketiga key sekaligus = update-semua **dan** add-semua **dan** delete-semua (rusak). Ini yang membuat
"Phase 3 variant diffing" sync belum bisa dipakai apa adanya untuk add+update+delete dalam satu request.

**Kontrak dikunci = DUA MODE, dipilih per kapabilitas channel** (data-driven — flag baru
`variantUpdateMode` di `ChannelConfiguration`, **bukan** if-channel di runtime):

**Mode A — `RECONCILE_IN_ITEM`** (Shopify `PUT /products/{id}.json` menerima `variants[]` & reconcile by id):
- `update_CP` mengirim **seluruh desired `variants[]`**; BFF meng-**inject `model_id`** tiap variant
  (dari `variantChannelIds`, match by sku via `idtracking#variants`).
- Channel: `id` ada → update, `id` kosong → create, variant di-omit → **delete**. Reconcile otomatis.
- **Tanpa** `update_CP_Variants_Add/_Delete`, **tanpa perubahan sync**. Diff dipakai untuk NOOP-skip + tahu
  `model_id` yang di-inject. **Ini jalur pertama yang bisa live (Shopify).**

**Mode B — `PER_MODEL_BUCKETS`** (Shopee/TikTok/WIX: endpoint add/update/delete-model terpisah):
- Butuh surgical bucket. **Diskriminatornya = keberadaan model-id itu sendiri**, bukan flag `_diffOp`
  terpisah (koreksi asumsi awal). Sync memfilter variant group by model-id di field `diff-id-field`
  (dideklarasikan di metadata workaction):
  - `update_CP_Variants` → **keep** group yang **punya** model-id (existing).
  - `update_CP_Variants_Add` → **keep** group yang **tak punya** model-id (baru).
  - `update_CP_Variants_Delete` → to-delete model-ids dikirim caller via `body-reshape` (tanpa filter).
  Ini **`keepVariantGroupsByModelId(cmd, diffIdField, keepExisting)`** — sudah ada di **Kalix**, dan kini
  **di-port ke Temporal** (paritas, nama sama). Inert tanpa `diff-id-field` (semua variant → update) →
  backward compatible.
- **Sisa untuk Mode B live:** (a) seed metadata `update_CP_Variants(_Add/_Delete)` per channel + `diff-id-field`
  (P5); (b) BFF serialisasi `Plan` → variant group + kirim to-delete ids; (c) E2E.

**Gambar:** pola sama — Shopify reconcile lewat `images[]` (inject `image_id`); channel per-endpoint butuh
`add/delete_CP_Media` + `diff-id-field` gambar. Karena image-id round-trip belum ada (P0 defer), Mode-B gambar nanti.

**Rekomendasi urutan:** **Mode A dulu** (Shopify — nol perubahan sync, pakai `model_id` dari P0). Mode B
saat channel per-model benar-benar dibutuhkan.

### 7.2 Kontrak nama bucket — 🔒 gaya B (`update_CP_Variants_Add/_Delete`)

Awalnya kedua sync beda nama; kini **diselaraskan ke gaya B** supaya BFF mengirim **satu key** yang dibaca
**identik** oleh keduanya, tanpa terjemahan per-service.

| | **Kalix** | **Temporal** |
|---|---|---|
| Filter `keepVariantGroupsByModelId` | ✅ asli | ✅ di-port (paritas, nama sama) |
| Nama key bucket | `update_CP_Variants_Add` / `_Delete` | **di-rename** ke `update_CP_Variants_Add` / `_Delete` |
| Membaca key | reuse-graph meng-alias `update_*` → `create_*`, service baca `create_*` | baca key langsung |

**Kenapa gaya B (bukan gaya A `add_/delete_CP_Variants`):**
- **Konsisten** dengan keluarga `update_CP_Variants_*` yang sudah dipakai kedua sync (`update_CP_Variants`,
  `update_CP_Variants_Media(_Pre)`) — `add_/delete_` malah jadi yang ganjil bahkan di dalam Temporal sendiri.
- **Semantik akurat:** bucket add/delete-variant hanya ada saat UPDATE, jadi prefix `update_` benar.
- **Drop-in murni & lebih murah:** Kalix native (nol perubahan — nama-nya load-bearing untuk alias
  `update_→create_`); Temporal cukup rename 2 konstanta. Menghindari lapisan input-alias permanen di Kalix
  yang akan dibutuhkan gaya A.

**Status:** Temporal sudah di-rename ke gaya B; Kalix tak disentuh (sudah native). Kontrak: satu key untuk
kedua sync.

### 7.3 Mode B — sisa pekerjaan per channel (yang belum, + kenapa hati-hati)

**Sudah:** `variantUpdateMode="PER_MODEL_BUCKETS"` di-label pada **Shopee / TikTok / WIX** (data, di
`ChannelConfigurationDataLoader`). **Sisi sync kedua repo SIAP** (filter `keepVariantGroupsByModelId` +
bucket, nama key selaras). **Gate tetap menahan** channel ini `UPDATE_BLOCKED` sampai metadata-nya di-seed —
jadi label ini murni deklarasi niat, **nol perubahan perilaku**.

**Yang tersisa = channel-specific + butuh verifikasi (BUKAN saya karang):**

1. **Seed metadata variant-diff per channel** (endpoint/verb/body **API asli** tiap channel + `diff-id-field`):

   | Workaction | Fungsi | `diff-id-field` |
   |---|---|---|
   | `update_CP_Variants` | update model existing (harga/stok) — mis. Shopee `update_model` | = field model-id variant (mis. `skus.model_id`) |
   | `update_CP_Variants_Add` | add model baru — pola sama `create_CP_Variants` (`add_model`) | idem |
   | `update_CP_Variants_Delete` | hapus model — mis. Shopee `delete_model`; to-delete ids via `body-reshape` | — |

   `diff-id-field` = **field `id` di `idtracking#variants`** (Shopee `skus.model_id`, dst) — sync memakainya
   untuk memfilter: punya model-id → update bucket; kosong → add bucket.

2. **BFF serialisasi Mode B** (generik, belum di-wire):
   - Inject `model_id` per variant **dikenal** (isi), **biarkan kosong** untuk variant baru (kebalikan Mode A
     yang membuangnya) — kekosongan itulah sinyal "baru" bagi add-bucket filter.
   - **Suplai to-delete model-ids** (dari `PublishDiffPlanner.toDelete`) ke tempat yang dibaca body-reshape
     `update_CP_Variants_Delete` (mengikuti pola Kalix).
   - Gate: longgarkan ke `PER_MODEL_BUCKETS` **setelah** metadata channel di-seed.

3. **E2E per channel**, lalu flip `channelUpdateEnabled`.

> **Kenapa saya berhenti di label:** endpoint `update_model`/`delete_model` tiap channel (Shopee/TikTok/WIX)
> butuh **referensi API asli** + tuning E2E (persis catatan E2E pada `update_CP` Shopify). Mengarangnya
> membabi-buta = "dijahit" yang desain ini hindari. Scaffold satu channel (Shopee — paling lengkap
> infrastruktur variant-nya) bisa dikerjakan **dengan** referensi API yang dikonfirmasi.

### 7.4 Shopee Mode B — scaffold BFF + referensi endpoint (endpoint terverifikasi SDK)

**Sudah di-scaffold (BFF, generik, teruji, dormant di balik `channelUpdateEnabled=false`):**
- **Injeksi model-id mode-aware** — `VariantModelIdInjector.Mode`: `RECONCILE` (Shopify: variant baru → id
  **dibuang**) vs `BUCKETS` (Shopee: variant baru → id **kosong dipertahankan** = sinyal add-bucket). Known
  variant identik: isi model-id + jadikan body field. Di-wire di `ChannelAttributeConverterService` (dipilih
  dari `variantUpdateMode`, bukan nama channel). Teruji `VariantModelIdInjectorTest`.
- **Gate P6** dilonggarkan: `updateCapable = channelUpdateEnabled && (RECONCILE_IN_ITEM || PER_MODEL_BUCKETS)`.

**Endpoint Shopee terverifikasi** (SDK V2 `Faiznurullah/shopee` + cocok pola base-url/signature repo — semua
`POST /api/{apiVersion}/product/<x>`, signature HmacSHA256 `${partner_id}${PATH}${timestamp}${access_token}${shop_id}`):

| Bucket DiffEngine | Endpoint Shopee | Catatan |
|---|---|---|
| `update_CP_Variants` (existing berubah) | **`update_price`** + **`update_stock`** | ⚠️ **BUKAN** `update_model` — harga/stok endpoint terpisah. Dua panggilan, keyed `model_id`. |
| `update_CP_Variants_Add` (baru) | **`add_model`** | reuse shape `create_CP_Variants` yg SUDAH terverifikasi, key beda + `diff-id-field` |
| `update_CP_Variants_Delete` (dibuang) | **`delete_model`** | body `{item_id, model_id}` per model |

Body (dari pengetahuan API v2 — **verify vs verified e2e payload tim sebelum seed**):
```jsonc
update_price: { item_id, price_list:[{ model_id, original_price }] }
update_stock: { item_id, stock_list:[{ model_id, seller_stock:[{ stock }] }] }
delete_model: { item_id, model_id }
```
Semua `diff-id-field = skus.model_id`.

**Belum di-seed (butuh verifikasi, sengaja tidak dikarang):**
1. **`update_CP_Variants` Shopee = DUA endpoint** (`update_price`+`update_stock`). Variant-service sync
   (`createChannelProductVariants`) membaca **satu** objek instruksi, bukan array → butuh dukungan
   array-loop di service **atau** pemecahan key. Perlu keputusan + E2E.
2. **`update_CP_Variants_Delete`**: to-delete `model_id` **tidak** ada di desired variantGroups (variant sudah
   dibuang merchant) → BFF harus mensuplai list terpisah yang dibaca body-reshape delete. Kontrak persis
   dibaca dari `Delete_CP` sync (Kalix `deleteChannelProduct(key=..._Delete)`) — **belum dipetakan**.
3. **`add_model`**: paling siap (near-copy `create_CP_Variants` + `diff-id-field=skus.model_id`).

> Injeksi model-id BFF (Mode BUCKETS) sudah menyiapkan variantGroups dengan benar (known ber-id, baru
> id-kosong); yang tersisa murni **authoring metadata Shopee** (1–3 di atas) + E2E, bukan lagi kode generik.

---

## 8. Phase 4 — Melengkapi sisi sync (metadata-driven, generik)

Yang **sudah ada** di sync: `update_CP`, `update/add/delete_CP_Variants`, `update_CP_Media(_Pre)` &
`update_CP_Variants_Media(_Pre)` (upload+attach), `read_CP`/`restore_CP`.

Yang **ditambah** (semua generik, meniru pola `update_CP_Variants_Add/_Delete` yang sudah ada — **bukan** kode
per-channel):

1. **`delete_CP_Media` / `delete_CP_Variants_Media`** — workaction hapus gambar. Endpoint/verb/body dari
   metadata; `SKIP` bila key absen (persis pola workaction lain).
2. **`response-update-to`** pada `create/add_CP_Variants` dan `create/update_CP_Media` → menulis
   `sku→model_id` dan `imageKey→image_id` ke `SyncState` (menutup loop Phase 0).
3. **Urutan eksekusi** di workflow: `item → variants(update→add→delete) → media(add→delete)`. **Delete
   selalu terakhir** agar produk tak pernah sesaat 0-variant/0-gambar.

---

## 9. Phase 5 — Seeding metadata per channel (murni data, di migration)

Di `ChannelMetadataMigration` (rumah literal yang sah), seed set workaction **lengkap** per channel:
`update_CP`, `update_CP_Variants`, `add_CP_Variants`, `delete_CP_Variants`, `update_CP_Media(_Pre)`,
`update_CP_Variants_Media(_Pre)`, `delete_CP_Media`.

Di sinilah perbedaan channel **diserap sebagai data** (lihat §13). Menambah channel = menambah blok
metadata, tanpa menyentuh mesin diff/bucket.

---

## 10. Phase 6 — Decider per-resource + idempotency berlapis — ◑ gate ter-wire

> **Status: ◑ gate mode ter-wire.** `publishToChannel` sekarang menghitung `updateCapable =
> channelUpdateEnabled && variantUpdateMode==RECONCILE_IN_ITEM`, jadi hanya channel Mode-A yang bisa UPDATE
> (lainnya tetap `UPDATE_BLOCKED`). Keputusan NOOP masih **product-hash** (`lastPublishedContentHash`);
> refinement NOOP **per-resource** via `PublishDiffPlanner` (skip variant/gambar yang tak berubah) opsional
> untuk Mode B — belum di-wire. `channelUpdateEnabled` **sengaja TIDAK di-flip** (default `false`);
> membaliknya = mengaktifkan tulis live yang belum di-E2E → itu langkah operator setelah verifikasi.

Perluas `PublishOperationDecider` dari "satu keputusan untuk produk" menjadi **agregasi per-resource**:

1. Hitung Ops untuk produk, variants, gambar-produk, gambar-variant.
2. **Semua NOOP → keputusan NOOP** (tidak menyentuh channel sama sekali).
3. Ada perubahan → **UPDATE**, kirim **hanya bucket yang berubah** (item lain di-`noop` via hash).
4. `channelUpdateEnabled` di-flip `true` **hanya setelah** E2E hijau (default sekarang `false` =
   fail-closed `UPDATE_BLOCKED`, aman dari duplikasi selama fitur belum matang).

Efek idempotency berlapis:

- re-publish tanpa perubahan → **0 call channel**;
- ubah 1 harga variant → **1 call** `update_CP_Variants`, sisanya tak tersentuh;
- ganti 1 gambar → hapus 1 + tambah 1, gambar lain tetap.

---

## 11. Phase 7 — Keamanan, rollback, kegagalan

Sebagian besar **sudah ada**, tinggal dipastikan berlaku untuk resource baru:

- **Rollback**: `read_CP` + `restore_CP` (snapshot sebelum mutasi) — opt-in via metadata.
- **G7** (sudah ada): UPDATE gagal → **listing tetap live**, tidak downgrade → tidak memicu duplikat.
- **Delete-last ordering** → tak ada window kosong.
- **Partial-update visibility**: `step_results[]` → `publish_history` menandai step mana yang gagal
  (mis. add variant sukses tapi delete gambar gagal), sehingga UI bisa menampilkan "update sebagian".

---

## 12. Walkthrough skenario nyata

Kondisi awal: produk hidup dengan **3 variant** (A, B, C) dan set gambar tertentu. Merchant:
**hapus variant A**, **ubah harga variant B**, **tambah variant D & E**, **ganti gambar produk**, dan
**ganti gambar variant B**.

```
1. Pipeline desired-state (sama seperti CREATE)
   → variants desired: B(harga baru), C, D, E
   → gambar produk desired: set baru
   → gambar variant B desired: url baru

2. Load known (listing-state, hasil Phase 0)
   → variantChannelIds { A→mA, B→mB, C→mC }
   → imageChannelIds   { url1→i1, url2→i2, ... }
   → hash per item

3. ResourceDiffEngine
   variants:
     toUpdate { B→mB }        (hash beda: harga berubah)
     toAdd    [ D, E ]        (belum punya model_id)
     toDelete { A→mA }        (tak lagi desired)
     noop     [ C ]           (hash sama → TIDAK dikirim)
   gambar produk:
     toAdd    [ urlBaru ]
     toDelete { urlLama→i2 }
   gambar variant:
     toAdd    { B:urlBaru }
     toDelete { B:urlLama→iX }

4. Bucket builder → SATU sync request UPDATE, bucket terisi + id di-inject

5. Sync eksekusi (dari metadata, urut aman):
   update_CP → update_CP_Variants(B) → update_CP_Variants_Add(D,E)
   → update_CP_Variants_Media(B) → delete_CP_Variants(A)
   → delete_CP_Media(urlLama), delete_CP_Variants_Media(B:urlLama)

6. response-update-to men-surface model_id(D,E) + image_id(gambar baru)

7. BFF persistChannelIds → listing-state ter-update untuk UPDATE berikutnya
```

Perhatikan: **satu jalur**, tanpa cabang `if variant / if image / if channel`. Variant C dan gambar
yang tak berubah **tidak dikirim** sama sekali.

---

## 13. Perbedaan channel diserap oleh metadata, bukan kode

Mesin BFF sama untuk semua; yang beda hanya JSON metadata:

- **Shopify** — `update_CP` = `PUT /products/{id}.json` yang menerima `variants[]` + `images[]` ber-`id`.
  Endpoint ini me-*reconcile* penuh: item ber-id dipertahankan/di-update, yang baru ditambah, yang tak
  dikirim **dihapus**. Untuk Shopify, banyak perubahan bisa diselesaikan di **item-level** `update_CP`
  saja (bucket variant/media bisa minim) — **tetapi** tetap butuh id (Phase 0) agar "kirim ulang" bukan
  berarti re-upload/duplikat.
- **Shopee / TikTok** — variant = endpoint model terpisah (`add/update/delete_model`), gambar = media
  terpisah. Di sini bucket `*_CP_Variants` dan `*_CP_Media` dipakai penuh.

Satu mesin, dua perilaku channel — **selisihnya cuma metadata**. Inilah inti "tidak dijahit": pola
reconcile-di-item (Shopify) vs surgical-per-endpoint (Shopee/TikTok) diekspresikan sebagai data, bukan
percabangan runtime.

---

## 14. Status saat ini (sudah ada vs kurang)

**Sudah ada (fondasi + P0 + P1 + P2 + P3 Mode A + P6 gate):**
- ✅ **P3 Mode A** — `VariantModelIdInjector` menyuntik `model_id` ke variant `update_CP` untuk channel
  `RECONCILE_IN_ITEM` (Shopify di-seed) → reconcile by id. Flag config `variantUpdateMode`. Teruji.
- ◑ **P6 gate** — `updateCapable = channelUpdateEnabled && RECONCILE_IN_ITEM`; non-Mode-A → `UPDATE_BLOCKED`.
  `channelUpdateEnabled` tetap default `false` (flip = langkah operator pasca-E2E).
- ◑ **P3 core** — `PublishDiffPlanner` (pure) → `Plan` (add/update/delete/noop per variant/gambar, id
  ter-resolve, known image state dipartisi produk vs variant). Teruji `PublishDiffPlannerTest`.
  Dipakai penuh saat Mode B (bucket) / refinement NOOP per-resource.
- ✅ **P2** — `DesiredStateExtractor` (pure) → desired sets (variant/product-image/variant-image) berkunci
  stabil + hash per item; hash desired dipersist ke `variant/imageContentHashes` (`persistContentHashes`).
  Teruji: `DesiredStateExtractorTest`.
- ✅ **P1** — `ResourceDiffEngine` generik & hash-aware; `VariantDiff` kini adapter tipis di atasnya
  (teruji: `ResourceDiffEngineTest` + `VariantDiffTest`).
- ✅ **P0 (id round-trip)** — sync men-surface `sku→model_id` via metadata `idtracking#variants`
  (Kalix `ChannelProductState.variantIds` + Temporal `SyncState.variantIds`); BFF `persistChannelIds`
  menyimpannya ke `listing-state.variantChannelIds`. Field `imageChannelIds` + `variant/imageContentHashes`
  sudah ada di listing-state; seed `idtracking#variants` untuk Shopee + Shopify.
- `PublishOperationDecider` (CREATE/NOOP/UPDATE/UPDATE_BLOCKED) + gate `channelUpdateEnabled` (default `false`).
- `ContentHash.of` (idempotency produk).
- Sync: `update_CP`, `update/add/delete_CP_Variants`, `update_CP_Media(_Pre)`, `update_CP_Variants_Media(_Pre)`,
  `read_CP`/`restore_CP`.
- Seed metadata `update_CP` (G4) + create media.

**Belum ada (yang harus dibangun):**
- **Image id round-trip**: `variantIds` sudah; `imageIds` masih **belum diisi** sync (butuh `idtracking#images`
  + pencocokan `image_id ↔ imageKey`).
- **E2E Mode A (Shopify)** — verifikasi `update_CP` reconcile by id di store nyata, lalu operator flip `channelUpdateEnabled`.
- **Mode B** (per-model buckets) — diskriminator `_diffOp` di sync + serialisasi `Plan` → bucket + seed `*_CP_Variants` (P5).
- **P4** sync `delete_CP_Media` / `delete_CP_Variants_Media` + `response-update-to` image-id-surfacing.
- **P5** seed metadata `update_CP_Variants` / `add_CP_Variants` / `delete_CP_Variants` / `update_*_Media` / `delete_*_Media` per channel + `idtracking` channel lain.
- **P6** decider per-resource + flip `channelUpdateEnabled`.

---

## 15. Ringkasan perubahan & urutan rollout

| # | Deliverable | Repo | Sifat |
|---|---|---|---|
| **P0** | Round-trip id + per-item hash (listing-state + poll + persist) | BFF + sync | **fondasi, wajib pertama** |
| P1 | `ResourceDiffEngine` generik (`VariantDiff` di-refactor ke sini) | BFF | pure, teruji |
| P2 | Desired-state extractor (reuse pipeline) | BFF | reuse |
| P3 | Bucket builder di `SyncChannelProductRequest`/converter | BFF | generik |
| P4 | `delete_CP_Media` + `response-update-to` id-surfacing | sync | generik |
| P5 | Seed metadata update/add/delete + media per channel | BFF (migration) | **data** |
| P6 | Decider per-resource + idempotency + flip flag | BFF | generik |
| P7 | Rollback/failure/ordering (sebagian besar sudah ada) | sync + BFF | reuse |

**Urutan:** `P0 → P1 → P4(id-surfacing) → P3 → P2 → P5 → P6 →` (E2E per channel, **Shopify dulu** karena
paling reconcile-friendly) `→ P7 →` flip `channelUpdateEnabled=true`.

**Kenapa P0 mutlak pertama:** ia menutup loop id. Semua fase lain menganggap "known state" tersedia; itu
hanya benar jika sync sudah men-surface id dan BFF sudah menyimpannya.

---

## 16. Kenapa desain ini "tidak dijahit"

- **Satu** `ResourceDiffEngine`, **satu** bucket-builder, **satu** mekanisme round-trip-id — dipakai ulang
  untuk produk, variant, gambar-produk, dan gambar-variant.
- Perbedaan channel & endpoint **seluruhnya** di JSON metadata (di-seed di migration).
- Runtime BFF **nol** pengetahuan domain per-channel (sesuai konvensi `CLAUDE.md`: no hardcoded domain
  knowledge di runtime).
- Deteksi perubahan berbasis **content-hash generik**, bukan daftar nama-field.
- Menambah channel / atribut / jenis gambar baru = **ubah data**, bukan kode.

---

## 17. Referensi kode

**BFF:**
- `publishing/service/ChannelPublishService.java` — orkestrasi publish/UPDATE, `resolveOperationForPublish`,
  `persistVariantChannelIds`.
- `publishing/service/VariantDiff.java` — fungsi diff (akan di-refactor ke `ResourceDiffEngine`).
- `publishing/service/PublishOperationDecider.java` — keputusan CREATE/NOOP/UPDATE/UPDATE_BLOCKED.
- `publishing/util/ContentHash.java` — hash payload.
- `publishing/service/ChannelAttributeConverterService.java` — bangun sync request (tempat bucket builder).
- `publishing/model/request/SyncChannelProductRequest.java` — DTO sync (perlu struktur bucket).
- `publishing/model/response/WorkflowStatusResponse.java` — poll (`variantIds`, tambah `imageIds`).
- `ecommerce/channelproduct/model/entity/ChannelProductData.java` — listing-state (tambah id/hash map).
- `config/ChannelMetadataMigration.java` — seeding workaction (data).

**Sync (`notifikasi` / `notifikasi temporal`):**
- `channelProduct/workflow/ChannelProductWorkflowImpl.java` — orkestrasi step (urutan update→add→delete).
- `channelProduct/activities/ChannelProductActivitiesImpl.java` — eksekusi add/delete variant, update media.
- `channelProduct/model/SyncState.java` — surface `variantIds`/`imageIds`.
- `shared/Constants.java` — daftar key workaction (tambah `delete_CP_Media`).

**Kontrak & catatan terkait:**
- `notifikasi*/documentation/07-kontrak-bff-sync-service.md` — kontrak BFF⇄sync (§4 metadata keys, §5 diffing).
- `docs/product/07-publishing-engine/01-guides/04-sync-api-integration.md` — integrasi sync BFF-side.
