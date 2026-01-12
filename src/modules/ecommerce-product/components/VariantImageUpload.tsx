"use client";

import React, { useState } from 'react';
import { Upload, X } from '@/shared/ui/icons/Icons';
import { MediaUploadService } from '../services/mediaUploadService';

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

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      console.log('[VariantImageUpload] Starting upload for variant:', variantId);

      // Use MediaUploadService (handles validation automatically)
      const response = await MediaUploadService.uploadImage(
        file,
        organizationId,
        productId,
        'gallery', // Use 'gallery' type for variant images
        (progress) => {
          setUploadProgress(Math.round(progress));
          console.log('[VariantImageUpload] Upload progress:', Math.round(progress) + '%');
        }
      );

      console.log('[VariantImageUpload] Upload successful:', response);
      console.log('[VariantImageUpload] ✓ Image URL saved for variant:', variantId, response.publicUrl);

      // Update variant with uploaded image URL
      onImageChange(response.publicUrl);

      setIsUploading(false);
      setUploadProgress(0);

    } catch (error) {
      console.error('[VariantImageUpload] Upload error:', error);
      setError(error instanceof Error ? error.message : 'Upload failed');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemove = () => {
    console.log('[VariantImageUpload] Removing image for variant:', variantId);
    onImageChange(null);
  };

  return (
    <div className="relative flex items-center gap-2">
      {currentImage ? (
        // Show preview with remove button
        <div className="flex items-center gap-2">
          <div className="relative w-12 h-12 border rounded overflow-hidden group">
            <img
              src={currentImage}
              alt={`Variant ${variantId}`}
              className="w-full h-full object-cover"
              onLoad={() => {
                console.log('[VariantImageUpload] Image loaded successfully:', currentImage);
              }}
              onError={(e) => {
                console.error('[VariantImageUpload] Image failed to load:', currentImage);
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23f3f4f6"/><text x="50%" y="50%" font-size="20" text-anchor="middle" dy=".3em" fill="%239ca3af">?</text></svg>';
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
          <div className="w-12 h-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded flex items-center justify-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            {isUploading ? (
              <div className="relative w-8 h-8">
                <svg className="animate-spin w-8 h-8 text-blue-600" viewBox="0 0 24 24">
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
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-blue-600">
                  {uploadProgress}%
                </span>
              </div>
            ) : (
              <Upload className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            )}
          </div>
        </label>
      )}

      {error && (
        <div className="absolute z-10 top-full mt-1 left-0 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 max-w-48 shadow-lg">
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
