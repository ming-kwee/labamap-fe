# Backend Spec — Migrasi product_categories → Tags + ProductType

**Untuk:** Backend Engineering Team  
**Tanggal:** 2026-06-16 | **Diimplementasi:** 2026-06-17  
**Status:** Sprint 1 ✅ | Sprint 2 ✅ | Sprint 3 ⏳ (menunggu frontend) | Sprint 4 ⏳  
**Trigger:** Frontend telah menghapus `/omni-admin/product-categories`, `/channels/categories`,
dan semua referensi `categoryId/categoryName/categorySlug/categoryObjectId` dari MasterProduct.

**Referensi:**
- `12-category-evolution-roadmap.md` — konteks arsitektur
- `11-category-architecture-analysis.md` — analisis platform type
- `13-channel-category-mapping-backend-cleanup.md` — cleanup channel_category_mappings

---

## Ringkasan Situasi

### Yang dihapus dari frontend

| Yang dihapus | Keterangan |
|---|---|
| Route `/omni-admin/product-categories` | Admin CRUD untuk platform categories |
| Route `/channels/categories` | Merchant view platform categories |
| Sidebar "Product Categories" + "My Categories" | Navigation entries |
| `categoryId`, `categoryName`, `categorySlug`, `categoryObjectId` di `MasterProduct` | Type dan mapper |
| Kolom "Category" di product list dan product detail | Display only |
| `validateProductCategory`, `KNOWN_CATEGORIES` di form-utils | Hardcoded validation — tidak terhubung DB |
| Import `CategoryService` dari `MasterAttributesPage` | Digantikan stub |

### Yang masih hidup (dependency belum resolved)

| Yang masih ada | Alasan | Aksi yang diperlukan |
|---|---|---|
| `CategorySelectField.tsx` | Backend masih kirim `fieldType: 'category-select'` | Backend hapus field ini, ganti dengan ProductType selector |
| `formStage: 'category-specific'` | `useFormSchema` masih route via `productCategory` | Backend support `productTypeId` di schema generate |
| `productCategory` di `BackendContext` | Dikirim ke `/form-schema/generate` | Backend accept `productTypeId` langsung |
| `categoryIds` di `MasterAttribute` | Attribute scoping masih pakai category IDs | Backend migrate ke `productTypeIds` |

---

## 1. Hapus Endpoints product_categories

Frontend tidak lagi memanggil endpoint-endpoint ini. Tambahkan `@Deprecated` + `@Hidden` dulu, hapus setelah satu sprint.

### `ProductCategoryAdminController`

```java
@Deprecated(since = "2026-06-16", forRemoval = true)
@Hidden
@GetMapping
public Mono<List<ProductCategoryDto>> getTree(...) { ... }

@Deprecated(since = "2026-06-16", forRemoval = true)
@Hidden
@PostMapping
public Mono<ProductCategoryDto> create(...) { ... }

// ... semua endpoints lainnya
```

### Endpoint slugs khusus

```
GET /admin/product-categories/slugs?organizationId=...
```

Tidak lagi dipakai oleh `CategorySelectField` (sekarang stub). Deprecate.

---

## 2. Migrasi Data: product_categories → tags pada MasterProduct

### Script one-time migration

```javascript
// Untuk setiap produk yang punya categoryId, 
// convert categoryName menjadi tag di array tags[]
db.getMongo().startSession(function(session) {
  session.startTransaction();
  try {
    // Langkah 1: ambil semua product categories
    const catMap = new Map();
    db.product_categories.find({}).forEach(cat => {
      catMap.set(cat._id.toString(), {
        name: cat.name,
        slug: cat.slug
      });
    });

    // Langkah 2: untuk setiap master product yang punya categoryId
    db.master_products.find({ categoryId: { $exists: true, $ne: null } }).forEach(product => {
      const cat = catMap.get(product.categoryId?.toString());
      if (!cat) return;
      
      // Convert category name ke tag (kebab-case)
      const tagFromCategory = cat.slug ?? cat.name.toLowerCase().replace(/\s+/g, '-');
      
      // Add tag jika belum ada
      const existingTags = product.tags ?? [];
      if (!existingTags.includes(tagFromCategory)) {
        db.master_products.updateOne(
          { _id: product._id },
          {
            $addToSet: { tags: tagFromCategory },
            $unset: { categoryId: "", categoryName: "" }
          }
        );
      } else {
        db.master_products.updateOne(
          { _id: product._id },
          { $unset: { categoryId: "", categoryName: "" } }
        );
      }
    });

    session.commitTransaction();
  } catch (e) {
    session.abortTransaction();
    throw e;
  }
});
```

**Verifikasi sebelum jalankan:**
```javascript
// Cek berapa produk yang akan termigrasi
db.master_products.countDocuments({ categoryId: { $exists: true, $ne: null } })

// Cek sample
db.master_products.findOne({ categoryId: { $exists: true } }, { name: 1, categoryId: 1, tags: 1 })
```

---

## 3. Hapus `categoryId` dari `productAttributes` (MasterProduct)

Beberapa produk lama menyimpan category slug di `productAttributes.category`. Bersihkan:

```javascript
// Setelah migration step 2 selesai
db.master_products.updateMany(
  { "productAttributes.category": { $exists: true } },
  { $unset: { "productAttributes.category": "" } }
);
```

---

## 4. Archive `product_categories` collection

Jangan drop langsung — pertahankan untuk audit 6 bulan:

```javascript
// Rename ke archive
db.product_categories.renameCollection("product_categories_archive_20260616");

// Set TTL 6 bulan pada archive
db.product_categories_archive_20260616.createIndex(
  { "updatedAt": 1 },
  { expireAfterSeconds: 15552000, name: "ttl_6months" }
);
```

---

## 5. Step 1 Schema Generation — Migrasi ke ProductType

**Ini adalah perubahan terpenting.** Saat ini `POST /ecommerce/form-schema/generate` menerima
`productCategory: string` (slug) dan me-resolve ProductType dari sana. Setelah product_categories
dihapus, slug ini tidak bisa di-resolve lagi.

### 5.1 Tambah `productTypeId` ke `FormGenerationContext`

```java
// FormGenerationContext.java
public class FormGenerationContext {
    private String userId;
    private String organizationId;
    private String userRole;
    private List<String> targetChannels;
    
    @Deprecated  // akan dihapus setelah semua client migrasi
    private String productCategory;
    
    private String productTypeId;     // NEW — primary routing parameter
    private List<String> permissions;
    // ...
}
```

### 5.2 Schema generation logic — prioritaskan `productTypeId`

```java
// FormSchemaService.java
public Mono<DynamicFormSchema> generateSchema(FormGenerationContext context) {
    // Priority: productTypeId > resolve from productCategory slug (legacy)
    Mono<String> productTypeIdMono;
    
    if (context.getProductTypeId() != null) {
        productTypeIdMono = Mono.just(context.getProductTypeId());
    } else if (context.getProductCategory() != null && !context.getProductCategory().isBlank()) {
        // Legacy path — resolve productTypeId from category slug
        // This path will be removed once all clients send productTypeId directly
        productTypeIdMono = productCategoryRepository
            .findByOrganizationIdAndSlug(context.getOrganizationId(), context.getProductCategory())
            .map(cat -> cat.getAssignedProductTypeId())
            .defaultIfEmpty(null);
    } else {
        productTypeIdMono = Mono.just(null);
    }
    
    return productTypeIdMono.flatMap(ptId -> buildSchema(context, ptId));
}
```

### 5.3 Frontend akan update `CategorySelectField` → `ProductTypeSelectField`

Setelah endpoint support `productTypeId`:

1. Ganti `CategorySelectField.tsx` stub dengan `ProductTypeSelectField.tsx` yang fetch dari `/admin/product-types`
2. Update `createBackendContext()` untuk kirim `productTypeId` bukan `productCategory`
3. Update `loadSchema(category)` menjadi `loadSchema(productTypeId)` di `useFormSchema.ts`
4. Hapus `formStage: 'category-specific'` — ganti dengan `formStage: 'type-specific'`

### 5.4 Schema response — tetap kembalikan `productTypeId`

Tidak ada perubahan di sini — backend sudah mengembalikan `productTypeId` di `BackendSchemaTopMeta`. ✅

---

## 6. Attribute Scoping — Migrasi `categoryIds` → `productTypeIds`

Saat ini `MasterAttribute` punya `applicableCategories: string[]` (category ObjectIds).
Ini dipakai untuk filter attribute per category di MasterAttributesPage dan untuk
inject `CATEGORY_SPECIFIC` attributes di Step 1.

### 6.1 Tambah `productTypeIds` ke `MasterAttributeDocument`

```java
// MasterAttributeDocument.java
@Builder.Default
@Field("applicableCategories")
@Deprecated  // akan digantikan applicableProductTypes
private List<String> applicableCategories = new ArrayList<>();

@Builder.Default
@Field("applicableProductTypes")
private List<String> applicableProductTypes = new ArrayList<>();  // NEW

// Derived scope — update logic:
// CATEGORY_SPECIFIC jika applicableProductTypes.length > 0 (baru)
// atau applicableCategories.length > 0 (lama, backward compat)
```

### 6.2 One-time migration: applicableCategories → applicableProductTypes

```javascript
// Untuk setiap attribute yang punya applicableCategories,
// cari ProductType yang di-assign ke category tersebut,
// set applicableProductTypes

db.master_attributes.find({ 
  applicableCategories: { $exists: true, $ne: [] } 
}).forEach(attr => {
  const productTypeIds = new Set();
  
  (attr.applicableCategories ?? []).forEach(catId => {
    const cat = db.product_categories.findOne({ _id: ObjectId(catId) });
    if (cat?.assignedProductTypeId) {
      productTypeIds.add(cat.assignedProductTypeId);
    }
  });
  
  if (productTypeIds.size > 0) {
    db.master_attributes.updateOne(
      { _id: attr._id },
      { $set: { applicableProductTypes: Array.from(productTypeIds) } }
    );
  }
});
```

### 6.3 Update `AttributeScope` derivation

```java
// Attribute scope setelah migrasi
AttributeScope scope = (!attribute.getApplicableProductTypes().isEmpty())
    ? AttributeScope.PRODUCT_TYPE_SPECIFIC
    : AttributeScope.GLOBAL;
```

---

## 7. Hapus `PlatformCategoryTemplateDataLoader`

Setelah product_categories di-archive:

```java
// PlatformCategoryTemplateDataLoader.java
// HAPUS class ini sepenuhnya setelah migration verified
```

Dan di application.properties:
```properties
# Disabled 2026-06-16: product_categories removed
spring.data.mongodb.auto-index-creation=true  # masih perlu untuk collections lain
```

---

## 8. Checklist Urutan Eksekusi

```
Sprint 1 — Backend preparation (SELESAI 2026-06-17):
  [x] Tambah productTypeId ke FormGenerationRequest
  [x] Schema generation: prioritaskan productTypeId > productCategory (FormSchemaService.resolveCategory)
  [ ] Deploy — test: kirim productTypeId langsung → schema load correctly
  [x] EcommerceMasterAttributeDocument.productTypeIds sudah ada (tidak perlu tambah lagi)

Sprint 2 — Data migration (SELESAI 2026-06-17):
  [x] CategoryToTagsMigration @Order(220) — auto-run on startup, migrasi categoryId → tags[]
  [x] MasterProductData.categoryId/categoryName/categoryObjectId ditandai @Deprecated
  [x] listForAdmin() diperluas: filter categoryId juga match ke tags[] (backward compat)
  [x] EcommerceMasterAttributeDocument.productTypeIds sudah dipakai (applicableCategories tidak ada)
  [ ] Verifikasi di prod: db.master_product_data.countDocuments({categoryId:{$ne:null}}) == 0

Sprint 3 — Frontend update (MENUNGGU):
  [ ] Ganti CategorySelectField stub → ProductTypeSelectField
  [ ] Update createBackendContext: kirim productTypeId bukan productCategory
  [ ] Hapus formStage 'category-specific' → 'type-specific'

Sprint 4 — Cleanup (setelah Sprint 3 verified):
  [ ] Hapus ProductCategoryAdminController (sudah @Deprecated(forRemoval=true))
  [ ] Hapus GET /admin/product-categories/slugs
  [ ] Archive product_categories: db.product_categories.renameCollection("product_categories_archive_20260617")
  [ ] Hapus PlatformCategoryTemplateDataLoader (sudah no-op)
  [ ] Hapus @Deprecated legacy path di FormSchemaService.resolveCategory
  [ ] Remove deprecated fields dari MasterProductData: categoryId, categoryName, categoryObjectId
```

### File yang diubah (Sprint 1 + 2)

| File | Perubahan |
|---|---|
| `ecommerce/formschema/dto/FormGenerationRequest.java` | Tambah `productTypeId`; `productCategory` ditandai `@Deprecated` |
| `ecommerce/formschema/service/FormSchemaService.java` | `resolveCategory()` prioritaskan `productTypeId` langsung |
| `ecommerce/formschema/service/DataDrivenSchemaGenerationService.java` | Gunakan `resolvedProductTypeId` jika sudah di-set |
| `ecommerce/admin/controller/ProductCategoryAdminController.java` | Class ditandai `@Deprecated(forRemoval=true)` |
| `ecommerce/category/loader/PlatformCategoryTemplateDataLoader.java` | Dikonversi ke no-op |
| `ecommerce/category/loader/CategoryToTagsMigration.java` | **BARU** — one-time migration @Order(220) |
| `ecommerce/masterproduct/model/entity/MasterProductData.java` | `categoryId/Name/ObjectId` ditandai `@Deprecated` |
| `ecommerce/masterproduct/service/MasterProductDataService.java` | `categoryId` filter juga match `tags[]`; `@SuppressWarnings` pada methods yang akses deprecated fields |

---

## Catatan: Mengapa `MasterAttributesPage` Masih Ada

`MasterAttributesPage` (`/omni-admin/master-attributes`) tetap ada dan tetap berfungsi
untuk mengelola attribute definitions. Yang berubah hanya cara scoping attribute ke
ProductType (bukan ke category). Setelah Sprint 3, admin akan assign attributes ke
ProductType, bukan ke platform categories.

The category sidebar di `MasterAttributesPage` saat ini menampilkan data kosong
(stub disabled). Setelah Sprint 2, sidebar akan diganti dengan ProductType sidebar.
