"use client";

/**
 * P1-H · Learning Dashboard (trends).
 *
 * Shows the system "learning" over time: per-channel approval/threshold,
 * mapping health, RAG index size, pending recommendations.
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P1-H
 *
 * Live `channels`/`calibration` arrays are frequently empty (no reviewed
 * recommendations yet) — those sections render explicit empty states rather
 * than a blank table.
 */

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { AiMappingMaturity, LearningStats } from "../../types/health";
import { AiAdminService } from "../../services/aiAdmin.service";
import { ActivityIcon, DatabaseIcon, RefreshIcon, SparklesIcon } from "../shared/icons";
import {
  Badge,
  Card,
  ChannelBadge,
  ErrorNotice,
  PageHeader,
  SectionCard,
  Spinner,
  StatTile,
} from "../shared/ui";

const DAY_OPTIONS = [7, 30, 90] as const;

export default function LearningDashboard() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<LearningStats | null>(null);
  const [maturity, setMaturity] = useState<AiMappingMaturity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await AiAdminService.getLearningStats(d));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // Maturity is best-effort — never block the main dashboard on it.
    AiAdminService.getAiMappingMaturity()
      .then(setMaturity)
      .catch(() => setMaturity(null));
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  const fm = data?.fieldMappings;
  const mh = data?.modelHealth;
  const rate = fm?.avgSuccessRate ?? 0;
  const rateTone: "green" | "amber" | "red" = rate >= 90 ? "green" : rate >= 70 ? "amber" : "red";

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<ActivityIcon size={20} />}
        title="Learning Dashboard"
        subtitle="Tren pembelajaran — approval, kalibrasi threshold, kesehatan mapping."
        right={
          <>
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${
                    days === d ? "bg-violet-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={() => load(days)}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              {loading ? <Spinner size={14} /> : <RefreshIcon size={14} />}
            </button>
          </>
        }
      />

      {error ? (
        <ErrorNotice error={error} onRetry={() => load(days)} />
      ) : loading && !data ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : data ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg mapping success</p>
              <p className={`text-2xl font-bold mt-0.5 ${
                rateTone === "green" ? "text-green-600 dark:text-green-400" : rateTone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
              }`}>
                {rate.toFixed(1)}%
              </p>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
                <div className={`h-full rounded-full ${rateTone === "green" ? "bg-green-500" : rateTone === "amber" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, rate)}%` }} />
              </div>
            </Card>
            <Card className="p-4"><StatTile label="Total mappings" value={fm?.totalMappings ?? 0} /></Card>
            <Card className="p-4">
              {fm && fm.lowSuccessRate > 0 ? (
                <Link href="/platform-admin/channel-field-mappings" className="group block">
                  <p className="text-xs text-gray-500 dark:text-gray-400 group-hover:underline">Low success-rate</p>
                  <p className="text-2xl font-bold mt-0.5 text-amber-600 dark:text-amber-400">{fm.lowSuccessRate}</p>
                  <p className="text-[11px] text-gray-400">kelola di Field Mappings →</p>
                </Link>
              ) : (
                <StatTile label="Low success-rate" value={0} tone="green" hint="semua sehat" />
              )}
            </Card>
            <Card className="p-4">
              {mh && mh.pendingRecommendations > 0 ? (
                <Link href="/platform-admin/ai-recommendations" className="group block">
                  <p className="text-xs text-gray-500 dark:text-gray-400 group-hover:underline">Pending recs</p>
                  <p className="text-2xl font-bold mt-0.5 text-amber-600 dark:text-amber-400">{mh.pendingRecommendations}</p>
                  <p className="text-[11px] text-gray-400">review queue →</p>
                </Link>
              ) : (
                <StatTile label="Pending recs" value={mh?.pendingRecommendations ?? 0} tone="gray" hint="antrian kosong" />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* RAG index size */}
            <SectionCard title="RAG index size" subtitle="jumlah embedding aktif" icon={<DatabaseIcon size={16} />}>
              <div className="grid grid-cols-2 gap-4">
                <StatTile label="Field-mapping embeddings" value={mh?.mappingEmbeddingCount ?? 0} tone="blue" />
                <StatTile label="JOLT-spec embeddings" value={mh?.joltEmbeddingCount ?? 0} tone="blue" />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge tone={mh?.embeddingEnabled ? "green" : "red"} dot>Embedding {mh?.embeddingEnabled ? "ON" : "OFF"}</Badge>
                <Badge tone={mh?.agentEnabled ? "green" : "amber"} dot>Agent {mh?.agentEnabled ? "ON" : "OFF"}</Badge>
              </div>
            </SectionCard>

            {/* Per-channel calibration */}
            <SectionCard title="Per-channel approval & threshold" subtitle={`periode ${data.period}`} icon={<SparklesIcon size={16} />}>
              {data.channels.length === 0 ? (
                <EmptyLearning text="Belum ada data per-channel — kalibrasi muncul setelah ada rekomendasi yang di-approve/reject dalam periode ini." />
              ) : (
                <div className="space-y-2">
                  {data.channels.map((c, i) => {
                    const ch = String(c.channelId ?? "—");
                    return (
                      <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <ChannelBadge channelId={ch} />
                        <div className="flex items-center gap-3 text-xs">
                          {c.approvalRate != null && <span className="text-green-600 dark:text-green-400">{Number(c.approvalRate).toFixed(0)}% approve</span>}
                          {c.rejectionRate != null && <span className="text-red-500">{Number(c.rejectionRate).toFixed(0)}% reject</span>}
                          {c.calibratedThreshold != null && <Badge tone="blue">thr {Number(c.calibratedThreshold).toFixed(2)}</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Calibration trend */}
          <SectionCard title="Kalibrasi threshold (tren)" subtitle={`${days} hari terakhir`} icon={<ActivityIcon size={16} />}>
            {data.calibration.length === 0 ? (
              <EmptyLearning text="Belum ada titik kalibrasi. Sistem mengkalibrasi confidence threshold seiring approve/reject terkumpul — grafik tren muncul di sini setelah data cukup." />
            ) : (
              <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                {data.calibration.map((c, i) => (
                  <pre key={i} className="font-mono text-[11px] bg-gray-50 dark:bg-gray-800/60 rounded p-2 overflow-auto">{JSON.stringify(c)}</pre>
                ))}
              </div>
            )}
          </SectionCard>

          {/* AI enrichment maturity (addendum §8.5 · Jalur C) */}
          {maturity && maturity.total > 0 && (
            <SectionCard
              title="Kematangan AI enrichment (Jalur C)"
              subtitle="bukti sistem belajar — mapping buatan AI & yang terbukti"
              icon={<SparklesIcon size={16} />}
              right={
                <Link href="/platform-admin/channel-field-mappings" className="text-xs text-blue-500 hover:underline">
                  Kelola →
                </Link>
              }
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <StatTile label="Mapping buatan AI" value={maturity.total} tone="violet" />
                <StatTile label="Dipromosikan" value={maturity.promoted} tone="green" hint="tier > UNVERIFIED" />
                <StatTile label="Masih UNVERIFIED" value={maturity.unverified} tone={maturity.unverified > 0 ? "amber" : "gray"} />
                <StatTile label="Avg successRate (live)" value={`${maturity.provenSuccessRate.toFixed(0)}%`} tone="blue" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                AI telah menyumbang <strong>{maturity.total}</strong> mapping;{" "}
                <strong>{maturity.promoted}</strong> terbukti & dipromosikan. Kategori “mendewasa” saat mapping AI
                naik tier dan publish ditangani APM (gratis), bukan agent (mahal).
              </p>
              {maturity.byChannel.length > 0 && (
                <div className="space-y-1.5">
                  {maturity.byChannel.map((c) => (
                    <div key={c.channelId} className="flex items-center justify-between gap-3 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <ChannelBadge channelId={c.channelId} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        <strong className="text-gray-700 dark:text-gray-200">{c.total}</strong> mapping ·{" "}
                        <span className="text-green-600 dark:text-green-400">{c.promoted} dipromosikan</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </>
      ) : null}
    </div>
  );
}

function EmptyLearning({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl mb-2 text-gray-400">
        <ActivityIcon size={18} />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{text}</p>
    </div>
  );
}
