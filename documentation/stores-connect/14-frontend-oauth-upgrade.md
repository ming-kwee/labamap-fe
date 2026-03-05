# 14 — Frontend Upgrade Recommendations: OAuth Phases A–E

**For:** Frontend Team
**Date:** 2026-03-04
**Context:** The backend has completed Phases A–E of OAuth Full Automation. The current frontend (`ConnectStoreModal`, `ChannelStoresDashboard`, `channelStoreService.ts`) was built for a manual credential-entry flow. These recommendations align the frontend with the new backend capabilities.

---

## What Changed on the Backend (Summary)

| Phase | What was built | Frontend Impact |
|-------|---------------|-----------------|
| A | OAuth app credentials configured per channel | None — config only |
| B | `GET /api/v1/oauth/initiate` — generates authorization URL | **New endpoint to call** |
| C | OAuth callback handler — exchanges code, saves real tokens | **New redirect handling** |
| D | Webhook deactivation — stores auto-deactivate on uninstall | **New `connectionStatus` values** |
| E | `reconnectRequired` flag, audit log, full lifecycle polish | **New type fields + Reconnect UI** |

---

## 1. Update the `ChannelStoreConnection` TypeScript Type

The API response now includes four new fields. Update the type in `channelStore.ts`:

```typescript
// BEFORE
interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;
  isActive: boolean;
  displayOrder: number;
  connectedAt: string;
  lastSyncedAt?: string;
}

// AFTER — add these four fields
interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;
  isActive: boolean;
  displayOrder: number;
  connectedAt: string;
  lastSyncedAt?: string;

  // NEW (Phase D + E)
  reconnectRequired: boolean;
  connectionStatus: 'ACTIVE' | 'RECONNECT_REQUIRED' | 'DISCONNECTED' | 'INACTIVE';
  disconnectedAt?: string;   // ISO datetime — set when deactivated via webhook
  disconnectReason?: string; // "app_uninstalled" | "deauthorize" | "app_removed" | "manual" | etc.
}
```

### `connectionStatus` truth table (use this to drive UI rendering)

| `connectionStatus` | Meaning | Badge colour | Actions |
|-------------------|---------|-------------|---------|
| `ACTIVE` | Fully connected, token valid | Green | Deactivate |
| `RECONNECT_REQUIRED` | Token expired/revoked — merchant must re-auth | Amber | **Reconnect** button |
| `DISCONNECTED` | App removed from marketplace via webhook | Red | Reconnect or Delete |
| `INACTIVE` | Manually deactivated via API | Grey | Reactivate or Delete |

---

## 2. Add New Types for OAuth Initiation

```typescript
// Add to channelStore.ts

interface OAuthInitiateRequest {
  channelType: ChannelType;
  organizationId: string;
  storeName: string;
  region?: string;
  shop?: string;  // required for Shopify — the myshopify.com domain
}

interface OAuthInitiateResponse {
  authorizationUrl: string;  // redirect the merchant here
  nonce: string;             // CSRF token (store temporarily if needed)
  channelType: ChannelType;
}
```

---

## 3. Update `channelStoreService.ts` — Add OAuth Methods

```typescript
// channelStoreService.ts

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL + "/labamap/api/v1";

// --- NEW: initiate OAuth authorization ---
async initiateOAuth(request: OAuthInitiateRequest): Promise<OAuthInitiateResponse> {
  const params = new URLSearchParams({
    channelType: request.channelType,
    organizationId: request.organizationId,
    storeName: request.storeName,
    ...(request.region   ? { region: request.region }  : {}),
    ...(request.shop     ? { shop: request.shop }       : {}),
  });
  const res = await fetch(`${API_BASE}/oauth/initiate?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
},

// --- NEW: reactivate a store ---
async reactivateStore(storeId: string, organizationId: string): Promise<ChannelStoreConnection> {
  const res = await fetch(
    `${API_BASE}/channel-stores/${storeId}/reactivate?organizationId=${organizationId}`,
    { method: "PUT" }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
},
```

---

## 4. Split `ConnectStoreModal` into OAuth vs Manual Flows

The biggest UX change: OAuth-capable channels should no longer ask the merchant to paste tokens. They click a button, get redirected to the marketplace, authorize, and come back automatically.

### Which channels use OAuth (redirect flow)?

| Channel | OAuth? | Notes |
|---------|--------|-------|
| Shopify | ✅ Yes | Requires `shop` domain input first |
| WIX | ✅ Yes | Standard OAuth 2.0 |
| TikTok Shop | ✅ Yes | Standard OAuth 2.0 |
| Amazon | ✅ Yes | LWA (Login with Amazon) |
| eBay | ✅ Yes | Standard OAuth 2.0 |
| Lazada | Manual for now | Backend callback not yet wired |
| Tokopedia | Manual for now | Backend callback not yet wired |
| Shopee | Manual for now | Uses HMAC signing, not OAuth |
| Facebook | Manual for now | |
| Walmart | Manual for now | Uses client credentials grant |

### Recommended modal structure

```tsx
// ConnectStoreModal.tsx

const OAUTH_CHANNELS: ChannelType[] = ["shopify", "wix", "tiktokshop", "amazon", "ebay"];

export default function ConnectStoreModal({ onClose, organizationId }) {
  const [channelType, setChannelType] = useState<ChannelType>("shopify");
  const [storeName, setStoreName]     = useState("");
  const [region, setRegion]           = useState("");
  const [shop, setShop]               = useState("");  // Shopify only
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const isOAuthChannel = OAUTH_CHANNELS.includes(channelType);

  // OAuth path — redirect the browser to the marketplace authorization page
  async function handleOAuthConnect() {
    setLoading(true);
    setError(null);
    try {
      const result = await ChannelStoreService.initiateOAuth({
        channelType,
        organizationId,
        storeName: storeName.trim() || channelType + "-store",
        region: region.trim() || undefined,
        shop: channelType === "shopify" ? shop.trim() : undefined,
      });
      // Full-page redirect — backend callback will redirect back to /channels/stores
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start authorization");
      setLoading(false);
    }
    // Do NOT set loading=false on success — page is navigating away
  }

  // Manual path — kept for non-OAuth channels
  async function handleManualConnect(credentials: Record<string, string>) {
    // ... existing manual connect logic ...
  }

  return (
    <Dialog>
      {/* Channel type selector — same as before */}

      {/* Store name + region — always shown */}
      <input value={storeName} onChange={e => setStoreName(e.target.value)}
             placeholder="Store display name" />
      <input value={region} onChange={e => setRegion(e.target.value)}
             placeholder="Region (US, EU, SEA…)" />

      {/* Shopify: needs shop domain before redirect */}
      {channelType === "shopify" && (
        <input value={shop} onChange={e => setShop(e.target.value)}
               placeholder="your-brand.myshopify.com" />
      )}

      {isOAuthChannel ? (
        // OAuth flow — no credential fields
        <div>
          <p className="text-sm text-gray-500">
            You will be redirected to {CHANNEL_LABELS[channelType]} to authorize access.
            No credentials to enter — the backend handles everything.
          </p>
          <button onClick={handleOAuthConnect} disabled={loading}>
            {loading ? "Redirecting…" : `Connect with ${CHANNEL_LABELS[channelType]}`}
          </button>
        </div>
      ) : (
        // Manual flow — credential fields unchanged
        <ManualCredentialForm channelType={channelType} onSubmit={handleManualConnect} />
      )}

      {error && <p className="text-red-500">{error}</p>}
    </Dialog>
  );
}
```

---

## 5. Handle the OAuth Callback Redirect in `ChannelStoresDashboard`

After a successful OAuth connection, the backend redirects to:

```
/channels/stores?connected=shopify          ← new connection
/channels/stores?reconnected=tiktokshop     ← re-authorization
```

The `ChannelStoresDashboard` page needs to detect these params and refresh the store list:

```tsx
// ChannelStoresDashboard.tsx

import { useSearchParams } from "next/navigation";

export default function ChannelStoresDashboard() {
  const searchParams = useSearchParams();
  const [stores, setStores]   = useState<ChannelStoreConnection[]>([]);
  const [toast, setToast]     = useState<string | null>(null);

  useEffect(() => {
    // Detect OAuth success redirect
    const connected    = searchParams.get("connected");
    const reconnected  = searchParams.get("reconnected");
    const errorParam   = searchParams.get("error");

    if (connected) {
      setToast(`${CHANNEL_LABELS[connected] ?? connected} store connected successfully!`);
      loadStores();  // refresh list — the new store is now in the DB
      // Clean up the URL
      window.history.replaceState({}, "", "/channels/stores");
    } else if (reconnected) {
      setToast(`${CHANNEL_LABELS[reconnected] ?? reconnected} reconnected successfully!`);
      loadStores();
      window.history.replaceState({}, "", "/channels/stores");
    } else if (errorParam) {
      setToast(`Connection failed: ${decodeURIComponent(errorParam)}`);
      window.history.replaceState({}, "", "/channels/stores");
    }
  }, [searchParams]);

  // ... rest of component
}
```

---

## 6. Update `StoreCard` — Add Status Badge and Reconnect Button

The `StoreCard` component needs to render status visually and expose a reconnect action:

```tsx
// StoreCard.tsx

const STATUS_CONFIG = {
  ACTIVE:              { label: "Active",              color: "bg-green-100 text-green-700" },
  RECONNECT_REQUIRED:  { label: "Reconnect Required",  color: "bg-amber-100 text-amber-700" },
  DISCONNECTED:        { label: "Disconnected",         color: "bg-red-100 text-red-700" },
  INACTIVE:            { label: "Inactive",             color: "bg-gray-100 text-gray-500" },
} as const;

interface StoreCardProps {
  store: ChannelStoreConnection;
  organizationId: string;
  onDeactivate: (storeId: string) => void;
  onReconnect:  (store: ChannelStoreConnection) => void;  // NEW
}

export function StoreCard({ store, organizationId, onDeactivate, onReconnect }: StoreCardProps) {
  const status = STATUS_CONFIG[store.connectionStatus] ?? STATUS_CONFIG.INACTIVE;

  return (
    <div className={`rounded-lg border p-4 ${store.isActive ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between mb-2">
        <ChannelTypeBadge channelType={store.channelType} />

        {/* NEW: connection status badge */}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>

      <p className="font-semibold">{store.storeName}</p>
      <p className="text-sm text-gray-500">{store.storeUrl}</p>
      {store.region && <p className="text-xs text-gray-400">{store.region}</p>}

      {/* NEW: disconnected timestamp */}
      {store.disconnectedAt && (
        <p className="text-xs text-red-400 mt-1">
          Disconnected {new Date(store.disconnectedAt).toLocaleDateString()}
          {store.disconnectReason ? ` (${store.disconnectReason.replace(/_/g, " ")})` : ""}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        {/* NEW: Reconnect button — shown for RECONNECT_REQUIRED and DISCONNECTED */}
        {(store.connectionStatus === "RECONNECT_REQUIRED" ||
          store.connectionStatus === "DISCONNECTED") && (
          <button
            onClick={() => onReconnect(store)}
            className="text-xs px-3 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
          >
            Reconnect
          </button>
        )}

        {/* Deactivate — only for active stores */}
        {store.isActive && store.connectionStatus === "ACTIVE" && (
          <button
            onClick={() => onDeactivate(store.storeId)}
            className="text-xs px-3 py-1 rounded border text-gray-500 hover:bg-gray-100"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}
```

### Reconnect handler in `ChannelStoresDashboard`

```tsx
// Open ConnectStoreModal pre-filled with the store's channelType
// The OAuth flow will re-authorize and update credentials automatically
function handleReconnect(store: ChannelStoreConnection) {
  setReconnectStore(store);   // pass to modal so it can pre-fill storeName
  setShowModal(true);
}
```

---

## 7. Update the `ChannelStoresDashboard` Store List to Show All Statuses

The current implementation shows only active stores. With Phase D/E, `DISCONNECTED` and `RECONNECT_REQUIRED` stores need to be visible so merchants can act on them.

**Recommendation:** Show all non-deleted stores (active + inactive), filtered/sorted by status:

```typescript
// channelStoreService.ts — add a separate call for all stores
async listAllStores(organizationId: string): Promise<ChannelStoreConnection[]> {
  const res = await fetch(
    `${API_BASE}/channel-stores?organizationId=${organizationId}&includeInactive=true`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
},
```

> **Note for backend:** The current `GET /channel-stores` endpoint returns only active stores. The backend team should confirm whether `includeInactive=true` is supported or a separate endpoint is needed.

---

## 8. `ConnectStoreModal` — Passing `storeId` for Reconnect

When the `Reconnect` button is clicked, the modal should initiate OAuth with the existing `storeId` embedded in the state param. The backend uses this to call `reconnectStore()` (update credentials on the existing record) instead of creating a new one.

The `OAuthInitiateRequest` already supports `storeId` via the existing `OAuthStatePayload.storeId` field on the backend. Pass it through:

```typescript
async initiateOAuth(request: OAuthInitiateRequest & { storeId?: string }): Promise<OAuthInitiateResponse> {
  const params = new URLSearchParams({
    channelType: request.channelType,
    organizationId: request.organizationId,
    storeName: request.storeName,
    ...(request.region  ? { region: request.region }   : {}),
    ...(request.shop    ? { shop: request.shop }        : {}),
    ...(request.storeId ? { storeId: request.storeId } : {}),
  });
  // ...
}
```

---

## 9. Minor: Credentials Request Format for Manual Channels

For non-OAuth channels that still use the manual form (`POST /api/v1/channel-stores`), the request body `credentials` field is now an **array** of `CredentialEntry` objects, not a flat map.

```typescript
// BEFORE (old format — no longer accepted)
{
  "credentials": {
    "accessToken": "xxx",
    "apiKey": "yyy"
  }
}

// AFTER (current format)
{
  "credentials": [
    { "chnlCredKey": "accessToken_key", "chnlCredName": "accessToken", "chnlCredValue": "xxx" },
    { "chnlCredKey": "apiKey_key",      "chnlCredName": "apiKey",      "chnlCredValue": "yyy" }
  ]
}
```

> `chnlCredName` is used as the map key internally. `chnlCredKey` can be set to `{chnlCredName}_cred` as a convention. `chnlCredValue` is the actual secret value.

Update the `StoreConnectionRequest` type and the `handleManualConnect()` submission logic accordingly.

---

## Checklist — All Required Frontend Changes

```
Types (channelStore.ts)
  ☐ Add reconnectRequired, connectionStatus, disconnectedAt, disconnectReason to ChannelStoreConnection
  ☐ Add OAuthInitiateRequest type
  ☐ Add OAuthInitiateResponse type
  ☐ Update StoreConnectionRequest.credentials to CredentialEntry[] for manual channels

Service (channelStoreService.ts)
  ☐ Add initiateOAuth() method — calls GET /api/v1/oauth/initiate
  ☐ Add reactivateStore() method — calls PUT /{storeId}/reactivate
  ☐ Update connectStore() credentials field to CredentialEntry[] array format

ConnectStoreModal.tsx
  ☐ Add const OAUTH_CHANNELS list
  ☐ Add Shopify shop-domain input (required for OAuth initiation)
  ☐ Render "Connect with {Channel}" button for OAuth channels
  ☐ Keep manual credential form for non-OAuth channels only
  ☐ Accept optional reconnect store prop (pre-fill storeName + storeId)

ChannelStoresDashboard.tsx
  ☐ Detect ?connected= and ?reconnected= query params on mount
  ☐ Show toast notification on successful OAuth connect / reconnect
  ☐ Refresh store list after OAuth callback detected
  ☐ Clean up query params from URL after handling
  ☐ Add onReconnect handler → opens modal with storeId pre-set
  ☐ Consider showing all statuses (not just isActive=true)

StoreCard.tsx
  ☐ Add STATUS_CONFIG map for all 4 connectionStatus values
  ☐ Render connectionStatus badge on every card
  ☐ Show disconnectedAt timestamp for DISCONNECTED stores
  ☐ Add Reconnect button for RECONNECT_REQUIRED and DISCONNECTED
  ☐ Hide Deactivate button for non-ACTIVE stores
```

---

## New API Endpoints (Phase B–E)

| Method | Path | When to call |
|--------|------|-------------|
| `GET` | `/api/v1/oauth/initiate?channelType=&organizationId=&storeName=&shop=` | User clicks "Connect with {Channel}" |
| `GET` | `/api/v1/oauth/{channelType}/callback` | Backend-handled only — marketplace redirects here directly |
| `POST` | `/api/v1/webhooks/{channelType}/{event}` | Backend-handled only — marketplace sends webhook here |

The frontend only calls the **initiate** endpoint. The callback and webhook endpoints are called by the marketplace, not the frontend.

---

## No Changes Required

These existing integrations continue to work unchanged:

- `GET /api/v1/channel-stores` — same endpoint, same auth
- `PUT /api/v1/channel-stores/{storeId}/deactivate` — unchanged
- `PUT /api/v1/channel-stores/{storeId}/display-order` — unchanged
- `PATCH /api/v1/channel-stores/{storeId}/credentials` — unchanged (manual credential rotation)
- `ChannelTypeBadge` component — no changes needed
- `organizationId` query param convention — unchanged
