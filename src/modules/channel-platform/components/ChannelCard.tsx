"use client";
import React from "react";
import Link from "next/link";
import type { ChannelPlatform } from "../types";
import { HealthScoreBar } from "./shared/HealthScoreBar";

interface Props {
  channel: ChannelPlatform;
  onSync?: (channelId: string) => void;
}

const statusConfig = {
  active:       { dot: "bg-success-500", label: "Active",       labelClass: "text-success-600 dark:text-success-400" },
  warning:      { dot: "bg-warning-400", label: "Warning",      labelClass: "text-warning-600 dark:text-warning-400" },
  error:        { dot: "bg-error-500",   label: "Error",        labelClass: "text-error-600 dark:text-error-400" },
  idle:         { dot: "bg-gray-400",    label: "Idle",         labelClass: "text-gray-500 dark:text-gray-400" },
  disconnected: { dot: "bg-gray-300",    label: "Disconnected", labelClass: "text-gray-400" },
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

export const ChannelCard: React.FC<Props> = ({ channel, onSync }) => {
  const st = statusConfig[channel.status];

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${channel.colorClass} ${channel.textColorClass}`}
          >
            {channel.code}
          </span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{channel.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{channel.region} · {channel.currency}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${st.labelClass}`}>
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${st.dot}`} />
          {st.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 py-2">
          <p className="text-base font-bold text-gray-900 dark:text-white">{channel.syncedProducts}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Synced</p>
        </div>
        <div className="rounded-lg bg-warning-50 dark:bg-warning-500/10 py-2">
          <p className="text-base font-bold text-warning-700 dark:text-warning-400">{channel.pendingProducts}</p>
          <p className="text-[10px] text-warning-600 dark:text-warning-500 leading-tight">Pending</p>
        </div>
        <div className="rounded-lg bg-error-50 dark:bg-error-500/10 py-2">
          <p className="text-base font-bold text-error-700 dark:text-error-400">{channel.failedProducts}</p>
          <p className="text-[10px] text-error-600 dark:text-error-500 leading-tight">Failed</p>
        </div>
      </div>

      {/* Health score */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Health Score</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {channel.totalProducts} products
          </span>
        </div>
        <HealthScoreBar score={channel.healthScore} />
      </div>

      {/* Last sync */}
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        Last sync: {formatTimeAgo(channel.lastSyncAt)}
      </p>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
        <Link
          href={`/channels/${channel.id}`}
          className="flex-1 text-center text-xs font-medium py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          View
        </Link>
        <button
          onClick={() => onSync?.(channel.id)}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          Sync
        </button>
      </div>
    </div>
  );
};
