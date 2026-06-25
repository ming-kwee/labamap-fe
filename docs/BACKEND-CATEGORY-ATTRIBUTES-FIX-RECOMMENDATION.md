# Rekomendasi Perbaikan Backend: Category Attributes Endpoint

**Tanggal**: 2026-06-24  
**Prioritas**: High — memengaruhi UX Step 2 channel fields untuk semua channel yang punya CATEGORY_TREE field  
**Status frontend**: Workaround sudah ada (save + schema refresh) — terdeteksi ketika endpoint mengembalikan `requiredFields: []`

---

## Ringkasan Masalah

Ketika merchant memilih category di Step 2 (contoh: `Apparel & Accessories › Clothing › Tops › Blouses`), field kategori spesifik (`material`, `size_type`, `care_instructions`) **tidak langsung muncul**. Field baru muncul setelah merchant:
1. Go to Step 3 → kembali ke Step 2 (yang trigger schema reload)
2. Atau tunggu autosave 30 detik kemudian reload

---

## Endpoint yang Bermasalah

### `GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes`

**Query params**: `categoryId={leafCategoryId}&organizationId={orgId}`

**Status saat ini**: Endpoint ini kemungkinan mengembalikan 404 atau error, bukan data category attributes.

**Yang seharusnya dikembalikan**:
```json
{
  "categoryId": "gid://shopify/TaxonomyCategory/aa-1-13-7",
  "categoryName": "Blouses",
  "categoryPath": ["Apparel & Accessories", "Clothing", "Clothing Tops"],
  "requiredFields": [
    {
      "fieldName": "material",
      "fieldType": "TEXT",
      "label": "material",
      "required": true,
      "helpText": "Primary material of the product"
    },
    {
      "fieldName": "care_instructions",
      "fieldType": "TEXT",
      "label": "care_instructions",
      "required": true
    },
    {
      "fieldName": "size_type",
      "fieldType": "TEXT",
      "label": "size_type",
      "required": true
    }
  ],
  "optionalFields": [],
  "variantOptionSuggestions": []
}
```

---

## Bug Kedua: `categoryName` Mengembalikan GID

Endpoint `POST /ecommerce/form-schema/channel-step` sudah mengembalikan `categoryAttributeSection` dengan benar ketika category tersimpan, **namun** field `categoryName` berisi nilai GID yang sama dengan `categoryId`:

```json
{
  "categoryAttributeSection": {
    "categoryId": "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "categoryName": "gid://shopify/TaxonomyCategory/aa-1-13-7",  ← BUG: harusnya "Blouses"
    "categoryPath": []  ← BUG: harusnya ["Apparel & Accessories", "Clothing", "Clothing Tops"]
  }
}
```

**Akibat**: Frontend tidak bisa menampilkan breadcrumb yang readable (menampilkan raw GID).

**Yang seharusnya**:
```json
{
  "categoryAttributeSection": {
    "categoryId": "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "categoryName": "Blouses",
    "categoryPath": ["Apparel & Accessories", "Clothing", "Clothing Tops"],
    ...
  }
}
```

---

## Analisa Root Cause

Kedua bug kemungkinan berasal dari tempat yang sama: **`CategoryAttributeSection` builder tidak resolve nama human-readable dari taxonomy**.

Ketika backend membangun `CategoryAttributeSection`, kemungkinan kode saat ini:

```java
// SALAH — menggunakan categoryId sebagai nama
categoryAttributeSection.setCategoryName(categoryId);  // returns "gid://shopify/..."
categoryAttributeSection.setCategoryPath(Collections.emptyList());
```

Yang seharusnya:
```java
// BENAR — resolve nama dari taxonomy service
TaxonomyNode node = channelCategoryService.resolveNodeById(channelType, storeId, categoryId);
categoryAttributeSection.setCategoryName(node.getName());        // "Blouses"
categoryAttributeSection.setCategoryPath(node.getAncestorNames()); // ["Apparel & Accessories", ...]
```

---

## Bug Ketiga: Two-Source Strategy Tidak Merge (Ditemukan 2026-06-24)

**Root cause**: `getCategoryAttributes()` menggunakan strategi OR (satu sumber saja):
- Live API ada field → pakai live API saja (skip categoryRequirements)
- Live API kosong → pakai categoryRequirements saja

Shopify taxonomy endpoint mengembalikan 10 optional fields (Sleeve length type, Age group, Neckline, dll) — sehingga kondisi "live API ada field" terpenuhi, dan backend **skip** `categoryRequirements` yang berisi `material`, `size_type`, `care_instructions`.

**Response aktual** dari `/category-attributes?categoryId=gid://shopify/TaxonomyCategory/aa-1-13-1`:
```json
{
  "requiredFields": [],       ← KOSONG
  "optionalFields": [10 Shopify taxonomy fields]  ← hanya dari live API
}
```

**Yang seharusnya** (strategi MERGE, bukan OR):
```json
{
  "requiredFields": [material, size_type, care_instructions],  ← dari categoryRequirements
  "optionalFields": [10 Shopify taxonomy fields]              ← dari live API
}
```

**Fix di `MerchantDataController.java`**: Ganti strategi OR menjadi strategi MERGE:
```java
// SEBELUM (OR strategy — salah):
if (liveApiFields.isEmpty()) {
    return buildFromCategoryRequirements(slug);
} else {
    return liveApiFields;  // ← skip categoryRequirements
}

// SETELAH (MERGE strategy — benar):
List<ChannelFormField> required = buildFromCategoryRequirements(slug);  // selalu
List<ChannelFormField> optional = liveApiFields;                        // selalu
return CategoryAttributesResponse.of(required, optional);
```

---

## Sprint yang Diperlukan

### Sprint 1 — Fix Segera (Unblock UX)

**Task 1**: Fix `GET /merchant-data/{channelType}/{storeId}/category-attributes`

Endpoint ini dipanggil frontend SEBELUM user menyimpan data, saat user baru saja memilih category dari picker. Backend harus:
1. Terima `categoryId` (bisa berupa GID seperti `gid://shopify/TaxonomyCategory/aa-1-13-7`)
2. Lookup ke Shopify Taxonomy API (atau cache lokal) untuk mendapatkan:
   - `categoryName` = nama human-readable leaf node
   - `categoryPath` = array nama dari root ke parent leaf
   - `requiredFields` = field yang required untuk category ini
   - `optionalFields` = field optional
   - `variantOptionSuggestions` = dimension fields (Color, Size, Pattern, dll)
3. Return `CategoryAttributeSection` DTO

Referensi: implementasi sudah ada di schema generation (`POST /ecommerce/form-schema/channel-step`) — logika yang sama dapat di-ekstrak ke service layer.

**Task 2**: Fix `categoryName` dan `categoryPath` di `CategoryAttributeSection` builder

Cari di `ChannelProductDataService` atau `FormSchemaService` di bagian yang membangun `categoryAttributeSection` saat schema generation. Pastikan `categoryName` dan `categoryPath` di-resolve dari taxonomy service, bukan dari `categoryId`.

---

## Dampak jika Tidak Difix

| Kondisi | Tanpa fix | Dengan fix |
|---|---|---|
| User pilih category baru | Fields muncul setelah delay 2-3 detik (2 API calls: save + schema reload) | Fields muncul instan (1 API call) |
| Breadcrumb category picker | Raw GID ditampilkan sampai user re-visit | Breadcrumb langsung readable |
| UX Score | Terasa lambat dan broken | Smooth dan langsung |

---

## Cara Verifikasi Fix

Setelah backend fix di-deploy:

1. Buka Step 2 untuk produk baru (belum ada category tersimpan)
2. Klik field "Shopify Product Taxonomy Category"
3. Browse dan pilih `Apparel & Accessories › Clothing › Clothing Tops › Blouses`
4. **Expected**: Field `material`, `size_type`, `care_instructions` langsung muncul **tanpa delay** dan **tanpa perlu go to Step 3 dan balik**
5. Breadcrumb menampilkan `Apparel & Accessories › Clothing › Clothing Tops › Blouses` (bukan raw GID)

---

## Catatan untuk Frontend

Frontend sudah ada workaround: ketika endpoint `/category-attributes` gagal, frontend otomatis:
1. Save data ke backend (immediate, tidak tunggu 30 detik)
2. Reload schema untuk mendapatkan `categoryAttributeSection`
3. Inject fields dari schema response

Workaround ini akan otomatis tidak aktif ketika endpoint berhasil (karena `catch` block tidak dipanggil). Tidak perlu perubahan frontend tambahan.
