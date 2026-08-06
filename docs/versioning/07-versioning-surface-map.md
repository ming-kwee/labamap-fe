# Peta Permukaan Versioning — 4 Sumbu + Kebijakan Cache

> Bagian dari [seri versioning](01-channel-api-schema-versioning.md). Dibuat untuk menjawab: *"koleksi mana
> saja yang versi-sensitif, dan bagaimana masing-masing ditangani — supaya implementasinya tidak
> sepotong-sepotong?"* Ini adalah **peta induk**: setiap permukaan versi di sistem, sumbu mana ia berada,
> dan mekanisme yang benar untuknya.

---

## 1. Prinsip: versi bukan satu hal — ada beberapa SUMBU independen

Kesalahan umum: menganggap "versi channel" itu satu angka. Kenyataannya sebuah channel bisa menaikkan
**bagian yang berbeda dari API-nya secara terpisah**. Contoh nyata: TikTok memakai product API `202309`
tapi auth API `v2` — dua sumbu, dinaikkan sendiri-sendiri. Karena itu sistem kita memisahkan **sumbu**,
dan tiap sumbu punya sumber versi + mekanisme sendiri.

---

## 2. Empat sumbu versi + cache (peta ringkas)

```
Sumbu 1 — PRODUCT-PUBLISH BODY (bentuk create-body)
  sumber  : ChannelConfiguration.apiVersion
  beku    : ChannelApiContract (channel_api_contracts)                 [Fase 1, 2a/2b/2c]
  + bagian: channel_category_api_schemas (ekstensi apiSchema per-kat)  [CELAH → Fase 2d]

Sumbu 2 — CATEGORY / TAXONOMY API (endpoint pohon kategori & atribut)
  sumber  : ChannelCategoryApiConfig.apiVersion (tree + attribute)     [Fase 1b ✓]
  URL     : {apiVersion} di childrenUrlPath / urlPath

Sumbu 3 — MERCHANT / CAPABILITY API (endpoint lookup operasional)
  sumber  : (belum ada apiVersion — literal)                           [CELAH → Fase 1c]
  koleksi : merchant_api_operations, channel_capability_operations

Sumbu 4 — AUTH / OAUTH / TOKEN
  perlakuan: literal, SENGAJA tidak di-template                        [final]

CACHE (semua koleksi *_cache)
  perlakuan: TIDAK diversi; invalidasi-saat-berubah + TTL              [aturan lintas-sumbu]
```

---

## 3. Klasifikasi tiap koleksi (dari audit kode)

### 3.1 Sumbu 1 — Kontrak body publish

| Koleksi | Isi | Status |
|---|---|---|
| `channel_configurations` (base `apiSchema`) | Bentuk create-body kanonik | ✅ Fase 1 + dibekukan di `channel_api_contracts` (2a/2b/2c) |
| **`channel_category_api_schemas`** | **Ekstensi apiSchema per-kategori**, di-*merge* ke base saat analyze/publish (`AgentToolHandlerService`) | ⚠️ **CELAH** — belum ikut dibekukan di contract |

**Kenapa `channel_category_api_schemas` bagian kontrak:** target apiSchema efektif =
`base (ChannelConfiguration.apiSchema)` **+** `ekstensi per-kategori`. Bundle 2a hanya membekukan base, jadi
membekukan sebuah versi **tidak** membekukan ekstensi kategorinya → drift. Koleksi ini punya `version`
integer sendiri, tapi itu **revision counter per (channelType, categorySlug)**, **bukan** `apiVersion`
channel. → **Fase 2d**: bundle harus ikut menangkap / me-resolve ekstensi kategori versi-tepat.

### 3.2 Sumbu 2 — Category / Taxonomy API ✅

| Koleksi | Status |
|---|---|
| `channel_category_api_config` | ✅ **Fase 1b** — `apiVersion` di `CategoryTreeApiConfig` + `AttributeApiConfig`; URL pakai `{apiVersion}`, di-resolve di `GenericCategoryService`. |

### 3.3 Sumbu 3 — Merchant / Capability API ⚠️ (CELAH → Fase 1c)

| Koleksi | Isi | Literal versi di URL (audit) |
|---|---|---|
| `merchant_api_operations` | Lookup opsi merchant (warehouse, lokasi, fulfillment policy, shipping group) | Shopify `/admin/api/2024-01/`, Shopee `/api/v2/`, eBay `/sell/account/v1/`, Walmart `/shipping/v2/` |
| `channel_capability_operations` | Lookup kapabilitas (brand, size chart, logistik, attribute tree) | Shopee `/api/v2/` |

Ini **sifatnya sama dengan Sumbu 2**: URL endpoint runtime dengan literal versi, dikonsumsi oleh
`GenericMerchantDataService` dan `ChannelCapabilityResolver`. Sumbu **independen** (versi API
merchant/capability), **bukan** bagian kontrak body publish, jadi **tidak** masuk `ChannelApiContract`.
Tapi literal versinya harus di-`{apiVersion}`-kan persis seperti Fase 1b, kalau tidak leak-nya identik.
→ **Fase 1c**.

### 3.4 Sumbu 4 — Auth / OAuth ✅ (final, sengaja literal)

Endpoint token/OAuth (TikTok `auth.tiktok-shops.com/api/v2/…`, Shopee `partner…/api/v2/auth/…`, eBay
`/identity/v1/oauth2/token`, Walmart `/v3/token`) **sengaja dibiarkan literal** — versi auth naik terpisah
dari versi product/category. Memaksa mereka ke satu `apiVersion` justru akan merusak saat product-version
di-bump tanpa auth-version berubah.

### 3.5 Cache — BUKAN diversi (aturan lintas-sumbu)

| Koleksi | Kunci | TTL |
|---|---|---|
| `channel_capability_cache` | `(channelType, operationName, scopeKey, region)` | TTL index |
| `channel_category_attributes_cache` | `(channelType, storeId, categoryId)` | TTL index |
| `channel_category_cache` | `(channelType, storeId, nodeId)` | TTL 24 jam |
| `channel_taxonomy_cache` | `(channelType, nodeId)` | TTL 7 hari |

**Aturan: cache TIDAK PERNAH di-key per-versi.** Alasan:
1. **Fragmentasi** — menambah `apiVersion` ke kunci memecah cache → hit-rate anjlok.
2. **Ephemeral** — semua sudah TTL-indexed (auto-expire), jadi basi terbatas waktu.
3. **Data live, bukan kontrak** — isinya respons API per-store/kategori, bukan spec-of-record.

**Mekanisme yang benar: invalidasi-saat-berubah.** Saat versi endpoint sebuah channel berubah → **hapus**
cache terkait (presedennya sudah ada: `ChannelCategoryRepository.deleteAllByChannelType` dipanggil admin
config saat mengganti tree-api). TTL adalah jaring pengaman kedua. → tidak ada dimensi versi pada cache.

---

## 4. Kenapa pemisahan ini penting (anti sepotong-sepotong)

- **Contract bundle (Sumbu 1)** membekukan **bentuk body** — supaya store lama tetap dapat body yang benar.
  Ia HARUS mencakup ekstensi kategori (Fase 2d), kalau tidak snapshot-nya bocor.
- **Endpoint templating (Sumbu 2 & 3)** menyeragamkan **versi di URL** — supaya bump versi = ubah satu
  field, bukan N literal. Ini sumbu berbeda; jangan campur ke contract.
- **Auth (Sumbu 4)** independen — jangan diseret ke apiVersion product/category.
- **Cache** derivatif & ephemeral — jangan diversi; invalidasi saja.

Kalau keempat sumbu + cache tidak dipisah, kita akan (a) membekukan hal yang salah, (b) memecah cache
tanpa perlu, atau (c) merusak auth saat bump product-version.

---

## 5. Status & rencana

| Sumbu / hal | Status | Fase |
|---|---|---|
| Product body: base apiSchema + bundle + lifecycle | ✅ | 1, 2a, 2b, 2c |
| Product body: ekstensi kategori (`channel_category_api_schemas`) | ⚠️ celah | **2d** (rencana) |
| Category/Taxonomy API endpoint | ✅ | 1b |
| Merchant/Capability API endpoint | ⚠️ celah | **1c** (berikutnya) |
| Auth/OAuth | ✅ (literal, sengaja) | — |
| Cache (4 koleksi) | ✅ aturan: invalidasi + TTL, tak diversi | (lintas-sumbu) |

**Berikutnya:** Fase 1c (templatkan endpoint merchant + capability), lalu Fase 2d (ekstensi kategori ke
contract). Setelah itu seluruh permukaan versi tertutup rapi.
