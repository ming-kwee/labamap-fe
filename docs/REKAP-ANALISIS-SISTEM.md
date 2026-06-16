# Rekap Analisis Sistem — Over-Engineering Review

**Tanggal:** 2026-06-16  
**Scope:** Seluruh codebase + docs dibandingkan dengan kebutuhan nyata sebagai merchant channel management tool  
**Referensi utama:** `docs/product/01-catalog-schema/01-guides/11-category-architecture-analysis.md`

---

## 1. Identitas Platform (Acuan Analisis)

Platform ini adalah **pure channel management tool** — setara Ginee Omnichannel (Sea Group).

| | Storefront Platform | Platform Ini |
|---|---|---|
| Customer melihat kategori? | Ya — navigasi website | Tidak — internal saja |
| Siapa yang pakai dashboard? | Merchant + tim ops | Tim ops saja |
| Channel category berasal dari? | Mapping table | Langsung per produk per listing |
| Referensi | Shopify, BigCommerce | Ginee, Linnworks, ChannelAdvisor |

Semua analisis over-engineering di bawah diukur terhadap standar ini.

---

## 2. Inventaris Sistem Saat Ini

### 2.1 Struktur File

| Area | File | Catatan |
|---|---|---|
| `src/app/(admin)/` | ~102 file | 8 route section utama |
| `src/modules/` | ~105 file | 5 modul, termasuk v1+v2 paralel |
| `src/shared/` | ~30 file | UI components + contexts |
| `src/lib/api/` | 12 file | Layer legacy terpisah |
| `docs/` | 104 file | 81 product docs + 22 setup docs |
| **Total** | **~353 file** | Belum termasuk config/test |

### 2.2 Route Sections

| Section | File | Status |
|---|---|---|
| `products/` | 13 | ✅ Core — wizard 3-step, list, detail |
| `channels/` | 7 | ✅ Core — OAuth, stores, categories |
| `omni-admin/` | 26 | ⚠️ Sebagian over-engineered |
| `platform-admin/` | 48 | ⚠️ Heavy — 9 subsection config |
| `business-rules/` | 1 | ❓ Perlu evaluasi |
| `conditional-logic/` | 3 | ✅ Dibutuhkan untuk Step 2 |

---

## 3. Temuan Over-Engineering

### 🔴 Signifikan — Sudah Diakui dalam Docs

#### 3.1 Platform Category Taxonomy (Rigid Hierarchy)

**Lokasi:** `src/app/(admin)/omni-admin/product-categories/`, `channel_category_mappings` collection

**Masalah:**  
Sistem category yang dibangun menggunakan pola storefront — rigid parent-child hierarchy dengan field `parent`, `children`, `path`, `depth`, `level`. Ini justified ketika customer browse website. Di pure channel management, tidak ada customer yang melihat category tree ini.

**Yang dibutuhkan sebenarnya:**
```
Ginee: flat tags + product type label
Linnworks: tags untuk filtering, bukan hierarchy
ChannelAdvisor: product type classification saja
```

**Dampak saat ini:** Merchant harus merawat hierarchy category hanya untuk keperluan internal filtering. Overhead tanpa business value yang proporsional.

**Status:** Sedang dimigrasikan bertahap melalui Phase 1–6. Phase 3 (tags) sudah frontend complete.

---

#### 3.2 `channel_category_mappings` Table

**Lokasi:** `src/app/(admin)/omni-admin/channel-category-mapping/`

**Masalah:**  
Mapping table ini mengasumsikan: platform category → channel category adalah relasi permanen yang dikelola terpisah dari produk itu sendiri. Ini adalah pola storefront:

```
Platform Category "Pakaian Pria"
    ↓ mapping table
    → Shopee: category_id=100001
    → Tokopedia: category_id=30045
```

**Fakta yang terverifikasi (2026-06-16):**  
`CategoryTreePicker` di Step 2 sudah menyimpan `categoryId` langsung ke `channel_product_data` per produk per store — **bukan** ke mapping table. Artinya, mapping table ini adalah lapisan infrastruktur yang tidak dipakai oleh alur utama.

**Yang benar (sudah ada di Step 2):**
```
MasterProduct → channel_product_data.shopee.categoryId = "100001"
             → channel_product_data.tokopedia.categoryId = "30045"
```

**Status:** Phase 5 sudah tambah tab "Channel Rules" (ProductType-based) dan "Bulk Assign" (Phase 6) sebagai alternatif. Mapping table jadi legacy.

---

#### 3.3 `ImportWizardModal` — Import WooCommerce/Etsy/Wix Collections

**Lokasi:** `src/app/(admin)/omni-admin/channel-category-mapping/_components/ImportWizardModal.tsx`

**Masalah:**  
Fitur ini mengizinkan merchant import collections dari WooCommerce/Etsy/Wix sebagai platform categories. Secara arsitektur ini menciptakan circular dependency:

```
WooCommerce Collections → [import] → Platform Categories → [mapping] → WooCommerce Collections
```

Merchant yang migrasi dari WooCommerce TIDAK perlu kategori WooCommerce-nya jadi platform category. Mereka butuh produknya masuk, lalu saat publish ke WooCommerce, collection dipilih per produk langsung.

**Docs mengakui ini** di `11-category-architecture-analysis.md §ImportCapable`:  
> *"For a Ginee-like platform, the circular dependency reveals that the abstraction is not needed."*

**Status:** Phase 1 (Opsi A) sudah ubah menjadi additive-only. Phase 5 sudah sembunyikan tombol import dari UI. Code masih ada untuk super-admin.

---

### 🟡 Sedang — Technical Debt Nyata

#### 3.4 Dua Modul Produk Paralel (v1 + v2)

**Lokasi:**
- `src/modules/ecommerce-product/` — **47 file** (V1)
- `src/modules/ecommerce-product-v2/` — **58 file** (V2, active)

**Masalah:**  
V1 dan V2 hidup berdampingan. Total 105 file untuk satu feature domain. V1 berisi `productService`, `channelMappingService`, `mediaUploadService`, `productGenerationService` — semua ada juga di V2 dengan implementasi berbeda.

**Risiko:**  
- Engineer baru tidak tahu mana yang dipakai
- Bug fix di V2 tidak otomatis fix V1 (dan vice versa)
- 47 file dead code yang masih di-compile

**Seharusnya:** V1 dihapus setelah V2 confirmed stable. Memory dalam project belum mendokumentasikan kapan V1 bisa dihapus dengan aman.

---

#### 3.5 Tiga Layer API Terpisah

**Masalah:**  
Ada 3 layer terpisah untuk akses API yang sama:

```
src/lib/api/services/productService.ts          ← Layer 1: Legacy
src/modules/ecommerce-product/services/          ← Layer 2: V1 modules
src/app/(admin)/products/_services/              ← Layer 3: Route-level (active)
```

Untuk kategori ada 5 service berbeda di lokasi berbeda. Untuk channel mapping ada 3.

**Dampak:** Tidak jelas ownership. Perubahan di satu layer bisa tidak konsisten dengan layer lain.

---

#### 3.6 `CategoryBrowseModal` Tiga Kali Diimplementasikan

**Lokasi:**
1. `src/app/(admin)/omni-admin/product-types/_components/ChannelDefaultsSection.tsx`
2. `src/app/(admin)/omni-admin/channel-category-mapping/_components/ProductTypeRulesTab.tsx`
3. `src/app/(admin)/omni-admin/channel-category-mapping/_components/BulkAssignTab.tsx`

**Masalah:**  
Komponen yang identik (~80 baris) diimplementasikan 3 kali secara terpisah. Logic `browseTaxonomy` → breadcrumb → node list sama persis di ketiga file.

**Seharusnya:** Satu `CategoryBrowseModal` di `src/shared/ui/` atau di level channel-mapping yang di-export.

---

#### 3.7 `platform-admin/` — 9 Subsection, 48 File

**Lokasi:** `src/app/(admin)/platform-admin/`

**Subsections:**
```
channel-category-api-configs/   ← konfigurasi endpoint API per channel
channel-category-schemas/       ← schema field per channel per category
channel-configurations/         ← konfigurasi umum per channel
channel-field-mappings/         ← mapping field ke master attributes
channel-jolt-specs/             ← JOLT transformation specs
channel-stores/                 ← koneksi store
category-templates/             ← template default categories
field-semantic-knowledge/       ← semantic field matching database
merchant-api-operations/        ← API operation log
```

**Evaluasi:**  
Ini adalah konfigurasi sistem yang dibutuhkan untuk menjalankan platform — bukan merchant-facing feature. Untuk merchant management tool, halaman-halaman ini seharusnya hanya diakses oleh superadmin/platform team, bukan merchant biasa.

**Yang perlu diklarifikasi:** Apakah merchant bisa akses semua ini? Jika ya, itu over-exposure. Jika tidak (superadmin only), arsitekturnya sudah benar — hanya dokumentasinya yang perlu lebih jelas.

---

### 🟢 Dipertanyakan — Perlu Evaluasi Lebih Lanjut

#### 3.8 Business Rules Engine

**Lokasi:** `src/modules/ecommerce-business-rules/` (15 file) + `src/app/(admin)/business-rules/`

**Pertanyaan:** Apakah merchant channel management tool butuh full business rules engine?

**Ginee benchmark:** Ginee punya automation rules tapi sederhana — "kalau stok < 10, pause listing di channel X." Bukan visual rule builder dengan conditional logic tree.

**Bila dipakai untuk:** Sync rules, repricing rules, inventory alerts → **justified**  
**Bila dipakai untuk:** Complex product transformation logic → **mungkin over-engineered**

Perlu dilihat use case aktual yang dipakai merchant sebelum memutuskan apakah ini perlu disederhanakan.

---

#### 3.9 Adaptive Pattern Matching

**Lokasi:** `docs/product/06-adaptive-pattern-matching/`, `src/modules/ecommerce-product-v2/services/pattern-matching.service.ts`

**Sistem:** JOLT transformation dengan ML-like pattern matching untuk otomatis map master product fields ke channel fields.

**Evaluasi:**  
Ini adalah differentiator yang genuine — mengurangi manual setup per channel. Ginee punya fitur serupa. Ini **tidak** over-engineered untuk platform omnichannel. Yang perlu diperhatikan adalah kompleksitas JOLT specs yang tersimpan di platform-admin (sudah diaddress di 3.7).

---

## 4. Perbandingan: Docs vs Implementasi Aktual

### 4.1 Docs yang Akurat dan Berguna

| Dokumen | Status | Catatan |
|---|---|---|
| `11-category-architecture-analysis.md` | ✅ Akurat | Sudah identifikasi masalah dengan tepat |
| `12-category-evolution-roadmap.md` | ✅ Akurat | Phase 1–6 implemented sesuai roadmap |
| `09-channel-category-mapping-frontend.md` | ✅ Updated | Diupdate setiap phase |
| `10-category-transition-backend.md` | ✅ Akurat | Backend spec jelas, status jelas |
| Setup docs (OAuth, channel connect) | ✅ Akurat | Sesuai implementasi |

### 4.2 Ketegangan antara Docs dan Implementasi

| Docs Berkata | Realita Implementasi | Gap |
|---|---|---|
| "Platform category untuk internal filtering" | `product_categories` masih punya parent-child hierarchy yang kompleks | Hierarchy belum disederhanakan |
| "Channel category = atribut listing langsung" | `channel_product_data.categoryId` sudah benar di Step 2 | Tapi `channel_category_mappings` masih ada sebagai "legacy" |
| "Import hanya onboarding" | ImportWizardModal sudah hidden dari UI | Code masih ada, bisa diakses |
| "Tags = primary organizational tool" | Tags sudah ada di model | Belum ada dedicated tag filter UI di product list |
| "Phase 5 selesai" | Tab "Channel Rules" sudah ada | Tapi Platform Categories tab masih default concern merchant |

### 4.3 Docs yang Over-document Fitur yang Akan Dihapus

| Dokumen | Fitur yang Didokumentasikan | Status Fitur |
|---|---|---|
| `05-channel-category-mapping.md` | Seluruh mapping table architecture | Sedang di-deprecate |
| `08-platform-category-templates.md` | Import template flow | Use case terbatas |
| Bagian Phase 1 dengan grace period detail | Grace period implementation | Sudah dihapus (Opsi A) |

---

## 5. Yang Sudah Diperbaiki (Phase 1–6, 2026-06-15–16)

Semua ini adalah langkah yang tepat dan konsisten dengan platform identity:

| Phase | Yang Dihapus/Diperbaiki | Impact |
|---|---|---|
| **1 (Opsi A)** | Grace period lock, CategoryOnboardingPanel, category-origin.service | Menghapus storefront assumption A |
| **1 (Opsi A)** | ImportWizardModal → additive-only, alreadyImported badge | Import tidak lagi bisa overwrite |
| **2** | ProductType.channelCategoryDefaults, ChannelDefaultsSection | Lightweight bridge tanpa mapping table |
| **3** | Tags di MasterProduct, filter + bulk ops | Flat organization seperti Ginee |
| **4** | treeCapable flag di backend | Marketplace channels bisa browse categories |
| **5** | Tab "Channel Rules" (ProductType-based) sebagai primary | Mapping table jadi legacy |
| **6** | BulkAssignTab — product-first bulk assignment | Direct per-product channel category |
| **6** | Verifikasi: CategoryTreePicker sudah Ginee-like | Tidak perlu migration data Step 2 |

---

## 6. Prioritas Cleanup yang Masih Tersisa

### Prioritas 1 — Kode yang Bisa Dihapus Sekarang

| Item | Lokasi | Effort | Risiko |
|---|---|---|---|
| `ecommerce-product/` V1 module | `src/modules/ecommerce-product/` | Medium | Medium — perlu verifikasi tidak ada import aktif |
| `src/lib/api/` legacy layer | `src/lib/api/services/` | Low | Low — cek apakah masih diimport |
| `CategoryBrowseModal` duplikat | 3 file | Low | Low — extract ke shared |

### Prioritas 2 — Simplifikasi Arsitektur

| Item | Action | Impact |
|---|---|---|
| Platform category hierarchy → flat | Hapus field `parent`, `children`, `level`, `depth` dari UI. Backend bisa tetap ada. | Reduce merchant cognitive overhead |
| "Platform Categories" tab → hidden by default | Hanya tampil jika merchant punya existing mappings | Reduce confusion untuk merchant baru |
| Tags filter di product list | Wajib karena Phase 3 sudah build tags tapi belum ada filter UI | Core Ginee-like feature yang hilang |

### Prioritas 3 — Klarifikasi Akses

| Item | Yang Perlu Dilakukan |
|---|---|
| `platform-admin/` 9 subsections | Konfirmasi: apakah merchant-facing atau superadmin-only? Jika superadmin-only, tambahkan guard dan dokumentasikan |
| Business rules engine | Evaluasi actual use cases. Jika hanya dipakai untuk simple automation, pertimbangkan simplifikasi UI |

---

## 7. Kesimpulan

### Yang Tidak Over-Engineered

Ini adalah fondasi yang benar untuk platform omnichannel:

- **Step 2 CategoryTreePicker** — per-produk per-channel, sudah Ginee-like ✅
- **OAuth + Channel Stores** — standard omnichannel feature ✅
- **JOLT + Adaptive Pattern Matching** — differentiator genuine ✅
- **Variant configurator** — dibutuhkan untuk multi-variant products ✅
- **Phase 1–6 migration roadmap** — cleanup yang terstruktur, bukan over-engineering ✅
- **ProductType + channelCategoryDefaults** — ChannelAdvisor-proven pattern ✅
- **BulkAssignTab** — Ginee-standard feature ✅

### Yang Over-Engineered (Ringkasan)

| # | Item | Severity | Action |
|---|---|---|---|
| 1 | Platform category rigid hierarchy | 🔴 Tinggi | Simplifikasi ke flat tags secara bertahap |
| 2 | `channel_category_mappings` sebagai primary path | 🔴 Tinggi | Sudah dimulai Phase 5–6, teruskan |
| 3 | V1 module (47 file) paralel dengan V2 | 🟡 Sedang | Hapus setelah konfirmasi V2 stabil |
| 4 | 3 layer API terpisah | 🟡 Sedang | Konsolidasi ke route-level services |
| 5 | CategoryBrowseModal 3x duplikat | 🟢 Rendah | Extract ke shared component |
| 6 | ImportWizardModal (code masih ada) | 🟢 Rendah | Hapus dari codebase di Phase 5 mature |
| 7 | Grace period / CategoryOriginService | ✅ Sudah dihapus | Phase 1 Opsi A |
| 8 | CategoryOnboardingPanel | ✅ Sudah dihapus | Phase 1 Opsi A |

### Satu Kalimat

> Sistem ini dibangun dengan pola storefront, sedang dimigrasikan ke pola channel management yang benar. Migration-nya terstruktur dan on-track — yang perlu dijaga adalah konsistensi arah dan pembersihan dead code (V1 module, legacy lib/) yang saat ini masih menambah cognitive load engineer.

---

## 8. Referensi

| Dokumen | Isi |
|---|---|
| `docs/product/01-catalog-schema/01-guides/11-category-architecture-analysis.md` | Analisis lengkap platform type vs arsitektur |
| `docs/product/01-catalog-schema/01-guides/12-category-evolution-roadmap.md` | Roadmap Phase 0–6 dengan status |
| `docs/product/01-catalog-schema/01-guides/09-channel-category-mapping-frontend.md` | Status implementasi frontend |
| `docs/product/01-catalog-schema/02-api-reference/10-category-transition-backend.md` | Spec backend per phase |
