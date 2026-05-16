# Penjelasan Path B — Category Attribute API (Bahasa Indonesia)

> Dokumen ini menjelaskan secara menyeluruh apa itu Path B, mengapa arsitekturnya dibuat seperti ini,
> bagaimana cara kerjanya, cara menjalankannya, dan hubungannya dengan Path A.

---

## 1. Latar Belakang — Mengapa Ada "Path B"?

Ketika seorang seller mengisi Step 2 (channel-specific fields) di ecommerce wizard, form perlu tahu
field apa yang **wajib diisi** untuk produk yang mereka daftarkan.

Masalahnya: **field yang wajib itu berbeda-beda tergantung kategori produk**, bukan hanya tergantung
channel-nya saja.

Contoh konkret:

| Channel     | Kategori     | Field yang wajib muncul                              |
|-------------|--------------|------------------------------------------------------|
| TikTok Shop | Electronics  | `voltage`, `model_number`, `connectivity`            |
| TikTok Shop | Fashion      | `brand_id`, `color`, `size`                          |
| Lazada      | Electronics  | `attribute_id=11` (Color), `attribute_id=23` (Model) |
| Amazon      | Clothing     | `department`, `material_type`, `size_map`            |
| eBay        | Motors       | `year`, `make`, `model` (Fit Guide)                  |

Daftar ini **tidak bisa di-hardcode** karena:
1. Setiap channel punya ratusan kategori dengan ribuan kombinasi field
2. Channel secara rutin menambah/mengubah field wajib mereka
3. Field wajib berbeda antar marketplace

**Solusinya: Path B** — ambil data field ini langsung dari API channel setiap kali seller memilih
kategori, simpan di cache, lalu tampilkan di form.

---

## 2. Apa yang Dilakukan Path B?

Path B adalah mekanisme yang:

1. **Mendeteksi** bahwa seller telah memilih sebuah kategori di field `CATEGORY_TREE`
2. **Memanggil API channel** untuk mendapatkan daftar attribute yang diperlukan untuk kategori tersebut
3. **Menyimpan hasilnya** di MongoDB cache (`channel_category_attributes_cache`) dengan TTL 24 jam
4. **Menampilkan field-field ini** di section "Required Fields" pada Step 2 form
5. **Menghitung completion score** berdasarkan berapa banyak field kategori ini yang sudah diisi

---

## 3. Mengapa Perlu Config Per Channel? Bukankah Ada Generic Engine?

**Ini adalah pertanyaan terpenting.** Jawaban singkatnya: **implementasi SUDAH generic**. Yang berbeda
per channel hanya **data konfigurasi** (dokumen MongoDB), bukan kode Java.

### 3.1 Generic Engine yang Sudah Ada

Seluruh logika pengambilan attribute dari API channel ada di satu service:

```
GenericCategoryService.fetchAttributesFromApi(channelType, storeId, categoryId, orgId)
```

Service ini **tidak punya satu baris kode** yang spesifik ke Lazada, TikTok, atau Amazon. Ia membaca
instruksi dari koleksi MongoDB `channel_category_api_config` dan mengeksekusinya secara dinamis.

### 3.2 Tiga Mode Eksekusi dalam Generic Engine

Karena API tiap channel punya struktur respons yang berbeda, engine mendukung 3 mode:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GenericCategoryService                                │
│                                                                          │
│  fetchAttributesFromApi()                                                │
│       │                                                                  │
│       ├─ [config.attributeLookupConfig != null]                          │
│       │         └─→ executeLookupAndParse()   ← MODE 3: Two-Step Lookup  │
│       │                                          (Amazon)                │
│       ├─ [config.attributeGraphqlQuery != null]                          │
│       │         └─→ executeGraphqlAttributeRequest() ← MODE 2: GraphQL  │
│       │                                               (Shopify)          │
│       └─ [else: config.attributesUrlPath != null]                        │
│                   └─→ executeAttributeRequest() ← MODE 1: REST GET       │
│                                                 (Lazada, TikTok, Shopee, │
│                                                  eBay, WooCommerce)      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Yang Berbeda Per Channel: Dokumen Konfigurasi

Yang berbeda per channel adalah **dokumen JSON di MongoDB**, bukan kode Java.
Dokumen ini di-seed oleh `CategoryApiConfigDataLoader` saat aplikasi start.

Contoh perbandingan config untuk dua channel:

**TikTok Shop** (REST GET sederhana):
```
attributesUrlPath         = /api/products/attributes
attributeCategoryIdQueryParam = category_id
attributesItemsJsonPath   = data.attributes
attributeIdField          = id
attributeNameField        = name
attributeRequiredField    = is_mandatory
attributeIsCustomizedField = is_customized
attributeValuesField      = values
attributeValueIdField     = id
attributeValueNameField   = name
```

**Amazon** (two-step lookup):
```
attributeLookupConfig:
  lookupUrlPath     = /definitions/2020-09-01/productTypes
  keywordQueryParam = keywords
  keywordSource     = CATEGORY_NAME        ← ambil nama kategori dari cache
  resultIdPath      = productTypes.0.name  ← ekstrak "SHIRT", "ELECTRONICS" dll
  schemaUrlTemplate = /definitions/2020-09-01/productTypes/{result}
  schemaFormat      = JSON_SCHEMA          ← parse sebagai JSON Schema
```

**Shopify** (GraphQL):
```
attributeGraphqlQuery     = query TaxonomyCategoryAttributes($id: ID!) { ... }
attributeGraphqlIdVariable = id
attributesItemsJsonPath   = data.node.attributeCategories
attributeNestedArrayField = attributes   ← flatten attributeCategories[].attributes[]
attributeIdField          = name
```

---

## 4. Alur Lengkap Path B — Step by Step

```
[Seller di Step 2 form]
         │
         │  Seller memilih kategori "Electronics" di CATEGORY_TREE field
         │
         ▼
[Frontend memanggil API]
  GET /labamap/api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}
  Header: organizationId
         │
         ▼
[CategoryCacheService.getCategoryAttributes()]
         │
         ├─ Cek MongoDB cache: channel_category_attributes_cache
         │   (channelType + storeId + categoryId)
         │
         ├─ [CACHE HIT] ──────────────────────────────────────────────────────►
         │                                                    return cached data
         │
         └─ [CACHE MISS]
                  │
                  ▼
         [GenericCategoryService.fetchAttributesFromApi()]
                  │
                  │  1. Baca ChannelCategoryApiConfig dari MongoDB
                  │  2. Ambil credentials dari channel_store_connections
                  │  3. Pilih mode (REST / GraphQL / Two-Step)
                  │  4. Panggil channel API
                  │  5. Parse response → List<CachedAttributeField>
                  │
                  ▼
         [CategoryCacheServiceImpl.fetchAndCacheAttributes()]
                  │
                  │  - Pisahkan required vs optional fields
                  │  - Ambil nama kategori dari category cache
                  │  - Simpan sebagai CategoryAttributesCacheDocument
                  │    (expireAt = now + 24 jam, TTL index auto-delete)
                  │
                  ▼
         return CategoryAttributesResponse {
           categoryId, categoryName,
           requiredFields: List<ChannelFormField>,
           optionalFields: List<ChannelFormField>
         }
         │
         ▼
[ChannelStepSchemaService.buildStoreResult()]
         │
         │  categoryAttrsForSchema = response dari atas
         │
         │  1. buildRequiredSection() ← append requiredFields dari kategori
         │  2. buildOptionalSection() ← exclude categoryRequiredNames
         │  3. catReqTotal  = requiredFields.size()
         │  4. catReqFilled = count fields yang sudah diisi
         │  5. completionPct = (reqFilled + catReqFilled) / (reqTotal + catReqTotal) × 100
         │
         ▼
[Response ke Frontend]
  ChannelStepSchemaResponse {
    sections: [
      { sectionName: "required", fields: [...channel fields..., ...category fields...] },
      { sectionName: "optional", fields: [...tanpa duplikat...] }
    ],
    completionStats: {
      channelRequiredTotal: 5,   ← dari channel config
      channelRequiredFilled: 3,
      categoryRequiredTotal: 4,  ← dari Path B (API kategori)
      categoryRequiredFilled: 1,
      requiredTotal: 9,          ← total gabungan
      requiredFilled: 4
    },
    categoryAttributeSection: { ... }  ← untuk UI khusus kategori
  }
```

---

## 5. Mengapa Channel Berbeda Butuh Config Berbeda?

Meskipun engine-nya generic, setiap channel memang punya struktur API yang unik:

### 5.1 Lazada
```
GET /api/category/attributes?primary_category_id=10000629&access_token=XXX

Response:
{
  "data": [
    {
      "attribute_id": 11001,
      "attribute_name": "Color",
      "is_mandatory": true,
      "options": [
        { "name": "Red" },
        { "name": "Blue" }
      ]
    }
  ]
}
```
→ Langsung: satu API call, field mapping straightforward.

### 5.2 TikTok Shop
```
GET /api/products/attributes?category_id=123&access_token=XXX&app_key=YYY

Response:
{
  "data": {
    "attributes": [
      {
        "id": "100001",
        "name": "Warna / Color",
        "is_mandatory": true,
        "is_customized": false,   ← false = SELECT (pilih dari list)
        "values": [
          { "id": "1001", "name": "Merah" }
        ]
      }
    ]
  }
}
```
→ Ada `is_customized` yang menentukan SELECT vs TEXT — tidak ada di Lazada.

### 5.3 Shopify
```
POST /admin/api/2024-01/graphql.json
Body: {
  "query": "query TaxonomyCategoryAttributes($id: ID!) { node(id: $id) { ... on TaxonomyCategory { attributeCategories { attributes { id name type { name } values { id name } } } } } }",
  "variables": { "id": "gid://shopify/TaxonomyCategory/abc123" }
}

Response:
{
  "data": {
    "node": {
      "attributeCategories": [
        {
          "attributes": [
            { "id": "gid://...", "name": "Material", "values": [...] },
            { "id": "gid://...", "name": "Color", "values": [...] }
          ]
        }
      ]
    }
  }
}
```
→ GraphQL, nested `attributeCategories[].attributes[]` harus di-flatten dulu.
→ Shopify taxonomy attributes tidak punya `is_mandatory` — semuanya dianggap optional.

### 5.4 eBay
```
GET /commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=9355

Response:
{
  "aspects": [
    {
      "localizedAspectName": "Brand",
      "aspectConstraint": {
        "aspectRequired": true,     ← nested object, bukan field langsung
        "aspectUsage": "REQUIRED"
      },
      "aspectValues": [
        { "localizedValue": "Apple" }
      ]
    }
  ]
}
```
→ `aspectRequired` ada di dalam nested object `aspectConstraint.aspectRequired` —
  butuh dot-notation traversal, `attributeRequiredField = "aspectConstraint.aspectRequired"`.

### 5.5 Amazon (Paling Kompleks)
Amazon **tidak punya endpoint** "berikan field yang wajib untuk category_id X". Yang ada adalah:

```
Step 1: GET /definitions/2020-09-01/productTypes?keywords=T-Shirt&marketplaceIds=ATVPDKIKX0DER
Response: { "productTypes": [{ "name": "SHIRT", "displayName": "Shirts" }] }

Step 2: GET /definitions/2020-09-01/productTypes/SHIRT?requirements=LISTING_PRODUCT_ONLY&...
Response: {
  "schema": {
    "required": ["item_name", "brand", "material_type", "department"],
    "properties": {
      "item_name":     { "title": "Product Name", ... },
      "material_type": { "title": "Material Type", "items": { "properties": { "value": { "enum": ["Cotton", "Polyester"] } } } },
      ...
    }
  }
}
```

→ Harus translate nama kategori → nama product type → fetch JSON Schema.
→ Response-nya bukan array biasa tapi JSON Schema — butuh parser khusus `mapJsonSchemaToAttributeFields()`.

---

## 6. Cara Kerja Cache

```
Collection: channel_category_attributes_cache
Index: { channelType, storeId, categoryId } (unique)
TTL: expireAt field, 24 jam setelah fetch

Document:
{
  channelType: "tiktokshop",
  storeId: "store_abc",
  categoryId: "123456",
  categoryName: "Women's T-Shirts",
  requiredFields: [
    {
      fieldName: "100001",
      fieldType: "SELECT",
      label: "Color",
      required: true,
      options: [{ value: "1001", label: "Red" }, ...]
    }
  ],
  optionalFields: [...],
  syncedAt: ISODate("2026-05-15T10:00:00Z"),
  expireAt: ISODate("2026-05-16T10:00:00Z")  ← MongoDB auto-delete setelah ini
}
```

**Catatan penting**: Collection `channel_category_attributes_cache` **tidak dibuat secara manual**.
MongoDB hanya membuat collection ini pada saat dokumen pertama di-insert. Sebelum ada seller yang
memilih kategori, collection ini belum ada di database — itu normal.

---

## 7. Cara "Menjalankan" Path B

Path B **tidak dijalankan secara manual**. Ini adalah proses yang terjadi otomatis:

### 7.1 Saat Startup
```
Aplikasi start
  └─ CategoryApiConfigDataLoader (@Order 140) berjalan
       └─ Insert/update config ke channel_category_api_config untuk semua channel:
            lazada, tiktokshop, shopee, amazon, ebay, wix, shopify, woocommerce
```

### 7.2 Saat User Menggunakan Step 2
```
User membuka Step 2 untuk suatu produk
  └─ ChannelStepSchemaService.buildStoreResult() dipanggil
       └─ Jika ada field CATEGORY_TREE dengan nilai tersimpan (savedData):
            └─ categoryCacheService.getCategoryAttributes() dipanggil
                 ├─ Cache HIT: return langsung
                 └─ Cache MISS: panggil GenericCategoryService → channel API → simpan cache
```

### 7.3 Trigger Manual untuk Testing
Untuk testing, bisa panggil langsung:
```http
GET /labamap/api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}
    ?organizationId={orgId}
```

Contoh:
```http
GET /labamap/api/v1/categories/tiktokshop/store_abc/attributes/123456
    ?organizationId=org_xyz
```

Pastikan store `store_abc` terdaftar di `channel_store_connections` dengan credential yang valid.

---

## 8. Hubungan Path A dan Path B

Kedua path ini melayani tujuan yang **sama** (menambahkan field wajib berbasis kategori) tapi dengan
mekanisme berbeda karena sifat channel-nya berbeda:

```
┌────────────────────────────────────────────────────────────────────────┐
│                         TUJUAN SAMA                                     │
│   "Tambahkan field yang wajib spesifik untuk kategori yang dipilih"     │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
         PATH A                  PATH B
    (Static Map)             (Live API)
              │                     │
  Channel tidak punya API    Channel punya API
  attribute per kategori     attribute per kategori
              │                     │
  Lazada ✗                   Lazada ✓
  TikTok ✗                   TikTok ✓
  Shopee ✗                   Shopee ✓
  Amazon ✗ ────────────────► Amazon ✓ (two-step)
  eBay ✓ ──────────────────► eBay ✓ (juga ada Path A override)
  Shopify ✓                  Shopify ✓ (taxonomy)
  WIX ✓                      WIX ✗ (merchant store, no attr API)
  WooCommerce ✓              WooCommerce ✓ (store-level only)
```

### 8.1 Channel dengan Path A Saja (Static)
- **Shopify collections, WIX** — merchant punya koleksi sendiri, tidak ada kategori global dengan
  schema attribute. Field wajib dikurasi manual oleh operator dan disimpan di
  `ChannelConfiguration.categoryRequirements`.

### 8.2 Channel dengan Path B Saja (Live API)
- **Lazada, TikTok Shop, Shopee** — channel punya API yang mengembalikan persis field apa yang
  wajib untuk setiap kategori. Data langsung dari channel lebih akurat dan up-to-date.

### 8.3 Channel dengan Keduanya
- **eBay** — punya Path B (Taxonomy API) untuk field spesifik kategori, JUGA punya Path A override
  (`ChannelCategoryRequirementsMigration`) sebagai fallback jika kategori tidak match.
- **Shopify taxonomy** (bukan collections) — punya Path B (GraphQL attribute), JUGA punya Path A
  untuk channel-level defaults.

### 8.4 Bagaimana Keduanya Digabung di Scoring

Di `ChannelStepSchemaService.buildStoreResult()`:

```java
// Path A: merge category override dari channelConfig.categoryRequirements
String categorySlug = resolveCategorySlug(savedData, store.getChannelType());
List<RequiredField> effectiveRequired = new ArrayList<>(channelConfig.getRequiredFieldObjects());
// ... tambahkan dari categoryRequirements jika ada slug yang match

// Path B: category attributes dari live API (sudah di-cache)
CategoryAttributesResponse categoryAttrsForSchema = ...;

// Scoring gabungan:
int reqTotal    = effectiveRequired.size();              // Path A
int catReqTotal = categoryAttrsForSchema.requiredFields().size(); // Path B
int totalReqItems = reqTotal + catReqTotal;

// Section builder:
buildRequiredSection(effectiveRequired, ...)  // Path A fields
  + categoryAttrsForSchema.requiredFields()   // Path B fields ditambahkan di dalam
```

Keduanya **muncul di section yang sama** ("Required Fields") dan **keduanya diperhitungkan** dalam
completion percentage.

---

## 9. Menambahkan Channel Baru ke Path B

Karena sudah generic, untuk menambah channel baru ke Path B **tidak perlu menulis kode Java**.
Cukup tambahkan entry di `CategoryApiConfigDataLoader.buildConfigs()`:

```java
ChannelCategoryApiConfig.builder()
    .channelType("newchannel")
    .label("New Channel Category Tree")
    .baseUrl("https://api.newchannel.com")
    // ... category tree config ...
    
    // Attribute API config (inilah yang mengaktifkan Path B):
    .attributesUrlPath("/v1/categories/attributes")
    .attributeCategoryIdQueryParam("cat_id")
    .attributesItemsJsonPath("result.attributes")
    .attributeIdField("attr_id")
    .attributeNameField("attr_name")
    .attributeRequiredField("mandatory")
    .attributeValuesField("allowed_values")
    .attributeValueIdField("id")
    .attributeValueNameField("display_name")
    .build()
```

Setelah aplikasi restart, `CategoryApiConfigDataLoader` akan insert config baru, dan Path B akan
langsung aktif untuk channel tersebut.

---

## 10. Ringkasan Status Implementasi

| Komponen | File | Status |
|----------|------|--------|
| Generic engine (fetch + parse) | `GenericCategoryService.java` | ✅ Selesai |
| 3 mode eksekusi (REST/GraphQL/Two-Step) | `GenericCategoryService.java` | ✅ Selesai |
| Cache read/write | `CategoryCacheServiceImpl.java` | ✅ Selesai |
| Config per channel | `CategoryApiConfigDataLoader.java` | ✅ Selesai (8 channel) |
| Wiring ke completion score | `ChannelStepSchemaService.java` | ✅ Selesai |
| Path A static override | `ChannelCategoryRequirementsMigration.java` | ✅ Selesai |
| Path B aktif Lazada | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |
| Path B aktif TikTok Shop | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |
| Path B aktif Shopee | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |
| Path B aktif eBay | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |
| Path B aktif Shopify (GraphQL) | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |
| Path B aktif Amazon (Two-Step) | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |
| Path B aktif WooCommerce | `CategoryApiConfigDataLoader.java` | ✅ Config sudah ada |

**Semua komponen sudah diimplementasi.** Satu-satunya syarat agar Path B bekerja di production
adalah store yang terdaftar di `channel_store_connections` harus memiliki credential yang valid,
karena `GenericCategoryService` mengambil credentials dari sana untuk memanggil channel API.

---

## 11. Troubleshooting

### "Category attributes selalu kosong"
1. Cek apakah store punya credential yang valid:
   ```
   db.channel_store_connections.findOne({ storeId: "store_abc" })
   ```
2. Cek log: `fetchAttributesFromApi failed` atau `No attribute API configured`
3. Cek apakah config ada di MongoDB:
   ```
   db.channel_category_api_config.findOne({ channelType: "tiktokshop" })
   ```
4. Pastikan field `attributesUrlPath` (atau `attributeLookupConfig`) tidak null di config tersebut

### "Completion score tidak berubah setelah pilih kategori"
- Kemungkinan `categoryAttrsForSchema` null — category attributes belum di-fetch
- Cek apakah `channel_category_attributes_cache` sudah ada entri untuk kombinasi
  `(channelType, storeId, categoryId)` yang bersangkutan

### "Amazon attributes kosong"
- Two-step lookup membutuhkan nama kategori yang ada di cache (`channel_category_cache`)
- Jika kategori belum pernah di-browse (tree belum dimuat), nama kategori tidak tersedia dan
  lookup akan fallback ke categoryId sebagai keyword — yang kemungkinan tidak match product type
- Solusi: pastikan seller browse category tree dulu sebelum attributes di-fetch
