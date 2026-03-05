/**
 * Channel OAuth Service
 * Generic OAuth 2.0 flow for any channel type — Phase B implementation.
 * No mock/fallback data — all calls go to the real backend.
 *
 * Phase B backend endpoint (new unified path):
 *   GET /api/v1/oauth/initiate?channelType=...&organizationId=...&storeName=...
 *   → { authorizationUrl, nonce, channelType }
 *   → Frontend redirects browser to authorizationUrl
 *   → Marketplace redirects to BACKEND callback (not frontend)
 *   → Backend exchanges code → saves store → redirects to /channels/stores?connected={channelType}
 *
 * The legacy per-channel path GET /api/v1/oauth/{channelType}/initiate is no longer used.
 * The legacy POST /api/v1/oauth/{channelType}/callback (completeOAuth) is kept for
 * backwards compatibility but is not called in the new OAuth flow.
 */

import type { ChannelStoreConnection, ChannelType, OAuthInitiateResponse } from "../types/channelStore";
import { mapStore } from "./channelStore.service";

const BASE = "http://localhost:8888/labamap/api/v1";

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.message ?? body.error ?? res.statusText;
  } catch {
    return res.text().catch(() => res.statusText);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json() as Promise<T>;
}

export interface InitiateOAuthParams {
  organizationId: string;
  storeName?: string;
  region?: string;
  /** Required for Shopify — the {yourstore}.myshopify.com domain */
  shop?: string;
  /** For reconnect flow — backend uses this to reconnect existing store instead of creating new */
  storeId?: string;
  /** @deprecated Legacy: returnUrl is no longer used; backend generates its own callback URL */
  returnUrl?: string;
  /** @deprecated Legacy extras bag — use named shop / storeId params instead */
  extras?: Record<string, string>;
}

export interface CompleteOAuthParams {
  code: string;
  state: string;
  /** Channel-specific params from the provider callback (e.g. { shop, hmac } for Shopify) */
  extras?: Record<string, string>;
}

export const ChannelOAuthService = {
  /**
   * Initiate OAuth for a channel (Phase B).
   * GET /api/v1/oauth/initiate?channelType=...&organizationId=...&storeName=...
   * Returns the provider authorization URL — redirect the browser to it.
   * The backend callback handles code exchange and redirects to /channels/stores?connected={channelType}.
   */
  async initiateOAuth(channelType: ChannelType, params: InitiateOAuthParams): Promise<string> {
    const query = new URLSearchParams({
      channelType,
      organizationId: params.organizationId,
      ...(params.storeName ? { storeName: params.storeName } : {}),
      ...(params.region    ? { region:    params.region }    : {}),
      ...(params.shop      ? { shop:      params.shop }      : {}),
      ...(params.storeId   ? { storeId:   params.storeId }   : {}),
      // Legacy extras passthrough (shopDomain → shop mapping for old call sites)
      ...(params.extras?.shopDomain ? { shop: params.extras.shopDomain } : {}),
    });

    const res = await fetch(`${BASE}/oauth/initiate?${query.toString()}`, { method: "GET" });
    const data = await handleResponse<OAuthInitiateResponse>(res);
    return data.authorizationUrl;
  },

  /**
   * @deprecated Legacy POST callback — not used in Phase B+ flow.
   * The backend now handles the GET callback directly and redirects to /channels/stores.
   * Kept for backwards compatibility with existing /channels/oauth/callback page.
   */
  completeOAuth(channelType: ChannelType, params: CompleteOAuthParams): Promise<ChannelStoreConnection> {
    return fetch(`${BASE}/oauth/${channelType}/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: params.code, state: params.state, ...params.extras }),
    }).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },
};
