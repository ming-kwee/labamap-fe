"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChannelJoltSpec,
  UpdateJoltSpecRequest,
  SpecOrigin,
  SpecStalenessItem,
  SpecStalenessStatus,
  ORIGIN_LABELS,
  specOrigin,
  isAutoApplied,
  confidencePct,
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
const RegenerateIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
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

// ─── Origin / provenance badge (audit: who applied this JOLT to production) ───

const ORIGIN_STYLE: Record<SpecOrigin, { cls: string; icon: string }> = {
  AI_AGENT: { cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", icon: "🤖" },
  APM:      { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: "⚙️" },
  MANUAL:   { cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: "👤" },
};

function OriginBadge({ spec }: { spec: ChannelJoltSpec }) {
  const origin = specOrigin(spec);
  const style = ORIGIN_STYLE[origin];
  const pct = confidencePct(spec);
  const auto = isAutoApplied(spec);
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${style.cls}`}
        title={spec.joltMetadata.generatedBy ? `generatedBy: ${spec.joltMetadata.generatedBy}` : ORIGIN_LABELS[origin]}
      >
        {style.icon} {ORIGIN_LABELS[origin]}
      </span>
      {pct != null && (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span className={pct >= 92 ? "text-green-600 dark:text-green-400 font-medium" : pct >= 70 ? "text-amber-600 dark:text-amber-400" : ""}>
            {pct.toFixed(0)}%
          </span>
          {auto && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              title="Diterapkan otomatis tanpa review (confidence ≥ 92%)">
              auto
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ─── Schema-staleness badge (tri-state, from GET /staleness) ──────────────────

const STALENESS_STYLE: Record<SpecStalenessStatus, { cls: string; label: string; icon: string }> = {
  STALE:   { cls: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",       label: "Stale",       icon: "🔴" },
  FRESH:   { cls: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400", label: "Fresh",       icon: "🟢" },
  UNKNOWN: { cls: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400", label: "Unverified",  icon: "🟡" },
};

function stalenessTooltip(item: SpecStalenessItem): string {
  const base =
    item.status === "STALE"
      ? `Spec dibuat untuk apiSchema${item.specApiVersion ? ` versi ${item.specApiVersion}` : ""}, channel kini di${item.channelApiVersion ? ` versi ${item.channelApiVersion}` : " versi lain"}. Regenerate agar tidak memetakan ke path yang dihapus/diganti.`
      : item.status === "FRESH"
      ? `Fingerprint cocok — spec dibuat terhadap apiSchema channel terkini${item.channelApiVersion ? ` (versi ${item.channelApiVersion})` : ""}.`
      : "Belum ter-stamp fingerprint (spec legacy pra-versioning atau channel belum punya fingerprint). Regenerate untuk mengaktifkan deteksi.";
  const hashes =
    item.specTargetSchemaHash || item.channelApiSchemaHash
      ? `\n\nspec:    ${item.specTargetSchemaHash ?? "—"}\nchannel: ${item.channelApiSchemaHash ?? "—"}`
      : "";
  return base + hashes;
}

/** Tri-state schema-staleness pill. Absent staleness data → subtle "—" (endpoint not loaded). */
function SchemaStalenessBadge({ item }: { item?: SpecStalenessItem }) {
  if (!item) {
    return <span className="text-xs text-gray-300 dark:text-gray-600" title="Data staleness belum dimuat">—</span>;
  }
  const style = STALENESS_STYLE[item.status];
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${style.cls}`}
        title={stalenessTooltip(item)}
      >
        {style.icon} {style.label}
      </span>
      {item.channelApiVersion && (
        <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          title={`apiVersion channel saat ini: ${item.channelApiVersion}`}>
          api {item.channelApiVersion}
        </span>
      )}
    </div>
  );
}

const STRATEGY_COLORS: Record<string, string> = {
  CHANNEL_SPECIFIC:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  SEMANTIC_KNOWLEDGE: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  ALIAS_MAPPING:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PATTERN_MAPPING:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  KEYWORD_MATCHING:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  KEYWORD_SIMILARITY: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ─── Spec row ──────────────────────────────────────────────────────────────────

// ─── JOLT readiness helpers ───────────────────────────────────────────────────

type ReadinessStatus = "READY" | "WARNINGS" | "NOT_READY" | "UNKNOWN";

function parseReadiness(warnings: string[] | undefined): ReadinessStatus {
  if (!warnings?.length) return "UNKNOWN";
  const line = warnings.find(w => w.includes("[JOLT-READINESS]"));
  if (!line) return "UNKNOWN";
  if (line.includes("NOT_READY")) return "NOT_READY";
  if (line.includes("WARNINGS"))  return "WARNINGS";
  if (line.includes("READY"))     return "READY";
  return "UNKNOWN";
}

const READINESS_BADGE: Record<ReadinessStatus, { cls: string; label: string }> = {
  READY:     { cls: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",    label: "✓ Ready"    },
  WARNINGS:  { cls: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",    label: "⚠ Warnings" },
  NOT_READY: { cls: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",            label: "✗ Not Ready" },
  UNKNOWN:   { cls: "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500",                    label: "— No check"  },
};

function SpecRow({
  spec, staleness, onEdit, onDelete, onRegenerate,
}: {
  spec: ChannelJoltSpec;
  staleness?: SpecStalenessItem;
  onEdit: (s: ChannelJoltSpec) => void;
  onDelete: (s: ChannelJoltSpec) => void;
  onRegenerate: (s: ChannelJoltSpec) => void;
}) {
  const [expanded, setExpanded]           = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [confirmRegen, setConfirmRegen]     = useState(false);

  const meta      = spec.joltMetadata;
  const isLocked  = meta.isManuallyConfigured === true;
  const readiness = parseReadiness(meta.warnings);
  const badge     = READINESS_BADGE[readiness];
  // Regenerate is offered for STALE (primary) and UNKNOWN (verify). FRESH → nothing to do.
  const canRegenerate = staleness?.status === "STALE" || staleness?.status === "UNKNOWN";

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

        {/* Generated by (provenance / audit) */}
        <td className="px-3 py-2.5">
          <OriginBadge spec={spec} />
        </td>

        {/* Schema staleness */}
        <td className="px-3 py-2.5">
          <SchemaStalenessBadge item={staleness} />
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
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
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

            {/* Regenerate (STALE/UNKNOWN) — DELETE the spec; a fresh, stamped one is rebuilt on
                next publish/analyse. Locked (human-owned) specs get a firm confirm (docs §4). */}
            {canRegenerate && !confirmDelete && (
              confirmRegen ? (
                <span className="flex items-center gap-1">
                  {isLocked && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400"
                      title="Spec ini dikunci (human-owned). Agent TIDAK meregenerasi otomatis — menghapus berarti hilang sampai dikonfigurasi manual lagi.">
                      🔒 human-owned!
                    </span>
                  )}
                  <button onClick={() => { setConfirmRegen(false); onRegenerate(spec); }}
                    className="px-2 py-1 text-xs rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 font-medium transition-colors">
                    {isLocked ? "Tetap regenerate" : "Regenerate"}
                  </button>
                  <button onClick={() => setConfirmRegen(false)}
                    className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                    Batal
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmRegen(true)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded font-medium transition-colors ${
                    staleness?.status === "STALE"
                      ? "bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 dark:text-amber-400"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  title={staleness?.status === "STALE"
                    ? "Regenerate: hapus spec usang; AI agent membangun ulang otomatis (ter-stamp fingerprint terkini) pada publish/analyse berikutnya"
                    : "Regenerate untuk memverifikasi — spec belum ter-stamp fingerprint"}>
                  <RegenerateIcon />
                  {staleness?.status === "STALE" ? "Regenerate" : "Verifikasi"}
                </button>
              )
            )}

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
            ) : !confirmRegen ? (
              <button onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors" title="Delete spec (APM will regenerate)">
                <TrashIcon />
              </button>
            ) : null}
          </div>
        </td>
      </tr>

      {/* Expanded: full JOLT spec */}
      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              <div className="space-y-1">
                {spec.description && <ExpandItem label="Description" value={spec.description} />}
                {meta.generatedBy && <ExpandItem label="Generated by" value={meta.generatedBy} mono />}
                {meta.generatedAt && <ExpandItem label="Generated at" value={new Date(meta.generatedAt).toLocaleString()} />}
                {confidencePct(spec) != null && (
                  <ExpandItem label="Confidence" value={`${confidencePct(spec)!.toFixed(1)}%${isAutoApplied(spec) ? " · auto-applied" : ""}`} />
                )}
                <ExpandItem label="Created" value={spec.createdAt ? new Date(spec.createdAt).toLocaleString() : "—"} />
              </div>
              <div className="space-y-1">
                <ExpandItem label="isActive" value={String(spec.isActive)} />
                {meta.supersetSchemaHash && <ExpandItem label="Schema hash" value={meta.supersetSchemaHash} mono />}
                {staleness && <ExpandItem label="Schema status" value={staleness.status} />}
                {staleness?.specApiVersion && <ExpandItem label="Spec apiVersion" value={staleness.specApiVersion} />}
                {staleness?.channelApiVersion && <ExpandItem label="Channel apiVersion" value={staleness.channelApiVersion} />}
                {staleness?.specTargetSchemaHash && <ExpandItem label="Spec target hash" value={staleness.specTargetSchemaHash} mono />}
                {staleness?.channelApiSchemaHash && <ExpandItem label="Channel schema hash" value={staleness.channelApiSchemaHash} mono />}
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
            {/* JOLT Readiness Warnings */}
            {meta.warnings && meta.warnings.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badge.cls}`}>
                    JOLT Readiness: {readiness}
                  </span>
                </div>
                <div className="space-y-1">
                  {meta.warnings.map((w, i) => {
                    const isHeader   = w.includes("[JOLT-READINESS]");
                    const isError    = w.startsWith("✗") || w.includes("NOT_READY") || w.includes("CONFLICT");
                    const isWarning  = w.startsWith("⚠") || w.includes("WARNINGS");
                    const isOk       = w.startsWith("✓") || w.includes("READY") && !isError;
                    const textCls    = isError   ? "text-error-700 dark:text-error-400"
                                     : isWarning ? "text-warning-700 dark:text-warning-400"
                                     : isOk      ? "text-success-700 dark:text-success-400"
                                     :             "text-gray-600 dark:text-gray-400";
                    return (
                      <p key={i} className={`text-xs font-mono ${isHeader ? "font-bold " + textCls : textCls}`}>
                        {w}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            {spec.supersetSchema && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
                  supersetSchema ({(spec.supersetSchema.optionalFields as unknown[])?.length ?? 0} optional fields) ▸
                </summary>
                <pre className="mt-1.5 text-xs font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto max-h-48 text-gray-800 dark:text-gray-200">
                  {JSON.stringify(spec.supersetSchema, null, 2)}
                </pre>
              </details>
            )}
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
    CHANNEL_SPECIFIC:   "T1",
    SEMANTIC_KNOWLEDGE: "T2",
    ALIAS_MAPPING:      "T3",
    PATTERN_MAPPING:    "T4",
    KEYWORD_MATCHING:   "T5",
    KEYWORD_SIMILARITY: "T5",
  };
  return map[tier] ?? tier.slice(0, 6);
}

// ─── Main page ─────────────────────────────────────────────────────────────────

// Deep-link support (e.g. "Lihat spec ini" from Publish Diagnostics): ?channelId=&categoryId=
// filters to that channel and auto-opens the matching spec's editor. useSearchParams needs a
// Suspense boundary in the App Router.
export default function ChannelJoltSpecsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400 dark:text-gray-500">Loading…</div>}>
      <ChannelJoltSpecsPageInner />
    </Suspense>
  );
}

function ChannelJoltSpecsPageInner() {
  const searchParams = useSearchParams();
  const deepLinkChannel  = searchParams.get("channelId");
  const deepLinkCategory = searchParams.get("categoryId");
  const deepLinkHandled  = useRef(false);

  const [specs, setSpecs]               = useState<ChannelJoltSpec[]>([]);
  const [stalenessById, setStalenessById] = useState<Map<string, SpecStalenessItem>>(new Map());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>(deepLinkChannel ?? "all");
  const [lockedFilter, setLockedFilter] = useState<"all" | "locked" | "auto">("all");
  const [originFilter, setOriginFilter] = useState<"all" | SpecOrigin | "auto_applied">("all");
  const [staleOnly, setStaleOnly]       = useState(false);
  const [editTarget, setEditTarget]     = useState<ChannelJoltSpec | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [confirmBulkRegen, setConfirmBulkRegen] = useState(false);
  // Specs deleted for regeneration disappear from the list until APM/agent rebuilds them on
  // the next publish/analyse — so we surface a persistent "awaiting regeneration" banner.
  const [pendingRegen, setPendingRegen] = useState<{ channelId: string; categoryId: string }[]>([]);
  const [toast, setToast]               = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const channelId = channelFilter !== "all" ? channelFilter : undefined;
    try {
      // Specs are the primary list. Staleness is additive — fetch best-effort so a missing/older
      // /staleness endpoint degrades gracefully (no badges) rather than breaking the whole page.
      const [data, staleness] = await Promise.all([
        ChannelJoltSpecService.listSpecs({ channelId }),
        ChannelJoltSpecService.listStaleness({ channelId }).catch((e) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[ChannelJoltSpecs] staleness fetch failed (degrading gracefully):", e);
          }
          return [] as SpecStalenessItem[];
        }),
      ]);
      setSpecs(data);
      setStalenessById(new Map(staleness.map((s) => [s.id, s])));
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

  // Once specs are loaded, honor a ?channelId=&categoryId= deep link: open the matching spec's
  // editor, or (if none is cached yet) tell the admin why. Runs once per navigation.
  useEffect(() => {
    if (deepLinkHandled.current || loading || !deepLinkChannel || !deepLinkCategory) return;
    deepLinkHandled.current = true;
    const target = specs.find(
      (s) => s.channelId === deepLinkChannel && (s.categoryId ?? "default") === deepLinkCategory,
    );
    if (target) {
      setEditTarget(target);
    } else {
      showToast(
        `Belum ada JOLT spec tersimpan untuk ${CHANNEL_TYPE_LABELS[deepLinkChannel] ?? deepLinkChannel} / ${deepLinkCategory}. APM akan membuatnya saat publish/analyse berikutnya.`,
        "error",
      );
    }
  }, [loading, specs, deepLinkChannel, deepLinkCategory]);

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

  function noteAwaitingRegen(channelId: string, categoryId: string) {
    setPendingRegen((prev) =>
      prev.some((p) => p.channelId === channelId && p.categoryId === categoryId)
        ? prev
        : [...prev, { channelId, categoryId }],
    );
  }

  // Regenerate = DELETE the stale spec. It is async: nothing is rebuilt now — a fresh, fingerprint-
  // stamped spec appears on the NEXT publish/analyse. So we record it as "awaiting regeneration".
  async function handleRegenerate(spec: ChannelJoltSpec) {
    try {
      await ChannelJoltSpecService.deleteSpec(spec.id);
      const cat = spec.categoryId ?? "default";
      noteAwaitingRegen(spec.channelId, cat);
      showToast(
        `Spec dihapus — menunggu regenerasi pada publish/analyse berikutnya untuk ${CHANNEL_TYPE_LABELS[spec.channelId] ?? spec.channelId} / ${cat}. Spec baru akan ter-stamp fingerprint terkini (FRESH).`,
        "success",
      );
      load();
    } catch (err) { showToast((err as Error).message, "error"); }
  }

  // Bulk: regenerate every STALE spec. Locked (isManuallyConfigured) specs are SKIPPED — the agent
  // deliberately does not auto-rebuild human-owned specs; those need manual review (docs §4).
  async function handleBulkRegenerateStale() {
    setConfirmBulkRegen(false);
    const targets = specs.filter(
      (s) => stalenessById.get(s.id)?.status === "STALE" && !s.joltMetadata.isManuallyConfigured,
    );
    if (targets.length === 0) {
      showToast("Tidak ada spec STALE non-locked untuk diregenerasi.", "error");
      return;
    }
    let ok = 0;
    for (const s of targets) {
      try {
        await ChannelJoltSpecService.deleteSpec(s.id);
        ok++;
        noteAwaitingRegen(s.channelId, s.categoryId ?? "default");
      } catch { /* keep going — report the tally at the end */ }
    }
    const lockedSkipped = specs.filter(
      (s) => stalenessById.get(s.id)?.status === "STALE" && s.joltMetadata.isManuallyConfigured,
    ).length;
    showToast(
      `${ok}/${targets.length} spec STALE dihapus — menunggu regenerasi pada publish berikutnya.` +
        (lockedSkipped ? ` ${lockedSkipped} spec terkunci dilewati (perlu review manual).` : ""),
      "success",
    );
    load();
  }

  const filtered = useMemo(() => specs
    .filter((s) => {
      if (lockedFilter === "locked" && !s.joltMetadata.isManuallyConfigured) return false;
      if (lockedFilter === "auto"   && s.joltMetadata.isManuallyConfigured)  return false;
      if (originFilter === "auto_applied" && !isAutoApplied(s)) return false;
      else if (originFilter !== "all" && originFilter !== "auto_applied" && specOrigin(s) !== originFilter) return false;
      if (staleOnly && stalenessById.get(s.id)?.status !== "STALE") return false;
      return true;
    })
    .sort((a, b) => {
      if (a.channelId !== b.channelId) return a.channelId.localeCompare(b.channelId);
      return (a.categoryId ?? "default").localeCompare(b.categoryId ?? "default");
    }),
  [specs, lockedFilter, originFilter, staleOnly, stalenessById]);

  const lockedCount  = specs.filter((s) => s.joltMetadata.isManuallyConfigured).length;
  const channelCount = new Set(specs.map((s) => s.channelId)).size;
  const aiAutoApplied = specs.filter((s) => specOrigin(s) === "AI_AGENT" && isAutoApplied(s)).length;
  const staleCount   = specs.filter((s) => stalenessById.get(s.id)?.status === "STALE").length;

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
          {staleCount > 0 && (
            confirmBulkRegen ? (
              <span className="flex items-center gap-1.5">
                <button onClick={handleBulkRegenerateStale}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg font-medium transition-colors">
                  <RegenerateIcon />
                  Regenerate {staleCount} stale
                </button>
                <button onClick={() => setConfirmBulkRegen(false)}
                  className="px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                  Batal
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmBulkRegen(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm rounded-lg transition-colors"
                title="Hapus semua spec STALE non-locked; masing-masing diregenerasi pada publish/analyse berikutnya">
                <RegenerateIcon />
                Regenerate stale ({staleCount})
              </button>
            )
          )}
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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total Specs" value={specs.length} />
        <StatCard label="Schema stale" value={staleCount} accent="error" />
        <StatCard label="AI auto-applied" value={aiAutoApplied} accent="violet" />
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
          <p>
            <strong>Audit provenance:</strong> kolom <strong>Generated by</strong> menunjukkan siapa yang menerapkan tiap spec —
            🤖 AI agent, ⚙️ APM, atau 👤 Manual — plus confidence. Filter <strong>“Auto-applied (≥92%)”</strong> untuk melihat
            JOLT yang diterapkan otomatis ke produksi <em>tanpa</em> melewati Review Queue.
          </p>
          <p>
            <strong>Schema staleness:</strong> kolom <strong>Schema</strong> membandingkan fingerprint apiSchema saat spec dibuat vs channel sekarang —
            🔴 <strong>Stale</strong> (dibuat terhadap apiSchema lama; bisa memetakan ke path yang dihapus/diganti → <strong>Regenerate</strong>),
            🟢 <strong>Fresh</strong>, atau 🟡 <strong>Unverified</strong> (spec legacy belum ter-stamp). <strong>Regenerate</strong> menghapus spec;
            AI agent membangun ulang otomatis pada publish/analyse berikutnya. Spec 🔒 terkunci tidak diregenerasi otomatis — perlu konfirmasi tegas.
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
          <span className="text-xs text-gray-500 dark:text-gray-400">Generated by:</span>
          <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="all">All origins</option>
            <option value="AI_AGENT">🤖 AI agent</option>
            <option value="APM">⚙️ APM</option>
            <option value="MANUAL">👤 Manual</option>
            <option value="auto_applied">✓ Auto-applied (≥92%)</option>
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

        <label className="flex items-center gap-1.5 cursor-pointer select-none"
          title="Tampilkan hanya spec yang STALE (dibuat terhadap apiSchema lama)">
          <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-error-600 focus:ring-error-500 dark:border-gray-600 dark:bg-gray-800" />
          <span className="text-xs text-gray-600 dark:text-gray-400">🔴 Stale saja</span>
        </label>

        <span className="ml-auto text-xs text-gray-400">{filtered.length} spec{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Awaiting-regeneration banner — regenerate is async; the spec reappears (FRESH) on the
          next publish/analyse. Persist a reminder until the admin dismisses it. */}
      {pendingRegen.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="text-amber-500 shrink-0 mt-0.5"><RegenerateIcon /></div>
          <div className="flex-1 text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-medium">Menunggu regenerasi pada publish/analyse berikutnya:</p>
            <div className="flex flex-wrap gap-1.5">
              {pendingRegen.map((p, i) => (
                <span key={`${p.channelId}/${p.categoryId}/${i}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 font-mono">
                  {CHANNEL_TYPE_LABELS[p.channelId] ?? p.channelId} / {p.categoryId}
                </span>
              ))}
            </div>
            <p className="opacity-80">
              Spec baru dibangun otomatis oleh AI agent (ter-stamp fingerprint terkini) — belum ada sampai publish/analyse berjalan.
            </p>
          </div>
          <button onClick={() => setPendingRegen([])}
            className="shrink-0 text-xs text-amber-600 dark:text-amber-400 hover:underline">Tutup</button>
        </div>
      )}

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
        <EmptyState hasFilters={channelFilter !== "all" || lockedFilter !== "all" || originFilter !== "all" || staleOnly} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Channel / Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Organization</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Mappings</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Generated by</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Schema</th>
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
                  staleness={stalenessById.get(s.id)}
                  onEdit={(x) => setEditTarget(x)}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
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

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "amber" | "indigo" | "gray" | "violet" | "error" }) {
  const color =
    accent === "amber"  ? "text-amber-600 dark:text-amber-400" :
    accent === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    accent === "violet" ? "text-violet-600 dark:text-violet-400" :
    accent === "error"  ? "text-error-600 dark:text-error-400" :
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
