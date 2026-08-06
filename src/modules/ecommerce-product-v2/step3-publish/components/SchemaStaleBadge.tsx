"use client";
/**
 * SchemaStaleBadge — tri-state "is this generated JOLT spec built against the
 * channel's CURRENT apiSchema?" indicator, shared by the Publish-Trace Inspector
 * (modal) and the side-by-side Publish-Trace Diff page.
 *
 * Contract: docs/FRONTEND-JOLT-SPEC-SCHEMA-STALENESS.md §2.
 *   schemaStale === true  → STALE   (🔴 regenerate)
 *   schemaStale === false → FRESH   (⚪/✅ current)
 *   schemaStale == null   → UNKNOWN (🟡 not yet verified — legacy/unstamped)
 *
 * IMPORTANT: only render this for a GENERATED spec (source === "channel_jolt_specs").
 * For source="request"/"none" there is no spec to grade — the caller must guard.
 */
import React from "react";
import { AlertTriangle, CheckCircle2, HelpCircle } from "@/shared/ui/icons/Icons";

export type SchemaStaleStatus = "STALE" | "FRESH" | "UNKNOWN";

/** Map the trace's tri-state boolean (true / false / absent) to a status. */
export function deriveStaleStatus(schemaStale?: boolean | null): SchemaStaleStatus {
  if (schemaStale === true) return "STALE";
  if (schemaStale === false) return "FRESH";
  return "UNKNOWN";
}

function tooltipFor(status: SchemaStaleStatus, apiVersion?: string): string {
  switch (status) {
    case "STALE":
      return `Spec ini dibuat untuk apiSchema${apiVersion ? ` versi ${apiVersion}` : " lama"}, sementara apiSchema channel sudah berubah. Ia bisa memetakan ke path yang sudah dihapus/diganti — regenerate untuk membuat ulang terhadap skema terkini.`;
    case "FRESH":
      return `Fingerprint apiSchema cocok${apiVersion ? ` (versi ${apiVersion})` : ""} — spec dibuat terhadap skema channel yang terkini.`;
    case "UNKNOWN":
    default:
      return "Spec belum ter-stamp fingerprint (dibuat sebelum versioning apiSchema, atau channel belum punya fingerprint). Belum terverifikasi — regenerate untuk mengaktifkan deteksi.";
  }
}

/**
 * @param status    tri-state result (use deriveStaleStatus for trace data).
 * @param apiVersion the spec's target apiVersion — shown in the tooltip.
 * @param showFresh  render a small "skema terkini" chip when FRESH (default: hide FRESH entirely).
 */
export default function SchemaStaleBadge({
  status,
  apiVersion,
  showFresh = false,
  className = "",
}: {
  status: SchemaStaleStatus;
  apiVersion?: string;
  showFresh?: boolean;
  className?: string;
}) {
  if (status === "FRESH" && !showFresh) return null;

  const cfg = {
    STALE: {
      cls: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400",
      icon: <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />,
      label: "Skema usang — regenerate",
    },
    FRESH: {
      cls: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400",
      icon: <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />,
      label: "Skema terkini",
    },
    UNKNOWN: {
      cls: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400",
      icon: <HelpCircle className="h-3.5 w-3.5 flex-shrink-0" />,
      label: "Skema belum terverifikasi",
    },
  }[status];

  return (
    <span
      title={tooltipFor(status, apiVersion)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${cfg.cls} ${className}`}
    >
      {cfg.icon}
      {cfg.label}
      {apiVersion && (
        <span className="rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">
          {apiVersion}
        </span>
      )}
    </span>
  );
}
