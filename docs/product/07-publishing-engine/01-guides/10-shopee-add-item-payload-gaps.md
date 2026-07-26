# Shopee `add_item` — analisis payload sukses & perbaikan (product → variants)

Referensi kebenaran: **`src/main/resources/json/shopee_add_model_e2e_payload.json`** — payload
`channelAttributes` yang **sukses** hit sync-service (add_item + init_tier_variation + add_model).
Dokumen ini membandingkannya dengan yang **sistem kita hasilkan sekarang**, lalu memberi langkah
perbaikan dari **product level ke variants**.

> **Di mana payload ini dibentuk.** Sistem menghasilkan `channelAttributes` dari
> **`apiSchema` (bentuk) + JOLT (pemetaan master→body) + post-processing (rule)**. Jadi tiap perbaikan
> jatuh ke salah satu dari: `createShopeeApiSchema()`, `buildShopeeJoltSpec()`, atau sebuah
> post-processing rule di `createShopeePostProcessingRules()`.

---

## 1. Ringkasan gap (product level)

| Field payload sukses | Nilai sukses | Output kita sekarang | Status | Perbaikan |
|---|---|---|---|---|
| `seller_stock` (item-level) | `[{"stock": 26}]` | `normal_stock: N` (skalar) | ❌ **wajib, hilang** | tambah `seller_stock:[{stock}]` |
| `brand.original_brand_name` | `"NoBrand"` | `""` | ⚠️ salah nilai | ubah default → `"NoBrand"` |
| `logistic_info[]` | `{logistic_id, enabled}` **saja** | `{logistic_id, enabled, shipping_fee:0.0, is_free:false}` | ⚠️ kelebihan field | buang `shipping_fee`/`is_free` |
| `attribute_list[].attribute_value_list[]` | `{value_id, original_value_name}` (nama) | `{original_value_name, value_unit}` + `value_id` via TRANSLATE | ⚠️ perlu dicek | `original_value_name` = **nama** (bukan id); buang `value_unit` |
| `item_sku` (item-level) | *(tidak ada)* | ada di apiSchema | ℹ️ berlebih | opsional hapus |
| `normal_stock` (item-level) | *(tidak ada)* | ada (skalar) | ℹ️ berlebih | opsional hapus (v2 pakai `seller_stock`) |
| `original_price` | `100000` | `original_price` (dari JOLT) ✅ | ✅ | — |
| `currency`,`weight`,`dimension`,`condition`,`item_dangerous`,`category_id`,`item_name`,`description` | ✅ | ✅ | ✅ | — |
| `mainImage`,`images`,`image` (support) | ✅ | ✅ | ✅ | — |

## 2. Variant level (`variantGroups[].channelVariant`)

Payload sukses tiap SKU: `skus.model_sku`, `skus.tier_index`, `skus.original_price`,
`skus.normal_stock`, `skus.seller_stock` (`[{stock}]`), `skus.model_id` (support).

**Status: ✅ sudah benar.** `BUILD_MODEL` (`GenericPostProcessingEngine.executeBuildModel`,
`:1413-1423`) sudah meng-emit keenamnya, termasuk `seller_stock:[{stock:N}]` dari nilai stok yang
sama dengan `normal_stock`. Cukup verifikasi nilainya saat dry-run.

---

## 3. Langkah perbaikan (berurutan)

> **Status:** Step 1–3 **sudah diimplementasikan** (rule + apiSchema + op `WRAP_TO_LIST`, dengan test).
> Step 4 = verifikasi saat dry-run. Step 5 = bersih-bersih opsional.

### Step 1 — `seller_stock` item-level (WAJIB) — ✅ implemented
Shopee v2 stok item-level = `seller_stock:[{stock:N}]`, bukan `normal_stock` skalar. Sekarang JOLT
memetakan `inventory_quantity → normal_stock` (skalar), jadi item-level `seller_stock` **tidak ada**.

**Perbaikan** (JOLT-spec-independent, pola sama seperti logistics):
1. `createShopeeApiSchema()` — tambah `schema.put("seller_stock", [ {"stock": 0} ])`.
2. Post-processing rule baru `shopee-build-seller-stock`: bungkus stok item-level ke `[{stock:N}]`.
   Sumbernya nilai stok master (mis. stage `_itemStock` di `ChannelPublishService` atau baca
   `normal_stock` hasil JOLT), lalu `FOR_EACH`/`SET_FIELD` bangun array.
3. (opsional) hapus `normal_stock` item-level dari apiSchema/JOLT (v2 tak memakainya di item level).

### Step 2 — `brand.original_brand_name` = `"NoBrand"` — ✅ implemented
Rule `shopee-default-brand` sekarang memakai `""`. Payload sukses memakai `"NoBrand"`.

**Perbaikan** (`createShopeePostProcessingRules`, rule `shopee-default-brand`):
`value = {"brand_id":0, "original_brand_name":"NoBrand"}` — dan samakan default di `createShopeeApiSchema()`.

### Step 3 — `logistic_info` hanya `{logistic_id, enabled}` — ✅ implemented
Rule `shopee-build-logistics` menambah `shipping_fee:0.0` + `is_free:false`. Channel sandbox
ber-`fee_type=SIZE_INPUT` **menghitung ongkir dari ukuran** — mengirim `shipping_fee` bisa ditolak.
Payload sukses hanya mengirim `{logistic_id, enabled}`.

**Perbaikan** (rule `shopee-build-logistics`): buang dua `SET_DEFAULT` (`shipping_fee`,`is_free`);
sisakan `RENAME value→logistic_id`, `COERCE_TYPE number`, `REMOVE label`, `SET_DEFAULT enabled=true`.
Samakan juga entri `logistic_info` di `createShopeeApiSchema()`.

### Step 4 — `attribute_list` value: `original_value_name` = **nama** + `value_id`
Payload sukses: `{"value_id":1221, "original_value_name":"Leather"}`. `value_id` = id, dan
`original_value_name` = **nama** ("Leather"). Op `TRANSLATE_VALUE_IDS` kita mencocokkan
`original_value_name` (nama) → menulis `value_id`. Maka **wajib** `original_value_name` berisi **nama**,
bukan value_id.

**Perbaikan / verifikasi:** pastikan pemetaan Step-2 → `attribute_list` menaruh **label nilai** (nama)
di `original_value_name` (dropdown Step-2 menyimpan `value` = value_id, `label` = nama — yang dikirim
harus **label**). Buang `value_unit:""` dari apiSchema (payload sukses tak memakainya).
> Kalau `original_value_name` ternyata berisi id (mis. "1221"), TRANSLATE tak akan cocok → value_id
> kosong. Ini titik yang paling perlu dicek di dry-run.

### Step 5 — bersih-bersih — ✅ implemented (item_sku)
- ✅ Hapus `item_sku` item-level dari apiSchema + JOLT (payload sukses tak memuatnya). `normal_stock`
  item-level sudah dibuang oleh rule `shopee-build-seller-stock` (Step 1).
- ◻️ Stray `logistics` (nama lama) dari generated spec lama → regenerate JOLT spec kategori (runtime data).

---

## 4. Channel metadata — disamakan ke contoh

`metadataGroups` di payload sukses berbeda dari `ChannelMetadataMigration.buildShopeeMetadata()` kita.
Tiga perbaikan (semua di `buildShopeeMetadata` / workflow-nya):

| Workaction | Sebelum (kita) | Sesudah (sesuai contoh) |
|---|---|---|
| `create_CP` (add_item) | `response-update-to` baca **`id`** | baca **`response.item_id`** → tulis ke `id` (item_id Shopee ada di sana; ini penentu init/add_model dapat `item_id` benar) |
| variant | satu `create_CP_Variants` = **array** `[init_tier_variation, add_model]` dgn reshape lama | **dipisah**: `create_CP_Variants_Init` (init, pakai `tier-source`+`models`) **dan** `create_CP_Variants` (add_model) |
| `create_CP_Variants` (add_model) | `output.fields:{model_list_key}` saja | `output.fields:{model_sku_key, tier_index_key, original_price_key, normal_stock_key, **seller_stock_key**}` + `wrapper_key:model_list` + `wrapper_type:ARRAY`; `updatePaths` match `response.model.model_sku=skus.model_sku` |

`create_CP_Media_Pre`, `servflow#data_structure#info`, `type-of-authorization`, `partner-credential`
(placeholder `{app.oauth.clientSecret}`) sudah cocok — tak diubah.

---

## 5. Tanya-jawab: `seller_stock` & `original_price` wajib? Bagaimana sistem tahu?

### Apakah `seller_stock` dan `original_price` mandatory?
**Ya, keduanya wajib** — terbukti dua arah:
1. Payload sukses memuat keduanya di **item level** (`seller_stock:[{stock:26}]`, `original_price:100000`)
   **dan** per-variant (`skus.seller_stock`, `skus.original_price`).
2. Error yang kita temui (lihat `resolusi_kapabilitas_channel.md` §1): `error_busi seller_stock` (stok
   item-level wajib) dan `error_busi (price/weight/logistic/dimension)` wajib.

Untuk produk **bervariasi**, harga/stok tetap diisi **per-model** (add_model), **dan** item-level tetap
diperlukan sebagai basis.

### Bagaimana sistem tahu field mana yang mandatory? Query ke channel?
**Campuran dua sumber** — sebagian di-query, sebagian dari kontrak tetap:

| Jenis field | Mandatory ditentukan dari | Query ke Shopee? |
|---|---|---|
| **Field inti add_item** (`item_name`, `original_price`, `seller_stock`, `weight`, `dimension`, `logistic_info`, `category_id`, `condition`, `brand`, `currency`) | **kontrak add_item Shopee yang tetap** — di-encode di `apiSchema` + config required-field (`ChannelFieldMappingOverridesMigration`, `ChannelCategoryRequirementsMigration`) | ❌ **tidak** — Shopee tak punya API "daftar field inti wajib"; ini dari dokumentasi mereka |
| **Atribut kategori** (`attribute_list`: Material, Pattern, …) | **di-query per kategori**: `get_attribute_tree` → flag `mandatory` | ✅ **ya** (capability `GetAttributeTree`) |
| **brand wajib/tidak** per kategori | `get_brand_list` → `is_mandatory` | ✅ **ya** (capability `GetBrandList`) |
| **size_chart wajib** per kategori | `get_size_chart_list` | ✅ **ya** (capability `GetSizeChartList`) |

**Ringkas:** field **inti** add_item diketahui wajib dari **kontrak tetap** (tidak query — encoded di
apiSchema + required-field config). Yang **dinamis per-kategori** (attribute_list value, brand,
size_chart) baru **di-query** ke Shopee lewat lapisan capability resolution. Jadi jawabannya:
**sebagian query, sebagian tidak** — dan itulah kenapa `seller_stock`/`original_price` (inti) tak perlu
di-query untuk tahu ia wajib, sementara Material/Pattern (kategori) perlu.

---

## 6. Referensi
- Payload sukses: `src/main/resources/json/shopee_add_model_e2e_payload.json`
- Kontrak field & error: `docs/resolusi_kapabilitas_channel.md` §1–§3
- Lapisan capability: `docs/product/07-publishing-engine/01-guides/09-channel-capability-resolution.md`
- Orientasi koleksi config: `docs/setup/02-platform-admin/01-guides/04-capability-operations-orientation.md`
