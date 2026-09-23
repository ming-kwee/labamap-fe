"use client";

/**
 * OutputPanel — final output + per-step breakdown.
 * Top: final JSON (Copy) + error banner when success===false.
 * Below: collapsible steps with keysAdded/keysRemoved chips, disabled/error states.
 * Also a "Copy pipeline JSON" action that copies the rules[] array.
 */

import React, { useState } from "react";
import { Rule, RunResponse, RunStep } from "../_types/playground";

const CopyIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
const CheckIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>);
const ChevronIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      title={label}
    >
      {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> {label}</>}
    </button>
  );
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StepRow({ step }: { step: RunStep }) {
  const [open, setOpen] = useState(false);
  const failed = Boolean(step.error);
  return (
    <div
      className={`rounded-lg border ${
        failed
          ? "border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-900/10"
          : step.skipped
            ? "border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className={`transition-transform duration-150 text-gray-400 ${open ? "rotate-180" : ""}`}><ChevronIcon /></span>
        <span className="text-[11px] font-mono text-gray-400">#{step.index}</span>
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{step.name}</span>
        <div className="flex items-center gap-1 flex-wrap">
          {step.ops?.map((op, i) => (
            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">{op}</span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
          {step.skipped && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300">disabled</span>
          )}
          {(step.keysAdded ?? []).map((k) => (
            <span key={`a-${k}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300" title="key added">+{k}</span>
          ))}
          {(step.keysRemoved ?? []).map((k) => (
            <span key={`r-${k}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300" title="key removed">−{k}</span>
          ))}
          {failed && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">error</span>
          )}
        </div>
      </button>

      {failed && (
        <p className="px-3 pb-2 text-[11px] text-red-600 dark:text-red-400 font-mono break-words">{step.error}</p>
      )}

      {open && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-md p-2.5 overflow-x-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words max-h-72">
            {pretty(step.output)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function OutputPanel({
  result,
  rules,
  running,
  runError,
  disabledHint,
}: {
  result: RunResponse | null;
  rules: Rule[];
  running: boolean;
  runError: string | null;
  disabledHint: string | null;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Output</h2>
          {running && <span className="text-[11px] text-blue-500 dark:text-blue-400 animate-pulse">running…</span>}
        </div>
        <CopyButton getText={() => JSON.stringify(rules, null, 2)} label="Copy pipeline JSON" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {/* Disabled hint (invalid input etc.) */}
        {disabledHint && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
            {disabledHint}
          </div>
        )}

        {/* Transport / request error */}
        {runError && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 font-mono break-words">
            {runError}
          </div>
        )}

        {/* Pipeline-level error banner */}
        {result && !result.success && result.error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
            <span className="font-semibold">Pipeline failed:</span> <span className="font-mono break-words">{result.error}</span>
          </div>
        )}

        {/* Final output */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Final output</p>
            {result && (
              <CopyButton getText={() => pretty(result.finalOutput)} label="Copy" />
            )}
          </div>
          {result ? (
            <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 overflow-x-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
              {pretty(result.finalOutput)}
            </pre>
          ) : (
            <div className="text-[11px] text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              {disabledHint ? "—" : "Run the pipeline to see output."}
            </div>
          )}
        </div>

        {/* Steps */}
        {result && result.steps.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">Steps ({result.steps.length})</p>
            <div className="space-y-2">
              {result.steps.map((s) => (
                <StepRow key={s.index} step={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
