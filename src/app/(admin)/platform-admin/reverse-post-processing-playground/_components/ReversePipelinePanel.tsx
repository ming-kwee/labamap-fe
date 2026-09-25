"use client";

/**
 * ReversePipelinePanel — the MIDDLE panel: the reverse op pipeline, READ-ONLY.
 *
 * The reverse mirror of the forward playground's editable pipeline builder. Here the ops
 * are NOT composable — they're loaded verbatim from the channel's `reverseSyncConfig.operations[]`
 * ({op, ...params}) and shown grouped by their FIXED reverse stage (rebase → deDerive → enrich →
 * classify). This is a DISPLAY grouping only; the runtime stage order is fixed.
 */

import React from "react";
import JsonTree from "@/app/(admin)/platform-admin/post-processing-playground/_components/JsonTree";
import type { ReverseOpSpec } from "@/modules/reverse-sync";

// ─── op → stage (DISPLAY grouping only) ────────────────────────────────────────
const OP_STAGE: Record<string, string> = {
  REBASE_ITEM: "rebase",
  DERIVE_SCALAR: "deDerive",
  AGGREGATE: "enrich",
  ATTRIBUTE_LIST: "classify",
  METAFIELD_INVERSE: "classify",
  IMAGE_INVERSE: "classify",
  VARIANT_INVERSE: "classify",
};

/** Fixed stage order for the headers. */
const STAGE_ORDER = ["rebase", "deDerive", "enrich", "classify", "other"] as const;
type StageKey = (typeof STAGE_ORDER)[number];

/** Stage → number (shared with the output panel so tengah↔kanan align); "other" has none. Build (5) is
 *  output-only — it has no config op to list here, so it is not in the pipeline grouping. */
const STAGE_NUM: Partial<Record<StageKey, number>> = { rebase: 1, deDerive: 2, enrich: 3, classify: 4 };

const STAGE_META: Record<StageKey, { label: string; op: string; header: string; pill: string }> = {
  rebase: {
    label: "Rebase",
    // op-name color (mono) + stage-header accent, per the forward playground's scope colors.
    op: "text-amber-600 dark:text-amber-400",
    header: "text-amber-700 dark:text-amber-300",
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  },
  deDerive: {
    label: "De-derive",
    op: "text-indigo-600 dark:text-indigo-400",
    header: "text-indigo-700 dark:text-indigo-300",
    pill: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300",
  },
  enrich: {
    label: "Enrich",
    op: "text-emerald-600 dark:text-emerald-400",
    header: "text-emerald-700 dark:text-emerald-300",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  },
  classify: {
    label: "Classify",
    op: "text-blue-600 dark:text-blue-400",
    header: "text-blue-700 dark:text-blue-300",
    pill: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  },
  other: {
    label: "Other",
    op: "text-gray-600 dark:text-gray-300",
    header: "text-gray-600 dark:text-gray-300",
    pill: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  },
};

function stageOf(op: Record<string, unknown>): StageKey {
  const name = typeof op.op === "string" ? op.op : "";
  return (OP_STAGE[name] as StageKey) ?? "other";
}

/** One read-only op card: op name (mono, stage-colored) + short teaser + a "what's this?" that opens the
 *  slow explainer modal. Params for THIS channel shown compactly below. */
function OpCard({
  op,
  stage,
  spec,
  onExplain,
}: {
  op: Record<string, unknown>;
  stage: StageKey;
  spec?: ReverseOpSpec;
  onExplain?: (opCode: string) => void;
}) {
  const name = typeof op.op === "string" ? op.op : "(unknown op)";
  // Params = everything except the `op` discriminator.
  const { op: _op, ...params } = op;
  void _op;
  const hasParams = Object.keys(params).length > 0;
  const meta = STAGE_META[stage];
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`text-xs font-mono font-semibold ${meta.op}`}>{name}</span>
        {onExplain && typeof op.op === "string" && (
          <button
            onClick={() => onExplain(op.op as string)}
            className="ml-auto shrink-0 text-[11px] font-medium text-gray-400 hover:text-brand-500"
            title="What this op does"
          >
            what&rsquo;s this?
          </button>
        )}
      </div>
      {/* One-line teaser from the catalog; full slow explanation is in the modal. */}
      {spec?.description && (
        <p className="px-3 -mt-1 pb-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{spec.description}</p>
      )}
      {/* Config params for THIS channel. */}
      {hasParams && (
        <div className="px-3 pb-2.5">
          <JsonTree data={params} />
        </div>
      )}
    </div>
  );
}

export default function ReversePipelinePanel({
  operations,
  catalog,
  onExplain,
}: {
  operations: Array<Record<string, unknown>>;
  /** opCode → spec, from /reverse/op-catalog — lets each op explain itself. */
  catalog?: Record<string, ReverseOpSpec>;
  /** Open the "what's this?" explainer modal for an op-type. */
  onExplain?: (opCode: string) => void;
}) {
  // Group ops by their fixed stage, preserving encounter order within each stage.
  const byStage = React.useMemo(() => {
    const map: Record<StageKey, Array<Record<string, unknown>>> = {
      rebase: [],
      deDerive: [],
      enrich: [],
      classify: [],
      other: [],
    };
    for (const op of operations) map[stageOf(op)].push(op);
    return map;
  }, [operations]);

  const empty = operations.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="mb-2 shrink-0">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Reverse pipeline</h2>
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          Ops loaded from the channel&rsquo;s <span className="font-mono">reverseSyncConfig</span> — read-only (fixed
          stages), not composed.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
        {empty ? (
          <div className="text-[11px] text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
            Load a channel product to see its reverse op pipeline.
          </div>
        ) : (
          STAGE_ORDER.filter((s) => byStage[s].length > 0).map((s) => {
            const meta = STAGE_META[s];
            const ops = byStage[s];
            return (
              <div key={s}>
                <div className="mb-1.5 flex items-center gap-2">
                  {STAGE_NUM[s] != null && (
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                      {STAGE_NUM[s]}
                    </span>
                  )}
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.header}`}>
                    {meta.label}
                  </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.pill}`}
                  >
                    {ops.length} op{ops.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {ops.map((op, i) => (
                    <OpCard
                      key={`${s}-${i}`}
                      op={op}
                      stage={s}
                      spec={catalog?.[typeof op.op === "string" ? op.op : ""]}
                      onExplain={onExplain}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
