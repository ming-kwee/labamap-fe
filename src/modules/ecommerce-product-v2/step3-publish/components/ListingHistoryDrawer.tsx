"use client";
import React, { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
} from "@/shared/ui/icons/Icons";
import { ChannelProductDataService } from "../../step2-channel-fields/services/channelStore.service";
import type {
  PublishHistoryEntry,
  PublishStep,
} from "../../step2-channel-fields/types/channelStore";
import { TONE_PILL, type LifecycleTone } from "../utils/listing-lifecycle";

/**
 * "Riwayat & Status listing" slide-over (§4c). Reads the append-only publish audit for one
 * listing (`GET …/{storeId}/history`) and renders a timeline of attempts — each with its
 * operation, sync status, time, duration and error — expandable to the per-hit `steps[]`
 * (create → media → variants) so seller/ops can see which channel step failed.
 */
export interface ListingHistoryDrawerProps {
  isOpen: boolean;
  masterProductId: string;
  storeId: string;
  storeName: string;
  channelLabel: string;
  onClose: () => void;
}

const OP_TONE: Record<string, LifecycleTone> = {
  CREATE: "brand",
  UPDATE: "success",
  NOOP: "neutral",
  DELIST: "warning",
};

function syncTone(status?: string, success?: boolean): LifecycleTone {
  const s = (status ?? "").toUpperCase();
  if (s === "FAILED") return "error";
  if (s === "BLOCKED") return "warning";
  if (s === "PROCESSING" || s === "PENDING") return "warning";
  if (s === "DRY_RUN") return "neutral";
  if (success || s === "COMPLETED" || s === "PUBLISHED") return "success";
  return "neutral";
}

function Pill({ tone, children }: { tone: LifecycleTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_PILL[tone]}`}>
      {children}
    </span>
  );
}

function fmtDuration(ms?: number): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({ step }: { step: PublishStep }) {
  const tone: LifecycleTone = step.status === "ERROR" ? "error" : step.status === "SKIP" ? "neutral" : "success";
  const dur = fmtDuration(step.durationMs);
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <span className={`mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
        step.status === "ERROR" ? "bg-error-500" : step.status === "SKIP" ? "bg-gray-400" : "bg-success-500"
      }`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {step.stepName}
            {step.iterationIndex != null ? ` #${step.iterationIndex + 1}` : ""}
          </span>
          <Pill tone={tone}>{step.status}</Pill>
          {step.httpStatus != null && (
            <span className="text-gray-400 dark:text-gray-500">HTTP {step.httpStatus}</span>
          )}
          {dur && <span className="text-gray-400 dark:text-gray-500">· {dur}</span>}
        </div>
        {step.errorMessage && (
          <p className="mt-0.5 text-error-600 dark:text-error-400">
            {step.errorCode ? `${step.errorCode}: ` : ""}{step.errorMessage}
          </p>
        )}
      </div>
    </li>
  );
}

function AttemptCard({ entry }: { entry: PublishHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const steps = entry.steps ?? [];
  const opTone = OP_TONE[(entry.operation ?? "").toUpperCase()] ?? "neutral";
  const sTone = syncTone(entry.syncStatus, entry.success);
  const dur = fmtDuration(entry.durationMs);
  const when = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";

  return (
    <li className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.operation && <Pill tone={opTone}>{entry.operation}</Pill>}
          <Pill tone={sTone}>{entry.syncStatus ?? (entry.success ? "COMPLETED" : "FAILED")}</Pill>
          {entry.dryRun && <Pill tone="neutral">DRY RUN</Pill>}
        </div>
        {entry.success ? (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-error-500" />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {when}
        </span>
        {dur && <span>· {dur}</span>}
        {entry.channelProductId && (
          <span className="font-mono text-gray-400 dark:text-gray-500">id {entry.channelProductId}</span>
        )}
      </div>

      {entry.errorMessage && (
        <p className="mt-2 rounded-lg bg-error-50 dark:bg-error-500/10 px-2.5 py-1.5 text-xs text-error-700 dark:text-error-400">
          {entry.errorCode ? `${entry.errorCode}: ` : ""}{entry.errorMessage}
        </p>
      )}

      {steps.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {steps.length} langkah
          </button>
          {expanded && (
            <ul className="mt-1 border-l border-gray-200 dark:border-gray-700 pl-3">
              {steps.map((s, i) => <StepRow key={`${s.stepName}-${i}`} step={s} />)}
            </ul>
          )}
        </div>
      )}

      {entry.syncWorkflowId && (
        <p className="mt-2 truncate font-mono text-[11px] text-gray-400 dark:text-gray-500" title={entry.syncWorkflowId}>
          workflow: {entry.syncWorkflowId}
        </p>
      )}
    </li>
  );
}

export default function ListingHistoryDrawer({
  isOpen,
  masterProductId,
  storeId,
  storeName,
  channelLabel,
  onClose,
}: ListingHistoryDrawerProps) {
  const [entries, setEntries] = useState<PublishHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ChannelProductDataService.getPublishHistory(masterProductId, storeId);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat");
    } finally {
      setLoading(false);
    }
  }, [masterProductId, storeId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-99999 flex justify-end">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white dark:bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Riwayat &amp; Status</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {channelLabel} · {storeName}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={load}
              title="Muat ulang"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Tutup
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-500" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-error-200 dark:border-error-500/30 bg-error-50 dark:bg-error-500/10 px-4 py-3">
              <p className="text-sm font-medium text-error-700 dark:text-error-400">{error}</p>
              <button onClick={load} className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                Coba lagi
              </button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="py-16 text-center">
              <Clock className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada riwayat publish untuk listing ini.</p>
            </div>
          )}

          {entries.length > 0 && (
            <ul className="space-y-3">
              {entries.map((e, i) => <AttemptCard key={e.id ?? e.publishId ?? i} entry={e} />)}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
