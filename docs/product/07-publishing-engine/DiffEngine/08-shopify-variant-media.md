# Phase M4 — Variant images Shopify (per-varian, idempoten)

> Lanjutan dari [`05-shopify-update-media.md`](05-shopify-update-media.md) (product-level M1–M3) dan
> [`07-shopify-media-reorder.md`](07-shopify-media-reorder.md) (M5 reorder). **Product-level images (M1–M5)
> sudah selesai & terverifikasi.** Dokumen ini merancang **M4: gambar per-varian** — round-trip, add-only,
> delete, dan re-asosiasi — dijalankan **per phase (V1–V5)** dengan pola yang sama seperti product-level.

## 0. Kenapa dokumen ini ada

Setelah M1–M5, gambar **product-level** sinkron sempurna (jumlah + urutan). Yang belum: gambar yang
**melekat ke varian tertentu** (mis. foto "Merah" untuk SKU warna merah). Tujuan M4: pada UPDATE, hanya
gambar varian **baru** yang di-POST, gambar varian yang **dibuang** dihapus, dan **asosiasi** varian↔gambar
yang berubah diperbaiki — tanpa duplikat, tanpa kehilangan asosiasi.

## 1. Kenapa varian images berbeda dari product images (fakta Shopify)

Di Shopify REST, **gambar varian bukan entitas terpisah** — ia adalah **product image biasa** yang punya
`variant_ids: [<id varian>, …]`. Konsekuensi penting:

1. **Satu list gambar bersama.** Variant image & product image hidup di **`product.images` yang sama**. Jadi
   M4 **berinteraksi** dengan M1–M5, bukan pipeline terpisah.
2. **Asosiasi = field, bukan upload ulang.** Menetapkan/melepas varian dari sebuah gambar =
   `PUT /images/{id}` dengan `variant_ids` — **tanpa** re-upload. Satu gambar bisa dipakai banyak varian.
3. **Identitas balik.** Respons upload (`POST /images.json`) mengembalikan `image.id`, `image.src`, dan
   `image.variant_ids` (channel id varian, **bukan** sku). Untuk mengunci identitas `sku::stem` kita harus
   memetakan `variant_id → sku` (invers dari `variantChannelIds` yang sudah kita punya).

> **Aturan CLAUDE.md:** `variant_ids` bukan bagian `add_item`/create-body master — ia **support/asosiasi**.
> Semua yang di bawah dikerjakan lewat **metadata workaction + support field + post-processing**, tak menyentuh
> `apiSchema` maupun `build*JoltSpec`.

## 2. Yang SUDAH ada (jangan bangun ulang)

- **Identitas** `sku::stem`: `DesiredStateExtractor` sudah meng-emit variant image sebagai
  `Resource(sku + "::" + url)`; `imageKey(url)` stem identik BFF (`DesiredStateExtractor.imageKey`) & sync
  (`ChannelProductActivitiesImpl.imageKeyOf`).
- **Diff**: `PublishDiffPlanner` sudah menghitung `variantImages` Ops (`variantScope=true`, partisi known map
  by `::`) → `toAdd`/`toDelete` variant image **sudah tersedia**.
- **Listing-state**: `channel_product_data.imageChannelIds` menyimpan **campuran** — product image `stem` DAN
  variant image `sku::stem`. M3 `computeDeleteImageIds` & M5 `mergeImageChannelIds`/reorder **sengaja
  melewati** key ber-`::` ("left for M4"). Jadi **tak perlu koleksi/field baru** — cukup isi & konsumsi key
  `::` yang sudah dicadangkan.
- **Sync**: langkah `create_rest_channel_product_variants_media` (array loop, `VARIANTS_MEDIA`) + service
  `Create_CP_Variants_Media` (POST `/images.json`, `group_by src` + `variant_ids` collect) **sudah ada &
  jalan pada CREATE**. `variantChannelIds` (sku→channel id) sudah di-round-trip (`idtracking#variants`).

## 3. Yang KURANG (akar kenapa UPDATE varian belum idempoten)

1. **Variant-media step tidak menangkap id.** `createRestChannelProductVariantsMedia` memakai
   `executeArrayLoopViaService` **tanpa** `idtrackingKey` (beda dari product media yang mengoper
   `idtracking#images`). → `imageChannelIds` **tak pernah** terisi key `sku::stem` → tak ada baseline → UPDATE
   selalu re-POST semua variant image (duplikat) & tak bisa hapus/asosiasi.
2. **BFF belum memfilter variant media add-only pada UPDATE** (analog M2), belum menghitung
   `delete variant image ids` (analog M3), belum menghitung perubahan **asosiasi** (varian ditamb/dilepas dari
   gambar yang tetap).
3. **Belum ada `update_CP_Variants_Media` / `delete/associate` metadata** yang di-seed untuk Shopify.

## 4. Prinsip

- **Identitas tunggal** `sku::stem` di seluruh pipeline (sudah). Round-trip id memakainya sebagai kunci.
- **Reuse pola M1–M5** persis: capture id → add-only → delete → (baru) re-asosiasi → tertib bersama reorder.
- **Shared-image aware.** Karena satu image id bisa dipakai beberapa varian (dan/atau sebagai product image),
  **jangan** hapus image hanya karena satu `sku::stem` hilang bila image id yang sama masih dipakai
  `sku::stem` lain atau sebagai product image. Hapus fisik hanya bila **tak ada** referensi tersisa; selain
  itu cukup **lepas asosiasi** (`variant_ids` dikurangi).
- **Forward-only & non-fatal** (seperti M3/M5): kegagalan langkah varian tak menggagalkan publish; retri
  menghitung ulang dari known terbaru (idempoten).
- **Data-driven**: metadata workaction + support field; `apiSchema`/JOLT tak disentuh.

> **Produk IMPORT (ReverseSync, docs/reversesync/07 Phase 4).** Agar produk hasil import bisa sync gambar varian,
> import merekam `variantChannelIds` (sku→channel variant id) + baseline asosiasi `sku::imageKey(src)` dari payload
> channel (`ReverseImportService.variantChannelIdsFrom` / `variantImageBaselineFrom`); re-host me-re-key stem cdn→platform.
> Tanpa `variantChannelIds`, V4 balik `[]` dan upload varian tak bisa mengisi `variant.id` → tak ada gambar varian.
> **⚠️ Interaksi dengan M5 reorder:** gambar varian yang BARU di-upload belum ber-channel-id saat reorder disusun →
> PUT reorder full-list akan **menghapusnya**. Karena itu M5 kini **skip pada add-run** (lihat `07-shopify-media-reorder.md`).

## 5. Rencana bertahap (V1–V5)

### Phase V0 — Pre-flight & keputusan (tanpa kode)
- **Verifikasi CREATE varian image** masih benar (POST `/images.json` dgn `variant_ids`) — baseline sebelum
  menyentuh UPDATE.
- **Kunci desain id round-trip**: respons upload memberi `image.id` + `image.variant_ids` (channel id). Kita
  petakan `variant_id → sku` via invers `variantChannelIds` (sudah ada di listing-state), lalu simpan
  `sku::stem → image.id`. Bila satu image punya banyak `variant_ids`, tulis **satu entri per sku**.
- **Selesai bila:** disepakati kunci `sku::stem`, sumber invers sku, dan semantik shared-image.

### Phase V1 — Round-trip variant image id (SYNC + BFF) — ✅ IMPLEMENTASI
Tanpa ini semua UPDATE varian re-POST (duplikat).
- **BFF**: seed `idtracking#variant_images` (mis. `{"srcKey":"image.src","id":"image.id","variantIdsKey":"image.variant_ids"}`).
- **Sync**: `createRestChannelProductVariantsMedia` panggil `executeArrayLoopViaService(..., idtrackingKey)`
  varian; `captureMediaIds` versi varian: untuk tiap image respons, untuk tiap `variant_id` → cari sku via
  invers `variantChannelIds` (sudah di command) → kumpulkan `sku::stem → id`. Surface ke `getSyncState`
  (gabung ke map `imageIds` yang sama; key `::` membedakannya).
- **BFF**: `mergeImageChannelIds` sudah membawa key `::` apa adanya → `persistChannelIds` menyimpannya.
- **Efek**: CREATE mulai mengisi `imageChannelIds` entri `sku::stem`. Belum mengubah perilaku UPDATE.
- **Selesai bila:** setelah CREATE dengan variant image, `imageChannelIds` berisi `sku::stem → imageId`.

### Phase V2 — ADD-only variant image pada UPDATE (BFF) — ✅ IMPLEMENTASI
- **BFF**: seed `update_CP_Variants_Media` (= bentuk `create_CP_Variants_Media`).
- **BFF**: pada UPDATE, filter payload variant media ke hanya `sku::stem ∉ existingImageChannelIds`
  (analog `filterProductImagesForUpdate`, tetapi per-varian). Fail-safe: tanpa baseline → 0 (hindari
  re-append), channel tak tracking → tak diganggu.
- **Efek**: UPDATE hanya POST variant image **baru**.
- **Selesai bila:** UPDATE tanpa perubahan varian image → 0 POST; tambah 1 → tepat 1 POST + asosiasi benar.

### Phase V3 — DELETE variant image yang dibuang (BFF + SYNC) — shared-image aware — ✅ IMPLEMENTASI
- **BFF**: `computeDeleteVariantImageIds` = variant image (`sku::stem`) yang **tak lagi** desired →
  image id dari known. **Guard shared-image**: kandidat hapus fisik hanya bila image id itu **tak** direferensi
  `sku::stem` lain yang masih desired **maupun** sebagai product image desired; selain itu → **lepas asosiasi**
  (V4), bukan DELETE.
- **Sync**: reuse `delete_CP_Media` (DELETE `/images/{id}`) untuk id yang benar-benar yatim; BFF meng-inject
  ids yatim ke `product.delete_image_ids` yang sama (satu jalur hapus).
- **Efek**: gambar varian yang dibuang & tak dipakai lagi terhapus; yang masih dipakai varian/produk lain
  tetap ada (hanya asosiasinya berubah di V4).
- **Selesai bila:** buang 1 variant image unik → 1 DELETE; buang 1 asosiasi tapi image dipakai varian lain →
  0 DELETE (ditangani V4).

### Phase V4 — Re-asosiasi variant_ids pada gambar yang tetap (BFF + SYNC) — ✅ IMPLEMENTASI
Kasus: gambar tetap ada, tetapi daftar varian pemakainya berubah (varian ditambah/dilepas dari gambar).
- **BFF**: `computeVariantImageAssociations` = untuk tiap image id kept, kumpulkan **himpunan varian desired**
  (dari `sku::stem` desired → sku → `variantChannelIds` → variant_id). Bandingkan dgn known; bila berbeda →
  stage `{image_id, variant_ids:[...]}`.
- **BFF**: seed `associate_CP_Variants_Media` (PUT `/images/${image_id}.json` body `{image:{id,variant_ids}}`);
  inject support field `product.variant_image_assoc` (array `{image_id, variant_ids}`).
- **Sync**: service `Associate_CP_Variants_Media` (per entri → satu PUT), activity + langkah workflow
  `associate_rest_channel_product_variants_media` (setelah delete varian, sebelum reorder), non-fatal.
- **Efek**: menamb/melepas varian dari gambar yang sudah ada tanpa upload/hapus.
- **Selesai bila:** pindahkan 1 gambar dari SKU-A ke SKU-B → 1 PUT `variant_ids` berubah, 0 POST/DELETE.

### Phase V5 — urutan gambar varian bersama reorder produk (BFF) — ✅ IMPLEMENTASI
- Variant image berbagi list dengan product image, dan reorder PUT `product.images=[{id,position}]` bersifat
  **otoritatif** (Shopify menganggapnya daftar penuh) — maka variant-only image WAJIB ikut tercantum agar tak
   terbuang. `computeImageOrder` kini: product stem (urut `_sourceImages`) **lalu** variant image stem (V5),
  dedup (stem yang juga product tetap di posisi produk). `keptImageIds` menyertakan entri varian
  (`sku::stem`→id dipetakan ke `stem`→id) agar sync me-resolve-nya. `reorderNeeded` mengecek keanggotaan
  **by stem** (known punya key `sku::stem`, desiredOrder punya bare stem). BFF-only — sync `Reorder_CP_Media`
  sudah resolve stem dari `known_image_ids ∪ captured`.
- **Selesai bila:** UPDATE yang mengubah urutan termasuk gambar varian → satu PUT reorder mencakup semuanya,
  variant-only image tak pernah hilang saat reorder.

## 6. Alur data pada UPDATE (target setelah V1–V4)

```
master variants[].images ─► DesiredStateExtractor ─► variantImages: Resource(sku::url)
        │                                                      │
        ▼                                     PublishDiffPlanner.plan (variantScope)
 payload variant media (filter → toAdd)                        │  toAdd / toDelete (sku::stem)
        │                                                       ▼
 update_CP_Variants_Media (POST hanya-baru, +variant_ids) ─► capture sku::stem→id (idtracking#variant_images)
 delete_CP_Media (id yatim saja, shared-image guard)                     │
 associate_CP_Variants_Media (PUT variant_ids utk gambar kept) ──────────┤
                                                                          ▼
                              mergeImageChannelIds (key :: carry) ─► persist listing-state
```

## 7. Risiko & edge case

- **Invers `variant_id → sku` meleset** bila `variantChannelIds` belum ter-round-trip untuk varian tsb →
  fallback: lewati capture entri itu (jangan salah-asosiasi). Terjadi hanya pada varian yang gagal dibuat.
- **Shared image** (dipakai >1 varian atau juga product image) → V3 guard: hapus fisik hanya saat yatim;
  selain itu re-asosiasi (V4). Jangan sampai menghapus gambar yang masih dipakai.
- **Interaksi dengan M2/M3 product-level** → karena satu list, add/delete produk & varian harus konsisten:
  gunakan **satu** `imageChannelIds` (partisi `::`) dan **satu** jalur delete (`product.delete_image_ids`
  hanya id yatim). Hitung desired product ∪ variant sebelum memutuskan delete fisik.
- **Partial failure** (add ok, associate gagal) → forward-only, non-fatal; retri idempoten.
- **imageKey stem tak unik** → sudah ditegakkan (GCS `gallery-<ts>-<hash>`); definisi stem tunggal di BFF+sync.

## 8. Pengujian / E2E

- **Unit (BFF):** diff variant image toAdd/toDelete; `computeDeleteVariantImageIds` + guard shared-image;
  `computeVariantImageAssociations` (himpunan variant_ids berubah); filter add-only per-varian.
- **Unit (sync):** capture `sku::stem→id` dari respons (`variant_ids`→sku via invers); `Associate_CP_Variants_Media`
  membangun `{image:{id,variant_ids}}`; SKIP fail-safe.
- **E2E (gaya `06-media-e2e-runbook-shopify.md`):**
  1. CREATE dgn variant image → `imageChannelIds` berisi `sku::stem` (V1).
  2. UPDATE tanpa ubah → 0 POST/DELETE/PUT.
  3. UPDATE tambah 1 variant image → 1 POST + `variant_ids` benar.
  4. UPDATE hapus 1 variant image unik → 1 DELETE; hapus asosiasi (image dipakai varian lain) → 1 PUT, 0 DELETE.
  5. UPDATE pindah gambar antar varian → 1 PUT `variant_ids`.

## 9. Urutan kerja

1. **V0** pre-flight + keputusan (tanpa kode).
2. **V1** round-trip id varian (sync capture + BFF persist) — membuka semua.
3. **V2** add-only varian (BFF) — menutup duplikat + propagasi tambah.
4. **V3** delete varian yatim (BFF + reuse delete_CP_Media) — shared-image guard.
5. **V4** re-asosiasi `variant_ids` (BFF + sync `Associate_CP_Variants_Media`).
6. **V5** (opsional) sertakan variant image di reorder M5.

> Rekomendasi mulai **V1 → V2** dulu (fondasi id + hentikan duplikat), lalu V3/V4 (semantik shared-image).
> Setiap phase: BFF dulu (uji unit tanpa sync), lalu sisi sync, lalu E2E — konsisten dengan cara M1–M5.
