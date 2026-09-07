# 07 — Import Image Re-hosting (channel URL → platform storage)

> **Status: PLAN (belum diimplementasi).** Dokumen ini merancang cara menangani GAMBAR setelah import channel
> berhasil, supaya re-sync / re-push tidak kehilangan gambar. Fokus: mengubah gambar hasil import dari **URL asli
> channel** menjadi **URL milik platform (GCS/CDN)**. Referensi kode as-built ada di [`05`](05-config-source-of-truth.md)
> §7b (import images = master, reconcile = drift) dan slice IMAGE_INVERSE di [`04`](04-engine-separation-and-industry-comparison.md).

---

## 1. Masalah (yang diamati)

Saat import produk dari Shopify **berhasil**, gambar master tersimpan sebagai **URL asli CDN Shopify**, mis.
`https://cdn.shopify.com/s/files/1/0779/8685/7250/files/main-….jpg?v=…`. Ini karena op reverse `IMAGE_INVERSE`
(`ReverseImageInverseService`) memetakan `product.images[{src}]` → master `mainImage`/`galleryImages` **apa adanya**
(URL channel), dan `variants[].image_id` → `variantImages` (URL channel juga). Lihat [`06`](06-import-channel-native.md) §1b.

**Akibat:** saat produk itu di-**push ulang** ke channel (UPDATE) atau di-publish ke **channel lain**, gambar bisa
**hilang / tidak menempel**:

- Forward publish membaca `images`/`mainImage`/`galleryImages` master (`ImageService.extractImageUrls` → `_sourceImages`
  → rule `shopify-build-images` → `product.images`) lalu mengirim `POST /products/{id}/images.json {image:{src:<url>}}`.
  Channel **men-fetch** URL itu sendiri. Bila `src` adalah **URL CDN channel** (milik shop/produk lain, ber-query
  signature, atau bisa kedaluwarsa), fetch bisa **403/404/expired** → gambar tak terpasang → "hilang".
- **Lintas channel** lebih parah: mengirim URL CDN Shopify ke Lazada/TikTok — mereka fetch; sering ditolak/putus.
- Gejala tambahan yang terlihat di payload UPDATE nyata: `product.images` terkirim **`[]` (kosong)** sementara
  `main_image_raw` berisi URL — indikasi ada **gap transform kedua** (gambar import tak sampai ke `product.images`
  di re-push). Lihat §8 (investigasi terpisah) — bukan inti masalah, tapi harus dicek saat implementasi.

> **Inti:** URL asli channel **bukan sumber gambar yang durable**. Platform harus **memiliki** byte gambar
> (di storage sendiri) agar setiap push berikutnya mengirim URL stabil yang channel mana pun bisa fetch.

---

## 2. Bagaimana platform sejenis menangani (norma industri)

Ginee, ChannelAdvisor (DAM), Sellbrite, Linnworks (Image Manager) umumnya **menarik gambar sumber ke storage/CDN
mereka sendiri** saat import — persis untuk menghindari masalah di §1 (hotlink-block, URL kedaluwarsa, marketplace
target menolak domain CDN asing, perlu normalisasi ukuran/format). Sering **ditunda / asinkron** (import cepat,
re-host di background atau saat publish-keluar). Master/katalog jadi **pemilik** gambar; channel hanya menerima URL
platform yang stabil.

Keputusan yang tercatat di [`05`](05-config-source-of-truth.md) §7b: **"import simpan URL channel dulu; re-host ke
S3/GCS+CDN = follow-up."** Dokumen ini adalah rancangan follow-up itu.

---

## 3. Tujuan & non-tujuan

**Tujuan**
- Setelah import sukses, field gambar master (`mainImage`, `galleryImages`, `images`, per-varian `variantImages`)
  berisi **URL milik platform (GCS/CDN)**, bukan URL channel.
- Re-push (UPDATE) dan publish lintas-channel mengirim URL stabil → gambar **tidak hilang**.
- **Idempoten & hemat**: re-import produk yang sama tidak menggandakan objek storage; gambar yang sudah di-host
  tidak di-unduh ulang.
- Tidak memblokir/menggagalkan import bila re-host gagal (degradasi aman).

**Non-tujuan (sekarang)**
- Re-host gambar pada jalur **reconcile** (produk ter-link). Reconcile tetap **Option C** (gambar master-authoritative,
  hanya flag drift — [`05`](05-config-source-of-truth.md) §7b). Re-host hanya untuk **import** (use case B).
- Normalisasi/resize/format konversi lanjutan (media module sudah bikin thumbnail; transform lain di luar scope).
- Mengubah kontrak forward publish soal gambar.

---

## 4. Infrastruktur yang SUDAH ada (dipakai ulang, jangan bikin baru)

Modul `media/` sudah menyediakan re-host GCS lengkap — rancangan ini **memakainya**, bukan menambah storage baru:

| Komponen | Peran | Catatan utk plan |
|---|---|---|
| `MediaUploadService.uploadProductImage(bytes, filename, contentType, orgId, productId, imageType)` | upload byte → GCS, bikin thumbnail, kembalikan `ImageUploadResponse{url,…}` (URL publik via CDN resolver) | **Butuh BYTE** — belum ada "upload dari URL". Import perlu langkah **fetch URL → bytes** dulu. |
| `MediaStorageProvider` / `GcsMediaStorageProvider` | storage mentah (put/presign/delete) | dipakai internal oleh MediaUploadService |
| `CdnUrlResolver` | key/objek → URL publik (CDN base bila dikonfigurasi) | URL inilah yang ditulis ke master |
| `ImageAssetService.record(resp, bytes)` | daftarkan `ImageAsset` (publicUrl, `contentHash`, dimensi) | **dedup by `contentHash`** — kunci idempotensi |
| `ImageAssetService.mapByUrls(urls)` | lookup asset per-URL | berguna utk cek "sudah di-host?" |
| `ImageAsset` (entity) | registry gambar: `publicUrl`, `thumbnailUrl`, `contentHash`, `width/height`, `bytes`, `format`, `orgId`, `productId` | **Belum punya `sourceUrl`** — lihat §6 (tambah field utk dedup by URL asal) |
| `MediaUploadService.deleteImage(url)` | hapus objek storage dari URL publik | utk cleanup/GC |

**Gap yang perlu ditambah** (kecil, aditif):
1. **Fetch-from-URL** helper (unduh byte gambar channel, hormati content-type + batas ukuran `media.upload.max-file-size`).
2. **Dedup by URL asal** — `ImageAsset.sourceUrl` (opsional) + query, supaya re-import / gambar yang sama tak diunduh ulang.
   Alternatif: dedup by `contentHash` (butuh unduh dulu). Kombinasi: cek `sourceUrl` dulu (murah), fallback `contentHash`.

---

## 5. Rancangan alur (import → re-host → tulis URL platform)

```
IMPORT commit (ReverseImportService.buildAndMaybeCommit)
  … IMAGE_INVERSE → master.mainImage/galleryImages/variantImages = URL channel …
  → CREATE/LINK master + linkRow (seperti sekarang)
  → RE-HOST STEP (baru):
       untuk tiap URL gambar channel di master (produk + varian):
         a. sudah ter-host? (ImageAsset.sourceUrl == url, per org)  → pakai publicUrl-nya (skip unduh)
         b. belum → fetch bytes (WebClient, best-effort, timeout+retry a la ReverseHttp)
                    → MediaUploadService.uploadProductImage(bytes, …, orgId, masterProductId, imageType)
                    → ImageAssetService.record(resp, bytes)  (+ set sourceUrl=url)
                    → publicUrl = resp.url()
         c. petakan url channel → publicUrl
       → REWRITE field gambar master: mainImage/galleryImages/images + variantImages[sku] → publicUrl
       → simpan master (update)
```

**Prinsip:** rewrite dilakukan **setelah** master tersimpan (butuh `masterProductId` utk `productId` di storage key),
lalu master di-update sekali dengan URL platform. Channel-only fields tak tersentuh.

### 5a. KAPAN re-host dijalankan? — KEPUTUSAN: **B (async) + DURABLE RETRY + guard publish**

Pemilik memilih **async**, dengan syarat tegas: **"pastikan async berhasil; jika gagal harus diulang"** → re-host
TIDAK boleh fire-and-forget best-effort; harus **job persisted + retry sampai sukses (idempoten)**, dan push TIDAK
boleh mengirim URL channel selama re-host belum selesai (kalau tidak, 422 "Could not download image" terulang —
lihat §1). Desain meniru pola yang sudah terbukti di repo: **`PublishJob` + `PublishJobReconciler`** (status/attempts/
nextPollAt/DEAD, `@Scheduled(fixedDelay)`, retry, dead-letter).

**Komponen:**
1. **`ImageRehostJob`** (koleksi baru) — `{id, masterProductId, organizationId, status(PENDING|COMPLETED|FAILED|DEAD),
   attempts, nextRunAt, lastError, createdAt}`; index `{status, nextRunAt}`. Per-master (gambar milik master, bukan store).
2. **Enqueue saat import commit** — setelah master + linkRow, buat `ImageRehostJob(PENDING)` bila master punya URL
   gambar channel. Import balas **cepat** (tak menunggu fetch/upload).
3. **`ImageRehostReconciler`** `@Scheduled(fixedDelay)` — ambil job PENDING yang `nextRunAt<=now`; untuk tiap URL gambar
   channel di master (produk + varian): fetch bytes → `MediaUploadService.uploadProductImage` → `ImageAssetService.record`
   (+`sourceUrl` dedup) → rewrite `mainImage`/`galleryImages`/`variantImages` → simpan master. Semua sukses → COMPLETED;
   ada gagal → `attempts++`, backoff `nextRunAt`, tetap PENDING; kelewat tua/attempts → DEAD (log + alert). **Idempoten**:
   URL yang sudah platform / sudah punya `ImageAsset(sourceUrl)` di-skip → retry aman, tak menggandakan objek.
4. **Guard publish (mencegah 422 di jendela pending) — ✅ SUDAH DIKERJAKAN (branch `bff-v14`, "guard dulu").**
   `ChannelPublishService.guardNonPlatformImages` di `loadAndMergeChannelData`: untuk listing **reverse-origin**
   (`channel_product_data.lastReverseSyncedAt != null`), pertahankan HANYA gambar **platform-owned** (URL yang punya
   `ImageAsset` terdaftar — dites via `ImageAssetService.mapByUrls`); URL channel-origin di-**drop** dari
   `mainImage`/`galleryImages`/`images` + per-varian `variantImages` (helper pure `ImageService.retainImageUrls` +
   `collectAllImageUrls`). Jadi push tak pernah mengirim URL yang bakal 422 di Shopify. Di-scope ke reverse-origin
   supaya produk forward normal (gambarnya bisa URL sah non-registered) **tak terpengaruh**. Off-switch:
   `APP_PUBLISH_SKIP_NONPLATFORM_IMAGES=false`. **Konsekuensi interim:** sampai Phase 1 (reconciler) me-re-host,
   produk import ter-publish **tanpa gambar** (bukan error 422 menyesatkan). Begitu ter-host → `mapByUrls` menemukan
   asset → gambar ikut ter-push.

> Konsekuensi async: setelah import, ada jeda singkat sampai gambar ter-host. Guard #4 memastikan push di jeda itu
> tak menghasilkan produk-tanpa-gambar yang menyesatkan (lebih baik tunda gambar sampai re-host beres, lalu push/UPDATE
> media). `mediaStatus` (di master atau turunan job) memberi FE sinyal "gambar sedang diproses".

### 5b. Variant images
`variantImages` per-SKU juga URL channel → re-host sama. Dedup lintas varian penting: banyak varian sering berbagi
gambar yang sama (by `sourceUrl`/`contentHash`) → unduh sekali, pakai ulang publicUrl.

### 5c. Kegagalan (degradasi aman)
- Fetch/upload gagal untuk sebuah URL → **pertahankan URL channel** utk gambar itu (jangan gagalkan import),
  catat `log.warn`, dan tandai (mis. `mediaRehostPending`) agar bisa di-retry. Import tetap sukses.
- Best-effort menyeluruh: bila modul media/GCS mati, import tetap jalan (perilaku hari ini), cuma tanpa re-host.

---

## 6. Perubahan data (aditif)

- **`ImageAsset.sourceUrl`** (String, indexed per org) — URL channel asal, utk dedup "sudah pernah di-host?" tanpa
  mengunduh ulang. + `ImageAssetService.findBySourceUrl(orgId, url)` / perluas `mapByUrls`.
- (Opsional) **`MasterProductData.mediaStatus`** — `REHOSTED` / `PENDING` / `PARTIAL` bila memilih Opsi B (async),
  supaya FE/push tahu gambar belum stabil.
- Tidak ada koleksi baru; tidak menyentuh `apiSchema`/JOLT (gambar tetap out-of-band, [`05`](05-config-source-of-truth.md) §7b).

---

## 7. Keputusan yang perlu diambil (sebelum implementasi)

1. **Timing re-host**: A inline / B async / C lazy-at-publish (§5a). → default usul: **A**.
2. **Dedup**: by `sourceUrl` (murah, tapi URL channel bisa beda utk gambar identik) vs `contentHash` (akurat, butuh
   unduh) vs keduanya. → usul: **sourceUrl dulu, fallback contentHash**.
3. **Cakupan channel**: mulai Shopify saja (satu-satunya yang punya IMAGE_INVERSE ter-seed) atau generik semua channel
   yang punya IMAGE_INVERSE. → usul: **generik**, digerakkan keberadaan URL gambar di master (bukan literal channel).
4. **GC gambar lama**: bila re-import mengganti gambar, objek storage lama di-GC (`ImageGcService` sudah ada) atau
   dibiarkan? → usul: biarkan dulu; GC terjadwal terpisah.
5. **Batas & timeout fetch**: pakai `media.upload.max-file-size` + pola `ReverseHttp` (timeout 15s/attempt + retry
   transient). → usul: ya.

---

## 8. Investigasi Phase 0 (bug `product.images = []` — HARUS beres sebelum re-host berguna)

Payload UPDATE nyata: `product.images = "[]"` **padahal** `product.main_image_raw` berisi URL. Dua field ini punya
sumber **BERBEDA**:

- `main_image_raw` ← **JOLT spec generated per-kategori** (system-default Shopify JOLT sengaja TAK memetakan gambar —
  `DefaultJoltSpecDataLoader` §116-118). Kehadirannya membuktikan ada field gambar di master yang ke-map ke situ.
- `product.images` ← jalur **independen**: `ImageService.extractImageUrls(master)` yang HANYA membaca
  `images` / `mainImage` / `galleryImages` → `_sourceImages` → rule `shopify-build-images`.

`product.images=[]` ⟹ `extractImageUrls` mengembalikan kosong. Kandidat penyebab (perlu SATU reproduksi ber-log utk
memastikan yang mana — `extractImageUrls` sudah `log.info` shape input-nya):

1. **Beda nama field** — import menaruh URL di field yang TAK dibaca `extractImageUrls` (mis. master punya
   `main_image_raw` dari klasifikasi/JOLT generated, tapi `mainImage`/`images`/`galleryImages` kosong). IMAGE_INVERSE
   menulis `mainImage`/`galleryImages` — cek apakah nilainya benar-benar tersimpan di master, atau tertimpa/ tak ke-set.
2. **Edit meng-exclude** — user meng-edit gambar; FE mengirim `removedImages` (atau channelData/masterOverride) yang
   berisi URL asli → `extractImageUrls` membuang-nya (`removedImageKeys`) → kosong.
3. **`images` shadow / normalize** — `save().normalizeImages` tak mengisi `images` utk bentuk hasil import, atau
   Step-2 `channelData`/`masterOverrides` (via `loadAndMergeChannelData`) menimpa `images`→`[]` saat publish.

**Phase 0 = diagnosa → perbaiki penyebab yang terbukti**, supaya gambar import (dan hasil edit) BENAR-BENAR sampai ke
`product.images` saat re-push. **Tanpa Phase 0, re-host (Phase 1) sia-sia.**

### 8a. Root cause DITEMUKAN (statis) + FIX (Phase 0 — sudah dikerjakan, branch `bff-v14`)

Kandidat **no.3** terbukti: **channelData bocor membawa blob `images` lalu menimpa gambar master saat re-push.**

- `ReverseApplyService.channelDataFrom` meng-key SEMUA field bucket-b dengan **leaf** (`ReverseApplyService.leaf`),
  jadi `product.images` tersimpan di channelData sebagai key **`images`**.
- Import BERMAKSUD membuang blob itu (gambar → master), tapi memanggil `channelData.remove("product.images")`
  (**dotted path**) — sedangkan entry-nya di bawah key **`images`** → **remove no-op** → `channelData["images"]`
  ikut tersimpan di linkage row.
- Saat re-push, `loadAndMergeChannelData` menimpa `masterProductData["images"]` dengan blob channelData yang
  stale/kosong → `extractImageUrls` → `_sourceImages` kosong → **`product.images=[]`** → gambar hilang.

**Fix (2 lapis):**
1. **Import (cegah bocor baru):** `ReverseImportService` membuang blob images dari channelData pakai **leaf key**
   (`leaf("product.images")="images"`), plus dotted path (belt-and-suspenders).
2. **Publish (repair baris LAMA + defense):** `loadAndMergeChannelData` kini **menolak** key gambar master-owned
   (`images`/`mainImage`/`galleryImages` — `MASTER_OWNED_IMAGE_KEYS`) dari overlay **channelData** (override sah tetap
   lewat `masterOverrides`). Ini memperbaiki produk yang SUDAH ter-import (channelData-nya sudah bocor) **tanpa perlu
   re-import**, dan mencatat `log.warn` saat leak terdeteksi (instrumen konfirmasi).

**Sisa kemungkinan (ter-instrumen):** bila `product.images` masih `[]` setelah fix + re-push, cek `log.warn`
"Ignoring channelData image key" (konfirmasi leak) dan log `extractImageUrls: … removed=N` (kemungkinan `removedImages`
dari edit — kandidat no.2). Uji regresi: `ReverseApplyMappingTest.channelDataKeysProductImagesUnderLeaf_soImportRemovesByLeaf`.

---

## 9. Rencana bertahap

- **Phase 0 (prasyarat) — ✅ SELESAI (branch `bff-v14`).** Root cause = channelData bocor blob `images` (leaf-key)
  → menimpa gambar master saat re-push → `product.images=[]` (§8a). Fix: import buang blob pakai leaf key; publish
  tolak overlay channelData utk key gambar master-owned (repair baris lama tanpa re-import). Regresi:
  `ReverseApplyMappingTest`. Sisa kandidat (`removedImages` dari edit) ter-instrumen via `log.warn` — verifikasi saat re-push.
- **Guard publish — ✅ SELESAI (branch `bff-v14`).** Reverse-origin listing hanya push gambar platform-owned
  (`ImageAsset`); channel-origin di-drop sampai re-host. Cegah 422. `ImageServiceGuardTest`.
- **Phase 1 (ASYNC durable-retry) — ✅ SELESAI (branch `bff-v14`).** `ImageRehostJob` (entity+repo, index
  `{status,nextRunAt}`+`{master,status}`) + `ImageRehostJobService` (enqueue dedup, `retryOrDead` backoff eksponensial
  cap 15m, DEAD @8 attempts) + enqueue saat import commit (`ReverseImportService`) + `ImageRehostService`
  (fetch via `webClient`+`ReverseHttp.resilient` → `MediaUploadService.uploadProductImage` (boundedElastic) →
  `ImageAssetService.record(..., sourceUrl)` → `ImageService.rewriteImageUrls` → `masterProductDataService.update`) +
  `ImageRehostReconciler` (`@Scheduled`, COMPLETED / retry / DEAD). Idempoten: skip yg sudah platform (`mapByUrls`),
  reuse dedup `ImageAsset.sourceUrl` (`findRehostedUrl`), partial-safe (URL gagal tetap channel → retry). Config
  `app.reversesync.image-rehost.*`. **VERIFIKASI:** fetch eksternal + upload GCS = IO live (butuh kredensial+jaringan) →
  tak headless; murni (backoff, filenameOf, rewriteImageUrls) di-unit-test (`ImageRehostTest`, `ImageServiceGuardTest`).
- **Phase 2 (ketahanan+) — ✅ SELESAI (branch `bff-v14`).**
  - **`mediaStatus` ke FE:** `ReverseImportResult.mediaStatus` (di-set `PENDING` saat job di-enqueue di import) +
    endpoint poll `GET /api/v1/channels/reverse/import/media-status/{masterProductId}` → `ImageRehostStatus`
    `{status: PENDING|COMPLETED|FAILED|DEAD|NONE, attempts, lastError, updatedAt}`. FE tahan "images ready" sampai
    COMPLETED. (`ImageRehostJobService.mediaStatus` via `findFirstByMasterProductIdOrderByUpdatedAtDesc`.)
  - **GC objek lama — TAK PERLU kode baru:** `ImageGcService` (orphan-sweeper grace-based, admin `/api/v1/admin/image-gc`)
    SUDAH menghitung referensi dari master `images`/`mainImage`/`galleryImages` + `variantImages` + channelData.
    Setelah re-import menulis-ulang master menjauh dari asset re-host lama, asset itu jadi **orphan** dan disapu
    sweeper yang ada. Menambah GC kedua = duplikasi (dihindari).
- **Phase 3 (edit gambar produk import ter-sync — Option B, no churn) — ✅ SELESAI (branch `bff-v14`).**
  **Bug:** produk import = UPDATE sejak awal (`channelProductId` ada) TAPI tak punya baseline gambar (`imageChannelIds`).
  Aturan add-only (`ChannelPublishService:3009`) melihat "UPDATE + tanpa baseline" → **stage 0 gambar** (Shopify
  `/images.json` menggandakan bila re-POST) → tambah/edit/hapus gambar tak pernah sampai Shopify + baseline tak pernah
  terbentuk → **deadlock** (log sync: `create_CP_Media executed 0 calls`, `product.images=[]`). **Fix (re-key baseline):**
  (1) import merekam `imageChannelIds={imageKey(cdnSrc)→shopifyId}` (`ReverseImportService.productImageBaseline`, saat
  import awal saja); (2) re-host me-re-key cdn-stem→platform-stem via mapping-nya (`ImageRehostService.rekeyBaseline`) →
  baseline sejajar dgn gambar master platform → diff add/delete jalan, **tanpa churn** (tak berubah = tak disentuh); (3)
  safety `request.skipImageDeletes` saat re-host PENDING → `computeDeleteImageIds` kembalikan `[]` (jangan orphan gambar
  nyata sebelum salinan platform siap). Uji: `ImageRehostTest`. **Cakupan = gambar PRODUK**; per-VARIAN produk import
  (asosiasi image_id Shopify) = follow-up.
- **Phase 4 (sync gambar per-VARIAN utk produk import) — ✅ SELESAI (branch `bff-v14`).**
  Gambar varian Shopify = pointer (`variant.image_id`) ke gambar produk; asosiasi ditangani V4
  (`computeVariantImageAssociations`) + upload varian butuh `variant.id`. Untuk produk import keduanya buntu karena
  **`variantChannelIds` (sku→variant id) tak pernah direkam** → V4 balik `[]` + `VariantModelIdInjector` tak bisa
  isi `variant.id` (payload `channel_variant_id=""`). **Fix (mirror Phase 3):** import merekam `variantChannelIds`
  (`variantChannelIdsFrom`) + baseline asosiasi `sku::imageKey(src)→imageId` (`variantImageBaselineFrom`, resolve
  `image_id`→src); re-host me-re-key `sku::cdnStem`→`sku::platformStem` (`rekeyBaseline` kini menangani key `sku::`).
  Field `ImageInverseDescriptor.variantIdField` (data-driven, Shopify=`"id"`) + seed. Uji: `ImageRehostTest`
  (variantChannelIds, variantImageBaseline, rekey sku::). Butuh **import ulang** utk produk yang sudah ter-import
  sebelum fix (baseline hanya terekam saat import).
- **Fix: guard vs backfill (gambar produk pertama ter-duplikat) — ✅ (branch `bff-v14`).**
  Saat re-host BELUM jalan (mis. GCS/reconciler tak aktif), guard men-drop semua gambar channel (hapus `mainImage`→null,
  `galleryImages`/`images`→`[]`). TAPI `ensureProductImages` (backfill) lalu MENGISI ulang `mainImage` (karena kondisinya
  `mpd.get(k)==null`) dari master → satu gambar cdn bocor → M2 anggap "baru" (stem tak ada di baseline, produk import
  lama) → di-push → Shopify men-download ulang → **duplikat gambar**. Fix: guard set `request.imageRehostPending`
  (rename dari `skipImageDeletes`); saat true, `ensureProductImages` **skip** (tak backfill) DAN delete di-suppress →
  langkah gambar disuppress konsisten (nol gambar bocor). Setelah re-host COMPLETED, guard tak drop → flag false →
  gambar jalan normal. **Catatan:** ini mencegah duplikat; agar gambar benar-benar ter-sync, re-host HARUS jalan
  (GCS + reconciler) dan produk lama (di-import sebelum baseline fix) perlu **import ulang** agar baseline terekam.
- **Fix: reconciler robustness (job COMPLETED padahal "still failing") — ✅ (branch `bff-v14`).**
  Terlihat di lapangan: `image_rehost_jobs` status=COMPLETED tapi `lastError="4 image(s) still failing"` + master masih
  cdn. Penyebab: (1) `reconcileOne` menjalankan `rehostMaster` TANPA claim dulu — re-host lambat (fetch+retry bisa >30s
  `fixedDelay`) → tick berikut memungut job PENDING yang sama → dua run balapan → markCompleted vs retryOrDead race;
  (2) saat SEMUA gambar gagal (mapping kosong) `rehostMaster` tetap memanggil `update(master)` (churn + re-normalize).
  Fix: reconciler **lease** (`jobService.lease` — dorong `nextRunAt` +10m sebelum run) supaya tak double-pick;
  `rehostMaster` **skip `update`** bila mapping kosong (tak sentuh master saat nihil hasil); `markCompleted` bersihkan
  `lastError`. **AKAR SEBENARNYA (env):** "still failing" = fetch/**upload GCS gagal** → hampir pasti GCS belum
  dikonfigurasi (`GCP_STORAGE_BUCKET`/kredensial). Selama GCS mati, re-host tak bisa jalan → gambar import tak ter-sync
  (guard menahan agar tak duplikat). Perbaiki GCS dulu; job DEAD/lama perlu re-import untuk re-enqueue.
- **Fix: reorder (M5) menghapus variant image yang baru di-upload — ✅ (branch `bff-v14`).**
  Terlihat di log: `create_CP_Variants_Media` sukses meng-upload 2 variant image DENGAN `variant_ids` (asosiasi benar),
  lalu `reorder_CP_Media` (`PUT /products/{id}.json` dgn `product.images` — Shopify **mengganti SELURUH** set gambar)
  hanya menyertakan 2 id gambar produk (WARN "no channel id for image gallery-…ab8f490c/…ee76cd67 — skipping") →
  Shopify **menghapus** 2 variant image yang baru dibuat (final: 2 gambar, variant `image_id:null`). Sebab: `reorderNeeded`
  memicu reorder saat `hasAdd`, padahal gambar yang baru ditambah (variant, dibuat di run yang sama) **belum punya
  channel id** → PUT reorder menghilangkannya. **Fix:** `reorderNeeded` kini **skip saat `hasAdd`** — gambar baru
  di-append apa adanya; publish berikutnya (id sudah di baseline) baru reorder dgn set lengkap. Uji: `ImageReorderDecisionTest`.
  **Pemulihan produk yang terlanjur:** baseline kini mencatat id variant image yang sudah dihapus (stale) → re-push biasa
  tak menambahkannya lagi; assign ulang gambar variant di Step 2 (stem baru) ATAU import ulang.
- **Phase 5 (opsional):** normalisasi ukuran/format per persyaratan channel target saat publish-keluar.

---

## 10. Uji (rencana)

- **Pure**: pemetaan url→publicUrl (rewrite mainImage/gallery/variantImages), dedup by sourceUrl/contentHash,
  degradasi saat fetch gagal (URL channel dipertahankan).
- **Integrasi**: import Shopify (payload nyata) → assert master menyimpan URL **platform** (bukan cdn.shopify.com),
  `ImageAsset` terdaftar dgn `sourceUrl`; re-import → tak ada objek baru (dedup); fetch gagal → import tetap sukses +
  URL channel tetap + flag pending.
- **E2E**: import → edit → push ulang Shopify → gambar TETAP ada (URL platform ke-fetch Shopify); publish ke channel
  lain → gambar muncul.

---

## 11. Status keputusan

- **Phase 0** — ✅ SELESAI (channelData image-leak fix; branch `bff-v14`). CONFIRMED oleh log: `product.images` kini
  berisi gambar (bukan `[]`).
- **Timing re-host** — **B (async) + durable-retry + guard publish** (§5a) — ✅ IMPLEMENTED (branch `bff-v14`).
  Pemilik: "pastikan async berhasil, jika gagal harus diulang" → `ImageRehostJob` persisted + `ImageRehostReconciler`
  retry/backoff/dead-letter + idempoten (`sourceUrl`/`mapByUrls`). Guard publish (interim) tetap aktif sampai job COMPLETED.
- **Cakupan** — generik (digerakkan keberadaan URL gambar channel di master), mulai Shopify.
- **Bukti kebutuhan** — log 2026-08-21: re-push (delist→recreate) → Shopify `422 "Could not download image … file not
  found"` karena `src` = URL CDN produk yang baru dihapus. Re-host (Phase 1) = fix.
