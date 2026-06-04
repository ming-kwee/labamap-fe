# apiSchema Per Channel Per Category

**Status: Selesai** — Fase 1–4 selesai diimplementasikan (2026-06-04).

## Latar Belakang

Dokumen `11-step2-category-required-fields.md` menemukan bahwa `apiSchema` pada `ChannelConfiguration` tidak bersifat universal di semua kategori produk. Untuk channel seperti Amazon, eBay, dan Walmart, setiap kategori produk memiliki struktur field yang sepenuhnya berbeda. Dokumen ini menganalisis apakah `apiSchema` per kategori sebaiknya ditempatkan di dalam `ChannelConfiguration`, bagaimana versioning-nya, dan apa konsep terbaik yang scalable.

---

## Masalah yang Ingin Diselesaikan

`apiSchema` pada `ChannelConfiguration` saat ini adalah satu `Map<String, Object>` yang di-seed sekali per channel. Ia berfungsi sebagai **target schema** untuk APM (Adaptive Pattern Matching): `ChannelSchemaService.generateComplexTargetSchema()` mengembalikannya langsung, dan APM memetakan setiap field master product ke struktur ini untuk menghasilkan JOLT spec.

### Kenyataan di Lapangan

| Channel  | Realita                                                                                                         | Yang Hilang dari Schema Saat Ini                         |
|----------|-----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------|
| Shopify  | Struktur `product.*` sama untuk semua kategori — tidak ada cabang schema per kategori                           | Tidak ada — satu schema sudah cukup                      |
| WIX      | Sama seperti Shopify — semua produk fisik pakai struktur yang sama                                              | Tidak ada — satu schema sudah cukup                      |
| Amazon   | SP-API menggunakan definisi product type per kategori — `Electronics`, `Clothing`, `Health` memiliki field berbeda | `Connectivity`, `MaterialType`, `Ingredients`, dll.      |
| eBay     | "Item Specifics" didorong oleh kategori — Komputer punya `Processor`, `RAM`; Pakaian punya `Size`, `Material`  | Item Specifics tidak ada di schema yang di-seed          |
| Walmart  | Grup atribut per kategori — Electronics butuh `model_number`; Food butuh `allergen_info`                        | Grup atribut kategori tidak ada di schema yang di-seed   |

Schema yang di-seed untuk ketiga channel ini hanya merepresentasikan **amplop produk universal** — cukup untuk APM memetakan field umum (title, description, price, images), namun **tidak cukup** untuk atribut spesifik kategori.

---

## Analisis: Apakah Layak Disimpan di `ChannelConfiguration`?

### Opsi A — Embed di `ChannelConfiguration` (Pendekatan Naif)

Proposal dokumen asal:

```java
// Dalam ChannelConfiguration.java
private Map<String, Map<String, Object>> categoryApiSchemas;
// Key = category slug, value = schema extension untuk kategori itu
```

**Kelebihan:**
- Satu sumber kebenaran per channel
- Tidak perlu koleksi baru atau repository baru
- Merge logic sederhana: base schema + category extension

**Kelemahan — Ukuran Dokumen:**

Amazon saja memiliki **30+ product type** (Electronics, Clothing, Food, Health, Beauty, Sports, Toys, Books, Automotive, Industrial, dst.). Setiap kategori bisa memiliki **50–100 field** spesifik. Hitungan kasar:

```
Amazon: 30 kategori × 75 field rata-rata × ~40 byte/field
      = ~90.000 byte hanya untuk categoryApiSchemas
      + base apiSchema + joltMetadata + fieldBoosts + authConfig + ...

Total ChannelConfiguration Amazon ≈ 150–200KB per dokumen
```

MongoDB memiliki batas dokumen 16MB — jadi bukan masalah teknis batas. Namun **masalah operasionalnya nyata**:

- Setiap request yang membutuhkan `ChannelConfiguration` (publish, schema build, APM) akan membaca seluruh 150KB ini, bahkan jika hanya butuh satu kategori
- Update satu field di satu kategori berarti menulis ulang seluruh dokumen
- Debugging di MongoDB Compass menjadi mimpi buruk — scroll ribuan baris hanya untuk melihat satu field
- Patch migration untuk satu kategori Amazon akan me-reload dan menyimpan ulang dokumen raksasa itu

**Kelemahan — Versioning:**

`ChannelConfiguration` tidak memiliki mekanisme versioning bawaan. Jika Amazon memperbarui schema Electronics-nya (yang terjadi setiap kali mereka update SP-API), prosesnya adalah:

1. Tulis migration baru
2. Load seluruh `ChannelConfiguration` dari MongoDB
3. Ubah satu entry di `categoryApiSchemas["electronics"]`
4. Simpan ulang seluruh dokumen

Tidak ada audit trail — tidak tahu kapan schema `electronics` terakhir berubah, siapa yang mengubahnya, atau apa versi sebelumnya. Rollback berarti menulis migration lagi.

**Kesimpulan Opsi A: Tidak disarankan untuk channel dengan banyak kategori.**

---

### Opsi B — Koleksi Terpisah `channel_category_api_schemas` (Direkomendasikan)

Buat koleksi MongoDB baru khusus untuk menyimpan schema per channel per kategori. Setiap dokumen merepresentasikan satu pasangan `(channelType × categorySlug)`.

#### Struktur Dokumen

```json
{
  "_id": "ObjectId",
  "channelType": "amazon",
  "categorySlug": "electronics",
  "version": "3",
  "apiSchemaExtension": {
    "Item.ProductType.Electronics.Connectivity": "",
    "Item.ProductType.Electronics.ModelNumber": "",
    "Item.ProductType.Electronics.Wattage": 0,
    "Item.ProductType.Electronics.BatteriesRequired": false,
    "Item.ProductType.Electronics.VoltageType": "",
    "Item.ProductType.Electronics.ConnectorType": ""
  },
  "isActive": true,
  "createdAt": "2026-06-03T10:00:00",
  "updatedAt": "2026-06-03T10:00:00",
  "changeNote": "Added ConnectorType field per Amazon SP-API 2024-01 update"
}
```

#### Kenapa Ini Lebih Baik

| Aspek | Opsi A (embed di ChannelConfig) | Opsi B (koleksi terpisah) |
|---|---|---|
| Ukuran dokumen | Membesar tak terkendali | Setiap dokumen kecil dan fokus |
| Loading efisiensi | Seluruh config dimuat meski hanya 1 kategori dibutuhkan | Lazy load — hanya ambil kategori yang dibutuhkan |
| Versioning | Tidak ada audit trail | Versi bernomor, `changeNote`, `updatedAt` per kategori |
| Update individual | Tulis ulang seluruh dokumen channel | Update hanya dokumen kategori yang berubah |
| Debugging | Scroll ribuan baris | Query langsung: `find({channelType:"amazon", categorySlug:"electronics"})` |
| Penambahan kategori baru | Migration besar yang menyentuh ChannelConfig | Insert satu dokumen kecil |
| Rollback | Migration balik | Tandai `isActive=false`, aktifkan versi sebelumnya |

---

## Konsep Terbaik: `channel_category_api_schemas` + Versioning Ringan

### Strategi Versioning

**Pendekatan yang dipilih: Single Active Document + Versi Bernomor**

Tidak perlu history lengkap seperti git. Cukup:
- Satu dokumen aktif per `(channelType, categorySlug)` yang `isActive=true`
- `version` sebagai integer yang naik setiap kali ada perubahan
- `changeNote` sebagai catatan singkat apa yang berubah
- `updatedAt` sebagai timestamp perubahan terakhir

Jika rollback dibutuhkan, dokumen lama tidak dihapus — cukup simpan sebagai arsip dengan `isActive=false`. Dokumen yang `isActive=true` adalah yang digunakan sistem.

Ini jauh lebih sederhana dibanding event sourcing penuh, namun tetap memberikan audit trail yang cukup untuk kebutuhan operasional.

### Struktur Repository

```java
// channel/category/repository/ChannelCategoryApiSchemaRepository.java

@Repository
public interface ChannelCategoryApiSchemaRepository
        extends ReactiveMongoRepository<ChannelCategoryApiSchemaDocument, String> {

    Mono<ChannelCategoryApiSchemaDocument> findByChannelTypeAndCategorySlugAndIsActiveTrue(
            String channelType, String categorySlug);

    Flux<ChannelCategoryApiSchemaDocument> findAllByChannelTypeAndIsActiveTrue(String channelType);
}
```

### Entitas Dokumen

```java
// channel/category/model/ChannelCategoryApiSchemaDocument.java

@Data
@Builder
@Document(collection = "channel_category_api_schemas")
@CompoundIndex(def = "{'channelType': 1, 'categorySlug': 1, 'isActive': 1}")
public class ChannelCategoryApiSchemaDocument {

    @Id
    private String id;

    private String channelType;
    private String categorySlug;
    private Integer version;
    private Map<String, Object> apiSchemaExtension;
    private Boolean isActive;
    private String changeNote;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

### Merge Logic di `ChannelSchemaService`

```java
// ChannelSchemaService.generateComplexTargetSchema()

public Mono<Map<String, Object>> generateComplexTargetSchema(
        String channelId, String categorySlug) {

    return channelConfigRepository.findActiveByChannelId(channelId)
        .flatMap(config -> {
            // Step 1: ambil base schema dari ChannelConfiguration (tetap di sana)
            Map<String, Object> base = new HashMap<>(config.getApiSchema());

            if (categorySlug == null) {
                return Mono.just(base);
            }

            // Step 2: cari ekstensi kategori dari koleksi terpisah
            return categoryApiSchemaRepository
                .findByChannelTypeAndCategorySlugAndIsActiveTrue(channelId, categorySlug)
                .map(ext -> {
                    // Merge: base schema + category extension
                    // Extension menambahkan field, tidak menggantikan base
                    Map<String, Object> merged = new HashMap<>(base);
                    if (ext.getApiSchemaExtension() != null) {
                        merged.putAll(ext.getApiSchemaExtension());
                    }
                    log.info("Merged category schema: channel={}, category={}, version={}, "
                           + "base fields={}, ext fields={}, total={}",
                        channelId, categorySlug, ext.getVersion(),
                        base.size(), ext.getApiSchemaExtension().size(), merged.size());
                    return merged;
                })
                .defaultIfEmpty(base); // Jika tidak ada ekstensi → pakai base saja
        });
}
```

`ChannelConfiguration.apiSchema` tetap ada dan tetap berisi schema dasar universal (title, description, price, images, variants). Yang berubah adalah: untuk kategori yang membutuhkan field tambahan, ekstensi diambil dari `channel_category_api_schemas` — bukan di-embed ke dalam `ChannelConfiguration`.

---

## Seeder: `ChannelCategoryApiSchemaDataLoader`

```java
// config/ChannelCategoryApiSchemaDataLoader.java
@Order(115) // Setelah ChannelCategoryRequirementsMigration (111)

// Contoh entry Amazon:
private void seedAmazonCategorySchemas() {

    upsertSchema("amazon", "electronics", 1, "Initial seed", Map.of(
        "Item.ProductType.Electronics.Connectivity",    "",
        "Item.ProductType.Electronics.ModelNumber",     "",
        "Item.ProductType.Electronics.Wattage",         0,
        "Item.ProductType.Electronics.BatteriesRequired", false,
        "Item.ProductType.Electronics.VoltageType",     "",
        "Item.ProductType.Electronics.ConnectorType",   ""
    ));

    upsertSchema("amazon", "clothing", 1, "Initial seed", Map.of(
        "Item.ProductType.Clothing.MaterialType",       "",
        "Item.ProductType.Clothing.Department",         "",
        "Item.ProductType.Clothing.SizeMap",            "",
        "Item.ProductType.Clothing.Color",              "",
        "Item.ProductType.Clothing.StyleName",          "",
        "Item.ProductType.Clothing.FabricType",         ""
    ));

    upsertSchema("amazon", "food", 1, "Initial seed", Map.of(
        "Item.ProductType.Food.Ingredients",            "",
        "Item.ProductType.Food.DietType",               "",
        "Item.ProductType.Food.ItemForm",               "",
        "Item.ProductType.Food.AllergenInfo",           ""
    ));

    // ... dst untuk health, beauty, sports, toys, books
}

// Contoh entry eBay:
private void seedEbayCategorySchemas() {

    upsertSchema("ebay", "electronics", 1, "Initial seed", Map.of(
        "ItemSpecifics.Processor",                      "",
        "ItemSpecifics.RAM",                            "",
        "ItemSpecifics.StorageCapacity",                "",
        "ItemSpecifics.OperatingSystem",                "",
        "ItemSpecifics.ScreenSize",                     ""
    ));

    upsertSchema("ebay", "clothing", 1, "Initial seed", Map.of(
        "ItemSpecifics.Size",                           "",
        "ItemSpecifics.Material",                       "",
        "ItemSpecifics.Style",                          "",
        "ItemSpecifics.Pattern",                        "",
        "ItemSpecifics.Color",                          ""
    ));
}

private void upsertSchema(String channelType, String categorySlug,
                           int version, String note, Map<String, Object> ext) {
    categoryApiSchemaRepository
        .findByChannelTypeAndCategorySlugAndIsActiveTrue(channelType, categorySlug)
        .flatMap(existing -> {
            // Sudah ada — skip jika versi sama
            if (existing.getVersion() != null && existing.getVersion() >= version) {
                return Mono.just(existing);
            }
            existing.setApiSchemaExtension(ext);
            existing.setVersion(version);
            existing.setChangeNote(note);
            existing.setUpdatedAt(LocalDateTime.now());
            return categoryApiSchemaRepository.save(existing);
        })
        .switchIfEmpty(
            categoryApiSchemaRepository.save(
                ChannelCategoryApiSchemaDocument.builder()
                    .channelType(channelType)
                    .categorySlug(categorySlug)
                    .version(version)
                    .apiSchemaExtension(ext)
                    .isActive(true)
                    .changeNote(note)
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build()
            )
        )
        .block();
}
```

---

## Dampak pada APM

Begitu ekstensi kategori masuk ke target schema, APM mendapat manfaat langsung:

**Sebelum:**
```
Source field: "model_number"
Target schema: {title, description, price, images, variants}
→ APM tidak bisa menyarankan mapping — field tidak ada di target
→ JOLT spec tidak mengandung model_number
→ Field ini tidak di-publish ke Amazon
```

**Sesudah:**
```
Source field: "model_number"
Target schema: {title, description, price, images, variants,
                Item.ProductType.Electronics.ModelNumber, ...}
→ Tier 1 Knowledge-Based: confidence 95%
→ APM saran: model_number → Item.ProductType.Electronics.ModelNumber
→ JOLT spec memasukkan mapping ini
→ Field ter-publish ke Amazon
```

---

## Channels yang Membutuhkan vs Tidak Membutuhkan

| Channel | Perlu `channel_category_api_schemas`? | Alasan |
|---|---|---|
| Shopify | Tidak | Schema universal untuk semua kategori |
| WIX | Tidak | Schema universal untuk semua produk fisik |
| Amazon | Ya — prioritas tertinggi | 30+ product types, field sangat berbeda per kategori |
| eBay | Ya | Item Specifics sangat kategori-spesifik |
| Walmart | Ya | Attribute groups per kategori |
| TikTok Shop | Parsial | `product_attributes[]` sudah ada di base schema; ekstensi mungkin tidak diperlukan |
| Lazada | Ya | Category attributes dari API sudah di-cache di `channel_category_attributes_cache` — bisa dipakai sebagai sumber ekstensi juga |

---

## Status Implementasi

| Fase | Status | Tanggal | Catatan |
|------|--------|---------|---------|
| Fase 1 — Infrastruktur | **Selesai** | 2026-06-03 | Entity, repository, ChannelSchemaService overload, DataLoader @Order(115) |
| Fase 2 — Aktivasi APM per Channel | **Selesai** | 2026-06-03 | PublishAnalysisService + ChannelController wired; seed Amazon (8 kategori), eBay (5), Walmart (3) |
| Fase 3 — Integrasi fieldBoosts | **Selesai** | 2026-06-03 | `matchesCondition()` di KnowledgeBasedFieldMatchingService; ChannelCategoryFieldBoostsMigration @Order(116) |
| Fase 4 — Admin CRUD API | **Selesai** | 2026-06-04 | ChannelCategoryApiSchemaAdminController — 7 endpoint; create dengan auto-version; deactivate/activate untuk rollback |
| Bug fix — MongoDB dot key | **Selesai** | 2026-06-04 | Extension maps diubah ke nested structure; deepMerge menggantikan putAll di ChannelSchemaService |
| Opsi B — JOLT Auto-Invalidation | **Selesai** | 2026-06-04 | `deleteByChannelIdAndCategoryId` di `ChannelJoltSpecRepository`; `invalidateJoltSpecs()` dipanggil di semua 4 operasi mutasi admin API |

---

## Urutan Implementasi

### Fase 1 — Infrastruktur (tanpa mengubah perilaku APM) ✅

1. Buat `ChannelCategoryApiSchemaDocument` dan `ChannelCategoryApiSchemaRepository`
2. Daftarkan repository ke `MongoConfig` (sudah terdaftar via `channel.category.repository` package)
3. Update `ChannelSchemaService.generateComplexTargetSchema()` untuk menerima `categorySlug` — merge via `deepMerge()`, fallback ke base schema via `switchIfEmpty`
4. Buat `ChannelCategoryApiSchemaDataLoader` @Order(115) — seed Amazon (8 kategori), eBay (5), Walmart (3)

**Bug ditemukan & diperbaiki:** Extension map awalnya menggunakan dotted keys seperti `"Item.ProductType.Electronics.ModelNumber"` — MongoDB menolak dots dalam map keys (`MappingException`). Diperbaiki dengan nested map structure + `deepMerge()` di `ChannelSchemaService` agar base `Item` subtree tidak tertimpa.

### Fase 2 — Aktivasi APM per Channel ✅

1. `PublishAnalysisService.runAdaptiveMatching()` — `buildTargetSchema(channelConfig)` diganti dengan `channelSchemaService.generateComplexTargetSchema(channelId, categorySlug)` secara reaktif via `.flatMap()`
2. `ChannelController.getChannelSchema()` — tambah optional `?categoryId=` query param; response menyertakan `categorySlug` bila category diterapkan
3. `AdaptivePatternMatchingCommandImpl` — pass `categorySlug` ke `fieldMatchingService.findMatchesReactive()`

### Fase 3 — Integrasi dengan `fieldBoosts` (Phase 4 di dok.11) ✅

1. `KnowledgeBasedFieldMatchingService` — tambah `categorySlug` parameter ke `findMatches`, `findBestMatchForField`, `trySemanticKnowledgeMapping`, `calculateSemanticConfidenceReactive`, `getChannelSpecificBoostReactive`, `applyChannelBoosts`
2. `matchesCondition(condition, categorySlug)` helper — format `"category=<slug>"` atau `"category=<slug1>|<slug2>"`; `null` condition = berlaku untuk semua kategori (backward-compatible)
3. `FieldMatchingService` — tambah `findMatchesReactive(..., categorySlug)` overload
4. `ChannelCategoryFieldBoostsMigration` @Order(116) — seed category-scoped boosts: Amazon (10 entries), eBay (5), Shopify (4)

### Fase 4 — Admin CRUD API (runtime management tanpa redeploy) ✅

1. `ChannelCategoryApiSchemaRequest` DTO — body untuk create/update
2. `ChannelCategoryApiSchemaAdminController` — 7 endpoint admin:

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/admin/channel-category-schemas` | List semua dokumen; optional `?channelType=` filter |
| `GET` | `/api/v1/admin/channel-category-schemas/active` | Ambil dokumen aktif untuk `?channelType=&categorySlug=` |
| `GET` | `/api/v1/admin/channel-category-schemas/{id}` | Ambil by MongoDB _id (aktif maupun tidak) |
| `POST` | `/api/v1/admin/channel-category-schemas` | Buat dokumen baru (auto-deactivate existing active untuk pair yang sama) |
| `PUT` | `/api/v1/admin/channel-category-schemas/{id}` | Update extension + bump version |
| `PUT` | `/api/v1/admin/channel-category-schemas/{id}/deactivate` | Soft-delete — isActive=false, data tetap ada |
| `PUT` | `/api/v1/admin/channel-category-schemas/{id}/activate` | Re-aktivasi (rollback) — auto-deactivate other active untuk pair yang sama |

**Invariant**: selalu hanya satu dokumen `isActive=true` per `(channelType × categorySlug)` pair.

**Alur update schema di production** (tanpa redeploy):
```
1. GET /active?channelType=amazon&categorySlug=electronics  → lihat versi saat ini
2. PUT /{id}  → update extension + changeNote (version auto-increment)
             → channel_jolt_specs untuk amazon/electronics otomatis dihapus
3. Merchant publish berikutnya: APM regenerasi JOLT dengan schema yang sudah diupdate
```

**Alur rollback**:
```
1. GET /api/v1/admin/channel-category-schemas?channelType=amazon  → cari id versi lama
2. PUT /{id-lama}/activate  → auto-deactivate versi baru, aktifkan versi lama
                            → channel_jolt_specs otomatis dihapus
3. Merchant publish berikutnya: APM regenerasi JOLT dengan versi lama
```

### Opsi B — JOLT Auto-Invalidation ✅

Setiap operasi mutasi pada admin API secara otomatis menghapus semua `channel_jolt_specs` untuk `(channelType × categorySlug)` yang sama, sehingga publish/analyse berikutnya selalu meregenerasi JOLT spec terhadap merged target schema yang terkini.

| Operasi | JOLT Invalidation |
|---|---|
| `POST /` (create) | ✅ setelah save |
| `PUT /{id}` (update) | ✅ setelah save |
| `PUT /{id}/deactivate` | ✅ setelah save |
| `PUT /{id}/activate` | ✅ setelah save |

**Design decisions:**
- `invalidateJoltSpecs()` menggunakan `.onErrorComplete()` — kegagalan hapus JOLT dicatat sebagai warning tapi tidak menggagalkan operasi schema update. JOLT yang stale bisa dipulihkan (merchant re-analyse); schema update yang gagal tidak bisa.
- Null guard pada `channelType` / `categorySlug` — mencegah `deleteByChannelIdAndCategoryId(null, null)` yang bisa menghapus JOLT spec lain secara destruktif.
- Invalidation adalah bagian dari reactive chain (bukan fire-and-forget) — response HTTP baru dikirim setelah invalidation selesai atau safely error.

---

## Pertanyaan yang Dijawab

### Apakah layak menaruh di `ChannelConfiguration`?

**Tidak** — untuk Amazon, eBay, Walmart. Dokumen akan menjadi tidak terkendali ukurannya (puluhan KB hingga ratusan KB per channel), sulit di-debug, dan tidak memiliki mekanisme versioning yang wajar. Untuk Shopify dan WIX yang memang schema-nya universal, tidak ada yang perlu ditambahkan sama sekali.

### Bagaimana versioning jika di `ChannelConfiguration`?

Tidak bisa. Tidak ada mekanisme native. Setiap perubahan pada satu kategori di Amazon akan menulis ulang seluruh dokumen `ChannelConfiguration` yang besar tanpa audit trail.

### Apakah dokumen akan terlalu besar?

Ya. Amazon: 30+ kategori × 75 field rata-rata = ~90KB hanya untuk `categoryApiSchemas`, ditambah semua field `ChannelConfiguration` yang sudah ada. Dokumen akan menjadi tidak praktis untuk dibaca, di-debug, atau di-patch.

### Apa konsep terbaiknya?

**Koleksi `channel_category_api_schemas` yang terpisah**, dengan:
- Satu dokumen kecil per `(channelType × categorySlug)`
- Versioning ringan: integer naik + `changeNote` + `updatedAt`
- `isActive` flag untuk rollback tanpa hapus data
- `ChannelConfiguration.apiSchema` tetap berisi base schema universal
- `deepMerge()` di `ChannelSchemaService` memastikan base fields tidak tertimpa
- `switchIfEmpty` memastikan channel yang tidak memiliki kategori schema (Shopify, WIX) tetap berjalan tanpa perubahan

---

## Inventory File yang Dibuat / Diubah

### File Baru

| File | Package | Keterangan |
|------|---------|------------|
| `ChannelCategoryApiSchemaDocument.java` | `channel/category/model/` | Entity `channel_category_api_schemas` collection |
| `ChannelCategoryApiSchemaRepository.java` | `channel/category/repository/` | Reactive repository — 3 query methods |
| `ChannelCategoryApiSchemaDataLoader.java` | `channel/category/loader/` | @Order(115) seeder — nested map structure, deepMerge-compatible |
| `ChannelCategoryFieldBoostsMigration.java` | `config/` | @Order(116) seeder — category-scoped FieldBoost entries |
| `ChannelCategoryApiSchemaRequest.java` | `channel/category/model/dto/` | DTO untuk admin create/update |
| `ChannelCategoryApiSchemaAdminController.java` | `channel/category/controller/` | Admin CRUD — 7 endpoints + JOLT auto-invalidation |

### File Diubah

| File | Perubahan |
|------|-----------|
| `ChannelSchemaService.java` | Tambah `generateComplexTargetSchema(channelId, categorySlug)` overload + `deepMerge()` helper |
| `PublishAnalysisService.java` | Inject `ChannelSchemaService`; ganti `buildTargetSchema()` sync dengan reactive `generateComplexTargetSchema()` |
| `ChannelController.java` | `getChannelSchema()` tambah `?categoryId=` param |
| `KnowledgeBasedFieldMatchingService.java` | Tambah `categorySlug` ke 6 method + `matchesCondition()` helper |
| `FieldMatchingService.java` | Tambah `findMatchesReactive(..., categorySlug)` overload |
| `AdaptivePatternMatchingCommandImpl.java` | Pass `categorySlug` ke `findMatchesReactive()` |
| `ChannelJoltSpecRepository.java` | Tambah `deleteByChannelIdAndCategoryId(channelId, categoryId)` |
