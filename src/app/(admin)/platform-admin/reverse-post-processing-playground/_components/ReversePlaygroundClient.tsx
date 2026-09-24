"use client";

/**
 * ReversePlaygroundClient — the Reverse Post-Processing Playground.
 *
 * The reverse mirror of the forward Post-Processing Playground: pick a store + channel
 * product → pull the real channel payload → run the reverse pipeline stage by stage
 * (rebase → deDerive → enrich → classify) → 3-bucket master output. Read-only: only list +
 * pull/raw + trace + jolt-spec (never apply / import / pull-apply).
 *
 * SYMMETRIC 3-panel layout: Channel payload (input) | Reverse pipeline (ops from config, per
 * stage) | Output (stage-by-stage). The valid payload drives a debounced auto-run of `/trace`;
 * a manual Run button too. The loader lives in a side drawer + a summary bar.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReverseSyncService,
  type ReverseTrace,
  type ReverseOpSpec,
} from "@/modules/reverse-sync";
import SourceDrawer, { type LoadedSource } from "./SourceDrawer";
import ChannelPayloadPanel from "./ChannelPayloadPanel";
import ReversePipelinePanel from "./ReversePipelinePanel";
import ReverseOutputPanel from "./ReverseOutputPanel";
import ExplainerModal, { type ExplainerContent } from "./ExplainerModal";
import { OP_HELP, SECTION_HELP } from "./explainers";
import { useAuth } from "@/shared/contexts/AuthContext";

const DEBOUNCE_MS = 400;

const RunIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg>);
const ReverseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>);
const DataIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0" /></svg>);

export default function ReversePlaygroundClient() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  // ─── Loaded source (from the drawer's Pull & reverse) ────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [source, setSource] = useState<LoadedSource | null>(null);
  // Middle "Reverse pipeline" panel is a reference (the recipe) — collapsed by default so the main view is
  // payload → output (wider, readable). Toggle to reveal it (then layout becomes 3 columns).
  const [pipelineOpen, setPipelineOpen] = useState(false);

  // The channel payload text — seeded from the pull, then editable.
  const [payloadText, setPayloadText] = useState("");

  // Context the preview call needs (frozen from the pull; edits to the payload don't change these).
  const channelType = source?.raw.channelType ?? "";
  const storeId = source?.raw.storeId ?? "";
  const apiVersion = source?.raw.apiVersion;
  const masterProductId = source?.raw.masterProductId ?? "";

  // ─── Trace state ─────────────────────────────────────────────────────────────
  const [trace, setTrace] = useState<ReverseTrace | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // "What's this?" explainer modal content (null = closed).
  const [explain, setExplain] = useState<ExplainerContent | null>(null);

  // Open the explainer for a pipeline op-type (rich prose + catalog params/example).
  const explainOp = useCallback((opCode: string) => {
    const help = OP_HELP[opCode];
    const spec = opCatalogRef.current[opCode];
    if (!help && !spec) return;
    setExplain({
      title: help?.title ?? opCode,
      summary: help?.summary ?? spec?.description ?? "",
      detail: help?.detail ?? (spec?.description ? [spec.description] : []),
      how: help?.how,
      stage: spec?.stage,
      params: spec?.params,
      example: spec?.example,
    });
  }, []);

  // Open the explainer for an output section (stage or bucket).
  const explainSection = useCallback((key: string) => {
    const help = SECTION_HELP[key];
    if (!help) return;
    setExplain({ title: help.title, summary: help.summary, detail: help.detail, how: help.how });
  }, []);

  // Reverse op catalog (opCode → spec) — loaded once so each pipeline op can explain itself.
  const [opCatalog, setOpCatalog] = useState<Record<string, ReverseOpSpec>>({});
  const opCatalogRef = useRef<Record<string, ReverseOpSpec>>({});
  useEffect(() => {
    let alive = true;
    ReverseSyncService.getOpCatalog()
      .then((cat) => {
        if (!alive) return;
        const m: Record<string, ReverseOpSpec> = {};
        for (const op of cat.operations) m[op.opCode] = op;
        setOpCatalog(m);
        opCatalogRef.current = m;
      })
      .catch(() => { /* catalog is enrichment-only; ignore load failure */ });
    return () => { alive = false; };
  }, []);

  // Parse the (editable) payload text: { value, error }.
  const parsed = useMemo<{ value: Record<string, unknown> | null; error: string | null }>(() => {
    if (payloadText.trim() === "") return { value: null, error: null };
    try {
      const v = JSON.parse(payloadText);
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return { value: null, error: "Payload must be a JSON object (not an array or primitive)." };
      }
      return { value: v as Record<string, unknown>, error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [payloadText]);

  const onLoaded = useCallback((loaded: LoadedSource) => {
    setSource(loaded);
    setPayloadText(JSON.stringify(loaded.raw.channelPayload, null, 2));
    setTrace(null);
    setRunError(null);
    setDrawerOpen(false); // close the drawer so the editor gets full height
  }, []);

  // ─── Run (shared by auto-run + manual) ───────────────────────────────────────
  const runNow = useCallback(async () => {
    if (!parsed.value || !channelType) return;
    setRunning(true);
    setRunError(null);
    try {
      const res = await ReverseSyncService.trace({
        channelType,
        channelPayload: parsed.value,
        masterProductId, // required string — "" when unlinked
        storeId,
        ...(apiVersion ? { apiVersion } : {}),
      });
      setTrace(res);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [parsed.value, channelType, masterProductId, storeId, apiVersion]);

  // ─── Debounced auto-run ──────────────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!parsed.value || !channelType) return; // don't auto-run on invalid/empty payload or before a pull
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      runNow();
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // re-run when the payload text or the loaded channel changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadText, channelType]);

  const canRun = Boolean(parsed.value && channelType);

  // Hint for the output panel when we won't/can't auto-run.
  const disabledHint = !source
    ? "Load a channel product to run the reverse pipeline."
    : payloadText.trim() === ""
      ? "Provide a channel payload to run the reverse pipeline."
      : parsed.error
        ? "Fix the channel payload JSON to run the reverse pipeline."
        : null;

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-4rem)] min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400"><ReverseIcon /></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Reverse Post-Processing Playground</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                read-only
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Channel payload in → reverse pipeline (rebase → deDerive → enrich → classify) → master fields, read-only.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runNow}
            disabled={!canRun || running}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={canRun ? "Run reverse pipeline" : "Load a channel product with valid payload first"}
          >
            <RunIcon /> Run
          </button>
        </div>
      </div>

      {/* Source summary bar — opens the loader drawer; shows what's currently loaded. */}
      <div className="mb-3 shrink-0 flex items-center gap-2">
        <button
          onClick={() => setDrawerOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <DataIcon /> Load channel product
        </button>
        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
          {source ? (
            <>
              <span className="inline-flex max-w-[14rem] truncate items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" title={source.storeName}>
                {source.storeName}
              </span>
              <span className="text-gray-300 dark:text-gray-600">→</span>
              <span className="inline-flex max-w-[16rem] truncate items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" title={source.productTitle}>
                {source.productTitle}
              </span>
              <span className="text-gray-300 dark:text-gray-600">→</span>
              {masterProductId ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300" title={masterProductId}>
                  linked: <span className="font-mono ml-1 max-w-[10rem] truncate">{masterProductId}</span>
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  unlinked
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">Nothing loaded — click Load channel product</span>
          )}
          {/* Pipeline (recipe) toggle — reference panel, off by default to keep the view uncluttered. */}
          <button
            onClick={() => setPipelineOpen((v) => !v)}
            className={`ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
              pipelineOpen
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-900/20 dark:text-brand-300"
                : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
            aria-pressed={pipelineOpen}
            title="Show the reverse op pipeline (the recipe)"
          >
            {pipelineOpen ? "Hide pipeline" : "Show pipeline"}
          </button>
        </div>
      </div>

      {/* How-to-read hint */}
      <p className="mb-2 shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
        Read left → right: <b>Channel payload</b> (input) →{pipelineOpen ? " reverse pipeline (recipe) →" : ""}{" "}
        <b>Output</b> stage-by-stage (1 Rebase → 2 De-derive → 3 Enrich → 4 Classify = the 3-bucket result).
      </p>

      {/* Layout — payload (input) | [reverse pipeline (recipe, optional)] | output (stages). */}
      <div className={`flex-1 min-h-0 grid grid-cols-1 gap-4 ${pipelineOpen ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {/* Channel payload (input) */}
        <div className="min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <ChannelPayloadPanel
            text={payloadText}
            onTextChange={setPayloadText}
            parseError={parsed.error}
            parsedValue={parsed.value}
            loaded={source !== null}
          />
        </div>

        {/* Reverse pipeline (ops from config, per stage) — reference, shown on demand */}
        {pipelineOpen && (
          <div className="min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
            <ReversePipelinePanel operations={trace?.operations ?? []} catalog={opCatalog} onExplain={explainOp} />
          </div>
        )}

        {/* Output (stage-by-stage) */}
        <div className="min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <ReverseOutputPanel
            trace={trace}
            running={running}
            error={runError}
            disabledHint={disabledHint}
            onExplain={explainSection}
          />
        </div>
      </div>

      {/* Loader drawer */}
      <SourceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} orgId={orgId} onLoaded={onLoaded} />

      {/* "What's this?" explainer modal (ops + output sections) */}
      <ExplainerModal content={explain} onClose={() => setExplain(null)} />
    </div>
  );
}
