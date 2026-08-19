"use client";

import React, { useState } from "react";
import Link from "next/link";
import { getChannelMeta } from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { ReverseSyncService, ReverseApiError } from "../services/reverse.service";
import type { ReverseImportRequest, ReverseImportResult } from "../types/reverse";
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

/**
 * FE-0 — Import preview modal (use case B). Shows the `draftMaster` the imported channel
 * item would become, any dedup `matches`, and the underlying 3-bucket classification.
 * Commits via `/import`: **Create new master** (DRAFT) or **Link to existing** (when a
 * dedup match is chosen). The new/linked master is DRAFT → route to Step-2 to finish.
 */
export function ImportPreviewModal({
  open,
  result,
  baseRequest,
  onClose,
  onCommitted,
}: {
  open: boolean;
  result: ReverseImportResult;
  /** org/store/channel + channelProductId/channelPayload/userId (no masterProductId). */
  baseRequest: ReverseImportRequest;
  onClose: () => void;
  onCommitted?: (r: ReverseImportResult) => void;
}) {
  const [committing, setCommitting] = useState<null | "create" | string>(null); // string = link target id
  const [done, setDone] = useState<ReverseImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const meta = getChannelMeta(result.channelType.toLowerCase() as ChannelType);
  const { matches, preview } = result;
  const busy = committing !== null;

  async function commit(masterProductId: string | null) {
    setCommitting(masterProductId ?? "create");
    setError(null);
    try {
      const r = await ReverseSyncService.importCommit({ ...baseRequest, masterProductId });
      setDone(r);
      onCommitted?.(r);
    } catch (err) {
      setError(err instanceof ReverseApiError ? err.message : "Failed to import");
    } finally {
      setCommitting(null);
    }
  }

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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import from {meta.label}</h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {result.candidateName || "channel item"}
              {result.channelProductId && <> · <span className="font-mono">{result.channelProductId}</span></>}
              {" "}· creates a new <span className="font-semibold">DRAFT</span> master
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          {done ? (
            <SuccessBanner result={done} />
          ) : (
            <>
              {error && (
                <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}

              {/* Dedup matches — offer link instead of create */}
              {matches.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Possible duplicate{matches.length > 1 ? "s" : ""} found
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/90 dark:text-amber-400/80">
                    This item may already be one of your master products. Link to it instead of creating a duplicate.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {matches.map((m) => (
                      <div key={m.productId} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 dark:bg-gray-900">
                        <span className="flex items-center gap-2 text-xs">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            {m.matchType}
                          </span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">{m.productId}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => commit(m.productId)}
                          disabled={busy}
                          className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
                        >
                          {committing === m.productId ? "Linking…" : "Link to this"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft master preview */}
              <DraftMasterPanel result={result} />

              {/* Classification detail (collapsed) */}
              <ReverseSummaryBar summary={preview.summary} notesCount={preview.deDerivationNotes.length} />
              <ReverseBucketSection title="Master-mapped" count={preview.masterMapped.length} hint="→ new master" accent="blue" defaultOpen={false}>
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
              <ReverseBucketSection title="Channel-only" count={preview.channelOnly.length} hint="→ Step-2 channelData" accent="gray" defaultOpen={false}>
                {preview.channelOnly.map((f, i) => (
                  <ImportPlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} />
                ))}
              </ReverseBucketSection>
              <ReverseBucketSection title="Discarded" count={preview.discarded.length} hint="operational — dropped" accent="muted" defaultOpen={false}>
                {preview.discarded.map((f, i) => (
                  <ImportPlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} muted />
                ))}
              </ReverseBucketSection>

              <DeDerivationNotes notes={preview.deDerivationNotes} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={() => commit(null)}
              disabled={busy}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {committing === "create" ? "Creating…" : "Create new master"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DraftMasterPanel({ result }: { result: ReverseImportResult }) {
  const { draftMaster } = result;
  const attrEntries = Object.entries(draftMaster.masterAttributes ?? {});
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">New master (draft)</h3>
      </div>
      <div className="space-y-3 p-4">
        {/* Master attributes */}
        {attrEntries.length > 0 && (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {attrEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="w-28 flex-shrink-0 font-mono text-gray-400 dark:text-gray-500">{k}</span>
                <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-200">{formatReverseValue(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Option groups */}
        {draftMaster.optionGroups?.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Options</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {draftMaster.optionGroups.map((g) => (
                <span key={g.name} className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 text-xs dark:border-gray-800 dark:bg-white/[0.02]">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{g.name}:</span>{" "}
                  <span className="text-gray-500 dark:text-gray-400">{g.values.join(", ")}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Variant groups */}
        {draftMaster.variantGroups?.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Variants ({draftMaster.variantGroups.length})
            </span>
            <div className="mt-1 overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <VariantTable rows={draftMaster.variantGroups} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Render the variant rows with a union of their keys as columns. */
function VariantTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const cols = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
        <tr>{cols.map((c) => <th key={c} className="px-2.5 py-1.5 font-semibold">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
            {cols.map((c) => (
              <td key={c} className="whitespace-nowrap px-2.5 py-1.5 text-gray-700 dark:text-gray-300">
                {formatReverseValue(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImportPlainRow({ path, value, note, muted }: { path: string; value: unknown; note?: string | null; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2 rounded-lg border px-3 py-1.5 text-xs ${
      muted
        ? "border-gray-100 bg-gray-50/40 text-gray-400 dark:border-gray-800 dark:bg-white/[0.01] dark:text-gray-500"
        : "border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]"
    }`}>
      <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{path}</span>
      <span className="text-gray-400">=</span>
      <span className="max-w-[55%] truncate font-medium text-gray-700 dark:text-gray-200">{formatReverseValue(value)}</span>
      {note && <span className="ml-auto truncate text-[11px] text-gray-400 dark:text-gray-500">{note}</span>}
    </div>
  );
}

function SuccessBanner({ result }: { result: ReverseImportResult }) {
  const linked = result.created === false;
  return (
    <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-4 text-center dark:border-success-500/25 dark:bg-success-500/10">
      <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-success-100 text-2xl dark:bg-success-500/20">
        ✓
      </div>
      <p className="font-semibold text-success-700 dark:text-success-400">
        {linked ? "Linked to existing master" : "New master created (DRAFT)"}
      </p>
      <p className="mt-1 text-sm text-success-700/80 dark:text-success-400/80">
        {linked
          ? "The channel item is now linked to your master product."
          : "Finish it in Step-2, then publish."}
      </p>
      <Link
        href={`/products/${encodeURIComponent(result.masterProductId)}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Open master product →
      </Link>
    </div>
  );
}

export default ImportPreviewModal;
