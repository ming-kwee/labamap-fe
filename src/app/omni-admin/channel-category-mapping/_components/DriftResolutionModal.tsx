"use client";

import React, { useState } from "react";
import type { ChannelCategoryMapping, DriftResolution } from "../_types/channel-mapping";
import { ChannelMappingService } from "../_services/channel-mapping.service";

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

interface Props {
  mapping: ChannelCategoryMapping;
  categoryName: string;
  onResolved: (updated: ChannelCategoryMapping) => void;
  onClose: () => void;
}

const RESOLUTION_OPTIONS: Array<{
  value: DriftResolution;
  label: string;
  desc: string;
  detail: (m: ChannelCategoryMapping, catName: string) => string;
}> = [
  {
    value: "RENAME_PLATFORM",
    label: "Rename platform category to match",
    desc: "The channel name is the source of truth.",
    detail: (m, _) => `Platform category will be renamed to "${m.externalName}". This triggers a push to all other connected channels.`,
  },
  {
    value: "RENAME_CHANNEL",
    label: "Rename channel category back",
    desc: "The platform name is the source of truth.",
    detail: (m, catName) => `The ${m.channelType} category will be renamed back to "${catName}" via the channel API.`,
  },
  {
    value: "KEEP_BOTH",
    label: "Keep both — allow different names",
    desc: "They can diverge. Update the snapshot.",
    detail: (m, _) => `The drift alert will be dismissed. Products will still sync correctly (sync uses ID, not name). The new snapshot will be "${m.externalName}".`,
  },
];

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon",
  tiktok: "TikTok Shop", ebay: "eBay", etsy: "Etsy",
};

export function DriftResolutionModal({ mapping, categoryName, onResolved, onClose }: Props) {
  const [selected, setSelected] = useState<DriftResolution>("KEEP_BOTH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelLabel = CHANNEL_LABEL[mapping.channelType] ?? mapping.channelType;

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await ChannelMappingService.resolveDrift(mapping.id, { resolution: selected });
      onResolved(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedOption = RESOLUTION_OPTIONS.find(o => o.value === selected)!;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-100 dark:border-amber-500/20">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
            <AlertIcon />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">Channel Drift Detected</h2>
            <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">{channelLabel} category name no longer matches</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-500 transition-colors flex-shrink-0">
            <XIcon />
          </button>
        </div>

        {/* Diff panel */}
        <div className="px-6 pt-5 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/40">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Platform</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{categoryName}</p>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 p-3 bg-amber-50 dark:bg-amber-500/10">
              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1">{channelLabel} (changed)</p>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{mapping.externalName}</p>
            </div>
          </div>
          {mapping.driftReason && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">{mapping.driftReason}</p>
          )}
        </div>

        {/* Resolution options */}
        <div className="px-6 py-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Choose how to resolve</p>
          {RESOLUTION_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selected === opt.value
                  ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10 ring-2 ring-brand-400/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <input
                type="radio"
                name="resolution"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className="mt-0.5 flex-shrink-0 h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <div>
                <p className={`text-xs font-semibold ${selected === opt.value ? "text-brand-700 dark:text-brand-400" : "text-gray-700 dark:text-gray-300"}`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Selected option detail */}
        {selected && (
          <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
              {selectedOption.detail(mapping, categoryName)}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Resolving…" : "Confirm Resolution"}
          </button>
        </div>
      </div>
    </div>
  );
}
