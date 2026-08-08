# 06 — FE Implementation Contract: Step-2 Image Override Editor (I4)

> **Status: CONTRACT for the FE team.** Backend + FE service plumbing are ready (I0–I3). The Step-2
> image editor is a **visual** component — build it in the FE repo with visual iteration (it can't be
> verified from the backend). This doc specifies exactly what to build and the contract it consumes.
> Design rationale: [`04-step2-editing-and-derivatives.md`](04-step2-editing-and-derivatives.md).

## 1. Prinsip (dari 04)

- **Master `images` = kanonik, jangan disentuh.** Edit per-store disimpan sebagai **override** di
  `channel_product_data.channelData` (mekanisme yang sudah ada). Kosong → publish jatuh ke master.
- Crop/resize menghasilkan **derivative baru** (file baru di storage) — URL-nya jadi override. Non-destruktif.

## 2. Kontrak backend yang dipakai (semua sudah ada)

| Kebutuhan | Endpoint / API |
|---|---|
| Upload (proxied) | `MediaUploadService.uploadImage(file, org, product, imageType)` → `{publicUrl, width, height, …}` |
| Upload (presign, skala — I3) | `MediaUploadService.uploadViaPresign(file, org, product, imageType)` (presign → PUT → finalize) |
| Simpan override per-store | `ChannelStoreService.saveChannelData(org, { masterProductId, storeId, channelType, channelData })` |
| Validasi spec channel (warning) | `POST /api/v1/admin/channel-image-specs/{channelType}/validate` body `{ categorySlug?, images:[{url,width?,height?,bytes?,format?}] }` → `ImageIssue[]` (dimensi terisi otomatis dari `ImageAsset` per URL — I2b) |

- Upload mengembalikan **width/height** (I0) dan merekam **`ImageAsset`** (I2b) → validasi dimensi jalan.
- **Override key:** `channelData.images = [url1, url2, …]` (urut). Backend me-merge ini ke source sebelum
  JOLT (`ChannelPublishService.loadAndMergeChannelData`: master < masterOverrides < channelData). Variant:
  `channelData.variantImages` (atau per-SKU) → tetap lewat `URL_ARRAY_TO_SRC_OBJECTS`.

## 3. Komponen yang harus dibangun (Step-2)

Panel **"Images (per store)"** di `ChannelFieldsWizard` (atau field type `IMAGE_SET`):

| Kapabilitas | Cara |
|---|---|
| Tampilkan master images (referensi read-only) | dari master product |
| Bangun daftar per-store: **pilih & urutkan** | array URL terurut di state → `channelData.images` |
| **Hapus / tambah / ganti** | tambah via `uploadViaPresign` (atau `uploadImage`); hapus dari list |
| **Crop / resize** ke spec channel | cropper client-side → hasil `Blob`/`File` → `uploadViaPresign` → URL derivative masuk list |
| **Validasi langsung** | panggil `/admin/channel-image-specs/{channelType}/validate` dengan URL list → tampilkan `ImageIssue` inline (warning) |
| **Simpan** | `saveChannelData(org, { …, channelData: { …existing, images: orderedUrls } })` |

- **Reorder:** boleh tombol naik/turun (tanpa lib) atau DnD. **Crop:** tambah lib `react-easy-crop`
  (repo baru punya `react-dropzone` untuk drop/upload; belum ada cropper).
- **Non-destruktif:** jangan tulis balik ke master; kalau user tak override → jangan kirim `images` di
  `channelData` (biar fallback ke master).

## 4. Spec-aware (dari 03 / I2)

- Kunci output crop/resize ke `ChannelImageSpec` channel target (maxCount, min/max dimensi, aspect) —
  ambil via `GET /api/v1/admin/channel-image-specs/{channelType}`.
- Tampilkan warning `ImageIssue` (MAX_COUNT, MIN_WIDTH, ASPECT_RATIO, MAX_BYTES, FORMAT_NOT_ALLOWED) tapi
  **jangan blokir** simpan (observe-first) — konsisten dengan backend.

## 5. Kriteria penerimaan

- [x] Panel per-store menampilkan master images + daftar override yang bisa diurutkan/dipilih/dihapus.
- [x] Tambah/ganti gambar via upload (proxied atau presign) → URL derivative masuk daftar.
- [x] Crop/resize menghasilkan derivative (upload), bukan menimpa master.
- [x] Simpan menulis `channelData.images` (urut); kosong = tak mengirim `images` (fallback master).
- [x] Validasi channel-spec ditampilkan inline sebagai warning (tak memblokir).
- [ ] Variant image per-store (opsional) via `channelData.variantImages` — *belum; pola sama, menyusul.*

> **Implementasi FE (v9, 2026-08-08):** `StoreImageOverrideEditor.tsx` + `ImageCropModal.tsx`
> (react-easy-crop) + `utils/image-crop.ts` + `services/channelImageSpec.service.ts`, di-render di
> `ChannelStoreTab` di bawah field sections. Master images baseline read-only (dari
> `MasterProductSnapshot.images` ?? `[mainImage, …galleryImages]`); "Customise" mem-fork override;
> reorder (panah)/set-main/crop/remove; upload via `uploadViaPresign` → fallback `uploadImage`;
> validasi debounce ke `/admin/channel-image-specs/{ch}/validate` (degrade diam bila endpoint absen).
> Non-destruktif: list kosong → `channelData.images` di-drop → publish jatuh ke master. Tersisa: QA
> visual terhadap backend berjalan + variant-image override.

## 6. Yang JANGAN

- Menimpa master `images`.
- Memblokir simpan karena warning image (observe-first).
- Menaruh derivative di `apiSchema` atau JOLT (tetap JOLT-independent; backend membangun field image dari
  `_sourceImages`).

## 7. Status plumbing (sudah dikerjakan, `bff-v12` / FE `v9`)

- ✅ Upload proxied + **presign/finalize** (`MediaUploadService.presign/finalize/uploadViaPresign` +
  `readImageDimensions`).
- ✅ Response upload membawa `width/height`; `ImageAsset` direkam.
- ✅ Endpoint validasi spec (dimensi terisi otomatis dari `ImageAsset`).
- ✅ **Editor visual (komponen ini) dibangun** (FE `v9`, 2026-08-08) — lihat catatan §5. Sisa: QA
  visual dengan backend berjalan + spec/validate endpoint aktif, dan variant-image override.
