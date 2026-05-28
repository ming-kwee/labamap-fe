# Phase 4 — Scenario D: Category-Dependent Field Injection

## Status Implementasi

| Komponen                                                                                         | Status      |
|--------------------------------------------------------------------------------------------------|-------------|
| Layer 0 — Channel-wide required fields (`requiredByChannel`)                                     | **Done**    |
| Path B Wiring (completion score + section builders)                                              | **Done**    |
| Path B Activation — semua 7 channel (Lazada, TikTok, Shopee, eBay, Shopify, Amazon, WooCommerce) | **Done**    |
| Path A — Static map Shopify / WIX / eBay (`ChannelCategoryRequirementsMigration`)                | **Done**    |
| Phase 4 APM — category-scoped `fieldBoosts` condition eval                                       | **Pending** |

---

## Permasalahan yang Diselesaikan

Step 2 awalnya memperlakukan field wajib sebagai daftar flat yang sama untuk semua produk di satu channel, terlepas dari kategori. Ini menyebabkan dua kegagalan nyata:

- **Over-requiring**: field `batteries_required` muncul untuk produk pakaian di Amazon karena field tersebut masuk daftar channel-wide
- **Under-requiring**: `material` dan `care_instructions` tidak muncul untuk produk pakaian di Shopify karena tidak masuk daftar universal minimum

Field wajib di channel berbeda signifikan per kategori:

| Channel     | Electronics                                     | Clothing                                           | Food                                 |
|-------------|-------------------------------------------------|----------------------------------------------------|--------------------------------------|
| Shopify     | `model_number`, `connectivity`                  | `material`, `care_instructions`, `size_type`       | `ingredients`, `allergens`, `expiry` |
| Amazon      | `model_number`, `wattage`, `batteries_required` | `department`, `material_type`, `item_type_keyword` | `item_form`, `diet_type`             |
| TikTok Shop | `package_weight`, `package_dimensions`          | `brand_id`, `color`, `size`                        | —                                    |

---

## Koneksi dengan Phase 3

Phase 4 tidak bisa berjalan tanpa Phase 3. Ini adalah hubungan sebab-akibat langsung:

```
Phase 3 (CATEGORY_TREE field):
  Merchant pilih leaf category di CategoryTreePicker
  → categoryId = "123456" (TikTok: Women's T-Shirts)
  → disimpan di channel_product_data.channelData["categoryId"]
              │
              │ categoryId tersimpan menjadi trigger
              ▼
Phase 4 (Category-Dependent Field Injection):
  ChannelStepSchemaService membaca categoryId dari savedData
  → fetch category-specific attributes via GenericCategoryService
  → inject field "Color" (required), "Material" (required), "Pattern" (optional)
    ke dalam section "Required Fields" dan "Optional Fields"
  → completion score dihitung ulang termasuk field kategori ini
```

Tanpa `categoryId` yang valid dari Phase 3, Phase 4 menghasilkan nol field tambahan dan completion score tidak berubah — ini adalah perilaku yang benar (bukan error).

---

## Tiga Lapisan Field Wajib

Required fields di Step 2 dirakit dari tiga lapisan, diterapkan secara kumulatif:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Layer 0 — Channel-Wide Required Fields                                  │
│  Sumber: EcommerceMasterAttributeDocument.requiredByChannel              │
│  Berlaku: SELALU — setiap produk di channel tersebut                     │
│  Contoh: vendor (Shopify), product_type (Shopify + WIX)                  │
│  Computed by: isRequiredForChannel() di ChannelStepSchemaService         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ + (additive)
┌────────────────────────────▼────────────────────────────────────────────┐
│  Layer 1 — Category Slug Override (Path A)                               │
│  Sumber: ChannelConfiguration.categoryRequirements[slug]                 │
│  Berlaku: Ketika savedData.categoryId bisa di-resolve ke slug yang       │
│           terdaftar (mis. "clothing", "electronics", "motors")           │
│  Channel: Shopify, WIX, eBay (tidak ada live API attribute)              │
│  Diseed oleh: ChannelCategoryRequirementsMigration @Order(111)           │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ + (additive)
┌────────────────────────────▼────────────────────────────────────────────┐
│  Layer 2 — Live Category Attribute API (Path B)                          │
│  Sumber: channel_category_attributes_cache                               │
│          (diisi live dari channel API via GenericCategoryService)        │
│  Berlaku: Ketika leaf category dipilih AND channel punya attribute API   │
│  Channel: Lazada, TikTok Shop, Shopee, eBay, Shopify (GraphQL), Amazon  │
│  TTL cache: 24 jam                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

Semua lapisan dijumlahkan ke dalam satu `sections.required.fields` — tidak ada duplikasi jika nama field muncul di lebih dari satu lapisan (field dengan nama sama di Layer 1 dan Layer 2 hanya ditampilkan sekali).

---

## Path A vs Path B — Dua Implementasi untuk Satu Tujuan

Channel dibagi dua berdasarkan apakah mereka menyediakan live API untuk attribute per kategori:

|                 | Path A — Static Map                              | Path B — Live API                                                          | 
|-----------------|--------------------------------------------------|----------------------------------------------------------------------------|
| **Channel**     | Shopify collections, WIX                         | Lazada, TikTok Shop, Shopee, eBay, Shopify (taxonomy), Amazon, WooCommerce |
| **Sumber data** | `categoryRequirements` di `ChannelConfiguration` | Channel attribute API → `channel_category_attributes_cache`                |
| **Cara update** | Manual — seeder `@Order(111)`                    | Otomatis — live dari channel, cache 24 jam                                 |
| **Akurasi**     | Dikurasi operator (platform docs)                | Langsung dari channel (paling akurat)                                      |
| **Layer**       | Layer 1                                          | Layer 2                                                                    |

Beberapa channel mendapat **keduanya**:
- **eBay** — Path B (Taxonomy API untuk item specifics) + Path A (override fallback jika kategori tidak match)
- **Shopify** — Path B (GraphQL taxonomy attributes) + Path A (channel-wide defaults dari `categoryRequirements`)

---

## Path A: Static Map untuk Shopify, WIX, eBay

Channel ini tidak punya endpoint yang mengembalikan field wajib per kategori leaf — field harus dikurasi dari dokumentasi platform.

### Data Model

```java
// ChannelConfiguration.java
private Map<String, CategoryFieldOverride> categoryRequirements;
// Key: category slug, e.g. "clothing", "electronics", "motors"

public static class CategoryFieldOverride {
    private List<RequiredField>     additionalRequiredFields;
    private List<RecommendedField>  additionalRecommendedFields;
    private List<String>            suppressRecommendedFields;
}
```

### Slug Resolution

`ChannelStepSchemaService.resolveCategorySlug()` mentranslate `categoryId` dari `channelData` ke slug yang terdaftar:

```
savedData.channelData.categoryId  →  lowercase  →  CATEGORY_SLUG_ALIASES  →  slug
"apparel"   → "clothing"
"tech"      → "electronics"
"gadgets"   → "electronics"
(nilai lain → dipakai apa adanya)
```

### Slug yang Diseed

| Channel | Slug yang tersedia |
|---|---|
| Shopify | `clothing`, `electronics`, `home-garden`, `sports`, `food`, `beauty`, `books`, `toys` |
| WIX | Sama dengan Shopify |
| eBay | `electronics`, `motors`, `fashion`, `collectibles`, `sporting-goods` |

---

## Path B: Live API untuk Lazada, TikTok, Shopee, eBay, Shopify, Amazon

Seluruh logika fetch attribute dari channel API ada di satu service generik tanpa kode spesifik per channel:

```
GenericCategoryService.fetchAttributesFromApi(channelType, storeId, categoryId, orgId)
```

Service ini membaca instruksi dari `channel_category_api_config.attributeConfig` dan menjalankannya. Tiga mode eksekusi berdasarkan config yang tersedia:

```
fetchAttributesFromApi()
  │
  ├─ attributeConfig.lookupConfig != null
  │     └─→ MODE 3: Two-Step Lookup  ← Amazon
  │           (1) keyword search → product type name
  │           (2) fetch JSON Schema per product type
  │
  ├─ attributeConfig.graphqlQuery != null
  │     └─→ MODE 2: GraphQL POST  ← Shopify
  │           query TaxonomyCategoryAttributes($id: ID!)
  │           flatten attributeCategories[].attributes[]
  │
  └─ attributeConfig.urlPath != null
        └─→ MODE 1: REST GET  ← Lazada, TikTok, Shopee, eBay, WooCommerce
              langsung fetch → parse → return
```

### Alur Cache

```
GET /merchant-data/{channelType}/{storeId}/category-attributes
  ?categoryId={id}&organizationId={orgId}
          │
          ▼
CategoryCacheService.getCategoryAttributes()
          │
          ├─ [CACHE HIT]  channel_category_attributes_cache
          │               (channelType + storeId + categoryId)
          │               → return langsung
          │
          └─ [CACHE MISS]
                   │
                   ▼
          GenericCategoryService.fetchAttributesFromApi()
                   │  pilih MODE berdasarkan attributeConfig
                   ▼
          channel API dipanggil dengan credentials dari channel_store_connections
                   │
                   ▼
          simpan CategoryAttributesCacheDocument:
            { channelType, storeId, categoryId, categoryName,
              requiredFields[], optionalFields[],
              expireAt: now + 24h }
                   │
                   ▼
          return CategoryAttributesResponse
```

Collection `channel_category_attributes_cache` **tidak dibuat manual** — MongoDB membuat collection ini otomatis saat dokumen pertama di-insert (saat seller pertama kali memilih kategori).

---

## Completion Score: Dampak Tiga Lapisan

### Sebelum Phase 4

```
completionPercentage = reqFilled / reqTotal × 100
  reqTotal = channel-wide required fields only (Layer 0)
```

### Sesudah Phase 4 (aktif)

```
completionPercentage = (reqFilled + catReqFilled) / (reqTotal + catReqTotal) × 100

reqTotal    = Layer 0 (channel-wide) + Layer 1 (Path A slug override)
catReqTotal = Layer 2 (Path B live API)
```

**Perilaku ketika tidak ada kategori dipilih:** `catReqTotal = 0` → formula identik dengan sebelum Phase 4. Tidak ada regresi.

### Shape `CompletionStats` (baru)

```typescript
interface CompletionStats {
  requiredTotal:          number;   // Layer 0 + 1 + 2 gabungan
  requiredFilled:         number;
  channelRequiredTotal:   number;   // Layer 0 + 1 saja (Path A)
  channelRequiredFilled:  number;
  categoryRequiredTotal:  number;   // Layer 2 saja (Path B)
  categoryRequiredFilled: number;
  recommendedTotal:       number;
  recommendedFilled:      number;
}
```

Contoh JSON untuk produk TikTok dengan kategori "Women's T-Shirts":

```json
{
  "requiredTotal":          9,
  "requiredFilled":         4,
  "channelRequiredTotal":   5,
  "channelRequiredFilled":  3,
  "categoryRequiredTotal":  4,
  "categoryRequiredFilled": 1,
  "recommendedTotal":       8,
  "recommendedFilled":      5
}
```

---

## Kontrak Frontend Phase 4

### 1. `categoryAttributeSection` pada `ChannelSchemaPerStore`

Field baru (opsional) di response `POST /ecommerce/form-schema/channel-step`:

```typescript
interface ChannelSchemaPerStore {
  // ... field yang sudah ada ...
  categoryAttributeSection?: CategoryAttributesResponse;  // NEW
}

interface CategoryAttributesResponse {
  categoryId:     string;
  categoryName:   string;
  categoryPath:   string[];            // breadcrumb: ["Clothing", "Women's", "T-Shirts"]
  requiredFields: ChannelFormField[];
  optionalFields: ChannelFormField[];
}
```

`categoryAttributeSection` hadir hanya ketika `channel_product_data` sudah menyimpan `categoryId` untuk store tersebut. Nilainya `null`/omitted jika belum ada kategori yang dipilih.

**Penting:** `requiredFields` dari `categoryAttributeSection` sudah **dimasukkan ke dalam `sections.required.fields`** di response yang sama — frontend tidak perlu render ulang dari `categoryAttributeSection` untuk menampilkan form. `categoryAttributeSection` adalah **konteks tambahan** untuk UI panel info:

```
┌────────────────────────────────────────────────────────────┐
│  ℹ️ Kategori terpilih: Women's T-Shirts (Clothing > Women's)│
│  Field berikut wajib untuk kategori ini.                    │
└────────────────────────────────────────────────────────────┘
  Color *     [Select ▼]
  Material *  [__________]
```

### 2. Re-fetch Category Attributes saat Kategori Berubah

Schema Step 2 digenerate sekali saat page load. Jika seller **mengubah kategori** lewat `CategoryTreePicker` (Phase 3), schema menjadi stale karena dibuat sebelum kategori baru diketahui.

Flow yang direkomendasikan:

```
User pilih leaf category baru di CategoryTreePicker
  │
  ├─ 1. Simpan categoryId ke channelData (key: "categoryId") via autosave
  │
  ├─ 2. Panggil category-attributes endpoint:
  │       GET /labamap/api/v1/merchant-data/{channelType}/{storeId}/category-attributes
  │           ?categoryId={newCategoryId}&organizationId={orgId}
  │
  └─ 3a. ATAU (lebih simpel): re-call POST /ecommerce/form-schema/channel-step
            → re-render seluruh tab store
            (debounce agar tidak re-call saat user masih browse tree)
```

**Key wajib `"categoryId"` di `channelData`:** `ChannelStepSchemaService.resolveCategorySlug()` membaca `channelData.categoryId` (bukan `channelData.category_id` atau `channelData.category`). Jika key salah, Path A override tidak akan aktif.

### 3. Layer 0 Behavioral Impact — Required Section Non-Empty dari Awal

Dengan Layer 0 aktif, required section **tidak lagi kosong** saat form pertama dibuka (sebelum kategori dipilih). Untuk Shopify: `vendor` dan `product_type` sudah muncul di required section dari page load.

| Perubahan | Priority | Breaking? |
|---|---|---|
| Update `CompletionStats` TypeScript type | P0 | Ya — crash jika shape lama diasumsikan |
| Fix semua read `completionStats.required` → `requiredFilled` dan `.total` → `requiredTotal` | P0 | Ya |
| Handle non-empty required section sebelum kategori dipilih | P0 | Ya jika required section di-hide secara kondisional |
| Add `categoryAttributeSection` ke type `ChannelSchemaPerStore` | P1 | Tidak (optional field) |
| Persist `categoryId` di `channelData` autosave | P1 | Tidak (additive) |
| Call category-attributes endpoint saat kategori berubah | P1 | Tidak (UX change, bukan breaking) |
| Render `categoryAttributeSection` context panel | P2 | Tidak |

---

## Collections yang Terlibat

| Collection | Isi | Diisi oleh |
|---|---|---|
| `channel_category_api_config` | Config HTTP attribute API per channel (`attributeConfig` nested) | `CategoryApiConfigDataLoader @Order(140)` |
| `channel_category_attributes_cache` | Cached attribute fields per `(channelType, storeId, categoryId)`, TTL 24 jam | `CategoryCacheServiceImpl` (on-demand) |
| `channel_configurations` | `categoryRequirements` map per channel (Path A) | `ChannelCategoryRequirementsMigration @Order(111)` |
| `channel_product_data` | `channelData.categoryId` — trigger untuk fetch Phase 4 | Disimpan saat merchant save Step 2 |

---

## Menambah Channel Baru ke Phase 4

### Path B (channel punya attribute API)

Cukup tambahkan `attributeConfig` ke builder channel di `CategoryApiConfigDataLoader`:

```java
.attributeConfig(AttributeApiConfig.builder()
    .urlPath("/v1/categories/attributes")
    .categoryIdQueryParam("cat_id")
    .itemsJsonPath("result.attributes")
    .idField("attr_id")
    .nameField("attr_name")
    .requiredField("mandatory")
    .valuesField("allowed_values")
    .valueIdField("id")
    .valueNameField("display_name")
    .build())
```

Tidak ada perubahan kode Java lainnya. Setelah restart, Path B aktif untuk channel tersebut.

### Path A (channel tanpa attribute API)

1. Tambahkan entry di `ChannelCategoryRequirementsMigration.java` untuk channel baru
2. Definisikan slug + `CategoryFieldOverride` (additionalRequiredFields, dll.)
3. Jalankan migration (restart aplikasi)

---

## Codebase Reference

| File | Peran di Phase 4 |
|---|---|
| `channel/category/config/ChannelCategoryApiConfig.java` | Entity `AttributeApiConfig` — config attribute API per channel |
| `channel/category/loader/CategoryApiConfigDataLoader.java` | Seed `attributeConfig` untuk semua 7 channel (`@Order(140)`) |
| `channel/category/service/GenericCategoryService.java` | `fetchAttributesFromApi()` — 3 mode (REST/GraphQL/Two-Step) |
| `channel/category/service/CategoryCacheServiceImpl.java` | Cache read/write; `fetchAndCacheAttributes()` |
| `channel/category/controller/CategoryAttributeController.java` | `GET /merchant-data/{ch}/{store}/category-attributes` |
| `config/ChannelCategoryRequirementsMigration.java` | Path A seeder Shopify/WIX/eBay (`@Order(111)`) |
| `channel/model/entity/ChannelConfiguration.java` | `categoryRequirements: Map<String, CategoryFieldOverride>` |
| `ecommerce/channelproduct/service/ChannelStepSchemaService.java` | Orkestrasi 3 layer; `resolveCategorySlug()`; wiring ke score + section builders |
| `ecommerce/channelproduct/model/dto/CompletionStats.java` | `channelRequired*` + `categoryRequired*` fields baru |

---

## Dokumen Terkait

| Dokumen | Isi |
|---|---|
| [`14-phase3-hierarchical-category-tree.md`](./14-phase3-hierarchical-category-tree.md) | Phase 3 — CATEGORY_TREE field, CategoryTreePicker; menyediakan `categoryId` yang menjadi trigger Phase 4 |
| [`11-step2-category-required-fields.md`](./11-step2-category-required-fields.md) | Spesifikasi teknis lengkap: tiga-layer system, kode merge logic, implementation order, frontend breaking changes |
| [`12-path-b-category-attributes-explanation.md`](./12-path-b-category-attributes-explanation.md) | Penjelasan mendalam Path B: mengapa ada generic engine, 3 mode eksekusi, cara kerja cache, troubleshooting (Bahasa Indonesia) |
| [`09-step2-channel-data-sources.md`](./09-step2-channel-data-sources.md) | Eleven scenarios Step 2; Phase 4 Scenario D di halaman 4 |
| [`../02-api-reference/06-step2-category-attributes.md`](../02-api-reference/06-step2-category-attributes.md) | API reference lengkap: endpoint spec, response shape, MongoDB schemas, TypeScript types |
