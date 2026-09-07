# Backend Cleanup — Channel Category Mapping Post-Phase-6

> **✅ EXECUTED (2026-08-21).** Fitur `channel_category_mappings` dihapus dari backend: `ChannelCategoryMappingAdminController`
> (`/api/v1/admin/channel-category-mappings`), `ChannelCategoryMappingService`, `ChannelCategoryMappingRepository`,
> `ChannelCategoryMappingDocument`, `ProductTypeMappingRequest`. Sumber tunggal category→productType kini
> `product_types.channelCategoryDefaults` (dibaca Step 2 & reverse import). Koleksi `channel_category_mappings`
> **tak pernah ada di Mongo** (fitur inert sejak awal) → tak ada data yang perlu dihapus. Rencana di bawah = arsip.

**Untuk:** Backend Engineering Team  
**Tanggal:** 2026-06-16  
**Trigger:** Frontend Phase 5+6 complete — Platform Categories tab dihapus, `ChannelFieldsWizard.tsx`
pre-fill code path dari `channel_category_mappings` dihapus.

**Referensi:**
- `12-category-evolution-roadmap.md` — Phase 5 & 6 selesai
- `04-channel-category-mapping.md` — dokumentasi lama (masih valid untuk taxonomy endpoint)
- `10-category-transition-backend.md` — Phase 6 bulk-channel-category endpoint

---

## Ringkasan Situasi

### Yang dihapus dari frontend

| File frontend | Yang dihapus |
|---|---|
| `ChannelCategoryMappingPage.tsx` | Seluruh "Platform Categories" legacy tab |
| `ChannelFieldsWizard.tsx` | Pre-fill block yang membaca `channel_category_mappings` untuk pre-fill CategoryTreePicker di Step 2 |
| `DriftResolutionModal.tsx` | Dihapus |
| `TaxonomyMapperModal.tsx` | Dihapus |
| `CollectionMapperModal.tsx` | Dihapus |
| `ImportWizardModal.tsx` | Dihapus |
| `channel-mapping.service.ts` | Semua method kecuali `browseTaxonomy` |

### Yang masih dipakai dari frontend

| Endpoint | Dipakai oleh |
|---|---|
| `GET /taxonomy/{channelType}/children` | `CategoryBrowseModal` (ProductTypeRulesTab + BulkAssignTab) |

---

## 1. Endpoints yang Bisa Dihapus

Tidak ada satupun frontend consumer untuk endpoint-endpoint ini. Verifikasi tidak ada consumer
lain (mobile app, third-party integration, internal tools) sebelum hapus.

### `ChannelCategoryMappingAdminController` — semua kecuali taxonomy

| Endpoint | Method | Dapat dihapus? |
|---|---|---|
| `/admin/channel-category-mappings` | GET | ✅ Ya — listAll tidak dipakai |
| `/admin/channel-category-mappings?categoryId=` | GET | ✅ Ya — ChannelFieldsWizard pre-fill sudah dihapus |
| `/admin/channel-category-mappings/import/preview` | GET | ✅ Ya — ImportWizardModal dihapus |
| `/admin/channel-category-mappings/import` | POST | ✅ Ya — ImportWizardModal dihapus |
| `/admin/channel-category-mappings/import/confirm` | POST | ✅ Ya — ImportWizardModal dihapus |
| `/admin/channel-category-mappings/second-channel/preview` | GET | ✅ Ya — TaxonomyMapperModal dihapus |
| `/admin/channel-category-mappings/second-channel` | POST | ✅ Ya — TaxonomyMapperModal dihapus |
| `/admin/channel-category-mappings/{id}/drift/resolve` | PATCH | ✅ Ya — DriftResolutionModal dihapus |
| `/admin/channel-category-mappings/sync-all` | POST | ✅ Ya — Sync All button dihapus |
| `/admin/channel-category-mappings/{id}` | DELETE | ✅ Ya — Unmap flow dihapus |
| **`/admin/channel-category-mappings/taxonomy/{channelType}/children`** | **GET** | **⛔ JANGAN HAPUS** |

**Cara hapus yang aman:** Tambahkan `@Deprecated` + `@Hidden` (Swagger) terlebih dahulu,
monitor satu sprint, lalu hapus code.

```java
@Deprecated(since = "2026-06-16", forRemoval = true)
@Hidden  // hilangkan dari Swagger
@GetMapping
public Mono<ResponseEntity<List<ChannelCategoryMappingDto>>> listAll(...) {
    log.warn("[DEPRECATED] channel-category-mappings listAll called — no frontend consumer");
    ...
}
```

### `GET /admin/product-categories/slugs`

Endpoint ini dipakai di fallback path `ChannelFieldsWizard.tsx` yang sudah dihapus:

```typescript
// DIHAPUS dari ChannelFieldsWizard.tsx:
const slugsRes = await fetch(
  `${BASE_API}/admin/product-categories/slugs?organizationId=...`
);
```

**Verifikasi:** Cek apakah endpoint ini masih dipakai di tempat lain (misalnya mobile app
atau internal admin tools) sebelum hapus. Jika tidak ada consumer lain → hapus.

---

## 2. Services yang Sebagian Besar Dead

### `ChannelCategoryImportService`

Semua method berikut tidak lagi dipanggil dari luar:

```java
// Semua method ini dapat dihapus:
previewImport(storeId, organizationId)           // import/preview endpoint
startImport(request)                             // import endpoint
confirmImport(request)                           // import/confirm endpoint
previewSecondChannel(storeId, organizationId)    // second-channel/preview endpoint
mapSecondChannel(request)                        // second-channel endpoint
syncStoreForDrift(storeId, organizationId)       // sync-all endpoint
resolveDrift(mappingId, request)                 // drift/resolve endpoint
deleteMapping(mappingId)                         // DELETE endpoint
```

**Yang perlu dipertahankan:**
```java
// JANGAN HAPUS — dipakai oleh taxonomy children endpoint via ChannelTaxonomyService:
// (tidak ada method di ChannelCategoryImportService yang terkait taxonomy)
// ChannelTaxonomyService adalah service TERPISAH — aman
```

### `ChannelCategoryMappingAdminController`

Setelah hapus semua deprecated endpoints di atas, controller ini hanya menyisakan satu method:
```java
@GetMapping("/taxonomy/{channelType}/children")
```

**Pertimbangkan:** Pindahkan endpoint ini ke controller yang lebih tepat, misalnya
`ChannelMerchantDataController` atau `ChannelCategoryController`. Atau biarkan di sini
dengan rename controller menjadi `ChannelTaxonomyAdminController`.

---

## 3. Scheduled Jobs — Nonaktifkan

### `CategorySyncJob`

Job ini melakukan sync platform categories ke channel stores (push-out). Tidak ada lagi
UI untuk mengelola platform category → channel mappings.

```java
// CategorySyncJob.java
@Scheduled(cron = "${jobs.category-sync.cron:0 0 2 * * ?}")
public void syncCategories() { ... }
```

**Action:** Nonaktifkan via `@ConditionalOnProperty`:

```java
@ConditionalOnProperty(name = "jobs.category-sync.enabled", havingValue = "true", matchIfMissing = false)
@Component
public class CategorySyncJob { ... }
```

Dan di `application.properties`:
```properties
# Disabled 2026-06-16: frontend Platform Categories tab removed
jobs.category-sync.enabled=false
```

### `CategoryDriftPollingJob`

Job ini mendeteksi drift (perubahan nama category di channel) dan mengupdate
`syncStatus = DRIFTED` di `channel_category_mappings`. Tidak ada lagi UI untuk
menampilkan atau menyelesaikan drift.

```java
@Scheduled(cron = "${jobs.category-drift-polling.cron:0 0 */6 * * ?}")
public void pollForDrift() { ... }
```

**Action:** Nonaktifkan dengan cara yang sama:
```properties
# Disabled 2026-06-16: DriftResolutionModal removed from frontend
jobs.category-drift-polling.enabled=false
```

---

## 4. MongoDB — `channel_category_mappings` Collection

### Jangan drop sekarang

Data yang sudah tersimpan di collection ini masih valid untuk audit history. Sebelum
archive, pastikan merchant sudah migrasi channel category ke jalur baru:

```
Jalur lama: channel_category_mappings (platform category → channel externalId)
Jalur baru: channel_product_data[storeId].channelData[CATEGORY_TREE_fieldName] (per produk)
```

Migrasi dilakukan via **Bulk Assign tab** (Phase 6 frontend). Backend perlu deploy
`POST /admin/master-products/bulk-channel-category` terlebih dahulu agar merchant bisa
bulk-assign channel categories langsung ke channel_product_data.

### Setelah merchant migrasi — archive collection

```javascript
// Langkah 1: Rename collection (bukan drop)
db.channel_category_mappings.renameCollection("channel_category_mappings_archive");

// Langkah 2: Set TTL 1 tahun pada archive (opsional, untuk auto-cleanup)
db.channel_category_mappings_archive.createIndex(
  { "updatedAt": 1 },
  { expireAfterSeconds: 31536000, name: "ttl_1year" }
)
```

### Indexes yang bisa di-drop sekarang

Collection sudah tidak ditulis oleh backend (setelah endpoints dihapus). Indexes
mengonsumsi memori dan memperlambat write operation.

```javascript
// Drop semua indexes kecuali _id (hapus setelah endpoints dihapus):
db.channel_category_mappings.dropIndex("idx_store_external_unique")  // { storeId, externalId }
db.channel_category_mappings.dropIndex("idx_store_status")           // { storeId, syncStatus }
db.channel_category_mappings.dropIndex("idx_category_id")            // { categoryId }
db.channel_category_mappings.dropIndex("idx_category_status")        // { categoryId, syncStatus }

// Verifikasi nama index yang aktual:
db.channel_category_mappings.getIndexes()
```

**Timing:** Drop indexes SETELAH semua deprecated endpoints di-remove. Endpoint yang masih
aktif mungkin masih query collection ini.

---

## 5. Seeder Revisions

### `CategoryApiConfigDataLoader` — `importWizardConfig` tidak lagi dipakai

`importWizardConfig` pada `ChannelCategoryApiConfig` dipakai oleh `ChannelCategoryImportService`
untuk batch import wizard. Service ini akan dihapus.

```java
// CategoryApiConfigDataLoader.java
// FIELD YANG TIDAK LAGI DIPAKAI:
.importWizardConfig(ImportWizardConfig.builder()
    .batchSize(100)
    .maxCollectionsPerImport(500)
    ...
    .build())
```

**Action:** Setelah `ChannelCategoryImportService` dihapus:
- Hapus `importWizardConfig` dari seeder
- Hapus `ImportWizardConfig` class
- Drop `importWizardConfig` dari `channel_category_api_config` documents:

```javascript
db.channel_category_api_config.updateMany({}, { $unset: { "importWizardConfig": "" } })
```

### `ChannelTaxonomyIndexMigration` — JANGAN HAPUS

Migration ini membuat indexes pada `channel_category_cache` (bukan `channel_category_mappings`).
`channel_category_cache` masih digunakan oleh taxonomy browser endpoint. Pertahankan.

### `PlatformCategoryTemplateDataLoader` — HAPUS

~~Merchant categories (`/channels/categories`) masih ada.~~ **UPDATE 2026-06-17:** Merchant
categories juga sudah dihapus. DataLoader sudah dikonversi no-op (Sprint 2 doc 14).
Lihat `15-platform-admin-components-cleanup.md` untuk rekomendasi lengkap penghapusan
`PlatformCategoryTemplateAdminController` + collection archiving.

---

## 6. Yang Masih Dibutuhkan — Jangan Hapus

| Komponen | Alasan masih dibutuhkan |
|---|---|
| `GET /taxonomy/{channelType}/children` | `CategoryBrowseModal` di ProductTypeRulesTab + BulkAssignTab |
| `ChannelTaxonomyService` | Dipakai taxonomy children endpoint |
| `channel_category_cache` collection | Cache untuk taxonomy browser |
| `ChannelTaxonomyCacheRepository` | Dipakai `ChannelTaxonomyService` |
| `ChannelTaxonomyIndexMigration` | Indexes untuk `channel_category_cache` |
| `CategoryApiConfigDataLoader` (treeApiConfig) | Konfigurasi taxonomy fetch per channel |
| `PlatformCategoryTemplateDataLoader` | Onboarding merchant baru |

---

## 7. Endpoint Baru yang Diperlukan (Belum Deployed)

**`POST /admin/master-products/bulk-channel-category`** — spesifikasi lengkap ada di
`12-product-type-category-default-backend.md §6.1b`.

Ini adalah blocker untuk merchant dapat melakukan migrasi data dari `channel_category_mappings`
ke `channel_product_data`. Tanpa endpoint ini, BulkAssign tab tidak bisa menulis ke backend
dan merchant tidak bisa menggantikan alur lama.

---

## Urutan Eksekusi yang Disarankan

```
Sprint 1 — DEPLOYED 2026-06-16:
  [x] Tambahkan @Deprecated(since="2026-06-16", forRemoval=true) + log.warn ke 10 endpoints
  [x] Nonaktifkan CategorySyncJob via @ConditionalOnProperty(jobs.category-sync.enabled=false)
  [x] Nonaktifkan CategoryDriftPollingJob via @ConditionalOnProperty(jobs.category-drift-polling.enabled=false)
  [x] application.yml: jobs.category-sync.enabled=false, jobs.category-drift-polling.enabled=false
  [ ] Monitor — pastikan tidak ada WARN log dari endpoint-endpoint deprecated yang masih dipanggil

Sprint 2 — DEPLOYED 2026-06-16:
  [x] POST /admin/master-products/bulk-channel-category deployed (Phase 6)
  [ ] Merchant mulai jalankan Bulk Assign untuk migrasi data existing

Sprint 3 (setelah merchant selesai migrasi):
  [ ] Hapus 10 deprecated endpoints
  [ ] Hapus ChannelCategoryImportService methods
  [ ] Drop indexes pada channel_category_mappings
  [ ] Hapus importWizardConfig dari CategoryApiConfigDataLoader
  [ ] Archive channel_category_mappings collection

Sprint 4 (cleanup final):
  [ ] Hapus ImportWizardConfig class
  [ ] Pertimbangkan rename/pindahkan taxonomy endpoint ke controller lebih tepat
  [ ] Hapus GET /admin/product-categories/slugs jika tidak ada consumer lain
  [ ] Update ChannelSyncSummary di ProductCategoryDocument (field masih ada tapi tidak diupdate lagi)
```

---

## Catatan: `ChannelSyncSummary` di ProductCategory

Frontend `product-categories/_types/category.ts` masih punya:
```typescript
channelSyncSummary?: ChannelSyncSummary;
```

Ini adalah field denormalized yang diisi oleh backend setiap kali ada perubahan mapping.
Setelah `channel_category_mappings` di-archive, backend tidak lagi mengupdate field ini.

**Action di backend:** Setelah Sprint 3, hentikan update `channelSyncSummary` di
`ProductCategoryDocument`. Field bisa dibiarkan null — frontend tidak merendernya
secara prominent, hanya tersedia di type definition.
