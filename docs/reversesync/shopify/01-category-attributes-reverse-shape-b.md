# 01 — Reverse SHAPE B: Category Attributes balik ke `channelData` (RANCANGAN, generic)

> **Status: RANCANGAN (belum diimplementasikan).** Ini rencana untuk melengkapi arah **balik** (channel →
> platform) category attributes bertipe **reference-object** (SHAPE B, mis. Shopify metafield). Arah **maju**
> (publish)-nya sudah lengkap — lihat seri
> [`docs/product/07-publishing-engine/01-guides/shopify/`](../../product/07-publishing-engine/01-guides/shopify/01-category-attributes-write-through-generic.md)
> (Tahap A–D). Dokumen ini **generic lintas-channel**: op + resolver-nya channel-neutral, semua kekhususan
> channel = **data konfigurasi** (aturan CLAUDE.md: *no hardcoded domain knowledge*).

Dibaca berurutan: kenapa reverse SHAPE B tak otomatis, model generiknya, simetri maju↔balik, alur satu nilai,
op + config data-driven, lalu sifat aman + rencana bertahap.

---

## 0. Kosakata (lanjutan dari seri forward)

| Istilah | Arti | Padanan Shopify |
|---|---|---|
| **category attribute** | atribut yang channel lampirkan ke kategori (Fabric, Color, …) | taxonomy category attribute |
| **attribute handle** | kunci kanonik channel untuk atribut | taxonomy handle (`fabric`, `color-pattern`) |
| **canonical value** | nilai yang **platform simpan** di Step-2 | `TaxonomyValue GID` |
| **reference object** | objek sisi-channel yang nilai channel **tunjuk** | Metaobject (`gid://…/Metaobject/…`) |
| **SHAPE A** | nilai = id/string langsung di body (reversibel-trivial) | — (Shopee/TikTok) |
| **SHAPE B** | nilai = **menunjuk reference object** (butuh inversi berlapis) | Shopify metafield |
| **reverse op** | langkah un-build di `reverseSyncConfig.operations[]` | — |
| **channelData** | Step-2 channel-only fields di `channel_product_data` | — |

---

## 1. Masalah: kenapa reverse SHAPE B **tidak** otomatis

Menyelesaikan Tahap A–D **tidak** membetulkan import balik. Keduanya jalur **berlawanan & terpisah**:

- Tahap A–D seluruhnya **arah maju** (BFF → channel): resolusi handle, provisioning definisi,
  `TaxonomyValue GID → Metaobject GID`, build `product.category_metafields`.
- Reverse import **arah balik** (channel → BFF), dijalankan **eksekutor terpisah** yang dikendalikan
  `reverseSyncConfig.operations[]` (via `ReverseOps`) — **tidak** memanggil `GenericCategoryService` /
  `CategoryMetafieldEnricher` / `MetaobjectTaxonomyMapper`.

Bukti kode: blok reverse Shopify (`ChannelConfigurationDataLoader`, `reverseSyncConfig.operations[]`) hanya
punya **`VARIANT_INVERSE` + `IMAGE_INVERSE`** — **tak ada** op untuk category attribute/metafield. Jadi saat
produk Shopify ditarik balik, `category_metafields` **tak dibaca** dan tak pernah mendarat di
`channel_product_data.channelData`.

Bandingkan dengan yang **sudah** jalan (SHAPE A):

| Channel | Forward shape | Reverse op | Masuk `channelData`? |
|---|---|---|---|
| **Shopee** | SHAPE A — `value_id` di body array | `ATTRIBUTE_LIST` | ✅ ya (`ReverseAttributeListInverse`) |
| **TikTok** | SHAPE A — `product_attributes[]` | `ATTRIBUTE_LIST` | ✅ ya (name-based + fallback) |
| **Shopify** | **SHAPE B** — Metaobject GID | **belum ada** | ❌ tidak |

**Kenapa SHAPE A gampang tapi SHAPE B tidak:**
- **SHAPE A reversibel-trivial:** yang tersimpan Step-2 = `value_id`, yang di body channel = `value_id` yang
  **sama** → cukup flatten array balik (`ReverseAttributeListInverse.invert`). Nol indireksi.
- **SHAPE B butuh inversi berlapis:** yang tersimpan Step-2 = `TaxonomyValue GID` (keyed by **nama** atribut),
  yang menempel di channel = `Metaobject GID` (keyed by **handle**). Untuk membalik perlu **dua** langkah balik:
  1. **`handle → nama`** (kebalikan Tahap A/D),
  2. **`Metaobject GID → TaxonomyValue GID`** (kebalikan Area D `MetaobjectTaxonomyMapper`).
  Keduanya **belum ada**.

> Ini persis pola **[`../05` §7b IMAGE_INVERSE](../05-config-source-of-truth.md)**: gambar tak dipetakan lewat
> JOLT (di-stage `_sourceImages`), jadi reverse butuh **op sendiri**. Category attribute SHAPE B sama — forward
> menstaging `_categoryAttributes` lalu men-transform nilai lewat indireksi dua-langkah, jadi reverse **wajib**
> op sendiri yang membaca dua sumber-referensi **terbalik**.

---

## 2. Model generic: dua bentuk reverse category attribute

Simetris dengan model forward (SHAPE A/B), reverse-nya juga dua cabang — dan itu **data**, bukan cabang kode:

```
category attribute pada item channel (ditarik balik)
        │
        ├─── SHAPE A: DIRECT VALUE ────────────────────────────────────
        │      body array [{attribute_id, value_id}] → channelData[attribute_id]=value_id
        │      SUDAH ADA: op ATTRIBUTE_LIST → ReverseAttributeListInverse. Nol indireksi.
        │
        └─── SHAPE B: REFERENCE-OBJECT VALUE ──────────────────────────
               metafield [{namespace, key(handle), value:[Metaobject GID]}]
                 → (handle→nama) + (Metaobject GID→TaxonomyValue GID)
                 → channelData[nama]=TaxonomyValue GID
               BELUM ADA: op METAFIELD_INVERSE (dokumen ini). Butuh 2 resolver inverse.
```

**Genericity:** op `METAFIELD_INVERSE` + dua resolver bersifat channel-neutral. Channel mana pun yang
menyimpan category attribute sebagai reference-object mengisi **descriptor** + memakai ulang dua **config
referensi** yang sama (`metafieldDefinitionConfig`, `metaobjectMappingConfig`). Channel SHAPE A tetap
`ATTRIBUTE_LIST`. Nol literal channel di kode.

---

## 3. Simetri maju ↔ balik (inti desain)

Kunci: **reverse tidak butuh sumber kebenaran baru** — ia membaca **dua sumber-referensi yang sama** dengan
forward, hanya arah baliknya. Persis prinsip [`../05` §2a](../05-config-source-of-truth.md): tak ada salinan
kedua SoT; hanya eksekutor terbalik.

| Aspek | Forward (publish) | Reverse (import) | Sumber-referensi (SAMA) |
|---|---|---|---|
| nama ↔ handle | Tahap A/D: **nama → handle** | **handle → nama** (flip) | `metafieldDefinitions` + katalog (Tahap A) |
| nilai | Area D: **TaxonomyValue GID → Metaobject GID** | **Metaobject GID → TaxonomyValue GID** (flip) | metaobject `*_taxonomy_reference` |
| bentuk | `BUILD_METAFIELD_LIST` → `product.category_metafields` | `METAFIELD_INVERSE` → `channelData[nama]` | — |
| kunci Step-2 | baca `channelData[nama]` | tulis `channelData[nama]` | (keyspace sama) |

**Konsekuensi kuat:** artefak yang Tahap A–D produksi **sudah tepat** untuk dibalik —
`MetaobjectTaxonomyMapper.parse` menghasilkan `TaxonomyValue→Metaobject`; reverse cukup **membalik map itu**
(`Metaobject→TaxonomyValue`, first-wins). Yang belum ada murni **eksekutor inversi + op**, bukan data baru.

---

## 4. Alur balik — pelan-pelan, satu nilai

Anggap produk Shopify ditarik balik; salah satu metafield-nya:
`{ namespace:"shopify", key:"fabric", value:"[\"gid://shopify/Metaobject/286651941154\"]" }`.
Target: `channelData["Fabric"] = "gid://shopify/TaxonomyValue/1"` (persis yang Step-2 simpan → round-trip mulus).

```
fetch item channel (HARUS memuat metafields — lihat §7)
   │  product.metafields = [{ namespace:"shopify", key:"fabric", value:"[Metaobject GID]" }, …]
   ▼
METAFIELD_INVERSE (op baru, per-stage, mirror ATTRIBUTE_LIST):
   1. baca array di metafieldsPath, filter namespace == "shopify"
   2. handle = key = "fabric"
      nama   = handleToName["fabric"] = "Fabric"          ← resolver 1 (kebalikan Tahap A/D)
      (nama tak ketemu → SKIP, jangan tebak)
   3. metaobjectGids = parse value = ["gid://…/Metaobject/286651941154"]
      canonical = refObjToCanonical["gid://…/286651941154"] = "gid://…/TaxonomyValue/1"   ← resolver 2 (flip Area D)
      (tak ke-map → drop nilai itu, jangan tebak)
   4. emit channelData["Fabric"] = "gid://…/TaxonomyValue/1"   (1 nilai → skalar; banyak → List)
   ▼
MERGE ke channel_product_data.channelData (per-store)   ← rumah Step-2 category attribute
```

Persis disiplin `ReverseAttributeListInverse`: **skip kalau tak ke-map, jangan pernah menebak**; satu nilai →
skalar, banyak → `List`.

---

## 5. Op baru: `METAFIELD_INVERSE` (descriptor data-driven)

Diskriminator baru di `reverseSyncConfig.operations[]`, mirror forward `BUILD_METAFIELD_LIST` (seperti
`ATTRIBUTE_LIST` mirror `BUILD_ATTRIBUTE_LIST`). Ditambah ke `ReverseOps` (baca first-op → descriptor via
Jackson `convertValue`) + `handledArrayPaths` (agar de-derivation tak salah-lapor "pending").

Contoh seed Shopify (semua **data**, tanpa literal di kode):
```java
Map.of(
    "op", "METAFIELD_INVERSE",
    "metafieldsPath",  "product.metafields",     // di mana array metafield pada item yang ditarik
    "namespaceField",  "namespace",
    "namespace",       "shopify",                // filter: hanya metafield category-attribute
    "keyField",        "key",                    // = attribute handle
    "valueField",      "value")                  // JSON array Metaobject GID (atau GID tunggal)
```
`ReverseMetafieldInverseDescriptor` (POJO baru di `reversesync/model/`, sejajar
`AttributeListInverseDescriptor`): `metafieldsPath, namespaceField, namespace, keyField, valueField`.

Dua **resolver inverse** tak dititip di descriptor — mereka memakai ulang **config referensi forward yang
sama** (`ChannelCategoryApiConfig.metafieldDefinitionConfig` + `metaobjectMappingConfig`), dibaca terbalik.

---

## 6. Dua resolver inverse (pure) — reuse artefak forward

Keduanya **pure**, unit-testable, tanpa HTTP (fetch live tinggal di lapisan service, seperti forward):

**Resolver 1 — `handle → nama`** (kebalikan Tahap A/D):
- Sumber: hasil `MetafieldDefinitionParser.parse` (+ katalog Tahap A) = `nama(lower) → def{handle,…}`.
- Balik: `def.handle → def.name`. First-wins pada bentrok. (Kalibrasi Tahap D tak wajib di sini karena kita
  butuh **nama tampil**, dan definisi channel membawanya.)

**Resolver 2 — `Metaobject GID → TaxonomyValue GID`** (kebalikan Area D):
- Sumber: `MetaobjectTaxonomyMapper.parse(metaobjectsResponse, cfg)` = `TaxonomyValue GID → Metaobject GID`.
- Balik: **flip** map itu → `Metaobject GID → TaxonomyValue GID` (first-wins). Fungsi pure baru
  `MetaobjectTaxonomyMapper.invert(taxToMeta)` (satu baris; simetris dengan `translate`).

**Fungsi inverse inti** (baru, `reversesync/service/ReverseMetafieldInverse.java`, mirror
`ReverseAttributeListInverse`):
```
invert(descriptor, itemPayload, handleToName, refObjToCanonical) → Map<nama, canonical | [canonical…]>
```
Baca array → filter namespace → per metafield: handle→nama (skip bila null) → GID list → per GID
Metaobject→TaxonomyValue (drop bila null) → emit `nama → nilai(skalar|List)`. **Nol tebakan.**

---

## 7. Prasyarat fetch (data-driven)

Reverse item-fetch Shopify **harus memuat metafields** (kini query reverse hanya mengambil `category { id }`).
Perluas query fetch (config, bukan kode) agar mengembalikan `product.metafields(namespace:"shopify"){ key value }`.
Lalu dua fetch referensi = **fetch yang SAMA** dengan forward:
- `metafieldDefinitions` + katalog (Tahap A) → resolver 1;
- metaobjects per definition (Area D) → resolver 2.

Keduanya sudah diimplementasi di `GenericCategoryService` (arah maju). Reverse memanggilnya **read-only**
(atau lewat resolver bersama yang di-ekstrak), lalu membalik hasilnya. **Tak ada fetch/logic baru** selain
memperluas query item agar menyertakan metafields.

> **Catatan kejujuran:** apakah GET produk mengembalikan category metafields adalah soal **bentuk query**
> (GraphQL bisa memintanya), **bukan** tembok API. Yang faktual hari ini: `reverseSyncConfig` Shopify tak
> punya op/field yang membacanya. Prasyarat ini = memperluas query, bukan menembus limit.

---

## 8. Import vs Reconcile (dual, mirror IMAGE_INVERSE)

Perilaku beda per use-case, seperti [`../05` §7b](../05-config-source-of-truth.md):

- **Import (use case B, greenfield):** category attribute → `channelData[nama]` (ember **b**, channel-only,
  keyed by nama atribut — **sama** dengan cara Step-2 menyimpan). **Tak ada master** (category attribute tak
  punya padanan master, sama seperti SHAPE A §7a). Produk baru → nol konflik.
- **Reconcile (use case A, produk ter-link):** category attribute **adalah** Step-2 data milik channel itu →
  aman **MERGE** ke `channelData[nama]` per-store (rumahnya sendiri — beda dari gambar yang master-owned).
  Opsional: alih-alih menulis diam-diam, surface sebagai **drift** (`ReversePreview`) di bawah
  `reverseWritePolicy` bila ingin review-first. Default aman = MERGE (itu memang datanya).

---

## 9. Payoff: menutup loop round-trip (dirty-detection)

Ini menjawab keluhan sebelumnya (*"ubah fabric/care di Step-2, status tetap 'active tersync', tak ada sinyal
berubah"*). Dengan reverse SHAPE B:

- Forward menulis `Metaobject GID`; reverse membacanya balik → `TaxonomyValue GID` = **persis** yang Step-2
  simpan → **nol drift palsu**.
- Publish → import **round-trip = no-op** (tak ada sinyal "changed" semu), sehingga dirty-detection stabil dan
  status sinkron **jujur**. Tanpa reverse SHAPE B, category attribute Shopify tak pernah "terlihat" balik →
  loop tak pernah menutup.

---

## 10. Sifat: aman & generic

- **Aditif + terpisah:** op/resolver baru; jalur forward + Temporal worker tak tersentuh; master tak ditimpa.
- **Gated data-driven:** tanpa op `METAFIELD_INVERSE` di config → tak jalan (channel SHAPE A & Shopify hari
  ini). Aktif hanya saat di-seed.
- **Graceful + never-guess:** handle tak ke-nama → skip; GID tak ke-canonical → drop; fetch referensi gagal →
  atribut tak masuk (bukan crash). Sama disiplin dengan seluruh reverse.
- **Generic:** nol literal channel; semua path/namespace = descriptor; dua resolver reuse config referensi
  forward. Channel SHAPE B berikutnya = seed descriptor + config, **nol kode**.

---

## 11. Rencana bertahap + test

Diurut dari paling murah:

1. ✅ **R-B0 — Fungsi inverse pure** (SELESAI, bff-v20 — lihat [`02`](02-r-b0-pure-inverse-implementation.md)).
   `MetaobjectTaxonomyMapper.invert(taxToMeta)` (flip) +
   `ReverseMetafieldInverse.invert(descriptor, item, handleToName, refObjToCanonical)`. Descriptor POJO +
   daftarkan `METAFIELD_INVERSE` di `ReverseOps` (+ `handledArrayPaths`). **Nol I/O** → murni testable
   (`ReverseMetafieldInverseTest`, 8). Dorman sampai di-seed (R-B4).
2. ✅ **R-B1 — Resolver dari struktur forward** (SELESAI, bff-v20 — lihat [`03`](03-r-b1-build-inverse-lookups.md)).
   Builder pure `ReverseMetafieldResolvers.handleToName` (flip `defsByName`) + `refObjToCanonical` (flip tiap
   `MetaobjectTaxonomyMapper.parse` via `.invert`, union). **Nol I/O** (`ReverseMetafieldResolversTest`, 6); fetch
   live-nya di-reuse read-only di R-B3.
3. ✅ **R-B2 — Perluas item-fetch** agar memuat `product.metafields` (SELESAI, bff-v20 — lihat
   [`04`](04-r-b2-fetch-metafields.md)). Config `metafieldsFetch` (mirror `categoryFetch`) → panggilan GraphQL
   kedua inject array metafields ke `targetPath`; extractor pure `ReverseMetafieldFetch` +
   `enrichWithMetafields` di chain fetch. Gated + dorman (`ReverseMetafieldFetchTest`, 3).
4. ✅ **R-B3 — Wire ke pipeline reverse** (SELESAI, bff-v20 — lihat [`05`](05-r-b3-wire-into-reverse-pipeline.md)).
   `GenericCategoryService.fetchReverseReferenceData` (read-only, TANPA Jalur B) + orchestrator
   `ReverseMetafieldEnrichService` (rangkai R-B0/B1/B2) + colok simetris `ATTRIBUTE_LIST` di `ReverseApplyService`
   (reconcile) & `ReverseImportService` (import). Gated + graceful + dorman.
5. ✅ **R-B4 — Seed Shopify** (SELESAI, bff-v20 — lihat [`06`](06-r-b4-seed-shopify.md)). Op `METAFIELD_INVERSE`
   di `operations[]` + config `metafieldsFetch` (GraphQL 2024-07). **Membalik dorman → AKTIF** untuk Shopify;
   nol kode baru. Aman: jaring pengaman Area A (403 pra-consent → kosong anggun).
6. ⏳ **R-B5 — Live-verify round-trip** (runbook siap — lihat [`07`](07-r-b5-live-verify-runbook.md)): publish →
   reverse pull/apply → `channelData` berisi nilai yang sama → diff kosong. Menunggu Area A operasional (bukan kode).

**Test (pola pure, mirror `ReverseAttributeListInverseTest`):**
- `invert` map Metaobject→TaxonomyValue; `handleToName` flip; skalar vs multi-value; namespace filter; handle
  tak ke-nama → skip; GID tak ke-canonical → drop; null-safe.
- Regresi: channel SHAPE A (tanpa `METAFIELD_INVERSE`) → tak ada langkah SHAPE B jalan.

---

## 12. Pointer kode (yang akan disentuh)

| Bagian | File |
|---|---|
| Fungsi inverse pure (baru) | `reversesync/service/ReverseMetafieldInverse.java` |
| Flip map Area D (baru, 1 fungsi) | `channel/category/service/MetaobjectTaxonomyMapper.invert` |
| Descriptor (baru) | `reversesync/model/ReverseMetafieldInverseDescriptor.java` |
| Daftarkan op | `reversesync/service/ReverseOps` (`METAFIELD_INVERSE` + `handledArrayPaths`) |
| Resolver dari fetch forward | reuse `GenericCategoryService` / `MetafieldDefinitionParser` (read-only) |
| Perluas query item-fetch | `reverseSyncConfig` fetch query (config) |
| Seed | `ChannelConfigurationDataLoader` (blok Shopify `reverseSyncConfig.operations[]`) |
| Test | `ReverseMetafieldInverseTest` (pure) |

**Referensi:** forward [Tahap A–D](../../product/07-publishing-engine/01-guides/shopify/01-category-attributes-write-through-generic.md),
reverse [`../05` SoT](../05-config-source-of-truth.md) (§2a shared-SoT, §7a attribute_list, §7b IMAGE_INVERSE),
`ReverseAttributeListInverse` (cetakan SHAPE A), `MetaobjectTaxonomyMapper` (Area D yang dibalik).
