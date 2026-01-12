"use client";

import React, { useState } from 'react';
import { Upload, X, Plus } from '@/shared/ui/icons/Icons';
import { MediaUploadService } from '../services/mediaUploadService';

interface VariantMultiImageUploadProps {
  variantId: string;
  currentImages: string[];  // Array of image URLs
  onImagesChange: (imageUrls: string[]) => void;
  organizationId: string;
  productId: string;
  maxImages?: number;  // Max images per variant (default 5)
}

export default function VariantMultiImageUpload({
  variantId,
  currentImages,
  onImagesChange,
  organizationId,
  productId,
  maxImages = 5
}: VariantMultiImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const images = Array.isArray(currentImages) ? currentImages : (currentImages ? [currentImages] : []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed max
    if (images.length + files.length > maxImages) {
      setError(`Maximum ${maxImages} images per variant`);
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      console.log('[VariantMultiImageUpload] Starting upload of', files.length, 'images for variant:', variantId);

      const newImageUrls: string[] = [];

      // Upload each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`[VariantMultiImageUpload] Uploading ${i + 1}/${files.length}:`, file.name);

        const response = await MediaUploadService.uploadImage(
          file,
          organizationId,
          productId,
          'gallery',
          (progress) => {
            // Calculate overall progress across all files
            const fileProgress = (i / files.length) * 100;
            const currentFileProgress = (progress / 100) * (100 / files.length);
            const totalProgress = Math.round(fileProgress + currentFileProgress);
            setUploadProgress(totalProgress);
            console.log(`[VariantMultiImageUpload] Overall progress: ${totalProgress}%`);
          }
        );

        newImageUrls.push(response.publicUrl);
        console.log(`[VariantMultiImageUpload] ✓ Uploaded ${i + 1}/${files.length}:`, response.publicUrl);
      }

      // Update with all images (existing + new)
      const updatedImages = [...images, ...newImageUrls];
      onImagesChange(updatedImages);

      console.log('[VariantMultiImageUpload] ✓ All images uploaded successfully. Total:', updatedImages.length);

      setIsUploading(false);
      setUploadProgress(0);

    } catch (error) {
      console.error('[VariantMultiImageUpload] Upload error:', error);
      setError(error instanceof Error ? error.message : 'Upload failed');
      setIsUploading(false);
      setUploadProgress(0);
    }

    // Reset file input
    e.target.value = '';
  };

  const handleRemove = (indexToRemove: number) => {
    console.log('[VariantMultiImageUpload] Removing image at index:', indexToRemove);
    const updatedImages = images.filter((_, index) => index !== indexToRemove);
    onImagesChange(updatedImages);
  };

  const canAddMore = images.length < maxImages;

  return (
    <div className="relative flex items-center gap-1">
      {/* Image Thumbnails */}
      <div className="flex items-center gap-1 overflow-x-auto max-w-[200px]">
        {images.map((imageUrl, index) => (
          <div
            key={`${imageUrl}-${index}`}
            className="relative group flex-shrink-0 w-10 h-10 border rounded overflow-hidden"
          >
            <img
              src={imageUrl}
              alt={`Variant ${variantId} image ${index + 1}`}
              className="w-full h-full object-cover"
              onLoad={() => {
                console.log(`[VariantMultiImageUpload] Image ${index + 1} loaded:`, imageUrl);
              }}
              onError={(e) => {
                console.error(`[VariantMultiImageUpload] Image ${index + 1} failed to load:`, imageUrl);
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%23f3f4f6"/><text x="50%" y="50%" font-size="16" text-anchor="middle" dy=".3em" fill="%239ca3af">?</text></svg>';
              }}
            />
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title={`Remove image ${index + 1}`}
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        ))}
      </div>

      {/* Upload Button */}
      {canAddMore && (
        <label className="cursor-pointer flex-shrink-0">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
            multiple
          />
          <div
            className="w-10 h-10 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded flex items-center justify-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title={`Add image (${images.length}/${maxImages})`}
          >
            {isUploading ? (
              <div className="relative w-6 h-6">
                <svg className="animate-spin w-6 h-6 text-blue-600" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-blue-600">
                  {uploadProgress}%
                </span>
              </div>
            ) : (
              <Plus className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            )}
          </div>
        </label>
      )}

      {/* Image Count Badge */}
      {images.length > 0 && (
        <div className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 ml-1">
          {images.length}/{maxImages}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute z-10 top-full mt-1 left-0 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 max-w-48 shadow-lg whitespace-normal">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-800 hover:text-red-900"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
