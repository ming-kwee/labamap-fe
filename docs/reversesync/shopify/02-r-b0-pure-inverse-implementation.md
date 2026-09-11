# 02 — R-B0: Fungsi Inverse Pure (implementasi)

**Status:** ✅ IMPLEMENTED (`bff-v20`). **Sifat:** pure, nol I/O, aditif, dorman.
**Bagian dari:** rancangan [01](01-category-attributes-reverse-shape-b.md) §11 fase R-B0.

R-B0 adalah **fondasi paling murah** dari reverse SHAPE B: semua **logika keputusan** (membalik nilai + nama),
tanpa satu pun panggilan jaringan. Bisa diuji penuh sebagai unit test. Fase berikutnya (R-B1..B5) tinggal
**memberi makan** fungsi-fungsi ini dengan data live dan menyambungkannya ke pipeline.

Dokumen ini menjelaskan **pelan-pelan** apa yang R-B0 bangun, kenapa dipecah begini, dan apa yang **belum**.

---

## 1. Apa yang R-B0 kerjakan (dan tidak)

**Kerjakan:** empat potongan pure yang, diberi (a) item channel + (b) dua peta lookup, menghasilkan
`channelData` category attribute yang benar.

**Tidak kerjakan (sengaja — itu R-B1..B5):**
- Tidak mem-fetch apa pun (metafield produk, definisi, metaobject) — itu R-B1/B2.
- Tidak menyambung ke stage reverse / menulis ke `channel_product_data` — itu R-B3.
- Tidak men-seed op `METAFIELD_INVERSE` ke `reverseSyncConfig` Shopify — itu R-B4.

Karena tak di-seed, op ini **dorman**: `ReverseOps.metafieldInverse` mengembalikan `null` untuk semua channel
hari ini → nol perubahan perilaku. Aman.

---

## 2. Empat potongan

### (a) `MetaobjectTaxonomyMapper.invert` — membalik peta nilai Area D

Forward Area D menghasilkan `TaxonomyValue GID → Metaobject GID` (`MetaobjectTaxonomyMapper.parse`). Reverse
butuh arah sebaliknya. Alih-alih fetch/parse ulang, kita **flip** peta yang sama:

```
parse   : TaxonomyValue GID → Metaobject GID     (forward — yang dikirim ke channel)
invert  : Metaobject GID → TaxonomyValue GID     (reverse — yang dibaca balik)
```

Satu fungsi, first-wins pada bentrok (dua TaxonomyValue menunjuk satu Metaobject → TaxonomyValue pertama
menang). **Inilah bukti konkret tesis §3 rancangan:** reverse tak butuh sumber kebenaran baru — artefak
forward tinggal dibalik.

### (b) `ReverseMetafieldInverseDescriptor` — parameter data-driven

POJO sejajar `AttributeListInverseDescriptor` (SHAPE A). Semua **field name = data**, nol literal channel:

| Field | Arti | Seed Shopify |
|---|---|---|
| `metafieldsPath` | di mana array metafield pada item | `product.metafields` |
| `namespaceField` + `namespace` | filter (hanya metafield category-attribute) | `namespace` + `shopify` |
| `keyField` | field handle (kunci metafield) | `key` |
| `valueField` | nilai (JSON-array GID atau GID tunggal) | `value` |

### (c) `ReverseMetafieldInverse.invert` — fungsi inverse inti

Mirror `ReverseAttributeListInverse` (SHAPE A), disiplin sama: **skip kalau tak ke-map, jangan pernah
menebak**. Menerima descriptor + item + **dua peta lookup**:

```
invert(descriptor, item, handleToName, refObjToCanonical) → Map<nama, nilai | [nilai…]>
```

- `handleToName`: `handle → nama tampil` (kebalikan Tahap A/D) — dibangun di R-B1.
- `refObjToCanonical`: `Metaobject GID → TaxonomyValue GID` (dari (a)) — dibangun di R-B1.

Kenapa dua peta **dioper masuk**, bukan dibangun di dalam? Agar fungsi tetap **pure** (nol I/O) → testable
trivial. Fetch live tinggal di lapisan service (persis pola forward: `MetaobjectTaxonomyMapper` pure, fetch di
`GenericCategoryService`).

### (d) Registrasi `METAFIELD_INVERSE` di `ReverseOps`

- Konstanta diskriminator `METAFIELD_INVERSE` (sejajar `ATTRIBUTE_LIST`).
- Accessor `metafieldInverse(rc)` → baca first-op → descriptor (Jackson `convertValue`).
- Masuk `handledArrayPaths` → de-derivation tak salah-lapor `metafieldsPath` sebagai "pending".

---

## 3. Wireframe: satu nilai lewat R-B0

Diberi metafield `{ namespace:"shopify", key:"fabric", value:"[\"gid://…/Metaobject/1\"]" }` +
`handleToName={fabric→Fabric}` + `refObjToCanonical={Metaobject/1→TaxonomyValue/1}`:

```
ReverseMetafieldInverse.invert:
   getByPath(item, "product.metafields")            → [ {namespace, key, value}, … ]
   filter namespace == "shopify"                     ✓
   handle = key = "fabric"
   nama   = handleToName["fabric"] = "Fabric"        ✓ (miss → skip, jangan tebak)
   asGidList(value) = ["gid://…/Metaobject/1"]        (JSON-array | bare GID | List)
   canonical = refObjToCanonical["…/Metaobject/1"] = "gid://…/TaxonomyValue/1"   ✓ (miss → drop)
   → channelData["Fabric"] = "gid://…/TaxonomyValue/1"   (1 nilai → skalar; banyak → List)
```

`asGidList` menerima tiga bentuk nilai: JSON-array string (`"[\"gid…\"]"`, cara Shopify metafield list),
GID telanjang, atau `List` yang sudah ter-parse — mirror bentuk nilai forward.

---

## 4. Kenapa dipecah "pure dulu"

Sama filosofi dengan forward (Tahap A–D) & seluruh reverse: **logika keputusan pure + teruji**, I/O menyusul.

- **R-B0 pure** → 8 unit test cepat, deterministik, nol mock jaringan.
- **Round-trip terbukti di level unit:** test memakai `handleToName` + `refObjToCanonical` yang persis
  kebalikan dari yang forward pakai → membuktikan `Metaobject GID` yang publish tulis **membaca balik** jadi
  `TaxonomyValue GID` yang Step-2 simpan. Loop menutup (payoff §9 rancangan) sudah tervalidasi secara logika.
- **Fase live (R-B1..B5)** cuma menyediakan dua peta itu dari fetch nyata + menulis hasilnya — tanpa
  menyentuh logika yang sudah terbukti.

---

## 5. Cakupan test (`ReverseMetafieldInverseTest`, 8)

| Test | Membuktikan |
|---|---|
| `invertsMetafields` | metafield nyata → channelData keyed by **nama**; Metaobject→TaxonomyValue (round-trip) |
| `multiValueBecomesList` | metafield multi-nilai → `List` (urut, de-dup) |
| `bareGidValue` | nilai GID telanjang (metafield non-list) juga terbalik |
| `namespaceFilter` | metafield namespace lain → dibuang |
| `neverGuess` | handle tak dikenal → skip; GID tak ke-map → drop (nol tebakan) |
| `nullSafe` | semua argumen null → kosong |
| `flipsAreaDMap` | `invert` flip peta Area D (first-wins pada bentrok) |
| `reverseOpsRegistration` | `ReverseOps` parse `METAFIELD_INVERSE` + masuk `handledArrayPaths`; absen → null |

Regresi: `ReverseAttributeListInverseTest` (5), `ReverseOpsTest` (7), `MetaobjectTaxonomyMapperTest` (10) tetap
hijau — SHAPE A + Area D forward tak tersentuh.

---

## 6. Pointer kode

| Potongan | File |
|---|---|
| Flip peta Area D | `channel/category/service/MetaobjectTaxonomyMapper.invert` |
| Descriptor | `reversesync/model/ReverseMetafieldInverseDescriptor` |
| Fungsi inverse inti | `reversesync/service/ReverseMetafieldInverse` |
| Registrasi op | `reversesync/service/ReverseOps` (`METAFIELD_INVERSE`, `metafieldInverse`, `handledArrayPaths`) |
| Test | `reversesync/ReverseMetafieldInverseTest` |

---

## 7. Berikutnya (R-B1..B5)

1. **R-B1** — bangun `handleToName` (flip `defsByName`) + `refObjToCanonical` (dari `MetaobjectTaxonomyMapper.invert`)
   dari fetch `GenericCategoryService` (read-only/reuse).
2. **R-B2** — perluas query item-fetch agar memuat `product.metafields(namespace)`.
3. **R-B3** — wire ke stage reverse + MERGE ke `channelData`; Import vs Reconcile.
4. **R-B4** — seed Shopify `METAFIELD_INVERSE`.
5. **R-B5** — live-verify round-trip (publish → import → diff kosong).

Kembali ke rancangan → [01](01-category-attributes-reverse-shape-b.md).
