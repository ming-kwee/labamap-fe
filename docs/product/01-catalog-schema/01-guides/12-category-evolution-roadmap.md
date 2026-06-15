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

**Asumsi storefront yang dihapus:**
> "Merchant bisa import WooCommerce/Etsy/Wix collections sebagai platform categories kapan saja
> karena ini sama seperti migrasi website — dan website bisa berubah terus."

**Mengapa ini asumsi storefront:**
Merchant yang punya website di WooCommerce memang butuh migrasi category tree website mereka
ke platform baru kapan saja. Tapi platform ini tidak menggantikan website merchant. Tidak ada
website yang perlu dimigrasi. Import hanya relevan sebagai bootstrap awal — setelah itu,
platform categories adalah master dan tidak perlu sinkronisasi balik ke channel.

**Perilaku saat ini (storefront):**

```
Kapan saja → "Import from channel" button tersedia
Merchant klik → ImportWizardModal terbuka
WooCommerce collections → jadi platform categories (baru)
Platform categories bergantung pada channel sebagai sumber kebenaran
```

**Perilaku target (Ginee-like):**

```
Onboarding (sekali) → Merchant pilih: Import dari channel ATAU pakai template
Setelah 14 hari grace period → "Import from channel" tidak bisa lagi
Platform categories adalah master — channel tidak bisa lagi menciptakan categories baru
```

**Priority:** 🔴 High  
**Effort:** Medium (1–2 sprints)  
**Breaking changes:** Tidak ada — merchant existing di-grandfather

### Backend

**1. Tambah field ke Organization**

```java
// Organization.java
private String categorySourceOrigin;  // "import" | "template" | null
private Instant categoryOnboardedAt;  // di-set saat origin pertama dipilih
```

**2. Endpoint set origin (hanya saat onboarding)**

```
POST /api/v1/organizations/{orgId}/category-origin
Body: { "origin": "import" | "template" }

Ditolak (409) jika: categorySourceOrigin sudah di-set
                   DAN sudah lebih dari 14 hari sejak categoryOnboardedAt
```

**3. Expose di org response**

`GET /api/v1/organizations/{orgId}` → tambahkan `categorySourceOrigin` dan `categoryOnboardedAt`.

### Frontend

**4. Onboarding choice UI**

Ketika merchant pertama buka `/channels/categories` atau channel category mapping page
dan `categorySourceOrigin == null`, tampilkan panel pilihan sebelum UI normal:

```
┌──────────────────────────────────────────────────────────┐
│  Pilih cara setup kategori Anda (sekali saja)             │
│                                                           │
│  ┌───────────────────────┐  ┌───────────────────────────┐ │
│  │  Import dari Channel  │  │  Platform Template         │ │
│  │                       │  │                            │ │
│  │  Saya sudah punya     │  │  Saya mulai dari nol.      │ │
│  │  kategori di          │  │  Gunakan struktur standar  │ │
│  │  WooCommerce / Etsy.  │  │  platform sebagai basis.   │ │
│  │                       │  │                            │ │
│  │  [Pilih Import]       │  │  [Pilih Template]          │ │
│  └───────────────────────┘  └───────────────────────────┘ │
│                                                           │
│  ⚠ Keputusan ini tidak mudah diubah.                     │
│  Anda punya 14 hari untuk menggantinya setelah memilih.   │
└──────────────────────────────────────────────────────────┘
```

**5. Grace period banner (14 hari)**

```
ℹ️  Sumber kategori: Import dari WooCommerce (10 Jun 2026).
    Bisa diganti hingga: 24 Jun 2026. [Ganti pilihan]
```

**6. Hapus akses "Import from channel" setelah grace period**

Di `ChannelCategoryMappingPage.tsx`, header button "Import from channel":
- `categorySourceOrigin == "template"` → sembunyikan tombol
- `categorySourceOrigin == "import"` dan sudah lewat grace period → sembunyikan
- Dalam grace period → tampilkan dengan label "Onboarding only"
- `categorySourceOrigin == null` → arahkan ke onboarding choice panel

**Outcome Phase 1:**
Import tidak lagi bisa menjadi sumber kebenaran ongoing. Platform categories punya
identitas yang stabil dan tidak berubah karena channel berubah. Asumsi storefront A dihapus.

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

**Status: Frontend complete (2026-06-15). Backend endpoints pending — see `02-api-reference/10-category-transition-backend.md §Phase 3`.**

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

**Asumsi storefront yang dihapus:**
> "Channel Category Mapping page adalah tempat platform admin me-mapping category website
> ke masing-masing channel — ini adalah konfigurasi penting yang harus dilakukan sekali
> untuk seluruh organisasi."

**Mengapa ini asumsi storefront:**
Di storefront platform, mapping website category → channel taxonomy adalah setup satu kali
yang berlaku untuk semua produk selamanya. Di pure channel management, tidak ada website.
Yang dibutuhkan adalah rules berbasis ProductType: "semua Smartphone → Shopee category X."
Ini adalah pola ChannelAdvisor "Profiles."

**Perilaku saat ini (storefront):**

```
Channel Category Mapping page:
  Baris = Platform Category (website navigation item)
  Kolom = Store per channel
  Cell = Channel category yang di-map
  [Asumsi: semua produk di category ini pakai channel category yang sama]
```

**Perilaku target (Ginee-like):**

```
Channel Category Mapping page → diubah menjadi "Channel Category Rules":
  Baris = ProductType (Smartphone, Kaos Pria, Laptop, dsb.)
  Kolom = Channel
  Cell = Default category untuk ProductType ini di channel ini
  [Override per produk tetap bisa di Step 2]
```

**Priority:** 🟢 Low (prerequisite: Phase 1 + 2 + 3 sudah mature)  
**Effort:** High (3–4 sprints)  
**Breaking changes:** Ya — perlu migration plan untuk existing mappings

### Prerequisite

- Phase 1 selesai: Import tidak lagi ongoing
- Phase 2 selesai: ProductType sudah punya `channelCategoryDefaults`
- Phase 3 selesai: Tags sudah dipakai sebagai organizational tool
- Data menunjukkan mayoritas merchant menggunakan ProductType defaults

### Backend

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

### Frontend

**4. Repurpose `ChannelCategoryMappingPage` menjadi "Channel Category Rules"**

```
SEBELUM (storefront):              SESUDAH (Ginee-like):
Baris = Platform Category          Baris = ProductType
"Pakaian Pria"                     "Kaos Pria" (ProductType)
  → Shopee: 100001                   → Shopee: 100001 [Edit]
  → Tokopedia: 30045                 → Tokopedia: 30045 [Edit]
  → Lazada: 7890                     → Lazada: 7890 [Edit]
```

**5. Sembunyikan (tidak hapus) platform category mapping untuk legacy accounts**

Existing merchants yang masih menggunakan category-based mapping mendapat tampilan legacy
dengan banner: "Anda menggunakan category mapping. Pertimbangkan migrasi ke ProductType
rules untuk pengalaman yang lebih baik."

**6. `ImportWizardModal` tidak bisa diakses dari UI production**

Kode tidak dihapus (untuk audit), tapi tombol akses tidak ditampilkan di UI.
Hanya bisa diakses oleh super-admin untuk keperluan support.

**Outcome Phase 5:**
Channel Category Mapping page tidak lagi merepresentasikan "mapping website category ke channel."
Ia menjadi "rules per ProductType" — sepenuhnya Ginee-like. Asumsi storefront E dihapus.

---

## Phase 6 — Hapus Asumsi F: "Channel Category = Derivat dari Platform Taxonomy"

**Asumsi storefront yang dihapus:**
> "Channel category sebuah produk ditentukan oleh platform category-nya melalui mapping table.
> Produk tidak bisa punya channel category kecuali platform category-nya sudah di-map."

**Mengapa ini asumsi storefront:**
Di storefront, website category → channel category adalah dependency yang masuk akal:
produk muncul di website category, dan website category di-map ke channel. Di pure channel
management, tidak ada website. Channel category seharusnya menjadi atribut langsung
dari channel listing — sama seperti harga, judul, dan deskripsi channel.

**Perilaku saat ini (storefront):**

```
MasterProduct
     ↓ (required FK)
platform_categories._id
     ↓ (lookup)
channel_category_mappings
     ↓ (externalId)
Channel category ID
```

**Perilaku target (Ginee-like):**

```
MasterProduct
     ↓
channel_listings.shopee.categoryId = 100001    ← atribut listing langsung
channel_listings.tokopedia.categoryId = 30045  ← atribut listing langsung
channel_listings.lazada.categoryId = 7890      ← atribut listing langsung

[CategoryTreePicker di Step 2 sudah menyimpan ini — perlu verifikasi dan formalisasi]
```

**Priority:** 🔵 Aspirational (prerequisite: Phase 5 sudah stable)  
**Effort:** Very High (6+ sprints)  
**Breaking changes:** Major — full data migration

### Catatan penting: Step 2 sudah setengah jalan

`CategoryTreePicker` di Step 2 sudah menyimpan channel category per produk per channel.
**Verifikasi terlebih dahulu:** apakah hasilnya disimpan di `channel_category_mappings`
atau langsung di channel listing record? Jika sudah di listing record → Phase 6 adalah
tentang menghapus dependensi pada mapping table, bukan membangun dari nol.

### Tasks

**1. Verifikasi storage path CategoryTreePicker di Step 2**

Cek apakah `CategoryTreePicker` result tersimpan di:
- `channel_category_mappings` → butuh migration ke listing record
- Channel listing record langsung → Phase 6 sudah sebagian selesai

**2. Formalisasi `channelListings[channelType].categoryId` sebagai primary field**

Di channel listing schema, `categoryId` menjadi field first-class — bukan diturunkan
dari mapping table.

**3. `channel_category_mappings` menjadi optional fallback**

Untuk backward compatibility, mapping table tetap dibaca jika listing tidak punya
`categoryId` langsung. Ini memungkinkan migration bertahap tanpa big-bang.

**4. Data migration: mapping table → listing records**

Script migration untuk copy `externalId` dari mapping documents ke channel listing records.
Jalankan per batch. Tidak hapus mapping table sampai semua data terverifikasi.

**5. Archive `channel_category_mappings`**

Setelah semua listing punya `categoryId` langsung, mapping table di-archive.
Tidak dihapus — dipertahankan untuk audit history.

**6. Repurpose Channel Category Mapping page menjadi bulk assignment tool**

Tidak lagi ada "mapping table" untuk dilihat. Page ini menjadi:
"Pilih produk → set channel category untuk semua produk terpilih sekaligus."

**Outcome Phase 6:**
Full Ginee-like architecture. Channel category adalah atribut listing, bukan derivat dari
platform taxonomy. Asumsi storefront F dihapus. Transisi selesai.

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
| 5 | E — Mapping page = hub map website category ke channel | High | 🟢 Low — prerequisite Phase 1+2+3 mature |
| 6 | F — Channel category = derivat dari platform taxonomy | Very High | 🔵 Aspirational |

---

## Log Keputusan

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-06-15 | Platform adalah pure channel management, no storefront | Dikonfirmasi setelah membandingkan dengan Ginee, Linnworks, ChannelAdvisor |
| 2026-06-15 | Import hanya boleh satu kali di onboarding | Import ongoing menciptakan circular category identity |
| 2026-06-15 | ProductType adalah channel category bridge yang tepat | Channel-agnostic, lebih stabil dari per-merchant category hierarchy |
| 2026-06-15 | Platform categories tetap ada tapi trend ke opsional | Terlalu disruptif dihapus sekarang; Phase 5/6 sebagai tujuan jangka panjang |
| 2026-06-15 | CategoryTreePicker di Step 2 tidak diubah | Sudah Ginee-like — channel category per produk per listing |
