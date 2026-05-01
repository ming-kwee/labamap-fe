# API Reference — Step 1: Media Upload

Base path: `/labamap/api/v1/media`

---

## POST `/media/upload`

Uploads a single product image to GCP Cloud Storage.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | `File` | ✅ | The image binary (JPEG, PNG, WebP, GIF) |
| `organizationId` | `string` | ✅ | Tenant scope; used for GCP path: `organizations/{orgId}/...` |
| `productId` | `string` | ✅ | Product scope; used for GCP path: `.../products/{productId}/...` |
| `imageType` | `string` | — | Prefix for the filename. Defaults to `"main"`. Use `"gallery"` for gallery uploads. |

**Response (200 OK):**
```json
{
  "url":            "https://storage.googleapis.com/{bucket}/organizations/org_123/products/prod_456/main-1735634400000-a1b2c3d4.jpg",
  "publicUrl":      "https://storage.googleapis.com/{bucket}/organizations/org_123/products/prod_456/main-1735634400000-a1b2c3d4.jpg",
  "thumbnailUrl":   "https://storage.googleapis.com/{bucket}/organizations/org_123/products/prod_456/thumbnails/thumb-main-1735634400000-a1b2c3d4.jpg",
  "filename":       "main-1735634400000-a1b2c3d4.jpg",
  "size":           1068013,
  "mimeType":       "image/jpeg",
  "uploadedAt":     "2026-01-01T13:47:25.000+00:00",
  "organizationId": "org_123",
  "productId":      "prod_456",
  "imageType":      "main"
}
```

**Error responses:**
- `400 Bad Request` — file size > 10 MB, unsupported MIME type, or empty file
- `500 Internal Server Error` — GCP write failed
- `503 Service Unavailable` — GCP not configured (`GOOGLE_APPLICATION_CREDENTIALS` not set)

---

## POST `/media/upload/batch`

Uploads multiple images in one request. Processes files sequentially; a failed individual file is skipped (not an error for the whole request).

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | `File[]` | ✅ | Multiple image binaries (repeat the field for each file) |
| `organizationId` | `string` | ✅ | Tenant scope |
| `productId` | `string` | ✅ | Product scope |

Files are automatically named `gallery-1-{ts}-{uuid}`, `gallery-2-{ts}-{uuid}`, etc. based on their position in the request.

**Response (200 OK):** `ImageUploadResponse[]` — same shape as the single-upload response, one entry per successfully uploaded file.

---

## DELETE `/media/delete`

Deletes a single image and its associated thumbnail.

**Query params:** `imageUrl` (required) — the full GCP public URL of the image to delete.

**Example:**
```
DELETE /media/delete?imageUrl=https://storage.googleapis.com/{bucket}/organizations/org_123/products/prod_456/main-xxx.jpg
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Image deleted successfully",
  "imageUrl": "https://storage.googleapis.com/..."
}
```

**Response (404):** Image not found in GCP.

---

## GET `/media/health`

Returns GCP connection status and service configuration.

**Response — GCP configured (200 OK):**
```json
{
  "service":       "MediaUploadService",
  "status":        "UP",
  "bucketName":    "omni-product-images-production",
  "bucketExists":  true,
  "gcpConfigured": true,
  "maxFileSize":   10485760,
  "thumbnailSize": 300
}
```

**Response — GCP not configured (200 OK):**
```json
{
  "service":       "MediaUploadService",
  "status":        "NOT_CONFIGURED",
  "gcpConfigured": false,
  "message":       "GCP Storage is not configured. Set GOOGLE_APPLICATION_CREDENTIALS to enable media upload."
}
```

---

## ImageUploadResponse Shape

```typescript
interface ImageUploadResponse {
  url:            string;   // GCP media link (backend internal)
  publicUrl:      string;   // Public URL for frontend display
  thumbnailUrl:   string;   // Auto-generated 300×300 thumbnail URL
  filename:       string;   // e.g. "main-1735634400000-a1b2c3d4.jpg"
  size:           number;   // Bytes
  mimeType:       string;   // e.g. "image/jpeg"
  uploadedAt:     string;   // ISO date
  organizationId: string;
  productId:      string;
  imageType:      string;   // "main" | "gallery-N"
}
```

---

## GCP Storage Layout

```
gs://{bucket}/
  organizations/{orgId}/
    products/{productId}/
      main-{timestamp}-{uuid}.jpg        ← imageType=main
      gallery-1-{timestamp}-{uuid}.jpg   ← batch file 1
      gallery-2-{timestamp}-{uuid}.jpg   ← batch file 2
      thumbnails/
        thumb-main-{timestamp}-{uuid}.jpg
        thumb-gallery-1-{timestamp}-{uuid}.jpg
```

Thumbnail max dimension: 300×300 px, aspect ratio preserved. Thumbnail generation failure does not fail the upload — `thumbnailUrl` will be `null` if it fails.

---

## Backend Configuration

**Java:** Spring Boot 3.3.1 + Spring WebFlux (reactive). Uses `@RequestPart("file") Mono<FilePart>` — not `MultipartFile` (Spring MVC only, not WebFlux-compatible).

**GCP SDK:** `google-cloud-storage 2.29.1` with `grpc-core 1.60.0`.

**Required environment variables:**
```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_STORAGE_BUCKET=omni-product-images-production
GCP_PROJECT_ID=labamap-ab9a2
```

**application.yml:**
```yaml
gcp:
  storage:
    bucket-name: ${GCP_STORAGE_BUCKET:product-images-production}
    project-id:  ${GCP_PROJECT_ID:labamap-project}

media:
  upload:
    max-file-size: 10485760   # 10 MB
    thumbnail-size: 300

spring:
  codec:
    max-in-memory-size: 10MB  # Required for WebFlux multipart
```

---

## Frontend Service Contract

```typescript
// src/modules/ecommerce-product-v2/services/media-upload.service.ts
class MediaUploadService {
  static async uploadImage(
    file: File,
    organizationId: string,
    productId: string,
    onProgress?: (percent: number) => void
  ): Promise<string>  // returns the publicUrl
}
```

Uses `XMLHttpRequest` internally (not `fetch`) to support `xhr.upload.onprogress` for real-time progress. Throws `Error` on HTTP error or network failure.

---

## galleryImages Attribute Definition

The `galleryImages` master attribute document (in `master-attributes-ecommerce.json`):

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
    "multiple":       true,
    "maxItems":       10,
    "maxFileSize":    10485760,
    "allowedTypes":   ["image/jpeg", "image/png", "image/webp", "image/gif"]
  },
  "validationRules": {
    "maxItems":   10,
    "maxSizeMB":  10,
    "allowedTypes": ["image/jpeg", "image/png", "image/webp"]
  }
}
```

The TypeScript `MasterProduct` type already has `galleryImages?: string[]`. The product mapper already handles it as an array. If this field is absent from the schema response, gallery images are silently dropped from the product payload on submission.
