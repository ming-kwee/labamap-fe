# 03 — R-B1: Membangun Dua Peta Lookup Inverse (implementasi)

**Status:** ✅ IMPLEMENTED (`bff-v20`). **Sifat:** pure, nol I/O, aditif, dorman.
**Bagian dari:** rancangan [01](01-category-attributes-reverse-shape-b.md) §11 fase R-B1.
**Prasyarat:** [02 — R-B0](02-r-b0-pure-inverse-implementation.md) (fungsi inverse inti yang **memakai** dua peta ini).

R-B0 menyediakan **mesin** (`ReverseMetafieldInverse.invert`) tapi butuh **dua peta lookup** sebagai bahan
bakar: `handleToName` dan `refObjToCanonical`. R-B1 **membangun kedua peta itu** — dan poin pentingnya: dari
**struktur referensi forward yang sama**, tinggal **dibalik**. Nol sumber kebenaran baru.

---

## 1. Kenapa tahap ini ada

Ingat kontrak R-B0:
```
invert(descriptor, item, handleToName, refObjToCanonical) → channelData
```
Dua peta di argumen ketiga & keempat **dioper masuk** — sengaja, agar R-B0 tetap pure. R-B1 adalah yang
**memproduksi** keduanya:

| Peta | Isi | Dipakai R-B0 untuk |
|---|---|---|
| `handleToName` | `handle → nama tampil` | metafield `key=fabric` → atribut `"Fabric"` |
| `refObjToCanonical` | `Metaobject GID → TaxonomyValue GID` | nilai `Metaobject/10` → `TaxonomyValue/1` (yang Step-2 simpan) |

Tanpa R-B1, R-B0 tak punya bahan; dengan R-B1, loop lengkap.

---

## 2. Ide inti: forward sudah menghitungnya — tinggal dibalik

Kunci genericity + kesederhanaan (§3 rancangan): jalur **forward** (Tahap A–D + Area D) sudah menghitung
persis dua struktur yang kita butuh, hanya **arah maju**. R-B1 membaliknya:

```
FORWARD (sudah ada)                              REVERSE (R-B1 = flip)
─────────────────────                           ─────────────────────
defsByName: nama(lower) → def{handle,…}     →   handleToName: handle → nama
   (metafieldDefinitions + katalog Tahap A,        (flip: untuk tiap def, handle → name)
    kalibrasi Tahap D)

per-def taxToMeta: TaxonomyValue → Metaobject →  refObjToCanonical: Metaobject → TaxonomyValue
   (MetaobjectTaxonomyMapper.parse, per defId)     (flip tiap def via .invert, lalu union)
```

Kedua struktur forward itu dihitung di `GenericCategoryService.continueEnrichResolved` (`defsByName` +
`MetaobjectTaxonomyMapper.parse(tree, mmc)` per defId). R-B1 **tidak** fetch ulang — ia menerima struktur
itu dan membaliknya. (Fetch live-nya di-reuse read-only di R-B3, saat wiring.)

---

## 3. Dua builder pure (`ReverseMetafieldResolvers`)

### `handleToName(defsByName)`
Untuk tiap definisi: `handle → name`. Detail penting:
- **First-wins.** Kalibrasi Tahap D menambah beberapa kunci nama (jembatan) yang menunjuk **def yang sama** →
  `putIfAbsent` pada handle men-dedupe otomatis (satu handle, satu nama).
- **Skip blank.** Handle/nama kosong → dilewati (metafield ber-handle itu memang takkan ter-resolve → di-skip
  di R-B0; konsisten never-guess).

Contoh:
```
defsByName = { "fabric"→def(Fabric,fabric), "color"→def(Color,color-pattern) }
→ handleToName = { "fabric"→"Fabric", "color-pattern"→"Color" }
```
Perhatikan `color-pattern → Color` — handle yang **mustahil ditebak** dari nama, kini terpetakan balik benar.

### `refObjToCanonical(perDefTaxToMeta)`
Terima **koleksi** peta `TaxonomyValue→Metaobject` (satu per definition, output `parse` forward), balik tiap
peta via `MetaobjectTaxonomyMapper.invert` (dibangun di R-B0), lalu **union** semua jadi satu peta global
`Metaobject→TaxonomyValue`. First-wins pada bentrok (baik di dalam satu def maupun lintas def).

```
perDef = [ {TaxonomyValue/1→Metaobject/10}, {TaxonomyValue/2→Metaobject/20, TaxonomyValue/3→Metaobject/30} ]
→ refObjToCanonical = { Metaobject/10→TaxonomyValue/1, Metaobject/20→TaxonomyValue/2, Metaobject/30→TaxonomyValue/3 }
```

Ini memakai ulang `MetaobjectTaxonomyMapper.invert` (R-B0) — flip per-def — lalu menggabung. Jadi R-B1
bersandar penuh pada primitif R-B0 + forward; ia hanya **merangkai**.

---

## 4. Wireframe: dari struktur forward ke dua peta

```
GenericCategoryService (forward, sudah ada)         ReverseMetafieldResolvers (R-B1)
──────────────────────────────────────────         ────────────────────────────────
defsByName ────────────────────────────────────►   handleToName(defsByName)          ┐
                                                                                      │
Flux<defId> → parse → taxToMeta per def ────────►   refObjToCanonical(perDefTaxToMeta)┤
                                                                                      ▼
                                              ReverseMetafieldInverse.invert(descriptor, item, ①, ②)  (R-B0)
                                                                                      ▼
                                                              channelData[nama] = TaxonomyValue GID
```

R-B1 = dua kotak tengah. Kiri (fetch forward) di-reuse read-only di R-B3; kanan (R-B0) sudah ada.

---

## 5. Kenapa pure lagi (bukan langsung fetch)

Sama alasan dengan R-B0, dan sesuai disiplin proyek:
- **Testable trivial** — 6 unit test, nol mock jaringan. Membuktikan flip + dedup + union + first-wins.
- **Tak membangun I/O prematur di jalur dorman.** Fetch referensi forward (metafieldDefinitions, metaobjects)
  masih dorman (Area A: scopes/re-consent belum operasional). Membangun reactive fetch reverse sekarang =
  kode yang tak bisa dijalankan/diverifikasi. R-B1 menyelesaikan **transformasinya** dulu; wiring fetch
  read-only masuk R-B3 di mana store/creds/config tersedia dan bisa diuji end-to-end.
- **Round-trip tervalidasi berlapis.** Test `roundTripFeedsRB0` menunjukkan output R-B1 menyuapi R-B0:
  `Metaobject/10` (yang publish tulis) membaca balik jadi `TaxonomyValue/1` (yang Step-2 simpan). Digabung
  dengan test R-B0, seluruh rantai keputusan reverse SHAPE B terbukti **tanpa satu pun panggilan jaringan**.

---

## 6. Cakupan test (`ReverseMetafieldResolversTest`, 6)

| Test | Membuktikan |
|---|---|
| `handleToName` | flip `defsByName` → `handle→nama` (termasuk `color-pattern→Color`) |
| `dedupesBridgeEntries` | jembatan Tahap D (banyak nama → def sama) → dedup by handle, first-wins |
| `skipsBlankAndNullSafe` | handle/nama kosong → skip; null → kosong |
| `refObjToCanonicalMerges` | union peta per-def, tiap di-flip Metaobject→TaxonomyValue |
| `clashFirstWinsAndNullSafe` | bentrok lintas-def → TaxonomyValue pertama menang; null-safe |
| `roundTripFeedsRB0` | output R-B1 menyuapi R-B0 → Metaobject GID baca balik = TaxonomyValue GID tersimpan |

Regresi: R-B0 (`ReverseMetafieldInverseTest` 8), `ReverseOpsTest` (7), `MetaobjectTaxonomyMapperTest` (10),
`CatalogDefIdResolutionTest` (5) tetap hijau.

---

## 7. Pointer kode

| Potongan | File |
|---|---|
| Dua builder pure | `reversesync/service/ReverseMetafieldResolvers` |
| Flip per-def (reuse R-B0) | `channel/category/service/MetaobjectTaxonomyMapper.invert` |
| Konsumen (R-B0) | `reversesync/service/ReverseMetafieldInverse` |
| Test | `reversesync/ReverseMetafieldResolversTest` |

---

## 8. Berikutnya (R-B2..B5)

- **R-B2** — perluas query item-fetch agar memuat `product.metafields(namespace)` (config).
- **R-B3** — **reuse read-only** fetch forward (defs + metaobjects, TANPA Jalur B write) → suapi
  `ReverseMetafieldResolvers` → `ReverseMetafieldInverse.invert` → MERGE ke `channelData`. Di sinilah I/O
  reactive tinggal, memakai builder R-B1 + mesin R-B0 yang sudah terbukti.
- **R-B4** — seed Shopify `METAFIELD_INVERSE`.
- **R-B5** — live-verify round-trip.

Kembali ke rancangan → [01](01-category-attributes-reverse-shape-b.md).
