# 04 — Pemisahan Engine & Perbandingan Industri (keputusan arsitektur)

> Melengkapi [`01`](01-overview-and-principles.md)–[`03`](03-data-model-identity-and-phasing.md). Dokumen ini
> merekam **keputusan arsitektur inti** setelah membandingkan desain ini dengan platform omnichannel di luar
> dan memeriksa sistem forward yang berjalan: **reverse dibangun sebagai interpreter TERPISAH yang membaca
> metadata yang sama — bukan sebagai "mode" di dalam engine forward.** Plus koreksi fakta atas `03`.

## 1. Perbandingan dengan pemain industri

| Platform | Model produk | Reverse produk (channel→platform) | Pelajaran yang dipakai desain ini |
|---|---|---|---|
| **ChannelAdvisor / Rithum** | Master inventory + *template* atribut per-marketplace + business rules | **Terbatas**: order, level inventory, marketplace-assigned IDs, status — **bukan** konten produk penuh | Feed-manager matang **tak** menarik konten produk bulat-bulat ke master |
| **BigCommerce** (Catalog/Channels, MSF) | Canonical product + *override* per-channel | Channel assignment + override, bukan overwrite kanonik | Two-tier (master + per-store override) benar |
| **Jubelio** | Item master (SKU) + listing per-channel | Product-pull: **SKU matching + UI mapping manual + toggle sync per-field** | Linkage + draft-review + ownership per-field wajib |
| **Ginee** | Master Product + bind/unbind listing | Pull → **draft master untuk review**; arah stok/harga dikonfigurasi per channel | Draft-review + arah-kebenaran-sebagai-config |

**Konsensus:** master kanonik + override per-store; reverse **selektif & mapping-aware** (bukan salinan);
linkage by SKU/ID; stok/harga boleh channel-authoritative, konten butuh review manusia. Desain ini (tiga-ember
+ `reverseWritePolicy` + draft-default) sudah persis di jalur ini. Yang sering dilewatkan tim lain dan
**benar** di sini: **arah-kebenaran adalah masalah terberat, dan defaultnya per-store isolation + draft**,
bukan silent overwrite ke master shared.

## 2. Keputusan inti: "shared metadata, separate interpreters"

Desain awal ([`02`](02-reverse-pipeline-and-post-processing.md) §6.1) mengusulkan memberi
`GenericPostProcessingEngine` mode `FORWARD/REVERSE`. **Kita TIDAK menempuh itu.** Alasan:

1. **Reverse bukan "engine forward dibalik".** Hanya operasi **Kelas A** yang punya invers bersih. **Kelas B**
   butuh I/O eksternal (media resolve, warehouse map). **Kelas C** lossy. Jadi "reverse engine" sejatinya
   **eksekusi baru** (registry inverse-op + reverse-enricher + skip), bukan sekadar flag. Menaruhnya di engine
   forward = menambah percabangan berat di **hot path publish** yang sudah teruji (52 operasi).
2. **Melanggar separation-of-concerns di level kode.** Engineer yang menyentuh forward jadi wajib paham
   reverse → learning curve naik + risiko regresi ke jalur uang (publish).
3. **DRY sejati ada di DATA, bukan di CLASS.** Pengetahuan channel ("bagaimana Shopee membentuk
   `tier_variation`") tinggal di **rule** (`postProcessingRules`) — yang adalah data. Cukup satu sumber rule
   itu dibaca dua konsumen.

**Keputusan:** bangun `ReverseDerivationEngine` **terpisah** yang:
- Membaca **rule yang sama** dari **contract beku** (+ metadata per-op `reversible`/`inverseOp` sebagai data),
- Punya **registry inverse-op sendiri** (Kelas A), **reverse-enricher sendiri** (Kelas B), dan **skip** (Kelas C),
- **Tidak menyentuh** `GenericPostProcessingEngine` sama sekali.

Ini **bukan** duplikasi pengetahuan — rule tetap satu sumber (data); yang terpisah adalah *interpreter*-nya.
Dan ini **pola yang sistem ini SUDAH pakai**: BFF membangun payload, **sync worker Temporal menafsir metadata**
untuk eksekusi. Metadata = data bersama; eksekutor = terpisah. Reverse mengikuti pola yang sama.

```
                   ┌────────────── shared DATA (Mongo, versioned / frozen contract) ─────────────┐
                   │ apiSchema · attributeMappings · postProcessingRules(+inverseOp) ·            │
                   │ channel_field_value_mappings · field_semantic_knowledge ·                    │
                   │ product_types.variantDimensions · channel_api_contracts                      │
                   └───────────────┬─────────────────────────────────────────┬────────────────────┘
   FORWARD (publish)              │                                         │      REVERSE (ingest) — BFF only
 master → JOLT → GenericPost →    │                                         │  webhook/GET → ReverseDerivation
 buildAttrs → SyncRequest ─▶ Temporal worker ─▶ channel            channel payload ─┘ (invers Kelas A,
                                                                        reverse-enrich Kelas B, skip C)
                                                                          → reverse-JOLT → value-map⁻¹
                                                                          → 3-ember + reverseWritePolicy
                                                                          → channelData/override/draft
   echo-guard: lastPublishedContentHash ◀──────────────────────────────────┘
```

## 3. Scorecard separation-of-concerns

| Dimensi | Terpisah dari forward? | Catatan |
|---|---|---|
| Trigger | ✅ | Webhook produk / poll — entri berbeda dari publish |
| **Sync worker Temporal** | ✅ **total** | Reverse = baca channel + tulis Mongo; **tak butuh workflow eksekusi**. Forward-execution di Temporal, reverse-ingest di BFF |
| Storage | ✅ (di level tulis) | Reuse koleksi (single source of truth), tapi reverse tulis ke per-store/draft dulu |
| Config / knowledge | ✅ (dibaca, tak diubah) | Reverse **konsumen** koleksi yang sama; tak menambah field ke `apiSchema` |
| Direction-of-truth | ✅ | `reverseWritePolicy` = data; tak mengubah keputusan forward |
| **Transform engine** | ✅ **dengan keputusan §2** | `ReverseDerivationEngine` terpisah, bukan mode di engine forward |
| Anti-loop (echo) | ✅ | Reuse `lastPublishedContentHash` deteksi echo + default tulis-ke-draft = putus loop |

Dengan keputusan §2, reverse dapat dikembangkan & di-maintain **tanpa pernah menyentuh jalur publish**.

## 4. Koreksi fakta atas `03` (status kode nyata)

Beberapa "prasyarat/gap" di `03` sudah tertutup oleh kerja listing-state + versioning:

- **`channelProductId` SUDAH disimpan** di `ChannelProductData` (field + index sparse
  `(channelType, channelProductId)` + `findByChannelTypeAndChannelProductId`), di-stempel di
  `recordPublishSuccess`. R0 prasyarat #1 pada dasarnya **sudah ada** — bukan gap lagi.
- **Contract beku per-versi SUDAH ada** (`channel_api_contracts`, `apiSchemaHash`/`targetSchemaHash`).
  Fondasi versi-aware (`03` §6) tinggal dibaca.
- **Echo-detection hampir gratis**: `lastPublishedContentHash` di listing-state = alat siap-pakai untuk
  mendeteksi "webhook ini echo dari publish saya sendiri".
- Yang **benar-benar belum**: `publishedApiVersion`/`channelUpdatedAt`/`lastReverseSyncedAt` (audit tulis),
  reverse-JOLT / metadata `inverseOp`, dan trigger webhook produk.

## 5. Yang diimplementasi lebih dulu (aman & bernilai)

Karena R0 hampir tuntas, urutannya:

- **R0-sisa (additive):** field `publishedApiVersion` + `channelUpdatedAt` + `lastReverseSyncedAt` di
  `ChannelProductData`; stempel `publishedApiVersion` di jalur publish-success (di mana `channelProductId`
  distempel). Tak ada logika reverse — hanya melengkapi linkage/audit.
- **R1 read-only preview:** package `reversesync/` terpisah + `ReverseDerivationEngine` (interpreter terpisah,
  registry inverse-op starter) + `ReverseClassificationService` (tiga-ember, data-driven dari
  `attributeMappings`) + endpoint `POST /api/v1/channels/reverse/preview` yang **hanya menampilkan diff** vs
  master, **tanpa menulis apa pun**. Membuktikan hipotesis ("hanya yang termapping yang masuk",
  "post-processing wajib dibalik") tanpa risiko. Menyusul: R2 (tulis Step-2) → R3 (draft master) → R4
  (webhook+echo) → R5 (reverse-JOLT agent).

## 6. Status implementasi (per commit ini)

- **R0-sisa — ✅ IMPLEMENTASI.** `ChannelProductData` kini punya `publishedApiVersion`, `channelUpdatedAt`,
  `lastReverseSyncedAt` (additive; `channelProductId` sudah ada sebelumnya). `publishedApiVersion` distempel di
  jalur publish-success (best-effort, di samping `persistImageOrder`). Tak ada logika reverse — hanya linkage/audit.
- **R1 read-only preview — ✅ IMPLEMENTASI.** Package `com.labamap...reversesync`:
  `ReverseDerivationEngine` (interpreter **terpisah** dari engine forward — flatten + invers image-wrapper Kelas
  A; struktur derivatif dicatat sebagai note, tak masuk flat-map), `ReverseClassificationService` (tiga-ember
  dari `attributeMappings` + `apiSchema`), `POST /api/v1/channels/reverse/preview` (read-only, tak menulis, tak
  memanggil channel, tak menyentuh Temporal). Uji: klasifikasi (5) + de-derivation (4).
- **Cakupan jujur R1:** de-derivation baru menutup Kelas A image-wrapper; `tier_variation`/`model`/
  `image_id_list`/attribute-list ditandai *pending* (bukan ditebak). Registry inverse-op penuh + reverse-JOLT =
  R5. Klasifikasi 1:1 memakai `attributeMappings` (sesuai `02` §5: mulai 1:1 deterministik, agent belakangan).
- **R2 tulis Step-2 (per-store) — ✅ IMPLEMENTASI.** `ReverseApplyService` + `POST /api/v1/channels/reverse/apply`
  (`masterProductId`+`storeId` wajib): bucket (a) → `channel_product_data.masterOverrides` (keyed master attrId),
  bucket (b) → `channel_product_data.channelData` (keyed leaf nama field), **merge** (idempoten), stempel
  `lastReverseSyncedAt` (+`channelProductId` bila diberi). **Master global TIDAK pernah ditulis** (itu R3), store
  lain tak terpengaruh, Temporal tak disentuh. Uji: map-builder (5). Konvensi kunci `channelData`=leaf & bucket-b
  variant-scoped masih kasar — halus di R2.1/R5.
- **R4-pull (fetch nyata dari channel) — ✅ IMPLEMENTASI.** `ReverseChannelFetchService` menarik item **dari
  channel** (GET item) memakai kredensial store terenkripsi — **BFF-only, tak lewat Temporal** (meniru pola
  `ImageChannelIdBackfillService`). Endpoint: `POST /reverse/pull` (fetch → preview) & `POST /reverse/pull/apply`
  (fetch → tulis Step-2). **Linkage matching**: `masterProductId` di-resolve dari `channelProductId` via
  `findByChannelTypeAndChannelProductId` bila tak diberi. **Tak perlu payload manual lagi** — inilah reverse
  yang benar-benar menarik dari channel. Uji: URL/token/version helper (4). **Cakupan jujur:** GET item
  **Shopify-shaped** (`/products/{id}.json`); Shopee (dua-tahap+signing)/TikTok balik error "not yet supported".
  Membuat GET fully data-driven (resep `read_CP` di config) + versi-aware-parse (`publishedApiVersion`) =
  penyempurnaan R4.1.
- **R3 draft-review master + `reverseWritePolicy` — ✅ IMPLEMENTASI.** Flag `reverseWritePolicy` ditambah di
  `ecommerce_master_attributes` (DATA, bukan literal). `ReverseWritePolicy` enum + routing pure
  (`ReverseReviewService.decide`): DRAFT_REVIEW → suggestion PENDING (`reverse_suggestions`),
  CHANNEL_AUTHORITATIVE → per-store `masterOverrides`, MASTER_AUTHORITATIVE/IGNORE → skip. **Master global TIDAK
  pernah ditulis otomatis** — hanya `POST /suggestions/{id}/accept` (aksi manusia) yang menulisnya
  (`MasterProductDataService.updateProductAttributes`). Endpoint: `POST /reverse/review`,
  `GET /reverse/suggestions/{productId}`, `POST /reverse/suggestions/{id}/accept|reject`. Suggestion di-upsert
  per (product×store×attr) → re-import mengganti PENDING lama (idempoten). Uji: policy-parse + routing (4).
- **Seeder `reverseWritePolicy` per-attribute — ✅ IMPLEMENTASI.** `ReverseWritePolicyMigration` (@Order 165,
  merge-only, idempoten) menandai atribut master inti: konten (`name`/`description`/`tags`) → DRAFT_REVIEW;
  operasional-marketplace (`price`/`comparePrice`/`inventory`) → CHANNEL_AUTHORITATIVE; identitas/spec
  (`weight`/`barcode`/`condition`/`vendor`/`status`) → MASTER_AUTHORITATIVE. Berlaku pada kasus 1:1
  (attrId == master fieldName); channel dengan attrId beda (Shopee `product_name`/`original_price`) jatuh ke
  default aman sampai link attrId↔masterFieldName di-wire (R5). Uji: intent map + validitas enum (4).
- **R4-webhook (auto-trigger + echo-suppression) — ✅ IMPLEMENTASI, GENERIC + data-driven.** `WebhookService`
  (verifikasi signature sudah ada) mendelegasikan **event produk channel apa pun** ke `ReverseWebhookService`
  (package reversesync — SoC) lewat `handleIfProductEvent(channelType, event, rawBody)`; bila bukan event produk
  → fall-through ke handler lifecycle. **Tak ada literal channel di kode** — semua channel-specific = DATA di
  `ChannelConfiguration.reverseSyncConfig`: `productEventTopics` (event mana = product create/update),
  `productIdPath`/`updatedAtPath` (dot-path id & timestamp), `updatedAtFormat` (ISO_OFFSET|ISO_LOCAL|
  EPOCH_SECONDS|EPOCH_MILLIS), dan wrapper key (reuse `apiWrapperConfig.rootKey`). **Menambah channel = seed
  config, bukan edit kode.** Webhook membawa body item penuh → tak perlu GET → de-derive → classify → route by
  policy (reuse R1/R3). **Echo-suppression** (`isEcho`, pure): skip bila timestamp (a) tak lebih baru dari
  `lastReverseSyncedAt` (dedup), atau (b) dalam window 120s dari `publishedAt` (echo publish sendiri). Guard
  struktural (reverse hanya tulis draft/Step-2) memutus loop by construction. Seed Shopify di
  `ChannelConfigurationDataLoader` (`productEventTopics=[products-update,products-create]`, `id`/`updated_at`/
  ISO_OFFSET). Registrasi: `POST /api/v1/webhooks/shopify/products-update`. Uji: echo/dedup + parse multi-format
  + `isProductEvent`/`getByPath` config-driven (14).
- **R5 slice-1 — resolve channel↔master field via `channel_field_mappings` (SoT, read backwards) — ✅ IMPLEMENTASI.**
  Klasifikasi bucket-(a) kini me-resolve `channelPath → master field` dari **`channel_field_mappings`** (SoT
  korespondensi field) dibaca terbalik (`targetField → sourceField`), jadi channel non-1:1 (mis. Shopify
  `product.title` → master `name`) masuk bucket-(a) yang benar & routing `reverseWritePolicy`-nya memakai atribut
  master yang tepat. **Dibaca SELEKTIF** (keputusan desain): hanya `isActive`, hanya strategi deterministik
  {EXACT, EXACT_OVERRIDE} (SEMANTIC/PATTERN/SIMILARITY/CUSTOM dikecualikan — tebakan forward, tak boleh dibalik),
  match by normalized `targetField` (strip `[index]`), dan **injektif** — many-to-one (mis. `brand`+`vendor`→
  `product.vendor`) di-**skip** (ambigu, tak menebak). Tanpa row → fallback identity 1:1 (attrId). **`ecommerce
  _master_attributes.masterFieldName` sengaja TIDAK dipakai** (salinan kedua fakta yang sama → redundan/drift).
  `classifyResolved(...)` reaktif membangun peta lalu pure `classify(...,channelPathToMaster)`. Kelima pemanggil
  (preview/pull/review/apply/webhook) memakainya. Uji: non-1:1 benar + fallback 1:1 + normalizePath (3 tes).
- **R5 slice-2 — inverse Kelas A: dimensi varian self-describing — ✅ IMPLEMENTASI.** Wawasan kunci: struktur
  dimensi varian identik lintas channel — Shopify `options:[{name,values}]` & Shopee
  `tier_variation:[{name,option_list}]` = "array objek dengan `name` + satu field array-skalar". Satu inverse
  **struktural** (`ReverseDerivationEngine.asVariantDimensions`) membalik **keduanya** → `[{name,values}]`
  master-shaped, **tanpa literal channel** (deteksi shape, bukan vocabulary). Mengubah "de-derivation pending"
  note jadi inverse nyata untuk shape ini. Yang bukan shape ini (Shopee `model` dgn `tier_index`, array objek
  arbitrer) tetap **pending note** (tak menebak). Catatan jujur: op forward = Java imperatif, jadi inverse
  ditulis per-shape (bukan diturunkan otomatis dari config); slice-2 menutup shape dimensi (paling umum &
  deterministik). Uji: Shopee+Shopify → dims + model/non-dim tetap pending (4 tes).
- **R5 — reverse VALUE translation (`channelValue → masterValue`) — ✅ IMPLEMENTASI.** Melengkapi tema SoT:
  slice-1 membalik **nama** field (`channel_field_mappings`), ini membalik **nilai** field lewat
  `channel_field_value_mappings` yang **sama**, dibaca terbalik (`channelValue → masterValue`, mis. `LZ_MAT_001 →
  cotton`). `ReverseValueMappingService` (package reversesync — SoC) match EXACT skalar / keanggotaan list; tak
  match → nilai mentah dipertahankan (tak menebak). `classifyResolved` kini 2 langkah data-driven: resolve nama
  field → translate nilai field → pure classify (diff & yang masuk master pakai nilai MASTER, bukan kode channel).
  Nol koleksi baru, nol literal channel. Uji: skalar + list-membership + no-match null (4 tes).
- **R5 — reverse-op descriptor (per-SKU variant inverse) — ✅ IMPLEMENTASI.** Menyelesaikan masalah "nama field
  channel-side ada di Java imperatif, bukan config": op `{"op":"VARIANT_INVERSE",…}` di `reverseSyncConfig.operations[]`
  (di-parse `ReverseOps` → `reversesync.model.VariantInverseDescriptor`)
  mendeklarasikan cara membalik array per-SKU channel → variant master, DATA. `ReverseVariantInverseService`
  (interpreter terpisah, package reversesync) membalik **dua gaya** dengan satu engine: `VALUE_FIELDS`
  (Shopify `option1/2/3` menyimpan nilai sumbu; nama dari `product.options` by posisi) & `INDEX_ARRAY` (Shopee
  `tier_index` meng-indeks `tier_variation`). Output: `[{axisValues:{dim→value}, <masterFields>}]` via
  `fieldMap` (channel→master). Reuse slice-2 `asVariantDimensions` (normalisasi dim) + `getByPath` (DRY). Index
  di luar rentang → sumbu di-skip (tak menebak). Seed descriptor Shopify. **Nol nama field channel di kode** —
  tambah channel = descriptor. Uji: Shopify VALUE_FIELDS + Shopee INDEX_ARRAY + empty + out-of-range (4 tes).
- **R5 — rekonsiliasi variant → `variantOverrides` — ✅ IMPLEMENTASI.** `ReverseVariantReconciler` (pure, reversesync)
  me-MERGE variant master hasil inverse ke `channel_product_data.variantOverrides` (per-store, **SKU-keyed**).
  Identitas = **SKU** (Shopify & Shopee sama-sama membawa SKU; match langsung ke entri SKU yang ada); SKU-less →
  dedup by **axis signature** (`Color=Red;Size=M`, order-independent) → key sintetis `axis:…` (tak menebak SKU
  salah). **Non-destruktif**: hanya set key turunan-reverse (axisValues bernama + master fields); field Step-2
  merchant lain tetap utuh; nilai channel menang untuk price/stock. Di-wire ke `ReverseApplyService` (invert
  descriptor → reconcile → simpan; laporkan `variantsReconciled`). Uji: merge SKU non-destruktif, entri baru,
  SKU lain tak tersentuh, SKU-less dedup, empty (5 tes).
- **R5 — reconcile varian di jalur WEBHOOK — ✅ IMPLEMENTASI.** `ReverseWebhookService.ingest` kini, setelah
  route (R3), memanggil `reconcileVariants` (invert descriptor → `ReverseVariantReconciler.reconcile` →
  `variantOverrides`). Berurutan **setelah** save route (tak concurrent → tanpa lost-update); `updateReverseStamps`
  berikutnya = `$set` bertarget yang tak meng-clobber `variantOverrides`. No-op bila tak ada descriptor/varian.
  Jadi webhook auto-trigger kini merekonsiliasi varian **dan** field skalar, sama seperti apply manual. (Wiring
  murni — logika pure sudah teruji di reconciler + inverse; 54 tes hijau.)
- **R5 — reverse-JOLT sebagai PROYEKSI inspectable (simetri) — ✅ IMPLEMENTASI.** Temuan: master **flat** (seeder
  tak punya fieldName bersarang; `productAttributes` = "raw flat key→value"), jadi reverse-JOLT **tak menambah
  kapabilitas** — de-derivation + resolver slice-1 SUDAH reverse transform. Karena **simetri arsitektur** yang
  diprioritaskan, reverse-JOLT dibangun sebagai **proyeksi on-demand dari SoT** `channel_field_mappings` (dibaca
  terbalik), **bukan** executor kedua, **bukan** salinan tersimpan (tak bisa drift). `ReverseJoltSpecService.generate`
  memakai **satu** shared read `resolveReverseFields` (di-refactor agar resolver runtime & proyeksi berbagi logika —
  DRY): shift `{channelPath→masterField}` hanya baris injektif EXACT/EXACT_OVERRIDE; many-to-one dikecualikan &
  dilaporkan (`ambiguousExcluded`); fuzzy (SEMANTIC/PATTERN) di-drop. Endpoint inspeksi
  `GET /api/v1/channels/reverse/jolt-spec/{channelId}`, simetris dgn forward `channel_jolt_specs`. Ditandai
  eksplisit "derived, bukan SoT, bukan executor". Uji: injektif→shift, fuzzy dikecualikan, many-to-one dilaporkan,
  index dinormalisasi, null-safe (5 tes).
- **R5 — enricher Kelas B (paruh LOKAL: agregasi stok) — ✅ IMPLEMENTASI.** Op `{"op":"AGGREGATE",…}` di
  `reverseSyncConfig.operations[]` (di-parse `ReverseOps` → `reversesync.model.EnricherDescriptor`:
  `type=AGGREGATE`, `arrayPath`, `valueField`, `strategy=SUM|MAX|MIN|FIRST`) + `ReverseDerivationEngine.enrich`
  meng-collapse array stok per-lokasi (Shopee `seller_stock:[{stock}]`, TikTok `inventory:[{quantity}]`) jadi
  **satu skalar di path yang sama** — lalu SoT `channel_field_mappings` yang memetakan path itu → field master
  inventory (agregasi di sini, pemetaan field tetap di SoT → nol redundansi). Reuse `getByPath` (DRY). Di-wire ke
  apply **&** webhook (enrich setelah de-derive, sebelum classify). Non-numerik diabaikan; tak ada angka → array
  mentah dipertahankan. Uji: SUM/MAX/MIN/FIRST + integral/double + collapse + no-op (3 tes; total 62).
- **R5 — descriptor Shopee (variant inverse) + 2 enhancement generik — ✅ IMPLEMENTASI.** Diverifikasi terhadap
  response **nyata** `v2.product.get_model_list`. Payload asli mengungkap 2 shape yang tak cocok dengan mekanisme
  awal, keduanya diperbaiki **generik** (path = DATA di descriptor, nol literal channel): **(1)**
  `dimensionOptionValueField` — buka `option_list:[{option:"red"}]` (objek) → `["red"]` (Shopify skalar tetap
  jalan via default null); **(2)** `fieldMap` pakai **path bersarang/terindeks** via `getByPath` yang kini
  dukung `[n]` — `price_info[0].original_price`→price, `stock_info_v2.summary_info.total_available_stock`→
  inventory. Descriptor Shopee di-seed (`response.model` INDEX_ARRAY `tier_index`). Webhook/pull Shopee **tak**
  di-seed (butuh signing + sample webhook). Uji: 4 varian dari payload nyata + getByPath index (2 tes; total 64).
  Catatan: `get_item_base_info` **sudah** memuat `image_url_list` → `RESOLVE_MEDIA` (image_id→URL) **tak perlu**
  untuk baca Shopee.
- **R5 — item-level Shopee (rebasing `REBASE_ITEM`) — ✅ IMPLEMENTASI.** Diverifikasi vs `get_item_base_info` nyata.
  Item ter-nest di `response.item_list[0]` → de-derivation menandainya "pending" (array objek) → tak ada field
  yang flow. Op `{"op":"REBASE_ITEM","itemPath":…}` (di `reverseSyncConfig.operations[]`, dibaca `ReverseOps`) +
  `ReverseDerivationEngine.extractItem` me-**rebase** sub-objek itu ke
  root sebelum de-derive, jadi `item_name`/`description`/`weight`/`condition`/`category_id`/`brand.original_brand_name`/
  `dimension.*`/`image.image_url_list` ter-flatten root-aligned & cocok dgn attributeMappings/apiSchema Shopee.
  Di-wire ke apply **&** webhook (rebase → de-derive → enrich → classify). Seed Shopee `REBASE_ITEM`. `attribute_list`
  (attribute-id native) tetap **pending note** (butuh layer mapping attribute-id → follow-up). Tanpa `REBASE_ITEM` =
  Shopify tak berubah (item sudah di root). Uji: payload nyata → 7 field root-aligned + image URLs + attribute_list pending + extractItem
  edge (2 tes; total 66).
- **R5 — inverse `attribute_list` Shopee — ✅ IMPLEMENTASI.** Temuan SoT: **tak ada** `attribute_id→master field`
  dan **tak perlu** — atribut kategori di-key by native `attribute_id` di KEDUA sisi (forward stage
  `masterProductData[attribute_id]`; `CategoryAttributesCacheDocument` = katalog id sah + value options, bukan
  tautan master). Jadi inversenya ringan: `AttributeListInverseDescriptor` (`arrayPath`/`idField`/`valueListField`/
  `valueField`) + `ReverseAttributeListInverse.invert` → `channelData[attribute_id]=value_id` (bucket b, mirror
  forward). Multi-value → List. `valueField` bisa `value_id` (round-trip) atau `original_value_name` (human). Reuse
  `getByPath` (DRY). Di-wire ke apply (merge ke channelDataWrites). Seed Shopee. **Nol koleksi/SoT baru.** Uji:
  attribute_list nyata → {200134:1221, 200162:1453} + multi-value + human + null-safe (4 tes; total 70).
- **R5 — channelData (bucket-b + attribute_list) di jalur WEBHOOK, konsolidasi save — ✅ IMPLEMENTASI.**
  Sebelumnya webhook hanya tulis bucket-a (via `route`) + varian; **seluruh bucket-b channelData dilewati**.
  Kini `ReverseWebhookService.persistChannelSideWrites` (ganti `reconcileVariants`) menulis channelData
  (field channel-only terklasifikasi + `attribute_list` inverse) **dan** variantOverrides dalam **satu**
  `getOrCreate→save` — berurutan setelah `route` (baca row pasca-route → tanpa lost-update; `updateReverseStamps`
  berikutnya = `$set`). Reuse `ReverseApplyService.channelDataFrom` + `ReverseAttributeListInverse.invert` (DRY).
  No-op bila tak ada yang ditulis. Webhook kini setara apply (bucket-a + bucket-b + varian). 70 tes hijau
  (wiring murni — potongan pure sudah teruji).
- **R5 — "reverse post-processing" jadi SATU pipeline terpadu `operations[]` — ✅ REFACTOR.** Empat op-transform
  yang dulu tersebar sbg field ber-tipe (`itemPath`/`variantInverse`/`attributeListInverse`/`enrichers[]`)
  diseragamkan jadi satu `reverseSyncConfig.operations[]` — tiap entri map dgn diskriminator `"op"`
  (`REBASE_ITEM`/`VARIANT_INVERSE`/`ATTRIBUTE_LIST`/`AGGREGATE`), analog forward `postProcessingRules.operations[]`.
  Dibaca `ReverseOps` (pure) → descriptor tipenya (`reversesync.model`). **`operations[]` satu-satunya sumber**:
  tak ada field ber-tipe lama, tak ada fallback. Urutan eksekusi tetap per-stage (rebase→de-derive→enrich→classify→
  attribute_list→variant), posisi array deklaratif. Descriptor dipindah dari `ChannelConfiguration` → `reversesync.model`
  (channel-entity tak lagi tahu tipe parse reverse). Seed Shopify/Shopee di `ChannelConfigurationDataLoader` migrasi
  ke `operations[]`. Nol perubahan perilaku. **92 tes hijau** (`ReverseOpsTest` 4: parse 4 op + op-type absen → null/empty + null-safe).
- **R5 — gambar (import) via op `IMAGE_INVERSE` — ✅ FIX.** Bug: gambar hasil import nempel ke `channelData` (bukan
  master) & gambar variant hilang. Sebab: forward menangani gambar di luar JOLT (`_sourceImages` + post-processing),
  jadi tak ada `channel_field_mapping` untuk dibalik → klasifikasi menaruhnya di bucket-b. Op baru `IMAGE_INVERSE`
  (`reversesync.model.ImageInverseDescriptor` + `ReverseImageInverseService`, pure, baca item MENTAH via `getByPath`
  + reuse `extractImageUrl`) me-route `product.images[{id,src}]` → master `mainImage`(pertama)+`galleryImages`(sisanya),
  dan resolve `variants[].image_id` (id→src) → per-SKU `variantImages`; key gambar dibuang dari `channelData`
  (anti-duplikat). **URL channel apa adanya — belum di-host ulang** (re-host = follow-up publish-keluar; lihat
  [`05`](05-config-source-of-truth.md) §7b). Seed Shopify.
  Perilaku **beda per use-case**: **import** → gambar ke MASTER (greenfield); **reconcile** (apply/webhook/preview) →
  gambar **master-authoritative, TIDAK ditulis** (`ReverseImageInverseService.flagImageDrift`: buang blob dari
  `channelData` + lampirkan `ReversePreview.imageDrift` read-only), anti "sticky override" — cocok norma industri
  (konten = otoritas master; menarik gambar channel→master = opt-in `reverseWritePolicy`, belum dibangun). **101 tes
  hijau** (`ReverseImageInverseServiceTest` 8).
- **Import dedup — identity resolution lintas store/channel (Phase 1) — ✅.** Sebelumnya dedup hanya SKU→nama level
  produk. Kini `ReverseImportDedup` mencocokkan deterministik & strongest-first: **variant barcode (=UPC/EAN/GTIN)**
  → **variant SKU** → **product SKU** → **name** (WEAK), tiap master 1× di level terkuat, tiap `Match` bawa
  `confidence` + `matchedKeys`. Barcode = kunci **cross-channel** terkuat (produk sama di Shopify & Amazon: SKU beda,
  barcode sama) — norma Sellbrite/Linnworks/ChannelAdvisor (SKU/GTIN = kunci join; sinyal lemah cuma saran). Prasyarat:
  `barcode` ditambah ke `fieldMap` VARIANT_INVERSE Shopify agar mengalir ke master variant. Model data
  (master↔listing per channel×store) sudah mendukung merge lintas channel. **104 tes hijau** (`ReverseImportDedupTest`
  7).
- **Import dedup — auto-link opsional + guard duplikat (Phase 2) — ✅.** `autoLinkStrongMatch` (**default OFF**):
  saat create tanpa `masterProductId` + TEPAT 1 match STRONG → auto-link (`ReverseImportDedup.autoLinkTarget`, pure),
  hasil `autoLinked=true`; WEAK/ambigu (≥2 STRONG) tak pernah auto-link. Guard DB: **partial unique index**
  `{organizationId, sku}` (hanya sku non-kosong) di `MasterProductIndexMigration` (best-effort, non-fatal bila data
  lama duplikat); create master ber-SKU sama → `DuplicateKeyException` dipetakan ke **409 body terstruktur**
  `ReverseImportError {code:"DUPLICATE_MASTER_SKU", message, sku, conflictingMasterId}` (conflictingMasterId =
  `ReverseImportDedup.productSkuMatchId`, pure) → FE bisa langsung tawarkan "link ke master itu". Semua error `/import`
  kini ber-body `ReverseImportError` (500 pesan generik, tak bocor internal). **108 tes hijau**
  (`ReverseImportDedupTest` 11).
- **Import Product Type dari kategori channel (B+C) — ✅.** Bug: setelah import, Step 2 selalu 422 "belum punya
  Product Type" — karena Step 2 dibentuk dari `master.productTypeId` (`ChannelStepSchemaService`), tapi import tak
  pernah mengesetnya (kategori channel ≠ Product Type platform, taksonomi beda). **B:** `reverseSyncConfig.categoryPath`
  (Shopify `product.category`) → lookup `channel_category_mappings {storeId, externalId}` → set `productTypeId` master
  otomatis bila mapping product-type-based ada. **C:** `ReverseImportResult.categoryResolution` selalu di-surface —
  `autoResolved=true` (B berhasil) atau saran (kategori ada, belum ter-map → FE arahkan set Product Type di Step 1).
  Injeksi hanya di jalur CREATE (`putIfAbsent`), link/update-draft tak terpengaruh. Ekstraksi id kategori =
  `ReverseImportService.channelCategoryExternalId` (pure). **111 tes hijau** (`ReverseImportCategoryTest` 3).
- **Import kategori: fetch GraphQL + toleransi bentuk id (Opsi 1) — ✅.** Sebab utama "tidak ketemu": Shopify REST
  `products/{id}.json` TAK memuat taxonomy category (GraphQL-only) → `product.category` null → resolusi tak jalan.
  Fix data-driven: `reverseSyncConfig.categoryFetch` (recipe GraphQL — url/query/gid/responseIdPath/targetPath);
  `fetchItem(enrichCategory=true)` (import saja) POST GraphQL → inject id kategori ke item. Plus toleransi bentuk id:
  lookup `channel_category_mappings` mencoba kandidat {GID penuh, kode telanjang} karena forward membuang prefix GID.
  Helper pure: `putByPath` (inject), `categoryIdCandidates`. **114 tes hijau.**
- **Import kategori: lookup ke sumber yang BENAR (`channelCategoryDefaults`) — ✅ FIX.** Ternyata mapping user
  tersimpan di **`product_types.channelCategoryDefaults[]`** (`{channelType, categoryId, categoryName}`), bukan koleksi
  `channel_category_mappings` yang di-query semula → selalu "tidak ketemu". `resolveCategory` kini query
  `product_types.channelCategoryDefaults` ({channelType, categoryId} via `$elemMatch`, `ProductTypeRepository.findByChannelCategoryDefault`)
  → `productTypeId` = id product_type itu. Kandidat GID+kode tetap dipakai. Helper pure `defaultCategoryName`. **115 tes hijau.**
- **Buang fallback `channel_category_mappings` — ✅.** Analisis: `channelCategoryDefaults` sudah channel-agnostic
  (categoryId opaque, contoh shopee/lazada — non-taxonomy tercakup) dan ADALAH yang dibaca Step 2
  (`ChannelStepSchemaService`), sedangkan `channel_category_mappings` tak punya konsumen alur (hanya admin CRUD-nya,
  "original design" yang di-supersede). Fallback = risiko asimetri (reverse resolve beda productType dari Step 2 pre-fill).
  `resolveCategory` kini **satu sumber** = `channelCategoryDefaults`; dependency `ChannelCategoryMappingRepository` dilepas
  dari `ReverseImportService`. Simetri forward/reverse terjaga.
- **Hapus fitur legacy `channel_category_mappings` di backend — ✅.** Setelah fallback dilepas, koleksi + fitur ini
  tak punya konsumen sama sekali (FE pakai `PUT /admin/product-types/{id}/channel-defaults/{channelType}` →
  `channelCategoryDefaults`; forward/Step 2 baca `channelCategoryDefaults`; reverse sudah lepas). Dihapus:
  `ChannelCategoryMappingAdminController` (`/api/v1/admin/channel-category-mappings`), `…Service`, `…Repository`,
  `…Document`, `ProductTypeMappingRequest`. Koleksi `channel_category_mappings` **tak pernah ada di Mongo** (fitur
  inert sejak awal) → tak ada data yang perlu di-drop. API-ref `docs/product/…/04-channel-category-mapping.md` ditandai REMOVED.
- **Import listing = live/exists, bukan draft baru (anti-duplikat publish) — ✅ FIX.** Bug: produk hasil import
  tampil "0 live" & Step 3 memperlakukannya sebagai **CREATE** (→ duplikat di channel). Sebab: `linkRow` mengisi
  `channelProductId` tapi status tetap DRAFT (default), dan `PublishOperationDecider` dulu men-CREATE apa pun yang
  bukan PUBLISHED. **Fix (dua bagian):** (1) `PublishOperationDecider` kini memutuskan CREATE-vs-UPDATE dari
  **EKSISTENSI** (`channelProductId` ada & status≠DELISTED), bukan liveness — jadi listing yang ADA di channel →
  UPDATE/NOOP, tak pernah duplikat; liveness (PUBLISHED) hanya izinkan NOOP. (2) import membaca status channel
  (`reverseSyncConfig.itemStatusPath`+`liveStatusValues`, data-driven): active→linkage PUBLISHED (live), draft/archived→
  READY (ADA di channel, belum live); keduanya simpan channelProductId. Efek: Step 3 tampil "1 live" utk active, dan
  publish = UPDATE (bukan CREATE). Karena `update_CP` belum ada di sync (`channelUpdateEnabled=false`), publish setelah
  edit = UPDATE_BLOCKED (aman, bukan duplikat). Tak menurunkan row PUBLISHED yang sudah ada. **295 tes publishing+reversesync hijau.**
- **Baseline content-hash saat import (unchanged → NOOP) — ✅.** `linkRow` (untuk import PUBLISHED) men-stamp
  `lastPublishedContentHash` = `ChannelPublishService.computeDesiredContentHash` (reuse `publishDiff` → transform SAMA
  persis dgn publish nyata, `intendedContentHash` diekspos di `PublishDiffResponse`). Jadi publish import-live TANPA
  edit = **NOOP** (bukan UPDATE_BLOCKED); setelah edit → UPDATE_BLOCKED (sampai update_CP ada). Best-effort (gagal → tak
  di-stamp, degradasi aman). Reuse `publishDiff` → nol drift transform.
- **`update_CP` — enable per-channel (Shopify push nyata) — ✅.** Temuan: `update_CP` SUDAH terimplementasi penuh
  (metadata `workaction#update_CP` = `PUT /products/{id}.json` + media/variant/delete workactions; sync eksternal
  mengeksekusi; injeksi id existing via `ChannelAttributeConverterService` G3, jalur yg sama dgn delist yg sudah live).
  Yang menghalangi hanya GATE: satu flag GLOBAL `app.publish.channel-update-enabled` (all-or-nothing). Fix: gate kini
  **per-channel** (`ChannelConfiguration.integrationConfig.updateEnabled`, helper pure `PublishOperationDecider.updateCapable`);
  Shopify di-seed `updateEnabled=true` (env off-switch `APP_PUBLISH_SHOPIFY_UPDATE_ENABLED`), flag global jadi override
  (default dikembalikan ke **false** — sebelumnya YAML men-default `true`, meng-enable SEMUA channel termasuk yg belum
  verified spt Shopee). Efek: import→edit→publish Shopify = **UPDATE (push nyata)**, bukan UPDATE_BLOCKED; channel lain
  tetap fail-closed sampai per-channel-nya di-set. **298 tes publishing+reversesync hijau.**
- **Belum:** verifikasi E2E update_CP Shopify terhadap store live (metadata+jalur ada; nyalakan per-channel = pernyataan
  siap); Shopee Mode B update (butuh metadata varian + verifikasi); re-host gambar ke
  storage platform (S3/GCS+CDN) saat publish-keluar; enricher Kelas B **EKSTERNAL** (`RESOLVE_MEDIA`) — tak perlu untuk channel yang GET-nya kembalikan
  URL (spt Shopee); Webhook/pull Shopee (signing + sample envelope); GET/webhook non-Shopify lain; SKU-match
  produk belum ter-link.
