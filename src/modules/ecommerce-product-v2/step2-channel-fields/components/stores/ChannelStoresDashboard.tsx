"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ChannelStoreConnection,
  StoreConnectionRequest,
  ConnectionStatus,
} from "../../types/channelStore";
import { ChannelStoreService } from "../../services/channelStore.service";
import { useAuth } from "@/shared/contexts/AuthContext";
import ChannelTypeBadge from "./ChannelTypeBadge";
import ConnectStoreModal from "./ConnectStoreModal";

/** OAuth-capable channels — these use the reconnect button, not the edit button */
const OAUTH_CHANNELS = new Set<string>(["shopify", "wix", "tiktok", "amazon", "ebay"]);

/** `connectionStatus` display config — drives badge color and label */
const STATUS_CONFIG: Record<ConnectionStatus, { label: string; badgeClass: string; dotClass: string }> = {
  ACTIVE:             { label: "Active",             badgeClass: "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400", dotClass: "bg-success-500" },
  RECONNECT_REQUIRED: { label: "Reconnect Required", badgeClass: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",         dotClass: "bg-amber-400" },
  DISCONNECTED:       { label: "Disconnected",       badgeClass: "bg-error-50 dark:bg-error-500/10 text-error-700 dark:text-error-400",           dotClass: "bg-error-500" },
  INACTIVE:           { label: "Inactive",           badgeClass: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",                 dotClass: "bg-gray-400" },
};

function deriveStatus(store: ChannelStoreConnection): ConnectionStatus {
  if (store.connectionStatus) return store.connectionStatus;
  // Fallback for stores that predate Phase E (no connectionStatus field)
  return store.isActive ? "ACTIVE" : "INACTIVE";
}

/**
 * Fix Issue #2: Java Instant may serialise as an epoch-seconds number.
 * new Date() treats numbers as milliseconds, but Instant epoch values are seconds — off by 1000x.
 */
function formatDate(value: string | number | undefined) {
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

// ── Channel labels for toast messages ─────────────────────────────────────────
const CHANNEL_LABELS: Record<string, string> = {
  shopify: "Shopify", wix: "WIX", amazon: "Amazon", ebay: "eBay",
  tiktok: "TikTok Shop", lazada: "Lazada", tokopedia: "Tokopedia",
  facebook: "Facebook Shop", shopee: "Shopee", walmart: "Walmart",
};

// ── Toast ─────────────────────────────────────────────────────────────────────
interface ToastProps { message: string; type: "success" | "error"; onDismiss: () => void }

function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`fixed top-4 right-4 z-[60] max-w-sm rounded-2xl border px-5 py-4 shadow-lg flex items-start gap-3 ${
      type === "success"
        ? "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30"
        : "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/30"
    }`}>
      <span className={`mt-0.5 text-lg ${type === "success" ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}>
        {type === "success" ? "✓" : "✗"}
      </span>
      <p className={`text-sm flex-1 ${type === "success" ? "text-success-700 dark:text-success-300" : "text-error-700 dark:text-error-300"}`}>
        {message}
      </p>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1">✕</button>
    </div>
  );
}

// ── StoreCard ─────────────────────────────────────────────────────────────────
interface StoreCardProps {
  store: ChannelStoreConnection;
  orgId: string;
  onEdit:        (store: ChannelStoreConnection) => void;
  onReconnect:   (store: ChannelStoreConnection) => void;
  onDeactivate:  (id: string) => void;
  onReactivate:  (store: ChannelStoreConnection) => void;
  onDelete:      (id: string) => void;
}

function StoreCard({ store, orgId, onEdit, onReconnect, onDeactivate, onReactivate, onDelete }: StoreCardProps) {
  const [confirming,   setConfirming]   = useState<"deactivate" | "delete" | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [actionError,  setActionError]  = useState<string | null>(null);

  const status = deriveStatus(store);
  const cfg    = STATUS_CONFIG[status];
  const isOAuth = OAUTH_CHANNELS.has(store.channelType);

  async function handleDeactivate() {
    setLoading(true); setActionError(null);
    try {
      await ChannelStoreService.deactivateStore(store.storeId, orgId);
      onDeactivate(store.storeId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to deactivate");
      setLoading(false); setConfirming(null);
    }
  }

  async function handleReactivate() {
    setLoading(true); setActionError(null);
    try {
      const updated = await ChannelStoreService.reactivateStore(store.storeId, orgId);
      onReactivate(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reactivate");
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true); setActionError(null);
    try {
      await ChannelStoreService.deleteStore(store.storeId, orgId);
      onDelete(store.storeId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete");
      setLoading(false); setConfirming(null);
    }
  }

  return (
    <div className={`bg-white dark:bg-white/[0.03] border rounded-2xl p-5 flex flex-col gap-4 ${
      status === "INACTIVE" || status === "DISCONNECTED"
        ? "border-gray-200 dark:border-gray-800 opacity-75"
        : "border-gray-200 dark:border-gray-800"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{store.storeName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{store.storeUrl}</p>
        </div>
        {/* Connection status badge */}
        <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full text-xs font-medium px-2 py-0.5 ${cfg.badgeClass}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
          {cfg.label}
        </span>
      </div>

      {/* Channel + region row */}
      <div className="flex items-center gap-2 flex-wrap">
        <ChannelTypeBadge channelType={store.channelType} size="sm" />
        {store.region && (
          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full px-2 py-0.5">
            {store.region}
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">#{store.displayOrder}</span>
      </div>

      {/* Dates */}
      <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
        <p>Connected: {formatDate(store.connectedAt)}</p>
        {store.lastSyncedAt && <p>Last sync: {formatDate(store.lastSyncedAt)}</p>}
        {store.disconnectedAt && (
          <p className="text-error-500 dark:text-error-400">
            Disconnected: {formatDate(store.disconnectedAt)}
            {store.disconnectReason && ` (${store.disconnectReason.replace(/_/g, " ")})`}
          </p>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-3 py-2">
          <p className="text-xs text-error-700 dark:text-error-400">{actionError}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="pt-1 border-t border-gray-100 dark:border-gray-800 space-y-2">
        {confirming ? (
          <div className="space-y-1.5">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              {confirming === "delete"
                ? "Permanently delete this store and all its data?"
                : "Pause this store connection?"}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(null)} disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={confirming === "delete" ? handleDelete : handleDeactivate} disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-error-500 text-white hover:bg-error-600 transition-colors disabled:opacity-60">
                {loading
                  ? (confirming === "delete" ? "Deleting…" : "Deactivating…")
                  : (confirming === "delete" ? "Delete" : "Confirm")}
              </button>
            </div>
          </div>
        ) : status === "ACTIVE" ? (
          <div className="flex gap-2">
            {/* OAuth channels: no Edit (credentials are managed by OAuth); manual channels: show Edit */}
            {!isOAuth && (
              <button onClick={() => { setActionError(null); onEdit(store); }}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Edit
              </button>
            )}
            <button onClick={() => { setActionError(null); setConfirming("deactivate"); }}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Deactivate
            </button>
          </div>
        ) : status === "RECONNECT_REQUIRED" ? (
          <div className="flex gap-2">
            <button onClick={() => { setActionError(null); onReconnect(store); }}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium">
              Reconnect
            </button>
            <button onClick={() => { setActionError(null); setConfirming("deactivate"); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Deactivate
            </button>
          </div>
        ) : status === "DISCONNECTED" ? (
          <div className="flex gap-2">
            <button onClick={() => { setActionError(null); onReconnect(store); }}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors font-medium">
              Reconnect
            </button>
            <button onClick={() => { setActionError(null); setConfirming("delete"); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-error-200 dark:border-error-500/40 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors">
              Delete
            </button>
          </div>
        ) : (
          /* INACTIVE */
          <div className="flex gap-2">
            <button onClick={handleReactivate} disabled={loading}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-success-500 text-white hover:bg-success-600 transition-colors disabled:opacity-60">
              {loading ? "Reactivating…" : "Reactivate"}
            </button>
            <button onClick={() => { setActionError(null); setConfirming("delete"); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-error-200 dark:border-error-500/40 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI tiles ─────────────────────────────────────────────────────────────────
interface KpiTilesProps { stores: ChannelStoreConnection[]; loading: boolean }

function KpiTiles({ stores, loading }: KpiTilesProps) {
  const counts = {
    active:    stores.filter((s) => deriveStatus(s) === "ACTIVE").length,
    reconnect: stores.filter((s) => deriveStatus(s) === "RECONNECT_REQUIRED").length,
    disconnected: stores.filter((s) => deriveStatus(s) === "DISCONNECTED").length,
    inactive:  stores.filter((s) => deriveStatus(s) === "INACTIVE").length,
  };
  const tiles = [
    { label: "Active",       value: counts.active,       sub: "stores",           icon: "✓", bg: "bg-success-50 dark:bg-success-500/10",  text: "text-success-700 dark:text-success-400" },
    { label: "Reconnect",    value: counts.reconnect,    sub: "need action",      icon: "⚠", bg: "bg-amber-50 dark:bg-amber-500/10",       text: "text-amber-700 dark:text-amber-400" },
    { label: "Disconnected", value: counts.disconnected, sub: "by marketplace",   icon: "✗", bg: "bg-error-50 dark:bg-error-500/10",       text: "text-error-700 dark:text-error-400" },
    { label: "Inactive",     value: counts.inactive,     sub: "paused",           icon: "–", bg: "bg-gray-100 dark:bg-gray-800/80",        text: "text-gray-600 dark:text-gray-400" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-2xl p-5 flex items-center gap-4 ${t.bg}`}>
          <span className={`text-2xl ${t.text}`}>{t.icon}</span>
          <div>
            <p className={`text-3xl font-bold ${t.text}`}>{loading ? "—" : t.value}</p>
            <p className={`text-xs font-medium ${t.text} opacity-70`}>{t.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
function ChannelStoresDashboardInner() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const searchParams = useSearchParams();
  const [stores,      setStores]      = useState<ChannelStoreConnection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const [editingStore, setEditingStore] = useState<ChannelStoreConnection | null>(null);
  const [toast,       setToast]       = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadStores = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      // listAllStores includes active + inactive + disconnected (includeInactive=true)
      const data = await ChannelStoreService.listAllStores(orgId);
      setStores(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stores");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadStores(); }, [loadStores]);

  // ── OAuth callback detection (Phase C) ──────────────────────────────────
  useEffect(() => {
    const connected   = searchParams.get("connected");
    const reconnected = searchParams.get("reconnected");
    const errorParam  = searchParams.get("error");

    if (connected) {
      const label = CHANNEL_LABELS[connected] ?? connected;
      setToast({ message: `${label} store connected successfully!`, type: "success" });
      loadStores();
      window.history.replaceState({}, "", "/channels/stores");
    } else if (reconnected) {
      const label = CHANNEL_LABELS[reconnected] ?? reconnected;
      setToast({ message: `${label} reconnected successfully!`, type: "success" });
      loadStores();
      window.history.replaceState({}, "", "/channels/stores");
    } else if (errorParam) {
      setToast({ message: `Connection failed: ${decodeURIComponent(errorParam)}`, type: "error" });
      window.history.replaceState({}, "", "/channels/stores");
    }
  }, [searchParams, loadStores]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleConnect(request: StoreConnectionRequest) {
    if (request.storeId) {
      const updated = await ChannelStoreService.updateStore(request.storeId, orgId, request);
      setStores((prev) =>
        prev.map((s) => (s.storeId === updated.storeId ? updated : s))
          .sort((a, b) => a.displayOrder - b.displayOrder)
      );
    } else {
      const newStore = await ChannelStoreService.connectStore(orgId, request);
      setStores((prev) => [...prev, newStore].sort((a, b) => a.displayOrder - b.displayOrder));
    }
  }

  function handleDeactivated(storeId: string) {
    setStores((prev) => prev.map((s) =>
      s.storeId === storeId ? { ...s, isActive: false, connectionStatus: "INACTIVE" } : s
    ));
  }

  function handleReactivated(updated: ChannelStoreConnection) {
    setStores((prev) =>
      prev.map((s) => (s.storeId === updated.storeId ? updated : s))
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

  function openReconnect(store: ChannelStoreConnection) {
    setEditingStore(store);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingStore(null);
  }

  // ── Sort by status priority then displayOrder ─────────────────────────────
  const STATUS_PRIORITY: Record<ConnectionStatus, number> = {
    RECONNECT_REQUIRED: 0, DISCONNECTED: 1, ACTIVE: 2, INACTIVE: 3,
  };

  const sortedStores = [...stores].sort((a, b) => {
    const pa = STATUS_PRIORITY[deriveStatus(a)] ?? 4;
    const pb = STATUS_PRIORITY[deriveStatus(b)] ?? 4;
    if (pa !== pb) return pa - pb;
    return a.displayOrder - b.displayOrder;
  });

  const attentionStores = sortedStores.filter((s) => {
    const st = deriveStatus(s);
    return st === "RECONNECT_REQUIRED" || st === "DISCONNECTED";
  });
  const activeStores   = sortedStores.filter((s) => deriveStatus(s) === "ACTIVE");
  const inactiveStores = sortedStores.filter((s) => deriveStatus(s) === "INACTIVE");

  return (
    <div className="space-y-6">
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel Stores</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage connected store integrations for your organization
          </p>
        </div>
        <button
          onClick={() => { setEditingStore(null); setShowModal(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          + Connect Store
        </button>
      </div>

      {/* KPI tiles */}
      <KpiTiles stores={stores} loading={loading} />

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
          <button onClick={loadStores}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-400 hover:bg-error-200 transition-colors">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && stores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">🔌</div>
          <p className="font-medium text-gray-900 dark:text-white">No stores connected</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connect your first store to start publishing products.</p>
          <button onClick={() => setShowModal(true)}
            className="mt-4 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors">
            Connect Store
          </button>
        </div>
      )}

      {/* Attention required section (RECONNECT_REQUIRED + DISCONNECTED) */}
      {!loading && !error && attentionStores.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Attention required ({attentionStores.length})
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {attentionStores.map((store) => (
              <StoreCard key={store.storeId} store={store} orgId={orgId}
                onEdit={openEdit} onReconnect={openReconnect}
                onDeactivate={handleDeactivated} onReactivate={handleReactivated} onDelete={handleDeleted} />
            ))}
          </div>
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
              <StoreCard key={store.storeId} store={store} orgId={orgId}
                onEdit={openEdit} onReconnect={openReconnect}
                onDeactivate={handleDeactivated} onReactivate={handleReactivated} onDelete={handleDeleted} />
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
              <StoreCard key={store.storeId} store={store} orgId={orgId}
                onEdit={openEdit} onReconnect={openReconnect}
                onDeactivate={handleDeactivated} onReactivate={handleReactivated} onDelete={handleDeleted} />
            ))}
          </div>
        </div>
      )}

      {/* Connect / Edit / Reconnect modal */}
      {showModal && (
        <ConnectStoreModal
          organizationId={orgId}
          onClose={closeModal}
          onConnect={handleConnect}
          existingStore={editingStore ?? undefined}
        />
      )}
    </div>
  );
}

/**
 * Wrapped in Suspense because useSearchParams() requires it in Next.js 14 App Router.
 */
export default function ChannelStoresDashboard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="inline-block h-8 w-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      </div>
    }>
      <ChannelStoresDashboardInner />
    </Suspense>
  );
}
