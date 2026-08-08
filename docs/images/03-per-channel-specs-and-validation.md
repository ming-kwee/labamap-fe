# 03 — Per-Channel Image Specs as DATA + Validation

> DESIGN. Menjawab Q3 (aturan ukuran per-channel via config/rules).

## 1. Kenapa DATA, bukan literal

Tiap channel punya batasan image nyata & berbeda (jumlah, dimensi, aspek, format, ukuran byte, latar).
Menaruhnya sebagai literal di service = pelanggaran **"no hardcoded domain knowledge"** (CLAUDE.md) dan
tak bisa diubah admin tanpa redeploy. Jadi modelkan sebagai **koleksi yang dibaca runtime**.

## 2. `ChannelImageSpec` (bentuk usulan)

Per `(channelType[, categorySlug])` — kategori opsional karena beberapa channel beda syarat per kategori:

```
ChannelImageSpec {
  channelType, categorySlug?         // scope
  maxCount                           // maks jumlah gambar (mis. Shopee 9, Shopify 250)
  minWidth, minHeight                // dimensi minimum (px)
  maxWidth, maxHeight                // dimensi maksimum (px)
  allowedAspectRatios: [ "1:1", "3:4" ]   // kosong = bebas
  requireSquare: bool                // shortcut umum (mainImage kotak)
  maxBytes                           // batas ukuran file
  allowedFormats: [ "jpeg","png","webp" ]
  backgroundRequirement: NONE|WHITE|…    // mis. Amazon main image latar putih
  variant: { maxCount, minWidth, … }     // aturan khusus variant image (opsional)
  channelSideUpload: bool            // channel menarik/upload sendiri (Shopee/TikTok) → butuh URL publik
}
```

**Rumah:** koleksi `channel_image_specs` **atau** embed di `ChannelConfiguration.imageSpec` /
`ChannelCategoryApiConfig`. Di-seed oleh migration (`*Migration`/`*DataLoader` = rumah sah untuk literal
referensi — pengecualian CLAUDE.md). **Bukan** ditaruh di `apiSchema` (itu spec body, bukan aturan media).

> **Catatan verifikasi:** nilai konkret per-channel (mis. "Shopee min 1024×1024, maks 9 gambar",
> "Amazon longest side ≥ 1600 untuk zoom, main image latar putih", "Shopify ≤ 20MB / 4472px",
> "TikTok rasio spesifik") **harus diverifikasi ke dokumen resmi channel** sebelum di-seed — jangan
> tebak angka. Seeder mengisi angka terverifikasi; service hanya membacanya.
>
> **Terisi (I2b, `ChannelImageSpecMigration`, per 2026 — warning-only, fill-if-null):** maxBytes —
> Shopify 20MB · eBay 12MB · Amazon 10MB · Walmart 5MB · Shopee 5MB · TikTok 5MB · Lazada 3MB · Wix 50MB;
> WooCommerce null (self-hosted). Plus maxCount (Shopify 250, eBay 24, Shopee/TikTok 9, Lazada 8), min
> dimensi (Walmart 1000², Shopee 500², TikTok 600², Lazada 330²), dan cap piksel (Shopify 4472² API,
> Amazon 10000²).
>
> **Status verifikasi (cross-check dev-docs resmi):**
> - ✅ **Terkonfirmasi resmi:** Shopify 20MB/250/4472² ([help.shopify.com](https://help.shopify.com/en/manual/products/product-media/product-media-types)),
>   eBay 12MB/24 ([developer.ebay.com](https://developer.ebay.com/api-docs/sell/static/inventory/managing-image-media.html)),
>   Walmart 5MB/1000² ([marketplacelearn.walmart.com](https://marketplacelearn.walmart.com/)),
>   Wix 50MB ([support.wix.com](https://support.wix.com/en/article/wix-media-supported-media-file-types-and-file-sizes)),
>   Amazon dim 10000²/min-1000 (Seller Central image reqs).
> - ⚠️ **Sumber sekunder (belum terkonfirmasi via dev-docs resmi — verifikasi ulang):** Amazon maxBytes 10MB,
>   Shopee 5MB/9/500², TikTok 5MB/9/600², Lazada 3MB/8/330².

## 3. Di mana dikonsumsi

Satu spec, banyak pemakai (semua lewat `ImageService.validate`, [`02`](02-recommended-architecture.md) §2):

| Titik | Peran |
|---|---|
| **Step-2 / form-schema** | tampilkan syarat + validasi gambar per store; blokir/warn sebelum simpan ([`04`](04-step2-editing-and-derivatives.md)) |
| **Publish Diagnostics / analyze** | warning bila gambar master tak memenuhi spec channel (mis. terlalu kecil, > maxCount) |
| **Derivative selection** | pilih/produksi derivative sesuai `minWidth`/`maxBytes`/format channel ([`02`](02-recommended-architecture.md) §4) |
| **Publish pre-flight** | tolak/peringatkan sebelum kirim (mis. jumlah > maxCount → potong; format tak didukung → convert) |
| **finalize/async worker** | validasi penuh saat upload (butuh bytes/dimensi) |

## 4. Perilaku validasi (observe-first)

- **Warning-dulu, bukan blocking** (selaras dengan pola versioning staleness): fase awal hanya
  melaporkan pelanggaran (`ImageIssue { severity, code, message, url }`) di Step-2 + analyze.
- Blocking/auto-fix (potong ke maxCount, convert format, resize ke minWidth) menyusul setelah data spec
  matang & terverifikasi.
- **Data-driven end-to-end:** menambah/mengubah aturan channel = update dokumen `channel_image_specs`,
  tanpa sentuh kode.

## 5. Kaitan dengan channel-side upload

`channelSideUpload=true` (Shopee/TikTok) berarti channel menarik gambar dari **URL publik** kita
(sync-service mengunggah). Implikasi spec:
- URL yang diserahkan **wajib publicly fetchable** (bukan presigned sementara) — lihat
  [`02`](02-recommended-architecture.md) §3.
- Derivative yang dipilih untuk channel itu harus sudah tersedia di URL publik saat publish.
- Untuk channel yang menerima URL langsung (Shopify pakai `src`), derivative/CDN URL cukup — tak ada
  langkah upload channel-side.
