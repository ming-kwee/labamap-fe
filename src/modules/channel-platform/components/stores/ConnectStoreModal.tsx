"use client";
import React, { useState } from "react";
import type { ChannelType, StoreConnectionRequest } from "../../types/channelStore";
import { ChannelOAuthService } from "../../services/channelOAuthService";

/**
 * Normalise a store URL before sending to backend.
 * Strips protocol, lowercases, and removes trailing slashes so that
 * "https://MyStore.myshopify.com/" and "mystore.myshopify.com" are treated as identical.
 */
function normalizeStoreUrl(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
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

const CREDENTIAL_FIELDS: Record<ChannelType, Array<{ key: string; label: string; sensitive?: boolean }>> = {
  shopify:   [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "apiKey",      label: "API Key",       sensitive: true },
    { key: "apiSecret",   label: "API Secret",    sensitive: true },
  ],
  wix:       [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "wixSiteId",   label: "WIX Site ID" },
  ],
  amazon:    [
    { key: "sellerId",      label: "Seller ID" },
    { key: "marketplaceId", label: "Marketplace ID" },
    { key: "accessKey",     label: "Access Key",    sensitive: true },
    { key: "secretKey",     label: "Secret Key",    sensitive: true },
  ],
  ebay:      [
    { key: "accessToken",  label: "Access Token",  sensitive: true },
    { key: "refreshToken", label: "Refresh Token", sensitive: true },
    { key: "siteId",       label: "Site ID" },
  ],
  tiktok:    [
    { key: "appKey",     label: "App Key",     sensitive: true },
    { key: "appSecret",  label: "App Secret",  sensitive: true },
    { key: "accessToken",label: "Access Token",sensitive: true },
    { key: "shopCipher", label: "Shop Cipher" },
  ],
  lazada:    [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "appKey",      label: "App Key",      sensitive: true },
    { key: "appSecret",   label: "App Secret",   sensitive: true },
  ],
  tokopedia: [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "shopId",      label: "Shop ID" },
  ],
  facebook:  [
    { key: "accessToken",  label: "Access Token",  sensitive: true },
    { key: "catalogId",    label: "Catalog ID" },
  ],
  shopee:    [
    { key: "accessToken",  label: "Access Token",  sensitive: true },
    { key: "shopId",       label: "Shop ID" },
    { key: "partnerId",    label: "Partner ID" },
    { key: "partnerKey",   label: "Partner Key",   sensitive: true },
  ],
  walmart:   [
    { key: "clientId",     label: "Client ID",     sensitive: true },
    { key: "clientSecret", label: "Client Secret", sensitive: true },
  ],
};

interface Props {
  organizationId: string;
  onClose: () => void;
  onConnect: (request: StoreConnectionRequest) => Promise<void>;
}

export default function ConnectStoreModal({ organizationId, onClose, onConnect }: Props) {
  const [channelType, setChannelType] = useState<ChannelType>("shopify");
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [region, setRegion] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shopify OAuth state
  const [shopifyMode, setShopifyMode] = useState<"oauth" | "manual">("oauth");
  const [shopDomain, setShopDomain] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const credFields = CREDENTIAL_FIELDS[channelType] ?? [];
  const isShopifyOAuth = channelType === "shopify" && shopifyMode === "oauth";

  function handleCredentialChange(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }

  function handleChannelTypeChange(value: ChannelType) {
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
      await onConnect({
        channelType,
        storeName: storeName.trim(),
        storeUrl: normalizeStoreUrl(storeUrl),
        region: region.trim() || undefined,
        credentials,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect store");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Connect New Store</h2>
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
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              {/* OAuth switch-back link — only shown for Shopify manual mode */}
              {channelType === "shopify" && (
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
                  placeholder="e.g. My Shopify US Store"
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
                  placeholder="e.g. mystore.myshopify.com"
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

              {/* Credentials */}
              {credFields.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Credentials</p>
                  {credFields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {field.label} <span className="text-error-500">*</span>
                      </label>
                      <input
                        required
                        type={field.sensitive ? "password" : "text"}
                        value={credentials[field.key] ?? ""}
                        onChange={(e) => handleCredentialChange(field.key, e.target.value)}
                        placeholder={field.sensitive ? "•••••••••" : ""}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  ))}
                </div>
              )}

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
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-60"
                >
                  {submitting ? "Connecting…" : "Connect Store"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
