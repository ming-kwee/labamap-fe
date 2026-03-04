/**
 * Channel OAuth Service
 * Generic OAuth 2.0 flow for any channel type.
 * No mock/fallback data — all calls go to the real backend.
 *
 * Backend path pattern:
 *   GET  /api/v1/oauth/{channelType}/initiate
 *   POST /api/v1/oauth/{channelType}/callback
 *
 * Channel-specific params (e.g. shopDomain for Shopify, siteId for WIX)
 * are passed via the `extras` bag and forwarded as-is to the backend.
 */

import type { ChannelStoreConnection, ChannelType } from "../types/channelStore";
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
  returnUrl: string;
  storeName?: string;
  region?: string;
  /** Channel-specific query params (e.g. { shopDomain } for Shopify) */
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
   * Initiate OAuth for a channel.
   * GET /api/v1/oauth/{channelType}/initiate
   * Returns the provider authorization URL to redirect the user to.
   */
  async initiateOAuth(channelType: ChannelType, params: InitiateOAuthParams): Promise<string> {
    const query = new URLSearchParams({
      organizationId: params.organizationId,
      returnUrl: params.returnUrl,
      ...(params.storeName ? { storeName: params.storeName } : {}),
      ...(params.region ? { region: params.region } : {}),
      ...params.extras,
    });

    const res = await fetch(`${BASE}/oauth/${channelType}/initiate?${query.toString()}`, {
      method: "GET",
    });

    const data = await handleResponse<{ authUrl: string }>(res);
    return data.authUrl;
  },

  /**
   * Complete OAuth by exchanging the provider code for an access token.
   * POST /api/v1/oauth/{channelType}/callback
   * Backend validates provider-specific params (e.g. HMAC for Shopify),
   * exchanges the code, saves the store, and returns the ChannelStoreConnection.
   */
  completeOAuth(channelType: ChannelType, params: CompleteOAuthParams): Promise<ChannelStoreConnection> {
    return fetch(`${BASE}/oauth/${channelType}/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: params.code, state: params.state, ...params.extras }),
    }).then((r) => handleResponse<unknown>(r)).then(mapStore);
  },
};
