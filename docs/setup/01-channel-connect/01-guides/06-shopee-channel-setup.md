# Panduan Setup Channel Connect — Shopee

**Status:** Terverifikasi di sandbox — `item_id: 844135408` berhasil dibuat (2026-05-18)  
**App:** labamap2  
**Relates to:** `02-per-channel-credentials.md`, `03-oauth-flow.md`

---

## Daftar Isi

1. [Gambaran Umum Alur Integrasi](#1-gambaran-umum-alur-integrasi)
2. [Kredensial yang Dibutuhkan](#2-kredensial-yang-dibutuhkan)
3. [Hal Kritis Sebelum Mulai](#3-hal-kritis-sebelum-mulai)
4. [Setup di Shopee Partner Center](#4-setup-di-shopee-partner-center)
5. [Konfigurasi Channel di Sistem](#5-konfigurasi-channel-di-sistem)
6. [Formula Signature](#6-formula-signature)
7. [Alur Publish Produk](#7-alur-publish-produk)
8. [Spesifikasi Field Produk](#8-spesifikasi-field-produk)
9. [Konfigurasi Workaction dan Metadata Sistem](#9-konfigurasi-workaction-dan-metadata-sistem)
10. [Contoh channelAttributes](#10-contoh-channelattributes)
11. [Error Umum dan Solusi](#11-error-umum-dan-solusi)
12. [Checklist Sebelum Production](#12-checklist-sebelum-production)

---

## 1. Gambaran Umum Alur Integrasi

Shopee menggunakan **OAuth2 + HMAC-SHA256** sebagai mekanisme autentikasi. Setiap API call harus
disertai signature yang dihitung dari kombinasi `partner_id`, path URL, `timestamp`,
`access_token`, dan `shop_id`.

Alur integrasi secara keseluruhan:

```
Partner Center            Sistem Labamap               Shopee Open Platform API
─────────────────         ─────────────────────         ────────────────────────
Daftarkan App        →    Simpan kredensial          →   Terima API call
Dapatkan partner_id        Hitung signature              Verifikasi signature
Dapatkan partner_key       Kirim request                 Proses data
Dapatkan access_token
Dapatkan shop_id
```

Publish produk ke Shopee membutuhkan **dua langkah berurutan**:

```
Step 1' — Upload gambar   →   Dapat image_id
Step 1  — Create produk   →   Dapat item_id
```

---

## 2. Kredensial yang Dibutuhkan

| Kredensial | Sumber | Keterangan |
|---|---|---|
| `partner_id` | Shopee Partner Center | ID numerik app yang didaftarkan |
| `partner_key` | Shopee Partner Center | HMAC key — lihat seksi 3 untuk format yang benar |
| `access_token` | OAuth2 / API Test Tool | Token akses toko spesifik, expired tiap 4 jam di production |
| `shop_id` | OAuth2 callback / API Test Tool | ID toko Shopee yang dikoneksikan |

**Nilai sandbox yang sudah terverifikasi** (app labamap2):

| Field | Value |
|---|---|
| `partner_id` | `1233683` |
| `partner_key` | `shpk6178735276755a637042424c614e78796c6b5a7542616d53476f67526175` |
| `access_token` | `6259474765744c53684e736b6d6e4857` |
| `shop_id` | `227550228` |
| Sandbox base URL | `https://openplatform.sandbox.test-stable.shopee.sg` |

---

## 3. Hal Kritis Sebelum Mulai

### 3.1 Format Partner Key — JANGAN Di-decode

Shopee Partner Center menampilkan key dengan prefix `shpk`:

```
shpk6178735276755a637042424c614e78796c6b5a7542616d53476f67526175
```

**Gunakan seluruh string ini sebagai HMAC key, termasuk prefix `shpk`.** Jangan di-strip,
jangan di-decode dari hex.

| | Value | Status |
|---|---|---|
| Salah | `axsRvuZcpBBLaNxylkZuBamSGogRau` (hasil decode hex tanpa prefix) | Menghasilkan `error_sign` |
| Salah | `6178735276755a637042424c614e78796c6b5a7542616d53476f67526175` (hex tanpa prefix) | Menghasilkan `error_sign` |
| **Benar** | `shpk6178735276755a637042424c614e78796c6b5a7542616d53476f67526175` (full string) | Signature valid |

> Format ini berlaku setelah sandbox upgrade. Format lama Shopee (tanpa prefix `shpk`) memang
> perlu di-decode dari hex. Format baru menggunakan full string sebagai-is.

### 3.2 URL Sandbox — Gunakan URL Server Baru

Setelah sandbox upgrade, `partner_id` baru hanya terdaftar di server baru:

| | URL |
|---|---|
| Salah (server lama) | `https://partner.test-stable.shopeemobile.com` |
| **Benar (server baru)** | `https://openplatform.sandbox.test-stable.shopee.sg` |

Cara memastikan URL yang benar: buka **Shopee Partner Center → API Test Tool**, buka browser
**DevTools → tab Network**, jalankan satu API call, lalu salin base URL dari request yang muncul.

### 3.3 Partner ID Bisa Berubah Saat Sandbox Upgrade

Jika muncul popup *"Test Partner_id has changed due to sandbox upgrade"* saat login ke Partner
Center, artinya sandbox di-reset. Langkah yang harus dilakukan:

1. Buat app baru di Partner Center
2. Dapatkan `partner_id` dan `partner_key` baru
3. Update kredensial di konfigurasi sistem

---

## 4. Setup di Shopee Partner Center

### 4.1 Daftar sebagai Partner

1. Buka [Shopee Open Platform](https://open.shopee.com) → daftar akun partner
2. Buat app baru → isi nama app, deskripsi, redirect URL

### 4.2 Dapatkan Kredensial App

Setelah app dibuat, Partner Center menampilkan:
- **Partner ID** — salin nilai numeriknya
- **Partner Key** — salin full string termasuk prefix `shpk`

### 4.3 Dapatkan Access Token dan Shop ID (Sandbox)

Untuk sandbox, cara tercepat adalah menggunakan **API Test Tool** di Partner Center:

1. Buka Partner Center → **API Test Tool**
2. Pilih salah satu endpoint (mis. `GET /api/v2/shop/get_shop_info`)
3. Klik **Test** — tool akan menjalankan OAuth flow otomatis
4. Buka browser **DevTools → tab Network**
5. Salin `access_token` dan `shop_id` dari URL query params request yang berhasil

### 4.4 Validasi Signature Secara Manual

Jika ragu dengan format key, cara reverse-engineer signature yang benar:

1. Buka Partner Center → **API Test Tool**
2. Buka browser **DevTools → tab Network**
3. Jalankan satu API call dari tool
4. Capture URL lengkap → salin `timestamp` dan `sign`
5. Hitung mundur: coba semua format key vs sign yang ter-capture
6. Format key yang menghasilkan sign cocok = format yang benar

---

## 5. Konfigurasi Channel di Sistem

### 5.1 Connect Store via API

```http
POST /labamap/api/v1/channel-stores
Content-Type: application/json

{
  "organizationId": "org_123",
  "channelType":    "shopee",
  "storeName":      "Toko Shopee Saya",
  "storeUrl":       "https://shopee.co.id/mystore",
  "credentials": {
    "partnerId":    "1233683",
    "partnerKey":   "shpk6178735276755a637042424c614e78796c6b5a7542616d53476f67526175",
    "accessToken":  "6259474765744c53684e736b6d6e4857",
    "shopId":       "227550228"
  }
}
```

Sistem akan mengenkripsi `credentials` menggunakan AES-256-GCM sebelum disimpan ke
`channel_store_connections`.

### 5.2 Mapping Kredensial ke Query Params

Saat publish, sistem membaca credential keys berikut dan memetakannya ke query params Shopee:

| Credential Key | Query Param Shopee | Keterangan |
|---|---|---|
| `partnerId` | `partner_id` | ID partner app |
| `accessToken` | `access_token` | Token akses toko |
| `shopId` | `shop_id` | ID toko |

`partner_key` tidak dikirim sebagai query param — digunakan hanya untuk menghitung signature.

---

## 6. Formula Signature

Setiap API call Shopee harus menyertakan query param `sign` yang dihitung dengan formula:

```
base_string = str(partner_id) + api_path + str(timestamp) + access_token + str(shop_id)
sign        = HMAC-SHA256(base_string, partner_key).hexdigest()
```

**Contoh:**

```
partner_id  = 1233683
api_path    = /api/v2/product/add_item
timestamp   = 1716000000
access_token= 6259474765744c53684e736b6d6e4857
shop_id     = 227550228

base_string = "1233683/api/v2/product/add_item17160000006259474765744c53684e736b6d6e4857227550228"
sign        = HMAC-SHA256(base_string, "shpk6178735276755a...") → hex output
```

**Query params yang wajib ada di setiap request:**

```
?partner_id=1233683&timestamp=1716000000&access_token=...&shop_id=227550228&sign=...
```

Konfigurasi signature di `workaction`:

```json
"signature": {
  "paramOrder": ["partner_id", "timestamp", "access_token", "shop_id"],
  "formula":    "${partner_id}${PATH}${timestamp}${access_token}${shop_id}",
  "algorithm":  "HmacSHA256",
  "includeBody": true
}
```

---

## 7. Alur Publish Produk

Publish produk ke Shopee memerlukan dua API call berurutan:

### Step 1' — Upload Gambar

```
POST /api/v2/media_space/upload_image
Content-Type: multipart/form-data
Body: binary file gambar

Response:
[{ "response": { "image_info": { "image_id": "sg-xxxxx" } } }]
```

`image_id` yang didapat dari response digunakan sebagai `image.image_id_list` di Step 1.

### Step 1 — Create Produk

```
POST /api/v2/product/add_item
Content-Type: application/json
Body: { item_name, description, original_price, weight, category_id, image, ... }

Response:
{ "response": { "item_id": 844135408 } }
```

`item_id` dari response disimpan kembali ke atribut produk di sistem (`id`).

---

## 8. Spesifikasi Field Produk

### 8.1 Field Wajib Create Product

| Field | Tipe | Format | Contoh |
|---|---|---|---|
| `item_name` | string | teks bebas | `"Awesome T-shirt"` |
| `description` | string | teks bebas | `"Your product description"` |
| `original_price` | float | angka desimal | `5000` |
| `weight` | float | dalam kilogram | `1.1` |
| `category_id` | int | harus leaf node | `300398` |
| `image` | object | `{"image_id_list": [...]}` | lihat 8.2 |
| `seller_stock` | object[] | `[{"stock": N}]` | `[{"stock": 10}]` |
| `logistic_info` | object[] | `[{"logistic_id": N, "enabled": true}]` | lihat 8.4 |
| `brand` | object | `{"brand_id": 0, "original_brand_name": "..."}` | lihat 8.3 |

### 8.2 Field Image — Wajib Upload Dulu

Image tidak boleh dikirim sebagai URL langsung. Harus diupload ke media space terlebih dahulu:

```json
"image": {
  "image_id_list": ["sg-11134201-22100-abc123..."]
}
```

Jangan gunakan `image_url_list` langsung di body `add_item`.

### 8.3 Field Brand

Jika brand tidak terdaftar di katalog Shopee, gunakan `brand_id: 0` dan isi
`original_brand_name`:

```json
"brand": {
  "brand_id": 0,
  "original_brand_name": "nike"
}
```

### 8.4 Field seller_stock — Format Wajib Array

Shopee API v2 menggunakan `seller_stock`, **bukan** `normal_stock`:

```json
"seller_stock": [{"stock": 10}]
```

| | Field | Format | Status |
|---|---|---|---|
| Salah | `normal_stock` | `10` (int) | Error: `value must Not Null` |
| **Benar** | `seller_stock` | `[{"stock": 10}]` (object[]) | Valid |

### 8.5 category_id — Harus Leaf Node

Ambil daftar kategori dari:

```
GET /api/v2/product/get_category
```

Gunakan hanya `category_id` yang memiliki `has_children: false`. Kategori parent tidak valid
untuk listing produk.

Category yang sudah terverifikasi untuk sandbox: `300398` (T-shirt)

### 8.6 logistic_info — Harus Pakai Channel yang Aktif

Ambil daftar logistic channel yang aktif untuk shop tertentu:

```
GET /api/v2/logistics/get_channel_list
```

Channel aktif di sandbox shop `227550228`:

| logistic_id | Nama | Status |
|---|---|---|
| `80054` | SPX Instant - 2 Jam | **enabled** — gunakan ini |
| `80053` | SPX Instant | disabled |
| `81016` | Sandbox J&T Cargo | disabled |
| `81017` | Sandbox J&T Express | disabled |

Format yang benar (tanpa `size_id`):

```json
"logistic_info": [{"logistic_id": 80054, "enabled": true}]
```

---

## 9. Konfigurasi Workaction dan Metadata Sistem

### 9.1 workaction#create_CP_Media_Pre — Upload Gambar

```json
[{
  "endpoint": {
    "url":         "https://openplatform.sandbox.test-stable.shopee.sg/api/v2/media_space/upload_image",
    "method":      "POST",
    "contentType": "multipart/form-data",
    "action":      "ON_REST_CREATE",
    "params": {
      "partner_id":   "partner_id",
      "timestamp":    "TIMESTAMP",
      "access_token": "token",
      "shop_id":      "shop_id"
    },
    "signature": {
      "paramOrder":   ["partner_id", "timestamp", "access_token", "shop_id"],
      "formula":      "${partner_id}${PATH}${timestamp}${access_token}${shop_id}",
      "algorithm":    "HmacSHA256",
      "includeBody":  true
    }
  },
  "body-reshape-to": {
    "from": "images",
    "mappings": {"image_url_list": "image_url_list"},
    "aggregation": {
      "preTransform": [{"operation": "shift", "spec": {"image_url_list": {"*": "[]"}}}]
    },
    "output": {
      "fields":     {"uri_key": "image", "scene_key": "scene", "ratio_key": "ratio"},
      "conversion": {"uri_key": "BinaryFile"}
    }
  },
  "response-update-to": {
    "responsePaths": ["[*].response.image_info"],
    "transformPaths": [{
      "image_id_list": [{
        "operation": "shift",
        "spec": {"*": {"response": {"image_info": {"image_id": "image_id_list[]"}}}}
      }]
    }],
    "updatePaths": [{"get": "image_id_list", "to": "image.image_id_list", "in": "attribute"}]
  }
}]
```

**Penjelasan bagian penting:**

| Bagian | Fungsi |
|---|---|
| `body-reshape-to.from` | Ambil field `images` dari master product |
| `conversion.uri_key: "BinaryFile"` | Download gambar dari URL → kirim sebagai binary multipart |
| `response-update-to.updatePaths` | Ambil `image_id` dari response → simpan ke `image.image_id_list` untuk dipakai di Step 1 |

### 9.2 workaction#create_CP — Create Produk

```json
{
  "endpoint": {
    "url":    "https://openplatform.sandbox.test-stable.shopee.sg/api/v2/product/add_item",
    "method": "POST",
    "action": "ON_REST_CREATE",
    "params": {
      "partner_id":   "partner_id",
      "timestamp":    "TIMESTAMP",
      "access_token": "token",
      "shop_id":      "shop_id"
    },
    "signature": {
      "paramOrder":  ["partner_id", "timestamp", "access_token", "shop_id"],
      "formula":     "${partner_id}${PATH}${timestamp}${access_token}${shop_id}",
      "algorithm":   "HmacSHA256",
      "includeBody": true
    }
  },
  "body-reshape-to": {"output": {}},
  "response-update-to": {
    "responsePaths": ["response.item_id"],
    "updatePaths": [{"get": "response.item_id", "to": "id", "in": "attribute"}]
  }
}
```

### 9.3 shared#serviceFunctions#partner-credential

```json
{"secret": "shpk6178735276755a637042424c614e78796c6b5a7542616d53476f67526175"}
```

### 9.4 shared#serviceFunctions#type-of-authorization

```
oauth2-hmacsha256
```

### 9.5 servflow#data_structure#info

```json
{"product": "", "variants": "skus"}
```

Shopee menggunakan `skus` (bukan `variants`) sebagai key array variant di body API.

---

## 10. Contoh channelAttributes

Payload lengkap yang dikirim sistem saat connect store Shopee:

```json
[
  {
    "attrId": "auth_token",
    "chnlAttrName": "token",
    "chnlAttrValue": "6259474765744c53684e736b6d6e4857",
    "chnlAttrType": "string",
    "isSupportField": true
  },
  {
    "attrId": "auth_client_id",
    "chnlAttrName": "partner_id",
    "chnlAttrValue": "1233683",
    "chnlAttrType": "string",
    "isSupportField": true
  },
  {
    "attrId": "auth_shop_id",
    "chnlAttrName": "shop_id",
    "chnlAttrValue": "227550228",
    "chnlAttrType": "string",
    "isSupportField": true
  },
  {
    "attrId": "product_name",
    "chnlAttrName": "item_name",
    "chnlAttrValue": "Awesome T-shirt",
    "chnlAttrType": "string"
  },
  {
    "attrId": "description",
    "chnlAttrName": "description",
    "chnlAttrValue": "Your product description",
    "chnlAttrType": "string"
  },
  {
    "attrId": "original_price",
    "chnlAttrName": "original_price",
    "chnlAttrValue": 5000,
    "chnlAttrType": "float"
  },
  {
    "attrId": "weight",
    "chnlAttrName": "weight",
    "chnlAttrValue": 1.1,
    "chnlAttrType": "float"
  },
  {
    "attrId": "category_id",
    "chnlAttrName": "category_id",
    "chnlAttrValue": 300398,
    "chnlAttrType": "int"
  },
  {
    "attrId": "brand",
    "chnlAttrName": "brand",
    "chnlAttrValue": "{\"brand_id\":0,\"original_brand_name\":\"nike\"}",
    "chnlAttrType": "object"
  },
  {
    "attrId": "seller_stock",
    "chnlAttrName": "seller_stock",
    "chnlAttrValue": "[{\"stock\":10}]",
    "chnlAttrType": "object[]"
  },
  {
    "attrId": "logistic_info",
    "chnlAttrName": "logistic_info",
    "chnlAttrValue": "[{\"enabled\":true,\"logistic_id\":80054}]",
    "chnlAttrType": "object[]"
  },
  {
    "attrId": "product_images",
    "chnlAttrName": "images",
    "chnlAttrValue": "{\"image_url_list\":[{\"uri\":\"https://...\",\"scene\":1}]}",
    "chnlAttrType": "object",
    "isSupportField": true
  },
  {
    "attrId": "product_images",
    "chnlAttrName": "image",
    "chnlAttrValue": "{}",
    "chnlAttrType": "object"
  }
]
```

**Catatan field `isSupportField: true`:** field-field ini adalah support/auth fields yang digunakan
sistem untuk proses publish, bukan field data produk.

---

## 11. Error Umum dan Solusi

| Error Code | Pesan | Penyebab | Solusi |
|---|---|---|---|
| `error_sign` | Invalid signature | Partner key di-decode (strip `shpk` + hex decode) | Gunakan full key termasuk prefix `shpk` |
| `error_sign` | Invalid signature | URL salah — server lama tidak kenal partner_id baru | Ganti URL ke `openplatform.sandbox.test-stable.shopee.sg` |
| `error_sign` | Invalid signature | Token tidak valid | Ambil `access_token` dari API Test Tool Partner Center |
| `product.error_invalid_category` | Invalid category | `category_id` bukan leaf node | Ambil dari `GET /api/v2/product/get_category`, gunakan hanya yang `has_children: false` |
| — | `value must Not Null` pada `seller_stock` | Menggunakan `normal_stock` (int) bukan `seller_stock` (array) | Ubah ke `"seller_stock": [{"stock": 10}]` |
| `error_invalid_logistic_info` | Invalid logistic | `logistic_id` yang dipakai tidak ada/disabled di shop | Cek dengan `GET /api/v2/logistics/get_channel_list`, gunakan yang `enabled: true` |

---

## 12. Checklist Sebelum Production

### Kredensial

- [ ] Ganti `partner_id` ke **Production Partner ID** dari Partner Center
- [ ] Ganti `partner_key` ke **Production Partner Key** dari Partner Center
- [ ] Ganti base URL ke `https://partner.shopeemobile.com`

### Token Management

- [ ] Implementasi **token refresh** — `access_token` di production expired tiap **4 jam**
- [ ] Simpan `refresh_token` di database (`channel_store_connections.tokenExpiry`)
- [ ] Setup `GenericTokenRefreshService` dengan `TokenRefreshConfig` untuk Shopee
- [ ] Pastikan `tokenExpiry.accessToken` di-update setiap kali token di-refresh

### Validasi Data

- [ ] Validasi ulang semua `category_id` di production catalog Shopee
- [ ] Validasi ulang `logistic_id` yang enabled untuk setiap shop production
- [ ] Test end-to-end publish satu produk di production sebelum bulk publish

---

## Referensi

- Shopee Open Platform Docs: [open.shopee.com](https://open.shopee.com)
- API Reference Step 2: [`../02-api-reference/04-step2-schema-and-channel-data.md`](../02-api-reference/04-step2-schema-and-channel-data.md)
- Credential Schema: [`02-per-channel-credentials.md`](02-per-channel-credentials.md)
- OAuth Flow: [`03-oauth-flow.md`](03-oauth-flow.md)
