"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MasterProductService } from "../_services/master-product.service";
import type { MasterProductDetail, ChannelDistributionCard, ChannelSyncStatus } from "../_types/master-product";

const BASE_API = "http://localhost:8888/labamap/api/v1";

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", woocommerce: "🟣", amazon: "📦", tiktok: "🎵",
  ebay: "🔨", etsy: "🎨", lazada: "🛒", tokopedia: "🟢",
  facebook: "📘", shopee: "🧡", walmart: "🔵", wix: "⬛",
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusConfig(status: ChannelSyncStatus) {
  switch (status) {
    case "SYNCED":  return { dot: "bg-success-500",  text: "text-success-700 dark:text-success-400",  bg: "bg-success-50 dark:bg-success-500/10",  border: "border-success-200 dark:border-success-500/20",  label: "Synced" };
    case "WARNING": return { dot: "bg-warning-500",  text: "text-warning-700 dark:text-warning-400",  bg: "bg-warning-50 dark:bg-warning-500/10",  border: "border-warning-200 dark:border-warning-500/20",  label: "Warning" };
    case "FAILED":  return { dot: "bg-error-500",    text: "text-error-700 dark:text-error-400",      bg: "bg-error-50 dark:bg-error-500/10",      border: "border-error-200 dark:border-error-500/20",      label: "Failed" };
    case "SYNCING": return { dot: "bg-brand-500 animate-pulse", text: "text-brand-700 dark:text-brand-400", bg: "bg-brand-50 dark:bg-brand-500/10", border: "border-brand-200 dark:border-brand-500/20", label: "Syncing…" };
    default:        return { dot: "bg-gray-400",     text: "text-gray-500 dark:text-gray-400",        bg: "bg-gray-50 dark:bg-gray-800/60",        border: "border-gray-200 dark:border-gray-700",           label: "Draft" };
  }
}

function formatRelativeTime(iso: string | null | undefined): string {
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

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={spinning ? "animate-spin" : ""}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);
const WrenchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

// ─── Channel card ─────────────────────────────────────────────────────────────

function ChannelCard({
  card, masterProductId, currency, onResync,
}: {
  card: ChannelDistributionCard;
  masterProductId: string;
  currency?: string | null;
  onResync: (storeId: string) => Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const cfg = statusConfig(card.syncStatus);
  const emoji = CHANNEL_EMOJI[card.channelType.toLowerCase()] ?? "🔗";
  const editUrl = `/products/${masterProductId}/channel-fields`;

  async function handleResync() {
    setSyncing(true);
    try { await onResync(card.storeId); } finally { setSyncing(false); }
  }

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {card.storeName}
          </span>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Sync info / error */}
      {card.syncStatus === "FAILED" && card.errorMessage ? (
        <p className="text-xs text-error-600 dark:text-error-400 leading-relaxed">{card.errorMessage}</p>
      ) : card.syncStatus === "WARNING" && card.errorMessage ? (
        <p className="text-xs text-warning-600 dark:text-warning-400 leading-relaxed">{card.errorMessage}</p>
      ) : card.lastSyncedAt ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Last sync: {formatRelativeTime(card.lastSyncedAt)}
        </p>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">Not yet synced</p>
      )}

      {/* Channel price / SKU */}
      {(card.channelPrice != null || card.channelSku) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {card.channelPrice != null && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Price</span>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {currency ?? ""} {card.channelPrice.toLocaleString()}
              </p>
            </div>
          )}
          {card.channelSku && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">SKU</span>
              <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{card.channelSku}</p>
            </div>
          )}
        </div>
      )}

      {/* Completion bar */}
      {card.completionPercentage > 0 && card.syncStatus === "DRAFT" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fields complete</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.completionPercentage}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${card.completionPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {card.syncStatus === "FAILED" ? (
          <Link
            href={editUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-error-500 hover:bg-error-600 text-white transition-colors"
          >
            <WrenchIcon /> Fix issue
          </Link>
        ) : (
          <Link
            href={editUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <EditIcon /> Edit fields
          </Link>
        )}
        <button
          onClick={handleResync}
          disabled={syncing || card.syncStatus === "SYNCING"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshIcon spinning={syncing || card.syncStatus === "SYNCING"} />
          {syncing ? "Syncing…" : "Re-sync"}
        </button>
      </div>
    </div>
  );
}

// ─── Left column: master data summary ────────────────────────────────────────

function MasterDataPanel({ product }: { product: MasterProductDetail }) {
  const displayImages = (product.images ?? []).slice(0, 5);
  const displayVariants = product.variants.slice(0, 5);
  const moreVariants = product.variantCount - displayVariants.length;

  return (
    <div className="space-y-5">
      {/* Main image */}
      {product.imageUrl && (
        <div className="w-full aspect-square max-h-48 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Core fields */}
      <div className="space-y-3">
        <Field label="Name" value={product.name} />
        {product.sku && <Field label="SKU" value={product.sku} mono />}
        {product.categoryName && <Field label="Category" value={product.categoryName} />}
        {product.basePrice != null && (
          <Field
            label="Base Price"
            value={`${product.currency ?? ""} ${product.basePrice.toLocaleString()}`}
          />
        )}
        {product.description && (
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Description</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">
              {product.description}
            </p>
          </div>
        )}
      </div>

      {/* Variants mini-table */}
      {displayVariants.length > 0 && (
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
            Variants ({product.variantCount})
          </span>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {displayVariants.map((v, i) => {
              const sku   = String(v.sku   ?? v.SKU   ?? `Variant ${i + 1}`);
              const price = v.price != null ? Number(v.price) : null;
              const label = getVariantLabel(v);
              return (
                <div
                  key={sku + i}
                  className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{sku}</span>
                    {label && <span className="ml-2 text-gray-700 dark:text-gray-300">{label}</span>}
                  </div>
                  {price != null && (
                    <span className="text-gray-800 dark:text-gray-200 flex-shrink-0 ml-3">
                      {product.currency ?? ""} {price.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
            {moreVariants > 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700/50">
                + {moreVariants} more variants
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image thumbnails */}
      {displayImages.length > 1 && (
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
            Images ({displayImages.length}{(product.images?.length ?? 0) > 5 ? "+" : ""})
          </span>
          <div className="flex gap-2 flex-wrap">
            {displayImages.map((url, i) => (
              <div key={i} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {product.tags && product.tags.length > 0 && (
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {product.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">{label}</span>
      <p className={`text-sm text-gray-800 dark:text-gray-200 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function getVariantLabel(v: Record<string, unknown>): string {
  const SKIP = new Set(["sku", "SKU", "price", "compareAtPrice", "quantity", "barcode", "weight", "id", "_id"]);
  return Object.entries(v)
    .filter(([k, val]) => !SKIP.has(k) && val != null && String(val).trim())
    .map(([, val]) => String(val))
    .slice(0, 3)
    .join(" / ");
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductDetailPage({ masterProductId }: { masterProductId: string }) {
  const router = useRouter();
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [product, setProduct] = useState<MasterProductDetail | null>(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [toast, setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await MasterProductService.getById(masterProductId, orgId);
      setProduct(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [masterProductId, orgId]);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleResync(storeId: string) {
    if (!product) return;
    try {
      const res = await fetch(`${BASE_API}/channels/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterProductId: product.id,
          storeId,
          organizationId: orgId,
        }),
      });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      setToast({ msg: "Re-sync triggered", ok: true });
      // Refresh after a short delay so status can update
      setTimeout(load, 2000);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Sync failed", ok: false });
    }
  }

  async function handleSyncAll() {
    if (!product || product.channelDistribution.length === 0) return;
    setSyncingAll(true);
    try {
      await Promise.allSettled(
        product.channelDistribution.map(c => handleResync(c.storeId))
      );
      setToast({ msg: "Sync triggered for all channels", ok: true });
    } finally {
      setSyncingAll(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading product…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !product) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-error-50 dark:bg-error-500/10 flex items-center justify-center mx-auto mb-4 text-2xl">⚠</div>
        <p className="font-medium text-gray-900 dark:text-white mb-1">Failed to load product</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={load} className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors">
            Retry
          </button>
          <Link href="/products" className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            ← My Products
          </Link>
        </div>
      </div>
    );
  }

  const hasChannels = product.channelDistribution.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok
            ? "bg-success-500 text-white"
            : "bg-error-500 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb + header */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
          <button onClick={() => router.push("/products")} className="hover:text-brand-500 transition-colors flex items-center gap-1">
            <ChevronLeftIcon /> My Products
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{product.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2">
              {product.sku && <span>SKU: {product.sku}</span>}
              {product.categoryName && <><span className="text-gray-300 dark:text-gray-600">·</span><span>{product.categoryName}</span></>}
              {product.updatedAt && <><span className="text-gray-300 dark:text-gray-600">·</span><span>Edited {formatRelativeTime(product.updatedAt)}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/products/${masterProductId}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <EditIcon /> Edit Master
            </Link>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: master data ──────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <h2 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-4">
              Master Data
            </h2>
            <MasterDataPanel product={product} />
          </div>
        </div>

        {/* ── Right: channel distribution ───────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
              Channel Distribution
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/products/${masterProductId}/channel-fields`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <PlusIcon /> Add channel
              </Link>
              {hasChannels && (
                <button
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <RefreshIcon spinning={syncingAll} /> Sync all
                </button>
              )}
            </div>
          </div>

          {/* Channel cards */}
          {hasChannels ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {product.channelDistribution.map((card) => (
                <ChannelCard
                  key={card.storeId}
                  card={card}
                  masterProductId={masterProductId}
                  currency={product.currency}
                  onResync={handleResync}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
              <div className="text-3xl mb-3">🔌</div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">No channels connected</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">
                Configure channel-specific fields to start distributing this product.
              </p>
              <Link
                href={`/products/${masterProductId}/channel-fields`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                <PlusIcon /> Configure channels
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
