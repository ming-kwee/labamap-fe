# JOLT-Generation Agent ↔ Post-Processing: mengapa agent stuck & bagaimana membuatnya konvergen (#1 + #2)

> **Ringkasan.** Agent AI yang meng-generate JOLT spec (`JoltGenerationAgentService`) sering
> **stuck sampai timeout tanpa menghasilkan recommendation** — khususnya untuk Shopee. Akarnya bukan
> "AI kurang pintar" atau "kurang data", melainkan sebuah **celah antar-lapisan**: agent dibiarkan
> mencoba memetakan field yang **memang tugas post-processing, bukan JOLT** (mis. gambar), lalu kena
> collision yang **tak mungkin** ia perbaiki, dan loop sampai budget habis.
>
> Dokumen ini menjelaskan penyebabnya, lalu dua perbaikan yang membuat agent **konvergen**:
> - **#1 — enforce pemisahan JOLT ↔ post-processing** saat validasi (strip mapping yang memasuki
>   wilayah post-processing).
> - **#2 — gate completeness yang sadar-cakupan** (field yang dibangun post-processing bukan "missing")
>   + deteksi **gap sejati**.
>
> Output ke developer (#3 katalog op + surfacing gap ke `AiRecommendation`) dibahas di guide berikutnya:
> [16-jolt-agent-gap-recommendations.md](16-jolt-agent-gap-recommendations.md).

---

## 1. Latar: bagaimana payload channel dibentuk

Payload `channelAttributes` yang dikirim ke sync-service dibentuk dari **tiga lapisan** (lihat juga
[02-jolt-transformation.md](02-jolt-transformation.md) dan [05-post-processing-config.md](05-post-processing-config.md)):

```
master product ──JOLT (shift/default)──▶ body channel ──post-processing rules──▶ body final ──▶ sync
                     ▲                                        ▲
        apiSchema (bentuk target)              staging keys (_sourceImages, _packageDimension, …)
```

Pembagian tugas (prinsip di `CLAUDE.md`):

| Lapisan | Tugas | Contoh (Shopee) |
|---|---|---|
| **JOLT** | Memetakan **master field → path body** yang bisa di-*shift* langsung | `name→item_name`, `price→original_price`, `inventory→normal_stock`, `variants[*]` |
| **post-processing** | **Membangun** struktur turunan / support field dari staging atau output JOLT | `images.image_url_list` (dari `_sourceImages`), `tier_variation`/`model` (dari `variants`), `dimension` (dari `_packageDimension`), `brand`, `seller_stock`, `logistic_info`, `attribute_list`, `category_id` |

**Poin kunci:** `apiSchema` adalah **cermin setia create-body** — ia memuat **semua** field body, termasuk
yang dibangun post-processing. Ia dipakai bersama oleh JOLT-agent (sebagai target) **dan** `buildTargetSchema`.

### 1.1 Kenapa JOLT tak boleh menulis ke target post-processing — dua bencana (contoh: `tier_variation`)

Pembagian di atas bukan sekadar kerapian. Kalau JOLT **ikut** menulis ke target yang dimiliki
post-processing (mis. `tier_variation`), terjadi **dua bencana** saat publish nyata. Mari lihat pelan-pelan
dengan satu contoh Shopee: axis varian **Size × Color**.

**Kondisi awal (master):**
```
variants: [
  { sku: "SKU-XS-BLACK", size: "Xs", color: "Black", price: 112000, inventory: 1 },
  { sku: "SKU-S-BLACK",  size: "S",  color: "Black", price: 113000, inventory: 2 }
]
```

**Cara BENAR — JOLT flat, post-processing membangun komposit.** JOLT hanya meneruskan field flat per-varian;
`BUILD_TIER_VARIATION` (post-processing) membaca `variants[].size`/`variants[].color` lalu merakit `tier_variation`:
```
JOLT:  variants = { *: { sku:variants[&1].sku, size:variants[&1].size, color:variants[&1].color, ... } }
       → output tetap punya variants[].size = "Xs"/"S" dan variants[].color = "Black"

BUILD_TIER_VARIATION baca dims [size,color] dari variants[] →
       tier_variation = [ {name:"Size",  option_list:[{option:"Xs"},{option:"S"}]},
                          {name:"Color", option_list:[{option:"Black"}]} ]   ✅
```

Sekarang bayangkan agent/spec **salah**: ia mencoba **langsung** membangun `tier_variation` di JOLT, mis.
memetakan `variants[*].size → tier_variation[0].option_list[…].option`.

#### Bencana 1 — Struktur rusak (double-write / collision)

`tier_variation` ditulis **DUA KALI**: sekali oleh JOLT (parsial, dari spec) dan sekali oleh
`BUILD_TIER_VARIATION` (post-processing). Keduanya menulis ke path yang sama → hasilnya **saling menimpa /
tergabung tak konsisten** → `tier_variation` malformed. Kasus ekstrimnya = **collision index tetap vs loop**
(persis bug gambar di §2.2 di bawah: `images[0]` dari `mainImage` menabrak `images[&1]` dari `galleryImages`)
— `JoltTargetCollisionValidator` menandainya **ERROR** dan menolak publish, karena JOLT memang **tak bisa**
mengekspresikan struktur itu tanpa tabrakan.
```
JOLT tulis:            tier_variation = [{name:"Size", option_list:[{option:"Xs"}]}]   (parsial/keliru)
BUILD_TIER_VARIATION:  tier_variation = [{name:"Size",...},{name:"Color",...}]         (menimpa/gabung)
→ hasil akhir tak deterministik / rusak                                                ❌
```

#### Bencana 2 — Builder kehilangan bahan (flat "ditelan")

Ini lebih halus. Dengan memetakan `variants[*].size → tier_variation[…]`, JOLT **mengalihkan** nilai `size`
ke dalam komposit — sehingga varian ter-transform **tak lagi punya field flat `size`**:
```
// output JOLT setelah size "ditelan" ke tier_variation:
variants: [ { sku:"SKU-XS-BLACK", color:"Black", price:112000 },   // ← size HILANG
            { sku:"SKU-S-BLACK",  color:"Black", price:113000 } ]
```
Lalu `BUILD_TIER_VARIATION` jalan: ia membaca dims `[size, color]` dan mencari `variants[].size` untuk tiap
varian → **tak ketemu** → membangun tier `Size` dengan option kosong/salah. Builder **kehilangan bahannya**:
```
BUILD_TIER_VARIATION baca variants[].size → null → tier "Size" option_list = []   ❌
```
Efek beruntun: `BUILD_MODEL` (yang memetakan varian → `tier_index` berdasar posisi option di tier) juga
salah karena tiernya kosong → payload varian ke Shopee jadi rusak.

**Inti kedua bencana:** target komposit (`tier_variation`/`model`/`images`/`dimension`/…) **milik
post-processing**; ia butuh **input** (flat `variants[].size`, atau kunci `_`-staged) tetap utuh. JOLT yang
menulis langsung ke target itu **merampas input** builder (Bencana 2) **dan/atau** menabrak output builder
(Bencana 1). Itulah kenapa ownership-contract **membuang** (remediate) mapping JOLT ke owned-target — bukan
karena rewel, tapi karena bencana ini terjadi kalau tidak.

#### Kapan Bencana 2 berlaku — dan kapan `_source` mengimunisasi

Bencana 2 **tidak** merata. Banyak builder membaca bahannya dari **`_source`** / kunci `_`-staged, **bukan**
dari output JOLT. Kunci `_`-prefixed **kebal** terhadap JOLT (JOLT tak bisa menelannya — `buildChannelAttributes`
melewati kunci `_`). Untuk builder itu, JOLT yang salah menulis ke target-nya **tak berpengaruh** ke bahan:

| Builder | Baca NILAI dari | JOLT menelan field → efek |
|---|---|---|
| `category_id` | `_source.channelCategoryId` | ❌ tak berpengaruh (**kebal**) |
| `package_weight.value` | `_source.weight` | ❌ tak berpengaruh (**kebal**) — ini persis fix TikTok kita |
| `images.image_url_list` | `_sourceImages` | ❌ tak berpengaruh (**kebal**) |
| `dimension` | `_packageDimension` | ❌ tak berpengaruh (**kebal**) |
| **`tier_variation` / `model`** | **`variants[]` hasil JOLT** (bukan `_source`) | ✅ **rentan** — nilai bisa ditelan |

Bedanya di `BUILD_TIER_VARIATION`/`BUILD_MODEL`: **nama axis** (`size`, `color`) diambil dari
`_source._productTypeVariantDimensions` (kebal), tetapi **nilai per-varian** (`Xs`/`Black`) dibaca dari
`variants[]` hasil JOLT — `getNestedValue(data, "variants")`, bukan `_source.variants`
(`GenericPostProcessingEngine:1663` untuk tier, `:1745` untuk model). Karena itu, contoh `tier_variation` di
atas justru **salah satu dari sedikit kasus Bencana 2 yang nyata** — bukan konsekuensi umum.

> **Kenapa nilai varian dibaca dari `variants[]` hasil JOLT, bukan `_source.variants`? Bukan soal override.**
> `_source` di-stage **setelah** merge Step-2 (`ChannelPublishService:1342`, komentar *"master + merged
> Step-2"*), urutan `master < masterOverrides < channelData < variantOverrides[sku]` (baris 476) — override
> per-SKU di-apply **ke dalam** `masterProductData.variants[]` (baris 647–678). Jadi `_source.variants[].size`
> **juga** sudah membawa override merchant; membaca dari `_source` **tidak** akan mem-bypass override. Alasan
> sebenarnya adalah **koherensi indeks**: `BUILD_MODEL` menandai tiap varian dengan `tier_index` berdasar
> **posisi** di array `variants[]`/`model[]` yang **benar-benar dikirim** ke channel. Ia harus meng-anotasi
> array yang **persis sama** yang ia indeks — membaca array lain (`_source.variants`, yang bentuk/urutan/
> jumlahnya bisa beda dari hasil JOLT) berisiko `tier_index` meleset. Jadi nilainya **wajib** dari `variants[]`
> hasil JOLT — itulah kenapa builder ini satu-satunya yang rentan Bencana 2, sementara builder `_source`-fed kebal.

> **Kaitan gate:** di jalur publish nyata, `PostProcessingContractService.remediate` menyapu mapping bogus ini
> **sebelum** transform (auto-heal); sisa yang tak bisa disembuhkan → `findReservedWrites` → **refuse to
> publish**. Di agent, strip yang sama diterapkan saat `validate_jolt_spec` (§3) agar agent konvergen.

---

## 2. Gejala: agent stuck, log berhenti di `validate_jolt_spec`

Log nyata (Shopee/clothing) berhenti seperti ini:

```
round 1/15 — get_channel_schema, search_similar_jolt_specs
round 2/15 — get_existing_jolt_spec, find_field_mappings ×3
round 3/15 — find_field_mappings ×6            (+33s)
round 4/15 — validate_jolt_spec                (+61s, total ~97s)
JoltTransformationService: Transformation successful. Output has 11 fields
… (berhenti, tak ada recommendation)
```

Dua fakta penting:

1. **"Transformation successful" ≠ "validasi lolos".** `validate_jolt_spec` menerapkan JOLT ke sampel
   (itu yang "successful"), lalu **memeriksa lebih lanjut**. `passed = missingRequiredFields kosong && tanpa
   konflik target`.
2. **Anggaran habis.** Round 4 sudah di ~97 detik dari budget `agent-timeout-seconds: 160`. Ronde makin
   lambat (context membengkak: `find_field_mappings` dipanggil 9×). Ronde ke-5 menabrak batas → Mono
   dibatalkan → **nol recommendation**.

### Kenapa `validate` tak pernah lolos — collision gambar

JOLT spec yang di-generate memetakan gambar seperti ini:

```
mainImage     = images[0].url
galleryImages = { *: images[&1].url }
```

`images[0]` (index tetap dari mainImage) **bertabrakan** dengan `images[&1]` (loop dari galleryImages) —
keduanya menulis ke `images[0]`. `JoltTargetCollisionValidator` menandainya **ERROR** → `passed=false` →
agent loop mencoba memperbaiki, tapi **tak akan pernah bisa**: menggabung main + gallery dalam satu array
JOLT tanpa collision itu **memang tak bisa** diekspresikan.

> **Ironi arsitektur.** Justru **karena** JOLT tak bisa menggabung main+gallery tanpa collision, tim
> sudah memutuskan **gambar dibangun post-processing** (JOLT-independent, dari `_sourceImages` —
> lihat [[canonical-images-jolt-independent]]). Tapi **agent tidak diberi tahu itu**: `get_channel_schema`
> menyodorkan `apiSchema` utuh (17 field, termasuk `image`, `tier_variation`, `model`, `brand`,
> `seller_stock`, `logistic_info`, `attribute_list`), dan agent memperlakukan semua sebagai target JOLT.

**Diagnosis:** desain sudah benar memisahkan JOLT vs post-processing, tapi **lupa memberi tahu agent
soal pemisahan itu**. Agent bertempur di medan yang arsitektur sudah putuskan bukan medan JOLT.

---

## 3. Perbaikan #1 — enforce pemisahan JOLT ↔ post-processing saat validasi

**Ide:** sebelum `validate_jolt_spec` menilai spec, **buang** mapping JOLT yang memasuki field yang
**dimiliki** post-processing. Dengan begitu collision gambar hilang, spec lolos, dan agent konvergen.

### 3.1 Menentukan "post-processing-owned targets"

Field mana yang **dimiliki** post-processing? Aturannya **data-driven** (bukan daftar hardcode):

> **owned = (top-level TARGET dari rule) − (top-level SOURCE dari rule)**, hanya untuk **flat body**,
> dan buang staging keys (`_`-prefixed).

Kenapa **target minus source**? Sebuah field yang post-processing **tulis** tapi **tak baca-balik dari
JOLT** = output murni → JOLT tak boleh memetakannya. Sebaliknya, field yang juga **source** = *intermediate*
yang **JOLT wajib produksi** (post-processing membacanya) → **dipertahankan**.

Implementasi: `AgentToolHandlerService.postProcessingOwnedTargets(config)`.

**Hasil untuk Shopee** (dari `createShopeePostProcessingRules()`):

| Rule | source → target (top-level) | Status |
|---|---|---|
| shopee-build-image-url-list | `_sourceImages` → **images** | owned (strip) |
| shopee-build-logistics | `_resolvedLogistics` → **logistic_info** | owned (strip) |
| shopee-set-dimension | `_packageDimension` → **dimension** | owned (strip) |
| shopee-set-category-id | `_source…` → **category_id** | owned (strip) |
| shopee-build-seller-stock | `normal_stock` → **seller_stock** | owned (strip) |
| shopee-build-tier-variation | `variants` → **tier_variation** | owned (strip) |
| shopee-default-brand | **brand** → **brand** | **keep** (target == source) |
| shopee-build-model | **variants** → **variants** | **keep** (target == source) |
| shopee-build-attribute-* | `attribute_list`/`_…` → **attribute_list** | **keep** (juga source) |

→ **owned = { images, logistic_info, dimension, category_id, seller_stock, tier_variation }**
→ **keep = { variants, brand, attribute_list }** (intermediate/juga-source).

**Kenapa strip aman?** Setiap owned target dibangun post-processing dari sumber yang **terbukti tersedia**:
`images`←`_sourceImages`, `dimension`←`_packageDimension`, `logistic_info`←`_resolvedLogistics`
(semua di-*stage* oleh `ChannelPublishService`), `seller_stock`←`normal_stock` & `tier_variation`←`variants`
(output JOLT yang tetap ada). Membuang mapping JOLT yang redundan **tidak** merusak field-nya.

### 3.2 Membuang mapping (`stripOwnedTargetMappings`)

Untuk tiap entri `sourceKey → value` dalam operasi **shift**, kumpulkan **top-level target** yang ditulisnya
(rekursif untuk nested/wildcard), lalu **buang** entri kalau **semua** target top-level-nya ∈ `owned`.

```
mainImage     → "images[0].url"          top-level {images}          ⊆ owned → BUANG
galleryImages → {*: "images[&1].url"}    top-level {images}          ⊆ owned → BUANG
length        → "dimension.package_length" top-level {dimension}     ⊆ owned → BUANG
variants      → {*: {sku:"variants[&1].sku"…}} top-level {variants}  ⊄ owned → SIMPAN
name          → "item_name"              top-level {item_name}       ⊄ owned → SIMPAN
```

Operasi non-shift (mis. `default` untuk `currency`, `item_dangerous`) tak disentuh.

### 3.3 Validasi & simpan spec yang **sudah** di-strip

`validate_jolt_spec` kini:
1. Fetch config → `owned = postProcessingOwnedTargets(config)`.
2. `effectiveSpec = stripOwnedTargetMappings(joltSpec, owned)`.
3. Validasi **`effectiveSpec`** (transform, missing, conflict, collision).
4. Kembalikan `effectiveJoltSpec` + `removedOwnedTargetMappings` (agar agent belajar).

Agar **spec yang tersimpan juga bersih**, `JoltGenerationAgentService` menangkap `effectiveJoltSpec` dari
hasil tool saat *stop-on-pass* (`effectiveSpecFromResult`), bukan spec mentah dari model. Jadi mapping
gambar bogus **tak pernah** sampai ke `channel_jolt_specs` maupun publish.

### 3.4 Efek untuk Shopee

```
Sebelum: mainImage/galleryImages/length dipetakan → collision images[0]  → validate GAGAL → loop → timeout
Sesudah: ketiga mapping di-strip → tak ada collision → (Shopee tak punya required check) → validate LOLOS
         → stop-on-pass → recommendation dibuat
```

---

## 4. Perbaikan #2 — gate completeness yang sadar-cakupan

`validate_jolt_spec` menentukan lolos lewat `checkRequiredFieldsForChannel(output, channelId, categoryId)`,
yang mengecek apakah field wajib channel ada di **output JOLT**.

**Masalah yang muncul setelah #1:** untuk channel yang **required field-nya post-processing-owned**
(mis. sebuah channel yang membangun `brand` di post-processing), #1 men-*strip* mapping JOLT-nya → field
itu hilang dari output JOLT → dianggap **"missing" palsu** → validate gagal keliru. Ini juga persis
kegusaran arsitektur: *kenapa AI dipaksa membandingkan dengan post-processing?*

**Solusi #2:** `checkRequiredFieldsForChannel(output, channelId, categoryId, ppOwned)` kini **mengecualikan**
field yang post-processing-owned:

```java
if (ppOwned != null && !ppOwned.isEmpty()) {
    missing.removeIf(m -> ppOwned.contains(topLevel(m)));   // dibangun post-processing → bukan "missing"
}
```

Efeknya:
- **Required field yang dibangun post-processing** → **tidak** dihitung missing → tak ada false-fail.
  Ini menyelaraskan gate completeness dengan pembagian JOLT ↔ post-processing.
- **Sisa `missing`** = required field yang **bukan** hasil JOLT **dan bukan** post-processing-owned =
  **gap sejati**.

### 4.1 Surfacing gap sejati

Ketika `missing` (setelah exclusion) tidak kosong, hasil validate menambahkan:

```json
"postProcessingGaps": ["<field>", …],
"postProcessingGapHint": "Field ini tak punya JOLT source & tak ada post-processing rule.
                          Map dari master kalau bisa; kalau tidak, developer harus menambah
                          post-processing rule — jangan loop mencoba memetakan yang JOLT tak bisa produksi."
```

Ini mengubah "missing" yang buta menjadi **sinyal actionable**: agent tahu kapan berhenti mencoba
memetakan sesuatu yang memang tugas post-processing, dan **me-*route* ke developer review**.

### 4.2 "Blokir sampai developer bereskan" jadi inheren

`passed = missing.isEmpty() && …`. Dengan `missing` yang sadar-cakupan, `passed=false` hanya terjadi saat
ada **gap sejati**. Karena tak lolos → spec **tak auto-apply** → **rute ke `AiRecommendation`** untuk
developer. Sementara channel yang field-nya sudah ter-cover (Shopee) **lolos & konvergen**.

---

## 5. #1 + #2 sebagai satu kesatuan

| Lapisan | #1 | #2 |
|---|---|---|
| Structural | Strip mapping JOLT ke post-processing-owned target (hilangkan collision) | — |
| Completeness | — | Kecualikan post-processing-owned dari "missing" (tak false-fail) |
| Sinyal developer | `removedOwnedTargetMappings` (edukasi agent) | `postProcessingGaps` + hint → rute ke review |

**Alur baru Shopee/clothing:** `images/dimension/…` di-strip (#1) → tak ada collision; tak ada required
tersisa (#2) → **validate lolos → konvergen → recommendation dibuat**, alih-alih loop sampai timeout.

---

## 6. Keamanan & batasan

- **Intermediate dipertahankan.** `variants`, `brand`, `attribute_list` (target **dan** source)
  tidak di-strip → JOLT tetap memproduksinya untuk dikonsumsi post-processing. (Diuji unit.)
- **Wrapper body aman.** Untuk body ber-wrapper (mis. Shopify `product`), `postProcessingOwnedTargets`
  mengembalikan **kosong** (top-level tunggalnya terlalu luas untuk di-strip). Shopify tak terpengaruh.
- **Staging terverifikasi.** `_sourceImages`, `_packageDimension`, `_resolvedLogistics` di-*stage* oleh
  `ChannelPublishService` — jadi post-processing punya inputnya; strip aman.
- **Belum E2E.** Logika di-*unit-test* dengan bentuk rule Shopee asli; pembuktian akhir adalah satu
  **run live Shopee/clothing** (harusnya kini konvergen).

---

## 7. Berkas & verifikasi

| Berkas | Peran |
|---|---|
| `AgentToolHandlerService.java` | `validateJoltSpec` (fetch config → strip → validasi effective spec → lapor), `postProcessingOwnedTargets`, `topLevel`, `stripOwnedTargetMappings`; `checkRequiredFieldsForChannel` sadar-cakupan + `postProcessingGaps` |
| `JoltGenerationAgentService.java` | Tangkap `effectiveJoltSpec` saat stop-on-pass (`effectiveSpecFromResult`) → spec tersimpan bersih |
| `AgentToolHandlerServiceTest.java` | 4 test: `ownedTargets_*`, `strip_*`, `topLevel_*` |

**Verifikasi:** compile **BUILD SUCCESS**; `AgentToolHandlerServiceTest` 15/15 (incl. 4 test strip),
`JoltGenerationAutoApplyTest` + `JoltGenerationCriticalFieldsTest` 8/8 → **23/23**, tanpa regresi.

**Lanjut:** output gap ke developer (katalog op + `AiRecommendation`) →
[16-jolt-agent-gap-recommendations.md](16-jolt-agent-gap-recommendations.md).
</content>
