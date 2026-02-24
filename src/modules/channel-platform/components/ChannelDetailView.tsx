"use client";
import React, { useState, useMemo } from "react";
import Link from "next/link";
import { mockChannels, mockChannelProducts } from "../data/mockData";
import type { ChannelId, SyncStatus } from "../types";
import { SyncStatusBadge } from "./shared/SyncStatusBadge";
import { HealthScoreBar } from "./shared/HealthScoreBar";

interface Props {
  channelId: ChannelId;
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export const ChannelDetailView: React.FC<Props> = ({ channelId }) => {
  const [search, setSearch] = useState("");
  const [filterSync, setFilterSync] = useState<SyncStatus | "all">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const channel = mockChannels.find((c) => c.id === channelId);
  if (!channel) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-400">
        Channel &quot;{channelId}&quot; not found.{" "}
        <Link href="/channels" className="text-brand-500 hover:underline">Back to Channels</Link>
      </div>
    );
  }

  // Products listed on this channel
  const channelProducts = useMemo(() =>
    mockChannelProducts
      .map((p) => {
        const listing = p.channelListings.find((l) => l.channelId === channelId);
        return listing ? { product: p, listing } : null;
      })
      .filter(Boolean) as { product: typeof mockChannelProducts[0]; listing: typeof mockChannelProducts[0]["channelListings"][0] }[],
    [channelId]
  );

  const filtered = channelProducts.filter(({ product, listing }) => {
    const matchSearch =
      !search ||
      product.masterName.toLowerCase().includes(search.toLowerCase()) ||
      listing.channelSku.toLowerCase().includes(search.toLowerCase());
    const matchSync = filterSync === "all" || listing.syncStatus === filterSync;
    return matchSearch && matchSync;
  });

  // Stats for sidebar panel
  const synced = channelProducts.filter(({ listing }) => listing.syncStatus === "synced").length;
  const failed = channelProducts.filter(({ listing }) => listing.syncStatus === "failed").length;
  const warnings = channelProducts.filter(({ listing }) => listing.warningMessages && listing.warningMessages.length > 0).length;

  return (
    <div className="space-y-5">
      {/* Breadcrumb + Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
            <Link href="/channels" className="hover:text-brand-500 transition-colors">Channels</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white font-medium">{channel.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold ${channel.colorClass} ${channel.textColorClass}`}>
              {channel.code}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{channel.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {channelProducts.length} products &middot; Last sync: {formatTimeAgo(channel.lastSyncAt)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSyncingAll(true); setTimeout(() => setSyncingAll(false), 2000); }}
            disabled={syncingAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            <span className={syncingAll ? "animate-spin" : ""}>⟳</span>
            Sync All
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">
            ⚙ Channel Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left sidebar: health panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Channel Health</h3>
            <div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>API Health</span>
                <span>{channel.healthScore}/100</span>
              </div>
              <HealthScoreBar score={channel.healthScore} showLabel={false} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Synced</span>
                <span className="font-semibold text-success-600 dark:text-success-400">✓ {synced}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Failed</span>
                <span className="font-semibold text-error-600 dark:text-error-400">✗ {failed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Warnings</span>
                <span className="font-semibold text-warning-600 dark:text-warning-400">⚠ {warnings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Region</span>
                <span className="text-gray-700 dark:text-gray-300">{channel.region}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Currency</span>
                <span className="text-gray-700 dark:text-gray-300">{channel.currency}</span>
              </div>
            </div>
            {failed > 0 && (
              <button className="w-full py-2 text-xs font-medium text-center rounded-lg bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-400 hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors">
                Fix {failed} Issues
              </button>
            )}
          </div>
        </div>

        {/* Right: product table */}
        <div className="lg:col-span-3 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search products or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
            <select
              value={filterSync}
              onChange={(e) => setFilterSync(e.target.value as SyncStatus | "all")}
              className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="all">All Status</option>
              <option value="synced">Synced</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="conflict">Conflict</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Product</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Channel SKU</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Ch. Price</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Sync</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(({ product, listing }) => (
                  <React.Fragment key={product.masterProductId}>
                    <tr
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer ${
                        expandedRow === product.masterProductId ? "bg-gray-50 dark:bg-gray-800/30" : ""
                      }`}
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === product.masterProductId ? null : product.masterProductId
                        )
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-base flex-shrink-0">
                            🖼
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{product.masterName}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{product.masterCategory}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                          {listing.channelSku}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          ${listing.channelPrice.toFixed(2)}
                        </span>
                        {Math.abs(listing.channelPrice - product.masterPrice) > 1 && (
                          <p className="text-xs text-warning-500 dark:text-warning-400">
                            vs ${product.masterPrice.toFixed(2)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold text-sm ${
                            listing.channelStock === 0
                              ? "text-error-600 dark:text-error-400"
                              : listing.channelStock < 10
                              ? "text-warning-600 dark:text-warning-400"
                              : "text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {listing.channelStock}
                          {listing.channelStock === 0 && <span className="text-xs ml-1">⚠</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SyncStatusBadge status={listing.syncStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">Sync</button>
                          <Link href={`/products/create`} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
                            Master
                          </Link>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded error row */}
                    {expandedRow === product.masterProductId &&
                      (listing.errorMessage || (listing.warningMessages && listing.warningMessages.length > 0)) && (
                        <tr className="bg-gray-50 dark:bg-gray-800/30">
                          <td colSpan={6} className="px-6 py-4">
                            <div
                              className={`rounded-xl p-4 border text-sm ${
                                listing.syncStatus === "failed"
                                  ? "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/20"
                                  : "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/20"
                              }`}
                            >
                              {listing.errorMessage && (
                                <div className="flex items-start gap-2 mb-3">
                                  <span className="text-error-500 flex-shrink-0 mt-0.5">✗</span>
                                  <div>
                                    <p className="font-semibold text-error-700 dark:text-error-400">
                                      Sync failed: {product.masterName}
                                    </p>
                                    <p className="text-error-600 dark:text-error-300 mt-0.5">{listing.errorMessage}</p>
                                  </div>
                                </div>
                              )}
                              {listing.warningMessages?.map((w, i) => (
                                <div key={i} className="flex items-start gap-2 mb-2">
                                  <span className="text-warning-500 flex-shrink-0 mt-0.5">⚠</span>
                                  <p className="text-warning-700 dark:text-warning-300">{w}</p>
                                </div>
                              ))}
                              <div className="flex gap-2 mt-3">
                                {listing.syncStatus === "failed" && (
                                  <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-error-500 text-white hover:bg-error-600 transition-colors">
                                    Fix &amp; Retry
                                  </button>
                                )}
                                <button className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors">
                                  Skip
                                </button>
                                <Link
                                  href="/products/create"
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors"
                                >
                                  View Master
                                </Link>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                No products match your filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
