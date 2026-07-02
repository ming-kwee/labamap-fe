"use client";

import React, { useState } from "react";
import {
  ChannelValueMapping,
  ChannelValueMappingRequest,
  FallbackStrategy,
  FALLBACK_DESCRIPTIONS,
  FALLBACK_LABELS,
  FALLBACK_STRATEGIES,
  ValueMappingEntry,
} from "../_types/channel-value-mapping";

const CHANNEL_OPTIONS = [
  "shopify", "tiktok", "tiktokshop", "amazon", "ebay",
  "lazada", "tokopedia", "shopee", "woocommerce", "wix",
];

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

export default function AddEditValueMappingModal({
  mode,
  mapping,
  onSave,
  onClose,
}: {
  mode: "create" | "edit";
  mapping?: ChannelValueMapping;
  onSave: (data: ChannelValueMappingRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [channelType, setChannelType] = useState(mapping?.channelType ?? "shopify");
  const [masterFieldName, setMasterFieldName] = useState(mapping?.masterFieldName ?? "");
  const [channelFieldName, setChannelFieldName] = useState(mapping?.channelFieldName ?? "");
  const [fallbackStrategy, setFallbackStrategy] = useState<FallbackStrategy>(mapping?.fallbackStrategy ?? "PROMPT_USER");
  const [rows, setRows] = useState<ValueMappingEntry[]>(
    mapping?.mappings.length ? mapping.mappings.map((m) => ({ ...m })) : [{ masterValue: "", channelValue: "", channelLabel: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (i: number, patch: Partial<ValueMappingEntry>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { masterValue: "", channelValue: "", channelLabel: "" }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const validRows = rows.filter((r) => r.masterValue.trim() && r.channelValue.trim());
  const canSave = channelType && masterFieldName.trim() && channelFieldName.trim() && validRows.length > 0 && !saving;

  async function handleSubmit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        channelType,
        masterFieldName: masterFieldName.trim(),
        channelFieldName: channelFieldName.trim(),
        fallbackStrategy,
        mappings: validRows.map((r) => ({
          masterValue: r.masterValue.trim(),
          channelValue: r.channelValue.trim(),
          channelLabel: r.channelLabel?.trim() || undefined,
        })),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {mode === "create" ? "Add Value Mapping" : "Edit Value Mapping"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Master value → channel value (mis. material “cotton” → kode channel).
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Channel</label>
              <select
                value={channelType}
                onChange={(e) => setChannelType(e.target.value)}
                disabled={mode === "edit"}
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-60"
              >
                {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Master field</label>
              <input
                value={masterFieldName}
                onChange={(e) => setMasterFieldName(e.target.value)}
                disabled={mode === "edit"}
                placeholder="mis. color"
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Channel field</label>
              <input
                value={channelFieldName}
                onChange={(e) => setChannelFieldName(e.target.value)}
                placeholder="mis. colour_id"
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono"
              />
            </div>
          </div>
          {mode === "edit" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Channel & master field bersifat identitas — tidak bisa diubah saat edit.
            </p>
          )}

          {/* Value pairs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Value mappings ({validRows.length} valid)
              </label>
              <button onClick={addRow} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                <PlusIcon /> Add row
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] text-gray-400 px-1">
                <span>Master value</span>
                <span>Channel value</span>
                <span>Channel label (opsional)</span>
                <span />
              </div>
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <input value={row.masterValue} onChange={(e) => updateRow(i, { masterValue: e.target.value })}
                    placeholder="black"
                    className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono" />
                  <input value={row.channelValue} onChange={(e) => updateRow(i, { channelValue: e.target.value })}
                    placeholder="COLOUR_0001"
                    className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono" />
                  <input value={row.channelLabel ?? ""} onChange={(e) => updateRow(i, { channelLabel: e.target.value })}
                    placeholder="Black"
                    className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Remove row">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Fallback strategy */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Fallback strategy</label>
            <select value={fallbackStrategy} onChange={(e) => setFallbackStrategy(e.target.value as FallbackStrategy)}
              className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {FALLBACK_STRATEGIES.map((s) => <option key={s} value={s}>{FALLBACK_LABELS[s]}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">{FALLBACK_DESCRIPTIONS[fallbackStrategy]}</p>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!canSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            {saving ? "Saving…" : mode === "create" ? "Create mapping" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
