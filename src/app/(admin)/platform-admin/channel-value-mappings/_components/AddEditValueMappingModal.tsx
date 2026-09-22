"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChannelValueMapping,
  ChannelValueMappingRequest,
  FallbackStrategy,
  FALLBACK_DESCRIPTIONS,
  FALLBACK_LABELS,
  FALLBACK_STRATEGIES,
  ValueMappingEntry,
} from "../_types/channel-value-mapping";
import { AttributeService } from "../../../omni-admin/master-attributes/_services/attribute.service";
import type { MasterAttribute } from "../../../omni-admin/master-attributes/_types/attribute";

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
function WandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 4 1.5 1.5M9.5 6.5 4 12l8 8 5.5-5.5M18 2l1 1M20 6l1 1M14 10l7-7" />
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

  // Master-aware assist: load real master attributes so the admin picks a field + its known values
  // instead of blind-typing them. Degrades gracefully to free text if the endpoint is unavailable.
  const [masterAttrs, setMasterAttrs] = useState<MasterAttribute[]>([]);
  useEffect(() => {
    let alive = true;
    AttributeService.listAttributes()
      .then((list) => { if (alive) setMasterAttrs(list ?? []); })
      .catch(() => { /* silent — free-text still works */ });
    return () => { alive = false; };
  }, []);

  // The attribute matching the current master field (by code), if any → drives value autocomplete + coverage.
  const selectedAttr = useMemo(
    () => masterAttrs.find((a) => a.code?.toLowerCase() === masterFieldName.trim().toLowerCase()),
    [masterAttrs, masterFieldName],
  );
  const masterOptionValues = useMemo(
    () => (selectedAttr?.options ?? []).map((o) => o.value).filter(Boolean),
    [selectedAttr],
  );

  const updateRow = (i: number, patch: Partial<ValueMappingEntry>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { masterValue: "", channelValue: "", channelLabel: "" }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  /** Populate one empty row per known master value that isn't already present (keeps typed channel values). */
  const loadAllMasterValues = () => {
    setRows((rs) => {
      const present = new Set(rs.map((r) => r.masterValue.trim().toLowerCase()).filter(Boolean));
      const seeded = masterOptionValues
        .filter((v) => !present.has(v.toLowerCase()))
        .map((v) => ({ masterValue: v, channelValue: "", channelLabel: "" }));
      // drop the initial single blank row if it's still empty
      const base = rs.filter((r) => r.masterValue.trim() || r.channelValue.trim());
      return [...base, ...seeded].length ? [...base, ...seeded] : rs;
    });
  };

  const validRows = rows.filter((r) => r.masterValue.trim() && r.channelValue.trim());
  const canSave = channelType && masterFieldName.trim() && channelFieldName.trim() && validRows.length > 0 && !saving;

  // Coverage: how many of the attribute's known values already have a (valid) channel value.
  const coverage = useMemo(() => {
    if (masterOptionValues.length === 0) return null;
    const mapped = new Set(
      rows.filter((r) => r.masterValue.trim() && r.channelValue.trim())
        .map((r) => r.masterValue.trim().toLowerCase()),
    );
    const done = masterOptionValues.filter((v) => mapped.has(v.toLowerCase())).length;
    return { done, total: masterOptionValues.length };
  }, [masterOptionValues, rows]);

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
              {/* Native combobox: pick a real master attribute (autocomplete) or type a custom code. */}
              <input
                list="cvm-master-fields"
                value={masterFieldName}
                onChange={(e) => setMasterFieldName(e.target.value)}
                disabled={mode === "edit"}
                placeholder="pilih / ketik, mis. material"
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono disabled:opacity-60"
              />
              <datalist id="cvm-master-fields">
                {masterAttrs.map((a) => (
                  <option key={a.code} value={a.code} label={`${a.name}${a.group ? ` · ${a.group}` : ""}`} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Channel field</label>
              <input
                value={channelFieldName}
                onChange={(e) => setChannelFieldName(e.target.value)}
                placeholder="mis. 100157 / colour_id"
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono"
              />
            </div>
          </div>
          {mode === "edit" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Channel & master field bersifat identitas — tidak bisa diubah saat edit.
            </p>
          )}
          {selectedAttr && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Master field cocok: <span className="font-medium text-gray-700 dark:text-gray-300">{selectedAttr.name}</span>
              {masterOptionValues.length > 0 && <> · {masterOptionValues.length} nilai master dikenal</>}
            </p>
          )}

          {/* Value pairs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Value mappings ({validRows.length} valid)
                {coverage && (
                  <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    coverage.done >= coverage.total
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}>
                    {coverage.done}/{coverage.total} nilai master terpetakan
                  </span>
                )}
              </label>
              <div className="flex items-center gap-3">
                {masterOptionValues.length > 0 && (
                  <button onClick={loadAllMasterValues} className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline" title="Isi baris untuk setiap nilai master yang dikenal">
                    <WandIcon /> Muat semua nilai ({masterOptionValues.length})
                  </button>
                )}
                <button onClick={addRow} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  <PlusIcon /> Add row
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] text-gray-400 px-1">
                <span>Master value</span>
                <span>Channel value</span>
                <span>Channel label (opsional)</span>
                <span />
              </div>
              {rows.map((row, i) => {
                const known = masterOptionValues.length > 0
                  && !!row.masterValue.trim()
                  && masterOptionValues.some((v) => v.toLowerCase() === row.masterValue.trim().toLowerCase());
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <input value={row.masterValue} onChange={(e) => updateRow(i, { masterValue: e.target.value })}
                      list={masterOptionValues.length > 0 ? "cvm-master-values" : undefined}
                      placeholder="cotton"
                      className={`border rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono ${
                        known ? "border-green-300 dark:border-green-700/50" : "border-gray-200 dark:border-gray-700"
                      }`} />
                    <input value={row.channelValue} onChange={(e) => updateRow(i, { channelValue: e.target.value })}
                      placeholder="Katun / 1000011"
                      className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono" />
                    <input value={row.channelLabel ?? ""} onChange={(e) => updateRow(i, { channelLabel: e.target.value })}
                      placeholder="Katun"
                      className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
                    <button onClick={() => removeRow(i)} disabled={rows.length === 1}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Remove row">
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}
              {masterOptionValues.length > 0 && (
                <datalist id="cvm-master-values">
                  {(selectedAttr?.options ?? []).map((o) => (
                    <option key={o.value} value={o.value} label={o.label !== o.value ? o.label : undefined} />
                  ))}
                </datalist>
              )}
            </div>
            {coverage && coverage.done < coverage.total && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Belum terpetakan:{" "}
                <span className="font-mono">
                  {masterOptionValues
                    .filter((v) => !rows.some((r) => r.masterValue.trim().toLowerCase() === v.toLowerCase() && r.channelValue.trim()))
                    .join(", ")}
                </span>
              </p>
            )}
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
