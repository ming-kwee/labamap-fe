# Mode B — Runbook E2E Shopee (sandbox)

> **Untuk operator.** Langkah menjalankan E2E Mode B ke **Shopee sandbox**, dari nol sampai verifikasi
> hapus/ubah/tambah variant. Ini **menulis ke channel sungguhan (sandbox)** dan **membalik flag** — jadi
> jalankan sadar & dengan rollback siap. Framework-nya sudah lengkap + teruji (lihat
> [`03-mode-b-per-model-buckets.md`](03-mode-b-per-model-buckets.md)); ini tinggal membuktikan di channel nyata.

---

## 0. Pra-syarat (sekali)

- Stack hidup: **BFF (port 8888)** + **sync Temporal (`:9000`)** + **MongoDB**.
- Env (IntelliJ run config / shell) terisi: `SHOPEE_PARTNER_KEY`, `SHOPEE_API_BASE_URL` (sandbox), DB URI,
  dan store Shopee sandbox terhubung (`partner_id`, `shop_id`, `access_token`).
- **Rebuild + restart** BFF **dan** sync setelah menarik commit DiffEngine (agar migration men-seed metadata
  Mode B & sync memuat filter/step baru).

## 1. Verifikasi seed masuk DB (nol tulis-channel)

Setelah boot, cek dokumen config Shopee memuat kontrak Mode B:

```js
db.channel_configurations.findOne(
  { channelId: "shopee" },
  { variantUpdateMode: 1, "channelMetadataList.key": 1 }
)
```
Harus ada: `variantUpdateMode: "PER_MODEL_BUCKETS"` dan key `update_CP_Variants`, `update_CP_Variants_Stock`,
`update_CP_Variants_Add`, `update_CP_Variants_Delete`, `idtracking#variants`.

> Kalau `isSystemDefault=false` (config sudah di-customise) migration **skip** → set `true` lalu restart,
> atau tambah item manual. Kalau ada `channel_api_contracts` untuk shopee → overlay bisa menimpa metadata:
> re-freeze kontrak atau lepas pin apiVersion store (lihat §7.2 doc utama / catatan overlay).

## 2. CREATE — bangun baseline + isi `variantChannelIds` (GERBANG P0)

Publish **CREATE** satu produk ber-variant (≥2 SKU) ke sandbox lewat alur normal (flag update masih OFF).
Lalu verifikasi round-trip id:

- Log sync: `captured N variant id(s) via idtracking#variants`.
- DB:
```js
db.channel_product_data.findOne(
  { masterProductId: "<id>", storeId: "<store>" },
  { variantChannelIds: 1, status: 1 }
)
```
`variantChannelIds` harus terisi `sku → model_id`. **Kalau kosong, STOP** — P0 belum nyambung; tak ada gunanya
lanjut (semua diff butuh peta ini). Cek: idtracking sampai? sku field match (`skus.model_sku`)?

## 3. Aktifkan UPDATE (flag)

```
app.publish.channel-update-enabled = true      (APP_PUBLISH_CHANNEL_UPDATE_ENABLED=true)
```
Restart/refresh BFF. Ini **satu-satunya** saklar yang membuka tulis-UPDATE ke channel. **Catat** nilai awal
untuk rollback.

## 4. Skenario uji (jalankan satu per satu; amati log sync + Shopee)

Baseline (dari §2) misal punya SKU **A, B, C**. Ubah `masterProductData` lalu **publish ulang** (UPDATE):

| # | Aksi | Ubah di master | Ekspektasi panggilan Shopee | Ekspektasi hasil |
|---|---|---|---|---|
| T1 | **Ubah harga** B | `B.original_price` beda | `update_price` (price_list: {B.model_id}) | harga B berubah di channel; A,C utuh |
| T2 | **Ubah stok** B | `B` seller_stock beda | `update_stock` (stock_list: {B.model_id, seller_stock}) | stok B berubah |
| T3 | **Tambah** D | tambah SKU D | `add_model` (model_list: D) → balas `model_id` | D muncul; `variantChannelIds` bertambah D |
| T4 | **Hapus** C | buang SKU C | `delete_model` ({item_id, C.model_id}) | C hilang; `variantChannelIds` C **drop** |
| T5 | **Campur** | hapus C, ubah B, tambah D | update_price/stock(B) → add_model(D) → delete_model(C) | urut update→add→delete; A utuh |

**Yang HARUS diamati di log sync** (urutan `update_price → update_stock → add_model → delete_model`):
- `[activity] createRestChannelProductVariants` → panggilan `update_price` hanya untuk variant **ber-model_id & bukan DELETE-marked**.
- `[activity] updateStockRestChannelProductVariants` → `update_stock` untuk set yang sama.
- `[activity] addRestChannelProductVariants` → `add_model` hanya untuk variant **tanpa model_id**.
- `[activity] deleteRestChannelProductVariants` → `delete_model` hanya untuk **DELETE-marked** (kalau tak ada marker → `SKIP (fail-safe)`).

**Cek keras (paling penting):** pada T4/T5 pastikan `delete_model` **hanya** dipanggil untuk `model_id` milik C —
**tidak** untuk A/B/D. Kalau ada `delete_model` menyasar variant yang dipertahankan → **STOP + flag OFF**, laporkan
(ini yang di-cover fail-safe + filter marker; kalau terjadi berarti ada mismatch field).

## 5. Verifikasi state pasca-UPDATE

```js
db.channel_product_data.findOne({masterProductId:"<id>",storeId:"<store>"}, {variantChannelIds:1})
```
- Setelah T3: memuat D. Setelah T4: **tanpa** C. Setelah T5: {A,B,D}, tanpa C.
- Di Shopee Seller Center sandbox: variant sesuai (harga/stok/ada-tidaknya).

## 6. NOOP (idempotensi)

Publish ulang **tanpa perubahan** → keputusan **NOOP** → **nol** panggilan channel. Log BFF:
`Publish NO-OP ... content unchanged`. Membuktikan diff tak mengirim yang tak berubah.

## 7. Rollback / selesai

- Kembalikan `app.publish.channel-update-enabled` ke nilai awal (**OFF** kalau belum siap produksi).
- UPDATE yang gagal bersifat **forward-only** (listing tetap live; tak menghapus produk) — aman, tapi bisa
  **partial**; baca `step_results` di poll untuk tahu step mana gagal, perbaiki, ulangi dgn eventId baru.

## 8. Batas yang diketahui (jangan diuji dulu)

- **Nilai opsi baru** (mis. warna baru) belum didukung penuh: `add_model` saja tak cukup, perlu
  `update_tier_variation` — belum di-seed. Uji hanya penambahan model dalam **struktur tier yang sudah ada**.
- **Gambar** (product & variant) belum masuk Mode B (image id round-trip belum ada). Fokus uji **variant**.
- **Body-reshape price/stock** diturunkan dari add_model verified + payload terkonfirmasi, tapi **belum**
  terverifikasi E2E — inilah yang runbook ini buktikan. Bandingkan body request aktual (log sync) dengan
  payload contoh Shopee sebelum menyatakan lolos.

## 9. Pre-flight otomatis (sudah hijau — konteks)

Sebelum langkah live, dua test membuktikan sisi-BFF benar tanpa channel:
- `ShopeeModeBBucketRoutingTest` — skenario A/B/C/D → bucket update/add/delete benar (routing).
- `ShopeeModeBSeedTest` — migration Shopee men-seed 4 workaction + endpoint benar + `diff-id-field` + `idtracking.op`.

Jalankan: `mvn -o test -Dtest=ShopeeModeBBucketRoutingTest,ShopeeModeBSeedTest`.
