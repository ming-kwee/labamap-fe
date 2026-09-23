"use client";

/**
 * OutputPanel — final output + per-step breakdown.
 * Top: final JSON (Copy) + error banner when success===false.
 * Below: collapsible steps with keysAdded/keysRemoved chips, disabled/error states.
 * Also a "Copy pipeline JSON" action that copies the rules[] array.
 */

import React, { useState } from "react";
import { Rule, RunResponse, RunStep } from "../_types/playground";
import { useTextFind, FindBar, FindToggle } from "./useTextFind";
import JsonTree from "./JsonTree";

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

/** Stable stringify (sorted keys) so key order doesn't cause false "differs". */
function stable(value: unknown): string {
  const seen = new WeakSet();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const o = v as Record<string, unknown>;
    return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = norm(o[k]);
      return acc;
    }, {});
  };
  try {
    return JSON.stringify(norm(value));
  } catch {
    return String(value);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** One differing leaf between the playground output (`a`) and the real publish output (`b`). */
interface DiffPath {
  path: string;
  a: unknown; // playground value (undefined = absent)
  b: unknown; // real publish value
}

/**
 * Recursive deep diff → the exact nested LEAF paths that differ (dot for objects, [i] for arrays).
 * Much more useful than a top-level key diff for wrapper channels (Shopify/Wix nest everything under
 * `product`). Identical subtrees are pruned via the stable stringify.
 */
function diffPaths(a: unknown, b: unknown, prefix = ""): DiffPath[] {
  if (stable(a) === stable(b)) return [];
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    const out: DiffPath[] = [];
    for (let i = 0; i < n; i++) out.push(...diffPaths(a[i], b[i], `${prefix}[${i}]`));
    return out;
  }
  return [{ path: prefix || "(root)", a, b }];
}

/** Short one-line preview of a value for the diff detail view. */
function shortVal(v: unknown): string {
  if (v === undefined) return "(absent)";
  let s: string;
  try {
    s = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

const MAX_DIFFS = 40;

/** Faithful-mode validation banner: green when identical, else the exact differing paths (playground vs real). */
function ValidationBanner({ diffs }: { diffs: DiffPath[] }) {
  const [open, setOpen] = useState(false);
  if (diffs.length === 0) {
    return (
      <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1.5">
        <CheckIcon /> <span className="font-medium">Matches real publish</span> — the playground output equals the channel&rsquo;s real <span className="font-mono">afterPostProcessing</span>.
      </div>
    );
  }
  const shown = diffs.slice(0, MAX_DIFFS);
  const more = diffs.length - shown.length;
  return (
    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-1.5 px-3 py-2 text-left" aria-expanded={open}>
        <span className={`transition-transform text-amber-500 ${open ? "rotate-90" : ""}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </span>
        <span className="font-medium">Differs from real publish</span>
        <span>at {diffs.length} path{diffs.length !== 1 ? "s" : ""}</span>
        <span className="ml-auto text-amber-500 underline">{open ? "hide" : "details"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1.5 max-h-56 overflow-auto">
          {shown.map((d) => (
            <div key={d.path} className="rounded-md bg-white/60 dark:bg-gray-900/40 border border-amber-200/60 dark:border-amber-800/40 p-1.5">
              <div className="font-mono text-[10px] text-gray-700 dark:text-gray-200 break-all">{d.path}</div>
              <div className="mt-0.5 font-mono text-[10px] text-gray-500 dark:text-gray-400 break-all">
                <span className="text-blue-500">playground</span> {shortVal(d.a)}
              </div>
              <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 break-all">
                <span className="text-green-600 dark:text-green-400">real</span> {shortVal(d.b)}
              </div>
            </div>
          ))}
          {more > 0 && <div className="text-[10px] text-amber-600 dark:text-amber-400">+ {more} more path{more !== 1 ? "s" : ""}</div>}
        </div>
      )}
    </div>
  );
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
  expectedOutput,
  missingStaged,
}: {
  result: RunResponse | null;
  rules: Rule[];
  running: boolean;
  runError: string | null;
  disabledHint: string | null;
  /** Faithful mode: the real publish's afterPostProcessing to validate against (null = off). */
  expectedOutput?: Record<string, unknown> | null;
  /** Reserved `_`-keys a step reads but the input lacks → the rule no-ops (enable faithful mode). */
  missingStaged?: string[];
}) {
  // Validation (faithful mode): deep-diff the playground output vs the real publish output.
  const validation =
    expectedOutput && result && result.success
      ? diffPaths(result.finalOutput, expectedOutput)
      : null;

  // Find-in-JSON over the final output (same mechanism as the input panel).
  const finalText = result ? pretty(result.finalOutput) : "";
  const find = useTextFind(finalText);
  // Final-output view: collapsible Tree (default) or Raw text (with find).
  const [outView, setOutView] = useState<"tree" | "raw">("tree");

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
        {/* Staged-dependency hint — a rule reads a `_`-key absent from the input → it no-ops. */}
        {missingStaged && missingStaged.length > 0 && (
          <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-700 dark:text-blue-300">
            <span className="font-medium">Pipeline reads staged data not in the input:</span>{" "}
            <span className="font-mono">{missingStaged.join(", ")}</span>. These only exist after JOLT/staging, so those rules do nothing here — enable <b>Match real publish</b>, or add the key(s) to the input.
          </div>
        )}

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

        {/* Faithful-mode validation banner (deep-path diff) */}
        {validation && <ValidationBanner diffs={validation} />}

        {/* Final output */}
        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Final output</p>
            {result && (
              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5">
                  {(["tree", "raw"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setOutView(v)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-md capitalize transition-colors ${
                        outView === v ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {outView === "raw" && <FindToggle find={find} />}
                <CopyButton getText={() => pretty(result.finalOutput)} label="Copy" />
              </div>
            )}
          </div>
          {result ? (
            outView === "tree" ? (
              <JsonTree data={result.finalOutput} />
            ) : (
              <>
                {find.open && <FindBar find={find} />}
                <textarea
                  ref={find.ref}
                  readOnly
                  value={finalText}
                  spellCheck={false}
                  aria-label="Final output JSON"
                  className="w-full h-64 resize-y font-mono text-[11px] leading-relaxed bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 whitespace-pre"
                />
              </>
            )
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
