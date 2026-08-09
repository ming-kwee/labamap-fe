"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AdminChannelStore, CHANNEL_LABELS } from "../_types/channel-store-admin";
import { ChannelStoreAdminService } from "../_services/channel-store-admin.service";
import {
  ChannelApiContract,
  ContractStatus,
  STATUS_STYLE,
} from "../../channel-contract-versions/_types/channel-api-contract";
import { ChannelApiContractService } from "../../channel-contract-versions/_services/channel-api-contract.service";

// Sentinel for the "Follow active channel version" option (clear pin).
const FOLLOW = "";

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

function StatusPill({ status }: { status: ContractStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

export default function VersionPinModal({
  orgId,
  store,
  onClose,
  onSaved,
}: {
  orgId: string;
  store: AdminChannelStore;
  onClose: () => void;
  onSaved: (updated: AdminChannelStore) => void;
}) {
  const [contracts, setContracts] = useState<ChannelApiContract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected]   = useState<string>(store.apiVersion ?? FOLLOW);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const channelLabel = CHANNEL_LABELS[store.channelType] ?? store.channelType;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ChannelApiContractService.listByChannel(store.channelType)
      .then((list) => { if (alive) setContracts(list); })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : "Failed to load versions"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [store.channelType]);

  const byVersion = useMemo(() => new Map(contracts.map((c) => [c.apiVersion, c])), [contracts]);
  const activeContract = useMemo(() => contracts.find((c) => c.status === "ACTIVE"), [contracts]);
  const currentPinned = store.apiVersion ?? null;

  // Offer non-RETIRED versions. Always keep the currently-pinned one visible (even if it was
  // since retired) so the admin can see and clear it. §4.1
  const options = useMemo(
    () => contracts
      .filter((c) => c.status !== "RETIRED" || c.apiVersion === currentPinned)
      .sort((a, b) => b.apiVersion.localeCompare(a.apiVersion)),
    [contracts, currentPinned],
  );

  const selectedContract = selected === FOLLOW ? null : byVersion.get(selected);
  const isNonActivePin = selectedContract != null && selectedContract.status !== "ACTIVE";
  const changed = (store.apiVersion ?? FOLLOW) !== selected;

  function handleSelect(v: string) {
    setSelected(v);
    setConfirming(false);
    setSaveError(null);
  }

  async function doSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await ChannelStoreAdminService.setApiVersionPin(
        orgId,
        store.storeId,
        selected === FOLLOW ? undefined : selected,
      );
      onSaved(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update version pin";
      setSaveError(msg.includes("404") ? "Store tak ditemukan." : msg);
      setSaving(false);
    }
  }

  // Pinning to a non-ACTIVE version (DEPRECATED/DRAFT) needs an explicit confirm. §4.2
  function handlePrimary() {
    if (isNonActivePin && !confirming) { setConfirming(true); return; }
    doSave();
  }

  async function handleClear() {
    setSelected(FOLLOW);
    setConfirming(false);
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await ChannelStoreAdminService.setApiVersionPin(orgId, store.storeId);
      onSaved(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear pin";
      setSaveError(msg.includes("404") ? "Store tak ditemukan." : msg);
      setSaving(false);
    }
  }

  const joltSpecLink = `/platform-admin/channel-jolt-specs?channelId=${encodeURIComponent(store.channelType)}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Channel API Version</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {store.storeName} · {channelLabel}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><XIcon /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading versions…</p>
          ) : loadError ? (
            <div className="px-3 py-2.5 rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 text-sm text-error-700 dark:text-error-400">
              {loadError}
            </div>
          ) : (
            <>
              {/* Current status line */}
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                {currentPinned ? (
                  <>
                    <span>Pinned to</span>
                    <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs">{currentPinned}</code>
                    {byVersion.get(currentPinned) && <StatusPill status={byVersion.get(currentPinned)!.status} />}
                  </>
                ) : (
                  <>
                    <span>Following active</span>
                    <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs">
                      {activeContract?.apiVersion ?? "—"}
                    </code>
                  </>
                )}
              </div>

              {/* Version dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Version</label>
                <select
                  value={selected}
                  onChange={(e) => handleSelect(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                >
                  <option value={FOLLOW}>
                    Follow active{activeContract ? ` (${activeContract.apiVersion})` : ""}
                  </option>
                  {options.map((c) => (
                    <option key={c.apiVersion} value={c.apiVersion}>
                      {c.apiVersion} — {c.status}{c.status === "DRAFT" ? " (testing)" : ""}
                    </option>
                  ))}
                </select>
                {options.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    No published contract versions for this channel yet.
                  </p>
                )}
              </div>

              {/* Selected version badge */}
              {selectedContract && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Selected:</span>
                  <StatusPill status={selectedContract.status} />
                  {selectedContract.apiSchemaHash && (
                    <code className="font-mono text-[11px] text-gray-400 dark:text-gray-500 truncate">{selectedContract.apiSchemaHash}</code>
                  )}
                </div>
              )}

              {/* Confirmation copy for non-ACTIVE pins (§4.2) + stale-spec cross-reference (§4.3) */}
              {isNonActivePin && selectedContract && (
                <div className={`px-3 py-2.5 rounded-xl border text-xs space-y-1.5 ${
                  selectedContract.status === "DRAFT"
                    ? "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30 text-warning-800 dark:text-warning-300"
                    : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                }`}>
                  <p>
                    {selectedContract.status === "DRAFT" ? (
                      <>Versi <strong>{selectedContract.apiVersion}</strong> masih <strong>DRAFT (uji coba)</strong>. Gunakan untuk canary sebelum versi dipromosikan ACTIVE.</>
                    ) : (
                      <>Store akan memakai bentuk <strong>beku versi lama</strong> ({selectedContract.apiVersion}). Cocok untuk menahan store yang belum siap pindah. Publish berikutnya memakai apiSchema/rules/endpoint versi tsb.</>
                    )}
                  </p>
                  <p className="opacity-90">
                    JOLT spec kategori yang ada mungkin di-generate untuk versi lain →{" "}
                    <a href={joltSpecLink} className="font-medium underline hover:no-underline">
                      cek &amp; regenerate spec untuk {channelLabel} →
                    </a>
                  </p>
                </div>
              )}

              {saveError && (
                <div className="px-3 py-2.5 rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 text-sm text-error-700 dark:text-error-400">
                  {saveError}
                </div>
              )}

              {/* Footer actions */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div>
                  {currentPinned && (
                    <button
                      onClick={handleClear}
                      disabled={saving}
                      className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      title="Kembali mengikuti versi ACTIVE channel (otomatis ikut saat channel bump versi)"
                    >
                      Clear pin
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePrimary}
                    disabled={saving || !changed}
                    className={`px-4 py-2 text-sm font-medium rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                      confirming ? "bg-amber-500 hover:bg-amber-600" : "bg-brand-600 hover:bg-brand-700"
                    }`}
                  >
                    {saving
                      ? "Saving…"
                      : confirming
                      ? `Konfirmasi pin → ${selected}`
                      : selected === FOLLOW
                      ? "Follow active"
                      : `Pin ke ${selected}`}
                  </button>
                </div>
              </div>

              {/* Clear = back to active explainer (§4.4) */}
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Clear pin membuat store mengikuti versi <strong>ACTIVE</strong> terkini — otomatis ikut saat channel bump versi.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
