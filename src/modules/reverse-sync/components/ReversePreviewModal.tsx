"use client";

import React, { useState } from "react";
import { getChannelMeta } from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import type { ReversePreview, ReverseApplyResult, ReverseReviewResult } from "../types/reverse";
import { ReverseSummaryBar } from "./ReverseSummaryBar";
import { ReverseBucketSection } from "./ReverseBucketSection";
import { ReverseDiffField } from "./ReverseDiffField";
import { DeDerivationNotes } from "./DeDerivationNotes";
import { formatReverseValue } from "./format";

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

type ActionResult =
  | { kind: "apply"; data: ReverseApplyResult }
  | { kind: "review"; data: ReverseReviewResult };

/**
 * P2 — Reverse Preview / Diff modal.
 *
 * Presents a `ReversePreview` (3 buckets + summary + de-derivation notes) and exposes
 * two idempotent actions the parent wires to the right endpoint:
 *   • Apply to Step-2  → `onApply`  (parent: `/pull/apply` for pull, `/apply` for manual)
 *   • Send to Review   → `onReview` (parent: `/review`); hidden when not provided
 *
 * The modal owns submit state + the post-action result banner; it never writes master
 * global (that only happens later via Accept in the Suggestions inbox).
 */
export function ReversePreviewModal({
  open,
  preview,
  channelProductId,
  onApply,
  onReview,
  onClose,
  onApplied,
  labelForPath,
}: {
  open: boolean;
  preview: ReversePreview;
  channelProductId?: string;
  onApply?: () => Promise<ReverseApplyResult>;
  onReview?: () => Promise<ReverseReviewResult>;
  onClose: () => void;
  /** Called after a successful apply/review so the parent can refresh status stamps. */
  onApplied?: (result: ActionResult) => void;
  labelForPath?: (path: string) => string | undefined;
}) {
  const [submitting, setSubmitting] = useState<null | "apply" | "review">(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const meta = getChannelMeta(preview.channelType.toLowerCase() as ChannelType);

  async function run(kind: "apply" | "review") {
    const fn = kind === "apply" ? onApply : onReview;
    if (!fn) return;
    setSubmitting(kind);
    setError(null);
    try {
      const data = await fn();
      const res: ActionResult = kind === "apply"
        ? { kind: "apply", data: data as ReverseApplyResult }
        : { kind: "review", data: data as ReverseReviewResult };
      setResult(res);
      onApplied?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${kind}`);
    } finally {
      setSubmitting(null);
    }
  }

  const busy = submitting !== null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${meta.bg} ${meta.text}`} title={meta.label}>
                {meta.code}
              </span>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Reverse preview</h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              Pulled from {meta.label}
              {channelProductId && (
                <> · <span className="font-mono">{channelProductId}</span></>
              )}
              {" "}· nothing is written until you choose an action below
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          <ReverseSummaryBar summary={preview.summary} notesCount={preview.deDerivationNotes.length} />

          {/* Post-action result banner */}
          {result && <ResultBanner result={result} />}
          {error && (
            <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          {/* (a) master-mapped */}
          <ReverseBucketSection
            title="Master-mapped"
            count={preview.masterMapped.length}
            hint="needs a decision"
            accent="blue"
            defaultOpen
          >
            {preview.masterMapped.map((f, i) => (
              <ReverseDiffField
                key={`${f.channelPath}-${i}`}
                channelPath={f.channelPath}
                label={f.masterAttrId}
                currentValue={f.currentMasterValue}
                incomingValue={f.channelValue}
                changed={f.changed}
                note={f.note}
              />
            ))}
          </ReverseBucketSection>

          {/* (b) channel-only */}
          <ReverseBucketSection
            title="Channel-only"
            count={preview.channelOnly.length}
            hint="→ Step-2 channelData"
            accent="gray"
            defaultOpen
          >
            {preview.channelOnly.map((f, i) => (
              <PlainRow
                key={`${f.channelPath}-${i}`}
                path={f.channelPath}
                label={labelForPath?.(f.channelPath)}
                value={f.channelValue}
                note={f.note}
              />
            ))}
          </ReverseBucketSection>

          {/* (c) discarded */}
          <ReverseBucketSection
            title="Discarded"
            count={preview.discarded.length}
            hint="operational / unknown — dropped"
            accent="muted"
            defaultOpen={false}
          >
            {preview.discarded.map((f, i) => (
              <PlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} muted />
            ))}
          </ReverseBucketSection>

          <DeDerivationNotes notes={preview.deDerivationNotes} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {onReview && (
            <button
              type="button"
              onClick={() => run("review")}
              disabled={busy}
              className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10"
            >
              {submitting === "review" ? "Routing…" : "Send to review"}
            </button>
          )}
          {onApply && (
            <button
              type="button"
              onClick={() => run("apply")}
              disabled={busy}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting === "apply" ? "Applying…" : "Apply to Step-2"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** A plain key = value row for channel-only / discarded buckets. */
function PlainRow({
  path,
  label,
  value,
  note,
  muted,
}: {
  path: string;
  label?: string;
  value: unknown;
  note?: string | null;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-3 py-1.5 text-xs ${
        muted
          ? "border-gray-100 bg-gray-50/40 text-gray-400 dark:border-gray-800 dark:bg-white/[0.01] dark:text-gray-500"
          : "border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]"
      }`}
    >
      <span className="font-mono font-medium text-gray-600 dark:text-gray-300" title={path}>
        {label ?? path}
      </span>
      {label && <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">({path})</span>}
      <span className="text-gray-400">=</span>
      <span className="max-w-[50%] truncate font-medium text-gray-700 dark:text-gray-200">{formatReverseValue(value)}</span>
      {note && <span className="ml-auto truncate text-[11px] text-gray-400 dark:text-gray-500">{note}</span>}
    </div>
  );
}

function ResultBanner({ result }: { result: ActionResult }) {
  if (result.kind === "apply") {
    const r = result.data;
    return (
      <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 dark:border-success-500/25 dark:bg-success-500/10">
        <p className="text-sm font-semibold text-success-700 dark:text-success-400">Applied to Step-2</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip n={r.masterOverridesWritten.length} label="master overrides" tone="success" />
          <Chip n={r.channelDataWritten.length} label="channel data" tone="success" />
          <Chip n={r.variantsReconciled.length} label="variants" tone="success" />
          <Chip n={r.discarded} label="discarded" tone="muted" />
        </div>
      </div>
    );
  }
  const r = result.data;
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-500/25 dark:bg-brand-500/10">
      <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">Routed by policy</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip n={r.suggested.length} label="→ review inbox" tone="brand" />
        <Chip n={r.perStoreApplied.length} label="per-store applied" tone="success" />
        <Chip n={r.skipped.length} label="skipped" tone="muted" />
      </div>
      {r.suggested.length > 0 && (
        <p className="mt-2 text-xs text-brand-600/90 dark:text-brand-400/80">
          {r.suggested.length} field{r.suggested.length === 1 ? "" : "s"} now waiting in the Suggestions inbox for approval.
        </p>
      )}
    </div>
  );
}

function Chip({ n, label, tone }: { n: number; label: string; tone: "success" | "brand" | "muted" }) {
  const cls =
    tone === "success"
      ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300"
      : tone === "brand"
        ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className="tabular-nums">{n}</span> {label}
    </span>
  );
}

export default ReversePreviewModal;
