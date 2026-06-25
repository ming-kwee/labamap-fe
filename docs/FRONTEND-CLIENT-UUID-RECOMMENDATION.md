# Frontend: Client-Assigned UUID Migration

**Tanggal**: 2026-06-25  
**Prioritas**: High — menyebabkan data channel Step 2 dari create flow hilang saat masuk edit mode  
**Backend status**: Sudah diimplementasikan — siap menerima `context.productId`

---

## Masalah yang Terjadi Saat Ini

### Root Cause

Frontend men-generate temp ID (`prod_${Date.now()}`) sebelum backend merespons, lalu menggunakannya di Step 2. Backend menyimpan produk dengan UUID yang berbeda sebagai `_id`.

```
master_product_data._id         = "552af770-154d-48b8-a5f9-0898f4349ebf"  ← UUID backend
channel_product_data.masterProductId = "prod_1782357214818"               ← temp ID frontend
                                                                           ← TIDAK TERHUBUNG
```

### Dampak

| Flow | Masalah |
|---|---|
| Create → Step 2 → save | `channel_product_data` tersimpan dengan `masterProductId = "prod_..."` |
| My Products → Edit → Step 2 | Backend buat `channel_product_data` baru dengan UUID → **data create flow hilang** |
| Publish dari create flow | Gagal jika publish pipeline lookup by real `_id` |

---

## Solusi: Client-Assigned UUID

Frontend generate UUID v4 **satu kali** di awal create flow, kirim ke backend sebagai `context.productId`. Backend menyimpan UUID ini sebagai `master_product_data._id`. Semua call berikutnya pakai UUID yang sama.

```
Frontend generate: "552af770-154d-48b8-a5f9-0898f4349ebf"
           ↓
POST /dynamic-products/create  { context: { productId: "552af770..." } }
           ↓
master_product_data._id              = "552af770..."  ← SAMA
channel_product_data.masterProductId = "552af770..."  ← SAMA
```

---

## Perubahan yang Diperlukan di Frontend

### 1. Install UUID Library (jika belum ada)

```bash
npm install uuid
npm install --save-dev @types/uuid  # untuk TypeScript
```

### 2. Generate UUID di awal create flow

Di mana pun product creation dimulai (misal `ProductCreatePage` atau `useProductCreate` hook):

```typescript
import { v4 as uuidv4 } from 'uuid';

// Generate SEKALI saat user mulai create product
// Simpan di state/context agar konsisten di seluruh flow
const productId = uuidv4();  // "552af770-154d-48b8-a5f9-0898f4349ebf"

// Bukan ini lagi:
// const tempId = `prod_${Date.now()}`;  ← HAPUS
```

### 3. Kirim ke backend saat create

```typescript
// POST /api/v1/ecommerce/dynamic-products/create
const response = await createProduct({
  context: {
    productId,          // ← TAMBAHKAN INI
    userId,
    organizationId,
    productCategory,
  },
  productData: { ... }
});

// Backend akan return productId yang SAMA dengan yang dikirim
// response.productId === productId  ← selalu true
```

### 4. Gunakan UUID yang sama untuk Step 2

```typescript
// POST /api/v1/ecommerce/form-schema/channel-step
const schema = await fetchChannelStepSchema({
  masterProductId: productId,  // ← UUID yang sama, BUKAN temp ID
  organizationId,
});

// POST /api/v1/ecommerce/channel-product-data/save
await saveChannelData({
  masterProductId: productId,  // ← UUID yang sama
  storeId,
  channelData: { ... },
});
```

### 5. Hapus pola lama

```typescript
// HAPUS semua pola ini:
const tempId = `prod_${Date.now()}`;
const tempId = `product_${timestamp}`;
const tempId = `temp_${Math.random()}`;

// Ganti dengan UUID dari langkah 2
```

---

## Contoh Implementasi Lengkap

```typescript
// hooks/useProductCreate.ts
import { v4 as uuidv4 } from 'uuid';
import { useState } from 'react';

export function useProductCreate(organizationId: string) {
  // UUID di-generate sekali saat hook di-inisialisasi
  const [productId] = useState(() => uuidv4());

  async function createProduct(productData: ProductData) {
    const response = await api.post('/ecommerce/dynamic-products/create', {
      context: {
        productId,        // ← client-assigned UUID
        organizationId,
        userId: currentUser.id,
      },
      productData,
    });
    // response.productId === productId — selalu konsisten
    return response;
  }

  async function loadChannelStep(storeId: string) {
    return api.post('/ecommerce/form-schema/channel-step', {
      masterProductId: productId,  // ← UUID yang sama
      organizationId,
    });
  }

  async function saveChannelData(storeId: string, data: ChannelData) {
    return api.post('/ecommerce/channel-product-data/save', {
      masterProductId: productId,  // ← UUID yang sama
      storeId,
      channelData: data,
    });
  }

  return { productId, createProduct, loadChannelStep, saveChannelData };
}
```

---

## Behaviour Backend Setelah Fix

### Validasi UUID

Backend menerima `context.productId` dan memvalidasinya:

```
✓ "552af770-154d-48b8-a5f9-0898f4349ebf"  → diterima, dipakai sebagai _id
✓ "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  → diterima
✗ "prod_1782357214818"                    → ditolak, backend generate UUID baru + log warning
✗ null / kosong                           → backend generate UUID baru (backward compatible)
```

### Idempotency (Retry Aman)

Jika frontend mengirim request yang sama dua kali (retry karena network error):

```
Request 1: { context: { productId: "552af770..." } } → product CREATED
Request 2: { context: { productId: "552af770..." } } → product sudah ada, RETURN existing
                                                      → tidak duplicate
```

---

## Apa yang TIDAK Perlu Diubah

- `GET /admin/master-products/{productId}` — sudah pakai UUID dari My Products list
- `PUT /admin/master-products/{productId}` — sudah pakai UUID dari URL path
- Edit mode dari My Products — sudah benar, pakai real `_id`
- Publish flow — sudah benar jika `masterProductId` sudah UUID

---

## Verifikasi Setelah Fix

1. Buka console browser, pantau network requests
2. Buat produk baru → pastikan request body berisi `context.productId = "some-uuid-v4"`
3. Di Step 2, simpan channel data → cek `channel_product_data` di MongoDB
4. Buka edit dari My Products → cek `channel_product_data` di MongoDB
5. **Expected**: kedua step pakai UUID yang sama di `masterProductId`

```
MongoDB setelah fix:
  master_product_data._id         = "552af770-..."
  channel_product_data (create)   = { masterProductId: "552af770-..." }  ← SAMA
  channel_product_data (edit)     = { masterProductId: "552af770-..." }  ← SAMA (1 dokumen)
```
