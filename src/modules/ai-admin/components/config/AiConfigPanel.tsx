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
  ConfirmDialog,
  ErrorNotice,
  InfoBanner,
  KeyValue,
  PageHeader,
  SectionCard,
  Spinner,
  Toast,
  useToast,
} from "../shared/ui";

export default function AiConfigPanel() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const { toast, show } = useToast();
  // §8.4 runtime toggle for AI Mapping Enrichment.
  const [confirmEnrich, setConfirmEnrich] = useState<boolean | null>(null); // target value awaiting confirm
  const [enrichBusy, setEnrichBusy] = useState(false);

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

  const applyEnrichToggle = useCallback(async (target: boolean) => {
    setEnrichBusy(true);
    try {
      const res = await AiAdminService.setEnrichMappings(target);
      show(
        `AI Mapping Enrichment ${res.enrichMappings ? "ON" : "OFF"}.${res.note ? " " + res.note : ""}`,
        "success",
      );
      await load();
    } catch (e) {
      show(`Gagal mengubah: ${(e as Error).message}`, "error");
    } finally {
      setEnrichBusy(false);
      setConfirmEnrich(null);
    }
  }, [load, show]);

  return (
    <div className="p-6 space-y-5">
      <Toast toast={toast} />

      {confirmEnrich !== null && (
        <ConfirmDialog
          title={confirmEnrich ? "Aktifkan AI enrichment?" : "Matikan AI enrichment?"}
          confirmLabel={confirmEnrich ? "Aktifkan" : "Matikan (kill-switch)"}
          danger={!confirmEnrich}
          busy={enrichBusy}
          body={
            confirmEnrich ? (
              <>
                Agent akan kembali <strong>menulis field mapping baru</strong> (AI Mapping Enrichment) saat AUTO_APPLY.
                Perubahan berlaku <strong>runtime</strong> (revert saat restart).
              </>
            ) : (
              <>
                Agent <strong>berhenti menulis</strong> field mapping baru (AI Mapping Enrichment). Mapping yang sudah ada tetap.
                Berguna jika enrichment AI menghasilkan mapping buruk. Perubahan <strong>runtime</strong> (revert saat restart).
              </>
            )
          }
          onConfirm={() => applyEnrichToggle(confirmEnrich)}
          onCancel={() => setConfirmEnrich(null)}
        />
      )}

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
            {/* AI enrich field mappings — AI Mapping Enrichment runtime kill-switch (addendum §8.4).
                Guarded: only render when backend exposes the flag. The one mutable
                control on this otherwise read-only panel. */}
            {config.recommendation.enrichMappings !== undefined && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 px-3 py-2.5">
                <EnrichToggle
                  enabled={!!config.recommendation.enrichMappings}
                  busy={enrichBusy}
                  onToggle={(target) => setConfirmEnrich(target)}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                    AI Mapping Enrichment: {config.recommendation.enrichMappings ? "ON" : "OFF"}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    saat ON, agent menulis field mapping baru ke tabel APM saat AUTO_APPLY. Toggle bersifat{" "}
                    <strong>runtime</strong> (revert ke <code className="font-mono">AI_ENRICH_MAPPINGS</code> saat restart) ·{" "}
                    <Link href="/platform-admin/channel-field-mappings?origin=ai" className="text-blue-500 hover:underline">lihat mapping AI →</Link>
                  </p>
                </div>
              </div>
            )}
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
            {/* P1-N · sync vs async behaviour + env hints */}
            <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 px-3 py-2.5 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
              {config.cascade.mode === "sync" ? (
                <p>
                  <strong className="text-gray-700 dark:text-gray-200">mode sync</strong> — respons publish/analyze bisa{" "}
                  <strong>terblok sampai {config.cascade.escalationTimeoutSeconds}s</strong> menunggu agent. Free-tier LLM sering butuh
                  ~90s; kalau sering timeout → hasilnya <span className="font-mono">FALLBACK_APM</span>.
                </p>
              ) : (
                <p>
                  <strong className="text-gray-700 dark:text-gray-200">mode async</strong> — APM membalas segera, agent menyempurnakan
                  di background. Tidak memblok respons.
                </p>
              )}
              <p className="text-gray-400">
                Env: <code className="font-mono">AI_CASCADE_ENABLED</code> · <code className="font-mono">AI_CASCADE_MODE</code> ·{" "}
                <code className="font-mono">AI_CASCADE_TIMEOUT_SECONDS</code>. Badge “engine yang menyelesaikan” (APM/AI/fallback) muncul
                di hasil analisa publish (P1-M).
              </p>
            </div>
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

function EnrichToggle({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean;
  busy: boolean;
  onToggle: (target: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle AI enrichment"
      disabled={busy}
      onClick={() => onToggle(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
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
