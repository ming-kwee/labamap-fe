"use client";

import React, { useState, useEffect } from "react";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

type SubDocType = "tree-api" | "attribute-api";

interface Props {
  channelType: string;
  subDocType: SubDocType;
  current: unknown;
  onSave: (parsed: unknown) => Promise<void>;
  onClose: () => void;
}

const LABELS: Record<SubDocType, { title: string; description: string; warning?: string }> = {
  "tree-api": {
    title:       "Edit Tree API Config",
    description: "Full replacement of the treeApiConfig sub-document. Defines how the platform fetches the category tree from this channel.",
    warning:     "Saving will clear the channel_category_cache for this channel across all stores. The next category tree load will fetch fresh data from the updated endpoint.",
  },
  "attribute-api": {
    title:       "Edit Attribute API Config",
    description: "Full replacement of the attributeConfig sub-document. Defines how per-category attributes are fetched for product listing forms.",
  },
};

export default function EditSubDocModal({ channelType, subDocType, current, onSave, onClose }: Props) {
  const [raw,       setRaw]       = useState(JSON.stringify(current ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [apiError,  setApiError]  = useState<string | null>(null);

  const meta = LABELS[subDocType];
  const channelLabel = CHANNEL_TYPE_LABELS[channelType] ?? channelType;

  useEffect(() => {
    try {
      JSON.parse(raw);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [raw]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jsonError) return;
    setSaving(true);
    setApiError(null);
    try {
      const parsed = JSON.parse(raw);
      await onSave(parsed);
      onClose();
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{meta.title}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Channel: <span className="font-medium text-gray-700 dark:text-gray-300">{channelLabel}</span>
              <span className="mx-1.5 text-gray-300 dark:text-gray-600">|</span>
              <code className="font-mono text-gray-500">{channelType}</code>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Description */}
            <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>

            {/* Cache-clear warning for tree-api */}
            {meta.warning && (
              <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <svg className="text-amber-500 shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <path d="M12 9v4"/><path d="M12 17h.01"/>
                </svg>
                <p className="text-xs text-amber-700 dark:text-amber-400">{meta.warning}</p>
              </div>
            )}

            {/* JSON editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  JSON <span className="text-red-500">*</span>
                </label>
                {jsonError && <span className="text-xs text-red-500 font-mono">{jsonError}</span>}
              </div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={22}
                spellCheck={false}
                className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${
                  jsonError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
                }`}
              />
            </div>

            {apiError && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                {apiError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !!jsonError}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
              {saving ? "Saving…" : "Save Config"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
