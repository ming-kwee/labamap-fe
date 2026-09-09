# 06 — FE Implementation Contract: Step-2 Image Override Editor (I4)

> **Status: CONTRACT for the FE team.** Backend + FE service plumbing are ready (I0–I3). The Step-2
> image editor is a **visual** component — build it in the FE repo with visual iteration (it can't be
> verified from the backend). This doc specifies exactly what to build and the contract it consumes.
> Design rationale: [`04-step2-editing-and-derivatives.md`](04-step2-editing-and-derivatives.md).

> ## ✅ REGRESI DIPERBAIKI (Opsi A, FE `v14` 2026-09-09) — override gambar Step-2 kini lewat `masterOverrides.images`
>
> **Dahulu (regresi):** kontrak §2 menyuruh FE menulis override ke `channelData.images` yang di-merge
> sebelum JOLT. BFF kemudian menambah guard anti-kebocoran reverse-import yang **men-drop SEMUA** kunci
> gambar master-owned di `channelData` — termasuk override sah dari editor ini — sehingga seluruh
> pengaturan gambar Step-2 (reorder, set-main, crop) diam-diam **tidak sampai ke channel** dan publish
> jatuh ke galeri master.
>
> **Perbaikan (Opsi A):** `ChannelStoreTab` kini menulis & membaca override gambar **produk** lewat
> `masterOverrides.images` (jalur yang BFF sendiri hormati tanpa filter di step 1). FE-only, tidak
> menyentuh BFF. Detail, bukti kode, gejala, dan catatan implementasi di
> **[§8](#8--regresi-kontrak-channeldataimages-vs-masteroverridesimages)**.
> Isu sekunder ordering pada add-run (§8.3) tetap ditangani terpisah di BFF.

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
- **Override key (produk):** `masterOverrides.images = [url1, url2, …]` (urut). Backend meng-apply
  **semua** kunci `masterOverrides` ke `_source` di step 1 `loadAndMergeChannelData` (tanpa filter) →
  `masterOverrides.images` jadi `_source.images` dan diproses normal (master < masterOverrides).
  ~~`channelData.images`~~ **JANGAN dipakai** — BFF membuangnya lewat guard master-owned image keys
  (lihat [§8](#8--regresi-kontrak-channeldataimages-vs-masteroverridesimages)). Variant:
  `variantOverrides[sku].variantImages` → tetap lewat `URL_ARRAY_TO_SRC_OBJECTS` (tidak terpengaruh).

## 3. Komponen yang harus dibangun (Step-2)

Panel **"Images (per store)"** di `ChannelFieldsWizard` (atau field type `IMAGE_SET`):

| Kapabilitas | Cara |
|---|---|
| Tampilkan master images (referensi read-only) | dari master product |
| Bangun daftar per-store: **pilih & urutkan** | array URL terurut di state → `masterOverrides.images` |
| **Hapus / tambah / ganti** | tambah via `uploadViaPresign` (atau `uploadImage`); hapus dari list |
| **Crop / resize** ke spec channel | cropper client-side → hasil `Blob`/`File` → `uploadViaPresign` → URL derivative masuk list |
| **Validasi langsung** | panggil `/admin/channel-image-specs/{channelType}/validate` dengan URL list → tampilkan `ImageIssue` inline (warning) |
| **Simpan** | `saveChannelData(org, { …, masterOverrides: { …existing, images: orderedUrls } })` |

- **Reorder:** boleh tombol naik/turun (tanpa lib) atau DnD. **Crop:** tambah lib `react-easy-crop`
  (repo baru punya `react-dropzone` untuk drop/upload; belum ada cropper).
- **Non-destruktif:** jangan tulis balik ke master; kalau user tak override → jangan kirim `images` di
  `masterOverrides` (biar fallback ke master).

## 4. Spec-aware (dari 03 / I2)

- Kunci output crop/resize ke `ChannelImageSpec` channel target (maxCount, min/max dimensi, aspect) —
  ambil via `GET /api/v1/admin/channel-image-specs/{channelType}`.
- Tampilkan warning `ImageIssue` (MAX_COUNT, MIN_WIDTH, ASPECT_RATIO, MAX_BYTES, FORMAT_NOT_ALLOWED) tapi
  **jangan blokir** simpan (observe-first) — konsisten dengan backend.

## 5. Kriteria penerimaan

- [x] Panel per-store menampilkan master images + daftar override yang bisa diurutkan/dipilih/dihapus.
- [x] Tambah/ganti gambar via upload (proxied atau presign) → URL derivative masuk daftar.
- [x] Crop/resize menghasilkan derivative (upload), bukan menimpa master.
- [x] Simpan menulis `masterOverrides.images` (urut); kosong = tak mengirim `images` (fallback master).
- [x] Validasi channel-spec ditampilkan inline sebagai warning (tak memblokir).
- [x] Variant image per-store via **per-SKU** `variantOverrides[sku].variantImages` (bukan flat
      `channelData.variantImages` — master variant image bersifat per-SKU, jadi override-nya per-SKU).

> **Implementasi FE (v9, 2026-08-08):** `StoreImageOverrideEditor.tsx` + `ImageCropModal.tsx`
> (react-easy-crop) + `utils/image-crop.ts` + `services/channelImageSpec.service.ts`, di-render di
> `ChannelStoreTab` di bawah field sections. Inti list-editor (`ImageListEditor`) dipakai ulang untuk
> gambar level-produk **dan** tiap SKU. Master images baseline read-only (dari
> `MasterProductSnapshot.images` ?? `[mainImage, …galleryImages]`; variant dari `variant.variantImages`);
> "Customise" mem-fork override; reorder (panah)/set-main/crop/remove; upload via `uploadViaPresign` →
> fallback `uploadImage`; validasi debounce ke `/admin/channel-image-specs/{ch}/validate` (degrade diam
> bila endpoint absen). Non-destruktif: list kosong → key di-drop → publish jatuh ke master.
> - Product override → `masterOverrides.images` (lewat handler ChannelStoreTab; sejak FE `v14` —
>   dulu `channelData.images`, lihat §8).
> - Variant override → `variantOverrides[sku].variantImages` (lewat `handleVariantChange` yang sudah ada
>   → simpan/hydrate/merge otomatis; backend menerapkan `URL_ARRAY_TO_SRC_OBJECTS` seperti biasa).
>
> **Tersisa:** QA visual terhadap backend berjalan + endpoint spec/validate aktif; validasi spec khusus
> variant (`ChannelImageSpec.variant`) belum di-surface (product-level saja untuk saat ini).

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

---

## 8 — Regresi kontrak: `channelData.images` vs `masterOverrides.images`

**Didiagnosis 2026-09-09; diperbaiki hari yang sama (Opsi A, FE `v14`).** Gejala pelapor: *"edit foto
ke-2 untuk Shopify, setelah publish foto itu malah tampil pertama / susunan Step-2 tidak diikuti."* Akar
masalahnya **bukan** ordering di FE — tetapi **mismatch field** antara FE dan BFF.

### 8.1 Bukti kode

**FE (dulu) menulis override ke `channelData.images` — jalur yang dibuang BFF:**

- `StoreImageOverrideEditor.tsx` — edit foto = re-crop in-place, **urutan dipertahankan** (benar):
  ```js
  // openReCrop(i) → replaceIndex: i ; handleCropped:
  if (task?.replaceIndex != null) commit(list.map((u, i) => (i === task.replaceIndex ? url : u)));
  ```
- ~~`ChannelStoreTab.tsx` — handler menaruhnya di `channelData.images`:~~
  ```js
  // DULU (regresi):
  function handleImagesOverrideChange(urls) {
    if (urls && urls.length > 0) nextChannelData.images = urls;   // ← channelData.images (dibuang BFF)
    else delete nextChannelData.images;
  }
  ```
  **SEKARANG (Opsi A, fixed):** handler menulis & membaca dari `masterOverrides.images`:
  ```js
  function handleImagesOverrideChange(urls) {
    const nextOverrides = { ...values.masterOverrides };
    if (urls && urls.length > 0) nextOverrides.images = urls;    // ← masterOverrides.images
    else delete nextOverrides.images;
    onChange({ ...values, masterOverrides: nextOverrides });
  }
  ```
  (value dibaca dari `values.masterOverrides.images` via memo `imageOverrideValue` di kedua render spot.)

**BFF membuang `channelData.images`:**

- `ChannelPublishService.java:150-151`
  ```java
  private static final Set<String> MASTER_OWNED_IMAGE_KEYS = Set.of("images", "mainImage", "galleryImages");
  ```
- `ChannelPublishService.java:597-616` — di `loadAndMergeChannelData`, setiap kunci `channelData` yang ada
  di set itu **di-skip** (hanya `log.warn "Ignoring channelData image key 'images' (master-owned …)"`).
  Guard ini ditambah untuk memblok **kebocoran reverse-import** lama (blob `images` kosong/basi yang
  meng-wipe galeri master saat re-push) — tetapi ia **tak bisa membedakan** kebocoran dari override sah,
  jadi men-drop **keduanya**.

**Jalur yang benar per BFF = `masterOverrides.images`:** step 1 `loadAndMergeChannelData`
(`:585-594`) meng-apply **semua** kunci `masterOverrides` ke `masterProductData` **tanpa filter**, jadi
`masterOverrides.images` menjadi `_source.images` dan diproses normal. Komentar guard sendiri menyatakan
ini: *"a real per-channel image override goes through masterOverrides, step 1."*

### 8.2 Kenapa gejalanya "foto edit jadi pertama"

Karena override di-drop, publish memakai **galeri master apa adanya** (mainImage index-0). Susunan yang
diatur di Step-2 (reorder / ★ set-main / ✂ crop foto ke-2) **tidak diterapkan** → yang tampil pertama di
channel adalah urutan master, bukan yang diatur pelapor. Tak ada error — hanya `log.warn` senyap — sehingga
terlihat seperti "bug ordering/position". (Verifikasi cepat: cari baris `Ignoring channelData image key
'images'` di log publish produk itu.)

### 8.3 Isu sekunder (independen, tetap ada setelah kontrak diperbaiki)

Reorder gambar **dimatikan pada add-run**: `PublishImageDiffPlanner.reorderNeeded` → `if (hasAdd) return
false` (`:465`). Foto yang di-crop adalah **file baru** (`crop-<ts>.jpg`, stem `imageKey` baru) = ADD →
reorder PUT tak jalan di publish yang sama; posisi baru terkoreksi di **publish berikutnya**
(komentar `:460-464`). Jadi walau kontrak §8.1 diperbaiki, foto crop baru bisa perlu publish kedua untuk
menempati posisi yang benar. Ditangani terpisah.

### 8.4 Opsi fix — **Opsi A DITERAPKAN** (FE `v14`, 2026-09-09)

| Opsi | Perubahan | Risiko / catatan | Status |
|---|---|---|---|
| **A — FE → `masterOverrides.images`** (sesuai kontrak BFF) | `ChannelStoreTab.handleImagesOverrideChange` + read-value tulis/baca dari `masterOverrides.images` | Pengecekan selesai: `ChannelStoreService.saveChannelData` meneruskan `masterOverrides` **apa adanya tanpa filter** (`channelStore.service.ts:404`), jadi `images` lolos. Tak menyentuh BFF. | ✅ **Diterapkan** |
| **B — BFF longgarkan guard** | `loadAndMergeChannelData` hormati `channelData.images` bila **list non-kosong valid**; hanya drop blob kosong (tanda kebocoran) | Jika reverse-import mengirim blob non-kosong basi, kebocoran bisa balik. FE tak berubah. | Tidak dipilih |

**Yang dikerjakan (Opsi A):**
- `ChannelStoreTab.tsx` — `handleImagesOverrideChange` menulis ke `masterOverrides.images` (bukan
  `channelData.images`); tambah memo `imageOverrideValue` yang membaca dari `masterOverrides.images`;
  kedua render `StoreImageOverrideEditor` (embedded + standalone) pakai memo itu.
- Komentar kontrak di `ChannelStoreTab.tsx` & `StoreImageOverrideEditor.tsx` diselaraskan (menjelaskan
  kenapa harus `masterOverrides`, referensi §8).
- Verifikasi: `saveChannelData` tak menyaring `masterOverrides`; hidrasi ulang via `values.masterOverrides`
  (jalur yang sama dipakai `MasterOverrideSection`, jadi reload menampilkan override dengan benar);
  `images` bukan field schema → tak memengaruhi perhitungan completion; `tsc` bersih.
- **Variant images tidak berubah** — tetap `variantOverrides[sku].variantImages` (tak pernah kena guard).

**Sisa:** QA visual end-to-end terhadap publish nyata (konfirmasi urutan/★/crop Step-2 sampai ke channel),
dan isu sekunder §8.3 (reorder pada add-run) yang ditangani terpisah di BFF.
