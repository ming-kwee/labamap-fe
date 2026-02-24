"use client";
import React, { useState, useMemo } from "react";
import { mockInventoryRows, mockChannels } from "../data/mockData";
import type { ChannelId } from "../types";
import { ChannelBadge } from "./shared/ChannelBadge";

type StockFilter = "all" | "low" | "oos";

const ACTIVE_CHANNELS: ChannelId[] = ["shopify", "amazon", "lazada", "ebay", "tokopedia", "facebook"];

export const InventorySyncTable: React.FC = () => {
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState<ChannelId | "all">("all");
  const [filterStock, setFilterStock] = useState<StockFilter>("all");
  const [sortBy, setSortBy] = useState<"total" | "product">("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const displayChannels = filterChannel === "all" ? ACTIVE_CHANNELS : [filterChannel];

  const filtered = useMemo(() => {
    let rows = mockInventoryRows.filter((r) => {
      const matchSearch =
        !search ||
        r.productName.toLowerCase().includes(search.toLowerCase()) ||
        r.masterSku.toLowerCase().includes(search.toLowerCase());

      const matchChannel =
        filterChannel === "all" ||
        r.channelStock[filterChannel] !== undefined;

      const matchStock =
        filterStock === "all" ||
        (filterStock === "oos" && (r.totalStock === 0 || ACTIVE_CHANNELS.some((ch) => r.channelStock[ch] === 0))) ||
        (filterStock === "low" && r.totalStock > 0 && r.totalStock <= r.lowStockThreshold);

      return matchSearch && matchChannel && matchStock;
    });

    rows = [...rows].sort((a, b) => {
      const aVal = sortBy === "total" ? a.totalStock : a.productName;
      const bVal = sortBy === "total" ? b.totalStock : b.productName;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    return rows;
  }, [search, filterChannel, filterStock, sortBy, sortAsc]);

  const oosCount = mockInventoryRows.filter(
    (r) => ACTIVE_CHANNELS.some((ch) => r.channelStock[ch] === 0)
  ).length;

  const lowCount = mockInventoryRows.filter(
    (r) => r.totalStock > 0 && r.totalStock <= r.lowStockThreshold
  ).length;

  const toggleSort = (col: "total" | "product") => {
    if (sortBy === col) setSortAsc((v) => !v);
    else { setSortBy(col); setSortAsc(true); }
  };

  const stockCell = (stock: number | null | undefined, threshold: number) => {
    if (stock === null || stock === undefined) {
      return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
    }
    if (stock === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-error-600 dark:text-error-400">
          {stock} <span>⚠</span>
        </span>
      );
    }
    if (stock <= threshold) {
      return (
        <span className="text-xs font-semibold text-warning-600 dark:text-warning-400">{stock}</span>
      );
    }
    return <span className="text-xs text-gray-700 dark:text-gray-300">{stock}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cross-Channel Inventory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Unified stock view across {ACTIVE_CHANNELS.length} connected channels
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            ↓ Export
          </button>
          <button
            onClick={() => { setSyncing(true); setTimeout(() => setSyncing(false), 2000); }}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-60"
          >
            <span className={syncing ? "animate-spin" : ""}>⟳</span>
            Sync Inventory
          </button>
        </div>
      </div>

      {/* Alert strip */}
      {(oosCount > 0 || lowCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {oosCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/20 text-sm text-error-700 dark:text-error-400">
              <span>⚠</span>
              <strong>{oosCount} products</strong> out of stock on 1+ channels
              <button
                onClick={() => setFilterStock("oos")}
                className="underline ml-1 text-xs"
              >
                View
              </button>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 text-sm text-warning-700 dark:text-warning-400">
              <span>↓</span>
              <strong>{lowCount} products</strong> below low stock threshold
              <button
                onClick={() => setFilterStock("low")}
                className="underline ml-1 text-xs"
              >
                View
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value as ChannelId | "all")}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All Channels</option>
          {mockChannels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(["all", "low", "oos"] as StockFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStock(f)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filterStock === f
                  ? "bg-brand-500 text-white"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {f === "all" ? "All Stock" : f === "low" ? "Low Stock" : "Out of Stock"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                <th
                  className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white select-none"
                  onClick={() => toggleSort("product")}
                >
                  Product {sortBy === "product" && (sortAsc ? "↑" : "↓")}
                </th>
                <th
                  className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white select-none"
                  onClick={() => toggleSort("total")}
                >
                  Total {sortBy === "total" && (sortAsc ? "↑" : "↓")}
                </th>
                {displayChannels.map((chId) => {
                  const ch = mockChannels.find((c) => c.id === chId);
                  return (
                    <th key={chId} className="px-3 py-3 text-center font-semibold">
                      <ChannelBadge channelId={chId} size="sm" />
                      {ch && <p className="text-[10px] text-gray-400 dark:text-gray-500 font-normal mt-0.5">{ch.name}</p>}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((row) => (
                <tr key={row.masterProductId} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-base flex-shrink-0">
                        🖼
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{row.productName}</p>
                        <code className="text-xs text-gray-400 dark:text-gray-500">{row.masterSku}</code>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-bold text-sm ${
                        row.totalStock === 0
                          ? "text-error-600 dark:text-error-400"
                          : row.totalStock <= row.lowStockThreshold
                          ? "text-warning-600 dark:text-warning-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {row.totalStock}
                    </span>
                  </td>
                  {displayChannels.map((chId) => (
                    <td key={chId} className="px-3 py-3 text-center">
                      {stockCell(row.channelStock[chId], row.lowStockThreshold)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            No products match your filters.
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400">
          Showing {filtered.length} of {mockInventoryRows.length} products
          {(oosCount > 0 || lowCount > 0) && (
            <span className="ml-3 text-error-500 dark:text-error-400">
              · {oosCount} OOS · {lowCount} low stock
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
