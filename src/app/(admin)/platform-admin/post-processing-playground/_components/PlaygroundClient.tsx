"use client";

/**
 * PlaygroundClient — the Post-Processing Playground.
 *
 * 3-panel layout: Input JSON | Pipeline builder | Output.
 * Live auto-run (debounced) whenever the (valid) input or pipeline changes; also a
 * manual Run button. Loads the operation catalog once for the palette + param forms.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  CatalogResponse,
  OperationSpec,
  PipelineStep,
  RunResponse,
} from "../_types/playground";
import { PlaygroundService, stepsToRules } from "../_services/playground.service";
import { seedStepFromSpec } from "./paramKind";
import InputPanel from "./InputPanel";
import PipelineBuilder from "./PipelineBuilder";
import BlockCanvas from "./BlockCanvas";
import OutputPanel from "./OutputPanel";
import OpPalette from "./OpPalette";

type PipelineMode = "list" | "blocks";

const DEBOUNCE_MS = 400;

const DEFAULT_INPUT = JSON.stringify({ name: "Cotton T-Shirt", price: 19.99, status: "draft" }, null, 2);

const RunIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg>);
const FlaskIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6.5L5.2 17a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L14 9.5V3" /><path d="M7.5 14h9" /></svg>);

export default function PlaygroundClient() {
  // ─── Catalog ───────────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // ─── Input JSON ──────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState(DEFAULT_INPUT);

  // ─── Pipeline ────────────────────────────────────────────────────────────────
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("list");

  // ─── Run state ───────────────────────────────────────────────────────────────
  const [result, setResult] = useState<RunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Faithful mode (Phase 2): the real publish's afterPostProcessing to validate the output against.
  const [expectedOutput, setExpectedOutput] = useState<Record<string, unknown> | null>(null);

  // Load catalog once.
  useEffect(() => {
    let alive = true;
    (async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const c = await PlaygroundService.getCatalog();
        if (alive) setCatalog(c);
      } catch (e) {
        if (alive) setCatalogError((e as Error).message);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const specByCode = useMemo(() => {
    const m = new Map<string, OperationSpec>();
    for (const op of catalog?.operations ?? []) m.set(op.opCode, op);
    return m;
  }, [catalog]);

  // Same lookup as a plain record (BlockCanvas takes Record<string, OperationSpec>).
  const specRecord = useMemo(() => {
    const r: Record<string, OperationSpec> = {};
    for (const op of catalog?.operations ?? []) r[op.opCode] = op;
    return r;
  }, [catalog]);

  // Parse input JSON (memoized): { value, error }.
  const parsed = useMemo<{ value: Record<string, unknown> | null; error: string | null }>(() => {
    if (inputText.trim() === "") return { value: null, error: null };
    try {
      const v = JSON.parse(inputText);
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return { value: null, error: "Input must be a JSON object (not an array or primitive)." };
      }
      return { value: v as Record<string, unknown>, error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [inputText]);

  const rules = useMemo(() => stepsToRules(steps), [steps]);

  // Staged-dependency hint: steps whose sourcePath is a reserved `_`-key (e.g. `_sourceImages`) that isn't
  // in the input read nothing → no-op. Those keys only exist after JOLT/staging (faithful mode). List the
  // missing ones so the user knows to enable "Match real publish" (or add them manually). Auto-clears once
  // the key is present (faithful input includes it).
  const missingStaged = useMemo(() => {
    if (!parsed.value) return [];
    const inputKeys = new Set(Object.keys(parsed.value));
    const missing = new Set<string>();
    for (const s of steps) {
      const sp = s.sourcePath?.trim();
      if (sp && sp.startsWith("_")) {
        const top = sp.split(".")[0];
        if (!inputKeys.has(top)) missing.add(top);
      }
    }
    return [...missing].sort();
  }, [steps, parsed.value]);

  // ─── Run (shared by auto-run + manual) ───────────────────────────────────────
  const runNow = useCallback(async () => {
    if (!parsed.value) return;
    setRunning(true);
    setRunError(null);
    try {
      const res = await PlaygroundService.run(parsed.value, steps);
      setResult(res);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [parsed.value, steps]);

  // ─── Debounced auto-run ──────────────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!parsed.value) return; // don't auto-run on invalid/empty input
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      runNow();
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // re-run when the input value or the pipeline (rules) change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, rules]);

  // ─── Pipeline mutations ──────────────────────────────────────────────────────
  const addStep = useCallback((spec: OperationSpec) => {
    setSteps((prev) => [...prev, seedStepFromSpec(spec, uuidv4())]);
    setPaletteOpen(false);
  }, []);

  const changeStep = useCallback((id: string, patch: Partial<PipelineStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const moveStep = useCallback((id: string, dir: -1 | 1) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Hint for the output panel when we won't/can't auto-run.
  const disabledHint =
    inputText.trim() === ""
      ? "Provide an input JSON object to run the pipeline."
      : parsed.error
        ? "Fix the input JSON to run the pipeline."
        : null;

  const canRun = Boolean(parsed.value);

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-4rem)] min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400"><FlaskIcon /></div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Post-Processing Playground</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              JSON in → compose an ordered pipeline of post-processing operations → JSON out, step by step.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {catalog && (
            <span className="hidden sm:inline text-[11px] text-gray-400">
              {catalog.totalOperations} operation{catalog.totalOperations !== 1 ? "s" : ""} available
            </span>
          )}
          <button
            onClick={runNow}
            disabled={!canRun || running}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={canRun ? "Run pipeline" : "Provide valid input JSON first"}
          >
            <RunIcon /> Run
          </button>
        </div>
      </div>

      {/* Catalog error */}
      {catalogError && (
        <div className="mb-3 shrink-0 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          Failed to load operation catalog: {catalogError}
        </div>
      )}

      {/* 3-panel layout — stacks on small screens, side-by-side on lg. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Input */}
        <div className="min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <InputPanel
            text={inputText}
            onTextChange={setInputText}
            parseError={parsed.error}
            onLoadPipeline={setSteps}
            onExpectedOutput={setExpectedOutput}
          />
        </div>

        {/* Pipeline */}
        <div className="min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          {/* Panel header: title + List/Blocks mode toggle. Both modes edit the same steps. */}
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Pipeline</h2>
            </div>
            <div
              role="tablist"
              aria-label="Pipeline editor mode"
              className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5"
            >
              {(["list", "blocks"] as PipelineMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={pipelineMode === m}
                  onClick={() => setPipelineMode(m)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                    pipelineMode === m
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {catalogLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading catalog…</div>
            ) : pipelineMode === "list" ? (
              <PipelineBuilder
                steps={steps}
                specByCode={specByCode}
                onAddClick={() => setPaletteOpen(true)}
                onStepChange={changeStep}
                onMove={moveStep}
                onRemove={removeStep}
              />
            ) : (
              <BlockCanvas steps={steps} specByCode={specRecord} onChange={setSteps} />
            )}
          </div>
        </div>

        {/* Output */}
        <div className="min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <OutputPanel
            result={result}
            rules={rules}
            running={running}
            runError={runError}
            disabledHint={disabledHint}
            expectedOutput={expectedOutput}
            missingStaged={missingStaged}
          />
        </div>
      </div>

      {/* Palette modal */}
      {paletteOpen && (
        <OpPalette
          operations={catalog?.operations ?? []}
          onSelect={addStep}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
