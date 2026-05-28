"use client";

import React, { useState } from "react";
import { OrgProvisionStatus } from "../_types/platform-category-template";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

// ─── Force Reprovision Confirm Modal ──────────────────────────────────────────

function ForceProvisionConfirmModal({
  orgId,
  orgName,
  onConfirm,
  onCancel,
}: {
  orgId: string;
  orgName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const CONFIRM_WORD = "RESET";
  const confirmed = typed.trim() === CONFIRM_WORD;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
            <WarningIcon />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">Force Re-provision</h2>
            <p className="text-xs text-red-500/80 dark:text-red-500 mt-0.5">Destructive — all merchant customisations will be lost</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            This will <span className="font-semibold text-red-600 dark:text-red-400">delete all categories and channel mappings</span> for{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{orgName}</span>{" "}
            and re-copy the entire template tree. Any merchant renames, custom nodes, ProductType assignments, and channel category mappings will be permanently lost.
          </p>
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
            <WarningIcon />
            <span>Channel category mappings for this org will also be deleted.</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Type <span className="font-bold text-gray-900 dark:text-white">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${confirmed ? "bg-red-600 hover:bg-red-700 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"}`}
          >
            Force Re-provision
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Org Row ──────────────────────────────────────────────────────────────────

function OrgRow({
  status,
  onProvision,
  onForceProvision,
}: {
  status: OrgProvisionStatus;
  onProvision: () => void;
  onForceProvision: () => void;
}) {
  const [provisioning, setProvisioning] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);

  const handleProvision = async () => {
    setProvisioning(true);
    try { await onProvision(); } finally { setProvisioning(false); }
  };

  const handleForceConfirmed = async () => {
    setShowForceConfirm(false);
    setProvisioning(true);
    try { await onForceProvision(); } finally { setProvisioning(false); }
  };

  return (
    <>
      <div className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all ${
        provisioning ? "opacity-60 pointer-events-none" : ""
      } ${
        status.provisioned
          ? "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60"
          : "bg-amber-50/50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20"
      }`}>
        {/* Org info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{status.orgName}</span>
            <code className="text-[11px] text-gray-400 font-mono">{status.orgId}</code>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {status.provisioned ? (
              <>
                <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Provisioned
                </span>
                <span className="text-[11px] text-gray-400">{status.categoryCount} categories</span>
                {status.templateVersion !== null && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    v{status.templateVersion}
                  </span>
                )}
                {status.provisionedAt && (
                  <span className="text-[11px] text-gray-400">
                    {new Date(status.provisionedAt).toLocaleDateString()}
                  </span>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Not yet provisioned
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!status.provisioned ? (
            <button
              onClick={handleProvision}
              disabled={provisioning}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm disabled:opacity-50"
            >
              {provisioning ? "Provisioning…" : "Provision"}
            </button>
          ) : (
            <>
              <button
                onClick={handleProvision}
                disabled={provisioning}
                title="Safe re-run — skips existing categories"
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {provisioning ? "Running…" : "Re-provision"}
              </button>
              <button
                onClick={() => setShowForceConfirm(true)}
                disabled={provisioning}
                title="Destructive — deletes org tree and re-copies from template"
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Force reset
              </button>
            </>
          )}
        </div>
      </div>

      {showForceConfirm && (
        <ForceProvisionConfirmModal
          orgId={status.orgId}
          orgName={status.orgName}
          onConfirm={handleForceConfirmed}
          onCancel={() => setShowForceConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Provision Panel ──────────────────────────────────────────────────────────

interface ProvisionPanelProps {
  orgStatuses: OrgProvisionStatus[];
  loading: boolean;
  onRefresh: () => void;
  onProvision: (orgId: string) => Promise<void>;
  onForceProvision: (orgId: string) => Promise<void>;
}

export default function ProvisionPanel({ orgStatuses, loading, onRefresh, onProvision, onForceProvision }: ProvisionPanelProps) {
  const notProvisioned = orgStatuses.filter(o => !o.provisioned);
  const provisioned = orgStatuses.filter(o => o.provisioned);

  return (
    <main className="px-6 py-6 max-w-5xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Organisation Provision Status</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${provisioned.length} provisioned · ${notProvisioned.length} pending`}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshIcon /> Refresh
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-gray-200 dark:bg-gray-700/50 animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      )}

      {!loading && orgStatuses.length === 0 && (
        <div className="text-center py-16">
          <p className="text-2xl mb-3">🏢</p>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No organisations found</p>
          <p className="text-xs text-gray-400 mt-1">The provision-status endpoint returned an empty list.</p>
        </div>
      )}

      {!loading && notProvisioned.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
            <AlertIcon /> Pending ({notProvisioned.length})
          </div>
          <div className="space-y-2">
            {notProvisioned.map(s => (
              <OrgRow
                key={s.orgId}
                status={s}
                onProvision={() => onProvision(s.orgId)}
                onForceProvision={() => onForceProvision(s.orgId)}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && provisioned.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Provisioned ({provisioned.length})
          </div>
          <div className="space-y-2">
            {provisioned.map(s => (
              <OrgRow
                key={s.orgId}
                status={s}
                onProvision={() => onProvision(s.orgId)}
                onForceProvision={() => onForceProvision(s.orgId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 flex items-start gap-3 px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <AlertIcon />
        <div className="space-y-1">
          <p><span className="font-semibold text-gray-700 dark:text-gray-300">Re-provision</span> — safe, idempotent. Skips categories that already exist in the org. Use after adding new template nodes.</p>
          <p><span className="font-semibold text-red-600 dark:text-red-400">Force reset</span> — destructive. Deletes the org's entire category tree and all channel mappings, then re-copies from the current template.</p>
        </div>
      </div>
    </main>
  );
}
