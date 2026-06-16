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

## Phase 1 — Hapus Asumsi: Import adalah Migrasi Website Ongoing

**Status: Frontend diimplementasi sebagai Opsi A — additive-only (2026-06-15). Backend pending.**

**Keputusan desain:** Implementasi awal (grace period 14 hari + lock) digantikan dengan
**Opsi A — additive-only**. Import dari channel boleh dijalankan kapan saja, tapi backend
hanya membuat platform categories baru — tidak menimpa atau menduplikasi yang sudah ada.

Alasan perubahan: 14-hari lock terlalu membatasi merchant untuk pure channel management tool.
Yang perlu dicegah bukan frekuensi import — cukup pastikan channel tidak menjadi master.
Additive-only sudah menjamin itu tanpa friction.

---

### Perubahan backend yang diperlukan (Opsi A)

#### 1.1 Hapus `assertImportAllowed()` jika sudah diimplementasikan

Jika backend sudah mengimplementasikan `categorySourceOrigin` enforcement, hapus panggilan
`assertImportAllowed()` dari semua 3 import endpoints. Import harus bisa dijalankan kapan saja.

#### 1.2 Tambah additive-only check di `CategoryImportService.startImport()`

```java
// CategoryImportService.java

public ImportResult startImport(ImportCategoriesRequest request) {
    List<String> created = new ArrayList<>();
    List<String> skipped = new ArrayList<>();

    for (String externalId : request.getSelectedExternalIds()) {
        // Skip jika mapping dengan externalId ini sudah ada untuk store ini
        boolean alreadyMapped = channelCategoryMappingRepository
            .existsByOrganizationIdAndStoreIdAndExternalId(
                request.getOrganizationId(),
                request.getStoreId(),
                externalId
            );
        if (alreadyMapped) { skipped.add(externalId); continue; }

        // Skip jika platform category dengan slug yang sama sudah ada
        ImportableCollection col = getCollectionByExternalId(request.getStoreId(), externalId);
        String slug = slugify(col.getExternalName());
        boolean slugExists = productCategoryRepository
            .existsByOrganizationIdAndSlug(request.getOrganizationId(), slug);
        if (slugExists) { skipped.add(externalId); continue; }

        // Buat platform category baru + mapping (logika existing)
        createCategoryAndMapping(request, col);
        created.add(externalId);
    }

    return new ImportResult(created.size(), skipped.size(), created);
}
```

**Response `POST /import` diperbarui:**
```json
{
  "importedCount": 12,
  "skippedCount":   3,
  "categoryIds":   ["cat_1", "cat_2", ...]
}
```

Frontend sudah membaca `skippedCount` dari response (`result.skippedCount ?? 0`) dan
menampilkannya di done step sebagai "N skipped (already imported)".

#### 1.3 Tambah `alreadyImported` flag ke `previewImport` response

```java
// ImportPreviewItemDto.java — tambah field
private boolean alreadyImported;

// Di CategoryImportService.previewImport():
for (ImportableCollection col : collections) {
    boolean alreadyMapped = channelCategoryMappingRepository
        .existsByOrganizationIdAndStoreIdAndExternalId(orgId, storeId, col.getExternalId());
    items.add(ImportPreviewItemDto.builder()
        .externalId(col.getExternalId())
        .externalName(col.getExternalName())
        .externalSlug(col.getExternalSlug())
        .collectionType(col.getCollectionType())
        .productCount(col.getProductCount())
        .alreadyImported(alreadyMapped)   // NEW
        .build()
    );
}
```

Frontend menampilkan collections dengan `alreadyImported: true` sebagai greyed-out chips
dengan badge "already imported" dan `disabled` checkbox — tidak bisa dipilih ulang.

#### 1.4 Deprecate `POST /organizations/{orgId}/category-origin`

Endpoint ini tidak lagi dipakai oleh frontend. Tambahkan `@Deprecated` annotation dan
log warning. Jangan hapus — data yang sudah ada di MongoDB tidak perlu dibersihkan.
Field `categorySourceOrigin` dan `categoryOnboardedAt` di Organization entity bisa
dibiarkan — tidak membahayakan, hanya tidak dipakai.

```java
@Deprecated(since = "Opsi A 2026-06-15", forRemoval = true)
@PostMapping("/{orgId}/category-origin")
public ResponseEntity<?> setCategoryOrigin(...) {
    log.warn("[DEPRECATED] category-origin endpoint called. No longer enforced. org={}", orgId);
    return ResponseEntity.ok().build();  // silent no-op
}
```

### Cleanup Phase 1

Tidak ada yang perlu dihapus segera. Yang sudah dilakukan:

- `assertImportAllowed()` → hapus panggilan dari 3 import endpoints
- `idx_category_source_origin` MongoDB index → dapat di-drop di maintenance window
  (kecil, tidak kritikal)

### ✅ Checklist Phase 1 (Opsi A)

```
Backend:
[ ] assertImportAllowed() dihapus dari 3 import endpoints
[ ] additive-only check di startImport() (skip jika existsByStoreIdAndExternalId)
[ ] alreadyImported field di previewImport response
[ ] POST /category-origin di-deprecate (no-op)
[ ] skippedCount di startImport response

Verifikasi:
[ ] Import WooCommerce collections yang sudah ada → response: importedCount=0, skippedCount=N
[ ] Import WooCommerce collections baru → response: importedCount=N, skippedCount=0
[ ] Preview menampilkan alreadyImported: true untuk collections yang sudah di-import
[ ] Platform categories yang sudah ada tidak tersentuh saat import ulang
[ ] Frontend: collections dengan alreadyImported=true tampil greyed-out, tidak bisa dipilih
```

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

## Phase 5 — Hapus Asumsi: Mapping Page = Hub Map Website Category ke Channel ✅ SELESAI

**Status: Deployed 2026-06-16.**

**Frontend** (selesai 2026-06-15):
- `ChannelCategoryMappingPage` sekarang punya dua tab: "Channel Rules" (primary) + "Platform Categories" (legacy).
- Tab "Channel Rules" menampilkan ProductType × Channel grid, save via Phase 2 `PUT /product-types/{id}/channel-defaults/{channelType}`.
- Import button dihapus dari UI (kode tetap ada di `ImportWizardModal`).
- Import masih bisa diakses via Option A (additive-only) — tidak deprecated di backend karena keputusan Phase 1 Opsi A.

### Yang diimplementasikan

#### ✅ 5.1 + 5.2 — Entity & index baru

`ChannelCategoryMappingDocument` sekarang memiliki dua FK alternatif:

```java
private String categoryId;       // nullable — FK ke product_categories._id (existing, sekarang optional)
private String categoryName;     // denormalized (existing)

private String productTypeId;    // nullable — FK ke product_types._id  (NEW Phase 5)
private String productTypeName;  // denormalized name                   (NEW Phase 5)
private String externalFullPath; // "Pakaian > Pria > Atasan > Kaos"   (NEW Phase 5)
```

XOR validation di `linkByProductType()` service (categoryId XOR productTypeId).

Indexes:
```
idx_category_store   → {categoryId, storeId}  unique, sparse=true  (sparse ditambah agar null categoryId diperbolehkan)
idx_product_type_store → {productTypeId, storeId}  unique, sparse=true  (NEW)
```

Kedua index dibuat otomatis oleh Spring Data MongoDB via `@CompoundIndex` pada startup.

#### ✅ 5.3 — Endpoint baru

```
POST /api/v1/admin/channel-category-mappings/product-type
Body: { productTypeId, storeId, organizationId, externalId, externalName, externalFullPath }
201: ChannelCategoryMappingDocument
404: productType atau store tidak ditemukan
409: (productTypeId × storeId) sudah ada
```

Validasi: productType exist check + store exist + org scope + duplicate guard.

#### ✅ 5.4 — Repository methods untuk productTypeId

```java
findByProductTypeId(productTypeId)
findByOrganizationIdAndProductTypeId(orgId, productTypeId)
existsByProductTypeIdAndStoreId(productTypeId, storeId)
```

`recomputeSyncSummary(categoryId)` diberi null guard — productType-based mappings
(categoryId=null) tidak memicu recompute yang tidak perlu.

#### ➡️ 5.5 — Import endpoints: TIDAK deprecated (superseded by Opsi A)

Berdasarkan keputusan Phase 1 Opsi A, import boleh dijalankan kapan saja (additive-only).
Import endpoints TIDAK deprecated dan TIDAK dihapus di Phase 6.
Spec lama yang menyebut deprecation ini tidak berlaku lagi.

### Cleanup Phase 5 — status

#### ✅ CategorySyncJob push-out untuk Type 2 — sudah clean

`ChannelCategoryPushService.pushSingle()` switch default = no-op untuk semua channel
selain Shopify + WooCommerce. Tidak ada cleanup yang diperlukan.

#### ✅ Query logic — consolidated

Dua path query (by categoryId, by productTypeId) sudah menjadi named method terpisah
di service. Tidak ada inline query duplikasi.

#### ☐ Archive importedFrom=true docs — pending (background script)

```javascript
// Jalankan sebagai background job, bukan sekaligus
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

## Phase 6 — Hapus Asumsi: Channel Category = Derivat dari Platform Taxonomy ✅ SELESAI

**Status: Deployed 2026-06-16.**

**Frontend sudah dilakukan:**
- `BulkAssignTab.tsx` — tab "Bulk Assign" di `ChannelCategoryMappingPage`, product-first flow
- `MasterProductService.bulkAssignChannelCategory()` — pre-wired ke endpoint backend baru

### Yang diimplementasikan

#### ✅ 6.1 + 6.2 — Dedicated fields di `ChannelProductData`

```java
// channel_product_data collection — 3 field baru:
private String channelCategoryId;    // channel-native leaf ID
private String channelCategoryName;  // denormalized display name
private String channelCategoryPath;  // "Pakaian > Pria > Atasan > Kaos"
```

`ChannelStepSaveRequest` sekarang membawa 3 field ini secara eksplisit.
`ChannelProductDataService.saveChannelData()` mempersist ke dedicated fields
(bukan hanya ke `channelData` map generik).

#### ✅ 6.1b — Endpoint baru `POST /api/v1/admin/master-products/bulk-channel-category`

```
Query: organizationId
Body:  { productIds, storeId, channelType, categoryId, categoryName, categoryFullPath }
200:   { updatedCount, failedIds }
```

Partial success OK — per-product failure dicatat di `failedIds` tanpa menghentikan batch.
Implementasi: `ChannelProductDataService.bulkAssignChannelCategory()` via
`repository.updateChannelCategory()` (`@Query + @Update` partial update per product).

#### ✅ 6.4 — Publish pipeline injects dedicated field

`loadAndMergeChannelData()` di `ChannelPublishService` sekarang:
1. Merge `channelData` map (existing behavior)
2. Override dengan `channelCategoryId/Name/Path` dari dedicated field jika non-null

Priority: dedicated field > channelData map > null (tidak ada channel category).

#### ✅ Storage path — already Ginee-like

`CategoryTreePicker` di Step 2 menyimpan hasil ke `channel_product_data.channelData` (via
`ChannelStepSaveRequest.channelData`). Publish pipeline sudah membaca dari `channelData` —
TIDAK ada dependency pada `channel_category_mappings` di publish path.

### Cleanup Phase 6 — status

#### ☐ Data migration — optional, run as background script

Migrate data lama dari `channelData["channelCategoryId"]` ke dedicated field:
```javascript
db.channel_product_data.find({ 
  "channelData.channelCategoryId": { $exists: true },
  "channelCategoryId": { $exists: false }
}).forEach(doc => {
  db.channel_product_data.updateOne(
    { _id: doc._id },
    { $set: {
        channelCategoryId:   doc.channelData.channelCategoryId,
        channelCategoryName: doc.channelData.channelCategoryName,
        channelCategoryPath: doc.channelData.channelCategoryPath
    }}
  );
});
```

#### ☐ Archive `channel_category_mappings` — pending (tidak kritikal)

Collection ini tidak lagi dibaca oleh publish pipeline.
Archive saat semua merchants selesai transisi (lihat Cleanup Phase 5).

#### ➡️ ImportWizardController / CategoryImportService — tetap aktif (Opsi A)

Berdasarkan keputusan Phase 1 Opsi A, import tetap aktif (additive-only).
TIDAK dihapus di Phase 6.

---

### Langkah 0 — Verifikasi storage path (SELESAI 2026-06-16)

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

#### 6.1b Endpoint baru — `POST /admin/master-products/bulk-channel-category`

**Frontend sudah pre-wired untuk endpoint ini. Backend perlu mengimplementasikan.**

```java
// MasterProductAdminController.java

@PostMapping("/bulk-channel-category")
public Mono<BulkChannelCategoryResponse> bulkAssignChannelCategory(
    @RequestParam String organizationId,
    @RequestBody BulkChannelCategoryRequest request
) {
    return masterProductService.bulkAssignChannelCategory(organizationId, request);
}

// BulkChannelCategoryRequest.java
public record BulkChannelCategoryRequest(
    List<String> productIds,
    String storeId,
    String channelType,
    String categoryId,        // channel-native leaf node ID
    String categoryName,
    String categoryFullPath
) {}

// BulkChannelCategoryResponse.java
public record BulkChannelCategoryResponse(
    int updatedCount,
    List<String> failedIds    // IDs yang gagal diupdate (partial success OK)
) {}
```

**Logika:** Untuk setiap `productId`, upsert `channel_product_data` record dengan
field `categoryId`, `categoryName`, `categoryFullPath`. Identik dengan
`/channel-product-data/save` tapi batch. Gagal per-produk tidak menghentikan batch —
simpan ke `failedIds`.

```java
// ChannelProductDataService.java
public BulkChannelCategoryResponse bulkAssignChannelCategory(
    String organizationId,
    BulkChannelCategoryRequest req
) {
    List<String> created = new ArrayList<>();
    List<String> failed  = new ArrayList<>();

    for (String productId : req.productIds()) {
        try {
            channelProductDataRepository.upsertCategoryId(
                productId, req.storeId(), req.channelType(),
                req.categoryId(), req.categoryName(), req.categoryFullPath()
            );
            created.add(productId);
        } catch (Exception e) {
            log.warn("bulk-channel-category: failed for product={}", productId, e);
            failed.add(productId);
        }
    }
    return new BulkChannelCategoryResponse(created.size(), failed);
}
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

### ✅ Checklist Phase 5 — DEPLOYED 2026-06-16

```
Code:
[x] categoryId logically nullable di ChannelCategoryMappingDocument (sparse index memperbolehkan)
[x] productTypeId + productTypeName + externalFullPath ditambahkan ke entity
[x] Validasi XOR (categoryId XOR productTypeId) di linkByProductType() service
[x] POST /api/v1/admin/channel-category-mappings/product-type endpoint tersedia
    → 404 jika productType/store tidak ada, 409 jika duplicate
[x] Import endpoints TIDAK deprecated — superseded oleh Opsi A (import tetap aktif, additive-only)
[x] findByProductTypeId, findByOrgAndProductTypeId, existsByProductTypeIdAndStoreId di repository

Cleanup:
[x] CategorySyncJob push-out sudah clean (ChannelCategoryPushService switch default = no-op)
[x] Query logic consolidated — tidak ada inline duplication
[ ] Archive importedFrom=true docs age > 1 tahun — pending background script

Database:
[x] @CompoundIndex idx_product_type_store (unique, sparse) pada ChannelCategoryMappingDocument
[x] @CompoundIndex idx_category_store (unique, sparse=true) — ditambah sparse untuk null categoryId
[ ] Script verifikasi: tidak ada document dengan categoryId=null DAN productTypeId=null

Test:
[ ] Integration test: POST /product-type → 201, query by productTypeId → found
[ ] (N/A) Integration test: import endpoint setelah grace period → dihapus (Opsi A)
```

---

### ✅ Checklist Phase 6 — DEPLOYED 2026-06-16

```
Code:
[x] channelCategoryId/Name/Path fields ditambahkan ke ChannelProductData entity
[x] ChannelStepSaveRequest membawa 3 field eksplisit
[x] saveChannelData() mempersist ke dedicated fields
[x] repository.updateChannelCategory() (@Query+@Update partial update)
[x] POST /api/v1/admin/master-products/bulk-channel-category endpoint tersedia
[x] loadAndMergeChannelData() di ChannelPublishService inject dedicated fields

Verifikasi:
[x] Publish pipeline TIDAK membaca channel_category_mappings (sudah clean sebelum Phase 6)
[ ] Integration test: save Step 2 dengan channelCategoryId → publish mengirim channelCategoryId ke channel API
[ ] Integration test: bulk-channel-category → updatedCount=N, failedIds=[]

Database cleanup (pending — tidak blocking):
[ ] Run migration script: channelData["channelCategoryId"] → dedicated field
[ ] Archive channel_category_mappings → channel_category_mappings_archive_2026
[ ] Set TTL 3 tahun pada archive collection

Import endpoints (Opsi A — tetap aktif, TIDAK dihapus):
[ ] (N/A) ImportWizardController / CategoryImportService — tetap ada, Opsi A keputusan
[ ] (N/A) DriftDetectionJob — tetap ada (masih relevan untuk import-capable channels)
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
