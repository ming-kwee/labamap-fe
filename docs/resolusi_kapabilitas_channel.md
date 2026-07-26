# Resolusi Kapabilitas Channel (Shopee) — Dokumen Desain

Dokumen ini menjelaskan **mengapa** payload produk tidak dapat dibangun murni dari data internal, dan
**bagaimana** sistem harus menanyakan Shopee lebih dulu untuk melengkapi field dinamis. Fokus pada pemetaan
field → sumber → pemicu refresh, sebagai dasar merancang lapisan *channel capability resolution*.

> Pelengkap dari [`init_tier_variation_dan_model.md`](./init_tier_variation_dan_model.md). Dokumen itu membahas
> perakitan varian; dokumen ini membahas **dari mana nilai field berasal**.

---

## Daftar Isi
1. [Masalah inti](#1-masalah-inti)
2. [Tiga sumber data field](#2-tiga-sumber-data-field)
3. [Katalog field dinamis](#3-katalog-field-dinamis)
4. [Endpoint resolusi](#4-endpoint-resolusi)
5. [Kapan me-resolve & invalidasi cache](#5-kapan-me-resolve--invalidasi-cache)
6. [Titik integrasi: pemetaan nilai internal → value_id](#6-pemetaan-nilai)
7. [Posisi dalam alur workflow](#7-posisi-dalam-alur-workflow)
8. [Status verifikasi](#8-status-verifikasi)
9. [Rekomendasi implementasi bertahap](#9-rekomendasi-implementasi-bertahap)
10. [Referensi endpoint](#10-referensi-endpoint)

---

## 1. Masalah inti

Saat membangun `add_item`, sejumlah field **wajib** tetapi nilainya **hanya diketahui Shopee**, bukan dari
katalog produk internal. Contoh nyata yang kita temui berurutan (tiap baris = satu kali gagal lalu diperbaiki):

```
error_invalid_brand      -> "brand is required when category change"   (brand terikat kategori)
error_busi seller_stock  -> stok item-level wajib
error_busi (price/weight/logistic/dimension) wajib
classification.attribute.mandatory -> Material & Pattern wajib (value_id kategori)
logistics.no.valid.channel          -> logistic_id harus channel yg enabled di toko
```

Kesimpulan: **payload yang valid = data produk internal + kapabilitas channel yang di-resolve dari Shopee.**
Tanpa lapisan resolusi, integrasi akan gagal berulang setiap ganti kategori atau toko.

---

## 2. Tiga sumber data field

Setiap field di body Shopee jatuh ke salah satu dari tiga sumber:

| Sumber | Di-*key* oleh | Sifat | Contoh field |
|---|---|---|---|
| **A. Data produk/seller** | — (internal) | statis per produk | `item_name`, `description`, `weight`, `dimension`, `original_price`, `seller_stock`, `condition`, `tier_variation`, `model_sku`, `tier_index` |
| **B. Kapabilitas kategori** | `category_id` | berubah saat kategori berganti | `attribute_list`, `brand`, `size_chart`, `gtin` (wajib/tidak) |
| **C. Kapabilitas toko** | `shop_id` | berubah saat setelan toko diubah | `logistic_info`, `seller_stock.location_id` (multi-gudang) |

> **Aturan emas:** field sumber **B** wajib di-resolve ulang saat `category_id` berubah; sumber **C** saat
> setelan toko berubah. Sumber **A** tidak pernah perlu memanggil Shopee.

---

## 3. Katalog field dinamis

Status "kemarin" = kondisi saat uji E2E sesi terakhir; "seharusnya" = perilaku produksi yang benar.

| Field | Sumber | Status kemarin | Seharusnya (produksi) | Endpoint |
|---|---|---|---|---|
| `attribute_list` | B (kategori) | ✅ di-resolve via probe (`value_id` 1221/1453) | resolve per kategori, map nilai→`value_id` | `product/get_attribute_tree` |
| `brand` | B (kategori) | ⚠️ ditebak `brand_id:0` (NoBrand) | ambil brand sah; sebagian kategori tolak NoBrand | `product/get_brand_list` |
| `size_chart` | B (kategori) | ⏭️ diabaikan (baru *warning*) | wajib utk sebagian kategori | `product/get_size_chart_list` |
| `gtin` | B (kategori) | ⏭️ diabaikan (baru *warning*) | wajib/tidak ditentukan kategori | `product/get_attribute_tree` (+ rekomendasi) |
| `logistic_info` | C (toko) | ✅ di-resolve via probe (81017) | pilih channel `enabled=true` | `logistics/get_channel_list` |
| `seller_stock.location_id` | C (toko) | `""` (toko 1 gudang) | wajib utk toko multi-gudang | `logistics/get_warehouse_detail` |
| `image` / `image_id` | A→upload | ✅ benar | upload → dapat `image_id` | `media_space/upload_image` |
| `category_id` | validasi | hardcode `300242` | dipetakan & divalidasi (hanya *leaf*) | `product/get_category` |
| `item_name`, `description`, `weight`, `dimension`, `original_price`, `seller_stock` (angka), `condition`, `currency`, `item_dangerous` | A | ✅ | data internal | — |
| `tier_variation`, `model_sku`, `tier_index` | A | ✅ | didefinisikan penjual | — |

---

## 4. Endpoint resolusi

### Terikat `category_id` (sumber B)
- **`product/get_attribute_tree`** — daftar atribut per kategori: `mandatory`, `input_type`, dan
  `attribute_value_list` (pasangan `value_id` ↔ `name`). **Fondasi** pembentukan `attribute_list`.
  - Catatan: `product/get_attributes` mengembalikan `api_suspended` pada partner sandbox ini; `get_attribute_tree`
    berfungsi. Endpoint yang tersedia bisa berbeda antar partner/versi — perlu deteksi/fallback.
- **`product/get_brand_list`** — brand sah per kategori + apakah NoBrand diizinkan.
- **`product/get_size_chart_list`** — size chart yang tersedia (bila kategori mewajibkan).

### Terikat `shop_id` (sumber C)
- **`logistics/get_channel_list`** — channel logistik + flag `enabled` (tanpa parameter kategori).
- **`logistics/get_warehouse_detail`** — daftar gudang/`location_id` untuk `seller_stock` multi-gudang.

### Struktur kategori (prasyarat)
- **`product/get_category`** — pohon kategori; hanya kategori *leaf* yang boleh dipakai listing.
- (opsional) **`product/category_recommend`** — saran kategori dari nama produk.

---

## 5. Kapan me-resolve & invalidasi cache

Hasil resolusi cocok di-cache karena jarang berubah, TAPI invalidasi harus benar:

| Data cache | Kunci cache | TTL disarankan | Invalidasi paksa saat |
|---|---|---|---|
| attribute_tree, brand_list, size_chart | `(channel, category_id, region)` | panjang (jam–hari) | **`category_id` produk berganti** |
| channel_list, warehouse | `(channel, shop_id)` | menengah (jam) | setelan toko/logistik diubah |
| category tree | `(channel, region)` | panjang | rilis kategori Shopee |

> Pemicu paling penting: **perubahan `category_id`**. Inilah akar error pertama kita
> (*"brand is required when category change"*). Setiap kali kategori berubah, seluruh field sumber B menjadi
> **stale** dan wajib di-resolve ulang sebelum kirim.

---

## 6. Pemetaan nilai

Titik integrasi yang paling sering terlewat: nilai atribut internal **bukan** yang dikirim ke Shopee —
yang dikirim adalah **`value_id`** hasil pemetaan dari `get_attribute_tree`.

```
Internal          get_attribute_tree(category)        Body add_item
"Material=Kulit"  ->  [S]Material(200134):            ->  attribute_list:[
                        {value_id:1221, name:Leather}       {attribute_id:200134,
                        ...                                   attribute_value_list:[{value_id:1221}]}]
```

Implikasi: butuh **tabel pemetaan** `(atribut internal, nilai internal) → (attribute_id, value_id)` per
kategori. Untuk atribut *free-text* (`input_type` tertentu), kirim `original_value_name` alih-alih `value_id`.
`get_attribute_tree` yang menentukan mana enumerasi vs free-text.

---

## 7. Posisi dalam alur workflow

Lapisan resolusi berjalan **sebelum** pembentukan body, sebagai enrichment yang meng-*hydrate* metadata/atribut:

```
[Data produk internal]
        │
        ▼
[RESOLUSI KAPABILITAS CHANNEL]   ← by category_id: attribute_tree, brand, size_chart
   (baru; cache + invalidasi)     ← by shop_id:     channel_list, warehouse
        │  (isi: attribute_list, brand, logistic_info, location_id, ...)
        ▼
[Bentuk body add_item]  ── add_item ──▶ Shopee
        ▼
[init_tier_variation]   (lihat dokumen varian)
        ▼
[media / update / complete]
```

Selaras dengan arsitektur **metadata-driven** yang ada: hasil resolusi mengisi nilai atribut (`channelAttributes`)
dan metadata, sementara *cara* memetakannya ke body tetap dari metadata `body-reshape-to` — kode Java tetap netral.

---

## 8. Status verifikasi

Jujur memisahkan yang terbukti vs yang diasumsikan:

| Klaim | Status |
|---|---|
| `attribute_list` terikat kategori (`get_attribute_tree` mengembalikan atribut+`value_id` per kategori 300242) | ✅ **terbukti** via `scripts/shopee_probe.py` |
| `logistic_info` terikat toko, bukan kategori (`get_channel_list` tanpa param kategori) | ✅ **terbukti** via probe |
| `brand` terikat kategori; NoBrand bisa ditolak sebagian kategori | ⚠️ **belum di-probe**; berdasarkan error `brand is required when category change` + dokumentasi |
| `size_chart` & `gtin` wajib utk sebagian kategori | ⚠️ berdasarkan *warning* respons `add_item` + dokumentasi |
| `location_id` wajib utk toko multi-gudang | ⚠️ dokumentasi; toko uji hanya 1 gudang |

Langkah verifikasi lanjutan: perluas `shopee_probe.py` dengan `get_brand_list` dan `get_size_chart_list`
(butuh access token live) untuk mengonfirmasi kategori 300242.

---

## 9. Rekomendasi implementasi bertahap

1. **Fase 1 — Resolver read-only + cache.** Bungkus endpoint sumber B & C dalam satu modul resolver dengan
   cache ber-kunci `(channel, category_id/shop_id, region)`. Belum ubah workflow; sediakan sebagai layanan.
2. **Fase 2 — Enrichment pra-kirim.** Sebelum `add_item`, isi `attribute_list`, `brand`, `logistic_info`,
   `location_id` dari resolver. Tambah tabel pemetaan nilai→`value_id`.
3. **Fase 3 — Invalidasi berbasis event.** Refresh cache sumber B saat `category_id` produk berubah; sumber C
   saat setelan toko berubah.
4. **Fase 4 — Validasi pra-terbang.** Deteksi field wajib yang belum lengkap (mis. size_chart/gtin untuk
   kategori tertentu) **sebelum** hit Shopee, agar gagal cepat dengan pesan jelas, bukan trial-and-error.

---

## 10. Referensi endpoint

| Endpoint | Kunci | Menghasilkan |
|---|---|---|
| `product/get_category` | region | pohon kategori (leaf-only untuk listing) |
| `product/get_attribute_tree` | category_id | atribut wajib + `value_id` |
| `product/get_brand_list` | category_id | brand sah (+ NoBrand?) |
| `product/get_size_chart_list` | category_id/shop | size chart tersedia |
| `logistics/get_channel_list` | shop_id | channel logistik + `enabled` |
| `logistics/get_warehouse_detail` | shop_id | `location_id` gudang |
| `media_space/upload_image` | — | `image_id` |

> Utilitas probe: `scripts/shopee_probe.py` (signature meniru app: base = `partner_id+PATH+timestamp+access_token+shop_id`,
> HMAC-SHA256 hex). Jalankan `python3 scripts/shopee_probe.py <access_token_live>`.
