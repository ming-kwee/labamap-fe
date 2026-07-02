"use client";

/**
 * P1-M · Cascade Outcome Indicator (APM → Agent).
 *
 * Makes the APM-vs-AI decision visible: which engine actually resolved this
 * analysis, and whether an AI timeout fell back to APM. Fields come from the
 * cascade block of POST /api/v1/adaptive-pattern-matching/analyze.
 * Spec: docs/ai/frontend/FRONTEND-ADDENDUM-2026-07-02.md §4 (P1-M).
 *
 * Self-contained (inline styles, only React + next/link) so it drops into any
 * screen that shows an APM response — including the merchant publish flow.
 * Badge selection logic lives in ./cascadeOutcome.ts (pure, unit-tested).
 */

import Link from "next/link";
import React from "react";
import { CascadeKind, CascadeOutcome, resolveCascadeVariant } from "./cascadeOutcome";

export type { CascadeOutcome } from "./cascadeOutcome";

const KIND_STYLE: Record<CascadeKind, { cls: string; dot: string }> = {
  apm: { cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", dot: "bg-green-500" },
  ai_auto: { cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", dot: "bg-violet-500" },
  ai_review: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", dot: "bg-amber-500" },
  ai_manual: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", dot: "bg-amber-500" },
  fallback_apm: { cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300", dot: "bg-yellow-500" },
  ai_failed: { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", dot: "bg-red-500" },
  ai_other: { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", dot: "bg-blue-500" },
};

export function CascadeOutcomeBadge({
  outcome,
  showDetail = false,
  sessionHref = "/platform-admin/ai-sessions",
  reviewHref = "/platform-admin/ai-recommendations",
}: {
  outcome: CascadeOutcome;
  showDetail?: boolean;
  sessionHref?: string;
  reviewHref?: string;
}) {
  const v = resolveCascadeVariant(outcome);
  if (!v) return null;

  const style = KIND_STYLE[v.kind];
  const needsReview = v.kind === "ai_review" || v.kind === "ai_manual";
  const enrichment: Array<[string, number | undefined]> = [
    ["dikoreksi", outcome.aiCorrectedFields?.length],
    ["gap terisi", outcome.aiGapsFilled?.length],
    ["required belum termap", outcome.aiChannelRequiredUnmapped?.length],
  ];

  return (
    <span className="inline-flex flex-col gap-1 align-middle">
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span title={v.title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${style.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {v.label}
        </span>

        {outcome.aiEnriched && outcome.aiConfidenceDelta != null && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            title="Peningkatan confidence dari enrichment AI (fase 2)"
          >
            +{(outcome.aiConfidenceDelta * 100).toFixed(0)}% AI-enriched
          </span>
        )}

        {needsReview && (
          <Link href={reviewHref} className="text-[11px] text-blue-500 hover:underline">
            Review →
          </Link>
        )}
        {outcome.aiAgentSessionId && (
          <Link
            href={`${sessionHref}?sessionId=${outcome.aiAgentSessionId}`}
            className="text-[11px] text-blue-500 hover:underline font-mono"
            title="Buka sesi agent (P1-E)"
          >
            sesi
          </Link>
        )}
      </span>

      {showDetail && (
        <span className="flex flex-col gap-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {enrichment
            .filter(([, n]) => (n ?? 0) > 0)
            .map(([label, n]) => (
              <span key={label}>
                {label}: <strong>{n}</strong>
              </span>
            ))}
          {(outcome.aiWarnings?.length ?? 0) > 0 && (
            <span className="text-amber-600 dark:text-amber-400">⚠ {outcome.aiWarnings!.length} warning</span>
          )}
        </span>
      )}
    </span>
  );
}

export default CascadeOutcomeBadge;
