# Update-Media Shopify — rencana idempoten (tanpa duplikat gambar)

> **Status:** **M1 + M2 + M3 diimplementasi** (round-trip `image_id`, add-only, delete removed); M4–M5 belum.
> Fondasi diff + listing-state **sudah ada** di BFF (lihat §2).
> **Prasyarat baca:** [`01-update-diff-engine.md`](01-update-diff-engine.md) §0–§3 (desired vs known,
> round-trip id) dan [`03-mode-b-per-model-buckets.md`](03-mode-b-per-model-buckets.md) (pola bucket +
> op-marker delete yang ditiru di sini).
> **Bahasa:** dari "kenapa" ke "bagaimana", per fase.

---

## 0. Kenapa dokumen ini ada

Pada channel Shopify, **UPDATE produk yang sukses membuat gambar bertambah tiap kali** — produk yang
tadinya 4 gambar jadi 6, lalu 8, dst. Dua bug berkontribusi, keduanya sudah **diperbaiki di sisi sync**:

1. `Create_CP` (produk utama) meng-hardcode key `create_CP` → UPDATE menembak POST create.
   → diperbaiki (operation-aware key).
2. `copyCommand` di jalur write-back **membuang field `operation`** → setelah step pertama, semua step
   pasca-produk jatuh ke `resolveOperation()=CREATE` (karena `operation=null` + `deleted=false`), lalu
   menjalankan `create_CP_Media` / `create_CP_Variants_Media` yang **selalu POST `/images.json`**
   (Shopify tak pernah dedup) → **append 4 gambar tiap update**.
   → diperbaiki (`copyCommand` kini menyalin `operation`).

Setelah dua fix itu, UPDATE Shopify **berhenti menduplikasi** — tapi juga **tidak menyentuh gambar sama
sekali** (karena Shopify belum punya metadata `update_CP_Media`, langkah media SKIP). Dokumen ini merancang
langkah berikutnya: membuat perubahan gambar (tambah/hapus) **benar-benar terpropagasi** saat UPDATE,
tetap idempoten, lewat pipeline diff generik yang sudah ada — **bukan** kode per-channel.

---

## 1. Prinsip

- **Gambar = resource ber-diff**, sama seperti variant. Bedanya asosiasi: gambar produk vs gambar variant.
- **Idempotensi butuh keadaan yang channel tahu terakhir** → `imageChannelIds{imageKey→image_id}` di
  listing-state. Tanpa round-trip id ini, "known" selalu kosong → semua gambar dianggap `toAdd` → append lagi.
- **Add & delete lewat endpoint terpisah** (POST/DELETE `/images.json`) — mengikuti bentuk `create_CP_Media`
  yang sudah terverifikasi; bukan menaruh `images` di body PUT produk (yang justru memicu append tanpa `id`).
- **Semua perbedaan channel hidup di metadata JSON** — menambah channel/jenis gambar = ubah data.

---

## 2. Yang SUDAH ada (jangan bangun ulang)

**BFF — fondasi diff (P0–P1):**

| Komponen | Berkas | Peran |
|---|---|---|
| `PublishDiffPlanner.plan(master, known)` | `publishing/service/PublishDiffPlanner.java` | Hasil `Plan{variants, productImages, variantImages}`, tiap-nya `Ops{toAdd,toUpdate,toDelete}`. Product image di-key `URL`; variant image `sku::URL` (partisi via `::`). Jalan untuk CREATE juga (known kosong → semua `toAdd`). |
| `ResourceDiffEngine.compute(desired, known, identity, hash)` | `publishing/service/ResourceDiffEngine.java` | Satu mesin diff untuk variant **dan** gambar. |
| `DesiredStateExtractor` | `publishing/service/DesiredStateExtractor.java` | Ekstrak desired (`variants`, `productImages`, `variantImages`). |
| Listing-state | `ecommerce/channelproduct/model/entity/ChannelProductData.java` | `imageChannelIds{imageKey→imageId}`, `imageContentHashes{imageKey→hash}` (+ `variant*` untuk varian). |
| `persistChannelIds(...)` | `publishing/service/ChannelPublishService.java:665` | Menuliskan `variantChannelIds` + `imageChannelIds` balik dari respons sync. |
| `updateImageChannelIds` / `updateImageContentHashes` | `ecommerce/.../ChannelProductDataRepository.java:96,109` | Persist per-map. |
| `WorkflowStatusResponse.imageChannelIds` | `publishing/model/response/WorkflowStatusResponse.java:79` | `@JsonAlias({"image_ids","image_channel_ids",...})` — siap membaca id gambar dari sync. |
| Staging gambar | `PublishPayloadStagingService.collectSourceImageUrls` → `_sourceImages` → rule `shopify-build-images` (`ChannelConfigurationDataLoader:396`, `targetPath product.images`) | `product.images` (support attr) → `create_CP_Media` (`from: product.images`). |

**Sync — plumbing update (sudah):**

- `ChannelProductWorkflowImpl.ActivityCallType`: `PREREQUISITE, MEDIA_PRE, VARIANTS_MEDIA_PRE, MEDIA,
  VARIANTS_MEDIA`. Loop media (`runArrayInstructionLoopOptional`) memakai `resolveMetadataKeyForCallType`
  yang **sudah operation-aware** → pada UPDATE me-resolve `update_CP_Media` (kalau absen → SKIP).
- `copyCommand` kini menjaga `operation` (fix `a1f4bca`) — prasyarat agar step media pasca-produk resolve
  key `update_*`, bukan `create_*`.
- Pola **op-marker delete** varian (`idtracking#variants` field `"op"`, `keepVariantGroupsByOpMarker`,
  `deleteRestChannelProductVariants` dengan fail-safe SKIP) — **ditiru** untuk delete gambar.

**Belum ada** (doc `01` menandainya *"remaining P3/P5"*):
- Sync: `idtracking#media` (round-trip `imageKey→image_id`) & langkah **delete media**.
- BFF: seed `update_CP_Media` / `delete_CP_Media`, dan **mengonsumsi** `Plan.productImages/variantImages`
  (saat ini diff dihitung tapi tak dipakai untuk mem-filter yang dikirim).

---

## 3. Masalah inti: identitas gambar (image round-trip)

Shopify **menulis ulang `src`** saat upload:

```
sumber : …/main-1786783684749-195cf62a.jpeg
Shopify: …/main-1786783684749-195cf62a_<uuid>.jpg?v=1786791917   (image.id = 64768832405794)
```

Untuk memetakan `imageKey → image.id` balik ke listing-state, respons create harus dicocokkan ke sumber:

| Opsi | Cara | Nilai |
|---|---|---|
| (a) Posisional | POST media sekuensial 1-per-1; sumber ke-i → `image.id` ke-i | rapuh bila urutan/kegagalan beda |
| **(b) Filename-stem — REKOMENDASI** | `imageKey` = stem `main-<ts>-<hash>` / `gallery-<ts>-<hash>`; Shopify **mempertahankan stem** di CDN filename → cocokkan stem | data-driven, tak mengotori data user |
| (c) `alt`/metafield | set `alt=imageKey` saat POST, baca balik | paling andal tapi mengotori `alt` (SEO) |

→ **Pakai (b).** `imageKey` = filename-stem (sudah ber-hash unik dari GCS: `main-<ts>-<hash>`). Ekstraksi
stem dari `image.src` respons = satu transform data-driven (regex/basename tanpa suffix `_<uuid>` & query).

> Catatan: `imageKey` HARUS identik di kedua sisi — `DesiredStateExtractor` (BFF, untuk key desired) dan
> `idtracking#media` (sync, untuk key respons). Definisikan sekali, dokumentasikan (stem tanpa ekstensi,
> tanpa `_<uuid>`, tanpa `?v=`).

---

## 4. Rencana bertahap

### Phase M1 — Round-trip `image_id` (SYNC) — ✅ IMPLEMENTASI

Tanpa ini `known.imageChannelIds` selalu kosong → semua gambar `toAdd` → append lagi.

> **Terpasang:** `HttpCallResult.capturedImageIds`; `executeArrayLoopViaService(...,idtrackingKey)` +
> `captureMediaIds()` + `imageKeyOf()` (stem); workflow merge ke `imageIds` (surfaced via `getSyncState`);
> BFF seed `idtracking#images`. Read-back BFF (`imageIds`→`imageChannelIds`→`persistChannelIds`) sudah ada.

- **BFF**: seed `idtracking#media` (mirip `idtracking#variants`): `{"key":"<imageKey-stem>","id":"image.id"}`.
- **BFF**: tambah `response-update-to` pada `create_CP_Media` (& `create_CP_Variants_Media`) untuk memetakan
  respons → `imageKey→image_id`.
- **Sync**: pada respons media, ekstrak `image.id` + stem dari `image.src`, kumpulkan map, surface di respons
  workflow sebagai `imageChannelIds` (BFF sudah menyimpannya via `persistChannelIds`).
- **Efek**: CREATE pun mulai mengisi `imageChannelIds`. **Belum** mengubah perilaku UPDATE.

**Selesai bila:** setelah satu CREATE, `channel_product_data.imageChannelIds` terisi `{stem → shopifyImageId}`.

### Phase M2 — ADD-only pada UPDATE (BFF) — ✅ IMPLEMENTASI

- **BFF**: seed `update_CP_Media` (bentuk = `create_CP_Media`; POST `/images.json`).
- **BFF**: `DesiredStateExtractor.imageKey()` = **filename-stem** (identik dgn extractor sync); product image
  di-key stem, variant image `sku::stem`.
- **BFF (jalur UPDATE)**: `PublishProductRequest.existingImageChannelIds` di-set dari listing-state; helper
  `sourceImagesForOp()` mem-filter `_sourceImages` (di `processPublish` + `buildTrace`) ke hanya gambar
  **baru** (imageKey ∉ known). Fail-safe: channel tanpa `idtracking#images` → semua (tak diganggu); tracked
  tapi tanpa baseline (produk pra-M1) → **0** (hindari re-append).
- **Efek**: UPDATE hanya POST gambar **baru**. `copyCommand` fix + MEDIA loop resolve `update_CP_Media` →
  jalan add-only. **Duplikasi hilang; penambahan gambar terpropagasi.**

**Selesai bila:** UPDATE tanpa perubahan gambar → 0 POST `/images.json`; UPDATE dengan 1 gambar baru →
tepat 1 POST. (Produk pra-M1 tanpa baseline: 0 POST — buat ulang produk untuk mendapat baseline.)

### Phase M3 — DELETE gambar yang dibuang (SYNC + BFF) — ✅ IMPLEMENTASI

- **Sync**: service baru `Delete_CP_Media` (DELETE `/products/{id}/images/${image_id}.json` **per id** —
  pra-substitusi `${image_id}`, `${product.id}` di-resolve normal); activity `deleteRestChannelProductMedia`
  (SKIP bila `delete_CP_Media` absen, no-op bila tak ada id) + langkah workflow baru
  `delete_rest_channel_product_media` (non-fatal, forward-only); konstanta `WORKACTION$DELETE_CP_MEDIA`.
- **BFF**: seed `delete_CP_Media` (`from: product.delete_image_ids`); `computeDeleteImageIds()` = known
  product image (imageKey tanpa `::`) yang **tak lagi** desired → `image_id` dari `known.imageChannelIds`;
  di-inject sebagai support attr `product.delete_image_ids` oleh `ChannelAttributeConverterService`.
- **⚠️ Persistence merge (kritis):** `imageChannelIds` disimpan `$set` (replace) & sync hanya surface id
  gambar yang **di-POST** (di UPDATE = hanya yang baru). `mergeImageChannelIds()` menggabung: pertahankan id
  gambar lama yang masih desired, buang yang dihapus, tambah yang baru — agar update berikutnya tak salah
  meng-append gambar lama.
- **Efek**: gambar yang dihapus di master ikut terhapus di Shopify; listing-state tetap konsisten.

**Selesai bila:** UPDATE yang membuang 1 gambar → tepat 1 DELETE `/images/{id}`; `imageChannelIds` ikut
bersih (id yang dihapus hilang, sisanya tetap).

> **Kontrak FE — `masterProductData.removedImages[]` (dihapus dari desired).** `desired` dihitung dari
> `ImageService.extractImageUrls` = **union** `images` + `mainImage` + `galleryImages`, dan `normalizeImages`
> **membangun ulang** `images` dari `mainImage`+`galleryImages`. Jadi menghapus gambar hanya dari `images`
> **percuma** (di-rebuild). Agar FE tak perlu membersihkan `galleryImages`/`mainImage`, ia cukup mengirim
> **`masterProductData.removedImages`** = daftar URL (atau `{src|url|...}`) yang dihapus. `extractImageUrls`
> mengecualikannya **by imageKey stem** dari `desired` → otomatis benar untuk **add** (tak di-rebuild/di-POST
> ulang), **delete** (masuk `toDelete` → DELETE), dan **merge** (di-drop dari `imageChannelIds`). Tak bocor ke
> payload channel (bukan atribut ter-mapping; JOLT membuang key tak dikenal).

### Phase M4 — Gambar varian (SYNC + BFF)

- Ulangi M1–M3 untuk `create/update/delete_CP_Variants_Media` (asosiasi `variant_ids`, key `sku::imageKey`).
  `Plan.variantImages` sudah dihitung; agregasi `group_by src` + `variant_ids` sudah ada di
  `create_CP_Variants_Media`.

> **Rencana bertahap lengkap (V1–V5):** [`08-shopify-variant-media.md`](08-shopify-variant-media.md) — round-trip
> id `sku::stem`, add-only, delete (shared-image aware), re-asosiasi `variant_ids`, dan urutan bersama M5.

### Phase M5 — reorder / `position` (SYNC + BFF)

Setelah M1–M3 **jumlah** gambar benar, tetapi **urutan** bisa tertukar (add-only meng-append gambar baru;
kept menahan posisi lama). CREATE tak perlu (POST sekuensial = urutan desired); UPDATE perlu **reorder-by-id**
(`PUT product.images=[{id,position}]`), dengan guard "reorder-only-if-changed" (NOOP bila urutan tak berubah).

> **Desain lengkap:** [`07-shopify-media-reorder.md`](07-shopify-media-reorder.md).

---

## 5. Alur data pada UPDATE (setelah M1–M3)

```
master images ─► DesiredStateExtractor ─► PublishDiffPlanner.plan(desired, known.imageChannelIds)
       │                                            │
       │                     productImages: { toAdd, toDelete }
       ▼                                            ▼
 product.images (di-filter → toAdd) ─► update_CP_Media  (POST hanya-baru) ─┐
 toDelete → image_id (dari known)  ─► delete_CP_Media   (DELETE per id)   ─┤
                                                                           ▼
                          response-update-to + idtracking#media ─► imageChannelIds (round-trip)
                                                                           ▼
                                                            persistChannelIds (BFF → listing-state)
```

---

## 6. Risiko & edge case

- **Identitas rapuh** bila filename sumber tak punya stem unik → tegakkan `imageKey` = stem+hash (sudah
  demikian di GCS: `main-<ts>-<hash>`). Definisikan ekstraksi stem **sekali** dan dipakai identik di BFF & sync.
- **Partial failure** (add sebagian sukses, delete gagal) → forward-only seperti varian; catat, **jangan**
  kompensasi hapus produk. Idempoten pada retry karena diff dihitung ulang dari known terbaru.
- **Gambar sama dipakai beberapa varian** → key `sku::imageKey` mencegah hapus lintas-varian
  (`PublishDiffPlanner` sudah mem-partisi via `::`).
- **Konten berubah, URL sama** → jarang (URL GCS sudah ber-hash); bila terjadi, `imageContentHashes`
  menangkapnya sebagai `toUpdate` (ranah M5).
- **Urutan/`position`** ditangani di **M5** ([`07-shopify-media-reorder.md`](07-shopify-media-reorder.md)):
  reorder-by-id pada UPDATE, guard NOOP saat urutan tak berubah (CREATE sudah benar via POST sekuensial).

---

## 7. Pengujian / E2E

> Runbook operator langkah-demi-langkah ke Shopify nyata: [`06-media-e2e-runbook-shopify.md`](06-media-e2e-runbook-shopify.md).

- **Unit (BFF):** `PublishDiffPlanner` untuk gambar — toAdd/toDelete benar saat known terisi; CREATE (known
  kosong) → semua toAdd.
- **Unit (sync):** ekstraksi stem dari `image.src` respons; SKIP fail-safe delete tanpa metadata.
- **E2E (mengikuti gaya `04-mode-b-e2e-runbook-shopee.md`):**
  1. CREATE baseline → verifikasi `imageChannelIds` terisi (M1).
  2. UPDATE tanpa ubah gambar → 0 POST/DELETE.
  3. UPDATE tambah 1 gambar → 1 POST, listing-state bertambah 1.
  4. UPDATE hapus 1 gambar → 1 DELETE, listing-state berkurang 1.
  5. Ulang varian (M4).

---

## 8. Urutan kerja

1. **M1** (sync id round-trip) — sedang; membuka jalan semuanya.
2. **M2** (BFF add-only) — kecil; langsung menutup keluhan duplikat **dan** mempropagasi penambahan.
3. **M3** (delete) — sedang (langkah sync baru).
4. **M4** (variant images) — sedang; pola sama.
5. **M5** (reorder) — mengukuhkan urutan `position` pada UPDATE ([`07-shopify-media-reorder.md`](07-shopify-media-reorder.md)).

> Rekomendasi mulai **M1 → M2** lebih dulu: menutup "duplikat" sekaligus membuat "gambar baru ikut ter-update".
