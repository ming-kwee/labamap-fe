# Desain: Lapisan Resolusi Kapabilitas Channel (Opsi 2)

Implementasi konkret dari [`resolusi_kapabilitas_channel.md`](../../../resolusi_kapabilitas_channel.md) §7 & §9
(Fase 1). Satu **resolver generik, HMAC-aware, ber-key, ber-cache** yang menggantikan keadaan
sekarang yang tercecer & sebagian diam-diam gagal.

> Status: **desain** (belum ada kode). Semua klaim endpoint di bawah **terbukti via probe**
> `notifikasi/scripts/shopee_probe.py` (sandbox, token live), kecuali yang ditandai ⚠️.

---

## 1. Kenapa perlu lapisan baru (bukan menambal yang ada)

Bukti dari sesi verifikasi:

| Endpoint                      | Sumber       | Kondisi sekarang      | Rumah sekarang                                |
|-------------------------------|--------------|-----------------------|-----------------------------------------------|
| `product/get_attribute_tree`  | B (kategori) | ✅ baru diperbaiki     | `channel_category_api_config.attributeConfig` |
| `product/get_brand_list`      | B (kategori) | ❌ tak ada rumah       | —                                             |
| `product/get_size_chart_list` | B (kategori) | ❌ tak ada rumah       | —                                             |
| `logistics/get_channel_list`  | C (toko)     | ❌ **diam-diam gagal** | `merchant_api_operations` (auth salah)        |
| `shop/get_warehouse_detail`   | C (toko)     | ❌ **diam-diam gagal** | `merchant_api_operations` (auth salah)        |

**Akar bersama.** B-tambahan dan C butuh hal yang **sama** dan belum ada di satu tempat:

1. **HMAC-SHA256 signing** — `MerchantApiOperationDocument.AuthStrategy` tak punya `HMAC_SHA256`,
   dan `GenericMerchantDataService` tak menandatangani sama sekali. Shopee ops di-set `BEARER_TOKEN`
   → Shopee tolak. Sementara `GenericCategoryService` **sudah** punya signer
   (`applyHmacSha256Signing`, `GenericCategoryService.java:940`) tapi terkopel ke
   `CategoryTreeApiConfig`.
2. **Key binding** (category_id vs shop_id) sebagai penentu cache-key + pemicu invalidasi (§5 dok).
3. **Pagination** — `brand_list` offset-based; `size_chart_list` cursor-based.
4. **Cache + invalidasi berbasis event** (§5 dok) — belum ada untuk C sama sekali.
5. **Enrichment pra-publish** (§7 dok) — resolusi harus mengisi payload *sebelum* body dibentuk;
   sekarang `attributeConfig` hanya memberi form Step 2, tak menyentuh jalur publish.

Menambal `attributeConfig` (single-endpoint) atau `merchant_api_operations` (tanpa HMAC/kunci/cache)
akan menduplikasi logika. Satu lapisan resolver menuntaskan B & C sekaligus.

---

## 2. Fakta endpoint (hasil probe — dasar konfigurasi)

| Operasi | Path | Key | Param wajib | itemsJsonPath | value / label | Pagination | Metadata |
|---|---|---|---|---|---|---|---|
| `GetAttributeTree` | `/api/v2/product/get_attribute_tree` | category | `category_id_list`, `language` | `response.list` → `attribute_tree` (nested) | `attribute_id` / `name` | — | `mandatory`, value `attribute_value_list[{value_id,name}]` |
| `GetBrandList` | `/api/v2/product/get_brand_list` | category | `category_id`, `page_size`, `offset`, `status`, `language` | `response.brand_list` | `brand_id` / `display_brand_name` | offset (`has_next_page`,`next_offset`) | `is_mandatory`, `input_type` |
| `GetSizeChartList` | `/api/v2/product/get_size_chart_list` | category | `category_id`, `page_size` | `response.size_chart_list` ⚠️ (kosong utk 300242) | ⚠️ (blm terlihat) | cursor (`next_cursor`) | `total_count` |
| `GetChannelList` | `/api/v2/logistics/get_channel_list` | shop | — | `response.logistics_channel_list` | `logistics_channel_id` / `logistics_channel_name` | — | `enabled` (filter!) |
| `GetWarehouseDetail` | `/api/v2/shop/get_warehouse_detail` | shop | — | `response.warehouse_list` | `warehouse_id` / `warehouse_name` | — | whitelist multi-gudang |

> **Koreksi dokumen:** `resolusi_kapabilitas_channel.md` §4/§10 menulis
> `logistics/get_warehouse_detail` — **404 error_not_found**. Path yang benar `shop/get_warehouse_detail`
> (200; hanya `warehouse.error_not_in_whitelist` karena toko uji single-warehouse). Perlu dikoreksi
> di dokumen itu.
>
> **Brand mandatory + NoBrand:** probe kategori 300242 → `is_mandatory:true`, `brand_list` berisi
> `{brand_id:0, "No brand"}`. Artinya kirim `brand_id:0` sah untuk kategori ini — tapi jangan
> di-hardcode: resolve dari `get_brand_list` agar kategori yang menolak NoBrand tertangani.

---

## 3. Model data baru

### 3.1 Koleksi konfigurasi: `channel_capability_operations`

Satu dokumen per `(channelType, operationName)`. Gabungan bagian relevan dari
`MerchantApiOperationDocument` + bit HMAC dari `CategoryTreeApiConfig` + key binding + pagination.

```
channelType            : "shopee"
operationName          : "GetBrandList"                 // enum stabil, dipakai attr & post-proc
label                  : "Shopee Brand List"
baseUrl                : {shopee.apiBaseUrl}            // env-driven, SAMA dg category tree (bukan hardcode prod)
httpMethod             : "GET"
urlPath                : "/api/v2/product/get_brand_list"

# ── Key binding (menggantikan konsep Sumber B/C jadi data) ──
keySource              : CATEGORY_ID | SHOP_ID | NONE   // CATEGORY_ID→B, SHOP_ID→C
keyQueryParam          : "category_id"                  // param pembawa keyValue; null jika NONE

# ── Auth (reuse signer bersama) ──
authStrategy           : HMAC_SHA256 | BEARER_TOKEN | API_KEY_HEADER | API_KEY_QUERY | NO_AUTH
authCredentialKey      : "accessToken"
credentialQueryParams  : { partner_id: partnerId, shop_id: shopId, access_token: accessToken }
hmacSigningCredentialKey     : "partnerId"              // default
hmacExtraSigningCredentialKeys: [ accessToken, shopId ] // Shopee shop-level formula
hmacTimestampParam     : "timestamp"
hmacSignParam          : "sign"
fixedQueryParams       : { language: "en", status: "1" }

# ── Response mapping ──
itemsJsonPath          : "response.brand_list"
nestedArrayField       : null                           // "attribute_tree" utk GetAttributeTree
valueField             : "brand_id"
labelField             : "display_brand_name"
requiredMetaField      : "is_mandatory"                 // opsional; utk preflight (§6)
# untuk operasi bergaya-atribut (nilai punya value_id):
valuesField            : null                           // "attribute_value_list"
valueIdField           : null                           // "value_id"
valueNameField         : null                           // "name"

# ── Pagination ──
paginationStrategy     : NONE | OFFSET | CURSOR
pageSizeParam          : "page_size"
pageSizeValue          : 100
offsetParam            : "offset"                        // OFFSET
hasNextJsonPath        : "response.has_next_page"        // OFFSET
nextOffsetJsonPath     : "response.next_offset"          // OFFSET
cursorParam            : "cursor"                        // CURSOR
nextCursorJsonPath     : "response.next_cursor"          // CURSOR

# ── Cache ──
cacheTtlSeconds        : 86400                           // B: panjang; C: menengah
enabled                : true
```

**Catatan konvensi (CLAUDE.md):** koleksi ini di-seed oleh `ChannelCapabilityOperationDataLoader`
(loader = rumah sah data literal). Runtime hanya **membaca** — tak ada vocabulary/if-switch per
channel di service.

### 3.2 Koleksi cache: `channel_capability_cache`

```
channelType, operationName
scopeKey     : categoryId (B) | storeId/shopId (C) | "-" (NONE)
region       : "en" / marketplace
items        : [ { value, label, meta{ mandatory, inputType, enabled, valueIndex[{name→valueId}] } } ]
syncedAt, expireAt   // TTL index → invalidasi waktu (§5)
```

Invalidasi paksa (§5 dok): hapus baris `scopeKey==categoryId` saat kategori produk berganti;
hapus `scopeKey==storeId` saat setelan toko/logistik diubah (hook di store-update & webhook).

---

## 4. Refactor prasyarat: ekstrak HMAC signer (akar perbaikan C)

`applyHmacSha256Signing` + `injectPlatformPartnerId` (`GenericCategoryService.java:897,940`) terkopel
ke `CategoryTreeApiConfig`. Ekstrak ke util netral yang menerima **spec kecil**, dipakai bersama oleh
category tree, resolver, dan (opsional) merchant service:

```java
// channel/common/HmacSha256Signer.java
record HmacSigningSpec(String signingCredentialKey, List<String> extraSigningKeys,
                       String timestampParam, String signParam) {}

void sign(UriComponentsBuilder uri, String urlPath, String channelType,
          Map<String,String> creds, HmacSigningSpec spec);      // memakai OAuthAppConfig.clientSecret
Map<String,String> injectPlatformPartnerId(Map<String,String> creds, String channelType, String signingKey);
```

`GenericCategoryService` memanggil util ini (perilaku identik — formula tak berubah). Resolver &
merchant service memakainya juga. **Ini yang menutup silent-fail C** (BEARER→HMAC).

---

## 5. Service

```java
// channel/capability/ChannelCapabilityResolver.java
Mono<CapabilityResult> resolve(String channelType, String operationName,
                               String scopeKey, String storeId, String organizationId);
```

Alur: cache-lookup (by channelType+operation+scopeKey+region) → miss → baca
`channel_capability_operations` → bangun URI (key param + fixed + credential params) → inject partner_id
→ HMAC sign → GET → follow pagination (offset/cursor) sampai habis → map items (+meta) → simpan cache →
kembalikan.

**Anti silent-fail.** `CapabilityResult` membawa `status: OK | EMPTY | AUTH_FAILED | HTTP_ERROR`
(bukan sekadar `List.of()`). Pemanggil publish bisa memutus: fail-fast vs lanjut. (Pelajaran dari
`get_attributes`/C yang gagal senyap karena error ditelan jadi list kosong.)

---

## 6. Integrasi publish (§7 dok) — enrichment pra-body, tanpa sentuh `apiSchema`

Hook **setelah JOLT, sebelum post-processing** di `ChannelPublishService` (pola staging `_`-key yang
sudah ada, mis. `collectSourceImageUrls`/`_sourceImages`). Tahapan:

```
JOLT output
   │
   ▼  [ CapabilityEnrichmentStep ]  ← by categoryId: GetAttributeTree, GetBrandList, GetSizeChartList
   │                                 ← by shopId:     GetChannelList, GetWarehouseDetail
   │   stage reserved keys pada transformedData:
   │     _attributeValueIndex   { attrName → {valueName→valueId, attrId, isFreeText} }   (§6 pemetaan)
   │     _resolvedBrandId        (dari brand_list; hormati NoBrand/tolak-NoBrand)
   │     _resolvedLogistics[]    (channel_list difilter enabled==true)
   │     _resolvedLocationId     (warehouse; kosong utk single-warehouse)
   ▼
post-processing rules  → map _*-keys ke path body (attribute_list value_id, brand.brand_id,
                          logistic_info[], seller_stock.location_id)
   ▼
buildChannelAttributes (skip _*-keys) → add_item
```

- **`apiSchema` tak diubah** (CLAUDE.md). Yang dikirim adalah support-field via post-processing +
  attribute mappings, bukan penambahan field di create-body contract.
- **Pemetaan value_id (§6)** menjadi nyata: rule `shopee-build-attribute-values` (kini
  `SET_DEFAULT attribute_id=0`, `ChannelConfigurationDataLoader.java:1515`) diubah membaca
  `_attributeValueIndex` untuk mengganti `attribute_id` asli + `value_id` hasil translate; atribut
  free-text kirim `original_value_name`.
- **Preflight (§Fase 4 dok).** Sebelum hit Shopee, cek `requiredMetaField`: brand `is_mandatory` &
  size_chart wajib tapi belum terisi → gagal cepat dengan pesan jelas (bukan trial-error
  `error_invalid_brand`).

---

## 6b. Konsumen kedua: kesadaran agent JOLT (`categoryAttributes`)

`channel_capability_cache` tidak hanya melayani enrichment publish. **Agent generasi JOLT** membacanya
juga, lewat tool `get_channel_schema` (`AgentToolHandlerService.resolveCategoryAttributes`), sehingga
agent memetakan `attribute_list` ke atribut kategori yang **nyata**, bukan placeholder generik.

```
channel_capability_cache  (hasil GetAttributeTree, scopeKey = slug kategori)
   │
   ├──▶ [publish]  CapabilityEnrichmentService.resolveStaging → _attributeValueIndex → post-processing
   │
   └──▶ [generate] AgentToolHandlerService.get_channel_schema:
            findByChannelTypeAndScopeKey(channelType, slug)   ← region-agnostic, TANPA store/kredensial
            → categoryAttributes: [{ attribute, required?, values:[value-name…] }]
            → note: "map original_value_name, JANGAN value_id — TRANSLATE_VALUE_IDS yang menerjemahkan"
```

- **Kenapa cache, bukan panggil live?** Saat generate, tak ada store/creds; cache aman &
  credential-free. `scopeKey` = **slug** (sama dengan yang dipakai `resolveStaging`), jadi agent yang
  hanya punya slug tetap cocok — region diabaikan (`findByChannelTypeAndScopeKey`).
- **Best-effort.** Kategori yang belum pernah publish → cache kosong → `categoryAttributes` kosong →
  agent jatuh balik ke `attribute_list` generik `apiSchema`. Nol regresi.
- **Hanya value-name yang diekspos** (bukan `value_id`), memperkuat kontrak: nama dipetakan, value_id
  diisi post-processing. Lihat `docs/POST-PROCESSING-CONTRACT-DESIGN.md` (Lapis 3).
- **Target flat juga reserved.** `postProcessingHandledFields` kini menandai target top-level tanpa
  titik (`logistic_info`, `brand`, `seller_stock`) untuk body flat, jadi output capability layer
  otomatis dikenali agent sebagai "jangan map ke sini".

> `merchant_api_operations` **tidak** ikut disuap ke agent — itu sumber dropdown form Step-2, bukan
> target create-body. Lihat tabel §7.

---

## 7. Hubungan dengan komponen lama (hindari duplikasi)

| Komponen | Nasib |
|---|---|
| `attributeConfig` (`GetAttributeTree`) | **Tetap** untuk form Step 2 (UI). Fase 3: `CategoryCacheService` boleh delegasi ke resolver agar satu jalur fetch. |
| `merchant_api_operations` Shopee (logistics/warehouse) | **Superseded, bukan dihapus.** `channel_capability_operations` (`HMAC_SHA256`+`keySource=SHOP_ID`) menjadi sumber baru; entri lama dibiarkan tak-terpakai (nol risiko koordinasi). Master attr Shopee `logistics_channel_id`(→`GetLogistics`) **di-repoint** ke resolver, tidak dihapus. Pembersihan entri lama = opsional, fase akhir, setelah Step-2 Shopee terbukti hijau. |
| `GenericMerchantDataService` | **Tak disentuh.** Semua field-option non-Shopee (Shopify `GetLocations`, Lazada `GetWarehouseDetail`, TikTok `GetWarehouses`, eBay `GetFulfillmentPolicies`, Amazon) tetap lewat sini apa adanya. Jangka panjang boleh delegasi ke signer bersama — opsional, bukan prasyarat. |

---

## 8. Rollout bertahap (memetakan Fase 1–4 dokumen)

1. **Fase 1 — Resolver read-only + cache.** Ekstrak `HmacSha256Signer` (§4); buat koleksi + loader +
   `ChannelCapabilityResolver`; seed 5 operasi Shopee. Belum ubah publish. Uji via probe/endpoint admin.
2. **Fase 2 — Enrichment pra-kirim (§6).** `CapabilityEnrichmentStep` stage `_`-keys; ubah
   post-processing untuk brand/logistics/attribute value_id. **Prioritas: `GetChannelList`** (tutup
   `logistics.no.valid.channel` — blocker publish nyata).
3. **Fase 3 — Invalidasi berbasis event (§5).** Hapus cache scope-category saat kategori produk
   berganti; scope-shop saat setelan toko/webhook.
4. **Fase 4 — Preflight.** Deteksi mandatory belum lengkap sebelum add_item.

**Byproduct wajib:** koreksi path `logistics/→shop/get_warehouse_detail` di
`resolusi_kapabilitas_channel.md` (§2 dok ini).

---

## 9. Titik sentuh kode (ringkas)

| Berkas | Perubahan |
|---|---|
| `channel/common/HmacSha256Signer.java` (baru) | ekstrak signer + `injectPlatformPartnerId` |
| `GenericCategoryService.java:897,940` | pakai signer bersama (perilaku identik) |
| `channel/capability/*` (baru) | doc konfig, doc cache, repo, `ChannelCapabilityResolver`, loader |
| `ChannelPublishService.java` (~post-JOLT) | `CapabilityEnrichmentStep` stage `_`-keys |
| `ChannelConfigurationDataLoader.java:1515` | rule attribute_list baca `_attributeValueIndex` |
| `MerchantApiOperationDataLoader.java:137-164` | **biarkan** (superseded); repoint sumber Step-2 Shopee ke resolver — jangan hapus |
| `resolusi_kapabilitas_channel.md` §4/§10 | koreksi path warehouse |

---

## 10. Jaminan non-regresi (Shopify, Wix, & channel lain)

Prinsip menyeluruh: **setiap perubahan aditif & ter-gate oleh data; refactor bersifat
behavior-preserving; koleksi baru bukan mutasi koleksi lama.** Channel yang sekarang benar tak boleh
berubah perilakunya. Bukti & invarian per fase:

### Invarian global
- **G1 — Gate by data.** Kode runtime baru (resolver, enrichment, preflight) **hanya aktif** bila ada
  dokumen `channel_capability_operations` untuk channel itu. Hanya **Shopee** yang di-seed.
  Shopify/Wix/Amazon/eBay/Lazada/TikTok → tak ada config → jalur baru **no-op** (early-return).
- **G2 — Koleksi baru, bukan mutasi.** `channel_capability_cache` koleksi baru; `channel_category_attributes_cache`
  & `channel_taxonomy_cache` tak disentuh. Invalidasi hanya `deleteBy…` pada koleksi baru.
- **G3 — Perubahan data channel-scoped.** Semua edit seed/migrasi hanya menyasar dokumen
  `channelType=shopee`. Tak ada dokumen Shopify/Wix yang ditulis.
- **G4 — Tak ada penghapusan.** Tak ada `merchant_api_operations`/attribute yang dihapus (§7). Paling
  jauh: di-supersede & di-repoint (Shopee saja).

### Bukti keamanan refactor signer (Fase 1)
- **HMAC_SHA256 = Shopee-only** (`CategoryApiConfigDataLoader.java:164`). Shopify=BEARER/GraphQL,
  Wix=`API_KEY_HEADER`+`credentialHeaders`, Lazada/TikTok=`API_KEY_QUERY`, Amazon/eBay=BEARER.
- Untuk non-HMAC: `injectPlatformPartnerId` **return creds apa adanya** (guard
  `GenericCategoryService.java:900`) dan `applyHmacSha256Signing` **tak pernah dipanggil** (guard
  `:302`, `:734`). ⇒ ekstraksi signer = **pure refactor** untuk semua channel non-Shopee.
- **Gerbang uji:** *characterization test* — untuk input tetap (creds+path+ts semu), URL ber-sign
  Shopee **byte-identik** sebelum vs sesudah ekstraksi. Refactor tak boleh mengubah formula.

### Bukti keamanan perubahan yang SUDAH landing (fase 0)
- Seed `get_attribute_tree`: hanya entri `channelType=shopee`. Entri Shopify/Wix tak berubah.
- Variant-match `label`: no-op utk Shopify (`idField==nameField=="name"` ⇒ `label==fieldName`);
  Wix **tak punya attributeConfig** (`GenericCategoryService.java:158` skip) ⇒ tak pernah jalan;
  channel set-kosong tak terpengaruh.

### Keamanan enrichment publish (Fase 2)
- `CapabilityEnrichmentStep` early-return bila channel tak punya capability ops ⇒ untuk Shopify/Wix
  **tak ada `_`-key di-stage**, `buildChannelAttributes` identik, post-processing identik.
- Rule yang diubah (`shopee-build-attribute-values`) adalah **rule milik Shopee**; rule Shopify/Wix
  (productOptions/mediaChoice, dst.) tak disentuh.
- `apiSchema` tak diubah (CLAUDE.md) untuk channel mana pun.

### Keamanan Step-2 saat C dipindah (Fase 2–3)
- Master attr `logistics_channel_id`(`GetLogistics`) **Shopee-scoped** (`supportedChannels=[shopee]`).
  Repoint-nya tak menyentuh Shopify `location_id`(`GetLocations`), Lazada `GetWarehouseDetail`,
  TikTok `GetWarehouses`, eBay `GetFulfillmentPolicies`, Amazon — semua tetap lewat
  `GenericMerchantDataService` yang tak diubah.
- Karena Shopee C **sudah** gagal-senyap hari ini (BEARER), repoint hanya bisa **memperbaiki**,
  tak mungkin memperburuk.

### Checklist verifikasi tiap fase (smoke, sebelum merge)
| Channel | Uji |
|---|---|
| Shopify | category tree fetch ✓; attribute fetch (GraphQL) ✓; variantOptionAttributeNames split ✓; publish dry-run ✓ |
| Wix | category (POST query) ✓; publish multi-step (create→variants→media) ✓ |
| Lazada/TikTok | attribute fetch + merchant options (warehouse/shipping) ✓ |
| Amazon/eBay | two-step attribute / aspects ✓ |
| Shopee (target) | resolver 5 op ✓; enrichment `_`-keys ✓; publish add_item ✓ |

> Aturan merge: fase apa pun hanya di-merge jika **seluruh baris non-Shopee di checklist tak berubah
> perilakunya** dan characterization test signer hijau.
```
