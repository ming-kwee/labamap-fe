# Frontend Implementation Guide — Backend Changes

**Tanggal**: 2026-06-25  
**Branch backend**: bff-v6  
**Scope**: Semua perubahan backend yang mempengaruhi contract API frontend

---

## Ringkasan Perubahan Backend

| # | Area | Perubahan Backend | Impact Frontend |
|---|---|---|---|
| 1 | Master Product Variants | GET `/{id}` sekarang return `variants[]` di top-level | **High** — stop using sessionStorage workaround |
| 2 | Channel Step Schema | `masterProduct.variants` selalu terisi dari DB | **High** — drop `masterVariants` param |
| 3 | Category Attributes | `/category-attributes` return `requiredFields` dari config | **High** — remove save+reload workaround |
| 4 | Category Section | `categoryAttributeSection` include required + recommended | **Medium** — update filter logic |
| 5 | Client UUID | `context.productId` diterima backend | **High** — generate UUID sebelum create |
| 6 | JOLT Readiness | Response include `metadata.warnings` dari 4-layer check | **Low** — surface warnings ke admin |

---

## 1. Master Product Variants — Stop SessionStorage Workaround

### Apa yang berubah di backend
`GET /api/v1/admin/master-products/{productId}` sekarang selalu mengembalikan `variants[]` di top-level response, bukan hanya di dalam `productAttributes`. `variantCount` juga sekarang akurat.

### Yang perlu diubah frontend

**Hapus sessionStorage workaround** untuk variants:

```typescript
// HAPUS semua pola ini:
sessionStorage.setItem('productVariants', JSON.stringify(variants));
const cachedVariants = sessionStorage.getItem('productVariants');
const variants = raw.productAttributes?.variants ?? [];  // fallback lama

// GANTI dengan:
const variants = raw.variants ?? [];  // langsung dari top-level
const hasVariants = variants.length > 0 || raw.variantCount > 1;
```

**Hapus URL param signal workaround**:

```typescript
// HAPUS:
// router.push(`/products/${id}/edit?hasVariants=1`)

// Cukup navigate normal — toggle ON otomatis dari variants.length
router.push(`/products/${id}/edit`);
```

**Hapus merge strategy sebelum backend response**:

```typescript
// HAPUS pre-write ke sessionStorage sebelum response datang
// ProductCreateForm: tidak perlu lagi menyimpan variants ke session
```

---

## 2. Channel Step Schema — Drop `masterVariants` di Request

### Apa yang berubah di backend
`POST /api/v1/ecommerce/form-schema/channel-step` sekarang fetch variants langsung dari database menggunakan `masterProductId`. Field `masterVariants` di request body tidak lagi diperlukan.

### Yang perlu diubah frontend

```typescript
// SEBELUM:
const schema = await fetchChannelStepSchema({
  masterProductId,
  organizationId,
  masterVariants: sessionStorage.getItem('variants'),  // HAPUS
});

// SESUDAH:
const schema = await fetchChannelStepSchema({
  masterProductId,
  organizationId,
  // masterVariants tidak perlu dikirim — backend fetch dari DB
});
```

`masterProduct.variants` di response sekarang selalu berisi data yang benar, termasuk `sku` dan `variantLabel` per entry.

---

## 3. Category Attributes — Remove Save+Reload Workaround

### Apa yang berubah di backend
`GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes?categoryId=...` sekarang mengembalikan:

```json
{
  "categoryId": "gid://shopify/TaxonomyCategory/aa-1-13-5",
  "categoryName": "Blouses",
  "categoryPath": ["Apparel & Accessories", "Clothing", "Clothing Tops"],
  "requiredFields": [
    { "fieldName": "material", "fieldType": "TEXT", "label": "Fabric/material composition", "required": true },
    { "fieldName": "care_instructions", "fieldType": "TEXT", "label": "Washing and care instructions", "required": true },
    { "fieldName": "size_type", "fieldType": "TEXT", "label": "Size type (regular, plus, petite)", "required": true }
  ],
  "optionalFields": [
    { "fieldName": "Sleeve length type", "required": false },
    { "fieldName": "Age group", "required": false }
  ],
  "variantOptionSuggestions": [...]
}
```

Sebelumnya `requiredFields` selalu `[]` — sekarang selalu terisi dari `categoryRequirements` config.

### Yang perlu diubah frontend

**Hapus workaround save+reload** yang aktif ketika `requiredFields.length === 0`:

```typescript
// HAPUS pola ini sepenuhnya:
const data = await getCategoryAttributes(channelType, storeId, categoryId, orgId);
if (data.requiredFields.length === 0) {
  // workaround: save → reload schema
  await saveChannelData(...);
  const schema = await fetchChannelStepSchema(...);
  injectCategoryFields(schema.categoryAttributeSection);
  return;
}
setCategoryAttrs(data);

// GANTI dengan cukup:
const data = await getCategoryAttributes(channelType, storeId, categoryId, orgId);
setCategoryAttrs(data);
// requiredFields selalu terisi — tidak perlu fallback
```

### Catatan field deduplication

Backend sudah melakukan deduplication: field yang masuk ke `requiredFields` dari config tidak akan muncul lagi di `optionalFields`. Frontend tidak perlu filter manual.

---

## 4. `categoryAttributeSection` — Update Filter `categorySpecificFieldNames`

### Apa yang berubah di backend
`POST /api/v1/ecommerce/form-schema/channel-step` sekarang mengisi `categoryAttributeSection` dengan:

- `requiredFields`: dari `categoryRequirements` config (material, size_type, care_instructions)
- `optionalFields`: dari Shopify live API (Sleeve length type, Age group, dll) **PLUS** recommended fields dari config (fit, sleeve_length, pattern)

### Yang perlu diubah frontend

`categorySpecificFieldNames` perlu dibangun dari **keduanya** — required dan optional:

```typescript
// SEBELUM (incomplete — hanya dari API fields):
const categorySpecificFieldNames = new Set([
  ...(categoryAttrs?.requiredFields ?? []).map(f => f.fieldName),
  ...(categoryAttrs?.optionalFields ?? []).map(f => f.fieldName),
]);

// SESUDAH (sama — sudah benar, tapi pastikan optionalFields include config recommended):
// Backend sudah merge config recommended ke optionalFields, jadi kode ini tidak perlu diubah
// TAPI verifikasi bahwa filter ini dijalankan juga untuk edit mode (My Products path)
```

**Pastikan filter dijalankan di kedua path**:

```typescript
// create mode: categoryAttrs dari /category-attributes endpoint
// edit mode: categoryAttrs dari schema.categoryAttributeSection

// Gunakan satu fungsi yang sama untuk kedua source:
function buildCategorySpecificNames(categoryAttrs) {
  if (!categoryAttrs) return new Set();
  return new Set([
    ...(categoryAttrs.requiredFields ?? []).map(f => f.fieldName),
    ...(categoryAttrs.optionalFields ?? []).map(f => f.fieldName),
  ]);
}

// Create mode:
const names = buildCategorySpecificNames(categoryAttrsState);

// Edit mode:
const names = buildCategorySpecificNames(schema.categoryAttributeSection);
```

Dengan ini, `fit`, `sleeve_length`, `pattern` (config recommended) akan masuk ke `categorySpecificFieldNames` dan tersaring dari Recommended section di kedua mode.

---

## 5. Client-Assigned UUID — Implementasi Wajib

Ini adalah perubahan paling kritikal. Tanpa ini, data Step 2 dari create flow akan hilang saat masuk edit mode.

### Detail teknis

Backend sekarang menerima `context.productId` di endpoint create. Jika valid UUID, digunakan sebagai `_id` MongoDB. Jika tidak ada atau format salah (misal `prod_timestamp`), backend generate UUID baru — yang menyebabkan mismatch.

### Implementasi

**Step 1 — Install uuid**:
```bash
npm install uuid
npm install --save-dev @types/uuid
```

**Step 2 — Generate UUID di awal create flow**:
```typescript
import { v4 as uuidv4 } from 'uuid';

// Satu tempat, generate sekali, simpan di state/context
// Jangan generate ulang di setiap render
const [productId] = useState(() => uuidv4());
```

**Step 3 — Kirim ke create endpoint**:
```typescript
await api.post('/ecommerce/dynamic-products/create', {
  context: {
    productId,          // ← WAJIB DITAMBAHKAN
    userId,
    organizationId,
    productCategory,
  },
  productData: { ... },
});
```

**Step 4 — Gunakan UUID yang sama untuk semua call**:
```typescript
// channel step schema
await api.post('/ecommerce/form-schema/channel-step', {
  masterProductId: productId,  // ← UUID, bukan prod_timestamp
  organizationId,
});

// save channel data
await api.post('/ecommerce/channel-product-data/save', {
  masterProductId: productId,  // ← UUID yang sama
  storeId,
  channelData: { ... },
});
```

**Step 5 — Hapus `prod_` pattern**:
```typescript
// HAPUS:
const tempId = `prod_${Date.now()}`;
const tempId = `product_${timestamp}`;

// GANTI dengan UUID dari useState di atas
```

### Backward compatibility

Backend tetap bisa handle request lama tanpa `context.productId` (akan generate UUID baru). Tapi edit mode akan selalu buat dokumen `channel_product_data` baru yang terpisah — data tidak terhubung. Ini harus difix di frontend secepat mungkin.

---

## 6. JOLT Readiness Warnings — Admin UI (Opsional)

### Apa yang berubah di backend
Response `POST /api/v1/ecommerce/adaptive-pattern/analyze` sekarang menyertakan readiness info di `matchingMetadata.warnings`:

```json
{
  "matchingMetadata": {
    "warnings": [
      "[JOLT-READINESS] Overall: NOT_READY",
      "✗ Check 1 (Compile): Chainr.fromSpec() failed — ...",
      "[JOLT-CONFLICT ERROR] target='product.priceData.price' sources=['price','variant_price'] — ..."
    ]
  }
}
```

Status kemungkinan: `READY`, `WARNINGS`, `NOT_READY`.

### Yang perlu diubah frontend (admin panel saja)

Tampilkan readiness status di JOLT analysis result UI:

```typescript
const warnings = response.matchingMetadata?.warnings ?? [];
const readinessLine = warnings.find(w => w.startsWith('[JOLT-READINESS]'));
const isNotReady = readinessLine?.includes('NOT_READY');
const hasWarnings = readinessLine?.includes('WARNINGS');

// Tampilkan badge/alert di admin UI:
if (isNotReady) {
  showAlert('error', 'JOLT spec tidak valid — tidak disimpan. Lihat warnings untuk detail.');
}
if (hasWarnings) {
  showAlert('warning', 'JOLT spec disimpan dengan catatan. Review warnings sebelum publish.');
}
```

---

## Urutan Prioritas Implementasi

```
Priority 1 (BLOCKER — data loss):
  └── [5] Client-assigned UUID

Priority 2 (UX broken — workaround masih aktif):
  └── [3] Remove save+reload workaround di category attributes
  └── [1] Remove sessionStorage workaround untuk variants

Priority 3 (Data tidak sinkron antara create/edit mode):
  └── [4] Update categorySpecificFieldNames di edit mode path
  └── [2] Drop masterVariants dari channel step request

Priority 4 (Nice to have):
  └── [6] Surface JOLT warnings di admin UI
```

---

## API Contract Summary

| Endpoint | Field | Sebelum | Sesudah |
|---|---|---|---|
| `GET /admin/master-products/{id}` | `variants` | null / via productAttributes | Array di top-level |
| `GET /admin/master-products/{id}` | `variantCount` | 0 atau 1 (salah) | Jumlah aktual SKU |
| `POST /form-schema/channel-step` | request.`masterVariants` | diperlukan | tidak perlu (opsional) |
| `POST /form-schema/channel-step` | response.`masterProduct.variants` | null | selalu terisi dari DB |
| `POST /form-schema/channel-step` | `categoryAttributeSection.requiredFields` | selalu `[]` | terisi dari config |
| `POST /form-schema/channel-step` | `categoryAttributeSection.optionalFields` | hanya live API | live API + config recommended |
| `GET /merchant-data/.../category-attributes` | `requiredFields` | selalu `[]` | terisi dari config |
| `GET /merchant-data/.../category-attributes` | `categoryName` | GID atau blank | human-readable ("Blouses") |
| `GET /merchant-data/.../category-attributes` | `categoryPath` | `[]` | full breadcrumb |
| `POST /dynamic-products/create` | `context.productId` | diabaikan | diterima sebagai `_id` |
| `POST /adaptive-pattern/analyze` | `matchingMetadata.warnings` | konflik tidak dilaporkan | include 4-layer readiness check |
