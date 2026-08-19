"use client";
import React, { useEffect, useState } from "react";
import type { ChannelType, ChannelImageSpec } from "../../types/channelStore";
import { ChannelImageSpecService } from "../../services/channelImageSpec.service";
import { specAspect, specMaxWidth } from "../../../utils/image-crop";
import { ImageListEditor, specReqParts } from "./StoreImageOverrideEditor";

/**
 * Per-SKU variant image editor, presented as a right-side slide-over (images I4) — same drawer shell
 * as Step-3 "Riwayat & Status".
 *
 * The compact thumbnail summary lives inline in the variant table row (awareness); clicking it opens
 * this drawer for the full editing surface — reorder, set main, crop to the channel aspect, upload,
 * reset-to-master — without cramping the table and while the table stays visible underneath. Reuses
 * the exact ImageListEditor that also drives the product-level list, so the override semantics
 * (empty = inherit master) stay identical.
 *
 * Sits at z-99999 (same as the history drawer); the crop modal opened from inside ImageListEditor is
 * bumped above it (z-[100000]) so cropping still stacks on top.
 */
export default function VariantImagesDrawer({
  channelType,
  channelName,
  orgId,
  masterProductId,
  sku,
  variantLabel,
  baseline,
  value,
  onChange,
  onClose,
}: {
  channelType: ChannelType;
  channelName?: string;
  orgId: string;
  masterProductId: string;
  sku: string;
  variantLabel?: string;
  /** Read-only master variant images (inheritance baseline). */
  baseline: string[];
  /** Current per-store override (ordered) or undefined = inheriting the baseline. */
  value: string[] | undefined;
  /** Non-empty → write override; undefined/empty → clear (fall back to master). */
  onChange: (urls: string[] | undefined) => void;
  onClose: () => void;
}) {
  const [spec, setSpec] = useState<ChannelImageSpec | null>(null);

  useEffect(() => {
    let cancelled = false;
    ChannelImageSpecService.getSpec(channelType).then((s) => {
      if (!cancelled) setSpec(s);
    });
    return () => {
      cancelled = true;
    };
  }, [channelType]);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const reqParts = specReqParts(spec);

  return (
    <div className="fixed inset-0 z-99999 flex justify-end" role="dialog" aria-modal="true" aria-label={`Variant images for ${sku}`}>
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white dark:bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="truncate">Gambar variant — {sku}</span>
              {variantLabel && variantLabel !== sku && (
                <span className="text-sm font-normal text-gray-400 dark:text-gray-500 truncate">{variantLabel}</span>
              )}
            </h3>
            {reqParts.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="font-medium text-gray-600 dark:text-gray-300">
                  {channelName ?? channelType}:
                </span>{" "}
                {reqParts.join(" · ")}
                {spec?.channelSideUpload ? " · channel fetches the public URL" : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Tutup
          </button>
        </div>

        {/* Body — the shared single-list editor (baseline = master variant images) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ImageListEditor
            orgId={orgId}
            productId={masterProductId}
            baseline={baseline}
            value={value}
            onChange={onChange}
            aspect={specAspect(spec)}
            maxWidth={specMaxWidth(spec)}
            baselineLabel="Master variant images"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Selesai
          </button>
        </div>
      </aside>
    </div>
  );
}
