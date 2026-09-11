# 05 — Tahap C: Probe-Enable Reference-Def yang Belum Ada

**Status:** ✅ IMPLEMENTED (`bff-v20`, commit `9fb1b7b`). **Sifat:** WRITE, gated.
**Bagian dari:** rancangan write-through [01](01-category-attributes-write-through-generic.md) §9 Tahap C.
**Prasyarat:** [04 — Tahap B](04-tahap-b-resolve-by-type.md) (id yang bisa ditemukan sudah terisi).

Ini langkah **write** terakhir yang menuntaskan rantai write-through — dan menjawab pertanyaan besar:
*"apakah tiap merchant harus onboarding manual mengaktifkan atribut?"* → **TIDAK.**

---

## 1. Kenapa tahap ini HARUS ada

Selesai Tahap B, sebagian atribut katalog masih `moDefId=null` — **metaobject-definition-nya belum ada di
toko** (mis. waist-rise, best-uses di toko yang baru). Tanpa definisi itu, Jalur B tak bisa meng-upsert
metaobject, jadi atribut tetap di-skip.

```
Setelah Tahap B, di toko baru:
   waist rise moDefId=null (def belum ada) → Area D skip → tak ada metafield   ✗
```

**Solusi salah:** menyuruh merchant klik "+" untuk tiap atribut di Shopify admin saat onboarding. Tidak
scalable — bayangkan ratusan merchant × puluhan atribut × banyak kategori.

**Solusi benar:** BFF **membuat** definisi itu on-demand, otomatis, untuk atribut yang merchant **isi**.

---

## 2. Ide inti: enable definisi TANPA owner produk

Awalnya kita pikir probe pakai `metafieldsSet` (menulis metafield → Shopify auto-provision definisi). Tapi
`metafieldsSet` butuh **`ownerId`** (GID produk) — dan saat staging untuk **CREATE**, produk **belum
punya** GID. Buntu.

Jalur bersih: buat **metaobject-definition** langsung via `standardMetaobjectDefinitionEnable(type)` —
**tanpa** owner produk. (Metafield-definition-nya auto-enable belakangan saat sync menulis value asli
dengan produk GID nyata.) Dan mutation ini **sudah ada** di kode (Area B `enableMutation`) — Tahap C
tinggal **memakai ulang**, di-drive dari handle katalog.

> **Kenapa metaobject-definition dulu, bukan metafield-definition?** Karena yang butuh dibuat lebih dulu
> (untuk Jalur B upsert + Area D baca ref-field) adalah **metaobject-definition**. Metafield-definition
> "gratis" — auto-enable saat write value final (terbukti: menulis `metafieldsSet(key:target-gender)`
> tak error "definition not found", langsung mengaktifkan).

Bukti live (atribut yang tadinya belum ada):
```
standardMetaobjectDefinitionEnable(type:"shopify--best-uses")
  → { metaobjectDefinition: { id:"gid://shopify/MetaobjectDefinition/24947228962", type:"shopify--best-uses" },
      userErrors: [] }                                                              ✅ dibuat, TANPA owner
```

---

## 3. Contoh konkret — alur untuk Waist rise (toko baru)

```
Tahap A:  handle "waist-rise" (dari katalog)
Tahap B:  metaobjectDefinitionByType("shopify--waist-rise") → null    (belum ada)
Tahap C:  standardMetaobjectDefinitionEnable("shopify--waist-rise")   → dibuat (id 24947…)   [WRITE]
          re-query metaobjectDefinitionByType → id 24947…             → isi moDefId
Area D:   fetch metaobjects (kosong) + ref-field-key "taxonomy_reference"
Jalur B:  metaobjectUpsert(type:"shopify--waist-rise", handle:"tv-1376",
              label:"Mid rise", taxonomy_reference:"gid://…/TaxonomyValue/1376")   → Metaobject GID   [WRITE]
enrich:   waist rise → values:[Metaobject GID]
sync:     set_category_metafields menulis value → Waist rise MENEMPEL di Shopify   ✅
```

**Publish kedua dan seterusnya:** Tahap C **no-op** (def sudah ada → Tahap B menemukannya), Jalur B
idempoten (metaobject sama = update no-op). Steady-state murah.

---

## 4. Wireframe alur (Tahap C dalam rantai)

```
continueEnrich(defsByName)
   │
   ├─ Tahap B: resolveCatalogDefIdsByType     → isi moDefId yang def-nya SUDAH ada
   │
   ├─ Tahap C: probeEnableMissing
   │     kandidat = yang MASIH moDefId=null    (reuse catalogTypesToResolve — pure)
   │     untuk tiap type:
   │        standardMetaobjectDefinitionEnable(type)   [WRITE, graceful]   → buat def
   │        re-query metaobjectDefinitionByType(type)  → id
   │     applyResolvedDefIds → isi moDefId
   │
   └─ Area D + Jalur B (continueEnrichResolved)
        fetch metaobjects → upsert nilai yang belum ada → enrich
```

---

## 5. Yang dilakukan

| Bagian | Isi |
|---|---|
| Service `probeEnableMissing` | kandidat still-null → `enableMutation(type)` [WRITE] → re-query by-type → `applyResolvedDefIds` |
| Reuse | mutation `enableMutation` + `enableTypePrefix` (Area B, sudah ter-seed) — di-drive dari handle KATALOG, bukan seed `standardHandlesByName` (yang cuma `color`) |
| Disisipkan | `continueEnrich`: Tahap B → **Tahap C** → enrich |

Tak ada config baru: Tahap C memakai `enableMutation`/`enableTypePrefix` (Tahap-nya) + `defByType*`
(Tahap B) yang sudah ada.

---

## 6. Sifat: aman meski menulis

- **WRITE, tapi scoped:** hanya untuk atribut yang merchant **benar-benar isi** (`basePairs`) dan yang
  def-nya belum ada. Tak menyentuh atribut lain.
- **Gated:** butuh `enableMutation` + `defByTypeQuery` (+ scope `write_metaobject_definitions`). Channel
  SHAPE A (blok kosong) → tak jalan.
- **Graceful per-atribut:** enable/re-query gagal → atribut itu tetap unresolved → di-drop di enrich →
  **tak pernah blok publish**.
- **Idempoten:** enable definisi yang sudah ada = no-op / userError jinak. Aman diulang.
- **Menulis ke toko merchant:** operasi tulis nyata (buat definisi). Minimal, gated, idempoten, di-log
  jelas (`Tahap C … auto-provisioned`).

---

## 7. Efek terukur

Log: `Tahap C [shopify]: N atribut auto-provisioned (enable+requery) dari M kandidat — [waist rise, best uses, …]`.

Lalu berlanjut: `Jalur B: created Metaobject …` → `BUILD_METAFIELD_LIST: built N metafield(s)` →
`attribute(s) → metafields`. Semua atribut terisi menempel di Shopify.

---

## 8. Hasil akhir: rantai write-through lengkap

Dengan A + B + C:
- **8 atribut produk-level otomatis** (Fabric, Care, Age group, Color, Waist rise, Best uses, Target
  gender, Skirt/Dress length type) + **semua atribut/kategori masa depan**.
- **Nol onboarding manual** per merchant — jawaban tuntas untuk pertanyaan awal.
- Size/Pattern → variant (benar di-skip); kuirk nama (Clothing features, Skirt style, Size type) →
  **Tahap D** (kalibrasi nama).

---

## 9. Pointer kode + test

- Service: `GenericCategoryService.probeEnableMissing` (reuse `catalogTypesToResolve` + `applyResolvedDefIds`).
- Mutation reuse: `MetaobjectMappingApiConfig.enableMutation` / `enableTypePrefix` (seed Shopify).
- Test: logika keputusan pure di `CatalogDefIdResolutionTest`; jalur write = live-verify.

Kembali ke ringkasan → [01 — rancangan generic](01-category-attributes-write-through-generic.md).
