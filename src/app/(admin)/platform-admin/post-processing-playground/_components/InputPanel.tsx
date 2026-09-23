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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { PlaygroundService, ProductOption, ChannelOption } from "../_services/playground.service";
import { PipelineStep } from "../_types/playground";
import ProductFieldPicker from "./ProductFieldPicker";

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

const btnCls =
  "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

export default function InputPanel({
  text,
  onTextChange,
  parseError,
  onLoadPipeline,
}: {
  text: string;
  onTextChange: (t: string) => void;
  parseError: string | null;
  /** Load a real channel's post-processing rules into the pipeline builder. */
  onLoadPipeline?: (steps: PipelineStep[]) => void;
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
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadedConfig, setLoadedConfig] = useState<{ name: string; ruleCount: number } | null>(null);

  // Lazy-load the channel list once a product is loaded (the Real-config row appears).
  useEffect(() => {
    if (!loadedProduct || channels.length > 0 || channelsLoading) return;
    setChannelsLoading(true);
    PlaygroundService.listChannels()
      .then(setChannels)
      .catch((e) => setConfigError((e as Error).message))
      .finally(() => setChannelsLoading(false));
  }, [loadedProduct, channels.length, channelsLoading]);

  const loadRealConfig = useCallback(async () => {
    if (!selectedChannelId || !loadedProduct || !onLoadPipeline) return;
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const steps = await PlaygroundService.getChannelSteps(selectedChannelId);
      onLoadPipeline(steps);                                   // → pipeline (list & blocks)
      onTextChange(JSON.stringify(loadedProduct, null, 2));    // → input (full product fields)
      const ch = channels.find((c) => c.channelId === selectedChannelId);
      setLoadedConfig({ name: ch?.name ?? selectedChannelId, ruleCount: steps.length });
    } catch (e) {
      setConfigError((e as Error).message);
    } finally {
      setLoadingConfig(false);
    }
  }, [selectedChannelId, loadedProduct, onLoadPipeline, onTextChange, channels]);

  const resetPipeline = useCallback(() => {
    onLoadPipeline?.([]);
    setLoadedConfig(null);
  }, [onLoadPipeline]);

  const valid = parseError === null && text.trim() !== "";
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
      {/* Input-source toggle */}
      <div className="flex items-center gap-1 mb-2 shrink-0 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 w-fit">
        <button onClick={() => setInputMode("products")} className={tabCls(inputMode === "products")}>
          From My Products
        </button>
        <button onClick={() => setInputMode("json")} className={tabCls(inputMode === "json")}>
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
            <ProductFieldPicker
              key={selectedProductId}
              data={loadedProduct}
              onLoad={(subset) => onTextChange(JSON.stringify(subset, null, 2))}
            />
          )}

          {/* Real config: load a channel's actual post-processing rules into the pipeline */}
          {loadedProduct && !loadingProduct && onLoadPipeline && (
            <div className="mt-2 rounded-lg border border-brand-200 dark:border-brand-500/40 bg-brand-50/50 dark:bg-brand-900/10 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">Load real config</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">— fills pipeline &amp; output</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  disabled={channelsLoading || loadingConfig}
                  aria-label="Channel to load post-processing rules from"
                  className="flex-1 min-w-0 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">{channelsLoading ? "Loading channels…" : "Select a channel…"}</option>
                  {channels.map((c) => (
                    <option key={c.channelId} value={c.channelId}>
                      {c.name} · {c.ruleCount} rule{c.ruleCount !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadRealConfig}
                  disabled={!selectedChannelId || loadingConfig}
                  className="shrink-0 px-2.5 py-2 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingConfig ? "Loading…" : "Load"}
                </button>
              </div>
              {loadedConfig && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-green-700 dark:text-green-400">
                    Loaded <b>{loadedConfig.name}</b> post-processing · {loadedConfig.ruleCount} step
                    {loadedConfig.ruleCount !== 1 ? "s" : ""} — editable in the pipeline.
                  </span>
                  <button onClick={resetPipeline} className="shrink-0 text-[11px] font-medium text-gray-500 hover:text-red-500">
                    Reset
                  </button>
                </div>
              )}
              <p className="mt-1 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
                Runs post-processing only; real publish also runs JOLT first, so output may differ.
              </p>
              {configError && <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{configError}</p>}
            </div>
          )}
        </div>
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

      {/* Editor */}
      <textarea
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
