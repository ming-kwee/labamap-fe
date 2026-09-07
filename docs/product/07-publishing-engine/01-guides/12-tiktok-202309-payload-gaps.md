# TikTok Shop 202309 — analisis payload sukses & perbaikan (product → variants)

Basis: `src/main/resources/json/tiktok_create_product_e2e_payload.json` — request **sync-service** yang
**sudah sukses** hit ke webclient (kategori kaus kaki, `category_id=841736`, region IDR). File itu
**berisi secret** (token, shop_cipher, partner secret) → **gitignored, jangan commit**.

Ini ground-truth 202309 yang menuntaskan item `VERIFY-202309` di
[`11-tiktok-202309-schema.md`](11-tiktok-202309-schema.md).

## 0. Bentuk payload (sync-service, bukan body TikTok mentah)

Backend menghasilkan struktur perantara; sync-service merakit body TikTok dari sini memakai
`servflow#data_structure#info` = `{"product":"", "variants":"skus", "options":""}` (body flat, tiap
`variantGroups[].channelVariant` → satu elemen `skus[]`).

| Bagian | Isi |
|---|---|
| `channelAttributes[]` | field **product-level** — `{attrId, chnlAttrName, chnlAttrType, chnlAttrValue, isSupportField?}` |
| `variantGroups[].channelVariant[]` | field **per-SKU** — `{vrntId, chnlVrntName, chnlVrntValue, chnlVrntType}` |
| `metadataGroups[].channelMetadata[]` | workaction (`create_CP_Media_Pre`, `create_CP_Variants_Media_Pre`, `create_CP`) + servflow |
| `channelCredentials[]` | token / client_id / shop_cipher / version |

`chnlAttrValue` selalu **string** (objek/array di-JSON-string-kan), `chnlAttrType` menandai bentuk
aslinya (`string` / `object` / `object[]`).

## 1. Product level — gap & perbaikan

Field pada payload sukses (`channelAttributes`):

| # | chnlAttrName | type | contoh value | status di kode kita |
|---|---|---|---|---|
| 1 | `version` | string | `202309` (support) | ❌ belum — **tambah** support field |
| 2 | `id` | string | UUID produk (support) | ➖ internal sync-service |
| 3 | `product_id` | string | `""` (support, write-back) | ✅ ada (write-back `data.product_id` di `create_CP`) |
| 4 | `title` | string | "Classic's Try 17-05…" | ✅ |
| 5 | `description` | string | HTML `<p>…</p><ul>…` | ✅ |
| 6 | `category_id` | string | `841736` | ✅ |
| 7 | `category_version` | string | `v2` | ❌ belum — **tambah** |
| 8 | `package_weight` | object | `{"unit":"KILOGRAM","value":"1.32"}` | ✅ bentuk objek; `value` **string** |
| 9 | `main_images` | object[] | `[{"uri":…},{"uri":…}]` | ✅ |

**Yang payload sukses TIDAK punya** (tapi kita terlanjur tambahkan di `createTiktokshopApiSchema`):
`save_mode`, `brand_id`, `package_dimensions`, `is_cod_allowed`, `size_chart`, `product_attributes`,
dan di SKU: `seller_sku`, `identifier_code`, `external_sku_id`.

→ **Perbaikan:** ramping-kan `apiSchema` ke bentuk yang benar-benar dipakai. `save_mode` **dihapus**
(create sukses tanpa itu). `brand_id`/`package_dimensions`/`is_cod_allowed`/`size_chart` = opsional
murni → keluarkan dari default (boleh balik sebagai opsional per-kategori bila dibutuhkan).
`product_attributes` = **kondisional per-kategori** (lihat §5), bukan selalu ada.

## 2. Variant level (`variantGroups[].channelVariant`)

Tiap SKU pada payload sukses hanya 3 field:

| chnlVrntName | type | contoh |
|---|---|---|
| `skus.inventory` | object[] | `[{"quantity":9999,"warehouse_id":"7458225482239788806"}]` |
| `skus.price` | object | `{"amount":"100000","currency":"IDR"}` |
| `skus.sales_attributes` | object[] | `[{"name":"Color","value_name":"Red","sku_img":{"uri":…}},{"name":"Size","value_name":"S"}]` |

4 SKU = 2 warna (Red/Blue) × 2 ukuran (S/M). `amount` **string**, `currency` = **IDR** (per-region).

**Gap terbesar — `sales_attributes`:** payload sukses memakai **`{name, value_name, sku_img?}`** —
**bukan** `{id, value_id, custom_value}`. Jadi:

- `name` = **nama axis ber-kapital** (`Color`, `Size`) — bukan `attribute_id`.
- `value_name` = **label nilai** (`Red`, `S`) — bukan `value_id`.
- `sku_img:{uri}` **hanya** pada axis yang punya gambar (di sini `Color`), tidak pada `Size`.
- **Tidak ada** `value_id`/`attribute_id` sama sekali → **translasi value_id TIDAK diperlukan** untuk
  TikTok (berbeda dari Shopee). TikTok me-resolve dari nama.

Pipeline kita saat ini (`BUILD_SALES_ATTRIBUTES` → `{id/attribute_id:"", value_id:"", custom_value,
_dim}` + `VariantValueTranslationService`) **salah bentuk** untuk TikTok.

**Gap lain:**
- `warehouse_id` harus **id gudang nyata** (`7458225482239788806`) → dari **GetWarehouses** (capability,
  `keySource=SHOP_ID`), bukan `""` seperti `BUILD_STOCK_INFOS` sekarang.
- `sku_img` **nested di dalam** `sales_attributes[].sku_img.uri`, bukan `skus.sku_img` top-level →
  rule `transform-sku-images` kita salah tempat.
- Tak ada `seller_sku` → keluarkan dari default (opsional).

## 3. Media pre-upload (dari `metadataGroups`)

| workaction | fungsi |
|---|---|
| `create_CP_Media_Pre` | upload `main_images` (Base64) → tulis balik `data.uri` ke `main_images[*].uri` |
| `create_CP_Variants_Media_Pre` | upload `sales_attributes.sku_img` → tulis balik ke `skus.sales_attributes[*].sku_img.uri`, **di-match by** `name` + `value_name` |
| `create_CP` | `POST /product/202309/products`, HMAC(`app_key,shop_cipher,timestamp`, includeBody), tulis balik `data.product_id` → `product_id` |

Artinya `uri` pada `main_images`/`sku_img` **berasal dari langkah upload**, bukan URL sumber langsung.
Pipeline hanya perlu **stage URL sumber**; workaction yang meng-upload + men-substitusi `uri`.

## 4. Langkah perbaikan (berurutan)

1. ✅ **`sales_attributes` → `{name, value_name}`** — `BUILD_SALES_ATTRIBUTES` mode nama (`nameKey`/
   `valueNameKey`/`nameMap`), tanpa `id`/`value_id`/`custom_value`/`_dim`; `variantValueTranslation=false`
   untuk TikTok; override attribute-mapping lama (`SALES_ATTRIBUTE_PAIRS`) dihapus → auto-enumerasi.
2. ✅ **Ramping-kan `apiSchema`** — `save_mode`, `brand_id`, `package_dimensions`, `is_cod_allowed`,
   `size_chart`, `seller_sku`, `identifier_code`, `external_sku_id` dihapus; `product_attributes` tetap
   sebagai slot kondisional per-kategori. `save_mode`/`brand_id` juga dilepas dari post-processing + JOLT seed.
3. ✅ **Support field** `version=202309` (isSupportField) + `category_version=v2` (body) via
   `set-product-defaults` `SET_FIELD` + mapping `version → auth_version`.
4. ⏳ **`warehouse_id` dari GetWarehouses** (seed `channel_capability_operations` TikTok, `keySource=SHOP_ID`,
   `stagingKey=_resolvedWarehouse`) — pola sama seperti Shopee.
5. ✅ **`sku_img` nested** ke dalam `sales_attributes` (bff-v16 + sync temp-v2) — build 6-bagian: op
   `BUILD_VARIANT_IMAGE_UPLOAD` → rule `tiktok-build-sku-image-upload` → variant fields
   `skus@sku_img_upload`/`skus@sku_img` → workaction `create_/update_CP_Variants_Media_Pre` → generic
   `body-reshape-to.relocate` spec → primitif generik `Create_CP.applyRelocate` (tanpa literal field/channel).
   Lihat **guide 38**. (Rule lama `transform-sku-images` diganti.) **Perlu live-verify** dgn produk yg tiap
   SKU-nya bergambar.
6. ⏳ **Currency/region-driven** (`IDR` untuk pasar ID) — sekarang masih default `USD`.

Tiap langkah data-driven (post-processing + capability + metadata), **tanpa** menaruh support-field ke
`apiSchema` create-body — sesuai CLAUDE.md. Diverifikasi `TikTok202309PipelineTest` (rule loader asli →
engine asli → asersi body 202309).

## 5. Tanya-jawab: bagaimana sistem tahu field mana yang mandatory? Query ke channel?

**Dua lapis:**

1. **Field dasar/umum (dari spec, bukan query).** `title`, `description`, `category_id`,
   `category_version`, `package_weight`, `main_images`, dan per-SKU `price`/`inventory`/
   `sales_attributes` adalah wajib menurut **spesifikasi API** — di-encode di `apiSchema` +
   `ChannelConfiguration.categoryRequirements` / required field-mappings. Tidak perlu tanya channel.

2. **Atribut spesifik-kategori (WAJIB query ke channel).** Apakah kategori butuh `product_attributes`
   tertentu (mis. "Material", "Bahan") dan mana yang **wajib** → **di-query ke TikTok**:
   `GET /product/202309/categories/{category_id}/attributes` (mengembalikan tiap atribut + flag
   `is_required`). Ini **pola capability-resolution yang sama** dengan Shopee `GetAttributeTree` —
   lewat `channel_capability_operations` (+ cache `channel_capability_cache`) dan **preflight** sebelum
   `create_CP`. Kategori kaus kaki (`841736`) pada contoh ini kebetulan **tak** mewajibkan atribut
   apa pun → `product_attributes` absen di payload.

**Ringkas:** field dasar diketahui dari **spec** (tak perlu query); kewajiban atribut **per-kategori**
diketahui dengan **query ke channel** (GetAttributes 202309) via capability layer — persis seperti
Shopee. Lihat [`09-channel-capability-resolution.md`](09-channel-capability-resolution.md).

## 6. Referensi
- [`11-tiktok-202309-schema.md`](11-tiktok-202309-schema.md) — migrasi apiSchema + pipeline 202309.
- [`10-shopee-add-item-payload-gaps.md`](10-shopee-add-item-payload-gaps.md) — pola analisis yang sama (Shopee).
- [`09-channel-capability-resolution.md`](09-channel-capability-resolution.md) — GetAttributes/GetWarehouses via capability.
- `src/main/resources/json/tiktok_create_product_e2e_payload.json` (gitignored) — payload sukses acuan.
