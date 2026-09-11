# 06 — Tahap D: Kalibrasi Nama (name calibration)

**Status:** ✅ IMPLEMENTED (`bff-v20`). **Sifat:** read-only, additive, data-driven.
**Bagian dari:** rancangan write-through [01](01-category-attributes-write-through-generic.md) §9 Tahap D (opsional).
**Prasyarat:** [03 — Tahap A](03-tahap-a-available-catalog.md) (defsByName sudah termasuk katalog).

Ini lapisan **penutup celah** untuk atribut yang **namanya tak sama-persis** antara dua sisi. Ia tidak
menambah sumber handle baru — ia memperbaiki **join**-nya.

---

## 1. Kenapa tahap ini HARUS ada

Seluruh pipeline SHAPE B menyambungkan **nilai yang diisi merchant** ke **definisi channel** lewat **nama
atribut**:

```
basePairs.id (nama dari attribute-API)  ──join by lower(name)──►  defsByName (nama dari definisi/katalog)
```

Bukti kode: `CategoryMetafieldEnricher.enrich` → `defsByLowerName.get(lower(id))`. Cocok **hanya** kalau
kedua nama identik (selain kapitalisasi). Padahal keduanya **sama-sama dari Shopify** untuk taxonomy
attribute yang sama — tapi kadang **beda tipis**:

| Sisi attribute-API (basePairs.id) | Sisi definisi/katalog (defsByName) | Beda |
|---|---|---|
| `Skirt/Dress length type` | `skirt-dress-length-type` | tanda-baca / hubung |
| `Clothing features` | `Clothing feature` (mis.) | **plural** |
| `Size type` | `Size` (mis.) | kata beda |

Kalau join gagal → handle tak ketemu → atribut di-**skip**. Inilah "kuirk" yang tersisa setelah Tahap
A/B/C (Clothing features, Skirt style, Size type, dll).

> **Catatan penting (kategori-a vs kategori-b).** Ada dua sebab join gagal:
> - **(a) beda nama** untuk atribut yang PUNYA template channel → **bisa** dijembatani (tugas Tahap D).
> - **(b) atribut memang TAK punya template** metafield di channel → tak ada handle di mana pun → **benar
>   di-skip** (bukan bug; di-surface sebagai `droppedCategoryAttributes`).
>
> Tahap D **hanya** memperbaiki (a). Ia **tidak memaksa** (b) — kalau tak ada padanan, tak ada jembatan.

---

## 2. Ide inti: dua lapis jembatan, keduanya additive

Tahap D menambah **jembatan** `lower(quirkId) → def` ke `defsByName` **sekali**, tepat setelah merge Tahap
A. Karena SEMUA lookup hilir (Tahap B/C, enrich, unprovisioned) memakai `lower(id)`, jembatan itu otomatis
kena — **nol perubahan call-site**.

```
LAPIS 1 — alias (DATA):  nameAliases = { lower(quirk) → lower(kanonik) }
   Untuk beda yang TAK bisa dinormalisasi (plural, kata beda). Diisi setelah live-verify (jangan tebak).

LAPIS 2 — normalisasi struktural (tanpa entri):  normalize(s) = lowercase + buang non-alfanumerik
   Menutup kuirk KOSMETIK (kapital/spasi/tanda-baca/hubung) otomatis, tanpa data.
   "Skirt/Dress length type" & "skirt dress length type" → "skirtdresslengthtype" → cocok.
   Sengaja BUKAN singularisasi (itu linguistik/domain → alias DATA).
```

Urutan: **exact match dulu** (entri yang sudah cocok tak disentuh) → alias → normalisasi. Idempoten.

---

## 3. Contoh konkret

```
defsByName (setelah Tahap A):
   "skirt/dress length type" → { handle:"skirt-dress-length-type", … }

merchant mengisi (attribute-API name): "Skirt Dress length type"   (tanpa slash)
   lower = "skirt dress length type"  →  defsByName.get(...) = MISS   ✗ (tanpa Tahap D → di-skip)

Tahap D:
   normalize("skirt dress length type") = "skirtdreslengthtype"... = normalize("skirt/dress length type")
   → tambah jembatan: "skirt dress length type" → def(handle:skirt-dress-length-type)
   → enrich.get("skirt dress length type") = HIT   ✓
```

Untuk plural (butuh alias DATA):
```
defsByName: "clothing feature" → { handle:"clothing-features" }
merchant: "Clothing features"  → normalize beda ("clothingfeatures" ≠ "clothingfeature") → normalisasi MISS
seed nameAliases: { "clothing features" : "clothing feature" }
   → jembatan "clothing features" → def(handle:clothing-features)   ✓
```

---

## 4. Wireframe alur (di mana Tahap D duduk)

```
fetch metafieldDefinitions ─► mergeAvailableCatalog (Tahap A)
                                      │
                                      ▼
                         calibrateNames (Tahap D)   ← tambah jembatan lower(quirk)→def (alias + normalisasi)
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                              ▼
   unprovisioned (WARN akurat)   Tahap B (by-type)   →   Tahap C (probe-enable)   →   Area D + enrich
```

Karena kalibrasi jalan **sebelum** `unprovisioned`, WARN "perlu manual enable" jadi **akurat** (kuirk yang
sudah dijembatani tak lagi salah-lapor).

---

## 5. Yang dilakukan (data-driven)

| Bagian | Isi |
|---|---|
| Config `MetafieldDefinitionApiConfig.nameAliases` | `Map<lower(quirk), lower(kanonik)>` — DATA, opsional, default kosong |
| Service `normalizeAttrName` (pure) | lowercase + buang non-alfanumerik |
| Service `calibrateNames` (pure) | tambah jembatan via alias (lapis 1) + normalisasi (lapis 2) |
| Wiring | `.map(calibrateNames)` setelah `mergeAvailableCatalog` (jalur utama + defs2 legacy) |

**Seed Shopify:** `nameAliases` **sengaja dibiarkan kosong**. Normalisasi struktural jalan tanpa data;
entri alias **diisi setelah live-verify** nama asli (lihat §7) — bukan ditebak. Ini patuh CLAUDE.md: alias
adalah **data referensi** (rumah seeder), bukan kosakata domain di runtime.

---

## 6. Sifat: aman

- **Read-only + additive:** hanya menambah key alias ke map in-memory; tak menulis apa pun ke channel.
- **Tak memaksa:** tak ada padanan → tak ada jembatan → atribut tetap di-skip/di-surface (kategori-b benar).
- **Fail-safe kalaupun salah-jembatan:** jika normalisasi/alias keliru menunjuk handle salah, Tahap C
  `enable(shopify--<handle-salah>)` → userError → di-skip anggun (tak blok publish).
- **Gated alami:** hanya di jalur SHAPE B (metafield config ada); channel SHAPE A tak menyentuh ini.
- **Idempoten & order-preserving.**

---

## 7. Cara menemukan nama kuirk yang sebenarnya (live — WAJIB sebelum isi alias)

Jangan tebak entri alias. Bandingkan **dua sisi** dari toko nyata:

```sh
# Sisi A — nama attribute-API (yang jadi basePairs.id) untuk kategori produk:
Q='query { node(id:"gid://shopify/TaxonomyCategory/aa-1-13-8"){ ... on TaxonomyCategory {
     attributes(first:50){ nodes{ __typename ... on TaxonomyChoiceListAttribute { name } } } } } }'

# Sisi B — nama definisi/katalog (kunci defsByName):
Q='{ metafieldDefinitions(first:100, ownerType:PRODUCT, namespace:"shopify"){ nodes{ name key } } }'
Q='{ standardMetafieldDefinitionTemplates(first:250){ nodes{ name key namespace } } }'
```

Untuk atribut yang **di-surface sebagai dropped** padahal Anda yakin ada di Shopify: cari namanya di Sisi A
vs Sisi B.
- Beda kosmetik → normalisasi **sudah** menanganinya (tak perlu alias).
- Beda plural/kata → tambah entri `nameAliases: { lower(A) : lower(B) }` di seed
  `CategoryApiConfigDataLoader` (blok `metafieldDefinitionConfig`).
- Tak ada di Sisi B sama sekali → kategori-b (tak ada template) → biarkan (benar di-skip).

---

## 8. Batasan

- Alias adalah data **hand-maintained** (seperti Area B `standardHandlesByName`). Salah entri → gagal
  anggun, bukan crash.
- Normalisasi tak menangani sinonim/plural — itu memang tugas alias DATA (disengaja, agar tak ada tebakan
  linguistik di runtime).

---

## 9. Pointer kode + test

- Config: `ChannelCategoryApiConfig.MetafieldDefinitionApiConfig.nameAliases`.
- Service: `GenericCategoryService.normalizeAttrName` + `calibrateNames` (pure).
- Wiring: `enrichCategoryMetafields` (`.map` setelah `mergeAvailableCatalog` + jalur defs2).
- Test: `NameCalibrationTest`.

Kembali ke ringkasan → [01 — rancangan generic](01-category-attributes-write-through-generic.md).
