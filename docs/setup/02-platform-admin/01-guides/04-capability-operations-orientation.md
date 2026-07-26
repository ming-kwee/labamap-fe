# Orientasi: `channel_capability_operations` vs `attributeConfig` vs `merchant_api_operations`

Dokumen ini menjawab satu kebingungan yang wajar: **ada tiga koleksi konfigurasi yang sama-sama
"memanggil API channel", jadi yang mana untuk apa?** Kita bahas pelan-pelan, dengan analogi, tabel
perbandingan, contoh Shopee end-to-end, lalu cara setting awal.

Ketiga koleksi:
- `channel_category_api_config` → sub-dokumen `treeApiConfig` & **`attributeConfig`**
- `merchant_api_operations`
- `channel_capability_operations` (yang baru)

---

## 1. Kunci membedakannya: dua pertanyaan

Bayangkan alur seorang merchant memasang produk:

```
   Step 1 (katalog master)
        │
   Step 2 (form per-channel)   ← merchant MENGISI form
        │
   Publish                     ← sistem MEMBANGUN payload untuk dikirim ke channel
        │
   add_item ke Shopee
```

Tiga koleksi itu dibedakan oleh **dua pertanyaan**:

1. **KAPAN dipakai?** Saat membangun **form Step-2** (agar merchant tahu apa yang harus diisi/dipilih),
   atau saat **membangun payload publish** (nilai teknis yang dikirim ke channel)?
2. **Butuh HMAC?** Sebagian channel (Shopee) mewajibkan request ditandatangani HMAC-SHA256. Sebagian
   (Shopify, TikTok) cukup Bearer/API-key.

Dari dua pertanyaan itu, posisi masing-masing jadi jelas.

---

## 2. Analogi sederhana

| Koleksi                         | Analogi                            | Pertanyaan yang dijawab                                                                                                |
|---------------------------------|------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| `attributeConfig`               | **Daftar kolom formulir kategori** | "Untuk kategori *Kemeja Pria*, atribut apa saja yang perlu diisi?" → Material, Pattern, Colour                         |
| `merchant_api_operations`       | **Isi dropdown milik toko**        | "Toko ini punya gudang/template kirim apa?" → daftar opsi dropdown                                                     |
| `channel_capability_operations` | **Juru bicara saat pengiriman**    | "Channel logistik mana yang aktif? `value_id` berapa untuk 'Leather'? `brand_id` berapa?" → nilai teknis untuk payload |

Dua yang pertama **membantu membangun form** (apa yang merchant lihat/isi). Yang ketiga **membangun
payload** (nilai teknis yang benar-benar dikirim), dan sering perlu **HMAC + kunci per-kategori/toko**.

---

## 3. Perbandingan berdampingan

| Aspek                  | `channel_category_api_config.attributeConfig`       | `merchant_api_operations`                                | `channel_capability_operations`                                     |
|------------------------|-----------------------------------------------------|----------------------------------------------------------|---------------------------------------------------------------------|
| **Kapan**              | Step-2 (form) + browse kategori                     | Step-2 (opsi field dropdown)                             | **Publish** (+ opsi Step-2 utk channel HMAC)                        |
| **Untuk apa**          | daftar **atribut kategori** (wajib/opsional/varian) | opsi **field dropdown** (gudang, template kirim, lokasi) | resolusi kapabilitas → **isi payload** (logistics, value_id, brand) |
| **Jumlah endpoint**    | **satu** per channel                                | banyak (per operationName)                               | banyak (per operationName)                                          |
| **Auth**               | HMAC ada (via `treeApiConfig`)                      | **BEARER / API_KEY saja** (tak ada HMAC)                 | **HMAC** + BEARER/API_KEY                                           |
| **Key-binding**        | selalu per `category_id`                            | tidak ada                                                | **`CATEGORY_ID` / `SHOP_ID` / `NONE`** (data-driven)                |
| **Pagination**         | tidak                                               | tidak                                                    | **offset / cursor**                                                 |
| **Cache + invalidasi** | cache atribut (TTL)                                 | tidak                                                    | **cache ber-scope + hook invalidasi**                               |
| **Konsumen (kode)**    | `GenericCategoryService`                            | `GenericMerchantDataService`                             | `ChannelCapabilityResolver` + `CapabilityEnrichmentService`         |
| **Contoh**             | `get_attribute_tree`                                | `GetWarehouses`, `GetShippingTemplates`                  | `GetChannelList`, `GetAttributeTree`, `GetBrandList`                |

**Inti perbedaannya:**
- `attributeConfig` = **satu** endpoint, khusus atribut kategori untuk **form**. Tak bisa multi-endpoint,
  tak ada pagination/cache-invalidasi.
- `merchant_api_operations` = multi-operasi untuk **opsi field**, tapi **tanpa HMAC** (jadi gagal untuk
  Shopee), tanpa key-binding kategori/toko, tanpa cache/pagination.
- `channel_capability_operations` = multi-operasi **dengan HMAC + key-binding + pagination + cache**,
  untuk **enrichment payload saat publish** (dan bisa juga menyuplai opsi Step-2 untuk channel yang
  butuh HMAC).

---

## 4. Kenapa tidak satu koleksi saja?

Karena kebutuhannya berbeda dan koleksi tumbuh bertahap. `channel_capability_operations` adalah yang
**paling mampu** — secara teori bisa menyerap dua lainnya, tapi keputusannya **melengkapi, bukan
mengganti** (lihat design doc). Konkretnya:

- `attributeConfig` **tetap** untuk atribut form Step-2 (`get_attribute_tree`).
- `merchant_api_operations` **tetap** untuk channel non-HMAC (Shopify `GetLocations`, TikTok
  `GetWarehouses`, dst.).
- Operasi Shopee di `merchant_api_operations` yang auth-nya salah (BEARER) **di-supersede** oleh
  capability (HMAC), **tidak dihapus**.

---

## 5. "Saya mau tambah X — pakai yang mana?" (pohon keputusan)

```
Butuh menampilkan sesuatu di FORM Step-2?
├─ Ya → itu ATRIBUT KATEGORI (Material, Colour, wajib/opsional)?
│       ├─ Ya → channel_category_api_config.attributeConfig
│       └─ Tidak → itu OPSI DROPDOWN sebuah field (gudang, kurir, lokasi)?
│               ├─ channel butuh HMAC (Shopee)? → channel_capability_operations
│               │    + set attribute.capabilityOperation = "<Operation>"
│               └─ tidak (Shopify/TikTok)?      → merchant_api_operations
└─ Tidak, ini untuk MEMBANGUN PAYLOAD saat publish (logistics, value_id, brand)?
        └─ channel_capability_operations
             + stagingKey (+ selectionField / consumer rule post-processing)
```

---

## 6. Contoh Shopee end-to-end (siapa mengerjakan apa)

Merchant memasang kemeja di kategori `300242`:

| Momen | Koleksi | Operasi | Hasil |
|---|---|---|---|
| Step-2: form atribut muncul | `attributeConfig` | `get_attribute_tree` | menampilkan `[S]Material`, `[S]Pattern`, `[S]Colour` |
| Step-2: dropdown "Logistics Channel" terisi | `channel_capability_operations` | `GetChannelList` (via `attribute.capabilityOperation`) | J&T Express, SPX Instant, … (hanya `enabled`) |
| Publish: bangun array `logistics` | `channel_capability_operations` | `GetChannelList` (di-stage `_resolvedLogistics`) → post-processing rule | `logistics:[{logistic_id: 81017, enabled:true, …}]` |
| Publish: isi `value_id` atribut | `channel_capability_operations` | `GetAttributeTree` (di-stage `_attributeValueIndex`) → op `TRANSLATE_VALUE_IDS` | `attribute_value_list:[{value_id: 1221}]` |

> **Catatan jujur soal `GetAttributeTree` di dua tempat.** Ini **overlap yang disadari** — endpoint
> yang sama (`get_attribute_tree`) dipanggil dua kali: sekali oleh `attributeConfig` (untuk **form**),
> sekali oleh capability op (untuk **payload** `value_id`). Alasan tetap dipisah **bukan** "perannya
> beda" semata, tapi **kemandirian jalur publish**: publish tak boleh bergantung pada form Step-2
> sudah pernah dimuat/di-cache, jadi ia punya sumber sendiri. Menyatukan fetch-nya (satu fetch
> menyuplai form + indeks value_id) adalah optimasi **Fase 3** di design doc. Operasi capability
> lain (`GetChannelList`/`GetBrandList`/`GetWarehouseDetail`) **tak punya** padanan di `attributeConfig`,
> jadi overlap ini hanya terjadi pada `GetAttributeTree`. Lihat §7 untuk perbandingan query & response.

---

## 7. `get_attribute_tree` di dua tempat — contoh query & response

Ini menunjukkan **kenapa terlihat duplikatif**: panggilan HTTP-nya **identik**, yang berbeda hanya
**bentuk keluaran + konsumen + waktu**.

### Panggilan HTTP yang sama (dipakai kedua jalur)

```
GET https://openplatform.sandbox.test-stable.shopee.sg/api/v2/product/get_attribute_tree
    ?category_id_list=300242
    &language=en
    &partner_id=1233683
    &shop_id=227550228
    &access_token=<token>
    &timestamp=<epoch>
    &sign=<HMAC-SHA256(partner_id+path+timestamp+access_token+shop_id, PARTNER_KEY)>
```

### Respons mentah Shopee (sama untuk keduanya, dipangkas)

```json
{
  "error": "", "message": "",
  "response": {
    "list": [{
      "category_id": 300242,
      "attribute_tree": [
        { "attribute_id": 200134, "mandatory": true, "name": "[S]Material",
          "attribute_value_list": [
            { "value_id": 1221, "name": "Leather" },
            { "value_id": 1257, "name": "Germany" } ] },
        { "attribute_id": 200162, "mandatory": true, "name": "[S]Pattern",
          "attribute_value_list": [ { "value_id": 1490, "name": "Plain" } ] }
      ]
    }]
  }
}
```

> Nilai `value_id` di atas: `1221`/`1257` nyata dari probe; `1490` ilustratif.

### Jalur A — `attributeConfig` (untuk FORM Step-2)

**Config** (`channel_category_api_config.attributeConfig`, konsumen `GenericCategoryService`):

```json
{
  "urlPath": "/api/v2/product/get_attribute_tree",
  "categoryIdQueryParam": "category_id_list",
  "itemsJsonPath": "response.list", "nestedArrayField": "attribute_tree",
  "idField": "attribute_id", "nameField": "name", "requiredField": "mandatory",
  "valuesField": "attribute_value_list", "valueIdField": "value_id", "valueNameField": "name",
  "variantOptionAttributeNames": ["[S]Colour", "[S]Size", "[S]Pattern", "[S]Material"]
}
```

**Keluaran** — form field (`CategoryAttributesResponse`); `fieldName` = `attribute_id`, tiap opsi
`value` = `value_id`:

```json
{
  "requiredFields": [
    { "fieldName": "200134", "label": "[S]Material", "fieldType": "SELECT", "required": true,
      "options": [ {"value":"1221","label":"Leather"}, {"value":"1257","label":"Germany"} ] },
    { "fieldName": "200162", "label": "[S]Pattern", "fieldType": "SELECT", "required": true,
      "options": [ {"value":"1490","label":"Plain"} ] }
  ],
  "optionalFields": ["… [S]Colour, [S]Region of Origin, …"],
  "variantSuggestionFields": ["… atribut yang cocok variantOptionAttributeNames …"]
}
```

Dikonsumsi frontend untuk **menggambar form** (label, wajib/opsional, dropdown value_id).

### Jalur B — `channel_capability_operations` (untuk PAYLOAD publish)

**Config** (`channel_capability_operations`, konsumen `ChannelCapabilityResolver`):

```json
{
  "channelType": "shopee", "operationName": "GetAttributeTree",
  "urlPath": "/api/v2/product/get_attribute_tree",
  "keySource": "CATEGORY_ID", "keyQueryParam": "category_id_list",
  "itemsJsonPath": "response.list", "nestedArrayField": "attribute_tree",
  "valueField": "attribute_id", "labelField": "name", "requiredMetaField": "mandatory",
  "valuesField": "attribute_value_list", "valueIdField": "value_id", "valueNameField": "name",
  "stagingKey": "_attributeValueIndex"
}
```

**Keluaran** — `List<CapabilityItem>`, di-stage ke `_attributeValueIndex` pada transformed data:

```json
[
  { "value": "200134", "label": "[S]Material", "required": true,
    "valueOptions": [ {"value":"1221","label":"Leather"}, {"value":"1257","label":"Germany"} ] },
  { "value": "200162", "label": "[S]Pattern", "required": true,
    "valueOptions": [ {"value":"1490","label":"Plain"} ] }
]
```

Dikonsumsi op **`TRANSLATE_VALUE_IDS`** saat publish: mencocokkan `attribute_id` + nama nilai di
`attribute_list` → menulis `value_id` ke payload.

### Sisi-per-sisi

| | Jalur A — `attributeConfig` | Jalur B — capability op |
|---|---|---|
| HTTP call | **identik** | **identik** |
| Konsumen | `GenericCategoryService` → form | `ChannelCapabilityResolver` → publish |
| Bentuk keluaran | form fields (`options[]`, required, split varian) | `CapabilityItem[]` → `_attributeValueIndex` |
| Kapan | saat buka Step-2 | saat publish |
| Cache | `channel_category_attributes_cache` | `channel_capability_cache` |

**Kesimpulan:** query-nya satu dan sama; yang menggandakan hanyalah **dua pembaca dengan kebutuhan
bentuk & waktu berbeda**. Itulah kandidat penyatuan di Fase 3 (satu fetch → dua bentuk).

---

## 8. Setting awal (dari nol)

### Langkah 1 — Seed ketiga koleksi (sekali)
Seeder referensi **default mati** (`app.data.seed-on-startup=false`). Nyalakan sekali agar ketiga
koleksi terisi. Cara paling pasti (override tertinggi):

```bash
# jar
java -jar target/*.jar --app.data.seed-on-startup=true
# maven
mvn spring-boot:run -Dspring-boot.run.arguments="--app.data.seed-on-startup=true"
# atau env pada perintah yang sama
DATA_SEED_ON_STARTUP=true mvn spring-boot:run
```

Verifikasi di log startup:
```
>>> ChannelCapabilityOperationDataLoader START — seeding channel_capability_operations <<<
CategoryApiConfigDataLoader: Shopee API baseUrl=...
```
Data menetap di Mongo → setelah itu boleh set kembali `false`.

### Langkah 2 — Env untuk HMAC (wajib untuk Shopee)
```
SHOPEE_PARTNER_KEY=<partner_key>     # rahasia penandatangan HMAC
SHOPEE_PARTNER_ID=<partner_id>       # dipakai sbg partnerId saat signing bila tak ada di store
SHOPEE_API_BASE_URL=<opsional>       # default sandbox
```
Tanpa `SHOPEE_PARTNER_KEY`, resolver membalas `AUTH_FAILED` → opsi/enrichment kosong meski data
sudah ter-seed.

### Langkah 3 — Store terhubung
`channel_store_connections` harus punya store Shopee dengan kredensial: `partnerId` (opsional; bisa
di-inject dari `SHOPEE_PARTNER_ID`), `shopId`, `accessToken`.

### Langkah 4 — Verifikasi DB
- `channel_capability_operations` → **5 dokumen** shopee: `GetAttributeTree`, `GetBrandList`,
  `GetSizeChartList`, `GetChannelList`, `GetWarehouseDetail`.
- `channel_category_api_config` (shopee) → `attributeConfig.urlPath` = `/api/v2/product/get_attribute_tree`.
- `ecommerce_master_attributes` field `logistics_channel_id` → `capabilityOperation` = `GetChannelList`.

### Langkah 5 — Uji tanpa app penuh (opsional)
Endpoint admin untuk cek/resolve satu operasi secara live:
```
GET  /api/v1/admin/channel-capability-operations?channelType=shopee
POST /api/v1/admin/channel-capability-operations/shopee/GetChannelList/resolve
     body: { "organizationId": "...", "storeId": "...", "scopeKey": "<storeId>" }
```

---

## 9. Referensi silang
- Desain lengkap & fase: `docs/product/07-publishing-engine/01-guides/09-channel-capability-resolution.md`
- Spesifikasi kebutuhan: `docs/resolusi_kapabilitas_channel.md`
- Referensi API koleksi terkait:
  - `docs/setup/02-platform-admin/02-api-reference/03-merchant-api-operations.md`
  - `docs/setup/02-platform-admin/02-api-reference/06-channel-category-api-config.md`
