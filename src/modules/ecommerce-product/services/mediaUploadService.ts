/**
 * Media Upload Service
 * Handles image uploads to backend (which uploads to GCP Storage)
 *
 * Backend Endpoints:
 * - POST /api/v1/media/upload (single image)
 * - POST /api/v1/media/upload/batch (multiple images)
 * - DELETE /api/v1/media/delete (delete image)
 * - GET /api/v1/media/health (health check)
 */

export interface ImageUploadResponse {
  publicUrl: string;     // Public URL (for frontend display)
  thumbnailUrl: string;  // Thumbnail URL
  filename: string;      // Unique filename
  size: number;          // File size in bytes
  mimeType: string;      // MIME type
  uploadedAt: string;    // Upload timestamp (ISO string)
  organizationId: string;
  productId: string;
  imageType: string;
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
   *
   * @param file File to upload
   * @param organizationId Organization ID
   * @param productId Product ID (can be temp ID before product is saved)
   * @param imageType Image type (main, gallery, etc.)
   * @param onProgress Progress callback (0-100)
   * @returns Promise with ImageUploadResponse
   */
  static async uploadImage(
    file: File,
    organizationId: string,
    productId: string,
    imageType: 'main' | 'gallery' = 'main',
    onProgress?: (progress: number) => void
  ): Promise<ImageUploadResponse> {

    console.log('[MediaUpload] Uploading image:', {
      filename: file.name,
      size: file.size,
      type: file.type,
      organizationId,
      productId,
      imageType
    });

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
          console.log('[MediaUpload] Upload progress:', Math.round(percentComplete) + '%');
        }
      });

      // Success
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response: ImageUploadResponse = JSON.parse(xhr.responseText);
          console.log('[MediaUpload] ✅ Upload successful:', response.publicUrl);
          resolve(response);
        } else {
          const errorMsg = `Upload failed with status ${xhr.status}: ${xhr.responseText}`;
          console.error('[MediaUpload] ❌ Upload failed:', errorMsg);
          reject(new Error(errorMsg));
        }
      });

      // Error
      xhr.addEventListener('error', () => {
        const errorMsg = 'Upload failed - network error';
        console.error('[MediaUpload] ❌', errorMsg);
        reject(new Error(errorMsg));
      });

      // Abort
      xhr.addEventListener('abort', () => {
        const errorMsg = 'Upload cancelled';
        console.error('[MediaUpload] ⚠️', errorMsg);
        reject(new Error(errorMsg));
      });

      // Send request
      xhr.open('POST', `${BACKEND_BASE_URL}/media/upload`);
      xhr.send(formData);
    });
  }

  /**
   * Upload multiple images (batch upload)
   *
   * @param files Array of files to upload
   * @param organizationId Organization ID
   * @param productId Product ID
   * @param onProgress Progress callback for all uploads
   * @returns Promise with array of ImageUploadResponse
   */
  static async uploadMultipleImages(
    files: File[],
    organizationId: string,
    productId: string,
    onProgress?: (progress: UploadProgress[]) => void
  ): Promise<ImageUploadResponse[]> {

    console.log('[MediaUpload] Uploading multiple images:', files.length);

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

    // Notify initial progress
    if (onProgress) {
      onProgress(Array.from(progressMap.values()));
    }

    // Upload sequentially (backend processes in order)
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

        // Mark as completed
        progressMap.set(file.name, {
          filename: file.name,
          progress: 100,
          status: 'completed'
        });

        if (onProgress) {
          onProgress(Array.from(progressMap.values()));
        }

      } catch (error) {
        console.error('[MediaUpload] Failed to upload:', file.name, error);

        // Mark as error
        progressMap.set(file.name, {
          filename: file.name,
          progress: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        });

        if (onProgress) {
          onProgress(Array.from(progressMap.values()));
        }

        // Continue with next file (don't stop on error)
      }
    }

    console.log('[MediaUpload] ✅ Batch upload completed:', results.length, '/', files.length);

    return results;
  }

  /**
   * Delete image from GCP Storage
   *
   * @param imageUrl Full URL of the image to delete
   * @returns Promise with boolean indicating success
   */
  static async deleteImage(imageUrl: string): Promise<boolean> {
    console.log('[MediaUpload] Deleting image:', imageUrl);

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

      if (response.ok) {
        console.log('[MediaUpload] ✅ Image deleted successfully');
        return true;
      } else {
        console.error('[MediaUpload] ❌ Delete failed:', response.statusText);
        return false;
      }
    } catch (error) {
      console.error('[MediaUpload] ❌ Delete error:', error);
      return false;
    }
  }

  /**
   * Check media upload service health
   *
   * @returns Promise with health status
   */
  static async checkHealth(): Promise<any> {
    console.log('[MediaUpload] Checking service health...');

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/media/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const health = await response.json();
        console.log('[MediaUpload] ✅ Service health:', health);
        return health;
      } else {
        console.error('[MediaUpload] ❌ Health check failed:', response.statusText);
        return null;
      }
    } catch (error) {
      console.error('[MediaUpload] ❌ Health check error:', error);
      return null;
    }
  }

  /**
   * Client-side validation (matches backend validation)
   *
   * @param file File to validate
   * @throws Error if validation fails
   */
  private static validateImage(file: File): void {
    // Check file size (max 10MB - matches backend)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('File size must be less than 10MB');
    }

    // Check file type (matches backend allowed types)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only JPEG, PNG, WEBP, and GIF images are allowed');
    }

    // Check file is not empty
    if (file.size === 0) {
      throw new Error('File is empty');
    }
  }
}
