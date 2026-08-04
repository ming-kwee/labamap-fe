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
import {
  AiRecommendation,
  PostProcessingGapSuggestion,
  RecommendationAnalysis,
  RecommendationStatus,
} from "../../types/recommendation";
import { PostProcessingOp } from "../../types/opCatalog";
import { OP_GLOSS_ID } from "./opCatalogGlossId";
import { AiAdminService } from "../../services/aiAdmin.service";
import { ProductTypeService } from "@/app/(admin)/omni-admin/product-types/_services/product-type.service";
import type { ProductType } from "@/app/(admin)/omni-admin/product-types/_types/product-type";
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

/**
 * Post-processing gaps = required fields the JOLT agent CANNOT build (image, tier_variation,
 * model, …) with no rule yet. Unlike missingChannelRequirements, approving the JOLT does NOT
 * fill these — a developer must add a post-processing rule. The whole `analysis` ships in the
 * list response, so we can flag/triage gap items with no extra fetch.
 * Contract: docs/FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md §3–§4.
 */
function postProcessingGapFields(analysis?: RecommendationAnalysis): string[] {
  const gaps = analysis?.postProcessingGaps ?? [];
  if (gaps.length > 0) return gaps;
  // Fall back to suggestion fields if the gap list is absent but suggestions exist.
  return (analysis?.postProcessingGapSuggestions ?? []).map((s) => s.field).filter(Boolean);
}

function hasPostProcessingGaps(rec: AiRecommendation): boolean {
  return postProcessingGapFields(rec.analysis).length > 0;
}

export default function RecommendationsReviewQueue() {
  const { toast, show } = useToast();

  const [status, setStatus] = useState<RecommendationStatus | "ALL">("PENDING");
  const [channelFilter, setChannelFilter] = useState<string>("");
  // Client-side triage toggle: show only items needing a post-processing rule (developer work,
  // not a plain approve). Filters the loaded page — analysis ships in the list, so no extra fetch.
  const [gapsOnly, setGapsOnly] = useState(false);
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

  // Optional Product Type scope for Trigger Analysis: when set, the trigger targets that
  // type's channel × category (categorySlug) and seeds a representative sample product,
  // instead of the backend defaulting to category "default" with an empty sample.
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [triggerProductTypeId, setTriggerProductTypeId] = useState<string>("");
  const triggerProductType = productTypes.find((t) => t.id === triggerProductTypeId) ?? null;

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

  // Product types for the optional Trigger-Analysis scope (best-effort).
  useEffect(() => {
    let alive = true;
    ProductTypeService.list({ active: true })
      .then((ts) => { if (alive) setProductTypes(ts); })
      .catch(() => { if (alive) setProductTypes([]); });
    return () => { alive = false; };
  }, []);

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
      // Scope the trigger to the picked Product Type. Phase 0B parity with generate-jolt:
      // send productTypeId (the ObjectId) and let the BACKEND derive the category from
      // ProductType.categorySlug — one source of truth, matching what publish resolves. Also
      // seed a representative sample (best-effort). Without a type, backend resolves "default".
      const productTypeId = triggerProductType?.id;
      let sampleProduct: Record<string, unknown> | undefined;
      if (triggerProductType) {
        try {
          const { sample } = await AiAdminService.getSampleMasterProduct(triggerProductType.id);
          sampleProduct = sample;
        } catch { /* sample is optional — proceed without it */ }
      }

      await AiAdminService.triggerAnalysis(
        { channelId: triggerChannel, productTypeId, sampleProduct },
        controller.signal,
      );
      const ch = CHANNEL_LABELS[triggerChannel] ?? triggerChannel;
      // Display the derived category (FE already has categorySlug loaded) even though the
      // wire sends productTypeId — the backend resolves the same slug.
      const scope = triggerProductType ? ` · kategori ${triggerProductType.categorySlug ?? "default"}` : "";
      // The trigger returns { sessionId, status: "TRIGGERED" } — it does NOT report the
      // outcome. A recommendation only lands here when confidence is in the review band
      // (~70–92%). High-confidence results are AUTO-APPLIED to the production JOLT spec and
      // never enter this queue — so don't promise a queue entry unconditionally.
      show(
        `Analysis ${ch}${scope} selesai — antrian di-refresh. Jika confidence tinggi, JOLT langsung diterapkan (auto-apply) & tidak masuk antrian; cek di Channel JOLT Specs / Agent Sessions.`,
        "info",
      );
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
  }, [triggerChannel, triggerProductType, triggering, show, load, clearTriggerTimers]);

  const triggerElapsedLabel = `${Math.floor(triggerElapsed / 60)}:${String(triggerElapsed % 60).padStart(2, "0")}`;
  const allRows = data?.content ?? [];
  const gapCount = allRows.filter(hasPostProcessingGaps).length;
  const rows = gapsOnly ? allRows.filter(hasPostProcessingGaps) : allRows;

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

          {/* Triage toggle: needs post-processing (developer work, not a plain approve). */}
          <button
            onClick={() => setGapsOnly((v) => !v)}
            disabled={!gapsOnly && gapCount === 0}
            title="Tampilkan hanya item yang butuh post-processing rule (butuh developer, bukan sekadar approve)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
              gapsOnly
                ? "bg-violet-600 border-violet-600 text-white"
                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <span>⚙</span> Perlu post-processing
            {gapCount > 0 && (
              <span className={`px-1.5 rounded ${gapsOnly ? "bg-white/20" : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"}`}>
                {gapCount}
              </span>
            )}
          </button>

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
            {/* Optional scope: pick a Product Type → trigger targets its channel × category
                (categorySlug) with a representative sample, instead of category "default". */}
            <select
              value={triggerProductTypeId}
              onChange={(e) => setTriggerProductTypeId(e.target.value)}
              disabled={triggering || productTypes.length === 0}
              title="Opsional — scope trigger ke kategori Product Type ini. Kosong = kategori 'default'."
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 max-w-[190px]"
            >
              <option value="">Semua kategori (default)</option>
              {productTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.categorySlug ? ` → ${t.categorySlug}` : ""}
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
        {triggerProductType && !triggering && (
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            Scope: kategori{" "}
            <code className="font-mono text-violet-600 dark:text-violet-400">{triggerProductType.categorySlug ?? "default"}</code>{" "}
            + sample dari <strong>{triggerProductType.name}</strong> (bukan sample kosong).
          </p>
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
        <div className="flex items-center gap-1.5">
          {hasPostProcessingGaps(rec) && (
            <span title="Butuh post-processing rule (developer), bukan sekadar approve" className="shrink-0">
              <Badge tone="violet">⚙</Badge>
            </span>
          )}
          <span className="text-xs text-gray-700 dark:text-gray-300 line-clamp-1" title={rec.analysis?.rootCause}>
            {rec.analysis?.rootCause ?? "—"}
          </span>
        </div>
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
  const [approveError, setApproveError] = useState<string | null>(null);

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

  // Op catalog — only fetched when a gap actually suggests an op to explain. null = loading,
  // empty Map = loaded (an op simply not present is handled as "not in catalog"). Keyed upper.
  const [opCatalog, setOpCatalog] = useState<Map<string, PostProcessingOp> | null>(null);
  useEffect(() => {
    const hasOps = (rec.analysis?.postProcessingGapSuggestions ?? []).some((s) => s.suggestedOp);
    if (!hasOps || opCatalog !== null) return;
    let alive = true;
    AiAdminService.getPostProcessingCatalog()
      .then((cat) => {
        if (!alive) return;
        const m = new Map<string, PostProcessingOp>();
        for (const op of cat.operations ?? []) if (op?.opCode) m.set(op.opCode.toUpperCase(), op);
        setOpCatalog(m);
      })
      .catch(() => { if (alive) setOpCatalog(new Map()); });
    return () => { alive = false; };
  }, [rec.analysis, opCatalog]);

  const persistReviewer = (v: string) => {
    setReviewer(v);
    if (typeof window !== "undefined") window.localStorage.setItem(REVIEWER_KEY, v);
  };

  const doApprove = useCallback(async () => {
    setBusy(true);
    setApproveError(null);
    try {
      await AiAdminService.approveRecommendation(rec.id, reviewer.trim(), note.trim() || undefined);
      notify("Rekomendasi disetujui — JOLT spec produksi diperbarui.", "success");
      onReviewed();
    } catch (e) {
      // 422 = the proposed spec fails the backend JOLT-compile guard (can't be applied to
      // production). Surface it persistently in the drawer — not a 4.5s toast — so the
      // reviewer sees WHY and rejects/fixes instead of blindly retrying.
      const is422 = e instanceof AiApiError && e.status === 422;
      const raw = e instanceof AiApiError ? e.message.replace(/^\d{3}\s*/, "") : (e as Error).message;
      setApproveError(is422 ? `Spec ditolak — tidak bisa di-compile jadi JOLT valid: ${raw}` : raw);
      notify(is422 ? "Approve ditolak: proposed spec tidak valid (lihat detail di panel)." : `Approve gagal: ${raw}`, "error");
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

  // Failure-context (master product / attempt / error) and field-gap diagnosis are only
  // populated when a recommendation is born from a real publish failure. For manual triggers
  // these are empty by design — annotate that instead of rendering a bare, broken-looking "—".
  const hasFailureContext = !!(rec.triggerContext?.masterProductId || rec.triggerContext?.publishAttemptId);
  const hasFieldDiagnosis =
    (rec.analysis?.affectedFields?.length ?? 0) > 0 ||
    (rec.analysis?.missingChannelRequirements?.length ?? 0) > 0;
  // Approving JOLT does NOT fill post-processing gaps — warn before approve when present. §3b
  const hasGaps = hasPostProcessingGaps(rec);

  return (
    <div
      className="fixed inset-0 z-[100000] flex justify-end bg-black/50 backdrop-blur-sm"
      // Only a direct backdrop click closes the drawer — not clicks bubbling up from the
      // ConfirmDialog (rendered inside), which would otherwise unmount the drawer mid-approve
      // and swallow a 422 rejection before its banner can show.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
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
              {hasFailureContext ? (
                <>
                  <DetailRow label="Master product" value={rec.triggerContext?.masterProductId ?? "—"} mono />
                  <DetailRow label="Publish attempt" value={rec.triggerContext?.publishAttemptId ?? "—"} mono />
                </>
              ) : (
                <p className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 px-3 py-2 text-gray-500 dark:text-gray-400">
                  Trigger manual — tidak ada produk / percobaan publish terkait. Konteks kegagalan
                  (produk, attempt, pesan error) hanya terisi saat rekomendasi lahir dari publish yang gagal.
                </p>
              )}
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
              {hasFieldDiagnosis ? (
                <>
                  <ChipList label="Affected fields" items={rec.analysis?.affectedFields} tone="blue" />
                  <ChipList label="Missing channel requirements" items={rec.analysis?.missingChannelRequirements} tone="amber" />
                </>
              ) : !hasGaps ? (
                <p className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 px-3 py-2 text-gray-500 dark:text-gray-400">
                  Diagnosis field-gap (affected / missing) tidak tersedia untuk rekomendasi ini — biasanya
                  terisi saat dipicu publish gagal. Lihat <strong>Proposed Fix</strong> (perubahan mapping
                  konkret) dan <strong>RAG Evidence</strong> (dasar keputusan) di bawah.
                </p>
              ) : null}
              {/* Post-processing gaps — required fields JOLT can't build; distinct from
                  missingChannelRequirements (which JOLT alone may fix). §3a */}
              <PostProcessingGapsBlock analysis={rec.analysis} opCatalog={opCatalog} />
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
              <EvidenceList evidence={ragEvidence} />
            )}
          </SectionCard>

          {/* Proposed fix */}
          <SectionCard title="Proposed Fix" subtitle="perubahan JOLT yang diusulkan">
            {rec.proposedFix?.type && (
              <div className="mb-2">
                <Badge tone="violet">{rec.proposedFix.type}</Badge>
              </div>
            )}
            <JoltSummary proposedFix={rec.proposedFix} />
            {/* JOLT no longer maps image/support fields (tier_variation/model/…) — built by
                post-processing. Note it so a reviewer doesn't read the diff as "images lost". §4 */}
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              Field gambar &amp; support (<code className="font-mono">tier_variation</code>/
              <code className="font-mono">model</code>/dll) sengaja tak ada di JOLT — dibangun post-processing,
              bukan hilang dari spec.
            </p>
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
              {hasGaps && (
                <InfoBanner tone="amber">
                  <p>
                    Spec ini punya <strong>post-processing gaps</strong>. Meng-approve JOLT{" "}
                    <strong>tidak</strong> mengisi field ini — seorang <strong>developer</strong> harus
                    menambah post-processing rule. Approve hanya menetapkan bagian JOLT-nya.
                  </p>
                </InfoBanner>
              )}
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
              {approveError && (
                <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300">Approve ditolak backend</p>
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 break-words">{approveError}</p>
                  <p className="text-[11px] text-red-500/80 dark:text-red-400/80 mt-1">
                    Spec ini tak bisa diterapkan ke produksi. Reject rekomendasi ini, atau perbaiki spec-nya lebih dulu.
                  </p>
                </div>
              )}
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

/**
 * Post-processing gaps block (§3a). Renders required fields the JOLT agent CANNOT build,
 * visually distinct (violet ⚙) from missingChannelRequirements (amber chips) — because these
 * need a developer to add a rule, not a reviewer approve. Best-effort `suggestedOp` per field
 * (with its precedent `source`); absent op = no precedent, developer decides. Null-safe: renders
 * nothing when there are no gaps. Contract: docs/FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md §3a.
 */
function PostProcessingGapsBlock({
  analysis,
  opCatalog,
}: {
  analysis?: RecommendationAnalysis;
  opCatalog: Map<string, PostProcessingOp> | null;
}) {
  const fields = postProcessingGapFields(analysis);
  if (fields.length === 0) return null;
  const byField = new Map((analysis?.postProcessingGapSuggestions ?? []).map((s) => [s.field, s]));
  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/15 px-3 py-2.5">
      <p className="flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
        <span aria-hidden>⚙</span> Post-processing gaps
        <Badge tone="violet">{fields.length}</Badge>
      </p>
      <p className="mt-0.5 text-[11px] text-violet-600/90 dark:text-violet-400/90">
        Butuh <strong>rule post-processing baru</strong> — JOLT tak bisa menghasilkan field ini. Approve JOLT
        saja <strong>tidak</strong> menyelesaikannya. Klik op untuk lihat apa yang dihasilkannya.
      </p>
      <ul className="mt-2 space-y-1.5">
        {fields.map((f) => (
          <GapRow key={f} field={f} suggestion={byField.get(f)} opCatalog={opCatalog} />
        ))}
      </ul>
    </div>
  );
}

/** One gap row: field → suggested op (click to expand its engine-catalog behavior). */
function GapRow({
  field,
  suggestion,
  opCatalog,
}: {
  field: string;
  suggestion?: PostProcessingGapSuggestion;
  opCatalog: Map<string, PostProcessingOp> | null;
}) {
  const [open, setOpen] = useState(false);
  const op = suggestion?.suggestedOp;
  return (
    <li className="text-[11px]">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="font-mono font-medium text-violet-700 dark:text-violet-300">{field}</span>
        {op ? (
          <>
            <span className="text-gray-400">→ usul op:</span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              title="Klik untuk lihat apa yang dihasilkan op ini (dari katalog engine)"
              className="inline-flex items-center gap-1 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
              {op}
            </button>
            {suggestion?.source && (
              <span className="text-gray-400">
                (preseden: <code className="font-mono">{suggestion.source}</code>)
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400">— belum ada preseden (developer memutuskan)</span>
        )}
      </div>
      {op && open && (
        <div className="mt-1.5 ml-1">
          <OpDetail opCode={op} buildsTarget={suggestion?.buildsTarget} opCatalog={opCatalog} />
        </div>
      )}
    </li>
  );
}

/**
 * What a suggested op actually does — grounded in the engine's op catalog, not guessed.
 * Three states: loading, found (description + params + real jsonExample), or not-in-catalog
 * (honest warning — the op is a best-effort precedent that the engine may not implement).
 */
function OpDetail({
  opCode,
  buildsTarget,
  opCatalog,
}: {
  opCode: string;
  buildsTarget?: string;
  opCatalog: Map<string, PostProcessingOp> | null;
}) {
  if (opCatalog === null) {
    return (
      <p className="flex items-center gap-1.5 text-gray-400">
        <Spinner size={11} /> Memuat detail op dari katalog engine…
      </p>
    );
  }
  const op = opCatalog.get(opCode.toUpperCase());
  if (!op) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 px-3 py-2 text-amber-700 dark:text-amber-300">
        <p>
          ⚠ Op <code className="font-mono">{opCode}</code> <strong>belum ada</strong> di katalog engine
          (dari {opCatalog.size} op terdaftar). Kemungkinan usulan preseden dari channel lain atau belum
          diimplementasikan di engine — <strong>developer verifikasi manual</strong> sebelum membuat rule.
        </p>
      </div>
    );
  }
  const params = op.params ?? [];
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-gray-600 dark:text-gray-300">Apa yang dihasilkan op ini</span>
        {op.scope && <Badge tone="gray">{op.scope}</Badge>}
        {buildsTarget && (
          <span className="text-gray-400">
            → field <code className="font-mono text-violet-600 dark:text-violet-400">{buildsTarget}</code>
          </span>
        )}
      </div>
      <OpDescription opCode={op.opCode} descriptionEn={op.description} />
      <OpExampleView op={op} />
      {params.length > 0 && (
        <div>
          <p className="text-gray-400 mb-1">Parameter</p>
          <div className="space-y-1">
            {params.map((p) => (
              <div key={p.name} className="flex flex-wrap items-baseline gap-x-1.5">
                <code className="font-mono text-blue-600 dark:text-blue-400">{p.name}</code>
                {p.type && <span className="text-gray-400">{p.type}</span>}
                {p.required ? (
                  <span className="text-red-500">wajib</span>
                ) : (
                  <span className="text-gray-400">opsional</span>
                )}
                {p.description && <span className="text-gray-500 dark:text-gray-400">— {p.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {op.jsonExample != null && (
        <div>
          <p className="text-gray-400 mb-1">Contoh konfigurasi (jsonExample)</p>
          <pre className="max-h-48 overflow-auto text-[11px] font-mono bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-gray-700 dark:text-gray-300">
            {JSON.stringify(op.jsonExample, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Op description in Indonesian (gloss) with the exact engine English one toggle away.
 * Falls back to the English text when no gloss exists — never hides the engine's wording.
 */
function OpDescription({ opCode, descriptionEn }: { opCode: string; descriptionEn?: string }) {
  const [showEn, setShowEn] = useState(false);
  const id = OP_GLOSS_ID[opCode.toUpperCase()];
  if (!id) {
    // No gloss — show English as-is, labelled honestly.
    return descriptionEn ? (
      <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
        <p>{descriptionEn}</p>
        <p className="mt-0.5 text-[10px] text-gray-400">deskripsi asli (EN) — belum diterjemahkan</p>
      </div>
    ) : null;
  }
  return (
    <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
      <p>{id}</p>
      {descriptionEn && (
        <>
          <button
            type="button"
            onClick={() => setShowEn((v) => !v)}
            className="mt-0.5 text-[10px] text-blue-500 hover:underline"
          >
            {showEn ? "Sembunyikan teks asli (EN)" : "Lihat teks asli engine (EN)"}
          </button>
          {showEn && (
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 italic">{descriptionEn}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Authoritative before → after data schematic, straight from the engine op catalog
 * (inputExample / outputExample / exampleCaption). Renders nothing for ops the catalog ships no
 * example for (trivial ops). See guide 17-op-catalog-input-output-example-request.
 */
function OpExampleView({ op }: { op: PostProcessingOp }) {
  const hasInput = op.inputExample !== undefined && op.inputExample !== null;
  const hasOutput = op.outputExample !== undefined && op.outputExample !== null;
  if (!hasInput && !hasOutput) return null;
  const fmt = (v: unknown) => {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-gray-600 dark:text-gray-300">Cara kerja: sebelum → sesudah</span>
        <Badge tone="gray">dari engine</Badge>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">Sebelum · input</p>
        <pre className="max-h-40 overflow-auto text-[11px] font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-2 text-gray-700 dark:text-gray-300">
          {hasInput ? fmt(op.inputExample) : "—"}
        </pre>
        <p className="text-center text-gray-400" aria-hidden>▼ menjadi</p>
        <p className="text-[10px] uppercase tracking-wide text-gray-400">Sesudah · output</p>
        <pre className="max-h-40 overflow-auto text-[11px] font-mono bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded-md p-2 text-gray-700 dark:text-gray-300">
          {hasOutput ? fmt(op.outputExample) : "—"}
        </pre>
      </div>
      {op.exampleCaption && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{op.exampleCaption}</p>
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

// ─── RAG evidence (parsed) ───────────────────────────────────────────────────
//
// A ragEvidence entry is usually a compact string the backend logs, e.g.
//   "score=0.70 | channelId=shopify categoryId=clothing sourceFields=name description slug"
// Dumping that as raw JSON tells a reviewer nothing. Parse the `key=value` markers
// (values may contain spaces, like sourceFields) into a map so we can render score /
// channel / category / the fields the mapping was grounded on as readable chips.

function parseEvidence(entry: unknown): { fields: Record<string, string>; raw: string } {
  if (entry && typeof entry === "object") {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      fields[k] = Array.isArray(v) ? v.join(" ") : String(v);
    }
    return { fields, raw: JSON.stringify(entry) };
  }
  const raw = String(entry ?? "");
  const fields: Record<string, string> = {};
  const re = /([A-Za-z][\w.]*)=/g;
  const markers: { key: string; valStart: number; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    markers.push({ key: m[1], valStart: m.index + m[0].length, start: m.index });
  }
  markers.forEach((mk, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].start : raw.length;
    fields[mk.key] = raw.slice(mk.valStart, end).replace(/[|;,]\s*$/, "").trim();
  });
  return { fields, raw };
}

function evidenceScoreTone(score: number): Tone {
  if (score >= 0.7) return "green";
  if (score >= 0.5) return "amber";
  return "red";
}

const EVIDENCE_KNOWN = new Set(["score", "channelId", "categoryId", "sourceFields", "targetFields"]);

type ParsedEvidence = ReturnType<typeof parseEvidence>;

function FieldChips({ label, items, tone }: { label: string; items: string[]; tone: Tone }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-gray-400">{label}</span>
      {items.map((it, i) => (
        <Badge key={i} tone={tone}>{it}</Badge>
      ))}
    </div>
  );
}

function EvidenceCard({ parsed, index }: { parsed: ParsedEvidence; index: number }) {
  const [showFields, setShowFields] = useState(false);
  const { fields, raw } = parsed;
  if (Object.keys(fields).length === 0) {
    return <p className="text-[11px] font-mono text-gray-600 dark:text-gray-300 break-all">{raw}</p>;
  }
  const scoreNum = fields.score != null ? Number(fields.score) : NaN;
  const srcItems = (fields.sourceFields ?? "").split(/\s+/).filter(Boolean);
  const tgtItems = (fields.targetFields ?? "").split(/\s+/).filter(Boolean);
  const others = Object.entries(fields).filter(([k]) => !EVIDENCE_KNOWN.has(k));
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Rujukan #{index + 1}</span>
        {!Number.isNaN(scoreNum) && (
          <Badge tone={evidenceScoreTone(scoreNum)} dot>kemiripan {(scoreNum * 100).toFixed(0)}%</Badge>
        )}
        {fields.channelId && <ChannelBadge channelId={fields.channelId} />}
        {fields.categoryId && <Badge tone="violet">{fields.categoryId}</Badge>}
      </div>
      {srcItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowFields((v) => !v)}
            className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <span className={`transition-transform ${showFields ? "rotate-90" : ""}`}>▸</span>
            {srcItems.length} field dirujuk mapping ini
          </button>
          {showFields && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {srcItems.map((it, i) => (
                <Badge key={i} tone="blue">{it}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
      {tgtItems.length > 0 && <FieldChips label="target fields" items={tgtItems} tone="amber" />}
      {others.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-[11px]">
          <span className="text-gray-400 shrink-0">{k}</span>
          <span className="text-gray-700 dark:text-gray-300 break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: unknown[] }) {
  const parsed = useMemo(() => evidence.map(parseEvidence), [evidence]);
  // Low-diversity hint: if every retrieved reference shares the same channel+category, the agent
  // leaned on one repeated pattern rather than several independent angles — worth flagging.
  const scopeKeys = parsed.map((p) => `${p.fields.channelId ?? ""}/${p.fields.categoryId ?? ""}`);
  const uniform = parsed.length > 1 && new Set(scopeKeys).size === 1;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        Mapping/spec lama paling mirip yang dipakai AI sebagai <strong>contoh</strong> (grounding) — bukti
        usulan berdasar pengetahuan nyata, bukan tebakan. <strong>Kemiripan</strong> = skor relevansi
        (≳60% dianggap relevan). Makin banyak &amp; beragam rujukan, makin tepercaya.
      </p>
      {uniform && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          ⚠ {parsed.length} rujukan seragam (channel &amp; kategori sama) — AI bersandar pada satu pola berulang,
          bukan beberapa sudut pandang berbeda.
        </p>
      )}
      {parsed.map((p, i) => (
        <EvidenceCard key={i} parsed={p} index={i} />
      ))}
      <JsonBlock label="Lihat data mentah" value={evidence} />
    </div>
  );
}

// ─── Proposed fix (JOLT summary) ─────────────────────────────────────────────
//
// proposedFix carries the concrete JOLT change — usually an array of { operation, spec }.
// A "shift" op's spec maps source path → target path; that IS the field-mapping report a
// reviewer wants, so flatten it to source→target rows instead of dumping raw JOLT.

interface JoltOp {
  operation: string;
  spec: unknown;
}

function looksLikeJoltOp(x: unknown): x is JoltOp {
  return !!x && typeof x === "object" && ("operation" in x || "spec" in x);
}

function opsFromArray(arr: unknown[]): JoltOp[] {
  return arr.filter(looksLikeJoltOp).map((o) => ({
    operation: String((o as JoltOp).operation ?? "shift"),
    spec: (o as JoltOp).spec,
  }));
}

function extractJoltOps(proposedFix: unknown): JoltOp[] {
  if (Array.isArray(proposedFix)) return opsFromArray(proposedFix);
  if (proposedFix && typeof proposedFix === "object") {
    const obj = proposedFix as Record<string, unknown>;
    // Prefer well-known containers, then fall back to any array of op-shaped objects.
    for (const key of ["operations", "joltSpec", "spec", "proposedSpec", "newSpec", "transforms"]) {
      if (Array.isArray(obj[key])) {
        const ops = opsFromArray(obj[key] as unknown[]);
        if (ops.length) return ops;
      }
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) {
        const ops = opsFromArray(v);
        if (ops.length) return ops;
      }
    }
    if (looksLikeJoltOp(obj)) return [{ operation: String(obj.operation ?? "shift"), spec: obj.spec }];
  }
  return [];
}

/** Flatten a JOLT shift spec into leaf source→target pairs (source = dotted key path). */
function flattenShift(spec: unknown, prefix = ""): { source: string; target: string }[] {
  const out: { source: string; target: string }[] = [];
  if (spec && typeof spec === "object") {
    for (const [k, v] of Object.entries(spec as Record<string, unknown>)) {
      const src = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out.push({ source: src, target: v });
      else if (v && typeof v === "object") out.push(...flattenShift(v, src));
    }
  }
  return out;
}

const OP_TONE: Record<string, Tone> = { shift: "blue", default: "violet", remove: "red" };

function JoltSummary({ proposedFix }: { proposedFix: unknown }) {
  const ops = useMemo(() => extractJoltOps(proposedFix), [proposedFix]);
  if (ops.length === 0) {
    return <JsonBlock label="proposed fix (raw)" value={proposedFix ?? {}} defaultOpen />;
  }
  return (
    <div className="space-y-3">
      {ops.map((op, i) => {
        const pairs = op.operation.toLowerCase().includes("shift") ? flattenShift(op.spec) : [];
        const keys = op.spec && typeof op.spec === "object" ? Object.keys(op.spec as object) : [];
        return (
          <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
              <Badge tone={OP_TONE[op.operation.toLowerCase()] ?? "gray"}>{op.operation}</Badge>
              <span className="text-[11px] text-gray-400">
                {pairs.length > 0 ? `${pairs.length} field mapping` : `${keys.length} field`}
              </span>
            </div>
            <div className="p-2">
              {pairs.length > 0 ? (
                <div className="space-y-1">
                  {pairs.map((p, j) => (
                    <div key={j} className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-blue-600 dark:text-blue-400 break-all">{p.source}</span>
                      <span className="text-gray-400 shrink-0">→</span>
                      <span className="text-gray-700 dark:text-gray-300 break-all">{p.target}</span>
                    </div>
                  ))}
                </div>
              ) : keys.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {keys.map((k) => (
                    <Badge key={k} tone="gray">{k}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">Tak ada detail field.</p>
              )}
            </div>
          </div>
        );
      })}
      <JsonBlock label="Lihat JOLT mentah" value={proposedFix ?? {}} />
    </div>
  );
}
