# Channel Category Tree — Architecture

**Last updated:** 2026-06-18  
**Scope:** `channel/category/` package

---

## Overview

Setiap channel punya cara berbeda menyimpan category tree-nya:
- **Shopify** — fixed global taxonomy ~10K node, milik Shopify sendiri (GraphQL)
- **eBay** — fixed global taxonomy ~25K node, milik eBay sendiri (REST)
- **Shopee / TikTok / Lazada** — category tree per-region/per-toko, accessed via REST dengan shop credentials
- **Wix / Shopify Collections** — merchant-created collections (import wizard)

Backend menangani semua ini dengan dua jalur yang sepenuhnya data-driven, dikontrol oleh field `taxonomyEnabled` di `channel_category_api_config`.

---

## Dua Jalur (Two-Path Architecture)

```
Frontend: GET /categories/{channelType}/{storeId}/root?organizationId=...
                         │
                         ▼
              CategoryController
                         │
         ┌───────────────┴──────────────────┐
         │ queryChildrenIfTaxonomy()         │
         │                                  │
    isTaxonomyEnabled=true            isTaxonomyEnabled=false
         │                                  │
         ▼                                  ▼
 ChannelTaxonomyService          CategoryCacheService
 (channel_taxonomy_cache)        (channel_category_cache)
 Global per channelType          Per (channelType + storeId)
 TTL: 7 hari                     TTL: 24 jam
```

### Jalur 1 — Taxonomy Cache (`taxonomyEnabled=true`)

Untuk channel dengan fixed global taxonomy yang **sama untuk semua merchant**.

| Channel | Strategy | Keterangan |
|---|---|---|
| **Shopify** | GRAPHQL | Phase 1: root nodes sync. Phase 2: BFS children via `batchFetchQuery` |
| **eBay** | REST | `GenericCategoryService.fetchFullTreeWithCreds()` via treeApiConfig |

`channel_taxonomy_cache` fields: `nodeId`, `name`, `fullName`, `level`, `isLeaf`, `isRoot`, `childrenIds`, `ancestorIds`

Untuk GRAPHQL: `childrenIds` / `ancestorIds` / `isLeaf` / `isRoot` datang langsung dari API response.  
Untuk REST: semua field ini di-derive dari flat node list saat seed (lihat `mapCategoryNodeToDocument()`).

### Jalur 2 — Category Cache (`taxonomyEnabled=false`)

Untuk channel dengan category tree per-toko yang berbeda antar merchant.

| Channel | TreeStructure | FullTreeStrategy |
|---|---|---|
| **Shopee** | FLAT_WITH_PARENT_ID | SINGLE_CALL |
| **TikTok Shop** | CHILDREN_PER_REQUEST | RECURSIVE |
| **Lazada** | CHILDREN_PER_REQUEST | RECURSIVE |
| **Amazon** | CHILDREN_PER_REQUEST | ROOT_ONLY |

`channel_category_cache` fields: `nodeId`, `name`, `parentId`, `hasChildren`, `depth`, `pathFromRoot`

Cache bersifat lazy: diisi saat pertama kali diminta (cache-miss path di `CategoryCacheServiceImpl`).

---

## Routing Logic (CategoryController)

```java
// Baca channel_category_api_config satu kali (in-memory cached setelah hit pertama)
channelTaxonomyService.queryChildrenIfTaxonomy(channelType, storeId, orgId, parentId)
  .flatMap(opt -> {
      if (opt.isPresent()) return taxonomy results;    // jalur 1
      return categoryCacheService.getChildren(...);   // jalur 2
  })
```

Tidak ada hardcoded `if channelType == "shopify"` — routing murni dari config.

---

## Konfigurasi per Channel

Semua config disimpan di MongoDB collection `channel_category_api_config` (satu dokumen per channelType).  
Dokumen diisi/diupdate otomatis setiap startup oleh `CategoryApiConfigDataLoader` (@Order 140).

### Field penting untuk category tree

| Field | Keterangan |
|---|---|
| `treeCapable` | true = channel punya browseable category tree |
| `taxonomyConfig.enabled` | true = gunakan taxonomy cache (jalur 1) |
| `taxonomyConfig.fetchConfig.fetchStrategy` | `"GRAPHQL"` atau `"REST"` |
| `taxonomyConfig.fetchConfig.batchFetchQuery` | GraphQL batch query untuk Phase 2 BFS (null = skip BFS) |
| `treeApiConfig.treeStructure` | `NESTED`, `FLAT_WITH_PARENT_ID`, atau `CHILDREN_PER_REQUEST` |
| `treeApiConfig.fullTreeStrategy` | `SINGLE_CALL`, `RECURSIVE`, atau `ROOT_ONLY` |
| `treeApiConfig.authStrategy` | `BEARER_TOKEN`, `API_KEY_QUERY`, `HMAC_SHA256`, dll. |

---

## Search

`CategorySearchService` secara otomatis routing ke koleksi yang tepat berdasarkan `isTaxonomyEnabled`:
- `taxonomyEnabled=true` → `channel_taxonomy_cache.searchByName()`
- `taxonomyEnabled=false` → `channel_category_cache.searchByName()` + ancestor name resolution

---

## Menambah Channel Baru

**Tidak perlu Java code** — cukup insert dokumen di `channel_category_api_config`:

```json
{
  "channelType": "mychannel",
  "treeCapable": true,
  "taxonomyConfig": {
    "enabled": false
  },
  "treeApiConfig": {
    "baseUrl": "https://api.mychannel.com",
    "childrenUrlPath": "/categories",
    "authStrategy": "BEARER_TOKEN",
    "authCredentialKey": "accessToken",
    "itemsJsonPath": "data.categories",
    "nodeIdField": "id",
    "nodeNameField": "name",
    "nodeHasChildrenField": "hasChildren",
    "treeStructure": "CHILDREN_PER_REQUEST",
    "fullTreeStrategy": "RECURSIVE"
  }
}
```

Untuk taxonomy channel (fixed global tree), set `taxonomyConfig.enabled=true` dengan `fetchStrategy="REST"` atau `"GRAPHQL"`.
