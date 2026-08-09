"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/shared/contexts/AuthContext";
import {
  AdminChannelStore,
  CredentialEntry,
  CredentialFieldSchema,
  StoreConnectionRequest,
  UpdateStoreRequest,
  CHANNEL_TYPES,
  CHANNEL_LABELS,
  CHANNEL_COLORS,
} from "../_types/channel-store-admin";
import { ChannelStoreAdminService } from "../_services/channel-store-admin.service";
import VersionPinModal from "./VersionPinModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const KeyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const StoreIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
    <path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ─── Helpers ────────────────────────────────────────────────────────────────────

function ChannelBadge({ channelType }: { channelType: string }) {
  const color = CHANNEL_COLORS[channelType] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>
      {CHANNEL_LABELS[channelType] ?? channelType}
    </span>
  );
}

function StatusBadge({ store }: { store: AdminChannelStore }) {
  const status = store.connectionStatus ?? (store.isActive ? "ACTIVE" : "INACTIVE");
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    ACTIVE:             { cls: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400", dot: "bg-success-500", label: "Active" },
    RECONNECT_REQUIRED: { cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",   dot: "bg-amber-500",   label: "Reconnect Required" },
    DISCONNECTED:       { cls: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",   dot: "bg-error-500",   label: "Disconnected" },
    INACTIVE:           { cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",          dot: "bg-gray-400",    label: "Inactive" },
  };
  const v = map[status] ?? map.INACTIVE;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${v.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />{v.label}
    </span>
  );
}

const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
  </svg>
);

/** Per-store API version pin indicator + trigger (Phase 3). null pin → "Follow active". */
function VersionPinCell({ store, onClick }: { store: AdminChannelStore; onClick: () => void }) {
  const pinned = store.apiVersion != null && store.apiVersion !== "";
  return (
    <button
      onClick={onClick}
      title={pinned
        ? `Pinned to ${store.apiVersion} — click to change`
        : "Following the channel's active version — click to pin"}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
        pinned
          ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {pinned ? <><PinIcon /> {store.apiVersion}</> : "Follow active"}
    </button>
  );
}

function formatDate(val: string | number | undefined): string {
  if (!val) return "—";
  const ts = typeof val === "number" ? val * 1000 : Date.parse(val);
  if (isNaN(ts)) return String(val);
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ─── Toast ───────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm ${
      type === "success"
        ? "bg-success-50 border-success-200 text-success-800 dark:bg-success-500/15 dark:border-success-500/30 dark:text-success-300"
        : "bg-error-50 border-error-200 text-error-800 dark:bg-error-500/15 dark:border-error-500/30 dark:text-error-300"
    }`}>
      {type === "success" ? <CheckIcon /> : <XIcon />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100"><XIcon /></button>
    </div>
  );
}

// Sentinel value used by the backend when masking stored credentials.
const MASKED = "***MASKED***";

// ─── Credential Fields (dynamic) ────────────────────────────────────────────────

function CredentialFields({
  schema,
  values,
  onChange,
}: {
  schema: CredentialFieldSchema[];
  values: Record<string, string>;
  onChange: (credId: string, chnlCredName: string, value: string) => void;
}) {
  const [show, setShow] = useState<Record<string, boolean>>({});
  if (schema.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-500 italic">No credential schema found for this channel type.</p>
  );
  return (
    <div className="space-y-3">
      {schema.map((field) => {
        const rawVal  = values[field.credId] ?? "";
        const isMasked = rawVal === MASKED;
        const isShown  = show[field.credId] === true;

        return (
          <div key={field.credId}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="relative">
              <input
                type={field.sensitive && !isShown ? "password" : "text"}
                value={rawVal}
                onChange={(e) => onChange(field.credId, field.chnlCredName, e.target.value)}
                placeholder={field.sensitive ? (isMasked ? "" : "Enter new value…") : field.label}
                className={`w-full px-3 py-2 text-sm rounded-xl border bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 pr-24 ${
                  isMasked
                    ? "border-amber-200 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-500/5"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isMasked && (
                  <button
                    type="button"
                    onClick={() => onChange(field.credId, field.chnlCredName, "")}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors"
                    title="Clear to enter new value"
                  >
                    Replace
                  </button>
                )}
                {field.sensitive && !isMasked && (
                  <button
                    type="button"
                    onClick={() => setShow((p) => ({ ...p, [field.credId]: !p[field.credId] }))}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    {isShown ? "Hide" : "Show"}
                  </button>
                )}
              </div>
            </div>
            {isMasked && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                Current value is stored and active. Click Replace to enter a new value.
              </p>
            )}
            {field.helpText && !isMasked && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{field.helpText}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Store Form Modal (Create / Edit) ───────────────────────────────────────────

function StoreFormModal({
  orgId,
  store,
  onClose,
  onSaved,
}: {
  orgId: string;
  store?: AdminChannelStore;
  onClose: () => void;
  onSaved: (s: AdminChannelStore) => void;
}) {
  const isEdit = Boolean(store);
  const [channelType, setChannelType] = useState(store?.channelType ?? "");
  const [storeName, setStoreName]     = useState(store?.storeName ?? "");
  const [storeUrl, setStoreUrl]       = useState(store?.storeUrl ?? "");
  const [region, setRegion]           = useState(store?.region ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(store?.displayOrder ?? 99));
  const [credValues, setCredValues]   = useState<Record<string, string>>({});
  const [credSchema, setCredSchema]   = useState<CredentialFieldSchema[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const loadSchema = useCallback(async (ct: string, existingCredentials?: Record<string, string>) => {
    if (!ct) { setCredSchema([]); return; }
    setSchemaLoading(true);
    try {
      const schema = await ChannelStoreAdminService.getCredentialSchema(ct);
      setCredSchema(schema);
      // Pre-populate with existing masked values so the admin sees which fields
      // are already configured. The MASKED sentinel is mapped via chnlCredName → credId.
      if (existingCredentials && Object.keys(existingCredentials).length > 0) {
        const initial: Record<string, string> = {};
        for (const field of schema) {
          const existing = existingCredentials[field.chnlCredName];
          if (existing) initial[field.credId] = existing;
        }
        setCredValues(initial);
      }
    } catch {
      setCredSchema([]);
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  const handleChannelTypeChange = useCallback((ct: string) => {
    setChannelType(ct);
    setCredValues({});
    loadSchema(ct);
  }, [loadSchema]);

  React.useEffect(() => {
    if (store?.channelType) loadSchema(store.channelType, store.credentials);
  }, [store, loadSchema]);

  function handleCredChange(credId: string, chnlCredName: string, value: string) {
    setCredValues((p) => ({ ...p, [credId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!channelType || !storeName.trim() || !storeUrl.trim()) {
      setError("Channel type, store name, and store URL are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Exclude masked (unchanged) fields — backend interprets missing credentials as "keep existing"
      const credentials: CredentialEntry[] = credSchema
        .filter((f) => credValues[f.credId]?.trim() && credValues[f.credId] !== MASKED)
        .map((f) => ({ credId: f.credId, chnlCredName: f.chnlCredName, chnlCredValue: credValues[f.credId] }));

      let saved: AdminChannelStore;
      if (isEdit && store) {
        const req: UpdateStoreRequest = {
          storeName: storeName.trim() || undefined,
          storeUrl:  storeUrl.trim()  || undefined,
          region:    region.trim()    || undefined,
          displayOrder: Number(displayOrder) || undefined,
          ...(credentials.length > 0 ? { credentials } : {}),
        };
        saved = await ChannelStoreAdminService.updateStore(orgId, store.storeId, req);
      } else {
        const req: StoreConnectionRequest = {
          channelType,
          storeName: storeName.trim(),
          storeUrl:  storeUrl.trim(),
          region:    region.trim() || undefined,
          displayOrder: Number(displayOrder) || 99,
          credentials,
        };
        saved = await ChannelStoreAdminService.createStore(orgId, req);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {isEdit ? `Edit ${store?.storeName}` : "Add Store Connection"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><XIcon /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Organization ID (read-only — set by context) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization ID</label>
            <input
              value={orgId}
              readOnly
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-default"
            />
          </div>

          {/* Channel Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel Type <span className="text-red-500">*</span>
            </label>
            {isEdit ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <ChannelBadge channelType={channelType} />
                <span className="text-xs text-gray-400 dark:text-gray-500">(immutable)</span>
              </div>
            ) : (
              <select
                value={channelType}
                onChange={(e) => handleChannelTypeChange(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              >
                <option value="">Select channel…</option>
                {CHANNEL_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{CHANNEL_LABELS[ct] ?? ct}</option>
                ))}
              </select>
            )}
          </div>

          {/* Store Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Store Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
              placeholder="e.g. My Shopify Store"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>

          {/* Store URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Store URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              required
              placeholder="https://your-store.myshopify.com"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>

          {/* Region + Display Order */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Region</label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. us-east"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Order</label>
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                min={0}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
          </div>

          {/* Credentials */}
          {channelType && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Credentials {isEdit && <span className="text-xs font-normal text-gray-400 dark:text-gray-500">(leave blank to keep existing)</span>}
              </p>
              {schemaLoading ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">Loading credential fields…</p>
              ) : (
                <CredentialFields schema={credSchema} values={credValues} onChange={handleCredChange} />
              )}
            </div>
          )}

          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 text-sm text-error-700 dark:text-error-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Store"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Credentials Update Modal ────────────────────────────────────────────────────

function CredentialsModal({
  orgId,
  store,
  onClose,
  onSaved,
}: {
  orgId: string;
  store: AdminChannelStore;
  onClose: () => void;
  onSaved: (s: AdminChannelStore) => void;
}) {
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [credSchema, setCredSchema] = useState<CredentialFieldSchema[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  React.useEffect(() => {
    ChannelStoreAdminService.getCredentialSchema(store.channelType)
      .then((schema) => {
        setCredSchema(schema);
        // Pre-populate with existing masked values so admin can see which fields are configured.
        // Replace button clears a field to let them type a new value.
        const initial: Record<string, string> = {};
        for (const field of schema) {
          const existing = store.credentials?.[field.chnlCredName];
          if (existing) initial[field.credId] = existing;
        }
        setCredValues(initial);
      })
      .catch(() => setCredSchema([]))
      .finally(() => setLoading(false));
  }, [store.channelType, store.credentials]);

  function handleCredChange(credId: string, chnlCredName: string, value: string) {
    setCredValues((p) => ({ ...p, [credId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only send fields that have been explicitly replaced (non-masked, non-empty)
    const credentials: CredentialEntry[] = credSchema
      .filter((f) => credValues[f.credId]?.trim() && credValues[f.credId] !== MASKED)
      .map((f) => ({ credId: f.credId, chnlCredName: f.chnlCredName, chnlCredValue: credValues[f.credId] }));

    if (credentials.length === 0) {
      setError("Click Replace on at least one field and enter a new value to update.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await ChannelStoreAdminService.updateCredentials(orgId, store.storeId, credentials);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Update Credentials</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{store.storeName} · <ChannelBadge channelType={store.channelType} /></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><XIcon /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Existing credentials are masked. Only filled fields will be updated — leave blank to keep existing values.
          </p>
          {loading ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Loading credential schema…</p>
          ) : (
            <CredentialFields schema={credSchema} values={credValues} onChange={handleCredChange} />
          )}
          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 text-sm text-error-700 dark:text-error-400">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || loading} className="px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? "Saving…" : "Update Credentials"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ────────────────────────────────────────────────────────

function DeleteConfirmModal({
  store,
  onClose,
  onDeleted,
  orgId,
}: {
  store: AdminChannelStore;
  onClose: () => void;
  onDeleted: (storeId: string) => void;
  orgId: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await ChannelStoreAdminService.deleteStore(orgId, store.storeId);
      onDeleted(store.storeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-error-50 dark:bg-error-500/10 flex items-center justify-center flex-shrink-0 text-error-600 dark:text-error-400">
            <TrashIcon />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Delete Store Connection</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Hard-delete <strong>{store.storeName}</strong>? This cannot be undone.
              Channel product data referencing this store is not automatically removed.
            </p>
          </div>
        </div>
        {error && (
          <div className="px-3 py-2.5 rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 text-sm text-error-700 dark:text-error-400">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm font-medium rounded-xl bg-error-600 text-white hover:bg-error-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function ChannelStoreAdminPage() {
  const { organization } = useAuth();
  const authOrgId = organization?.organizationId ?? "";

  const [orgInput, setOrgInput]         = useState(authOrgId);
  const [orgId, setOrgId]               = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [statusFilter, setStatusFilter]   = useState<"all" | "active" | "inactive">("all");
  const [searchText, setSearchText]       = useState("");
  const [stores, setStores]               = useState<AdminChannelStore[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [toast, setToast]                 = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [createModal, setCreateModal]           = useState(false);
  const [editStore, setEditStore]               = useState<AdminChannelStore | null>(null);
  const [credStore, setCredStore]               = useState<AdminChannelStore | null>(null);
  const [deleteStore, setDeleteStore]           = useState<AdminChannelStore | null>(null);
  const [versionStore, setVersionStore]         = useState<AdminChannelStore | null>(null);
  const [actioning, setActioning]               = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadStores = useCallback(async (oid: string, ct?: string) => {
    if (!oid.trim()) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await ChannelStoreAdminService.listStores(oid.trim(), ct || undefined, true);
      setStores(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load stores");
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load when auth resolves — keeps input in sync and fires load once.
  // A ref prevents re-triggering if auth re-renders (e.g. token refresh).
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current || !authOrgId) return;
    initialLoadDone.current = true;
    setOrgInput(authOrgId);
    setOrgId(authOrgId);
    loadStores(authOrgId);
  }, [authOrgId, loadStores]);

  function handleLoad() {
    if (!orgInput.trim()) return;
    setOrgId(orgInput.trim());
    loadStores(orgInput.trim(), channelFilter || undefined);
  }

  const filteredStores = useMemo(() => {
    let list = stores;
    if (channelFilter) list = list.filter((s) => s.channelType === channelFilter);
    if (statusFilter === "active")   list = list.filter((s) => s.isActive);
    if (statusFilter === "inactive") list = list.filter((s) => !s.isActive);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((s) =>
        s.storeName.toLowerCase().includes(q) ||
        s.storeId.toLowerCase().includes(q) ||
        s.storeUrl.toLowerCase().includes(q)
      );
    }
    return list;
  }, [stores, channelFilter, statusFilter, searchText]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleToggleActive(store: AdminChannelStore) {
    setActioning(store.storeId);
    try {
      if (store.isActive) {
        await ChannelStoreAdminService.deactivateStore(orgId, store.storeId);
        setStores((p) => p.map((s) => s.storeId === store.storeId ? { ...s, isActive: false, connectionStatus: "INACTIVE" } : s));
        showToast(`${store.storeName} deactivated`, "success");
      } else {
        const updated = await ChannelStoreAdminService.activateStore(orgId, store.storeId);
        setStores((p) => p.map((s) => s.storeId === store.storeId ? updated : s));
        showToast(`${store.storeName} activated`, "success");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setActioning(null);
    }
  }

  function handleSaved(saved: AdminChannelStore) {
    setStores((p) => {
      const exists = p.some((s) => s.storeId === saved.storeId);
      return exists ? p.map((s) => s.storeId === saved.storeId ? saved : s) : [saved, ...p];
    });
    setCreateModal(false);
    setEditStore(null);
    setCredStore(null);
    showToast(`${saved.storeName} saved successfully`, "success");
  }

  function handleDeleted(storeId: string) {
    setStores((p) => p.filter((s) => s.storeId !== storeId));
    setDeleteStore(null);
    showToast("Store connection deleted", "success");
  }

  function handleVersionSaved(updated: AdminChannelStore) {
    setStores((p) => p.map((s) => (s.storeId === updated.storeId ? updated : s)));
    setVersionStore(null);
    showToast(
      updated.apiVersion
        ? `${updated.storeName} pinned to API version ${updated.apiVersion}`
        : `${updated.storeName} now follows the channel's active version`,
      "success",
    );
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => ({
    total:    stores.length,
    active:   stores.filter((s) => s.isActive).length,
    inactive: stores.filter((s) => !s.isActive).length,
    channels: new Set(stores.map((s) => s.channelType)).size,
  }), [stores]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-brand-600 dark:text-brand-400">
            <StoreIcon />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Channel Store Connections</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Platform Admin — manage store connections across all organizations</p>
          </div>
        </div>
        {orgId && (
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            <PlusIcon /> Add Store
          </button>
        )}
      </div>

      {/* Org ID loader */}
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Organization</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={orgInput}
            onChange={(e) => setOrgInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            placeholder="Enter Organization ID (e.g. org_123)"
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
          <button
            onClick={handleLoad}
            disabled={!orgInput.trim() || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SearchIcon /> Load
          </button>
          {orgId && (
            <button
              onClick={() => loadStores(orgId)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshIcon />
            </button>
          )}
        </div>
        {orgId && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Showing stores for <span className="font-mono text-brand-600 dark:text-brand-400">{orgId}</span>
          </p>
        )}
      </div>

      {/* KPIs — only show after load */}
      {orgId && stores.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",    value: kpis.total,    color: "text-gray-700 dark:text-gray-300" },
            { label: "Active",   value: kpis.active,   color: "text-success-700 dark:text-success-400" },
            { label: "Inactive", value: kpis.inactive, color: "text-gray-500 dark:text-gray-400" },
            { label: "Channels", value: kpis.channels, color: "text-brand-700 dark:text-brand-400" },
          ].map((k) => (
            <div key={k.label} className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3">
              <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {orgId && (
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search stores…"
              className="pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 w-48"
            />
          </div>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          >
            <option value="">All channels</option>
            {CHANNEL_TYPES.map((ct) => (
              <option key={ct} value={ct}>{CHANNEL_LABELS[ct] ?? ct}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-5 py-4">
          <p className="font-medium text-error-700 dark:text-error-400">Failed to load stores</p>
          <p className="text-sm text-error-600 dark:text-error-300 mt-1">{loadError}</p>
          <button onClick={() => loadStores(orgId)} className="mt-2 text-sm text-error-600 dark:text-error-400 underline">Retry</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !loadError && orgId && stores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 text-gray-400">
            <StoreIcon />
          </div>
          <p className="font-medium text-gray-900 dark:text-white">No stores found</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            No store connections for <span className="font-mono">{orgId}</span>.
          </p>
          <button
            onClick={() => setCreateModal(true)}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            <PlusIcon /> Add First Store
          </button>
        </div>
      )}

      {/* Prompt before first load */}
      {!loading && !loadError && !orgId && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400 dark:text-gray-500">
          <StoreIcon />
          <p className="mt-3 text-sm">Enter an Organization ID above and click Load to view store connections.</p>
        </div>
      )}

      {/* Store table */}
      {!loading && filteredStores.length > 0 && (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  {["Store", "Channel", "URL", "Region", "Status", "API Version", "Connected", "Order", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredStores.map((store) => (
                  <tr key={store.storeId} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    {/* Store */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{store.storeName}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{store.storeId}</p>
                    </td>

                    {/* Channel */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ChannelBadge channelType={store.channelType} />
                    </td>

                    {/* URL */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <a href={store.storeUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 dark:text-brand-400 hover:underline truncate block">
                        {store.storeUrl}
                      </a>
                    </td>

                    {/* Region */}
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {store.region ?? "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge store={store} />
                    </td>

                    {/* API Version pin */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <VersionPinCell store={store} onClick={() => setVersionStore(store)} />
                    </td>

                    {/* Connected */}
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(store.connectedAt)}
                    </td>

                    {/* Order */}
                    <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                      {store.displayOrder}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-nowrap">
                        {/* Edit */}
                        <button
                          onClick={() => setEditStore(store)}
                          title="Edit store"
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                          <EditIcon />
                        </button>

                        {/* Update credentials */}
                        <button
                          onClick={() => setCredStore(store)}
                          title="Update credentials"
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <KeyIcon />
                        </button>

                        {/* Activate / Deactivate */}
                        <button
                          onClick={() => handleToggleActive(store)}
                          disabled={actioning === store.storeId}
                          title={store.isActive ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            store.isActive
                              ? "hover:bg-amber-50 dark:hover:bg-amber-500/10 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400"
                              : "hover:bg-success-50 dark:hover:bg-success-500/10 text-gray-500 dark:text-gray-400 hover:text-success-600 dark:hover:text-success-400"
                          }`}
                        >
                          {store.isActive ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                            </svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>
                            </svg>
                          )}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteStore(store)}
                          title="Delete store"
                          className="p-1.5 rounded-lg hover:bg-error-50 dark:hover:bg-error-500/10 text-gray-500 dark:text-gray-400 hover:text-error-600 dark:hover:text-error-400 transition-colors"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {filteredStores.length} of {stores.length} stores
              {channelFilter && ` · filtered by ${CHANNEL_LABELS[channelFilter] ?? channelFilter}`}
              {statusFilter !== "all" && ` · ${statusFilter} only`}
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <StoreFormModal orgId={orgId} onClose={() => setCreateModal(false)} onSaved={handleSaved} />
      )}
      {editStore && (
        <StoreFormModal orgId={orgId} store={editStore} onClose={() => setEditStore(null)} onSaved={handleSaved} />
      )}
      {credStore && (
        <CredentialsModal orgId={orgId} store={credStore} onClose={() => setCredStore(null)} onSaved={handleSaved} />
      )}
      {deleteStore && (
        <DeleteConfirmModal orgId={orgId} store={deleteStore} onClose={() => setDeleteStore(null)} onDeleted={handleDeleted} />
      )}
      {versionStore && (
        <VersionPinModal orgId={orgId} store={versionStore} onClose={() => setVersionStore(null)} onSaved={handleVersionSaved} />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
