"use client";

/**
 * P0-A · AI Health & Config Dashboard.
 *
 * Landing page for the AI operator. In one screen: which providers are active,
 * is RAG/agent healthy, and what needs action. Read-only (safe first page).
 * Spec: docs/ai/frontend/SPEC-P0-A-HEALTH-DASHBOARD.md
 *
 * Behaviour required by the spec and honoured here:
 *  - 3 parallel calls, render each card as its data arrives (progressive).
 *  - Partial failure per card (one endpoint down ≠ whole page down).
 *  - Server-down (connection refused) surfaced explicitly.
 *  - Degraded banners for embedding-off / agent-off / RAG-empty.
 *  - Auto-refresh every 30s + manual refresh + relative "updated X ago".
 *  - No "0"/empty ever shown without context (disabled vs empty vs failed).
 */

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AiApiError, SOURCE_TYPES, SOURCE_TYPE_LABELS } from "../../types/common";
import { EmbeddingsStats, LearningStats, RecommendationsStats } from "../../types/health";
import { AiAgentSession } from "../../types/session";
import { AiAdminService } from "../../services/aiAdmin.service";
import {
  ActivityIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  HeartPulseIcon,
  RefreshIcon,
  SparklesIcon,
} from "../shared/icons";
import {
  Badge,
  Card,
  CHANNEL_OPTIONS,
  classifyLlmError,
  ErrorNotice,
  InfoBanner,
  PageHeader,
  SectionCard,
  Spinner,
  StatTile,
  useRelativeTime,
} from "../shared/ui";

// ─── async slot ──────────────────────────────────────────────────────────────

type Slot<T> = { data: T | null; error: unknown; loading: boolean };
const idle = <T,>(): Slot<T> => ({ data: null, error: null, loading: true });

const REINDEX_HREF = "/platform-admin/ai-rag-index";
const REVIEW_HREF = "/platform-admin/ai-recommendations";
const MAPPINGS_HREF = "/platform-admin/channel-field-mappings";

export default function AiHealthDashboard() {
  const [emb, setEmb] = useState<Slot<EmbeddingsStats>>(idle);
  const [learn, setLearn] = useState<Slot<LearningStats>>(idle);
  const [recs, setRecs] = useState<Slot<RecommendationsStats>>(idle);
  const [lastRefreshed, setLastRefreshed] = useState<string>();
  // §3.1 — latest agent session across channels, for the "LLM: rate-limited" signal.
  const [lastSession, setLastSession] = useState<AiAgentSession | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadEmb = useCallback(async () => {
    setEmb((s) => ({ ...s, loading: true }));
    try {
      setEmb({ data: await AiAdminService.getEmbeddingsStats(), error: null, loading: false });
    } catch (e) {
      setEmb({ data: null, error: e, loading: false });
    }
  }, []);

  const loadLearn = useCallback(async () => {
    setLearn((s) => ({ ...s, loading: true }));
    try {
      setLearn({ data: await AiAdminService.getLearningStats(30), error: null, loading: false });
    } catch (e) {
      setLearn({ data: null, error: e, loading: false });
    }
  }, []);

  const loadRecs = useCallback(async () => {
    setRecs((s) => ({ ...s, loading: true }));
    try {
      setRecs({ data: await AiAdminService.getRecommendationsStats(), error: null, loading: false });
    } catch (e) {
      setRecs({ data: null, error: e, loading: false });
    }
  }, []);

  const refreshAll = useCallback(() => {
    // Fire all three in parallel — cards render independently as each resolves.
    void loadEmb();
    void loadLearn();
    void loadRecs();
    setLastRefreshed(new Date().toISOString());
  }, [loadEmb, loadLearn, loadRecs]);

  // Best-effort LLM-health probe (§3.1). Heavier (per-channel), so run on mount +
  // manual refresh only — NOT in the 30s poll.
  const loadLlmHealth = useCallback(() => {
    AiAdminService.getMostRecentSession(CHANNEL_OPTIONS)
      .then(setLastSession)
      .catch(() => setLastSession(null));
  }, []);

  const manualRefresh = useCallback(() => {
    refreshAll();
    loadLlmHealth();
  }, [refreshAll, loadLlmHealth]);

  useEffect(() => {
    refreshAll();
    loadLlmHealth();
    timer.current = setInterval(refreshAll, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refreshAll, loadLlmHealth]);

  // Derive the rate-limited signal: latest agent activity was a quota/rate-limit failure.
  const llmRateLimited =
    lastSession?.status === "FAILED" &&
    ["rate_limit", "quota_zero"].includes(classifyLlmError(lastSession.errorMessage).kind);

  const relative = useRelativeTime(lastRefreshed);
  const anyLoading = emb.loading || learn.loading || recs.loading;

  // Total failure = every call failed with server_down (backend unreachable).
  const allDown =
    emb.error instanceof AiApiError &&
    emb.error.kind === "server_down" &&
    learn.error instanceof AiApiError &&
    recs.error instanceof AiApiError;

  if (allDown) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="inline-flex p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
            <HeartPulseIcon size={28} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Server AI tidak dapat dihubungi
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Koneksi ditolak (connection refused). Pastikan backend berjalan di{" "}
            <code className="font-mono">localhost:8888</code>, lalu coba lagi.
          </p>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            <RefreshIcon size={14} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<HeartPulseIcon size={20} />}
        title="AI System Health"
        subtitle="Provider aktif, kesehatan RAG & agent, dan antrian rekomendasi — 1 layar."
        right={
          <>
            <span className="text-xs text-gray-400 hidden sm:inline">
              diperbarui {relative}
            </span>
            <button
              onClick={manualRefresh}
              disabled={anyLoading}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              {anyLoading ? <Spinner size={14} /> : <RefreshIcon size={14} />}
            </button>
          </>
        }
      />

      <DegradedBanners emb={emb.data} learn={learn.data} />

      <ProviderStatusCard slot={emb} learn={learn.data} onRetry={loadEmb} llmRateLimited={llmRateLimited} lastSession={lastSession} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <RagCoverageCard slot={emb} onRetry={loadEmb} />
        <LearningHealthCard slot={learn} onRetry={loadLearn} />
        <RecommendationsCard slot={recs} learn={learn.data} onRetry={loadRecs} />
      </div>
    </div>
  );
}

// ─── Degraded banners (top priority) ────────────────────────────────────────

function DegradedBanners({
  emb,
  learn,
}: {
  emb: EmbeddingsStats | null;
  learn: LearningStats | null;
}) {
  const agentEnabled = learn?.modelHealth.agentEnabled;
  return (
    <div className="space-y-2">
      {emb && !emb.embeddingEnabled && (
        <InfoBanner tone="red">
          <p>
            <strong>RAG nonaktif</strong> — API key embedding belum di-set. Set{" "}
            <code className="font-mono">GEMINI_API_KEY</code> /{" "}
            <code className="font-mono">OPENAI_API_KEY</code> lalu restart.
          </p>
        </InfoBanner>
      )}
      {learn && agentEnabled === false && (
        <InfoBanner tone="amber">
          <p>
            <strong>Agent nonaktif</strong> — LLM key belum di-set (
            <code className="font-mono">ANTHROPIC_API_KEY</code> atau{" "}
            <code className="font-mono">GEMINI_API_KEY</code> +{" "}
            <code className="font-mono">AI_LLM_PROVIDER</code>).
          </p>
        </InfoBanner>
      )}
      {emb && emb.embeddingEnabled && emb.counts.total === 0 && (
        <InfoBanner tone="amber">
          <p>
            <strong>RAG kosong</strong> — belum ada embedding. Jalankan{" "}
            <Link href={REINDEX_HREF} className="underline font-medium">
              Reindex (P0-B)
            </Link>
            .
          </p>
        </InfoBanner>
      )}
    </div>
  );
}

// ─── Provider status card (most prominent) ──────────────────────────────────

function ProviderStatusCard({
  slot,
  learn,
  onRetry,
  llmRateLimited,
  lastSession,
}: {
  slot: Slot<EmbeddingsStats>;
  learn: LearningStats | null;
  onRetry: () => void;
  llmRateLimited?: boolean;
  lastSession?: AiAgentSession | null;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/10 px-5 py-4">
        {slot.loading && !slot.data ? (
          <SkeletonRow />
        ) : slot.error ? (
          <ErrorNotice error={slot.error} onRetry={onRetry} compact />
        ) : slot.data ? (
          <ProviderContent
            data={slot.data}
            agentEnabled={learn?.modelHealth.agentEnabled}
            llmRateLimited={llmRateLimited}
            lastSession={lastSession}
          />
        ) : null}
      </div>
    </Card>
  );
}

function ProviderContent({
  data,
  agentEnabled,
  llmRateLimited,
  lastSession,
}: {
  data: EmbeddingsStats;
  agentEnabled?: boolean;
  llmRateLimited?: boolean;
  lastSession?: AiAgentSession | null;
}) {
  const failedAt = lastSession?.createdAt ? new Date(lastSession.createdAt).toLocaleString() : "";
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="flex items-center gap-2">
        <DatabaseIcon className="text-violet-500" size={18} />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Vector Store
          </p>
          <p className="text-base font-bold text-gray-900 dark:text-white">
            {data.vectorStore.toUpperCase()}
          </p>
        </div>
      </div>

      <Divider />

      <div className="flex items-center gap-2">
        <SparklesIcon className="text-blue-500" size={18} />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Embedding
          </p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {data.embeddingProvider} · {data.embeddingModel}
            <span className="text-gray-400 font-normal"> · {data.dimensions}-dim</span>
          </p>
        </div>
      </div>

      <Divider />

      <div className="flex items-center gap-2">
        <ActivityIcon className="text-emerald-500" size={18} />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Agent LLM
          </p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {data.llmProvider} · <span className="text-violet-700 dark:text-violet-300">{data.llmModel}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        {/* §3.1 — latest agent activity failed on quota/rate-limit */}
        {llmRateLimited && (
          <span
            title={`Sesi agent terakhir gagal karena kuota/rate-limit${failedAt ? ` (${failedAt})` : ""}. Model chat mungkin sedang habis jatah — cek Agent Sessions / ganti model.`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            LLM: rate-limited
          </span>
        )}
        <Badge tone={data.embeddingEnabled ? "green" : "red"} dot>
          Embedding {data.embeddingEnabled ? "ON" : "OFF"}
        </Badge>
        <Badge tone={agentEnabled === false ? "amber" : agentEnabled ? "green" : "gray"} dot>
          Agent {agentEnabled === undefined ? "…" : agentEnabled ? "ON" : "OFF"}
        </Badge>
      </div>

      {data.vectorStore === "atlas" && (
        <p className="w-full text-[11px] text-gray-400 font-mono">
          index: {data.atlasIndexName}
        </p>
      )}
    </div>
  );
}

function Divider() {
  return <span className="hidden md:block h-8 w-px bg-gray-200 dark:bg-gray-700" />;
}

// ─── RAG coverage card ──────────────────────────────────────────────────────

function RagCoverageCard({ slot, onRetry }: { slot: Slot<EmbeddingsStats>; onRetry: () => void }) {
  return (
    <SectionCard title="RAG Coverage" subtitle="Embedded vs live source" icon={<DatabaseIcon size={16} />}>
      {slot.loading && !slot.data ? (
        <SkeletonLines rows={3} />
      ) : slot.error ? (
        <ErrorNotice error={slot.error} onRetry={onRetry} compact />
      ) : slot.data ? (
        <CoverageTable data={slot.data} />
      ) : null}
    </SectionCard>
  );
}

function CoverageTable({ data }: { data: EmbeddingsStats }) {
  const needsReindex = SOURCE_TYPES.some(
    (t) => (data.counts[t] ?? 0) < (data.sourceCounts[t] ?? 0),
  );
  const maybeOrphan = SOURCE_TYPES.some(
    (t) => (data.counts[t] ?? 0) > (data.sourceCounts[t] ?? 0),
  );
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {SOURCE_TYPES.map((t) => (
          <CoverageRow
            key={t}
            label={SOURCE_TYPE_LABELS[t]}
            embedded={data.counts[t] ?? 0}
            live={data.sourceCounts[t] ?? 0}
          />
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">Total embedding</span>
        <span className="text-sm font-bold text-gray-900 dark:text-white">{data.counts.total}</span>
      </div>
      {(needsReindex || maybeOrphan) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {needsReindex && (
            <Link
              href={REINDEX_HREF}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              Reindex <ExternalLinkIcon size={11} />
            </Link>
          )}
          {maybeOrphan && (
            <Link
              href={REINDEX_HREF}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Scan orphan <ExternalLinkIcon size={11} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageRow({
  label,
  embedded,
  live,
}: {
  label: string;
  embedded: number;
  live: number;
}) {
  const coverage = live > 0 ? Math.round((embedded / live) * 100) : embedded > 0 ? 100 : 0;
  const state: { tone: "green" | "amber" | "red"; icon: string } =
    embedded > live
      ? { tone: "red", icon: "🔴" }
      : embedded < live
        ? { tone: "amber", icon: "⚠" }
        : { tone: "green", icon: "✓" };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {embedded}/{live}
        </span>
        <Badge tone={state.tone}>
          {state.icon} {coverage}%
        </Badge>
      </div>
    </div>
  );
}

// ─── Learning health card ───────────────────────────────────────────────────

function LearningHealthCard({ slot, onRetry }: { slot: Slot<LearningStats>; onRetry: () => void }) {
  return (
    <SectionCard title="Learning Health" subtitle="Field-mapping success" icon={<ActivityIcon size={16} />}>
      {slot.loading && !slot.data ? (
        <SkeletonLines rows={3} />
      ) : slot.error ? (
        <ErrorNotice error={slot.error} onRetry={onRetry} compact />
      ) : slot.data ? (
        <LearningContent data={slot.data} />
      ) : null}
    </SectionCard>
  );
}

function LearningContent({ data }: { data: LearningStats }) {
  const rate = data.fieldMappings.avgSuccessRate;
  const tone: "green" | "amber" | "red" = rate >= 90 ? "green" : rate >= 70 ? "amber" : "red";
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Avg success rate</span>
          <span
            className={`text-2xl font-bold ${
              tone === "green"
                ? "text-green-600 dark:text-green-400"
                : tone === "amber"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {rate.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${
              tone === "green" ? "bg-green-500" : tone === "amber" ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Total mappings" value={data.fieldMappings.totalMappings} />
        {data.fieldMappings.lowSuccessRate > 0 ? (
          <Link href={`${MAPPINGS_HREF}`} className="group">
            <p className="text-xs text-gray-500 dark:text-gray-400 group-hover:underline">
              Low success-rate
            </p>
            <p className="text-2xl font-bold mt-0.5 text-amber-600 dark:text-amber-400">
              {data.fieldMappings.lowSuccessRate}
            </p>
          </Link>
        ) : (
          <StatTile label="Low success-rate" value={0} tone="green" hint="semua sehat" />
        )}
      </div>
    </div>
  );
}

// ─── Recommendations card ───────────────────────────────────────────────────

function RecommendationsCard({
  slot,
  learn,
  onRetry,
}: {
  slot: Slot<RecommendationsStats>;
  learn: LearningStats | null;
  onRetry: () => void;
}) {
  return (
    <SectionCard title="Recommendations" subtitle="Human-in-the-loop queue" icon={<SparklesIcon size={16} />}>
      {slot.loading && !slot.data ? (
        <SkeletonLines rows={3} />
      ) : slot.error ? (
        <ErrorNotice error={slot.error} onRetry={onRetry} compact />
      ) : slot.data ? (
        <RecommendationsContent data={slot.data} learn={learn} />
      ) : null}
    </SectionCard>
  );
}

function RecommendationsContent({
  data,
  learn,
}: {
  data: RecommendationsStats;
  learn: LearningStats | null;
}) {
  // Cross-validate against learning modelHealth; prefer stats endpoint (#3).
  const mismatch =
    learn != null && learn.modelHealth.pendingRecommendations !== data.pending;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Pending review</p>
          <p
            className={`text-3xl font-bold mt-0.5 ${
              data.pending > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-800 dark:text-white"
            }`}
          >
            {data.pending}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
          <p>
            <span className="font-semibold text-green-600 dark:text-green-400">{data.approved}</span> approved
          </p>
          <p>
            <span className="font-semibold text-red-500">{data.rejected}</span> rejected
          </p>
        </div>
      </div>
      {mismatch && (
        <p className="text-[11px] text-amber-500">
          Catatan: learning report menunjukkan {learn?.modelHealth.pendingRecommendations} pending
          (memakai angka dari /recommendations/stats).
        </p>
      )}
      <Link
        href={REVIEW_HREF}
        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Buka Review Queue <ExternalLinkIcon size={13} />
      </Link>
    </div>
  );
}

// ─── Skeletons ───────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-6 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-2 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
}

function SkeletonLines({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
}
