# Panduan Membedakan Konsep: Mapping Kategori & Nilai Channel

## Latar Belakang

Ada **empat dokumen** yang namanya mirip-mirip dan tampak berkaitan, namun masing-masing bekerja
di lapisan yang berbeda dalam pipeline produk:

1. **Channel Category Mapping — Konsep & Desain** (`05-channel-category-mapping.md`)
2. **Channel Category Mapping — Implementasi Frontend** (`09-channel-category-mapping-frontend.md`)
3. **Category Select UI** (`06-category-select-ui.md`)
4. **Master-to-Channel Value Mapping (Scenario B)** — Phase 2 dari `09-step2-channel-data-sources.md`

Dokumen `05` dan `09-frontend` membahas **fitur yang sama** dari dua sudut pandang berbeda.
Dokumen `06` dan Scenario B adalah **fitur yang sepenuhnya berbeda**.

---

## Peta Satu Kalimat Per Dokumen

| Dokumen                                   | Satu kalimat                                                                                                             |
|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `05-channel-category-mapping.md`          | **Desain & konsep** — apa itu channel category mapping, model data, state machine, dan mengapa arsitekturnya seperti ini |
| `09-channel-category-mapping-frontend.md` | **Implementasi frontend** dari fitur yang sama di `05` — file komponen, alur user, penanganan error, fix bug taksonomi   |
| `06-category-select-ui.md`                | **Komponen UI Step 1** — merchant memilih kategori platform (org-internal) untuk sebuah produk                           |
| Scenario B (`09-step2-...`)               | **Step 2 auto-suggestion** — sistem menerjemahkan nilai atribut master (`cotton`) ke kode channel (`LZ_MAT_001`)         |

---

## Diagram Lapisan Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  LAPISAN ADMIN CATALOG SETUP (satu kali saat onboarding channel)                    │
│                                                                                     │
│  [05]          Channel Category Mapping — DESAIN                                    │
│                Apa itu, mengapa, model data, state machine, dua tipe channel        │
│                Koleksi: channel_category_mappings                                   │
│                                                                                     │
│  [09-frontend] Channel Category Mapping — IMPLEMENTASI                              │
│                Komponen, user flow, routing, error handling, BFS cache fix          │
│                Komponen: TaxonomyMapperModal, ImportWizardModal, DriftResolutionModal│
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  STEP 1 — Pembuatan Produk Master                                                   │
│                                                                                     │
│  [06] Category Select UI                                                            │
│       Merchant memilih kategori platform untuk produk (internal, org-scoped)        │
│       Koleksi: product_categories (slugs)                                           │
│       Komponen: CategorySelectField.tsx                                             │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  STEP 2 — Channel Product Data                                                      │
│                                                                                     │
│  [Scenario B] Master-to-Channel Value Mapping                                       │
│       Sistem menyarankan kode channel untuk nilai atribut master                    │
│       Contoh: material "cotton" → Lazada "bahan" = "LZ_MAT_001"                     │
│       Koleksi: channel_field_value_mappings                                         │
│       Komponen: MappingSuggestionBanner di ChannelFieldInput.tsx                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tabel Perbandingan Lengkap

| Dimensi              | `05` Konsep CCM                   | `09-frontend` Impl. CCM                                            | `06` Category Select          | Scenario B Step 2 |
|----------------------|-----------------------------------|--------------------------------------------------------------------|-------------------------------|---|
| **Fitur**            | Channel Category Mapping          | Channel Category Mapping                                           | Category Select (Step 1)      | Value Mapping (Step 2) |
| **Relasi antar doc** | Companion dengan `09-frontend`    | Companion dengan `05`                                              | Mandiri                       | Mandiri |
| **Fokus**            | Desain, model data, mengapa       | Implementasi, alur user, bug fix                                   | UI combobox kategori platform | Auto-suggest kode channel |
| **Siapa pelakunya**  | Admin (setup awal)                | — (dokumen teknis)                                                 | Merchant (tiap produk)        | Sistem otomatis |
| **Di mana**          | Admin catalog page                | Admin catalog page                                                 | Step 1 form                   | Step 2 wizard |
| **Subjek**           | Kategori org → taksonomi channel  | Kategori org → taksonomi channel                                   | Produk → kategori platform    | Nilai atribut → kode channel |
| **Contoh konkret**   | "Ponsel" → Shopify GID `aa-3-9-2` | Alur klik di TaxonomyMapperModal                                   | Produk X → "Smartphones"      | `cotton` → `LZ_MAT_001` |
| **Koleksi MongoDB**  | `channel_category_mappings`       | `channel_category_mappings`                                        | `product_categories`          | `channel_field_value_mappings` |
| **Channel-aware?**   | Ya — per store                    | Ya — per store                                                     | Tidak (platform internal)     | Ya — per channelType |
| **Komponen utama**   | (dijelaskan konseptual)           | `TaxonomyMapperModal`, `ImportWizardModal`, `DriftResolutionModal` | `CategorySelectField`         | `MappingSuggestionBanner` |

---

## Penjelasan Mendalam Per Dokumen

### `05` dan `09-frontend` — Dua Sisi Satu Fitur yang Sama

Ini adalah pasangan dokumen untuk satu fitur: **Channel Category Mapping**. Jangan anggap sebagai
dua konsep berbeda.

**`05-channel-category-mapping.md`** adalah dokumen **desain**. Ia menjawab:
*Apa itu Channel Category Mapping? Mengapa arsitekturnya seperti ini? Bagaimana state machine-nya?*

Isinya mencakup:
- Dua flag channel (independen, bukan mutual exclusive): **`importCapable`** (WooCommerce, Etsy,
  Shopify Collections — merchant-created collections, bisa diimport ke platform via `ImportWizardModal`)
  dan **`taxonomyEnabled`** (Shopify Product Taxonomy — taksonomi milik channel, read-only, dipetakan
  via `TaxonomyMapperModal`). Shopify memiliki **keduanya `true`**: Collections untuk merchandising
  storefront (import), Product Taxonomy untuk klasifikasi GID (mapping). Keduanya diaktifkan bersamaan,
  bukan pilih satu.
- Tiga operasi sinkronisasi: IMPORT (Channel→Platform, sekali), PUSH OUT (Platform→Channel, ongoing),
  DRIFT DETECT (Channel→Platform, reaktif)
- State machine `syncStatus`: `UNMAPPED → MAPPED`, `DRIFTED`, `PUSH_FAILED`
- Perbedaan Shopify Collections vs Product Taxonomy (Collections = merchandising storefront, bukan
  untuk `channel_category_mappings`; Taxonomy = ~10.000 node GID, diambil via GraphQL BFS)
- Alasan koleksi `channel_category_mappings` dipisahkan: write contention, compound index, drift poll

**`09-channel-category-mapping-frontend.md`** adalah dokumen **implementasi frontend**. Ia menjawab:
*Bagaimana frontend mengimplementasikan fitur di `05`? File apa saja? Alurnya bagaimana step by step?*

Isinya mencakup:
- Daftar file komponen di `src/app/omni-admin/channel-category-mapping/`
- **User flow lengkap**: klik Map → cek `store.taxonomyEnabled` → `TaxonomyMapperModal` → load
  `previewSecondChannel` (fuzzy suggestions) → browse per level → confirm → `POST /second-channel`
- **Routing**: tidak ada `TAXONOMY_CHANNELS` constant — routing modal ditentukan oleh
  `store.taxonomyEnabled` dan `store.importCapable` dari backend. Jika channel baru diaktifkan via
  perubahan data MongoDB, frontend otomatis memetakan tanpa perubahan kode
- **Error handling**: `browseTaxonomy` melempar exception eksplisit pada HTTP 404 (bukan array
  kosong) dengan pesan diagnostik yang jelas; "empty array" hanya untuk level yang memang kosong
- **Phase state machine** TaxonomyMapperModal: `loading → review → browse → confirming → done`
- **FuzzyMatchSuggestion re-indexing**: backend mengembalikan data keyed by channel taxonomy node;
  modal me-re-index by platform categoryId agar setiap baris kategori bisa lookup suggestion-nya
- **5 bug fix cache taksonomi Shopify**: BFS traversal (Shopify hanya return 26 root node, bukan
  full tree), nodeId lookup (ganti `ancestorIdsContaining` → `findByNodeId`), cache completeness
  threshold (count < `minCacheSize` = 500 → full re-fetch), reactive auth header, cursor null fix

**Cara membacanya bersama:** Baca `05` untuk memahami *konsep dan desain* (kapan use-case ini muncul,
mengapa state machine-nya seperti itu, tipe channel apa). Baca `09-frontend` saat *mengerjakan UI*
(komponen mana yang disentuh, alur state modal, cara handle error, kenapa TAXONOMY_CHANNELS tidak ada).

---

### `06` — Category Select UI (Step 1, Bukan Channel)

`06-category-select-ui.md` **tidak ada hubungannya dengan channel**. Ini adalah UI di **Step 1**
pembuatan produk master, di mana merchant menjawab: *"Produk ini termasuk kategori apa dalam
katalog internal kami?"*

Field ini bertipe `CATEGORY_SELECT` dan dirender oleh `CategorySelectField.tsx` — sebuah combobox
dengan browsing pohon kategori org-scoped. Tidak ada channel API yang dipanggil. Nilai yang disimpan
adalah platform `slug` (misalnya `"smartphones"`), bukan ID channel apapun.

Detail implementasi yang dicakup `06`:
- Mengapa `<select>` biasa tidak cukup: kedalaman tak terbatas, payload bloat, stale data, tidak ada
  tree browsing di flat list
- Normalisasi `CATEGORY_SELECT` → `category-select` untuk matching di `FieldRenderer`
  (`toLowerCase().replace(/_/g, '-')`) — tanpa ini `CATEGORY_SELECT` tidak pernah cocok
- **Path-sort**: `"electronics/phones/smartphones"` secara leksikografis otomatis menempatkan parent
  sebelum child, siblings berdekatan — tidak perlu recursive traversal
- **Org-keyed module-level cache**: `slugCacheByOrg = new Map<string, CategorySlugItem[]>()` — org A
  dan org B punya pohon berbeda; cache singleton lama menyebabkan stale data antar org saat admin
  berpindah konteks org di tab yang sama
- **Invalidasi cache**: via `window.dispatchEvent(new CustomEvent('categoryTreeChanged', ...))` setelah
  operasi CRUD kategori berhasil

---

### Scenario B — Master-to-Channel Value Mapping (Step 2, Bukan Kategori)

Ini adalah masalah yang sepenuhnya berbeda. Setelah merchant mengisi atribut produk di Step 1
(misalnya `material: "cotton"`, `color: "navy blue"`), setiap channel menggunakan **kode proprietary
sendiri** untuk nilai-nilai tersebut.

Lazada tidak menerima `"cotton"` — mereka butuh `"LZ_MAT_001"`.
TikTok tidak menerima `"navy blue"` — mereka butuh `"COLOUR_0036"`.
Amazon untuk gender `"unisex"` butuh array `["mens", "womens"]`.

Scenario B menyelesaikan ini:
1. Tabel terjemahan disimpan di `channel_field_value_mappings` per triplet
   `(channelType, masterFieldName, channelFieldName)` dengan strategi fallback
2. Saat schema Step 2 digenerate, `ChannelValueMappingService.resolveSuggestion()` dipanggil
   untuk setiap field yang punya `masterFieldName` pada `EcommerceMasterAttributeDocument`
3. Hasilnya: `masterMappedSuggestion` disisipkan ke `ChannelFormField` dengan confidence:
   - `EXACT` → banner biru, field di-pre-fill otomatis
   - `FUZZY` → banner kuning, merchant harus konfirmasi
   - `NONE` → warning kuning, tidak ada saran

Fallback strategies jika tidak ada exact match: `PROMPT_USER` (NONE), `FREE_TEXT` (copy nilai master
as-is, FUZZY), `USE_CLOSEST` (Levenshtein distance ke semua `masterValue` entries, FUZZY). Lookup
dokumen mapping di-cache 10 menit via `@Cacheable("channelValueMappings")`.

**Ini bukan tentang kategori.** Atribut yang dipetakan: material, warna, gender — bukan kategori
produk. Hubungannya dengan `05`/`06` hanya bahwa ketiganya adalah bagian dari pipeline sebelum
publish, tetapi bekerja pada entitas yang sama sekali berbeda.

---

## Hubungan Antara Keempat Konsep

Mereka membentuk satu pipeline tetapi masing-masing berdiri mandiri:

```
[06] Step 1: Merchant menetapkan produk ke kategori "Smartphones"
                    │
                    ▼
         Saat publish, sistem lookup:
[05/09] channel_category_mappings { categoryId, storeId }
         → Shopify externalId = "gid://shopify/TaxonomyCategory/aa-3-9-2"
         → TikTok  externalId = "600001"
         → Field category di payload publish diisi otomatis
                    │
         (paralel, tidak bergantung satu sama lain)
                    │
[Scenario B] Step 2: material "cotton" di produk master
         → ChannelValueMappingService.resolveSuggestion()
         → Lazada "bahan" → saran "LZ_MAT_001" (EXACT, pre-filled)
         → Amazon "fabric_type" → saran "100% Cotton" (EXACT, pre-filled)
         → Merchant melihat banner saran, klik Accept atau pilih sendiri
```

`05`/`09-frontend` dan Scenario B berbagi **pola** yang sama (menerjemahkan konsep internal ke
ekuivalen channel), tetapi level operasinya berbeda:
- `05`/`09-frontend` bekerja pada **entitas kategori** — admin setup, org-level, sekali saat
  onboarding channel
- Scenario B bekerja pada **nilai atribut per produk** — per-merchant, per-produk, per-channel,
  berjalan tiap kali schema Step 2 digenerate

---

## Kesalahan Pemahaman yang Umum

### "`05` dan `09-channel-category-mapping-frontend.md` adalah dua fitur berbeda?"

Tidak. Keduanya tentang fitur yang sama — Channel Category Mapping. `05` adalah spesifikasi
konseptual dan desain; `09-frontend` adalah dokumentasi implementasi frontendnya. Saat ada bug di
`TaxonomyMapperModal` atau taksonomi Shopify tidak muncul, baca `09-frontend`. Saat ingin memahami
mengapa state machine-nya demikian atau mengapa koleksinya dipisahkan, baca `05`.

### "`06` dan `05` sama karena keduanya tentang kategori?"

Tidak. `06` adalah UI untuk menetapkan produk ke kategori *platform* (internal, org-scoped). `05`
adalah setup admin untuk menghubungkan kategori *platform* tersebut ke node taksonomi *channel*.
Yang pertama adalah assignment (produk ke kategori), yang kedua adalah mapping (kategori ke channel
node). Keduanya perlu ada agar publish berjalan, tetapi dikerjakan orang berbeda di waktu berbeda.

### "Scenario B mirip `05` karena keduanya 'mapping'?"

Secara konsep iya. Namun:
- `05` memetakan **kategori** (entitas org-level, admin setup, sekali saat onboarding)
- Scenario B memetakan **nilai atribut** (per-produk, per-merchant, tiap kali schema Step 2 dibuka)
- Koleksi MongoDB berbeda, komponen frontend berbeda, tidak ada kode yang dibagi

### "`importCapable` dan `taxonomyEnabled` adalah mutual exclusive?"

Tidak. Keduanya flag independen. Shopify memiliki keduanya `true` secara bersamaan karena dua
sistem kategorinya benar-benar berbeda: **Collections** (merchant-created, `importCapable=true` →
`ImportWizardModal`) dan **Product Taxonomy** (Shopify-owned ~10.000 node GID, `taxonomyEnabled=true`
→ `TaxonomyMapperModal`). Frontend harus mendukung kedua modal untuk store Shopify. Komentar lama
di `ChannelStoreConnectionResponse.java` yang menyebut "Mutually exclusive" sudah dikoreksi.

### "Perlu menambahkan `TAXONOMY_CHANNELS` constant ke frontend?"

Tidak. Lihat `09-channel-category-mapping-frontend.md` — constant ini sudah dihapus. Routing modal
(TaxonomyMapperModal vs ImportWizardModal) ditentukan oleh `store.taxonomyEnabled` dan
`store.importCapable` dari backend, bukan hardcoded list. Jangan tambahkan kembali.

### "Scenario B tentang kategori karena ada `CategoryTreePicker` di Step 2?"

Tidak. `CategoryTreePicker` digunakan untuk **Scenario C** (Phase 3 Step 2) — pemilihan kategori
*channel* (TikTok category, Lazada category) secara multi-level. Scenario B adalah tentang nilai
atribut material/warna/gender. Scenario C menggunakan field type `CATEGORY_TREE`; Scenario B
menggunakan `masterMappedSuggestion` pada field SELECT/MULTISELECT biasa.

---

## Kapan Membaca Dokumen Mana

| Situasi | Dokumen |
|---|---|
| Ingin memahami desain dan arsitektur Channel Category Mapping | `05` |
| Ada bug di `TaxonomyMapperModal` atau alur browse taksonomi | `09-frontend` |
| Taksonomi Shopify tidak muncul di browser (children kosong) | `09-frontend` — Backend Fix Summary |
| Ingin tahu kenapa `TAXONOMY_CHANNELS` tidak ada di types file | `09-frontend` — TAXONOMY_CHANNELS — Removed |
| Merchant tidak bisa menemukan kategori di Step 1 | `06` — CategorySelectField dan path-sort |
| Cache kategori Step 1 stale setelah merchant rename/hapus kategori | `06` — Org-Keyed Slug Cache + invalidateOrgCache |
| Step 2 field "bahan" di Lazada tidak ada saran otomatis | Scenario B + seeding `channel_field_value_mappings` |
| Step 2 field kategori TikTok perlu browsing multi-level | Scenario C (Phase 3) di `09-step2-channel-data-sources.md` |
| Onboarding channel baru, perlu map platform categories ke channel | `05` (desain) + `09-frontend` (implementasi) |
| Bagaimana fuzzy suggestion di TaxonomyMapperModal di-re-index? | `09-frontend` — FuzzyMatchSuggestion Direction |

---

## Codebase Reference

| Konsep | File |
|---|---|
| **Channel Category Mapping admin page** | `src/app/omni-admin/channel-category-mapping/_components/ChannelCategoryMappingPage.tsx` |
| **Taxonomy mapper modal (Type 2 channels)** | `_components/TaxonomyMapperModal.tsx` |
| **Import wizard modal (WooCommerce/Etsy)** | `_components/ImportWizardModal.tsx` |
| **Drift resolution modal** | `_components/DriftResolutionModal.tsx` |
| **Channel mapping service (API calls)** | `_services/channel-mapping.service.ts` |
| **TypeScript types** | `_types/channel-mapping.ts` |
| **Category Select Field (Step 1)** | `src/modules/ecommerce-product-v2/step1-create/components/CategorySelectField.tsx` |
| **Field Renderer (deteksi CATEGORY_SELECT)** | `src/modules/ecommerce-product-v2/step1-create/components/FieldRenderer.tsx` |
| **Value Mapping suggestion banner (Step 2)** | `step2-channel-fields/components/wizard/ChannelFieldInput.tsx` |
| **Value Mapping service** | `channel/mapping/ChannelValueMappingServiceImpl.java` |
| **Value Mapping data loader** | `channel/mapping/ChannelValueMappingDataLoader.java` (`@Order(120)`) |
| **Channel Taxonomy Service (BFS cache)** | `channel/taxonomy/service/ChannelTaxonomyService.java` |
| **Channel Taxonomy Cache collection** | `channel_taxonomy_cache` (TTL 7 hari) |

---

## Dokumen Terkait

- [`05-channel-category-mapping.md`](../../01-catalog-schema/01-guides/05-channel-category-mapping.md) — Desain lengkap: state machine, tipe channel, why separate collection, second-channel mapping
- [`09-channel-category-mapping-frontend.md`](../../01-catalog-schema/01-guides/09-channel-category-mapping-frontend.md) — Implementasi frontend: komponen, user flow, error handling, 5 bug fix cache taksonomi
- [`06-category-select-ui.md`](../../01-catalog-schema/01-guides/06-category-select-ui.md) — CategorySelectField: path-sort, org-keyed cache, combobox behaviour
- [`09-step2-channel-data-sources.md`](./09-step2-channel-data-sources.md) — Sebelas skenario Step 2; Scenario B (Phase 2) di halaman 3; Scenario C (Phase 3) hierarchical category tree
- [`12-path-b-category-attributes-explanation.md`](./12-path-b-category-attributes-explanation.md) — Scenario C/D: hierarchical channel category tree dan category-dependent field injection
