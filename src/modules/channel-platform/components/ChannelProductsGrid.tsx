"use client";
import React, { useState, useMemo } from "react";
import Link from "next/link";
import { mockChannelProducts, mockChannels } from "../data/mockData";
import type { ChannelId, SyncStatus } from "../types";
import { SyncStatusBadge } from "./shared/SyncStatusBadge";
import { ChannelBadge } from "./shared/ChannelBadge";

const ALL = "all";

type FilterChannel = ChannelId | typeof ALL;
type FilterSync = SyncStatus | typeof ALL;

export const ChannelProductsGrid: React.FC = () => {
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState<FilterChannel>(ALL);
  const [filterSync, setFilterSync] = useState<FilterSync>(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    return mockChannelProducts.filter((p) => {
      const matchSearch =
        !search ||
        p.masterName.toLowerCase().includes(search.toLowerCase()) ||
        p.masterSku.toLowerCase().includes(search.toLowerCase());

      const matchChannel =
        filterChannel === ALL ||
        p.channelListings.some((l) => l.channelId === filterChannel);

      const matchSync =
        filterSync === ALL ||
        p.channelListings.some((l) => l.syncStatus === filterSync);

      return matchSearch && matchChannel && matchSync;
    });
  }, [search, filterChannel, filterSync]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((p) => p.masterProductId)));
    }
  };

  const getWorstStatus = (statuses: SyncStatus[]): SyncStatus => {
    const order: SyncStatus[] = ["failed", "conflict", "syncing", "pending", "draft", "synced"];
    for (const s of order) {
      if (statuses.includes(s)) return s;
    }
    return "synced";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {mockChannelProducts.length} master products published across channels
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors">
              ⟳ Sync Selected ({selected.size})
            </button>
          )}
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            ↓ Export
          </button>
          <Link
            href="/products/v2/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            + Publish Product
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>
        <select
          value={filterChannel}
          onChange={(e) => { setFilterChannel(e.target.value as FilterChannel); setPage(1); }}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value={ALL}>All Channels</option>
          {mockChannels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterSync}
          onChange={(e) => { setFilterSync(e.target.value as FilterSync); setPage(1); }}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value={ALL}>All Sync Status</option>
          <option value="synced">Synced</option>
          <option value="pending">Pending</option>
          <option value="syncing">Syncing</option>
          <option value="failed">Failed</option>
          <option value="conflict">Conflict</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">SKU</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Price</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Channels</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Overall</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginated.map((product) => {
                const statuses = product.channelListings.map((l) => l.syncStatus);
                const worst = getWorstStatus(statuses);
                const listings = filterChannel === ALL
                  ? product.channelListings
                  : product.channelListings.filter((l) => l.channelId === filterChannel);

                return (
                  <tr
                    key={product.masterProductId}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(product.masterProductId)}
                        onChange={() => toggleSelect(product.masterProductId)}
                        className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg flex-shrink-0 overflow-hidden">
                          🖼
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white leading-tight">
                            {product.masterName}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {product.masterCategory} · {product.hasVariants ? `${product.variantCount} variants` : "Simple"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                        {product.masterSku}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${product.masterPrice.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {listings.map((listing) => (
                          <span key={listing.channelId} className="relative group">
                            <span
                              className={`inline-flex ${
                                listing.syncStatus === "failed"
                                  ? "ring-2 ring-error-400 rounded"
                                  : listing.syncStatus === "pending" || listing.syncStatus === "conflict"
                                  ? "ring-2 ring-warning-400 rounded"
                                  : ""
                              }`}
                            >
                              <ChannelBadge channelId={listing.channelId} size="sm" />
                            </span>
                          </span>
                        ))}
                        {filterChannel === ALL && listings.length < product.channelListings.length && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            +{product.channelListings.length - listings.length}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SyncStatusBadge status={worst} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/channels/products/${product.masterProductId}`}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                        >
                          Detail
                        </Link>
                        <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
                          Sync
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 rounded text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                ◀
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    p === page
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 rounded text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                ▶
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
