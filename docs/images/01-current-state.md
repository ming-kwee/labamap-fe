# 01 — Current Image Handling (grounded)

> Peta apa yang ADA hari ini, dengan file:line. Dasar untuk desain di [`02`](02-recommended-architecture.md).

## 1. Upload & storage — `media/` module (GCP Cloud Storage, server-proxied)

- `media/controller/MediaController.java` — `POST /api/v1/media/upload` (multipart `FilePart`),
  `POST /api/v1/media/upload/batch`, `DELETE /api/v1/media/delete`, `/health`, `/test`.
- `media/service/MediaUploadService.java`:
  - GCP Cloud Storage; lazy `Storage` client via `GOOGLE_APPLICATION_CREDENTIALS`
    (`gcp.storage.bucket-name:product-images-production`, `gcp.storage.project-id`). Init is
    **bounded-retry** (`GcsMediaStorageProvider`): re-attempts while null up to `gcp.storage.max-init-attempts`
    (default 5) → self-heals if creds arrive late, then stops (no per-call spam).
  - `uploadProductImage(fileBytes, contentType, …)` — **server-proxied** (bytes streamed through the BFF),
    creates a blob, returns `publicUrl = https://storage.googleapis.com/{bucket}/{blob}`.
  - `validateImage(...)` — max **10MB** (`media.upload.max-file-size`), content-type must be `image/*`,
    fixed allowed-types list.
  - `generateThumbnail(...)` via `ImageIO` — **one fixed 300px** thumbnail (`media.upload.thumbnail-size:300`).
  - `deleteImage(url)` — deletes blob + its thumbnail.
- `media/model/dto/ImageUploadResponse.java` — `{ url, publicUrl, thumbnailUrl, filename, size, mimeType,
  uploadedAt, organizationId, productId, imageType }`.

**Karakter penting:** upload lewat BFF (bukan presign); satu derivative (300px); **tak ada** ukuran
per-channel, crop, aspek-ratio, atau abstraksi CDN — `publicUrl` = URL GCS mentah (komentar
"CDN-optimized" belum benar). Coupling langsung ke GCS (`StorageOptions`, `BlobId`).

## 2. Master normalization — one canonical `images` array

- `ecommerce/masterproduct/service/MasterProductDataService.java`:
  - `normalizeImages(attrs)` (`:396`) — gabung `mainImage` (single) + `galleryImages` (array) → satu
    array **`images`** (dedup, urut, mainImage duluan). Idempotent; `mainImage`/`galleryImages` tetap ada.
  - Ada **satu aturan validitas URL** bersama untuk input + varian (`:430`).

## 3. Publish pipeline — images are JOLT-independent

- `publishing/service/ChannelPublishService.java`:
  - `ensureProductImages(request)` (`:632`) — backfill `mainImage`/`galleryImages`/`images` dari master
    tersimpan saat payload FE hanya kirim `mainImage` (gated; hanya isi key null).
  - `collectSourceImageUrls(masterData)` (`:2022`+) — kumpulkan URL (toleran objek:
    `url`/`publicUrl`/`src`/`imageUrl`) → list dedup, urut, mainImage duluan.
  - Di-stage ke transformed data di key reserved **`_sourceImages`** (`:876`, `:1394`) **setelah JOLT,
    sebelum post-processing**. JOLT **tidak** memetakan image (`:1350-1354`).
- Tiap channel membangun field image-nya di **post-processing** membaca `_sourceImages`
  (mis. Shopee `images.image_url_list` via rule `shopee-build-image-url-list`).

## 4. Variant images

- `publishing/service/FieldTransformationService.java` — `URL_ARRAY_TO_SRC_OBJECTS` (`:78,:115`):
  `["url1","url2"]` → `[{src:"url1"},{src:"url2"}]` (Shopify variant images; property configurable).
- Diwire oleh `config/VariantImageAttributeMappingMigration.java` + `VariantImageDataDrivenMigration.java`
  (variant field `variantImages`).

## 5. Channel-side upload — done by the sync-service, not the BFF

- `config/ChannelMetadataMigration.java` — Shopee two-step sebagai **workaction** channel metadata:
  - `:289` `upload_image` workflow → `media_space/upload_image` (multipart), map balik `image_id` →
    `image.image_id_list` (`:301-302`), lalu `add_item`.
  - eBay media step (`:456`), TikTok pre-uploaded by id (memory).
- Artinya: **BFF menyerahkan URL publik**; **sync-service (localhost:9000)** menarik gambar dari URL itu
  dan mengunggah ke channel, memetakan ID balik. → **URL yang diserahkan ke channel WAJIB publicly
  fetchable** saat publish (batasan penting untuk model presign/private-bucket).

## 6. Ringkas gap (yang jadi bahan desain)

| Aspek | Sekarang | Gap |
|---|---|---|
| Upload | server-proxied via BFF | tak skala untuk file besar; presign belum ada |
| Derivatives | 1 thumbnail 300px | tak ada ukuran per-channel |
| Validasi | ≤10MB + content-type global | tak ada aturan dimensi/aspek/jumlah per-channel |
| Storage | GCS hard-coupled | tak ada abstraksi provider / CDN |
| Step-2 | tak ada edit image | tak bisa crop/resize/reorder per store/channel |
| Kohesi kode | logika image tersebar di 4+ kelas | belum ada `ImageService` tunggal |
