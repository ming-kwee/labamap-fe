# Catatan Frontend — Variant Axis Cleanup & `material` jadi Product-Level

**Tanggal:** 2026-07-16 · **Backend commit:** `d4945fd` (branch `bff-v8`)
**Status kontrak:** ✅ **Tidak ada breaking change.** Tidak ada field ditambah/dihapus/di-rename di respons Step 1 maupun Step 2. Bentuk JSON identik. Hanya **nilai** yang berubah.

---

## TL;DR

1. **Warning axis palsu hilang.** Di Step 2, `axisValidation` tidak lagi memuat 3 warning `NOT_EXPRESSIBLE_ON_CHANNEL` untuk `variantImages`, `costPrice`, `inventory`. Itu memang keliru — field metadata per-SKU salah dianggap axis.
2. **`material` pindah dari kolom varian → field product-level.** Di Step 1, `material` tidak lagi jadi kolom di editor varian (dulu muncul sebagai kolom kosong ter-disable). Sekarang jadi dropdown product-level biasa.
3. **Aksi FE:** kemungkinan **tidak perlu perubahan kode** jika render sudah data-driven (baca `variantScope`/`section`/`variantDimensions` dari schema). **Wajib:** backend meng-clear cache form-schema agar perubahan ini muncul (lihat bawah).

---

## Perubahan 1 — Step 2: `axisValidation` lebih bersih

**Endpoint:** `POST /api/v1/ecommerce/form-schema/channel-step` (dan `GET .../category-attributes`)

- **Sebelum:** untuk produk yang variannya membawa `variantImages` / `costPrice` / `inventory` berbeda per-SKU, muncul 3 warning:
  > "shopify does not offer 'variantImages' as a variant option … SKUs differing only by variantImages may collide."
- **Sesudah:** warning-warning itu **tidak muncul lagi**. `variantAxes` tetap benar (mis. `[size, color]`).

**Dampak FE:** komponen yang menampilkan `axisValidation` cukup menampilkan apa adanya — sekarang isinya benar (lebih sedikit / kosong). Warning yang **sah** (mis. axis yang benar-benar tak didukung channel, atau matrix tidak lengkap) tetap muncul seperti biasa.

---

## Perubahan 2 — Step 1: `material` jadi product-level

**Endpoint:** `GET|POST /api/v1/ecommerce/form-schema/generate`

Field `material` berubah **nilai** (bukan bentuk):

| Properti | Sebelum | Sesudah |
|---|---|---|
| `variantScope` | `variant_only` | `product_only` |
| `group` | `variant` | `attribute` |
| `section` | `variants` | `product_info` |
| Muncul di metadata `variantDimensions`? | ya | **tidak** |
| `fieldType` / `options` | `SELECT` / 13 opsi | **sama** (tidak berubah) |

**Efek yang diharapkan di UI:**
- `material` **keluar** dari tabel editor varian (tidak lagi jadi kolom per-SKU / kolom-hantu disabled).
- `material` **masuk** ke section `product_info` sebagai dropdown product-level (13 opsi, editable).

**Kenapa berubah:** material adalah spesifikasi produk (mis. "kaos ini katun"), bukan sumbu yang membedakan SKU — sama seperti model Shopify sungguhan (fabric/material = atribut taksonomi product-level). Material **masih bisa** jadi axis untuk produk tertentu bila merchant mendeklarasikannya di `product_types.variantDimensions`; dalam hal itu ia otomatis muncul sebagai axis lewat mekanisme yang sudah ada.

**Aksi FE:**
- ✅ Jika editor varian membangun kolom dari `variantDimensions` / `variantScope=variant_only` → **tidak perlu perubahan**; material otomatis relokasi.
- ⚠️ Jika ada logika yang **meng-hardcode** `material` sebagai kolom varian → hapus/sesuaikan agar mengikuti `variantScope` dari schema.

> Catatan: perilaku `material` di **Step 2** (`categoryAttributeSection.requiredFields`) **tidak berubah** — ia tetap muncul sebagai required category attribute untuk clothing, karena itu berasal dari `categoryRequirements` (independen dari perubahan ini).

---

## ⚠️ Wajib: clear cache form-schema

Schema Step 1 **di-cache & dipersist per `productTypeId`**. Selama cache belum di-clear, endpoint masih menyajikan schema lama (material tetap kolom varian). Setelah migration backend berjalan, cache harus di-invalidasi:

- Per product-type: `DELETE /api/v1/ecommerce/form-schema/cache/product-type/{productTypeId}`
- Atau semua: `DELETE /api/v1/ecommerce/form-schema/cache`

Ini aksi **backend/ops**, bukan kode FE — tapi tim FE perlu tahu: kalau perubahan material belum kelihatan, kemungkinan cache belum di-clear.

---

## Checklist verifikasi FE

- [ ] Step 2: buat/buka produk dengan varian yang beda `variantImages`/`costPrice`/`inventory` → pastikan **tidak** ada lagi warning axis untuk ketiganya.
- [ ] Step 1 (setelah cache di-clear): `material` muncul di section product (bukan kolom varian), sebagai dropdown editable.
- [ ] Editor varian: kolom hanya axis nyata (mis. Size, Color) — tidak ada kolom `material` kosong ter-disable.
- [ ] Tidak ada error render akibat field hilang (seharusnya tidak ada — kontrak tak berubah).
