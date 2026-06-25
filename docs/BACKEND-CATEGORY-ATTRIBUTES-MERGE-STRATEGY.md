# Backend: Category Attributes Merge Strategy Bug

**Tanggal**: 2026-06-24  
**Files**: `MerchantDataController.java`, `ChannelStepSchemaService.java`  
**Status**: ✅ SELESAI — kedua fix sudah di-deploy

---

## Penjelasan "Merge Strategy Bug"

### Dua sumber data untuk category attributes

Backend memiliki dua sumber data untuk field-field di bawah suatu category Shopify:

| Sumber | Berisi apa | Label |
|---|---|---|
| **Shopify Live API** | Field taxonomy Shopify (Sleeve length type, Age group, Neckline, dll) | Human-readable: "Sleeve length type", "Age group" |
| **`categoryRequirements`** (config lokal di `ChannelConfiguration`) | Field wajib yang ditentukan admin platform (material, size_type, care_instructions) | Technical names: "material", "size_type" |

### Strategi saat ini: OR (salah)

```java
// MerchantDataController.getCategoryAttributes() — CURRENT (WRONG):
if (liveApiFields.isNotEmpty()) {
    return CategoryAttributesResponse.of(
        requiredFields = [],           // ← KOSONG — skip categoryRequirements!
        optionalFields = liveApiFields // ← hanya dari Shopify API
    );
} else {
    // Shopify API kosong → fallback ke categoryRequirements
    return buildFromCategoryRequirements(slug);
}
```

**Akibat**: Karena Shopify Taxonomy API selalu mengembalikan data (10 optional fields), kondisi `liveApiFields.isNotEmpty()` selalu TRUE → `categoryRequirements` **tidak pernah dimasukkan** ke `requiredFields`.

Response actual yang diterima frontend:
```json
{
  "requiredFields": [],
  "optionalFields": [
    { "fieldName": "Sleeve length type", "label": "Sleeve length type", "required": false },
    { "fieldName": "Age group", "label": "Age group", "required": false },
    ...10 fields total
  ]
}
```

Sedangkan yang **seharusnya** dikembalikan:
```json
{
  "requiredFields": [
    { "fieldName": "material", "label": "Fabric/material composition", "required": true },
    { "fieldName": "care_instructions", "label": "Washing and care instructions", "required": true },
    { "fieldName": "size_type", "label": "Size type (regular, plus, petite)", "required": true }
  ],
  "optionalFields": [
    { "fieldName": "Sleeve length type", "label": "Sleeve length type", "required": false },
    ...10 fields total
  ]
}
```

---

## Masalah Label (Bonus Bug)

Saat ini `categoryRequirements` menggunakan **technical names** sebagai label:
- `"material"` → seharusnya `"Fabric/material composition"`
- `"size_type"` → seharusnya `"Size type (regular, plus, petite)"`
- `"care_instructions"` → seharusnya `"Washing and care instructions"`

Label yang benar adalah label dari Shopify Taxonomy. Backend perlu mencari label yang sesuai dari Shopify taxonomy data berdasarkan `fieldName`.

Dampak: Field tampil dengan nama teknikal di My Products edit flow, sedangkan tampil dengan nama Shopify yang readable di create flow (setelah fallback schema refresh).

---

## Dampak Saat Ini

| Skenario | Kondisi | Tampilan |
|---|---|---|
| Create flow, pilih category baru | `/category-attributes` → `requiredFields: []` → frontend trigger save+schema refresh → schema endpoint return fields dari `sections.required` | material/size_type muncul di violet Category section (dari schema sections, label teknikal) |
| My Products edit, category sudah tersimpan | Schema load → `categoryAttributeSection.requiredFields: []` → frontend force re-fetch → tetap `[]` → violet section tampil dengan hanya 10 optional | material/size_type muncul di orange Required section di atas (dari schema sections, label teknikal) |

---

## Rekomendasi Perbaikan Backend

### Strategi MERGE (benar)

Ganti dari OR strategy menjadi MERGE strategy:

```java
// MerchantDataController.getCategoryAttributes() — RECOMMENDED FIX:

public Mono<CategoryAttributesResponse> getCategoryAttributes(
    String channelType, String storeId, String categoryId, String organizationId) {
    
    return Mono.zip(
        // Source 1: categoryRequirements dari ChannelConfiguration (ALWAYS)
        buildRequiredFieldsFromConfig(channelType, categoryId),
        // Source 2: optional fields dari Shopify live taxonomy API (ALWAYS)
        fetchOptionalFieldsFromLiveApi(channelType, storeId, categoryId, organizationId)
            .onErrorReturn(Collections.emptyList())  // graceful fallback if API fails
    ).map(tuple -> CategoryAttributesResponse.builder()
        .categoryId(categoryId)
        .categoryName(resolveCategoryName(categoryId))      // human-readable name
        .categoryPath(resolveCategoryPath(categoryId))     // ancestor labels
        .requiredFields(tuple.getT1())   // from categoryRequirements config
        .optionalFields(tuple.getT2())   // from Shopify taxonomy API
        .variantOptionSuggestions(resolveVariantSuggestions(channelType, categoryId))
        .build()
    );
}
```

### Fix Label untuk `categoryRequirements`

Saat ini `categoryRequirements` hanya menyimpan `fieldName` teknikal. Perlu ditambah label Shopify-readable:

```java
// ChannelConfiguration.categoryRequirements — current (incomplete):
Map<String, List<String>> categoryRequirements = Map.of(
    "clothing", List.of("material", "size_type", "care_instructions")
);

// Recommended — include Shopify taxonomy labels:
Map<String, List<CategoryRequiredField>> categoryRequirements = Map.of(
    "clothing", List.of(
        new CategoryRequiredField("material", "Fabric/material composition"),
        new CategoryRequiredField("size_type", "Size type (regular, plus, petite)"),
        new CategoryRequiredField("care_instructions", "Washing and care instructions")
    )
);
```

Atau, saat `buildFromCategoryRequirements()`, lookup label dari taxonomy cache:

```java
private ChannelFormField buildField(String fieldName, String channelType, String categoryId) {
    // Try to find matching label from taxonomy attributes
    String label = taxonomyCache.findAttributeLabel(channelType, categoryId, fieldName)
        .orElse(fieldName); // fallback to technical name if not found
    
    return ChannelFormField.builder()
        .fieldName(fieldName)
        .label(label)       // human-readable label from Shopify taxonomy
        .required(true)
        .fieldType("TEXT")
        .build();
}
```

### Fix `categoryAttributeSection` di Schema Endpoint

Endpoint `POST /ecommerce/form-schema/channel-step` juga perlu di-fix: ketika embed `categoryAttributeSection` untuk category yang sudah tersimpan, pastikan `requiredFields` juga terisi dari `categoryRequirements`:

```java
// FormSchemaService — saat membangun categoryAttributeSection:
CategoryAttributeSection section = CategoryAttributeSection.builder()
    .categoryId(savedCategoryId)
    .categoryName(resolvedName)     // WAJIB: human-readable, bukan GID
    .categoryPath(resolvedPath)     // WAJIB: ["Apparel & Accessories", "Clothing", ...]
    .requiredFields(categoryRequirements.get(resolvedSlug))  // WAJIB: jangan biarkan []
    .optionalFields(liveOptionalFields)
    .build();
```

---

## Status Fix

| Fix | Status | Detail |
|---|---|---|
| **MERGE strategy** di `getCategoryAttributes()` | ✅ Done | `Mono.zip` paralel, deduplicate by fieldName |
| **Fix labels** via label lookup priority | ✅ Done | live API label → config description → fieldName fallback |
| **normalizeFieldType** | ✅ Done | "string"→"TEXT", "number"→"NUMBER" |
| **Fix `categoryAttributeSection`** di schema endpoint | ✅ Done | `enrichCategoryAttrsSection()` di `ChannelStepSchemaService.java` |

---

## Verifikasi Fix

Setelah backend fix di-deploy, test:

1. Buka Step 2 untuk produk BARU
2. Pilih category `Apparel & Accessories › Clothing › Clothing Tops › Blouses`
3. **Expected**: Violet "CATEGORY Blouses" section muncul LANGSUNG dengan:
   - Required: `Fabric/material composition`, `Washing and care instructions`, `Size type`
   - Optional: 10 Shopify taxonomy fields (Age group, Neckline, dll)
4. Buka Step 2 dari **My Products edit**
5. **Expected**: SAMA PERSIS dengan langkah 3 — violet section, label sama, count sama

Jika kedua tampilan identik, semua fix sudah benar.
