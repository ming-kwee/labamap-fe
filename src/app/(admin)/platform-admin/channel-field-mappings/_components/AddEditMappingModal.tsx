"use client";

import React, { useState } from "react";
import {
  ChannelFieldMapping,
  MappingStrategy,
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
  CreateMappingRequest,
  UpdateMappingRequest,
} from "../_types/channel-field-mapping";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

const STRATEGIES: MappingStrategy[] = [
  "EXACT_OVERRIDE",
  "EXACT",
  "SEMANTIC",
  "EXCLUDE",
  "EXCLUDE_SOURCE",
];

const CHANNEL_TYPES = Object.keys(CHANNEL_TYPE_LABELS);

interface AddEditMappingModalProps {
  mode: "create" | "edit";
  mapping?: ChannelFieldMapping;
  onSave: (data: CreateMappingRequest | UpdateMappingRequest) => Promise<void>;
  onClose: () => void;
}

function parseAliases(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function formatAliases(arr: string[]): string {
  return arr.join(", ");
}

export default function AddEditMappingModal({
  mode,
  mapping,
  onSave,
  onClose,
}: AddEditMappingModalProps) {
  // Create-only fields
  const [channelId, setChannelId]     = useState(mapping?.channelId   ?? "shopify");
  const [sourceField, setSourceField] = useState(mapping?.sourceField ?? "");
  const [targetField, setTargetField] = useState(mapping?.targetField ?? "");

  // Shared editable fields
  const [sourceAliasesRaw, setSourceAliasesRaw] = useState(
    formatAliases(mapping?.sourceAliases ?? [])
  );
  const [targetAliasesRaw, setTargetAliasesRaw] = useState(
    formatAliases(mapping?.targetAliases ?? [])
  );
  const [strategy, setStrategy] = useState<MappingStrategy>(
    mapping?.mappingStrategy ?? "EXACT_OVERRIDE"
  );
  const [confidence, setConfidence] = useState(
    String(mapping?.confidence ?? 99)
  );
  const [isRequired, setIsRequired] = useState(mapping?.isRequired ?? false);
  const [description, setDescription] = useState(mapping?.description ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExcludeStrategy = strategy === "EXCLUDE" || strategy === "EXCLUDE_SOURCE";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const conf = parseFloat(confidence);
    if (isNaN(conf) || conf < 0 || conf > 100) {
      setError("Confidence must be a number between 0 and 100.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const req: CreateMappingRequest = {
          channelId,
          sourceField: sourceField.trim(),
          targetField: targetField.trim(),
          sourceAliases: parseAliases(sourceAliasesRaw),
          targetAliases: parseAliases(targetAliasesRaw),
          mappingStrategy: strategy,
          confidence: conf,
          isRequired,
          description: description.trim() || undefined,
        };
        await onSave(req);
      } else {
        const req: UpdateMappingRequest = {
          sourceAliases: parseAliases(sourceAliasesRaw),
          targetAliases: parseAliases(targetAliasesRaw),
          mappingStrategy: strategy,
          confidence: conf,
          isRequired,
          description: description.trim() || undefined,
        };
        await onSave(req);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
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
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {mode === "create" ? "Add Field Mapping" : "Edit Field Mapping"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {mode === "create"
                ? "New APM Tier 1 mapping — JOLT specs will be invalidated on save"
                : "channelId, sourceField, and targetField are immutable after creation"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Identity — create: editable, edit: read-only display */}
            {mode === "create" ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Channel <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    required
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CHANNEL_TYPES.map((ct) => (
                      <option key={ct} value={ct}>{CHANNEL_TYPE_LABELS[ct]}</option>
                    ))}
                  </select>
                </div>
                <div />
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source Field <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={sourceField}
                    onChange={(e) => setSourceField(e.target.value)}
                    required
                    placeholder="e.g. name, price, barcode"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Master product field name</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Target Field <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={targetField}
                    onChange={(e) => setTargetField(e.target.value)}
                    required
                    placeholder="e.g. product.title, product.variants[0].price"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Channel API field path (dot-notation)</p>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-24 shrink-0">Channel</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {CHANNEL_TYPE_LABELS[mapping?.channelId ?? ""] ?? mapping?.channelId}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-24 shrink-0">Source Field</span>
                  <code className="font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                    {mapping?.sourceField}
                  </code>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-24 shrink-0">Target Field</span>
                  <code className="font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                    {mapping?.targetField}
                  </code>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 pt-0.5">
                  These fields are immutable. To change them, delete this mapping and create a new one.
                </p>
              </div>
            )}

            {/* Strategy */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mapping Strategy <span className="text-red-500">*</span>
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as MappingStrategy)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STRATEGIES.map((s) => (
                  <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{STRATEGY_DESCRIPTIONS[strategy] ?? ""}</p>
            </div>

            {/* Confidence + Required */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confidence (0–100)
                </label>
                <input
                  type="number"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  min={0}
                  max={100}
                  step={0.1}
                  disabled={isExcludeStrategy}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {isExcludeStrategy && (
                  <p className="text-xs text-gray-400 mt-1">Not applicable for exclude strategies</p>
                )}
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Required mapping</span>
                    <p className="text-xs text-gray-400">Always inject into JOLT even without source match</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Aliases */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Source Aliases
                </label>
                <input
                  type="text"
                  value={sourceAliasesRaw}
                  onChange={(e) => setSourceAliasesRaw(e.target.value)}
                  placeholder="product_name, item_name, productName"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated alternative source field names</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Target Aliases
                </label>
                <input
                  type="text"
                  value={targetAliasesRaw}
                  onChange={(e) => setTargetAliasesRaw(e.target.value)}
                  placeholder="title, productTitle"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated alternative target paths</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Override semantic matching — map name directly to product.title"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Saving will invalidate all JOLT specs for this channel.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                {saving ? "Saving…" : mode === "create" ? "Create Mapping" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
