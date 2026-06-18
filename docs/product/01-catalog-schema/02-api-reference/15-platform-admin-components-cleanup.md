# Platform Admin — Cleanup After Product Categories Removal

**Untuk:** Backend Engineering Team + Internal Reference  
**Tanggal:** 2026-06-17  
**Trigger:** Analisis komprehensif platform-admin dan omni-admin components setelah
`product_categories` dihapus (2026-06-16). Frontend cleanup selesai hari ini.

**Referensi:**
- `14-product-categories-migration-backend.md` — migrasi product_categories → tags + ProductType
- `13-channel-category-mapping-backend-cleanup.md` — cleanup channel_category_mappings

---

## Ringkasan — Apa yang Dianalisis

| Komponen | Verdict | Alasan |
|---|---|---|
| `platform-admin/category-templates` | **HAPUS** ✅ sudah dihapus | Manages `platform_category_templates` → provisioning `product_categories` ke merchant orgs. Keduanya sudah dihapus. |
| `omni-admin/channel-category-mapping` | **PERTAHANKAN** — rename | Tabs (ProductTypeRules + BulkAssign) operate on channel categories, bukan platform categories. Masih valid. |
| `ChannelSyncSummary` type | **HAPUS** ✅ sudah dihapus | Tracking sync platform category → channel category. Dead dengan `channel_category_mappings` di-archive. |
| `platform-admin/channel-category-api-configs` | **PERTAHANKAN** | Configures channel category tree APIs (Shopee, Amazon, TikTok). Tidak ada hubungan dengan platform categories. |
| `platform-admin/channel-category-schemas` | **PERTAHANKAN** | Channel-specific schema extensions per category. Tidak ada hubungan dengan platform categories. |

---

## 1. Frontend — Yang Sudah Dihapus (2026-06-17)

### 1.1 `platform-admin/category-templates` — Seluruh Section Dihapus

**File yang dihapus:**
```
src/app/(admin)/platform-admin/category-templates/
  page.tsx
  _components/PlatformCategoryTemplatesPage.tsx
  _components/AddEditTemplateModal.tsx
  _components/ProvisionPanel.tsx
  _services/platform-category-templates.service.ts
  _types/platform-category-template.ts
```

**Sidebar:** Entry "Category Templates" dihapus dari Platform Admin nav.

**Mengapa:** Section ini adalah UI untuk mengelola canonical category tree (`platform_category_templates`
collection) dan memprovision tree tersebut ke merchant orgs (`product_categories` collection).
Kedua collections ini sudah tidak ada lagi. `PlatformCategoryTemplateDataLoader` sudah
dikonversi menjadi no-op (Sprint 2 di doc 14). Provision/forceProvision endpoints sudah tidak
punya UI consumer.

---

### 1.2 `ChannelSyncSummary` Type — Dihapus

**File:** `src/app/(admin)/omni-admin/channel-category-mapping/_types/channel-mapping.ts`

```typescript
// DIHAPUS — tidak ada consumer lagi:
export interface ChannelSyncSummary {
  totalMapped: number;
  totalDrifted: number;
  totalUnmapped: number;
  lastSyncedAt: string | null;
}
```

Type ini di-populate backend setiap kali ada perubahan di `channel_category_mappings`
(platform category → channel category sync). Collection tersebut sedang dalam proses
archive (doc 13 Sprint 3). Tidak ada UI yang render data ini setelah product-categories
UI dihapus.

---

### 1.3 `omni-admin/channel-category-mapping` — Rename Saja

**Tidak ada file yang dihapus.** Kedua tabs masih valid:

| Tab | Apa yang dilakukan | Bergantung pada platform categories? |
|---|---|---|
| **Channel Rules** (`ProductTypeRulesTab`) | Set default channel category per ProductType × Channel. Pre-fills `CATEGORY_TREE` di Step 2 wizard. | Tidak — operates on ProductType dan channel taxonomy |
| **Bulk Assign** (`BulkAssignTab`) | Bulk assign channel categories ke multiple products langsung | Tidak — writes ke `channel_product_data[storeId].channelData[categoryField]` |

**Yang diubah:**
- Page title: "Channel Category Mapping" → **"Channel Category Rules"**
- Sidebar label: sama
- Route URL tidak berubah (`/omni-admin/channel-category-mapping`)

---

## 2. Backend — Rekomendasi Cleanup

### 2.1 `PlatformCategoryTemplateDataLoader` — Hapus Sepenuhnya

Doc 14 Sprint 4 sudah mencantumkan ini, diperkuat sekarang:

```java
// PlatformCategoryTemplateDataLoader.java
// Status: sudah dikonversi no-op di Sprint 2 (2026-06-17)
// Action: HAPUS class ini sepenuhnya
//
// Tidak ada UI consumer untuk:
// - loadTemplates()
// - provision(orgId)
// - forceProvision(orgId)
```

---

### 2.2 Provision / ForceProvision Endpoints — Hapus

Frontend consumer sudah dihapus. Tidak ada yang memanggil endpoint-endpoint ini.

```java
// PlatformCategoryTemplateAdminController.java — HAPUS class ini
@GetMapping("/admin/platform-category-templates")
Mono<List<PlatformCategoryTemplateDto>> getTree() { ... }          // Tidak ada consumer

@GetMapping("/admin/platform-category-templates/org-status")
Mono<List<OrgProvisionStatusDto>> getOrgStatus() { ... }           // Tidak ada consumer

@PostMapping("/admin/platform-category-templates")
Mono<PlatformCategoryTemplateDto> create(...) { ... }              // Tidak ada consumer

@PatchMapping("/admin/platform-category-templates/{id}")
Mono<PlatformCategoryTemplateDto> update(...) { ... }              // Tidak ada consumer

@DeleteMapping("/admin/platform-category-templates/{id}")
Mono<Void> delete(...) { ... }                                      // Tidak ada consumer

@PostMapping("/admin/platform-category-templates/provision")
Mono<ProvisionResultDto> provision(...) { ... }                    // Tidak ada consumer

@PostMapping("/admin/platform-category-templates/force-provision")
Mono<ForceProvisionResultDto> forceProvision(...) { ... }          // Tidak ada consumer
```

**Cara hapus yang aman:**
```java
@Deprecated(since = "2026-06-17", forRemoval = true)
@Hidden  // hilangkan dari Swagger
public class PlatformCategoryTemplateAdminController { ... }
```

Monitor satu sprint, lalu hapus class + service + repository.

---

### 2.3 `platform_category_templates` Collection — Archive

Collection ini menyimpan canonical category tree yang di-provision ke merchant orgs.
Tidak ada lagi code yang membaca atau menulis collection ini (DataLoader sudah no-op).

```javascript
// Langkah 1: Verifikasi tidak ada write operations aktif
db.platform_category_templates.getIndexes()  // Cek apakah indexes masih aktif

// Langkah 2: Archive (bukan drop — untuk audit history)
db.platform_category_templates.renameCollection("platform_category_templates_archive_20260617");

// Langkah 3: TTL 6 bulan (opsional)
db.platform_category_templates_archive_20260617.createIndex(
  { "updatedAt": 1 },
  { expireAfterSeconds: 15552000, name: "ttl_6months" }
);
```

---

### 2.4 Related Classes yang Bisa Dihapus

Setelah endpoints dihapus dan DataLoader gone:

| Class | Action |
|---|---|
| `PlatformCategoryTemplateDataLoader` | Hapus |
| `PlatformCategoryTemplateAdminController` | Hapus |
| `PlatformCategoryTemplateService` | Hapus |
| `PlatformCategoryTemplateRepository` | Hapus |
| `PlatformCategoryTemplateDocument` | Hapus |
| `PlatformCategoryTemplateDto` | Hapus |
| `OrgProvisionStatusDto` | Hapus |
| `ForceProvisionResultDto` | Hapus |
| `ProvisionResultDto` | Hapus |

---

### 2.5 `ChannelSyncSummary` di `ProductCategoryDocument` — Stop Update

Doc 13 §Catatan sudah mencatat ini. Diperkuat:

Backend harus berhenti update field `channelSyncSummary` di `ProductCategoryDocument`
setelah `channel_category_mappings` di-archive. Karena `product_categories` collection
juga akan di-archive (doc 14), ini akan resolved secara otomatis.

**Tidak perlu action terpisah** — handled oleh Sprint 4 archiving di doc 13 dan doc 14.

---

## 3. Yang TIDAK Perlu Diubah

### `platform-admin/channel-category-api-configs` — PERTAHANKAN
- Konfigurasi HOW to call Shopee/Amazon/TikTok/eBay/Lazada category tree APIs
- Dipakai oleh `CategoryTreePicker` di Step 2 wizard (Phase 3 Scenario C)
- Dipakai oleh `CategoryBrowseModal` di ProductTypeRulesTab
- Tidak ada hubungan dengan `product_categories` atau `platform_category_templates`

### `platform-admin/channel-category-schemas` — PERTAHANKAN
- Per-channel per-category-slug API schema extensions untuk APM target schema
- Deep-merged onto base `apiSchema` di `ChannelSchemaService.generateComplexTargetSchema()`
- Category slugs yang dipakai ("electronics", "clothing") adalah APM-level — bukan dari `product_categories`
- Tidak ada hubungan dengan platform categories yang dihapus

### `omni-admin/channel-category-mapping` (seluruh fitur) — PERTAHANKAN
- **ProductTypeRulesTab** adalah core fitur untuk pre-fill `CATEGORY_TREE` di Step 2
  via `ProductType.channelCategoryDefaults`
- **BulkAssignTab** adalah jalur migrasi merchant dari `channel_category_mappings` lama
  ke `channel_product_data` baru (doc 13 §4)
- Tanpa BulkAssign tab, merchant tidak bisa migrasi data channel categories mereka

---

## Analisis Koleksi MongoDB yang Diverifikasi Aktif (2026-06-17)

Setelah penghapusan `product_categories` dan `platform_category_templates`, dilakukan analisis
menyeluruh terhadap koleksi-koleksi yang namanya mengandung "category" untuk memastikan
tidak ada yang terdampak.

### `channel_taxonomy_cache` — ✅ Aktif, tidak terkait

- **Diisi oleh:** `ChannelTaxonomyService.fetchAndCacheTaxonomy()` via BFS dari Shopify API
- **Dibaca oleh:** `CategorySearchService` (Shopify taxonomy path), `CategoryCacheServiceImpl`, `ChannelCategoryImportService`
- **Fungsi:** Cache global Shopify product taxonomy (~10k nodes), TTL 7 hari
- **Hubungan dengan product_categories:** Tidak ada. Ini adalah Shopify's own taxonomy, bukan merchant category tree.

### `channel_category_cache` — ✅ Aktif, tidak terkait

- **Diisi oleh:** `CategorySyncJob` (scheduled) + `CategoryCacheServiceImpl` (lazy on cache-miss)
- **Dibaca oleh:** `CategoryController`, `MerchantDataController`, `ChannelProductDataService`, `ChannelStepSchemaService`, `CategorySearchService`
- **Fungsi:** Per-store channel category tree untuk TikTok, Lazada, Shopee, eBay, Amazon — TTL 24 jam
- **Hubungan dengan product_categories:** Tidak ada. Ini adalah channel-side taxonomy untuk `CATEGORY_TREE` picker.

### `channel_category_api_schemas` — ✅ Aktif, tidak terkait

- **Diisi oleh:** `ChannelCategoryApiSchemaDataLoader` @Order(115)
- **Dibaca oleh:** `ChannelSchemaService.generateComplexTargetSchema()` → APM + PublishAnalysisService + ChannelController
- **Fungsi:** Schema extension per `(channelType × categorySlug)` untuk memperkaya JOLT target schema dengan field kategori-spesifik (Amazon Electronics: ModelNumber, eBay Clothing: ItemSpecifics)
- **Category slugs:** Generic APM slugs ("electronics", "clothing") — bukan dari `product_categories`
- **Hubungan dengan product_categories:** Tidak ada.
- **Side effect:** Setiap perubahan dokumen otomatis invalidate `channel_jolt_specs` via `deleteByChannelIdAndCategoryId()`

### `channel_configurations.categoryRequirements` — ✅ Aktif, tidak terkait

- **Dibaca oleh:** `ChannelStepSchemaService` — menambah required/recommended fields di Step 2 form
- **Sumber categorySlug:** `ChannelProductData.channelData["categoryId"]` (Step 2 channel selection) atau Path B taxonomy resolution — bukan dari deprecated `MasterProductData.categoryId`
- **Fungsi:** Menambah field wajib/rekomendasi per kategori channel (e.g., Shopify Clothing: material, care_instructions, size_type)
- **Seeded oleh:** `ChannelCategoryRequirementsMigration` @Order(111) untuk Shopify, WIX, eBay
- **Hubungan dengan product_categories:** Tidak ada. Driven by channel-side category picker.
- **Referensi lengkap:** `setup/02-platform-admin/02-api-reference/05-channel-configurations.md` § `categoryRequirements`

### `channel_configurations.fieldBoosts[].condition` — ✅ Aktif, tidak terkait

- **Format:** `"condition": "category=clothing"` atau `"category=electronics|tech"`
- **Dievaluasi oleh:** `KnowledgeBasedFieldMatchingService.matchesCondition()` selama APM
- **categorySlug sumber:** Dari `PublishAnalysisService.request.getCategoryId()` (APM request) — bukan `product_categories`
- **Hubungan dengan product_categories:** Tidak ada.

---

## 4. Urutan Eksekusi

```
SELESAI (2026-06-17):
  [x] Hapus PlatformCategoryTemplateAdminController + service + repository + document
  [x] Hapus semua DataLoader/Seeder yang sudah no-op
  [x] Hapus OrgProvisioningListener + CategoryProvisioningService
  [x] Compile bersih — BUILD SUCCESS tanpa error

Tersisa (manual — MongoDB):
  [ ] Archive platform_category_templates:
      db.platform_category_templates.renameCollection("platform_category_templates_archive_20260617")
```

---

## 5. Koreksi Analisis Frontend — Verifikasi Backend (2026-06-17)

Tiga claim yang dianalisis frontend diverifikasi langsung ke backend source code dan compile check (`mvn compile`: BUILD SUCCESS).

---

### Claim 1 — `productCategory: ''` diabaikan backend ✅ BENAR

`FormSchemaService.resolveCategory()` cek `StringUtils.hasText(productCategory)` — empty string
langsung ke `Mono.empty()`, tidak ada DB ops. `productTypeId` yang dipakai jika ada.
Tidak ada side effect dari mengirim empty string ini.

---

### Claim 2 — `'category-specific'` mungkin masih di-return backend ⚠️ SEBAGIAN BENAR — dikoreksi

**Yang sebenarnya terjadi:** Backend **tidak pernah** mengembalikan string `formStage` apapun
dalam schema response — field ini tidak ada di `DynamicFormSchema`. Stale type `'category-specific'`
di `form-schema.ts` bukan karena backend return string itu, tapi karena field `formStage` di type
definition frontend memang tidak di-drive backend sama sekali.

**Bug yang ditemukan backend saat investigasi ini:** `isCategorySpecific` dan `isInitialLoad`
di `DataDrivenSchemaGenerationService` sebelumnya tidak cek `productTypeId` — keduanya sudah
diperbaiki bersamaan dengan Sprint 3 backend work.

**Action frontend (Sprint 3):** Hapus `'category-specific'` dari `form-schema.ts` type definitions
(lines 97, 232) karena memang tidak pernah valid.

```typescript
// form-schema.ts — HAPUS 'category-specific' dari union:
formStage?: 'essential' | 'type-specific';  // bukan 'essential' | 'category-specific'
```

---

### Claim 3 — `assignedCategories` dead code di frontend prop chain ✅ BENAR untuk frontend, TAPI berbeda domain di backend

**Frontend benar:** Prop chain `OrganizationContext → ProductCreatePage → ProductCreateForm →
useCallback deps` memang dead code — `assignedCategories` tidak dipakai di callback body.
Boleh dihapus dari prop chain ProductCreateForm saat Sprint 3 cleanup.

**Yang penting dipahami:** `assignedCategories` di backend adalah **RBAC field**, bukan
`product_categories` field. Dua domain yang berbeda:

| | `product_categories` | `assignedCategories` |
|---|---|---|
| **Apa** | Merchant category tree | User permission scope |
| **Dihapus?** | Ya (2026-06-16) | **Tidak** |
| **Yang set** | Platform admin / provisioning | Admin set per-user |
| **Dipakai untuk** | Form routing, attribute scoping | RBAC — user bisa akses category mana |
| **Backend** | `ProductCategoryDocument` ← dihapus | `OrganizationUser.assignedCategories` ← aktif |
| **Alur backend** | — | `AuthenticationResponse` → `UserManagementService` → `OrganizationUserService.hasAccess()` |

**Masalah yang tersisa:** Setelah `product_categories` dihapus, nilai di `assignedCategories`
(slugs seperti `"electronics"`, `"clothing"`) tidak bisa di-resolve ke dokumen apapun lagi.
`hasAccess()` masih berjalan tapi tidak ada UI untuk assign categories ke user, dan slug
yang tersimpan tidak merepresentasikan entity yang valid.

**Perlu migrasi ke `assignedProductTypes` — scope sprint tersendiri, tidak blocking Sprint 3.**

---

### Future Sprint — `assignedCategories` → `assignedProductTypes` (RBAC Migration)

Ini **bukan** bagian dari product_categories cleanup Sprint 3/4. Ini adalah RBAC domain migration
yang perlu direncanakan terpisah.

**Backend scope:**
```java
// OrganizationUser.java
@Deprecated  // akan digantikan assignedProductTypes
private List<String> assignedCategories = new ArrayList<>();  // category slugs — tidak valid lagi

private List<String> assignedProductTypes = new ArrayList<>();  // NEW — ProductType IDs

// OrganizationUserService.java
// hasAccess(orgId, userId, categorySlug) → migrasi ke hasAccess(orgId, userId, productTypeId)
```

**Data migration:**
```javascript
// Untuk setiap OrganizationUser yang punya assignedCategories,
// resolve slug ke ProductType, set assignedProductTypes
// (membutuhkan mapping slug → ProductType yang mungkin perlu manual curation)
```

**Frontend scope:** Setelah backend deploy field baru:
- `AuthContext.ts`: tambah `assignedProductTypes: string[]`
- `OrganizationContext.ts`: tambah `getAssignedProductTypes()` method
- Hapus prop chain `assignedCategories` dari `ProductCreatePage → ProductCreateForm`
- Hapus `assignedCategories` dari `handleSubmit` useCallback deps

---

```
Frontend (selesai 2026-06-17):
  [x] Hapus platform-admin/category-templates (5 files)
  [x] Hapus sidebar "Category Templates" dari Platform Admin nav
  [x] Hapus ChannelSyncSummary type dari channel-mapping.ts
  [x] Rename page title: "Channel Category Mapping" → "Channel Category Rules"
  [x] Rename sidebar label: "Channel Category Mapping" → "Channel Category Rules"

Backend (selesai 2026-06-17):
  [x] Hapus PlatformCategoryTemplateAdminController (308 baris, semua endpoints)
  [x] Hapus PlatformCategoryTemplateDataLoader (sudah no-op sejak Sprint 2, sekarang dihapus)
  [x] Hapus ExistingOrgCategorySeeder (sudah no-op sejak Sprint 2, sekarang dihapus)
  [x] Hapus ProductCategoryDataLoader (no-op stub)
  [x] Hapus OrgProvisioningListener (provisioning org → category tree tidak lagi diperlukan)
  [x] Hapus CategoryProvisioningService (copies platform_category_templates → product_categories)
  [x] Hapus PlatformCategoryTemplateRepository
  [x] Hapus PlatformCategoryTemplateDocument
  [ ] Archive platform_category_templates collection (MongoDB, jalankan manual)
```
