"use client";
import React, { useState, useEffect } from "react";
import type {
  ChannelStoreConnection,
  ChannelType,
  StoreConnectionRequest,
  CredentialFieldSchema,
  CredentialEntry,
} from "../../types/channelStore";
import { ChannelStoreService } from "../../services/channelStore.service";
import { ChannelCredentialSchemaService } from "../../services/channelStore.service";
import { getChannelMeta } from "./ChannelTypeBadge";

/**
 * OAuth-capable channels (Phase B).
 * These channels use the OAuth redirect flow — no manual credentials needed.
 * Manual channels (lazada, tokopedia, shopee, facebook, walmart) use credential entry.
 */
const OAUTH_CHANNELS = new Set<ChannelType>(["shopify", "wix", "tiktok", "amazon", "ebay"]);

/**
 * Normalise a store URL — ensures https:// protocol, lowercases host, strips trailing slashes.
 * Backend URL validators reject strings without a scheme.
 */
function normalizeStoreUrl(url: string): string {
  const trimmed = url.trim();
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${withoutProtocol.toLowerCase()}`;
}

const CHANNEL_OPTIONS: Array<{ value: ChannelType; label: string }> = [
  { value: "shopify",   label: "Shopify" },
  { value: "wix",       label: "WIX" },
  { value: "amazon",    label: "Amazon" },
  { value: "ebay",      label: "eBay" },
  { value: "tiktok",    label: "TikTok Shop" },
  { value: "lazada",    label: "Lazada" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "facebook",  label: "Facebook Shop" },
  { value: "shopee",    label: "Shopee" },
  { value: "walmart",   label: "Walmart" },
];

interface Props {
  organizationId: string;
  onClose: () => void;
  /** Called only for manual-credential channels — OAuth channels redirect the browser. */
  onConnect: (request: StoreConnectionRequest) => Promise<void>;
  /**
   * Pass the existing store to open in edit or reconnect mode.
   * The modal determines the appropriate flow based on connectionStatus:
   *   - ACTIVE + OAuth channel → show OAuth "Re-authorize" option
   *   - ACTIVE + manual channel → show manual credential update form
   *   - RECONNECT_REQUIRED / DISCONNECTED + OAuth channel → OAuth reconnect (passes storeId)
   *   - RECONNECT_REQUIRED / DISCONNECTED + manual channel → manual credential form
   */
  existingStore?: ChannelStoreConnection;
}

export default function ConnectStoreModal({ organizationId, onClose, onConnect, existingStore }: Props) {
  // ── Mode detection ─────────────────────────────────────────────────────────
  const isReconnectMode =
    existingStore?.connectionStatus === "RECONNECT_REQUIRED" ||
    existingStore?.connectionStatus === "DISCONNECTED";
  const isEditMode = Boolean(existingStore) && !isReconnectMode;

  const [channelType, setChannelType] = useState<ChannelType>(existingStore?.channelType ?? "shopify");
  const [storeName,   setStoreName]   = useState(existingStore?.storeName ?? "");
  const [storeUrl,    setStoreUrl]    = useState(existingStore?.storeUrl ?? "");
  const [region,      setRegion]      = useState(existingStore?.region ?? "");

  // Shopify-specific: mystore.myshopify.com domain (OAuth initiation requires this)
  const [shopDomain, setShopDomain] = useState("");

  const [credentials,    setCredentials]    = useState<Record<string, string>>({});
  const [credentialSchema, setCredentialSchema] = useState<CredentialFieldSchema[]>([]);
  const [schemaLoading,  setSchemaLoading]  = useState(false);
  const [schemaError,    setSchemaError]    = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isOAuthChannel = OAUTH_CHANNELS.has(channelType);
  // Show OAuth flow when: new connection for OAuth channel, OR reconnecting an OAuth channel
  const showOAuthFlow = isOAuthChannel && (!existingStore || isReconnectMode);
  // Show manual form when: manual channel, OR editing an ACTIVE OAuth channel
  const showManualForm = !showOAuthFlow;

  // ── Credential schema (manual channels only) ────────────────────────────
  useEffect(() => {
    if (!showManualForm) return;
    setCredentialSchema([]);
    setSchemaError(null);
    setSchemaLoading(true);
    ChannelCredentialSchemaService.getCredentialSchema(channelType)
      .then(setCredentialSchema)
      .catch(() => {
        // 404 = channel has no credential schema seeded yet — show guidance instead of hard error
        setSchemaError(null);
        setCredentialSchema([]);
      })
      .finally(() => setSchemaLoading(false));
  }, [channelType, showManualForm]);

  function handleChannelTypeChange(value: ChannelType) {
    if (isEditMode || isReconnectMode) return; // locked in edit/reconnect mode
    setChannelType(value);
    setCredentials({});
    setShopDomain("");
    setError(null);
  }

  function handleCredentialChange(chnlCredName: string, value: string) {
    setCredentials((prev) => ({ ...prev, [chnlCredName]: value }));
  }

  // ── OAuth flow ─────────────────────────────────────────────────────────────
  async function handleOAuthConnect() {
    if (channelType === "shopify" && !shopDomain.trim()) {
      setError("Shopify store domain is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Shopify: backend builds authorizationUrl as https://{shop}.myshopify.com/...
      // so we must pass only the subdomain — strip protocol + .myshopify.com suffix.
      const shopSubdomain = shopDomain.trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\.myshopify\.com\/?$/i, "")
        .replace(/\/+$/, "");

      const resp = await ChannelStoreService.initiateOAuth({
        channelType,
        organizationId,
        storeName: storeName.trim() || `${channelType}-store`,
        region:    region.trim() || undefined,
        shop:      channelType === "shopify" ? shopSubdomain : undefined,
        storeId:   isReconnectMode ? existingStore?.storeId : undefined,
      });
      // Full-page redirect — backend will redirect back to /channels/stores?connected={channelType}
      window.location.href = resp.authorizationUrl;
      // Do NOT set submitting=false — page is navigating away
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start authorization");
      setSubmitting(false);
    }
  }

  // ── Manual flow ────────────────────────────────────────────────────────────
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Build CredentialEntry[] — only fields with values are included.
      // Edit mode: omitting a field means "keep existing credential" (backend ignores empty list).
      const credentialEntries: CredentialEntry[] = credentialSchema
        .filter((f) => (credentials[f.chnlCredName] ?? "").trim() !== "")
        .map((f) => ({
          credId:        f.credId,
          chnlCredName:  f.chnlCredName,
          chnlCredValue: credentials[f.chnlCredName].trim(),
        }));

      await onConnect({
        channelType,
        storeName: storeName.trim(),
        storeUrl:  normalizeStoreUrl(storeUrl),
        region:    region.trim() || undefined,
        credentials: credentialEntries,
        ...(existingStore ? { storeId: existingStore.storeId } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? "Failed to save changes" : "Failed to connect store");
    } finally {
      setSubmitting(false);
    }
  }

  const channelMeta   = getChannelMeta(channelType);
  const channelLabel  = CHANNEL_OPTIONS.find((o) => o.value === channelType)?.label ?? channelType;

  const titleText = isReconnectMode
    ? `Reconnect ${existingStore?.storeName ?? channelLabel}`
    : isEditMode
    ? `Edit ${existingStore?.storeName ?? "Store"}`
    : "Connect New Store";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{titleText}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Reconnect notice */}
          {isReconnectMode && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Re-authorization required.</strong>{" "}
                {existingStore?.disconnectReason === "app_uninstalled"
                  ? "The app was uninstalled from the marketplace. Re-authorize to reconnect."
                  : "Your access token has expired. Click below to re-authorize access."}
              </p>
            </div>
          )}

          {/* Channel type selector (locked in edit/reconnect mode) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel Type <span className="text-error-500">*</span>
            </label>
            <select
              value={channelType}
              onChange={(e) => handleChannelTypeChange(e.target.value as ChannelType)}
              disabled={isEditMode || isReconnectMode}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* ── OAuth flow ─────────────────────────────────────────────────── */}
          {showOAuthFlow && (
            <div className="space-y-4">
              {/* Store name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Store Name
                  {channelType !== "shopify" && <span className="text-error-500"> *</span>}
                  {channelType === "shopify" && (
                    <span className="text-gray-400 font-normal"> (optional — auto-filled from Shopify if blank)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required={channelType !== "shopify"}
                  placeholder={`e.g. My ${channelLabel} Store`}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Region (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Region <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. US, EU, SEA"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Shopify: shop domain required */}
              {channelType === "shopify" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Shopify Domain <span className="text-error-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    placeholder="your-brand.myshopify.com"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Your Shopify store domain, e.g. <span className="font-mono">my-brand.myshopify.com</span>
                  </p>
                </div>
              )}

              {/* OAuth explanation */}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold ${channelMeta.bg} ${channelMeta.text}`}>
                    {channelMeta.code}
                  </span>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Authorize via {channelLabel}
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  You will be redirected to {channelLabel} to grant access.
                  No credentials to enter — the backend securely handles token exchange.
                </p>
              </div>

              {error && (
                <div className="rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-4 py-3">
                  <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || (channelType === "shopify" && !shopDomain.trim())}
                  onClick={handleOAuthConnect}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-60"
                >
                  {submitting
                    ? "Redirecting…"
                    : isReconnectMode
                    ? `Reconnect with ${channelLabel}`
                    : `Connect with ${channelLabel}`}
                </button>
              </div>
            </div>
          )}

          {/* ── Manual credential form ─────────────────────────────────── */}
          {showManualForm && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              {/* Store name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Store Name <span className="text-error-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={`e.g. My ${channelLabel} Store`}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Store URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Store URL <span className="text-error-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="e.g. https://mysite.example.com/store"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Region (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Region <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. US, EU, SEA"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Credentials — schema-driven */}
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Credentials</p>
                  {isEditMode && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Leave blank to keep existing credentials.
                    </p>
                  )}
                </div>

                {schemaLoading && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    <span className="text-xs text-gray-400 dark:text-gray-500">Loading credential fields…</span>
                  </div>
                )}

                {schemaError && (
                  <div className="rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-4 py-3">
                    <p className="text-sm text-error-700 dark:text-error-400">{schemaError}</p>
                  </div>
                )}

                {!schemaLoading && !schemaError && credentialSchema.map((field) => (
                  <div key={field.credId}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {field.label}
                      {!isEditMode && field.required && <span className="text-error-500"> *</span>}
                    </label>
                    <input
                      required={!isEditMode && field.required}
                      type={field.inputType}
                      value={credentials[field.chnlCredName] ?? ""}
                      onChange={(e) => handleCredentialChange(field.chnlCredName, e.target.value)}
                      placeholder={isEditMode ? "Leave blank to keep existing" : field.inputType === "password" ? "•••••••••" : ""}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    {field.helpText && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{field.helpText}</p>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-4 py-3">
                  <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || schemaLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-60"
                >
                  {submitting
                    ? (isEditMode ? "Saving…" : "Connecting…")
                    : (isEditMode ? "Save Changes" : "Connect Store")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
