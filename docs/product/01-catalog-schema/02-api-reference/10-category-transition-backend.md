# Backend Spec — Transisi Arsitektur Kategori: Storefront → Pure Channel Management

**Untuk:** Backend Engineering Team  
**Konteks:** Platform ini adalah pure channel management (Ginee-like) — tanpa storefront.  
**Roadmap lengkap:** `../01-guides/12-category-evolution-roadmap.md`  
**Analisis arsitektur:** `../01-guides/11-category-architecture-analysis.md`

---

## Prinsip Umum Cleanup

Setiap phase menghasilkan kode lama yang tidak lagi diperlukan. **Kode lama yang tidak
dihapus adalah utang teknis aktif** — ia tetap di-compile, tetap ditest, tetap membingungkan
engineer baru, dan suatu saat akan disentuh secara tidak sengaja.

Aturan per kategori:

| Kategori | Tindakan |
|---|---|
| Endpoint yang tidak lagi diakses frontend | `@Deprecated` + log warning + hapus di phase berikutnya |
| Endpoint yang harus tetap untuk backward compat | Guard dengan `@PreAuthorize` atau flag + dokumentasikan kapan akan dihapus |
| MongoDB collection tidak lagi ditulis | Set TTL atau pindah ke archive collection, jangan drop langsung |
| Java class yang seluruh fungsinya sudah dipindah | Hapus — jangan biarkan "dead class" |
| Index MongoDB yang tidak lagi dipakai | Drop index — index kosong tetap memakan memori dan memperlambat write |
| `@Scheduled` job yang logikanya sudah tidak relevan | Nonaktifkan via `@ConditionalOnProperty` + dokumentasikan |

---

## Phase 1 — Hapus Asumsi: Import adalah Migrasi Website Ongoing ✅ SELESAI

**Status: Deployed 2026-06-15.**

### Perubahan yang diperlukan

#### 1.1 Organization entity — tambah dua field

```java
// com.labamap.channel.organization.model.Organization.java

@Document(collection = "organizations")
public class Organization {
    // ... existing fields ...

    /**
     * Sumber kategori yang dipilih merchant saat onboarding.
     * "import"   = merchant import dari channel (WooCommerce / Etsy / Wix)
     * "template" = merchant pakai platform category template
     * null       = belum memilih (onboarding belum selesai)
     */
    private String categorySourceOrigin;

    /**
     * Waktu pertama kali merchant memilih categorySourceOrigin.
     * Grace period = 14 hari sejak timestamp ini.
     * Null jika belum memilih.
     */
    private Instant categoryOnboardedAt;
}
```

#### 1.2 OrganizationResponse DTO — expose field baru

```java
// OrganizationResponse.java
private String  categorySourceOrigin;
private Instant categoryOnboardedAt;
private boolean categoryGracePeriodActive;  // derived: categoryOnboardedAt != null && now < categoryOnboardedAt + 14 days
private Instant categoryGracePeriodEndsAt;  // derived: categoryOnboardedAt + 14 days
```

`categoryGracePeriodActive` dan `categoryGracePeriodEndsAt` di-derive di DTO level —
tidak disimpan ke database.

#### 1.3 Endpoint baru — set category origin

```
POST /labamap/api/v1/organizations/{orgId}/category-origin

Request body:
{
  "origin": "import" | "template"
}

Response 200:
{
  "categorySourceOrigin":    "import",
  "categoryOnboardedAt":     "2026-06-15T10:00:00Z",
  "categoryGracePeriodActive": true,
  "categoryGracePeriodEndsAt": "2026-06-29T10:00:00Z"
}

Response 409 (Conflict) — jika:
  categorySourceOrigin != null
  DAN now > categoryOnboardedAt + 14 days
{
  "error": "CATEGORY_ORIGIN_LOCKED",
  "message": "Category source was set on 2026-06-15. Grace period expired on 2026-06-29. Migration required to change.",
  "categorySourceOrigin": "import",
  "categoryOnboardedAt":  "2026-06-15T10:00:00Z"
}
```

#### 1.4 Guard import endpoints dengan grace period check

File: `ChannelCategoryMappingAdminController.java` (atau nama equivalennya)

Endpoint yang perlu di-guard:
- `POST /admin/channel-category-mappings/import` (startImport)
- `POST /admin/channel-category-mappings/import/confirm` (confirmImport)
- `GET /admin/channel-category-mappings/import/preview` (previewImport)

Guard logic:

```java
private void assertImportAllowed(String orgId) {
    Organization org = organizationRepository.findById(orgId)
        .orElseThrow(() -> new NotFoundException("Organization not found"));

    // Belum onboarding → boleh import (pilihan pertama)
    if (org.getCategorySourceOrigin() == null) return;

    // Pilih template → tidak boleh import sama sekali
    if ("template".equals(org.getCategorySourceOrigin())) {
        throw new ForbiddenException(
            "IMPORT_NOT_ALLOWED",
            "This organization uses platform templates as category source. Import is not available."
        );
    }

    // Pilih import tapi sudah lewat grace period
    if (org.getCategoryOnboardedAt() != null &&
        Instant.now().isAfter(org.getCategoryOnboardedAt().plus(14, ChronoUnit.DAYS))) {
        throw new ForbiddenException(
            "IMPORT_GRACE_PERIOD_EXPIRED",
            "Category import grace period expired on " +
            org.getCategoryOnboardedAt().plus(14, ChronoUnit.DAYS()) +
            ". Manage categories directly in My Categories."
        );
    }
}
```

Panggil `assertImportAllowed(orgId)` di awal setiap import endpoint.

#### 1.5 MongoDB index baru

```javascript
db.organizations.createIndex(
  { categorySourceOrigin: 1 },
  { sparse: true, name: "idx_category_source_origin" }
)
```

### Cleanup Phase 1

Tidak ada kode yang dihapus di Phase 1 — hanya ditambahkan guard.
Import wizard endpoints tetap ada tapi dilindungi oleh `assertImportAllowed`.

**Yang TIDAK boleh dilakukan:**
- Jangan hapus `ImportWizardController` atau endpoint-nya sekarang
- Jangan hapus `channel_category_mappings` documents yang punya `importedFrom: true`
- Jangan ubah logika import yang sudah ada — hanya tambahkan guard di atas

---

## Phase 2 — Hapus Asumsi: Platform Category Wajib Jembatani ke Channel ✅ SELESAI

**Status: Deployed 2026-06-15.**

### Yang diimplementasikan

#### Entity: `ProductTypeDocument` — field `channelCategoryDefaults` ditambahkan

```java
// ecommerce/producttype/model/ProductTypeDocument.java

@Builder.Default
@Field("channelCategoryDefaults")
private List<ChannelCategoryDefault> channelCategoryDefaults = new ArrayList<>();

public static class ChannelCategoryDefault {
    private String  channelType;      // e.g. "shopee", "lazada"
    private String  categoryId;       // channel-native category ID
    private String  categoryName;     // denormalized display name
    private String  categoryFullPath; // "Pakaian > Pria > Atasan > Kaos"
    private Instant updatedAt;        // auto-stamped on PUT if null
}
```

Index seeded via `@CompoundIndex(name="idx_channel_defaults_channel_type", sparse=true)`.

#### Endpoint 1: `PUT /api/v1/admin/product-types/{id}` — updated

Sekarang menerima `channelCategoryDefaults` di request body.

Validasi yang berjalan (`validateChannelCategoryDefaults`):
- Tidak ada duplikat `channelType` dalam satu request
- Setiap entry harus punya `channelType` dan `categoryId` yang tidak kosong
- Setiap `channelType` harus ada di `channel_category_api_config` (DB lookup)
- `updatedAt` di-stamp otomatis ke `Instant.now()` jika null

**Tidak overwrite** jika `patch.getChannelCategoryDefaults() == null` — merchant bisa
kirim partial update tanpa menyentuh channel defaults.

#### Endpoint 2: `GET /api/v1/admin/product-types/{id}/channel-defaults/{channelType}`

```
200 OK — { channelType, categoryId, categoryName, categoryFullPath, updatedAt }
204 No Content — belum ada default untuk channelType ini
404 Not Found — product type tidak ada
```

Dipanggil `ChannelStoreTab.tsx` di Step 2 untuk pre-fill CategoryTreePicker.
Match bersifat case-insensitive pada `channelType`.

#### Endpoint 3: `POST /api/v1/admin/product-types/bulk-apply-defaults`

```
Request:  { organizationId, productIds?, channelTypes? }
Response 202: { jobId, estimatedProducts, status: "QUEUED" }
```

- `productIds` kosong/null = semua produk di org
- `channelTypes` kosong/null = semua channel yang punya configured defaults

**Implementasi async (fire-and-forget):**
1. Count produk matching → return 202 + jobId langsung
2. Background job via `Schedulers.boundedElastic()`:
   - Iterasi semua active ProductType yang punya `channelCategoryDefaults`
   - Untuk tiap type: cari `product_categories.productTypeId` → cari `master_product_data.categoryObjectId`
   - Update `channel_product_data.channelData` dengan `channelCategoryId/Name/Path`
   - **Hanya pre-fill** — skip jika `channelData.channelCategoryId` sudah ada (tidak overwrite pilihan merchant)

> **Catatan:** `GET /jobs/{jobId}` (polling endpoint) belum diimplementasikan.
> Log aplikasi menampilkan hasil akhir: `[bulk-apply] jobId=... updated=N records`.

### Cleanup Phase 2

Tidak ada kode yang dihapus — seluruhnya additive.

---

## Phase 3 — Hapus Asumsi: Rigid Hierarchy = Organizational Tool Utama ✅ SELESAI

**Status: Deployed 2026-06-15.**

### Yang diimplementasikan

#### Entity: `MasterProductData` — field `tags` ditambahkan

```java
// ecommerce/masterproduct/model/entity/MasterProductData.java

@Indexed
@Builder.Default
private List<String> tags = new ArrayList<>();
```

Compound index `idx_org_tags` pada `{organizationId, tags}` via `@CompoundIndex` — dibuat
otomatis oleh Spring Data MongoDB saat startup.

#### Validasi format tag — inline di `MasterProductDataService.validateTags()`

```
Pattern: ^[a-z0-9][a-z0-9-]{0,49}$
Max 20 tags per product
No duplicates
```

Validation dipanggil di `setTags()` dan `bulkAddRemoveTags()` sebelum write ke DB.
Throws `ResponseStatusException(400)` on violation.

#### Endpoint 1: `GET /api/v1/admin/master-products?tags=kaos,pria`

Parameter `tags` baru (comma-separated, AND logic). Dikirim ke `listForAdmin(..., tagList)`
yang menambahkan `Criteria.where("tags").all(tags)` ke query.

#### Endpoint 2: `PUT /api/v1/admin/master-products/{productId}/tags`

```
Query: organizationId
Body:  { "tags": ["kaos", "pria", "basic"] }
200:   full MasterProductData with updated tags
404:   product not found / wrong org
400:   tag format violation
```

Replaces all tags atomically via `repository.updateTags()` (`@Query + @Update`).

#### Endpoint 3: `POST /api/v1/admin/master-products/bulk-tags`

```
Query: organizationId
Body:  { "productIds": [...], "addTags": [...], "removeTags": [...] }
200:   { "updatedCount": N }
```

`productIds` null/empty = all products in org. Runs two sequential `updateMulti` ops:
`$addToSet` (deduplicates) then `$pullAll`. Returns max of both modified counts.

#### Endpoint 4: `GET /api/v1/admin/master-products/tags/suggestions`

```
Query: organizationId, prefix (optional)
200:  ["kaos", "kaos-pria", "kaos-polo", "kain"]  — max 20, sorted alphabetically
```

Uses `ReactiveMongoTemplate.findDistinct("tags")` with `$regex: "^prefix"` filter.

> **Path note:** Semua endpoint menggunakan path `/api/v1/admin/master-products/`
> (bukan `/api/v1/products/` seperti di spec awal). Informasikan ke frontend team.

### Cleanup Phase 3

Tidak ada kode yang dihapus — seluruhnya additive.

---

## Phase 4 — Aktifkan `treeCapable` untuk Channel Marketplace ✅ SELESAI

**Status: Deployed 2026-06-15.**

Seluruh perubahan Phase 4 sudah diimplementasikan:

- `ChannelCategoryApiConfig.treeCapable` field ditambahkan
- `CategoryApiConfigDataLoader` set `treeCapable=true` untuk shopee, amazon, tiktokshop, ebay, lazada
- `ChannelTaxonomyService.ChannelCategoryFlags` sekarang 3 flags (tambah `treeCapable`)
- `ChannelStoreConnectionResponse.from(entity, ChannelCategoryFlags)` expose `treeCapable`
- `ChannelStoreController` semua endpoint sudah pakai `from(entity, flags)`

Frontend fallback `TREE_CAPABLE_CHANNELS` di `_types/channel-mapping.ts` tidak lagi
terpicu — backend sudah return `treeCapable: true` untuk channel yang relevan.

Detail spec awal ada di `07-channel-category-api-config.md § Backend Recommendation`
(seksi tersebut sekarang bisa dianggap sebagai catatan historis).

---

## Phase 5 — Hapus Asumsi: Mapping Page = Hub Map Website Category ke Channel

### Perubahan yang diperlukan

#### 5.1 `channel_category_mappings` collection — buat `categoryId` nullable

Saat ini `categoryId` adalah FK required ke `product_categories`. Ubah menjadi optional:

```java
// ChannelCategoryMapping.java
@Field("categoryId")
private String categoryId;      // nullable setelah Phase 5 — FK ke product_categories

@Field("productTypeId")
private String productTypeId;   // nullable — FK ke product_types (baru, Phase 5)

// Validasi: salah satu harus diisi (di service layer, bukan entity)
```

**Validasi di service:**
```java
if (categoryId == null && productTypeId == null) {
    throw new ValidationException("Either categoryId or productTypeId must be provided");
}
if (categoryId != null && productTypeId != null) {
    throw new ValidationException("Provide either categoryId or productTypeId, not both");
}
```

#### 5.2 MongoDB migration script — tambah index baru

```javascript
// Jalankan sebelum deploy Phase 5
db.channel_category_mappings.createIndex(
  { productTypeId: 1, storeId: 1 },
  { sparse: true, name: "idx_product_type_store" }
)

// Hapus existing NOT NULL constraint jika ada di validation layer
// (MongoDB sendiri tidak enforce null constraint — pastikan di Java validation)
```

#### 5.3 Endpoint baru — mapping berbasis ProductType

```
POST /labamap/api/v1/admin/channel-category-mappings/product-type
Body:
{
  "productTypeId":  "pt_smartphone",
  "storeId":        "shopee-store-1",
  "organizationId": "org_123",
  "externalId":     "100001",
  "externalName":   "Kaos",
  "externalFullPath": "Pakaian > Pria > Atasan > Kaos"
}

Response 201: ChannelCategoryMapping document
```

#### 5.4 Update mapping query untuk support kedua FK

Semua query yang sebelumnya lookup by `categoryId` harus diperluas:

```java
// Sebelum:
Query query = new Query(Criteria.where("categoryId").is(categoryId));

// Sesudah:
Query query = new Query(new Criteria().orOperator(
    Criteria.where("categoryId").is(categoryId),
    Criteria.where("productTypeId").is(productTypeId)
));
```

#### 5.5 Deprecate `ImportWizardController` endpoints

Endpoint import tidak lagi bisa diakses oleh UI. Tambahkan:

```java
@Deprecated(since = "Phase 5", forRemoval = true)
// Catat target removal: Phase 6 deployment
@PostMapping("/import")
public ResponseEntity<?> startImport(...) {
    // Guard dari Phase 1 sudah di sini — akan menolak semua request normal
    // Hanya super-admin yang bisa bypass untuk keperluan support
    assertImportAllowed(orgId);
    // ... existing logic ...
}
```

Tambahkan log warning setiap kali endpoint ini dipanggil:
```java
log.warn("[DEPRECATED] Import endpoint called by org={}, user={}. " +
         "This endpoint will be removed in Phase 6.", orgId, userId);
```

### Cleanup Phase 5 — aktif

Ini adalah phase pertama dengan cleanup yang signifikan.

#### Hapus: `CategorySyncJob` push-out logic untuk Type 2 channels

`CategorySyncJob` yang melakukan push-out platform category changes ke channel hanya
relevan untuk WooCommerce/Etsy (Type 1 channels). Untuk Shopify/Amazon/TikTok/eBay
(Type 2), push-out adalah no-op karena taxonomy read-only.

Verifikasi bahwa logic ini sudah di-guard oleh `ChannelAdapter.isImportCapable()`.
Jika ada kode yang bypass guard ini → hapus.

```java
// Cari dan verifikasi — tidak boleh ada path yang sampai ke sync call untuk Type 2:
// grep -r "CategorySyncJob" --include="*.java"
// grep -r "pushCategoryToChannel" --include="*.java"
```

#### Hapus: Duplikasi category query logic

Setelah Phase 5, ada kemungkinan ada dua path query untuk mapping:
- Legacy: by `categoryId`  
- Baru: by `productTypeId`

Konsolidasikan ke satu method helper di service layer. Jangan biarkan inline query
tersebar di multiple places.

#### Archive: Dokumen `channel_category_mappings` dengan `importedFrom: true` lama

Dokumen dengan `importedFrom: true` yang sudah lebih dari 1 tahun dan `syncStatus == UNMAPPED`
bisa dipindahkan ke archive collection:

```javascript
// Jalankan sebagai background job, bukan satu kali sekaligus
db.channel_category_mappings.find({
  importedFrom: true,
  syncStatus: "UNMAPPED",
  updatedAt: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
}).forEach(doc => {
  db.channel_category_mappings_archive.insertOne(doc);
  db.channel_category_mappings.deleteOne({ _id: doc._id });
});
```

---

## Phase 6 — Hapus Asumsi: Channel Category = Derivat dari Platform Taxonomy

### Langkah 0 — Verifikasi dulu sebelum membangun

Sebelum mulai Phase 6, verifikasi apakah `CategoryTreePicker` di Step 2 sudah menyimpan
hasil pilihan ke channel listing record atau ke `channel_category_mappings`:

```bash
# Cari ke mana CategoryTreePicker menyimpan hasil
grep -r "channelCategoryId\|categoryId" \
     src/modules/ecommerce-product-v2/step2-channel-fields/ \
     --include="*.ts" | grep -v "test"

# Cek DTO yang dikirim dari frontend ke backend saat save Step 2
grep -r "ChannelStepSaveRequest\|channelStepSave" \
     --include="*.java" | head -20
```

**Jika sudah tersimpan di listing record** → Phase 6 adalah tentang menformalkan ini
dan menghapus dependensi pada mapping table.

**Jika tersimpan di `channel_category_mappings`** → butuh dua langkah:
1. Tambahkan `categoryId` ke channel listing schema
2. Migrate dari mapping table ke listing record

### Perubahan yang diperlukan

#### 6.1 Channel listing schema — tambah `channelCategoryId` per channel

Cari entity yang merepresentasikan "channel listing" (mungkin `ChannelProductListing`,
`ChannelStepData`, atau bagian dari `EcommerceMasterProduct`):

```java
// ChannelListingData.java (atau nama equivalennya)
@Field("channelCategoryId")
private String channelCategoryId;     // channel-native category ID

@Field("channelCategoryName")
private String channelCategoryName;   // denormalized display name

@Field("channelCategoryPath")
private String channelCategoryPath;   // "Pakaian > Pria > Atasan > Kaos"
```

#### 6.2 Step 2 save endpoint — simpan channel category ke listing

```java
// ChannelStepSaveRequest.java — pastikan field ini ada
private String channelCategoryId;
private String channelCategoryName;
private String channelCategoryPath;
```

Saat save Step 2:
1. Simpan `channelCategoryId` ke channel listing record
2. **Juga** update atau buat `channel_category_mappings` dokumen (untuk backward compat selama transition)
3. Setelah semua merchants termigrasi → hapus langkah 2

#### 6.3 Data migration script

```javascript
// Migrasikan channel_category_mappings ke channel listing records
// Jalankan per batch, verifikasi sebelum hapus source

db.channel_category_mappings.find({ syncStatus: "MAPPED" }).forEach(mapping => {
  // Update channel listing record yang sesuai
  db.channel_product_listings.updateOne(
    {
      masterProductId: /* lookup dari categoryId */,
      storeId: mapping.storeId,
      channelType: mapping.channelType
    },
    {
      $set: {
        channelCategoryId:   mapping.externalId,
        channelCategoryName: mapping.externalName,
        migratedFromMapping: true,
        migratedAt:          new Date()
      }
    },
    { upsert: false }  // jangan create baru — hanya update yang sudah ada
  );
});
```

#### 6.4 Publish service — baca dari listing, bukan mapping table

```java
// ChannelPublishService.java

// Sebelum (storefront pattern):
String channelCategoryId = channelCategoryMappingRepository
    .findByCategoryIdAndStoreId(product.getCategoryId(), storeId)
    .map(ChannelCategoryMapping::getExternalId)
    .orElse(null);

// Sesudah (Ginee-like):
String channelCategoryId = channelListing.getChannelCategoryId();
// Fallback ke mapping table selama transition period:
if (channelCategoryId == null) {
    channelCategoryId = channelCategoryMappingRepository
        .findByCategoryIdAndStoreId(product.getCategoryId(), storeId)
        .map(ChannelCategoryMapping::getExternalId)
        .orElse(null);
}
```

### Cleanup Phase 6 — major

#### Hapus: Direct `channel_category_mappings` reads di publish pipeline

Setelah seluruh produk termigrasi:
```java
// HAPUS semua kode yang berbentuk:
channelCategoryMappingRepository.findByCategoryIdAndStoreId(...)
// di publish dan sync services
```

Cari dengan:
```bash
grep -r "channelCategoryMappingRepository\|ChannelCategoryMappingRepository" \
     --include="*.java" | grep -v "test\|archive"
```

#### Hapus: `ImportWizardController` dan semua endpoint-nya

```java
// HAPUS file ini sepenuhnya:
// com.labamap.catalog.channel.controller.ImportWizardController.java
// com.labamap.catalog.channel.service.CategoryImportService.java  (verifikasi dulu tidak ada caller)
// com.labamap.catalog.channel.dto.ImportWizardRequest.java
// com.labamap.catalog.channel.dto.ImportWizardResponse.java
```

**Sebelum hapus** — verifikasi tidak ada caller yang tertinggal:
```bash
grep -r "ImportWizardController\|CategoryImportService\|previewImport\|startImport\|confirmImport" \
     --include="*.java" | grep -v "test"
```

#### Hapus: `CategorySyncJob` push-out (untuk Type 1 channels)

Setelah channel category tidak lagi disimpan di `channel_category_mappings` dan
drift detection tidak diperlukan:

```java
// HAPUS atau disable:
// @Scheduled annotation di CategorySyncJob
// DriftDetectionJob
// Atau convert ke @ConditionalOnProperty("features.category-sync.enabled=false")
```

#### Archive `channel_category_mappings` collection

```javascript
// Setelah semua data termigrasi dan diverifikasi:

// 1. Rename collection ke archive
db.channel_category_mappings.renameCollection("channel_category_mappings_archive_2026");

// 2. Set TTL 3 tahun pada archive (untuk audit, bukan operasional)
db.channel_category_mappings_archive_2026.createIndex(
  { "updatedAt": 1 },
  { expireAfterSeconds: 3 * 365 * 24 * 60 * 60, name: "ttl_archive_3yr" }
)

// JANGAN drop — ini adalah data audit yang valuable
```

#### Drop: Index yang tidak lagi diperlukan

Setelah collection di-archive:
```javascript
// Index ini tidak diperlukan lagi di collection utama
db.channel_category_mappings.dropIndex("idx_org_category")
db.channel_category_mappings.dropIndex("idx_org_store")
// (atau index names yang sesuai dengan implementasi Anda)
```

---

## Checklist Cleanup Per Phase

### Cara menggunakan

Setiap kali selesai deploy satu phase, jalankan checklist ini untuk memastikan
tidak ada "sampah" yang tertinggal.

---

### ✅ Checklist Phase 1 — DEPLOYED 2026-06-15

```
Code:
[x] assertImportAllowed() dipanggil di semua 3 import endpoints
    → GET /import/preview, POST /import, POST /import/confirm
[x] Tidak ada path ke import logic yang bypass assertImportAllowed()
[x] organizationRepository.updateCategoryOrigin() dipanggil saat set categoryOrigin
[ ] Log warning ada di import endpoints (belum — tambahkan saat Phase 5)

Database:
[x] @Indexed(sparse=true) pada categorySourceOrigin di Organization entity
    → index dibuat oleh Spring Data MongoDB pada startup
[ ] Verifikasi tidak ada organizations dokumen dengan categorySourceOrigin = ""

Test:
[ ] Unit test: assertImportAllowed() tolak request setelah 14 hari
[ ] Integration test: POST category-origin 2x → 409 setelah grace period expired
```

---

### ✅ Checklist Phase 2 — DEPLOYED 2026-06-15

```
Code:
[x] channelCategoryDefaults ada di ProductTypeDocument entity
[x] PUT /api/v1/admin/product-types/{id} terima dan simpan channelCategoryDefaults
    → patch null = tidak overwrite; updatedAt di-stamp otomatis
[x] GET /api/v1/admin/product-types/{id}/channel-defaults/{channelType} tersedia
    → 200 OK / 204 No Content / 404 Not Found
[x] POST /api/v1/admin/product-types/bulk-apply-defaults tersedia (async fire-and-forget)
    → estimatedProducts dihitung dari master_product_data sebelum return 202
[x] Validasi: tidak ada duplikat channelType dalam satu request
[x] Validasi: channelType harus ada di channel_category_api_config
[x] Validasi: categoryId required per entry

Database:
[x] @CompoundIndex(idx_channel_defaults_channel_type, sparse=true) pada ProductTypeDocument
    → Spring Data MongoDB membuat index ini saat startup

Catatan implementasi:
- Bulk apply endpoint: GET /jobs/{jobId} belum diimplementasikan (log saja)
  Path actual: /api/v1/admin/product-types/bulk-apply-defaults
  (bukan /api/v1/products/bulk-apply-product-type-defaults seperti di spec awal)
- Bulk apply hanya pre-fill — skip record yang sudah punya channelCategoryId

Frontend integration:
[ ] Verifikasi Step 2 CategoryTreePicker memanggil GET channel-defaults endpoint
[ ] Verifikasi pre-fill muncul saat product type punya default untuk channel ini
```

---

### ✅ Checklist Phase 3 — DEPLOYED 2026-06-15

```
Code:
[x] tags field ada di MasterProductData entity (@Indexed, @Builder.Default = [])
[x] Tag format validation berjalan (MasterProductDataService.validateTags)
    → ^[a-z0-9][a-z0-9-]{0,49}$ | max 20 | no duplicates | 400 on violation
[x] GET /api/v1/admin/master-products?tags=kaos,pria — AND filter
[x] PUT /api/v1/admin/master-products/{id}/tags — replace all tags
[x] POST /api/v1/admin/master-products/bulk-tags — add/remove batch
[x] GET /api/v1/admin/master-products/tags/suggestions?prefix=ka — autocomplete

Database:
[x] @CompoundIndex(idx_org_tags, def={'organizationId':1,'tags':1}) pada MasterProductData
    → Spring Data MongoDB membuat index ini saat startup
[ ] Script backfill: existing products dengan tags=null → set ke []
    (bukan blocker — @Builder.Default ensures new docs get [])

Path note:
    Spec: /api/v1/products/...
    Actual: /api/v1/admin/master-products/... → informasikan ke frontend team
```

---

### ✅ Checklist Phase 4 — SELESAI 2026-06-15

```
Code:
[x] treeCapable field ada di ChannelCategoryApiConfig
[x] CategoryApiConfigDataLoader set treeCapable = true untuk shopee, amazon, tiktokshop, ebay, lazada
[x] ChannelTaxonomyService.getCategoryFlags() return 3 flags
[x] ChannelStoreConnectionResponse expose treeCapable

Verifikasi:
[x] GET /channel-stores response untuk Shopee store: "treeCapable": true
[x] Frontend routing: store.treeCapable === true short-circuit sebelum fallback isTreeCapable()
```

---

### ✅ Checklist Phase 5

```
Setelah deploy Phase 5:

Code:
[ ] categoryId nullable di ChannelCategoryMapping entity
[ ] productTypeId ditambahkan ke ChannelCategoryMapping entity
[ ] Validasi: salah satu dari categoryId atau productTypeId harus diisi
[ ] POST /channel-category-mappings/product-type endpoint tersedia
[ ] Import endpoints punya @Deprecated annotation + log warning
[ ] Semua query mapping support kedua FK (tidak hanya categoryId)

Cleanup yang harus dilakukan di Phase 5:
[ ] Hapus/consolidate duplikasi category query logic
[ ] Verifikasi CategorySyncJob tidak push ke Type 2 channels
[ ] Archive channel_category_mappings dengan importedFrom=true dan age > 1 tahun
[ ] Drop: any unused index dari pre-Phase 5 yang tidak lagi diperlukan

Database:
[ ] idx_product_type_store index terbuat di channel_category_mappings
[ ] Script verifikasi: tidak ada document dengan categoryId=null DAN productTypeId=null

Test:
[ ] Integration test: create mapping dengan productTypeId saja (tanpa categoryId) → berhasil
[ ] Integration test: import endpoint setelah grace period → 403 Forbidden
```

---

### ✅ Checklist Phase 6

```
Setelah deploy Phase 6:

Code yang HARUS dihapus (bukan deprecated, bukan disabled — dihapus):
[ ] ImportWizardController.java — file dihapus
[ ] CategoryImportService.java — file dihapus (verifikasi 0 caller dulu)
[ ] ImportWizardRequest.java, ImportWizardResponse.java — file dihapus
[ ] Semua channelCategoryMappingRepository.findByCategoryIdAndStoreId() calls di publish service — dihapus
[ ] DriftDetectionJob.java — dihapus atau @ConditionalOnProperty disabled
[ ] CategorySyncJob push-out logic — dihapus

Database cleanup:
[ ] Verifikasi 100% channel listing records punya channelCategoryId (tidak null)
    → jika ada yang null: investigate dan fix sebelum hapus fallback code
[ ] Rename channel_category_mappings → channel_category_mappings_archive_2026
[ ] Set TTL 3 tahun pada archive collection
[ ] Drop index-index lama yang hanya dipakai oleh mapping table

Verifikasi tidak ada orphan:
[ ] grep -r "channel_category_mappings" --include="*.java" | grep -v "archive\|test"
    → harus 0 hasil
[ ] grep -r "ImportWizard\|CategoryImport\|startImport\|confirmImport\|previewImport" \
         --include="*.java" | grep -v "test\|archive"
    → harus 0 hasil
[ ] grep -r "DriftDetection\|CategorySyncJob" --include="*.java" | grep -v "test\|archive"
    → harus 0 hasil (atau hanya di @ConditionalOnProperty disabled beans)

Integration test setelah cleanup:
[ ] Publish produk ke Shopee → channel category ter-set dari listing record (bukan mapping table)
[ ] Verifikasi mapping table tidak di-write saat publish
```

---

## Anti-Pattern: Tanda-Tanda Kode Storefront yang Tertinggal

Gunakan grep berikut secara berkala untuk mendeteksi kode storefront yang belum dibersihkan:

```bash
# 1. Kode yang masih membaca channel category dari mapping table saat publish
grep -r "categoryMappingRepository\|channel_category_mappings" \
     src/main/java --include="*.java" | grep -v "archive\|test\|// TODO"

# 2. Kode yang masih push category ke channel (Type 2 tidak boleh di-push)
grep -r "pushCategory\|syncCategory\|CategoryPushJob" \
     src/main/java --include="*.java"

# 3. Import wizard yang masih bisa diakses tanpa guard
grep -r "startImport\|confirmImport\|previewImport" \
     src/main/java --include="*.java" | grep -v "assertImportAllowed\|DEPRECATED"

# 4. Hard-coded channel type checks (ini adalah storefront pattern — seharusnya data-driven)
grep -r '"shopify"\|"woocommerce"\|"amazon"' \
     src/main/java --include="*.java" | grep "if\|switch\|equals" | grep -v "test\|config"

# 5. Platform category dijadikan required FK di tempat yang baru
grep -r "product_categories\|categoryId" \
     src/main/java --include="*.java" | grep "@NotNull\|required = true" | grep -v "test"
```

Jika ada hasil dari grep 1, 2, atau 3 setelah phase yang seharusnya sudah membersihkannya
→ itu adalah technical debt yang harus di-address sebelum phase berikutnya dimulai.

---

## Dokumen Terkait

| Dokumen | Isi |
|---|---|
| `01-guides/11-category-architecture-analysis.md` | Analisis lengkap mengapa arsitektur harus berubah |
| `01-guides/12-category-evolution-roadmap.md` | Roadmap phase-by-phase dengan framing storefront → Ginee-like |
| `07-channel-category-api-config.md` | Spec `treeCapable` field (Phase 4) |
| `04-channel-category-mapping.md` | Spec collection `channel_category_mappings` saat ini |
| `02-product-types.md` | Spec collection `product_types` saat ini |
