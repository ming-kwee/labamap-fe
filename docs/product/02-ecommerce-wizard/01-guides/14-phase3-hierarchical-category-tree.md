# Phase 3 — Scenario C: Hierarchical Category Tree

## Ringkasan

Phase 3 menangani fakta bahwa kategori di channel seperti TikTok Shop, Lazada, Amazon, dan Shopee bukan pilihan flat satu level, melainkan pohon hierarki 3–6 level dengan hingga 50.000 node. Merchant harus memilih leaf node yang tepat sebelum channel mau menerima listing produk. Field type `CATEGORY_TREE` dan komponen `CategoryTreePicker` dibuat khusus untuk kebutuhan ini.

---

## Tiga Sistem Kategori yang Berbeda

Sebelum memahami Phase 3, penting untuk membedakan tiga sistem kategori yang hidup berdampingan dalam platform ini. Ketiga-tiganya berbeda tujuan dan berbeda collection MongoDB.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SISTEM 1: Platform Category                                                │
│  Collection: product_categories                                             │
│  Pemilik:    Merchant (per-org)                                             │
│  Tujuan:     Mengorganisir katalog produk internal di dalam platform        │
│  Contoh:     "Electronics > Phones > Smartphones"                           │
│  Dibaca di:  Step 1 Wizard (klasifikasi produk), navigasi storefront        │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              │ dihubungkan lewat
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SISTEM 2: Channel Category Mapping                                         │
│  Collection: channel_category_mappings                                      │
│  Pemilik:    Platform (per-org, per-store)                                  │
│  Tujuan:     Menjembatani platform category ↔ channel taxonomy              │
│  Contoh:     "Smartphones" (platform) → externalId "600001" (TikTok)       │
│  Dibaca di:  Channel mapping admin page, seeding suggestion Phase 3         │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              │ externalId menjadi pre-fill
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SISTEM 3: Channel Category Tree                                            │
│  Collection: channel_category_cache (+ channel_taxonomy_cache utk Shopify)  │
│  Pemilik:    Channel (Lazada, TikTok, Shopee, Amazon, eBay, Shopify, dll)   │
│  Tujuan:     Tree channel asli yang wajib diisi saat listing produk         │
│  Contoh:     TikTok tree: "Fashion > Men > Tops > T-Shirts" (id: 600001)   │
│  Dibaca di:  Step 2 Wizard — Phase 3 (CATEGORY_TREE field)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Hubungan dengan `02-product-categories.md`

File `02-product-categories.md` menjelaskan Sistem 1 — platform category yang dimiliki merchant.

**Platform category digunakan di Step 1.** Ketika merchant membuat atau mengedit master product, mereka memilih platform category (`product_categories` slug), misalnya `"electronics/phones/smartphones"`. Ini adalah klasifikasi internal untuk catalog management, navigasi storefront, dan routing ProductType → MasterAttributes.

**Platform category TIDAK langsung dipakai di Step 2.** Channel tidak peduli dengan struktur kategori internal merchant. TikTok Shop tidak tahu apa itu `"electronics/phones/smartphones"` — ia hanya menerima category ID dari taxonomy-nya sendiri (misalnya `600001`).

**Titik temu:** Sistem 2 (`channel_category_mappings`) menjadi jembatan. Ketika merchant sudah memetakan "Smartphones" (platform) → TikTok category "600001" di halaman admin channel mapping, ID `600001` itu tersimpan sebagai `externalId`. Pada saat Step 2 dibuka, backend bisa membaca mapping ini untuk **pre-suggest** channel category yang sesuai — merchant tidak perlu memilih ulang dari nol.

```
Step 1: merchant pilih platform category slug
        "electronics/phones/smartphones"
        ↓
        disimpan di: master_product_data.productAttributes["category"]

Step 2: backend lookup channel_category_mappings
        WHERE categoryId = platform_category["electronics/phones/smartphones"]
          AND storeId = <store yang sedang di-edit>
        → dapat externalId = "600001"
        → pre-fill selectedPath di categoryTreeConfig
```

---

## Hubungan dengan `05-channel-category-mapping.md`

File `05-channel-category-mapping.md` menjelaskan Sistem 2 — pemetaan antara platform category dan channel taxonomy, beserta mekanisme sync (import, push-out, drift detect).

Relevansinya dengan Phase 3 ada di dua hal:

### 1. Channel Type menentukan perilaku CATEGORY_TREE

`05-channel-category-mapping.md` membagi channel menjadi dua tipe:

| Tipe | Channel | Sumber tree untuk Phase 3 |
|------|---------|---------------------------|
| **Type 1** (import-capable) | WooCommerce, Etsy | `channel_category_cache` — merchant's own collections via REST |
| **Type 2** (fixed taxonomy) | Shopify, Amazon, TikTok, Lazada, Shopee, eBay | `channel_category_cache` atau `channel_taxonomy_cache` — channel-owned, read-only |

Untuk **Type 2**, tree yang ditampilkan di `CategoryTreePicker` Phase 3 adalah tree yang sama dengan yang digunakan di `TaxonomyMapperModal` pada halaman channel mapping. Komponen frontend-nya pun sama: `CategoryTreePicker.tsx`.

Untuk **Type 1** (WooCommerce), tree yang ditampilkan adalah koleksi yang sudah diimport merchant ke platform. Dalam konteks ini Phase 3 sebetulnya memperlihatkan merchant's own collections — bukan taxonomy channel yang fixed.

### 2. `externalId` dari mapping → `categoryId` yang disimpan di Step 2

Kolom `externalId` di `channel_category_mappings` menyimpan native ID channel (misalnya TikTok `600001`, Lazada `10000001`, Shopify GID `gid://shopify/TaxonomyCategory/aa-1-1`). Ini adalah nilai yang sama dengan yang akan disimpan di `channel_product_data.categoryId` setelah merchant memilih lewat `CategoryTreePicker` di Step 2.

```
channel_category_mappings.externalId = "600001"   ← hasil mapping admin
channel_product_data.categoryId      = "600001"   ← hasil pilih di Step 2

Keduanya merujuk entitas yang sama: TikTok category ID 600001.
```

Jika merchant sudah melakukan mapping di admin page, `categoryId` di `channel_product_data` bisa di-seed otomatis dari `externalId` sehingga merchant tidak perlu klik pohon kategori lagi di Step 2.

---

## Arsitektur Backend Phase 3

### Collections yang terlibat

| Collection                    | Isi                                                                    | Diakses oleh             |
|-------------------------------|------------------------------------------------------------------------|--------------------------|
| `channel_category_api_config` | Config HTTP per channel: baseUrl, auth, response mapping, pagination   | `GenericCategoryService` |
| `channel_category_cache`      | Cache node pohon per `(channelType, storeId, parentId)`, TTL 24 jam    | `GenericCategoryService` |
| `channel_taxonomy_cache`      | Cache khusus Shopify Product Taxonomy (10.000+ node), TTL 7 hari       | `ChannelTaxonomyService` |
| `channel_category_mappings`   | Link platform category ↔ channel externalId per store                  | Pre-fill suggestion      |
| `channel_product_data`        | Nilai yang merchant simpan per produk per store, termasuk `categoryId` | Step 2 save/load         |

### Alur fetch kategori (drill-down)

```
Frontend: user klik "Electronics" di CategoryTreePicker
          GET /merchant-data/{channelType}/{storeId}/categories?parentId=100

Backend (GenericCategoryService):
  1. Cek channel_category_cache WHERE (channelType, storeId, parentId=100)
     → HIT: kembalikan cached nodes
     → MISS: lanjut ke langkah 2

  2. Baca channel_category_api_config.treeApiConfig untuk channelType
     → baseUrl + childrenUrlPath + auth + response mapping fields

  3. Build HTTP request:
     → URL: baseUrl + childrenUrlPath
     → Auth: sesuai authStrategy (BEARER_TOKEN / API_KEY_HEADER / API_KEY_QUERY / HMAC_SHA256)
     → Param: parentIdQueryParam=100 (atau omit jika root)

  4. Call channel API, parse response:
     → traversal itemsJsonPath → array of nodes
     → map tiap node: nodeIdField, nodeNameField, nodeHasChildrenField
       (nodeHasChildrenInvert=true → balik boolean, dipakai Lazada & TikTok)

  5. Simpan ke channel_category_cache (TTL 24 jam)

  6. Return ke frontend sebagai CategoryTreeNode[]
```

### Alur warming cache (CategorySyncJob)

```
CategorySyncJob (nightly):
  Untuk tiap channel_category_api_config:
    RECURSIVE     → BFS dari root, panggil fetchChildren berulang (Lazada, TikTok)
    SINGLE_CALL   → satu HTTP request dapat semua node (Shopee, eBay, Wix)
    ROOT_ONLY     → skip (Amazon, Shopify) — cache diisi lazy saat user drill-down
```

### Konfigurasi per channel (`treeApiConfig`)

`channel_category_api_config.treeApiConfig` adalah konfigurasi lengkap yang memberi tahu `GenericCategoryService` cara memanggil API pohon kategori channel tersebut. Detail lengkap ada di dokumen terpisah, tapi ringkasannya:

| Field                                            | Fungsi                                                     |
|--------------------------------------------------|------------------------------------------------------------|
| `baseUrl` + `childrenUrlPath`                    | URL endpoint kategori                                      |
| `authStrategy` + `authCredentialKey`             | Cara inject kredensial store                               |
| `parentIdQueryParam`                             | Nama query param untuk parentId                            |
| `itemsJsonPath`                                  | Dot-notation path ke array node di response                |
| `nodeIdField`, `nodeNameField`                   | Field ID dan nama tiap node                                |
| `nodeHasChildrenField` + `nodeHasChildrenInvert` | Cara tahu apakah node punya anak                           |
| `treeStructure`                                  | `CHILDREN_PER_REQUEST` / `FLAT_WITH_PARENT_ID` / `NESTED`  |
| `fullTreeStrategy`                               | `RECURSIVE` / `SINGLE_CALL` / `ROOT_ONLY` (untuk sync job) |

Menambah channel baru cukup insert satu dokumen di `channel_category_api_config` — tidak ada perubahan Java.

---

## Kontrak Frontend Phase 3

### Field type baru

```typescript
// Ditambahkan ke ChannelFieldType
"CATEGORY_TREE"
```

### categoryTreeConfig pada ChannelFormField

```typescript
categoryTreeConfig?: {
  rootEndpoint:    string;              // GET /merchant-data/{ch}/{store}/categories
  childEndpoint:   string;             // ...?parentId={parentId}&organizationId=...
  maxDepth:        number;             // dari channel_category_api_config
  requireLeafNode: boolean;            // true = hanya leaf yang bisa dipilih
  selectedPath?:   CategoryTreeNode[]; // breadcrumb pre-populated dari nilai tersimpan
}
```

`selectedPath` diisi oleh `ChannelStepSchemaService` jika `channel_product_data.categoryId` sudah tersimpan, sehingga form tidak perlu round-trip ekstra saat dibuka.

### Komponen CategoryTreePicker

```
Collapsed view:
  [Electronics > Phones > Smartphones]  [Change]

Open panel:
  Level 0:  [Electronics ▶]  [Fashion ▶]  [Home ▶]  ...
                │
  Level 1:  [Phones ▶]  [Tablets ▶]  [Laptops ▶]  ...
                │
  Level 2:  [Smartphones ●]  [Feature Phones ●]   (● = leaf, selectable)
```

Perilaku:
- Loading spinner per-level saat fetch sedang berjalan
- Error state dengan tombol retry jika channel API gagal
- Hanya leaf node yang bisa dipilih jika `requireLeafNode: true`
- Integrasi Phase 2: jika `masterMappedSuggestion.confidence === "EXACT"`, tampilkan shortcut "Accept suggested category" — merchant bisa skip tree browsing

---

## Alur Lengkap: Step 1 → Mapping Admin → Step 2

```
STEP 1 (master product):
  Merchant pilih platform category = "electronics/phones/smartphones"
  → disimpan di master_product_data

MAPPING ADMIN (satu kali setup):
  Merchant buka halaman Channel Category Mapping
  → platform category "Smartphones" ↔ TikTok category "600001 (Mobile Phones)"
  → disimpan di channel_category_mappings:
    { categoryId: <id_platform_smartphones>, storeId: <tiktok-store>, externalId: "600001" }

STEP 2 (channel-specific data):
  ChannelStepSchemaService build form untuk TikTok store:

  1. Baca field type = CATEGORY_TREE dari EcommerceMasterAttributeDocument

  2. Cek channel_product_data.categoryId untuk produk ini + store ini
     → Jika ada: pakai sebagai selectedPath → rebuild breadcrumb dari channel_category_cache
     → Jika kosong: cek channel_category_mappings pakai platform categoryId produk
       → Dapat externalId "600001" → pre-fill sebagai suggested category

  3. Return ChannelFormField:
     {
       fieldType: "CATEGORY_TREE",
       fieldName: "category_id",
       categoryTreeConfig: {
         rootEndpoint: "/merchant-data/tiktokshop/store-01/categories",
         childEndpoint: "...?parentId={parentId}",
         maxDepth: 5,
         requireLeafNode: true,
         selectedPath: [
           { id: "1", name: "Fashion" },
           { id: "100", name: "Men" },
           { id: "600001", name: "Mobile Phones" }
         ]
       }
     }

  4. Merchant konfirmasi atau browse ulang → simpan via POST /channel-product-data/save
     → channel_product_data.categoryId = "600001"

  5. categoryId tersimpan memicu Phase 4 → fetch category-specific required fields
```

---

## Koneksi Phase 3 → Phase 4

Memilih leaf category di Phase 3 adalah trigger untuk Phase 4 (Category-Dependent Field Injection).

```
CategoryTreePicker: user pilih leaf "600001 (Mobile Phones)"
        │
        ▼
ChannelStoreTab.handleFieldChange("category_id", "600001")
        │
        ▼
useEffect detects categoryId change (via useRef lastFetchedCategoryId)
        │
        ▼
GET /form-schema/category-attributes?categoryId=600001&storeId=...
        │
        ▼
GenericCategoryService.fetchAttributesFromApi()
  → baca channel_category_api_config.attributeConfig
  → call TikTok attribute API: /api/products/attributes?category_id=600001
  → return field: brand (required), material (optional), ...
        │
        ▼
Inject sebagai section "Category-specific fields" (violet highlight) di form
```

Tanpa Phase 3 yang memberikan `categoryId` yang valid, Phase 4 tidak bisa berjalan karena tidak ada category ID untuk di-query ke attribute API channel.

---

## Perbedaan Channel: Shopify vs Channel Lainnya

Shopify punya dua konsep yang terpisah dan penting untuk dipahami:

| Konsep                       | Sistem                              | Relevansi di Step 2                                                     |
|------------------------------|-------------------------------------|-------------------------------------------------------------------------|
| **Shopify Collections**      | Type 1, merchant-created            | Phase 3 `importConfig` — dipilih saat publish (Step 3), bukan di Step 2 |
| **Shopify Product Taxonomy** | Type 2, Shopify-owned, ~10.000 node | Phase 3 `CATEGORY_TREE` — wajib diisi untuk metadata produk             |

Di Step 2, field `CATEGORY_TREE` untuk Shopify merujuk ke **Product Taxonomy** (diambil via `channel_taxonomy_cache`), bukan Collections. Collections adalah urusan Step 3 (publish) dan dikelola via `importConfig` terpisah.

---

## Ringkasan Relasi Antar Dokumen

```
02-product-categories.md
  └── Menjelaskan platform category (product_categories)
      → Dipakai di Step 1
      → Jadi sumber lookup untuk pre-fill suggestion di Step 2 Phase 3
      → Dihubungkan ke channel via channel_category_mappings

05-channel-category-mapping.md
  └── Menjelaskan channel_category_mappings (Sistem 2)
      → Menentukan tipe channel (import-capable vs fixed-taxonomy)
        → mempengaruhi sumber tree yang ditampilkan di CategoryTreePicker
      → externalId di sini = categoryId yang tersimpan di channel_product_data
      → TaxonomyMapperModal dan CategoryTreePicker Phase 3 share komponen yang sama

09-step2-channel-data-sources.md (Phase 3)
  └── Menjelaskan CATEGORY_TREE field + CategoryTreePicker di Step 2
      → Membaca channel_category_cache via GenericCategoryService
      → Config HTTP per channel dari channel_category_api_config.treeApiConfig
      → Saved value (categoryId) memicu Phase 4 (attribute injection)
      → Pre-fill suggestion datang dari channel_category_mappings
```

---

## ChannelTaxonomyService — Performance Architecture & Bugs Fixed (2026-05-28)

Bagian ini mendokumentasikan implementasi dan perbaikan performa pada `ChannelTaxonomyService.java`
yang menangani `channel_taxonomy_cache` untuk Shopify Product Taxonomy.

### Kenapa Shopify berbeda dari channel lain

| Aspek               | `channel_category_cache` (TikTok, Lazada, dll) | `channel_taxonomy_cache` (Shopify)         |
|---------------------|------------------------------------------------|--------------------------------------------|
| Scope               | Per storeId                                    | Global per channelType                     |
| TTL                 | 24 jam                                         | 7 hari                                     |
| Ukuran              | Ratusan hingga ribuan node                     | 12,378 node (7 level)                      |
| Pengisian           | Lazy on cache-miss                             | Two-phase BFS: roots sync + BFS background |
| Service             | `CategoryCacheService`                         | `ChannelTaxonomyService`                   |

### Two-phase `fetchAndCacheAll`

**Phase 1** (sinkron — memblokir sampai selesai, lalu return HTTP response):
```
GraphQL: taxonomy.categories first:26
→ tulis 26 root nodes ke channel_taxonomy_cache
→ return HTTP response (user melihat root nodes dalam ~1.5 detik)
```

**Phase 2** (fire-and-forget via `subscribe()` — berjalan di background):
```
Level 1: batch childrenIds dari 26 roots  → fetch → tulis 213 node   → MongoDB → rekursi
Level 2:                                  → fetch → tulis 1.551 node  → MongoDB → rekursi
Level 3:                                  → fetch → tulis 4.265 node  → MongoDB → rekursi
Level 4:                                  → fetch → tulis 4.204 node  → MongoDB → rekursi
Level 5:                                  → fetch → tulis 1.628 node  → MongoDB → rekursi
Level 6:                                  → fetch → tulis 438 node    → MongoDB → selesai
Total: 12.378 node dalam ~5 menit
```

**Penting:** setiap level BFS langsung di-flush ke MongoDB via `bulkUpsert(channelType, newNodes)`
**sebelum** rekursi ke level berikutnya. Ini menghilangkan jendela saturasi 190 detik yang
sebelumnya terjadi ketika semua 12.378 node dikumpulkan di memori lalu ditulis sekaligus via
`saveAll()`.

### `refetchInFlight` guard

`ConcurrentHashMap.newKeySet()` digunakan sebagai concurrent set untuk mencegah multiple BFS
berjalan bersamaan ketika banyak request tiba di cache yang kosong atau partial:

```java
// count = 0 (cache kosong): hanya satu thread yang memblokir di Phase 1
if (refetchInFlight.add(channelType)) {
    return fetchAndCacheAll(channelType, storeId, organizationId, config);
}
return Mono.empty();  // concurrent request lain langsung dapat empty list

// count > 0 (partial/stale): serve stale, satu BFS di background
if (refetchInFlight.add(channelType)) {
    cacheRepository.deleteByChannelType(channelType)
            .then(fetchAndCacheAll(...))
            .doOnError(e -> refetchInFlight.remove(channelType))
            .subscribe();  // fire-and-forget
}
return Mono.empty();  // serve partial cache tanpa memblokir
```

**Aturan ownership:** `refetchInFlight.remove(channelType)` hanya dipanggil di dalam Phase 2 BFS
`doOnSuccess`/`doOnError`. Tidak pernah dihapus setelah Phase 1 selesai, sehingga BFS baru
tidak bisa mulai selagi Phase 2 masih berjalan.

### `ensureCache` — tiga state

| State cache         | Kondisi          | Aksi                                                        |
|---------------------|------------------|-------------------------------------------------------------|
| **Warm**            | count ≥ 500      | Return langsung — fast path < 100ms                         |
| **Partial** (stale) | 0 < count < 500  | Serve stale, trigger satu BFS re-seed di background         |
| **Empty** (cold)    | count = 0        | Thread pertama blokir di Phase 1; thread lain dapat empty   |

---

### Bug 1 — TaxonomyMapperModal menampilkan suggestion kosong

**Gejala:** `previewSecondChannel` mengembalikan daftar suggestion kosong meski taxonomy
cache sudah berisi ribuan node.

**Tiga root cause yang diperbaiki bersamaan:**

**1. Loop iteration terbalik di `buildFuzzyMatchesFromTaxonomy`**

Sebelumnya: `for (taxonomyLeaf : allLeaves) { for (platformCategory : ...) }`
→ Result map di-key oleh `platformCategoryId` dan di-overwrite tiap taxonomy leaf.
Last write wins — hampir semua suggestion hilang secara diam-diam.

Sesudah: `for (platformCategory : platformCategories) { for (taxonomyLeaf : allLeaves) }`
→ Satu best-match per platform category — benar sesuai harapan frontend.

**2. `ensureCache` terpanggil di dalam `getLeafNodesFromCacheOnly`**

Memanggil `ensureCache` di dalam `previewSecondChannel` memicu BFS penuh setiap kali modal
dibuka, yang memblokir reactive pipeline dan menyebabkan hasil kosong.

Perbaikan: `getLeafNodesFromCacheOnly()` membaca dari cache tanpa memanggil `ensureCache`.
Jika cache kosong, langsung return empty list.

**3. Filter `organizationId` tidak ada**

Query taxonomy cache tidak menyertakan `organizationId`, berpotensi mengembalikan data
lintas-org di lingkungan multi-tenant.

Perbaikan: `organizationId` ditambahkan ke semua query taxonomy cache.

---

### Bug 2 — CategoryTreePicker hang 7–10 detik setiap dibuka

**Gejala:** Membuka CategoryTreePicker di Step 2 menyebabkan tunggu 7–10 detik sebelum
root nodes muncul. Menutup lalu membuka kembali hang lagi.

**Root cause — circular blocking loop:**

```
Request → ensureCache
  count = 26  →  partial (< threshold 500)
  → hapus 26 node dari cache
  → panggil fetchAndCacheAll() SECARA SINKRON (memblokir HTTP response selama 7 detik)
     Phase 1: simpan 26 root node ✓
     Phase 2 BFS: silently error (onErrorResume menyembunyikan exception)
              → 0 children ditulis
  → count = 26 lagi (state identik seperti sebelumnya)
  → HTTP response akhirnya dikembalikan setelah 7 detik tunggu

Request berikutnya:
  → count = 26 → siklus yang sama berulang terus
```

Hang disebabkan oleh **BFS sinkron di setiap request** ditambah **BFS gagal secara diam-diam**
sehingga cache selalu tersisa 26 node.

**Empat-bagian fix:**

| # | Fix | Perubahan |
|---|-----|-----------|
| 1 | **Non-blocking partial cache** | count>0 langsung return (serve stale), BFS di background |
| 2 | **Two-phase `fetchAndCacheAll`** | Phase 1 simpan roots lalu return; Phase 2 BFS via `subscribe()` |
| 3 | **`refetchInFlight` di count=0** | Hanya satu thread yang blokir di Phase 1; yang lain dapat empty |
| 4 | **Level-by-level BFS flush** | Setiap level BFS langsung ditulis ke MongoDB — eliminasi window 190 detik `saveAll` |

### Benchmark performa (cold start → warm cache)

| Event                                    | Waktu dari request pertama |
|------------------------------------------|---------------------------|
| Root nodes terlihat (26 node)            | ~1,5 detik                |
| Level 1 children tersedia (213 node)     | ~25 detik                 |
| Level 2 tersedia (1.551 node)            | ~65 detik                 |
| Level 3 tersedia (4.265 node)            | ~120 detik                |
| Full tree selesai (12.378 node)          | ~5 menit                  |
| **Request berikutnya (warm cache)**      | **< 100 ms**              |

User pertama melihat root nodes dalam ~1,5 detik. BFS selesai diam-diam di background.
Semua user berikutnya mendapat response < 100ms dari warm cache.

---

## Phase 3b — Category Tree Search ⚠️ Backend implementation required

### Masalah

`CategoryTreePicker` hanya bisa browse level per level. Untuk Shopify (~6.000 node, 4 level) atau Amazon (~100.000+ node), merchant tidak bisa memverifikasi apakah kategori mereka ada di tree tanpa navigasi 3–4 level. Butuh search.

### Solusi

Tambah field opsional `searchEndpoint` ke `CategoryTreeConfigDto`. Ketika field ini ada:
- Frontend switch ke **server-side search mode** (debounced 300ms)
- Merchant ketik → satu API call → hasil flat list dengan full path ("Apparel › Clothing › Tops › Shirts")
- Merchant bisa konfirmasi atau pilih dalam satu langkah

Ketika `searchEndpoint` tidak ada (Wix, taxonomy kecil):
- Frontend fallback ke **client-side filter** node yang sedang tampil di level aktif
- Tidak butuh perubahan backend

**Frontend sudah selesai.** Yang perlu diimplementasikan backend:

### Perubahan `CategoryTreeConfigDto`

```java
public record CategoryTreeConfigDto(
    String rootEndpoint,
    String childEndpoint,
    int maxDepth,
    boolean requireLeafNode,
    List<CategoryNodeDto> selectedPath,

    // NEW — Phase 3b
    // Null untuk channel dengan taxonomy kecil (Wix).
    // Diisi untuk Shopify, Amazon, TikTok, Lazada, Shopee, eBay.
    // Pre-built path: "/merchant-data/{ch}/{store}/categories/search?organizationId=..."
    // Frontend append: &q={urlEncodedQuery}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    String searchEndpoint
) {}
```

### Endpoint baru

```
GET /api/v1/merchant-data/{channelType}/{storeId}/categories/search
    ?q={query}&organizationId={organizationId}[&maxResults=20][&leafOnly=false]
```

**Response: `CategorySearchResultDto[]`**

```json
[
  {
    "id":          "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "name":        "Shirts",
    "fullName":    "Apparel & Accessories > Clothing > Clothing Tops > Shirts",
    "hasChildren": false,
    "level":       3,
    "ancestorIds": [
      "gid://shopify/TaxonomyCategory/aa",
      "gid://shopify/TaxonomyCategory/aa-1",
      "gid://shopify/TaxonomyCategory/aa-1-13"
    ]
  }
]
```

**Invariant wajib:** `fullName.split(" > ").length === ancestorIds.length + 1`

### Implementasi

Search dilakukan pada `channel_category_cache` yang sudah ada (Phase 3). Tambah dua field baru ke dokumen cache, diisi oleh `CategorySyncJob`:

| Field baru | Isi |
|---|---|
| `fullName` | `"Apparel & Accessories > Clothing > Clothing Tops > Shirts"` |
| `ancestorIds` | List ID ancestor dari root ke parent langsung |

Query: regex case-insensitive pada field `name`. Untuk collection besar bisa upgrade ke MongoDB `$text` index.

**Ordering response:** leaf dulu, lalu intermediate node; dalam tiap tier urutkan berdasarkan panjang nama ascending.

### Channel yang harus include `searchEndpoint`

| Channel | Include? | Alasan |
|---|---|---|
| Shopify | ✅ Ya | ~12.000+ node, 4 level |
| Amazon | ✅ Ya | ~100.000+ node, 6 level |
| TikTok Shop | ✅ Ya | ~3.000 node |
| Lazada | ✅ Ya | ~5.000 node |
| Shopee | ✅ Ya | ~3.000 node |
| eBay | ✅ Ya | ~3.000 node |
| Wix | ❌ Tidak | Merchant-created, 20–200 node, frontend filter cukup |

### Checklist testing

- [ ] `?q=shirts` mengembalikan node "Shirts" dengan `fullName` dan `ancestorIds` yang benar
- [ ] `fullName.split(" > ").length === ancestorIds.length + 1` untuk semua hasil
- [ ] `?q=sh` (< 2 karakter) mengembalikan `200 []`
- [ ] `?leafOnly=true` hanya mengembalikan node dengan `hasChildren: false`
- [ ] Schema Shopify menyertakan `searchEndpoint` di `categoryTreeConfig`
- [ ] Schema Wix tidak menyertakan `searchEndpoint`
- [ ] CategoryTreePicker di frontend menampilkan search results dengan full path breadcrumb
