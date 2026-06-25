# Rekomendasi Perbaikan Backend: Master Product Variants API

**Tanggal**: 2026-06-20  
**Ditemukan oleh**: Frontend team (analisis bug Step 1 edit page)  
**Prioritas**: High — memengaruhi semua flow edit master product dengan variants

---

## Ringkasan Masalah

Frontend tidak dapat menampilkan kembali data variants di halaman edit master product (`/products/{id}/edit`) ketika user datang dari alur apapun selain create flow di sesi browser yang sama. Toggle "This product has multiple options" tampil OFF, dan tabel variants kosong — meskipun produk tersebut memiliki variants yang sudah tersimpan di database.

**Root cause**: Backend tidak mengembalikan data variants melalui endpoint GET yang ada.

---

## Endpoint yang Bermasalah

### 1. `GET /api/v1/admin/master-products/{id}`

**Masalah saat ini**: Response tidak menyertakan array `variants`.

Frontend memeriksa dua lokasi di response JSON:
```javascript
// Dari master-product.service.ts
variants: Array.isArray(raw.variants) && raw.variants.length > 0
  ? raw.variants
  : Array.isArray(attrs.variants)
    ? attrs.variants
    : [],
```

Kedua path (`raw.variants` dan `raw.productAttributes.variants`) mengembalikan array kosong.

**Dampak**:
- Halaman edit produk tidak bisa menampilkan variants yang sudah ada
- Toggle "This product has multiple options" tampil OFF
- User terpaksa membuat ulang konfigurasi variants dari nol setiap membuka halaman edit

**Yang diharapkan**:
```json
{
  "productId": "abc123",
  "name": "Kaos Polos",
  "variantCount": 6,
  "variants": [
    {
      "id": "putih-s",
      "sku": "KP-PUTIH-S",
      "color": "Putih",
      "size": "S",
      "price": 85000,
      "inventory": 10,
      "weight": 0.2
    },
    {
      "id": "putih-m",
      "sku": "KP-PUTIH-M",
      "color": "Putih",
      "size": "M",
      "price": 85000,
      "inventory": 15,
      "weight": 0.2
    }
  ],
  "productAttributes": { ... }
}
```

Format variant yang diharapkan adalah flat object dengan field dimensi (color, size, dll.) di top-level, bukan nested dalam `productAttributes`. Ini adalah format yang dikirim frontend saat create/update.

---

### 2. `POST /api/v1/ecommerce/form-schema/channel-step`

**Masalah saat ini**: Field `masterProduct.variants` di response kosong/null ketika request tidak menyertakan `masterVariants`.

Request body dari frontend:
```json
{
  "masterProductId": "abc123",
  "organizationId": "org_xxx"
  // masterVariants tidak dikirim — karena frontend tidak punya data ini
}
```

Response saat ini:
```json
{
  "step": 2,
  "masterProductId": "abc123",
  "masterProduct": {
    "name": "Kaos Polos",
    "price": 85000,
    "variants": null  // ← KOSONG
  },
  "channels": [
    {
      "storeId": "...",
      "sections": [
        {
          "sectionName": "variant_overrides",
          "variants": []  // ← KOSONG — tidak ada data variant override rows
        }
      ]
    }
  ]
}
```

**Yang diharapkan**: Backend seharusnya fetch variants dari database menggunakan `masterProductId` ketika `masterVariants` tidak dikirim di request, lalu populate:
1. `masterProduct.variants` — untuk ditampilkan di VariantConfigurator Step 1
2. `channels[].sections[variant_overrides].variants` — untuk ditampilkan di variant override table Step 2

---

### 3. `variantCount` tidak akurat di GET response

**Masalah**: Field `variantCount` di response GET `master-products/{id}` mengembalikan `0` atau `1` untuk produk yang memiliki lebih dari 1 variant.

Frontend menggunakan `variantCount > 1` sebagai fallback untuk mendeteksi apakah produk punya variants:
```javascript
const hasVariants = variants.length > 0 || detail.variantCount > 1;
```

Jika `variantCount` salah, toggle tampil OFF bahkan ketika produk memiliki variants.

**Yang diharapkan**: `variantCount` harus mencerminkan jumlah actual variant SKU yang tersimpan (bukan selalu `1` untuk produk tanpa custom variant configuration).

---

## Format Data Variants yang Digunakan Frontend

Saat user membuat produk dengan variants di Step 1, frontend mengirim struktur berikut ke backend:

```json
{
  "productData": {
    "name": "Kaos Polos",
    "sku": "KP-001",
    "price": 85000,
    "variants": [
      {
        "id": "putih-s",
        "color": "Putih",
        "size": "S",
        "price": 85000,
        "comparePrice": 0,
        "inventory": 10,
        "sku": "KP-PUTIH-S",
        "barcode": "",
        "weight": 0.2,
        "variantImages": []
      },
      {
        "id": "hitam-m",
        "color": "Hitam",
        "size": "M",
        "price": 85000,
        "comparePrice": 0,
        "inventory": 8,
        "sku": "KP-HITAM-M",
        "barcode": "",
        "weight": 0.2,
        "variantImages": []
      }
    ]
  },
  "context": { ... }
}
```

Backend harus menyimpan array ini dan mengembalikannya dengan format yang sama melalui GET endpoint.

---

## Dampak Bisnis

| Alur User | Kondisi Saat Ini | Setelah Fix |
|---|---|---|
| Create → channel-fields → edit (sesi sama) | Variants muncul (via sessionStorage workaround) | Variants muncul (via API) |
| My Products → channel-fields → edit | Toggle OFF, variants kosong | Toggle ON, variants tampil |
| Edit langsung dari My Products | Toggle OFF, variants kosong | Toggle ON, variants tampil |
| Buka di browser/device berbeda | Toggle OFF, variants kosong | Toggle ON, variants tampil |
| Setelah clear browser cache | Toggle OFF, variants kosong | Toggle ON, variants tampil |

---

## Workaround Saat Ini (Frontend)

Frontend sudah mengimplementasikan beberapa workaround untuk mengurangi dampak:

1. **sessionStorage persistence** — Data variants disimpan saat create flow dan digunakan sebagai fallback saat edit
2. **URL param signal** — `ChannelFieldsWizard` mengirim `?hasVariants=1` ke edit page saat navigate back, agar toggle minimal tetap ON meskipun data variants tidak tersedia
3. **Merge strategy** — ProductCreateForm pre-write variants ke sessionStorage sebelum backend response overwrite

Semua workaround ini hanya bekerja **dalam sesi browser yang sama** dan **bukan solusi permanen**. Fix di backend adalah satu-satunya solusi yang benar.

---

## Rekomendasi Implementasi Backend

### Sprint 1 — Critical (tidak bisa ditunda)

**Task 1**: Update `GET /api/v1/admin/master-products/{id}` untuk include `variants` array

```java
// MasterProductResponseDto.java
public class MasterProductResponseDto {
    private String productId;
    private String name;
    private int variantCount;
    private List<Map<String, Object>> variants; // ← TAMBAHKAN INI
    private Map<String, Object> productAttributes;
    // ... field lainnya
}
```

**Task 2**: Pastikan `variantCount` dihitung dari `variants.size()`, bukan hardcoded atau salah kalkulasi

**Task 3**: Update `POST /api/v1/ecommerce/form-schema/channel-step` — ketika `masterVariants` tidak dikirim di request body, fetch variants dari database menggunakan `masterProductId`:

```java
// ChannelStepSchemaService.java
List<Map<String, Object>> resolvedVariants = request.getMasterVariants() != null 
    ? request.getMasterVariants()
    : masterProductRepository.findVariantsByProductId(request.getMasterProductId());
```

### Sprint 2 — Improvement

**Task 4**: Populate `masterProduct.variants` di schema response agar frontend tidak perlu sessionStorage sebagai jembatan antara Step 1 dan Step 2

**Task 5**: Populate `sections[variant_overrides].variants` dari database variants (bukan hanya dari request `masterVariants`)

---

## Cara Verifikasi Fix

Setelah backend fix di-deploy, frontend team akan verifikasi dengan flow berikut:

1. Buat produk baru dengan 3+ variants di Step 1
2. Simpan dan keluar dari browser (clear sessionStorage)
3. Buka browser baru → My Products → klik produk → "Set up & publish"
4. Di channel-fields → klik "← Previous Step"
5. **Expected**: Toggle ON, tabel variants menampilkan semua SKU yang dibuat di step 1

Jika langkah 5 berhasil, berarti fix backend sudah benar.

---

## Kontak

Untuk pertanyaan tentang format data atau integrasi, hubungi frontend team.  
Lihat juga: `src/app/(admin)/products/_services/master-product.service.ts` — fungsi `getById()` untuk melihat bagaimana frontend mapping response backend.
