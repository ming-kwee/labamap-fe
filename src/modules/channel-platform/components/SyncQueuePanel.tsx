"use client";
import React, { useState } from "react";
import { mockSyncOperations, mockChannels } from "../data/mockData";
import type { SyncOperation, SyncStatus, ChannelId } from "../types";
import { SyncStatusBadge } from "./shared/SyncStatusBadge";
import { ChannelBadge } from "./shared/ChannelBadge";

const opTypeLabel: Record<SyncOperation["type"], string> = {
  publish: "Publish",
  update: "Update",
  delete: "Delete",
  sync_inventory: "Inventory Sync",
};

const priorityBadge: Record<SyncOperation["priority"], string> = {
  high: "bg-error-100 dark:bg-error-500/10 text-error-700 dark:text-error-400",
  normal: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
  low: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-500",
};

export const SyncQueuePanel: React.FC = () => {
  const [filterStatus, setFilterStatus] = useState<SyncStatus | "all">("all");
  const [filterChannel, setFilterChannel] = useState<ChannelId | "all">("all");
  const [ops, setOps] = useState(mockSyncOperations);

  const filtered = ops.filter((op) => {
    const matchStatus = filterStatus === "all" || op.status === filterStatus;
    const matchChannel = filterChannel === "all" || op.channelId === filterChannel;
    return matchStatus && matchChannel;
  });

  const pending = ops.filter((o) => o.status === "pending");
  const syncing = ops.filter((o) => o.status === "syncing");
  const failed = ops.filter((o) => o.status === "failed");
  const synced = ops.filter((o) => o.status === "synced");

  const cancelOp = (id: string) =>
    setOps((prev) => prev.filter((o) => o.id !== id));

  const retryOp = (id: string) =>
    setOps((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "pending" as SyncStatus, retryCount: o.retryCount + 1 } : o))
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sync Queue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Monitor all channel synchronization operations in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setOps((prev) =>
                prev.map((o) =>
                  o.status === "failed" ? { ...o, status: "pending" as SyncStatus, retryCount: o.retryCount + 1 } : o
                )
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            ⟳ Retry All Failed
          </button>
          <button
            onClick={() => setOps((prev) => prev.filter((o) => o.status !== "synced"))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Clear Done
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Synced", count: synced.length, status: "synced" as SyncStatus, icon: "✓", color: "text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-500/10" },
          { label: "Pending", count: pending.length, status: "pending" as SyncStatus, icon: "⟳", color: "text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-500/10" },
          { label: "Active", count: syncing.length, status: "syncing" as SyncStatus, icon: "⟳", color: "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10" },
          { label: "Failed", count: failed.length, status: "failed" as SyncStatus, icon: "✗", color: "text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10" },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => setFilterStatus(filterStatus === stat.status ? "all" : stat.status)}
            className={`rounded-2xl p-4 flex items-center gap-3 transition-all ${stat.color} ${
              filterStatus === stat.status ? "ring-2 ring-brand-500" : ""
            }`}
          >
            <span className="text-xl">{stat.icon}</span>
            <div className="text-left">
              <p className="text-xl font-bold">{stat.count}</p>
              <p className="text-xs font-medium opacity-70">{stat.label}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Filter sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filter by Channel</h3>
            <div className="space-y-1">
              <button
                onClick={() => setFilterChannel("all")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                  filterChannel === "all"
                    ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                All Channels
                <span className="text-xs text-gray-400">{ops.length}</span>
              </button>
              {mockChannels.map((ch) => {
                const count = ops.filter((o) => o.channelId === ch.id).length;
                if (count === 0) return null;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setFilterChannel(ch.id === filterChannel ? "all" : ch.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                      filterChannel === ch.id
                        ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ChannelBadge channelId={ch.id} size="xs" />
                      <span>{ch.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Operations list */}
        <div className="lg:col-span-3 space-y-4">
          {/* Active */}
          {(filterStatus === "all" || filterStatus === "syncing") && syncing.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                In Progress ({syncing.length})
              </h3>
              <div className="space-y-2">
                {filtered.filter((o) => o.status === "syncing").map((op) => (
                  <div key={op.id} className="bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <ChannelBadge channelId={op.channelId} size="sm" />
                        <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{op.productName}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{opTypeLabel[op.type]}</span>
                      </div>
                      <button
                        onClick={() => cancelOp(op.id)}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-error-600 dark:hover:text-error-400 flex-shrink-0 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-brand-100 dark:bg-brand-500/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all duration-500"
                          style={{ width: `${op.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-brand-600 dark:text-brand-400 font-semibold w-8 text-right">{op.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pending */}
          {(filterStatus === "all" || filterStatus === "pending") && filtered.filter((o) => o.status === "pending").length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Pending ({filtered.filter((o) => o.status === "pending").length})
              </h3>
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {filtered.filter((o) => o.status === "pending").map((op) => (
                  <div key={op.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-warning-400 flex-shrink-0">⟳</span>
                    <ChannelBadge channelId={op.channelId} size="xs" />
                    <span className="font-medium text-gray-900 dark:text-white text-sm flex-1 truncate">{op.productName}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{opTypeLabel[op.type]}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${priorityBadge[op.priority]}`}>
                      {op.priority}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Queued</span>
                    <button
                      onClick={() => cancelOp(op.id)}
                      className="text-xs text-gray-400 hover:text-error-500 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Failed */}
          {(filterStatus === "all" || filterStatus === "failed") && filtered.filter((o) => o.status === "failed").length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Failed ({filtered.filter((o) => o.status === "failed").length})
              </h3>
              <div className="space-y-2">
                {filtered.filter((o) => o.status === "failed").map((op) => (
                  <div key={op.id} className="bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/20 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-error-500 flex-shrink-0">✗</span>
                        <ChannelBadge channelId={op.channelId} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{op.productName}</p>
                          <p className="text-xs text-error-600 dark:text-error-400 mt-0.5">{op.errorMessage}</p>
                          {op.retryCount > 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Retried {op.retryCount}×</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => retryOp(op.id)}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-500 text-white hover:bg-error-600 transition-colors"
                        >
                          Retry
                        </button>
                        <button className="px-2.5 py-1 text-xs font-medium rounded-lg border border-error-200 dark:border-error-500/30 text-error-600 dark:text-error-400 hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors">
                          Fix
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Synced */}
          {(filterStatus === "all" || filterStatus === "synced") && filtered.filter((o) => o.status === "synced").length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Recently Synced ({filtered.filter((o) => o.status === "synced").length})
              </h3>
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {filtered.filter((o) => o.status === "synced").map((op) => (
                  <div key={op.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
                    <span className="text-success-500 flex-shrink-0">✓</span>
                    <ChannelBadge channelId={op.channelId} size="xs" />
                    <span className="font-medium text-gray-700 dark:text-gray-300 text-sm flex-1 truncate">{op.productName}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{opTypeLabel[op.type]}</span>
                    <SyncStatusBadge status="synced" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              No operations match your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
