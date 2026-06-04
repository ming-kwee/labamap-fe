"use client";

import React, { useState } from "react";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

const CHANNEL_TYPES = Object.keys(CHANNEL_TYPE_LABELS);

interface Props {
  onConfirm: (channelId: string, organizationId?: string) => Promise<void>;
  onClose: () => void;
}

export default function BulkDeleteModal({ onConfirm, onClose }: Props) {
  const [channelId, setChannelId]       = useState(CHANNEL_TYPES[0] ?? "shopify");
  const [orgId,     setOrgId]           = useState("");
  const [confirmed, setConfirmed]       = useState(false);
  const [deleting,  setDeleting]        = useState(false);
  const [error,     setError]           = useState<string | null>(null);

  async function handleDelete() {
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(channelId, orgId.trim() || undefined);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Bulk Clear JOLT Specs</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Deletes all cached JOLT specs for the selected channel. The next publish or analyse call will regenerate fresh specs via APM using the current field mappings and schema.
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel <span className="text-red-500">*</span>
            </label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {CHANNEL_TYPES.map((ct) => (
                <option key={ct} value={ct}>{CHANNEL_TYPE_LABELS[ct]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Organization ID <span className="text-gray-400">(optional)</span>
            </label>
            <input type="text" value={orgId} onChange={(e) => setOrgId(e.target.value)}
              placeholder="Leave blank to clear system defaults + all orgs"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="px-3 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
          <p className="text-xs text-red-700 dark:text-red-400 font-medium mb-0.5">This action cannot be undone.</p>
          <p className="text-xs text-red-600 dark:text-red-400">
            All merchants using <strong>{CHANNEL_TYPE_LABELS[channelId] ?? channelId}</strong> will incur a slight delay on their next publish while APM regenerates their specs.
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none mb-4">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            I understand this will force APM regeneration on next publish
          </span>
        </label>

        {error && (
          <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={!confirmed || deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
            {deleting ? "Deleting…" : "Bulk Delete Specs"}
          </button>
        </div>
      </div>
    </div>
  );
}
