"use client";

/**
 * OpCard — one "puzzle piece" in the pipeline.
 * Header: op code + description + reorder / toggle / remove.
 * Body:   dynamic param form built from spec.params, a compact source/target paths row,
 *         and an expandable inline example.
 */

import React, { useState } from "react";
import { OperationSpec, PipelineStep } from "../_types/playground";
import { isContainerOp } from "./paramKind";
import { ParamField, RawParamsEditor, inputCls } from "./ParamFields";

// ─── Icons ───────────────────────────────────────────────────────────────────
const UpIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>);
const DownIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
const CloseIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);
const ChevronIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);

const SCOPE_CLS: Record<string, string> = {
  DOCUMENT: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300",
  LIST: "bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300",
  PER_ITEM: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300",
};

// ─── Card ────────────────────────────────────────────────────────────────────

export default function OpCard({
  step,
  spec,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  step: PipelineStep;
  spec?: OperationSpec;
  index: number;
  total: number;
  onChange: (patch: Partial<PipelineStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [showExample, setShowExample] = useState(false);

  const container = isContainerOp(spec);
  const childCount = step.children?.length ?? 0;

  const setParam = (name: string, v: unknown) => {
    const next = { ...step.params };
    if (v === undefined) delete next[name];
    else next[name] = v;
    onChange({ params: next });
  };

  const hasExample =
    spec && (spec.inputExample !== undefined || spec.outputExample !== undefined || spec.jsonExample !== undefined || spec.exampleCaption);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        step.enabled
          ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          : "border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 opacity-70"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-2 p-3 border-b border-gray-100 dark:border-gray-800">
        <span className="mt-0.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-md bg-gray-100 dark:bg-gray-800 text-[11px] font-mono text-gray-500 dark:text-gray-400">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">{step.opCode}</code>
            {spec && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${SCOPE_CLS[spec.scope] ?? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300"}`}>
                {spec.scope}
              </span>
            )}
            {!spec && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300" title="This opCode is not in the catalog">
                unknown op
              </span>
            )}
          </div>
          {spec?.description && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{spec.description}</p>
          )}
        </div>
        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up" title="Move up" className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><UpIcon /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down" title="Move down" className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><DownIcon /></button>
          <label className="inline-flex items-center px-1" title={step.enabled ? "Disable step" : "Enable step"}>
            <input
              type="checkbox"
              checked={step.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              aria-label={step.enabled ? "Disable step" : "Enable step"}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
          <button onClick={onRemove} aria-label="Remove step" title="Remove step" className="p-1.5 rounded text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"><CloseIcon /></button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Optional label for the step */}
        <div>
          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">Step name <span className="font-normal text-gray-400">(optional)</span></label>
          <input
            type="text"
            value={step.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={`${step.opCode} #${index + 1}`}
            className={inputCls}
            aria-label="Step name"
          />
        </div>

        {/* Container hint — this op's children (per-item ops) are edited in Blocks mode. */}
        {container && (
          <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/10 px-3 py-2">
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              {childCount} per-item op{childCount !== 1 ? "s" : ""} — edit in <span className="font-semibold">Blocks</span> mode.
            </p>
          </div>
        )}

        {/* Params (a container op's `steps` param is managed by children, not shown here) */}
        {spec ? (
          (() => {
            const visibleParams = container ? spec.params.filter((p) => p.name !== "steps") : spec.params;
            return visibleParams.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {visibleParams.map((p) => (
                  <ParamField key={p.name} param={p} value={step.params[p.name]} onChange={(v) => setParam(p.name, v)} />
                ))}
              </div>
            ) : container ? null : (
              <p className="text-[11px] text-gray-400 italic">This operation takes no parameters.</p>
            );
          })()
        ) : (
          // Unknown op: expose a raw JSON editor for its params so the step is still editable.
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">Params (raw JSON)</label>
            <RawParamsEditor params={step.params} onChange={(p) => onChange({ params: p })} />
          </div>
        )}

        {/* Paths row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">sourcePath <span className="font-normal text-gray-400">(rule)</span></label>
            <input
              type="text"
              value={step.sourcePath ?? ""}
              onChange={(e) => onChange({ sourcePath: e.target.value })}
              placeholder="e.g. variants"
              className={`${inputCls} font-mono`}
              aria-label="sourcePath"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">targetPath <span className="font-normal text-gray-400">(rule)</span></label>
            <input
              type="text"
              value={step.targetPath ?? ""}
              onChange={(e) => onChange({ targetPath: e.target.value })}
              placeholder="e.g. product.variants"
              className={`${inputCls} font-mono`}
              aria-label="targetPath"
            />
          </div>
        </div>

        {/* Example */}
        {hasExample && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
            <button
              onClick={() => setShowExample((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-expanded={showExample}
            >
              <span className={`transition-transform duration-150 ${showExample ? "rotate-180" : ""}`}><ChevronIcon /></span>
              Example
            </button>
            {showExample && (
              <div className="mt-2 space-y-2">
                {spec?.exampleCaption && <p className="text-[11px] text-gray-500 dark:text-gray-400">{spec.exampleCaption}</p>}
                {spec?.jsonExample !== undefined && (
                  <ExampleBlock title="Rule fragment" value={spec.jsonExample} />
                )}
                {spec?.inputExample !== undefined && <ExampleBlock title="Input" value={spec.inputExample} />}
                {spec?.outputExample !== undefined && <ExampleBlock title="Output" value={spec.outputExample} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExampleBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">{title}</p>
      <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-md p-2 overflow-x-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
