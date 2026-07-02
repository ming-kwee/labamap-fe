"use client";

/**
 * P0-B · RAG Index Management.
 *
 * Fill, keep clean, and monitor the vector store. Makes coverage & orphans
 * visible and provides safe reindex + cleanup buttons.
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P0-B
 *
 * Reindex & cleanup are "job" endpoints — they return 200 + a status body, so
 * we read `status` (COMPLETED / SKIPPED / FAILED), never just the HTTP code.
 */

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS, SourceTypeOrAll } from "../../types/common";
import { EmbeddingsStats } from "../../types/health";
import { CleanupResult, OrphanDetail, OrphansCount, ReindexResult } from "../../types/rag";
import { AiAdminService } from "../../services/aiAdmin.service";
import { DatabaseIcon, InfoIcon, RefreshIcon, SearchIcon, TrashIcon } from "../shared/icons";
import {
  Badge,
  Card,
  ConfirmDialog,
  ErrorNotice,
  InfoBanner,
  PageHeader,
  SectionCard,
  Spinner,
  StatTile,
  Toast,
  useRelativeTime,
  useToast,
} from "../shared/ui";

type JobState = { running: boolean; result?: ReindexResult; failed?: string };

export default function RagIndexManagementPage() {
  const { toast, show } = useToast();

  const [stats, setStats] = useState<EmbeddingsStats | null>(null);
  const [statsError, setStatsError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const [orphans, setOrphans] = useState<OrphansCount | null>(null);
  const [orphansLoading, setOrphansLoading] = useState(false);
  const [orphansError, setOrphansError] = useState<unknown>(null);

  const [reindexJobs, setReindexJobs] = useState<Record<string, JobState>>({});
  const [lastReindexAt, setLastReindexAt] = useState<string>();

  const [confirm, setConfirm] = useState<{ kind: "reindex" | "cleanup"; scope: SourceTypeOrAll } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setStatsError(null);
    try {
      setStats(await AiAdminService.getEmbeddingsStats());
    } catch (e) {
      setStatsError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const scanOrphans = useCallback(async () => {
    setOrphansLoading(true);
    setOrphansError(null);
    try {
      const data = await AiAdminService.getOrphansCount("ALL");
      setOrphans(data);
      show(
        data.totalOrphans === 0
          ? "Scan selesai — tidak ada embedding yatim. 👍"
          : `Ditemukan ${data.totalOrphans} embedding yatim.`,
        data.totalOrphans === 0 ? "success" : "info",
      );
    } catch (e) {
      setOrphansError(e);
    } finally {
      setOrphansLoading(false);
    }
  }, [show]);

  const interpretJob = (r: ReindexResult | CleanupResult): { failed?: string } => {
    const status = (r.status ?? "").toUpperCase();
    if (status === "FAILED") return { failed: r.error ?? "Job gagal (lihat log backend)." };
    return {};
  };

  const runReindex = useCallback(
    async (scope: SourceTypeOrAll) => {
      setReindexJobs((j) => ({ ...j, [scope]: { running: true } }));
      try {
        const result = await AiAdminService.reindex(scope);
        const { failed } = interpretJob(result);
        setReindexJobs((j) => ({ ...j, [scope]: { running: false, result, failed } }));
        setLastReindexAt(new Date().toISOString());
        if (failed) show(`Reindex ${scope}: ${failed}`, "error");
        else
          show(
            `Reindex ${scope} selesai — indexed ${result.indexed ?? 0}, skipped ${result.skipped ?? 0}, failed ${result.failed ?? 0}.`,
            (result.failed ?? 0) > 0 ? "info" : "success",
          );
        await loadStats();
      } catch (e) {
        setReindexJobs((j) => ({ ...j, [scope]: { running: false, failed: (e as Error).message } }));
        show(`Reindex ${scope} error: ${(e as Error).message}`, "error");
      }
    },
    [loadStats, show],
  );

  const runCleanup = useCallback(
    async (scope: SourceTypeOrAll) => {
      try {
        const result = await AiAdminService.cleanupOrphans(scope);
        const { failed } = interpretJob(result);
        if (failed) {
          show(`Cleanup ${scope}: ${failed}`, "error");
        } else {
          const deleted =
            result.orphansDeleted ??
            result.details?.reduce((n, d) => n + (d.orphansDeleted ?? 0), 0) ??
            0;
          show(`Cleanup ${scope} selesai — ${deleted} embedding yatim dihapus.`, "success");
        }
        await Promise.all([loadStats(), scanOrphans()]);
      } catch (e) {
        show(`Cleanup ${scope} error: ${(e as Error).message}`, "error");
      }
    },
    [loadStats, scanOrphans, show],
  );

  const onConfirm = useCallback(async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    if (confirm.kind === "reindex") await runReindex(confirm.scope);
    else await runCleanup(confirm.scope);
    setConfirmBusy(false);
    setConfirm(null);
  }, [confirm, runReindex, runCleanup]);

  const relativeReindex = useRelativeTime(lastReindexAt);
  const orphanByType = (t: SourceTypeOrAll): OrphanDetail | undefined =>
    orphans?.details.find((d) => d.sourceType === t);

  return (
    <div className="p-6 space-y-5">
      <Toast toast={toast} />

      <PageHeader
        icon={<DatabaseIcon size={20} />}
        title="RAG Index Management"
        subtitle="Isi, jaga kebersihan, dan pantau vector store."
        right={
          <>
            {lastReindexAt && (
              <span className="text-xs text-gray-400 hidden sm:inline">reindex {relativeReindex}</span>
            )}
            <button
              onClick={loadStats}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
              title="Refresh stats"
            >
              {loading ? <Spinner size={14} /> : <RefreshIcon size={14} />}
            </button>
          </>
        }
      />

      <InfoBanner tone="violet">
        <p>
          <strong>Reindex</strong> memanggil API embedding eksternal (bisa kena rate-limit).{" "}
          <em>skipped</em> = konten tak berubah/dedup · <em>failed</em> = error API (mis. kuota).{" "}
          <strong>Cleanup</strong> menghapus embedding yatim (sumber sudah tak ada) — perlu konfirmasi.
        </p>
      </InfoBanner>

      {statsError ? (
        <ErrorNotice error={statsError} onRetry={loadStats} />
      ) : (
        <>
          {/* Summary */}
          <Card className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatTile
                label="Total embedding"
                value={loading && !stats ? "…" : stats?.counts.total ?? 0}
                tone="blue"
              />
              <StatTile
                label="Vector store"
                value={loading && !stats ? "…" : (stats?.vectorStore ?? "—").toUpperCase()}
              />
              <StatTile
                label="Total orphan"
                value={orphans ? orphans.totalOrphans : "?"}
                tone={orphans && orphans.totalOrphans > 0 ? "red" : "green"}
                hint={orphans ? undefined : "belum di-scan"}
              />
              <div className="flex items-end">
                <button
                  onClick={scanOrphans}
                  disabled={orphansLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                >
                  {orphansLoading ? <Spinner size={13} /> : <SearchIcon size={13} />}
                  Scan orphan
                </button>
              </div>
            </div>
          </Card>

          {orphansError && <ErrorNotice error={orphansError} onRetry={scanOrphans} compact />}

          {/* Per-type table */}
          <SectionCard
            title="Coverage per source type"
            subtitle="embedded vs live source count"
            icon={<DatabaseIcon size={16} />}
            right={
              <button
                onClick={() => setConfirm({ kind: "reindex", scope: "ALL" })}
                disabled={reindexJobs["ALL"]?.running}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
              >
                {reindexJobs["ALL"]?.running ? <Spinner size={13} /> : <RefreshIcon size={13} />}
                Reindex ALL
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <Th>Source type</Th>
                    <Th center>Embedded</Th>
                    <Th center>Live</Th>
                    <Th center>Coverage</Th>
                    <Th center>Orphan</Th>
                    <Th right>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCE_TYPES.map((t) => {
                    const embedded = stats?.counts[t] ?? 0;
                    const live = stats?.sourceCounts[t] ?? 0;
                    const coverage = live > 0 ? Math.round((embedded / live) * 100) : embedded > 0 ? 100 : 0;
                    const job = reindexJobs[t];
                    const od = orphanByType(t);
                    const tone: "green" | "amber" | "red" =
                      embedded > live ? "red" : embedded < live ? "amber" : "green";
                    return (
                      <tr key={t} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-3">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            {SOURCE_TYPE_LABELS[t]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono text-gray-700 dark:text-gray-300">
                          {loading && !stats ? "…" : embedded}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono text-gray-500 dark:text-gray-400">
                          {loading && !stats ? "…" : live}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge tone={tone}>{coverage}%</Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {od ? (
                            od.orphanCount > 0 ? (
                              <Badge tone="red">{od.orphanCount}</Badge>
                            ) : (
                              <span className="text-xs text-green-600 dark:text-green-400">0</span>
                            )
                          ) : (
                            <span className="text-xs text-gray-400" title="belum di-scan">
                              ?
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setConfirm({ kind: "reindex", scope: t })}
                              disabled={job?.running}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 transition-colors disabled:opacity-50"
                            >
                              {job?.running ? <Spinner size={11} /> : <RefreshIcon size={11} />}
                              Reindex
                            </button>
                            {od && od.orphanCount > 0 && (
                              <button
                                onClick={() => setConfirm({ kind: "cleanup", scope: t })}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors"
                              >
                                <TrashIcon size={11} /> Cleanup
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-type last job result summaries */}
            {Object.entries(reindexJobs).some(([, j]) => j.result || j.failed) && (
              <div className="mt-4 space-y-1.5">
                {Object.entries(reindexJobs).map(([scope, j]) =>
                  j.result || j.failed ? (
                    <div key={scope} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-gray-400 w-24 shrink-0">{scope}</span>
                      {j.failed ? (
                        <span className="text-red-500">✗ {j.failed}</span>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-400">
                          total {j.result?.total ?? "?"} · indexed{" "}
                          <span className="text-green-600 dark:text-green-400">{j.result?.indexed ?? 0}</span> ·
                          skipped {j.result?.skipped ?? 0} · failed{" "}
                          <span className={(j.result?.failed ?? 0) > 0 ? "text-amber-500" : ""}>
                            {j.result?.failed ?? 0}
                          </span>
                        </span>
                      )}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </SectionCard>

          {/* Cleanup-all when orphans present */}
          {orphans && orphans.totalOrphans > 0 && (
            <InfoBanner tone="red">
              <div className="flex items-center justify-between w-full gap-3">
                <p>
                  <strong>{orphans.totalOrphans} embedding yatim</strong> terdeteksi (sumber sudah tak ada).
                  Bersihkan agar coverage akurat.
                </p>
                <button
                  onClick={() => setConfirm({ kind: "cleanup", scope: "ALL" })}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  <TrashIcon size={12} /> Cleanup ALL
                </button>
              </div>
            </InfoBanner>
          )}

          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <InfoIcon size={12} />
            Butuh menguji retrieval setelah reindex?{" "}
            <Link href="/platform-admin/ai-search" className="text-blue-500 hover:underline">
              Buka RAG Search Playground →
            </Link>
          </p>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "reindex" ? `Reindex ${confirm.scope}` : `Cleanup orphans — ${confirm.scope}`}
          danger={confirm.kind === "cleanup"}
          busy={confirmBusy}
          confirmLabel={confirm.kind === "reindex" ? "Reindex" : "Delete orphans"}
          body={
            confirm.kind === "reindex" ? (
              <>
                Membangun ulang embedding untuk <strong>{confirm.scope}</strong>. Memanggil API embedding
                eksternal — bisa memakan waktu & kuota. Konten yang tak berubah akan di-<em>skip</em>.
              </>
            ) : (
              <>
                Menghapus permanen embedding yatim untuk <strong>{confirm.scope}</strong>
                {orphanByType(confirm.scope) ? (
                  <>
                    {" "}
                    (
                    <strong>
                      {confirm.scope === "ALL"
                        ? orphans?.totalOrphans
                        : orphanByType(confirm.scope)?.orphanCount}
                    </strong>{" "}
                    embedding)
                  </>
                ) : null}
                . Tindakan ini tidak bisa dibatalkan.
              </>
            )
          }
          onConfirm={onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Th({
  children,
  center,
  right,
}: {
  children: React.ReactNode;
  center?: boolean;
  right?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${
        center ? "text-center" : right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
