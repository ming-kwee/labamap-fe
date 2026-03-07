# Backend Recommendation — Master Product Multi-Image Gallery

**Date:** 2026-03-07
**From:** Frontend Team
**To:** Backend Team
**Priority:** High
**Status:** Action Required

---

## Context

The master product creation form (Step 1 of the ecommerce-product-v2 wizard) currently exposes only a single `mainImage` field in the media section. In a real omnichannel platform, a master product requires a gallery of multiple images — different angles, lifestyle shots, detail images — that are then distributed to each connected channel.

The frontend `ImageUploadField` component already supports multi-upload when `multiple={true}`. The `MasterProduct` TypeScript type already declares `galleryImages?: string[]`. The product mapper already handles `galleryImages` as an array. The only missing piece is the **backend schema exposing `galleryImages` as a field** in the form schema response.

Additionally, during this investigation, two schema bugs were discovered and should be tracked.

---

## 1. Add `galleryImages` Field to Master Attribute Document

### What to add

In `master-attributes-ecommerce.json` (or the equivalent MongoDB attribute document), add a second image field under section `media`:

```json
{
  "fieldName": "galleryImages",
  "fieldType": "IMAGE",
  "label": "Product Gallery",
  "section": "media",
  "displayLevel": "basic",
  "required": false,
  "readOnly": false,
  "multiple": true,
  "validationRules": {
    "maxItems": 10
  },
  "helpText": "Additional product images (angles, lifestyle, detail shots). Up to 10 images.",
  "order": 101
}
```

### Why `maxItems: 10`

`FieldRenderer` reads `field.validationRules?.maxItems` and passes it as `maxImages` to `ImageUploadField`. Setting `maxItems: 10` enforces the limit in the UI automatically without any frontend code change.

### Why `multiple: true`

`FieldRenderer` now reads `field.multiple` first (before falling back to type-based detection). Explicitly setting `multiple: true` makes the intent clear and is future-proof if the field type ever changes.

### Field order relative to `mainImage`

Recommended ordering in media section:

| order | fieldName      | label            | type  | multiple | required |
|-------|----------------|------------------|-------|----------|----------|
| 100   | `mainImage`    | Main Image       | IMAGE | false    | true     |
| 101   | `galleryImages`| Product Gallery  | IMAGE | true     | false    |

---

## 2. Fix `mainImage` Field Definition

### Current issues (already fixed by backend, confirm they are deployed)

| Issue | Original value | Correct value | Impact |
|-------|---------------|---------------|--------|
| `fieldType` | `"media"` | `"IMAGE"` | Field fell through to plain text input — upload UI never rendered |
| `readOnly` | `true` | `false` | Upload zone rendered as disabled — clicking had no effect |

### Recommended final `mainImage` definition

```json
{
  "fieldName": "mainImage",
  "fieldType": "IMAGE",
  "label": "Main Image",
  "section": "media",
  "displayLevel": "essential",
  "required": true,
  "readOnly": false,
  "multiple": false,
  "validationRules": {
    "maxItems": 1
  },
  "helpText": "Primary product image used as thumbnail across all channels. Max 10MB. JPEG, PNG, WEBP, GIF.",
  "order": 100
}
```

Setting `multiple: false` and `maxItems: 1` makes the single-image intent explicit in the schema rather than relying on type inference.

---

## 3. Add `multiple` Property Support to Schema Generation Service

### What frontend now supports

The `FormField` TypeScript interface (in `form-schema.ts`) now declares:

```typescript
interface FormField {
  // ... existing fields ...
  multiple?: boolean;   // NEW — explicitly marks multi-value image/file fields
}
```

`FieldRenderer` resolves `multiple` with this priority:

```typescript
multiple = field.multiple              // 1. Explicit schema value (highest priority)
        ?? (fieldType === 'media')     // 2. Type-based fallback for 'media'
        ?? (fieldType === 'file')      // 3. Type-based fallback for 'file'
        ?? (fieldType === 'image'      // 4. Image type with maxItems > 1
             && (field.validationRules?.maxItems ?? 1) > 1)
```

### Backend action required

Ensure `DataDrivenSchemaGenerationService` (or whichever service builds `ChannelFormField` / `FormFieldDefinition` objects) serialises the `multiple` boolean from the attribute document into the JSON response. If the service currently ignores unknown attributes, add explicit mapping:

**Java (example):**
```java
// In FormFieldBuilder or equivalent
if (attribute.getMultiple() != null) {
    field.setMultiple(attribute.getMultiple());
}
```

**MongoDB attribute document field:**
```json
"multiple": true
```

**Schema API response field (for frontend to receive):**
```json
{
  "fieldName": "galleryImages",
  "fieldType": "IMAGE",
  "multiple": true,
  "validationRules": { "maxItems": 10 },
  ...
}
```

---

## 4. Fix `fieldType` Mapping in Schema Generation Service

### Issue

`DataDrivenSchemaGenerationService.java` was missing the `"image"` case in its `fieldType` switch, causing IMAGE fields to fall through to `FormFieldType.TEXT`. The fix needed is:

```java
case "image" -> FormFieldType.IMAGE;
case "IMAGE" -> FormFieldType.IMAGE;
```

**Status:** Backend team reported this was fixed. Please confirm it is deployed to the development environment and that the schema API now returns `"fieldType": "IMAGE"` (case-insensitive, frontend normalises with `.toLowerCase()`).

---

## 5. Recommended GCP Storage Folder Structure Update

To cleanly separate main image from gallery images in GCP, update the storage path convention for gallery uploads. The current `imageType` parameter drives the filename prefix. Recommend accepting `"gallery"` as a valid `imageType` and storing under:

```
organizations/{orgId}/products/{productId}/
  main-{timestamp}-{uuid}.jpg         ← mainImage
  gallery-1-{timestamp}-{uuid}.jpg    ← galleryImages[0]
  gallery-2-{timestamp}-{uuid}.jpg    ← galleryImages[1]
  ...
  thumbnails/
    thumb-main-{timestamp}-{uuid}.jpg
    thumb-gallery-1-{timestamp}-{uuid}.jpg
```

This structure is already documented in `MEDIA-MODULE-COMPLETE-GUIDE.md`. Confirm the backend `MediaUploadService` generates gallery filenames when `imageType=gallery` is passed by the frontend.

---

## 6. MasterProduct API — Accept `galleryImages` Array

When the frontend submits the master product form, the payload will include:

```json
{
  "name": "Cotton T-Shirt",
  "sku": "TSHIRT-001",
  "mainImage": "https://storage.googleapis.com/.../main-xxx.jpg",
  "galleryImages": [
    "https://storage.googleapis.com/.../gallery-1-xxx.jpg",
    "https://storage.googleapis.com/.../gallery-2-xxx.jpg",
    "https://storage.googleapis.com/.../gallery-3-xxx.jpg"
  ],
  ...
}
```

Ensure the `EcommerceMasterProduct` (or equivalent MongoDB document) persists `galleryImages` as a `List<String>`. This field already exists in the frontend type (`galleryImages?: string[]`) and the product mapper handles it. Confirm the backend API controller and service layer also accept and store it.

---

## 7. Summary of Required Backend Changes

| # | Component | Change | Priority |
|---|-----------|--------|----------|
| 1 | `master-attributes-ecommerce.json` | Add `galleryImages` field with `fieldType: "IMAGE"`, `multiple: true`, `maxItems: 10` | **High** |
| 2 | `master-attributes-ecommerce.json` | Set `mainImage.multiple: false` and `mainImage.maxItems: 1` explicitly | Medium |
| 3 | `DataDrivenSchemaGenerationService` | Serialise `multiple` boolean into schema API response | **High** |
| 4 | `DataDrivenSchemaGenerationService` | Confirm `"image"` → `FormFieldType.IMAGE` mapping is deployed | **High** |
| 5 | `DataDrivenSchemaGenerationService` | Confirm `readOnly: false` for IMAGE/FILE types is deployed | **High** |
| 6 | `MediaUploadService` | Confirm `imageType=gallery` generates `gallery-N-` filename prefix | Low |
| 7 | Master Product API / MongoDB | Confirm `galleryImages: List<String>` is persisted in `EcommerceMasterProduct` | **High** |

---

## 8. How Frontend Will Behave After These Changes

### Before (current)

- Media section shows **1 field**: `mainImage` — single image only
- `galleryImages` never rendered (field not in schema)

### After backend deploys changes

- Media section shows **2 fields**:
  - `mainImage` — single image upload, required, renders with "Main" badge
  - `galleryImages` — multi-image upload, optional, up to 10 images in a grid
- No frontend code changes required — `FieldRenderer` already handles the `multiple` and `maxItems` properties
- Product submission payload automatically includes both fields

### Field rendering logic (already in `FieldRenderer.tsx`)

```tsx
// FieldRenderer.tsx line 89 — already updated
multiple={
  field.multiple ??
  (fieldType === 'media' || fieldType === 'file' ||
   (fieldType === 'image' && (field.validationRules?.maxItems ?? 1) > 1))
}
```

---

## 9. No Frontend Changes Needed After Backend Deploys

All frontend changes for this feature are **already complete**:

| File | Change | Status |
|------|--------|--------|
| `types/form-schema.ts` | Added `multiple?: boolean` to `FormField` | Done |
| `FieldRenderer.tsx` | Multi-source `multiple` resolution | Done |
| `product-mapper.ts` | Handles `galleryImages` array from schema fields | Done |
| `product-mapper.ts` | Handles `mainImage` arriving as array (graceful fallback) | Done |
| `ImageUploadField.tsx` | Fixed unclickable upload zone (`<label htmlFor>` pattern) | Done |

---

## 10. Testing Checklist (Post-Backend Deployment)

- [ ] Schema API returns `galleryImages` field in media section
- [ ] `galleryImages.fieldType` is `"IMAGE"` (or `"image"`)
- [ ] `galleryImages.multiple` is `true`
- [ ] `galleryImages.validationRules.maxItems` is `10`
- [ ] `mainImage.fieldType` is `"IMAGE"` (not `"media"`)
- [ ] `mainImage.readOnly` is `false`
- [ ] Media section shows 2 fields when expanded
- [ ] Clicking `mainImage` upload zone opens file picker (single select)
- [ ] Clicking `galleryImages` upload zone opens file picker (multi-select)
- [ ] Uploading 10 gallery images — 11th image is blocked with counter badge "10/10"
- [ ] Product submit payload includes `mainImage: string` and `galleryImages: string[]`
- [ ] Backend persists both fields in `EcommerceMasterProduct`

---

## 11. Related Documentation

- `documentation/media/FRONTEND-IMAGE-UPLOAD-IMPLEMENTATION.md` — original frontend upload implementation
- `documentation/media/MEDIA-MODULE-COMPLETE-GUIDE.md` — backend GCP module and API reference
- `documentation/Ecommerce-product-v2/DYNAMIC-FORM-SYSTEM.md` — how schema fields drive form rendering
