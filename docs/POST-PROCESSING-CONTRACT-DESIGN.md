# JOLT Spec ⇄ Post-Processing: Kontrak Deterministik (3 Lapis)

**Tujuan dokumen:** menjelaskan **perlahan, dengan contoh**, kenapa spec JOLT hasil AI berulang kali
"melawan" pipeline post-processing, kenapa **RAG bukan solusi terbaik**, dan bagaimana **kontrak
deterministik 3 lapis** menutup seluruh kelas masalah ini.

**Status:** desain (belum diimplementasikan). Ditulis setelah 3 kejadian nyata: Wix options, Wix
variant-media, Shopee tier_variation.

---

## 1. Ringkasan satu kalimat

Post-processing sudah **mendeklarasikan** field mana yang ia bangun sendiri (mis. `tier_variation`),
tapi tak ada yang **melarang** spec AI menulis ke sana — jadi AI membangunnya langsung (salah) dan
"mencuri" bahan mentah yang seharusnya dipakai post-processing.

---

## 2. Masalah: pola yang berulang

### 2.1 Cara kerja pipeline (dua tahap)

```
masterProductData ──[ JOLT spec ]──► bentuk INTERMEDIATE ──[ post-processing ]──► payload channel FINAL
                     (AI/APM buat)                          (deterministik, kode kita)
```

Dua tahap ini punya **pembagian tugas yang tersirat**:

- **JOLT spec** seharusnya hanya **meneruskan field mentah** (flat) — mis. tiap varian tetap punya
  `color`, `size`, `price`, `sku`.
- **Post-processing** yang **membangun struktur final channel** yang rumit — mis. Shopee
  `tier_variation` = `[{name:"Size", option_list:[{option:"S"}, {option:"Xs"}]}, …]`.

Masalahnya: pembagian ini **tidak pernah ditulis di mana pun yang mengikat**. AI tidak tahu ada tahap
kedua, jadi ia langsung memetakan ke struktur final.

### 2.2 Contoh nyata — Shopee tier_variation

**Yang seharusnya** (desain benar):

Spec meneruskan flat:
```json
"variants": { "*": {
    "color": "variants[&1].color",
    "size":  "variants[&1].size",
    "price": "variants[&1].price",
    "sku":   "variants[&1].sku"
}}
```
Lalu rule post-processing `BUILD_TIER_VARIATION` (sudah ada di kode) membaca `variants` dan membangun:
```json
"tier_variation": [
  { "name": "Size",  "option_list": [ {"option":"S"}, {"option":"Xs"} ] },
  { "name": "Color", "option_list": [ {"option":"Black"} ] }
]
```

**Yang benar-benar terjadi** (spec AI regenerasi):

Spec **membangun tier_variation langsung** di JOLT:
```json
"variants": { "*": {
    "color": "tier_variation.1.option_list[&1]",
    "size":  "tier_variation.0.option_list[&1]",
    "inventory": "model[&1].normal_stock"
}}
```
Hasil transform → **cacat**:
```json
"tier_variation": { "0": {"option_list":["S","Xs"]},
                    "1": {"option_list":["Black","Black"]} }
```
- `.0.` / `.1.` jadi **key map** `"0"`/`"1"`, bukan array (JOLT tak paham itu indeks).
- Nama tier (`"Size"`/`"Color"`) **hilang**.
- Option jadi **string telanjang** `"S"`, bukan `{"option":"S"}`.
- **Efek samping fatal:** karena `color`/`size` "dikonsumsi" ke `tier_variation`, array `variants`
  **habis** → `BUILD_TIER_VARIATION` (yang membaca `variants`) **tak punya bahan** → skip.

→ Shopee menolak payload. Ini **kelas yang sama** dengan Wix (options via `EXTRACT_DIMENSIONS`,
media via `CROSS_LINK`): AI memetakan ke struktur **final bersarang**, post-processing mengharap
**intermediate flat**.

---

## 3. Kenapa RAG **bukan** jawaban terbaik

Ide "masukkan kode post-processing ke RAG agar AI paham" terdengar masuk akal, tapi lemah:

- **RAG itu retrieval probabilistik.** AI mungkin tak mengambil rule yang tepat, atau mengambil tapi
  tak mematuhinya. Ia menaikkan *peluang benar*, **tak pernah menjamin**.
- **Menalar interaksi op adalah titik terlemah LLM.** "Kalau ada `BUILD_TIER_VARIATION`, maka jangan
  petakan ke `tier_variation`, dan pastikan `variants` tetap utuh" — ini rantai penalaran yang gampang
  meleset.
- **Bertentangan dengan filosofi codebase ini:** semua guard yang kita bangun (semantic validator,
  critical-fields injection, priority) **deterministik & data-driven**, bukan mengandalkan AI fuzzy.

Insting Anda benar bahwa **AI harus tahu kontraknya** — tapi caranya lewat **konteks deterministik +
guard**, bukan retrieval.

---

## 4. Ide inti: **batas kepemilikan** (ownership boundary)

Bayangkan garis pemisah:

```
        MILIK SPEC (AI boleh menulis)          |        MILIK POST-PROCESSING (AI dilarang)
   name→item_name, price→original_price,       |   tier_variation, model, productOptions,
   description, sku, variants[*].{color,size…} |   _mediaChoiceMapping, image_id_list (build)
```

Kabar baiknya: **garis ini sudah terdeklarasi di data.** Setiap rule post-processing menyatakan:
- `sourcePath` = intermediate yang **ia baca** (mis. `variants`),
- `targetPath` = struktur final yang **ia miliki/bangun** (mis. `tier_variation`).

Jadi kita tak perlu RAG — kita tinggal **membaca** deklarasi yang sudah ada.

---

## 5. Tiga lapis (menguat dari "membantu" ke "menjamin")

### Lapis 1 — Turunkan kontrak dari data

Tambah **satu flag** di `OperationCatalogService`: apakah sebuah op **membangun/memiliki** target-nya.

| Kategori                                | Op                                                                                                                                                                                                                 | ownsTarget   |
|-----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| **Konstruktor** (bangun struktur final) | `BUILD_TIER_VARIATION`, `BUILD_MODEL`, `BUILD_STOCK_INFOS`, `BUILD_SALES_ATTRIBUTES`, `BUILD_OPTIONS_FROM_FLAT_KEYS`, `EXTRACT_DIMENSIONS`, `MAP_TO_INDEXED`, `CROSS_LINK`, `CONCAT_INTO`, `WRAP_ARRAY_TO_OBJECTS` | **true**     |
| **Enricher** (ubah di tempat)           | `FOR_EACH`, `SET_DEFAULT`, `NEST_FIELD`, `UNWRAP_FIELD`, `STRING_TO_OBJECT`, `CONDITIONAL_SET`, `SET_FIELD`, `AUTO_INCREMENT`                                                                                      | false        |

> **Kenapa perlu flag, bukan cukup source≠target?** Karena ada op enricher yang source==target dan
> spec **memang menulis** ke sana. Contoh Wix: `enrich-media-for-wix` (source=`product.media`,
> target=`product.media`) — spec **harus** memetakan `mainImage → product.media[0].url`. Jadi
> `product.media` **bukan** reserved. Flag `ownsTarget` membedakan "bangun" vs "perkaya".

Lalu, per channel, hitung dua himpunan dari config:

- **RESERVED** = `{ targetPath | op.ownsTarget == true }`
  Contoh Shopee: `{ tier_variation, model, attribute_list(?) }`
  Contoh Wix: `{ product.productOptions, product._mediaChoiceMapping }`

- **REQUIRED-FORWARD** = `{ sourcePath (+ field axis) | op.ownsTarget == true }`
  Contoh Shopee: `variants[*]` harus membawa `color, size, price, sku, inventory`.

Semua ini **deterministik**, dari config yang sudah ada. Nol RAG.

### Lapis 2 — Tegakkan saat generasi (INI JAMINANNYA)

Persis pola `JoltSemanticValidator` / `ensureCriticalFields` yang sudah terbukti:

**(a) Guard "jangan menulis ke reserved".** Setelah AI menghasilkan spec, pindai target tiap mapping.
Jika ada yang jatuh di bawah prefix RESERVED → **tolak / strip**.

Contoh Shopee — mapping ini **di-strip** karena `tier_variation` reserved:
```json
"size":  "tier_variation.0.option_list[&1]",   ✗ dibuang
"color": "tier_variation.1.option_list[&1]",   ✗ dibuang
"inventory": "model[&1].normal_stock",          ✗ dibuang (model reserved)
```

**(b) Inject "wajib teruskan intermediate".** Perluas `ensureCriticalFields` untuk menyuntik
forwarding flat yang hilang:
```json
"variants": { "*": {
    "color": "variants[&1].color",     ← disuntik
    "size":  "variants[&1].size",      ← disuntik
    "price": "variants[&1].price",
    "sku":   "variants[&1].sku",
    "inventory": "variants[&1].inventory"
}}
```

**Hasil:** apa pun yang AI generate, spec final **dijamin**: tak menyerbu `tier_variation`/`model`,
dan `variants` tetap utuh → `BUILD_TIER_VARIATION`/`BUILD_MODEL` dapat bahan → membangun struktur
Shopee yang benar. **Correct-by-construction** — bukan "semoga AI benar".

### Lapis 3 — Batasi AI di depan (konteks deterministik, bukan RAG)

Sisipkan kontrak ke **prompt generasi** sebagai teks tetap (selalu ada, diturunkan dari config):

```
[KONTRAK CHANNEL shopee]
JANGAN petakan ke target ini (dibangun post-processing): tier_variation, model.
WAJIB teruskan field varian flat di variants[*]: color, size, price, sku, inventory.
Petakan hanya field produk sederhana: name→item_name, description→description, price→original_price, …
```

Ini **deterministik** (bukan retrieval). Ia **mengurangi seberapa sering guard Lapis 2 harus
men-strip**, sekaligus membuat output AI lebih rapi. Tapi ingat: **Lapis 2 tetap jaminannya**, Lapis 3
hanya "membantu peluang".

**Realisasi di kode — tool `get_channel_schema`** (`AgentToolHandlerService`). Lapis 3 bukan lagi
sekadar teks prompt; ia diturunkan dari data dan diserahkan ke agent sebagai field deterministik:

| Field | Isi | Peran Lapis 3 |
|---|---|---|
| `apiSchema` | target JSON (base `apiSchema` + `apiSchemaExtension` per-kategori) | **path target otoritatif** — jangan mengarang path |
| `postProcessingHandledFields` | target/source yang diisi post-processing | **RESERVED** — jangan map ke sini |
| `categoryAttributes` | atribut riil kategori + **value-names** (dari cache `GetAttributeTree`) | isi `attribute_list` dengan **nama value**, bukan `value_id` |
| `categoryRequired` / `categoryRecommended` | nama field wajib/anjuran per kategori | jangan hitung sebagai "missing" jika di-handle |

Dua penajaman terakhir (2026-07-23):

- **RESERVED untuk body flat.** `postProcessingHandledFields` dulu membuang semua path tanpa titik
  (untuk mengabaikan wrapper `product` Shopify), sehingga target top-level Shopee — `logistic_info`,
  `brand`, `seller_stock` — ikut hilang. Kini dikunci ke `isFlatBody(apiSchema)` (≥2 top-level key ⇒
  flat): body flat menandai target no-dot sebagai reserved; body wrapper (1 key) tetap membuang token
  telanjang. Jadi capability layer (§ resolusi kapabilitas) yang mengisi `logistic_info`/`brand`/
  `seller_stock` otomatis dikenali agent sebagai reserved — konsumennya adalah post-processing rules,
  jadi output-nya sampai lewat jalur yang sama.
- **`categoryAttributes` + kontrak value_id.** Agent kini tahu nama atribut kategori dan value-names
  yang diizinkan (dibaca *region-agnostic* dari `channel_capability_cache`, `scopeKey` = slug). Notanya
  eksplisit: *map `original_value_name`, JANGAN `value_id`; post-processing (`TRANSLATE_VALUE_IDS`)
  yang menerjemahkan.* Best-effort — kosong bila kategori belum pernah publish → agent jatuh balik ke
  `attribute_list` generik seperti sebelumnya.

> Kalau tetap ingin RAG: pakai untuk **few-shot contoh spec yang BAGUS** (mempercepat AI menuju pola
> benar), **bukan** sebagai mekanisme kebenaran.

---

## 6. Contoh end-to-end (Shopee, menyatukan 3 lapis)

**Input AI hasilkan (buruk):**
```json
{ "operation":"shift", "spec": {
   "name": "item_name",
   "variants": { "*": {
       "size":  "tier_variation.0.option_list[&1]",
       "color": "tier_variation.1.option_list[&1]",
       "inventory": "model[&1].normal_stock",
       "sku": "model[&1].model_sku"
   }}
}}
```

**Lapis 3 (prompt)** → idealnya AI tak menghasilkan ini sejak awal. Anggap tetap terjadi.

**Lapis 1** → dari config Shopee: RESERVED = `{tier_variation, model}`; REQUIRED-FORWARD =
`variants[*].{color,size,price,sku,inventory}`.

**Lapis 2 (guard + inject)** → transformasikan menjadi:
```json
{ "operation":"shift", "spec": {
   "name": "item_name",
   "variants": { "*": {
       "size":  "variants[&1].size",       // di-strip dari tier_variation, diganti forward flat
       "color": "variants[&1].color",
       "inventory": "variants[&1].inventory",
       "sku":   "variants[&1].sku",
       "price": "variants[&1].price"
   }}
}}
```

**Post-processing** (BUILD_TIER_VARIATION + BUILD_MODEL) → bangun struktur Shopee benar:
```json
"tier_variation": [ {"name":"Size","option_list":[{"option":"S"},{"option":"Xs"}]},
                    {"name":"Color","option_list":[{"option":"Black"}]} ],
"model": [ {"tier_index":[0,0],"normal_stock":1,"original_price":…,"model_sku":"SKU-S-BLACK"}, … ]
```

→ Shopee menerima. **Tanpa** bergantung pada AI mengerti tahap kedua.

---

## 7. Kenapa lebih baik dari RAG (ringkas)

| Aspek                         | RAG kode/config       | Kontrak deterministik (3 lapis)                        |
|-------------------------------|-----------------------|--------------------------------------------------------|
| Jaminan benar                 | tidak (probabilistik) | **ya — guard Lapis 2 menjamin**                        |
| Sumber kebenaran              | embed kode berisik    | **config `sourcePath`/`targetPath` yang sudah ada**    |
| AI menalar interaksi op       | ya (rapuh)            | **tidak** — AI hanya map field sederhana               |
| Konsisten dgn codebase        | tidak                 | **ya** (semantic validator, critical-fields, priority) |
| Menutup channel baru otomatis | tidak                 | **ya** (kontrak diturunkan dari config channel itu)    |

---

## 8. Analogi dengan yang sudah kita bangun

Ini bukan konsep asing — ia **pola yang sama** dengan pertahanan yang sudah ada:

- **`ensureCriticalFields`** menyuntik field wajib (mis. `#physical → product.productType`) → Lapis 2(b).
- **`JoltSemanticValidator`** menolak mapping yang salah-semantik → sepupu Lapis 2(a).
- **`resolutionPriority`** memilih spec yang benar secara deterministik.

Lapis 2 hanyalah memperluas ide yang sama ke **kepemilikan target post-processing**.

---

## 9. Trade-off & urutan implementasi

**Trade-off jujur:**
- Perlu menambah flag `ownsTarget` ke katalog (kecil), derive kontrak per channel, guard baru, dan
  perluasan `ensureCriticalFields`. Bukan sepele, tapi **bounded** dan **sekali jadi menutup seluruh
  kelas** (Wix options/media, Shopee tier_variation, + channel masa depan).
- Perlu peta "field axis apa yang harus di-forward" per channel — sebagian sudah ada di required
  mappings; sisanya diturunkan dari `sourcePath` op konstruktor.
- Lapis 3 butuh akses prompt generator (LLM agent + APM). Opsional di awal.

**Urutan disarankan:**
1. **Lapis 1** — flag `ownsTarget` + fungsi `deriveContract(channelId)` → `{reserved, requiredForward}`.
2. **Lapis 2a** — guard: strip/tolak mapping ke reserved (di jalur generasi + sebagai validator publish,
   mirip semantic validator). **Ini sudah menghentikan payload cacat.**
3. **Lapis 2b** — perluas `ensureCriticalFields` untuk inject forwarding flat.
4. **Lapis 3** — sisipkan kontrak ke prompt (peningkatan kualitas, bukan jaminan).

**Prinsip penutup:** AI mengerjakan yang ia kuasai (mencocokkan field sederhana yang ambigu);
**sistem deterministik memiliki batas struktural**. Dengan batas yang ditegakkan, AI **tak bisa**
melawan post-processing — apa pun yang ia hasilkan.
