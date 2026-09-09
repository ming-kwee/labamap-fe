# 08 — Rencana Implementasi Reverse Sync untuk Shopee

> **Status: PLAN (belum dieksekusi).** Dokumen ini memetakan *apa yang sudah ada* untuk Shopee di engine
> reverse generik (R0–R5, lihat [`05`](05-config-source-of-truth.md)), *apa yang kurang*, **kenapa** kekurangan
> itu berbeda dari Shopify, dan **desain paling ringkas** untuk menutupnya — semuanya menghormati guardrail
> yang sudah terkunci: **data-driven penuh (nol literal channel di runtime), BFF-only, master global tak
> ditimpa diam-diam, forward publish + Temporal worker tak tersentuh.**

---

## 0. Satu kalimat

Engine reverse sudah generik dan Shopee sudah **terverifikasi untuk transform** (`REBASE_ITEM` +
`ATTRIBUTE_LIST` + `VARIANT_INVERSE`); yang tersisa adalah **transport masuk** — *pull ber-signature*,
*webhook sebagai pemicu (bukan pembawa payload)*, plus images/import/SKU-match — dan ketiga kapabilitas
transport inti itu **generik** (dipakai ulang TikTok/Lazada), jadi diimplementasi di framework lewat config,
bukan sebagai cabang Shopee.

---

## 1. Yang SUDAH ada untuk Shopee (jangan dibangun ulang)

Di `ChannelConfigurationDataLoader.createShopeeConfiguration()` → `reverseSyncConfig.operations[]`
(terverifikasi vs `v2.product.get_model_list` & `get_item_base_info` nyata; test `ReverseVariantInverseServiceShopeeTest`, `ReverseItemLevelShopeeTest`, `ReverseAttributeListInverseTest`):

| Op | Isi | Baca dari |
|---|---|---|
| `REBASE_ITEM` | `itemPath: response.item_list[0]` — item ter-nest → root | `get_item_base_info` |
| `ATTRIBUTE_LIST` | `attribute_list`→channelData keyed by `attribute_id`/`value_id` | item |
| `VARIANT_INVERSE` | `perSkuArrayPath: response.model`, `dimensionsPath: response.tier_variation`, `dimensionOptionValueField: option`, `INDEX_ARRAY tier_index`, `fieldMap {model_sku→sku, price_info[0].original_price→price, stock_info_v2…total_available_stock→inventory}` | `get_model_list` |
| `IMAGE_INVERSE` | main/gallery dari `image.image_url_list` (item-relative) **+ variation images** mode tier-option: gather `tier_variation[0].option_list[].image.image_url` → scatter ke model via `tier_index[0]`, key `model_sku→sku` (response-relative) | `get_item_base_info` + `get_model_list` |

Jalur **manual** sudah bisa dipakai hari ini: kirim payload Shopee ke `POST /api/v1/channels/reverse/apply`
(atau `/preview`) → de-derive → classify → route. Jadi **transform sudah selesai**; yang belum = otomasi
transport.

Reuse yang tersedia (jangan tulis ulang):

- **Signing generik:** `RequestSignerRegistry.get(SignatureScheme.HMAC_CONCAT_FIXED)` — sudah dipakai
  category READ Shopee (`GenericCategoryService.signRequest`). `sign(uriBuilder, path, channelType, creds, spec)`.
- **HTTP resilience:** `ReverseHttp.resilient(...)` (timeout+retry transient/429/5xx).
- **Pipeline:** `ReverseDerivationEngine` → `ReverseClassificationService` → `ReverseReviewService.route`
  (policy) → `ReverseVariantInverseService`/`Reconciler`; echo-suppression `ReverseWebhookService.isEcho`.
- **Kredensial:** `ChannelStoreConnectionService.getDecryptedCredentials` (accessToken/shopId/partnerId sudah
  dipetakan di `authentication.credentialMapping`); partner_key dari `OAuthAppConfig.clientSecret`
  (env `SHOPEE_PARTNER_KEY`).

---

## 2. Kenapa Shopee ≠ Shopify (akar semua kekurangan)

Tiga perbedaan model API yang menentukan desain:

| Dimensi | Shopify | Shopee | Konsekuensi |
|---|---|---|---|
| **Auth read** | Bearer token di header | **Query ber-HMAC** (`partner_id+path+timestamp+access_token+shop_id` → `sign`, key = partner_key) | Pull generik yang bearer-only **tak bisa** memanggil Shopee → butuh signer |
| **Kelengkapan 1 GET** | 1 GET `products/{id}.json` = produk penuh (varian inline) | Item **terbelah 2 endpoint**: `get_item_base_info` (nama/desc/berat/gambar/attribute_list) + `get_model_list` (tier_variation + model price/stock) | Pull Shopee harus **multi-endpoint + merge** |
| **Isi webhook** | `products/update` **membawa body produk penuh** → langsung pipeline | Push Shopee **tipis**: `{shop_id, code, timestamp, data}` — hanya `item_id`, tanpa isi | Webhook Shopee = **pemicu**, lalu **PULL**; bukan parse body |

Plus discriminator event beda: Shopify pakai *topic* (`products-update`) di path; Shopee pakai **`code`
numerik di body** ke **satu** URL callback.

> **Prinsip:** ketiga hal (signed read, multi-fetch, webhook-as-trigger) **generik** (TikTok/Lazada sama-sama
> HMAC + push tipis). Jadi diimplementasi sebagai **kapabilitas framework yang dipilih via config**, bukan
> `if (shopee)`.

---

## 3. Peta kekurangan → desain (data-driven, kode minimal)

### G1 — Pull ber-signature  *(fondasi; blokir G2)*

**Masalah.** `ReverseChannelFetchService.fetchItem` hanya menambah `header(headerName, token)`. Shopee butuh
query ber-HMAC — tak bisa via header bearer biasa.

**Desain.**
1. Tambah field **`signatureScheme`** (String, opsional) ke `ReverseSyncConfig` — nilai = nama
   `SignatureScheme` (`HMAC_CONCAT_FIXED`). Kosong/`NONE` → perilaku bearer lama (Shopify tak berubah).
2. Di `ReverseChannelFetchService`: bila `signatureScheme` di-set → bangun URL dengan
   `UriComponentsBuilder`, tambahkan query params dari `credentialMapping` (`partner_id/shop_id/access_token`)
   + `timestamp`, lalu panggil `RequestSignerRegistry.get(scheme).sign(uriBuilder, path, channelType, creds, spec)`
   (persis pola `GenericCategoryService`). `spec` = `SignatureSpec(signingCredentialKey=partnerId,
   timestampParam=timestamp, signParam=sign, secretCredentialKey=<partner_key resolve>)`.
   **Nol kode signing baru** — pakai registry yang ada.

**Kenapa aman:** signer sudah teruji di jalur category; reverse tinggal memanggilnya.

### G2 — Pull multi-endpoint + merge

**Masalah.** Reverse Shopee butuh `response.item_list[0]` (dari `get_item_base_info`) **dan**
`response.tier_variation`+`response.model` (dari `get_model_list`) dalam **satu** payload. `fetchItem`
sekarang GET tunggal.

**Desain (data-driven).**
1. **`readEndpoints[]`** = satu-satunya sumber baca-item (`{urlTemplate, authMode, queryParams}`, placeholder
   `{storeUrl}`/`{channelProductId}`/`{apiVersion}`). Pull memanggil semua entry (BEARER/SIGNED per `authMode`) dan
   **deep-merge** respons menjadi satu payload. Satu entry = GET tunggal (Shopify); N entry = item terbelah (Shopee).
2. Merge aman karena kunci tak bertumbukan: `response.item_list` (base) vs `response.tier_variation`/`model`
   (model list) → satu objek `response` gabungan → `REBASE_ITEM` + `VARIANT_INVERSE` menemukan path-nya
   apa adanya (tak perlu ubah `operations`).

**Seed Shopee:**
```
readEndpoints = [
  { urlTemplate: ".../api/{apiVersion}/product/get_item_base_info",
    queryParams: { item_id_list: "{channelProductId}", need_tier_variation: "true" } },
  { urlTemplate: ".../api/{apiVersion}/product/get_model_list",
    queryParams: { item_id: "{channelProductId}" } }
]
```
`update_time` (get_item_base_info) → sumber `channelUpdatedAt` untuk echo-dedup.

**Alternatif ditolak:** menaruh `need_tier_variation`+model dalam satu `get_item_base_info` — Shopee tetap
memisah price/stock per-model ke `get_model_list`; jadi 2 panggilan tak terhindarkan untuk reconcile penuh.

### G3 — Webhook Shopee = pemicu, bukan pembawa payload

**Masalah tiga lapis.**
1. **Signature push.** `WebhookService.verifySignature` tak punya cabang Shopee. Shopee push menandatangani
   dengan `Authorization: HMAC-SHA256(callbackUrl + rawBody, partner_key)` (hex). *(Formula persis WAJIB
   dikonfirmasi dari sample — lihat §6 Blocker.)*
2. **Discriminator.** Push ke **satu** URL; jenis ada di `body.code` (numerik), bukan path `{event}`.
3. **Payload tipis.** Body hanya `item_id` → tak ada isi untuk di-de-derive; harus **PULL** (G1+G2) dulu.

**Desain (data-driven, generik).**
- Registrasi callback: `POST /api/v1/webhooks/shopee/push` (path `event="push"`).
- Tambah **`eventCodePath`** (mis. `code`) + isi **`productEventTopics`** dengan **nilai code** item-update
  (mis. `["4"]` — *butuh konfirmasi code mana*). `ReverseWebhookService.isProductEvent`: bila `eventCodePath`
  di-set → cocokkan `getByPath(body, eventCodePath)` ke `productEventTopics` (bukan path `event`). Shopify tetap
  cocok via path (eventCodePath kosong).
- Tambah **`webhookMode`** (`PAYLOAD` default | `TRIGGER_PULL`). Untuk `TRIGGER_PULL`: baca `item_id` di
  `productIdPath` + `shop_id`, resolve store (`ChannelStoreConnectionRepository.findByChannelTypeAndShopId`
  atau match by credential `shopId`), lalu **panggil jalur pull G1+G2** → payload lengkap → pipeline `ingest`
  yang sama. Shopify tetap `PAYLOAD` (body = payload).
- Shopee push signature ditambah sebagai cabang di `verifySignature` (reuse `hmacSha256Hex`), digerbangi
  oleh config (mis. `signatureScheme` di reverse config dibaca WebhookService), tetap generik.

**Anti-loop:** tak berubah — `isEcho` pakai `update_time` hasil pull; reverse tetap hanya tulis draft/Step-2.

### G4 — Images (main/gallery dulu; variation images ditunda)

**Masalah.** Belum ada `IMAGE_INVERSE` untuk Shopee. Item Shopee menyimpan gambar sebagai `image.image_id_list`
**tetapi** `get_item_base_info` juga memuat **`image.image_url_list`** (URL siap pakai) → tak perlu media API
untuk main/gallery.

**Desain / as-built (2026-08-31, TERIMPLEMENTASI).**
- Seed `IMAGE_INVERSE`: `imagesPath: image.image_url_list`, `mainImageField: mainImage`,
  `galleryImagesField: galleryImages` — **tanpa** `imageUrlField` (elemen = string URL polos → `extractImageUrl`)
  & `imageIdField` (id ada di `image_id_list` terpisah) & field variant (variation image = S5). URL pertama →
  `mainImage`, sisanya → `galleryImages`.
- **Item-relative, bukan raw** (koreksi konvensi): `IMAGE_INVERSE` kini dibaca dari **item hasil REBASE_ITEM**
  (bukan payload mentah). Alasan: `image.image_url_list` Shopee **di dalam** item (`response.item_list[0]`), dan
  setelah rebase ia de-derive ke path `image.image_url_list` — jadi `imagesPath` item-relative **cocok** dg
  `channelPath`, sehingga `flagImageDrift` benar-benar membuang blob dari bucket-b. `item == payload` bila channel
  tak punya REBASE_ITEM → **Shopify tak berubah**. (Kontras `VARIANT_INVERSE` yang tetap raw: `response.model`
  ada di LUAR item.) Diubah di 3 call-site (`ReverseApplyService`, `ReverseWebhookService`, `ReverseImportService`),
  semua no-op utk Shopify.
- **Reconcile** (use case A): gambar master-authoritative → `flagImageDrift` buang `image.image_url_list` dari
  channelData + lampirkan `imageDrift` read-only (`image_id_list`/`image_ratio` tetap = genuine channel-only,
  tak merusak re-push krn forward isi ulang via media upload). **Import** (B): tulis `mainImage`+`galleryImages` ke
  master baru.
- Uji: `ReverseImageInverseServiceTest` +2 (Shopee URL-string list + drift hanya buang `image_url_list`); 136 hijau.
- **Variation images (`tier_variation[0].option_list[].image = {image_id}`)** → **ditunda ke S5**: hanya `image_id`,
  butuh resolve `image_id → URL` (`RESOLVE_MEDIA`, sudah jadi kontrak — [`05`](05-config-source-of-truth.md) §7a).
  Simetris dg forward guide 36. Bukan blocker reconcile harga/stok.

### G5 — Import (greenfield: produk hanya-di-Shopee → master baru)

**Masalah.** `categoryPath`, `itemStatusPath`, `liveStatusValues`, dan list endpoint belum di-seed untuk
Shopee (Shopify sudah). Tanpa ini, use case B ([`06`](06-import-channel-native.md)) tak jalan untuk Shopee.

> **Catatan:** import **detail-fetch** (get_item_base_info + get_model_list) sudah lewat jalur S1 (`fetchItem`
> unified). Jadi G5 = seed config + transport-share untuk **browse-list** saja; classify/map/dedup tak berubah.
> `categoryPath`/`itemStatusPath` dibaca dari **item hasil REBASE_ITEM** (`getByPath(item,…)`) → cukup seed,
> `channelCategoryExternalId` menerima int `category_id` apa adanya (`String.valueOf`).

**Desain (seed config, reuse penuh) — TERIMPLEMENTASI.**
- `itemStatusPath: item_status` (Shopee `NORMAL`/`BANNED`/…) + `liveStatusValues: ["NORMAL"]` →
  active→`PUBLISHED`, else→`READY` (linkage tetap → publish jadi UPDATE, bukan duplikat).
- Kategori: `categoryPath: category_id`; resolve `productTypeId` via `product_types.channelCategoryDefaults`
  {channelType:shopee, categoryId} — **sumber sama dengan Step 2** (nol koleksi baru). Bila item tak memuat
  kategori, `categoryFetch` tak relevan (Shopee REST memuat `category_id`; tak perlu GraphQL seperti Shopify).
- List/browse **as-built (S4)**: field root `itemListUrlTemplate` **dihapus**, diganti **`listEndpoint`** ber-tipe
  `ReadEndpoint` (**tunggal** — list selalu 1 endpoint) dg `authMode`. Parsing (`itemsPath`/`listItemId/Title/Status`)
  tetap list-specific. Shopee `listEndpoint = get_item_list` (`authMode:SIGNED`, `offset`+`page_size`+`item_status:NORMAL`),
  `itemsPath: response.item`, `listItemIdPath: item_id`, `listItemStatusPath: item_status` (tanpa title).

### 4c. Import → Step-2 category PRE-FILL (2026-08-31, GENERIC — semua channel)

**Gejala:** setelah import Shopee, Step 2 masih meminta pilih kategori — padahal kategori (`300061`) ada di item.
**Akar:** import mengekstrak kategori (dipakai `resolveCategory`) tapi menaruhnya di **`master.category_id`** (bucket-a,
karena `attributeMappings` memetakan `category_id`→attrId), **bukan** ke `channelProductData.channelCategoryId` /
`channelData[<CATEGORY_TREE fieldName>]` yang dibaca Step 2 (render dari `channelData[fieldName]`, "committed" bila
`channelCategoryId`≠null). `linkRow` tak pernah menyetel keduanya → Step 2 kosong.
**Fix (di `ReverseImportService`):** resolve nama field CATEGORY_TREE **data-driven** via
`ChannelProductDataService.resolveCategoryTreeFieldName(channelType)` (shopee→`shopee_category_id`,
shopify→`shopify_taxonomy_category_id`, dst — dari `ecommerce_master_attributes`, **nol literal**), lalu:
(1) `channelData.putIfAbsent(categoryTreeField, catRes.channelCategoryId)` → Step 2 render + committed; (2) `linkRow`
menyetel `row.channelCategoryId` (kunci kanonik publish-gate) bila kosong. Nilai = representasi channel apa adanya
(Shopee id `300061` / Shopify GID) = **sama dengan yang forward simpan**, jadi re-publish round-trip.
**Shopify: bukan konflik, malah lebih baik** — field-nya `shopify_taxonomy_category_id`, nilainya GID taxonomy;
`categoryFetch` (GraphQL) sudah mengisi `product.category` sebelum classify, jadi `catRes.channelCategoryId`=GID →
Step-2 Shopify ikut pre-fill. Item tanpa kategori → `catRes` null → no-op (tak ada regresi). 144 tes hijau.
*(Sisa/di luar cakupan: `category_id` masih ikut nyangkut di master — nilai channel-specific; tak merusak
re-publish krn nilainya sama; pembersihan klasifikasi kategori→channel-only adalah follow-up.)*

### 4b. Keputusan (2026-08-31): list ≠ baca-item — transport DIBAGI, operasi TETAP terpisah (as-built S4)

`readEndpoints[]` (baca SATU item, bisa multi-endpoint→merge, di-consume `operations[]`) dan browse-list (ambil
BANYAK ringkasan, 1 endpoint, di-parse `itemsPath`+`listItemId/Title/Status`) adalah **dua operasi berbeda** →
**tidak digabung** (menggabung = mengulang kesalahan SoC). Yang di-share hanya **primitif transport**. Implementasi:
- `ReverseChannelFetchService` mengekspos **transport bersama**: `ReadAuth` + `buildReadAuth(cfg,rc,channel,creds)`
  (resolve bearer/signed sekali) + `executeReadEndpoint(ep, channel, storeUrl, subs, auth, logTag)` (BEARER/SIGNED
  → `Map`). Substitusi digeneralisasi jadi subs-map (`substituteUrl`/`substitute`/`resolveQp(tmpl,subs,creds)`),
  jadi placeholder item-fetch (`{channelProductId}`) & list (`{limit}`/`{offset}`) lewat satu jalur.
- `fetchEndpoints` (item) & `ReverseChannelListService` (browse) sama-sama memanggil `executeReadEndpoint` — **nol
  duplikasi** signing/auth. `ReverseChannelListService` tak lagi punya WebClient/objectMapper sendiri; ia inject
  `ReverseChannelFetchService`. `extractListItems` (parsing) tetap di list service.
- Shopify `itemListUrlTemplate` dimigrasi ke `listEndpoint` BEARER (perilaku identik). Test lama `buildListUrl`
  dihapus (method hilang); +2 test transport bersama (`substituteUrl`, `resolveQp` map-based limit/offset).

### 4d. Import variant axis-name CANONICALIZATION (2026-08-31, GENERIC — semua channel)

**Gejala:** setelah import (productType belum resolve → merchant pilih manual di Step 1), **variant options di Step 1
kosong** — seolah create baru — padahal master hasil import punya `options`/`variants`.
**Akar:** `VARIANT_INVERSE` menamai axis dari nama dimensi channel = **"Size"/"Color"** (casing tier_variation Shopee),
sedangkan produk normal + Step-1 schema (`variantDimensions`) + `MasterAttributeSchemaService.isVariantField`
(**case-sensitive** `Set.contains`) memakai canonical **lowercase** "size"/"color" (dari `ecommerce_master_attributes`
group=VARIANT). Jadi keys import tak match → editor tak bisa memetakan → kosong (dan tanpa productType, axis tak
tersintesis karena `isVariantField("Size")`=false).
**Fix (di `ReverseVariantInverseService` + import):** overload `invert(descriptor, payload, axisNameNormalizer)` +
helper `canonicalAxisNormalizer(vocab)` — memetakan nama axis channel ke fieldName variant canonical secara
**case-insensitive** (data-driven: vocab dari `getVariantFieldNames()`, nol literal); tak match → biarkan apa adanya
(tak menebak). Import memanggilnya → master hasil import ber-key `size`/`color` = **identik dg produk normal** →
Step-1 memetakan + memuat variant matrix. Overload 2-arg lama tetap identity (back-compat; reconcile/apply tak
berubah). 146 tes hijau (2 baru).
**Generic — semua channel:** vocab global lintas-channel; channel manapun yg nama axis reverse-nya beda casing dari
canonical ikut ternormalisasi. Axis yg memang bukan variant field canonical (mis. atribut kustom) dibiarkan.
*(Follow-up: terapkan normalizer yang sama di jalur reconcile webhook/apply bila diperlukan konsistensi keys pada
produk yg sudah ter-link.)*

### 4e. Step-1 variant editor RESET saat pilih productType — DUA bug (2026-08-31)

**Gejala:** setelah import, buka Step 1 → variant options **ter-populate** (dari master), lalu saat **productType
dipilih**, variant options **ter-RESET** ke kosong.

**Bug #1 — BFF data-loss (variants terhapus di DB).** `PUT /api/v1/admin/master-products/{id}` (dipanggil saat
menyimpan) memakai semantik **PUT penuh, bukan PATCH**: controller mengubah `variants`/`options` yang **absent** di
body jadi `List.of()`, lalu `MasterProductDataService.update` **menimpa tanpa syarat**. Save parsial yang cuma
membawa `{productTypeId}` **menghapus variants+options**.
**Fix (murni BFF, nol perubahan FE):** partial-update — controller: key absent ⟹ `null` (bukan `[]`); `update`:
`if (variants != null) setVariants(...)` (null = preserve, list = replace eksplisit). Pemanggil lain (import
re-sync, image re-host) sudah meneruskan non-null → tak terpengaruh.

**Perluasan yang sama untuk GAMBAR produk** (commit `c2b6b62`). `update()` melakukan `setProductAttributes(attrs)`
**menimpa total** — jadi edit yang tak menyertakan key gambar (`mainImage`/`galleryImages`/`images`) **menghapus**
gambar dari master. Gejalanya baru muncul saat **publish** produk impor yang di-edit: `_sourceImages` kosong →
media_pre upload 0 gambar → atribut `image` jadi `{}` → sync gagal (lihat §4g). Fix: di `update()`, key gambar yang
**absent** ⟹ preserve nilai tersimpan; key **ada** (walau `[]`) ⟹ replace (hapus disengaja tetap dihormati). Simetris
dg aturan variants/options di atas dan `PublishPayloadStagingService.ensureProductImages`; channel-agnostik (Shopify pun ikut
terlindungi). Uji `MasterProductUpdatePreserveImagesTest`. Dua pemanggil lain kirim key gambar → tak terpengaruh.

**Bug #2 — FE state-wipe (reset visual, penyebab "sama saja").** Repo FE
`free-nextjs-admin-dashboard` → `VariantConfigurator.tsx`: efek "reset saat kategori berubah" memanggil
`setVariants([])`. Kuncinya: **field "category" itu nilainya `productTypeId`** (`CategorySelectField` — backend field
masih bernama "category" tapi value = productTypeId). Produk import punya productType **UNSET** → `formData.category`
kosong → variants ter-load via prop `value`; saat merchant pilih productType, `formData.category` berubah → efek
memicu `setVariants([])` → editor kosong (walau DB utuh setelah Bug #1 diperbaiki).
**Fix (FE):** wipe itu **konvensi create-baru** (kategori fresh jangan mewarisi variant kategori lama), **salah untuk
EDIT**. Tambah prop **`isEditMode`** (dari `mode === 'edit'`, di-thread ProductCreateForm → VariantsSection →
VariantConfigurator): di edit mode efek **tak pernah** wipe → variants bertahan lintas ganti productType, termasuk
**A→B→A** (percobaan pertama yang cuma menahan assignment-pertama gagal di kasus A→B→A). Create-baru tak berubah:
pick pertama tak ada yg di-wipe; switch nyata antar-type tetap reset (ditunda sampai dimensi baru load).

**Catatan:** percobaan awal "BFF form-schema master-aware" (`prefilledVariants`) **di-revert** — salah diagnosis; FE
mendapat variants via prop `value` (GET master), bukan dari skema, jadi prefill itu dead-code. Dua fix di atas
(BFF partial-update + FE state-wipe) yang benar.

### 4f. Perilaku edit selaras industri: ganti productType → PRESERVE + WARN (bukan reset/lock)

**Prinsip (Shopify/Amazon/Shopee/Ginee/ChannelAdvisor):** kategori/productType = **metadata klasifikasi + pemetaan
channel**, bukan pemilik struktur varian. **SKU/axes milik PRODUK** → dipertahankan lintas ganti kategori. Ketidak-
cocokan axis = urusan **validasi/peringatan saat publish**, bukan pemicu hapus data. Hard-lock kategori hanya norma
marketplace-native (Amazon kunci variation-theme setelah listing live), **bukan** hub omnichannel.
**Tiga lapisan saat Apparel(Size/Color) → Audio-Device:** (1) **axes+SKU** → PERTAHANKAN (fix `isEditMode`); (2)
**atribut produk** (Material vs Connectivity) → memang beda per productType (form ganti field; nilai lama orphan); (3)
**validitas axis** → PRESERVE + WARN.
**Implementasi #2 (FE, `VariantConfigurator`):** hitung `orphanAxes` = axis yang dipakai SKU existing tapi **tak
dideklarasikan** productType terpilih (`productTypeDimensions`, case-insensitive; menangani juga productType tanpa
dimensi). Tampilkan **banner peringatan produksi** (`data-testid="orphan-axis-warning"`): "SKU memakai [Size] yang tak
dikenal product type [Audio-Device]; data tetap disimpan — sesuaikan/ganti type/hapus." Nol hapus, nol lock — merchant
yang memutuskan. Selaras dg mesin `AxisValidationIssue.NOT_EXPRESSIBLE_ON_CHANNEL` yang sudah ada di Step-2 (BFF).

### 4g. Re-push produk ter-import (edit → publish UPDATE): rantai perbaikan sync (2026-09-01)

Uji live "import → edit → publish UPDATE" mengungkap **empat** ganjalan berurutan (tiap fix menggeser error ke lapis
berikut). Semua data-driven; nol literal channel di runtime.

1. **Crash opaque `readValue("")`** (SYNC `63abbbd`). Saat media_pre upload 0 gambar (gambar produk impor masih
   channel-origin → di-drop guard `guardNonPlatformImages` sampai re-host selesai; `app.publish.skip-nonplatform-images`
   default true; `ImageRehostReconciler` @Scheduled initialDelay 60s), atribut `image` (type `object`) jadi `""` →
   `Utils.typeConverter` → `objectMapper.readValue("")` → **"No content to map due to end-of-input"** → HTTP 400
   menjatuhkan SELURUH request. Fix: `typeConverter` untuk `object`/`object[]`/`string[]` dg value blank ⟹ container
   kosong (`{}`/`[]`), bukan crash.

2. **Shopee tolak `image={}`** (SYNC `22911bd`). Setelah #1, `image={}` sampai ke `update_item` → Shopee:
   `invalid Image.ImageIdList: ImageIdList is required`. Fix: pada **UPDATE**, field terstruktur yang kosong
   (`{}`/`[]`/blank object/array) **di-OMIT** dari body → channel mempertahankan nilai lamanya (Shopify pun aman:
   `images:[]` = "hapus semua"). CREATE tak tersentuh; `CreateChannelProductCommand.isUpdate()` men-scope-nya.

3. **`add_model` bentrok tier_index** (BFF `b3e4f32`, lihat "Model-id baseline saat import" di atas). Model impor
   `model_id`-nya kosong → diff kira BARU → `add_model` bentrok. Fix: capture `model_sku→model_id` saat import.

4. **Gambar varian tak ter-update walau tak error** (SYNC `fd920e8`, lihat guide 36). Langkah `update_tier_variation`
   (satu-satunya yang menyebar gambar varian ke opsi tier-pertama) ter-SKIP "no existing variants to re-tier" karena
   workflow meneruskan `cmd` hasil filter add-step (bucket model-baru = kosong). Fix: tier step baca **snapshot
   pra-diff** (diambil tepat setelah `variants_media_pre` isi `skus.image`), bukan `cmd` yang sudah terfilter.

**Prasyarat #1 (gambar produk utama, non-varian):** karena guard men-drop gambar channel-origin sampai re-host GCS
selesai (~60s+), push produk impor **dalam <60s** akan mengirim `image={}` → dengan fix #1+#2 kini **aman** (di-omit,
gambar lama Shopee dipertahankan); setelah re-host selesai, gambar platform ikut ter-push normal.

### G6 — SKU-match untuk listing belum ter-link  *(shared, R4.1) — TERIMPLEMENTASI (S5)*

Item yang dipull TANPA linkage `channelProductId` (di-publish/edit di luar sistem) kini bisa **auto-link** ke
master lewat SKU/barcode, **deterministik** — pakai ulang matcher import dedup (`ReverseImportDedup`), nol logika
baru.

- **`ReverseSkuMatchService.autoLinkMaster(channel, apiVersion, payload, orgId)`** (+ pure static
  `autoLinkFromVariants(variantMaps, candidates)`): invert varian (`VARIANT_INVERSE`) → identity dari
  **variant SKU + barcode** (kunci STRONG lintas-channel; nama WEAK & Shopee tak punya product-SKU, jadi keduanya
  tak dipakai untuk auto-link) → `match` vs master org → `autoLinkTarget(enabled=true)`: **hanya** tepat SATU
  STRONG match → link; 0 / ≥2 (ambigu) → tetap unlinked (guardrail "tak pernah menebak").
- **Wiring:** `ReverseSyncPullController.resolveMasterId` kini berurutan: supplied → linkage (channelProductId)
  → **G6 SKU-match** → "". Berlaku utk `/pull` (preview: master mana yang akan direkonsiliasi) & `/pull/apply`
  (mengaktifkan tulis). Kandidat = master org (sama seperti import dedup) — untuk org besar, indeks by
  variant-sku adalah follow-up scale.
- **Webhook (S2):** jalur webhook Shopee (thin push) masih tertunda; saat dibangun, resolusi master yang sama
  bisa dipakai (butuh orgId dari store).
- Uji: `ReverseSkuMatchServiceTest` (5) — one-strong link, ambigu→skip, no-match, no-keys/no-candidate,
  case-insensitive.

### Variation-image reverse — TERIMPLEMENTASI (2026-09-01, sample terverifikasi)

Gambar variasi Shopee ada di `tier_variation[0].option_list[].image` — dan `get_model_list` nyata **mengembalikan
`image_url` INLINE** (bukan hanya `image_id`), jadi **tak perlu `RESOLVE_MEDIA`**. Dibalikkan lewat mode **tier-option**
di `IMAGE_INVERSE` (kebalikan persis dari scatter forward guide 36):

1. **Gather** `optionIndex → URL` dari tier pembawa-gambar
   (`variantDimensionsPath[variantImageTierPos].variantOptionListField[].variantOptionImagePath`).
2. **Scatter** ke tiap model per `variantModelAxisIndexField[variantImageTierPos]` (mis. `tier_index[0]`), di-key
   dengan `variantModelSkuField` (`model_sku`) → cocok dengan master variant `sku` (hasil `VARIANT_INVERSE`).

Path-nya **RESPONSE-relative** (`response.tier_variation`/`response.model` di LUAR item, seperti VARIANT_INVERSE) →
di-resolve dari payload penuh via `ReverseImageInverseService.invertVariantOptionImages` (bukan `invert` yang
item-relative). Import menggabung dua sumber (Shopify ref item-relative + Shopee tier-option response-relative) lalu
menempel URL ke `variantGroups[*].variantImages`. Nol literal Shopee di runtime — semua field = data di seed. Uji:
`ReverseImageInverseServiceTest` +3 (tier-option scatter pakai sampel `get_model_list` nyata, no-image, no-op).
Simetris forward guide 36. **Sisa (follow-up):** baseline re-push untuk gambar variasi Shopee (agar UPDATE
ter-import tak selalu re-upload) — sejajar dg keterbatasan "no dirty-detection" forward guide 36.

### Model-id baseline saat import — TERIMPLEMENTASI (2026-09-01)

**Masalah (uji live).** Produk varian ter-import, di-push ulang → `update_item` sukses, tapi `add_model` gagal:
`Model tier_index error : model in position [0 0]/[1 0]`. Sebabnya tiap `skus.model_id` **kosong** di payload →
`VariantModelIdInjector` (mode `PER_MODEL_BUCKETS`) tak bisa mengisi id → diff menganggap semua model **BARU** →
`add_model` bentrok tier_index dg model yg sudah ada (update_price/update_stock ter-SKIP "no existing variants").

**Akar.** `variantChannelIdsFrom` hanya menangani gaya Shopify (`variantsPath` item-relative). Model Shopee ada di
`response.model` (RESPONSE-relative, di LUAR item), id = `model_id` ber-key `model_sku` — tak tertangkap → listing
`variantChannelIds` kosong → tak ada baseline model-id.

**Fix (data-driven, nol literal).** Op `IMAGE_INVERSE` mode tier-option dapat field `variantModelIdField` (`model_id`);
`ReverseImportService.variantModelIdsFrom(payload, d)` baca `response.model` dari payload PENUH → `{model_sku→model_id}`
→ di-`putAll` ke `variantChannelIds` yg disimpan di linkage row. Saat re-push UPDATE, injector mengisi tiap
`skus.model_id` → model masuk bucket UPDATE (update_price/stock/tier), `add_model` di-skip. No-op untuk Shopify (field
tier-option tak diset). Uji: `ImageRehostTest` +2 (`variantModelIds_fromShopeeModelArray` pakai `model_id` uint64 nyata,
no-op Shopify/null-safe). Lihat [[shopee-publish-pipeline-complete]] (model_id capture→UPDATE reconcile, guide 33).

---

## 4. Fase implementasi (tiap fase = slice teruji, aditif)

| Fase | Judul | Isi | Uji sukses | Bergantung |
|---|---|---|---|---|
| **S0** | *(SUDAH)* transform | REBASE_ITEM+ATTRIBUTE_LIST+VARIANT_INVERSE seeded & verified; `/apply` manual | payload nyata → master+channelData+variantOverrides benar | — |
| **S1** ✅ | **Signed multi-pull (reconcile)** — **TERIMPLEMENTASI** | G1+G2 (lihat §4a) + seed Shopee pull recipe | 134 tes reversesync hijau; tinggal uji live | store terkoneksi |
| **S2** | **Webhook trigger→pull** | G3 (push signature + `eventCodePath` + `webhookMode:TRIGGER_PULL`) | push sandbox → verify → pull → ingest; echo-suppress publish sendiri | S1 + **sample push (blocker)** |
| **S3** ✅ | **Images (main/gallery)** — **TERIMPLEMENTASI** | G4 `IMAGE_INVERSE` dari `image.image_url_list` (item-relative); reconcile=drift, import=master | 136 tes hijau (2 baru Shopee) | S0 (transform); dipakai S1 pull |
| **S4** ✅ | **Import greenfield** — **TERIMPLEMENTASI** | G5 category/status + **list transport-share** (`listEndpoint` ber-`authMode`, primitif signed-read S1 dibagi) + seed Shopee `get_item_list` | 137 tes hijau; tinggal uji live | S1 |
| **S5** ✅ | **SKU-match (G6) + variation-image reverse — TERIMPLEMENTASI** | G6 SKU/barcode auto-link pull; **variation images** via `IMAGE_INVERSE` mode tier-option (`image_url` inline vs `get_model_list` nyata → tanpa `RESOLVE_MEDIA`) | 145 tes hijau (5 G6 + 3 tier-option) | S1–S4 |

Urutan wajib: **S1 lebih dulu** (pull ber-signature adalah fondasi; S2 webhook memanggilnya).

### 4a. S1 — as-built (2026-08-31)

**Generik (dipakai ulang TikTok/Lazada), nol literal Shopee di runtime:**
- **`readEndpoints[]` = SATU-SATUNYA sumber baca-item** (field lama `itemUrlTemplate` **dihapus** — satu GET
  cukup jadi list 1-entry; menghilangkan dua-bentuk-satu-konsep, sesuai etos SoT doc 05 §2a). Tiap `ReadEndpoint`
  **self-describing**: `{urlTemplate, authMode, queryParams}`, `authMode ∈ BEARER|SIGNED` (null ⟹ BEARER).
- `ReverseSyncConfig` + field: `signatureScheme`, `signingExtraKeys`, `readEndpoints[]`.
- `ReverseChannelFetchService.fetchEndpoints` — **satu loop** untuk semua channel: tiap endpoint di-auth sesuai
  `authMode` (BEARER = header dari `authentication`; SIGNED = query + tanda-tangan lewat `RequestSignerRegistry`,
  signer golden-vector yang sama dg forward/category — nol kode signing baru; id-key =
  `integrationConfig.publishHmacSigningCredentialKey`, secret = `OAuthAppConfig.clientSecret`), lalu `deepMerge`
  respons → satu payload (1 entry = passthrough; N = merge). `queryParams` value support
  `{channelProductId}`/`{apiVersion}`/`{cred:<key>}`/literal (`resolveQp`).
- **Shopify dimigrasi** ke `readEndpoints=[{…products/{id}.json, authMode:BEARER}]` (perilaku identik).
- `ReverseSyncPullController.pullPreview` kini rebase (`extractItem`+`enrich`) sebelum classify — konsisten dg
  `/pull/apply` & webhook (dulu preview tak rebase → Shopee tampak salah).

**Seed Shopee** (`createShopeeConfiguration`): `signatureScheme="HMAC_CONCAT_FIXED"`,
`signingExtraKeys=["accessToken","shopId"]`, `readEndpoints=[get_item_base_info, get_model_list]`,
`updatedAtPath=response.item_list[0].update_time` (EPOCH_SECONDS, utk S2).

**Uji live (butuh store Shopee terkoneksi):**
```
POST /api/v1/channels/reverse/pull        { "storeId","channelProductId"[, "organizationId","masterProductId"] }   # preview
POST /api/v1/channels/reverse/pull/apply  { … }                                                                    # tulis Step-2
```
Cek log: dua `ReverseSync R4-pull (signed): GET …get_item_base_info…` & `…get_model_list…` → 200 → preview memuat
`item_name`/harga/stok/attribute_list + variant per-SKU. `/pull/apply` menulis `channelData`+`variantOverrides`
per-store (master global tetap tak tersentuh; arah kebenaran via `reverseWritePolicy`).

---

## 5. Perubahan kode (ringkas) & yang TIDAK berubah

**Berubah (aditif, generik — bukan literal Shopee):**

| Tempat | Tambahan |
|---|---|
| `ChannelConfiguration.ReverseSyncConfig` | `signatureScheme`, `readEndpoints[] {urlTemplate, queryParams}`, `eventCodePath`, `webhookMode` |
| `ReverseChannelFetchService` | bila `signatureScheme`≠null → sign via `RequestSignerRegistry`; bila `readEndpoints`≠null → multi-GET + deep-merge `response` |
| `ReverseWebhookService` | `isProductEvent` baca `eventCodePath` bila ada; `webhookMode=TRIGGER_PULL` → resolve store by shop_id + panggil `ReverseChannelFetchService` lalu `ingest` |
| `WebhookService` (`channel/store`) | cabang verify signature Shopee push (config-gated, reuse `hmacSha256Hex`) |
| `ChannelConfigurationDataLoader.createShopeeConfiguration` | seed `signatureScheme`, `readEndpoints`, webhook fields, `IMAGE_INVERSE`, category/status (per fase) |
| `ChannelStoreConnectionRepository` | (bila perlu) `findByChannelTypeAndShopId` untuk resolve store dari push |

**Tak berubah (guardrail terkunci):** forward publish, Temporal sync worker, `apiSchema` (spec-of-record),
engine forward, master global (hanya `ReverseReviewService.accept` yang menulisnya). Semua field baru
**opsional** → channel lain tak terpengaruh (Shopify tetap bearer + `PAYLOAD` webhook).

---

## 6. Blocker & sample yang dibutuhkan (harus dikonfirmasi sebelum S2)

1. **Envelope push Shopee nyata** — struktur `{shop_id, code, timestamp, data}` + **`code` mana** yang berarti
   item create/update (isi `productEventTopics`) + di mana `item_id` (`productIdPath`). Doc 05 §7a: "belum ada
   sample terverifikasi".
2. **Formula signature push** — apakah `HMAC-SHA256(callbackUrl + rawBody, partner_key)` hex, dan header persis
   (`Authorization`). Salah formula → semua push 401.
3. **Region host** — sandbox `openplatform.sandbox.test-stable.shopee.sg` vs prod `partner.shopeemobile.com`;
   pull `readEndpoints.urlTemplate` harus konsisten dengan store region (sudah ada `metadata.apiVersion=v2`).
4. **Rate limit read** — Shopee membatasi get_item_base_info/get_model_list; `ReverseHttp.resilient` menangani
   429, tapi webhook-storm (banyak SKU) perlu debounce (opsional, follow-up).
5. **(S5) Tier-option image shape** — ✅ **TERJAWAB**: `get_model_list` nyata mengembalikan
   `tier_variation[0].option_list[].image.image_url` INLINE (bukan hanya `image_id`), jadi variation-image reverse
   diimplementasi lewat mode tier-option `IMAGE_INVERSE` **tanpa** `RESOLVE_MEDIA`. Tak ada lagi blocker di sini.

S1 (pull manual), S3 (images main/gallery), S4 (import/browse), S5 (SKU-match + variation images) **tidak** terblokir —
bisa diuji sekarang dg store sandbox. Yang masih menunggu sample: **S2** (webhook push) saja.

---

## 7. Checklist "tambah channel" (05 §9) — status Shopee

1. `channel_field_mappings` — ✅ ada (dipakai forward; reverse membaca terbalik injektif).
2. `channel_field_value_mappings` — ✅ ada (material/color di-seed `ChannelValueMappingDataLoader`).
3. `reverseSyncConfig.operations[]` — ✅ REBASE_ITEM/ATTRIBUTE_LIST/VARIANT_INVERSE (verified). ⏳ IMAGE_INVERSE (S3).
4. `reverseSyncConfig` transport — ⏳ `signatureScheme`+`readEndpoints` (S1), webhook fields (S2),
   category/status/list (S4). *(butuh field baru di framework, generik.)*
5. `ecommerce_master_attributes.reverseWritePolicy` — ✅ seeded `ReverseWritePolicyMigration` (@Order 165);
   set per-field yang mau diaktifkan (harga/stok CHANNEL_AUTHORITATIVE atau DRAFT_REVIEW).
6. `integrationConfig.authentication` — ✅ ada (accessToken/shopId/partnerId ter-map); reverse pull memakainya + partner_key.

**Kesimpulan:** Shopee **~60% siap** (seluruh transform + auth config). Sisanya = kapabilitas transport generik
(signed pull, multi-fetch, thin-webhook) + seed — bukan penulisan ulang engine.

## 8. Terkait
[`05`](05-config-source-of-truth.md) (SoT & status terkunci), [`06`](06-import-channel-native.md) (import),
[`07`](07-import-image-rehosting.md) (re-host gambar), guide 36 (forward variation images — simetri media),
[[sync-service-workaction-model]], [[shopee-publish-pipeline-complete]].
