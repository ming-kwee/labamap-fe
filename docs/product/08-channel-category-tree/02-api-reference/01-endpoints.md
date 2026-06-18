# Channel Category Tree — API Reference

**Last updated:** 2026-06-18

---

## Endpoints

### Category Tree Navigation

```
GET /api/v1/categories/{channelType}/{storeId}/root?organizationId=
GET /api/v1/categories/{channelType}/{storeId}/children/{parentId}?organizationId=
```

Backend otomatis routing ke taxonomy cache atau category cache berdasarkan config — frontend tidak perlu tahu.

**Response:**
```json
{
  "channelType": "shopee",
  "storeId": "shopee-shopee-01",
  "parentId": null,
  "nodes": [
    { "id": "100001", "name": "Fashion", "hasChildren": true },
    { "id": "100002", "name": "Electronics", "hasChildren": true }
  ]
}
```

### Category Search

```
GET /api/v1/merchant-data/{channelType}/{storeId}/categories/search
    ?q=shirt&organizationId=&maxResults=20&leafOnly=false
```

**Response:**
```json
[
  {
    "id": "300407",
    "name": "T-Shirts",
    "fullName": "Fashion > Clothing > T-Shirts",
    "hasChildren": false,
    "level": 2,
    "ancestorIds": ["100001", "200005"]
  }
]
```

### Category Attributes (setelah pilih leaf category)

```
GET /api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}?organizationId=
```

**Response:** `CategoryAttributesResponse` — daftar required fields + optional fields + variantSuggestions untuk kategori tersebut.

---

## MongoDB Collections

### `channel_category_cache`

Per `(channelType, storeId)`. TTL 24 jam.

| Field | Type | Keterangan |
|---|---|---|
| `channelType` | String | e.g. `"shopee"` |
| `storeId` | String | e.g. `"shopee-shopee-01"` |
| `nodeId` | String | ID dari channel API |
| `name` | String | Display name |
| `parentId` | String | null untuk root nodes |
| `hasChildren` | Boolean | |
| `depth` | Integer | 0 = root |
| `pathFromRoot` | List\<String\> | nodeIds dari root ke node ini |
| `expireAt` | Date | TTL index |

**Index:** `(channelType, storeId, nodeId)` — unique

### `channel_taxonomy_cache`

Per `channelType` (global, tidak per-storeId). TTL 7 hari.

| Field | Type | Keterangan |
|---|---|---|
| `_id` | String | `"{channelType}:{nodeId}"` |
| `channelType` | String | |
| `nodeId` | String | |
| `name` | String | |
| `fullName` | String | Full path e.g. "Apparel > Clothing > Tops" (null untuk REST channels) |
| `level` | Integer | 0 = root |
| `isLeaf` | Boolean | |
| `isRoot` | Boolean | |
| `childrenIds` | List\<String\> | Direct children node IDs |
| `ancestorIds` | List\<String\> | Dari root ke parent |
| `cachedAt` | Date | TTL index (7 hari) |

### `channel_category_api_config`

Satu dokumen per channelType. Diupdate otomatis saat startup.

Lihat `ChannelCategoryApiConfig.java` untuk schema lengkap.

---

## Config per Channel (summary)

| Channel | treeCapable | taxonomyEnabled | Strategy | Auth |
|---|---|---|---|---|
| Shopify | true | **true** | GRAPHQL | BEARER_TOKEN (via store) |
| eBay | true | **true** | REST | BEARER_TOKEN (via store) |
| Shopee | true | false | REST (SINGLE_CALL) | HMAC_SHA256 |
| TikTok Shop | true | false | REST (RECURSIVE) | API_KEY_QUERY |
| Lazada | true | false | REST (RECURSIVE) | API_KEY_QUERY |
| Amazon | true | false | REST (ROOT_ONLY) | BEARER_TOKEN |
| Wix | false | false | — | API_KEY_HEADER (import only) |

---

## MongoDB Maintenance

### Kapan perlu clean `channel_category_cache`

- Setelah mengubah `nodeNameField`, `nodeIdField`, atau `nodeParentIdField` di `treeApiConfig`
- Ketika data corrupt (parentId salah, nama kosong)
- Command: `db.channel_category_cache.deleteMany({channelType: "shopee", storeId: "shopee-shopee-01"})`

### Kapan perlu clean `channel_taxonomy_cache`

- Setelah mengubah GRAPHQL query di `taxonomyConfig.fetchConfig`
- Untuk force re-fetch dengan konfigurasi baru
- Command: `db.channel_taxonomy_cache.deleteMany({channelType: "shopify"})`

### `channel_category_api_config` — tidak perlu clean

Selalu di-upsert otomatis oleh `CategoryApiConfigDataLoader` (@Order 140) saat startup.

### Startup sequence yang relevan

| Order | Class | Aksi |
|---|---|---|
| 140 | `CategoryApiConfigDataLoader` | Upsert semua channel configs ke MongoDB |
| 145 | `ShopeeCategoryTreeSeedMigration` | Seed Shopee category cache jika belum ada root nodes |
