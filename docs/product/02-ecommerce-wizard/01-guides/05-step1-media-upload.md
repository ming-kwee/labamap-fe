# Step 1 — Media Upload

## Overview

The media system uploads product images to **GCP Cloud Storage** via the backend. Images are stored in a hierarchical folder structure by organization and product. The frontend uses XHR-based upload to track progress per file.

The backend uses Spring WebFlux (reactive) with `FilePart` for non-blocking multipart handling, and generates automatic thumbnails on every upload. The application starts without GCP credentials (lazy initialization) — upload requests return 503 but all other functionality continues.

---

## Two Image Contexts

| Context | Field | Upload component | Max files |
|---------|-------|-----------------|-----------|
| Master product gallery | `mainImage` + `galleryImages` | `ImageUploadField` | 10 gallery images |
| Per-variant images | `variant.variantImages[]` | `VariantMultiImageUpload` | 5 per variant |

---

## ImageUploadField

Used in the `MediaSection` for the main product gallery.

```tsx
// src/modules/ecommerce-product-v2/step1-create/components/ImageUploadField.tsx
<ImageUploadField
  value={formData.images}
  onChange={(urls) => onChange("images", urls)}
  multiple={true}
  maxFiles={10}
  maxSizeMB={10}
  accept="image/*"
  organizationId={organizationId}
  productId={formData.sku || "draft"}
/>
```

**Features:**
- Drag-and-drop or click to browse
- Progress bar per file during upload
- 10 MB file size limit (enforced client-side before upload)
- `accept="image/*"` — all image types
- Thumbnail preview after upload
- Reorder by drag (updates the `images` array order)
- Remove individual images

**Upload mechanism:** XHR-based (not `fetch`) to enable `onprogress` events for real-time progress tracking.

---

## VariantMultiImageUpload

Used in the variant table for per-SKU images.

```tsx
// src/modules/ecommerce-product-v2/step1-create/components/VariantMultiImageUpload.tsx
<VariantMultiImageUpload
  value={variant.variantImages}
  onChange={(urls) => updateVariant(variant.id, "variantImages", urls)}
  maxImages={5}
  organizationId={organizationId}
  productId={masterProductId}
  variantId={variant.id}
/>
```

**Features:**
- 40×40 px thumbnails in a horizontal row
- Plus button to add more images
- Hover-to-remove per image
- Sequential batch upload with overall progress tracking
- Image counter badge (e.g. `3/5`)

---

## MediaUploadService

```typescript
// src/modules/ecommerce-product-v2/services/media-upload.service.ts
class MediaUploadService {
  static async uploadImage(
    file: File,
    organizationId: string,
    productId: string,
    onProgress?: (percent: number) => void
  ): Promise<string>  // returns the GCP public URL
}
```

Uses `XMLHttpRequest` internally so `onprogress` events can be exposed:

```typescript
const xhr = new XMLHttpRequest();
xhr.upload.addEventListener("progress", (e) => {
  if (e.lengthComputable && onProgress) {
    onProgress(Math.round((e.loaded / e.total) * 100));
  }
});
xhr.open("POST", `${BASE_URL}/media/upload`);
```

---

## Backend Architecture (GCP)

**Technology:** Spring Boot 3.3.1 + Spring WebFlux (reactive, non-blocking)

**WebFlux multipart:** The controller uses `@RequestPart("file") Mono<FilePart>` (not `MultipartFile` which is Spring MVC only). Bytes are read from the `FilePart` reactively via `DataBufferUtils.join(part.content())`.

**Storage layout:**
```
gs://{bucket}/
  organizations/{orgId}/
    products/{productId}/
      main-{timestamp}-{uuid}.jpg        ← mainImage
      gallery-1-{timestamp}-{uuid}.jpg   ← galleryImages[0]
      gallery-2-{timestamp}-{uuid}.jpg   ← galleryImages[1]
      thumbnails/
        thumb-main-{timestamp}-{uuid}.jpg
        thumb-gallery-1-{timestamp}-{uuid}.jpg
```

**Auto-thumbnails:** Generated server-side on every upload (max 300×300 px, aspect ratio preserved). Both `url`/`publicUrl` and `thumbnailUrl` are returned in every upload response. Thumbnail generation failure does not fail the upload.

**Graceful degradation:** The application starts successfully even without `GOOGLE_APPLICATION_CREDENTIALS`. Upload requests return `503 Service Unavailable`; the health endpoint reports `status: "NOT_CONFIGURED"`.

**Supported formats:** JPEG, PNG, WebP, GIF — max 10 MB per file.

---

## Variant Image Transformation Backend

When a product with variant images is published, `variantImages` (an array of GCP URLs) must be converted to the channel's expected format before the Sync API call.

### Data-driven transformation

The conversion rules are stored in MongoDB per channel — no per-channel Java code exists. `ChannelAttributeConverterService` delegates to `FieldTransformationService` at publish time:

```java
FieldTransformationService.TransformationResult result =
    fieldTransformationService.applyTransformation(
        pathForExtraction,
        value,
        mapping.getTransformationType(),         // from channel_configurations
        mapping.getTargetFieldNameOverride(),
        mapping.getTransformationConfig()
    );
```

### MongoDB configuration (in `channel_configurations.attributeMappings.variantFields`)

```json
{
  "product@variants@variantImages": {
    "vrntId":                  "channel_variant_images",
    "chnlVrntType":            "object[]",
    "isSupportField":          true,
    "targetFieldNameOverride": "product.variants.images",
    "transformationType":      "URL_ARRAY_TO_SRC_OBJECTS",
    "transformationConfig":    { "propertyName": "src" }
  }
}
```

### Transformation types

| Type | Input → Output | Used by |
|------|---------------|---------|
| `URL_ARRAY_TO_SRC_OBJECTS` | `["url1","url2"]` → `[{"src":"url1"},{"src":"url2"}]` | Shopify |
| `SIMPLE_ARRAY` | `"value"` or `["v1","v2"]` → `["value"]` or `["v1","v2"]` | generic |
| `STRING_TO_ARRAY` | `"value"` → `["value"]` | generic |
| `OBJECT_WRAPPER` | `"value"` → `{"propertyName":"value"}` | generic |

**Adding a new channel's variant image format** requires only a MongoDB update to `channel_configurations` — no Java code changes.

---

## galleryImages Backend Contract

The master attribute document includes `galleryImages` for multi-image gallery support:

```json
{
  "fieldName":    "galleryImages",
  "fieldType":    "image",
  "multiple":     true,
  "section":      "media",
  "displayLevel": "basic",
  "required":     false,
  "mediaConfig": {
    "uploadEndpoint": "/api/v1/media/upload/batch",
    "imageType":      "gallery",
    "maxItems":       10,
    "maxFileSize":    10485760
  }
}
```

The `MasterProduct` TypeScript type already declares `galleryImages?: string[]`. The product mapper already handles `galleryImages` as an array. If the backend schema does not include this field, gallery images are silently dropped from the product payload.

---

## Codebase

| File | Purpose |
|------|---------|
| `step1-create/components/ImageUploadField.tsx` | Drag-drop + XHR upload + progress + thumbnail preview |
| `step1-create/components/VariantMultiImageUpload.tsx` | Per-variant compact image grid (up to 5) |
| `step1-create/components/sections/MediaSection.tsx` | Section card that renders `ImageUploadField` for product gallery |
| `services/media-upload.service.ts` | `MediaUploadService.uploadImage()` — XHR with progress callback |
| `media/controller/MediaController.java` | Upload, batch upload, delete, health endpoints |
| `media/service/MediaUploadService.java` | GCP Storage integration, thumbnail generation, lazy init |
| `publishing/service/FieldTransformationService.java` | Variant image transformation types (URL_ARRAY_TO_SRC_OBJECTS, etc.) |
