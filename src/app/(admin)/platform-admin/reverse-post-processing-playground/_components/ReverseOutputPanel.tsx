"use client";

/**
 * ReverseOutputPanel — the RIGHT panel: the reverse pipeline result, STAGE BY STAGE.
 *
 * The reverse mirror of the forward playground's OutputPanel per-step breakdown: each reverse
 * stage (rebase → deDerive → enrich → classify) is a collapsible row. Non-terminal stages show
 * their flat `output` via <JsonTree/> (plus any de-derivation notes); the terminal `classify`
 * stage renders the 3-bucket classification by REUSING the reverse-sync components verbatim
 * (ReverseSummaryBar → 3× ReverseBucketSection with ReverseDiffField / PlainRow → DeDerivationNotes).
 * Read-only — no apply/review actions.
 */

import React, { useState } from "react";
import {
  ReverseSummaryBar,
  ReverseBucketSection,
  ReverseDiffField,
  DeDerivationNotes,
  formatReverseValue,
  type ReverseTrace,
  type ReverseStage,
  type ReverseMasterDraft,
} from "@/modules/reverse-sync";
import JsonTree from "@/app/(admin)/platform-admin/post-processing-playground/_components/JsonTree";

const ChevronIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);

export default function ReverseOutputPanel({
  trace,
  running,
  error,
  disabledHint,
  onExplain,
}: {
  trace: ReverseTrace | null;
  running: boolean;
  error: string | null;
  /** Hint shown when we can't/won't run (no payload loaded, invalid JSON). */
  disabledHint: string | null;
  /** Open the "what's this?" explainer for an output section (stage key or bucket key). */
  onExplain?: (sectionKey: string) => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Output</h2>
          {running && <span className="text-[11px] text-blue-500 dark:text-blue-400 animate-pulse">running…</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {/* Disabled hint (no payload / invalid JSON) */}
        {disabledHint && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
            {disabledHint}
          </div>
        )}

        {/* Transport / request error */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 font-mono break-words">
            {error}
          </div>
        )}

        {trace ? (
          <div className="space-y-2">
            {trace.stages.map((stage, i) => (
              <StageRow
                key={`${stage.stage}-${i}`}
                index={i + 1}
                stage={stage}
                // Terminal (classify / preview) stage expanded by default; intermediate stages collapsed.
                defaultOpen={Boolean(stage.preview) || Boolean(stage.masterDraft)}
                onExplain={onExplain}
              />
            ))}
          </div>
        ) : (
          !disabledHint &&
          !error && (
            <div className="text-[11px] text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              {running
                ? "Running reverse pipeline…"
                : "Pull a channel product to see the reverse pipeline stage by stage."}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** Fixed stage → number, shared with the pipeline panel so tengah↔kanan align. */
const STAGE_NUM: Record<string, number> = { rebase: 1, deDerive: 2, enrich: 3, classify: 4, build: 5 };

/** One collapsible stage row — mirrors the forward OutputPanel's StepRow. */
function StageRow({
  index,
  stage,
  defaultOpen,
  onExplain,
}: {
  index: number;
  stage: ReverseStage;
  defaultOpen: boolean;
  onExplain?: (sectionKey: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const addedCount = stage.added?.length ?? 0;
  const notesCount = stage.notes?.length ?? 0;
  const isTerminal = Boolean(stage.preview);

  return (
    <div
      className={`rounded-lg border bg-white dark:bg-gray-900 ${
        isTerminal
          ? "border-blue-200 dark:border-blue-800"
          : stage.masterDraft
            ? "border-emerald-200 dark:border-emerald-800"
            : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className={`transition-transform duration-150 text-gray-400 ${open ? "rotate-180" : ""}`}>
          <ChevronIcon />
        </span>
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-300">
          {STAGE_NUM[stage.stage] ?? index}
        </span>
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{stage.label}</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {stage.stage}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
          {onExplain && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onExplain(stage.stage); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onExplain(stage.stage); } }}
              className="text-[11px] font-medium text-gray-400 hover:text-brand-500"
              title="What's this?"
            >
              what&rsquo;s this?
            </span>
          )}
          {addedCount > 0 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
              title="keys added"
            >
              +{addedCount} key{addedCount !== 1 ? "s" : ""}
            </span>
          )}
          {notesCount > 0 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300"
              title="de-derivation notes"
            >
              {notesCount} note{notesCount !== 1 ? "s" : ""}
            </span>
          )}
          {isTerminal && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
              classification
            </span>
          )}
          {stage.masterDraft && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">
              master draft
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {stage.preview ? (
            <ClassifyBody preview={stage.preview} onExplain={onExplain} />
          ) : stage.masterDraft ? (
            <MasterDraftBody draft={stage.masterDraft} />
          ) : (
            <>
              {stage.output && <JsonTree data={stage.output} />}
              {stage.notes && stage.notes.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {stage.notes.map((n, i) => (
                    <li key={i} className="text-[11px] text-amber-600 dark:text-amber-400">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The terminal classify stage — the 3-bucket view, composed exactly like the old ReverseOutputPanel. */
function ClassifyBody({
  preview,
  onExplain,
}: {
  preview: NonNullable<ReverseStage["preview"]>;
  onExplain?: (sectionKey: string) => void;
}) {
  return (
    <div className="space-y-4">
      <ReverseSummaryBar summary={preview.summary} notesCount={preview.deDerivationNotes.length} />

      {/* (a) master-mapped */}
      <ReverseBucketSection
        title="Master-mapped"
        count={preview.masterMapped.length}
        hint="→ master fields"
        accent="blue"
        defaultOpen
        onHelp={onExplain ? () => onExplain("masterMapped") : undefined}
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
            wrap
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
        onHelp={onExplain ? () => onExplain("channelOnly") : undefined}
      >
        {preview.channelOnly.map((f, i) => (
          <PlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} />
        ))}
      </ReverseBucketSection>

      {/* (c) discarded */}
      <ReverseBucketSection
        title="Discarded"
        count={preview.discarded.length}
        hint="operational / unknown — dropped"
        accent="muted"
        defaultOpen={false}
        onHelp={onExplain ? () => onExplain("discarded") : undefined}
      >
        {preview.discarded.map((f, i) => (
          <PlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} muted />
        ))}
      </ReverseBucketSection>

      <DeDerivationNotes notes={preview.deDerivationNotes} />
    </div>
  );
}

/** Small image thumbnail grid (channel URLs, as-is). */
function Thumbs({ urls, label }: { urls: string[]; label: string }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">{label} ({urls.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={u}
            alt=""
            title={u}
            className="h-14 w-14 rounded-md border border-gray-200 dark:border-gray-700 object-cover bg-gray-50 dark:bg-gray-800"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.25"; }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Stage 5 — the reconstructed master draft as RAW JSON (the pipeline's output: attributes + images + variants),
 * rendered via JsonTree like the other pipeline stages — not a visual preview.
 */
function MasterDraftBody({ draft }: { draft: ReverseMasterDraft }) {
  return <JsonTree data={draft as unknown as Record<string, unknown>} />;
}

/** A plain key = value row for the channel-only / discarded buckets (mirrors ReversePreviewModal.PlainRow). */
function PlainRow({
  path,
  value,
  note,
  muted,
}: {
  path: string;
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
        {path}
      </span>
      <span className="text-gray-400">=</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium text-gray-700 dark:text-gray-200">{formatReverseValue(value)}</span>
      {note && <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{note}</span>}
    </div>
  );
}
