/**
 * Image Upload Field Component
 * Supports single or multiple image uploads with drag & drop
 * Integrates with GCP Storage via backend MediaUploadService
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
  disabled?: boolean;
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
  error,
  disabled = false
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
    if (disabled) return;

    const fileArray = Array.from(files);

    // Check max images limit
    if (multiple && currentImages.length + fileArray.length > maxImages) {
      alert(`Maximum ${maxImages} images allowed. You can upload ${maxImages - currentImages.length} more.`);
      return;
    }

    if (!multiple && fileArray.length > 1) {
      alert('Only one image can be uploaded for this field');
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

        // Add new URLs to existing ones (only successful uploads)
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
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [currentImages, multiple, maxImages, organizationId, productId, onChange, disabled]);

  // Handle drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [handleFileSelect, disabled]);

  // Handle remove image
  const handleRemoveImage = useCallback(async (imageUrl: string) => {
    if (disabled) return;

    if (!confirm('Are you sure you want to remove this image?')) {
      return;
    }

    if (multiple) {
      const newUrls = currentImages.filter(url => url !== imageUrl);
      onChange(newUrls);
    } else {
      onChange('');
    }

    // Delete from GCP (fire and forget - backend will clean up)
    MediaUploadService.deleteImage(imageUrl).catch(err => {
      console.error('[ImageUpload] Failed to delete from storage:', err);
    });
  }, [currentImages, multiple, onChange, disabled]);

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Upload Area */}
      {(!multiple || currentImages.length < maxImages) && (
        <div
          className={`
            border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${disabled ? 'cursor-not-allowed bg-gray-100 dark:bg-gray-800' : 'cursor-pointer'}
            ${isDragging && !disabled ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}
            ${!disabled && !isDragging ? 'hover:border-gray-400 dark:hover:border-gray-500' : ''}
            ${error ? 'border-red-300 bg-red-50 dark:border-red-500 dark:bg-red-900/20' : ''}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            multiple={multiple}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={disabled}
          />

          <Upload className={`h-12 w-12 mx-auto mb-3 ${disabled ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'}`} />

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            {disabled ? 'Upload disabled' : `Drag & drop ${multiple ? 'images' : 'an image'} here, or click to browse`}
          </p>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            JPEG, PNG, WEBP, GIF • Max 10MB per file
            {multiple && ` • Up to ${maxImages} images`}
          </p>

          {multiple && currentImages.length > 0 && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              {currentImages.length} / {maxImages} images uploaded
            </p>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && uploadProgress.length > 0 && (
        <div className="space-y-2 mt-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Uploading...
          </div>
          {uploadProgress.map((progress) => (
            <div key={progress.filename} className="flex items-center space-x-3 text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">
              {progress.status === 'uploading' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{progress.filename}</span>
                  <span className="text-gray-500 dark:text-gray-400">{Math.round(progress.progress)}%</span>
                </>
              )}
              {progress.status === 'completed' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{progress.filename}</span>
                  <span className="text-green-600 dark:text-green-400">Done</span>
                </>
              )}
              {progress.status === 'error' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{progress.filename}</span>
                  <span className="text-red-600 dark:text-red-400 text-xs">{progress.error}</span>
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
                className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                onError={(e) => {
                  // Fallback for broken images
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage unavailable%3C/text%3E%3C/svg%3E';
                }}
              />

              {/* Remove Button */}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(imageUrl);
                  }}
                  className="
                    absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full
                    opacity-0 group-hover:opacity-100 transition-opacity
                    hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500
                  "
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Main Image Badge */}
              {!multiple && (
                <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-blue-500 text-white text-xs rounded">
                  Main
                </div>
              )}

              {/* Image Index for Gallery */}
              {multiple && (
                <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-gray-700 text-white text-xs rounded">
                  {index + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-start mt-1">
          <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}

      {/* Help Text */}
      {helpText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helpText}</p>
      )}
    </div>
  );
}
