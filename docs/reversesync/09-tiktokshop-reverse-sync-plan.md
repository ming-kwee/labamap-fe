# 09 — Rencana Implementasi Reverse Sync untuk TikTok Shop

> **Status: T-S0 + T-G1..T-G5 + T-S3 TERIMPLEMENTASI (bff-v17); T-S1/T-S3 live + T-S2 webhook menyusul.** Dokumen
> ini memetakan *apa yang sudah ada* untuk TikTok di engine reverse generik (R0–R5, lihat
> [`05`](05-config-source-of-truth.md)), *apa yang kurang*, **kenapa** TikTok beda dari Shopee/Shopify, dan **desain
> paling ringkas** untuk menutupnya. Semua menghormati guardrail terkunci: **data-driven penuh (nol literal channel
> di runtime), BFF-only, master global tak ditimpa diam-diam, forward publish + Temporal worker tak tersentuh.**
>
> **Sudah landing:** seed `reverseSyncConfig` TikTok penuh (transform + transport) + lima celah framework generik —
> T-G1 header pada SIGNED, T-G2 secret dari store cred, T-G3 POST-list + `{pageToken}` cursor paging (T-S3), T-G4
> axis `INLINE_NAME_VALUE`, **T-G5 variation-image reverse INLINE** (`sku_img` per-SKU). Uji: `ReverseVariantInverseTiktokTest`,
> `TiktokReverseSyncConfigTest`, `ReverseChannelFetchServiceTest`, `ReverseImageInverseServiceTest` — 163 tes
> reversesync hijau. **Belum diuji live** (butuh store TikTok terkoneksi + sample GET/search/webhook — §6). **Sisa:
> T-S2 webhook (butuh sample push).**

---

## 0. Satu kalimat

Engine reverse + signer + primitif transport (S1–S5) **sudah generik** dari pekerjaan Shopee, tapi TikTok **belum
punya `reverseSyncConfig` sama sekali** — dan empat sifat API TikTok (baca 1× GET ber-header **dan** ber-signature,
list via **POST search**, `sales_attributes` **name-based inline** bukan `tier_index`, gambar SKU inline per-SKU)
menyingkap **empat celah framework kecil** yang harus ditutup dulu; sisanya murni **seed config**.

---

## 1. Yang SUDAH ada (jangan dibangun ulang)

| Aset | Di mana | Catatan |
|---|---|---|
| Signer TikTok `HMAC_SORTED_QUERY_WRAP` | `HmacSortedQueryWrapSigner` + `RequestSignerRegistry` | Sudah dipakai **category read/browse** (guide 23). `ReverseChannelFetchService.buildReadAuth` sudah memilih signer via `signatureScheme`. |
| Kredensial TikTok ter-map | `integrationConfig.authentication.credentialMapping` | `accessToken→token`, `appKey→app_key`, `appSecret→app_secret`, `shopCipher→shop_cipher`. Reverse pull tinggal pakai `{cred:appKey}`/`{cred:shopCipher}`. |
| **Webhook signature TikTok** | `WebhookService.verifyTikTokSignature` | `hex(HMAC-SHA256(appSecret, timestamp+body))`, header `X-Tts-Open-Hmac-Signature`. **Siap dipakai** reverse (thin-push verify). |
| Pipeline reverse | `ReverseDerivationEngine → ReverseClassificationService → ReverseReviewService.route → …Reconciler` | Sama untuk semua channel. |
| Transport bersama | `ReverseChannelFetchService` (`buildReadAuth`/`executeReadEndpoint`), `ReverseChannelListService`, `ReverseHttp.resilient` | Signed/bearer read + browse-list + deep-merge multi-endpoint. |
| Import + SKU-match + variation-image reverse | `ReverseImportService`, `ReverseSkuMatchService`, `ReverseImageInverseService` | Generik lintas-channel (S4/S5 Shopee). |
| Token refresh TikTok | `integrationConfig.tokenRefresh` (enabled) | Access token di-refresh sebelum call. |

**Kesimpulan bagian ini:** yang generik sudah ada. TikTok butuh **seed** + **4 tambahan framework kecil** (di bawah),
bukan penulisan ulang engine.

---

## 2. Kenapa TikTok ≠ Shopee ≠ Shopify (akar semua kekurangan)

| Dimensi | Shopify | Shopee | **TikTok** | Konsekuensi TikTok |
|---|---|---|---|---|
| **Auth read** | Bearer header | Query ber-HMAC (semua di query) | **Header `x-tts-access-token` + query ber-signature** (`app_key`+`shop_cipher`+`timestamp`+`sign`) | Read harus **header DAN signed-query** sekaligus → celah **T-G1** |
| **Kelengkapan baca** | 1 GET produk penuh | 2 endpoint (base + model_list) | **1 GET** `/product/202309/products/{id}` penuh (skus inline) | `readEndpoints` = **1 entry** (lebih sederhana dari Shopee) |
| **Rahasia signing** | clientSecret | `OAuthAppConfig.clientSecret` (partner_key) | **store credential `appSecret`** (pasangan `app_key` yg dikirim) | `buildReadAuth` kirim `secretCredentialKey=null` → salah rahasia → celah **T-G2** |
| **List/browse** | GET list | GET `get_item_list` | **POST** `/product/202309/products/search` (body: page_size/page_token) | `executeReadEndpoint` **GET-only** → celah **T-G3** |
| **Bentuk varian** | options+variants | `tier_variation` + `tier_index` (INDEX_ARRAY) | **`sales_attributes:[{name,value_name}]` inline per-SKU** (name-based) | `VARIANT_INVERSE` belum punya gaya axis ini → celah **T-G4** |
| **Isi webhook** | body produk penuh (PAYLOAD) | thin `{shop_id,code,data}` (TRIGGER_PULL) | **thin** `{type, shop_id, data}` push ke 1 URL | webhook = **pemicu → PULL** (reuse pola Shopee G3) |

> **Prinsip:** keempat celah (**header+signed**, **secret dari store cred**, **POST list**, **axis name-based
> inline**) bersifat **generik** (Lazada/marketplace lain punya pola serupa). Jadi ditutup sebagai **kapabilitas
> framework yang dipilih via config**, bukan `if (tiktok)`.

---

## 3. Peta kekurangan → desain (data-driven, kode minimal)

### T0 — `reverseSyncConfig` belum ada sama sekali  *(fondasi)*

`createTiktokshopConfiguration()` membangun `ChannelConfiguration` **tanpa** `.reverseSyncConfig(...)`. Jadi seluruh
reverse (pull/webhook/import/transform) **mati** untuk TikTok. Semua bagian di bawah berujung pada **satu seed**
`ChannelConfiguration.ReverseSyncConfig` (mirror `createShopeeConfiguration`), lalu di-apply saat startup lewat blok
update loader (`existing.setReverseSyncConfig(fresh)`, sudah ada).

### T1 — TRANSFORM: `operations[]` (semua belum ada)

Respons `GET /product/202309/products/{id}` = `{code,message,data:{ id, title, description, category_id, status,
main_images:[{uri,urls[]}], product_attributes:[{id,name,values:[{id,name}]}], skus:[{id, seller_sku,
sales_attributes:[{name,value_name,sku_img:{uri,urls[]}}], price:{...}, inventory:[{quantity,...}]}] }}`.

| Op | Seed (usulan) | Catatan |
|---|---|---|
| `REBASE_ITEM` | `itemPath: data` | TikTok GET membungkus produk di `data` (bukan `response.item_list[0]` seperti Shopee). |
| `ATTRIBUTE_LIST` | `arrayPath: product_attributes`, `idField: id`, `valueListField: values`, `valueField: id` | Bentuk 202309 `{id, values:[{id,name}]}` (lihat guide 27/12). value_id round-trip forward. |
| `VARIANT_INVERSE` | `perSkuArrayPath: data.skus`, **`axisRefStyle: INLINE_NAME_VALUE`** (BARU — T-G4), `salesAttrPath: sales_attributes`, `axisNameField: name`, `axisValueField: value_name`, `fieldMap {seller_sku→sku, price.amount→price, inventory[0].quantity→inventory}` | Tak ada array dimensi terpisah; axis diambil dari tiap SKU `sales_attributes`. |
| `IMAGE_INVERSE` | `imagesPath: main_images`, **`imageUrlField: uri`**, `mainImageField: mainImage`, `galleryImagesField: galleryImages`; per-varian: mode **inline-per-SKU** dari `sales_attributes[].sku_img.uri` (T-G5, opsional/S5) | Elemen `main_images` = objek `{uri,urls[]}` (bukan string polos Shopee → butuh `imageUrlField`). |

### T2 — Pull ber-signature (header **dan** query)  *(fondasi; blokir T3/webhook)*

**Seed** (`readEndpoints` = 1 GET):
```
signatureScheme = "HMAC_SORTED_QUERY_WRAP"
signSecretCredentialKey = "appSecret"          // ← lihat T-G2
readEndpoints = [{
  urlTemplate: "https://open-api.tiktokglobalshop.com/product/{apiVersion}/products/{channelProductId}",
  authMode: "SIGNED",
  queryParams: { app_key: "{cred:appKey}", shop_cipher: "{cred:shopCipher}" }
}]
updatedAtPath = "data.update_time"  (format sesuai TikTok — konfirmasi; utk echo-dedup webhook)
```
`{apiVersion}` = `202309` (dari `metadata.apiVersion` / substitusi). `timestamp`+`sign` ditambah signer.

**Celah framework yang WAJIB ditutup lebih dulu (generik, aditif):**

- **T-G1 — header tidak dikirim pada endpoint `SIGNED`.** `ReverseChannelFetchService.executeReadEndpoint`
  menambahkan header auth **hanya** bila `!signed` (`if (!signed) req = req.header(headerName, token)`). Shopee tak
  butuh header (token di query), tapi TikTok butuh `x-tts-access-token` **selain** query ber-signature.
  **Desain:** kirim header auth pada endpoint SIGNED **juga** bila `authentication.headerName`+token resolvable
  (tetap generik; untuk Shopee header `Authorization` bila ada — TikTok kirim `x-tts-access-token`). Tanpa ini semua
  pull TikTok gagal auth.

- **T-G2 — rahasia signing tak di-plumb dari config.** `buildReadAuth` membangun
  `new SignatureSpec(signingKey, extras, "timestamp", "sign", null, null)` — argumen ke-5/6 (`excludeFromSign`,
  `secretCredentialKey`) **null**. Signer TikTok lalu jatuh ke `OAuthAppConfig[tiktokshop].clientSecret`; padahal
  category read sengaja memakai **store `appSecret`** ("else TikTok returns 106001 sign-invalid"). **Desain:** tambah
  field `signSecretCredentialKey` (dan opsional `signExcludeFromSign`) di `ReverseSyncConfig`, dan teruskan ke
  `SignatureSpec` di `buildReadAuth`. Shopee biarkan null → tak berubah. *(Catatan: `excludeFromSign=null` sendiri
  aman di jalur pull — `access_token` ada di header (bukan query) & `sign` ditambah setelah pengumpulan param.)*

**Kenapa aman:** signer TikTok sudah golden-vector-verified di jalur category; reverse tinggal memanggilnya dengan
rahasia + header yang benar.

### T3 — Import: list via **POST search**

**Seed** (`listEndpoint`):
```
listEndpoint = {
  urlTemplate: ".../product/{apiVersion}/products/search",
  authMode: "SIGNED", method: "POST",
  body: { page_size: "{limit}", page_token: "{pageToken}", status: "ACTIVATE" }
}
itemsPath = "data.products", listItemIdPath = "id", listItemStatusPath = "status", listItemTitlePath = "title"
```
**Celah T-G3 — `executeReadEndpoint` GET-only.** Sekarang `webClient.get()`. **Desain:** dukung `method` pada
`ReadEndpoint` (default GET); untuk `POST`, kirim `body` (template `{limit}`/`{pageToken}` via `resolveQp`). Signing
TikTok tetap over path+query (body GET kosong) — konfirmasi apakah search butuh body di-sign (lihat Blocker). Shopee
`get_item_list` tetap GET (method null). Paginasi TikTok pakai **`page_token`** (bukan offset) → tambah substitusi
`{pageToken}` di jalur list (generik; Shopee tetap `{offset}`).

> **RESOLVED — live-verify 2026-09-06.** Dua asumsi di plan ini ternyata SALAH dan sudah diperbaiki:
> 1. **Body TikTok POST WAJIB ikut di-sign.** `HmacSortedQueryWrapSigner` sekarang punya varian `sign(...,bodyJson)`
>    yang meng-append body mentah ke string tanda tangan (step 5); `executeReadEndpoint` men-serialize body sekali
>    lalu mengirim byte yang sama (`byte[]`). Tanpa ini → **401** (signature invalid).
> 2. **`page_size` (WAJIB) + `page_token` adalah QUERY param, BUKAN body.** Body hanya membawa filter (`status`).
>    Menaruh paging di body → **400** (page_size missing). Seed dikoreksi: paging pindah ke `queryParams`; body =
>    `{status:ACTIVATE}`. `executeReadEndpoint` juga men-drop query-param bernilai kosong (first-page `{pageToken}`).

### T4 — Webhook = pemicu, bukan pembawa payload

Push TikTok thin: `{type, shop_id, data:{...}}` ke **satu** URL; verifikasi **sudah ada**
(`WebhookService.verifyTikTokSignature`). **Reuse pola Shopee G3 (sudah generik):**
```
webhookMode = "TRIGGER_PULL"
eventCodePath = "type"            // numerik/enum event TikTok
productEventTopics = [<type utk PRODUCT_STATUS_UPDATE / product update>]   // ← konfirmasi (Blocker)
productIdPath = "data.product_id"
```
`ReverseWebhookService.isProductEvent` cocokkan `type` ke `productEventTopics`; `TRIGGER_PULL` → resolve store by
`shop_id`/`shop_cipher` → panggil pull T2 → payload penuh → pipeline `ingest`. Registrasi callback
`POST /api/v1/webhooks/tiktokshop/product-update`. Anti-loop `isEcho` pakai `updatedAtPath`. **Nol kode webhook baru**
bila field `webhookMode`/`eventCodePath` dari Shopee sudah ada; TikTok cuma isi seed.

### T5 — Import greenfield: category & status

```
categoryPath = "category_id"        // pada item hasil REBASE_ITEM (data.category_id)
itemStatusPath = "status"
liveStatusValues = ["ACTIVATE"]     // ACTIVATE=live; DRAFT/PENDING/FREEZE/…=READY
```
Resolusi productType via `product_types.channelCategoryDefaults {tiktokshop, <category_id>}` — **sumber sama dengan
Step 2**, nol koleksi baru. Pre-fill Step-2 kategori generik (08 §4c) & canonicalisasi axis (08 §4d) berlaku otomatis.

### T6 — SKU-match & variation-image reverse (reuse penuh)

`ReverseSkuMatchService` (auto-link by SKU/barcode) dan variation-image reverse **sudah generik**. Untuk TikTok:
gambar SKU ada **inline** di `sales_attributes[].sku_img.uri` per-SKU (bukan tier-option Shopee, bukan item-ref
Shopify) → butuh mode **inline-per-SKU** di `IMAGE_INVERSE` (**T-G5**, ditunda ke S5; bukan blocker reconcile
harga/stok). Simetris dengan forward guide 38.

---

## 4. Fase implementasi (tiap fase = slice teruji, aditif)

| Fase | Judul | Isi | Uji sukses | Bergantung |
|---|---|---|---|---|
| **T-S0** ✅ | Seed transform **+ 4 celah framework** | T0 + T1 (`REBASE_ITEM data`+`ATTRIBUTE_LIST`+`VARIANT_INVERSE` name-based+`IMAGE_INVERSE` main/gallery) + **T-G1..T-G4 ditutup** (§4a) | 159 tes reversesync hijau; payload GET nyata → variant+field terinversi | engine (ada) |
| **T-S1** | Signed pull (live) | seed `readEndpoints` sudah ada (T-S0); tinggal **uji live** (transport T-G1/T-G2 sudah aktif) | 1 log `R4-pull (signed)` → 200 → preview item/harga/stok/atribut/varian | store TikTok terkoneksi |
| **T-S2** | Webhook trigger→pull | T4 (reuse `webhookMode`/`eventCodePath`; verify TikTok sudah ada) | push sandbox → verify → pull → ingest; echo-suppress publish sendiri | T-S1 + **sample push (blocker)** |
| **T-S3** ✅ | Import greenfield (code) | seed `listEndpoint` POST + category/status + **`{pageToken}` cursor paging wired** (`ReverseChannelListService.listItems(...,pageToken)` + `nextPageTokenPath`, controller `?pageToken=`) | 163 tes hijau; tinggal **uji live** | T-S1 |
| **T-S4** ✅ | SKU-match + variation image | **T-G5** IMAGE_INVERSE inline-per-SKU `sku_img` (`invertInlineVariantImages`); SKU-match auto-link generik (G6) berlaku otomatis krn VARIANT_INVERSE kini ada | `ReverseImageInverseServiceTest` +3; sku_img → `variantImages` per `seller_sku` | T-S0 |

Urutan wajib: **T-S1 lebih dulu** (pull adalah fondasi; webhook memanggilnya).

### 4a. T-S0 — as-built (bff-v16)

**Framework generik (aditif, nol literal channel):**
- **T-G1** `ReverseChannelFetchService.executeReadEndpoint` — header auth kini dikirim pada endpoint `SIGNED` juga
  (bila `authentication.headerName`+token resolvable), jadi TikTok mengirim `x-tts-access-token` **bersama** query
  ber-signature. Shopee (query-only) tak terpengaruh.
- **T-G2** `ReverseSyncConfig` + field `signSecretCredentialKey` (+`signExcludeFromSign`), diteruskan ke
  `SignatureSpec` di `buildReadAuth`. TikTok pakai store `appSecret`; Shopee biarkan null → platform clientSecret.
- **T-G3** `ReadEndpoint` + field `method` (default GET) & `body`; `executeReadEndpoint` mendukung `POST` +
  `resolveBody` (placeholder `{limit}`/`{pageToken}`/`{cred:*}`, integer-coercion utk `page_size`, placeholder
  tak-ter-resolve → `""`).
- **T-G4** `VariantInverseDescriptor` + `axisRefStyle=INLINE_NAME_VALUE` (`salesAttrPath`/`axisNameField`/
  `axisValueField`); `ReverseVariantInverseService.resolveByInlinePairs` mengambil axis dari tiap SKU
  `sales_attributes=[{name,value_name}]`, nama dinormalisasi (case-insensitive → `color`/`size`).

**Seed** (`createTiktokshopConfiguration`): `signatureScheme=HMAC_SORTED_QUERY_WRAP`,
`signSecretCredentialKey=appSecret`, `signExcludeFromSign=[sign,access_token,x-tts-access-token]`, `readEndpoints`
1× GET SIGNED (`products/{id}`, query `app_key`+`shop_cipher`), `listEndpoint` POST `products/search` (body
`page_size`/`page_token`/`status`), `categoryPath=category_id`, `itemStatusPath=status`,
`liveStatusValues=[ACTIVATE]`, `operations=[REBASE_ITEM data, ATTRIBUTE_LIST product_attributes,
VARIANT_INVERSE(data.skus, INLINE_NAME_VALUE), IMAGE_INVERSE(main_images, uri)]`. Di-apply saat startup lewat
`existing.setReverseSyncConfig(fresh)`.

### 4b. T-S3 (cursor paging) + T-G5 (variation image) — as-built (bff-v17)

- **T-S3** `ReverseChannelListService.listItems(org,store,limit,offset,pageToken)` (overload 4-arg lama =
  `pageToken=null`, back-compat) mengisi placeholder `{pageToken}` ke subs (body POST TikTok), dan membaca cursor
  halaman berikutnya dari `reverseSyncConfig.nextPageTokenPath` (`data.next_page_token`) → `ChannelListPage.nextPageToken`.
  Controller `/import/list` menerima `?pageToken=`. Channel offset (Shopify/Shopee) `nextPageTokenPath=null` → tak berubah.
- **T-G5** `ReverseImageInverseService.invertInlineVariantImages` — untuk tiap sku di `variantModelArrayPath`
  (`data.skus`), kumpulkan URL dari `variantInlineAttrField[].variantInlineImagePath` (`sales_attributes[].sku_img.uri`),
  di-key `variantModelSkuField` (`seller_sku`). Digabung di import setelah tier-option (no-op untuk Shopee/Shopify: gate
  pada `variantInlineAttrField`). Seed IMAGE_INVERSE TikTok menambah `variantSkuField/variantImagesField/
  variantModelArrayPath/variantModelSkuField/variantInlineAttrField/variantInlineImagePath`. Simetris forward guide 38.
- Uji: `ReverseImageInverseServiceTest` +3 (inline per-sku, no-image skip, no-op mode lain),
  `ReverseChannelFetchServiceTest` +1 (resolveBody supplied pageToken), `TiktokReverseSyncConfigTest` (assert
  `nextPageTokenPath`/`listItemTitlePath`). 163 tes reversesync hijau.

---

## 5. Perubahan kode (ringkas) & yang TIDAK berubah

**Berubah (aditif, GENERIK — bukan literal TikTok):**

| Tempat | Tambahan | Celah |
|---|---|---|
| `ReverseChannelFetchService.executeReadEndpoint` | kirim header auth pada endpoint `SIGNED` juga (bila headerName+token ada) | **T-G1** |
| `ReverseChannelFetchService.buildReadAuth` + `ReverseSyncConfig` | field `signSecretCredentialKey` (+opsional `signExcludeFromSign`) → teruskan ke `SignatureSpec` | **T-G2** |
| `ReverseChannelFetchService.executeReadEndpoint` + `ReadEndpoint` | field `method` (default GET) + `body` (POST) + substitusi `{pageToken}` | **T-G3** |
| `ReverseVariantInverseService` | `axisRefStyle=INLINE_NAME_VALUE` — axis dari `salesAttrPath[].{axisNameField,axisValueField}` per-SKU | **T-G4** |
| `ReverseImageInverseService` | mode inline-per-SKU: `sales_attributes[].sku_img.uri` → `variantImages` (opsional S4) | **T-G5** |
| `ChannelConfigurationDataLoader.createTiktokshopConfiguration` | **seed `reverseSyncConfig`** (semua di atas) + `.reverseSyncConfig(tiktokReverse)` di builder | T0 |

**Tak berubah (guardrail terkunci):** forward publish, Temporal sync worker, `apiSchema` (spec-of-record), engine
forward, master global (hanya `ReverseReviewService.accept` yang menulisnya). Semua field baru **opsional** → channel
lain tak terpengaruh (Shopee tetap `HMAC_CONCAT_FIXED` query-only + GET list; Shopify tetap bearer + PAYLOAD).

---

## 6. Blocker & sample yang dibutuhkan (harus dikonfirmasi sebelum eksekusi)

1. **Respons `GET /product/202309/products/{id}` nyata** — verifikasi wrapper `data`, path `skus`, bentuk
   `sales_attributes:[{name,value_name,sku_img}]`, `main_images:[{uri,urls}]`, `product_attributes:[{id,values:[{id,name}]}]`,
   nama field `status` + nilai live (`ACTIVATE`?), dan `update_time` (untuk echo-dedup). Menentukan seed `operations[]` + `updatedAtPath`.
2. **`products/search` (POST)** — body param persis (`page_size`/`page_token`/`status`/`filter`), `itemsPath`
   (`data.products`?), apakah **body ikut di-sign** (TikTok POST menandatangani path+query saja atau +body). Menentukan T-G3.
3. **Envelope webhook TikTok product** — nilai `type` mana yang berarti product create/update (isi `productEventTopics`),
   di mana `product_id` (`data.product_id`?), dan header timestamp untuk verify (sudah ada `verifyTikTokSignature`).
4. **`signSecretCredentialKey`** — pastikan store menyimpan `appSecret` (mapping sudah ada); bila per-app secret =
   `OAuthAppConfig.clientSecret`, T-G2 boleh dilewati, tapi seed `appSecret` tetap lebih aman (sesuai category read).
5. **Region host** — `open-api.tiktokglobalshop.com` (global) vs regional; `readEndpoints.urlTemplate` harus konsisten
   dengan store.

T-S0 (transform via `/apply` manual) **tidak** terblokir bila sample payload GET tersedia — bisa diuji sekarang.

---

## 7. Checklist "tambah channel" (05 §9) — status TikTok

1. `channel_field_mappings` — ✅ ada (forward; reverse baca terbalik injektif).
2. `channel_field_value_mappings` — ✅ ada (di-seed `ChannelValueMappingDataLoader`, incl. tiktok).
3. `reverseSyncConfig.operations[]` — ✅ **seeded** (T-S0): REBASE_ITEM/ATTRIBUTE_LIST/VARIANT_INVERSE
   (`INLINE_NAME_VALUE`, T-G4)/IMAGE_INVERSE **incl. variation-image inline (T-G5)**. ⏳ live-verify.
4. `reverseSyncConfig` transport — ✅ **seeded + framework siap** (T-S0): `signatureScheme`+`signSecretCredentialKey`+
   `readEndpoints` (T-G1/T-G2), `listEndpoint` POST + `nextPageTokenPath` cursor paging (T-G3/T-S3), category/status.
   ⏳ webhook fields (T-S2).
5. `ecommerce_master_attributes.reverseWritePolicy` — ✅ seeded `ReverseWritePolicyMigration` (@Order 165); set
   per-field yang diaktifkan (harga/stok CHANNEL_AUTHORITATIVE atau DRAFT_REVIEW).
6. `integrationConfig.authentication` — ✅ ada (`accessToken/appKey/appSecret/shopCipher` ter-map); reverse pull memakainya.
7. Webhook signature — ✅ ada (`WebhookService.verifyTikTokSignature`).

**Kesimpulan:** TikTok **~90% siap (code-complete kecuali webhook)** — engine + signer + kredensial + webhook-verify
generik semua ada, dan **reverseSyncConfig ter-seed penuh (transform + transport)** dengan **5 celah framework generik
ditutup** (T-G1..T-G5) + cursor paging (T-S3). Reconcile inti + import greenfield + variation-image + SKU-match
semuanya code-complete. Sisa: **uji live** (T-S1/T-S3, butuh store terkoneksi) dan **webhook trigger-pull** (T-S2,
butuh sample push). Semua tambahan **aditif & generik** — bukan penulisan ulang engine, bukan literal TikTok.

## 8. Terkait
[`05`](05-config-source-of-truth.md) (SoT & status terkunci), [`06`](06-import-channel-native.md) (import),
[`07`](07-import-image-rehosting.md) (re-host gambar), [`08`](08-shopee-reverse-sync-plan.md) (template terdekat —
HMAC + thin-webhook + variation image), guide 38 (forward TikTok variant images — simetri media), guide 23 (signing
TikTok `HMAC_SORTED_QUERY_WRAP`), [[sync-service-workaction-model]], [[tiktok-publish-pipeline-complete]].
