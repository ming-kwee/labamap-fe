# Shopee Category Tree — Integration Notes

**Last updated:** 2026-06-18

---

## Karakteristik Shopee

- **API:** Shopee Open Platform v2
- **Endpoint:** `GET /api/v2/product/get_category`
- **Struktur:** FLAT_WITH_PARENT_ID — satu API call mengembalikan **semua kategori** sekaligus
- **Auth:** HMAC-SHA256 (shop-level API di sandbox, bisa public di production)
- **Root nodes:** ditandai dengan `parent_category_id = 0` (bukan null)
- **Nama field:** `display_category_name` (bukan `category_name`)

---

## HMAC-SHA256 Signing

### Formula Signing

```
message = partner_id + api_path + timestamp + access_token + shop_id
sign    = hex(HMAC-SHA256(message, partner_key))
```

`partner_id` dan `partner_key` adalah **platform-level credentials** (sama untuk semua toko), bukan per-toko.  
`access_token` dan `shop_id` adalah per-toko.

### Bagaimana Backend Menangani Ini

`GenericCategoryService.injectPlatformPartnerId()` secara otomatis menyuntikkan `partnerId` dari `OAuthAppConfig.channels.shopee.clientId` ke credential map **sebelum** query params dan signing diproses.

Artinya: store tidak perlu menyimpan `partnerId` secara eksplisit di credentials-nya — backend selalu inject dari config.

```yaml
# application.yml
app:
  oauth:
    channels:
      shopee:
        client-id: ${SHOPEE_PARTNER_ID}       # partner_id untuk signing
        client-secret: ${SHOPEE_PARTNER_KEY}   # partner_key (signing secret)
```

---

## Sandbox vs Production

| | Sandbox | Production |
|---|---|---|
| Base URL | `https://openplatform.sandbox.test-stable.shopee.sg` | `https://partner.shopeemobile.com` |
| Partner ID | Dari sandbox partner portal | Dari production partner portal |
| API behavior | Requires shop_id + access_token (shop-level) | Bisa public (partner_id only) |
| Override | `SHOPEE_API_BASE_URL` env var | Default production URL |

`CategoryApiConfigDataLoader` membaca base URL dari `System.getenv("SHOPEE_API_BASE_URL")`.  
Default: `https://openplatform.sandbox.test-stable.shopee.sg` (saat ini diset untuk sandbox).

---

## Platform Seed (`shopee-shopee-01`)

`shopee-shopee-01` adalah storeId yang di-generate dari `channelType + storeName` saat toko pertama kali dikoneksikan:

```java
generateStoreId("shopee", "Shopee 01") → "shopee-shopee-01"
```

Ini bukan placeholder hardcoded — ini adalah storeId asli dari store yang terdaftar di `channel_store_connections`.

`ShopeeCategoryTreeSeedMigration` (@Order 145) menyeed `channel_category_cache` untuk storeId ini saat startup:
1. Cek apakah root nodes sudah ada di cache
2. Jika belum: cari store Shopee aktif manapun dan pinjam credentials-nya
3. Panggil Shopee API, simpan semua nodes
4. Root nodes (`parent_category_id=0`) dinormalisasi ke `parentId=null`

---

## Bug yang Sudah Diperbaiki (2026-06-18)

### 1. Nama kategori kosong
**Penyebab:** Config menggunakan `nodeNameField = "category_name"` tapi Shopee v2 API mengembalikan `display_category_name`.  
**Fix:** Ganti ke `display_category_name` di `CategoryApiConfigDataLoader`.

### 2. Modal kategori blank (list kosong)
**Penyebab:** Root nodes Shopee punya `parent_category_id = 0` di response API. Saat disimpan ke cache, nilai ini tersimpan sebagai `parentId = "0"`. `CategoryCacheService.getChildren()` query `findByParentIdIsNull` sehingga tidak menemukan root nodes.  
**Fix:** `CategoryCacheServiceImpl.fetchAndCache()` sekarang menggunakan `node.parentId()` dari response (bukan query parentId), dan menormalisasi `"0"` → `null`.

### 3. `partner_id` tidak dikirim ke API
**Penyebab:** `partnerId` adalah platform credential, bukan per-store. Store credentials tidak menyimpannya, sehingga `credentialQueryParams` tidak bisa inject.  
**Fix:** `GenericCategoryService.injectPlatformPartnerId()` otomatis inject dari `OAuthAppConfig.clientId` sebelum request dibangun.

### 4. `invalid_partner_id` (403)
**Penyebab:** Sandbox partner ID digunakan dengan production URL.  
**Fix:** URL sekarang configurable via `SHOPEE_API_BASE_URL` env var.

### 5. `Host is not specified`
**Penyebab:** YAML parsing error (stray list item `- image/gif` masuk ke dalam `shopee.api.base-url` block) menyebabkan property tidak ter-load, mengakibatkan MongoDB tersimpan dengan `baseUrl = null`.  
**Fix:** YAML diperbaiki. Base URL sekarang dibaca langsung dari `System.getenv()` di `CategoryApiConfigDataLoader`, bukan dari Spring property resolution.

---

## Credential yang Dibutuhkan di Store

Simpan di `channel_store_connections.credentials` (enkripsi via PATCH /{storeId}/credentials):

| Key | Keterangan |
|---|---|
| `accessToken` | OAuth access token dari Shopee |
| `shopId` | ID numerik toko Shopee |

`partnerId` **tidak perlu** disimpan di store — diinjeksi otomatis dari `OAuthAppConfig`.
