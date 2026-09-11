# 06 — R-B4: Seed Shopify (menyalakan mesin)

**Status:** ✅ IMPLEMENTED (`bff-v20`). **Sifat:** seed data — **membalik dorman → AKTIF** untuk Shopify.
**Bagian dari:** rancangan [01](01-category-attributes-reverse-shape-b.md) §11 fase R-B4.
**Prasyarat:** [05 R-B3](05-r-b3-wire-into-reverse-pipeline.md) (seluruh mesin terpasang, dorman).

R-B0..B3 memasang seluruh mesin tapi **dorman** — tak ada channel yang men-seed op-nya, jadi tak pernah
jalan. R-B4 adalah **satu perubahan data** yang menyalakannya untuk Shopify. Nol kode baru; hanya seed.

---

## 1. Kenapa tahap ini ada (dan kenapa terpisah)

Sepanjang R-B0..B3 saya sengaja **tidak** men-seed op-nya. Alasannya disiplin: mesin dibangun + diuji
**tanpa** mengubah perilaku channel mana pun (gated `metafieldInverse == null` → semua kosong). Dengan
memisahkan **membangun** (R-B0..B3, aditif/dorman) dari **menyalakan** (R-B4, seed), tiap langkah aman
di-review sendiri, dan penyalaan adalah satu diff kecil yang jelas.

R-B4 menambah **dua potongan data** ke `reverseSyncConfig` Shopify di `ChannelConfigurationDataLoader`:
1. op **`METAFIELD_INVERSE`** di `operations[]` — memberitahu di mana metafields duduk + cara membacanya.
2. config **`metafieldsFetch`** — resep GraphQL kedua (R-B2) yang menarik metafields (REST tak membawanya).

---

## 2. Yang di-seed (dua potongan)

### (a) op `METAFIELD_INVERSE` (di `operations[]`)
```java
Map.of(
    "op", "METAFIELD_INVERSE",
    "metafieldsPath", "product.metafields",   // = metafieldsFetch.targetPath (di mana R-B2 inject)
    "namespaceField", "namespace",
    "namespace", "shopify",                    // filter: hanya metafield category-attribute
    "keyField", "key",                         // = attribute handle
    "valueField", "value")
```
Urutan op Shopify menjadi: `VARIANT_INVERSE` → `IMAGE_INVERSE` → **`METAFIELD_INVERSE`**. (SHAPE A channel
Shopee/TikTok tak tersentuh — mereka pakai `ATTRIBUTE_LIST`, bukan ini.)

### (b) config `metafieldsFetch`
```java
.metafieldsFetch(MetafieldsFetchConfig.builder()
    .urlTemplate("https://{storeUrl}/admin/api/2024-07/graphql.json")   // PIN 2024-07 (lihat §3)
    .productGidTemplate("gid://shopify/Product/{channelProductId}")
    .query("{ product(id: \"{productGid}\") { metafields(namespace: \"shopify\", first: 250) { nodes { namespace key value } } } }")
    .itemsJsonPath("data.product.metafields.nodes")
    .targetPath("product.metafields")          // inject KE SINI = tempat op membaca
    .build())
```

**Taut penting:** `metafieldsFetch.targetPath` == `METAFIELD_INVERSE.metafieldsPath` == `product.metafields`.
R-B2 inject ke sana; op membaca dari sana. Test seed memverifikasi keduanya identik.

---

## 3. Kenapa PIN 2024-07 (bukan `{apiVersion}`)

`categoryFetch` memakai `{apiVersion}` (di-resolve dari versi pull — bisa 2024-01). Tapi **category
metafields butuh 2024-07+**. Kalau `metafieldsFetch` ikut `{apiVersion}` dan versi pull store = 2024-01
(REST), query metafields akan gagal. Jadi versi **di-hardcode 2024-07** di URL — **persis** seperti forward
mem-pin metafields GraphQL ke 2024-07 (`metafieldDefinitionConfig.apiVersion=2024-07`). REST item tetap
ditarik di versi pull; hanya panggilan metafields yang di-pin.

---

## 4. Efek: dorman → AKTIF (dan jaring pengamannya)

Setelah R-B4, untuk **setiap** pull Shopify (import + reconcile):
- R-B2 `enrichWithMetafields` **jalan** → satu GraphQL call menarik `product.metafields` (namespace shopify).
- R-B3 orchestrator **jalan** → `handlesPresent` → `fetchReverseReferenceData` (read-only) → invert → channelData.

Ini **perubahan perilaku nyata** (nambah panggilan GraphQL per pull) — itulah maksud R-B4. Aman karena:

| Kondisi | Perilaku |
|---|---|
| Store belum re-consent scope metaobject (Area A) | metafields ke-fetch (butuh `read_products` saja), tapi `fetchReverseReferenceData` 403 → **kosong** → category attr di-drop anggun; pull tetap sukses |
| Produk tak punya category metafield | `enrichWithMetafields` inject nol → `handlesPresent` kosong → orchestrator kosong; pull normal |
| Semua scope + re-consent (Area A operasional) | jalur penuh: metafields balik → channelData → round-trip menutup |

Semua jalur **best-effort + graceful** (§6 [`05`](05-r-b3-wire-into-reverse-pipeline.md)); tak ada yang
mem-blok pull. Jadi menyalakan seed aman meski Area A belum beres — fitur cuma diam sampai scope siap.

---

## 5. Sifat: generic terjaga

- **Nol kode baru** — murni data seed. Op + config generik yang sama (R-B0..B3) tak berubah.
- **Hanya Shopify** — channel SHAPE A tak diseed `METAFIELD_INVERSE` → tetap pakai `ATTRIBUTE_LIST`.
- **Channel SHAPE B berikutnya** — cukup tambah op `METAFIELD_INVERSE` + `metafieldsFetch` di seed-nya, nol
  kode.

---

## 6. Cakupan test (`ShopifyReverseMetafieldSeedTest`, 3)

| Test | Membuktikan |
|---|---|
| `operations_appendMetafieldInverse_afterVariantAndImage` | urutan op Shopify = VARIANT_INVERSE, IMAGE_INVERSE, METAFIELD_INVERSE |
| `metafieldInverseOp_bindsThroughReverseOps` | op-map bind ke descriptor (field cocok) + masuk `handledArrayPaths` |
| `metafieldsFetch_isSeeded_pinnedTo2024_07_injectsAtMetafieldsPath` | metafieldsFetch di-seed, pin 2024-07, `targetPath` == `metafieldsPath` op (tertaut) |

Regresi: seluruh test `reversesync` hijau (210 run, 0 failure; 2 error tak-relevan = Testcontainers/Docker
tak tersedia di env, bukan dari seed ini). SHAPE A (Shopee/TikTok) seed tak berubah.

---

## 7. Pointer kode

| Potongan | File |
|---|---|
| Seed op + metafieldsFetch | `channel/config/ChannelConfigurationDataLoader.createShopifyConfiguration` (blok `reverseSyncConfig`) |
| Test | `reversesync/ShopifyReverseMetafieldSeedTest` |

---

## 8. Berikutnya (R-B5 — terakhir)

**R-B5 — Live-verify round-trip**, setelah Area A operasional (scopes + re-consent — lihat
[forward guide 07 §Area A](../../product/07-publishing-engine/01-guides/shopify/07-spike-and-go-no-go.md)):
1. Publish satu produk apparel dgn beberapa category attribute (Fabric/Color/…) terisi.
2. Reverse-pull produk yang sama.
3. Verifikasi `channel_product_data.channelData` berisi atribut itu (keyed by nama) dengan **TaxonomyValue
   GID yang sama** yang Step-2 simpan → diff kosong → status sinkron jujur (round-trip menutup).
4. Cek log: `ReverseSync SHAPE B [shopify/...]: N category attribute(s) → channelData`.

Kembali ke rancangan → [01](01-category-attributes-reverse-shape-b.md).
