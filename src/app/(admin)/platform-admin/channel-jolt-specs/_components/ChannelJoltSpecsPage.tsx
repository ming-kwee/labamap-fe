"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChannelJoltSpec,
  UpdateJoltSpecRequest,
} from "../_types/channel-jolt-spec";
import { ChannelJoltSpecService } from "../_services/channel-jolt-spec.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import EditJoltSpecModal from "./EditJoltSpecModal";
import BulkDeleteModal from "./BulkDeleteModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

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
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
  </svg>
);
const LayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
  </svg>
);
const BulkDeleteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  </svg>
);

// ─── Badges ────────────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  amazon:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ebay:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  walmart:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  shopify:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  wix:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tiktok:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  tiktokshop:"bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
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

const STRATEGY_COLORS: Record<string, string> = {
  CHANNEL_SPECIFIC:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  SEMANTIC_KNOWLEDGE:"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  ALIAS_MAPPING:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PATTERN_MAPPING:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  KEYWORD_MATCHING:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ─── Spec row ──────────────────────────────────────────────────────────────────

function SpecRow({
  spec, onEdit, onDelete,
}: {
  spec: ChannelJoltSpec;
  onEdit: (s: ChannelJoltSpec) => void;
  onDelete: (s: ChannelJoltSpec) => void;
}) {
  const [expanded, setExpanded]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta     = spec.joltMetadata;
  const isLocked = meta.isManuallyConfigured === true;

  function formatDate(s?: string) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">

        {/* Channel / Category */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <ChannelBadge channelId={spec.channelId} />
            <code className="text-xs font-mono text-gray-600 dark:text-gray-400">
              {spec.categoryId ?? "default"}
            </code>
          </div>
        </td>

        {/* Org */}
        <td className="px-3 py-2.5">
          {spec.organizationId ? (
            <code className="text-xs font-mono text-gray-700 dark:text-gray-300">{spec.organizationId}</code>
          ) : (
            <span className="text-xs text-gray-400 italic">system default</span>
          )}
        </td>

        {/* Mappings + Strategy breakdown */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {meta.mappingCount ?? spec.joltSpec.length} mappings
            </span>
            {meta.strategyBreakdown && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(meta.strategyBreakdown).map(([tier, count]) => (
                  <span key={tier}
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${STRATEGY_COLORS[tier] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                    {tierShortLabel(tier)}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>

        {/* Flags */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-1">
            {spec.isSystemDefault && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400">
                system
              </span>
            )}
            {isLocked ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                🔒 protected
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500">
                auto
              </span>
            )}
          </div>
        </td>

        {/* Version + Generated */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
            {meta.version && <span>v{meta.version}</span>}
            <span>{formatDate(meta.generatedAt ?? spec.updatedAt)}</span>
          </div>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors" title="View spec">
              <div className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
                <ChevronDownIcon />
              </div>
            </button>
            <button onClick={() => onEdit(spec)}
              className="p-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors" title="Edit spec">
              <EditIcon />
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-1">
                <button onClick={() => { setConfirmDelete(false); onDelete(spec); }}
                  className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium transition-colors">
                  Confirm
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                  Cancel
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors" title="Delete spec (APM will regenerate)">
                <TrashIcon />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded: full JOLT spec */}
      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              <div className="space-y-1">
                {meta.generatedBy && <ExpandItem label="Generated by" value={meta.generatedBy} mono />}
                {meta.generatedAt && <ExpandItem label="Generated at" value={new Date(meta.generatedAt).toLocaleString()} />}
                <ExpandItem label="Created" value={spec.createdAt ? new Date(spec.createdAt).toLocaleString() : "—"} />
              </div>
              <div className="space-y-1">
                <ExpandItem label="isActive" value={String(spec.isActive)} />
                <ExpandItem label="ID" value={spec.id} mono />
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">joltSpec</span>
              <span className="text-xs text-gray-400">({spec.joltSpec.length} operation{spec.joltSpec.length !== 1 ? "s" : ""})</span>
            </div>
            <pre className="text-xs font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto max-h-80 text-gray-800 dark:text-gray-200">
              {JSON.stringify(spec.joltSpec, null, 2)}
            </pre>
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

function tierShortLabel(tier: string): string {
  const map: Record<string, string> = {
    CHANNEL_SPECIFIC:  "T1",
    SEMANTIC_KNOWLEDGE:"T2",
    ALIAS_MAPPING:     "T3",
    PATTERN_MAPPING:   "T4",
    KEYWORD_MATCHING:  "T5",
  };
  return map[tier] ?? tier.slice(0, 4);
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChannelJoltSpecsPage() {
  const [specs, setSpecs]               = useState<ChannelJoltSpec[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [lockedFilter, setLockedFilter] = useState<"all" | "locked" | "auto">("all");
  const [editTarget, setEditTarget]     = useState<ChannelJoltSpec | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [toast, setToast]               = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ChannelJoltSpecService.listSpecs({
        channelId: channelFilter !== "all" ? channelFilter : undefined,
      });
      setSpecs(data);
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

  async function handleSave(joltSpec: unknown[], markAsManuallyConfigured: boolean) {
    if (!editTarget) return;
    const req: UpdateJoltSpecRequest = { joltSpec, markAsManuallyConfigured };
    await ChannelJoltSpecService.updateSpec(editTarget.id, req);
    showToast(
      markAsManuallyConfigured
        ? "Spec saved and locked — APM will not overwrite it."
        : "Spec saved. APM may overwrite on next analyse.",
      "success"
    );
    load();
  }

  async function handleDelete(spec: ChannelJoltSpec) {
    try {
      await ChannelJoltSpecService.deleteSpec(spec.id);
      showToast(`Spec deleted — APM will regenerate it on next publish/analyse for ${CHANNEL_TYPE_LABELS[spec.channelId] ?? spec.channelId}.`, "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleBulkDelete(channelId: string, organizationId?: string) {
    const result = await ChannelJoltSpecService.bulkDeleteByChannel(channelId, organizationId);
    const count = result?.deleted ?? 0;
    showToast(
      `${count} spec${count !== 1 ? "s" : ""} deleted for ${CHANNEL_TYPE_LABELS[channelId] ?? channelId}. APM will regenerate on next publish.`,
      "success"
    );
    load();
  }

  const filtered = useMemo(() => specs
    .filter((s) => {
      if (lockedFilter === "locked" && !s.joltMetadata.isManuallyConfigured) return false;
      if (lockedFilter === "auto"   && s.joltMetadata.isManuallyConfigured)  return false;
      return true;
    })
    .sort((a, b) => {
      if (a.channelId !== b.channelId) return a.channelId.localeCompare(b.channelId);
      return (a.categoryId ?? "default").localeCompare(b.categoryId ?? "default");
    }),
  [specs, lockedFilter]);

  const lockedCount  = specs.filter((s) => s.joltMetadata.isManuallyConfigured).length;
  const channelCount = new Set(specs.map((s) => s.channelId)).size;

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
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
            <LayersIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Channel JOLT Specs</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              APM-generated JOLT transformation specs — view, tune, and protect from overwrite
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulkDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg transition-colors">
            <BulkDeleteIcon />
            Bulk Clear
          </button>
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Specs" value={specs.length} />
        <StatCard label="Protected (locked)" value={lockedCount} accent="amber" />
        <StatCard label="Channels" value={channelCount} accent="indigo" />
        <StatCard label="Showing" value={filtered.length} accent="gray" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <div className="text-indigo-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-indigo-800 dark:text-indigo-300 space-y-1">
          <p>
            <strong>JOLT specs are the transformation heart of the publish pipeline.</strong> APM auto-generates them
            from field mappings and schema. Each spec is cached per <code className="font-mono">(channelId, categoryId, organizationId)</code>.
          </p>
          <p>
            <strong>Protected specs</strong> (🔒) are locked from APM overwrite — use this after manually correcting a wrong mapping.
            <strong> Deleting a spec</strong> forces APM to regenerate it fresh on the next publish or analyse call.
            <strong> Bulk Clear</strong> forces regeneration for an entire channel after a major schema change.
          </p>
        </div>
      </div>

      {/* Lifecycle diagram */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-mono">
        publish/analyse → spec found + 🔒 locked → <span className="text-green-600 dark:text-green-400">use as-is</span> &nbsp;|&nbsp;
        spec found + auto → use existing &nbsp;|&nbsp;
        spec not found → <span className="text-indigo-600 dark:text-indigo-400">APM regenerates</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">APM lock:</span>
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(["all", "locked", "auto"] as const).map((s) => (
              <button key={s} onClick={() => setLockedFilter(s)}
                className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                  lockedFilter === s
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}>{s}</button>
            ))}
          </div>
        </div>

        <span className="ml-auto text-xs text-gray-400">{filtered.length} spec{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
          {(error.includes("404") || error.includes("not found")) && (
            <p className="mt-1 text-xs opacity-80">The backend endpoint is not yet implemented. The UI is ready for when it ships.</p>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState hasFilters={channelFilter !== "all" || lockedFilter !== "all"} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channel / Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Organization</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Mappings</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Flags</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Version / Date</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <SpecRow
                  key={s.id}
                  spec={s}
                  onEdit={(x) => setEditTarget(x)}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditJoltSpecModal
          spec={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Bulk delete modal */}
      {showBulkDelete && (
        <BulkDeleteModal
          onConfirm={handleBulkDelete}
          onClose={() => setShowBulkDelete(false)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "amber" | "indigo" | "gray" }) {
  const color =
    accent === "amber"  ? "text-amber-600 dark:text-amber-400" :
    accent === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    accent === "gray"   ? "text-gray-500 dark:text-gray-400" :
    "text-gray-800 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400">
        <LayersIcon />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {hasFilters ? "No specs match your filters" : "No JOLT specs cached yet"}
      </p>
      {!hasFilters && (
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
          Specs are generated automatically when a merchant runs analyse or publishes a product. They will appear here once APM has processed at least one product.
        </p>
      )}
    </div>
  );
}
