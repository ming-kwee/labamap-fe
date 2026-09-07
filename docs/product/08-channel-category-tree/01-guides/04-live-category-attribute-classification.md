# Klasifikasi Live Category Attribute: Product-level vs Variant-level di Step 2

**Pertanyaan yang dijawab guide ini:**
Ketika sebuah *live category attribute* (atribut yang diambil langsung dari API kategori sebuah channel —
Shopee `get_attribute_tree`, Shopify taxonomy, TikTok `GetAttributes`, Wix) muncul di **Step 2**, bagaimana
sistem menentukan ia ditampilkan sebagai **field product-level** (deskripsi produk secara keseluruhan) atau
sebagai **axis variant** (dimensi pembentuk SKU)? Dan **apakah aturannya sama untuk semua channel**?

**Jawaban singkat:** aturannya **satu dan sama untuk semua channel** — dihitung oleh satu jalur kode
generik. Yang berbeda antar-channel hanyalah **data konfigurasi**, bukan logikanya.

**Companion guides (jangan diduplikasi, saling melengkapi):**
- `docs/product/01-catalog-schema/01-guides/08a-variant-axis-resolution.md` — rumus `eligible ∩ Step-1` dari
  sudut *variant axis* (formula inti + `axisValidation`).
- `docs/product/01-catalog-schema/01-guides/08-variant-options.md` — definisi variant dimension di sisi Step-1.
- `docs/FRONTEND-VARIANT-AXIS-NARROWING.md` — kontrak FE.

**Kelas backend yang terlibat:** `GenericCategoryService` · `CategoryCacheServiceImpl` · `VariantAxisResolver` ·
`ChannelStepSchemaService.buildStoreResult` · `ChannelCategoryApiConfig.AttributeConfig`.

---

## 0. Kesalahpahaman yang harus dibuang dulu

Naluri pertama biasanya: *"peran sebuah field (product vs variant) itu sifat bawaan field tersebut —
Color pasti variant, Material pasti product."* **Ini salah**, dan seluruh desain berdiri di atas penolakan
naluri itu.

Field yang sama bisa berperan berbeda tergantung **produknya**:

| Field | Bisa jadi AXIS varian | Bisa jadi ATRIBUT product-level |
|---|---|---|
| Color | kaos dijual Black/Red → 2 SKU | kaos hanya Black → 1 nilai metadata |
| Pattern | Solid/Striped → SKU berbeda | produk cuma "Solid" → 1 nilai |
| Size | S/M/L → SKU berbeda | one-size → 1 nilai |

Maka peran sebuah field adalah **fungsi dari dua faktor**:

```
peran = (kapabilitas channel)  ×  (struktur SKU produk INI)
```

Channel config hanya memiliki faktor pertama; hanya produk yang tahu faktor kedua. Konsekuensinya, tidak
ada satu pihak pun yang boleh memutuskan sendirian.

---

## 1. Rumus inti

```
axis varian sesungguhnya  =  eligible (whitelist channel)  ∩  dimensi Step-1 (produk ini)
segala sesuatu di luar irisan  ⟹  product-level
```

Dua input, dua sumber data:

### Input A — Kapabilitas channel (per-channel, DATA)
`ChannelCategoryApiConfig.AttributeConfig.variantOptionAttributeNames`
(`channel/category/config/ChannelCategoryApiConfig.java`, ±baris 508–516).

Sebuah `Set<String>`: *"nama atribut kategori mana yang BOLEH menjadi opsi varian di channel ini."*
Ini **whitelist kelayakan** — artinya "MUNGKIN sebuah axis", **bukan** "PASTI sebuah axis". Contoh:
- Shopify: `{Color, Size, Pattern, Style, Fit, Width, Length, Scent}`
- Shopee: `{[S]Colour, [S]Color, [S]Size, [S]Pattern, [S]Style, [S]Material, [S]Warna, [S]Ukuran, [S]Motif}`
  (`get_attribute_tree` memberi prefiks `[S]` pada nama tampilan).

Diseed di `channel/category/loader/CategoryApiConfigDataLoader.java` (Shopee ±baris 251, Shopify ±baris 486).

### Input B — Struktur SKU produk (per-produk, DATA)
Dibaca `VariantAxisResolver.axisTokens()` (`ecommerce/channelproduct/service/VariantAxisResolver.java`, ±baris 74):

```
tokens Step-1 = ProductType.variantDimensions (dimensi yang DIDEKLARASIKAN)
              ∪ key di variant-map yang TER-REALISASI sebagai axis
```

- **Dideklarasikan**: `product_types.variantDimensions` (sumber otoritatif SKU-axis; lihat CLAUDE.md).
- **Ter-realisasi**: key yang benar-benar muncul di `masterProductData.variants[*]` **DAN** diklasifikasikan
  sebagai variant oleh master attribute schema (`isVariantAxisField` → data-driven lewat
  `ecommerce_master_attributes.group = VARIANT`). Bukan denylist metadata hardcoded.

Matching bersifat **case-insensitive**, karena nama taxonomy channel ("Color") dan kode field Step-1
("color") sering hanya beda kapitalisasi.

---

## 2. Pipeline lengkap — perlahan, langkah demi langkah

Semua channel melewati **jalur yang sama**. Tidak ada `if (channel == "shopee")` di runtime.

### Langkah 1 — Fetch (ambil atribut mentah dari channel)
`GenericCategoryService.fetchAttributesFromApi(channelType, storeId, categoryId, orgId)` memanggil API
kategori channel dan mem-parse respons menjadi `List<CachedAttributeField>`. Cara parse (path JSON, nama
field, cara baca `required`) semuanya **data** dari `ChannelCategoryApiConfig.attributeConfig` — bukan kode
per-channel. Tiap `CachedAttributeField` membawa (a.l.) `label` (nama tampilan), `fieldName` (kunci submit —
bisa `attribute_id` numerik untuk Shopee), `isRequired`.

### Langkah 2 — Split jadi tiga bucket
`CategoryCacheServiceImpl.fetchAndCacheAttributes` (±baris 256–261):

```java
required          = fields.filter(isRequired)                              // → product-level (wajib)
variantSuggestions= fields.filter(!isRequired && isVariantOption(f, names))// → pool "layak jadi varian"
optional          = fields.filter(!isRequired && !isVariantOption(f,names))// → product-level (opsional)
```

di mana (±baris 361):

```java
isVariantOption(f, variantNames) = variantNames.contains(f.getLabel());
```

> **Perhatikan dua hal penting:**
> 1. Match memakai **`label`** (nama tampilan), bukan `fieldName` — karena `variantOptionAttributeNames`
>    berisi nama tampilan ("[S]Colour"), sedangkan `fieldName` bisa berupa id numerik.
> 2. Atribut **`required` tidak pernah** masuk pool varian (pool hanya diisi dari `!isRequired()`). Jadi
>    **atribut kategori yang wajib SELALU product-level.**

Hasil Langkah 2 masih **produk-agnostik** (di-cache per `channelType|storeId|categoryId`): ia baru tahu
"field ini MUNGKIN axis di channel ini", belum tahu apakah produk tertentu benar-benar bervariasi padanya.

### Langkah 3 — Resolve terhadap produk (irisan dengan Step-1)
`VariantAxisResolver.resolveAxes(base, productType, variants, channelType)`, dipanggil dari
`ChannelStepSchemaService.buildStoreResult` (±baris 525). Di sinilah faktor kedua (struktur SKU produk)
masuk. Dua sub-langkah:

**3a. `narrow()`** — pindahkan yang eligible-tapi-bukan-axis keluar dari pool varian:
```
untuk tiap field di variantSuggestions:
    jika field ∈ axisTokens(produk)  → tetap axis
    selain itu                       → DEMOTE ke optionalFields (atribut product-level bernilai tunggal)
```

**3b. Bangun `variantAxes` otoritatif** — untuk tiap dimensi Step-1, cek `isPermitted` (ada di pool channel),
realisasikan nilai per-SKU dari `variants[*]`, dan catat `axisValidation` (NOT_EXPRESSIBLE_ON_CHANNEL /
INCOMPLETE_MATRIX / TOO_MANY_AXES). Plafon `MAX_AXES = 3` (option1/2/3).

### Langkah 4 — Render di Step 2
`buildStoreResult` menaruh hasilnya ke `categoryAttributeSection` (`CategoryAttributesResponse`, ±baris 665):
- `requiredFields` + `optionalFields` → **tab atribut product-level**.
- `variantAxes` (`ResolvedVariantAxis`) → **variant builder** (axis + nilai per-SKU).
- `variantOptionSuggestions` → **DEPRECATED**; kini hanya hint vocab nilai, bukan sumber axis.

---

## 3. Contoh konkret (satu produk, dua field)

Produk: kaos, Step-1 `variantDimensions = [color]`, dijual Black & Red (2 SKU), motif hanya "Solid".
Channel: Shopify (whitelist berisi `Color` dan `Pattern`).

| Field kategori (live) | eligible? | ∈ Step-1 dims? | Hasil |
|---|---|---|---|
| Color | ya (di whitelist) | ya (`color` dideklarasikan + terealisasi 2 nilai) | **variant axis** (option1: Black, Red) |
| Pattern | ya (di whitelist) | **tidak** (produk tak bervariasi motif) | **product-level** (di-demote ke optionalFields, 1 nilai "Solid") |
| Material | tidak (bukan di whitelist) | — | **product-level** (optionalFields) |
| Brand (required) | — (required, tak masuk pool) | — | **product-level** (requiredFields) |

Ini menutup bug kelas *"Pattern dengan 51 nilai taxonomy muncul sebagai axis varian"* secara struktural:
field yang tidak bervariasi **tak mungkin** lolos irisan, jadi tak akan pernah ditawarkan sebagai axis.

---

## 4. Apakah prinsipnya sama untuk semua channel? **Ya.**

Jalur kode (Langkah 1–4) identik untuk semua channel. Yang berbeda **hanya data**:

| Channel | `variantOptionAttributeNames` (data) | Dari mana axis varian berasal |
|---|---|---|
| **Shopee** | `[S]Color/[S]Size/[S]Pattern/…` | irisan whitelist ∩ Step-1 (dibatasi taxonomy) |
| **Shopify** | `Color/Size/Pattern/Style/Fit/…` | irisan whitelist ∩ Step-1 (dibatasi taxonomy) |
| **TikTok Shop** | *kosong* | langsung dari Step-1 (`sales_attributes` bebas name/value) |
| **Wix** | *kosong* | langsung dari Step-1 |

**Kasus whitelist kosong (TikTok/Wix) — kenapa varian tetap muncul.**
Kalau `variantOptionAttributeNames` kosong, maka pool `permitted` kosong dan `resolveAxes` mengembalikan hasil
**tanpa** membangun `variantAxes` dari jalur category-attribute (`VariantAxisResolver.resolveAxes` ±baris 216:
"nothing to resolve/validate"). Ini **bukan** berarti produk tak punya varian. Untuk channel seperti ini,
axis varian datang **langsung dari `variantDimensions` master (Step 1)** dan ditampilkan di variant builder
apa adanya — karena channel-nya **tidak memaksa** varian dipilih dari taksonomi kategori (`sales_attributes`
TikTok berbentuk name/value bebas). Konsekuensinya: **semua live category attribute TikTok/Wix bersifat
product-level** (mis. Material di `product_attributes` TikTok). Whitelist itu murni mekanisme *narrowing*
untuk channel yang varian-nya harus tunduk pada taksonomi (Shopee/Shopify).

---

## 5. Invariant pemersatu (hafalkan ini)

> **Sebuah field bersifat product-level secara default. Ia naik menjadi variant-level HANYA di titik di mana
> channel MAMPU mengekspresikannya sebagai opsi DAN produk ini benar-benar ber-SKU pada dimensi itu.**
>
> - "Channel mampu mengekspresikan" → per-channel, dari `channel_category_api_config` (`variantOptionAttributeNames`).
> - "Produk bervariasi padanya" → per-produk, dari `product_types.variantDimensions` ∪ SKU yang terealisasi.
>
> Tidak ada satu pun sinyal yang memutuskan sendirian; keduanya harus setuju.

---

## 6. Kaitan dengan reverse-sync (import)

Saat **import** menarik produk dari channel (reverse-sync), category attribute yang dibaca dari item channel
diletakkan ke **Step-2 `channelData`** (di-key dengan native attribute id), **bukan** ke master draft — karena
mereka channel-specific. Ini konsisten dengan klasifikasi di atas: category attribute adalah field Step-2
per-store. Lihat `docs/reversesync/09-tiktokshop-reverse-sync-plan.md` (op `ATTRIBUTE_LIST`) dan
[[tiktok-reverse-sync-progress]]. Axis varian saat import tidak ikut jalur ini — ia direkonstruksi dari
`skus[]` (op `VARIANT_INVERSE`) menjadi `variantGroups`/`optionGroups` master, lalu di Step-2 dicocokkan
ulang lewat rumus `eligible ∩ Step-1` yang sama.

---

## 7. Smell test (untuk reviewer)

- Menambah/mengubah "apakah field X boleh jadi varian di channel Y" **tidak boleh** menyentuh kode Java —
  cukup ubah `variantOptionAttributeNames` di `channel_category_api_config` (data).
- Kalau Anda menemukan cabang runtime yang meng-hardcode nama field ("color"/"size") untuk memutuskan
  peran, itu pelanggaran (lihat CLAUDE.md "No hardcoded domain knowledge"); pindahkan ke
  `ecommerce_master_attributes.group` / `variantDimensions` / `variantOptionAttributeNames`.
- Kalau sebuah atribut *required* muncul sebagai axis varian, itu bug: pool varian hanya diisi dari `!required`.
- Kalau field eligible dengan puluhan nilai muncul sebagai axis padahal produk tidak bervariasi padanya,
  berarti `narrow()`/irisan Step-1 tidak jalan — periksa `axisTokens` (apakah `variantDimensions` produk terbaca).
