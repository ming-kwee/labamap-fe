"use client";

/**
 * P1-E · Agent Sessions / Observability.
 *
 * "Did the agent actually use RAG, or guess?" Shows each session's ragContext
 * (grounding proof), agentSteps (tool-call trace), token cost, duration, and a
 * classified reason for FAILED sessions (quota / config / key).
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P1-E
 *
 * ⚠ The list endpoint REQUIRES channelId — so a channel must be picked first.
 * Session detail does NOT require channelId (so ?sessionId= deep links work).
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { PageResponse } from "../../types/common";
import { AiAgentSession, ApplyOutcome } from "../../types/session";
import { AiAdminService } from "../../services/aiAdmin.service";
import { ActivityIcon, ClockIcon, RefreshIcon, TerminalIcon, XIcon, ZapIcon } from "../shared/icons";
import {
  Badge,
  Card,
  ChannelBadge,
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

function fmtDuration(ms?: number | null): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
function fmtTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
const statusTone = (s: string): Tone => (s === "COMPLETED" ? "green" : s === "FAILED" ? "red" : s === "RUNNING" ? "amber" : "gray");

// Audit: how the agent's JOLT-spec write resolved (backend commit 2d09e96).
// SKIPPED_PROTECTED is highlighted amber — a human-owned spec was left untouched.
const APPLY_OUTCOME_META: Record<ApplyOutcome, { tone: Tone; label: string; title: string }> = {
  AUTO_APPLIED: { tone: "green", label: "Auto-applied", title: "Agent menulis JOLT spec dan langsung menerapkannya." },
  SKIPPED_PROTECTED: { tone: "amber", label: "Skipped — locked", title: "Spec sudah di-approve/dikonfigurasi manusia — auto-apply dilewati agar tidak menimpa." },
  RECOMMENDATION_CREATED: { tone: "blue", label: "Recommendation", title: "Agent membuat rekomendasi — menunggu review manusia." },
  MANUAL_REVIEW_REQUIRED: { tone: "amber", label: "Manual review", title: "Confidence rendah — perlu keputusan manual." },
};

function ApplyOutcomeBadge({ outcome }: { outcome?: ApplyOutcome | null }) {
  if (!outcome) return <span className="text-xs text-gray-400">—</span>;
  const meta = APPLY_OUTCOME_META[outcome] ?? { tone: "gray" as Tone, label: outcome, title: outcome };
  return <span title={meta.title}><Badge tone={meta.tone} dot>{meta.label}</Badge></span>;
}

export default function AgentSessionsPage() {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("sessionId");

  const [channelId, setChannelId] = useState<string>("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<AiAgentSession> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<AiAgentSession | null>(null);

  const load = useCallback(async (ch: string, p: number) => {
    if (!ch) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await AiAdminService.listSessions({ channelId: ch, page: p, size: 20 }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(channelId, page);
  }, [load, channelId, page]);

  // Deep link from P0-D drawer: open the session directly (no channel needed).
  useEffect(() => {
    if (!deepLinkId) return;
    AiAdminService.getSession(deepLinkId)
      .then((s) => setSelected(s))
      .catch(() => {});
  }, [deepLinkId]);

  const rows = data?.content ?? [];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<TerminalIcon size={20} />}
        title="Agent Sessions"
        subtitle="Observability penalaran agent — grounding, tool-calls, biaya, penyebab gagal."
        right={
          <button
            onClick={() => load(channelId, page)}
            disabled={loading || !channelId}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            {loading ? <Spinner size={14} /> : <RefreshIcon size={14} />}
          </button>
        }
      />

      {/* Channel selector (required) */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">Channel <span className="text-red-500">*</span>:</span>
          <select
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              setPage(0);
            }}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">Pilih channel…</option>
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABELS[c] ?? c}</option>
            ))}
          </select>
          <span className="text-[11px] text-gray-400">Sesi di-index per channel — pilih channel untuk melihat daftar.</span>
        </div>
      </Card>

      {error ? (
        <ErrorNotice error={error} onRetry={() => load(channelId, page)} />
      ) : !channelId ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><TerminalIcon size={22} /></div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pilih channel</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            Endpoint sessions membutuhkan channelId. Pilih channel di atas untuk melihat riwayat sesi agent.
          </p>
        </div>
      ) : loading && !data ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          Belum ada sesi agent untuk {CHANNEL_LABELS[channelId] ?? channelId}.
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 text-left">
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Trigger</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Category</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Apply</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Grounding</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Duration</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tokens</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">When</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <SessionRow key={s.id} session={s} onOpen={() => setSelected(s)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.totalElements > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{data.totalElements} sesi · halaman {data.page + 1}/{Math.max(1, data.totalPages)}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">← Prev</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={!data.hasNext}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Next →</button>
          </div>
        </div>
      )}

      {selected && <SessionDetail session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SessionRow({ session, onOpen }: { session: AiAgentSession; onOpen: () => void }) {
  const rag = session.ragContext;
  const grounded = rag != null && ((rag.retrievedFieldMappings ?? 0) > 0 || (rag.retrievedJoltSpecs ?? 0) > 0);
  return (
    <tr onClick={onOpen} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer transition-colors">
      <td className="px-3 py-3"><span className="text-xs font-mono text-gray-700 dark:text-gray-300">{session.triggerType}</span></td>
      <td className="px-3 py-3"><span className="text-xs text-gray-500 dark:text-gray-400">{session.categoryId || "—"}</span></td>
      <td className="px-3 py-3"><Badge tone={statusTone(session.status)} dot>{session.status}</Badge></td>
      <td className="px-3 py-3"><ApplyOutcomeBadge outcome={session.applyOutcome} /></td>
      <td className="px-3 py-3">
        {rag == null ? (
          <span className="text-xs text-gray-400" title="tidak ada ragContext (gagal sebelum retrieval)">—</span>
        ) : (
          <Badge tone={grounded ? "green" : "amber"}>
            {(rag.retrievedJoltSpecs ?? 0)}j · {(rag.retrievedFieldMappings ?? 0)}m
          </Badge>
        )}
      </td>
      <td className="px-3 py-3"><span className="text-xs text-gray-600 dark:text-gray-300">{fmtDuration(session.durationMs)}</span></td>
      <td className="px-3 py-3"><span className="text-xs text-gray-600 dark:text-gray-300">{session.totalTokensUsed?.toLocaleString() ?? "—"}</span></td>
      <td className="px-3 py-3"><span className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(session.createdAt)}</span></td>
      <td className="px-3 py-3 text-right"><span className="text-xs text-blue-500 hover:underline">Detail →</span></td>
    </tr>
  );
}

function SessionDetail({ session, onClose }: { session: AiAgentSession; onClose: () => void }) {
  const rag = session.ragContext;
  const grounded = rag != null && ((rag.retrievedFieldMappings ?? 0) > 0 || (rag.retrievedJoltSpecs ?? 0) > 0);
  const failed = session.status === "FAILED";
  const errClass = failed ? classifyLlmError(session.errorMessage) : null;

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <Badge tone={statusTone(session.status)} dot>{session.status}</Badge>
            <ApplyOutcomeBadge outcome={session.applyOutcome} />
            <ChannelBadge channelId={session.channelId} />
            <span className="text-xs font-mono text-gray-400 truncate">{session.triggerType}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><XIcon size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* FAILED → classified error banner */}
          {failed && errClass && (
            <InfoBanner tone={errClass.tone === "green" ? "blue" : errClass.tone === "amber" ? "amber" : "red"}>
              <p className="font-semibold">{errClass.label}</p>
              <p>{errClass.hint}</p>
              {session.errorMessage && <p className="font-mono text-[11px] mt-1 opacity-80">{session.errorMessage}</p>}
            </InfoBanner>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <MetricTile icon={<ActivityIcon size={14} />} label="Grounding" value={rag == null ? "—" : `${rag.retrievedJoltSpecs ?? 0}j / ${rag.retrievedFieldMappings ?? 0}m`} tone={rag == null ? "gray" : grounded ? "green" : "amber"} />
            <MetricTile icon={<ClockIcon size={14} />} label="Duration" value={fmtDuration(session.durationMs)} tone="gray" />
            <MetricTile icon={<ZapIcon size={14} />} label="Tokens" value={session.totalTokensUsed?.toLocaleString() ?? "—"} tone="gray" />
          </div>

          {/* RAG context — grounding proof */}
          <SectionCard title="RAG Context" subtitle="bukti grounding (retrieval)">
            {rag == null ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tidak ada ragContext — sesi gagal sebelum tahap retrieval (mis. kuota LLM habis saat inisiasi). Bukan
                indikasi RAG kosong.
              </p>
            ) : (
              <div className="space-y-2">
                <KeyValue label="JOLT specs diambil" value={`${rag.retrievedJoltSpecs ?? 0}`} />
                <KeyValue label="Field mappings diambil" value={`${rag.retrievedFieldMappings ?? 0}`} />
                <KeyValue label="Top similarity" value={rag.topSimilarityScore != null ? rag.topSimilarityScore.toFixed(3) : "—"} mono />
                <p className={`text-xs ${grounded ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {grounded ? "✓ Agent grounded ke RAG (memakai pengetahuan terbukti)." : "⚠ Tidak ada dokumen diambil — agent mungkin menebak."}
                </p>
              </div>
            )}
          </SectionCard>

          {/* Agent steps */}
          <SectionCard title="Agent Steps" subtitle="urutan tool-call">
            {session.agentSteps && session.agentSteps.length > 0 ? (
              <JsonViewer label={`${session.agentSteps.length} step`} value={session.agentSteps} defaultOpen />
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">Tidak ada langkah tercatat (sesi gagal sebelum tool-loop).</p>
            )}
          </SectionCard>

          {/* Summary */}
          {session.summary != null && (
            <SectionCard title="Summary" subtitle="ringkasan hasil">
              <JsonViewer label="summary" value={session.summary} defaultOpen />
            </SectionCard>
          )}

          {/* AI Mapping Enrichment link (addendum §8.3): a COMPLETED session may have created field mappings */}
          {session.status === "COMPLETED" && session.channelId && (
            <Link
              href={`/platform-admin/channel-field-mappings?channelId=${session.channelId}&origin=ai`}
              className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-3 py-2.5 text-xs text-violet-800 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
            >
              <span>🤖 Sesi sukses bisa menulis field mapping baru (AI Mapping Enrichment) — lihat mapping buatan AI di channel ini</span>
              <span className="shrink-0 font-medium">→</span>
            </Link>
          )}

          <div className="text-[11px] text-gray-400 space-y-1">
            <KeyValue label="Session ID" value={session.id} mono labelWidth="w-24" />
            <KeyValue label="Created" value={fmtTime(session.createdAt)} labelWidth="w-24" />
            <KeyValue label="Completed" value={fmtTime(session.completedAt)} labelWidth="w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: Tone }) {
  const color: Record<Tone, string> = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    gray: "text-gray-800 dark:text-white",
    violet: "text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">{icon}<span className="text-[11px]">{label}</span></div>
      <p className={`text-lg font-bold ${color[tone]}`}>{value}</p>
    </Card>
  );
}
