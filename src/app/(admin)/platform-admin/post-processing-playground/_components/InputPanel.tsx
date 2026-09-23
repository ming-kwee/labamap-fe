"use client";

/**
 * InputPanel — the source JSON document.
 *
 * Two input modes (like Publish Diagnostics):
 *  - "From My Products" — pick an existing product; its real fields load into the editor.
 *  - "Paste JSON"       — type/paste JSON manually.
 * Both feed the same editable JSON editor (loaded product data is still tweakable before running).
 * Monospace textarea + live validity indicator, Format / Sample / Clear actions.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/shared/contexts/AuthContext";
import {
  PlaygroundService,
  ProductOption,
  ChannelOption,
  ChannelRule,
  rulesToSteps,
} from "../_services/playground.service";
import { PipelineStep } from "../_types/playground";
import ProductFieldPicker from "./ProductFieldPicker";
import ChannelRulePicker from "./ChannelRulePicker";

// ─── Built-in sample presets ─────────────────────────────────────────────────
const SAMPLES: { label: string; value: unknown }[] = [
  {
    label: "Simple product",
    value: { name: "Cotton T-Shirt", price: 19.99, status: "draft" },
  },
  {
    label: "Variant product",
    value: {
      name: "Cotton T-Shirt",
      variants: [
        { sku: "TS-RED-S", color: "Red", price: 19.99 },
        { sku: "TS-BLU-M", color: "Blue", price: 21.99 },
      ],
    },
  },
  {
    label: "With _source",
    value: {
      _source: { weight: 1.2 },
      package_weight: { unit: "KILOGRAM" },
    },
  },
];

// ─── Icons ───────────────────────────────────────────────────────────────────
const CheckIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>);
const AlertIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>);
const ChevronIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
const RefreshIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>);
const SearchIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>);
const UpIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>);
const DownIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
const CloseIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);
const DataIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0" /></svg>);

const btnCls =
  "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

export default function InputPanel({
  text,
  onTextChange,
  parseError,
  onLoadPipeline,
  onExpectedOutput,
}: {
  text: string;
  onTextChange: (t: string) => void;
  parseError: string | null;
  /** Load a real channel's post-processing rules into the pipeline builder. */
  onLoadPipeline?: (steps: PipelineStep[]) => void;
  /** Faithful mode: the real publish's afterPostProcessing, to validate the playground output against. */
  onExpectedOutput?: (expected: Record<string, unknown> | null) => void;
}) {
  const [sampleOpen, setSampleOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── "From My Products" mode ──────────────────────────────────────────────────
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";
  const [inputMode, setInputMode] = useState<"products" | "json">("json");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadedProduct, setLoadedProduct] = useState<Record<string, unknown> | null>(null);
  // Which loader is shown (side-by-side, one at a time — they can't both load the pipeline together).
  const [loadMode, setLoadMode] = useState<"fields" | "config">("fields");
  // The loaders live in a side drawer so the JSON editor gets full height.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!orgId) {
      setProductsError("No organization in session — sign in to list products.");
      return;
    }
    setProductsLoading(true);
    setProductsError(null);
    try {
      setProducts(await PlaygroundService.listProducts(orgId));
    } catch (e) {
      setProductsError((e as Error).message);
    } finally {
      setProductsLoading(false);
    }
  }, [orgId]);

  // Lazy-load the product list the first time the picker mode is opened.
  useEffect(() => {
    if (inputMode === "products" && products.length === 0 && !productsLoading && !productsError) {
      loadProducts();
    }
  }, [inputMode, products.length, productsLoading, productsError, loadProducts]);

  const onSelectProduct = useCallback(
    async (id: string) => {
      setSelectedProductId(id);
      setLoadedProduct(null);
      if (!id) return;
      setLoadingProduct(true);
      setProductsError(null);
      try {
        // Fetch the product's real fields but DON'T write the editor yet — let the field
        // picker decide "load all" vs "load specific parent fields".
        setLoadedProduct(await PlaygroundService.getProductInput(id, orgId));
      } catch (e) {
        setProductsError((e as Error).message);
      } finally {
        setLoadingProduct(false);
      }
    },
    [orgId],
  );

  // ── "Load real config" (a channel's real post-processing rules) ──────────────
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [channelRules, setChannelRules] = useState<ChannelRule[] | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadedConfig, setLoadedConfig] = useState<{ name: string; ruleCount: number; faithful: boolean } | null>(null);
  const [faithful, setFaithful] = useState(false);

  // Lazy-load the channel list once a product is loaded (the Real-config row appears).
  useEffect(() => {
    if (!loadedProduct || channels.length > 0 || channelsLoading) return;
    setChannelsLoading(true);
    PlaygroundService.listChannels()
      .then(setChannels)
      .catch((e) => setConfigError((e as Error).message))
      .finally(() => setChannelsLoading(false));
  }, [loadedProduct, channels.length, channelsLoading]);

  // Pick a channel → fetch its rules for the rule picker (don't load into the pipeline yet).
  const onSelectChannel = useCallback(async (channelId: string) => {
    setSelectedChannelId(channelId);
    setChannelRules(null);
    setLoadedConfig(null);
    setConfigError(null);
    if (!channelId) return;
    setRulesLoading(true);
    try {
      setChannelRules(await PlaygroundService.getChannelRules(channelId));
    } catch (e) {
      setConfigError((e as Error).message);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  // Load the CHOSEN rules (all or a subset) into the pipeline + set the input (simple or faithful).
  const performLoad = useCallback(
    async (selectedRules: ChannelRule[]) => {
      if (!loadedProduct || !onLoadPipeline) return;
      setLoadingConfig(true);
      setConfigError(null);
      try {
        onLoadPipeline(rulesToSteps(selectedRules));            // → pipeline (list & blocks)
        const ch = channels.find((c) => c.channelId === selectedChannelId);

        if (faithful) {
          // Faithful: dry-run the real pipeline (JOLT + staging) → post-processing INPUT + real OUTPUT.
          const scn = await PlaygroundService.traceRealScenario(selectedProductId, selectedChannelId, loadedProduct);
          if (scn.input) {
            onTextChange(JSON.stringify(scn.input, null, 2));
            onExpectedOutput?.(scn.expectedOutput);
          } else {
            onTextChange(JSON.stringify(loadedProduct, null, 2));
            onExpectedOutput?.(null);
            setConfigError(
              scn.warnings.length > 0
                ? `Faithful trace: ${scn.warnings[0]} — loaded product fields instead.`
                : "Faithful input unavailable — is the BFF updated & restarted? Loaded product fields instead.",
            );
          }
        } else {
          onTextChange(JSON.stringify(loadedProduct, null, 2));  // simple: raw product fields
          onExpectedOutput?.(null);
        }
        setLoadedConfig({ name: ch?.name ?? selectedChannelId, ruleCount: selectedRules.length, faithful });
        setDrawerOpen(false); // close the drawer so the editor gets full height
      } catch (e) {
        setConfigError((e as Error).message);
      } finally {
        setLoadingConfig(false);
      }
    },
    [loadedProduct, onLoadPipeline, onTextChange, channels, faithful, selectedChannelId, selectedProductId, onExpectedOutput],
  );

  const resetPipeline = useCallback(() => {
    onLoadPipeline?.([]);
    onExpectedOutput?.(null);
    setLoadedConfig(null);
  }, [onLoadPipeline, onExpectedOutput]);

  // ── Find-in-JSON (native selection + scroll; no code-editor dep) ─────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  // All case-insensitive match start-offsets of the query in the text.
  const matches = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return [] as number[];
    const hay = text.toLowerCase();
    const out: number[] = [];
    let i = hay.indexOf(q);
    while (i !== -1) {
      out.push(i);
      i = hay.indexOf(q, i + Math.max(1, q.length));
    }
    return out;
  }, [query, text]);

  const jumpTo = useCallback(
    (idx: number) => {
      const ta = textareaRef.current;
      if (!ta || matches.length === 0) return;
      const i = ((idx % matches.length) + matches.length) % matches.length;
      setActiveMatch(i);
      const start = matches[i];
      const end = start + query.length;
      ta.focus();
      ta.setSelectionRange(start, end);
      // Scroll the match roughly to the middle (line-based, no value mutation).
      const line = text.slice(0, start).split("\n").length - 1;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 16;
      ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2);
    },
    [matches, query.length, text],
  );

  const valid = parseError === null && text.trim() !== "";

  // One-line summary of the current source (shown in the panel; the loaders live in the drawer).
  const productName = products.find((p) => p.id === selectedProductId)?.name;
  const sourceSummary =
    inputMode === "json"
      ? "Manual JSON — type in the editor"
      : !selectedProductId
        ? "No product selected"
        : loadedConfig
          ? `${productName ?? "product"} → ${loadedConfig.name} · ${loadedConfig.ruleCount} rule${loadedConfig.ruleCount !== 1 ? "s" : ""}${loadedConfig.faithful ? " · faithful" : ""}`
          : productName ?? "product";

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
      active
        ? "bg-brand-500 text-white shadow-sm"
        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  const handleFormat = () => {
    try {
      onTextChange(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      /* leave as-is; the validity indicator already flags it */
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Source summary bar — opens the loader drawer; shows what's currently selected. */}
      <div className="mb-2 shrink-0 flex items-center gap-2">
        <button
          onClick={() => setDrawerOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <DataIcon /> Load data
        </button>
        <span className="min-w-0 truncate text-[11px] text-gray-500 dark:text-gray-400" title={sourceSummary}>
          {sourceSummary}
        </span>
      </div>

      {/* Loader drawer (side overlay) — keeps the editor full-height. */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 dark:bg-black/50" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="fixed inset-y-0 left-0 z-40 w-[92vw] max-w-sm bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Load input data</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
      {/* Input-source toggle */}
      <div className="flex items-center gap-1 mb-2 shrink-0 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 w-fit">
        <button onClick={() => setInputMode("products")} className={tabCls(inputMode === "products")}>
          From My Products
        </button>
        <button onClick={() => { setInputMode("json"); setDrawerOpen(false); }} className={tabCls(inputMode === "json")}>
          Paste JSON
        </button>
      </div>

      {/* Product picker (products mode) */}
      {inputMode === "products" && (
        <div className="mb-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Product</label>
            <button
              onClick={loadProducts}
              disabled={productsLoading}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
            >
              <span className={productsLoading ? "animate-spin" : ""}><RefreshIcon /></span> refresh
            </button>
          </div>
          <select
            value={selectedProductId}
            onChange={(e) => onSelectProduct(e.target.value)}
            disabled={productsLoading || loadingProduct}
            aria-label="Pick a product to load its fields"
            className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">
              {productsLoading ? "Loading products…" : loadingProduct ? "Loading fields…" : "Select a product…"}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            Pick a product, then load all fields or just the parent fields you want into the editor.
          </p>
          {productsError && (
            <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{productsError}</p>
          )}
          {loadedProduct && !loadingProduct && (
            <div className="mt-2">
              {/* Two loaders, side by side — pick one (they can't both load the pipeline at once). */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 w-fit">
                <button onClick={() => setLoadMode("fields")} className={tabCls(loadMode === "fields")}>
                  Choose what to load
                </button>
                {onLoadPipeline && (
                  <button onClick={() => setLoadMode("config")} className={tabCls(loadMode === "config")}>
                    Load real config
                  </button>
                )}
              </div>

              {loadMode === "fields" && (
                <ProductFieldPicker
                  key={selectedProductId}
                  data={loadedProduct}
                  onLoad={(subset) => { onTextChange(JSON.stringify(subset, null, 2)); setDrawerOpen(false); }}
                />
              )}

              {loadMode === "config" && onLoadPipeline && (
                <div className="mt-2 rounded-lg border border-brand-200 dark:border-brand-500/40 bg-brand-50/50 dark:bg-brand-900/10 p-2.5">
                  <select
                    value={selectedChannelId}
                onChange={(e) => onSelectChannel(e.target.value)}
                disabled={channelsLoading || loadingConfig}
                aria-label="Channel to load post-processing rules from"
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">{channelsLoading ? "Loading channels…" : "Select a channel…"}</option>
                {channels.map((c) => (
                  <option key={c.channelId} value={c.channelId}>
                    {c.name} · {c.ruleCount} rule{c.ruleCount !== 1 ? "s" : ""}
                  </option>
                ))}
              </select>
              <label className="mt-1.5 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={faithful}
                  onChange={(e) => setFaithful(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-400"
                />
                <span className="text-[11px] text-gray-600 dark:text-gray-300">
                  Match real publish <span className="text-gray-400">(post-JOLT input + validate output)</span>
                </span>
              </label>

              {/* Rule picker — choose which of the channel's rules to load */}
              {rulesLoading && (
                <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">Loading rules…</p>
              )}
              {channelRules && !rulesLoading && (
                <ChannelRulePicker key={selectedChannelId} rules={channelRules} onLoad={performLoad} />
              )}

              {loadedConfig && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-green-700 dark:text-green-400">
                    Loaded <b>{loadedConfig.name}</b> · {loadedConfig.ruleCount} rule
                    {loadedConfig.ruleCount !== 1 ? "s" : ""} into the pipeline{loadedConfig.faithful ? " (faithful)" : ""}.
                  </span>
                  <button onClick={resetPipeline} className="shrink-0 text-[11px] font-medium text-gray-500 hover:text-red-500">
                    Reset
                  </button>
                </div>
              )}
              <p className="mt-1 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
                {faithful
                  ? "Faithful: input is the real post-JOLT + staged document; the output is validated against the real publish."
                  : "Runs post-processing only; real publish also runs JOLT first, so output may differ. Enable “Match real publish” for exact input + validation."}
              </p>
              {configError && <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{configError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
            </div>
          </aside>
        </>
      )}

      {/* Panel header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Input JSON</h2>
          {text.trim() === "" ? (
            <span className="text-[11px] text-gray-400">empty</span>
          ) : valid ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
              <CheckIcon /> valid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
              <AlertIcon /> invalid
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className={`${btnCls} ${searchOpen ? "bg-gray-100 dark:bg-gray-800" : ""}`}
            title="Find in JSON"
            aria-pressed={searchOpen}
          >
            <SearchIcon />
          </button>
          <button onClick={handleFormat} className={btnCls} title="Pretty-print (2-space)">Format</button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setSampleOpen((v) => !v)}
              className={btnCls}
              aria-haspopup="menu"
              aria-expanded={sampleOpen}
            >
              Sample <span className={`transition-transform ${sampleOpen ? "rotate-180" : ""}`}><ChevronIcon /></span>
            </button>
            {sampleOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSampleOpen(false)} aria-hidden />
                <div role="menu" className="absolute right-0 mt-1 z-20 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.label}
                      role="menuitem"
                      onClick={() => {
                        onTextChange(JSON.stringify(s.value, null, 2));
                        setSampleOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => onTextChange("")} className={btnCls} title="Clear input">Clear</button>
        </div>
      </div>

      {/* Find-in-JSON row */}
      {searchOpen && (
        <div className="mb-2 shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1">
          <span className="text-gray-400"><SearchIcon /></span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveMatch(-1); // reset — first Enter jumps to match #1
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) jumpTo(activeMatch < 0 ? matches.length - 1 : activeMatch - 1);
                else jumpTo(activeMatch < 0 ? 0 : activeMatch + 1);
              } else if (e.key === "Escape") {
                setSearchOpen(false);
              }
            }}
            placeholder="Find field… (Enter to jump, Shift+Enter back)"
            aria-label="Find in input JSON"
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-gray-800 dark:text-gray-200 focus:outline-none placeholder:text-gray-400"
          />
          <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
            {query ? `${matches.length ? activeMatch + 1 : 0}/${matches.length}` : ""}
          </span>
          <button onClick={() => jumpTo(activeMatch < 0 ? matches.length - 1 : activeMatch - 1)} disabled={matches.length === 0} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed" title="Previous match" aria-label="Previous match"><UpIcon /></button>
          <button onClick={() => jumpTo(activeMatch < 0 ? 0 : activeMatch + 1)} disabled={matches.length === 0} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed" title="Next match" aria-label="Next match"><DownIcon /></button>
          <button onClick={() => { setSearchOpen(false); setQuery(""); }} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Close" aria-label="Close search"><CloseIcon /></button>
        </div>
      )}

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck={false}
        placeholder='{ "name": "…", "price": 0 }'
        aria-label="Input JSON"
        aria-invalid={!valid && text.trim() !== ""}
        className={`flex-1 min-h-0 w-full resize-none font-mono text-xs leading-relaxed p-3 rounded-lg border bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          !valid && text.trim() !== ""
            ? "border-red-400 dark:border-red-500"
            : "border-gray-200 dark:border-gray-700"
        }`}
      />

      {/* Parse error */}
      {parseError && text.trim() !== "" && (
        <div className="mt-2 shrink-0 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-400 font-mono">
          {parseError}
        </div>
      )}
    </div>
  );
}
