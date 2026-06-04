"use client";

import React, { useState } from "react";
import {
  FieldSemanticKnowledge,
  CreateKnowledgeRequest,
  UpdateKnowledgeRequest,
  KNOWN_CATEGORIES,
  KNOWN_DATA_TYPES,
  KNOWN_SEMANTIC_TYPES,
  SEMANTIC_TYPE_DESCRIPTIONS,
} from "../_types/field-semantic-knowledge";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

const ALL_CHANNELS = Object.keys(CHANNEL_TYPE_LABELS);

interface Props {
  mode: "create" | "edit";
  entry?: FieldSemanticKnowledge;
  onSave: (data: CreateKnowledgeRequest | UpdateKnowledgeRequest) => Promise<void>;
  onClose: () => void;
}

function splitList(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function splitLines(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}
function joinList(arr: string[]): string { return arr.join(", "); }
function joinLines(arr: string[]): string { return arr.join("\n"); }

export default function AddEditKnowledgeModal({ mode, entry, onSave, onClose }: Props) {
  const [fieldName,    setFieldName]    = useState(entry?.fieldName    ?? "");
  const [semanticType, setSemanticType] = useState(entry?.semanticType ?? "PRODUCT_NAME");
  const [customType,   setCustomType]   = useState(
    entry?.semanticType && !KNOWN_SEMANTIC_TYPES.includes(entry.semanticType as never)
      ? entry.semanticType : ""
  );
  const [useCustomType, setUseCustomType] = useState(
    !!(entry?.semanticType && !KNOWN_SEMANTIC_TYPES.includes(entry.semanticType as never))
  );
  const [category,      setCategory]      = useState(entry?.category     ?? "product");
  const [dataType,      setDataType]      = useState(entry?.dataType      ?? "string");
  const [baseConfidence, setBaseConfidence] = useState(String(entry?.baseConfidence ?? 85));
  const [aliasesRaw,    setAliasesRaw]    = useState(joinList(entry?.aliases ?? []));
  const [keywordsRaw,   setKeywordsRaw]   = useState(joinList(entry?.keywords ?? []));
  const [patternsRaw,   setPatternsRaw]   = useState(joinLines(entry?.commonPatterns ?? []));
  const [validChannels, setValidChannels] = useState<string[]>(entry?.validChannels ?? []);
  const [isCommon,      setIsCommon]      = useState(entry?.isCommon   ?? false);
  const [isRequired,    setIsRequired]    = useState(entry?.isRequired ?? false);
  const [description,   setDescription]  = useState(entry?.description ?? "");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const resolvedType = useCustomType ? customType.trim() : semanticType;

  function toggleChannel(ch: string) {
    setValidChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const conf = parseFloat(baseConfidence);
    if (isNaN(conf) || conf < 0 || conf > 100) {
      setError("Base confidence must be between 0 and 100.");
      return;
    }
    if (!resolvedType.trim()) {
      setError("Semantic type is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const shared = {
        semanticType:   resolvedType,
        category:       category || undefined,
        dataType:       dataType  || undefined,
        baseConfidence: conf,
        aliases:        splitList(aliasesRaw),
        keywords:       splitList(keywordsRaw),
        commonPatterns: splitLines(patternsRaw),
        validChannels,
        isCommon,
        isRequired,
        description:    description.trim() || undefined,
      };

      if (mode === "create") {
        await onSave({ fieldName: fieldName.trim(), ...shared } as CreateKnowledgeRequest);
      } else {
        await onSave(shared as UpdateKnowledgeRequest);
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
              {mode === "create" ? "Add Semantic Knowledge Entry" : "Edit Semantic Knowledge"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {mode === "create"
                ? "Changes take effect on next APM analysis — no JOLT invalidation needed"
                : "fieldName is immutable. Changes apply on next APM analyse call."}
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

            {/* fieldName */}
            {mode === "create" ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Field Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  required
                  placeholder="e.g. material, sustainability_cert, color"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-400 mt-1">Unique identifier — auto-lowercased. Cannot be changed after creation.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <code className="text-sm font-mono font-medium text-gray-800 dark:text-gray-200">{entry?.fieldName}</code>
                <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">immutable</span>
              </div>
            )}

            {/* Semantic Type + Category + DataType */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Semantic Type <span className="text-red-500">*</span>
                </label>
                {!useCustomType ? (
                  <select
                    value={semanticType}
                    onChange={(e) => setSemanticType(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {KNOWN_SEMANTIC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                    placeholder="e.g. SUSTAINABILITY, WARRANTY_INFO"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                )}
                <button type="button" onClick={() => setUseCustomType((v) => !v)}
                  className="text-xs text-teal-600 dark:text-teal-400 mt-1 hover:underline">
                  {useCustomType ? "← Use known type" : "Custom type →"}
                </button>
                {!useCustomType && semanticType && SEMANTIC_TYPE_DESCRIPTIONS[semanticType] && (
                  <p className="text-xs text-gray-400 mt-0.5">{SEMANTIC_TYPE_DESCRIPTIONS[semanticType]}</p>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {KNOWN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data Type</label>
                  <select value={dataType} onChange={(e) => setDataType(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {KNOWN_DATA_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Base Confidence + Flags */}
            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Base Confidence (0–100)</label>
                <input type="number" value={baseConfidence} onChange={(e) => setBaseConfidence(e.target.value)}
                  min={0} max={100} step={0.5}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <p className="text-xs text-gray-400 mt-1">Starting confidence for Tier 2 matches</p>
              </div>
              <div className="pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isCommon} onChange={(e) => setIsCommon(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Common field</span>
                    <p className="text-xs text-gray-400">Applies across most product types</p>
                  </div>
                </label>
              </div>
              <div className="pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Required</span>
                    <p className="text-xs text-gray-400">Must be mapped in every JOLT spec</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Aliases */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Aliases — Tier 3 (ALIAS_MAPPING)
              </label>
              <input type="text" value={aliasesRaw} onChange={(e) => setAliasesRaw(e.target.value)}
                placeholder="fabric, material_type, cloth_type, materialType"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated. Exact name matches — highest alias confidence.</p>
            </div>

            {/* Keywords */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Keywords — Tier 5 (Jaccard similarity)
              </label>
              <input type="text" value={keywordsRaw} onChange={(e) => setKeywordsRaw(e.target.value)}
                placeholder="material, fabric, cloth, fiber, textile"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated. Used in Jaccard set-similarity scoring.</p>
            </div>

            {/* Patterns */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Common Patterns — Tier 4 (PATTERN_MAPPING)
              </label>
              <textarea value={patternsRaw} onChange={(e) => setPatternsRaw(e.target.value)}
                rows={3} spellCheck={false}
                placeholder={".*material.*\n.*fabric.*\n.*matl.*"}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y" />
              <p className="text-xs text-gray-400 mt-1">One regex pattern per line. Java regex syntax.</p>
            </div>

            {/* Valid Channels */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Valid Channels
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Leave all unchecked = applies to <strong>all</strong> channels.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_CHANNELS.map((ch) => (
                  <label key={ch} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors select-none ${
                    validChannels.includes(ch)
                      ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/20 dark:border-teal-700 dark:text-teal-300"
                      : "bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300"
                  }`}>
                    <input type="checkbox" className="sr-only"
                      checked={validChannels.includes(ch)}
                      onChange={() => toggleChannel(ch)} />
                    {CHANNEL_TYPE_LABELS[ch] ?? ch}
                  </label>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Product material or fabric composition"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <p className="text-xs text-teal-600 dark:text-teal-400">
              No JOLT invalidation — changes apply on the next APM analyse call.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                {saving ? "Saving…" : mode === "create" ? "Create Entry" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
