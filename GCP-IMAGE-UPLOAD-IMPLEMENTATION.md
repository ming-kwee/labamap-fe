# GCP Storage Image Upload Implementation Guide

**Date**: 2025-12-27
**Component**: DynamicProductCreationFormRefactored
**Storage**: Google Cloud Platform (GCP) Storage

---

## 🎯 Architecture Overview

### Current State Analysis

✅ **Already Implemented**:
- Form schema types support: `'file' | 'image' | 'media'` (dynamicForm.ts:34-36)
- MasterProduct has: `mainImage?: string` and `galleryImages?: string[]` (product.ts:31-32)
- Validation rules support: `maxItems` for image arrays (dynamicForm.ts:61)
- Form is 100% data-driven from backend schema

❌ **Not Implemented Yet**:
- File upload UI component in form renderer
- GCP Storage upload service
- Image preview and management
- Backend upload endpoint

---

## 📐 Recommended Architecture

### 3-Tier Upload Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. ImageUploadField Component                                  │
│     - Drag & Drop UI                                            │
│     - Image Preview                                             │
│     - Progress Indicator                                        │
│     - Validation (size, type, count)                           │
│                                                                  │
│  2. Upload Service (client-side)                               │
│     - File validation                                           │
│     - Image compression/resize                                  │
│     - Call backend upload endpoint                              │
│     - Handle progress/errors                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  3. Upload Endpoint: POST /api/v1/media/upload                 │
│     - Validate file (size, type, dimensions)                   │
│     - Generate unique filename                                  │
│     - Upload to GCP Storage                                     │
│     - Return public URL                                         │
│                                                                  │
│  4. GCP Storage Service                                         │
│     - Upload file to bucket                                     │
│     - Set permissions (public-read)                            │
│     - Generate signed/public URL                                │
│     - Optional: Generate thumbnails                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    GCP CLOUD STORAGE                             │
├─────────────────────────────────────────────────────────────────┤
│  Bucket: product-images-{environment}                           │
│  Structure:                                                      │
│    /organizations/{orgId}/products/{productId}/                │
│      - main-image.jpg                                           │
│      - gallery-1.jpg                                            │
│      - gallery-2.jpg                                            │
│      - thumbnails/                                              │
│         - main-image-thumb.jpg                                  │
│         - gallery-1-thumb.jpg                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation Steps

### Step 1: Backend - GCP Storage Configuration

#### 1.1. Set Up GCP Storage Bucket

```bash
# Create bucket (do this once)
gsutil mb -p YOUR_PROJECT_ID -l US gs://product-images-production
gsutil mb -p YOUR_PROJECT_ID -l US gs://product-images-staging

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://product-images-production
```

#### 1.2. Backend Service (Java/Spring Boot)

**File**: `backend/src/main/java/com/labamap/service/MediaUploadService.java`

```java
package com.labamap.service;

import com.google.cloud.storage.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Service
public class MediaUploadService {

    @Value("${gcp.storage.bucket-name}")
    private String bucketName;

    @Value("${gcp.storage.project-id}")
    private String projectId;

    private final Storage storage;

    public MediaUploadService() {
        // Initialize GCP Storage client
        this.storage = StorageOptions.getDefaultInstance().getService();
    }

    /**
     * Upload image to GCP Storage
     *
     * @param file Uploaded file
     * @param organizationId Organization ID for folder structure
     * @param productId Product ID (optional, can be temp ID)
     * @param imageType "main" or "gallery"
     * @return ImageUploadResponse with URL and metadata
     */
    public ImageUploadResponse uploadProductImage(
            MultipartFile file,
            String organizationId,
            String productId,
            String imageType
    ) throws IOException {

        // 1. Validate file
        validateImage(file);

        // 2. Generate unique filename
        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename);
        String uniqueFilename = generateUniqueFilename(imageType, extension);

        // 3. Create folder structure
        String folderPath = String.format(
            "organizations/%s/products/%s/",
            organizationId,
            productId
        );
        String blobName = folderPath + uniqueFilename;

        // 4. Upload original image
        BlobId blobId = BlobId.of(bucketName, blobName);
        BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
            .setContentType(file.getContentType())
            .setAcl(new ArrayList<>(Arrays.asList(Acl.of(Acl.User.ofAllUsers(), Acl.Role.READER))))
            .build();

        Blob blob = storage.create(blobInfo, file.getBytes());

        // 5. Generate thumbnail
        String thumbnailUrl = generateThumbnail(file, folderPath, uniqueFilename, extension);

        // 6. Return response
        return ImageUploadResponse.builder()
            .url(blob.getMediaLink())
            .publicUrl(String.format("https://storage.googleapis.com/%s/%s", bucketName, blobName))
            .thumbnailUrl(thumbnailUrl)
            .filename(uniqueFilename)
            .size(file.getSize())
            .mimeType(file.getContentType())
            .uploadedAt(new Date())
            .build();
    }

    /**
     * Upload multiple images (for gallery)
     */
    public List<ImageUploadResponse> uploadMultipleImages(
            MultipartFile[] files,
            String organizationId,
            String productId
    ) throws IOException {

        List<ImageUploadResponse> responses = new ArrayList<>();

        for (int i = 0; i < files.length; i++) {
            MultipartFile file = files[i];
            ImageUploadResponse response = uploadProductImage(
                file,
                organizationId,
                productId,
                "gallery-" + (i + 1)
            );
            responses.add(response);
        }

        return responses;
    }

    /**
     * Delete image from GCP Storage
     */
    public boolean deleteImage(String imageUrl) {
        try {
            // Extract blob name from URL
            String blobName = extractBlobNameFromUrl(imageUrl);
            BlobId blobId = BlobId.of(bucketName, blobName);

            // Delete blob
            boolean deleted = storage.delete(blobId);

            // Also delete thumbnail
            String thumbnailBlobName = blobName.replace("/", "/thumbnails/thumb-");
            BlobId thumbnailBlobId = BlobId.of(bucketName, thumbnailBlobName);
            storage.delete(thumbnailBlobId);

            return deleted;
        } catch (Exception e) {
            return false;
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private void validateImage(MultipartFile file) throws IOException {
        // Check file is not empty
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }

        // Check file size (max 10MB)
        long maxSize = 10 * 1024 * 1024; // 10MB
        if (file.getSize() > maxSize) {
            throw new IllegalArgumentException("File size exceeds 10MB limit");
        }

        // Check file type
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("File must be an image");
        }

        // Allowed types
        List<String> allowedTypes = Arrays.asList(
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        );
        if (!allowedTypes.contains(contentType)) {
            throw new IllegalArgumentException("Only JPEG, PNG, WEBP, and GIF images are allowed");
        }
    }

    private String generateUniqueFilename(String prefix, String extension) {
        String timestamp = String.valueOf(System.currentTimeMillis());
        String random = UUID.randomUUID().toString().substring(0, 8);
        return String.format("%s-%s-%s.%s", prefix, timestamp, random, extension);
    }

    private String getFileExtension(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "jpg";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex == -1) {
            return "jpg";
        }
        return filename.substring(lastDotIndex + 1).toLowerCase();
    }

    private String generateThumbnail(
            MultipartFile originalFile,
            String folderPath,
            String originalFilename,
            String extension
    ) throws IOException {

        // Read original image
        BufferedImage originalImage = ImageIO.read(originalFile.getInputStream());

        // Calculate thumbnail dimensions (300x300 max, maintain aspect ratio)
        int thumbWidth = 300;
        int thumbHeight = 300;

        int originalWidth = originalImage.getWidth();
        int originalHeight = originalImage.getHeight();

        double aspectRatio = (double) originalWidth / originalHeight;

        if (originalWidth > originalHeight) {
            thumbHeight = (int) (thumbWidth / aspectRatio);
        } else {
            thumbWidth = (int) (thumbHeight * aspectRatio);
        }

        // Create thumbnail
        BufferedImage thumbnailImage = new BufferedImage(thumbWidth, thumbHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = thumbnailImage.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(originalImage, 0, 0, thumbWidth, thumbHeight, null);
        g.dispose();

        // Convert to byte array
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(thumbnailImage, extension, baos);
        byte[] thumbnailBytes = baos.toByteArray();

        // Upload thumbnail
        String thumbnailBlobName = folderPath + "thumbnails/thumb-" + originalFilename;
        BlobId thumbnailBlobId = BlobId.of(bucketName, thumbnailBlobName);
        BlobInfo thumbnailBlobInfo = BlobInfo.newBuilder(thumbnailBlobId)
            .setContentType("image/" + extension)
            .setAcl(new ArrayList<>(Arrays.asList(Acl.of(Acl.User.ofAllUsers(), Acl.Role.READER))))
            .build();

        storage.create(thumbnailBlobInfo, thumbnailBytes);

        return String.format("https://storage.googleapis.com/%s/%s", bucketName, thumbnailBlobName);
    }

    private String extractBlobNameFromUrl(String url) {
        // Extract blob name from: https://storage.googleapis.com/bucket-name/blob/path
        String prefix = "https://storage.googleapis.com/" + bucketName + "/";
        if (url.startsWith(prefix)) {
            return url.substring(prefix.length());
        }
        return url;
    }
}
```

**Response DTO**:

```java
package com.labamap.dto;

import lombok.*;
import java.util.Date;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImageUploadResponse {
    private String url;           // Media link (for backend)
    private String publicUrl;     // Public URL (for frontend display)
    private String thumbnailUrl;  // Thumbnail URL
    private String filename;      // Unique filename
    private Long size;            // File size in bytes
    private String mimeType;      // MIME type
    private Date uploadedAt;      // Upload timestamp
}
```

#### 1.3. Backend Controller

**File**: `backend/src/main/java/com/labamap/controller/MediaController.java`

```java
package com.labamap.controller;

import com.labamap.dto.ImageUploadResponse;
import com.labamap.service.MediaUploadService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/v1/media")
@CrossOrigin(origins = "*")
public class MediaController {

    @Autowired
    private MediaUploadService mediaUploadService;

    /**
     * Upload single image
     *
     * POST /api/v1/media/upload
     */
    @PostMapping("/upload")
    public ResponseEntity<ImageUploadResponse> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam("organizationId") String organizationId,
            @RequestParam("productId") String productId,
            @RequestParam(value = "imageType", defaultValue = "main") String imageType
    ) {
        try {
            ImageUploadResponse response = mediaUploadService.uploadProductImage(
                file,
                organizationId,
                productId,
                imageType
            );
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            return ResponseEntity.status(500).build();
        }
    }

    /**
     * Upload multiple images (gallery)
     *
     * POST /api/v1/media/upload/batch
     */
    @PostMapping("/upload/batch")
    public ResponseEntity<List<ImageUploadResponse>> uploadMultipleImages(
            @RequestParam("files") MultipartFile[] files,
            @RequestParam("organizationId") String organizationId,
            @RequestParam("productId") String productId
    ) {
        try {
            List<ImageUploadResponse> responses = mediaUploadService.uploadMultipleImages(
                files,
                organizationId,
                productId
            );
            return ResponseEntity.ok(responses);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            return ResponseEntity.status(500).build();
        }
    }

    /**
     * Delete image
     *
     * DELETE /api/v1/media/delete
     */
    @DeleteMapping("/delete")
    public ResponseEntity<Void> deleteImage(
            @RequestParam("imageUrl") String imageUrl
    ) {
        boolean deleted = mediaUploadService.deleteImage(imageUrl);
        if (deleted) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}
```

#### 1.4. Configuration

**File**: `backend/src/main/resources/application.yml`

```yaml
gcp:
  storage:
    bucket-name: ${GCP_STORAGE_BUCKET:product-images-production}
    project-id: ${GCP_PROJECT_ID:your-project-id}

spring:
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 50MB
```

---

### Step 2: Frontend - Image Upload Component

#### 2.1. Upload Service

**File**: `/src/modules/ecommerce-product/services/mediaUploadService.ts`

```typescript
/**
 * Media Upload Service
 * Handles image uploads to backend (which uploads to GCP Storage)
 */

export interface ImageUploadResponse {
  url: string;           // Media link (for backend)
  publicUrl: string;     // Public URL (for frontend display)
  thumbnailUrl: string;  // Thumbnail URL
  filename: string;      // Unique filename
  size: number;          // File size in bytes
  mimeType: string;      // MIME type
  uploadedAt: string;    // Upload timestamp (ISO string)
}

export interface UploadProgress {
  filename: string;
  progress: number; // 0-100
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1';

export class MediaUploadService {

  /**
   * Upload single image
   */
  static async uploadImage(
    file: File,
    organizationId: string,
    productId: string,
    imageType: 'main' | 'gallery' = 'main',
    onProgress?: (progress: number) => void
  ): Promise<ImageUploadResponse> {

    // Validate file on client side
    this.validateImage(file);

    // Create FormData
    const formData = new FormData();
    formData.append('file', file);
    formData.append('organizationId', organizationId);
    formData.append('productId', productId);
    formData.append('imageType', imageType);

    // Upload with progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });

      // Success
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response: ImageUploadResponse = JSON.parse(xhr.responseText);
          resolve(response);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      // Error
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      // Abort
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Send request
      xhr.open('POST', `${BACKEND_BASE_URL}/media/upload`);
      xhr.send(formData);
    });
  }

  /**
   * Upload multiple images
   */
  static async uploadMultipleImages(
    files: File[],
    organizationId: string,
    productId: string,
    onProgress?: (progress: UploadProgress[]) => void
  ): Promise<ImageUploadResponse[]> {

    const results: ImageUploadResponse[] = [];
    const progressMap = new Map<string, UploadProgress>();

    // Initialize progress
    files.forEach(file => {
      progressMap.set(file.name, {
        filename: file.name,
        progress: 0,
        status: 'uploading'
      });
    });

    // Upload sequentially (or use Promise.all for parallel)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        const response = await this.uploadImage(
          file,
          organizationId,
          productId,
          'gallery',
          (progress) => {
            progressMap.set(file.name, {
              filename: file.name,
              progress,
              status: 'uploading'
            });
            if (onProgress) {
              onProgress(Array.from(progressMap.values()));
            }
          }
        );

        results.push(response);

        progressMap.set(file.name, {
          filename: file.name,
          progress: 100,
          status: 'completed'
        });

        if (onProgress) {
          onProgress(Array.from(progressMap.values()));
        }

      } catch (error) {
        progressMap.set(file.name, {
          filename: file.name,
          progress: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        });

        if (onProgress) {
          onProgress(Array.from(progressMap.values()));
        }
      }
    }

    return results;
  }

  /**
   * Delete image
   */
  static async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/media/delete?imageUrl=${encodeURIComponent(imageUrl)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[MediaUpload] Delete error:', error);
      return false;
    }
  }

  /**
   * Client-side validation
   */
  private static validateImage(file: File): void {
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('File size must be less than 10MB');
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only JPEG, PNG, WEBP, and GIF images are allowed');
    }
  }
}
```

#### 2.2. Image Upload Field Component

**File**: `/src/modules/ecommerce-product/components/ImageUploadField.tsx`

```typescript
/**
 * Image Upload Field Component
 * Supports single or multiple image uploads with drag & drop
 */

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, ImageIcon, Loader2, CheckCircle2, AlertCircle } from '@/shared/ui/icons/Icons';
import Button from '@/shared/ui/button/Button';
import { MediaUploadService, ImageUploadResponse, UploadProgress } from '../services/mediaUploadService';

interface ImageUploadFieldProps {
  fieldName: string;
  label: string;
  value: string | string[]; // Single URL or array of URLs
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  maxImages?: number;
  required?: boolean;
  helpText?: string;
  organizationId: string;
  productId: string;
  error?: string;
}

export default function ImageUploadField({
  fieldName,
  label,
  value,
  onChange,
  multiple = false,
  maxImages = 5,
  required = false,
  helpText,
  organizationId,
  productId,
  error
}: ImageUploadFieldProps) {

  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current images as array
  const currentImages = Array.isArray(value) ? value : value ? [value] : [];

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Check max images limit
    if (multiple && currentImages.length + fileArray.length > maxImages) {
      alert(`Maximum ${maxImages} images allowed`);
      return;
    }

    setIsUploading(true);

    try {
      if (multiple) {
        // Upload multiple images
        const responses = await MediaUploadService.uploadMultipleImages(
          fileArray,
          organizationId,
          productId,
          setUploadProgress
        );

        // Add new URLs to existing ones
        const newUrls = responses.map(r => r.publicUrl);
        onChange([...currentImages, ...newUrls]);

      } else {
        // Upload single image
        const response = await MediaUploadService.uploadImage(
          fileArray[0],
          organizationId,
          productId,
          'main',
          (progress) => {
            setUploadProgress([{
              filename: fileArray[0].name,
              progress,
              status: 'uploading'
            }]);
          }
        );

        onChange(response.publicUrl);
      }

    } catch (error) {
      console.error('[ImageUpload] Upload error:', error);
      alert(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress([]);
    }
  }, [currentImages, multiple, maxImages, organizationId, productId, onChange]);

  // Handle drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [handleFileSelect]);

  // Handle remove image
  const handleRemoveImage = useCallback(async (imageUrl: string) => {
    if (multiple) {
      const newUrls = currentImages.filter(url => url !== imageUrl);
      onChange(newUrls);
    } else {
      onChange('');
    }

    // Delete from GCP (optional - backend can clean up old images)
    await MediaUploadService.deleteImage(imageUrl);
  }, [currentImages, multiple, onChange]);

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Upload Area */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${error ? 'border-red-300 bg-red-50' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          multiple={multiple}
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />

        <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />

        <p className="text-sm text-gray-600 mb-1">
          Drag & drop {multiple ? 'images' : 'an image'} here, or click to browse
        </p>

        <p className="text-xs text-gray-500">
          JPEG, PNG, WEBP, GIF • Max 10MB per file
          {multiple && ` • Up to ${maxImages} images`}
        </p>
      </div>

      {/* Upload Progress */}
      {isUploading && uploadProgress.length > 0 && (
        <div className="space-y-2 mt-3">
          {uploadProgress.map((progress) => (
            <div key={progress.filename} className="flex items-center space-x-3 text-sm">
              {progress.status === 'uploading' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="flex-1">{progress.filename}</span>
                  <span className="text-gray-500">{Math.round(progress.progress)}%</span>
                </>
              )}
              {progress.status === 'completed' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="flex-1">{progress.filename}</span>
                  <span className="text-green-600">Done</span>
                </>
              )}
              {progress.status === 'error' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="flex-1">{progress.filename}</span>
                  <span className="text-red-600 text-xs">{progress.error}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Grid */}
      {currentImages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
          {currentImages.map((imageUrl, index) => (
            <div key={index} className="relative group aspect-square">
              <img
                src={imageUrl}
                alt={`Product image ${index + 1}`}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
              />

              {/* Remove Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage(imageUrl);
                }}
                className="
                  absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full
                  opacity-0 group-hover:opacity-100 transition-opacity
                  hover:bg-red-600
                "
              >
                <X className="h-4 w-4" />
              </button>

              {/* Main Image Badge */}
              {!multiple && (
                <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-blue-500 text-white text-xs rounded">
                  Main
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-600 flex items-start">
          <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}

      {/* Help Text */}
      {helpText && !error && (
        <p className="text-xs text-gray-500">{helpText}</p>
      )}
    </div>
  );
}
```

#### 2.3. Integrate into Form Renderer

**File**: `/src/modules/ecommerce-product/components/DynamicProductCreationFormRefactored.tsx`

Add this import:
```typescript
import ImageUploadField from './ImageUploadField';
```

Update the field rendering logic (around line 510):

```typescript
{/* Input field */}
{fieldType === 'textarea' ? (
  <textarea
    name={fieldName}
    placeholder={field.placeholder}
    value={formData[fieldName] || ''}
    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
    onBlur={() => handleFieldBlur(field)}
    className={baseClass}
    rows={3}
  />
) : fieldType === 'select' ? (
  <select
    name={fieldName}
    value={formData[fieldName] || ''}
    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
    onBlur={() => handleFieldBlur(field)}
    className={baseClass}
  >
    <option value="">{field.placeholder || 'Select...'}</option>
    {field.options?.map((option: any) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
) : fieldType === 'checkbox' ? (
  <input
    type="checkbox"
    name={fieldName}
    checked={!!formData[fieldName]}
    onChange={(e) => handleFieldChange(fieldName, e.target.checked)}
    onBlur={() => handleFieldBlur(field)}
    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
  />
) : fieldType === 'image' || fieldType === 'file' || fieldType === 'media' ? (
  // ✅ NEW: Image upload field
  <ImageUploadField
    fieldName={fieldName}
    label={field.label}
    value={formData[fieldName] || (fieldType === 'image' ? '' : [])}
    onChange={(value) => handleFieldChange(fieldName, value)}
    multiple={fieldType !== 'image'} // single for 'image', multiple for 'media'
    maxImages={field.validationRules?.maxItems || 5}
    required={field.required}
    helpText={field.helpText}
    organizationId={organizationId}
    productId={formData.id || `temp_${Date.now()}`}
    error={fieldErrors[fieldName]}
  />
) : (
  <input
    name={fieldName}
    type={fieldType === 'number' ? 'number' : fieldType === 'email' ? 'email' : 'text'}
    placeholder={field.placeholder}
    value={formData[fieldName] || ''}
    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
    onBlur={() => handleFieldBlur(field)}
    className={baseClass}
  />
)}
```

---

### Step 3: Backend Schema Configuration

**Add image fields to your form schema in MongoDB**:

```javascript
// Example: Add mainImage field to schema
db.formSchemas.updateOne(
  { organizationId: "org_default_12345" },
  {
    $push: {
      fields: {
        fieldName: "mainImage",
        fieldType: "image",
        label: "Main Product Image",
        description: "Primary image displayed on product listings",
        placeholder: "",
        helpText: "Upload a high-quality image (JPEG, PNG, WEBP). Max 10MB.",
        defaultValue: "",
        validationRules: {
          required: true,
          maxItems: 1
        },
        conditionalVisibility: null,
        options: null,
        readOnly: false,
        hidden: false,
        required: true,
        businessContext: {
          businessOwner: "Product Team",
          lastModifiedBy: "system",
          requiresApproval: false,
          riskLevel: "LOW",
          version: 1
        },
        displayLevel: "essential",
        order: 15,
        section: "media"
      }
    }
  }
);

// Add gallery images field
db.formSchemas.updateOne(
  { organizationId: "org_default_12345" },
  {
    $push: {
      fields: {
        fieldName: "galleryImages",
        fieldType: "media",
        label: "Product Gallery",
        description: "Additional product images",
        placeholder: "",
        helpText: "Upload up to 5 additional images. Max 10MB each.",
        defaultValue: [],
        validationRules: {
          required: false,
          maxItems: 5
        },
        conditionalVisibility: null,
        options: null,
        readOnly: false,
        hidden: false,
        required: false,
        businessContext: {
          businessOwner: "Product Team",
          lastModifiedBy: "system",
          requiresApproval: false,
          riskLevel: "LOW",
          version: 1
        },
        displayLevel: "basic",
        order: 16,
        section: "media"
      }
    }
  }
);
```

---

## 📊 Data Flow

### Upload Flow

```
1. User selects/drops image file
   ↓
2. ImageUploadField validates file (client-side)
   - Check size < 10MB
   - Check type (JPEG, PNG, WEBP, GIF)
   ↓
3. Call MediaUploadService.uploadImage()
   - Create FormData with file + metadata
   - Send POST to /api/v1/media/upload
   - Track upload progress
   ↓
4. Backend MediaController receives request
   - Validate file again (server-side)
   - Generate unique filename
   ↓
5. MediaUploadService uploads to GCP Storage
   - Create folder structure: /organizations/{orgId}/products/{productId}/
   - Upload original image
   - Generate thumbnail (300x300)
   - Set public-read permissions
   ↓
6. Return ImageUploadResponse
   {
     "publicUrl": "https://storage.googleapis.com/product-images-prod/organizations/org123/products/prod456/main-1234567890-abc123.jpg",
     "thumbnailUrl": "https://storage.googleapis.com/product-images-prod/organizations/org123/products/prod456/thumbnails/thumb-main-1234567890-abc123.jpg",
     "filename": "main-1234567890-abc123.jpg",
     "size": 2456789,
     "mimeType": "image/jpeg",
     "uploadedAt": "2025-12-27T12:00:00Z"
   }
   ↓
7. ImageUploadField updates form state
   - handleFieldChange(fieldName, publicUrl)
   - Display image preview
   ↓
8. Form submission includes image URLs
   {
     "name": "Product Name",
     "mainImage": "https://storage.googleapis.com/.../main.jpg",
     "galleryImages": [
       "https://storage.googleapis.com/.../gallery-1.jpg",
       "https://storage.googleapis.com/.../gallery-2.jpg"
     ]
   }
```

---

## ✅ Benefits of This Architecture

1. **Backend-Controlled**: Upload logic, validation, and storage are on backend (secure)
2. **Scalable**: GCP Storage handles any number of images with CDN
3. **Data-Driven**: Image fields defined in MongoDB schema (no frontend code changes)
4. **Progress Tracking**: Real-time upload progress feedback
5. **Thumbnail Generation**: Automatic thumbnail creation for performance
6. **Organized Storage**: Folder structure by organization and product
7. **Secure**: Public URLs only, no direct GCP credentials in frontend
8. **Maintainable**: Clean separation of concerns

---

## 🧪 Testing Checklist

- [ ] Backend: Test `/api/v1/media/upload` endpoint with Postman
- [ ] Backend: Verify GCP Storage bucket permissions
- [ ] Backend: Test thumbnail generation
- [ ] Frontend: Test single image upload (mainImage)
- [ ] Frontend: Test multiple image upload (galleryImages)
- [ ] Frontend: Test drag & drop
- [ ] Frontend: Test image removal
- [ ] Frontend: Test upload progress display
- [ ] Frontend: Test error handling (file too large, wrong type)
- [ ] Integration: Test form submission with images
- [ ] Integration: Test product creation with images saved to MongoDB

---

## 🚀 Next Steps

1. **Implement backend service** (GCP Storage integration)
2. **Create upload endpoint** (MediaController)
3. **Add image fields to schema** (MongoDB)
4. **Create ImageUploadField component** (React)
5. **Integrate into form renderer** (conditional rendering)
6. **Test end-to-end** (upload → preview → submit)

This architecture maintains your data-driven pattern while adding robust image upload capabilities!
