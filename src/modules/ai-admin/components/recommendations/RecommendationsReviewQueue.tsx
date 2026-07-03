"use client";

/**
 * P0-D · Recommendations Review Queue (human-in-the-loop).
 *
 * The core trust surface: "AI proposes, a human decides." The detail panel MUST
 * expose why (triggerContext), the AI's analysis, ragEvidence (grounding proof)
 * and warnings — so a reviewer decides consciously, not from a bare score.
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P0-D
 *
 * ⚠ Contract quirks handled here:
 *  - approve: reviewedBy + note are QUERY params.
 *  - reject: reviewedBy is a QUERY param but reason goes in the BODY.
 */

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiApiError, PageResponse } from "../../types/common";
import { AiRecommendation, RecommendationStatus } from "../../types/recommendation";
import { AiAdminService } from "../../services/aiAdmin.service";
import { CheckIcon, RefreshIcon, SparklesIcon, XIcon } from "../shared/icons";
import {
  Badge,
  Card,
  ChannelBadge,
  CHANNEL_OPTIONS,
  CHANNEL_LABELS,
  classifyLlmError,
  ConfirmDialog,
  ErrorNotice,
  InfoBanner,
  PageHeader,
  SectionCard,
  Spinner,
  Toast,
  Tone,
  useToast,
} from "../shared/ui";

/** Hard client-side ceiling for the analyze agent (see JoltGenerationConsole). */
const TRIGGER_TIMEOUT_MS = 120_000;

const STATUS_TABS: Array<{ key: RecommendationStatus | "ALL"; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
];

const REVIEWER_KEY = "ai_admin_reviewer";

export default function RecommendationsReviewQueue() {
  const { toast, show } = useToast();

  const [status, setStatus] = useState<RecommendationStatus | "ALL">("PENDING");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [size] = useState(20);

  const [data, setData] = useState<PageResponse<AiRecommendation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [selected, setSelected] = useState<AiRecommendation | null>(null);
  const [triggerChannel, setTriggerChannel] = useState<string>("");
  const [triggering, setTriggering] = useState(false);
  const [triggerElapsed, setTriggerElapsed] = useState(0);
  const [preflightRateLimited, setPreflightRateLimited] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AiAdminService.listRecommendations({
        status: status === "ALL" ? undefined : status,
        channelId: channelFilter || undefined,
        page,
        size,
      });
      setData(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [status, channelFilter, page, size]);

  useEffect(() => {
    load();
  }, [load]);

  const clearTriggerTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutRef.current = null;
    tickRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTriggerTimers();
    };
  }, [clearTriggerTimers]);

  // Pre-flight: warn if the latest agent session on the chosen channel failed on quota.
  useEffect(() => {
    let alive = true;
    setPreflightRateLimited(false);
    if (!triggerChannel) return;
    AiAdminService.getMostRecentSession([triggerChannel])
      .then((s) => {
        if (!alive || !s || s.status !== "FAILED") return;
        const kind = classifyLlmError(s.errorMessage).kind;
        if (kind === "rate_limit" || kind === "quota_zero") setPreflightRateLimited(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [triggerChannel]);

  const cancelTrigger = useCallback(() => {
    timedOutRef.current = false;
    abortRef.current?.abort();
  }, []);

  const triggerAnalysis = useCallback(async () => {
    if (!triggerChannel) {
      show("Pilih channel dulu untuk trigger analysis.", "info");
      return;
    }
    if (triggering) return;
    const controller = new AbortController();
    abortRef.current = controller;
    timedOutRef.current = false;
    setTriggering(true);
    setTriggerElapsed(0);
    tickRef.current = setInterval(() => setTriggerElapsed((s) => s + 1), 1000);
    timeoutRef.current = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, TRIGGER_TIMEOUT_MS);

    try {
      await AiAdminService.triggerAnalysis(triggerChannel, controller.signal);
      show(`Analysis selesai untuk ${CHANNEL_LABELS[triggerChannel] ?? triggerChannel}. Rekomendasi baru akan muncul di antrian.`, "success");
      setTimeout(load, 800);
    } catch (e) {
      if (e instanceof AiApiError && e.kind === "aborted") {
        show(
          timedOutRef.current
            ? `Timeout setelah ${Math.round(TRIGGER_TIMEOUT_MS / 1000)}s — agent kemungkinan masih menunggu kuota LLM (429). Coba lagi nanti atau pakai model/provider berbayar.`
            : "Trigger dibatalkan.",
          "error",
        );
      } else {
        show(`Trigger gagal: ${(e as Error).message}`, "error");
      }
    } finally {
      clearTriggerTimers();
      abortRef.current = null;
      setTriggering(false);
    }
  }, [triggerChannel, triggering, show, load, clearTriggerTimers]);

  const triggerElapsedLabel = `${Math.floor(triggerElapsed / 60)}:${String(triggerElapsed % 60).padStart(2, "0")}`;
  const rows = data?.content ?? [];

  return (
    <div className="p-6 space-y-5">
      <Toast toast={toast} />

      <PageHeader
        icon={<SparklesIcon size={20} />}
        title="Recommendations Review Queue"
        subtitle="AI mengusulkan, manusia memutuskan — approve / reject dengan bukti."
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

      {/* Filters + trigger */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setStatus(t.key);
                  setPage(0);
                }}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  status === t.key
                    ? "bg-violet-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Channel:</span>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(0);
              }}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="">All</option>
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={triggerChannel}
              onChange={(e) => setTriggerChannel(e.target.value)}
              disabled={triggering}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              <option value="">Pilih channel…</option>
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c] ?? c}
                </option>
              ))}
            </select>
            {triggering ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 dark:bg-gray-700 text-white">
                  <Spinner size={12} /> Menganalisis… <span className="font-mono tabular-nums">{triggerElapsedLabel}</span>
                </span>
                <button
                  onClick={cancelTrigger}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Batalkan
                </button>
              </>
            ) : (
              <button
                onClick={triggerAnalysis}
                disabled={!triggerChannel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white transition-colors disabled:opacity-50"
              >
                <SparklesIcon size={12} />
                Trigger Analysis
              </button>
            )}
          </div>
        </div>

        {/* Pre-flight rate-limit warning + honest waiting note (long-run robustness) */}
        {preflightRateLimited && !triggering && (
          <div className="mt-3">
            <InfoBanner tone="amber">
              <p>
                <strong>LLM sedang rate-limited</strong> untuk {CHANNEL_LABELS[triggerChannel] ?? triggerChannel} —
                sesi agent terakhir gagal karena kuota. Trigger sekarang kemungkinan besar juga gagal (429).
              </p>
            </InfoBanner>
          </div>
        )}
        {triggering && (
          <p className="mt-2 text-[11px] text-gray-400">
            Menjalankan agent (memakai kuota LLM). Bisa sampai ~2 menit saat kuota sibuk — otomatis berhenti di{" "}
            {Math.round(TRIGGER_TIMEOUT_MS / 1000)}s. Boleh Batalkan kapan saja.
          </p>
        )}
      </Card>

      {/* List */}
      {error ? (
        <ErrorNotice error={error} onRetry={load} />
      ) : loading && !data ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyQueue status={status} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 text-left">
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Confidence</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Channel</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Trigger</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Root cause</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Expires</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((rec) => (
                <QueueRow key={rec.id} rec={rec} onOpen={() => setSelected(rec)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pagination */}
      {data && data.totalElements > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {data.totalElements} total · halaman {data.page + 1} dari {Math.max(1, data.totalPages)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.hasNext}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <RecommendationDetail
          initial={selected}
          onClose={() => setSelected(null)}
          onReviewed={() => {
            setSelected(null);
            load();
          }}
          notify={show}
        />
      )}
    </div>
  );
}

// ─── Confidence helpers ──────────────────────────────────────────────────────

function confidenceTone(score?: number): { tone: Tone; label: string } {
  if (score == null) return { tone: "gray", label: "n/a" };
  if (score >= 0.92) return { tone: "green", label: "auto" };
  if (score >= 0.7) return { tone: "amber", label: "review" };
  return { tone: "red", label: "low" };
}

function ConfidenceBadge({ rec }: { rec: AiRecommendation }) {
  const score = rec.analysis?.confidenceScore;
  const { tone, label } = confidenceTone(score);
  return (
    <Badge tone={tone} dot>
      {score != null ? `${(score * 100).toFixed(0)}%` : "—"} · {rec.analysis?.confidenceLevel ?? label}
    </Badge>
  );
}

function fmtExpiry(iso?: string): { text: string; tone: Tone } {
  if (!iso) return { text: "—", tone: "gray" };
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return { text: iso, tone: "gray" };
  if (ms <= 0) return { text: "expired", tone: "red" };
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return { text: `${days}h lagi`, tone: days <= 2 ? "amber" : "gray" };
  const hours = Math.floor(ms / 3_600_000);
  return { text: `${hours}j lagi`, tone: "amber" };
}

// ─── Queue row ───────────────────────────────────────────────────────────────

function QueueRow({ rec, onOpen }: { rec: AiRecommendation; onOpen: () => void }) {
  const expiry = fmtExpiry(rec.expiresAt);
  const statusTone: Tone =
    rec.status === "APPROVED" ? "green" : rec.status === "REJECTED" ? "red" : rec.status === "PENDING" ? "amber" : "gray";
  return (
    <tr
      onClick={onOpen}
      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer transition-colors"
    >
      <td className="px-3 py-3">
        <ConfidenceBadge rec={rec} />
      </td>
      <td className="px-3 py-3">
        <ChannelBadge channelId={rec.channelId ?? ""} />
      </td>
      <td className="px-3 py-3">
        <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">{rec.triggerType ?? "—"}</span>
      </td>
      <td className="px-3 py-3 max-w-[280px]">
        <span className="text-xs text-gray-700 dark:text-gray-300 line-clamp-1" title={rec.analysis?.rootCause}>
          {rec.analysis?.rootCause ?? "—"}
        </span>
      </td>
      <td className="px-3 py-3">
        <Badge tone={statusTone}>{rec.status}</Badge>
      </td>
      <td className="px-3 py-3">
        <Badge tone={expiry.tone}>{expiry.text}</Badge>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-xs text-blue-500 hover:underline">Detail →</span>
      </td>
    </tr>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyQueue({ status }: { status: RecommendationStatus | "ALL" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400">
        <SparklesIcon size={22} />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {status === "PENDING" ? "Tidak ada rekomendasi menunggu review" : `Tidak ada rekomendasi ${status.toLowerCase()}`}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
        Rekomendasi dibuat otomatis saat publish gagal, atau bisa dipicu manual via{" "}
        <strong>Trigger Analysis</strong> per channel di atas. Antrian kosong = tidak ada yang perlu keputusan
        manusia saat ini.
      </p>
    </div>
  );
}

// ─── Detail drawer (approve / reject) ───────────────────────────────────────

function RecommendationDetail({
  initial,
  onClose,
  onReviewed,
  notify,
}: {
  initial: AiRecommendation;
  onClose: () => void;
  onReviewed: () => void;
  notify: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [rec, setRec] = useState<AiRecommendation>(initial);
  const [loadingFull, setLoadingFull] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setReviewer(window.localStorage.getItem(REVIEWER_KEY) ?? "");
  }, []);

  // Fetch full detail (list rows may be summaries).
  useEffect(() => {
    setLoadingFull(true);
    AiAdminService.getRecommendation(initial.id)
      .then((full) => setRec(full))
      .catch(() => setRec(initial))
      .finally(() => setLoadingFull(false));
  }, [initial]);

  const persistReviewer = (v: string) => {
    setReviewer(v);
    if (typeof window !== "undefined") window.localStorage.setItem(REVIEWER_KEY, v);
  };

  const doApprove = useCallback(async () => {
    setBusy(true);
    try {
      await AiAdminService.approveRecommendation(rec.id, reviewer.trim(), note.trim() || undefined);
      notify("Rekomendasi disetujui — JOLT spec produksi diperbarui.", "success");
      onReviewed();
    } catch (e) {
      notify(`Approve gagal: ${(e as Error).message}`, "error");
      setBusy(false);
      setConfirmApprove(false);
    }
  }, [rec.id, reviewer, note, notify, onReviewed]);

  const doReject = useCallback(async () => {
    if (!reviewer.trim()) return notify("Isi nama reviewer dulu.", "info");
    if (!rejectReason.trim()) return notify("Isi alasan penolakan.", "info");
    setBusy(true);
    try {
      await AiAdminService.rejectRecommendation(rec.id, reviewer.trim(), rejectReason.trim());
      notify("Rekomendasi ditolak.", "success");
      onReviewed();
    } catch (e) {
      notify(`Reject gagal: ${(e as Error).message}`, "error");
      setBusy(false);
    }
  }, [rec.id, reviewer, rejectReason, notify, onReviewed]);

  const warnings = rec.analysis?.warnings ?? [];
  const ragEvidence = rec.analysis?.ragEvidence ?? [];
  const isPending = rec.status === "PENDING";
  const canApprove = reviewer.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <ConfidenceBadge rec={rec} />
            <ChannelBadge channelId={rec.channelId ?? ""} />
            <Badge tone={rec.status === "PENDING" ? "amber" : rec.status === "APPROVED" ? "green" : "gray"}>
              {rec.status}
            </Badge>
            {loadingFull && <Spinner size={14} />}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Warnings first (risk before approve) */}
          {warnings.length > 0 && (
            <InfoBanner tone="amber">
              <p className="font-semibold">⚠ Peringatan ({warnings.length})</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1">
                {warnings.map((w, i) => (
                  <li key={i}>{String(w)}</li>
                ))}
              </ul>
            </InfoBanner>
          )}

          {/* Why */}
          <SectionCard title="Kenapa muncul" subtitle="triggerContext">
            <div className="space-y-2 text-xs">
              <DetailRow label="Trigger type" value={rec.triggerType ?? "—"} mono />
              {rec.triggerContext?.errorMessage && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                  <p className="text-red-700 dark:text-red-400">{rec.triggerContext.errorMessage}</p>
                </div>
              )}
              <DetailRow label="Master product" value={rec.triggerContext?.masterProductId ?? "—"} mono />
              <DetailRow label="Publish attempt" value={rec.triggerContext?.publishAttemptId ?? "—"} mono />
              {rec.triggerContext?.sampleProductSnapshot != null && (
                <JsonBlock label="Sample product snapshot" value={rec.triggerContext.sampleProductSnapshot} />
              )}
            </div>
          </SectionCard>

          {/* AI analysis */}
          <SectionCard title="Penilaian AI" subtitle="analysis">
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-gray-400 mb-0.5">Root cause</p>
                <p className="text-gray-800 dark:text-gray-200">{rec.analysis?.rootCause ?? "—"}</p>
              </div>
              <ChipList label="Affected fields" items={rec.analysis?.affectedFields} tone="blue" />
              <ChipList label="Missing channel requirements" items={rec.analysis?.missingChannelRequirements} tone="amber" />
            </div>
          </SectionCard>

          {/* RAG evidence — grounding proof */}
          <SectionCard
            title="RAG Evidence"
            subtitle="mapping / spec yang menjadi dasar (bukti grounding)"
          >
            {ragEvidence.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ Tidak ada ragEvidence — agent mungkin menebak, bukan grounded ke RAG. Tinjau ekstra hati-hati.
              </p>
            ) : (
              <JsonBlock label={`${ragEvidence.length} evidence`} value={ragEvidence} defaultOpen />
            )}
          </SectionCard>

          {/* Proposed fix */}
          <SectionCard title="Proposed Fix" subtitle="perubahan JOLT yang diusulkan">
            <JsonBlock label={rec.proposedFix?.type ?? "fix"} value={rec.proposedFix ?? {}} defaultOpen />
            {rec.agentSessionId && (
              <p className="mt-2 text-xs text-gray-400">
                Sesi agent:{" "}
                <Link
                  href={`/platform-admin/ai-sessions?sessionId=${rec.agentSessionId}`}
                  className="text-blue-500 hover:underline font-mono"
                >
                  {rec.agentSessionId}
                </Link>{" "}
                <span className="text-gray-300 dark:text-gray-600">(P1-E, Phase 2)</span>
              </p>
            )}
          </SectionCard>

          {/* Review actions */}
          {isPending ? (
            <Card className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Reviewer <span className="text-red-500">*</span>
                </label>
                <input
                  value={reviewer}
                  onChange={(e) => persistReviewer(e.target.value)}
                  placeholder="nama / email admin"
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Note (opsional, untuk approve)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="catatan approval…"
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Alasan penolakan (untuk reject)</label>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="kenapa ditolak…"
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setConfirmApprove(true)}
                  disabled={!canApprove || busy}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckIcon size={15} /> Approve
                </button>
                <button
                  onClick={doReject}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <XIcon size={15} /> Reject
                </button>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Approve mengubah JOLT spec produksi untuk channel ini. Pastikan sudah meninjau evidence & warnings.
              </p>
            </Card>
          ) : (
            <Card className="p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <DetailRow label="Reviewed by" value={rec.reviewedBy ?? "—"} />
              <DetailRow label="Reviewed at" value={rec.reviewedAt ? new Date(rec.reviewedAt).toLocaleString() : "—"} />
              {rec.rejectionReason && <DetailRow label="Rejection reason" value={rec.rejectionReason} />}
              {rec.appliedJoltSpecId && <DetailRow label="Applied JOLT spec" value={rec.appliedJoltSpecId} mono />}
            </Card>
          )}

          <p className="text-[11px] text-gray-300 dark:text-gray-600 font-mono">id: {rec.id}</p>
        </div>
      </div>

      {confirmApprove && (
        <ConfirmDialog
          title="Setujui rekomendasi?"
          confirmLabel="Approve & apply"
          busy={busy}
          body={
            <>
              Ini akan menerapkan proposed fix dan memperbarui JOLT spec produksi untuk{" "}
              <strong>{CHANNEL_LABELS[rec.channelId ?? ""] ?? rec.channelId}</strong>. Reviewer:{" "}
              <strong>{reviewer}</strong>.
            </>
          }
          onConfirm={doApprove}
          onCancel={() => setConfirmApprove(false)}
        />
      )}
    </div>
  );
}

// ─── Detail helpers ──────────────────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 shrink-0 w-32">{label}</span>
      <span className={`text-gray-700 dark:text-gray-300 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function ChipList({
  label,
  items,
  tone,
}: {
  label: string;
  items?: string[];
  tone: Tone;
}) {
  return (
    <div>
      <p className="text-gray-400 mb-1">{label}</p>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((f, i) => (
            <Badge key={i} tone={tone}>
              {f}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-gray-400">—</span>
      )}
    </div>
  );
}

function JsonBlock({
  label,
  value,
  defaultOpen,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const json = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        {label}
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto text-[11px] font-mono bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-700 dark:text-gray-300">
          {json}
        </pre>
      )}
    </div>
  );
}
