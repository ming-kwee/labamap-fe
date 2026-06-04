"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChannelCategoryApiSchema,
  CHANNEL_TYPE_LABELS,
} from "../_types/channel-category-schema";
import { ChannelCategorySchemaService } from "../_services/channel-category-schema.service";
import AddEditSchemaModal from "./AddEditSchemaModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
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
const SchemaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>
  </svg>
);

// ─── Channel badge ─────────────────────────────────────────────────────────────

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
  shopee:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

function ChannelBadge({ channelType }: { channelType: string }) {
  const color = CHANNEL_COLORS[channelType] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>
      {CHANNEL_TYPE_LABELS[channelType] ?? channelType}
    </span>
  );
}

// ─── Schema row ────────────────────────────────────────────────────────────────

function SchemaRow({
  schema,
  onEdit,
  onActivate,
  onDeactivate,
}: {
  schema: ChannelCategoryApiSchema;
  onEdit: (schema: ChannelCategoryApiSchema) => void;
  onActivate: (schema: ChannelCategoryApiSchema) => void;
  onDeactivate: (schema: ChannelCategoryApiSchema) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const fieldCount = countFields(schema.apiSchemaExtension);

  function formatDate(s: string) {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch { return s; }
  }

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
        <td className="px-4 py-3">
          <ChannelBadge channelType={schema.channelType} />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-mono text-gray-800 dark:text-gray-200">{schema.categorySlug}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">v{schema.version}</span>
        </td>
        <td className="px-4 py-3 text-center">
          {schema.isActive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
              Inactive
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 max-w-[200px]">
            {schema.changeNote || "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(schema.updatedAt)}</td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">{fieldCount} fields</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              title="View extension JSON"
            >
              <div className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
                <ChevronDownIcon />
              </div>
            </button>
            {schema.isActive && (
              <button
                onClick={() => onEdit(schema)}
                className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                title="Edit extension"
              >
                <EditIcon />
              </button>
            )}
            {schema.isActive ? (
              confirmingDeactivate ? (
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => { setConfirmingDeactivate(false); onDeactivate(schema); }}
                    className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 transition-colors font-medium"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmingDeactivate(false)}
                    className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingDeactivate(true)}
                  className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                >
                  Deactivate
                </button>
              )
            ) : (
              <button
                onClick={() => onActivate(schema)}
                className="px-2 py-1 text-xs rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 transition-colors"
                title="Rollback to this version"
              >
                Activate
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/70 dark:bg-gray-900/50">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                apiSchemaExtension — deep-merged onto base schema during APM target schema generation
              </span>
            </div>
            <pre className="text-xs font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto max-h-64 text-gray-800 dark:text-gray-200">
              {JSON.stringify(schema.apiSchemaExtension, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function countFields(obj: Record<string, unknown>, depth = 0): number {
  if (depth > 5) return 0;
  let count = 0;
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      count += countFields(v as Record<string, unknown>, depth + 1);
    } else {
      count += 1;
    }
  }
  return count;
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChannelCategorySchemasPage() {
  const [schemas, setSchemas] = useState<ChannelCategoryApiSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; schema?: ChannelCategoryApiSchema } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ChannelCategorySchemaService.listSchemas(
        channelFilter !== "all" ? channelFilter : undefined
      );
      setSchemas(result);
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

  async function handleSave(data: {
    channelType?: string;
    categorySlug?: string;
    apiSchemaExtension: Record<string, unknown>;
    changeNote: string;
  }) {
    if (modal?.mode === "create") {
      await ChannelCategorySchemaService.createSchema({
        channelType: data.channelType!,
        categorySlug: data.categorySlug!,
        apiSchemaExtension: data.apiSchemaExtension,
        changeNote: data.changeNote,
      });
      showToast("Schema created. JOLT specs for this channel×category pair invalidated.", "success");
    } else if (modal?.schema) {
      await ChannelCategorySchemaService.updateSchema(modal.schema.id, {
        apiSchemaExtension: data.apiSchemaExtension,
        changeNote: data.changeNote,
      });
      showToast("Schema updated. JOLT specs for this channel×category pair have been invalidated.", "success");
    }
    // Do NOT call setModal(null) here — the modal calls onClose() itself after onSave resolves,
    // ensuring setSaving(false) runs before the component unmounts (avoids React warning).
    load();
  }

  async function handleActivate(schema: ChannelCategoryApiSchema) {
    try {
      await ChannelCategorySchemaService.activateSchema(schema.id);
      showToast(`v${schema.version} activated — JOLT specs invalidated, APM will use this version on next publish.`, "success");
      load();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function handleDeactivate(schema: ChannelCategoryApiSchema) {
    try {
      await ChannelCategorySchemaService.deactivateSchema(schema.id);
      showToast("Schema deactivated. JOLT specs invalidated.", "success");
      load();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  const filtered = schemas
    .filter((s) => {
      if (statusFilter === "active" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;
      return true;
    })
    .sort((a, b) => {
      const pairA = `${a.channelType}/${a.categorySlug}`;
      const pairB = `${b.channelType}/${b.categorySlug}`;
      if (pairA !== pairB) return pairA.localeCompare(pairB);
      // Within same pair: active first, then by version descending
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.version - a.version;
    });

  const grouped = filtered.reduce<Record<string, ChannelCategoryApiSchema[]>>((acc, s) => {
    const key = `${s.channelType}/${s.categorySlug}`;
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  const activeCount  = schemas.filter((s) => s.isActive).length;
  const channelCount = new Set(schemas.map((s) => s.channelType)).size;

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[10000] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white transition-all ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            <SchemaIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Channel Category API Schemas
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Category-specific API field extensions for APM target schema generation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <PlusIcon />
            Add Schema
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Schemas" value={schemas.length} />
        <StatCard label="Active Schemas" value={activeCount} accent="green" />
        <StatCard label="Channels Covered" value={channelCount} accent="blue" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <InfoIcon />
        <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p>
            <strong>How it works:</strong> Category-specific fields are deep-merged onto the channel&apos;s base
            apiSchema at publish time. APM then maps master product fields to the combined schema — including
            channel-specific fields like <code className="font-mono">Item.ProductType.Electronics.ModelNumber</code>.
          </p>
          <p>
            <strong>JOLT invalidation:</strong> Every create, update, activate, or deactivate automatically
            removes the cached JOLT specs for that channel×category pair. The next publish regenerates them.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Channel:</span>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All channels</option>
            {Object.entries(CHANNEL_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Content */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={() => setModal({ mode: "create" })} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* Group separator labels */}
          {Object.entries(grouped).length > 1 && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Showing {filtered.length} schema version{filtered.length !== 1 ? "s" : ""} across {Object.keys(grouped).length} channel×category pairs
            </div>
          )}
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channel</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Category Slug</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Version</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Change Note</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Updated</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Fields</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((schema) => (
                <SchemaRow
                  key={schema.id}
                  schema={schema}
                  onEdit={(s) => setModal({ mode: "edit", schema: s })}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AddEditSchemaModal
          mode={modal.mode}
          schema={modal.schema}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "green" | "blue" }) {
  const color =
    accent === "green" ? "text-green-600 dark:text-green-400" :
    accent === "blue"  ? "text-blue-600 dark:text-blue-400" :
    "text-gray-800 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400">
        <SchemaIcon />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No schemas yet</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
        Add category-specific API field extensions for Amazon, eBay, and Walmart to unlock accurate APM field mapping.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <PlusIcon />
        Add First Schema
      </button>
    </div>
  );
}

