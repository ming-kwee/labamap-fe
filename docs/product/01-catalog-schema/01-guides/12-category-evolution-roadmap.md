# Roadmap Transisi Arsitektur Kategori: Storefront → Pure Channel Management

**Konteks:** Platform ini adalah pure channel management (Ginee-like) — tanpa storefront.  
**Masalah:** Arsitektur kategori dibangun dengan asumsi storefront, padahal tidak ada storefront.  
**Tujuan:** Setiap phase menghapus satu asumsi storefront dan menggantinya dengan pola Ginee-like.  
**Prinsip:** Jangan rusak yang sudah bekerja. Setiap phase bisa di-deploy secara independen.  
**Referensi:** `11-category-architecture-analysis.md` untuk analisis lengkap di balik keputusan ini.

---

## Peta Asumsi Storefront yang Harus Dihapus

Ini adalah daftar lengkap pola storefront yang saat ini ada di codebase, dan
penggantinya yang Ginee-like. Setiap baris = satu phase.

| # | Asumsi Storefront (saat ini) | Pengganti Ginee-like (target) | Phase |
|---|---|---|---|
| A | Import dari channel bisa kapan saja = migrasi website ongoing | Import sekali di onboarding = bootstrap awal saja | Phase 1 |
| B | Platform categories adalah jembatan wajib ke channel categories | ProductType adalah bridge ringan, platform category opsional | Phase 2 |
| C | Rigid hierarchy = organizational tool utama karena website perlu navigasi dalam | Tags flat = cukup untuk dashboard internal | Phase 3 |
| D | Hanya taxonomy channels (Shopify) yang butuh category browse | Semua channel marketplace (Shopee, Amazon, dll) butuh category browse | Phase 4 |
| E | Channel Category Mapping page = hub utama "map website category ke channel" | Mapping page = bulk rules per ProductType, bukan per website category | Phase 5 |
| F | Channel category = derivat dari platform taxonomy melalui mapping table | Channel category = atribut langsung per produk per listing | Phase 6 |

---

## Inventaris Kondisi Saat Ini

| Komponen | Status | Asumsi Storefront | Phase yang Mengubah |
|---|---|---|---|
| `ImportWizardModal` (bisa dipakai kapan saja) | ✅ Ada | ✅ Ada — asumsi A | Phase 1 |
| `channel_category_mappings` (mapping table) | ✅ Ada | ✅ Ada — asumsi E, F | Phase 5, 6 |
| `product_categories` (rigid hierarchy required) | ✅ Ada | ✅ Ada — asumsi C | Phase 3, 5 |
| Platform category templates | ✅ Ada | ⚠️ Sebagian — asumsi C | Phase 3 |
| `MerchantCategoriesPage` (`/channels/categories`) | ✅ Ada | ⚠️ Sebagian — asumsi C | Phase 3 |
| `ProductType` (hanya variant dimensions) | ✅ Ada | ❌ Tidak ada — sudah Ginee-like | Phase 2 (extend) |
| `CategoryTreePicker` di Step 2 | ✅ Ada | ❌ Tidak ada — sudah Ginee-like ✅ | Tidak diubah |
| `TaxonomyMapperModal` (hanya Shopify) | ✅ Ada | ✅ Ada — asumsi D | Phase 4 |
| Tags pada master product | ✅ Ada (Phase 3 2026-06-15) | ✅ Yes | — |
| `ProductType.channelCategoryDefaults` | ❌ Belum ada | — | Phase 2 (bangun) |
| `Organization.categorySourceOrigin` | ❌ Belum ada | — | Phase 1 (bangun) |

---

## Phase 0 — Keputusan Arsitektur (Selesai)

**Status: Selesai (2026-06-15)**

Tidak ada perubahan kode. Ini adalah fondasi untuk semua phase berikutnya.

- [x] Identifikasi platform type: pure channel management, no storefront (`CLAUDE.md`)
- [x] Analisis lengkap ditulis (`11-category-architecture-analysis.md`)
- [x] Persistent memory diupdate (`memory/project_platform_type.md`)
- [x] Semua asumsi storefront diidentifikasi dan didokumentasikan

---

## Phase 1 — Hapus Asumsi A: "Import = Migrasi Website Ongoing"

**Status: Diimplementasi sebagai Opsi A — additive-only (2026-06-15)**

**Asumsi storefront yang dihapus:**
> "Merchant bisa import WooCommerce/Etsy/Wix collections sebagai platform categories kapan saja
> karena ini sama seperti migrasi website — dan website bisa berubah terus."

**Mengapa ini asumsi storefront:**
Platform ini bukan storefront — tidak ada website yang perlu dimigrasi. Tapi import tetap
berguna sebagai cara bulk-add categories. Yang perlu dicegah bukan frekuensi import-nya,
melainkan **channel menjadi master**: import tidak boleh menimpa atau menggantikan categories
yang sudah ada di platform.

**Perilaku sebelumnya (lock + grace period — sudah dihapus):**

~~Implementasi awal menggunakan 14-hari grace period lock dengan onboarding panel pilihan
"Import dari Channel" vs "Platform Template". Ini terlalu membatasi merchant dan
menciptakan friction yang tidak perlu untuk pure channel management tool.~~

**Perilaku saat ini (Opsi A — additive-only):**

```
Kapan saja → "Import from channel" button tersedia
Merchant klik → ImportWizardModal terbuka
previewImport() → setiap collection di-mark alreadyImported: true/false
Already-imported → ditampilkan greyed-out dengan badge, tidak bisa dipilih
New collections → merchant pilih → Import
Backend → createCategoryAndMapping() HANYA untuk collections yang belum ada
Platform categories lama → tidak tersentuh sama sekali
```

**Outcome:**
Import boleh dijalankan kapan saja. Platform tetap master karena additive-only:
tidak ada overwrite, tidak ada duplikasi, tidak ada sinkronisasi balik dari channel.
Asumsi storefront A dihapus tanpa membatasi merchant.

**File yang dihapus (Grace period → Opsi A):**
- `CategoryOnboardingPanel.tsx`
- `category-origin.ts` + `category-origin.service.ts`
- `categorySourceOrigin` state, grace period banner, import lock di `ChannelCategoryMappingPage`
- Origin banner di `MerchantCategoriesPage`

### Backend — Rekomendasi untuk Opsi A

Detail lengkap di `02-api-reference/10-category-transition-backend.md §Phase 1 Opsi A`.

---

## Phase 2 — Hapus Asumsi B: "Platform Category = Jembatan Wajib ke Channel"

**Asumsi storefront yang dihapus:**
> "Setiap produk harus ada di sebuah platform category, dan platform category tersebut
> di-map ke channel category. Tanpa mapping ini, produk tidak bisa dipublikasikan ke channel."

**Mengapa ini asumsi storefront:**
Di platform dengan storefront, website category → channel category adalah alur yang logis
karena website menggunakan kategori yang sama sebagai navigasi. Di pure channel management,
tidak ada website. Channel category cukup ditetapkan langsung per produk per channel —
tidak perlu melalui platform category sebagai jembatan perantara.

**Perilaku saat ini (storefront):**

```
Produk A → Platform Category "Smartphone"
                   ↓ mapping table
           Shopee: category_id=100001
           Tokopedia: category_id=30045
[Semua produk di "Smartphone" dapat channel category yang sama]
[Merchant tidak bisa override per produk tanpa mengubah mapping]
```

**Perilaku target (Ginee-like):**

```
ProductType "Smartphone" → Default Shopee: 100001, Tokopedia: 30045
                                    ↓ pre-fill di Step 2
Produk A → CategoryTreePicker Shopee → pre-filled "100001" → merchant bisa override
Produk B → CategoryTreePicker Shopee → pre-filled "100001" → merchant override ke 100055
[Setiap produk bisa punya channel category berbeda meski ProductType sama]
```

**Priority:** 🔴 High  
**Effort:** Medium (1–2 sprints)  
**Breaking changes:** Tidak ada — additive, flow Step 2 tidak berubah

### Mengapa ProductType, bukan platform category

`ProductType` sudah ada di codebase (`/omni-admin/product-types`) dengan konsep
`variantDimensions` untuk SKU matrix. Ini adalah entitas channel-agnostic yang stabil:
"Smartphone", "Kaos Pria", "Laptop". Berbeda dari platform category yang per-merchant
dan bisa berubah sewaktu-waktu. Ini adalah pola yang dipakai ChannelAdvisor setelah
membuang unified category tree.

### Backend

**1. Extend ProductType dengan `channelCategoryDefaults`**

```java
// ProductType.java — extend entitas yang sudah ada
private List<ChannelCategoryDefault> channelCategoryDefaults = new ArrayList<>();

@Data
public static class ChannelCategoryDefault {
    private String channelType;       // "shopee", "tokopedia", "lazada"
    private String categoryId;        // channel-native category ID
    private String categoryName;      // denormalized display name
    private String categoryFullPath;  // "Pakaian > Pria > Atasan > Kaos"
}
```

**2. Update ProductType API**

`PUT /api/v1/product-types/{id}` → terima `channelCategoryDefaults` array.  
`GET /api/v1/product-types/{id}` → kembalikan `channelCategoryDefaults` array.

### Frontend

**3. Section "Channel Category Defaults" di ProductTypesPage**

Di `/omni-admin/product-types`, expand card tiap product type:
- Tabel: Channel | Default Category | Action
- "Set default" per channel → mini-picker pakai `CategoryTreePicker` yang sudah ada
- "Clear" per channel untuk hapus default

**4. Pre-fill CategoryTreePicker di Step 2 dari ProductType defaults**

Di `ChannelStoreTab.tsx`, saat `categoryField` muncul:
```typescript
// Fetch product type defaults untuk channel ini
// Jika ada default → pre-fill CategoryTreePicker
// Merchant tetap bisa override — default hanya suggestion
```

**5. Bulk action "Terapkan default ProductType"**

Di halaman product list, tambahkan bulk action:
"Terapkan channel category default dari ProductType ke produk terpilih"
→ 500 produk Smartphone → satu klik, semua dapat Shopee category dari ProductType default

**Outcome Phase 2:**
Platform category tidak lagi wajib sebagai jembatan ke channel. ProductType menjadi
bridge yang lebih ringan dan channel-agnostic. Asumsi storefront B dihapus.

---

## Phase 3 — Hapus Asumsi C: "Rigid Hierarchy = Organizational Tool Utama"

**Status: Frontend complete dan product_categories UI dihapus (2026-06-16). Backend migration pending — see `02-api-reference/14-product-categories-migration-backend.md`.**

**Asumsi storefront yang dihapus:**
> "Platform category tree harus dalam, hierarkis, dan dikurasi dengan baik karena ia adalah
> navigasi website. Merchant harus merawat hierarchy ini dengan serius."

**Mengapa ini asumsi storefront:**
Navigasi website yang bagus memang butuh hierarki yang dalam dan konsisten. Tapi untuk
dashboard operasional internal, merchant hanya butuh cara cepat untuk menemukan dan
mengelompokkan produk. Tags flat jauh lebih efisien untuk keperluan ini — ini adalah
pola yang dipakai Ginee dan Linnworks setelah meninggalkan category hierarchy.

**Perilaku saat ini (storefront):**

```
Merchant harus: buat kategori → atur parent-child → pastikan hierarchy benar
                → baru bisa assign produk → baru bisa mapping ke channel
[Category hierarchy adalah prerequisite untuk segalanya]
```

**Perilaku target (Ginee-like):**

```
Merchant tambahkan tags ke produk: ["kaos", "pria", "basic", "cotton"]
Filter di dashboard: tampilkan semua produk tag "kaos" + "pria"
Bulk action: "semua produk tag kaos-pria" → set Shopee category → push
[Tags flat cukup — tidak butuh hierarchy untuk operasional sehari-hari]
```

**Priority:** 🟡 Medium  
**Effort:** Medium (1–2 sprints)  
**Breaking changes:** Tidak ada — additive di samping hierarchy yang sudah ada

### Backend

**1. Tambah `tags` ke MasterProduct**

```java
// MasterProduct.java
@Indexed
private List<String> tags = new ArrayList<>();  // ["kaos", "pria", "basic"]
```

**2. Filter by tags di product list API**

```
GET /api/v1/products?organizationId=xxx&tags=kaos,pria
```

**3. Tag management endpoint**

```
PUT /api/v1/products/{id}/tags
Body: { "tags": ["kaos", "pria", "basic"] }
```

**4. Bulk tag endpoint**

```
POST /api/v1/products/bulk-tags
Body: { "productIds": [...], "addTags": ["kaos"], "removeTags": [] }
```

### Frontend

**5. Tag input di Step 1 form**

Field `tags` di form master product dengan chip/tag input UI.
Autocomplete dari tags yang sudah pernah dipakai oleh org ini.

**6. Tag filter di product list**

Filter multi-select by tags di halaman daftar produk.

**7. Tag-based bulk operations**

"Pilih semua produk tag 'kaos-pria'" → bulk edit, bulk push, bulk channel category assignment.

**8. Downgrade promosi category hierarchy**

Di `MerchantCategoriesPage`, tambahkan note:
> "Kategori digunakan untuk channel mapping. Untuk pengelolaan produk sehari-hari,
> gunakan Tags yang lebih fleksibel."

**Outcome Phase 3:**
Merchant tidak lagi bergantung pada rigid hierarchy untuk operasional harian.
Tags menjadi cara primer mengorganisasi produk di dashboard. Asumsi storefront C dihapus.

---

## Phase 4 — Aktifkan Channel Marketplace untuk Category Browse

**Status: Selesai — Backend deployed 2026-06-15, Frontend deployed 2026-06-15.**

**Catatan:** Phase ini bukan menghapus asumsi storefront, tapi **mengaktifkan pola
Ginee-like untuk channel yang selama ini terabaikan** karena arsitektur awal hanya
fokus pada Shopify (storefront-like taxonomy).

### Yang sudah diimplementasikan

**Backend (deployed 2026-06-15):**
- `ChannelCategoryApiConfig.treeCapable` field ditambahkan
- `CategoryApiConfigDataLoader` set `treeCapable=true` untuk shopee, amazon, tiktokshop, ebay, lazada
- `ChannelTaxonomyService.ChannelCategoryFlags` return 3 flags (tambah `treeCapable`)
- `ChannelStoreConnectionResponse` expose `treeCapable` di semua endpoint

**Frontend (deployed 2026-06-15):**
- `ChannelCategoryMappingPage` — routing ke `TaxonomyMapperModal mode="tree"` via `storeTreeCapable`
- `TaxonomyMapperModal` — `mode` prop, label "Category Tree" vs "Taxonomy"
- `ChannelDefaultsSection` — eligible stores include `treeCapable === true` channels
- `TREE_CAPABLE_CHANNELS` list tetap ada sebagai **safety net** untuk cached/stale responses —
  bukan primary mechanism. Bisa dihapus di future cleanup setelah deployment stabil.

**Outcome:**
Shopee, Amazon, TikTok, eBay, Lazada mendapat Map button di Channel Category Mapping page
dan bisa browse category tree mereka. `store.treeCapable === true` selalu short-circuit
sebelum fallback `isTreeCapable()` dipanggil.

---

## Phase 5 — Hapus Asumsi E: "Mapping Page = Hub Utama Map Website Category ke Channel"

**Status: Frontend diimplementasi (2026-06-15). Backend pending — lihat `02-api-reference/10-category-transition-backend.md §Phase 5`.**

**Asumsi storefront yang dihapus:**
> "Channel Category Mapping page adalah tempat platform admin me-mapping category website
> ke masing-masing channel — ini adalah konfigurasi penting yang harus dilakukan sekali
> untuk seluruh organisasi."

**Mengapa ini asumsi storefront:**
Di storefront platform, mapping website category → channel taxonomy adalah setup satu kali
yang berlaku untuk semua produk selamanya. Di pure channel management, tidak ada website.
Yang dibutuhkan adalah rules berbasis ProductType: "semua Smartphone → Shopee category X."
Ini adalah pola ChannelAdvisor "Profiles."

**Perilaku sebelumnya (storefront):**

```
Channel Category Mapping page:
  Baris = Platform Category (website navigation item)
  Kolom = Store per channel
  Cell = Channel category yang di-map
  [Asumsi: semua produk di category ini pakai channel category yang sama]
```

**Perilaku saat ini (Ginee-like — diimplementasi 2026-06-15):**

```
Channel Category Mapping page → dua tab:

Tab "Channel Rules" (PRIMARY, default):
  Baris = ProductType (Smartphone, Kaos Pria, Laptop, dsb.)
  Kolom = Channel (Shopee, Tokopedia, Lazada, dsb.)
  Cell = Default category untuk ProductType ini di channel ini
  [Click "Set" → CategoryBrowseModal → simpan ke ProductType.channelCategoryDefaults]
  [Override per produk tetap bisa di Step 2]

Tab "Platform Categories" (LEGACY):
  Banner: "Legacy view — pertimbangkan migrasi ke Channel Rules"
  Baris = Platform Category (existing behavior)
  Kolom = Store per channel (existing behavior)
  [Sync all button tersedia di sini]
```

**Priority:** ✅ Diimplementasi  
**Breaking changes:** Tidak ada — additive. Legacy tab mempertahankan semua perilaku lama.

### Yang sudah diimplementasikan

**Frontend (2026-06-15):**
- `ProductTypeRulesTab.tsx` — komponen baru, tabel ProductType × Channel dengan browse modal inline
- `ChannelCategoryMappingPage.tsx` — dua tab: "Channel Rules" (default) + "Platform Categories" (legacy)
- Import button dihapus dari UI (kode `ImportWizardModal` tetap ada untuk audit/super-admin)
- Legacy banner di Platform Categories tab
- Sync all button dipindahkan ke toolbar Platform Categories tab

**File-file yang diubah:**
- `_components/ChannelCategoryMappingPage.tsx` — tab switcher, restructure render
- `_components/ProductTypeRulesTab.tsx` — BARU

### Backend yang masih pending

**1. Buat platform category assignment opsional di master product**

`categoryId` pada `MasterProduct` tidak lagi required. `productTypeId` + `tags` cukup
untuk organizational purposes.

**2. `channel_category_mappings` FK menjadi nullable**

```
ChannelCategoryMapping:
  categoryId?:    string   // FK ke product_categories (nullable, legacy)
  productTypeId?: string   // FK ke product_types (nullable, baru)
  // salah satu harus diisi
```

**3. Data migration: existing mappings tetap valid**

Dokumen yang sudah punya `categoryId` tidak perlu dimigrasikan. Migration hanya untuk
merchant yang secara aktif beralih ke ProductType-based mapping.

**Outcome Phase 5:**
Channel Category Mapping page tidak lagi merepresentasikan "mapping website category ke channel."
Primary tab (Channel Rules) adalah ProductType-based — sepenuhnya Ginee-like. Legacy tab
mempertahankan backward compat. Asumsi storefront E dihapus (frontend).

---

## Phase 6 — Hapus Asumsi F: "Channel Category = Derivat dari Platform Taxonomy"

**Status: Frontend diimplementasi (2026-06-16). Backend pending — lihat `02-api-reference/10-category-transition-backend.md §Phase 6`.**

**Asumsi storefront yang dihapus:**
> "Channel category sebuah produk ditentukan oleh platform category-nya melalui mapping table.
> Produk tidak bisa punya channel category kecuali platform category-nya sudah di-map."

**Mengapa ini asumsi storefront:**
Di storefront, website category → channel category adalah dependency yang masuk akal:
produk muncul di website category, dan website category di-map ke channel. Di pure channel
management, tidak ada website. Channel category seharusnya menjadi atribut langsung
dari channel listing — sama seperti harga, judul, dan deskripsi channel.

**Perilaku sebelumnya (storefront):**

```
MasterProduct
     ↓ (required FK)
platform_categories._id
     ↓ (lookup)
channel_category_mappings
     ↓ (externalId)
Channel category ID
```

**Perilaku saat ini (Ginee-like — Step 2 sudah benar sejak awal):**

```
MasterProduct
     ↓
channel_product_data.categoryId = "100001"  ← disimpan langsung per produk per store
                                               via CategoryTreePicker di Step 2
                                               (= channel listing record, bukan mapping table)
```

**Perilaku target (Phase 6 tambahan — Bulk Assign):**

```
Channel Category Mapping page → tab "Bulk Assign":
  Pilih store → Browse category → Pilih produk → Apply
  → POST /admin/master-products/bulk-channel-category
  → channel_product_data.categoryId di-set untuk semua produk terpilih
  [Tidak perlu melalui channel_category_mappings sama sekali]
```

### Temuan Task 1 — Storage path CategoryTreePicker (verified 2026-06-16)

`CategoryTreePicker` di Step 2 sudah menyimpan `categoryId` **langsung di `channel_product_data`**
(= channel listing record), bukan di `channel_category_mappings`.

Bukti kode:
- `ChannelStepSaveRequest.categoryId` → `POST /ecommerce/channel-product-data/save`
- Response: `ChannelProductData` (tidak ada `categoryId` — ia disimpan ke backend record)
- `channel_category_mappings` adalah tabel terpisah untuk platform category ↔ channel taxonomy mapping

**Implikasi:** Phase 6 frontend dapat langsung memanggil endpoint yang sama (`channel-product-data/save` atau bulk equivalent). Tidak perlu migration dari mapping table untuk Step 2 data.

### Yang sudah diimplementasikan (2026-06-16)

**Frontend:**
- `BulkAssignTab.tsx` — tab baru "Bulk Assign" di `ChannelCategoryMappingPage`
- `MasterProductService.bulkAssignChannelCategory()` — endpoint call (backend pending)
- `BulkChannelCategoryRequest` type

**`BulkAssignTab` flow:**
```
1. Pilih store (dropdown eligible stores: treeCapable/taxonomyEnabled)
2. Browse category → CategoryBrowseModal → pilih leaf node
3. Search/filter produk (by name, tags, status)
4. Centang produk yang ingin di-assign
5. Klik "Apply to N" → POST bulk-channel-category → toast success/error
6. Selection cleared — produk siap untuk assignment berikutnya
```

**File baru/diubah:**
- `_components/BulkAssignTab.tsx` — BARU
- `_components/ChannelCategoryMappingPage.tsx` — tab ke-3 "Bulk Assign"
- `products/_types/master-product.ts` — `BulkChannelCategoryRequest`
- `products/_services/master-product.service.ts` — `bulkAssignChannelCategory()`

### Backend yang masih pending

**Endpoint baru: `POST /admin/master-products/bulk-channel-category`**

```
Request:
  organizationId: string (query param)
  Body: {
    productIds:       string[],
    storeId:          string,
    channelType:      string,
    categoryId:       string,   // channel-native leaf node ID
    categoryName:     string,
    categoryFullPath: string
  }

Response:
  { updatedCount: number, failedIds: string[] }
```

Logika: untuk setiap `productId`, upsert `channel_product_data` record dengan `categoryId`.
Sama seperti `/channel-product-data/save` tapi batch. Gagal per-produk tidak menghentikan batch.

**Tidak butuh migration data** untuk Step 2 path — `channel_product_data.categoryId` sudah
tersimpan benar sejak CategoryTreePicker di Step 2.

**Cleanup `channel_category_mappings` sebagai primary lookup** saat publish — ini adalah
backend refactor yang independent dari frontend Phase 6.

### Remaining tasks (backend + future)

| Task | Status |
|---|---|
| `POST /admin/master-products/bulk-channel-category` | Backend pending |
| Archive `channel_category_mappings` tabel | Aspirational — setelah semua listing pakai direct categoryId |
| Hapus dependency ke mapping table saat publish | Backend refactor — tidak blocking |
| Hapus "Platform Categories" legacy tab | Setelah Phase 5 mature + data migrated |

**Outcome Phase 6 (frontend complete):**
Channel category bisa di-assign langsung ke produk tanpa melalui platform category mapping table.
Asumsi storefront F dihapus dari frontend. Full Ginee-like architecture.

---

## Dependency Map

```
Phase 0 — Keputusan Arsitektur (Selesai)
    │
    ├──→ Phase 1 — Hapus asumsi A (Import ongoing)
    │         │
    │         ├──→ Phase 2 — Hapus asumsi B (Platform category wajib)
    │         │         │
    │         │         ├──→ Phase 3 — Hapus asumsi C (Rigid hierarchy)
    │         │         │         │
    │         │         │         └──→ Phase 5 — Hapus asumsi E (Mapping page hub)
    │         │         │                   │
    │         │         └──────────────────→└──→ Phase 6 — Hapus asumsi F (Channel cat derivat)
    │         │
    └──→ Phase 4 — Aktifkan marketplace channels (paralel dengan semua phase)
```

Phase 4 bisa berjalan **kapan saja, paralel** dengan phase lainnya.  
Phase 5 memerlukan Phase 1 + 2 + 3 sudah mature dan adopted.  
Phase 6 memerlukan Phase 5 sudah stable dan data sudah siap dimigrasikan.

---

## Ringkasan Per Phase

| Phase | Asumsi Storefront Dihapus | Effort | Status |
|---|---|---|---|
| 0 | — (keputusan arsitektur) | Done | ✅ Selesai |
| 1 | A — Import adalah migrasi website ongoing | Medium | ✅ Frontend selesai — backend pending |
| 2 | B — Platform category wajib jembatani ke channel | Medium | ✅ Frontend selesai — backend pending |
| 3 | C — Rigid hierarchy = organizational tool utama | Medium | ✅ Frontend selesai — backend pending |
| 4 | (bukan hapus asumsi — aktifkan marketplace channels) | Done | ✅ Selesai |
| 5 | E — Mapping page = hub map website category ke channel | High | ✅ Frontend selesai — backend pending |
| 6 | F — Channel category = derivat dari platform taxonomy | Very High | ✅ Frontend selesai — backend pending |

---

## Log Keputusan

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-06-15 | Platform adalah pure channel management, no storefront | Dikonfirmasi setelah membandingkan dengan Ginee, Linnworks, ChannelAdvisor |
| 2026-06-15 | Import hanya boleh satu kali di onboarding | Import ongoing menciptakan circular category identity |
| 2026-06-15 | ProductType adalah channel category bridge yang tepat | Channel-agnostic, lebih stabil dari per-merchant category hierarchy |
| 2026-06-15 | Platform categories tetap ada tapi trend ke opsional | Terlalu disruptif dihapus sekarang; Phase 5/6 sebagai tujuan jangka panjang |
| 2026-06-15 | CategoryTreePicker di Step 2 tidak diubah | Sudah Ginee-like — channel category per produk per listing |
