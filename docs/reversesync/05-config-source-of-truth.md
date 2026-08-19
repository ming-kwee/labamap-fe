# 05 — Config Source-of-Truth & Status Terkunci (as-built)

> Dokumen **kunci**. `01`–`04` merekam prinsip, pipeline, model data, dan keputusan arsitektur. Dokumen ini
> mengunci **apa yang SUDAH dibangun** (R0–R5), **peta Source-of-Truth (SoT)** yang mendasarinya, dan
> **keputusan anti-redundansi** yang diambil sepanjang implementasi — supaya tidak ada yang menambah salinan
> kedua atau meng-hardcode ulang di kemudian hari. Dibaca perlahan dari atas ke bawah.

---

## 0. Satu kalimat

Reverse sync (channel → platform) dibangun sebagai **interpreter terpisah** yang **membaca metadata forward
yang sama, dari arah sebaliknya** — bukan mode di dalam engine forward, bukan koleksi baru untuk tiap fakta,
dan tidak pernah menimpa master global secara diam-diam.

---

## 1. Dua sumbu yang mengatur SEGALANYA: Correspondence vs Transform

Semua "pemetaan" di sistem ini jatuh ke salah satu dari **dua jenis**, dan jenisnya menentukan apakah ia bisa
"dibaca terbalik" atau butuh eksekutor reverse tersendiri. Ini fondasi seluruh desain — pahami ini dulu.

### 1a. Correspondence (korespondensi) = DATA dua-arah

Korespondensi adalah **pasangan setara tanpa arah**: "field master `name` ↔ field channel `product.title`",
"nilai master `cotton` ↔ nilai channel `LZ_MAT_001`". Karena ia cuma **baris pasangan**, baris yang sama
dipakai kedua arah:

- **Forward** membacanya kiri→kanan (`master → channel`).
- **Reverse** membacanya kanan→kiri (`channel → master`).

**Tidak ada salinan kedua.** Reverse tinggal membaca koleksi yang sudah ada, terbalik.

### 1b. Transform (transformasi) = EKSEKUTOR satu-arah

Transform adalah **cara membentuk ulang struktur**: nest, index, gabung, bungkus, bangun `tier_variation`.
Ia punya **arah** dan mengandung operasi **tak-terbalikkan** (default, many-to-one, wildcard). Maka forward &
reverse butuh **eksekutor terpisah** — tak bisa dibaca terbalik begitu saja.

### 1c. Tabel keputusan

| Item | Jenis | Reverse? |
|---|---|---|
| `channel_field_mappings` (field↔field) | Correspondence | **Baca terbalik** ✅ |
| `channel_field_value_mappings` (value↔value) | Correspondence | **Baca terbalik** ✅ |
| `attributeMappings` (path↔attr + isSupportField) | Correspondence | **Baca terbalik** ✅ |
| `apiSchema` (path channel sah) | Referensi | Dibaca apa adanya ✅ |
| JOLT spec (`channel_jolt_specs`) | Transform | Eksekutor reverse / proyeksi (lihat §6) |
| post-processing rules | Transform | Interpreter reverse terpisah (`ReverseDerivationEngine`) |

> **Kunci wawasan:** data korespondensi **tidak digandakan** untuk reverse; hanya eksekutor transform yang
> punya pasangan reverse. Inilah alasan reverse ini bisa "hemat" dan tidak redundan.

---

## 2. Peta Source-of-Truth (SoT) — satu fakta, satu tempat, dibaca dua arah

Setiap fakta punya **satu** tempat otoritatif. Forward dan reverse sama-sama membacanya. Tidak ada salinan
yang bisa *drift*.

| Fakta | SoT (koleksi/field) | Forward membaca | Reverse membaca |
|---|---|---|---|
| Field master ↔ field channel | **`channel_field_mappings`** (`sourceField`=master, `targetField`=channel) | `sourceField→targetField` | `targetField→sourceField` (`resolveReverseFields`) |
| Nilai master ↔ nilai channel | **`channel_field_value_mappings`** (`mappings[]:{masterValue,channelValue}`) | `masterValue→channelValue` | `channelValue→masterValue` (`ReverseValueMappingService`) |
| Path channel ↔ attr + support-flag | **`ChannelConfiguration.attributeMappings`** | build payload | klasifikasi bucket (a/b/c) |
| Path channel sah | **`ChannelConfiguration.apiSchema`** | target JOLT | tandai field "known" |
| Sumbu varian produk | **`product_types.variantDimensions`** | BUILD_TIER_VARIATION/MODEL | (dimensi juga self-describing di payload) |
| Arah kebenaran per-atribut | **`ecommerce_master_attributes.reverseWritePolicy`** | — | routing R3 (SUGGEST/PER_STORE/SKIP) |
| Versi API channel | **`ChannelConfiguration.apiVersion`** (top-level) | templating `{apiVersion}` | fallback versi pull |
| Cara baca webhook + resep pull + inverse varian | **`ChannelConfiguration.reverseSyncConfig`** | — | webhook/pull/variant-inverse |

### 2a. Redundansi yang SENGAJA DIHAPUS (jangan diperkenalkan lagi)

Tiga fakta pernah punya "salinan kedua"; semuanya dihapus agar SoT tunggal:

1. **`ecommerce_master_attributes.masterFieldName`** sebagai sumber reverse → **dibuang.** Korespondensi field
   sekarang **hanya** dari `channel_field_mappings`. (masterFieldName masih boleh dipakai forward untuk
   value-mapping lookup — peran berbeda; tapi untuk *field correspondence* reverse, ia tak dipakai.)
2. **`reverseSyncConfig.defaultApiVersion`** → **dibuang.** Fallback versi pull memakai top-level
   `apiVersion` (satu sumber; tak bisa drift saat versi dinaikkan).
3. **reverse-JOLT sebagai koleksi tersimpan/eksekutor kedua** → **tidak dibuat.** Ia hanya **proyeksi
   on-demand** dari `channel_field_mappings` (lihat §6).

> **Aturan:** sebelum menambah field/koleksi untuk reverse, cek tabel §2 — kalau faktanya sudah ada di SoT,
> **baca terbalik**, jangan menyalin.

---

## 3. Pipeline reverse (as-built) — perlahan, langkah demi langkah

Dua jalur masuk (**webhook auto-trigger** & **pull/apply manual**) menyatu ke pipeline yang sama:

```
(masuk)
  A. FETCH / RECEIVE payload channel (wrapped, mis. {"product":{…}} / {"item":{…}})
        • pull:    ReverseChannelFetchService.fetchItem  (GET item, data-driven URL+auth)
        • webhook: ReverseWebhookService                 (body webhook = payload penuh, tanpa GET)

  B. ECHO-SUPPRESSION (hanya webhook)  — ReverseWebhookService.isEcho
        skip bila updated_at ≤ lastReverseSyncedAt (dedup) ATAU dalam window 120s dari publishedAt (echo publish sendiri)

  C. DE-DERIVATION  — ReverseDerivationEngine.deDerive   (interpreter reverse post-processing, jalan PALING AWAL)
        • flatten map bersarang → dotted path
        • image-wrapper [{src|uri}] → [url]              (Class-A inverse)
        • dimensi varian self-describing [{name,values|option_list}] → [{name,values}]   (slice-2)
        • struktur lain (model tier_index, dst.) → NOTE "pending" (tak menebak)

  D. RESOLVE FIELD NAMES  — ReverseClassificationService.resolveReverseFields   (channel_field_mappings⁻¹)
        channelPath → masterField, HANYA injektif EXACT/EXACT_OVERRIDE; many-to-one & fuzzy di-skip

  E. TRANSLATE VALUES  — ReverseValueMappingService                             (channel_field_value_mappings⁻¹)
        channelValue → masterValue (mis. LZ_MAT_001 → cotton); tak match → nilai mentah dipertahankan

  F. CLASSIFY (3 ember)  — ReverseClassificationService.classify
        (a) master-mapped   → kandidat master     (+ diff vs nilai master saat ini)
        (b) channel-only     → Step-2 channelData
        (c) unknown/operational → dibuang

  G-scalar. ROUTE BY POLICY  — ReverseReviewService.route                       (reverseWritePolicy)
        DRAFT_REVIEW → ReverseSuggestion (PENDING);  CHANNEL_AUTHORITATIVE → masterOverrides per-store;  MASTER_AUTHORITATIVE/IGNORE → skip
        (master GLOBAL tak pernah ditulis di sini — hanya accept() yang menulisnya)

  G-channelData. CHANNEL-SIDE WRITES (bucket b)  — apply: langsung; webhook: persistChannelSideWrites (konsolidasi)
        field channel-only + attribute_list inverse → MERGE ke channelData; keduanya + variant dalam SATU save

  G-variant. VARIANT INVERSE + RECONCILE  — ReverseVariantInverseService + ReverseVariantReconciler
        per-SKU array channel (descriptor) → [{axisValues, masterFields}] → MERGE ke variantOverrides[sku]

  H. STAMP  — updateReverseStamps (channelUpdatedAt + lastReverseSyncedAt)  → untuk echo-dedup berikutnya
```

**Kenapa de-derivation PALING AWAL?** Payload channel penuh struktur turunan (tier_variation, image_id_list,
option terindeks). Kalau tidak di-un-build dulu, klasifikasi & field-resolve akan salah. Post-processing forward
= langkah **terakhir**; reverse-nya = langkah **pertama** (mirror). (Detail: [`02`](02-reverse-pipeline-and-post-processing.md).)

---

## 4. Guardrail (jangan dilanggar)

1. **Master global tak pernah ditimpa diam-diam.** Reverse hanya menulis ke **per-store `channel_product_data`**
   (masterOverrides/channelData/variantOverrides) atau membuat **draft suggestion**. Satu-satunya jalur yang
   menulis master global = **`ReverseReviewService.accept(suggestionId)`** (aksi manusia).
2. **Reverse tidak pernah menebak.** Field/nilai/struktur yang tak punya korespondensi deterministik:
   many-to-one → skip; strategi fuzzy (SEMANTIC/PATTERN/…) → drop; index di luar rentang → sumbu di-skip;
   nilai tanpa value-mapping → nilai mentah dipertahankan; struktur tak dikenal → NOTE "pending".
3. **Anti-loop (echo-suppression).** Struktural: reverse hanya tulis draft/Step-2 (tak auto-publish → loop putus
   by construction). Temporal: `isEcho` (dedup + window publish).
4. **Non-destruktif MERGE.** Setiap tulis ke row per-store hanya men-*set* key turunan-reverse; field Step-2 yang
   merchant isi tetap utuh.
5. **Data-driven penuh.** Nol literal channel di runtime services/controllers `reversesync`. Semua kosakata
   channel = DATA (`reverseSyncConfig`, `channel_field_mappings`, dst.). Menambah channel = seed config.
6. **SoC keras.** Reverse **BFF-only** — tak pernah menyentuh jalur publish forward maupun Temporal sync worker.

---

## 5. Peta kode (as-built)

### 5a. Package `reversesync` (interpreter reverse — semua di sini)

| Kelas | Peran | Fase |
|---|---|---|
| `ReverseDerivationEngine` | de-derivation (flatten, unwrap image, dimensi varian, `extractItem`, `enrich`/AGGREGATE) | R1/R5 |
| `ReverseClassificationService` | 3-ember classify + `resolveReverseFields` (SoT⁻¹) + `translateValues` | R1/R5 s1 |
| `ReverseValueMappingService` | `channelValue → masterValue` | R5 |
| `ReverseVariantInverseService` | per-SKU inverse via `VariantInverseDescriptor` | R5 |
| `ReverseVariantReconciler` | MERGE variant → `variantOverrides[sku]` | R5 |
| `ReverseAttributeListInverse` | `attribute_list` → channelData keyed by native attribute id | R5 |
| `ReverseWritePolicy` (enum) + `ReverseReviewService` | routing arah-kebenaran + accept/reject | R3 |
| `ReverseApplyService` | tulis Step-2 per-store (masterOverrides/channelData/variantOverrides) | R2 |
| `ReverseChannelFetchService` | GET item (URL+auth data-driven) | R4-pull |
| `ReverseWebhookService` | auto-trigger + echo-suppression (generic) | R4-webhook |
| `ReverseJoltSpecService` + `…model.ReverseJoltSpec` | proyeksi reverse-JOLT (simetri) | R5 |
| Controllers | `/preview` (R1), `/apply` (R2), `/review`+`/suggestions` (R3), `/pull`(+`/apply`) (R4), `/jolt-spec/{channelId}` | — |

### 5b. Perubahan di luar package (aditif, minimal)

| Tempat | Tambahan |
|---|---|
| `ChannelProductData` (+repo) | `publishedApiVersion`, `channelUpdatedAt`, `lastReverseSyncedAt`; `updateReverseStamps`, `updatePublishedApiVersion` |
| `EcommerceMasterAttributeDocument` | `reverseWritePolicy` |
| `ChannelConfiguration` | `reverseSyncConfig` (`ReverseSyncConfig` + `VariantInverseDescriptor` + `AttributeListInverseDescriptor` + `EnricherDescriptor`) |
| `ChannelConfigurationDataLoader` | seed `reverseSyncConfig` **Shopify** (webhook, itemUrlTemplate, variantInverse VALUE_FIELDS) + **Shopee** (itemPath, attributeListInverse, variantInverse INDEX_ARRAY) |
| `ReverseWritePolicyMigration` (@Order 165) | seed `reverseWritePolicy` per atribut inti |
| `ChannelPublishService` | R0: stamp `publishedApiVersion` di sukses publish (bersama persistImageOrder) |

### 5c. Koleksi MongoDB baru

- `reverse_suggestions` — draft-review R3 (PENDING/ACCEPTED/REJECTED).
- (tidak ada koleksi baru untuk korespondensi/JOLT — semua reuse SoT yang ada.)

---

## 6. Reverse-JOLT: kenapa PROYEKSI, bukan koleksi/eksekutor

Master **flat** (seeder tak punya `fieldName` bersarang; `MasterProductData.productAttributes` =
*"raw flat key→value"*). Maka reverse-JOLT **tak menambah kapabilitas** — de-derivation + resolver field (D)
sudah = reverse transform. Karena **simetri arsitektur** yang diinginkan (forward punya JOLT spec → reverse
"seharusnya" bisa dilihat juga), reverse-JOLT dibangun sebagai:

- **Proyeksi on-demand** dari `channel_field_mappings` (dibaca terbalik) — `ReverseJoltSpecService.generate`.
- **Bukan** disimpan → tak bisa drift. **Bukan** eksekutor → runtime tetap pipeline §3.
- Shift `{channelPath→masterField}` hanya baris **injektif** EXACT/EXACT_OVERRIDE; many-to-one dilaporkan di
  `ambiguousExcluded`; fuzzy di-drop.
- Endpoint inspeksi: `GET /api/v1/channels/reverse/jolt-spec/{channelId}` (simetris forward `channel_jolt_specs`).
- Berbagi **satu** logika baca (`resolveReverseFields`) dengan resolver runtime → nol duplikasi.

Tiga mekanisme yang dipertimbangkan & verdict-nya (untuk referensi): (1) balik forward-JOLT mekanis — gagal
(many-to-one + wildcard `&1`); (2) turunkan dari `channel_field_mappings` — **dipilih**; (3) generate dari awal
(agent) — cadangan untuk struktural.

---

## 7. Status terkunci (R0–R5)

| Fase | Isi | Status |
|---|---|---|
| **R0** | linkage/audit fields (`channelProductId`, `publishedApiVersion`, `channelUpdatedAt`, `lastReverseSyncedAt`) | ✅ |
| **R1** | preview read-only (de-derive + 3-ember classify + diff) | ✅ |
| **R2** | apply Step-2 per-store (masterOverrides/channelData) | ✅ |
| **R3** | draft-review + `reverseWritePolicy` (guardrail master global) + seeder policy | ✅ |
| **R4-pull** | GET item dari channel (URL+auth data-driven) | ✅ |
| **R4-webhook** | auto-trigger + echo-suppression (generic, config-driven) | ✅ |
| **R5 · nama field** | `channel_field_mappings⁻¹` (non-1:1) | ✅ |
| **R5 · dimensi** | inverse dimensi varian self-describing | ✅ |
| **R5 · value** | `channel_field_value_mappings⁻¹` | ✅ |
| **R5 · descriptor** | reverse-op descriptor per-SKU (VALUE_FIELDS/INDEX_ARRAY) | ✅ |
| **R5 · reconcile** | variant → `variantOverrides[sku]` (apply **&** webhook, satu save konsolidasi) | ✅ |
| **R5 · reverse-JOLT** | proyeksi inspectable (simetri) | ✅ |
| **R5 · enricher Kelas B (lokal)** | agregasi stok per-lokasi (`AGGREGATE`) | ✅ |
| **R5 · item-level (rebasing)** | `itemPath` — item ter-nest → root (Shopee `response.item_list[0]`) | ✅ |
| **R5 · attribute_list** | `attributeListInverse` → channelData keyed by native attribute id | ✅ |
| **R5 · Shopee end-to-end** | item + varian + attribute_list, diverifikasi vs payload nyata | ✅ |

### 7a. BELUM dibangun (dan kenapa)

- **Enricher Kelas B paruh EKSTERNAL** — `image_id → URL` (via media API channel). Butuh endpoint media
  per-channel; `EnricherDescriptor.type=RESOLVE_MEDIA` sudah disediakan sebagai kontrak, tapi eksekusi ditunda
  (tak ada channel untuk uji e2e). **Paruh LOKAL sudah ada**: `AGGREGATE` (per-location stock → skalar) — lihat
  §3 (E) & baris R5 di [`04`](04-engine-separation-and-industry-comparison.md).
- **Non-Shopify pull/webhook** — **Shopee `variantInverse` sudah di-seed** (diverifikasi vs `get_model_list`
  nyata: `response.model` INDEX_ARRAY, `dimensionOptionValueField="option"`, fieldMap path bersarang). Yang belum
  untuk Shopee: **webhook** (butuh sample envelope) + **pull GET** (butuh HMAC signing). Channel lain = tambah
  config (nol kode). Catatan: descriptor kini mendukung `option_list` objek + fieldMap path bersarang/terindeks
  (`getByPath` dukung `[n]`) — cukup generik untuk shape Shopee/TikTok.
- **SKU-match untuk produk belum ter-link** — webhook tanpa `channelProductId` cocok → kini di-skip; matching by
  SKU = R4.1.
- **Inverse `model` tier_index sebagai NOTE→nilai** di de-derivation — kini dibalik via descriptor di jalur
  variant (bukan de-derivation umum); struktur non-dimensi lain tetap "pending".

---

## 8. Uji (kunci perilaku)

70 tes `reversesync` hijau, semua memanggil helper **pure static** / method publik:

| Test | Fokus |
|---|---|
| `ReverseDerivationEngineTest` (10) | flatten, image unwrap, dimensi, model/non-dim pending, agregasi stok (SUM/MAX/…) |
| `ReverseClassificationServiceTest` (8) | 3-ember, non-1:1 via map, fallback 1:1, normalizePath |
| `ReverseJoltProjectionTest` (5) | injektif→shift, fuzzy dikecualikan, many-to-one dilaporkan, index dinormalisasi |
| `ReverseValueMappingServiceTest` (4) | skalar/list-membership map-back, no-match null |
| `ReverseVariantInverseServiceTest` (4) + `…ShopeeTest` (1) | VALUE_FIELDS (Shopify) + INDEX_ARRAY + `get_model_list` nyata |
| `ReverseItemLevelShopeeTest` (2) | rebasing `itemPath` vs `get_item_base_info` nyata |
| `ReverseAttributeListInverseTest` (4) | attribute_list → channelData (value_id/human/multi-value) |
| `ReverseVariantReconcilerTest` (5) | merge SKU non-destruktif, entri baru, SKU-less axis dedup |
| `ReverseWritePolicyTest` (4) + `…MigrationTest` (4) | route map + intent seed |
| `ReverseWebhookEchoTest` (6) + `…ConfigDrivenTest` (3) | echo/dedup + parse multi-format + `getByPath` index |
| `ReverseChannelFetchServiceTest` (5) | URL template + token resolve data-driven |
| `ReverseApplyMappingTest` (5) | masterOverrides/channelData mapping |

---

## 9. Cara menambah channel baru ke reverse (checklist, nol kode)

1. **`channel_field_mappings`** — pastikan mapping master↔channel ter-generate (matcher AI) / seeded. Reverse
   otomatis membacanya terbalik (injektif EXACT).
2. **`channel_field_value_mappings`** — seed pasangan nilai untuk field SELECT (mis. material/color). Reverse
   otomatis membalik.
3. **`reverseSyncConfig`** di `ChannelConfiguration` (semua opsional; isi sesuai shape channel):
   - **Webhook:** `webhookEnabled` + `productEventTopics` + `productIdPath` + `updatedAtPath` + `updatedAtFormat`.
   - **Pull:** `itemUrlTemplate` (kosongkan bila butuh signing → pull "not configured").
   - **Item nested:** `itemPath` — dot-path (+`[index]`) ke objek item bila ter-wrap (Shopee `response.item_list[0]`);
     null bila item sudah di root (Shopify).
   - **Variant:** `variantInverse` (`perSkuArrayPath`, `dimensionsPath`, `axisRefStyle` INDEX_ARRAY|VALUE_FIELDS,
     `axisIndexField`/`axisValueFields`, `dimensionOptionValueField` bila option list = objek, `fieldMap` dgn key
     path bersarang/terindeks).
   - **Attribute list:** `attributeListInverse` (`arrayPath`, `idField`, `valueListField`, `valueField`) →
     channelData keyed by native attribute id.
   - **Enricher lokal:** `enrichers[]` (`type=AGGREGATE`, `arrayPath`, `valueField`, `strategy`) untuk stok
     per-lokasi → skalar.
4. **`ecommerce_master_attributes.reverseWritePolicy`** — set policy per field yang ingin diaktifkan (DRAFT_REVIEW
   / CHANNEL_AUTHORITATIVE); sisanya default MASTER_AUTHORITATIVE (aman).
5. **`integrationConfig.authentication`** — sudah ada dari forward; reverse pakai `headerName` + `credentialMapping`
   untuk auth GET.

Tidak ada kelas Java yang perlu diubah untuk channel baru. Contoh lengkap terverifikasi (Shopify + Shopee):
lihat `createShopifyConfiguration`/`createShopeeConfiguration` di `ChannelConfigurationDataLoader`.
