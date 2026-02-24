"use client";
import React, { useState } from "react";
import { ChannelCard } from "./ChannelCard";
import { mockChannels, mockActivityFeed, mockKpiSummary } from "../data/mockData";
import type { ActivityItem } from "../types";

const activityIcon: Record<ActivityItem["type"], { icon: string; color: string }> = {
  sync_success:     { icon: "✓", color: "text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-500/10" },
  sync_failed:      { icon: "✗", color: "text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10" },
  inventory_update: { icon: "↻", color: "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10" },
  product_added:    { icon: "+", color: "text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-500/10" },
  error_fixed:      { icon: "✓", color: "text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-500/10" },
  bulk_sync:        { icon: "⟳", color: "text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-500/10" },
};

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export const ChannelHubDashboard: React.FC = () => {
  const [syncingAll, setSyncingAll] = useState(false);

  const handleSyncAll = () => {
    setSyncingAll(true);
    setTimeout(() => setSyncingAll(false), 2000);
  };

  const kpi = mockKpiSummary;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel Platform</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {mockChannels.length} connected &middot; Last full sync:{" "}
            {formatTimeAgo(kpi.lastFullSyncAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            <span className={syncingAll ? "animate-spin" : ""}>⟳</span>
            Sync All Channels
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">
            + Connect Channel
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Synced", value: kpi.totalSynced, icon: "✓", bg: "bg-success-50 dark:bg-success-500/10", text: "text-success-700 dark:text-success-400", sub: "products" },
          { label: "Pending", value: kpi.totalPending, icon: "⟳", bg: "bg-warning-50 dark:bg-warning-500/10", text: "text-warning-700 dark:text-warning-400", sub: "queued" },
          { label: "Failed", value: kpi.totalFailed, icon: "✗", bg: "bg-error-50 dark:bg-error-500/10", text: "text-error-700 dark:text-error-400", sub: "errors" },
          { label: "OOS Alerts", value: kpi.totalOosAlerts, icon: "⚠", bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", sub: "out of stock" },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-2xl p-5 flex items-center gap-4 ${stat.bg}`}
          >
            <span className={`text-2xl ${stat.text}`}>{stat.icon}</span>
            <div>
              <p className={`text-3xl font-bold ${stat.text}`}>{stat.value}</p>
              <p className={`text-xs font-medium ${stat.text} opacity-70`}>{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Channel cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Connected Channels
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockChannels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {mockActivityFeed.map((item) => {
            const cfg = activityIcon[item.type];
            return (
              <li key={item.id} className="flex items-start gap-3 px-6 py-3.5">
                <span className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{item.message}</p>
                  {item.channelName && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.channelName}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
