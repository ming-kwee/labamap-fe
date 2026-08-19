"use client";
import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedBlob } from "../../../utils/image-crop";

/**
 * Crop/resize modal (images I4). Locks to the channel's aspect ratio when provided (from the
 * ChannelImageSpec), downscales to `maxWidth`, and returns the resulting derivative as a Blob.
 * The parent uploads that Blob and stores the URL as a per-store override — the master is untouched.
 * Design: docs/images/04, contract docs/images/06 §3.
 */
export default function ImageCropModal({
  src,
  aspect,
  maxWidth,
  title = "Crop image",
  onCancel,
  onCropped,
}: {
  /** Object URL (local file) or a CORS-readable image URL to crop. */
  src: string;
  /** width/height lock; undefined = free crop. */
  aspect?: number;
  /** Cap the exported width (channel maxWidth). Never upscales. */
  maxWidth?: number;
  title?: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setAreaPixels(areaPx);
  }, []);

  async function apply() {
    if (!areaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(src, areaPixels, { maxWidth });
      onCropped(blob);
    } catch {
      // Almost always a canvas-taint (CORS) failure on a remote image — surface a clear hint.
      setError(
        "Couldn't process this image in the browser (it may be served without CORS). " +
          "Try uploading the original file and cropping that instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Crop canvas */}
        <div className="relative h-[360px] bg-gray-900">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            restrictPosition
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom + meta */}
        <div className="px-5 py-3 space-y-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-10">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-brand-500"
            />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {aspect ? `Locked to ${aspect === 1 ? "1:1 square" : `${aspect.toFixed(2)}:1`}` : "Free crop"}
            {maxWidth ? ` · output ≤ ${maxWidth}px wide` : ""}
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy || !areaPixels}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Processing…" : "Apply crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
