"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChannelFieldMapping,
  MappingStrategy,
  STRATEGY_LABELS,
  CreateMappingRequest,
  UpdateMappingRequest,
} from "../_types/channel-field-mapping";
import { ChannelFieldMappingService } from "../_services/channel-field-mapping.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import AddEditMappingModal from "./AddEditMappingModal";

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
const ArrowRightIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-7-7 7 7-7 7"/>
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
const MappingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/>
    <path d="m14 3 6 6h-6V3z"/><path d="M8 13h8M8 17h5"/>
  </svg>
);

// ─── Strategy badge ────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<MappingStrategy, string> = {
  EXACT_OVERRIDE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  EXACT:          "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  SEMANTIC:       "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  EXCLUDE:        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  EXCLUDE_SOURCE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function StrategyBadge({ strategy }: { strategy: MappingStrategy }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${STRATEGY_COLORS[strategy]}`}>
      {STRATEGY_LABELS[strategy]}
    </span>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  amazon:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ebay:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  walmart:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  shopify:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  wix:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tiktok:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  lazada:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  facebook:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shopee:    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function ChannelBadge({ channelId }: { channelId: string }) {
  const color = CHANNEL_COLORS[channelId] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>
      {CHANNEL_TYPE_LABELS[channelId] ?? channelId}
    </span>
  );
}

// ─── Mapping row ───────────────────────────────────────────────────────────────

function MappingRow({
  mapping,
  onEdit,
  onDeactivate,
  onActivate,
  onDelete,
}: {
  mapping: ChannelFieldMapping;
  onEdit: (m: ChannelFieldMapping) => void;
  onDeactivate: (m: ChannelFieldMapping) => void;
  onActivate: (m: ChannelFieldMapping) => void;
  onDelete: (m: ChannelFieldMapping) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const isExclude = mapping.mappingStrategy === "EXCLUDE" || mapping.mappingStrategy === "EXCLUDE_SOURCE";

  function formatDate(s: string) {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return s; }
  }

  return (
    <>
      <tr className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${!mapping.isActive ? "opacity-60" : ""}`}>

        {/* Channel */}
        <td className="px-3 py-2.5">
          <ChannelBadge channelId={mapping.channelId} />
        </td>

        {/* source → target */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <code className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded truncate max-w-[120px]" title={mapping.sourceField}>
              {mapping.sourceField}
            </code>
            <span className="text-gray-400 shrink-0"><ArrowRightIcon /></span>
            <code className={`text-xs font-mono px-1.5 py-0.5 rounded truncate max-w-[140px] ${
              isExclude
                ? "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 line-through"
                : "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20"
            }`} title={mapping.targetField}>
              {mapping.targetField}
            </code>
          </div>
        </td>

        {/* Strategy */}
        <td className="px-3 py-2.5">
          <StrategyBadge strategy={mapping.mappingStrategy} />
        </td>

        {/* Confidence + Required */}
        <td className="px-3 py-2.5 text-center">
          {isExclude ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <span className={`text-xs font-medium ${
              mapping.confidence >= 95 ? "text-green-600 dark:text-green-400" :
              mapping.confidence >= 80 ? "text-yellow-600 dark:text-yellow-400" :
              "text-red-500"
            }`}>
              {mapping.confidence.toFixed(0)}%
            </span>
          )}
          {mapping.isRequired && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              req
            </span>
          )}
        </td>

        {/* Stats */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              <span className={`font-medium ${mapping.successRate >= 90 ? "text-green-600 dark:text-green-400" : "text-yellow-600"}`}>
                {mapping.successRate.toFixed(0)}%
              </span>
              {" "}rate
            </span>
            <span className="text-xs text-gray-400">{mapping.usageCount.toLocaleString()} uses</span>
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          {mapping.isActive ? (
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
          {formatDate(mapping.updatedAt)}
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            {/* Expand */}
            <button onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              title="View details">
              <div className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
                <ChevronDownIcon />
              </div>
            </button>

            {/* Edit — only active */}
            {mapping.isActive && (
              <button onClick={() => onEdit(mapping)}
                className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                title="Edit mapping">
                <EditIcon />
              </button>
            )}

            {/* Deactivate / Activate */}
            {mapping.isActive ? (
              confirmDeactivate ? (
                <span className="flex items-center gap-1">
                  <button onClick={() => { setConfirmDeactivate(false); onDeactivate(mapping); }}
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
              <button onClick={() => onActivate(mapping)}
                className="px-2 py-1 text-xs rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 transition-colors">
                Activate
              </button>
            )}

            {/* Delete — triggers parent confirm modal */}
            <button onClick={() => onDelete(mapping)}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors"
              title="Hard delete">
              <TrashIcon />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <DetailItem label="Source Aliases"
                  value={mapping.sourceAliases.length > 0 ? mapping.sourceAliases.join(", ") : "—"} mono />
                <DetailItem label="Target Aliases"
                  value={mapping.targetAliases.length > 0 ? mapping.targetAliases.join(", ") : "—"} mono />
                <DetailItem label="Description"
                  value={mapping.description || "—"} />
              </div>
              <div className="space-y-2">
                <DetailItem label="Success Rate" value={`${mapping.successRate.toFixed(2)}% (learned, read-only)`} />
                <DetailItem label="Usage Count" value={`${mapping.usageCount.toLocaleString()} publishes (learned, read-only)`} />
                <DetailItem label="Created" value={mapping.createdAt ? new Date(mapping.createdAt).toLocaleString() : "—"} />
                <DetailItem label="ID" value={mapping.id} mono />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 shrink-0 w-28">{label}</span>
      <span className={`text-gray-700 dark:text-gray-300 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  mapping,
  onConfirm,
  onCancel,
}: {
  mapping: ChannelFieldMapping;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Hard Delete Mapping</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          This permanently deletes the mapping and cannot be undone. JOLT specs for{" "}
          <strong>{CHANNEL_TYPE_LABELS[mapping.channelId] ?? mapping.channelId}</strong> will be invalidated.
        </p>
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-700 dark:text-gray-300 mb-4">
          {mapping.sourceField} → {mapping.targetField}
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-5">
          Consider using <strong>Deactivate</strong> instead for audit-safe soft removal.
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

const STRATEGIES: Array<MappingStrategy | "all"> = [
  "all", "EXACT_OVERRIDE", "EXACT", "SEMANTIC", "EXCLUDE", "EXCLUDE_SOURCE",
];

export default function ChannelFieldMappingsPage() {
  const [mappings, setMappings]         = useState<ChannelFieldMapping[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<MappingStrategy | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [search, setSearch]             = useState("");
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [modal, setModal]               = useState<{ mode: "create" | "edit"; mapping?: ChannelFieldMapping } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChannelFieldMapping | null>(null);
  const [toast, setToast]               = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Do not pass isActive — the admin endpoint returns all records regardless of status.
      // Status filtering (active / inactive / all) is done client-side, matching the pattern
      // used by MasterAttributesPage and ChannelCategorySchemasPage.
      const data = await ChannelFieldMappingService.listMappings({
        channelId: channelFilter !== "all" ? channelFilter : undefined,
      });
      setMappings(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [channelFilter]);

  useEffect(() => { load(); }, [load]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave(data: CreateMappingRequest | UpdateMappingRequest) {
    if (modal?.mode === "create") {
      await ChannelFieldMappingService.createMapping(data as CreateMappingRequest);
      showToast("Mapping created. JOLT specs for this channel invalidated.", "success");
    } else if (modal?.mapping) {
      await ChannelFieldMappingService.updateMapping(modal.mapping.id, data as UpdateMappingRequest);
      showToast("Mapping updated. JOLT specs invalidated.", "success");
    }
    load();
  }

  async function handleDeactivate(m: ChannelFieldMapping) {
    try {
      await ChannelFieldMappingService.deactivateMapping(m.id);
      showToast("Mapping deactivated. JOLT specs invalidated.", "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleActivate(m: ChannelFieldMapping) {
    try {
      await ChannelFieldMappingService.activateMapping(m.id);
      showToast("Mapping re-activated. JOLT specs invalidated.", "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleDelete(m: ChannelFieldMapping) {
    try {
      await ChannelFieldMappingService.deleteMapping(m.id);
      setDeleteTarget(null);
      showToast("Mapping permanently deleted.", "success");
      load();
    } catch (err) {
      setDeleteTarget(null);
      showToast((err as Error).message, "error");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return mappings
      .filter((m) => {
        if (statusFilter === "active"   && !m.isActive) return false;
        if (statusFilter === "inactive" && m.isActive)  return false;
        if (strategyFilter !== "all" && m.mappingStrategy !== strategyFilter) return false;
        if (requiredOnly && !m.isRequired) return false;
        if (q && !m.sourceField.toLowerCase().includes(q)
               && !m.targetField.toLowerCase().includes(q)
               && !m.description?.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // Active first, then by channel, then by source field
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.channelId !== b.channelId) return a.channelId.localeCompare(b.channelId);
        return a.sourceField.localeCompare(b.sourceField);
      });
  }, [mappings, statusFilter, strategyFilter, requiredOnly, search]);

  const activeCount    = mappings.filter((m) => m.isActive).length;
  const overrideCount  = mappings.filter((m) => m.mappingStrategy === "EXACT_OVERRIDE" && m.isActive).length;
  const channelCount   = new Set(mappings.filter((m) => m.isActive).map((m) => m.channelId)).size;

  return (
    <div className="p-6 space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[10000] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400">
            <MappingIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Channel Field Mappings
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              APM Tier 1 — CHANNEL_SPECIFIC mappings (highest confidence ~95%)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
            <RefreshIcon />
          </button>
          <button onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <PlusIcon />
            Add Mapping
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Active" value={activeCount} />
        <StatCard label="Exact Overrides" value={overrideCount} accent="purple" />
        <StatCard label="Channels Covered" value={channelCount} accent="blue" />
        <StatCard label="Showing" value={filtered.length} accent="gray" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <div className="text-purple-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-purple-800 dark:text-purple-300 space-y-0.5">
          <p>
            <strong>APM Tier 1 — CHANNEL_SPECIFIC (~95% confidence).</strong> When a Tier 1 mapping is wrong,
            every publish for that channel uses the wrong transformation — systematically. Use{" "}
            <strong>EXACT_OVERRIDE</strong> to fix incorrect learned mappings instantly.
          </p>
          <p>
            Every mutation (create, update, deactivate, activate, delete) automatically invalidates all
            JOLT specs for the affected channel. The next publish regenerates them with the updated mapping.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Channel */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Channel:</span>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="all">All</option>
            {Object.entries(CHANNEL_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Strategy */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Strategy:</span>
          <select value={strategyFilter} onChange={(e) => setStrategyFilter(e.target.value as MappingStrategy | "all")}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All strategies" : STRATEGY_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Status toggle */}
        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {(["active", "all", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>
              {s}
            </button>
          ))}
        </div>

        {/* Required only */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={requiredOnly} onChange={(e) => setRequiredOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
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
        <EmptyState onAdd={() => setModal({ mode: "create" })} hasFilters={!!(search || strategyFilter !== "all" || requiredOnly || statusFilter !== "active")} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channel</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Source → Target</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Strategy</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Conf.</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Stats</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Updated</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  onEdit={(x) => setModal({ mode: "edit", mapping: x })}
                  onDeactivate={handleDeactivate}
                  onActivate={handleActivate}
                  onDelete={(x) => setDeleteTarget(x)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <AddEditMappingModal
          mode={modal.mode}
          mapping={modal.mapping}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          mapping={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "purple" | "blue" | "gray" }) {
  const color =
    accent === "purple" ? "text-purple-600 dark:text-purple-400" :
    accent === "blue"   ? "text-blue-600 dark:text-blue-400" :
    accent === "gray"   ? "text-gray-500 dark:text-gray-400" :
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
        <MappingIcon />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {hasFilters ? "No mappings match your filters" : "No field mappings yet"}
      </p>
      {!hasFilters && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
            Add APM Tier 1 mappings to explicitly control field transformation for each channel. Start with EXACT_OVERRIDE to fix any incorrect learned mappings.
          </p>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <PlusIcon />
            Add First Mapping
          </button>
        </>
      )}
    </div>
  );
}
