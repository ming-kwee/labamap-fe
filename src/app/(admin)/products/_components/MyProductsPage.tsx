"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MasterProductService } from "../_services/master-product.service";
import type { MasterProduct, MasterProductChannelSummary, ChannelSyncStatus } from "../_types/master-product";
import { overallSyncStatus } from "../_types/master-product";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", woocommerce: "🟣", amazon: "📦", tiktok: "🎵",
  ebay: "🔨", etsy: "🎨", lazada: "🛒", tokopedia: "🟢",
  facebook: "📘", shopee: "🧡", walmart: "🔵", wix: "⬛",
};

const PAGE_SIZE = 10;

// ─── Icons ────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const PackageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ summaries }: { summaries: MasterProductChannelSummary[] }) {
  const status = overallSyncStatus(summaries);
  const failedCount  = summaries.filter(s => s.syncStatus === "FAILED").length;
  const warningCount = summaries.filter(s => s.syncStatus === "WARNING").length;

  if (summaries.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
        No channels
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
        {failedCount} failed
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        {warningCount} warning
      </span>
    );
  }
  if (status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        Syncing
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
        Draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
      All synced
    </span>
  );
}

// ─── Channel icons ────────────────────────────────────────────────────────────

function ChannelIcons({ summaries }: { summaries: MasterProductChannelSummary[] }) {
  if (summaries.length === 0) {
    return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  }
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {summaries.map(s => (
        <span
          key={s.storeId}
          title={`${s.storeName} (${s.channelType}) — ${s.syncStatus}`}
          className={`text-sm leading-none ${
            s.syncStatus === "FAILED"  ? "grayscale-0 opacity-60" :
            s.syncStatus === "WARNING" ? "opacity-80" : ""
          }`}
        >
          {CHANNEL_EMOJI[s.channelType] ?? "🏪"}
        </span>
      ))}
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className="px-4 py-3 w-10"><div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-3 py-3 w-12"><div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-4 py-3">
        <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-1.5" />
        <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </td>
      <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-6 w-20 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyProductsPage() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";
  const router = useRouter();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<ChannelSyncStatus | "ALL">("ALL");
  const [connectedChannelTypes, setConnectedChannelTypes] = useState<string[]>([]);

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Debounce search ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Load connected channel types for filter ─────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    ChannelStoreService.listAllStores(orgId)
      .then(stores => {
        const types = [...new Set(stores.map(s => s.channelType))];
        setConnectedChannelTypes(types);
      })
      .catch(() => {/* non-fatal */});
  }, [orgId]);

  // ── Load products ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await MasterProductService.list({
        organizationId: orgId,
        page,
        size:  PAGE_SIZE,
        q:     debouncedSearch || undefined,
        channelType:   channelFilter !== "ALL"  ? channelFilter  : undefined,
        channelStatus: statusFilter  !== "ALL"  ? statusFilter   : undefined,
      });
      setProducts(res.content);
      setTotalElements(res.totalElements);
      setTotalPages(res.totalPages);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, page, debouncedSearch, channelFilter, statusFilter]);

  // Clear selection when page changes to avoid stale cross-page selection
  useEffect(() => { setSelectedIds(new Set()); }, [page]);

  useEffect(() => { load(); }, [load]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        products.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        products.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  // ── Stats ───────────────────────────────────────────────────────────────────
  // Use connected store count (loaded once) — not current-page products which only reflect 10 rows
  const uniqueChannels = connectedChannelTypes.length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center flex-shrink-0 text-brand-600 dark:text-brand-400">
              <PackageIcon />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">My Products</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isLoading
                  ? "Loading…"
                  : `${totalElements} product${totalElements !== 1 ? "s" : ""}${uniqueChannels > 0 ? ` · ${uniqueChannels} channel${uniqueChannels !== 1 ? "s" : ""}` : ""}`
                }
              </p>
            </div>
          </div>
          <Link
            href="/products/v2/create"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm shadow-brand-500/20"
          >
            <PlusIcon /> Create Product
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 px-6 py-3 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name or SKU…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
          />
        </div>

        {/* Channel filter */}
        {connectedChannelTypes.length > 0 && (
          <select
            value={channelFilter}
            onChange={e => { setChannelFilter(e.target.value); setPage(0); }}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="ALL">All channels</option>
            {connectedChannelTypes.map(ct => (
              <option key={ct} value={ct}>
                {CHANNEL_EMOJI[ct] ?? "🏪"} {ct.charAt(0).toUpperCase() + ct.slice(1)}
              </option>
            ))}
          </select>
        )}

        {/* Status filter */}
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {([
            { value: "ALL",    label: "All" },
            { value: "SYNCED", label: "Synced" },
            { value: "WARNING",label: "Warning" },
            { value: "FAILED", label: "Failed" },
            { value: "DRAFT",  label: "Draft" },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(0); }}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? opt.value === "FAILED"  ? "bg-red-500 text-white"
                  : opt.value === "WARNING" ? "bg-amber-500 text-white"
                  : opt.value === "DRAFT"   ? "bg-gray-500 text-white"
                  : "bg-brand-500 text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-gray-400 tabular-nums">
          {isLoading ? "…" : `${totalElements} product${totalElements !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Error */}
      {loadError && (
        <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <AlertIcon />
          <div>
            <p className="font-medium">Failed to load products</p>
            <p className="text-xs mt-0.5 opacity-80">{loadError}</p>
          </div>
          <button onClick={load} className="ml-auto text-xs underline flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="px-6 py-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30"
                  />
                </th>
                <th className="px-3 py-3 w-14" />
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Product
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">
                  Category
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                  Channels
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Loading */}
              {isLoading && Array.from({ length: PAGE_SIZE }, (_, i) => <SkeletonRow key={i} />)}

              {/* Empty state */}
              {!isLoading && !loadError && products.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl">📦</div>
                      {debouncedSearch || channelFilter !== "ALL" || statusFilter !== "ALL" ? (
                        <>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No products match your filters</p>
                          <button
                            onClick={() => { setSearchQuery(""); setChannelFilter("ALL"); setStatusFilter("ALL"); setPage(0); }}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Clear filters
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No products yet</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs">
                            Create your first master product, then configure channel-specific fields and publish to your stores.
                          </p>
                          <Link
                            href="/products/v2/create"
                            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
                          >
                            <PlusIcon /> Create your first product
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* Product rows */}
              {!isLoading && products.map(product => (
                <tr
                  key={product.id}
                  onClick={() => router.push(`/products/${product.id}`)}
                  className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleOne(product.id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30"
                    />
                  </td>

                  {/* Thumbnail */}
                  <td className="px-3 py-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">
                        📦
                      </div>
                    )}
                  </td>

                  {/* Name / SKU */}
                  <td className="px-4 py-3 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[220px]">
                      {product.name}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                      {product.sku ? `SKU: ${product.sku}` : "No SKU"}
                      {product.variantCount > 1 && (
                        <span className="ml-2 not-italic font-sans text-gray-300 dark:text-gray-600">
                          · {product.variantCount} variants
                        </span>
                      )}
                    </p>
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[150px] block">
                      {product.categoryName ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </span>
                  </td>

                  {/* Channel icons */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <ChannelIcons summaries={product.channelSummary} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge summaries={product.channelSummary} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom bar: bulk actions + pagination */}
        {!isLoading && (products.length > 0 || selectedCount > 0) && (
          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            {/* Bulk actions */}
            <div className="flex items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {selectedCount} selected
                  </span>
                  <button
                    onClick={() => showToast("Bulk sync coming in Phase 5", "ok")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Sync selected
                  </button>
                  <button
                    onClick={() => showToast("Export coming soon", "ok")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Export
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {totalElements} product{totalElements !== 1 ? "s" : ""} total
                </span>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeftIcon />
                </button>

                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pageNum = totalPages <= 7 ? i : (
                    page < 4 ? i :
                    page > totalPages - 4 ? totalPages - 7 + i :
                    page - 3 + i
                  );
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        pageNum === page
                          ? "bg-brand-500 border-brand-500 text-white"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightIcon />
                </button>

                <span className="ml-1 text-xs text-gray-400 tabular-nums">
                  {page + 1} / {totalPages}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
          toast.type === "ok"
            ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400"
        }`}>
          {toast.type === "ok" ? "✓" : <AlertIcon />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
