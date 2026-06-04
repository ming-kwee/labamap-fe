"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FieldSemanticKnowledge,
  CreateKnowledgeRequest,
  UpdateKnowledgeRequest,
  KNOWN_CATEGORIES,
  KNOWN_SEMANTIC_TYPES,
} from "../_types/field-semantic-knowledge";
import { FieldSemanticKnowledgeService } from "../_services/field-semantic-knowledge.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import AddEditKnowledgeModal from "./AddEditKnowledgeModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
  </svg>
);
const BrainIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

// ─── Category + SemanticType badges ───────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  product:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  variant:  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  media:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  pricing:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  shipping: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {category}
    </span>
  );
}

function SemanticTypeBadge({ type }: { type: string }) {
  const isKnown = KNOWN_SEMANTIC_TYPES.includes(type as never);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono whitespace-nowrap ${
      isKnown
        ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
    }`}>
      {type}
    </span>
  );
}

// ─── Knowledge row ─────────────────────────────────────────────────────────────

function KnowledgeRow({
  entry, onEdit, onDeactivate, onActivate, onDelete,
}: {
  entry: FieldSemanticKnowledge;
  onEdit: (e: FieldSemanticKnowledge) => void;
  onDeactivate: (e: FieldSemanticKnowledge) => void;
  onActivate: (e: FieldSemanticKnowledge) => void;
  onDelete: (e: FieldSemanticKnowledge) => void;
}) {
  const [expanded, setExpanded]               = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function formatDate(s: string) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  const channelLabel = entry.validChannels.length === 0
    ? "all channels"
    : entry.validChannels.map((c) => CHANNEL_TYPE_LABELS[c] ?? c).join(", ");

  return (
    <>
      <tr className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${!entry.isActive ? "opacity-60" : ""}`}>

        {/* fieldName + category */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <code className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200">{entry.fieldName}</code>
            <CategoryBadge category={entry.category} />
          </div>
        </td>

        {/* semanticType */}
        <td className="px-3 py-2.5">
          <SemanticTypeBadge type={entry.semanticType} />
        </td>

        {/* Confidence */}
        <td className="px-3 py-2.5 text-center">
          <span className={`text-xs font-medium ${
            entry.baseConfidence >= 90 ? "text-green-600 dark:text-green-400" :
            entry.baseConfidence >= 75 ? "text-yellow-600 dark:text-yellow-400" :
            "text-red-500"
          }`}>
            {entry.baseConfidence.toFixed(0)}%
          </span>
        </td>

        {/* Aliases count */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span>{entry.aliases.length} aliases</span>
            <span>{entry.keywords.length} keywords</span>
            <span>{entry.commonPatterns.length} patterns</span>
          </div>
        </td>

        {/* Flags */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            {entry.isCommon && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                common
              </span>
            )}
            {entry.isRequired && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                required
              </span>
            )}
          </div>
        </td>

        {/* Channels */}
        <td className="px-3 py-2.5">
          <span className={`text-xs ${entry.validChannels.length === 0 ? "text-gray-400 italic" : "text-gray-600 dark:text-gray-300"}`}>
            {channelLabel}
          </span>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          {entry.isActive ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />Inactive
            </span>
          )}
        </td>

        {/* Updated */}
        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
          {formatDate(entry.updatedAt)}
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              title="Expand">
              <div className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
                <ChevronDownIcon />
              </div>
            </button>
            {entry.isActive && (
              <button onClick={() => onEdit(entry)}
                className="p-1.5 rounded hover:bg-teal-50 dark:hover:bg-teal-900/30 text-teal-600 dark:text-teal-400 transition-colors"
                title="Edit">
                <EditIcon />
              </button>
            )}
            {entry.isActive ? (
              confirmDeactivate ? (
                <span className="flex items-center gap-1">
                  <button onClick={() => { setConfirmDeactivate(false); onDeactivate(entry); }}
                    className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium transition-colors">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDeactivate(false)}
                    className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDeactivate(true)}
                  className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">
                  Deactivate
                </button>
              )
            ) : (
              <button onClick={() => onActivate(entry)}
                className="px-2 py-1 text-xs rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 transition-colors">
                Activate
              </button>
            )}
            <button onClick={() => onDelete(entry)}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors"
              title="Hard delete">
              <TrashIcon />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded */}
      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={9} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <ExpandItem label="Aliases"
                  value={entry.aliases.length > 0 ? entry.aliases.join(", ") : "—"} mono />
                <ExpandItem label="Keywords"
                  value={entry.keywords.length > 0 ? entry.keywords.join(", ") : "—"} mono />
                <ExpandItem label="Description" value={entry.description || "—"} />
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="text-gray-400 shrink-0 w-28">Patterns</span>
                  {entry.commonPatterns.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {entry.commonPatterns.map((p, i) => (
                        <code key={i} className="font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                          {p}
                        </code>
                      ))}
                    </div>
                  ) : <span className="text-gray-400">—</span>}
                </div>
                <ExpandItem label="Data Type" value={entry.dataType} />
                {entry.usageCount !== undefined && (
                  <ExpandItem label="Usage Count" value={`${entry.usageCount.toLocaleString()} APM calls (learned, read-only)`} />
                )}
                {entry.successRate !== undefined && (
                  <ExpandItem label="Success Rate" value={`${entry.successRate.toFixed(2)}% (learned, read-only)`} />
                )}
                <ExpandItem label="ID" value={entry.id} mono />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 shrink-0 w-28">{label}</span>
      <span className={`text-gray-700 dark:text-gray-300 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  entry, onConfirm, onCancel,
}: {
  entry: FieldSemanticKnowledge;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Hard Delete Entry</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Permanently removes <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{entry.fieldName}</code> from the APM knowledge base. Cannot be undone.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-5">
          Consider using <strong>Deactivate</strong> instead — it keeps the entry for audit and can be re-activated.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function FieldSemanticKnowledgePage() {
  const [entries, setEntries]           = useState<FieldSemanticKnowledge[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "inactive">("all");
  const [commonOnly, setCommonOnly]     = useState(false);
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [modal, setModal]               = useState<{ mode: "create" | "edit"; entry?: FieldSemanticKnowledge } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FieldSemanticKnowledge | null>(null);
  const [toast, setToast]               = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await FieldSemanticKnowledgeService.listEntries();
      setEntries(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave(data: CreateKnowledgeRequest | UpdateKnowledgeRequest) {
    if (modal?.mode === "create") {
      await FieldSemanticKnowledgeService.createEntry(data as CreateKnowledgeRequest);
      showToast("Entry created. APM will use it on the next analyse call.", "success");
    } else if (modal?.entry) {
      await FieldSemanticKnowledgeService.updateEntry(modal.entry.id, data as UpdateKnowledgeRequest);
      showToast("Entry updated. APM will use the new values on the next analyse call.", "success");
    }
    load();
  }

  async function handleDeactivate(e: FieldSemanticKnowledge) {
    try {
      await FieldSemanticKnowledgeService.deactivateEntry(e.id);
      showToast(`"${e.fieldName}" deactivated — APM will skip it in future matching.`, "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleActivate(e: FieldSemanticKnowledge) {
    try {
      await FieldSemanticKnowledgeService.activateEntry(e.id);
      showToast(`"${e.fieldName}" re-activated.`, "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleDelete(e: FieldSemanticKnowledge) {
    try {
      await FieldSemanticKnowledgeService.deleteEntry(e.id);
      setDeleteTarget(null);
      showToast(`"${e.fieldName}" permanently deleted.`, "success");
      load();
    } catch (err) {
      setDeleteTarget(null);
      showToast((err as Error).message, "error");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return entries
      .filter((e) => {
        if (statusFilter === "active"   && !e.isActive) return false;
        if (statusFilter === "inactive" && e.isActive)  return false;
        if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
        if (typeFilter !== "all" && e.semanticType !== typeFilter) return false;
        if (commonOnly   && !e.isCommon)   return false;
        if (requiredOnly && !e.isRequired) return false;
        if (q) {
          const inName    = e.fieldName.toLowerCase().includes(q);
          const inType    = e.semanticType.toLowerCase().includes(q);
          const inAliases = e.aliases.some((a) => a.toLowerCase().includes(q));
          const inKw      = e.keywords.some((k) => k.toLowerCase().includes(q));
          const inDesc    = e.description?.toLowerCase().includes(q) ?? false;
          if (!inName && !inType && !inAliases && !inKw && !inDesc) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.semanticType !== b.semanticType) return a.semanticType.localeCompare(b.semanticType);
        return a.fieldName.localeCompare(b.fieldName);
      });
  }, [entries, statusFilter, categoryFilter, typeFilter, commonOnly, requiredOnly, search]);

  const activeCount   = entries.filter((e) => e.isActive).length;
  const typeCount     = new Set(entries.filter((e) => e.isActive).map((e) => e.semanticType)).size;
  const commonCount   = entries.filter((e) => e.isCommon && e.isActive).length;

  // Build the full type list from loaded data so custom types (e.g. SUSTAINABILITY)
  // appear in the filter dropdown alongside the known ones.
  const allSemanticTypes = useMemo(() => {
    const known = new Set<string>(KNOWN_SEMANTIC_TYPES);
    const custom = entries
      .map((e) => e.semanticType)
      .filter((t) => !known.has(t));
    return [...KNOWN_SEMANTIC_TYPES, ...Array.from(new Set(custom)).sort()];
  }, [entries]);

  return (
    <div className="p-6 space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-[10000] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>{toast.message}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-teal-600 dark:text-teal-400">
            <BrainIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Field Semantic Knowledge
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              APM Tiers 2/3/4 — semantic types, aliases, keywords, and patterns
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
            <RefreshIcon />
          </button>
          <button onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors">
            <PlusIcon />
            Add Entry
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Active" value={activeCount} />
        <StatCard label="Semantic Types" value={typeCount} accent="teal" />
        <StatCard label="Common Fields" value={commonCount} accent="blue" />
        <StatCard label="Showing" value={filtered.length} accent="gray" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
        <div className="text-teal-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-teal-800 dark:text-teal-300 space-y-0.5">
          <p>
            <strong>APM Tiers 2/3/4.</strong> Defines what semantic type a field name belongs to, what aliases it has,
            what keywords match it (Jaccard), and what regex patterns identify it. Changes take effect on
            the <strong>next APM analyse call</strong> — no JOLT invalidation needed.
          </p>
          <p>
            <strong>Tier 2</strong> — semantic type matching (baseConfidence).
            <strong> Tier 3</strong> — exact alias matching.
            <strong> Tier 4</strong> — regex pattern matching.
            <strong> Tier 5</strong> — Jaccard keyword similarity.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields, aliases, keywords…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 w-52 focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Category:</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="all">All</option>
            {KNOWN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Type:</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="all">All types</option>
            {allSemanticTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {(["active", "all", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                statusFilter === s
                  ? "bg-teal-600 text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>{s}</button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={commonOnly} onChange={(e) => setCommonOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Common only</span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={requiredOnly} onChange={(e) => setRequiredOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Required only</span>
        </label>

        <span className="ml-auto text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          onAdd={() => setModal({ mode: "create" })}
          hasFilters={!!(search || categoryFilter !== "all" || typeFilter !== "all" || commonOnly || requiredOnly || statusFilter !== "active")}
        />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Field / Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Semantic Type</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Conf.</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Coverage</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Flags</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channels</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Updated</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <KnowledgeRow
                  key={e.id}
                  entry={e}
                  onEdit={(x) => setModal({ mode: "edit", entry: x })}
                  onDeactivate={handleDeactivate}
                  onActivate={handleActivate}
                  onDelete={(x) => setDeleteTarget(x)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <AddEditKnowledgeModal
          mode={modal.mode}
          entry={modal.entry}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          entry={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "teal" | "blue" | "gray" }) {
  const color =
    accent === "teal" ? "text-teal-600 dark:text-teal-400" :
    accent === "blue" ? "text-blue-600 dark:text-blue-400" :
    accent === "gray" ? "text-gray-500 dark:text-gray-400" :
    "text-gray-800 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ onAdd, hasFilters }: { onAdd: () => void; hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400">
        <BrainIcon />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {hasFilters ? "No entries match your filters" : "No semantic knowledge entries yet"}
      </p>
      {!hasFilters && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
            Add semantic types to teach APM how to recognise and match your product fields across channels.
          </p>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors">
            <PlusIcon />
            Add First Entry
          </button>
        </>
      )}
    </div>
  );
}
