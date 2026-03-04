"use client";
import React, { useState, useEffect } from "react";
import type {
  ChannelStoreConnection,
  ChannelType,
  StoreConnectionRequest,
  CredentialFieldSchema,
  CredentialEntry,
} from "../../types/channelStore";
import { ChannelOAuthService } from "../../services/channelOAuth.service";
import { ChannelCredentialSchemaService } from "../../services/channelStore.service";

/**
 * Normalise a store URL before sending to backend.
 * Ensures the URL always has an https:// protocol (adds it if missing),
 * lowercases the host, and removes trailing slashes so that
 * "https://MyStore.myshopify.com/" and "mystore.myshopify.com" are treated as identical.
 *
 * Preserving the protocol is required because backend URL validators
 * (e.g. @URL, @Pattern) reject strings without a scheme.
 */
function normalizeStoreUrl(url: string): string {
  const trimmed = url.trim();
  // Strip any existing protocol then re-add https:// so the result is always a valid URL
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
  onConnect: (request: StoreConnectionRequest) => Promise<void>;
  /** When provided the modal opens in edit mode with fields pre-filled */
  existingStore?: ChannelStoreConnection;
}

export default function ConnectStoreModal({ organizationId, onClose, onConnect, existingStore }: Props) {
  const isEditMode = Boolean(existingStore);

  const [channelType, setChannelType] = useState<ChannelType>(existingStore?.channelType ?? "shopify");
  const [storeName, setStoreName] = useState(existingStore?.storeName ?? "");
  const [storeUrl, setStoreUrl] = useState(existingStore?.storeUrl ?? "");
  const [region, setRegion] = useState(existingStore?.region ?? "");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credential schema — fetched from backend per channel type
  const [credentialSchema, setCredentialSchema] = useState<CredentialFieldSchema[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Shopify OAuth state — disabled in edit mode (can't re-initiate OAuth for existing store)
  const [shopifyMode, setShopifyMode] = useState<"oauth" | "manual">(isEditMode ? "manual" : "oauth");
  const [shopDomain, setShopDomain] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const isShopifyOAuth = channelType === "shopify" && shopifyMode === "oauth" && !isEditMode;

  // Fetch credential schema whenever channelType changes
  useEffect(() => {
    setCredentialSchema([]);
    setSchemaError(null);
    setSchemaLoading(true);
    ChannelCredentialSchemaService.getCredentialSchema(channelType)
      .then(setCredentialSchema)
      .catch((err) => setSchemaError(err instanceof Error ? err.message : "Failed to load credential fields"))
      .finally(() => setSchemaLoading(false));
  }, [channelType]);

  function handleCredentialChange(chnlCredName: string, value: string) {
    setCredentials((prev) => ({ ...prev, [chnlCredName]: value }));
  }

  function handleChannelTypeChange(value: ChannelType) {
    if (isEditMode) return; // channel type is locked in edit mode
    setChannelType(value);
    setCredentials({});
    setError(null);
    setOauthError(null);
    setShopifyMode("oauth");
  }

  async function handleShopifyOAuth() {
    if (!shopDomain.trim()) return;
    setOauthError(null);
    setOauthLoading(true);
    try {
      const returnUrl = `${window.location.origin}/channels/oauth/callback?channelType=${channelType}`;
      const authUrl = await ChannelOAuthService.initiateOAuth(channelType, {
        organizationId,
        returnUrl,
        storeName: storeName.trim() || undefined,
        region: region.trim() || undefined,
        extras: { shopDomain: normalizeStoreUrl(shopDomain) },
      });
      window.location.href = authUrl;
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : "Failed to initiate connection");
      setOauthLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Build CredentialEntry[] from the fetched schema + user-entered values.
      // credentialSchema provides the credId needed by the backend; we key the
      // internal state by chnlCredName for easy input binding.
      // In edit mode: only include fields the user actually filled in — omitting
      // a field means "keep existing" (backend treats empty credentials list as no-change).
      const credentialEntries: CredentialEntry[] = credentialSchema
        .filter((f) => (credentials[f.chnlCredName] ?? "").trim() !== "")
        .map((f) => ({
          credId: f.credId,
          chnlCredName: f.chnlCredName,
          chnlCredValue: credentials[f.chnlCredName].trim(),
        }));

      await onConnect({
        channelType,
        storeName: storeName.trim(),
        storeUrl: normalizeStoreUrl(storeUrl),
        region: region.trim() || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditMode ? "Edit Store" : "Connect New Store"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Channel type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel Type <span className="text-error-500">*</span>
            </label>
            <select
              value={channelType}
              onChange={(e) => handleChannelTypeChange(e.target.value as ChannelType)}
              disabled={isEditMode}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* ── Shopify OAuth mode ── */}
          {isShopifyOAuth ? (
            <>
              {/* Shop domain */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Shop Domain <span className="text-error-500">*</span>
                </label>
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="mystore.myshopify.com"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Store name (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Store Name{" "}
                  <span className="text-gray-400 font-normal">(optional — auto-filled from Shopify if blank)</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. My Shopify US Store"
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

              {oauthError && (
                <div className="rounded-xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-4 py-3">
                  <p className="text-sm text-error-700 dark:text-error-400">{oauthError}</p>
                </div>
              )}

              {/* Action buttons */}
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
                  disabled={oauthLoading || !shopDomain.trim()}
                  onClick={handleShopifyOAuth}
                  className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#96BF48" }}
                >
                  {oauthLoading ? "Connecting…" : "Connect with Shopify"}
                </button>
              </div>

              {/* Switch to manual */}
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Have API credentials?{" "}
                <button
                  type="button"
                  onClick={() => setShopifyMode("manual")}
                  className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  Use API key instead →
                </button>
              </p>
            </>
          ) : (
            /* ── Manual mode (Shopify) or any other channel ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* OAuth switch-back link — only shown for Shopify manual mode (not in edit mode) */}
              {channelType === "shopify" && !isEditMode && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={() => setShopifyMode("oauth")}
                    className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                  >
                    ← Use Shopify OAuth instead
                  </button>
                </p>
              )}

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
                  placeholder="e.g. My Wix Store"
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
                  placeholder="e.g. mysite.wixsite.com/store"
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
                  {submitting ? (isEditMode ? "Saving…" : "Connecting…") : (isEditMode ? "Save Changes" : "Connect Store")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
