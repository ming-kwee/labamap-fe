"use client";

/**
 * BlockItem — one Scratch-style block in the Blocks view.
 *
 * Two shapes, chosen data-drivenly from the op's scope + whether it is a container:
 *   • Leaf block  — a rounded card: drag handle + opCode + scope pill + compact param
 *     form + enable toggle + remove. Used for DOCUMENT / LIST / PER_ITEM leaves.
 *   • C-block     — a container (FOR_EACH): a header row (handle, "FOR EACH" label,
 *     sourcePath / targetPath, toggle, remove) plus an indented "mouth" region (left
 *     notch, amber tint) that holds its PER_ITEM children. The mouth content is passed
 *     in by BlockCanvas (which owns the child SortableContext).
 *
 * Colors come from `scopeTheme(scope)` so the editor reads like a kid's block language.
 */

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { OperationSpec, PipelineStep } from "../_types/playground";
import { isContainerOp, scopeTheme } from "./paramKind";
import { ParamFields, RawParamsEditor, inputCls } from "./ParamFields";

// ─── Icons ───────────────────────────────────────────────────────────────────
const GripIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
);
const CloseIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);

/** The draggable "body" of a block — used both inline and inside the DragOverlay. */
export function BlockBody({
  step,
  spec,
  onChange,
  onRemove,
  handleProps,
  isContainer,
  mouth,
  ghost = false,
}: {
  step: PipelineStep;
  spec?: OperationSpec;
  onChange?: (patch: Partial<PipelineStep>) => void;
  onRemove?: () => void;
  /** Drag-handle listeners/attributes from useSortable (omitted in the overlay ghost). */
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isContainer: boolean;
  /** For a container: the mouth region (child blocks + add button), rendered by BlockCanvas. */
  mouth?: React.ReactNode;
  /** True when rendered inside the DragOverlay (no live inputs / interactivity). */
  ghost?: boolean;
}) {
  const theme = scopeTheme(spec?.scope);
  const scopeLabel = spec?.scope ?? "unknown op";
  const label = isContainer ? "FOR EACH" : step.opCode;

  const setParam = (name: string, v: unknown) => {
    if (!onChange) return;
    const next = { ...step.params };
    if (v === undefined) delete next[name];
    else next[name] = v;
    onChange({ params: next });
  };

  const handle = (
    <button
      type="button"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 rounded text-current/70 hover:bg-black/5 dark:hover:bg-white/10"
      {...handleProps}
    >
      <GripIcon />
    </button>
  );

  // ── C-block (container / FOR_EACH) ──────────────────────────────────────────
  if (isContainer) {
    return (
      <div className={`rounded-xl border-2 ${theme.border} ${step.enabled ? "" : "opacity-60"} overflow-hidden shadow-sm`}>
        {/* Header */}
        <div className={`flex items-center gap-2 px-3 py-2 ${theme.header}`}>
          {handle}
          <span className="font-bold text-xs tracking-wide">{label}</span>
          <code className="text-[10px] font-mono opacity-70">{step.opCode}</code>
          <div className="flex-1" />
          {!ghost && (
            <>
              <label className="inline-flex items-center px-1" title={step.enabled ? "Disable block" : "Enable block"}>
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(e) => onChange?.({ enabled: e.target.checked })}
                  aria-label={step.enabled ? "Disable block" : "Enable block"}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800"
                />
              </label>
              <button
                type="button"
                onClick={onRemove}
                aria-label="Remove block"
                title="Remove block"
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <CloseIcon />
              </button>
            </>
          )}
        </div>

        {/* Loop paths + description */}
        <div className={`px-3 pt-2 pb-1 ${theme.body}`}>
          {spec?.description && <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-2">{spec.description}</p>}
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">list to loop <span className="font-normal text-gray-400">(sourcePath)</span></label>
              <input
                type="text"
                value={step.sourcePath ?? ""}
                onChange={(e) => onChange?.({ sourcePath: e.target.value })}
                placeholder="e.g. variants"
                disabled={ghost}
                className={`${inputCls} font-mono`}
                aria-label="sourcePath"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">write back to <span className="font-normal text-gray-400">(targetPath)</span></label>
              <input
                type="text"
                value={step.targetPath ?? ""}
                onChange={(e) => onChange?.({ targetPath: e.target.value })}
                placeholder="e.g. product.variants"
                disabled={ghost}
                className={`${inputCls} font-mono`}
                aria-label="targetPath"
              />
            </div>
          </div>
          {/* Non-steps params of the container, if any. */}
          {spec && spec.params.some((p) => p.name !== "steps") && !ghost && (
            <div className="mt-2">
              <ParamFields spec={spec} params={step.params} onParamChange={setParam} hideSteps />
            </div>
          )}
        </div>

        {/* Mouth — indented, notched region holding PER_ITEM children. */}
        <div className={`ml-3 border-l-4 ${theme.accent} ${theme.body} pl-3 pr-3 py-2 rounded-bl-lg`}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1.5">
            for each item, do:
          </p>
          {mouth}
        </div>
      </div>
    );
  }

  // ── Leaf block ──────────────────────────────────────────────────────────────
  return (
    <div className={`rounded-lg border ${theme.border} ${theme.body} ${step.enabled ? "" : "opacity-60"} shadow-sm`}>
      {/* Header row */}
      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-t-lg ${theme.header}`}>
        {handle}
        <code className="text-xs font-mono font-semibold">{label}</code>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${theme.pill}`}>
          {scopeLabel}
        </span>
        {!spec && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200" title="This opCode is not in the catalog">
            unknown op
          </span>
        )}
        <div className="flex-1" />
        {!ghost && (
          <>
            <label className="inline-flex items-center px-1" title={step.enabled ? "Disable block" : "Enable block"}>
              <input
                type="checkbox"
                checked={step.enabled}
                onChange={(e) => onChange?.({ enabled: e.target.checked })}
                aria-label={step.enabled ? "Disable block" : "Enable block"}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800"
              />
            </label>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove block"
              title="Remove block"
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <CloseIcon />
            </button>
          </>
        )}
      </div>

      {/* Body: description + params */}
      {!ghost && (
        <div className="px-2.5 py-2 space-y-2">
          {spec?.description && <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{spec.description}</p>}
          {spec ? (
            <ParamFields spec={spec} params={step.params} onParamChange={setParam} />
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">Params (raw JSON)</label>
              <RawParamsEditor params={step.params} onChange={(p) => onChange?.({ params: p })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────

export default function BlockItem({
  step,
  spec,
  onChange,
  onRemove,
  mouth,
  invalidDrop = false,
}: {
  step: PipelineStep;
  spec?: OperationSpec;
  onChange: (patch: Partial<PipelineStep>) => void;
  onRemove: () => void;
  /** For a container: the mouth region rendered by BlockCanvas. */
  mouth?: React.ReactNode;
  /** When true, this block is the current (invalid) drop target — show a red ring. */
  invalidDrop?: boolean;
}) {
  const isContainer = isContainerOp(spec);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    data: { type: isContainer ? "container" : "leaf", scope: spec?.scope },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleProps = { ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={invalidDrop ? "ring-2 ring-red-400 dark:ring-red-500 rounded-xl" : undefined}
    >
      <BlockBody
        step={step}
        spec={spec}
        onChange={onChange}
        onRemove={onRemove}
        handleProps={handleProps}
        isContainer={isContainer}
        mouth={mouth}
      />
    </div>
  );
}
