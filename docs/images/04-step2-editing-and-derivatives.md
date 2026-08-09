# 04 — Step-2 Image Editing & Non-Destructive Derivatives

> DESIGN. Menjawab Q4 (Step-2 bisa modify: crop/resize/reorder dsb).

## 1. Prinsip: master kanonik, override per-store = derivative

- **Master `images` tetap sumber kebenaran** (channel-agnostic). Edit di Step-2 **tak menimpa master**.
- Edit per store/channel disimpan sebagai **override** memakai mekanisme yang **sudah ada**:
  `channel_product_data.channelData` (per `masterProductId × storeId`) — jalur yang sama dipakai field
  channel-spesifik lain, dan yang di-merge ke source sebelum publish
  (`ChannelPublishService.loadAndMergeChannelData`).
- Hasil edit (crop/resize) = **derivative baru** (file baru di storage), URL-nya disimpan sebagai
  override. Non-destruktif: master utuh, tiap store bisa punya crop berbeda.

## 2. Kemampuan editor Step-2

| Kapabilitas | Cara |
|---|---|
| **Pilih & urutkan** gambar per store | simpan array URL terurut di `channelData.images` (override) |
| **Crop / resize** ke spec channel | editor client-side (canvas) → hasilkan file baru → upload via `ImageService`/media → simpan URL derivative sebagai override |
| **Set main image** per channel | urutan (index 0) atau field `channelData.mainImage` |
| **Hapus latar / auto-fit** (lanjut) | langkah async (worker) atau layanan pihak-ketiga; hasil = derivative baru |
| **Validasi langsung** | `ImageService.validate(images, ChannelImageSpec)` → tampilkan `ImageIssue` inline ([`03`](03-per-channel-specs-and-validation.md)) |

## 3. Di mana transform dijalankan (rekomendasi)

**Client-side crop/resize → upload derivative** (paling sederhana, tanpa image-processing di request path):
```
1. Step-2 editor (canvas/cropper) memotong/mengubah ukuran sesuai ChannelImageSpec channel.
2. Hasil (blob) di-upload via media (presign §02 atau proxied) → dapat publicUrl derivative.
3. Simpan URL derivative ke channelData (override per store) via save Step-2 yang sudah ada.
4. Publish: loadAndMergeChannelData meng-override images → _sourceImages memakai derivative store itu.
```
Alternatif (server-side): simpan **parameter transform** (crop rect, target size) di channelData dan
terapkan di worker async saat finalize/publish. Lebih berat; pilih hanya bila butuh transform konsisten
lintas klien / audit. Untuk mulai, **client-side derivative** cukup dan murah.

## 4. Alur data (ringkas)

```
master.images (kanonik)
   │  Step-2 editor (per store): reorder / crop / resize → derivative baru (upload)
   ▼
channel_product_data.channelData.images = [ derivativeUrl1, … ]   (override per store, non-destruktif)
   │  publish: loadAndMergeChannelData (master < masterOverrides < channelData)
   ▼
_sourceImages (staging)  ─post-processing per-channel→  field image channel
```
- Bila store **tak** meng-override → jatuh ke master `images` (perilaku sekarang, tak berubah).
- **Baseline master images di Step 2** dibaca FE dari `MasterProductSnapshot.images` (fallback
  `[mainImage, …galleryImages]`). Snapshot dulu hanya mengekspos `mainImage`, jadi galeri produk
  (mis. 1 mainImage + 2 galleryImages) tampil sebagai **1 gambar** — bug di BE, bukan FE. Sudah
  diperbaiki: `ChannelStepSchemaService.buildMasterSnapshot` kini mengisi `images` (list kanonik
  hasil `MasterProductDataService.normalizeImages` — main dulu, dedup; dibangun ulang dari
  `mainImage`+`galleryImages` untuk produk lama) plus `galleryImages`. Regresi: `ChannelStepSchemaServiceImagesTest`.
- Variant image per store: pola sama (`channelData.variantImages` / per-SKU override), lalu
  `URL_ARRAY_TO_SRC_OBJECTS` seperti biasa.
  - ⚠️ Override variant image disimpan di bawah key mentah `variantImages`. Post-processing
    (`transform-variant-images`, `WRAP_ARRAY_TO_OBJECTS`) mengubahnya jadi `images` `[{src}]` dan
    **menghapus** `variantImages`. Merge override **post-JOLT** dulu menyuntikkan lagi `variantImages`
    mentah → bocor sebagai entri `passthrough_variantImages` (`TEXT`) di samping yang benar. Sudah
    diperbaiki: merge post-JOLT kini melewati key yang sudah dikonsumsi post-processing. Detail:
    [`../product/07-publishing-engine/01-guides/03-attribute-conversion.md`](../product/07-publishing-engine/01-guides/03-attribute-conversion.md)
    (§ buildVariantGroups → Pass 2).

## 5. Guardrail

- **Non-destruktif**: jangan pernah menulis derivative kembali ke master `images`.
- **Spec-aware**: editor mengunci output ke `ChannelImageSpec` (aspek/min-dimensi/maxCount) agar hasil
  edit valid untuk channel target — validasi pakai `ImageService.validate`, satu sumber.
- **Public URL untuk channel-side upload**: derivative store harus publicly fetchable saat publish
  (Shopee/TikTok menariknya) — lihat [`03`](03-per-channel-specs-and-validation.md) §5.
- **Data-driven**: tak ada aturan channel yang di-hardcode di editor; semua dari `ChannelImageSpec`.
