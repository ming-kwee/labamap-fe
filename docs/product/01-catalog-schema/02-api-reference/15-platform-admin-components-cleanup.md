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
- Per-channel per-category-slug API schema extensions
- Deep-merged onto base APIs during JOLT spec generation
- Tidak ada hubungan dengan platform categories

### `omni-admin/channel-category-mapping` (seluruh fitur) — PERTAHANKAN
- **ProductTypeRulesTab** adalah core fitur untuk pre-fill `CATEGORY_TREE` di Step 2
  via `ProductType.channelCategoryDefaults`
- **BulkAssignTab** adalah jalur migrasi merchant dari `channel_category_mappings` lama
  ke `channel_product_data` baru (doc 13 §4)
- Tanpa BulkAssign tab, merchant tidak bisa migrasi data channel categories mereka

---

## 4. Urutan Eksekusi yang Disarankan

```
Sprint segera (dapat dilakukan parallel dengan Sprint 3 doc 14):
  [ ] Tambahkan @Deprecated(forRemoval=true) + @Hidden ke PlatformCategoryTemplateAdminController
  [ ] Monitor satu sprint — pastikan tidak ada WARN log dari endpoints tersebut

Sprint berikutnya (setelah monitoring clear):
  [ ] Hapus PlatformCategoryTemplateAdminController
  [ ] Hapus PlatformCategoryTemplateService + Repository + Document + Dto classes
  [ ] Hapus PlatformCategoryTemplateDataLoader (sudah no-op tapi kode masih ada)
  [ ] Archive platform_category_templates collection
  [ ] Hapus referensi ke OrgProvisionStatus, ForceProvisionResult di codebase
```

---

## Checklist Ringkasan

```
Frontend (selesai 2026-06-17):
  [x] Hapus platform-admin/category-templates (5 files)
  [x] Hapus sidebar "Category Templates" dari Platform Admin nav
  [x] Hapus ChannelSyncSummary type dari channel-mapping.ts
  [x] Rename page title: "Channel Category Mapping" → "Channel Category Rules"
  [x] Rename sidebar label: "Channel Category Mapping" → "Channel Category Rules"

Backend (rekomendasi):
  [ ] @Deprecated PlatformCategoryTemplateAdminController + @Hidden dari Swagger
  [ ] Monitor satu sprint
  [ ] Hapus controller + service + repository + document + DTOs
  [ ] Archive platform_category_templates collection
```
