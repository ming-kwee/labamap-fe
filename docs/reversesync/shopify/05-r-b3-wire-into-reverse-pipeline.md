# 05 — R-B3: Wire ke Pipeline Reverse (implementasi)

**Status:** ✅ IMPLEMENTED (`bff-v20`). **Sifat:** aditif, gated, graceful, dorman. **Increment I/O utama.**
**Bagian dari:** rancangan [01](01-category-attributes-reverse-shape-b.md) §11 fase R-B3.
**Prasyarat:** [02 R-B0](02-r-b0-pure-inverse-implementation.md) (mesin), [03 R-B1](03-r-b1-build-inverse-lookups.md)
(peta), [04 R-B2](04-r-b2-fetch-metafields.md) (item ber-metafields).

R-B0/B1/B2 adalah potongan **terpisah**. R-B3 **menyatukannya** jadi satu langkah reactive, dan menyolokkannya
ke jalur reverse yang nyata — tepat di tempat SHAPE A (`ATTRIBUTE_LIST`) menyolok, secara simetris.

---

## 1. Kenapa tahap ini ada

Sampai R-B2, semua bagian ada tapi **tak tersambung**: tak ada yang memanggil `ReverseMetafieldInverse.invert`,
tak ada yang mengisi `channelData`. R-B3 menyediakan:
1. **fetch data referensi read-only** (yang menghasilkan dua peta R-B1 butuh) — satu-satunya I/O baru;
2. **orchestrator** yang merangkai R-B0/B1/B2 jadi `Mono<channelData entries>`;
3. **colok** ke `ReverseApplyService` (reconcile) + `ReverseImportService` (import), simetris `ATTRIBUTE_LIST`.

---

## 2. Di mana ia menyolok (simetri SHAPE A)

SHAPE A (Shopee/TikTok) sudah menyolok begini di kedua entry reverse:
```java
var attributeListInverse = ReverseOps.attributeListInverse(rc);
if (attributeListInverse != null)
    channelData.putAll(ReverseAttributeListInverse.invert(attributeListInverse, item));   // SHAPE A: sinkron
```
SHAPE B menyolok **di titik yang sama**, hanya nilainya **async** (butuh fetch dua peta):
```java
channelData.putAll( metafieldEnrichService.shapeBChannelData(rc, item, channelType, storeId, orgId) );  // SHAPE B: Mono
```
Beda satu-satunya: SHAPE A `invert(descriptor, item)` cukup item; SHAPE B `invert(descriptor, item, ①, ②)`
butuh dua peta → satu fetch read-only. Karena itu R-B3 punya I/O; SHAPE A tidak.

---

## 3. Tiga bagian yang dibangun

### (a) Fetch data referensi READ-ONLY — `GenericCategoryService.fetchReverseReferenceData`
Counterpart **read-only** dari `enrichCategoryMetafields` (forward). Mengambil:
- `defsByName` (metafieldDefinitions + katalog Tahap A) — reuse fetch forward;
- per-def `TaxonomyValue→Metaobject` (`MetaobjectTaxonomyMapper.parse`), **di-scope** ke `handlesPresent`
  (hanya definisi yang produk ini benar-benar rujuk → hemat).

**Kritis: TANPA Jalur B write.** Forward `enrichCategoryMetafields` meng-upsert metaobject (Jalur B) + enrich;
reverse **tak boleh memutasi toko**, jadi `fetchReverseReferenceData` hanya **membaca** (fetch defs + fetch
metaobjects, stop). Mengembalikan struktur **mentah** (`ReverseReferenceData{defsByName, perDefTaxToMeta}`) —
sengaja tak dibalik di sini agar **forward tak bergantung ke paket reverse** (layering).

Graceful: tanpa config / nol handle / error apa pun (mis. 403 sebelum re-consent — Area A) → kosong.

### (b) Orchestrator — `ReverseMetafieldEnrichService.shapeBChannelData`
Merangkai semua jadi satu Mono:
```
op METAFIELD_INVERSE ada?  (tidak → kosong, dorman)
   → handlesPresent (R-B0)  (item bawa handle apa? tak ada → kosong)
   → fetchReverseReferenceData(scoped)  (read-only, R-B3a)
   → handleToName + refObjToCanonical (R-B1, membalik struktur mentah)
   → ReverseMetafieldInverse.invert (R-B0)
   → channelData entries
```
Di sinilah R-B1 dipakai (membalik `ReverseReferenceData` → dua peta), menjaga layering: **reverse** yang
bergantung ke forward, bukan sebaliknya.

### (c) Colok ke dua entry reverse
- `ReverseApplyService.apply` (reconcile): `shapeBChannelData(...).flatMap(shapeB -> { channelDataWrites.putAll(shapeB); … })`.
- `ReverseImportService.buildAndMaybeCommit` (import): terima param `shapeB`, `channelData.putAll(shapeB)` tepat
  setelah `attribute_list`.

---

## 4. Wireframe: dari item ke channelData (jalur lengkap)

```
item (dgn product.metafields dari R-B2)
        │
        ▼  ReverseMetafieldEnrichService.shapeBChannelData
   handlesPresent(item) = {fabric, color-pattern}          (R-B0, scope)
        │
        ▼  GenericCategoryService.fetchReverseReferenceData(handles)   [READ-ONLY, no Jalur B]
   ReverseReferenceData{ defsByName, perDefTaxToMeta }
        │
        ▼  ReverseMetafieldResolvers (R-B1, flip)
   handleToName={fabric→Fabric, color-pattern→Color}
   refObjToCanonical={Metaobject/10→TaxonomyValue/1, …}
        │
        ▼  ReverseMetafieldInverse.invert (R-B0)
   channelData = { Fabric: TaxonomyValue/1, Color: TaxonomyValue/2 }
        │
        ▼  putAll (simetris ATTRIBUTE_LIST)
   ReverseApplyService / ReverseImportService → channel_product_data.channelData
```

---

## 5. Import vs Reconcile

Colok di **kedua** entry (§1 rancangan Import-vs-Reconcile):
- **Import** (`ReverseImportService`): category attribute → `channelData[nama]` di draft linkage row (ember b).
- **Reconcile** (`ReverseApplyService`): MERGE ke `channelData[nama]` per-store — **rumahnya sendiri** (beda
  dari gambar yang master-owned). Di sinilah **round-trip dirty-detection** ([`01` §9](01-category-attributes-reverse-shape-b.md))
  benar-benar menutup: nilai balik = nilai Step-2 → nol drift palsu.

---

## 6. Sifat: aman meski increment I/O

- **Gated berlapis:** op `METAFIELD_INVERSE` null → orchestrator langsung kosong (fetch tak dipanggil). Belum
  di-seed → **dorman** untuk semua channel (termasuk Shopify hari ini) → nol perubahan perilaku.
- **Read-only:** `fetchReverseReferenceData` tak menulis apa pun (beda dari forward yang Jalur-B-upsert).
- **Graceful:** fetch gagal / data tak lengkap → channelData kosong → reverse jalan tanpa category attribute
  (never blocks, never guess).
- **Layering bersih:** forward mengembalikan struktur mentah; reverse yang membaliknya (R-B1). Forward tak
  import paket reverse.
- **Colok minimal & simetris:** satu `putAll` per entry, sejajar `ATTRIBUTE_LIST`.

---

## 7. Cakupan test

- Pure baru: `ReverseMetafieldInverse.handlesPresent` (di `ReverseMetafieldInverseTest`, +1 → 9) — men-scope
  fetch ke handle yang dibawa item (namespace-filtered).
- Regresi: `ReverseApplyMappingTest` (6), `ReverseImportCategoryTest` (6), `ReverseChannelFetchServiceTest`
  (17), + seluruh suite SHAPE B (R-B0/B1/B2) tetap hijau → **wiring tak merusak jalur reverse yang ada**.
- Jalur reactive `fetchReverseReferenceData` + orchestrator = **dorman**, tak di-unit-test live (seperti fetch
  forward yang juga dorman); logika keputusannya sudah terbukti di R-B0/B1 (pure).

---

## 8. Pointer kode

| Potongan | File |
|---|---|
| Fetch referensi read-only | `channel/category/service/GenericCategoryService.fetchReverseReferenceData` (+ record `ReverseReferenceData`) |
| Scope-helper pure | `reversesync/service/ReverseMetafieldInverse.handlesPresent` |
| Orchestrator | `reversesync/service/ReverseMetafieldEnrichService` |
| Colok reconcile | `reversesync/service/ReverseApplyService` |
| Colok import | `reversesync/service/ReverseImportService` |

---

## 9. Berikutnya (R-B4..B5)

- **R-B4** — seed Shopify: op `METAFIELD_INVERSE` + config `metafieldsFetch` di
  `ChannelConfigurationDataLoader`. Ini yang **menyalakan** seluruh jalur (dorman → aktif).
- **R-B5** — live-verify round-trip (publish → import → diff `channelData` kosong), setelah Area A operasional.

Kembali ke rancangan → [01](01-category-attributes-reverse-shape-b.md).
