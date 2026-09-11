# 07 — R-B5: Live-Verify Round-Trip (runbook / checklist)

**Status:** ⏳ RUNBOOK (menunggu Area A operasional). **Sifat:** verifikasi live, **bukan kode**.
**Bagian dari:** rancangan [01](01-category-attributes-reverse-shape-b.md) §11 fase R-B5.
**Prasyarat:** [06 R-B4](06-r-b4-seed-shopify.md) (seed AKTIF) + **Area A operasional** (scopes + re-consent —
lihat [forward guide 07 §Area A](../../product/07-publishing-engine/01-guides/shopify/07-spike-and-go-no-go.md)).

Semua kode reverse SHAPE B (R-B0..B4) sudah selesai & aktif. Yang tersisa: **membuktikan round-trip di store
nyata** — publish produk dengan category attribute → tarik balik → pastikan `channelData` berisi **nilai yang
sama** yang Step-2 simpan (diff kosong = loop menutup). Dokumen ini checklist + curl-nya, langkah demi langkah.

---

## 0. Parameter (set sekali)

```sh
BASE="http://localhost:8888/labamap"        # BFF (server.port 8888, base-path /labamap)
ORG="<organizationId>"                        # mis. "default"
SID="<storeId>"                               # id ChannelStoreConnection store Shopify
MID="<masterProductId>"                       # produk master yang dipublish
PID="<channelProductId>"                      # id produk Shopify (angka, mis. 10458184843554)

SHOP="<toko>.myshopify.com"                   # untuk curl GraphQL langsung ke Shopify (debug)
TOKEN="shpat_xxx"                             # Admin API token store (sudah re-consent)

# helper GraphQL langsung ke Shopify (2024-07 — versi metafields)
gql() { curl -s -X POST "https://$SHOP/admin/api/2024-07/graphql.json" \
  -H "X-Shopify-Access-Token: $TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -nc --arg q "$1" '{query:$q}')" | jq .; }

# helper POST ke BFF reverse
rev() { curl -s -X POST "$BASE/api/v1/channels/reverse/$1" \
  -H "Content-Type: application/json" -d "$2" | jq .; }
```

---

## 1. Prasyarat — pastikan Area A beres (gerbang scope)

Round-trip **tak akan** menghasilkan category attribute kalau store belum re-consent scope metaobject —
`fetchReverseReferenceData` akan 403 (di-drop anggun). Verifikasi dulu:

```sh
gql '{ currentAppInstallation { accessScopes { handle } } }'
```
**Harus memuat:** `read_metaobjects`, `read_metaobject_definitions` (dan `write_metaobject_definitions` untuk
forward). Kalau tidak → selesaikan [Area A runbook](../../product/07-publishing-engine/01-guides/shopify/07-spike-and-go-no-go.md)
(tambah scope di Partner Dashboard → set `SHOPIFY_OAUTH_SCOPES` → restart → re-consent store) dulu.

---

## 2. Setup — publish produk dengan category attribute terisi

Publish (atau pastikan sudah terpublish) satu produk apparel yang kategorinya ter-set + minimal 2 category
attribute (mis. **Fabric**, **Color**) terisi di Step-2. Ini jalur **forward** biasa (guide forward Tahap
A–D). Catat `MID`, `SID`, `PID`.

> Kenapa perlu terisi: reverse hanya bisa menarik balik apa yang **ada** di produk Shopify. Kalau forward
> belum menaruh metafield-nya, reverse benar-benar tak menemukan apa-apa (bukan bug).

---

## 3. Gerbang R-B2 — buktikan produk Shopify PUNYA category metafields

Ini query **persis** yang `metafieldsFetch` pakai. Kalau kosong di sini, reverse pasti kosong (masalah di
forward/produk, bukan reverse):

```sh
gql '{ product(id: "gid://shopify/Product/'"$PID"'") {
  metafields(namespace: "shopify", first: 250) { nodes { namespace key value } }
} }'
```
**Harapan:** array berisi mis. `{ "key":"fabric", "value":"[\"gid://shopify/Metaobject/…\"]" }`,
`{ "key":"color-pattern", "value":"[\"gid://shopify/Metaobject/…\"]" }`. Catat `key` (handle) + `value`
(Metaobject GID) — ini yang reverse akan balikkan.

*(Opsional, buktikan resolver R-B1 punya bahan)* — lihat TaxonomyValue di balik satu Metaobject:
```sh
gql '{ metaobject(id: "gid://shopify/Metaobject/<DARI_ATAS>") {
  fields { key value }
} }'
```
Cari field ber-suffix `taxonomy_reference` → nilainya `gid://shopify/TaxonomyValue/…`. Itulah nilai yang
seharusnya muncul di `channelData` setelah reverse.

---

## 4. Reverse PULL (read-only preview) — belum menulis

```sh
rev pull '{"organizationId":"'"$ORG"'","storeId":"'"$SID"'","channelProductId":"'"$PID"'","masterProductId":"'"$MID"'"}'
```
Ini **fetch + classify** tanpa menulis. Cek respons preview tidak error. (Category attribute muncul di jalur
`channelData`/`channelOnly` klasifikasi tergantung, tapi pull-apply di langkah 5 yang menuntaskan.)

**Cek log BFF** selama langkah ini:
```sh
grep -nE "GraphQL fetched .* category metafield|SHAPE B \[shopify" logs/labamap.log | tail
```
Harapan: `GraphQL fetched N category metafield(s) → injected at product.metafields` (R-B2 jalan).

---

## 5. Reverse PULL/APPLY (reconcile) — MENULIS ke channelData

```sh
rev pull/apply '{"organizationId":"'"$ORG"'","storeId":"'"$SID"'","channelProductId":"'"$PID"'","masterProductId":"'"$MID"'"}'
```
**Harapan respons** (`ReverseApplyResult`): `applied: true`, dan `channelDataWritten` memuat **nama atribut**
(mis. `["Fabric","Color", …]`).

**Cek log:**
```sh
grep -nE "SHAPE B \[shopify/.*\]: [0-9]+ category attribute" logs/labamap.log | tail
```
Harapan: `ReverseSync SHAPE B [shopify/<SID>]: 2 category attribute(s) → channelData [Fabric, Color]`.

---

## 6. Inspeksi `channelData` — nilai balik = nilai Step-2?

Baca row `channel_product_data` (Mongo):
```sh
mongosh "<MONGO_URI>" --quiet --eval \
 'JSON.stringify(db.channel_product_data.findOne({masterProductId:"'"$MID"'",storeId:"'"$SID"'"},{channelData:1,_id:0}))'
```
**Harapan:** `channelData` memuat `"Fabric": "gid://shopify/TaxonomyValue/…"`, `"Color": "gid://…/TaxonomyValue/…"`
— **keyed by nama atribut**, nilainya **TaxonomyValue GID** (yang §3 opsional tunjukkan), **bukan** Metaobject
GID. Inilah bukti dua inversi (handle→nama, Metaobject→TaxonomyValue) jalan.

---

## 7. Assertion round-trip — loop menutup (diff kosong)

Bandingkan nilai yang reverse tulis dengan yang Step-2 **sudah** simpan (dari publish forward):
- Ambil nilai Step-2 semula (sebelum reverse) untuk atribut yang sama.
- **Sama persis** → round-trip **no-op**: reverse tak mengubah apa pun → dirty-detection stabil → status
  sinkron **jujur**. ✅ Ini jawaban tuntas keluhan awal (*"ubah fabric/care, status tetap tersync"*).

Uji sinyal-perubahan (opsional, membuktikan dirty-detection HIDUP):
1. Di Step-2, **ubah** Color ke nilai lain → publish → status jadi "ada perubahan" lalu "tersync".
2. Reverse pull/apply lagi → `channelData["Color"]` = TaxonomyValue GID **baru** (mengikuti perubahan di
   channel). Tak ada drift palsu, dan perubahan nyata terdeteksi.

---

## 8. Ringkas checklist

- [ ] **Area A**: `accessScopes` memuat `read_metaobjects` + `read_metaobject_definitions` (§1).
- [ ] **Produk siap**: kategori ter-set + ≥2 category attribute terisi (§2).
- [ ] **R-B2 gate**: query metafields langsung ke Shopify mengembalikan nodes (§3).
- [ ] **Pull preview**: `/reverse/pull` sukses + log `GraphQL fetched … metafield(s)` (§4).
- [ ] **Pull apply**: `/reverse/pull/apply` → `channelDataWritten` memuat nama atribut (§5).
- [ ] **channelData**: berisi `nama → TaxonomyValue GID` (bukan Metaobject GID) (§6).
- [ ] **Round-trip**: nilai balik == nilai Step-2 → diff kosong (§7).

---

## 9. Troubleshooting — kalau `channelData` kosong, gerbang mana?

| Gejala | Gerbang | Aksi |
|---|---|---|
| §3 metafields Shopify kosong | forward belum menaruh metafield | selesaikan forward (Tahap A–D) / isi atribut; bukan masalah reverse |
| §4 log tak ada `GraphQL fetched … metafield` | R-B2 tak jalan | pastikan `metafieldsFetch` ter-seed (R-B4) + bearer token store ada |
| Log `SHAPE B … skipped: … (Area A)` / 403 | scope metaobject belum ada | selesaikan Area A (§1) + re-consent store |
| `handlesPresent` kosong padahal §3 ada nodes | namespace/keyField mismatch | pastikan metafield ber-namespace `shopify` (op filter namespace) |
| channelData berisi **Metaobject GID**, bukan TaxonomyValue | `refObjToCanonical` kosong | metaobject tak punya `*_taxonomy_reference`, atau moDefId tak ke-resolve; cek §3 opsional |
| `pull/apply` error "No master product linked" | produk belum ter-link | suplai `masterProductId` di body (sudah di curl §5) |

---

## 10. Setelah lulus

Beri tahu saya hasilnya (respons `pull/apply` + `channelData` + log SHAPE B). Kalau ada atribut yang balik
sebagai Metaobject GID atau ter-drop, kita telusuri via §9 + guide forward. Setelah round-trip lulus di satu
sandbox store, reverse SHAPE B **tuntas end-to-end** dan bisa dinyatakan production-ready (per store yang
sudah re-consent).

Kembali ke rancangan → [01](01-category-attributes-reverse-shape-b.md).
