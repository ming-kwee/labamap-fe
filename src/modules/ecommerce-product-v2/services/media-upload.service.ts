/**
 * Media Upload Service
 * Handles image uploads to backend (which uploads to GCP Storage)
 */

export interface ImageUploadResponse {
  publicUrl: string;
  thumbnailUrl: string;
  filename: string;
  size: number;
  /** Original image width in px — present since images I0; null/absent when the bytes couldn't be decoded. */
  width?: number;
  /** Original image height in px — present since images I0; null/absent when the bytes couldn't be decoded. */
  height?: number;
  mimeType: string;
  uploadedAt: string;
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

/** Presigned-upload response (images I3). */
export interface PresignResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  contentType: string;
  expiresAt: string;
}

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1';

export class MediaUploadService {
  static async uploadImage(
    file: File,
    organizationId: string,
    productId: string,
    imageType: 'main' | 'gallery' = 'main',
    onProgress?: (progress: number) => void
  ): Promise<ImageUploadResponse> {
    this.validateImage(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('organizationId', organizationId);
    formData.append('productId', productId);
    formData.append('imageType', imageType);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText) as ImageUploadResponse);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed - network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.open('POST', `${BACKEND_BASE_URL}/media/upload`);
      xhr.send(formData);
    });
  }

  static async uploadMultipleImages(
    files: File[],
    organizationId: string,
    productId: string,
    onProgress?: (progress: UploadProgress[]) => void
  ): Promise<ImageUploadResponse[]> {
    const results: ImageUploadResponse[] = [];
    const progressMap = new Map<string, UploadProgress>();

    files.forEach(file => {
      progressMap.set(file.name, { filename: file.name, progress: 0, status: 'uploading' });
    });

    if (onProgress) onProgress(Array.from(progressMap.values()));

    for (const file of files) {
      try {
        const response = await this.uploadImage(
          file,
          organizationId,
          productId,
          'gallery',
          (progress) => {
            progressMap.set(file.name, { filename: file.name, progress, status: 'uploading' });
            if (onProgress) onProgress(Array.from(progressMap.values()));
          }
        );

        results.push(response);
        progressMap.set(file.name, { filename: file.name, progress: 100, status: 'completed' });
        if (onProgress) onProgress(Array.from(progressMap.values()));

      } catch (error) {
        progressMap.set(file.name, {
          filename: file.name,
          progress: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        });
        if (onProgress) onProgress(Array.from(progressMap.values()));
      }
    }

    return results;
  }

  static async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/media/delete?imageUrl=${encodeURIComponent(imageUrl)}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // ── Presigned upload path (images I3): PUT directly to storage, then finalize ──

  /** Ask the backend for a presigned upload URL. */
  static async presign(
    contentType: string,
    organizationId: string,
    productId: string,
    imageType: 'main' | 'gallery' = 'main'
  ): Promise<PresignResponse> {
    const res = await fetch(`${BACKEND_BASE_URL}/media/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, organizationId, productId, imageType }),
    });
    if (!res.ok) throw new Error(`Presign failed with status ${res.status}`);
    return res.json() as Promise<PresignResponse>;
  }

  /** Confirm a presigned upload — backend verifies the object exists + records its metadata. */
  static async finalize(req: {
    key: string; width?: number; height?: number; bytes?: number;
    contentType?: string; organizationId?: string; productId?: string; imageType?: string;
  }): Promise<ImageUploadResponse> {
    const res = await fetch(`${BACKEND_BASE_URL}/media/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Finalize failed with status ${res.status}`);
    return res.json() as Promise<ImageUploadResponse>;
  }

  /**
   * Full presigned upload: presign → PUT bytes directly to storage → finalize.
   * Offloads the large-file transfer from the backend (images I3). Falls back to the proxied
   * {@link uploadImage} at the call site if presign isn't available in the environment.
   */
  static async uploadViaPresign(
    file: File,
    organizationId: string,
    productId: string,
    imageType: 'main' | 'gallery' = 'main',
    onProgress?: (progress: number) => void
  ): Promise<ImageUploadResponse> {
    this.validateImage(file);
    const contentType = file.type || 'image/jpeg';
    const { key, uploadUrl } = await this.presign(contentType, organizationId, productId, imageType);

    // PUT bytes directly to storage. Content-Type MUST match the signed content-type.
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
      });
      xhr.addEventListener('load', () =>
        (xhr.status >= 200 && xhr.status < 300) ? resolve()
          : reject(new Error(`Direct upload failed with status ${xhr.status}`)));
      xhr.addEventListener('error', () => reject(new Error('Direct upload failed - network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.send(file);
    });

    const dims = await this.readImageDimensions(file);
    return this.finalize({
      key, contentType, organizationId, productId, imageType,
      bytes: file.size, width: dims?.width, height: dims?.height,
    });
  }

  /** Read an image's natural dimensions in the browser (best-effort; null on failure). */
  static readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  private static validateImage(file: File): void {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) throw new Error('File size must be less than 10MB');

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only JPEG, PNG, WEBP, and GIF images are allowed');
    }

    if (file.size === 0) throw new Error('File is empty');
  }
}
