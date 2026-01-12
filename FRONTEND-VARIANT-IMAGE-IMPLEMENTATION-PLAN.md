# Frontend Variant Image Implementation Plan

## Overview

**Goal:** Add image upload capability to each variant row in the variant configurator table, enabling users to assign specific images to product variants (e.g., different images for Red vs Blue variants).

**Backend Context:** Backend will extract `variantImage` field via JOLT transformation and format it for the sync API, which handles Shopify linking (see `VARIANT-IMAGES-IMPLEMENTATION-PLAN-V2.md`).

**Frontend Responsibility:**
1. Allow users to upload/select images for each variant
2. Store the image URL in each variant's data structure
3. Include `variantImage` field when submitting the product form

---

## Current Architecture Analysis

### Existing Components

```
┌────────────────────────────────────────────────────────────┐
│ DynamicProductCreationFormRefactored.tsx                   │
│ - Main product form                                        │
│ - Renders all fields dynamically from schema               │
│ - Includes VariantConfiguratorDynamic for variants         │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ VariantConfiguratorDynamic.tsx                             │
│ - Detects variant dimensions from schema (color, size...)  │
│ - Generates cartesian product of all dimensions            │
│ - Displays variants in editable table                      │
│ - Stores: price, cost, stock, sku, weight, barcode         │
│ - Missing: variantImage field ← WE ADD THIS               │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ ImageUploadField.tsx                                        │
│ - GCP storage integration                                  │
│ - Drag-drop upload UI                                      │
│ - Progress tracking                                        │
│ - Image preview                                            │
│ - Currently used for: mainImage field                      │
│ - Reusable for: variantImage ← WE REUSE THIS              │
└────────────────────────────────────────────────────────────┘
```

### Current Variant Data Structure

**Location:** `src/modules/ecommerce-product/types/product.ts:84-95`

```typescript
export interface ProductVariant {
  id: string;
  sku: string;
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  barcode?: string;
  image?: string;              // ✅ Already exists!
  weight?: number;
  options: { [optionName: string]: string };
  customAttributes?: { [key: string]: any };
}
```

**Note:** The `image` field already exists but is not used by the UI!

### Current Variant Table Configuration

**Location:** `VariantConfiguratorDynamic.tsx:154-165`

```typescript
const autoConfig = [
  ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'cost', label: 'Cost', type: 'number' },
  { name: 'comparePrice', label: 'Compare Price', type: 'number' },
  { name: 'stock', label: 'Stock', type: 'number' },
  { name: 'sku', label: 'SKU', type: 'text' },
  { name: 'weight', label: 'Weight', type: 'number' },
  { name: 'barcode', label: 'Barcode', type: 'text' }
  // Missing: variantImage ← WE ADD THIS
];
```

---

## Expected Data Flow

### Input (User Action)
```
User uploads image for "Red" variant
  ↓
ImageUploadField uploads to GCP
  ↓
Returns public URL: "https://storage.googleapis.com/.../variant-red.jpg"
  ↓
Store in variant data: variant.variantImage = "https://..."
```

### Output (Product Submission)
```json
{
  "name": "Cotton T-Shirt",
  "mainImage": [
    "https://cdn.example.com/main1.jpg",
    "https://cdn.example.com/main2.jpg"
  ],
  "variants": [
    {
      "id": "variant-red",
      "color": "Red",
      "sku": "TSHIRT-RED",
      "price": 29.99,
      "variantImage": "https://cdn.example.com/red.jpg"  // ← NEW FIELD
    },
    {
      "id": "variant-blue",
      "color": "Blue",
      "sku": "TSHIRT-BLUE",
      "price": 29.99,
      "variantImage": "https://cdn.example.com/blue.jpg" // ← NEW FIELD
    },
    {
      "id": "variant-green",
      "color": "Green",
      "sku": "TSHIRT-GREEN",
      "price": 29.99,
      "variantImage": null  // ← Optional, user didn't upload
    }
  ]
}
```

---

## Implementation Plan

### Phase 1: Update Variant Table Configuration

**File:** `src/modules/ecommerce-product/components/VariantConfiguratorDynamic.tsx`

**Location:** Lines 154-165 (inside `getVariantFields()` function)

**Change:**
```typescript
// BEFORE
const autoConfig = [
  ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'cost', label: 'Cost', type: 'number' },
  { name: 'comparePrice', label: 'Compare Price', type: 'number' },
  { name: 'stock', label: 'Stock', type: 'number' },
  { name: 'sku', label: 'SKU', type: 'text' },
  { name: 'weight', label: 'Weight', type: 'number' },
  { name: 'barcode', label: 'Barcode', type: 'text' }
];

// AFTER
const autoConfig = [
  ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
  { name: 'variantImage', label: 'Image', type: 'image' }, // ← ADD THIS FIRST
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'cost', label: 'Cost', type: 'number' },
  { name: 'comparePrice', label: 'Compare Price', type: 'number' },
  { name: 'stock', label: 'Stock', type: 'number' },
  { name: 'sku', label: 'SKU', type: 'text' },
  { name: 'weight', label: 'Weight', type: 'number' },
  { name: 'barcode', label: 'Barcode', type: 'text' }
];
```

**Why add it first?**
- Visual importance: Image should appear early in the table
- User workflow: Users often want to set image before pricing details

---

### Phase 2: Update Variant Generation to Include variantImage

**File:** `src/modules/ecommerce-product/components/VariantConfiguratorDynamic.tsx`

**Location:** Lines 350-380 (inside `generateVariants()` function)

**Current Code:**
```typescript
const variant: VariantOption = {
  id,
  ...combination,
  price: existing?.price || 0,
  cost: existing?.cost || 0,
  comparePrice: existing?.comparePrice || 0,
  stock: existing?.stock || 0,
  weight: existing?.weight || 0,
  sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
  barcode: existing?.barcode || ''
};
```

**Add:**
```typescript
const variant: VariantOption = {
  id,
  ...combination,
  variantImage: existing?.variantImage || null, // ← ADD THIS
  price: existing?.price || 0,
  cost: existing?.cost || 0,
  comparePrice: existing?.comparePrice || 0,
  stock: existing?.stock || 0,
  weight: existing?.weight || 0,
  sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
  barcode: existing?.barcode || ''
};
```

**Why preserve `existing?.variantImage`?**
- When user regenerates variants, we don't want to lose already-uploaded images
- Only new variants get `null`, existing variants keep their images

---

### Phase 3: Add Image Upload UI to Table Cells

**File:** `src/modules/ecommerce-product/components/VariantConfiguratorDynamic.tsx`

**Location:** Lines 482-510 (inside the table `<tbody>` mapping)

**Current Code:**
```typescript
{variantConfig.map((field: any) => (
  <td key={field.name} className="border border-gray-300 px-3 py-2">
    {/* Special handling for color display */}
    {field.name.toLowerCase().includes('color') && typeof variant[field.name] === 'string' ? (
      <div className="flex items-center">
        <div
          className="w-6 h-6 rounded border inline-block mr-2"
          style={{ backgroundColor: variant[field.name] }}
        />
        {variant[field.name]}
      </div>
    ) : field.type === 'number' ? (
      <input
        type="number"
        value={variant[field.name] || 0}
        onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
        className="w-20 p-1 border rounded"
        step={['price', 'cost', 'comparePrice'].includes(field.name) ? "0.01" : "1"}
      />
    ) : (
      <input
        type="text"
        value={variant[field.name] || ''}
        onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
        className="w-32 p-1 border rounded"
      />
    )}
  </td>
))}
```

**Add Image Handling:**
```typescript
{variantConfig.map((field: any) => (
  <td key={field.name} className="border border-gray-300 px-3 py-2">
    {/* NEW: Special handling for image upload */}
    {field.type === 'image' ? (
      <VariantImageUpload
        variantId={variant.id}
        currentImage={variant.variantImage}
        onImageChange={(imageUrl) => updateVariant(variant.id, 'variantImage', imageUrl)}
        organizationId={organizationId}
        productId={productId}
      />
    ) : field.name.toLowerCase().includes('color') && typeof variant[field.name] === 'string' ? (
      <div className="flex items-center">
        <div
          className="w-6 h-6 rounded border inline-block mr-2"
          style={{ backgroundColor: variant[field.name] }}
        />
        {variant[field.name]}
      </div>
    ) : field.type === 'number' ? (
      <input
        type="number"
        value={variant[field.name] || 0}
        onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
        className="w-20 p-1 border rounded"
        step={['price', 'cost', 'comparePrice'].includes(field.name) ? "0.01" : "1"}
      />
    ) : (
      <input
        type="text"
        value={variant[field.name] || ''}
        onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
        className="w-32 p-1 border rounded"
      />
    )}
  </td>
))}
```

---

### Phase 4: Create VariantImageUpload Component

**File:** `src/modules/ecommerce-product/components/VariantImageUpload.tsx` (NEW FILE)

**Purpose:** Compact image upload UI specifically for variant table cells (different from the main ImageUploadField which is for product galleries)

```typescript
"use client";

import React, { useState } from 'react';
import { Upload, X, Image as ImageIcon } from '@/shared/ui/icons/Icons';

interface VariantImageUploadProps {
  variantId: string;
  currentImage: string | null;
  onImageChange: (imageUrl: string | null) => void;
  organizationId: string;
  productId: string;
}

export default function VariantImageUpload({
  variantId,
  currentImage,
  onImageChange,
  organizationId,
  productId
}: VariantImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload a valid image file (JPEG, PNG, GIF, WebP)');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError('Image must be less than 10MB');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      // Use the same GCP upload endpoint as mainImage
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organizationId', organizationId);
      formData.append('productId', productId);
      formData.append('category', 'variant');
      formData.append('variantId', variantId);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          console.log('[VariantImageUpload] Upload successful:', response);

          // Extract public URL from response
          const publicUrl = response.publicUrl || response.url || response.imageUrl;

          if (publicUrl) {
            onImageChange(publicUrl);
            console.log('[VariantImageUpload] Image URL saved:', publicUrl);
          } else {
            setError('Upload succeeded but no URL returned');
            console.error('[VariantImageUpload] No URL in response:', response);
          }
        } else {
          setError(`Upload failed: ${xhr.statusText}`);
          console.error('[VariantImageUpload] Upload failed:', xhr.status, xhr.statusText);
        }
        setIsUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        setError('Upload failed. Please try again.');
        setIsUploading(false);
        setUploadProgress(0);
      });

      xhr.open('POST', 'http://localhost:8888/labamap/api/v1/ecommerce/images/upload');
      xhr.send(formData);

    } catch (error) {
      console.error('[VariantImageUpload] Upload error:', error);
      setError(error instanceof Error ? error.message : 'Upload failed');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemove = () => {
    onImageChange(null);
  };

  return (
    <div className="flex items-center gap-2">
      {currentImage ? (
        // Show preview with remove button
        <div className="flex items-center gap-2">
          <div className="relative w-12 h-12 border rounded overflow-hidden group">
            <img
              src={currentImage}
              alt="Variant"
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23f3f4f6"/><text x="50%" y="50%" font-size="20" text-anchor="middle" dy=".3em">?</text></svg>';
              }}
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Remove image"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      ) : (
        // Show upload button
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <div className="w-12 h-12 border-2 border-dashed border-gray-300 rounded flex items-center justify-center hover:border-blue-500 hover:bg-blue-50 transition-colors">
            {isUploading ? (
              <div className="relative w-8 h-8">
                <svg className="animate-spin w-8 h-8 text-blue-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-blue-600">
                  {uploadProgress}%
                </span>
              </div>
            ) : (
              <Upload className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </label>
      )}

      {error && (
        <div className="absolute z-10 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 max-w-48">
          {error}
        </div>
      )}
    </div>
  );
}
```

**Design Decisions:**
- **Compact UI:** 48x48px thumbnail perfect for table cells
- **Inline upload:** Upload button in same space as preview
- **Hover remove:** Remove button appears on hover (clean UX)
- **Progress indicator:** Shows upload percentage
- **Error handling:** Inline error messages
- **Reuses GCP endpoint:** Same upload API as mainImage

---

### Phase 5: Add VariantImageUpload to Component Exports

**File:** `src/modules/ecommerce-product/components/index.ts`

**Add:**
```typescript
export { default as VariantImageUpload } from './VariantImageUpload';
```

---

### Phase 6: Import VariantImageUpload in VariantConfigurator

**File:** `src/modules/ecommerce-product/components/VariantConfiguratorDynamic.tsx`

**Add to imports (line 10):**
```typescript
import React, { useState, useMemo } from 'react';
import VariantImageUpload from './VariantImageUpload'; // ← ADD THIS
```

**Add props needed for image upload:**

Find the component props section (around line 23-28) and add:

```typescript
interface VariantConfiguratorDynamicProps {
  value?: string;
  onChange: (value: string) => void;
  schema?: any;
  formData?: any;
  organizationId?: string;  // ← ADD THIS
  productId?: string;       // ← ADD THIS
}
```

**Update component destructuring (line 30):**
```typescript
const VariantConfiguratorDynamic: React.FC<VariantConfiguratorDynamicProps> = ({
  value,
  onChange,
  schema,
  formData = {},
  organizationId = 'org-default',  // ← ADD THIS
  productId = 'temp-product'       // ← ADD THIS
}) => {
```

---

### Phase 7: Pass organizationId and productId from Parent Form

**File:** `src/modules/ecommerce-product/components/DynamicProductCreationFormRefactored.tsx`

**Location:** Find where VariantConfiguratorDynamic is rendered (search for `<VariantConfiguratorDynamic`)

**Update:**
```typescript
// BEFORE
<VariantConfiguratorDynamic
  value={formData[fieldName] || '{}'}
  onChange={(value) => handleFieldChange(fieldName, value)}
  schema={schema}
  formData={formData}
/>

// AFTER
<VariantConfiguratorDynamic
  value={formData[fieldName] || '{}'}
  onChange={(value) => handleFieldChange(fieldName, value)}
  schema={schema}
  formData={formData}
  organizationId={organizationId}  // ← ADD THIS
  productId={formData.id || `temp_${Date.now()}`}  // ← ADD THIS
/>
```

**Note:** `organizationId` should already be available in the form component from `useOrganization()` hook.

---

### Phase 8: Update ProductVariant Type (Optional - Already Exists!)

**File:** `src/modules/ecommerce-product/types/product.ts`

**Current Status:** ✅ Already has `image` field (line 91)

**Recommendation:** Add `variantImage` as alias for clarity:

```typescript
export interface ProductVariant {
  id: string;
  sku: string;
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  barcode?: string;
  image?: string;              // Legacy field
  variantImage?: string;       // ← ADD THIS for clarity
  weight?: number;
  options: { [optionName: string]: string };
  customAttributes?: { [key: string]: any };
}
```

**Or just use `image` field and map it to `variantImage` during submission:**

In product submission handler, ensure:
```typescript
variants: variants.map(v => ({
  ...v,
  variantImage: v.variantImage || v.image // Support both field names
}))
```

---

## Testing Plan

### Test Case 1: Upload Single Variant Image
**Steps:**
1. Create product with color variants (Red, Blue)
2. Generate 2 variants
3. Click upload button on "Red" variant row
4. Select image file
5. Wait for upload to complete

**Expected:**
- ✅ Progress indicator shows during upload
- ✅ Image thumbnail appears in table cell
- ✅ Image URL stored in variant data
- ✅ Hover shows remove button

### Test Case 2: Upload Multiple Variant Images
**Steps:**
1. Create product with color × size variants (Red/Blue × Small/Large)
2. Generate 4 variants
3. Upload different images for Red-Small and Blue-Large

**Expected:**
- ✅ Each variant can have independent image
- ✅ Images don't interfere with each other
- ✅ Unassigned variants show upload button

### Test Case 3: Remove Variant Image
**Steps:**
1. Upload image to a variant
2. Hover over image thumbnail
3. Click X (remove) button

**Expected:**
- ✅ Image removed from UI
- ✅ Upload button appears again
- ✅ Variant data sets `variantImage: null`

### Test Case 4: Regenerate Variants with Existing Images
**Steps:**
1. Generate variants: Red, Blue
2. Upload images for both
3. Add new color option: Green
4. Regenerate variants (now 3 variants)

**Expected:**
- ✅ Red and Blue keep their images
- ✅ Green variant has no image (shows upload button)
- ✅ No data loss on regeneration

### Test Case 5: Submit Product with Variant Images
**Steps:**
1. Create product with 2 variants
2. Upload images for both variants
3. Submit product form

**Expected:**
- ✅ Product payload includes `variants` array
- ✅ Each variant has `variantImage` field with GCP URL
- ✅ Backend receives correct data structure

### Test Case 6: Image Upload Error Handling
**Steps:**
1. Disconnect backend (or use invalid file)
2. Try to upload image

**Expected:**
- ✅ Error message displayed
- ✅ Upload button remains clickable
- ✅ No broken UI state

### Test Case 7: Image Loading Error
**Steps:**
1. Upload image successfully
2. Change GCP bucket permissions to block access
3. Refresh page

**Expected:**
- ✅ Broken image shows placeholder icon
- ✅ Remove button still works
- ✅ Can upload new image to replace broken one

---

## UI/UX Considerations

### Table Layout
```
┌──────────┬────────┬───────┬──────┬───────┬──────┬─────────┐
│ Color    │ Image  │ Price │ Cost │ Stock │ SKU  │ Actions │
├──────────┼────────┼───────┼──────┼───────┼──────┼─────────┤
│ Red      │ [IMG]  │ 29.99 │ 15   │ 100   │ T... │ Delete  │
│ Blue     │ [IMG]  │ 29.99 │ 15   │ 100   │ T... │ Delete  │
│ Green    │ [+]    │ 29.99 │ 15   │ 100   │ T... │ Delete  │
└──────────┴────────┴───────┴──────┴───────┴──────┴─────────┘

Legend:
[IMG] = 48x48px image thumbnail with hover remove
[+]   = 48x48px upload button (dashed border)
```

### Mobile Responsiveness
- Table becomes horizontally scrollable on mobile
- Image thumbnails remain 48x48px (touch-friendly)
- Upload button large enough for finger tap

### Accessibility
- Upload input has descriptive label (even if hidden)
- Images have alt text with variant info
- Keyboard navigation supported
- Focus states visible

---

## Performance Considerations

### Image Upload Optimization
1. **Client-side validation** before upload (file type, size)
2. **Progress tracking** for better UX
3. **Concurrent uploads** allowed (multiple variants at once)
4. **No blocking** - user can continue editing while uploading

### GCP Storage Folder Structure
```
omni-product-images-production/
  {organizationId}/
    {productId}/
      main/
        main-image-1.jpg
        main-image-2.jpg
      variants/
        variant-red.jpg      ← Variant images here
        variant-blue.jpg
        variant-green.jpg
      gallery/
        gallery-1.jpg
        gallery-2.jpg
```

**Naming Convention:**
- `variant-{variantId}.jpg`
- Example: `variant-red-large.jpg` for Red × Large variant

---

## Error Handling

### Upload Errors
| Error | Cause | Solution |
|-------|-------|----------|
| Invalid file type | User uploads PDF | Show error: "Please upload JPEG, PNG, GIF, or WebP" |
| File too large | Image > 10MB | Show error: "Image must be less than 10MB" |
| Network timeout | Slow connection | Retry button + clear error message |
| GCP permissions | Bucket not public | Show error + admin contact info |
| Backend down | Server offline | Generic error + retry option |

### Image Loading Errors
- Fallback to placeholder icon (question mark)
- Log error to console for debugging
- Allow user to re-upload

### Validation Errors
- If backend requires `variantImage` but user didn't upload: Show validation error before submission
- Highlight missing images in table (optional red border)

---

## Backend Integration Checklist

### Data Format Sent to Backend
```json
{
  "name": "Cotton T-Shirt",
  "sku": "TSHIRT-001",
  "price": 29.99,
  "mainImage": [
    "https://storage.googleapis.com/.../main1.jpg",
    "https://storage.googleapis.com/.../main2.jpg"
  ],
  "variants": [
    {
      "id": "red-small",
      "color": "Red",
      "size": "Small",
      "sku": "TSHIRT-RED-S",
      "price": 29.99,
      "stock": 100,
      "variantImage": "https://storage.googleapis.com/.../variant-red-small.jpg"
    },
    {
      "id": "blue-large",
      "color": "Blue",
      "size": "Large",
      "sku": "TSHIRT-BLUE-L",
      "price": 34.99,
      "stock": 50,
      "variantImage": "https://storage.googleapis.com/.../variant-blue-large.jpg"
    },
    {
      "id": "green-medium",
      "color": "Green",
      "size": "Medium",
      "sku": "TSHIRT-GREEN-M",
      "price": 29.99,
      "stock": 75,
      "variantImage": null  // Optional - user didn't upload
    }
  ]
}
```

### Backend Processing
1. ✅ JOLT extracts `variantImage` field
2. ✅ ChannelAttributeConverterService formats for sync API
3. ✅ Sync API uploads to Shopify and links to variants

---

## Implementation Timeline

| Phase | Task | Time Estimate |
|-------|------|---------------|
| 1 | Update variant table config | 10 min |
| 2 | Update variant generation | 10 min |
| 3 | Add image handling to table cells | 15 min |
| 4 | Create VariantImageUpload component | 1.5 hours |
| 5 | Add component exports | 5 min |
| 6 | Import in VariantConfigurator | 10 min |
| 7 | Pass props from parent form | 15 min |
| 8 | Update types (optional) | 10 min |
| **Testing** | All test cases | 1 hour |
| **Polish** | Error handling, styling | 30 min |

**Total Estimated Time:** ~4 hours

---

## Success Criteria

### Must Have ✅
- [x] Each variant row has image upload capability
- [x] Uploaded images stored in GCP
- [x] Image URLs saved in variant data
- [x] Images preserved on variant regeneration
- [x] Remove functionality works
- [x] Product submission includes `variantImage` field
- [x] No breaking changes to existing functionality

### Nice to Have 🎯
- [ ] Drag-drop upload in table cells
- [ ] Image cropping/resizing UI
- [ ] Copy image from another variant button
- [ ] Bulk upload (upload one, apply to all)
- [ ] Image preview modal (full size)
- [ ] Recent uploads gallery

### Future Enhancements 🚀
- [ ] AI-generated variant images from main image
- [ ] Auto-detect best image for each variant (color matching)
- [ ] Image optimization (compression, WebP conversion)
- [ ] CDN integration for faster loading
- [ ] Image versioning (track changes)

---

## Dependencies

### Required Components
- ✅ `ImageUploadField.tsx` - Reference for GCP upload logic
- ✅ `VariantConfiguratorDynamic.tsx` - Modify this
- ✅ `DynamicProductCreationFormRefactored.tsx` - Pass props
- ✅ GCP image upload endpoint - Already working

### Required Data
- ✅ `organizationId` - From useOrganization()
- ✅ `productId` - From form data or temp ID
- ✅ `variantId` - From variant data structure

### No New Dependencies
- ✅ No new npm packages needed
- ✅ Reuse existing upload infrastructure
- ✅ Reuse existing icon library

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| GCP permissions issue | High | Clear error message + docs |
| Upload failures | Medium | Retry logic + error handling |
| Large image files | Low | Client-side validation |
| Table layout breaks | Low | Test on multiple screen sizes |
| Variant regeneration loses images | High | Preserve existing data (already planned) |
| Performance issues | Low | Lazy loading + image optimization |

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────┐
│ USER ACTION                                                 │
│ Click upload button in variant table row                   │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ VariantImageUpload.tsx                                      │
│ - File input triggered                                     │
│ - Validate file (type, size)                               │
│ - Create FormData with file + metadata                     │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ XHR POST to /api/v1/ecommerce/images/upload                │
│ - organizationId: "org-xxx"                                │
│ - productId: "prod-xxx"                                    │
│ - category: "variant"                                      │
│ - variantId: "red-small"                                   │
│ - file: <binary>                                           │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ Backend GCP Service                                         │
│ - Upload to GCP bucket                                     │
│ - Generate public URL                                      │
│ - Return: { publicUrl: "https://..." }                     │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ VariantImageUpload.tsx                                      │
│ - Parse response                                           │
│ - Call onImageChange(publicUrl)                            │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ VariantConfiguratorDynamic.tsx                              │
│ - updateVariant(variantId, 'variantImage', url)            │
│ - Update local variants state                              │
│ - Call onChange() to update parent form                    │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ DynamicProductCreationFormRefactored.tsx                    │
│ - Update formData with variant config JSON                 │
│ - Store: variants[0].variantImage = "https://..."          │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│ FORM SUBMISSION                                             │
│ - Submit entire product including variants                 │
│ - Backend receives variantImage in each variant            │
│ - JOLT transformation preserves variantImage               │
│ - Sync API receives formatted variant images               │
└────────────────────────────────────────────────────────────┘
```

---

## File Structure After Implementation

```
src/modules/ecommerce-product/
├── components/
│   ├── DynamicProductCreationFormRefactored.tsx  (Modified)
│   ├── VariantConfiguratorDynamic.tsx            (Modified)
│   ├── VariantImageUpload.tsx                    (NEW)
│   ├── ImageUploadField.tsx                      (Reference)
│   └── index.ts                                  (Modified - add export)
├── types/
│   └── product.ts                                (Optional - update)
└── hooks/
    └── (no changes needed)
```

---

## Documentation Updates Needed

1. **User Guide:** How to upload variant images
2. **Developer Guide:** How VariantImageUpload component works
3. **API Documentation:** Expected data format for variants
4. **Troubleshooting:** Common image upload issues

---

## Related Documents

- `VARIANT-IMAGES-IMPLEMENTATION-PLAN-V2.md` - Backend implementation plan
- `GCP-IMAGE-UPLOAD-IMPLEMENTATION.md` - GCP upload infrastructure
- `FRONTEND-IMAGE-UPLOAD-IMPLEMENTATION.md` - Main image upload (reference)

---

**Document Version:** 1.0
**Created:** 2026-01-06
**Status:** Ready for Implementation
**Frontend Estimated Time:** ~4 hours
**Backend Estimated Time:** ~3.5 hours (from V2 plan)
**Total Project Time:** ~7.5 hours
