import React from "react";
import type { SyncStatus } from "../../types";

interface Props {
  status: SyncStatus;
  size?: "sm" | "md";
}

const config: Record<SyncStatus, { label: string; dot: string; bg: string; text: string }> = {
  synced:   { label: "Synced",   dot: "bg-success-500",  bg: "bg-success-50 dark:bg-success-500/10",  text: "text-success-700 dark:text-success-400" },
  pending:  { label: "Pending",  dot: "bg-warning-400",  bg: "bg-warning-50 dark:bg-warning-500/10",  text: "text-warning-700 dark:text-warning-400" },
  syncing:  { label: "Syncing",  dot: "bg-brand-500 animate-pulse", bg: "bg-brand-50 dark:bg-brand-500/10", text: "text-brand-700 dark:text-brand-400" },
  failed:   { label: "Failed",   dot: "bg-error-500",    bg: "bg-error-50 dark:bg-error-500/10",      text: "text-error-700 dark:text-error-400" },
  draft:    { label: "Draft",    dot: "bg-gray-400",     bg: "bg-gray-100 dark:bg-gray-700",          text: "text-gray-600 dark:text-gray-400" },
  conflict: { label: "Conflict", dot: "bg-orange-500",   bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-700 dark:text-orange-400" },
};

export const SyncStatusBadge: React.FC<Props> = ({ status, size = "sm" }) => {
  const c = config[status];
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
};
