# Phase 5–11 — Scenarios E–K: Step 2 Advanced Data Sources

## Status Keseluruhan

| Phase | Scenario | Status |
|---|---|---|
| 5 | E — Cross-field conditional dependencies | Not started |
| 6 | F — Multi-language content | Not started |
| 7 | G — Channel pricing & currency conversion | Not started |
| 8 | H — Channel-specific media compliance | Not started |
| 9 | I — Cross-store value inheritance | Not started |
| 10 | J — Channel-specific SEO & keyword structure | Not started |
| 11 | K — Computed/derived fields | Not started |

Phases 1–4 (Scenarios A–D) sudah diimplementasi. Lihat:
- [`09-step2-channel-data-sources.md`](./09-step2-channel-data-sources.md) — ringkasan semua 11 skenario
- [`14-phase3-hierarchical-category-tree.md`](./14-phase3-hierarchical-category-tree.md) — Phase 3 detail
- [`15-phase4-category-dependent-field-injection.md`](./15-phase4-category-dependent-field-injection.md) — Phase 4 detail

---

## Phase 5 — Scenario E: Cross-Field Conditional Dependencies

### Permasalahan

Visibility, required-ness, atau validation rule sebuah channel field bergantung pada nilai field **lain dalam form yang sama**. Ini berbeda dari `conditionalLogic` di Step 1 (master product form) yang sudah dihandle oleh `useFieldVisibility.ts`.

### Contoh Nyata

| Channel | Trigger field | Trigger value | Field yang terpengaruh | Efek |
|---|---|---|---|---|
| Amazon | `is_adult_product` | `true` | `adult_product_category` | menjadi required |
| Shopify | `requires_shipping` | `false` | `weight`, `shipping_class` | hidden |
| TikTok | `is_pre_order` | `true` | `pre_order_days` | required, range 1–14 |
| TikTok | `is_pre_order` | `false` | `pre_order_days` | hidden |
| Lazada | `package_weight_unit` | `"kg"` vs `"g"` | `package_weight` validation | min/max ×1000 |
| eBay | `listing_type` | `"AUCTION"` | `starting_price`, `reserve_price` | visible + required |
| eBay | `listing_type` | `"FIXED_PRICE"` | `starting_price`, `reserve_price` | hidden |

### Kontrak Frontend

**Schema extension: `conditionalRules` pada `ChannelFormField`**

```typescript
interface ChannelFieldConditionalRule {
  triggerField:   string;
  triggerValues:  unknown[];
  effect: "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" | "SET_VALIDATION";
  validationOverride?: {
    min?: number; max?: number;
    minLength?: number; maxLength?: number;
    pattern?: string;
  };
}
```

**Hook baru: `useChannelFieldVisibility`**

```typescript
function useChannelFieldVisibility(
  fields:        ChannelFormField[],
  currentValues: Record<string, unknown>
): {
  isVisible:     (fieldName: string) => boolean;
  isRequired:    (fieldName: string) => boolean;
  getValidation: (fieldName: string) => ChannelFormField["validationRules"];
}
```

`ChannelStoreTab` memanggil hook ini dan meneruskan hasilnya ke setiap `ChannelFieldInput`. `isLocallyComplete()` harus memanggil `isRequired()` (dinamis) daripada membaca `field.required` (statis).

### Arsitektur Backend

`EcommerceMasterAttributeDocument` mendapat field baru:

```java
private List<ChannelFieldConditionalRule> channelConditionalRules;
```

`ChannelStepSchemaService` meneruskan rules ini ke `conditionalRules` di schema field. Backend `saveChannelData` **harus** mengevaluasi `conditionalRules` saat menghitung `completionPercentage` — evaluasi frontend saja bisa di-bypass via direct API call.

### Implementation Order

1. Tambah `channelConditionalRules` ke `EcommerceMasterAttributeDocument`
2. Schema generation: populate `conditionalRules` dari attribute document
3. Frontend: `useChannelFieldVisibility` hook
4. Backend: evaluasi conditional rules di completion score

### Open Question

**Server-side validation:** Backend `saveChannelData` harus mengevaluasi `conditionalRules` saat menghitung `completionPercentage`. Field yang hidden karena conditional tidak boleh dihitung dalam `requiredTotal`.

---

## Phase 6 — Scenario F: Multi-Language Content

### Permasalahan

Beberapa kombinasi channel–region mengharuskan konten produk dalam beberapa bahasa secara bersamaan. Satu field `TEXT` atau `TEXTAREA` tidak cukup — nilainya harus berupa map dari locale code ke string terjemahan, dan semua locale yang required harus diisi sebelum bisa publish.

### Contoh Nyata

| Channel | Region store | Locale yang diperlukan | Field yang terpengaruh |
|---|---|---|---|
| Lazada | Malaysia | `en`, `ms` | name, description, bullet_points |
| Lazada | Thailand | `en`, `th` | name, description |
| Amazon | Japan | `en`, `ja` | title, bullet_points, product_description |
| TikTok Shop | SEA multi-region | `en` + locale regional | title, description |

### Field Type Baru

```typescript
type ChannelFieldType = ... | "LOCALIZED_TEXT" | "LOCALIZED_TEXTAREA";
```

**`localeConfig` pada `ChannelFormField`:**

```typescript
interface ChannelFormField {
  localeConfig?: {
    requiredLocales:     string[];   // e.g. ["en", "ms"]
    optionalLocales?:    string[];
    maxLengthPerLocale?: number;
  };
}
```

**Shape nilai di `channelData`:**

```json
{
  "name": {
    "en": "Blue Cotton T-Shirt",
    "ms": "T-Shirt Kapas Biru"
  }
}
```

### Komponen Frontend: `LocalizedTextInput`

```
[Lazada MY] Product Name
  English (required)       [Blue Cotton T-Shirt             ]  35/200
  Bahasa Malaysia *        [T-Shirt Kapas Biru               ]  20/200
  [Translate with AI]  ← auto-fill locale kosong; flag ai_generated=true di save payload
```

`isLocallyComplete()` harus memverifikasi semua `requiredLocales` non-empty.

### Arsitektur Backend

- `requiredLocales` disimpan di `ChannelConfiguration` per channel-region store
- `ChannelStepSchemaService` membaca `requiredLocales` dari channel config dan set `fieldType=LOCALIZED_TEXT` + `localeConfig` untuk field yang punya `isLocalizableField=true`
- `EcommerceMasterAttributeDocument` mendapat `private boolean isLocalizableField`
- Nilai yang di-generate AI harus diberi flag `ai_generated: true` di save payload sehingga backend bisa memperingatkan di publish time

### Implementation Order

1. Tambah `requiredLocales` ke `ChannelConfiguration` per store
2. Tambah `isLocalizableField` ke `EcommerceMasterAttributeDocument`
3. Schema generation: set `LOCALIZED_TEXT` fieldType + `localeConfig`
4. Frontend: `LocalizedTextInput` component
5. Completion check: validasi semua `requiredLocales` non-empty

### Open Question

**AI translation quality:** Nilai yang diterjemahkan AI harus di-flag `ai_generated: true` di save payload sehingga backend bisa memperingatkan saat publish. Platform tidak harus mencegah publish konten AI-generated, tapi harus ada visibilitas.

---

## Phase 7 — Scenario G: Channel Pricing & Currency Conversion

### Permasalahan

Master product menyimpan harga dalam base currency organisasi. Channel store mungkin dikonfigurasi untuk currency yang berbeda. Field harga channel harus auto-convert, menerapkan rounding rules channel-specific, menghormati batas harga platform, dan membolehkan seller untuk override.

Ini berbeda dari `master_overrides` yang menyalin angka mentah tanpa currency awareness.

### Contoh Nyata

| Master price | Base | Channel | Target | Rounding | Suggestion |
|---|---|---|---|---|---|
| 29.99 | SGD | Tokopedia | IDR | nearest 1000 | IDR 339,000 |
| 29.99 | SGD | Shopee MY | MYR | nearest 0.50 | MYR 99.50 |
| 29.99 | SGD | Lazada TH | THB | nearest 10 | THB 790 |

### Field Type Baru

```typescript
type ChannelFieldType = ... | "CURRENCY_PRICE";
```

**`currencyConfig` dan `priceSuggestion` pada `ChannelFormField`:**

```typescript
interface ChannelFormField {
  currencyConfig?: {
    targetCurrency:   string;
    sourceCurrency:   string;
    roundingRule:     "NEAREST_1" | "NEAREST_10" | "NEAREST_100" | "NEAREST_1000"
                    | "NEAREST_0_5" | "NEAREST_0_01";
    channelMinPrice?: number;
    channelMaxPrice?: number;
  };
  priceSuggestion?: {
    sourceValue:    number;
    sourceCurrency: string;
    suggestedValue: number;
    targetCurrency: string;
    exchangeRate:   number;
    rateTimestamp:  string;  // ISO 8601
  };
}
```

### Komponen Frontend: `CurrencyPriceInput`

```
[Tokopedia] Listing Price (IDR)
  [Auto-converted from SGD 29.99 at rate 11,324.5 on 2026-03-05]
  [ IDR  339,000    ]  [Use suggestion]  [Enter manually]
  Min: IDR 100 — Max: IDR 100,000,000
```

Komponen ini juga diterapkan ke kolom price di `VariantOverridesTable` untuk setiap baris SKU.

### Arsitektur Backend

**Service baru: `ExchangeRateService`**

```java
public interface ExchangeRateService {
    Mono<ExchangeRate> getRate(String fromCurrency, String toCurrency);
    // Provider eksternal (Open Exchange Rates, ECB); Redis TTL = 1 jam
}
```

Schema generation memanggil service ini dan menyematkan `priceSuggestion` — seller melihat konversi langsung tanpa extra API calls dari frontend.

**`EcommerceMasterAttributeDocument` extension:**

```java
private boolean isCurrencyField;
private String  currencyRoundingRule;
```

### Implementation Order

1. Tambah `isCurrencyField` + `currencyRoundingRule` ke `EcommerceMasterAttributeDocument`
2. Tambah `targetCurrency` ke `ChannelConfiguration` per channel-region
3. Implementasi `ExchangeRateService` dengan Redis cache TTL 1 jam
4. Schema generation: `priceSuggestion` untuk semua `CURRENCY_PRICE` fields
5. Frontend: `CurrencyPriceInput` component
6. Terapkan ke `VariantOverridesTable` price columns

### Open Questions

- **Multi-currency variant table:** 20 variants × IDR price = 20 `CurrencyPriceInput` instances. Komponen harus ringan untuk menghindari rendering bottleneck.
- **Copy antar store (Scenario I):** Saat copy `CURRENCY_PRICE` dari `shopify-us` (USD) ke `shopify-eu` (EUR), tawarkan "Copy and convert at current rate" vs "Copy raw value" vs "Skip".

---

## Phase 8 — Scenario H: Channel-Specific Media Compliance

### Permasalahan

Setiap channel punya persyaratan teknis ketat untuk gambar dan video produk. Media dari master product mungkin tidak memenuhi syarat, menyebabkan publish failure yang silent atau rejection aktif. Form channel harus menampilkan badge mana gambar master yang lolos, mana yang gagal, dan membolehkan upload media replacement khusus channel.

### Contoh Nyata

| Channel | Persyaratan | Kegagalan umum |
|---|---|---|
| Amazon | White/pure background, min 1000×1000px, JPEG, no watermark, no overlay text | Lifestyle images, dark backgrounds |
| Amazon | Main image harus white; secondary boleh lifestyle | Wrong first image |
| TikTok Shop | 9:16 atau 1:1 ratio; product video required untuk beberapa kategori | Wrong aspect ratio; missing video |
| Shopee | No watermarks; max 2 MB per image; 1:1 preferred | Watermarked agency images |
| Lazada | Min 500×500px; up to 8 images; white background direkomendasikan untuk first image | Undersized images |
| eBay | Min 500px on longest side; max 12 images | Reused thumbnail images |

### Field Type Baru

```typescript
type ChannelFieldType = ... | "CHANNEL_MEDIA";
```

**`mediaConfig` dan `masterMediaAssets` pada `ChannelFormField`:**

```typescript
interface ChannelFormField {
  mediaConfig?: {
    mediaType:        "IMAGE" | "VIDEO" | "IMAGE_OR_VIDEO";
    minWidth?:        number;
    minHeight?:       number;
    aspectRatios?:    string[];   // e.g. ["1:1", "9:16"]
    allowedFormats:   string[];   // e.g. ["JPEG", "PNG"]
    maxFileSizeBytes?: number;
    maxCount?:        number;
    minCount?:        number;
    backgroundRule?:  "WHITE_ONLY" | "ANY";
    noWatermark?:     boolean;
    noTextOverlay?:   boolean;
    videoRequired?:   boolean;
    videoMaxDurationSeconds?: number;
  };
  masterMediaAssets?: Array<{
    url:        string;
    width:      number;
    height:     number;
    format:     string;
    compliance: "PASS" | "FAIL" | "WARNING";
    issues?:    string[];  // e.g. ["TOO_SMALL", "HAS_WATERMARK", "WRONG_FORMAT"]
  }>;
}
```

### Komponen Frontend: `ChannelMediaField`

```
[Amazon] Product Images  (min 1000×1000 | white background | JPEG only)

  Master images:
  [img1] ✓ PASS       [img2] ✗ FAIL: background not white    [img3] ⚠ WARNING: 800×800
         [Use] ✓              [Replace]                               [Use anyway] [Replace]

  Channel-specific uploads:
  [+ Upload replacement for Amazon only]

  Video (required for this category):
  [ Upload product video  ]
```

- **"Use"** → tandai gambar untuk channel ini (simpan di `channelData.images[]`)
- **"Replace"** → buka dialog upload; replacement disimpan terpisah dari master image, hanya dipakai untuk channel ini
- **"Re-check"** → panggil compliance endpoint ulang (jika gambar diupload baru)

**Section baru: `"channel_media"`**

```typescript
type SectionName = ... | "channel_media";
```

### Arsitektur Backend

**Service baru: `MediaComplianceService`**

```java
public interface MediaComplianceService {
    Mono<MediaComplianceResult> check(String imageUrl, MediaConfig config);
    // Checks: dimensions, format, file size via image metadata
    // Background + watermark: lightweight vision service (Google Vision API color analysis
    //   atau rule-based check berdasarkan dominant color)
}

record MediaComplianceResult(
    boolean passes,
    List<String> failures,   // e.g. ["TOO_SMALL", "WRONG_FORMAT", "HAS_WATERMARK"]
    int width, int height,
    String format
) {}
```

**Endpoint baru: media compliance re-check**

```
POST /api/v1/media/compliance-check
Body:     { channelType, imageUrls: string[], mediaConfig }
Response: { results: [{ url, compliance, issues, width, height, format }] }
```

Schema generation memeriksa master product images terhadap `mediaConfig` channel dan menyematkan compliance summary per image di `masterMediaAssets`.

**`EcommerceMasterAttributeDocument` extension:**

```java
private MediaConfig mediaConfig;  // serialized channel media requirements
```

### Implementation Order

1. `MediaConfig` inner class di `EcommerceMasterAttributeDocument`
2. `MediaComplianceService` — dimension/format checks; vision API untuk background/watermark
3. Schema generation: jalankan compliance check untuk `CHANNEL_MEDIA` fields, set `masterMediaAssets`
4. Frontend: `ChannelMediaField` component dengan per-image badges
5. `POST /media/compliance-check` endpoint untuk re-check button
6. Storasi media channel-specific (S3 prefix terpisah dari master images)

### Open Questions

- **Vision API cost:** Compliance check runs at schema-gen time. Cache hasil per `(imageUrl + mediaConfig hash)` di Redis, TTL 24 jam. Hanya re-run jika image URL atau config berubah.
- **Channel-specific media storage:** Channel replacement images harus disimpan terpisah dari master images (S3 prefix berbeda atau dokumen terpisah) dan direferensikan di `channelData.channelImages[]`.

---

## Phase 9 — Scenario I: Cross-Store Value Inheritance

### Permasalahan

Organisasi dengan beberapa store dari channel yang sama atau serupa (mis. `shopify-us` + `shopify-eu`, atau `shopee-my` + `shopee-th`) biasanya mengisi satu store secara lengkap, lalu ingin menyalin sebagian besar nilai ke sibling store dan hanya menyesuaikan beberapa field (harga, bahasa, warehouse). Tanpa mekanisme copy, seller harus mengisi ulang setiap field secara manual.

### Mengapa Copy Naive Merusak

Copy biasa "copy all" dari satu tab store ke tab lain akan menyalin:
- **Warehouse ID yang salah** (Scenario A) — US location ID dari `shopify-us` tidak berlaku di `shopify-eu`
- **Harga dengan currency salah** (Scenario G) — harga USD yang dipaste ke EU store secara semantik salah
- **Konten locale yang salah** (Scenario F) — konten English-only yang dipaste ke Thai locale store meninggalkan required locales kosong
- **Category ID yang salah** (Scenario C) — Category ID bisa berbeda antar region bahkan untuk channel type yang sama

### Kontrak Frontend

**Dropdown "Copy from store" pada setiap tab:**

```
[Shopify EU tab]
  [Copy values from: Shopify US Store ▾]  [Copy selected fields ▾]
  ┌───────────────────────────────────────────────────────────────┐
  │ Select fields to copy:                                        │
  │  ✓ vendor          ✓ product_type      ✓ tags                │
  │  ✗ location_id     (MERCHANT_API — skipped, account-specific) │
  │  ✗ listing_price   (CURRENCY_PRICE — currency differs)        │
  │  ✗ name_en/ms      (LOCALIZED_TEXT — locale config differs)   │
  │  ✓ published_scope ✓ requires_shipping                       │
  └───────────────────────────────────────────────────────────────┘
  [Apply copy]
```

**Skip rules untuk copy:**

| Field property | Perilaku copy |
|---|---|
| `optionsSource = "MERCHANT_API"` | Selalu skip — ID bersifat account-specific |
| `fieldType = "CURRENCY_PRICE"` | Skip by default; tawarkan "copy and convert" jika exchange rate tersedia |
| `fieldType = "LOCALIZED_TEXT"` | Skip jika `requiredLocales` berbeda; copy hanya shared locales |
| `fieldType = "CATEGORY_TREE"` | Skip jika channelType berbeda; copy jika channelType + region sama |
| `fieldType = "CHANNEL_MEDIA"` | Copy jika channelType sama (specs sama); skip jika berbeda |
| Field lainnya | Copy dengan konfirmasi user jika nilai berbeda dari nilai target yang sudah ada |

**Schema field extension:**

```typescript
interface ChannelFormField {
  copyable?: boolean;
  // false: MERCHANT_API fields
  // Schema generation menentukan ini berdasarkan optionsSource dan fieldType
}
```

**"Copied from {store}" indicator:** Setelah copy, setiap field yang disalin menampilkan badge "Copied from Shopify US" sampai user mengeditnya. Ini adalah client-side state murni — hilang saat save berikutnya.

### Arsitektur Backend

Copy tidak menulis ke backend secara langsung — user tetap men-trigger autosave normal. Backend hanya perlu:

1. `copyable` flag di schema generation berdasarkan `fieldType` dan `optionsSource`
2. Endpoint existing `GET /channel-product-data/{masterProductId}/{sourceStoreId}` sudah cukup untuk frontend membaca nilai source store

### Implementation Order

1. Tambah `copyable` flag ke schema generation
2. "Copy from store" dropdown di `ChannelFieldsWizard` per tab
3. Frontend copy: terapkan skip rules, tulis ke local form state saja
4. "Copied from {store}" badge per field (client-side, clear on save)

---

## Phase 10 — Scenario J: Channel-Specific SEO & Keyword Structure

### Permasalahan

Setiap channel punya algoritma pencarian sendiri dan membutuhkan metadata keyword dengan struktur yang berbeda. Field-field ini secara struktural tidak kompatibel dengan `tags[]` atau `seoKeywords[]` master product dan tidak bisa di-auto-populate dari keduanya tanpa transformasi.

### Contoh Nyata

| Channel | Field | Struktur | Constraints |
|---|---|---|---|
| Amazon | `search_terms` | 5 baris teks terpisah | Masing-masing max 100 chars; tidak boleh ada kata dari title; tidak boleh ada competitor names |
| Amazon | `subject_keywords` | Comma-separated string | Max 255 chars total |
| Shopee | `#hashtags` | Array string dengan prefix `#` | Max 20 hashtags; masing-masing max 24 chars |
| TikTok Shop | `product_hashtags` | Array hashtag strings | Mempengaruhi ranking TikTok Discover |
| Lazada | `keywords` | Comma-separated string | Field terpisah dari description |
| eBay | `item_specifics` | Key-value pairs per kategori | Menentukan eBay catalog match |

### Field Type Baru

```typescript
type ChannelFieldType = ... | "KEYWORD_LIST" | "SEARCH_TERM_LINES";
```

**`keywordConfig` dan `keywordSuggestions` pada `ChannelFormField`:**

```typescript
interface ChannelFormField {
  keywordConfig?: {
    maxItems?:       number;     // e.g. 20 untuk Shopee hashtags
    maxLengthEach?:  number;     // e.g. 24 chars per hashtag
    prefix?:         string;     // e.g. "#" untuk hashtags
    lineCount?:      number;     // e.g. 5 untuk Amazon search_terms
    maxLengthPerLine?: number;   // e.g. 100 untuk Amazon search_terms
    forbiddenWords?: "FROM_TITLE" | "FROM_BRAND" | "COMPETITOR_NAMES";
  };
  keywordSuggestions?: Array<{
    value:      string;
    source:     "MASTER_TAGS" | "MASTER_SEO_KEYWORDS" | "MASTER_DESCRIPTION";
    applicable: boolean;  // false jika melanggar constraint (mis. kata ada di title)
  }>;
}
```

### Komponen Frontend

**`SearchTermLinesInput` (Amazon):**

```
[Amazon] Search Terms  (5 lines × max 100 chars each)

  Line 1: [ cotton t-shirt men comfortable              ] 40/100
  Line 2: [ crew neck summer top breathable             ] 32/100
  Line 3: [                                             ]  0/100 ← empty
  Line 4: [                                             ]  0/100
  Line 5: [                                             ]  0/100

  Suggestions from master tags:  [cotton] [t-shirt] [men's fashion]
  ⚠ "Blue" sudah ada di title — hindari menggunakannya di search terms.
```

**`KeywordListInput` (Shopee):**

```
[Shopee] Hashtags  (max 20 | max 24 chars each)

  [#cotton] [#tshirt] [#mensfashion] [#casualwear]  [+ Add]
  Suggestions: [#cotton] [#tshirt] ← dari master tags, diformat dengan prefix #
```

**Section baru: `"channel_seo"`**

```typescript
type SectionName = ... | "channel_seo";
```

### Arsitektur Backend

**`EcommerceMasterAttributeDocument` extension:**

```java
private KeywordConfig keywordConfig;  // serialized keyword structure config
```

Schema generation:
1. Baca `keywordConfig` dari attribute document
2. Baca master product `tags`, `seoKeywords`, dan extract text dari `description`
3. Terapkan constraint rules (mis. flag suggestion yang ada di `name` untuk Amazon)
4. Set `keywordSuggestions` dengan `applicable: true/false`

**Forbidden-word check:** Backend harus membaca `name` master product (dan `master_overrides["name"]` untuk channel tersebut jika ada) sebelum generate suggestions untuk Amazon `search_terms`.

### Implementation Order

1. Tambah `keywordConfig` ke `EcommerceMasterAttributeDocument`
2. Schema generation: derive `keywordSuggestions` dari master tags/seoKeywords
3. Frontend: `KeywordListInput` dan `SearchTermLinesInput` components
4. `"channel_seo"` section baru di form

---

## Phase 11 — Scenario K: Computed/Derived Channel Fields

### Permasalahan

Nilai sebuah channel field harus **dirakit dari beberapa field master product** menggunakan transformation rule. Ini berbeda dari Scenario B (yang memetakan vocabulary satu field master ke ekuivalen channel) dan dari `master_overrides` (yang menyalin satu field apa adanya).

Sumbernya adalah beberapa field dan derivasinya melibatkan concatenation, slicing, formatting, atau aritmatika.

### Contoh Nyata

| Channel | Channel field | Derivasi | Source fields |
|---|---|---|---|
| Amazon | `bullet_point_1`..`bullet_point_5` | Split `description` jadi 5 paragraf max 255 chars | `description` |
| Amazon | `item_package_weight` | `weight` + packaging weight offset (configurable) | `weight` |
| Shopify | `product_type` | Concat `category.name` + `subcategory.name` dengan `/` | `category`, `subcategory` |
| TikTok | `title` | Truncate `name` ke 255 chars; append `brand` jika total < 200 chars | `name`, `brand` |
| Lazada | `short_description` | Extract 2 kalimat pertama dari `description` | `description` |
| eBay | `title` | `name` (max 60 chars) + variant option kunci (mis. "Blue, Size M") | `name`, `defaultVariant` |
| Shopee | `package_dimensions` | Format `dimensions` sebagai `{length}x{width}x{height} cm` | `dimensions` |

### Perbedaan dari Scenario B

Scenario B memetakan **vocabulary** satu field (`color: "navy blue"` → ID `"COLOUR_0036"`). Source dan target keduanya single-valued; hanya kode yang berubah.

Scenario K **merakit konten** dari beberapa field atau mentransformasi struktur field: split text blocks, concat string dari field berbeda, menerapkan numeric offsets. Derivation rule adalah pipeline kecil operasi, bukan lookup table.

### Schema Extension: `derivationRule`

```typescript
interface ChannelFormField {
  derivationRule?: {
    operation:    "TRUNCATE"
                | "SPLIT_PARAGRAPHS"
                | "CONCAT"
                | "FORMAT_TEMPLATE"
                | "ARITHMETIC_OFFSET"
                | "EXTRACT_SENTENCES";
    sourceFields: string[];  // nama field master yang dibaca
    params:       Record<string, unknown>;
    // TRUNCATE:          { maxLength: 255 }
    // SPLIT_PARAGRAPHS:  { lineIndex: 0, maxLength: 255 }
    // CONCAT:            { separator: "/", fields: ["category", "subcategory"] }
    // FORMAT_TEMPLATE:   { template: "{length}x{width}x{height} cm" }
    // ARITHMETIC_OFFSET: { field: "weight", offsetGrams: 200 }
    // EXTRACT_SENTENCES: { count: 2 }
  };
  derivedSuggestion?: unknown;  // backend compute at schema-gen time
}
```

### Komponen Frontend: Derived Suggestion Banner

```
[Amazon] Bullet Point 1
  [Derived from: description]
  "Premium quality cotton blend fabric that keeps you comfortable all day..."
  [Accept]  [Edit]

[Amazon] Bullet Point 2
  "Machine washable at 30°C. Available in 12 colours and 5 sizes."
  [Accept]  [Edit]
```

Saat seller edit field yang sudah di-derive:

```
[Amazon] Bullet Point 1
  Custom value (derived suggestion available)
  [ Premium quality cotton...  — edited manually           ]
  [Restore derived]
```

### Arsitektur Backend

**Service baru: `FieldDerivationService`**

```java
public interface FieldDerivationService {
    Mono<Object> derive(
        String channelType, String fieldName,
        DerivationRule rule,
        Map<String, Object> masterProductData
    );
}
```

Schema generation:
1. Baca `derivationRule` dari `EcommerceMasterAttributeDocument`
2. Eksekusi operasi terhadap `masterProductData`
3. Set `derivedSuggestion` di schema field

**`EcommerceMasterAttributeDocument` extension:**

```java
private DerivationRule derivationRule;  // JSON-serialized
```

### Implementation Order

1. `DerivationRule` inner class di `EcommerceMasterAttributeDocument`
2. Implementasi `FieldDerivationService` dengan semua 6 operasi
3. Schema generation: eksekusi derivation, set `derivedSuggestion`
4. Frontend: derived-suggestion banner di `ChannelFieldInput` (Accept/Edit/Restore)

### Open Question

**Derivation idempotency:** Jika `description` master product berubah setelah seller sudah menerima derived `bullet_point_1`, backend harus menandai field sebagai "source changed — re-derive?" daripada diam-diam menimpa nilai yang sudah diterima.

---

## Gambaran Besar: Extended ChannelFormField

Semua field baru yang ditambahkan ke `ChannelFormField` lintas semua 11 scenario:

```typescript
interface ChannelFormField {
  // ── Existing (Phases 1–4) ────────────────────────────────────────────
  fieldName: string;  fieldType: ChannelFieldType;  label: string;
  required: boolean;  currentValue?: unknown;
  options?: Array<{ value: string; label: string }>;
  validationRules?: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string };
  isMasterField?: boolean;  masterValue?: unknown;
  optionsSource?: "STATIC" | "MERCHANT_API";       // Scenario A
  optionsEndpoint?: string;                         // Scenario A
  masterMappedSuggestion?: { ... };                 // Scenario B
  categoryTreeConfig?: { ... };                     // Scenario C
  copyable?: boolean;                               // Scenario I (set by backend)

  // ── New (Phases 5–11) ────────────────────────────────────────────────
  conditionalRules?: ChannelFieldConditionalRule[];  // E — show/hide/require
  localeConfig?: {                                   // F — multi-locale text
    requiredLocales: string[];
    optionalLocales?: string[];
    maxLengthPerLocale?: number;
  };
  currencyConfig?: { ... };                          // G — currency config
  priceSuggestion?: { ... };                         // G — auto-converted value
  mediaConfig?: { ... };                             // H — media requirements
  masterMediaAssets?: Array<{ url; compliance; issues }>;  // H — compliance check
  keywordConfig?: { ... };                           // J — keyword structure
  keywordSuggestions?: Array<{ value; source; applicable }>;  // J — suggestions
  derivationRule?: { operation; sourceFields; params };       // K — derivation
  derivedSuggestion?: unknown;                                 // K — computed value
}
```

**Extended `ChannelFieldType`:**

```typescript
type ChannelFieldType =
  // Existing
  | "TEXT" | "TEXTAREA" | "NUMBER" | "SELECT" | "MULTISELECT"
  | "CHECKBOX" | "RADIO" | "DATE" | "URL" | "EMAIL" | "COLOR"
  | "CATEGORY_TREE"         // Phase 3/C
  // New
  | "LOCALIZED_TEXT"        // Phase 6/F
  | "LOCALIZED_TEXTAREA"    // Phase 6/F
  | "CURRENCY_PRICE"        // Phase 7/G
  | "CHANNEL_MEDIA"         // Phase 8/H
  | "KEYWORD_LIST"          // Phase 10/J
  | "SEARCH_TERM_LINES";    // Phase 10/J
```

**Extended `SectionName`:**

```typescript
type SectionName =
  | "required" | "recommended" | "optional"
  | "master_overrides" | "variant_overrides"
  | "merchant_data"        // Phase 1/A
  | "category_attributes"  // Phase 4/D
  | "channel_media"        // Phase 8/H
  | "channel_seo";         // Phase 10/J
```

---

## Combined Data Flow (Phase 1–11)

```
POST /form-schema/channel-step
  Input: { masterProductId, organizationId, masterVariants }

  Untuk setiap store yang terhubung (parallel):
    1. Load channel config   (channel_configurations)
    2. Load channel attrs    (EcommerceMasterAttributeDocument where isChannelField)
    3. Load saved data       (channel_product_data)
    4. Load master product   (untuk B, F, G, J, K suggestions)

    Untuk setiap field:
      [A] optionsSource=MERCHANT_API, ≤50 items → fetchOptions() → embed options[]
      [A] optionsSource=MERCHANT_API, >50 items → set optionsEndpoint (lazy-load)
      [B] masterFieldName set → resolveSuggestion() → set masterMappedSuggestion
      [C] fieldType=CATEGORY_TREE → set categoryTreeConfig
      [D] categoryId tersimpan → getAttributes(categoryId) → inject categoryAttributeSection
      [E] channelConditionalRules pada attr → populate conditionalRules
      [F] isLocalizableField=true + channel requiredLocales → set LOCALIZED_TEXT + localeConfig
      [G] isCurrencyField=true → getRate() → apply rounding → set priceSuggestion
      [H] fieldType=CHANNEL_MEDIA → check master images → set masterMediaAssets compliance
      [I] set copyable=false untuk MERCHANT_API, CURRENCY_PRICE cross-currency, mismatched LOCALIZED_TEXT
      [J] keywordConfig set → derive keywordSuggestions dari master tags/seoKeywords
      [K] derivationRule set → execute FieldDerivationService → set derivedSuggestion

    Assemble sections (required/recommended/optional/merchant_data/category_attributes/channel_media/channel_seo)
    Calculate completionPercentage:
      Layer 0: channel-wide required
      Layer 1: Path A category slug override
      Layer 2: Path B live category attributes
      + conditional rules (E): field hidden = tidak dihitung
      + locale requirements (F): semua requiredLocales harus non-empty

  Return ChannelStepSchemaResponse
```

---

## Dependency antar Scenario

```
Scenario E ──────────────────────────────────────────┐
  (conditional rules bisa mempengaruhi field dari)    │
  Scenario A (hide MERCHANT_API field)                 │
  Scenario F (hide LOCALIZED_TEXT field)               │
  Scenario G (hide CURRENCY_PRICE field)               ▼
  Scenario D (kategori injected field juga bisa punya conditional rules)

Scenario D + A + B + E + K (komposisi penuh):
  Satu field yang di-inject setelah kategori dipilih (D)
  bisa sekaligus:
  - Opsinya dari merchant account (A)
  - Nilainya disarankan dari master field (B)
  - Visibility-nya bergantung pada field lain (E)
  - Nilainya diderive dari beberapa source field (K)

  Pipeline schema generation harus mengkomposisi semua enrichment
  yang berlaku untuk field tersebut, terlepas dari bagaimana field tersebut
  diperkenalkan (static config atau injection pasca-kategori).
```

---

## Dokumen Terkait

| Dokumen | Isi |
|---|---|
| [`09-step2-channel-data-sources.md`](./09-step2-channel-data-sources.md) | Ringkasan semua 11 scenario; status Phase 1–4 |
| [`14-phase3-hierarchical-category-tree.md`](./14-phase3-hierarchical-category-tree.md) | Phase 3/C — CATEGORY_TREE, CategoryTreePicker, channel category cache |
| [`15-phase4-category-dependent-field-injection.md`](./15-phase4-category-dependent-field-injection.md) | Phase 4/D — tiga layer required fields, Path A/B, completion score |
| [`08-step2-channel-fields.md`](./08-step2-channel-fields.md) | Step 2 overview: schema generation, autosave, sections, completion tracking |
| `src/main/resources/Documentation/_step2-channel-data-sources/README.md` | Original planning source — spec lengkap semua 11 scenario dengan open questions |
