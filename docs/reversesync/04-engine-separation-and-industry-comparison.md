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
  channel-side ada di Java imperatif, bukan config": `ChannelConfiguration.VariantInverseDescriptor`
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
- **R5 — enricher Kelas B (paruh LOKAL: agregasi stok) — ✅ IMPLEMENTASI.** `ChannelConfiguration.EnricherDescriptor`
  (`type=AGGREGATE`, `arrayPath`, `valueField`, `strategy=SUM|MAX|MIN|FIRST`) + `ReverseDerivationEngine.enrich`
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
- **R5 — item-level Shopee (rebasing `itemPath`) — ✅ IMPLEMENTASI.** Diverifikasi vs `get_item_base_info` nyata.
  Item ter-nest di `response.item_list[0]` → de-derivation menandainya "pending" (array objek) → tak ada field
  yang flow. `ReverseSyncConfig.itemPath` + `ReverseDerivationEngine.extractItem` me-**rebase** sub-objek itu ke
  root sebelum de-derive, jadi `item_name`/`description`/`weight`/`condition`/`category_id`/`brand.original_brand_name`/
  `dimension.*`/`image.image_url_list` ter-flatten root-aligned & cocok dgn attributeMappings/apiSchema Shopee.
  Di-wire ke apply **&** webhook (rebase → de-derive → enrich → classify). Seed Shopee `itemPath`. `attribute_list`
  (attribute-id native) tetap **pending note** (butuh layer mapping attribute-id → follow-up). itemPath null =
  Shopify tak berubah. Uji: payload nyata → 7 field root-aligned + image URLs + attribute_list pending + extractItem
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
- **Belum:** enricher Kelas B **EKSTERNAL** (`RESOLVE_MEDIA`) — tak perlu untuk channel yang GET-nya kembalikan
  URL (spt Shopee); Webhook/pull Shopee (signing + sample envelope); GET/webhook non-Shopify lain; SKU-match
  produk belum ter-link.
