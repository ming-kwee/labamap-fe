# Shopee variantGroups — Penjelasan Perlahan

> **Status: ✅ SUDAH DIIMPLEMENTASI (2026-07-21).** Keempat perubahan di bawah (Perubahan 1, 2a,
> 2b, 4) + field kondisional `skus@image` sudah masuk kode dan lolos kompilasi. Aktif setelah
> backend di-restart (seeder meng-upsert rules/mappings, engine ter-recompile). Bagian 4
> ("Apa yang terjadi SEKARANG") menggambarkan keadaan **sebelum** fix — disimpan sebagai catatan
> diagnosis, bukan keadaan terkini.

Dokumen ini menjelaskan, langkah demi langkah, **kenapa payload `variantGroups` untuk
Shopee dulu kosong**, dan **konfigurasi apa yang diubah** supaya menghasilkan payload yang
dibutuhkan `init_tier_variation` dan `add_model`.

Ditulis untuk dibaca perlahan. Kita pakai satu contoh konkret dari awal sampai akhir.

---

## 1. Apa yang kita mau (target)

Kita mau backend mengirim, per SKU, sebuah `variantGroups` seperti ini:

```
variantGroups {                                        // SKU 1: red-s
  channelVariant { chnlVrntName:"skus.model_sku",      chnlVrntValue:"red-s",            chnlVrntType:"string"   }
  channelVariant { chnlVrntName:"skus.tier_index",     chnlVrntValue:"[0,0]",            chnlVrntType:"object[]" }
  channelVariant { chnlVrntName:"skus.original_price", chnlVrntValue:"100000",           chnlVrntType:"number"   }
  channelVariant { chnlVrntName:"skus.normal_stock",   chnlVrntValue:"10",               chnlVrntType:"number"   }
  channelVariant { chnlVrntName:"skus.seller_stock",   chnlVrntValue:"[{\"stock\":10}]", chnlVrntType:"object[]" }
  channelVariant { chnlVrntName:"skus.model_id",       chnlVrntValue:"", isSupportField:true, chnlVrntType:"string" }  // penampung
}
variantGroups { ... SKU 2: red-m [0,1] ... }
variantGroups { ... SKU 3: blue-s [1,0] ... }
variantGroups { ... SKU 4: blue-m [1,1] ... }
```

Perhatikan **dua hal yang membedakan dari draf lama**:

- **Semua `chnlVrntName` berprefix `skus.`** (bukan `model_sku` polos, bukan `model.model_sku`).
  Prefix ini **wajib** karena sync-service me-reshape varian dengan `from:"skus"` — jadi tiap
  field harus bernama `skus.<field>` agar terbaca. Tidak ada wrapper `model` di dalamnya.
- Ada field **`skus.seller_stock`** bertipe `object[]` berisi `[{stock:N}]` (stok per lokasi
  gudang; di sini satu lokasi = `[{stock:10}]`), di samping `normal_stock`.

Arti tiap baris:

| istilah          | arti                                                                                                 |
|------------------|------------------------------------------------------------------------------------------------------|
| `variantGroups`  | satu grup = **satu SKU** (satu kombinasi varian)                                                     |
| `channelVariant` | satu **field** di dalam SKU itu                                                                      |
| `chnlVrntName`   | `skus.<field>` — prefix `skus.` wajib agar cocok reshape `from:"skus"` di sync-service               |
| `chnlVrntValue`  | nilai field (selalu string; `chnlVrntType` memberi tahu tipe aslinya)                                |
| `chnlVrntType`   | petunjuk tipe: `string`, `number`, `object[]`, dst.                                                  |
| `isSupportField` | `true` = field bantu, bukan data user. `model_id` kosong = penampung `model_id` dari response Shopee |

`model_id` sengaja dikirim **kosong** karena akan **diisi** oleh response Shopee setelah
`init_tier_variation`/`add_model` berhasil (lihat `updatePaths` di metadata `create_CP_Variants`).

---

## 2. Contoh produk yang kita pakai

Kaos, 2 warna × 2 ukuran = **4 SKU**. Di master, tiap varian kira-kira begini:

```
variants: [
  { sku:"red-s",  color:"red",  size:"S", price:100000, inventory:10 },
  { sku:"red-m",  color:"red",  size:"M", price:100000, inventory:8  },
  { sku:"blue-s", color:"blue", size:"S", price:110000, inventory:5  },
  { sku:"blue-m", color:"blue", size:"M", price:110000, inventory:3  }
]
```

Perhatikan: master **tidak** punya field `model_sku`, `tier_index`, `normal_stock`,
`original_price`, atau `model_id`. Yang ada `sku`, `color`, `size`, `price`, `inventory`.
Nanti itulah yang harus dibentuk oleh pipeline.

Apa itu `tier_index`? Shopee tidak menyimpan "red"/"S" sebagai teks di tiap SKU. Ia
menyimpan **posisi (index)** pada daftar axis. Dari 4 varian:

- axis 1 `color`, urutan unik: `["red", "blue"]` → red=0, blue=1
- axis 2 `size`, urutan unik: `["S", "M"]` → S=0, M=1

Maka:

| SKU | color idx | size idx | tier_index |
|---|---|---|---|
| red-s  | 0 | 0 | `[0,0]` |
| red-m  | 0 | 1 | `[0,1]` |
| blue-s | 1 | 0 | `[1,0]` |
| blue-m | 1 | 1 | `[1,1]` |

---

## 3. Peta besar pipeline (jalur data)

Data melewati 3 tahap sebelum jadi payload:

```
master data
   │
   ▼  (1) JOLT transform          → mengubah bentuk sesuai channel
   │
   ▼  (2) Post-processing rules   → membangun/merapikan field (BUILD_MODEL, dll.)
   │
   ▼  (3) Konversi ke sync payload → buildChannelAttributes + buildVariantGroups
   │
   ▼
payload (channelAttributes + variantGroups + metadataGroups)
```

Yang penting untuk varian:

- **`buildVariantGroups`** (tahap 3) adalah yang membuat `variantGroups`. Ia **hanya**
  membaca satu tempat: field bernama **`variants`** di data hasil olahan.
- Kalau `variants` **tidak ada** di tahap 3 → `variantGroups` **kosong**.

---

## 4. Apa yang terjadi SEKARANG (dan kenapa kosong)

Urutan post-processing Shopee saat ini (angka = `priority`, makin kecil makin dulu):

```
prio 10  BUILD_TIER_VARIATION   variants → tier_variation      (bangun daftar axis)
prio 15  build-image-url-list   _sourceImages → images...      (gambar; tak relevan di sini)
prio 20  BUILD_MODEL            variants → model               (bangun model[])
prio 30  attribute_list ...     (tak relevan)
prio 99  REMOVE_PATH variants   variants → DIHAPUS
```

Mari ikuti datanya:

**Setelah JOLT:** ada `variants` (4 objek berisi color/size/sku/price/inventory).

**Setelah `BUILD_TIER_VARIATION` (prio 10):** lahir field baru `tier_variation`:
```
tier_variation: [
  { name:"Color", option_list:[{option:"red"},{option:"blue"}] },
  { name:"Size",  option_list:[{option:"S"},{option:"M"}] }
]
```
`variants` **belum berubah**.

**Setelah `BUILD_MODEL` (prio 20):** lahir field baru `model` (target-nya `model`):
```
model: [
  { tier_index:[0,0], normal_stock:10, original_price:100000.0, model_sku:"red-s" },
  { tier_index:[0,1], normal_stock:8,  original_price:100000.0, model_sku:"red-m" },
  ...
]
```
`variants` **masih ada** (belum dihapus).

**Setelah cleanup `REMOVE_PATH variants` (prio 99):** `variants` **DIHAPUS**.

**Masuk tahap 3 (konversi):**
- `buildVariantGroups` cari `variants` → **tidak ada** (sudah dihapus) → **variantGroups KOSONG.**
- `model` dan `tier_variation` malah jadi **atribut produk** (masuk `channelAttributes`),
  karena `buildChannelAttributes` meng-auto-enumerate field top-level. Inilah yang dipakai
  `add_item` selama ini.

### Kesimpulan diagnosa

Ada **tiga** sebab payload varian yang kita mau tidak muncul:

1. **`variants` dihapus** oleh rule cleanup → `buildVariantGroups` tak dapat apa-apa.
2. Data model malah masuk ke field **`model`** (jadi atribut produk), bukan `variants`.
3. Mapping `variantFields` yang ada sekarang (`model@model_sku`, dst.) adalah **konfigurasi
   mati** — tak pernah jalan, karena `variants` sudah keburu hilang sebelum tahap 3.

---

## 5. Bagaimana `buildVariantGroups` membentuk tiap `channelVariant`

Supaya paham perbaikannya, penting mengerti aturan mainnya. Untuk **tiap** objek di list
`variants`, `buildVariantGroups` melihat map konfigurasi `variantFields`. Tiap entri map:

```
key  →  { vrntId, chnlVrntType, isSupportField }
```

Prosesnya untuk tiap entri:

1. `chnlVrntName` = `key` dengan `@` diganti `.` (MongoDB tak mengizinkan `.` di key map)
   (contoh key `skus@model_sku` → `skus.model_sku`)
2. `fieldName` = potongan terakhir dari `chnlVrntName`
   (contoh `skus.model_sku` → `model_sku`)
3. `value` = `variant.get(fieldName)` (ambil nilai field itu dari objek variant)
4. **Kalau `value` null → dilewati** (tidak di-emit)
5. Kalau ada → emit `channelVariant { chnlVrntName, chnlVrntValue=value, chnlVrntType, isSupportField }`

Tiga akibat penting dari aturan ini:

- **Nama key menentukan `chnlVrntName`.** Kalau mau `chnlVrntName:"skus.model_sku"` (berprefix),
  maka **key-nya harus `skus@model_sku`**. Prefix `skus.` inilah yang dituntut target — bukan
  key polos `model_sku`, bukan `model@model_sku`.
- **`fieldName` tetap segmen terakhir.** Meski key-nya `skus@model_sku`, nilai tetap diambil dari
  `variant.get("model_sku")` — jadi objek variant cukup punya field polos `model_sku` (bukan `skus.model_sku`).
- **Field harus benar-benar ada di objek `variant`.** Kalau objek variant tidak punya field
  `model_id`/`seller_stock`, maka field itu tak akan pernah muncul — makanya kita harus mengisinya.
  Sebaliknya, field yang **ada** tapi **tak terdaftar** di `variantFields` akan tetap keluar lewat
  Pass 2 passthrough dengan prefix salah `product.variants.<field>` — jadi daftarkan **semua** field.

---

## 6. Perbaikan — empat perubahan, satu per satu

Ide inti: **jadikan `variants` itu sendiri berisi objek model**, jangan buang, lalu petakan
dengan key **berprefix `skus@`** (yang jadi `chnlVrntName` `skus.<field>`).

### Perubahan 1 — `BUILD_MODEL` menulis ke `variants` (bukan `model`)

Di `createShopeePostProcessingRules`, ubah `targetPath` rule `BUILD_MODEL` dari `model`
menjadi `variants`.

- **Sebelum:** `variants` (color/size/…) → dibiarkan; hasil model ditaruh di `model`.
- **Sesudah:** `variants` **ditimpa** dengan hasil model.

Setelah ini isi `variants` menjadi:
```
variants: [
  { tier_index:[0,0], normal_stock:10, original_price:100000.0, model_sku:"red-s" },
  { tier_index:[0,1], normal_stock:8,  original_price:100000.0, model_sku:"red-m" },
  ...
]
```
Nama field-nya (`tier_index`, `normal_stock`, `original_price`, `model_sku`) sudah **persis**
yang kita mau. Aman secara urutan: `BUILD_TIER_VARIATION` (prio 10) sudah selesai membaca
color/size sebelum `BUILD_MODEL` (prio 20) menimpa `variants`.

### Perubahan 2 — lengkapi dua field yang belum dibuat: `seller_stock` dan `model_id`

Target butuh dua field yang **tidak** dihasilkan `BUILD_MODEL`. Karena `buildVariantGroups`
melewati field yang `null` (dan yang tak ada di objek), keduanya harus benar-benar ada di tiap
objek `variants`.

**(a) `seller_stock = [{stock:N}]`** — stok per lokasi, `object[]`. Nilainya diturunkan dari
`normal_stock`. Ini **satu-satunya perubahan kode runtime** (engine): perluas `executeBuildModel`
agar tiap model juga meng-emit `seller_stock` = `[{ "stock": normal_stock }]`. (Op `BUILD_STOCK_INFOS`
yang ada berbentuk `[{warehouse_id, available_stock}]` — beda bentuk, jadi tak dipakai di sini.)

**(b) `model_id = ""`** — penampung, `string`, `isSupportField:true`. Cukup data/seed: tambahkan
rule `FOR_EACH` atas `variants` (prio 25) yang menyetel default `model_id` = `""`:

```
FOR_EACH variants: SET_DEFAULT model_id = ""
```

Sekarang tiap objek variant punya 6 field: `tier_index`, `normal_stock`, `original_price`,
`model_sku`, `seller_stock`, `model_id`.

### Perubahan 3 — hapus rule cleanup `REMOVE_PATH variants`

Karena sekarang `variants` justru **data final** kita, jangan dihapus. Buang rule cleanup
(prio 99). Field lama color/size otomatis hilang karena `BUILD_MODEL` **menimpa seluruh**
list `variants` dengan objek model (tak ada sisa color/size). Dan `buildChannelAttributes`
memang **melewati** key `variants`, jadi ia tak akan bocor jadi atribut produk.

### Perubahan 4 — tulis ulang `variantFields` dengan key berprefix `skus@`

Di `buildShopeeAttributeMappings`, ganti key `model@…` menjadi key `skus@…`. Ingat aturan Bagian 5:
`chnlVrntName` = key (`@`→`.`), tapi `fieldName` (untuk ambil nilai) = **segmen terakhir** — jadi
prefix `skus@` hanya membentuk nama, nilai tetap diambil dari field polos di objek variant.

| key (= chnlVrntName) | fieldName dibaca | vrntId | chnlVrntType | isSupportField |
|---|---|---|---|---|
| `skus@model_sku`      | `model_sku`      | channel_variant_sku         | `string`   | false |
| `skus@tier_index`     | `tier_index`     | channel_variant_tier_index  | `object[]` | false |
| `skus@original_price` | `original_price` | channel_variant_price       | `number`   | false |
| `skus@normal_stock`   | `normal_stock`   | channel_variant_stock       | `number`   | false |
| `skus@seller_stock`   | `seller_stock`   | channel_variant_seller_stock| `object[]` | false |
| `skus@model_id`       | `model_id`       | channel_variant_model_id    | `string`   | **true** |
| `skus@image`          | `image`          | channel_variant_images      | `object`   | **true** |

(Catatan: mapping lama memakai `number[]` untuk tier_index — kita ubah ke `object[]` sesuai
target. Daftarkan **semua** field yang mungkin dihasilkan `BUILD_MODEL`: yang tak terdaftar tapi
ada di objek variant akan bocor lewat Pass 2 passthrough dengan prefix salah
`product.variants.<field>`. `skus@image` adalah field **kondisional** — hanya muncul saat varian
punya `variantImages` (`BUILD_MODEL` emit `image:{image_id:...}`); untuk produk tanpa gambar
varian, field ini absen dan tak di-emit. Enam field inti selalu ada; `image` opsional.)

---

## 7. Hasil akhir — data mengalir menjadi payload target

Ambil SKU pertama, `variants[0]` sesudah semua perubahan:
```
{ tier_index:[0,0], normal_stock:10, original_price:100000.0,
  model_sku:"red-s", seller_stock:[{stock:10}], model_id:"" }
```

`buildVariantGroups` memproses tiap entri `variantFields` (key → chnlVrntName, `fieldName` =
segmen terakhir):

| key | fieldName | value diambil | chnlVrntName | chnlVrntValue | chnlVrntType | isSupportField |
|---|---|---|---|---|---|---|
| `skus@model_sku`      | model_sku      | "red-s"       | `skus.model_sku`      | `"red-s"`           | string   | false |
| `skus@tier_index`     | tier_index     | [0,0] (List)  | `skus.tier_index`     | `"[0,0]"`           | object[] | false |
| `skus@original_price` | original_price | 100000.0      | `skus.original_price` | `"100000.0"`        | number   | false |
| `skus@normal_stock`   | normal_stock   | 10            | `skus.normal_stock`   | `"10"`              | number   | false |
| `skus@seller_stock`   | seller_stock   | [{stock:10}]  | `skus.seller_stock`   | `"[{\"stock\":10}]"`| object[] | false |
| `skus@model_id`       | model_id       | "" (kosong)   | `skus.model_id`       | `""`                | string   | **true** |

Menghasilkan **tepat** `variantGroups` yang kita mau (lihat bagian 1), untuk keempat SKU.

---

## 8. Dua hal yang harus Anda ketahui (konsekuensi)

### (a) `add_item` kehilangan `model[]` di body-nya

Setelah Perubahan 1, tak ada lagi field `model` di tingkat produk → body `add_item` tak lagi
membawa `model`. Ini **benar** untuk alur 2-langkah Shopee: `add_item` membuat produk dasar,
lalu `init_tier_variation`/`add_model` yang membuat modelnya (via `variantGroups`).
`tier_variation` **tetap** jadi atribut produk (tidak berubah).

➡️ **Perlu konfirmasi:** apakah `add_item` Anda yang "sudah berhasil" bergantung pada `model`
di body-nya? Kalau ya, kita perlu strategi mempertahankan keduanya.

### (b) `original_price` bisa keluar `"100000.0"` (bukan `"100000"`)

`BUILD_MODEL` memakai `price.doubleValue()` → `Double`, jadi `String.valueOf` → `"100000.0"`.
Karena `chnlVrntType:"number"`, sync-service tetap mem-parsing jadi 100000, **tetapi** kalau
Shopee ketat soal trailing `.0`, perlu langkah format harga. (Sudah ada catatan "Rule 3"
soal ini di komentar kode.)

---

## 9. Ringkasan berkas yang diubah

| Berkas | Jenis | Perubahan |
|---|---|---|
| `ChannelConfigurationDataLoader.createShopeePostProcessingRules` | seed | (1) `BUILD_MODEL` targetPath `model`→`variants`; (2b) rule baru `FOR_EACH` set `model_id=""`; (3) hapus rule cleanup `REMOVE_PATH variants` |
| `GenericPostProcessingEngine.executeBuildModel` | **runtime** | (2a) tiap model juga emit `seller_stock=[{stock:normal_stock}]` |
| `ChannelAttributeMappingsMigration.buildShopeeAttributeMappings` | seed | (4) `variantFields` pakai key `skus@…` + tambah `seller_stock`/`model_id` + tipe sesuai tabel bagian 6 |

Mayoritas di **seeder/migration**; hanya **satu** perubahan kode runtime — `executeBuildModel`
menambah `seller_stock` (Perubahan 2a). `buildVariantGroups` **tidak** diubah: ia sudah membaca
`skus.<field>` verbatim dari key `variantFields`, kita hanya menyediakan datanya. Semua aktif
setelah backend di-restart (seed di-upsert ulang, engine ter-recompile).
