"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChannelCategoryApiConfig,
  CategoryTreeApiConfig,
  AttributeApiConfig,
  CreateChannelCategoryApiConfigRequest,
  treeStrategyLabel,
  attributeApiTypeLabel,
} from "../_types/channel-category-api-config";
import { ChannelCategoryApiConfigService } from "../_services/channel-category-api-config.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import EditSubDocModal from "./EditSubDocModal";
import CreateConfigModal from "./CreateConfigModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
  </svg>
);
const TreeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// ─── Channel badge ─────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  amazon:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ebay:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  shopify:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  wix:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tiktok:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  tiktokshop:"bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  lazada:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  facebook:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shopee:    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function ChannelBadge({ channelType }: { channelType: string }) {
  const color = CHANNEL_COLORS[channelType] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-semibold ${color}`}>
      {CHANNEL_TYPE_LABELS[channelType] ?? channelType}
    </span>
  );
}

// ─── Key-value field table ──────────────────────────────────────────────────────

function FieldTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return <p className="text-xs text-gray-400 italic py-2">No fields configured.</p>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-gray-50 dark:border-gray-800/50">
            <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 font-medium align-top w-56 shrink-0">
              <code className="font-mono">{k}</code>
            </td>
            <td className="py-1.5 text-gray-800 dark:text-gray-200 align-top break-all">
              {typeof v === "string" ? (
                <span className={v.length > 80 ? "text-xs" : ""}>{v}</span>
              ) : (
                <code className="font-mono text-gray-600 dark:text-gray-400 text-xs">{JSON.stringify(v)}</code>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Config card ───────────────────────────────────────────────────────────────

type EditModal = "tree-api" | "attribute-api" | null;

function ChannelConfigCard({
  config,
  onUpdated,
  onToast,
}: {
  config: ChannelCategoryApiConfig;
  onUpdated: (channelType: string, updated: Partial<ChannelCategoryApiConfig>) => void;
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const [expanded,     setExpanded]     = useState(false);
  const [activeTab,    setActiveTab]    = useState<"tree-api" | "attribute-api" | "readonly">("tree-api");
  const [editModal,    setEditModal]    = useState<EditModal>(null);
  const [toggling,     setToggling]     = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);

  function formatDate(s?: string) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  async function handleToggleEnabled() {
    setToggling(true);
    setConfirmToggle(false);
    try {
      const updated = config.enabled
        ? await ChannelCategoryApiConfigService.disableChannel(config.channelType)
        : await ChannelCategoryApiConfigService.enableChannel(config.channelType);
      onUpdated(config.channelType, { enabled: updated.enabled });
      onToast(`${config.label ?? config.channelType} ${updated.enabled ? "enabled" : "disabled"}.`, "success");
    } catch (err) {
      onToast((err as Error).message, "error");
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveTreeApi(parsed: unknown) {
    const updated = await ChannelCategoryApiConfigService.updateTreeApi(
      config.channelType,
      parsed as CategoryTreeApiConfig,
    );
    onUpdated(config.channelType, { treeApiConfig: updated });
    onToast(`Tree API config updated for ${config.label ?? config.channelType}. Category cache cleared.`, "success");
  }

  async function handleSaveAttributeApi(parsed: unknown) {
    const updated = await ChannelCategoryApiConfigService.updateAttributeApi(
      config.channelType,
      parsed as AttributeApiConfig,
    );
    onUpdated(config.channelType, { attributeConfig: updated });
    onToast(`Attribute API config updated for ${config.label ?? config.channelType}.`, "success");
  }

  const treeLabel  = treeStrategyLabel(config.treeApiConfig);
  const attrLabel  = attributeApiTypeLabel(config.attributeConfig);
  const hasTaxonomy = config.taxonomyConfig?.enabled;

  return (
    <div className={`bg-white dark:bg-gray-900 border rounded-xl overflow-hidden transition-shadow ${
      expanded ? "border-slate-300 dark:border-slate-600 shadow-sm" : "border-gray-200 dark:border-gray-700"
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={() => setExpanded((v) => !v)}>
          <ChannelBadge channelType={config.channelType} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {config.label && config.label !== config.channelType && (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{config.label}</span>
              )}
              <code className="text-xs font-mono text-gray-400">{config.channelType}</code>
              {/* Tree strategy pill */}
              {treeLabel !== "—" && (
                <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full font-mono">
                  {treeLabel}
                </span>
              )}
              {/* Attribute type pill */}
              {attrLabel !== "—" && (
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                  attrLabel === "GraphQL"
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                    : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                }`}>
                  {attrLabel}
                </span>
              )}
              {/* Taxonomy badge */}
              {hasTaxonomy && (
                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full">
                  Taxonomy
                </span>
              )}
            </div>
            {config.updatedAt && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Updated {formatDate(config.updatedAt)}</p>
            )}
          </div>
          <div className={`text-gray-400 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
            <ChevronDownIcon />
          </div>
        </button>

        {/* Enable / Disable */}
        <div className="shrink-0 flex items-center gap-2">
          {confirmToggle ? (
            <span className="flex items-center gap-1.5">
              <button onClick={handleToggleEnabled} disabled={toggling}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                  config.enabled
                    ? "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    : "bg-green-100 hover:bg-green-200 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                }`}>
                {toggling ? "…" : "Confirm"}
              </button>
              <button onClick={() => setConfirmToggle(false)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmToggle(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                config.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${config.enabled ? "bg-green-500" : "bg-gray-400"}`} />
              {config.enabled ? "Enabled" : "Disabled"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            {([
              { key: "tree-api",    label: "Tree API Config" },
              { key: "attribute-api", label: "Attribute API Config" },
              { key: "readonly",    label: "Read-only Fields" },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-5 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? "text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 -mb-px"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Tree API tab */}
          {activeTab === "tree-api" && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Defines how the platform fetches the category tree. Full sub-document replacement.
                  Saving clears the category cache for this channel.
                </p>
                <button onClick={() => setEditModal("tree-api")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shrink-0 ml-3">
                  <EditIcon />Edit Tree API
                </button>
              </div>
              {config.treeApiConfig ? (
                <FieldTable data={config.treeApiConfig as Record<string, unknown>} />
              ) : (
                <p className="text-xs text-gray-400 italic py-3 text-center">Not configured.</p>
              )}
            </div>
          )}

          {/* Attribute API tab */}
          {activeTab === "attribute-api" && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Defines how per-category attributes are fetched for product listing forms. Full sub-document replacement.
                </p>
                <button onClick={() => setEditModal("attribute-api")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shrink-0 ml-3">
                  <EditIcon />Edit Attribute API
                </button>
              </div>
              {config.attributeConfig ? (
                <FieldTable data={config.attributeConfig as Record<string, unknown>} />
              ) : (
                <p className="text-xs text-gray-400 italic py-3 text-center">Not configured.</p>
              )}
            </div>
          )}

          {/* Read-only tab */}
          {activeTab === "readonly" && (
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <svg className="text-amber-500 shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Code-managed field.</strong>{" "}
                  <code className="font-mono">taxonomyConfig</code> is tightly coupled to{" "}
                  <code className="font-mono">ChannelTaxonomyService</code>. Changes require a code review and deployment.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  taxonomyConfig {config.taxonomyConfig?.enabled ? (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">enabled</span>
                  ) : (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">not configured</span>
                  )}
                </h4>
                {config.taxonomyConfig ? (
                  <FieldTable data={config.taxonomyConfig as unknown as Record<string, unknown>} />
                ) : (
                  <p className="text-xs text-gray-400 italic">Not configured — channel uses REST category tree only.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit sub-doc modals */}
      {editModal === "tree-api" && (
        <EditSubDocModal
          channelType={config.channelType}
          subDocType="tree-api"
          current={config.treeApiConfig ?? {}}
          onSave={handleSaveTreeApi}
          onClose={() => setEditModal(null)}
        />
      )}
      {editModal === "attribute-api" && (
        <EditSubDocModal
          channelType={config.channelType}
          subDocType="attribute-api"
          current={config.attributeConfig ?? {}}
          onSave={handleSaveAttributeApi}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChannelCategoryApiConfigPage() {
  const [configs,       setConfigs]       = useState<ChannelCategoryApiConfig[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [toast,         setToast]         = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showDisabled,  setShowDisabled]  = useState(false);
  const [createModal,   setCreateModal]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Pass enabled=false to get ALL configs (backend default only returns enabled=true)
      const data = await ChannelCategoryApiConfigService.listConfigs(undefined, showDisabled ? false : undefined);
      setConfigs(data.sort((a, b) => a.channelType.localeCompare(b.channelType)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showDisabled]);

  useEffect(() => { load(); }, [load]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  }

  function handleUpdated(channelType: string, updated: Partial<ChannelCategoryApiConfig>) {
    setConfigs((prev) =>
      prev.map((c) => (c.channelType === channelType ? { ...c, ...updated } : c))
    );
  }

  async function handleCreate(req: CreateChannelCategoryApiConfigRequest) {
    const created = await ChannelCategoryApiConfigService.createConfig(req);
    setConfigs((prev) => [...prev, created].sort((a, b) => a.channelType.localeCompare(b.channelType)));
    showToast(`Config created for channel "${created.channelType}".`, "success");
  }

  const enabledCount  = configs.filter((c) => c.enabled).length;
  const treeCount     = configs.filter((c) => !!c.treeApiConfig).length;
  const taxonomyCount = configs.filter((c) => c.taxonomyConfig?.enabled).length;

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
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
            <TreeIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Channel Category API Configs</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Category tree fetch strategy, attribute API config, and enable/disable per channel
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
            <RefreshIcon />
          </button>
          <button onClick={() => setCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
            <PlusIcon />New Config
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Channels"   value={configs.length} />
        <StatCard label="Enabled"          value={enabledCount}   accent="green" />
        <StatCard label="Tree API Set"     value={treeCount}      accent="indigo" />
        <StatCard label="Taxonomy Enabled" value={taxonomyCount}  accent="violet" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <div className="text-indigo-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
          <p>
            <strong>Editable sub-documents:</strong>{" "}
            <code className="font-mono">treeApiConfig</code> (full replace — clears category cache){" "}
            and <code className="font-mono">attributeConfig</code> (full replace).
          </p>
          <p>
            <strong>Read-only (code-managed):</strong>{" "}
            <code className="font-mono">taxonomyConfig</code> is tightly coupled to backend service parsing logic.
          </p>
          <p>
            <strong>Enable / Disable</strong> controls whether <code className="font-mono">CategorySyncJob</code> includes this channel.
          </p>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowDisabled((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showDisabled
              ? "bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-gray-800 dark:border-gray-200"
              : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400"
          }`}>
          {showDisabled ? "Showing All" : "Enabled Only"}
        </button>
        <span className="text-xs text-gray-400">
          {configs.length} config{configs.length !== 1 ? "s" : ""} shown
        </span>
      </div>

      {/* Content */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
          {(error.includes("404") || error.includes("not found")) && (
            <p className="mt-1 text-xs opacity-80">The backend endpoint is not yet implemented. The UI is ready for when it ships.</p>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400">
            <TreeIcon />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No category API configs found</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
            Configs are seeded by the backend at startup. Use &quot;New Config&quot; to add one for a new channel.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <ChannelConfigCard
              key={config.channelType}
              config={config}
              onUpdated={handleUpdated}
              onToast={showToast}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {createModal && (
        <CreateConfigModal
          onSave={handleCreate}
          onClose={() => setCreateModal(false)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "green" | "indigo" | "violet" }) {
  const color =
    accent === "green"  ? "text-green-600 dark:text-green-400" :
    accent === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    accent === "violet" ? "text-violet-600 dark:text-violet-400" :
    "text-gray-800 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
