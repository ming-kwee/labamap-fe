"use client";

/**
 * P1-F · JOLT Generation Console ("Coba Agent").
 *
 * Run the agent manually for one sample product — the concrete "AI helps" demo.
 * Slow (10–20s: tool-loop + retry) → optimistic spinner, never block. On
 * AGENT_FAILED, show an actionable cause (e.g. Gemini quota → try later/Anthropic).
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P1-F
 */

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { GenerateJoltResult } from "../../types/session";
import { AiAdminService } from "../../services/aiAdmin.service";
import { PlayIcon, SparklesIcon, TerminalIcon } from "../shared/icons";
import {
  Badge,
  Card,
  CHANNEL_OPTIONS,
  CHANNEL_LABELS,
  classifyLlmError,
  ErrorNotice,
  InfoBanner,
  JsonViewer,
  KeyValue,
  PageHeader,
  SectionCard,
  Spinner,
  Tone,
} from "../shared/ui";

const SAMPLE_PRODUCT = JSON.stringify(
  {
    name: "Classic Cotton T-Shirt",
    description: "Soft 100% cotton crew-neck tee.",
    brand: "Acme",
    price: 19.99,
    currency: "USD",
    sku: "ACME-TSHIRT-001",
    variants: [
      { color: "black", size: "M", sku: "ACME-TSHIRT-001-BM", stock: 25 },
      { color: "white", size: "L", sku: "ACME-TSHIRT-001-WL", stock: 12 },
    ],
    attributes: { material: "cotton", gender: "unisex" },
  },
  null,
  2,
);

const STATUS_META: Record<string, { tone: Tone; label: string; desc: string }> = {
  AUTO_APPLIED: { tone: "green", label: "Auto-applied", desc: "Confidence tinggi → JOLT spec langsung diterapkan." },
  RECOMMENDATION_CREATED: { tone: "blue", label: "Recommendation created", desc: "Menunggu review manusia di P0-D." },
  MANUAL_REVIEW_REQUIRED: { tone: "amber", label: "Manual review required", desc: "Confidence rendah — perlu keputusan manual." },
  AGENT_FAILED: { tone: "red", label: "Agent failed", desc: "Agent tidak menghasilkan spec (lihat penyebab)." },
};

export default function JoltGenerationConsole() {
  const [channelId, setChannelId] = useState("shopify");
  const [categoryId, setCategoryId] = useState("clothing");
  const [productText, setProductText] = useState(SAMPLE_PRODUCT);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GenerateJoltResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const jsonError = useMemo(() => {
    try {
      JSON.parse(productText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [productText]);

  async function run() {
    if (jsonError) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const product = JSON.parse(productText);
      setResult(await AiAdminService.generateJolt({ channelId, categoryId, product }));
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
    }
  }

  const meta = result ? STATUS_META[result.status] ?? { tone: "gray" as Tone, label: result.status, desc: "" } : null;
  const isFailed = result?.status === "AGENT_FAILED";
  const errClass = isFailed ? classifyLlmError(result?.errorMessage) : null;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<SparklesIcon size={20} />}
        title="JOLT Generation Console"
        subtitle="Jalankan agent manual untuk 1 produk contoh — demo konkret 'AI membantu'."
      />

      <InfoBanner tone="amber">
        <p>
          Ini <strong>memanggil agent LLM sungguhan</strong> (memakai kuota) dan bisa memakan{" "}
          <strong>10–20 detik</strong> (tool-loop + retry). Hasilnya juga tercatat sebagai sesi — lihat di{" "}
          <Link href="/platform-admin/ai-sessions" className="underline">Agent Sessions</Link>.
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
              <button onClick={() => setProductText(SAMPLE_PRODUCT)} className="text-[11px] text-blue-500 hover:underline">reset ke contoh</button>
            </div>
            <textarea
              value={productText}
              onChange={(e) => setProductText(e.target.value)}
              spellCheck={false}
              rows={16}
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

          <button
            onClick={run}
            disabled={running || !!jsonError || !categoryId.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {running ? <><Spinner size={15} /> Menjalankan agent… (10–20s)</> : <><PlayIcon size={14} /> Jalankan Agent</>}
          </button>
        </Card>

        {/* Output */}
        <div className="space-y-4">
          {error ? (
            <ErrorNotice error={error} onRetry={run} />
          ) : running ? (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <Spinner size={28} />
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">Agent sedang bekerja…</p>
              <p className="text-xs text-gray-400 mt-1">Retrieval RAG → tool-loop → validasi. Jangan tutup halaman.</p>
            </Card>
          ) : result && meta ? (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <Badge tone={meta.tone} dot>{meta.label}</Badge>
                  {result.confidenceScore != null && (
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      confidence {(result.confidenceScore * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{meta.desc}</p>
                {result.explanation && <p className="text-xs text-gray-700 dark:text-gray-300 mt-2">{result.explanation}</p>}
              </Card>

              {isFailed && errClass && (
                <InfoBanner tone={errClass.tone === "amber" ? "amber" : "red"}>
                  <p className="font-semibold">{errClass.label}</p>
                  <p>{errClass.hint}</p>
                  {result.errorMessage && <p className="font-mono text-[11px] mt-1 opacity-80">{result.errorMessage}</p>}
                </InfoBanner>
              )}

              {result.proposedJoltSpec != null && (
                <SectionCard
                  title={result.status === "AUTO_APPLIED" ? "Applied JOLT spec" : "Proposed JOLT spec"}
                  subtitle={result.status === "AUTO_APPLIED" ? "spec yang ditulis agent (langsung dipakai)" : "hasil transformasi yang diusulkan"}
                >
                  <JsonViewer label="joltSpec" value={result.proposedJoltSpec} defaultOpen />
                  {result.status === "AUTO_APPLIED" && result.joltSpecId && (
                    <div className="mt-2">
                      <KeyValue label="joltSpecId" value={result.joltSpecId} mono labelWidth="w-24" />
                    </div>
                  )}
                  {result.status === "RECOMMENDATION_CREATED" && (
                    <Link href="/platform-admin/ai-recommendations" className="inline-block mt-2 text-xs text-blue-500 hover:underline">
                      Buka di Review Queue untuk approve →
                    </Link>
                  )}
                </SectionCard>
              )}

              {result.validationSummary != null && (
                <SectionCard title="Validation summary" subtitle="hasil validasi spec">
                  <JsonViewer label="validation" value={result.validationSummary} />
                </SectionCard>
              )}

              {result.agentSessionId && (
                <Card className="p-3">
                  <KeyValue
                    label="Agent session"
                    value={
                      <Link href={`/platform-admin/ai-sessions?sessionId=${result.agentSessionId}`} className="text-blue-500 hover:underline font-mono">
                        {result.agentSessionId}
                      </Link>
                    }
                    labelWidth="w-28"
                  />
                </Card>
              )}
            </>
          ) : (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><TerminalIcon size={22} /></div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Belum ada hasil</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                Isi produk contoh, pilih channel + category, lalu <strong>Jalankan Agent</strong> untuk melihat JOLT spec yang dihasilkan.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
