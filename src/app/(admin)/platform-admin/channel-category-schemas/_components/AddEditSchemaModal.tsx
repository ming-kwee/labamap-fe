"use client";

import React, { useState, useEffect } from "react";
import {
  ChannelCategoryApiSchema,
  CHANNEL_TYPE_LABELS,
} from "../_types/channel-category-schema";

interface AddEditSchemaModalProps {
  mode: "create" | "edit";
  /** Provided in edit mode */
  schema?: ChannelCategoryApiSchema;
  onSave: (data: {
    channelType?: string;
    categorySlug?: string;
    apiSchemaExtension: Record<string, unknown>;
    changeNote: string;
  }) => Promise<void>;
  onClose: () => void;
}

const CHANNEL_TYPES = Object.keys(CHANNEL_TYPE_LABELS);

export default function AddEditSchemaModal({
  mode,
  schema,
  onSave,
  onClose,
}: AddEditSchemaModalProps) {
  const [channelType, setChannelType] = useState(schema?.channelType ?? "amazon");
  const [categorySlug, setCategorySlug] = useState(schema?.categorySlug ?? "");
  const [extensionJson, setExtensionJson] = useState(
    schema ? JSON.stringify(schema.apiSchemaExtension, null, 2) : "{\n  \n}"
  );
  const [changeNote, setChangeNote] = useState(schema?.changeNote ?? "");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      JSON.parse(extensionJson);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [extensionJson]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jsonError) return;
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(extensionJson) as Record<string, unknown>;
      await onSave({
        ...(mode === "create" ? { channelType, categorySlug } : {}),
        apiSchemaExtension: parsed,
        changeNote,
      });
      // Close after successful save — parent should NOT call setModal(null)
      // so this finally block runs before the component unmounts.
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
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {mode === "create" ? "Add Channel Category Schema" : "Edit Schema Extension"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {mode === "create" ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Channel Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={channelType}
                    onChange={(e) => setChannelType(e.target.value)}
                    required
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CHANNEL_TYPES.map((ct) => (
                      <option key={ct} value={ct}>{CHANNEL_TYPE_LABELS[ct]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category Slug <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={categorySlug}
                    onChange={(e) => setCategorySlug(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                    required
                    placeholder="e.g. electronics, clothing, jewelry, baby"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                  {schema?.channelType} / {schema?.categorySlug}
                </span>
                <span className="ml-auto text-xs text-gray-400">v{schema?.version} → will become v{(schema?.version ?? 0) + 1}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Change Note <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                required
                placeholder="e.g. Added ConnectorType field per Amazon SP-API 2024-01 update"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  API Schema Extension (JSON) <span className="text-red-500">*</span>
                </label>
                {jsonError && (
                  <span className="text-xs text-red-500">{jsonError}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Nested JSON object — keys become channel-specific API fields deep-merged onto the base schema.
              </p>
              <textarea
                value={extensionJson}
                onChange={(e) => setExtensionJson(e.target.value)}
                rows={14}
                spellCheck={false}
                className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${
                  jsonError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
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
          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !!jsonError}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {saving ? "Saving…" : mode === "create" ? "Create Schema" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
