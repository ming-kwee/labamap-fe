# Taxonomy System — Fixed Global Category Trees

**Last updated:** 2026-06-18

---

## Apa itu Taxonomy Cache?

`channel_taxonomy_cache` menyimpan category tree dari channel yang punya **fixed global taxonomy** — tree yang sama untuk semua merchant, dikelola oleh platform channel sendiri.

Berbeda dengan `channel_category_cache` yang per-toko dan berubah sesuai context merchant.

---

## Channel yang Menggunakan Taxonomy

| Channel | Strategy | Keterangan |
|---|---|---|
| **Shopify** | GRAPHQL | Shopify Product Taxonomy ~10K node, GraphQL paginated + BFS |
| **eBay** | REST | eBay Category Tree ~25K node, REST SINGLE_CALL NESTED |

Channel lain (Shopee, TikTok, Lazada, Amazon) menggunakan `channel_category_cache` karena tree-nya per-region/per-toko.

---

## Dua Fetch Strategy

### GRAPHQL (contoh: Shopify)

Dua fase:
1. **Phase 1 (sync, ~500ms):** Fetch root nodes via `graphqlQuery`, simpan ke MongoDB. HTTP request selesai dan mengembalikan root nodes ke frontend.
2. **Phase 2 (background BFS):** Fetch semua child nodes secara batch menggunakan `batchFetchQuery`. Berjalan di background tanpa memblok frontend.

`batchFetchQuery` adalah GraphQL query yang menerima `$ids: [ID!]!` (list node IDs) dan mengembalikan batch node sekaligus. Shopify menggunakan `nodes(ids: $ids) { ... on TaxonomyCategory { ... } }`.

Kalau `batchFetchQuery` null, Phase 2 di-skip — hanya root nodes yang ter-cache.

### REST (contoh: eBay)

Delegasi sepenuhnya ke `GenericCategoryService.fetchFullTreeWithCreds()`:
- Membaca `treeApiConfig` dari `channel_category_api_config`
- Menggunakan auth, pagination, dan parsing yang sudah dikonfigurasi
- Semua nodes dikembalikan dalam satu call (SINGLE_CALL) atau recursive (RECURSIVE)
- `childrenIds`, `ancestorIds`, `isLeaf`, `isRoot`, `level` di-derive dari flat node list

Tidak perlu BFS Phase 2 karena semua nodes sudah ada.

---

## Lifecycle Cache

```
Request masuk
    │
    ▼
ensureCache()
    │
    ├─ count >= minCacheSize → ✅ cache warm, langsung query
    │
    ├─ 0 < count < minCacheSize → ⚠️ partial cache
    │   Serve data lama, background re-seed dimulai
    │
    └─ count == 0 → cache kosong
        Phase 1 sync (roots saja), lalu serve
        Phase 2 BFS berjalan di background
```

TTL: 7 hari (`@Indexed(expireAfterSeconds = 604800)` di `ChannelTaxonomyCacheDocument`).

---

## Menambah Taxonomy Channel Baru

### Option A: REST Strategy

Paling mudah jika channel sudah punya `treeApiConfig` yang bekerja di `channel_category_api_config`.

Tambahkan `taxonomyConfig` ke dokumen channel:

```json
{
  "channelType": "newchannel",
  "taxonomyConfig": {
    "enabled": true,
    "fetchConfig": {
      "fetchStrategy": "REST",
      "minCacheSize": 5000
    }
  }
}
```

REST strategy meminjam credentials dari store aktif manapun yang terkoneksi untuk channel tersebut.

### Option B: GRAPHQL Strategy

Untuk channel yang punya paginated GraphQL API:

```json
{
  "channelType": "newchannel",
  "taxonomyConfig": {
    "enabled": true,
    "fetchConfig": {
      "fetchStrategy": "GRAPHQL",
      "apiVersion": "2024-01",
      "apiPath": "/admin/api/{apiVersion}/graphql.json",
      "dataPath": "data.taxonomy.categories",
      "graphqlQuery": "query { ... }",
      "batchFetchQuery": "query GetNodes($ids: [ID!]!) { nodes(ids: $ids) { ... } }",
      "minCacheSize": 500
    }
  }
}
```

`batchFetchQuery` opsional — kalau tidak disupport channel, kosongkan (Phase 2 BFS di-skip).

---

## Credentials untuk REST Taxonomy

REST taxonomy membutuhkan credentials valid dari store yang terkoneksi (`resolveCredsForTaxonomy()`):

1. Coba `storeId` yang diberikan di request
2. Jika tidak ada, pinjam dari store aktif manapun untuk channel tersebut

Ini aman karena taxonomy tree adalah data global yang sama untuk semua toko.

---

## Document Structure di MongoDB

```json
{
  "_id": "shopify:gid://shopify/TaxonomyCategory/aa-1-1",
  "channelType": "shopify",
  "nodeId": "gid://shopify/TaxonomyCategory/aa-1-1",
  "name": "Apparel & Accessories",
  "fullName": "Apparel & Accessories",
  "level": 0,
  "isLeaf": false,
  "isRoot": true,
  "childrenIds": ["gid://..."],
  "ancestorIds": [],
  "cachedAt": "..."
}
```

Untuk REST channels, `fullName` adalah `null` (tidak tersedia dari API). Frontend menggunakan `name` saja.

---

## `_id` Format

`_id` = `channelType + ":" + nodeId`

Ini memastikan nodes dari channel berbeda tidak bertabrakan walaupun `nodeId` sama. Juga membuat upsert idempotent (ReplaceOneModel dengan filter `{"_id": doc.getId()}`).
