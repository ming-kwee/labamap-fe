# 06 — Import Channel-Native (Use Case B): produk yang belum ada di My Products

> **TERIMPLEMENTASI (inti), BFF-only, aditif.** Melengkapi `01`–`05`. Dokumen ini merekam **use case KEDUA**
> reverse sync — meng-**import** produk yang **hanya ada di channel** (dibuat langsung di Shopee/Shopify),
> menjadi **master product BARU**. Berbeda dari reconcile (`05`), yang menyegarkan produk yang **sudah** ter-link.

---

## 1. Dua use case reverse sync (koreksi framing penting)

| | **A. Reconcile** (`05`) | **B. Import** (dokumen ini) |
|---|---|---|
| Produk asalnya | sudah di My Products **dan** sudah di-publish ke store | **hanya di channel**, belum di My Products |
| Prasyarat | linkage `channelProductId` (lahir saat publish) | **tak ada** — belum ada master/linkage |
| Entry point | produk × store (My Products) | **Store → Import Listings** |
| Target tulis | `channel_product_data` (Step-2/draft dari master yg ADA) | **CREATE `MasterProductData` BARU** (draft) + linkage |
| Endpoint | `/preview`, `/apply`, `/pull*`, `/review` | `/import/preview`, `/import` |

> **Kenapa ini penting:** tanpa B, "reverse sync" hanya bisa menyegarkan yang sudah ada — bukan benar-benar
> "menarik produk dari channel". A dan B **berbagi interpreter** (de-derive → classify → variant-inverse); yang
> berbeda hanya **target tulis** (override per-store vs create master baru).

> **Webhook hanya melayani A (reconcile).** `ReverseWebhookService` mencocokkan by linkage
> (`findByChannelTypeAndChannelProductId`) — produk **tanpa** linkage (channel-native baru) **di-skip**. Jadi
> **Import (B) adalah aksi FE**, bukan otomatis via webhook. Bahkan topik `products-create` kini efektif no-op
> (di-skip karena belum ter-link). Enhancement opsional: wire `products-create` → `ReverseImportService` untuk
> auto-import (biasanya di-gate agar tak berisik) — **belum dibangun**.

---

## 2. Alur Import (as-built)

```
(entry) Store → Import Listings
  1. dapatkan item channel:
       • supplied channelPayload  (channel apa pun, mis. Shopee — pakai payload get_item mentah)
       • ATAU fetch by channelProductId  (channel dgn pull dikonfigurasi, mis. Shopify)
  2. extractItem(itemPath) → de-derive → enrich → CLASSIFY (vs master KOSONG — tak ada diff)
  3. MAP ke bentuk create-master (ReverseImportMapper):
       • master-mapped bucket  → masterAttributes  {masterAttrId → channelValue}
       • inverted variants      → variantGroups [{…axis, …fields}] + optionGroups [{name,values}]
       • channel-only + attribute_list → channelData (untuk linkage row, BUKAN master)
  4. DEDUP (ReverseImportDedup): identity resolution lintas store/channel, deterministik & strongest-first:
       variant barcode (=UPC/EAN/GTIN) → variant SKU → product SKU → name (WEAK). Tiap master 1× di level terkuat.
       → matches[] (dgn matchType + confidence)  (kosong = aman create). Barcode = kunci cross-channel terkuat
         (produk sama di Shopify & Amazon: SKU beda, barcode sama).
  1b. (fetch, import) ENRICH kategori via GraphQL: REST products/{id}.json TAK memuat taxonomy category → bila
       reverseSyncConfig.categoryFetch ada, fetchItem(enrichCategory=true) POST GraphQL ({ product{ category{ id }}})
       lalu inject id ke item di categoryFetch.targetPath (= product.category). Best-effort (gagal → lanjut manual).
  4a. STATUS listing (linkRow): baca reverseSyncConfig.itemStatusPath (Shopify product.status) → nilai ∈ liveStatusValues
       (active) ⇒ linkage PUBLISHED (live); selain itu ⇒ READY (ADA di channel, belum live). Keduanya simpan
       channelProductId → publish jadi UPDATE (bukan CREATE duplikat). PUBLISHED juga stamp publishedAt+publishedApiVersion.
  4b. PRODUCT-TYPE dari kategori channel (resolveCategory): baca id kategori channel di reverseSyncConfig.categoryPath
       (Shopify product.category GID) → cari productType via product_types.channelCategoryDefaults {channelType, categoryId}
       (SATU sumber, sama dgn yang dibaca Step 2 → simetris), dicoba utk kandidat {GID penuh, kode telanjang last-segment}:
        • ketemu → productTypeId = id product_type itu → set master productTypeId OTOMATIS (B) → Step 2 langsung tersedia
        • tak ketemu → categoryResolution jadi SARAN (C) → user pilih Product Type di Step 1
  5a. /import/preview → kembalikan { preview, draftMaster, matches, categoryResolution, candidateSku/Name } — TANPA tulis
  5b. /import        → COMMIT:
        • masterProductId diberikan → LINK ke master itu (buat linkage row saja)
        • else + autoLinkStrongMatch=true + TEPAT 1 match STRONG → AUTO-LINK ke master itu (autoLinked=true)
        • else → CREATE master baru (status DRAFT) via MasterProductDataService.save + buat linkage row
```

**Guardrail dipertahankan:** master baru berstatus **DRAFT** (bukan langsung live); reverse tak menebak (dedup
deterministik, tak fuzzy); BFF-only; tak menyentuh forward. **Anti-duplikat (Phase 2):**
- **Auto-link opsional** (`autoLinkStrongMatch`, **default OFF**): auto-link HANYA saat tepat 1 match STRONG (barcode/
  variant-SKU/product-SKU); WEAK (nama) & ambigu (≥2 master STRONG) tak pernah auto-link → jatuh ke create/konfirmasi.
- **Unique index `{organizationId, sku}`** (partial, hanya sku non-kosong) di `master_product_data` — create master
  ber-SKU sama ditolak → **409 CONFLICT dgn body terstruktur** `ReverseImportError`
  `{code:"DUPLICATE_MASTER_SKU", message, sku, conflictingMasterId}` (`conflictingMasterId` = master PRODUCT_SKU match
  → FE bisa langsung tawarkan "link ke master itu"). Best-effort: bila data lama sudah punya SKU duplikat, index gagal
  dibuat (log warn, non-fatal) — bereskan dulu lalu restart.
- **Error body** `/import`: semua error kini punya body `ReverseImportError {code, message, sku?, conflictingMasterId?}`
  — `DUPLICATE_MASTER_SKU`/`CONFLICT` (409), `BAD_REQUEST` (400), `INTERNAL` (500, pesan generik).

---

## 2a. Re-import update-draft (perbaiki DRAFT yang salah)

`POST /import` dengan `masterProductId` + `updateExistingDraft:true` → **merge** atribut master hasil klasifikasi
BARU ke master yang sudah ada — **HANYA bila master itu DRAFT** (guardrail). Non-destruktif: key turunan-reverse
menang, key tambahan merchant tetap; **status dikunci DRAFT** (status channel "active" tak boleh mempromosikan
draft jadi live). Master non-DRAFT → **409** (pakai reconcile/draft-review, bukan overwrite). Ini menyelesaikan
repair "import lama salah" **tanpa** perlu hapus master.

```jsonc
POST /import { "storeId":"…","channelProductId":"…","masterProductId":"<draft-id>","updateExistingDraft":true }
→ 200 { "created":false, "masterProductId":"<draft-id>", "draftMaster":{…} }   // master DRAFT ter-update
```

## 3. Kontrak API

Base: `{host}/labamap/api/v1/channels/reverse/import`.

```jsonc
// POST /import/preview  &  POST /import  — body ReverseImportRequest
{ "organizationId": "org1", "storeId": "store123", "channelType": "shopee",
  "channelProductId": "803238708",         // untuk fetch (opsional bila channelPayload ada)
  "channelPayload": { /* body item channel */ },  // dipakai langsung bila ada (any channel)
  "masterProductId": null,                 // isi → LINK ke master ini; null → CREATE baru
  "newMasterProductId": null,              // opsional: id master baru dari klien (else server generate)
  "userId": "u1", "apiVersion": null }

// Response → ReverseImportResult
{ "channelType":"shopee", "storeId":"store123", "channelProductId":"803238708",
  "created": true,                          // true=create, false=link, null=preview
  "masterProductId": "uuid-baru",
  "draftMaster": {
    "masterAttributes": { "name":"test 123", "description":"…", "weight":"0.5" },
    "variantGroups": [ {"Color":"red","Size":"M","sku":"red-m","price":100000,"inventory":8}, … ],
    "optionGroups":  [ {"name":"Color","values":["red","blue"]}, {"name":"Size","values":["M","S"]} ] },
  "matches": [ {"productId":"mp-1","matchType":"VARIANT_BARCODE","confidence":"STRONG","matchedKeys":["0190001"]} ],   // dedup — tawarkan "link instead"
  // channel category → master Product Type. autoResolved=true → productTypeId sudah di-set di master (B).
  // autoResolved=false + ada channelCategoryId → SARAN: user pilih/map Product Type di Step 1 (C).
  "categoryResolution": { "channelCategoryId":"gid://…/skirts", "resolvedProductTypeId":"pt-skirt",
                          "resolvedProductTypeName":"Skirt", "autoResolved":true },
  "candidateSku":"red-m", "candidateName":"test 123",
  "channelDataWritten":["200134","200162"],
  "preview": { /* ReversePreview 3-ember */ } }
```

> **Kenapa dulu Step 2 selalu 422 "belum punya Product Type":** Step 2 (Channel Fields) dibentuk dari **Product Type
> master**, sedangkan import TAK PERNAH mengeset `productTypeId` (kategori channel ≠ Product Type platform — taksonomi
> beda). Kini `categoryPath` + `product_types.channelCategoryDefaults` menurunkannya otomatis bila ada default (B);
> bila tidak, `categoryResolution.autoResolved=false` = sinyal FE untuk mengarahkan user menetapkan Product Type di Step 1 (C).

> **Kenapa import TIDAK dianggap "publish baru" (anti-duplikat):** listing sudah ADA di channel. `linkRow` menandai
> linkage `PUBLISHED` (active) / `READY` (draft/archived) dengan `channelProductId` tetap tersimpan. `PublishOperationDecider`
> kini memutuskan CREATE-vs-UPDATE dari **eksistensi** (`channelProductId` ada & bukan `DELISTED`), bukan liveness —
> jadi import → publish = **UPDATE** listing yang ada, bukan CREATE duplikat. Liveness (`PUBLISHED`) hanya mengizinkan
> NOOP. **Baseline hash:** saat import PUBLISHED, `linkRow` men-stamp `lastPublishedContentHash` = hash konten yang
> AKAN dikirim publish (via `ChannelPublishService.computeDesiredContentHash`, transform sama persis) → publish
> **tanpa edit = NOOP** ("Up to date"), tak perlu sentuh channel. **Setelah edit (Shopify):** `update_CP` aktif
> per-channel (`integrationConfig.updateEnabled=true`) → publish = **UPDATE (push nyata)** `PUT /products/{id}.json`,
> bukan duplikat. Channel yg gate-nya belum di-set → UPDATE_BLOCKED (fail-closed). Off-switch Shopify:
> `APP_PUBLISH_SHOPIFY_UPDATE_ENABLED=false`. Stamp hash best-effort (gagal → publish pertama UPDATE, tetap aman).

`POST /import` → `201 Created` (create) / `200 OK` (link). `400` request tak valid / fetch tak dikonfigurasi.

---

## 4. Peta kode

| Kelas | Peran |
|---|---|
| `ReverseImportMapper` (pure) | preview + inverted variants → masterAttributes / variantGroups / optionGroups |
| `ReverseImportDedup` (pure) | identity resolution lintas store/channel: variant barcode/SKU → product SKU → name (weak), strongest-first, confidence → LINK vs CREATE |
| `ReverseImportService` | orkestrasi: payload → classify(no-master) → map → dedup → resolveCategory(→productTypeId) → create/link + linkage |
| `ReverseImportService.channelCategoryExternalId` (pure) | baca id kategori channel di `categoryPath` (utk lookup product-type) |
| `ReverseImportController` | `POST /import/preview`, `POST /import` |
| `ReverseImportRequest` / `ReverseImportResult(+DraftMaster)` | DTO |

Reuse (nol duplikasi): `ReverseChannelFetchService` (fetch), `ReverseDerivationEngine` (extractItem/deDerive/enrich),
`ReverseClassificationService` (classify), `ReverseVariantInverseService` (variants),
`ReverseAttributeListInverse` (attribute_list), `ReverseApplyService.channelDataFrom`,
`MasterProductDataService.save` (create master, idempoten by productId).

---

## 5. Uji
- `ReverseImportMapperTest` (3): masterAttributes dari bucket, variant/optionGroups dari inverted, empty→null.
- `ReverseImportDedupTest` (11): cross-channel barcode (SKU/nama beda), variant-SKU, product-SKU, name(weak),
  strongest-first lintas master + tiap master 1×, no-match/empty; auto-link (1 STRONG→target, default off, weak/
  ambigu/none→empty); productSkuMatchId (conflictingMasterId utk 409 duplikat).
- `ReverseImportCategoryTest` (4): ekstrak id kategori channel di `categoryPath` (path unconfigured/absent/blank→null,
  non-string→stringified) + `categoryIdCandidates` (GID penuh → [GID, kode telanjang]).
- `ReverseChannelFetchServiceTest` (+2): `putByPath` inject `product.category` (map bersarang ada / dibuat).
(Orkestrasi service = wiring potongan pure yang sudah teruji.) Total reversesync **77 hijau**.

---

## 6a. Browse/LIST katalog channel — ✅ IMPLEMENTASI

`GET /api/v1/channels/reverse/import/list?organizationId=&storeId=&limit=&offset=` → satu halaman katalog channel
untuk dipilih. Data-driven (`ReverseChannelListService`, reuse auth+helper `ReverseChannelFetchService`):
`reverseSyncConfig.itemListUrlTemplate` (placeholder `{storeUrl}/{apiVersion}/{limit}/{offset}`) + `itemsPath` +
`listItemIdPath`/`listItemTitlePath`/`listItemStatusPath`. Respons `ChannelListPage{channelType, storeId, limit,
offset, items:[{channelProductId, title, status}]}`. Seed Shopify (`products.json?limit={limit}` → id/title/status).
```jsonc
GET …/import/list?storeId=store123&limit=50&offset=0
→ { "channelType":"shopify","storeId":"store123","limit":50,"offset":0,
    "items":[ {"channelProductId":"111","title":"Kaos A","status":"active"}, … ] }
```
FE: user pilih item → `POST /import/preview {channelProductId}` → create/link.

## 6b. Batas & lanjutan (jujur)

- **Paginasi mendalam** — v1 pakai `{limit}`+`{offset}`. Shopify (2019+) sebenarnya cursor-based (Link header) →
  offset hanya andal untuk halaman awal; parse cursor = follow-up. Shopee offset-based OK.
- **LIST untuk Shopee** belum di-seed (butuh signing + shape `get_item_list`). Sementara Shopee: kirim
  `channelPayload` ke `/import`. Channel lain = seed `itemListUrlTemplate` + path (nol kode).
- **Fetch by id** hanya untuk channel dgn `itemUrlTemplate` (Shopify). Shopee → kirim `channelPayload` (GET
  Shopee butuh signing).
- **Dedup** memuat master org di memori lalu cocokkan (aksi import jarang, bukan hot-path). Untuk katalog besar:
  tambah index / query bertarget `findByOrganizationIdAndSku` (follow-up).
- Master hasil import berstatus **DRAFT** → butuh review sebelum publish (konsisten guardrail).
- **attribute_list** masuk `channelData` linkage (bukan master) — sama seperti reconcile (atribut kategori =
  channel-specific).
