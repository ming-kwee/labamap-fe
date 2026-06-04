"use client";

import React, { useState, useEffect } from "react";
import { ChannelJoltSpec } from "../_types/channel-jolt-spec";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

interface Props {
  spec: ChannelJoltSpec;
  onSave: (joltSpec: unknown[], markAsManuallyConfigured: boolean) => Promise<void>;
  onClose: () => void;
}

export default function EditJoltSpecModal({ spec, onSave, onClose }: Props) {
  const [joltRaw,       setJoltRaw]       = useState(JSON.stringify(spec.joltSpec, null, 2));
  const [jsonError,     setJsonError]     = useState<string | null>(null);
  const [manualLock,    setManualLock]    = useState(spec.joltMetadata.isManuallyConfigured ?? false);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(joltRaw);
      if (!Array.isArray(parsed)) {
        setJsonError("Must be a JSON array of JOLT operations");
      } else {
        setJsonError(null);
      }
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [joltRaw]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jsonError) return;
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(joltRaw) as unknown[];
      await onSave(parsed, manualLock);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const channelLabel = CHANNEL_TYPE_LABELS[spec.channelId] ?? spec.channelId;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit JOLT Spec</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{channelLabel}</span>
              <span>/</span>
              <span className="font-mono">{spec.categoryId ?? "default"}</span>
              {spec.organizationId && <><span>/</span><span className="font-mono">{spec.organizationId}</span></>}
              {spec.joltMetadata.mappingCount != null && (
                <span className="ml-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500">{spec.joltMetadata.mappingCount} mappings</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Manual lock toggle */}
            <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
              manualLock
                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            }`}>
              <input type="checkbox" id="manualLock" checked={manualLock}
                onChange={(e) => setManualLock(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
              <label htmlFor="manualLock" className="cursor-pointer">
                <span className={`text-sm font-medium block ${manualLock ? "text-amber-800 dark:text-amber-300" : "text-gray-700 dark:text-gray-300"}`}>
                  Protect from APM overwrite (manually configured)
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 block">
                  {manualLock
                    ? "APM will skip regenerating this spec on future analyse calls. Uncheck to allow APM to auto-update it again."
                    : "APM may overwrite this spec the next time analyse is run for this channel/category. Check to prevent that."}
                </span>
              </label>
            </div>

            {/* JOLT spec editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  JOLT Spec (JSON array) <span className="text-red-500">*</span>
                </label>
                {jsonError && <span className="text-xs text-red-500">{jsonError}</span>}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Array of JOLT operation objects. Each object must have an <code className="font-mono">operation</code> key
                (e.g. <code className="font-mono">shift</code>, <code className="font-mono">default</code>, <code className="font-mono">remove</code>).
              </p>
              <textarea
                value={joltRaw}
                onChange={(e) => setJoltRaw(e.target.value)}
                rows={20}
                spellCheck={false}
                className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${
                  jsonError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
                }`}
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {manualLock
                ? "Saving will lock this spec — APM will not overwrite it."
                : "Saving without lock — APM may overwrite on next analyse."}
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !!jsonError}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                {saving ? "Saving…" : "Save Spec"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
