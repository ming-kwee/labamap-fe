"use client";
import React, { useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import Button from "@/components/ui/button/Button";
import { ProductData } from "../ProductCreateForm";

interface ImagesMediaProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

interface MediaFile {
  id: string;
  type: "image" | "video";
  file?: File;
  url: string;
  alt?: string;
  title?: string;
  isPrimary?: boolean;
  size?: number;
  dimensions?: { width: number; height: number };
}

export default function ImagesMedia({ onUpdate }: ImagesMediaProps) {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [, setSelectedMedia] = useState<string | null>(null);
  // const [showCropModal, setShowCropModal] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const onDrop = async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    
    try {
      const newMedia: MediaFile[] = [];
      
      for (const file of acceptedFiles) {
        const id = Math.random().toString(36).substr(2, 9);
        const url = URL.createObjectURL(file);
        const isVideo = file.type.startsWith("video/");
        
        // Get image/video dimensions
        let dimensions = undefined;
        if (file.type.startsWith("image/")) {
          dimensions = await getImageDimensions(file);
        }

        newMedia.push({
          id,
          type: isVideo ? "video" : "image",
          file,
          url,
          alt: "",
          title: file.name,
          isPrimary: mediaFiles.length === 0 && newMedia.length === 1,
          size: file.size,
          dimensions,
        });
      }

      const updatedMedia = [...mediaFiles, ...newMedia];
      setMediaFiles(updatedMedia);
      
      // Update product data
      const images = updatedMedia.filter(m => m.type === "image").map(m => ({
        id: m.id,
        url: m.url,
        alt: m.alt || "",
        isPrimary: m.isPrimary || false,
      }));
      
      const videos = updatedMedia.filter(m => m.type === "video").map(m => ({
        id: m.id,
        url: m.url,
        title: m.title || "",
      }));

      onUpdate({ images, videos });
      
    } catch (error) {
      console.error("Error processing media files:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
      "video/*": [".mp4", ".mov", ".avi", ".mkv"],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const removeMedia = (id: string) => {
    const updatedMedia = mediaFiles.filter(m => m.id !== id);
    setMediaFiles(updatedMedia);
    
    // Update product data
    const images = updatedMedia.filter(m => m.type === "image").map(m => ({
      id: m.id,
      url: m.url,
      alt: m.alt || "",
      isPrimary: m.isPrimary || false,
    }));
    
    const videos = updatedMedia.filter(m => m.type === "video").map(m => ({
      id: m.id,
      url: m.url,
      title: m.title || "",
    }));

    onUpdate({ images, videos });
  };

  const setPrimaryImage = (id: string) => {
    const updatedMedia = mediaFiles.map(m => ({
      ...m,
      isPrimary: m.id === id && m.type === "image",
    }));
    setMediaFiles(updatedMedia);
    
    const images = updatedMedia.filter(m => m.type === "image").map(m => ({
      id: m.id,
      url: m.url,
      alt: m.alt || "",
      isPrimary: m.isPrimary || false,
    }));

    onUpdate({ images });
  };

  const updateMediaAlt = (id: string, alt: string) => {
    const updatedMedia = mediaFiles.map(m => 
      m.id === id ? { ...m, alt } : m
    );
    setMediaFiles(updatedMedia);
    
    const images = updatedMedia.filter(m => m.type === "image").map(m => ({
      id: m.id,
      url: m.url,
      alt: m.alt || "",
      isPrimary: m.isPrimary || false,
    }));

    onUpdate({ images });
  };

  const generateAIAltText = async (media: MediaFile) => {
    setIsProcessing(true);
    try {
      // Simulate AI alt text generation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const suggestions = [
        "Professional product photography showing detailed features",
        "High-quality image highlighting key product benefits",
        "Clear product view from multiple angles",
        "Lifestyle photo showcasing product in use",
        "Close-up detail shot of product texture and quality",
      ];
      
      const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
      updateMediaAlt(media.id, randomSuggestion);
      
    } catch (error) {
      console.error("Failed to generate alt text:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const optimizeImages = async () => {
    setIsProcessing(true);
    try {
      // Simulate image optimization
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("Images optimized for web performance");
    } catch (error) {
      console.error("Failed to optimize images:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVideoUpload = () => {
    videoInputRef.current?.click();
  };

  const handleVideoFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      onDrop(files);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-8">
      {/* Upload Area */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Images & Media</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Upload and manage product images and videos
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={optimizeImages} disabled={isProcessing || mediaFiles.length === 0}>
              {isProcessing ? "🔄 Optimizing..." : "⚡ Optimize"}
            </Button>
            <Button onClick={handleVideoUpload} variant="outline">
              🎥 Add Video
            </Button>
          </div>
        </div>

        {/* Hidden video input */}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleVideoFileSelect}
          className="hidden"
        />

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            isDragActive
              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/10"
              : "border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">📸</span>
            </div>
            {isDragActive ? (
              <p className="text-brand-600 dark:text-brand-400 font-medium">
                Drop files here to upload
              </p>
            ) : (
              <>
                <p className="text-gray-900 dark:text-white font-medium mb-2">
                  Drag & drop files here, or click to browse
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Support: PNG, JPG, GIF, WebP, SVG (max 50MB) • MP4, MOV, AVI (max 50MB)
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Media Gallery */}
      {mediaFiles.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Media Gallery ({mediaFiles.length} files)
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Total size: {formatFileSize(mediaFiles.reduce((sum, m) => sum + (m.size || 0), 0))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mediaFiles.map((media) => (
              <div
                key={media.id}
                className={`relative group rounded-lg border-2 overflow-hidden ${
                  media.isPrimary
                    ? "border-green-500 ring-2 ring-green-200 dark:ring-green-800"
                    : "border-gray-200 dark:border-gray-600"
                }`}
              >
                {/* Media Preview */}
                <div className="aspect-square relative">
                  {media.type === "image" ? (
                    <img
                      src={media.url}
                      alt={media.alt || media.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={media.url}
                      className="w-full h-full object-cover"
                      controls={false}
                      muted
                    >
                      Your browser does not support the video tag.
                    </video>
                  )}
                  
                  {/* Primary Badge */}
                  {media.isPrimary && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-green-500 text-white text-xs font-medium rounded">
                      Primary
                    </div>
                  )}

                  {/* Media Type Badge */}
                  <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
                    {media.type === "video" ? "🎥" : "📸"}
                  </div>

                  {/* Action Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedMedia(media.id)}
                        className="p-2 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-white/30"
                      >
                        👁️
                      </button>
                      {media.type === "image" && (
                        <button
                          onClick={() => setPrimaryImage(media.id)}
                          className="p-2 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-white/30"
                        >
                          ⭐
                        </button>
                      )}
                      <button
                        onClick={() => removeMedia(media.id)}
                        className="p-2 bg-red-500/80 backdrop-blur-sm rounded-lg text-white hover:bg-red-500"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {/* Media Info */}
                <div className="p-3 space-y-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {media.title}
                  </div>
                  
                  {media.dimensions && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {media.dimensions.width} × {media.dimensions.height}
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(media.size || 0)}
                  </div>

                  {/* Alt Text for Images */}
                  {media.type === "image" && (
                    <div className="space-y-1">
                      <input
                        type="text"
                        placeholder="Alt text for accessibility"
                        value={media.alt || ""}
                        onChange={(e) => updateMediaAlt(media.id, e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() => generateAIAltText(media)}
                        disabled={isProcessing}
                        className="text-xs text-brand-500 hover:text-brand-600 disabled:opacity-50"
                      >
                        {isProcessing ? "🤖 Generating..." : "🤖 AI Generate"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media Tools */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Media Tools</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button variant="outline" className="flex items-center gap-2">
            <span>🎨</span>
            Background Remover
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <span>✨</span>
            AI Enhancer
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <span>📐</span>
            Crop & Resize
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <span>🔄</span>
            Batch Process
          </Button>
        </div>

        {/* Image Guidelines */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-400 mb-2">📋 Image Guidelines</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• Use high-resolution images (at least 1200×1200px for primary image)</li>
            <li>• Maintain consistent lighting and background across all images</li>
            <li>• Include multiple angles: front, back, side, and detail shots</li>
            <li>• Use lifestyle images to show the product in context</li>
            <li>• Optimize file sizes for web performance (keep under 1MB when possible)</li>
          </ul>
        </div>

        {/* Video Guidelines */}
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
          <h4 className="font-medium text-purple-900 dark:text-purple-400 mb-2">🎬 Video Guidelines</h4>
          <ul className="text-sm text-purple-800 dark:text-purple-300 space-y-1">
            <li>• Keep videos under 2 minutes for better engagement</li>
            <li>• Start with the most compelling features in the first 5 seconds</li>
            <li>• Use 1080p resolution for best quality</li>
            <li>• Include captions for accessibility</li>
            <li>• Show the product from multiple angles and in different contexts</li>
          </ul>
        </div>
      </div>

      {/* Smart Recommendations */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">🎯</span>
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-indigo-900 dark:text-indigo-400 mb-2">Smart Recommendations</h3>
            <div className="space-y-2 text-sm text-indigo-800 dark:text-indigo-300">
              {mediaFiles.length === 0 && (
                <p>• Add at least 3-5 high-quality product images for better conversion</p>
              )}
              {mediaFiles.filter(m => m.type === "image" && !m.alt).length > 0 && (
                <p>• Add alt text to all images for better SEO and accessibility</p>
              )}
              {!mediaFiles.some(m => m.isPrimary) && mediaFiles.length > 0 && (
                <p>• Set a primary image that best represents your product</p>
              )}
              {mediaFiles.length > 0 && mediaFiles.length < 3 && (
                <p>• Consider adding more images to showcase different angles and features</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}