"use client";

import React, { useState } from "react";
import { FieldBoost } from "../_types/channel-configuration";

interface Props {
  channelName: string;
  /** Provided when editing an existing boost */
  existing?: FieldBoost;
  onSave: (boost: FieldBoost) => Promise<void>;
  onClose: () => void;
}

export default function AddBoostModal({ channelName, existing, onSave, onClose }: Props) {
  const [sourcePattern,   setSourcePattern]   = useState(existing?.sourcePattern   ?? "");
  const [targetPattern,   setTargetPattern]   = useState(existing?.targetPattern   ?? "");
  const [confidenceBoost, setConfidenceBoost] = useState(String(existing?.confidenceBoost ?? 10));
  const [reason,          setReason]          = useState(existing?.reason          ?? "");
  const [condition,       setCondition]       = useState(existing?.condition       ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const conf = parseFloat(confidenceBoost);
    if (isNaN(conf)) { setError("Confidence boost must be a number."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        sourcePattern:   sourcePattern.trim(),
        targetPattern:   targetPattern.trim(),
        confidenceBoost: conf,
        reason:          reason.trim()    || undefined,
        condition:       condition.trim() || null,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {existing ? "Edit Field Boost" : "Add Field Boost"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{channelName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source Pattern <span className="text-red-500">*</span>
              </label>
              <input type="text" value={sourcePattern} onChange={(e) => setSourcePattern(e.target.value)} required
                placeholder="e.g. barcode, brand, .*weight.*"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500" />
              <p className="text-xs text-gray-400 mt-1">Master product field name or regex pattern.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Pattern <span className="text-red-500">*</span>
              </label>
              <input type="text" value={targetPattern} onChange={(e) => setTargetPattern(e.target.value)} required
                placeholder="e.g. vendor, .*upc.*, product.weight"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500" />
              <p className="text-xs text-gray-400 mt-1">Channel API field name or regex pattern.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confidence Boost <span className="text-red-500">*</span>
              </label>
              <input type="number" value={confidenceBoost} onChange={(e) => setConfidenceBoost(e.target.value)}
                step={0.5} placeholder="e.g. 10.0"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500" />
              <p className="text-xs text-gray-400 mt-1">Added to APM confidence score when patterns match.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Condition <span className="text-gray-400">(optional)</span>
              </label>
              <input type="text" value={condition} onChange={(e) => setCondition(e.target.value)}
                placeholder="e.g. category=electronics"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500" />
              <p className="text-xs text-gray-400 mt-1">Leave blank to apply to all categories.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Shopify uses 'vendor' for brand"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500" />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Saves immediately — JOLT specs for this channel will be invalidated.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                {saving ? "Saving…" : existing ? "Update Boost" : "Add Boost"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
