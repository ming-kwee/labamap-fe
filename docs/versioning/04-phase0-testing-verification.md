# Phase 0 — Testing & Verification (curl)

> Pendamping [`01-channel-api-schema-versioning.md`](01-channel-api-schema-versioning.md) &
> [`../FRONTEND-JOLT-SPEC-SCHEMA-STALENESS.md`](../FRONTEND-JOLT-SPEC-SCHEMA-STALENESS.md).
> Cara memverifikasi Phase 0 (apiVersion + apiSchemaHash + targetSchemaHash + deteksi stale) lewat API.

**Prasyarat**
- **Rebuild + restart** backend (bukan sekadar restart) agar loader men-stamp config & endpoint aktif.
- **MongoDB jalan.**
- Base URL: `http://localhost:8888` + context-path `/labamap` (port 8888, `webflux.base-path=/labamap`).
- `| jq` opsional (hapus bila belum terpasang).

---

## 1. Config ter-stamp — `apiVersion` + `apiSchemaHash`

```bash
curl -s http://localhost:8888/labamap/api/v1/admin/channel-configurations/shopify \
  | jq '{channelId, apiVersion, apiSchemaHash, version}'
```
```json
{ "channelId": "shopify", "apiVersion": "2024-01", "apiSchemaHash": "sha256:9f8e7d6c…", "version": "1.0" }
```

---

## 2. Publish-trace — `joltSpec.apiVersion` + `schemaStale` + `warnings`

Read-only (dry-run: tidak memanggil channel, tidak menulis DB). Body = `PublishProductRequest` (sama
seperti publish). Tambah `"storeId"`/`"organizationId"` bila alur pakai store.

```bash
curl -s -X POST http://localhost:8888/labamap/api/v1/channels/publish/trace \
  -H 'Content-Type: application/json' \
  -d '{
    "masterProductId": "ad65d950-731f-41d3-8054-65d6afc2232c",
    "channelId": "shopify",
    "masterProductData": {
      "name": "test 5 aug",
      "sku": "GM-001",
      "price": 123000,
      "productTypeId": "69ef31373f090e6ccb469bf2",
      "channelCategoryId": "gid://shopify/TaxonomyCategory/aa-1-7-8-7",
      "option1_name": "Size", "option1_values": ["Xs","S"],
      "option2_name": "Color", "option2_values": ["Black"],
      "variants": [
        {"sku":"SKU-XS-BLACK","price":12000,"inventory":2,"size":"Xs","color":"Black","option1":"Xs","option2":"Black"},
        {"sku":"SKU-S-BLACK","price":13000,"inventory":2,"size":"S","color":"Black","option1":"S","option2":"Black"}
      ]
    }
  }' \
  | jq '{resolvedCategory, joltSpec, warnings}'
```
```json
{
  "resolvedCategory": "clothing",
  "joltSpec": { "source":"channel_jolt_specs", "categoryId":"clothing",
                "generatedBy":"ai-agent-v1", "apiVersion":"2024-01", "schemaStale": true, "operations": 8 },
  "warnings": ["JOLT spec for category 'clothing' was generated against an older apiSchema (schemaStale) — regenerate it; …"]
}
```
> Spec legacy (belum ter-stamp) → `schemaStale` **tidak muncul** (= UNKNOWN). `source="request"/"none"` →
> bukan generated spec, tidak ada `schemaStale`.

---

## 3. Laporan staleness admin

```bash
# semua channel, semua status
curl -s 'http://localhost:8888/labamap/api/v1/admin/channel-jolt-specs/staleness' | jq '.'

# hanya yang STALE, dibatasi shopify
curl -s 'http://localhost:8888/labamap/api/v1/admin/channel-jolt-specs/staleness?channelId=shopify&onlyStale=true' | jq '.'
```
```json
[
  { "id":"665f0a…", "channelId":"shopify", "categoryId":"clothing", "organizationId":null,
    "isSystemDefault":false, "generatedBy":"ai-agent-v1",
    "specApiVersion":"2024-01", "specTargetSchemaHash":"sha256:1a2b…",
    "channelApiVersion":"2024-01", "channelApiSchemaHash":"sha256:9f8e…", "status":"STALE" }
]
```
`status`: `STALE` (regenerate) · `FRESH` (cocok) · `UNKNOWN` (unstamped/legacy atau channel tanpa fingerprint).

---

## 4. Regenerate — hapus spec (dibangun ulang & ter-stamp pada publish/analyse berikutnya)

```bash
# satu spec
curl -s -X DELETE http://localhost:8888/labamap/api/v1/admin/channel-jolt-specs/665f0a…

# bulk per channel (+ optional categoryId/organizationId)
curl -s -X DELETE 'http://localhost:8888/labamap/api/v1/admin/channel-jolt-specs?channelId=shopify&categoryId=clothing'
```
> Regenerasi **tidak sinkron** — DELETE hanya menghapus; spec baru muncul saat publish/analyse berikut.
> Spec `isManuallyConfigured=true` (human-owned) tidak diregenerasi otomatis oleh agent.

---

## 5. Resep melihat `STALE=true` (deteksi bersifat forward-looking)

Spec yang dibuat **sebelum** Phase 0 berstatus **UNKNOWN**, bukan STALE. Untuk memunculkan STALE:

1. **Rebuild + restart** → config ter-stamp `apiSchemaHash = H1`.
2. **Regenerasi** 1 spec kategori (§4 DELETE, lalu publish/analyse) → spec baru ter-stamp
   `targetSchemaHash = H1` → trace `schemaStale=false` (FRESH).
3. **Ubah** sedikit `create*ApiSchema` → rebuild + restart → `apiSchemaHash = H2`.
4. **Publish/analyse** kategori sama **tanpa** regenerasi → `H1 ≠ H2` → trace `schemaStale=true` + warning,
   dan §3 melistnya `STALE`.

Tanpa langkah 2–3, wajar yang terlihat UNKNOWN/FRESH — itu benar, bukan bug.
