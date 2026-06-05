"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  MerchantApiOperation,
  AuthStrategy,
  AUTH_STRATEGY_LABELS,
  CreateOperationRequest,
  UpdateOperationRequest,
} from "../_types/merchant-api-operation";
import { MerchantApiOperationService } from "../_services/merchant-api-operation.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import AddEditOperationModal from "./AddEditOperationModal";

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
const PlugIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z"/>
  </svg>
);

// ─── Badges ────────────────────────────────────────────────────────────────────

const AUTH_COLORS: Record<AuthStrategy, string> = {
  BEARER_TOKEN:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  API_KEY_HEADER: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  API_KEY_QUERY:  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  NO_AUTH:        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function AuthBadge({ strategy }: { strategy: AuthStrategy }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${AUTH_COLORS[strategy]}`}>
      {AUTH_STRATEGY_LABELS[strategy]}
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
  facebook:   "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shopee:     "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  tiktokshop: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

function ChannelBadge({ channelType }: { channelType: string }) {
  const color = CHANNEL_COLORS[channelType] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>
      {CHANNEL_TYPE_LABELS[channelType] ?? channelType}
    </span>
  );
}

// ─── Operation row ─────────────────────────────────────────────────────────────

function OperationRow({
  op, onEdit, onDisable, onEnable, onDelete,
}: {
  op: MerchantApiOperation;
  onEdit: (op: MerchantApiOperation) => void;
  onDisable: (op: MerchantApiOperation) => void;
  onEnable: (op: MerchantApiOperation) => void;
  onDelete: (op: MerchantApiOperation) => void;
}) {
  const [expanded, setExpanded]           = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const fullUrl = op.baseUrl + op.urlPath;
  const hasFixedParams  = Object.keys(op.fixedQueryParams).length > 0;
  const hasCredParams   = Object.keys(op.credentialQueryParams).length > 0;

  function formatDate(s?: string) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  return (
    <>
      <tr className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${!op.enabled ? "opacity-60" : ""}`}>

        <td className="px-3 py-2.5">
          <ChannelBadge channelType={op.channelType} />
        </td>

        <td className="px-3 py-2.5">
          <code className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200">{op.operationName}</code>
        </td>

        <td className="px-3 py-2.5 max-w-[220px]">
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate block" title={fullUrl}>
            {fullUrl}
          </span>
        </td>

        <td className="px-3 py-2.5">
          <AuthBadge strategy={op.authStrategy} />
        </td>

        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5 text-xs font-mono text-gray-600 dark:text-gray-400">
            <span title="itemsJsonPath">{op.itemsJsonPath || "—"}</span>
            <span className="text-gray-400">{op.valueField} → {op.labelField}</span>
          </div>
        </td>

        <td className="px-3 py-2.5">
          {op.enabled ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Enabled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />Disabled
            </span>
          )}
        </td>

        <td className="px-3 py-2.5 text-xs text-gray-400">{formatDate(op.updatedAt)}</td>

        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors" title="Expand">
              <div className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
                <ChevronDownIcon />
              </div>
            </button>
            <button onClick={() => onEdit(op)}
              className="p-1.5 rounded hover:bg-orange-50 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors" title="Edit">
              <EditIcon />
            </button>
            {op.enabled ? (
              confirmDisable ? (
                <span className="flex items-center gap-1">
                  <button onClick={() => { setConfirmDisable(false); onDisable(op); }}
                    className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium transition-colors">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDisable(false)}
                    className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDisable(true)}
                  className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">
                  Disable
                </button>
              )
            ) : (
              <button onClick={() => onEnable(op)}
                className="px-2 py-1 text-xs rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 transition-colors">
                Enable
              </button>
            )}
            <button onClick={() => onDelete(op)}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors" title="Hard delete">
              <TrashIcon />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <ExpandItem label="Auth Cred Key" value={op.authCredentialKey || "—"} mono />
                <ExpandItem label="Description" value={op.description || "—"} />
                <ExpandItem label="Updated" value={op.updatedAt ? new Date(op.updatedAt).toLocaleString() : "—"} />
                <ExpandItem label="ID" value={op.id} mono />
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="text-gray-400 shrink-0 w-32">Fixed Params</span>
                  {hasFixedParams ? (
                    <pre className="font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-xs overflow-x-auto">
                      {JSON.stringify(op.fixedQueryParams, null, 2)}
                    </pre>
                  ) : <span className="text-gray-400">empty</span>}
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 shrink-0 w-32">Credential Params</span>
                  {hasCredParams ? (
                    <pre className="font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-xs overflow-x-auto">
                      {JSON.stringify(op.credentialQueryParams, null, 2)}
                    </pre>
                  ) : <span className="text-gray-400">empty</span>}
                </div>
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
      <span className="text-gray-400 shrink-0 w-32">{label}</span>
      <span className={`text-gray-700 dark:text-gray-300 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  op, onConfirm, onCancel,
}: {
  op: MerchantApiOperation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete Operation</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Permanently removes{" "}
          <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{op.channelType} / {op.operationName}</code>.
          Any form field using this operation will fall back to a text input.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-5">
          Consider using <strong>Disable</strong> instead — the operation is kept and can be re-enabled.
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

export default function MerchantApiOperationsPage() {
  const [operations, setOperations]       = useState<MerchantApiOperation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter]   = useState<"all" | "enabled" | "disabled">("all");
  const [search, setSearch]               = useState("");
  const [modal, setModal]                 = useState<{ mode: "create" | "edit"; op?: MerchantApiOperation } | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<MerchantApiOperation | null>(null);
  const [toast, setToast]                 = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const channelType = channelFilter !== "all" ? channelFilter : undefined;
      // Fetch enabled and disabled separately (backend filters by exact value, no "include all" flag)
      const [enabled, disabled] = await Promise.all([
        MerchantApiOperationService.listOperations({ channelType }),
        MerchantApiOperationService.listOperations({ channelType, enabled: false }),
      ]);
      const seen = new Set<string>();
      const merged = [...enabled, ...disabled].filter((op) => {
        if (seen.has(op.id)) return false;
        seen.add(op.id);
        return true;
      });
      setOperations(merged);
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

  async function handleSave(data: CreateOperationRequest | UpdateOperationRequest) {
    if (modal?.mode === "create") {
      await MerchantApiOperationService.createOperation(data as CreateOperationRequest);
      showToast("Operation created. Effective on the next Step 2 form load.", "success");
    } else if (modal?.op) {
      await MerchantApiOperationService.updateOperation(modal.op.id, data as UpdateOperationRequest);
      showToast("Operation updated.", "success");
    }
    load();
  }

  async function handleDisable(op: MerchantApiOperation) {
    try {
      await MerchantApiOperationService.disableOperation(op.id);
      showToast(`"${op.operationName}" disabled — field falls back to text input.`, "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleEnable(op: MerchantApiOperation) {
    try {
      await MerchantApiOperationService.enableOperation(op.id);
      showToast(`"${op.operationName}" enabled.`, "success");
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  async function handleDelete(op: MerchantApiOperation) {
    try {
      await MerchantApiOperationService.deleteOperation(op.id);
      setDeleteTarget(null);
      showToast(`"${op.operationName}" permanently deleted.`, "success");
      load();
    } catch (err) {
      setDeleteTarget(null);
      showToast((err as Error).message, "error");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return operations
      .filter((op) => {
        if (statusFilter === "enabled"  && !op.enabled) return false;
        if (statusFilter === "disabled" && op.enabled)  return false;
        if (q && !op.operationName.toLowerCase().includes(q)
               && !op.description?.toLowerCase().includes(q)
               && !(op.baseUrl + op.urlPath).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        if (a.channelType !== b.channelType) return a.channelType.localeCompare(b.channelType);
        return a.operationName.localeCompare(b.operationName);
      });
  }, [operations, statusFilter, search]);

  const enabledCount  = operations.filter((op) => op.enabled).length;
  const channelCount  = new Set(operations.filter((op) => op.enabled).map((op) => op.channelType)).size;

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
          <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-600 dark:text-orange-400">
            <PlugIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Merchant API Operations</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Data-driven config for fetching warehouses, brands, categories, and carriers from channel APIs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
            <RefreshIcon />
          </button>
          <button onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
            <PlusIcon />
            Add Operation
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Operations" value={operations.length} />
        <StatCard label="Enabled" value={enabledCount} accent="green" />
        <StatCard label="Channels" value={channelCount} accent="orange" />
        <StatCard label="Showing" value={filtered.length} accent="gray" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
        <div className="text-orange-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-orange-800 dark:text-orange-300 space-y-0.5">
          <p>
            <strong>How it connects to Step 2 forms:</strong> When a master attribute has
            <code className="font-mono mx-1">optionsSource: MERCHANT_API</code> and
            <code className="font-mono mx-1">merchantApiOperation: &quot;GetWarehouses&quot;</code>,
            the form fetches live options by looking up this collection for a matching
            <code className="font-mono mx-1">(channelType, operationName)</code> pair.
          </p>
          <p>
            <strong>Disabled operations</strong> cause the form field to fall back to a plain text input.
            Use Disable instead of Delete to preserve the config for easy re-activation.
          </p>
        </div>
      </div>

      {/* Seeded reference */}
      <details className="group">
        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
          Seeded operations reference (8 operations across 5 channels) ▸
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400">
                <th className="pr-4 pb-1 text-left font-medium">Channel</th>
                <th className="pr-4 pb-1 text-left font-medium">Operation</th>
                <th className="pb-1 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-400">
              {SEEDED_OPERATIONS.map((s, i) => (
                <tr key={i}>
                  <td className="pr-4 py-0.5 font-mono">{s.channel}</td>
                  <td className="pr-4 py-0.5 font-mono">{s.operation}</td>
                  <td className="py-0.5">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search operations…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 w-44 focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>

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

        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {(["all", "enabled", "disabled"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                statusFilter === s
                  ? "bg-orange-600 text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>{s}</button>
          ))}
        </div>

        <span className="ml-auto text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
          {(error.includes("CORS") || error.includes("fetch") || error.includes("NetworkError")) && (
            <p className="mt-1 text-xs opacity-80">Check that the backend is running at <code className="font-mono">localhost:8888</code>.</p>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={() => setModal({ mode: "create" })}
          hasFilters={!!(search || statusFilter !== "all")} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channel</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Operation</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">URL</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Auth</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Response Mapping</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Updated</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => (
                <OperationRow
                  key={op.id}
                  op={op}
                  onEdit={(x) => setModal({ mode: "edit", op: x })}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                  onDelete={(x) => setDeleteTarget(x)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <AddEditOperationModal
          mode={modal.mode}
          operation={modal.op}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          op={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "green" | "orange" | "gray" }) {
  const color =
    accent === "green"  ? "text-green-600 dark:text-green-400" :
    accent === "orange" ? "text-orange-600 dark:text-orange-400" :
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
        <PlugIcon />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {hasFilters ? "No operations match your filters" : "No operations yet"}
      </p>
      {!hasFilters && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
            Add data-source operations to populate MERCHANT_API form fields in Step 2 with live options from the merchant&apos;s connected account.
          </p>
          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
            <PlusIcon />
            Add First Operation
          </button>
        </>
      )}
    </div>
  );
}

const SEEDED_OPERATIONS = [
  { channel: "tiktokshop", operation: "GetWarehouses",      description: "TikTok warehouse list" },
  { channel: "tiktokshop", operation: "GetBrands",          description: "TikTok brand list" },
  { channel: "lazada",     operation: "GetWarehouses",      description: "Lazada warehouse list" },
  { channel: "shopify",    operation: "GetLocations",       description: "Shopify store locations" },
  { channel: "shopify",    operation: "GetCollections",     description: "Shopify custom collections" },
  { channel: "ebay",       operation: "GetShippingPolicies",description: "eBay shipping policy list" },
  { channel: "shopee",     operation: "GetLogistics",       description: "Shopee logistics channel list" },
  { channel: "amazon",     operation: "GetMarketplaces",    description: "Amazon marketplace list" },
];
