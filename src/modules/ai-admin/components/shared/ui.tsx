"use client";

/**
 * Shared UI primitives for the AI Admin Console.
 * Tailwind + dark mode, matching the existing platform-admin visual language.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AiApiError } from "../../types/common";
import { AlertIcon, InfoIcon, RefreshIcon, XIcon } from "./icons";

// ─── Channel labels + colors (self-contained; mirrors platform-admin) ────────

export const CHANNEL_LABELS: Record<string, string> = {
  amazon: "Amazon",
  ebay: "eBay",
  walmart: "Walmart",
  shopify: "Shopify",
  wix: "Wix",
  tiktok: "TikTok Shop",
  lazada: "Lazada",
  tokopedia: "Tokopedia",
  facebook: "Facebook",
  shopee: "Shopee",
  woocommerce: "WooCommerce",
  etsy: "Etsy",
  all: "All channels",
};

const CHANNEL_COLORS: Record<string, string> = {
  amazon: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ebay: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  walmart: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  shopify: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  wix: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tiktok: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  lazada: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  facebook: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shopee: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

export const CHANNEL_OPTIONS = [
  "shopify", "wix", "tiktok", "amazon", "ebay",
  "lazada", "tokopedia", "shopee", "woocommerce", "facebook",
];

export function ChannelBadge({ channelId }: { channelId: string }) {
  if (!channelId || channelId === "null") {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const color =
    CHANNEL_COLORS[channelId] ??
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>
      {CHANNEL_LABELS[channelId] ?? channelId}
    </span>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

export type Tone = "green" | "amber" | "red" | "blue" | "gray" | "violet";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

export function Badge({
  tone = "gray",
  children,
  dot,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
}) {
  const dotColor: Record<Tone, string> = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    gray: "bg-gray-400",
    violet: "bg-violet-500",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor[tone]}`} />}
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  icon,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

// ─── Stat tile ───────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  tone = "gray",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  const color: Record<Tone, string> = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    gray: "text-gray-800 dark:text-white",
    violet: "text-violet-600 dark:text-violet-400",
  };
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color[tone]}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin text-current"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Relative time ("diperbarui X detik lalu") ──────────────────────────────

export function useRelativeTime(iso?: string): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diff < 5) return "baru saja";
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  return `${Math.floor(diff / 3600)} jam lalu`;
}

// ─── Score bar (search heatmap) ─────────────────────────────────────────────

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score));
  // Band hints from doc P0-C: relevant ~0.6–0.66, noise ~0.44.
  const color =
    score >= 0.6
      ? "bg-green-500"
      : score >= 0.5
        ? "bg-amber-500"
        : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs w-12 text-right text-gray-700 dark:text-gray-300">
        {score.toFixed(3)}
      </span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

export type ToastState = { message: string; type: "success" | "error" | "info" } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const show = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  }, []);
  return { toast, show };
}

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;
  const bg =
    toast.type === "success" ? "bg-green-600" : toast.type === "error" ? "bg-red-600" : "bg-gray-800";
  return (
    <div className={`fixed top-4 right-4 z-[10000] max-w-md px-4 py-3 rounded-lg shadow-lg text-sm text-white ${bg}`}>
      {toast.message}
    </div>
  );
}

// ─── Error notice (classified → actionable) ─────────────────────────────────

export function ErrorNotice({
  error,
  onRetry,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const msg =
    error instanceof AiApiError ? error.friendly : (error as Error)?.message ?? String(error);
  return (
    <div
      className={`flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <span className="text-red-500 shrink-0 mt-0.5">
        <AlertIcon size={compact ? 14 : 16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-red-700 dark:text-red-400 break-words">{msg}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 hover:underline"
          >
            <RefreshIcon size={12} /> Coba lagi
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Info banner ─────────────────────────────────────────────────────────────

export function InfoBanner({
  tone = "blue",
  children,
}: {
  tone?: "blue" | "amber" | "red" | "violet";
  children: React.ReactNode;
}) {
  const styles = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-blue-500",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-amber-500",
    red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-red-500",
    violet: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-300 text-violet-500",
  }[tone].split(" ");
  const iconColor = styles.pop()!;
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border rounded-lg ${styles.join(" ")}`}>
      <span className={`shrink-0 mt-0.5 ${iconColor}`}>
        {tone === "blue" || tone === "violet" ? <InfoIcon size={15} /> : <AlertIcon size={15} />}
      </span>
      <div className="text-xs space-y-1">{children}</div>
    </div>
  );
}

// ─── Confirm dialog (destructive actions) ───────────────────────────────────

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XIcon size={16} />
          </button>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-5">{body}</div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            data-testid="confirm-ok"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 inline-flex items-center gap-2 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy && <Spinner size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Key/value row ───────────────────────────────────────────────────────────

export function KeyValue({
  label,
  value,
  mono,
  labelWidth = "w-40",
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  labelWidth?: string;
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className={`text-gray-400 shrink-0 ${labelWidth}`}>{label}</span>
      <span className={`text-gray-700 dark:text-gray-300 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Collapsible JSON viewer ─────────────────────────────────────────────────

export function JsonViewer({
  label,
  value,
  defaultOpen,
  maxHeight = "max-h-72",
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
  maxHeight?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const json = useMemo(() => {
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
        <pre className={`mt-2 ${maxHeight} overflow-auto text-[11px] font-mono bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-700 dark:text-gray-300`}>
          {json}
        </pre>
      )}
    </div>
  );
}

// ─── LLM error classifier (shared by sessions + generate console) ────────────

export function classifyLlmError(message?: string | null): { tone: Tone; label: string; hint: string } {
  const m = (message ?? "").toLowerCase();
  if (m.includes("retries exhausted") || m.includes("429") || m.includes("quota") || m.includes("resource_exhausted")) {
    return { tone: "amber", label: "Kuota LLM habis", hint: "Rate-limit / kuota provider terlampaui — coba lagi nanti atau ganti provider (mis. Anthropic)." };
  }
  if (m.includes("400") || m.includes("invalid") || m.includes("config")) {
    return { tone: "red", label: "Konfigurasi", hint: "Kemungkinan model/parameter salah — cek Config Panel (P1-L)." };
  }
  if (m.includes("key") && (m.includes("blank") || m.includes("missing") || m.includes("not set"))) {
    return { tone: "red", label: "API key belum di-set", hint: "Set LLM API key + restart backend." };
  }
  return { tone: "gray", label: "Error", hint: message || "Penyebab tidak diketahui — lihat log backend." };
}

// ─── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-violet-600 dark:text-violet-400 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
