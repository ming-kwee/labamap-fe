# Frontend Contract — Publish-Trace Inspector

> Endpoint diagnostik: jalankan pipeline publish **dry-run** (tanpa memanggil channel) dan dapatkan
> snapshot **tahap demi tahap** — untuk menjawab "kenapa field X hilang/salah di payload channel?".
> Untuk frontend/dev tim. Ditambahkan 2026-07-27. Backend guide: `docs/product/07-publishing-engine/01-guides/14-publish-trace-inspector.md`.

## TL;DR untuk frontend

- **Tidak perlu UI khusus untuk menguji** — body request **identik** dengan endpoint publish. Tim backend
  bisa tes via curl/Postman lebih dulu.
- Untuk produk: tambahkan aksi **"Diagnose" / "Kenapa gagal?"** di layar publish yang memanggil endpoint ini
  dan menampilkan hasilnya (JSON viewer atau panel bertahap). Read-only, aman dipanggil kapan saja.

## Endpoint

```
POST  {BASE}/api/v1/channels/publish/trace
```

- `BASE` = `http://<host>:8888/labamap` (port 8888, base-path `/labamap`).
- Auth/headers: **sama persis** dengan `POST {BASE}/api/v1/channels/publish` (endpoint di controller yang sama).
- Read-only: **tidak** memanggil channel API, **tidak** menulis DB. Aman diulang.

## Request body

Sama dengan body publish. Field yang dipakai trace:

| Field | Wajib | Catatan |
|---|---|---|
| `masterProductId` | ya | id produk master |
| `masterProductData` | **ya** | data produk master (map) — titik awal transform. Tanpa ini, respons hanya berisi `warnings`. |
| `channelId` | ya | mis. `"shopee"`, `"tiktokshop"`, `"shopify"` |
| `storeId` | ya | store instance, mis. `"shopee-shopee-01"` — dipakai memuat data Step-2 (channelData/overrides) |
| `organizationId` | ya | untuk resolusi org-scoped |

```jsonc
// POST {BASE}/api/v1/channels/publish/trace
{
  "masterProductId": "6b94ba9a-e1a2-4ac6-a183-c14b4e2730eb",
  "channelId": "shopee",
  "storeId": "shopee-shopee-01",
  "organizationId": "org-e7dac9f8-6353-4168-b9a1-6a7791d71b02",
  "masterProductData": { "name": "T-Shirt", "price": 0, "weight": 0, "variants": [ ... ] }
}
```

## Response (`PublishTraceResponse`)

`Content-Type: application/json`. Field bernilai null **diomit** (`@JsonInclude(NON_NULL)`).

| Field | Tipe | Guna diagnosis |
|---|---|---|
| `joltSpec` | object | **Spec mana yang menang**: `source` (`channel_jolt_specs`\|`request`\|`none`), `categoryId`, `generatedBy` (`ai-agent-v1` = generated, `system-default` = seed), `version`, `operations`. Akar-masalah paling sering. |
| `resolvedCategory` | string | slug kategori master untuk lookup JOLT |
| `channelCategoryId` | string | id kategori native channel (mis. Shopee `300242`) dari Step-2 |
| `afterMerge` | object | data setelah merge master + Step-2 (input transform) |
| `afterJolt` | object | output JOLT (sebelum post-processing) — lihat field yang JOLT jatuhkan |
| `stagedKeys` | string[] | reserved `_`-key (`_sourceImages`, `_channelCategoryId`, `_categoryAttributes`, `_resolvedLogistics`) |
| `postProcessing` | object[] | **per-rule**: `rule`, `priority`, `source`, `target`, `keysAdded`, `keysRemoved`, `targetValueAfter` |
| `afterPostProcessing` | object | dokumen setelah semua rule |
| `channelAttributes` | object[] | atribut final persis seperti dikirim: `chnlAttrName`, `attrId`, `type`, `isSupportField`, `value` |
| `supportFieldsExcludedBySync` | string[] | atribut `isSupportField=true` — **dikecualikan dari body** channel |
| `stagingKeysStripped` | string[] | `_`-key yang di-strip (tak masuk body) |
| `warnings` | string[] | termasuk catatan fidelity |

### Contoh response (dipangkas)

```jsonc
{
  "masterProductId": "6b94ba9a-...",
  "channelId": "shopee",
  "storeId": "shopee-shopee-01",
  "resolvedCategory": "clothing",
  "channelCategoryId": "300242",
  "joltSpec": {
    "source": "channel_jolt_specs",
    "categoryId": "clothing",
    "generatedBy": "ai-agent-v1",      // ← spec generated MENANG atas seed
    "version": "1.0",
    "operations": 12
  },
  "afterJolt": { "item_name": "T-Shirt", "original_price": 0 },   // ← tak ada category_id / image
  "stagedKeys": ["_channelCategoryId", "_categoryAttributes", "_resolvedLogistics", "_sourceImages"],
  "postProcessing": [
    { "rule": "shopee-set-category-id", "priority": 6, "source": "_channelCategoryId",
      "target": "category_id", "keysAdded": ["category_id"], "keysRemoved": [], "targetValueAfter": 300242 },
    { "rule": "shopee-build-attribute-list", "priority": 28, "source": "_categoryAttributes",
      "target": "attribute_list", "keysAdded": ["attribute_list"], "keysRemoved": [],
      "targetValueAfter": [ { "attribute_id": 200134, "attribute_value_list": [ { "value_id": 1221 } ] } ] }
  ],
  "channelAttributes": [
    { "chnlAttrName": "category_id", "attrId": "category_id", "type": "int", "isSupportField": false, "value": "300242" },
    { "chnlAttrName": "image", "attrId": "product_image", "type": "object", "isSupportField": false, "value": "{}" },
    { "chnlAttrName": "images", "attrId": "product_images", "type": "object", "isSupportField": true, "value": "{...}" }
  ],
  "supportFieldsExcludedBySync": ["images", "tier_variation"],
  "warnings": ["v1 fidelity: pre-JOLT mainImage array-normalization dan translatePostJoltVariants reaktif tidak direplikasi. ..."]
}
```

## Cara frontend memakainya (saran UX)

Panel diagnostik sederhana di layar publish (muncul saat publish gagal, atau tombol "Diagnose"):

1. **Ringkasan** — tampilkan `joltSpec.generatedBy` + `joltSpec.source`. (Jika `ai-agent-v1`, itu petunjuk field bisa hilang.)
2. **Cari field** — input "field name"; highlight di tahap mana ia pertama muncul/hilang:
   - ada di `afterJolt`? tidak → cek `postProcessing[].keysAdded` untuk menemukan rule pembangunnya.
   - ada di `channelAttributes` tapi `isSupportField:true`? → beri tahu "field ini dikecualikan dari body channel".
3. **Timeline** — render `postProcessing[]` sebagai daftar (rule → keysAdded/Removed → targetValueAfter).
4. **Body final** — tabel `channelAttributes` dengan kolom `isSupportField` disorot; badge merah untuk yang di `supportFieldsExcludedBySync`.

Minimal viable: cukup tampilkan seluruh JSON di `<pre>` / JSON-viewer collapsible. Sudah sangat menolong.

## Error & catatan

- **200 OK** selalu untuk trace yang berjalan (termasuk saat pipeline menemukan masalah — masalahnya ada di
  isi, bukan status). **500** hanya untuk kegagalan tak terduga → body berisi `warnings:["Trace failed: ..."]`.
- `masterProductData` kosong → 200 dengan `warnings:["masterProductData is required ..."]` (bukan error).
- **Fidelity v1** (lihat `warnings`): normalisasi array `mainImage` pra-JOLT dan `translatePostJoltVariants`
  reaktif (patch value_id sales_attributes TikTok/Lazada) belum direplikasi. Resolusi JOLT, staging,
  post-processing per-rule, wrap/guard, dan `channelAttributes` ditangkap dari service produksi nyata.
