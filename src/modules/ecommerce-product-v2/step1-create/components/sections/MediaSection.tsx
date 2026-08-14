'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  Plus,
  CheckCircle2,
} from '@/shared/ui/icons/Icons';
import { Card, CardContent } from '@/shared/ui/card/Card';
import { MediaUploadService, UploadProgress } from '../../../services/media-upload.service';
import { SectionHeader, FieldGrid } from './_shared/SectionShell';

// ─────────────────────────────────────────────────────────────────────────────
// Field classification helpers
// ─────────────────────────────────────────────────────────────────────────────

function isImageType(field: any): boolean {
  const type = (field.fieldType || '').toLowerCase();
  return ['image', 'file', 'media'].includes(type);
}

function isFeaturedField(field: any): boolean {
  if (!isImageType(field)) return false;
  const maxItems = field.validationRules?.maxItems ?? 1;
  return field.multiple !== true && maxItems <= 1;
}

function isGalleryField(field: any): boolean {
  if (!isImageType(field)) return false;
  return field.multiple === true || (field.validationRules?.maxItems ?? 1) > 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// FeaturedImageZone
// ─────────────────────────────────────────────────────────────────────────────

interface FeaturedImageZoneProps {
  field: any;
  value: string;
  onChange: (fieldName: string, value: string) => void;
  organizationId: string;
  productId: string;
  error?: string;
}

function FeaturedImageZone({
  field,
  value,
  onChange,
  organizationId,
  productId,
  error,
}: FeaturedImageZoneProps) {
  const fieldName = field.name || field.fieldName;
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setProgress(0);
      try {
        const res = await MediaUploadService.uploadImage(
          file,
          organizationId,
          productId,
          'main',
          (p: number) => setProgress(p)
        );
        onChange(fieldName, res.publicUrl);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [fieldName, organizationId, productId, onChange]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      upload(files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [upload]
  );

  const handleRemove = useCallback(() => {
    if (!confirm('Remove the featured image?')) return;
    onChange(fieldName, '');
    MediaUploadService.deleteImage(value).catch(() => {});
  }, [fieldName, value, onChange]);

  const inputId = `featured-upload-${fieldName}`;

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {field.label || 'Featured Image'}
        </span>
        {field.required && <span className="text-red-500 text-sm">*</span>}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Drop zone / preview */}
        <div className="flex-shrink-0 w-full sm:w-56">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {value ? (
            /* ── Filled state ── */
            <div className="relative group w-full h-48 sm:h-56 rounded-lg overflow-hidden border-2 border-blue-300 dark:border-blue-600 bg-gray-50 dark:bg-gray-800">
              <img
                src={value}
                alt="Featured product image"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="12"%3EImage unavailable%3C/text%3E%3C/svg%3E';
                }}
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <label
                  htmlFor={inputId}
                  className="cursor-pointer px-3 py-1.5 bg-white text-gray-800 text-xs font-medium rounded shadow hover:bg-gray-100 transition"
                >
                  Replace
                </label>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded shadow hover:bg-red-600 transition"
                >
                  Remove
                </button>
              </div>
              {/* Badge */}
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                <CheckCircle2 className="h-3 w-3" />
                Featured
              </div>
            </div>
          ) : (
            /* ── Empty drop zone ── */
            <label
              htmlFor={isUploading ? undefined : inputId}
              className={`
                flex flex-col items-center justify-center w-full h-48 sm:h-56 rounded-lg border-2 border-dashed transition-colors
                ${isUploading ? 'cursor-wait' : 'cursor-pointer'}
                ${isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : error
                    ? 'border-red-400 bg-red-50 dark:bg-red-900/10'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 bg-gray-50 dark:bg-gray-800/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-2" />
                  <span className="text-sm text-blue-600 dark:text-blue-400">{Math.round(progress)}%</span>
                </>
              ) : (
                <>
                  <Upload className={`h-8 w-8 mb-2 ${error ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className="text-sm text-gray-600 dark:text-gray-400 text-center px-2">
                    Drop here or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPEG, PNG, WEBP · max 10MB</span>
                </>
              )}
            </label>
          )}
        </div>

        {/* Requirements panel */}
        <div className="flex flex-col justify-center space-y-2 text-sm text-gray-600 dark:text-gray-400 pt-1">
          {[
            { icon: '✓', text: 'Required — shown on all connected channels', highlight: true },
            { icon: '↔', text: 'Min 1000 × 1000 px for best quality' },
            { icon: '⬜', text: 'Pure white background recommended' },
            { icon: '📦', text: 'Product fills 85% of frame (marketplace standard)' },
            { icon: '🔗', text: 'Channels can override with channel-specific images' },
          ].map(({ icon, text, highlight }) => (
            <div key={text} className={`flex items-start gap-2 ${highlight ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}`}>
              <span className="flex-shrink-0 w-4 text-center">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
          {error && (
            <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mt-1">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GalleryStrip
// ─────────────────────────────────────────────────────────────────────────────

interface GalleryStripProps {
  field: any;
  value: string[];
  onChange: (fieldName: string, value: string[]) => void;
  organizationId: string;
  productId: string;
  error?: string;
}

function GalleryStrip({
  field,
  value,
  onChange,
  organizationId,
  productId,
  error,
}: GalleryStripProps) {
  const fieldName = field.name || field.fieldName;
  const maxImages = field.validationRules?.maxItems ?? 10;
  const images = Array.isArray(value) ? value : [];

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const fileArray = Array.from(files);
      const remaining = maxImages - images.length;
      if (fileArray.length > remaining) {
        alert(`You can add ${remaining} more image${remaining !== 1 ? 's' : ''} (max ${maxImages}).`);
        return;
      }
      setIsUploading(true);
      try {
        const responses = await MediaUploadService.uploadMultipleImages(
          fileArray,
          organizationId,
          productId,
          setUploadProgress
        );
        onChange(fieldName, [...images, ...responses.map((r: any) => r.publicUrl)]);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
        setUploadProgress([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [images, maxImages, fieldName, organizationId, productId, onChange]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const url = images[index];
      const updated = images.filter((_, i) => i !== index);
      onChange(fieldName, updated);
      MediaUploadService.deleteImage(url).catch(() => {});
    },
    [images, fieldName, onChange]
  );

  // ── Drag-to-reorder ──
  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null);
      dragIndexRef.current = null;
      return;
    }
    const reordered = [...images];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    onChange(fieldName, reordered);
    setDragOverIndex(null);
    dragIndexRef.current = null;
  };

  const handleDragEnd = () => {
    setDragOverIndex(null);
    dragIndexRef.current = null;
  };

  const inputId = `gallery-upload-${fieldName}`;
  const canAdd = images.length < maxImages;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {field.label || 'Additional Images'}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {images.length} / {maxImages}
          </span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 italic">drag to reorder</span>
      </div>

      {/* Thumbnail strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {images.map((url, index) => (
          <div
            key={`${url}-${index}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`
              relative flex-shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden cursor-grab active:cursor-grabbing transition-all group
              ${dragOverIndex === index
                ? 'border-blue-500 scale-105 shadow-lg'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}
            `}
          >
            <img
              src={url}
              alt={`Gallery image ${index + 1}`}
              className="w-full h-full object-cover"
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23ddd"/%3E%3C/svg%3E';
              }}
            />
            {/* Number badge */}
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-gray-800/70 text-white text-xs rounded leading-none">
              {index + 1}
            </div>
            {/* Remove button */}
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add more button */}
        {canAdd && (
          <label
            htmlFor={isUploading ? undefined : inputId}
            className="flex-shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            ) : (
              <>
                <Plus className="h-5 w-5 text-gray-400 dark:text-gray-500 mb-0.5" />
                <span className="text-xs text-gray-400 dark:text-gray-500">Add</span>
              </>
            )}
          </label>
        )}

        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Upload progress */}
      {isUploading && uploadProgress.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {uploadProgress.map((p) => (
            <div key={p.filename} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              <span className="truncate max-w-24">{p.filename}</span>
              <span className="text-gray-400">{Math.round(p.progress)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Tip */}
      {images.length > 0 && (
        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          Tip: image order is reflected in search results and product pages
        </p>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MediaSection (main export)
// ─────────────────────────────────────────────────────────────────────────────

interface MediaSectionProps {
  sectionKey: string;
  fields: any[];
  isExpanded: boolean;
  onToggle: () => void;
  formData: Record<string, any>;
  fieldErrors: Record<string, string>;
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
}

export default function MediaSection({
  sectionKey,
  fields,
  isExpanded,
  onToggle,
  formData,
  fieldErrors,
  organizationId,
  productId,
  onChange,
  onBlur,
}: MediaSectionProps) {
  const featuredField = fields.find(isFeaturedField);
  const galleryField = fields.find(isGalleryField);
  const otherFields = fields.filter((f) => !isFeaturedField(f) && !isGalleryField(f));

  const hasFeaturedOrGallery = !!featuredField || !!galleryField;

  return (
    <Card>
      <SectionHeader
        sectionKey={sectionKey}
        fieldCount={fields.length}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />

      {isExpanded && (
        <CardContent className="space-y-6">
          {hasFeaturedOrGallery ? (
            <>
              {/* ── Featured Image ── */}
              {featuredField && (
                <FeaturedImageZone
                  field={featuredField}
                  value={formData[featuredField.name || featuredField.fieldName] || ''}
                  onChange={onChange}
                  organizationId={organizationId}
                  productId={productId}
                  error={fieldErrors[featuredField.name || featuredField.fieldName]}
                />
              )}

              {/* Divider between featured and gallery */}
              {featuredField && galleryField && (
                <div className="border-t border-gray-100 dark:border-gray-700" />
              )}

              {/* ── Gallery Strip ── */}
              {galleryField && (
                <GalleryStrip
                  field={galleryField}
                  value={formData[galleryField.name || galleryField.fieldName] || []}
                  onChange={onChange}
                  organizationId={organizationId}
                  productId={productId}
                  error={fieldErrors[galleryField.name || galleryField.fieldName]}
                />
              )}

              {/* Divider before other fields */}
              {otherFields.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700" />
              )}
            </>
          ) : null}

          {/* ── Other fields (Video URL, etc.) via shared grid ── */}
          {otherFields.length > 0 && (
            <FieldGrid
              fields={otherFields}
              formData={formData}
              fieldErrors={fieldErrors}
              organizationId={organizationId}
              productId={productId}
              onChange={onChange}
              onBlur={onBlur}
            />
          )}

          {/* Fallback: if no recognized image fields, render all fields generically */}
          {!hasFeaturedOrGallery && (
            <FieldGrid
              fields={fields}
              formData={formData}
              fieldErrors={fieldErrors}
              organizationId={organizationId}
              productId={productId}
              onChange={onChange}
              onBlur={onBlur}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}
