"use client";

import React, { useState } from "react";
import {
  ChannelApiContract,
  LifecycleAction,
} from "../_types/channel-api-contract";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

// ─── Per-action copy ─────────────────────────────────────────────────────────
// Honest wording (docs §2 R2): until Phase 3 (per-store pin) ships, these transitions
// DON'T change which contract publish uses — the resolver still reads config.apiVersion.
// So this is for PREPARING / ARCHIVING versions, not live rollback.

interface ActionCopy {
  title: string;
  target: string;
  /** Primary consequence line, may be undefined for the plain case. */
  consequence?: string;
  tone: "brand" | "warning" | "error";
  confirmLabel: string;
}

function copyFor(action: LifecycleAction): ActionCopy {
  switch (action) {
    case "promote":
      return {
        title: "Promote ke ACTIVE",
        target: "ACTIVE",
        consequence:
          "Versi ACTIVE lain pada channel yang sama akan otomatis di-DEPRECATED (hanya boleh satu ACTIVE per channel).",
        tone: "brand",
        confirmLabel: "Promote",
      };
    case "deprecate":
      return {
        title: "Deprecate versi ini",
        target: "DEPRECATED",
        consequence:
          "Versi ditandai usang. Masih bisa di-rollback ke ACTIVE nanti (DEPRECATED → ACTIVE).",
        tone: "warning",
        confirmLabel: "Deprecate",
      };
    case "retire":
      return {
        title: "Retire versi ini",
        target: "RETIRED",
        consequence:
          "RETIRED bersifat terminal — tidak ada transisi keluar. Versi tidak bisa diaktifkan kembali.",
        tone: "error",
        confirmLabel: "Retire",
      };
  }
}

const TONE: Record<ActionCopy["tone"], { btn: string; ring: string; band: string }> = {
  brand: {
    btn:  "bg-brand-500 hover:bg-brand-600 text-white",
    ring: "text-brand-600 dark:text-brand-400",
    band: "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/30 text-brand-800 dark:text-brand-300",
  },
  warning: {
    btn:  "bg-amber-500 hover:bg-amber-600 text-white",
    ring: "text-amber-600 dark:text-amber-400",
    band: "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30 text-warning-800 dark:text-warning-300",
  },
  error: {
    btn:  "bg-red-600 hover:bg-red-700 text-white",
    ring: "text-red-600 dark:text-red-400",
    band: "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/30 text-error-800 dark:text-error-300",
  },
};

export default function ConfirmTransitionModal({
  contract,
  action,
  onConfirm,
  onClose,
}: {
  contract: ChannelApiContract;
  action: LifecycleAction;
  /** Resolves after the transition completes (or throws — caller surfaces the error). */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const copy = copyFor(action);
  const tone = TONE[copy.tone];
  const channelLabel = CHANNEL_TYPE_LABELS[contract.channelId] ?? contract.channelId;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The caller already surfaced the error (toast). Keep the modal open for retry/cancel.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className={`text-base font-semibold ${tone.ring}`}>{copy.title}</h2>

        <div className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">{channelLabel}</span>
          <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs">
            {contract.apiVersion}
          </code>
          <span className="text-gray-400">·</span>
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{contract.status}</span>
          <span className="text-gray-400">→</span>
          <span className={`font-mono text-xs font-semibold ${tone.ring}`}>{copy.target}</span>
        </div>

        {copy.consequence && (
          <div className={`mt-4 px-3 py-2.5 rounded-lg border text-xs ${tone.band}`}>
            {copy.consequence}
          </div>
        )}

        {/* Honest Phase-3 caveat — this does NOT change which contract publish uses yet. */}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Catatan: transisi ini belum mengubah versi yang dipakai publish (resolver masih memakai{" "}
          <code className="font-mono">config.apiVersion</code> sampai Fase 3 pin per-store). Gunanya untuk{" "}
          <strong>menyiapkan / mengarsipkan</strong> versi, bukan rollback-live.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-60 ${tone.btn}`}
          >
            {submitting ? "Memproses…" : `${copy.confirmLabel} → ${copy.target}`}
          </button>
        </div>
      </div>
    </div>
  );
}
