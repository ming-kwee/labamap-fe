# 03 — Tahap A: Available-Attribute Catalog (sumber handle kedua)

**Status:** ✅ IMPLEMENTED (`bff-v20`, commit `72054e0`). **Sifat:** read-only, net-additive.
**Bagian dari:** rancangan write-through [01](01-category-attributes-write-through-generic.md) §9 Tahap A.

Dokumen ini menjelaskan **pelan-pelan** satu langkah kecil tapi krusial: dari mana runtime mendapat
**attribute handle** channel — termasuk untuk atribut yang **belum diaktifkan** di toko.

---

## 1. Kenapa tahap ini HARUS ada

Untuk mengirim sebuah category attribute (SHAPE B) ke Shopify, runtime butuh **handle**-nya (kunci kanonik,
mis. `fabric`, `color-pattern`). Sebelum Tahap A, satu-satunya sumber handle adalah
`metafieldDefinitions` — daftar atribut yang **sudah diaktifkan** di toko.

Masalahnya: atribut yang **belum** diaktifkan **tidak ada** di daftar itu → handle-nya **tak ketemu** →
atribut di-**skip**. Itulah sebabnya dari 10 atribut yang diisi merchant, hanya 3–4 (Fabric, Age group,
Care instructions — yang kebetulan sudah aktif) yang berhasil; sisanya (Waist rise, Best uses, Target
gender, …) hilang.

```
Sebelum Tahap A:
   handle source = metafieldDefinitions (HANYA yang sudah aktif)
   Waist rise (belum aktif) → tak ada di daftar → handle=null → SKIP   ✗
```

Handle **tidak bisa ditebak dari nama**. Bukti nyata: `Color → color-pattern` (bukan `color`),
`Best uses → best-uses`, `Skirt/Dress length type → skirt-dress-length-type`. Menebak dari nama pasti
salah untuk sebagian. Jadi kita **wajib** punya sumber data untuk handle atribut belum-aktif.

---

## 2. Ide inti: dua daftar yang SALING melengkapi

Shopify menyediakan **katalog atribut-tersedia** (`standardMetafieldDefinitionTemplates`) — daftar semua
metafield standar yang **tersedia tapi belum diaktifkan**. Temuan kunci (live):

> Begitu sebuah definisi **diaktifkan**, ia **PINDAH** dari katalog "available" ke daftar "enabled".

Jadi dua daftar itu **saling melengkapi** — gabungannya = handle untuk atribut **apa pun**:

```
enabled  = metafieldDefinitions(namespace:"shopify")          → Fabric, Care, Age group, Color
available = standardMetafieldDefinitionTemplates(ns:"shopify") → Waist rise, Best uses, Target gender, …
─────────────────────────────────────────────────────────────
gabungan  = handle untuk SEMUA atribut (yang sudah + yang belum aktif)
```

Bukti live (filter `namespace=shopify`):
```
'Waist rise'              → waist-rise
'Best uses'               → best-uses
'Target gender'           → target-gender
'Skirt/Dress length type' → skirt-dress-length-type
'Color'                   → color-pattern      (handle yang MUSTAHIL ditebak dari nama)
```
Dan Fabric/Care **tidak** muncul di katalog — karena sudah aktif (ada di `enabled`). Persis bukti bahwa
keduanya komplementer.

---

## 3. Wireframe alur (Tahap A)

```
enrichCategoryMetafields
   │
   ├─ fetch metafieldDefinitions ──────────────→ defs1 = { fabric, care, age group, color }   (enabled)
   │
   ├─ mergeAvailableCatalog:
   │     fetch standardMetafieldDefinitionTemplates
   │     filter namespace = "shopify"
   │     parseCatalog → { waist rise→waist-rise, best uses→best-uses, target gender→target-gender, … }
   │                                                                    (available; type=default, id=null)
   │     merged = catalog ∪ defs1        (enabled MENANG saat bentrok nama — ia bawa type + id lengkap)
   │
   └─→ defsByName = merged   →  dipakai continueEnrich (Tahap B/C + Area D)
```

Contoh hasil `defsByName` untuk kategori Skirts:
```
fabric        → { handle:"fabric",        type:"list.metaobject_reference", moDefId:"…/456" }   (enabled)
color         → { handle:"color-pattern", type:"list.metaobject_reference", moDefId:"…/123" }   (enabled)
waist rise    → { handle:"waist-rise",    type:"list.metaobject_reference", moDefId:null      }  (catalog)
best uses     → { handle:"best-uses",     type:"list.metaobject_reference", moDefId:null      }  (catalog)
target gender → { handle:"target-gender", type:"list.metaobject_reference", moDefId:null      }  (catalog)
```

**Perhatikan:** entri katalog punya `handle` tapi `moDefId=null`. Handle-nya **ter-resolve** (bagus!),
tapi belum bisa di-enrich (butuh metaobject-definition id) — itu tugas **Tahap B**. Tahap A **hanya**
menyediakan handle; ia sendiri **tidak** menyalakan atribut baru.

---

## 4. Yang dilakukan (data-driven)

Semua **konfigurasi**, nol literal channel di runtime:

| Bagian | Isi |
|---|---|
| Config `MetafieldDefinitionApiConfig` | `availableCatalogQuery`, `catalogItemsJsonPath`, `catalog{Name,Key,Namespace}Field`, `catalogNamespace`, `defaultReferenceType` |
| Parser `MetafieldDefinitionParser.parseCatalog` | node katalog → `lower(name) → MetafieldDefinition(name, handle, type=default, id=null)`; filter namespace |
| Service `GenericCategoryService.mergeAvailableCatalog` | gabung katalog ∪ enabled (enabled menang saat bentrok) |
| Seed Shopify | query `standardMetafieldDefinitionTemplates` + `catalogNamespace:"shopify"` |

Contoh seed (Shopify):
```java
.availableCatalogQuery("{ standardMetafieldDefinitionTemplates(first:250){ nodes { key namespace name } } }")
.catalogItemsJsonPath("data.standardMetafieldDefinitionTemplates.nodes")
.catalogNameField("name").catalogKeyField("key").catalogNamespaceField("namespace")
.catalogNamespace("shopify")
.defaultReferenceType("list.metaobject_reference")
```

---

## 5. Sifat: aman

- **Read-only:** hanya satu query tambahan (katalog). Nol mutation.
- **Gated:** `availableCatalogQuery == null` → langsung kembalikan enabled apa adanya → **channel SHAPE A
  (Shopee/TikTok) tak terpengaruh**.
- **Graceful:** fetch katalog gagal → pakai enabled-defs saja (log WARN), tak pernah blok publish.
- **Net-additive:** tak ada perilaku lama yang berubah; hanya menambah handle + entri log.

---

## 6. Efek terukur (setelah restart)

Log DEBUG `Area D join` untuk atribut katalog kini menampilkan **`defFound=true handle=waist-rise … moDefId=null`**
— sebelumnya `defFound=false`. Handle **ter-resolve**. Belum ter-enrich (moDefId=null) → **Tahap B**.

Log INFO: `Tahap A handle-source [shopify]: enabled=4 + catalog=N → merged=M`.

---

## 7. Batasan (apa yang BELUM)

- Entri katalog `moDefId=null` → **belum** menghasilkan metafield. Butuh **Tahap B** (resolve id by-type).
- **Kuirk nama:** atribut yang nama attribute-API-nya ≠ nama katalog (mis. "Clothing features", "Skirt
  style") tak ter-join → tetap tanpa handle → di-skip. Kalibrasi = **Tahap D** (normalisasi/seed nama).
- Size/Pattern → diklasifikasikan variant-axis (`variantOptionAttributeNames`) → memang bukan
  product-metafield → benar di-skip.

---

## 8. Pointer kode + test

- Config: `ChannelCategoryApiConfig.MetafieldDefinitionApiConfig`.
- Parser: `MetafieldDefinitionParser.parseCatalog` (pure).
- Service: `GenericCategoryService.mergeAvailableCatalog`.
- Seed: `CategoryApiConfigDataLoader` (blok `metafieldDefinitionConfig`).
- Test: `MetafieldDefinitionParserTest` (`parseCatalog_*`).

Lanjut → [04 — Tahap B](04-tahap-b-resolve-by-type.md).
