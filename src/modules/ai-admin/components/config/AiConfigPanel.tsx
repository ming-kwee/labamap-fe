"use client";

/**
 * P1-L · Config & Cascade Panel (config transparency).
 *
 * Shows the EFFECTIVE config (read-only, env-driven) so an admin understands
 * why the system behaves as it does — the threshold/provider/cascade black box
 * that caused hours of confusion. No edit UI: values change via env + restart.
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P1-L
 */

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { AiConfig } from "../../types/health";
import { AiAdminService } from "../../services/aiAdmin.service";
import { ActivityIcon, DatabaseIcon, GitBranchIcon, RefreshIcon, SettingsIcon, SparklesIcon } from "../shared/icons";
import {
  Badge,
  Card,
  ErrorNotice,
  InfoBanner,
  KeyValue,
  PageHeader,
  SectionCard,
  Spinner,
} from "../shared/ui";

export default function AiConfigPanel() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfig(await AiAdminService.getConfig());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<SettingsIcon size={20} />}
        title="AI Config & Cascade"
        subtitle="Config efektif (read-only) — menjelaskan kenapa sistem berperilaku begitu."
        right={
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            {loading ? <Spinner size={14} /> : <RefreshIcon size={14} />}
          </button>
        }
      />

      <InfoBanner tone="blue">
        <p>
          Semua nilai di bawah <strong>read-only</strong> — diatur via environment variable dan butuh{" "}
          <strong>restart backend</strong> untuk diubah. Halaman ini menutup gap “config transparency”: threshold,
          provider, dan cascade tidak lagi jadi kotak hitam.
        </p>
      </InfoBanner>

      {error ? (
        <ErrorNotice error={error} onRetry={load} />
      ) : loading && !config ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading config…</div>
      ) : config ? (
        <>
          {/* Top: enabled + providers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SectionCard title="Agent LLM" subtitle="penghasil/perbaikan JOLT" icon={<ActivityIcon size={16} />}>
              <div className="space-y-2">
                <KeyValue label="Provider" value={<span className="font-semibold capitalize">{config.llm.provider}</span>} />
                <KeyValue label="Model" value={config.llm.model} mono />
                <KeyValue
                  label="API key"
                  value={<Badge tone={config.llm.keyConfigured ? "green" : "red"} dot>{config.llm.keyConfigured ? "configured" : "belum di-set"}</Badge>}
                />
                <EnvHint name="AI_LLM_PROVIDER · ANTHROPIC_API_KEY / GEMINI_API_KEY" />
              </div>
            </SectionCard>

            <SectionCard title="Embedding" subtitle="RAG vectorization" icon={<SparklesIcon size={16} />}>
              <div className="space-y-2">
                <KeyValue label="Provider" value={<span className="font-semibold capitalize">{config.embedding.provider}</span>} />
                <KeyValue label="Model" value={config.embedding.model} mono />
                <KeyValue label="Dimensions" value={`${config.embedding.dimensions}`} />
                <KeyValue
                  label="API key"
                  value={<Badge tone={config.embedding.keyConfigured ? "green" : "red"} dot>{config.embedding.keyConfigured ? "configured" : "belum di-set"}</Badge>}
                />
                <EnvHint name="AI_EMBEDDING_PROVIDER · OPENAI_API_KEY / GEMINI_API_KEY" />
              </div>
            </SectionCard>

            <SectionCard title="Vector Store" subtitle="retrieval backend" icon={<DatabaseIcon size={16} />}>
              <div className="space-y-2">
                <KeyValue label="Provider" value={<Badge tone="blue">{config.vectorStore.provider.toUpperCase()}</Badge>} />
                <KeyValue
                  label="minSimilarityScore"
                  value={<span className="font-mono font-semibold">{config.vectorStore.minSimilarityScore}</span>}
                />
                <KeyValue label="searchLimit" value={`${config.vectorStore.searchLimit}`} />
                {config.vectorStore.provider === "atlas" && config.vectorStore.atlasIndexName && (
                  <KeyValue label="atlasIndex" value={config.vectorStore.atlasIndexName} mono />
                )}
                <EnvHint name="AI_VECTOR_STORE · AI_MIN_SIMILARITY_SCORE" />
              </div>
            </SectionCard>
          </div>

          {/* Thresholds that drive behaviour */}
          <SectionCard
            title="Thresholds yang menentukan perilaku"
            subtitle="menjelaskan 'kenapa search 0 hasil' atau 'kenapa auto-apply'"
            icon={<GitBranchIcon size={16} />}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ThresholdTile
                label="Search minScore"
                value={config.vectorStore.minSimilarityScore}
                hint="di bawah ini → 0 hasil"
                env="AI_MIN_SIMILARITY_SCORE"
                link="/platform-admin/ai-search"
                linkLabel="Tuning di Search →"
              />
              <ThresholdTile
                label="Auto-apply"
                value={config.recommendation.autoApplyThreshold}
                hint="≥ ini → langsung diterapkan"
                env="AI_AUTO_APPLY_THRESHOLD"
              />
              <ThresholdTile
                label="Recommend"
                value={config.recommendation.recommendThreshold}
                hint="≥ ini → buat rekomendasi"
                env="AI_RECOMMEND_THRESHOLD"
              />
              <ThresholdTile
                label="Expiry (hari)"
                value={config.recommendation.expiryDays}
                hint="umur rekomendasi"
                env="AI_RECOMMENDATION_EXPIRY_DAYS"
              />
            </div>
          </SectionCard>

          {/* Cascade */}
          <SectionCard title="Cascade (APM → Agent)" subtitle="kapan APM meng-eskalasi ke agent" icon={<GitBranchIcon size={16} />}>
            <div className="flex flex-wrap items-center gap-4">
              <Badge tone={config.cascade.enabled ? "green" : "gray"} dot>
                {config.cascade.enabled ? "Cascade ON" : "APM-only (agent tidak dipanggil dari pipeline)"}
              </Badge>
              <KeyValue label="escalationThreshold" value={<span className="font-mono">{config.cascade.escalationThreshold}</span>} labelWidth="w-auto" />
              <KeyValue label="mode" value={<Badge tone="blue">{config.cascade.mode}</Badge>} labelWidth="w-auto" />
              <KeyValue label="timeout" value={`${config.cascade.escalationTimeoutSeconds}s`} labelWidth="w-auto" />
            </div>
            {!config.cascade.enabled && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                APM skor di bawah <span className="font-mono">{config.cascade.escalationThreshold}</span> <em>akan</em> di-eskalasi ke
                agent bila cascade diaktifkan (<span className="font-mono">AI_CASCADE_ENABLED=true</span>). Saat ini agent hanya
                dijalankan manual (P1-F) atau saat publish gagal.
              </p>
            )}
          </SectionCard>

          {/* Agent runtime */}
          <SectionCard title="Agent runtime" subtitle="batas eksekusi agent" icon={<ActivityIcon size={16} />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <KeyValue label="maxTokens" value={`${config.agent.maxTokens}`} labelWidth="w-24" />
              <KeyValue label="maxToolRounds" value={`${config.agent.maxToolRounds}`} labelWidth="w-28" />
              <KeyValue label="timeout" value={`${config.agent.agentTimeoutSeconds}s`} labelWidth="w-20" />
              <KeyValue label="reindexOnStartup" value={<Badge tone={config.reindexOnStartup ? "amber" : "gray"}>{String(config.reindexOnStartup)}</Badge>} labelWidth="w-32" />
            </div>
          </SectionCard>

          <p className="text-xs text-gray-400">
            Lihat kesehatan real-time di{" "}
            <Link href="/platform-admin/ai-health" className="text-blue-500 hover:underline">AI Health Dashboard →</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}

function EnvHint({ name }: { name: string }) {
  return (
    <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800 mt-1">
      env: <code className="font-mono">{name}</code>
    </p>
  );
}

function ThresholdTile({
  label,
  value,
  hint,
  env,
  link,
  linkLabel,
}: {
  label: string;
  value: number;
  hint: string;
  env: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5 font-mono">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
      <p className="text-[11px] text-gray-400 mt-1">
        <code className="font-mono">{env}</code>
      </p>
      {link && linkLabel && (
        <Link href={link} className="text-[11px] text-blue-500 hover:underline mt-1 inline-block">
          {linkLabel}
        </Link>
      )}
    </Card>
  );
}
