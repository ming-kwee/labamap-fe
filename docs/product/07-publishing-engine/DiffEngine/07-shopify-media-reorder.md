# Phase M5 — Reorder gambar Shopify (mengukuhkan `position`)

> Lanjutan dari [`05-shopify-update-media.md`](05-shopify-update-media.md) (M1–M3 sudah terpasang) dan
> [`06-media-e2e-runbook-shopify.md`](06-media-e2e-runbook-shopify.md). Dokumen ini merancang **M5**:
> menjamin **urutan** gambar di Shopify sama dengan urutan desired, setelah jumlah gambar sudah benar
> (add-only + delete bekerja).

## 0. Kenapa dokumen ini ada

Setelah M1–M3, **jumlah** gambar sudah benar pada UPDATE, tetapi **urutannya bisa tertukar**. Contoh
nyata: main image yang diedit tertukar dengan gambar pertama gallery. M5 menutup celah terakhir ini.

## 1. Akar masalah urutan

`create/update_CP_Media` mem-POST tiap gambar ke `POST /products/{id}/images.json` dan **hanya mengirim
`src`** (tanpa `position` — lihat `createProductMediaWorkflow`, mapping cuma `src`). Shopify lalu:

- Gambar **baru** (add-only pada UPDATE) → di-**append** ke posisi terakhir (position N+1, N+2, …).
- Gambar **lama yang dipertahankan** → menahan posisi lamanya.

Hasil akhir = `[kept di posisi lama] + [baru di akhir]` — **bukan** urutan desired. Karena itu, saat main
image diedit (jadi gambar baru → di-append ke belakang) dan galleryA dipertahankan, galleryA naik ke posisi
1 → **main & galleryA tertukar**.

Menyetel `position` saat POST **tidak cukup**: gambar yang dipertahankan tetap perlu dipindah. Shopify butuh
operasi **reorder eksplisit** — `PUT /products/{id}.json` dengan `product.images = [{id, position}]` dalam
urutan desired, memakai **`id`** (bukan `src`, supaya tidak re-upload / duplikat).

## 2. Prinsip (best practice omnichannel)

Sejalan dengan desain API Shopify (REST reorder-by-id; GraphQL `productReorderMedia`) dan pola integrator
matang: **delta-sync + operasi reorder khusus**, bukan replace-seluruh-array.

- **CREATE tidak perlu reorder.** `create_CP_Media` POST **sekuensial** mengikuti urutan `product.images`
  (= urutan `_sourceImages`, main dulu), jadi Shopify menetapkan position 1..N sesuai urutan POST → sudah
  benar. Reorder = NOOP pada CREATE.
- **UPDATE perlu reorder** karena add-only meng-append gambar baru & kept menahan posisi lama.
- **Guard "reorder-only-if-changed":** hanya kirim PUT reorder bila urutan channel akan menyimpang dari
  desired (ada add/delete, atau urutan murni berubah). Kalau tidak → NOOP, tanpa panggilan. Ini juga yang
  membuat CREATE otomatis NOOP.
- **Reorder-by-id itu murah** (operasi metadata, tanpa re-upload/CDN churn), jadi "+1 round-trip" hampir
  tak berbiaya dibanding upload (~3 dtk/gambar).

> Catatan: kebenaran urutan CREATE bergantung pada media POST tetap **sekuensial**
> (`executeRequests_Sequentially`). Bila kelak diubah ke paralel, guard yang sama akan menutupinya secara
> defensif tanpa panggilan ekstra saat tak perlu.

## 3. Yang SUDAH ada (jangan bangun ulang)

- **Urutan desired** = `_sourceImages` = `collectSourceImageUrls(masterProductData)` (order-preserving,
  otoritatif dari `images` bila ada, fallback `mainImage`+`galleryImages`). Index 0 → position 1.
- **`imageKey` stem** identik di BFF (`DesiredStateExtractor.imageKey`) & sync (`imageKeyOf`).
- **Baseline id kept** = `PublishProductRequest.existingImageChannelIds` (stem → shopifyId), sudah di-load
  dari listing-state pada jalur UPDATE.
- **Id gambar baru run ini** = `capturedImageIds` (via `idtracking#images`), sudah ditangkap sync.
- **Merge final** = `mergeImageChannelIds` (BFF) sudah menghitung peta final stem→id setelah publish.

Yang **kurang** hanyalah: menyusun urutan desired → `[{id, position}]` (id = baseline ∪ captured) dan
mengirim PUT reorder.

## 4. Desain

### 4.1 Kontrak BFF → sync (dua support field, hanya UPDATE saat perlu)

BFF meng-inject (via `ChannelAttributeConverterService`, seperti `product.delete_image_ids`):

| Support field | Isi | Sumber |
|---|---|---|
| `product.image_order` | `["stem1","stem2",…]` — urutan desired (stem), **hanya** gambar produk (bukan `sku::` varian) | urutan `_sourceImages` |
| `product.known_image_ids` | `{"stem":"shopifyId",…}` — id gambar **kept** yang sudah diketahui BFF | `existingImageChannelIds` dikurangi `deleteImageIds` |

`product.image_order` **dikosongkan** (tidak di-inject) bila reorder tak diperlukan → sync SKIP.

### 4.2 Guard di BFF — kapan reorder dikirim

Reorder diperlukan pada UPDATE bila channel melacak gambar, ada baseline, DAN salah satu:
- `toAdd` tidak kosong (gambar baru pasti di-append → urutan berubah), **atau**
- `toDelete` tidak kosong (posisi bergeser), **atau**
- urutan desired ≠ urutan tersimpan (reorder murni tanpa add/delete).

Untuk mendeteksi "reorder murni", listing-state menyimpan **`imageOrder`** (daftar stem terurut) pada
persist. `computeImageOrder(request, known)` menghasilkan `product.image_order`; helper `reorderNeeded(...)`
menentukan inject/skip. CREATE / no-baseline → tak pernah inject → NOOP.

### 4.3 Sync — langkah `reorder_rest_channel_product_media`

Setelah `delete_rest_channel_product_media` (forward-only, non-fatal):

- Service baru **`Reorder_CP_Media`**: baca metadata `reorder_CP_Media` (PUT `/products/${product.id}.json`),
  `product.image_order`, `product.known_image_ids`, dan `capturedImageIds` run ini.
- Resolusi: untuk tiap `stem` di `image_order` (urut): `id = known_image_ids[stem] ?? capturedImageIds[stem]`;
  bila `id` ada → tambah `{ "id": id, "position": index+1 }`.
- Bangun body `{ "product": { "id": <externalChannelProductId>, "images": [ {id,position}… ] } }` → **satu**
  `PUT`.
- **SKIP** bila `product.image_order` absen/kosong (guard BFF), atau bila daftar resolusi kosong.
- Non-fatal (seperti M3): gagal reorder tak menggagalkan publish; dicatat WARN.
- Activity `reorderRestChannelProductMedia` + konstanta `WORKACTION$REORDER_CP_MEDIA`.

### 4.4 BFF seed metadata

`ChannelMetadataMigration.buildShopifyMetadata`:
- `workaction#reorder_CP_Media` → endpoint `PUT /products/${product.id}.json`, `ON_REST_UPDATE`,
  body-reshape membangun `product.images=[{id,position}]` dari `image_order` + resolusi id.

(Semua data-driven; `apiSchema` tak disentuh — ini support field, bukan create-body.)

## 5. Alur data pada UPDATE (M1–M3 + M5)

```
desired order (_sourceImages)  ─┐
existingImageChannelIds (kept) ─┤► BFF: image_order[] + known_image_ids{}  (bila reorderNeeded)
                                │        └─ guard: skip bila urutan tak berubah / CREATE
                                ▼
 update_CP_Media  (POST baru) ──► capturedImageIds{stem→id}  ─┐
 delete_CP_Media  (DELETE)                                     │
                                                               ▼
 reorder_CP_Media:  for stem in image_order:                   │
     id = known_image_ids[stem] ?? capturedImageIds[stem]      │
     → PUT product.images=[{id, position}]  (satu panggilan) ──┘
                                                               ▼
                          mergeImageChannelIds + imageOrder ─► persist listing-state
```

## 6. Risiko & edge case

- **Id belum ter-resolve** (stem tak ada di known maupun captured) → lewati entri itu, jangan gagal; reorder
  set sebisa mungkin (forward-only). Terjadi hanya bila gambar baru gagal ter-POST (mis. 422) — sudah
  ditangani M-layer.
- **Partial failure** (add/delete sukses, reorder gagal) → non-fatal; retry berikutnya menghitung ulang dari
  known terbaru (idempoten).
- **Reorder murni** (tak ada add/delete, hanya urut) → terdeteksi via `imageOrder` tersimpan; PUT hanya
  `[{id,position}]` (tak ada `src`) → tak ada upload.
- **Gambar varian** (`sku::stem`) **di luar cakupan** M5 (ranah M4); `image_order` hanya gambar produk.
- **Duplikat src** dihindari total: reorder memakai **`id`**, tak pernah `src`.

## 7. Pengujian / E2E

- **Unit (BFF):** `computeImageOrder` → stem terurut = urutan `_sourceImages`; `reorderNeeded` true saat
  toAdd/toDelete non-empty atau urutan berubah, false saat identik (NOOP); `known_image_ids` = baseline −
  deleted.
- **Unit (sync):** resolusi `image_order` × (known ∪ captured) → `[{id,position}]` dengan position 1..N;
  SKIP saat `image_order` kosong; entri tanpa id di-lewati.
- **E2E (lanjut runbook 06):**
  1. CREATE baseline → tak ada PUT reorder (NOOP), urutan sudah benar via POST sekuensial.
  2. UPDATE tukar urutan (tanpa add/delete) → tepat **1** PUT reorder, urutan Shopify = desired.
  3. UPDATE edit main + tambah 1 → add + reorder → main kembali di posisi 1, tak tertukar.
  4. UPDATE tanpa ubah gambar/urutan → **0** PUT reorder.

## 8. Urutan kerja

1. **BFF:** `computeImageOrder` + `reorderNeeded` + inject `image_order`/`known_image_ids`; seed
   `reorder_CP_Media`; simpan `imageOrder` di listing-state.
2. **Sync:** `Reorder_CP_Media` + activity + langkah workflow `reorder_rest_channel_product_media` (setelah
   delete) + konstanta.
3. **Uji** unit BFF + sync, lalu E2E runbook.

> Forward-looking: bila pindah ke GraphQL, ganti PUT REST dengan mutation **`productReorderMedia`** — pola
> (delta + reorder-by-id) tetap sama, investasi tak terbuang.
