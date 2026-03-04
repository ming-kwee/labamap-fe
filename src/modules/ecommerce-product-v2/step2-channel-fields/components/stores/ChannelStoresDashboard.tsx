"use client";
import React, { useEffect, useState, useCallback } from "react";
import type { ChannelStoreConnection, StoreConnectionRequest } from "../../types/channelStore";
import { ChannelStoreService } from "../../services/channelStore.service";
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

interface StoreCardProps {
  store: ChannelStoreConnection;
  onEdit: (store: ChannelStoreConnection) => void;
  onDeactivate: (id: string) => void;
  onReactivate: (store: ChannelStoreConnection) => void;
  onDelete: (id: string) => void;
}

function StoreCard({ store, onEdit, onDeactivate, onReactivate, onDelete }: StoreCardProps) {
  const [confirming, setConfirming] = useState<"deactivate" | "delete" | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDeactivate() {
    setLoading(true);
    setActionError(null);
    try {
      await ChannelStoreService.deactivateStore(store.storeId, ORGANIZATION_ID);
      onDeactivate(store.storeId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to deactivate store");
      setLoading(false);
      setConfirming(null);
    }
  }

  async function handleReactivate() {
    setLoading(true);
    setActionError(null);
    try {
      const updated = await ChannelStoreService.reactivateStore(store.storeId, ORGANIZATION_ID);
      onReactivate(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reactivate store");
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    setActionError(null);
    try {
      await ChannelStoreService.deleteStore(store.storeId, ORGANIZATION_ID);
      onDelete(store.storeId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete store");
      setLoading(false);
      setConfirming(null);
    }
  }

  const isInactive = !store.isActive;

  return (
    <div className={`bg-white dark:bg-white/[0.03] border rounded-2xl p-5 flex flex-col gap-4 ${
      isInactive
        ? "border-gray-200 dark:border-gray-800 opacity-60"
        : "border-gray-200 dark:border-gray-800"
    }`}>
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

      {actionError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-3 py-2">
          <p className="text-xs text-error-700 dark:text-error-400">{actionError}</p>
        </div>
      )}

      <div className="pt-1 border-t border-gray-100 dark:border-gray-800 space-y-2">
        {/* Confirmation row */}
        {confirming ? (
          <div className="space-y-1.5">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              {confirming === "delete"
                ? "Permanently delete this store and all its data?"
                : "Pause this store connection?"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirming === "delete" ? handleDelete : handleDeactivate}
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-error-500 text-white hover:bg-error-600 transition-colors disabled:opacity-60"
              >
                {loading
                  ? confirming === "delete" ? "Deleting…" : "Deactivating…"
                  : confirming === "delete" ? "Delete" : "Confirm"}
              </button>
            </div>
          </div>
        ) : isInactive ? (
          /* Inactive store — reactivate or delete */
          <div className="flex gap-2">
            <button
              onClick={handleReactivate}
              disabled={loading}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-success-500 text-white hover:bg-success-600 transition-colors disabled:opacity-60"
            >
              {loading ? "Reactivating…" : "Reactivate"}
            </button>
            <button
              onClick={() => { setActionError(null); setConfirming("delete"); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-error-200 dark:border-error-500/40 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
            >
              Delete
            </button>
          </div>
        ) : (
          /* Active store — edit or deactivate */
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(store)}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => { setActionError(null); setConfirming("deactivate"); }}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Deactivate
            </button>
          </div>
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
  const [editingStore, setEditingStore] = useState<ChannelStoreConnection | null>(null);

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
    if (request.storeId) {
      // Edit mode — update existing store
      const updated = await ChannelStoreService.updateStore(request.storeId, ORGANIZATION_ID, request);
      setStores((prev) =>
        prev
          .map((s) => (s.storeId === updated.storeId ? updated : s))
          .sort((a, b) => a.displayOrder - b.displayOrder)
      );
    } else {
      // Connect mode — add new store
      const newStore = await ChannelStoreService.connectStore(ORGANIZATION_ID, request);
      setStores((prev) => [...prev, newStore].sort((a, b) => a.displayOrder - b.displayOrder));
    }
  }

  function handleDeactivated(storeId: string) {
    // Keep the store in state with isActive: false so the user can reactivate
    setStores((prev) => prev.map((s) => s.storeId === storeId ? { ...s, isActive: false } : s));
  }

  function handleReactivated(updated: ChannelStoreConnection) {
    setStores((prev) =>
      prev
        .map((s) => (s.storeId === updated.storeId ? updated : s))
        .sort((a, b) => a.displayOrder - b.displayOrder)
    );
  }

  function handleDeleted(storeId: string) {
    setStores((prev) => prev.filter((s) => s.storeId !== storeId));
  }

  function openEdit(store: ChannelStoreConnection) {
    setEditingStore(store);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingStore(null);
  }

  const activeStores = stores.filter((s) => s.isActive);
  const inactiveStores = stores.filter((s) => !s.isActive);

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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block h-8 w-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading stores…</p>
          </div>
        </div>
      )}

      {/* API error */}
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

      {/* Empty state */}
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

      {/* Active stores */}
      {!loading && !error && activeStores.length > 0 && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activeStores.length} active store{activeStores.length !== 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeStores.map((store) => (
              <StoreCard
                key={store.storeId}
                store={store}
                onEdit={openEdit}
                onDeactivate={handleDeactivated}
                onReactivate={handleReactivated}
                onDelete={handleDeleted}
              />
            ))}
          </div>
        </>
      )}

      {/* Inactive stores */}
      {!loading && !error && inactiveStores.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Inactive ({inactiveStores.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveStores.map((store) => (
              <StoreCard
                key={store.storeId}
                store={store}
                onEdit={openEdit}
                onDeactivate={handleDeactivated}
                onReactivate={handleReactivated}
                onDelete={handleDeleted}
              />
            ))}
          </div>
        </div>
      )}

      {/* Connect / Edit modal */}
      {showModal && (
        <ConnectStoreModal
          organizationId={ORGANIZATION_ID}
          onClose={closeModal}
          onConnect={handleConnect}
          existingStore={editingStore ?? undefined}
        />
      )}
    </div>
  );
}
