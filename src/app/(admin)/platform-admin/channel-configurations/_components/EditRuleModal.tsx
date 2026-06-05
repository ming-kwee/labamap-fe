"use client";

import React, { useState, useEffect } from "react";
import { PostProcessingRule } from "../_types/channel-configuration";

interface Props {
  channelName: string;
  existing?: PostProcessingRule;
  onSave: (rule: PostProcessingRule) => Promise<void>;
  onClose: () => void;
}

export default function EditRuleModal({ channelName, existing, onSave, onClose }: Props) {
  const [name,         setName]         = useState(existing?.name    ?? "");
  const [enabled,      setEnabled]      = useState(existing?.enabled ?? true);
  const [opsRaw,       setOpsRaw]       = useState(
    existing ? JSON.stringify(existing.operations, null, 2) : "[\n  \n]"
  );
  const [jsonError,    setJsonError]    = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(opsRaw);
      setJsonError(Array.isArray(parsed) ? null : "Must be a JSON array of operation objects");
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [opsRaw]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jsonError) return;
    setSaving(true);
    setError(null);
    try {
      const ops = JSON.parse(opsRaw) as PostProcessingRule["operations"];
      await onSave({ name: name.trim(), enabled, operations: ops });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {existing ? "Edit Post-Processing Rule" : "Add Post-Processing Rule"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{channelName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rule Name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  placeholder="e.g. enrich_images, concat_variants"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500" />
                <p className="text-xs text-gray-400 mt-1">Unique per channel. Used as the upsert key.</p>
              </div>
              <div className="pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</span>
                    <p className="text-xs text-gray-400">Disabled rules are skipped during publish post-processing</p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Operations (JSON array) <span className="text-red-500">*</span>
                </label>
                {jsonError && <span className="text-xs text-red-500">{jsonError}</span>}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Each operation needs a <code className="font-mono">type</code> field — e.g.
                <code className="font-mono mx-1">ENRICH_IMAGES</code>,
                <code className="font-mono mx-1">CONCAT_INTO</code>,
                <code className="font-mono mx-1">GENERATE_OPTIONS</code>.
              </p>
              <textarea value={opsRaw} onChange={(e) => setOpsRaw(e.target.value)}
                rows={12} spellCheck={false}
                className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${
                  jsonError ? "border-red-400 focus:ring-red-400" : "border-gray-300 dark:border-gray-600 focus:ring-slate-500"
                }`} />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !!jsonError}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
              {saving ? "Saving…" : existing ? "Update Rule" : "Add Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
