"use client";

/**
 * Publish Diagnostics (platform-admin).
 *
 * The engineering-facing counterpart of the merchant Step-3 publish page. The
 * merchant screen shows only "is my product ready?"; this shows HOW the engine
 * decided: which engine resolved it (APM / AI / fallback via cascade), the
 * 5-tier matching breakdown, field mappings + confidence, unmapped fields, JOLT
 * readiness, and the raw JOLT spec — keyed by a sample product + channel.
 *
 * Runs the REAL `/adaptive-pattern-matching/analyze` pipeline (persistJolt:false,
 * so it never writes to production JOLT). Cascade is live and sync, so this can
 * escalate to the agent and take up to ~90s / hit 429 → elapsed timer + Cancel.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AiApiError } from "../../types/common";
import {
  AdaptivePatternMatchingResponse,
  FieldMapping,
} from "@/modules/ecommerce-product-v2/types/channel-mapping";
import { MasterProduct } from "@/modules/ecommerce-product-v2/types/product";
import { analyzePatternMatching } from "@/modules/ecommerce-product-v2/services/pattern-matching.service";
import { generateMappingRequest } from "@/modules/ecommerce-product-v2/utils/product-mapper";
import { CascadeOutcomeBadge } from "../shared/CascadeOutcomeBadge";
import { ActivityIcon, GitBranchIcon, PlayIcon, SearchIcon, TerminalIcon } from "../shared/icons";
import {
  Badge,
  Card,
  CHANNEL_OPTIONS,
  CHANNEL_LABELS,
  ErrorNotice,
  InfoBanner,
  JsonViewer,
  PageHeader,
  SectionCard,
  Spinner,
  StatTile,
  Tone,
} from "../shared/ui";

const RUN_TIMEOUT_MS = 120_000;

const SAMPLE_PRODUCT: MasterProduct = {
  id: "diag-sample",
  sku: "ACME-TSHIRT-001",
  name: "Classic Cotton T-Shirt",
  description: "Soft 100% cotton crew-neck tee.",
  price: 19.99,
  compareAtPrice: 24.99,
  brand: "Acme",
  category: "clothing",
  tags: ["cotton", "unisex"],
  quantity: 37,
  weight: 0.25,
  mainImage: "https://example.com/tshirt.jpg",
  hasVariants: true,
  variants: [
    { id: "v1", sku: "ACME-TSHIRT-001-BM", color: "black", size: "M", price: 19.99, quantity: 25 },
    { id: "v2", sku: "ACME-TSHIRT-001-WL", color: "white", size: "L", price: 19.99, quantity: 12 },
  ],
  status: "active",
} as unknown as MasterProduct;

const TIER_META: Array<{ key: keyof AdaptivePatternMatchingResponse["matchingMetadata"]; label: string; band: string; tone: Tone }> = [
  { key: "knowledgeBasedMatches", label: "Knowledge-Based", band: "≥95%", tone: "green" },
  { key: "semanticMatches", label: "Semantic", band: "≥85%", tone: "blue" },
  { key: "similarityMatches", label: "Similarity", band: "60–90%", tone: "amber" },
  { key: "patternMatches", label: "Pattern", band: "~75%", tone: "violet" },
];

export default function PublishDiagnosticsPage() {
  const [channelId, setChannelId] = useState("shopify");
  const [categoryId, setCategoryId] = useState("clothing");
  const [productText, setProductText] = useState(JSON.stringify(SAMPLE_PRODUCT, null, 2));
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AdaptivePatternMatchingResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);

  const jsonError = useMemo(() => {
    try {
      JSON.parse(productText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [productText]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutRef.current = null;
    tickRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    timedOutRef.current = false;
    abortRef.current?.abort();
  }, []);

  async function run() {
    if (jsonError || running || !categoryId.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    timedOutRef.current = false;
    setRunning(true);
    setError(null);
    setResult(null);
    setElapsed(0);
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    timeoutRef.current = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, RUN_TIMEOUT_MS);

    try {
      const product = JSON.parse(productText) as MasterProduct;
      // Diagnostic only — never persist to production JOLT; force a fresh run.
      const request = await generateMappingRequest(product, channelId, {
        confidenceThreshold: 70,
        categoryId: categoryId.trim(),
        persistJolt: false,
        forceReanalyze: true,
      });
      setResult(await analyzePatternMatching(request, controller.signal));
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || (e instanceof AiApiError && e.kind === "aborted")) {
        setError(
          new AiApiError(
            timedOutRef.current
              ? `Timeout ${Math.round(RUN_TIMEOUT_MS / 1000)}s — cascade kemungkinan menunggu agent (LLM 429). Coba lagi nanti.`
              : "Dibatalkan.",
            "aborted",
          ),
        );
      } else {
        setError(e);
      }
    } finally {
      clearTimers();
      abortRef.current = null;
      setRunning(false);
    }
  }

  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<TerminalIcon size={20} />}
        title="Publish Diagnostics"
        subtitle="Bagaimana engine memutuskan transformasi publish — APM/AI, tier, mappings, JOLT. (Bukan halaman merchant.)"
      />

      <InfoBanner tone="violet">
        <p>
          Menjalankan pipeline <strong>analyze</strong> yang sama seperti publish merchant, tapi menampilkan
          <strong> detail teknis penuh</strong> untuk debug. <strong>persistJolt=false</strong> — tidak menulis ke
          JOLT produksi. Cascade aktif (sync) → bisa eskalasi ke agent (sampai ~2 menit / 429).
        </p>
      </InfoBanner>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Channel</label>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c] ?? c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Category ID</label>
              <input value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="mis. clothing"
                className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Master product (JSON)</label>
              <button onClick={() => setProductText(JSON.stringify(SAMPLE_PRODUCT, null, 2))} className="text-[11px] text-blue-500 hover:underline">reset ke contoh</button>
            </div>
            <textarea
              value={productText}
              onChange={(e) => setProductText(e.target.value)}
              spellCheck={false}
              rows={18}
              className={`w-full font-mono text-[11px] border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                jsonError ? "border-red-400 focus:ring-red-400" : "border-gray-200 dark:border-gray-700 focus:ring-violet-400"
              }`}
            />
            {jsonError ? (
              <p className="text-[11px] text-red-500 mt-1">JSON tidak valid: {jsonError}</p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-1">JSON valid ✓</p>
            )}
          </div>

          {running ? (
            <div className="flex items-stretch gap-2">
              <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600/90 text-white text-sm font-medium rounded-lg">
                <Spinner size={15} /> Menganalisis… <span className="font-mono tabular-nums">{elapsedLabel}</span>
              </div>
              <button onClick={cancel}
                className="px-4 py-2.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg transition-colors">
                Batalkan
              </button>
            </div>
          ) : (
            <button onClick={run} disabled={!!jsonError || !categoryId.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
              <PlayIcon size={14} /> Jalankan Diagnostics
            </button>
          )}
        </Card>

        {/* Output */}
        <div className="space-y-4">
          {error ? (
            <ErrorNotice error={error} onRetry={run} />
          ) : running ? (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <Spinner size={28} />
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">Menjalankan APM… <span className="font-mono">{elapsedLabel}</span></p>
              <p className="text-xs text-gray-400 mt-1">Fetch target schema → matching → cascade. Bisa lama bila eskalasi ke agent.</p>
            </Card>
          ) : result ? (
            <DiagnosticsResult result={result} channelId={channelId} />
          ) : (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><SearchIcon size={22} /></div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Belum ada hasil</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                Isi produk contoh + channel/category, lalu <strong>Jalankan Diagnostics</strong> untuk melihat keputusan engine.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Result ──────────────────────────────────────────────────────────────────

function DiagnosticsResult({ result, channelId }: { result: AdaptivePatternMatchingResponse; channelId: string }) {
  const md = result.matchingMetadata;
  const conf = result.overallConfidence ?? 0;
  const confTone: Tone = conf >= 92 ? "green" : conf >= 70 ? "amber" : "red";
  const mappings = result.fieldMappings ?? [];

  return (
    <div className="space-y-4">
      {/* Engine outcome + confidence */}
      <SectionCard title="Keputusan engine" subtitle="engine mana yang menyelesaikan" icon={<GitBranchIcon size={16} />}
        right={<CascadeOutcomeBadge outcome={result} showDetail />}>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Confidence" value={`${conf.toFixed(0)}%`} tone={confTone} />
          <StatTile label="Fields mapped" value={mappings.length} tone="green" />
          <StatTile label="Unmapped" value={result.unmappedSourceFields?.length ?? 0} tone={(result.unmappedSourceFields?.length ?? 0) > 0 ? "amber" : "gray"} />
        </div>
        {result.status && <p className="text-xs text-gray-400 mt-3">status: <span className="font-mono">{result.status}</span> · {md?.processingTimeMs ?? "?"}ms · {md?.totalMatches ?? 0} matches</p>}
      </SectionCard>

      {/* 5-tier breakdown */}
      <SectionCard title="Matching strategy breakdown" subtitle="tier APM yang dipakai" icon={<ActivityIcon size={16} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TIER_META.map((t) => (
            <div key={t.label} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{t.label}</span>
                <Badge tone={t.tone}>{Number(md?.[t.key] ?? 0)}</Badge>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{t.band} confidence</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* JOLT readiness */}
      {(md?.warnings?.length ?? 0) > 0 && (
        <SectionCard title="JOLT readiness" subtitle="hasil cek kesiapan + konflik">
          <div className="space-y-1">
            {md!.warnings!.map((w, i) => {
              const tone = w.includes("NOT_READY") || w.startsWith("✗") || w.includes("ERROR")
                ? "text-red-600 dark:text-red-400"
                : w.includes("WARNINGS") || w.startsWith("⚠") ? "text-amber-600 dark:text-amber-400"
                : w.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400";
              return <p key={i} className={`text-xs font-mono ${tone}`}>{w}</p>;
            })}
          </div>
        </SectionCard>
      )}

      {/* Field mappings */}
      {mappings.length > 0 && (
        <SectionCard title={`Field mappings (${mappings.length})`} subtitle="source → target + confidence">
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Source</th>
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Target</th>
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Strategy</th>
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500 text-right">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m: FieldMapping, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1.5"><code className="text-[11px] font-mono text-gray-700 dark:text-gray-300">{m.sourcePath}</code></td>
                    <td className="px-2 py-1.5"><code className="text-[11px] font-mono text-blue-600 dark:text-blue-400">{m.targetPath}</code></td>
                    <td className="px-2 py-1.5"><span className="text-[10px] text-gray-400">{m.matchStrategy}</span></td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={`text-[11px] font-medium ${m.confidence >= 90 ? "text-green-600 dark:text-green-400" : m.confidence >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                        {m.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Unmapped */}
      {((result.unmappedSourceFields?.length ?? 0) > 0 || (result.unmappedTargetFields?.length ?? 0) > 0) && (
        <SectionCard title="Unmapped fields" subtitle="tak terpetakan (source & target)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-1">Source ({result.unmappedSourceFields?.length ?? 0})</p>
              <div className="flex flex-wrap gap-1">
                {(result.unmappedSourceFields ?? []).map((f) => <Badge key={f} tone="gray">{f}</Badge>)}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-1">Target ({result.unmappedTargetFields?.length ?? 0})</p>
              <div className="flex flex-wrap gap-1">
                {(result.unmappedTargetFields ?? []).map((f) => <Badge key={f} tone="amber">{f}</Badge>)}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* JOLT spec + raw */}
      <SectionCard title="JOLT spec" subtitle={`transformasi ${CHANNEL_LABELS[channelId] ?? channelId} (tidak dipersist)`}>
        <JsonViewer label={`joltSpec (${(result.joltSpec ?? []).length} ops)`} value={result.joltSpec ?? []} />
        <div className="mt-2">
          <JsonViewer label="raw response" value={result} />
        </div>
      </SectionCard>
    </div>
  );
}
