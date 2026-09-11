# 01 — Category Attributes via Write-Through (rancangan GENERIC lintas-channel)

**Status:** DESAIN (belum diimplementasikan penuh). Jalur B (auto-upsert reference-object) sudah ADA & terbukti;
dokumen ini merancang lapisan di atasnya — **write-through provisioning** — sehingga *tiap merchant* mendapat
*semua* category attribute **tanpa satu pun langkah manual**, dan mekanismenya **tidak** ter-hardcode ke Shopify.

Dibaca berurutan, dokumen ini menjelaskan **pelan-pelan**: masalahnya, model generiknya, alurnya langkah demi
langkah, bukti live yang sudah kita kumpulkan, lalu konfigurasi data-driven + rencana implementasi.

Seri lengkap SHAPE B (folder ini) — **urutan belajar dari awal**:
- **01** (ini) — rancangan generic write-through (ringkasan + kosakata). Baca ini dulu untuk peta besar.
- [02 — Perjalanan satu nilai](02-value-journey-howto.md) — tutorial konkret: satu nilai (Fabric=Cotton) menempuh pipeline.
- [03 — Tahap A](03-tahap-a-available-catalog.md) — available-attribute catalog (sumber handle).
- [04 — Tahap B](04-tahap-b-resolve-by-type.md) — resolve reference-def by type.
- [05 — Tahap C](05-tahap-c-probe-enable.md) — probe-enable definisi yang belum ada.
- [06 — Tahap D](06-tahap-d-name-calibration.md) — kalibrasi nama (jembatan nama kuirk; opsional, data-driven).
- [07 — Spike + Go/No-Go](07-spike-and-go-no-go.md) — referensi: validasi kontrak Shopify + runbook Area A (scopes/re-consent).
- [08 — Follow-up / riwayat](08-followup-history.md) — apendiks: kenapa TikTok body-fix tak carry-over; riwayat keputusan.

Terkait (di luar folder): guide [19](../19-step2-category-attribute-fields.md) (Step-2 form),
[27](../27-tiktok-category-attributes-to-product-attributes.md) (analog TikTok, jalur body SHAPE A),
[[shopee-image-two-step-flow]].

---

## 0. Kosakata (baca sekali)

Kita sengaja pakai istilah **channel-neutral**. Padanan Shopify diberikan agar jelas, tapi runtime **tidak boleh**
menyebut nama channel (aturan CLAUDE.md: *no hardcoded domain knowledge*).

| Istilah generik                  | Arti                                                                   | Padanan Shopify                             |
|----------------------------------|------------------------------------------------------------------------|---------------------------------------------|
| **category attribute**           | atribut yang channel lampirkan ke sebuah kategori (Fabric, Color, …)   | taxonomy category attribute                 |
| **attribute handle**             | kunci kanonik channel untuk atribut itu                                | taxonomy handle (`fabric`, `color-pattern`) |
| **value shape**                  | *bentuk* nilai yang channel terima untuk atribut                       | lihat §2                                    |
| **reference object**             | objek sisi-channel yang sebuah nilai harus **tunjuk**                  | Metaobject (`gid://…/Metaobject/…`)         |
| **reference-object definition**  | *tipe/skema* reference object                                          | MetaobjectDefinition (`shopify--fabric`)    |
| **attribute definition**         | atribut yang sudah **diaktifkan** di toko                              | product metafield definition                |
| **available-attribute catalog**  | daftar atribut yang *tersedia tapi belum diaktifkan*                   | `standardMetafieldDefinitionTemplates`      |
| **auto-provision-on-write**      | channel mengaktifkan definisi saat nilai **pertama** ditulis           | efek samping `metafieldsSet`                |
| **post-write op**                | pemanggilan channel SETELAH create produk (bukan body)                 | `create_CP_Graphql` op                      |
| **staging key**                  | kunci ber-prefix `_` yang dibaca post-processing, tak bocor ke payload | `_categoryAttributes`                       |

---

## 1. Masalah yang diselesaikan

Sebuah category attribute yang **diisi merchant** di Step-2 harus **sampai** ke channel. Sampai sekarang, di
Shopify, hanya atribut yang **sudah diprovision** (definisinya sudah ada di toko) yang berhasil. Atribut lain
di-**skip** karena runtime kita memakai *daftar definisi yang sudah ada* (`metafieldDefinitions`) untuk mencari
handle — jadi atribut yang belum diaktifkan tak punya handle → dilewati.

Gejala nyata: dari 10 atribut produk-level yang diisi, hanya 3–4 (Fabric, Age group, Care instructions) yang tampil
di Shopify; sisanya (Waist rise, Best uses, Target gender, …) tidak.

**Solusi salah (yang harus dihindari):** menyuruh tiap merchant mengaktifkan tiap atribut secara manual di admin
channel saat onboarding. Ini **tidak scalable** dan bukan cara platform omnichannel dewasa bekerja.

**Solusi benar (write-through):** channel akan **auto-provision** definisi saat kita **menulis** nilai pertama
kali. Jadi runtime cukup: temukan handle → pastikan reference object ada → tulis nilai → channel yang mengaktifkan
definisinya. **Nol langkah manual per merchant.**

---

## 2. Model generik: satu atribut → salah satu "value shape"

Inti agar ini **generic**: sebuah category attribute, saat menuju channel, jatuh ke salah satu **value shape**.
Channel berbeda memakai shape berbeda — dan itu **data konfigurasi**, bukan cabang kode.

```
category attribute (nilai pilihan merchant)
        │
        ├─── SHAPE A: DIRECT VALUE ───────────────────────────────────────────────
        │      Nilai = id/string yang langsung masuk array di BODY create.
        │      Contoh: Shopee attribute_list[{attribute_id, value_id}],
        │               TikTok product_attributes[], eBay aspects{}.
        │      Sudah ditangani: staging _categoryAttributes → op BUILD_ATTRIBUTE_LIST → body.
        │      TIDAK perlu provisioning, TIDAK perlu reference object.
        │
        └─── SHAPE B: REFERENCE-OBJECT VALUE ─────────────────────────────────────
               Nilai harus MENUNJUK sebuah "reference object" sisi-channel yang
               HARUS ADA lebih dulu, dan atributnya HARUS DIAKTIFKAN lebih dulu.
               Di-set lewat POST-WRITE op (bukan body).
               Contoh: Shopify category metafield → Metaobject GID.
               INI yang butuh write-through (dokumen ini).
```

Perhatikan: **produser staging sama** untuk kedua shape (`_categoryAttributes` dibangun oleh satu fungsi
channel-agnostik, [02](02-value-journey-howto.md) §2A). Yang berbeda hanya **konsumen** (op post-processing/rule) — dan itu data.

> **Kenapa framing ini penting untuk genericity.** Kalau besok ada channel X yang juga memakai reference-object
> (mis. marketplace yang butuh "attribute value id" yang harus dibuat via endpoint terpisah), ia cukup **mengisi
> konfigurasi SHAPE B** — tanpa satu baris kode runtime baru. Mesin write-through membaca konfigurasi dan
> menjalankan langkah-langkah yang **dideklarasikan**, bukan langkah yang di-hardcode untuk Shopify.

---

## 3. Alur write-through — pelan-pelan, langkah demi langkah

Kita bahas SHAPE B. Anggap merchant memilih **Waist rise = "Mid rise"** untuk kategori Skirts. Di toko, atribut
Waist rise **belum** diaktifkan (belum ada definisi, belum ada reference object).

### Langkah 0 — Staging (sudah ada, generic)
`stageCategoryAttributes` menaruh `_categoryAttributes = [{ id:"Waist rise", value:"gid://…/TaxonomyValue/1376",
valueLabels:{…:"Mid rise"} }, …]`. `valueLabels` (Jalur B) membawa **nama tampil** dari opsi live — dibutuhkan
reference object yang punya field `label` wajib.

### Langkah 1 — Resolusi handle
Runtime butuh **attribute handle** channel (`waist-rise`). Dua sumber, digabung:
- **enabled-definitions API** — atribut yang **sudah** diaktifkan (Shopify: `metafieldDefinitions`). Untuk atribut
  yang sudah aktif (Fabric/Care/Age/Color), handle + tipe + reference-definition-id langsung dari sini.
- **available-attribute catalog API** — atribut yang **tersedia tapi belum** diaktifkan (Shopify:
  `standardMetafieldDefinitionTemplates`, filter namespace channel). Untuk atribut belum-aktif (Waist rise, dst),
  handle dari sini.

> **Kenapa dua sumber?** Karena begitu sebuah definisi **diaktifkan**, ia **pindah** dari katalog "available" ke
> daftar "enabled". Jadi keduanya **saling melengkapi**: gabungan keduanya = handle untuk atribut apa pun. Ini
> temuan live (lihat §4), bukan asumsi.

Handle tidak boleh **ditebak dari nama** — contoh nyata: `Color → color-pattern` (bukan `color`). Selalu ambil
dari katalog channel.

### Langkah 2 — Pastikan reference-object definition ADA
Dengan handle, turunkan **tipe reference-object definition** = `<prefix><handle>` (Shopify: `shopify--waist-rise`).
Query definisi itu **by type** (Shopify: `metaobjectDefinitionByType`):
- **Ada** → ambil `id` + **ref-field-key** (field bertipe taxonomy-reference; bervariasi: `taxonomy_reference`
  vs `color_taxonomy_reference` → **ditemukan by TYPE**, tak di-template).
- **Belum ada (null)** → **probe-write**: tulis atributnya dengan nilai kosong yang valid (Shopify:
  `metafieldsSet(key:handle, value:"[]")`). Channel akan **auto-provision** definisi (mengaktifkan attribute
  definition + membuat reference-object definition sebagai efek samping). Lalu **re-query by type** → kini dapat
  `id` + ref-field-key.

> **Kenapa probe-write?** Karena chicken-and-egg: kita tak bisa membuat reference object tanpa definisinya ada,
> dan definisinya baru ada setelah nilai pertama ditulis. Probe-write **memutus** siklus itu — sekali per atribut
> per toko (publish berikutnya: definisi sudah ada, tanpa probe).

### Langkah 3 — Pastikan reference object ADA (Jalur B, sudah ada)
Upsert reference object untuk TaxonomyValue terpilih (Shopify: `metaobjectUpsert`), **idempoten** lewat handle
deterministik `tv-<valueId>`. Field: `label` (dari `valueLabels`) + ref-field-key (dari Langkah 2) = GID
TaxonomyValue. Kembalikan **reference-object id** (Metaobject GID).

### Langkah 4 — Emit nilai ter-enrich
`_categoryAttributes` untuk Waist rise sekarang: `{ handle:"waist-rise", type:"list.metaobject_reference",
values:["gid://…/Metaobject/NNN"] }`. Op `BUILD_METAFIELD_LIST` (sudah ada) merakit support field
`product.category_metafields`.

### Langkah 5 — Post-write op menulis nilai final
Op `set_category_metafields` (sudah ada) menjalankan write final (Shopify: `metafieldsSet`) → nilai menempel di
produk. Karena atributnya sudah diaktifkan di Langkah 2, ini sukses.

**Diagram ringkas:**
```
handle ← (enabled-defs API) ∪ (available-catalog API)          [Langkah 1]
ref-def by type
   └─ null? → probe-write (auto-provision) → re-query          [Langkah 2]
upsert reference object (idempoten)  → ref-object id           [Langkah 3]  (Jalur B, ADA)
enrich _categoryAttributes                                     [Langkah 4]
post-write op set value                                        [Langkah 5]  (ADA)
```

Publish kedua dan seterusnya: Langkah 2 menemukan definisi langsung (tanpa probe), Langkah 3 idempoten (no-op bila
tak berubah). Steady-state = murah.

---

## 4. Bukti live (Shopify) — apa yang SUDAH diverifikasi

Semua potong mekanisme sudah dibuktikan dengan panggilan nyata ke toko sandbox (`labamap.myshopify.com`):

| Klaim                                                       | Uji                                                                               | Hasil                                                                                                                              |
|-------------------------------------------------------------|-----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Upsert reference object pada definisi standar **diizinkan** | `metaobjectUpsert(type:"shopify--fabric", …)`                                     | ✅ mengembalikan `Metaobject/293080826146`                                                                                          |
| Ref-field-key **bervariasi**, harus by-type                 | fabric=`taxonomy_reference`, color-pattern=`color_taxonomy_reference`             | ✅ dikonfirmasi                                                                                                                     |
| Handle **tak bisa ditebak**                                 | `Color → color-pattern` (bukan `color`)                                           | ✅                                                                                                                                  |
| Katalog available memberi handle un-provisioned             | `standardMetafieldDefinitionTemplates` (ns=shopify)                               | ✅ `Waist rise→waist-rise`, `Best uses→best-uses`, `Target gender→target-gender`, `Skirt/Dress length type→skirt-dress-length-type` |
| Enabled vs available **saling melengkapi**                  | Fabric/Care (enabled) TAK ada di katalog; Waist rise (belum) ADA                  | ✅                                                                                                                                  |
| Menulis metafield **auto-provision** definisi               | `metafieldsSet(key:"target-gender", …)` (belum provisioned)                       | ✅ tak ada error "definition not found"; error hanya soal value; def id `24945164578` terungkap                                     |
| Query ref-def by type ADA                                   | `metaobjectDefinitionByType(type:…)`                                              | ✅ ada (null bila belum dibuat)                                                                                                     |
| Probe-write **membuat** ref-def                             | probe target-gender → lalu `metaobjectDefinitionByType("shopify--target-gender")` | ✅ kini non-null (id `24945164578` + fieldDefinitions)                                                                              |

Kesimpulan: **write-through feasible penuh, per-merchant, nol langkah manual.**

---

## 5. Konfigurasi data-driven (agar GENERIC)

Semua langkah di §3 dinyatakan sebagai **konfigurasi per-channel** (`channel_category_api_config`), bukan literal.
Runtime engine membaca config dan menjalankan langkah yang **ada** (langkah tanpa config → dilewati). Sebuah channel
SHAPE A cukup mengosongkan blok reference-object; channel SHAPE B mengisinya.

**Blok konfigurasi (nama generik yang diusulkan; nama field saat ini ber-flavor Shopify — lihat catatan):**

| Kebutuhan (Langkah)      | Field config                                              | Contoh Shopify                                                   | Channel SHAPE A (Shopee)                            |
|--------------------------|-----------------------------------------------------------|------------------------------------------------------------------|-----------------------------------------------------|
| Prefix tipe ref-def (L2) | `referenceTypePrefix`                                     | `"shopify--"`                                                    | *(kosong → SHAPE B mati)*                           |
| Katalog available (L1)   | `availableCatalogQuery` + `catalogNamespace` + paths      | `standardMetafieldDefinitionTemplates`, ns=`shopify`             | *(kosong)*                                          |
| Ref-def by type (L2)     | `referenceDefByTypeQuery` + `refFieldType`                | `metaobjectDefinitionByType`, `product_taxonomy_value_reference` | *(kosong)*                                          |
| Probe-enable (L2)        | `probeEnableMutation` + `emptyValueLiteral`               | `metafieldsSet(...value:"[]")`                                   | *(kosong)*                                          |
| Upsert ref object (L3)   | `upsertMutation`, `upsertHandleTemplate`, `labelFieldKey` | `metaobjectUpsert`, `tv-{id}`, `label`                           | *(kosong)*                                          |
| Rakit support field (L4) | post-processing rule + op                                 | `BUILD_METAFIELD_LIST` → `product.category_metafields`           | `BUILD_ATTRIBUTE_LIST` → `attribute_list` (SHAPE A) |
| Write final (L5)         | channel metadata op                                       | `set_category_metafields`                                        | *(SHAPE A pakai body, tak perlu)*                   |

> **Catatan jujur soal penamaan.** Field config yang ada sekarang (`metaobjectMappingConfig`,
> `metafieldDefinitionConfig`) memakai istilah Shopify. **Mekanismenya sudah data-driven** (runtime tak punya
> cabang `if channel==shopify`), tetapi *nama*-nya belum channel-neutral. Rekomendasi: saat mengimplementasikan,
> perkenalkan alias generik (`referenceObjectSinkConfig`) ATAU biarkan nama Shopify tapi dokumentasikan bahwa ia
> adalah "blok SHAPE B" yang channel lain juga boleh isi. Yang **wajib**: jangan tambah literal channel di runtime.

**Aturan kunci genericity (dari CLAUDE.md):** *"A field's role, semantics, relevance, and capability are data."*
Handle, ref-field-key, tipe, prefix — semuanya **datang dari channel API atau config**, tak pernah dari substring
nama di kode. `Color→color-pattern` adalah buktinya: menebak dari nama akan salah; hanya data channel yang benar.

---

## 6. Di mana tiap langkah HIDUP (tanpa cabang channel)

| Langkah                   | Rumah                                                                    | Catatan                                       |
|---------------------------|--------------------------------------------------------------------------|-----------------------------------------------|
| 0 Staging                 | `PublishPayloadStagingService.stageCategoryAttributes`                   | sudah generic; `valueLabels` ditambah Jalur B |
| 1 Handle                  | `GenericCategoryService` (baru: gabung enabled-defs + available-catalog) | dua fetch, di-cache                           |
| 2 Ref-def by type + probe | `GenericCategoryService.continueEnrich` (diperluas)                      | probe = satu write, first-publish saja        |
| 3 Upsert ref object       | `GenericCategoryService.upsertMissingMetaobjects` (Jalur B, ADA)         | idempoten                                     |
| 4 Rakit                   | `GenericPostProcessingEngine` op `BUILD_METAFIELD_LIST` (ADA)            | output key dari config                        |
| 5 Write final             | sync `set_category_metafields` op (metadata, ADA)                        | `$metafields` array via coerceStructured      |

Tak ada satu pun yang menyebut nama channel. Perbedaan Shopify vs Shopee **seluruhnya** ada di config/rule/metadata.

---

## 7. Idempotensi, graceful, gating, keamanan

- **Idempoten:** handle reference object deterministik (`tv-<valueId>`) → upsert ulang = update no-op, bukan
  duplikat. Probe-write value `"[]"` = valid, aman diulang.
- **Graceful per-nilai/atribut:** kegagalan resolusi/probe/upsert **hanya** membuat atribut itu tak ter-map
  (di-drop, di-WARN) — **tak pernah** memblok publish. Konsisten dengan perilaku Area D sekarang.
- **Gated:** langkah SHAPE B jalan **hanya** bila config-nya ada (mis. `upsertMutation`/`probeEnableMutation`
  ter-seed) DAN scope channel cukup (Shopify: `write_metaobjects`, `read/write_metaobject_definitions`).
- **Menulis ke toko merchant:** probe-write + upsert adalah **operasi tulis**. Minimal (hanya atribut terisi),
  idempoten, gated. Ini keputusan sadar; wajib di-log jelas (`Jalur B: created …`, `probe-enabled …`).
- **Rate/throttle:** upsert/probe di-batch per-publish; hormati budget cost channel (Shopify cost API). Steady-state
  minim karena def+object hanya dibuat sekali.

---

## 8. Cakupan & batasan (jujur)

- **Otomatis (Shopify, kategori Skirts):** Fabric, Care, Age group, Color, Waist rise, Best uses, Target gender,
  Skirt/Dress length type — **8 atribut** produk-level.
- **Sengaja di-skip (benar):** Size, Pattern — ada di `variantOptionAttributeNames` → **variant-axis**, memang
  bukan product-metafield. Di-tangani jalur varian, bukan write-through.
- **Kuirk nama (degrade graceful):** Clothing features, Skirt style, Size type — nama attribute-API ≠ nama katalog
  → handle tak ter-resolve → di-skip + WARN. Bisa dikalibrasi via **normalisasi nama** atau seed pemetaan nama
  (data, bukan kode) belakangan. Bukan blocker.
- **Batas Phase-1:** hanya value shape `reference` yang dibangun; metafield non-reference sederhana (mis. teks)
  belum. Aditif kalau dibutuhkan.

---

## 9. Rencana implementasi BERTAHAP — ✅ SEMUA TERIMPLEMENTASI (bff-v20)

Diurut dari paling aman (nol write baru) ke penuh. Tiap tahap punya guide sendiri (lihat indeks atas):

1. ✅ **[Tahap A](03-tahap-a-available-catalog.md) — Handle-source gabungan (read-only).** Fetch
   `available-attribute catalog` + gabung ke `defsByName`. Atribut yang reference-object definition-nya **sudah
   ada** langsung menyala lewat Jalur B — tanpa probe-write. Test: `MetafieldDefinitionParserTest`.
2. ✅ **[Tahap B](04-tahap-b-resolve-by-type.md) — Ref-def by type.** `metaobjectDefinitionByType(type)`
   sehingga atribut dari katalog (id=null) tetap bisa di-Jalur-B. Test: `CatalogDefIdResolutionTest`.
3. ✅ **[Tahap C](05-tahap-c-probe-enable.md) — Probe-enable (write, gated).** Untuk ref-def yang masih null,
   `standardMetaobjectDefinitionEnable(type)` → re-query. Auto-provision penuh. Gated + graceful + idempoten.
4. ✅ **[Tahap D](06-tahap-d-name-calibration.md) — Kalibrasi nama (read-only, data-driven).** Jembatan
   `lower(quirk)→def` via alias DATA (`nameAliases`) + normalisasi struktural, agar nama kuirk (plural/tanda-baca)
   tetap join. Alias diisi setelah live-verify. Test: `NameCalibrationTest`.

Setiap tahap: commit terpisah + test penjaga; perilaku channel lain (SHAPE A) tak berubah (blok config kosong).

---

## 10. Test (pola pure + skenario)

- **Pure:** parse katalog available (name→handle), gabung enabled∪available, pilih ref-field-key by type, derive
  ref-def type dari handle, derive handle reference object. (lanjutan `MetaobjectTaxonomyMapperTest` /
  `MetafieldDefinitionParserTest`.)
- **Skenario `continueEnrich`:** (a) atribut enabled → jalur lama; (b) atribut dari katalog + def sudah ada →
  Tahap A/B; (c) def null → probe→requery→upsert (Tahap C, mock WebClient).
- **Regresi:** channel SHAPE A (Shopee) tanpa config reference-object → tak ada langkah SHAPE B yang jalan.

---

## 11. Pointer kode (saat implementasi)

- Staging `_categoryAttributes` (+`valueLabels`): `PublishPayloadStagingService.stageCategoryAttributes`.
- Enrich + Jalur B (upsert): `GenericCategoryService.continueEnrich` / `upsertMissingMetaobjects`.
- Parser reference-object + helper Jalur B: `MetaobjectTaxonomyMapper` (`parseTaxonomyRefField`, `deriveHandle`,
  `parseUpsertedId`).
- Rakit support field: `GenericPostProcessingEngine.executeBuildMetafieldList` (`BUILD_METAFIELD_LIST`).
- Config: `ChannelCategoryApiConfig.MetaobjectMappingApiConfig` / `MetafieldDefinitionApiConfig`; seed
  `CategoryApiConfigDataLoader` (Shopify).
- Write final op: `ChannelMetadataMigration.graphqlPostWriteWorkflow` (`set_category_metafields`).
- Guard fetch (jangan cache schema degraded): `GenericCategoryService.graphqlResponseHasErrors` /
  `restResponseHasError` (guide fetch-hardening).
