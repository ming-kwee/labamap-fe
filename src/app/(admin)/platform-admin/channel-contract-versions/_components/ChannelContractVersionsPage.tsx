"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChannelApiContract,
  ContractStatus,
  LifecycleAction,
  STATUS_STYLE,
  ACTION_LABEL,
  ACTION_TARGET,
  canRunAction,
  categoryExtensionCount,
  shortHash,
} from "../_types/channel-api-contract";
import {
  ChannelApiContractService,
  ContractApiError,
} from "../_services/channel-api-contract.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import ConfirmTransitionModal from "./ConfirmTransitionModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
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
const FileStackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 7h-3a2 2 0 0 1-2-2V2"/><path d="M21 6v6.5c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5v-9c0-.8.7-1.5 1.5-1.5H17Z"/>
    <path d="M7 8v8.8c0 .3.2.6.4.8.2.2.5.4.8.4H15"/><path d="M3 12v8.8c0 .3.2.6.4.8.2.2.5.4.8.4H11"/>
  </svg>
);
const PromoteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6"/>
  </svg>
);
const DeprecateIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
);
const RetireIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.9 4.9 19 19"/><circle cx="12" cy="12" r="10"/>
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

function StatusBadge({ status }: { status: ContractStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ─── Lifecycle action button (enabled/disabled per transition graph) ───────────

const ACTION_ICON: Record<LifecycleAction, React.ReactNode> = {
  promote:   <PromoteIcon />,
  deprecate: <DeprecateIcon />,
  retire:    <RetireIcon />,
};

const ACTION_ENABLED_CLS: Record<LifecycleAction, string> = {
  promote:   "bg-success-50 hover:bg-success-100 text-success-700 dark:bg-success-500/10 dark:hover:bg-success-500/20 dark:text-success-400",
  deprecate: "bg-warning-50 hover:bg-warning-100 text-warning-700 dark:bg-warning-500/10 dark:hover:bg-warning-500/20 dark:text-warning-400",
  retire:    "bg-error-50 hover:bg-error-100 text-error-700 dark:bg-error-500/10 dark:hover:bg-error-500/20 dark:text-error-400",
};

function ActionButton({
  action, status, onClick,
}: {
  action: LifecycleAction;
  status: ContractStatus;
  onClick: () => void;
}) {
  const enabled = canRunAction(status, action);
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      title={
        enabled
          ? `${ACTION_LABEL[action]} → ${ACTION_TARGET[action]}`
          : `Transisi tidak sah dari ${status} (${status} ⇏ ${ACTION_TARGET[action]})`
      }
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded font-medium transition-colors ${
        enabled ? ACTION_ENABLED_CLS[action] : "bg-gray-50 text-gray-300 dark:bg-gray-800/50 dark:text-gray-600 cursor-not-allowed"
      }`}
    >
      {ACTION_ICON[action]} {ACTION_LABEL[action]}
    </button>
  );
}

// ─── Contract row ──────────────────────────────────────────────────────────────

function ContractRow({
  contract, onTransition,
}: {
  contract: ChannelApiContract;
  onTransition: (c: ChannelApiContract, action: LifecycleAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catCount = categoryExtensionCount(contract);
  const catSlugs = contract.categoryApiSchemaExtensions ? Object.keys(contract.categoryApiSchemaExtensions) : [];

  function formatDate(s?: string) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
        {/* Channel / Version */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <ChannelBadge channelId={contract.channelId} />
            <code className="text-xs font-mono text-gray-600 dark:text-gray-400">{contract.apiVersion || "—"}</code>
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5"><StatusBadge status={contract.status} /></td>

        {/* Schema (hash + category extensions) */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-1">
            <code className="text-xs font-mono text-gray-600 dark:text-gray-400" title={contract.apiSchemaHash ?? "no hash"}>
              {shortHash(contract.apiSchemaHash)}
            </code>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {catCount} categor{catCount === 1 ? "y" : "ies"} ext
            </span>
          </div>
        </td>

        {/* Endpoints / rules counts */}
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            <CountChip label="endpoints" value={contract.channelMetadataList.length} />
            <CountChip label="rules" value={contract.postProcessingRules.length} />
            <CountChip label="reqs" value={contract.payloadRequirements.length} />
          </div>
        </td>

        {/* Source / provenance */}
        <td className="px-3 py-2.5">
          <code className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">{contract.source ?? "—"}</code>
        </td>

        {/* Updated */}
        <td className="px-3 py-2.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(contract.updatedAt)}</span>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors" title="View contract">
              <div className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}><ChevronDownIcon /></div>
            </button>
            <ActionButton action="promote"   status={contract.status} onClick={() => onTransition(contract, "promote")} />
            <ActionButton action="deprecate" status={contract.status} onClick={() => onTransition(contract, "deprecate")} />
            <ActionButton action="retire"    status={contract.status} onClick={() => onTransition(contract, "retire")} />
          </div>
        </td>
      </tr>

      {/* Expanded: full contract detail */}
      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              <div className="space-y-1">
                <ExpandItem label="Channel" value={CHANNEL_TYPE_LABELS[contract.channelId] ?? contract.channelId} />
                <ExpandItem label="apiVersion" value={contract.apiVersion || "—"} mono />
                <ExpandItem label="Status" value={contract.status} />
                <ExpandItem label="Source" value={contract.source ?? "—"} mono />
                <ExpandItem label="ID" value={contract.id} mono />
              </div>
              <div className="space-y-1">
                <ExpandItem label="apiSchemaHash" value={contract.apiSchemaHash ?? "—"} mono />
                <ExpandItem label="Categories ext" value={String(catCount)} />
                <ExpandItem label="Endpoints" value={String(contract.channelMetadataList.length)} />
                <ExpandItem label="Post-proc rules" value={String(contract.postProcessingRules.length)} />
                <ExpandItem label="Created" value={contract.createdAt ? new Date(contract.createdAt).toLocaleString() : "—"} />
                <ExpandItem label="Updated" value={contract.updatedAt ? new Date(contract.updatedAt).toLocaleString() : "—"} />
              </div>
            </div>

            {/* Category schema extensions — one chip per slug */}
            {catSlugs.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  categoryApiSchemaExtensions ({catSlugs.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {catSlugs.map((slug) => (
                    <span key={slug}
                      className="inline-flex items-center px-2 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-xs font-mono">
                      {slug}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* apiSchema (read-only, immutable per version — no editor by design) */}
            <JsonBlock label="apiSchema" value={contract.apiSchema} note="immutable — edited in config, snapshotted on migrate" />
            {catSlugs.length > 0 && <JsonBlock label="categoryApiSchemaExtensions" value={contract.categoryApiSchemaExtensions} />}
            {contract.channelMetadataList.length > 0 && <JsonBlock label="channelMetadataList (endpoints)" value={contract.channelMetadataList} />}
            {contract.postProcessingRules.length > 0 && <JsonBlock label="postProcessingRules" value={contract.postProcessingRules} />}
            {contract.payloadRequirements.length > 0 && <JsonBlock label="payloadRequirements" value={contract.payloadRequirements} />}
            {contract.attributeMappings && <JsonBlock label="attributeMappings" value={contract.attributeMappings} />}
            {contract.apiWrapperConfig && <JsonBlock label="apiWrapperConfig" value={contract.apiWrapperConfig} />}
          </td>
        </tr>
      )}
    </>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      <span className="font-semibold text-gray-700 dark:text-gray-300">{value}</span> {label}
    </span>
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

function JsonBlock({ label, value, note }: { label: string; value: unknown; note?: string }) {
  return (
    <details className="mt-2">
      <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
        {label}{note ? <span className="text-gray-400 dark:text-gray-500"> — {note}</span> : null} ▸
      </summary>
      <pre className="mt-1.5 text-xs font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto max-h-80 text-gray-800 dark:text-gray-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

// Deep-link support (e.g. from Publish Diagnostics / trace inspector): ?channelId= filters
// to that channel. useSearchParams needs a Suspense boundary in the App Router.
export default function ChannelContractVersionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400 dark:text-gray-500">Loading…</div>}>
      <ChannelContractVersionsPageInner />
    </Suspense>
  );
}

const STATUS_OPTIONS: ContractStatus[] = ["DRAFT", "ACTIVE", "DEPRECATED", "RETIRED"];

function ChannelContractVersionsPageInner() {
  const searchParams = useSearchParams();
  const deepLinkChannel = searchParams.get("channelId");

  const [contracts, setContracts] = useState<ChannelApiContract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>(deepLinkChannel ?? "all");
  const [statusFilter, setStatusFilter]   = useState<"all" | ContractStatus>("all");
  const [pending, setPending]     = useState<{ contract: ChannelApiContract; action: LifecycleAction } | null>(null);
  const [toast, setToast]         = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ChannelApiContractService.listContracts({
        channelId: channelFilter !== "all" ? channelFilter : undefined,
        status:    statusFilter !== "all"  ? statusFilter  : undefined,
      });
      setContracts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [channelFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  function successMsg(c: ChannelApiContract, action: LifecycleAction): string {
    const ch = CHANNEL_TYPE_LABELS[c.channelId] ?? c.channelId;
    switch (action) {
      case "promote":
        return `${ch} ${c.apiVersion} kini ACTIVE. Versi ACTIVE lain pada channel ini (bila ada) otomatis di-DEPRECATED.`;
      case "deprecate":
        return `${ch} ${c.apiVersion} ditandai DEPRECATED. Masih bisa di-rollback ke ACTIVE.`;
      case "retire":
        return `${ch} ${c.apiVersion} di-RETIRED (terminal).`;
    }
  }

  // Runs from the confirm modal. Throws on error so the modal stays open for retry (docs §2 R2).
  async function runTransition() {
    if (!pending) return;
    const { contract, action } = pending;
    try {
      await ChannelApiContractService.transition(contract.channelId, contract.apiVersion, action);
      showToast(successMsg(contract, action), "success");
      await load();
    } catch (err) {
      if (err instanceof ContractApiError) {
        if (err.status === 409) {
          showToast(`Transisi tidak sah (${contract.status} → ${ACTION_TARGET[action]}): ${err.message}`, "error");
        } else if (err.status === 404) {
          showToast("Kontrak tak ditemukan — mungkin sudah berubah. Memuat ulang…", "error");
          await load();
        } else {
          showToast(err.message, "error");
        }
      } else {
        showToast((err as Error).message, "error");
      }
      throw err;
    }
  }

  const filtered = useMemo(() => [...contracts].sort((a, b) => {
    if (a.channelId !== b.channelId) return a.channelId.localeCompare(b.channelId);
    // Newest apiVersion first within a channel.
    return b.apiVersion.localeCompare(a.apiVersion);
  }), [contracts]);

  const channelCount = new Set(contracts.map((c) => c.channelId)).size;
  const activeCount  = contracts.filter((c) => c.status === "ACTIVE").length;
  const draftCount   = contracts.filter((c) => c.status === "DRAFT").length;
  const deprecatedCount = contracts.filter((c) => c.status === "DEPRECATED").length;

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
            <FileStackIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Channel Contract Versions</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Versioned, immutable snapshots of each channel&apos;s publish contract — view &amp; manage lifecycle
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
          <RefreshIcon />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total Contracts" value={contracts.length} />
        <StatCard label="Active" value={activeCount} accent="success" />
        <StatCard label="Draft" value={draftCount} accent="gray" />
        <StatCard label="Deprecated" value={deprecatedCount} accent="amber" />
        <StatCard label="Channels" value={channelCount} accent="indigo" />
        <StatCard label="Showing" value={filtered.length} accent="gray" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <div className="text-indigo-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-indigo-800 dark:text-indigo-300 space-y-1">
          <p>
            <strong>A contract is an immutable, versioned snapshot</strong> of a channel&apos;s publish config
            (apiSchema, category extensions, post-processing rules, endpoints). Publish/analyse reads the{" "}
            <strong>ACTIVE</strong> version — which today stays in sync with the mutable config, so behaviour is unchanged.
          </p>
          <p>
            <strong>Lifecycle:</strong> <code className="font-mono">DRAFT → ACTIVE → DEPRECATED → RETIRED</code>.
            Promote makes a version ACTIVE (any other ACTIVE version of the same channel is auto-DEPRECATED);
            DEPRECATED can roll back to ACTIVE; RETIRED is terminal. Illegal transitions are rejected (409).
          </p>
          <p className="opacity-90">
            <strong>Heads-up:</strong> until <strong>Phase 3</strong> (per-store version pin) ships, these transitions
            <strong> don&apos;t change which contract publish uses</strong> (the resolver still reads{" "}
            <code className="font-mono">config.apiVersion</code>). Use this to <strong>prepare / archive</strong> versions,
            not for live rollback. The <code className="font-mono">apiSchemaHash</code> shown here is the reference used by
            JOLT-spec staleness detection.
          </p>
        </div>
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
          <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(["all", ...STATUS_OPTIONS] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s as "all" | ContractStatus)}
                className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}>{s === "all" ? "all" : s.toLowerCase()}</button>
            ))}
          </div>
        </div>

        <span className="ml-auto text-xs text-gray-400">{filtered.length} contract{filtered.length !== 1 ? "s" : ""}</span>
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
        <EmptyState hasFilters={channelFilter !== "all" || statusFilter !== "all"} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channel / Version</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Schema</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Contents</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Source</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Updated</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Lifecycle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <ContractRow key={c.id || `${c.channelId}/${c.apiVersion}`} contract={c} onTransition={(contract, action) => setPending({ contract, action })} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transition confirm modal */}
      {pending && (
        <ConfirmTransitionModal
          contract={pending.contract}
          action={pending.action}
          onConfirm={runTransition}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "amber" | "indigo" | "gray" | "success" }) {
  const color =
    accent === "amber"   ? "text-amber-600 dark:text-amber-400" :
    accent === "indigo"  ? "text-indigo-600 dark:text-indigo-400" :
    accent === "success" ? "text-success-600 dark:text-success-400" :
    accent === "gray"    ? "text-gray-500 dark:text-gray-400" :
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
        <FileStackIcon />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {hasFilters ? "No contracts match your filters" : "No channel contracts yet"}
      </p>
      {!hasFilters && (
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
          Contracts are snapshotted from channel config on migrate. The ACTIVE version per channel is created
          automatically; more versions appear as channels bump their API versions.
        </p>
      )}
    </div>
  );
}
