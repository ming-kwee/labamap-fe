# 05 — Production Hardening (self-review of 01–04)

> DESIGN. Review kritis atas [`02`](02-recommended-architecture.md)–[`04`](04-step2-editing-and-derivatives.md):
> hal-hal production-critical yang **kurang** saya spesifikasikan, plus perbaikannya. Dengan ini desain
> jadi mudah diimplementasi **dan** aman untuk sistem ini. Semua ter-grounding ke kode nyata.

## H1. Model metadata aset (WAJIB — tanpa ini validasi dimensi mustahil)

`02` memakai model kanonik "array URL **string**". Tapi validasi per-channel (`03`: min/maxWidth, aspek)
butuh **width/height/bytes/format** — dan hari ini `ImageUploadResponse` **tak** membawanya, padahal
`MediaUploadService` sudah **menghitung** `originalWidth/originalHeight` (`:253-254`) lalu membuangnya.

**Perbaikan:** tangkap metadata yang sudah dihitung → simpan **`ImageAsset`**:
```
ImageAsset { key, publicUrl, width, height, bytes, format, contentHash, status(PENDING|READY|INVALID),
             derivatives: Map<name,url>, orgId, productId, createdAt }
```
- `images[]` master tetap kompatibel: boleh berisi URL string **atau** referensi asset; `ImageService`
  me-resolve keduanya (lihat H7 backward-compat). Validasi dimensi memakai `ImageAsset`, bukan re-fetch.
- Tambahkan `width/height` ke `ImageUploadResponse` **sekarang** (perubahan kecil, non-breaking) — itu
  langkah I0 termurah yang membuka semua validasi.

## H2. Disiplin reactive (memperbaiki latent bug, bukan mewarisi)

`MediaController` memanggil `mediaUploadService.uploadProductImage(...)` yang **blocking** (GCS +
`ImageIO`) — jalur single dibungkus `Mono.fromCallable` **tanpa** `subscribeOn`, jalur **batch**
memanggil langsung di `flatMap`. Keduanya berpotensi jalan di **event loop** → membahayakan seluruh
server WebFlux di beban tinggi.

**Perbaikan (aturan wajib untuk semua operasi storage/gambar):** setiap IO blocking (upload, delete,
`ImageIO`, baca dimensi) **harus** `.subscribeOn(Schedulers.boundedElastic())`. `MediaStorageProvider`
mengembalikan `Mono`/`Flux` dan meng-offload internal, sehingga call-site tak pernah memblokir. Jalur
publish (`collectSourceImageUrls`, dll.) tetap **murni/non-blocking** (hanya main data di memori).

## H3. Content-hash keys (idempoten, dedup, URL immutable)

`02` bilang "buat key" tanpa aturan. Production: **key = hash konten** (mis. `sha256(bytes)` + ext),
folder per org/product. Manfaat: upload idempoten (re-upload file sama = no-op), dedup lintas produk,
dan **URL immutable** → aman di-cache CDN & aman untuk channel yang meng-cache agresif (Amazon/Shopify).
Derivative pakai key deterministik: `{hash}__w{width}.{ext}`.

## H4. Keamanan upload (khusus jalur presign)

Di jalur proxied, BFF melihat bytes. Di **presign**, client bisa PUT apa saja → **content-type yang
dideklarasikan tak bisa dipercaya**. Perbaikan:
- **Magic-byte sniffing** di langkah `finalize`/worker (validasi bytes benar-benar image, bukan sekadar
  header `image/*`).
- **Presign policy** membatasi content-type + ukuran maksimum di level storage (condition pada
  signature), TTL pendek, dan key sudah ditentukan server (client tak memilih path).
- Tolak SVG (atau sanitasi) — SVG bisa membawa script.

## H5. Staleness derivative + race publish-vs-ready

Dua kondisi production yang `02/03` belum tuntas:
1. **Spec berubah** (channel menaikkan min-dimensi) → derivative lama **stale**. Tangani seperti pola
   versioning: `ImageAsset.derivatives` menyimpan spec-hash; saat spec berubah, tandai stale →
   regenerate async. **Observe-first** (warning), bukan blocking.
2. **Publish sebelum derivative READY** (presign+async): publish **jangan menunggu**. Aturan:
   - kirim derivative bila `READY`; **fallback ke original** bila belum; **jangan pernah blokir/gagalkan
     publish** karena derivative (fail-safe, konsisten dengan `ensureProductImages`/`collectSourceImageUrls`
     yang sudah fail-safe).
   - untuk channel `channelSideUpload=true`, URL yang dikirim harus sudah publicly-fetchable (H7).

## H6. Lifecycle / GC orphan  — ✅ I5 (dry-run + gated purge)

Ganti/hapus gambar meninggalkan blob yatim. Perbaikan: hapus eksplisit (sudah ada) **plus** GC
terjadwal untuk asset tanpa referensi (tak dipakai master/`channelData` mana pun) setelah masa tenggang.
Karena key berbasis hash (H3), hindari hapus blob yang masih dirujuk produk lain (hitung referensi).

**Terimplementasi (`ImageGcService` + `/admin/image-gc/*`):** DRY-RUN (`findOrphanCandidates`, report-only)
+ PURGE confirm-gated (`purgeOrphans`, `?confirm=true`). **Tak terjadwal by default** (opt-in — hindari
hapus tak sengaja). Referensi dikumpulkan **over-inclusive** (master `productAttributes`/`imageUrl`/variants
+ `channelData`/variantOverrides, reuse `ImageService.extractImageUrls`) → err ke arah menyimpan.
**Batasan jujur:** hanya asset ber-`ImageAsset` (upload sejak I2b) yang dipertimbangkan — blob pra-I2b tak
tersentuh (aman, tapi tak ter-GC). Ref-count berbasis hash (H3) belum ada → cocokkan `publicUrl` persis.

## H7. Backward-compat (JANGAN merusak data & alur yang ada)

- **URL absolut yang sudah tersimpan** (`https://storage.googleapis.com/...`) harus **passthrough** di
  `CdnUrlResolver`/`ImageService` — jangan diprefiks CDN lagi. Aturan: bila nilai sudah absolute-URL →
  pakai apa adanya; hanya key relatif yang di-resolve ke CDN/storage.
- **`collectSourceImageUrls` sudah toleran** objek `url/publicUrl/src/imageUrl` — `ImageService.extractUrls`
  harus mempertahankan toleransi ini persis (jangan mempersempit).
- **Pipeline tetap JOLT-independent** — `_sourceImages` tetap sumber; jangan kembalikan image ke JOLT.
- Endpoint `/api/v1/media/upload` (proxied) **tetap** ada berdampingan dengan presign (fallback/dev).

## H8. Keputusan yang saya tegaskan (bukan "A atau B")

- **Penempatan spec:** koleksi **`channel_image_specs`** (per `channelType[,categorySlug]`), di-seed
  migration — konsisten dengan koleksi channel-config lain & admin-editable. **Bukan** di `apiSchema`.
- **Upload model default:** **presign + finalize + derivative async** untuk produksi; proxied sebagai
  fallback. (`02` §4.)
- **Validasi:** **warning-first** di Step-2 & analyze; auto-fix (potong maxCount/convert/resize) menyusul
  setelah spec terverifikasi.

## H9. Testability & rollout

- `ImageService` (murni) → unit test tanpa infra. `LocalMediaStorageProvider` → test tanpa GCS.
- Urutan implementasi paling aman (tiap langkah non-breaking):
  **I0** ✅ (`bff-v12`): `width/height` di `ImageUploadResponse` + ekstrak `ImageService` + offload
  boundedElastic (perbaiki H2) → **I1** ✅ (`bff-v12`): `MediaStorageProvider`+`CdnUrlResolver` (bungkus
  GCS) → **I2** ✅ (`bff-v12`): `channel_image_specs` + `validate` (warning) → **I2b** ✅ (`bff-v12`):
  `ImageAsset` metadata (H1) direkam saat upload → validasi dimensi jalan pada URL master tersimpan →
  **I3** ✅ *(sebagian, `bff-v12`)*: endpoint presign (`POST /media/presign`) + finalize (`POST /media/finalize`)
  + `MediaStorageProvider.presignUpload`/`exists` (GCS V4 signed PUT, content-type terikat). **Ditunda** (butuh
  worker/event infra): derivative async + magic-byte sniffing (H4) + enforce byte-size via signed POST policy →
  **I4** ✅ (FE `v9`): plumbing FE (presign/finalize/dims di `MediaUploadService`) + **editor visual
  Step-2** (`StoreImageOverrideEditor`/`ImageCropModal`/`channelImageSpec.service`, react-easy-crop) per
  kontrak ([`06`](06-frontend-step2-image-override.md)); sisa QA visual + variant-image override →
  **I5** ✅ *(dry-run, `bff-v12`)*: `ImageGcService.findOrphanCandidates` (report-only) + `purgeOrphans`
  (confirm-gated) via `/api/v1/admin/image-gc/{orphans,purge}`; referensi over-inclusive (master +
  channelData); **tak terjadwal** (opt-in). Hanya menyentuh asset ber-`ImageAsset` (pre-I2b aman).
- I0–I1 nol perubahan perilaku (hanya refactor + field additif); risiko kerusakan sistem minimal — terverifikasi.

## Verdict

Desain 01–04 adalah **arah yang benar & non-destruktif**, tapi baru "production-standard" setelah H1–H8
di atas — khususnya **H1 (model metadata)** yang menjadi prasyarat validasi, **H2 (reactive)** yang justru
memperbaiki bug laten, dan **H7 (backward-compat)** yang menjaga data & alur lama tetap jalan. Dengan
hardening ini, desain **mudah diimplementasi bertahap (I0 dulu, non-breaking)** dan aman.
