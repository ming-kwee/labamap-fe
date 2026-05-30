"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { ChannelSyncService } from "../_services/channel-sync.service";
import type {
  ChannelSyncSummary,
  ChannelSyncProduct,
  ChannelSyncProductPage,
  ChannelSyncStatus,
} from "../_types/channel-sync";

const BASE_API = "http://localhost:8888/labamap/api/v1";

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", woocommerce: "🟣", amazon: "📦", tiktok: "🎵",
  tiktokshop: "🎵", ebay: "🔨", etsy: "🎨", lazada: "🛒",
  tokopedia: "🟢", facebook: "📘", shopee: "🧡", walmart: "🔵", wix: "⬛",
};

const PAGE_SIZE = 10;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function statusConfig(s: ChannelSyncStatus) {
  switch (s) {
    case "SYNCED":  return { dot: "bg-success-500",  label: "Synced",   text: "text-success-700 dark:text-success-400",  bg: "bg-success-50 dark:bg-success-500/15"  };
    case "WARNING": return { dot: "bg-warning-500",  label: "Warning",  text: "text-warning-700 dark:text-warning-400",  bg: "bg-warning-50 dark:bg-warning-500/15"  };
    case "FAILED":  return { dot: "bg-error-500",    label: "Failed",   text: "text-error-700 dark:text-error-400",      bg: "bg-error-50 dark:bg-error-500/15"      };
    case "SYNCING": return { dot: "bg-brand-500 animate-pulse", label: "Syncing", text: "text-brand-700 dark:text-brand-400", bg: "bg-brand-50 dark:bg-brand-500/15" };
    default:        return { dot: "bg-gray-400",     label: "Draft",    text: "text-gray-500 dark:text-gray-400",        bg: "bg-gray-100 dark:bg-gray-800"          };
  }
}

function healthColor(h: number) {
  if (h >= 90) return "bg-success-500";
  if (h >= 70) return "bg-warning-500";
  return "bg-error-500";
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={spinning ? "animate-spin" : ""}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);
const WrenchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

// ─── Summary view — store health cards ───────────────────────────────────────

function StoreCard({
  summary,
  orgId,
  onSyncAll,
}: {
  summary: ChannelSyncSummary;
  orgId: string;
  onSyncAll: (storeId: string) => Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const emoji = CHANNEL_EMOJI[summary.channelType.toLowerCase()] ?? "🔗";
  const hColor = healthColor(summary.health);

  async function handleSyncAll() {
    setSyncing(true);
    try { await onSyncAll(summary.storeId); } finally { setSyncing(false); }
  }

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{summary.storeName}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{summary.totalProducts} products</p>
          </div>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshIcon spinning={syncing} />
          {syncing ? "Syncing…" : "Sync all"}
        </button>
      </div>

      {/* Health bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Health</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{summary.health}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${hColor}`} style={{ width: `${summary.health}%` }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          { count: summary.synced,   label: "synced",   cls: "text-success-600 dark:text-success-400" },
          { count: summary.warnings, label: "warning",  cls: "text-warning-600 dark:text-warning-400" },
          { count: summary.failed,   label: "failed",   cls: "text-error-600 dark:text-error-400"     },
          { count: summary.draft,    label: "draft",    cls: "text-gray-400 dark:text-gray-500"       },
        ].map(({ count, label, cls }) => (
          <div key={label} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 py-1.5">
            <p className={`text-sm font-bold tabular-nums ${cls}`}>{count}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Top errors inline */}
      {summary.topErrors.length > 0 && (
        <div className="space-y-2">
          {summary.topErrors.map((err) => (
            <div key={err.masterProductId} className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-error-50 dark:bg-error-500/10 border border-error-100 dark:border-error-500/20">
              <div className="min-w-0">
                <p className="text-xs font-medium text-error-700 dark:text-error-400 truncate">{err.productName}</p>
                <p className="text-xs text-error-600 dark:text-error-300 mt-0.5 line-clamp-1">{err.errorMessage}</p>
              </div>
              <Link
                href={`/products/${err.masterProductId}/channel-fields`}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-error-500 hover:bg-error-600 text-white flex-shrink-0 transition-colors"
              >
                <WrenchIcon /> Fix
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* View all products link */}
      <Link
        href={`/channels/products?store=${encodeURIComponent(summary.storeId)}`}
        className="block text-center text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
      >
        View all products →
      </Link>
    </div>
  );
}

// ─── Per-store product table ──────────────────────────────────────────────────

function ProductRow({ product, onResync }: {
  product: ChannelSyncProduct;
  onResync: (masterProductId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sc = statusConfig(product.syncStatus);

  async function handleResync() {
    setSyncing(true);
    try { await onResync(product.masterProductId); } finally { setSyncing(false); }
  }

  return (
    <>
      <tr
        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.productName}</p>
              {product.masterSku && (
                <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{product.masterSku}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          {product.channelPrice != null
            ? product.channelPrice.toLocaleString()
            : <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">
          {product.channelSku ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
            {sc.label}
          </span>
          {product.lastSyncedAt && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatRelative(product.lastSyncedAt)}</p>
          )}
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            {product.syncStatus === "FAILED" ? (
              <Link
                href={`/products/${product.masterProductId}/channel-fields`}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-error-500 hover:bg-error-600 text-white transition-colors"
              >
                <WrenchIcon /> Fix field
              </Link>
            ) : (
              <Link
                href={`/products/${product.masterProductId}`}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                View
              </Link>
            )}
            <button
              onClick={handleResync}
              disabled={syncing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <RefreshIcon spinning={syncing} />
            </button>
          </div>
        </td>
      </tr>
      {/* Inline error expansion */}
      {open && product.errorMessage && (
        <tr className="bg-error-50 dark:bg-error-500/5 border-b border-error-100 dark:border-error-500/20">
          <td colSpan={5} className="px-4 py-2">
            <p className="text-xs text-error-700 dark:text-error-400">{product.errorMessage}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChannelSyncDashboard() {
  const router   = useRouter();
  const params   = useSearchParams();
  const storeId  = params.get("store");

  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  // ── Summary state ──────────────────────────────────────────────────────────
  const [summaries, setSummaries]     = useState<ChannelSyncSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh]       = useState<Date | null>(null);

  // ── Per-store state ────────────────────────────────────────────────────────
  const [productPage, setProductPage]   = useState<ChannelSyncProductPage | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError]     = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChannelSyncStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery]   = useState("");
  const [page, setPage]                 = useState(0);
  const activeStore = summaries.find(s => s.storeId === storeId);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Load summary ───────────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!orgId) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await ChannelSyncService.getSummary(orgId);
      setSummaries(data);
      setLastRefresh(new Date());
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to load sync summary");
    } finally {
      setSummaryLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Load per-store products ────────────────────────────────────────────────
  const loadStoreProducts = useCallback(async () => {
    if (!orgId || !storeId) return;
    setStoreLoading(true);
    setStoreError(null);
    try {
      const data = await ChannelSyncService.getProductsForStore({
        organizationId: orgId,
        storeId,
        status: statusFilter,
        q: searchQuery,
        page,
        size: PAGE_SIZE,
      });
      setProductPage(data);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setStoreLoading(false);
    }
  }, [orgId, storeId, statusFilter, searchQuery, page]);

  useEffect(() => {
    if (storeId) loadStoreProducts();
  }, [storeId, loadStoreProducts]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [statusFilter, searchQuery, storeId]);

  // ── Re-sync helpers ────────────────────────────────────────────────────────
  async function syncProduct(masterProductId: string, sid: string) {
    const res = await fetch(`${BASE_API}/channels/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterProductId, storeId: sid, organizationId: orgId }),
    });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  }

  async function handleResyncProduct(masterProductId: string) {
    try {
      await syncProduct(masterProductId, storeId!);
      setToast({ msg: "Re-sync triggered", ok: true });
      setTimeout(loadStoreProducts, 2000);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Sync failed", ok: false });
    }
  }

  async function handleSyncAll(sid: string) {
    try {
      const products = productPage?.content ?? [];
      await Promise.allSettled(products.map(p => syncProduct(p.masterProductId, sid)));
      setToast({ msg: "Sync triggered for all products", ok: true });
      setTimeout(() => { loadSummary(); if (storeId) loadStoreProducts(); }, 2000);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Sync failed", ok: false });
    }
  }

  // ── Render: summary overview ───────────────────────────────────────────────
  function renderSummary() {
    const totalSynced  = summaries.reduce((a, s) => a + s.synced,   0);
    const totalFailed  = summaries.reduce((a, s) => a + s.failed,   0);
    const totalWarning = summaries.reduce((a, s) => a + s.warnings, 0);
    const totalDraft   = summaries.reduce((a, s) => a + s.draft,    0);

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel Sync</h1>
            {lastRefresh && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                Last refresh: {formatRelative(lastRefresh.toISOString())}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {summaries.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    await Promise.allSettled(summaries.map(s => handleSyncAll(s.storeId)));
                  } catch { /**/ }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                <RefreshIcon /> Sync All Stores
              </button>
            )}
            <button
              onClick={loadSummary}
              disabled={summaryLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <RefreshIcon spinning={summaryLoading} />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        {summaries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { v: totalSynced,  l: "Synced",  cls: "text-success-600 dark:text-success-400" },
              { v: totalWarning, l: "Warnings", cls: "text-warning-600 dark:text-warning-400" },
              { v: totalFailed,  l: "Failed",  cls: "text-error-600 dark:text-error-400"     },
              { v: totalDraft,   l: "Draft",   cls: "text-gray-500 dark:text-gray-400"       },
            ].map(({ v, l, cls }) => (
              <div key={l} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3">
                <p className={`text-2xl font-bold tabular-nums ${cls}`}>{v}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        )}

        {/* Store cards */}
        {summaryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 animate-pulse space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800" />
                  <div className="h-4 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800" />
                <div className="grid grid-cols-4 gap-1">
                  {[0,1,2,3].map(j => <div key={j} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-800" />)}
                </div>
              </div>
            ))}
          </div>
        ) : summaryError ? (
          <div className="rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-5 py-4">
            <p className="text-sm font-medium text-error-700 dark:text-error-400">Failed to load sync summary</p>
            <p className="text-sm text-error-600 dark:text-error-300 mt-1">{summaryError}</p>
            <button onClick={loadSummary} className="mt-3 text-sm text-error-600 dark:text-error-400 underline">Retry</button>
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
            <p className="text-3xl mb-3">🔌</p>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">No stores connected yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">Connect stores in Channel Stores to start syncing.</p>
            <Link href="/channels/stores" className="inline-block px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
              Go to Channel Stores
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {summaries.map(s => (
              <StoreCard key={s.storeId} summary={s} orgId={orgId} onSyncAll={handleSyncAll} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: per-store product table ───────────────────────────────────────
  function renderStoreTable() {
    const emoji = activeStore ? (CHANNEL_EMOJI[activeStore.channelType.toLowerCase()] ?? "🔗") : "🔗";
    const storeName = activeStore?.storeName ?? storeId ?? "";

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 mb-1">
              <button onClick={() => router.push("/channels/products")} className="hover:text-brand-500 transition-colors flex items-center gap-1">
                <ChevronLeftIcon /> Channel Sync
              </button>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>{emoji}</span> {storeName}
            </h1>
            {activeStore && (
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                <span className="text-success-600 dark:text-success-400">● {activeStore.synced} synced</span>
                {activeStore.warnings > 0 && <span className="text-warning-600 dark:text-warning-400">⚠ {activeStore.warnings} warning</span>}
                {activeStore.failed > 0 && <span className="text-error-600 dark:text-error-400">✗ {activeStore.failed} failed</span>}
                {activeStore.draft > 0 && <span>◌ {activeStore.draft} draft</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSyncAll(storeId!)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
            >
              <RefreshIcon /> Sync all
            </button>
            <button
              onClick={loadStoreProducts}
              disabled={storeLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <RefreshIcon spinning={storeLoading} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products…"
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ChannelSyncStatus | "ALL")}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="ALL">All statuses</option>
            <option value="SYNCED">Synced</option>
            <option value="WARNING">Warning</option>
            <option value="FAILED">Failed</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>

        {/* Table */}
        {storeError ? (
          <div className="rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-5 py-4">
            <p className="text-sm text-error-700 dark:text-error-400">{storeError}</p>
            <button onClick={loadStoreProducts} className="mt-2 text-sm underline text-error-600">Retry</button>
          </div>
        ) : (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
            {storeLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
              </div>
            ) : !productPage || productPage.content.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-gray-400 dark:text-gray-500 text-sm">No products found</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      {["Product", "Channel Price", "Channel SKU", "Status", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productPage.content.map(p => (
                      <ProductRow key={p.masterProductId} product={p} onResync={handleResyncProduct} />
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {productPage.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {productPage.totalElements} products · page {page + 1} of {productPage.totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(productPage.totalPages - 1, p + 1))}
                        disabled={page >= productPage.totalPages - 1}
                        className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Root render ────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-success-500 text-white" : "bg-error-500 text-white"
        }`}>
          {toast.msg}
        </div>
      )}
      {storeId ? renderStoreTable() : renderSummary()}
    </div>
  );
}
