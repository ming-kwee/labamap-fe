"use client";
import React, { useEffect, useState, useCallback } from "react";
import type { ChannelStoreConnection, StoreConnectionRequest } from "../../types/channelStore";
import { ChannelStoreService } from "../../services/channelStoreService";
import ChannelTypeBadge from "./ChannelTypeBadge";
import ConnectStoreModal from "./ConnectStoreModal";

const ORGANIZATION_ID = "org_123"; // pulled from auth context in production

/**
 * Fix Issue #2: Java Instant may serialise as an epoch-seconds number
 * (write-dates-as-timestamps: true) or as an ISO 8601 string.
 * new Date() treats numbers as milliseconds, but Instant epoch values are seconds — off by 1000x.
 * Heuristic: any number < 1e12 is treated as seconds and converted.
 */
function formatDate(value: string | number) {
  if (!value) return "—";
  let ms: number;
  if (typeof value === "number") {
    ms = value < 1e12 ? value * 1000 : value;
  } else {
    ms = Date.parse(value);
  }
  if (isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function StoreCard({ store, onDeactivate }: { store: ChannelStoreConnection; onDeactivate: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  async function handleDeactivate() {
    setLoading(true);
    setDeactivateError(null);
    try {
      await ChannelStoreService.deactivateStore(store.storeId, ORGANIZATION_ID);
      onDeactivate(store.storeId);
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : "Failed to deactivate store");
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{store.storeName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{store.storeUrl}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full text-xs font-medium px-2 py-0.5 ${
          store.isActive
            ? "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400"
            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${store.isActive ? "bg-success-500" : "bg-gray-400"}`} />
          {store.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ChannelTypeBadge channelType={store.channelType} size="sm" />
        {store.region && (
          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full px-2 py-0.5">
            {store.region}
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          #{store.displayOrder}
        </span>
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
        <p>Connected: {formatDate(store.connectedAt)}</p>
        {store.lastSyncedAt && <p>Last sync: {formatDate(store.lastSyncedAt)}</p>}
      </div>

      {deactivateError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-3 py-2">
          <p className="text-xs text-error-700 dark:text-error-400">{deactivateError}</p>
        </div>
      )}

      <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
        {confirming ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeactivate}
              disabled={loading}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-error-500 text-white hover:bg-error-600 transition-colors disabled:opacity-60"
            >
              {loading ? "Deactivating…" : "Confirm"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChannelStoresDashboard() {
  const [stores, setStores] = useState<ChannelStoreConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadStores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ChannelStoreService.listStores(ORGANIZATION_ID);
      setStores(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStores(); }, [loadStores]);

  async function handleConnect(request: StoreConnectionRequest) {
    const newStore = await ChannelStoreService.connectStore(ORGANIZATION_ID, request);
    setStores((prev) => [...prev, newStore].sort((a, b) => a.displayOrder - b.displayOrder));
  }

  function handleDeactivated(storeId: string) {
    setStores((prev) => prev.filter((s) => s.storeId !== storeId));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel Stores</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage connected store instances for your organization
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          + Connect Store
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block h-8 w-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading stores…</p>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-6 py-5">
          <p className="font-medium text-error-700 dark:text-error-400">Failed to load stores</p>
          <p className="text-sm text-error-600 dark:text-error-300 mt-1">{error}</p>
          <button
            onClick={loadStores}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-400 hover:bg-error-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && stores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">
            🔌
          </div>
          <p className="font-medium text-gray-900 dark:text-white">No stores connected</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connect your first store to start publishing products.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            Connect Store
          </button>
        </div>
      )}

      {!loading && !error && stores.length > 0 && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {stores.length} store{stores.length !== 1 ? "s" : ""} connected
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => (
              <StoreCard key={store.storeId} store={store} onDeactivate={handleDeactivated} />
            ))}
          </div>
        </>
      )}

      {showModal && (
        <ConnectStoreModal
          organizationId={ORGANIZATION_ID}
          onClose={() => setShowModal(false)}
          onConnect={handleConnect}
        />
      )}
    </div>
  );
}
