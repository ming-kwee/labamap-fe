# 04 — Tahap B: Resolve Reference-Def BY TYPE

**Status:** ✅ IMPLEMENTED (`bff-v20`, commit `d3691cf`). **Sifat:** read-only.
**Bagian dari:** rancangan write-through [01](01-category-attributes-write-through-generic.md) §9 Tahap B.
**Prasyarat:** [03 — Tahap A](03-tahap-a-available-catalog.md) (handle sudah ter-resolve).

---

## 1. Kenapa tahap ini HARUS ada

Selesai Tahap A, entri katalog punya **handle** tapi **`metaobjectDefinitionId = null`**:
```
waist rise → { handle:"waist-rise", type:"list.metaobject_reference", moDefId: null }
```

Tapi **Area D** (yang memetakan `TaxonomyValue GID → Metaobject GID`) dan **Jalur B** (yang meng-upsert
metaobject) butuh **metaobject-definition** atribut itu — dan selama ini mereka menemukannya lewat
`metaobjectDefinitionId`. Kalau `moDefId=null`, keduanya **melewati** atribut → tak ada metafield.

```
Tanpa Tahap B:
   waist rise moDefId=null → Area D skip → Jalur B skip → tak ada metafield   ✗
```

Jadi Tahap B mengisi celah: **temukan metaobject-definition id** untuk entri katalog.

---

## 2. Ide inti: query BY TYPE, bukan by id

Kita tak punya id-nya, tapi kita bisa **menurunkan tipe** dari handle:
```
type = enableTypePrefix + handle = "shopify--" + "waist-rise" = "shopify--waist-rise"
```
lalu query definisi **by type** (`metaobjectDefinitionByType`):

- **Def sudah ada** → dapat `id` → isi `moDefId` → Area D/Jalur B lanjut. ✅
- **Def belum ada** → query mengembalikan **null** → biarkan (Tahap C yang akan membuatnya). ⏸️

> **Kenapa by-type, bukan by-id?** Karena untuk atribut belum-aktif kita **tak punya** id-nya sama
> sekali — hanya handle. Tipe (`shopify--<handle>`) adalah **jembatan** dari handle ke definisi. Ini juga
> menyeragamkan: atribut enabled (punya id dari Area C) dan atribut katalog (dapat id dari by-type)
> berakhir di jalur Area D yang sama.

---

## 3. Contoh konkret (dengan bukti live)

Di sandbox kita, `target-gender` metaobject-def-nya **sudah ada** (dibuat oleh probe manual saat
verifikasi), sedangkan `waist-rise` **belum**:

```
metaobjectDefinitionByType("shopify--target-gender")
  → { id: "gid://shopify/MetaobjectDefinition/24945164578", fieldDefinitions:[…] }   ✅ ADA

metaobjectDefinitionByType("shopify--waist-rise")
  → null                                                                             ⏸️ BELUM ADA
```

Maka Tahap B meng-**upgrade** `target gender` (isi moDefId), dan **membiarkan** `waist rise`:
```
target gender → { handle:"target-gender", type:"list.metaobject_reference", moDefId:"…/24945164578" }  ← upgraded
waist rise    → { handle:"waist-rise",    type:"list.metaobject_reference", moDefId: null }             ← Tahap C
```

Hasilnya: **target-gender langsung menyala** lewat Area D/Jalur B — **tanpa** menulis apa pun (def-nya
sudah ada). Inilah kenapa Tahap B **read-only** tapi tetap bernilai: ia menyalakan setiap atribut yang
definisinya kebetulan sudah ada, gratis.

---

## 4. Wireframe alur (Tahap B)

```
continueEnrich(defsByName)                     [defsByName sudah termasuk katalog dari Tahap A]
   │
   ├─ resolveCatalogDefIdsByType:
   │     kandidat = entri dgn handle TAPI moDefId=null           (catalogTypesToResolve — pure)
   │        waist rise → type "shopify--waist-rise"
   │        best uses  → type "shopify--best-uses"
   │        target gender → type "shopify--target-gender"
   │     untuk tiap type:
   │        query metaobjectDefinitionByType(type) → id | null
   │     applyResolvedDefIds:                                     (pure)
   │        id != null → upgrade entri (isi moDefId)
   │        id == null → biarkan (Tahap C)
   │
   └─→ defsByName' (sebagian ter-upgrade)  →  continueEnrichResolved (Area D + Jalur B)
```

Dua bagian keputusan di-ekstrak jadi fungsi **pure** (teruji): `catalogTypesToResolve` (pilih kandidat +
turunkan type) dan `applyResolvedDefIds` (isi id, preserve name/handle/type). Query di antaranya reaktif +
graceful per-entri.

---

## 5. Yang dilakukan (data-driven)

| Bagian | Isi |
|---|---|
| Config `MetaobjectMappingApiConfig` | `defByTypeQuery`, `typeVariable`, `defByTypeIdJsonPath` |
| Service `resolveCatalogDefIdsByType` | kandidat → query by-type → `applyResolvedDefIds` |
| Helper pure | `catalogTypesToResolve`, `applyResolvedDefIds` |
| Seed Shopify | `metaobjectDefinitionByType(type){ id }` |

Contoh seed:
```java
.defByTypeQuery("query MetaobjectDefByType($type:String!){ metaobjectDefinitionByType(type:$type){ id } }")
.typeVariable("type")
.defByTypeIdJsonPath("data.metaobjectDefinitionByType.id")
```

---

## 6. Sifat: aman

- **Read-only:** hanya query by-type tambahan. Nol mutation.
- **Gated:** `defByTypeQuery == null` → kembalikan defsByName apa adanya (SHAPE A aman).
- **Graceful:** query gagal per-entri → entri itu tak di-upgrade (di-drop di enrich), tak blok publish.

---

## 7. Efek terukur

Log: `Tahap B by-type [shopify]: N atribut katalog di-resolve ke metaobjectDefinitionId (dari M kandidat)`.

Di sandbox: target-gender ter-resolve → publish berikutnya, Target gender menempel di Shopify **tanpa
menulis definisi** (Jalur B tinggal upsert metaobject nilainya).

---

## 8. Batasan (apa yang BELUM)

Atribut yang metaobject-def-nya **belum ada** (waist-rise, best-uses, dst di toko baru) tetap `moDefId=null`
→ di-skip. Membuat definisinya = **Tahap C** (write). Tahap B tak menulis apa pun.

---

## 9. Pointer kode + test

- Config: `ChannelCategoryApiConfig.MetaobjectMappingApiConfig` (`defByType*`).
- Service: `GenericCategoryService.resolveCatalogDefIdsByType` + `catalogTypesToResolve` + `applyResolvedDefIds`.
- Seed: `CategoryApiConfigDataLoader` (blok `metaobjectMappingConfig`).
- Test: `CatalogDefIdResolutionTest`.

Lanjut → [05 — Tahap C](05-tahap-c-probe-enable.md).
