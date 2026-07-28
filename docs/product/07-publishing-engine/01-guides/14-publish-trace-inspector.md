# Publish-Trace Inspector

> Dry-run yang menampilkan **apa yang dilakukan pipeline publish tahap demi tahap** untuk satu produk +
> channel, **tanpa** memanggil channel. Mengubah "kenapa field X hilang/salah?" dari arkeologi 5–7 lapisan
> (dan publish live berulang) menjadi **satu lookup data**. Ditambahkan 2026-07-27.

## Kenapa

Sepanjang debugging Shopee, memperbaiki satu field (`category_id`, `image`, `attribute_list`) butuh
menelusuri: merge channelData → resolve kategori → resolve JOLT (priority) → apiSchema → post-processing →
filter support-field → metadata workflow sync-service. Lapisan-lapisan itu **opak** (tak terlihat apa yang
dilakukan tiap tahap) — jadi kita debug lewat 6 publish live ke Shopee. Inspector ini membuat lapisan itu
**tembus pandang**.

## Endpoint

```
POST /api/v1/channels/publish/trace
```

Body **sama** dengan endpoint publish (`masterProductId`, `masterProductData`, `channelId`, `storeId`,
`organizationId`). Read-only: **tidak** memanggil channel API, **tidak** menulis DB.

## Yang dikembalikan (`PublishTraceResponse`)

| Field | Guna |
|---|---|
| `joltSpec` | **Spec mana yang menang** (`source`, `categoryId`, `generatedBy`, `version`, `operations`). Ini akar-masalah paling sering: spec `ai-agent-v1` menjatuhkan field yang tak dipetakan dari master→apiSchema. |
| `afterMerge` | Data setelah merge master + Step-2 (channelData/overrides) — input transform. |
| `afterJolt` | Output JOLT (sebelum post-processing) — lihat field mana yang JOLT jatuhkan. |
| `stagedKeys` | Reserved `_`-key yang di-stage JOLT-independent (`_sourceImages`, `_channelCategoryId`, `_categoryAttributes`, `_resolvedLogistics`). |
| `postProcessing[]` | **Per-rule**: `rule`, `priority`, `source`, `target`, `keysAdded`, `keysRemoved`, `targetValueAfter`. Lihat rule mana yang membangun/mengubah field. |
| `afterPostProcessing` | Dokumen setelah semua rule. |
| `channelAttributes[]` | channelAttributes final **persis** seperti `buildChannelAttributes` (termasuk `isSupportField`). |
| `supportFieldsExcludedBySync` | Nama atribut ber-`isSupportField=true` — **dikecualikan dari body** oleh sync-service (penyebab "Image is required" tahap 2). |
| `stagingKeysStripped` | `_`-key yang di-strip buildChannelAttributes (tak pernah masuk body). |
| `warnings` | Termasuk catatan fidelity v1. |

## Contoh diagnosis (bug hari ini)

- **`category_id` hilang** → `joltSpec.generatedBy = "ai-agent-v1"`, di `afterJolt` tak ada `category_id`,
  di `postProcessing` rule `shopee-set-category-id` `keysAdded:["category_id"]` → jelas dibangun di
  post-processing, bukan JOLT.
- **`image` "required" walau write-back sukses** → `channelAttributes` menampilkan `image` dengan
  `isSupportField:true` + muncul di `supportFieldsExcludedBySync` → ketahuan dikecualikan dari body.
- **Material/Pattern hilang** → `stagedKeys` memuat `_categoryAttributes`, `postProcessing` rule
  `shopee-build-attribute-list` `targetValueAfter` menunjukkan `attribute_list` yang dibangun.

## Fidelity (v1)

Semua snapshot ditangkap dari **service produksi yang sama** (JOLT transform, `GenericPostProcessingEngine`,
`buildChannelAttributes`) — bukan re-implementasi — jadi trace tak bisa diam-diam menyimpang dari publish
nyata. Instrumentasi engine bersifat opsional (`process(data, config, traceOut)`); pemanggil produksi
memakai overload lama tanpa perubahan.

**Direplikasi dari service produksi nyata:** resolusi JOLT + ownership-contract remediation, JOLT transform,
staging `_`-key, post-processing (per-rule, dengan `targetValueAfter` yang di-deep-copy agar tak tertimpa
rule berikutnya), langkah wrap+guard pasca-JOLT (`removeSrclessImages` / `normalizeCategoryGid` / wrap —
sehingga `channelAttributes` faithful untuk channel ber-wrapper Shopify/Wix maupun flat Shopee/TikTok), dan
`buildChannelAttributes`. Kredensial store **tak** diperlukan (`buildChannelAttributesForInspection`
credential-free).

**Belum direplikasi di v1** (dicatat di `warnings`): normalisasi array `mainImage` pra-JOLT, dan
`translatePostJoltVariants` reaktif (patch value_id sales_attributes TikTok/Lazada).

## File

| File | Perubahan |
|---|---|
| `channel/service/GenericPostProcessingEngine.java` | overload `process(data, config, traceOut)` per-rule (aman) |
| `publishing/service/ChannelAttributeConverterService.java` | `buildChannelAttributesForInspection` (ekspos builder, credential-free) |
| `publishing/model/response/PublishTraceResponse.java` | **baru** — DTO trace |
| `publishing/service/ChannelPublishService.java` | `tracePublish` + `buildTrace` (reuse service produksi) |
| `publishing/controller/ChannelPublishController.java` | endpoint `POST /publish/trace` |
