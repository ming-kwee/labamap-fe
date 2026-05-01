# Frontend Integration Guide

Route: `/channels/stores`  
Page: `src/app/(admin)/channels/stores/page.tsx`  
Components: `src/modules/channel-platform/components/stores/`

---

## Component Architecture

```
ChannelStoresDashboard           ← page root; loads stores, owns state
  ├── StoreCard[]                 ← one per connected store
  │     ├── ChannelTypeBadge      ← colored channel label
  │     └── action buttons        ← differ by connectionStatus
  └── ConnectStoreModal           ← modal for new connections
        ├── channel type selector
        ├── storeName / storeUrl / region inputs
        └── credentials section   ← dynamic per channelType
```

---

## Data Flow

```
ChannelStoresDashboard
  useEffect on mount
    → ChannelStoreService.listStores(orgId)
    → GET /channel-stores?organizationId=org_123&includeInactive=true
    → setStores(data)

  handleConnect(request)
    → ChannelStoreService.connectStore(orgId, request)      [manual channels]
    → POST /channel-stores
    → optimistic update: setStores(prev => [...prev, newStore].sort())
                          │
    OR for OAuth channels (Shopify, Wix, TikTok, Amazon, eBay):
    → ChannelOAuthService.initiateOAuth({ channelType, orgId, ... })
    → GET /oauth/initiate
    → window.location.href = authorizationUrl        ← browser redirect
    → (callback → backend → redirect back to /channels/stores?connected=shopify)
    → dashboard detects ?connected= → shows toast → reloads stores

  handleDeactivate(storeId)
    → ChannelStoreService.deactivateStore(storeId, orgId)
    → PUT /channel-stores/{storeId}/deactivate
    → setStores(prev => prev.filter(s => s.storeId !== storeId))

  handleReconnect(store)          ← for RECONNECT_REQUIRED / DISCONNECTED status
    → same OAuth initiation flow with existing storeId
```

---

## `CREDENTIAL_FIELDS` Map (ConnectStoreModal)

Manual-credential channels render inputs dynamically from this map:

```typescript
const CREDENTIAL_FIELDS: Record<ChannelType, Array<{ key: string; label: string; sensitive?: boolean }>> = {
  shopify:    [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "apiKey",      label: "API Key",       sensitive: true },
    { key: "apiSecret",   label: "API Secret",    sensitive: true },
  ],
  wix:        [{ key: "accessToken", label: "Access Token", sensitive: true },
               { key: "wixSiteId",   label: "WIX Site ID" }],
  amazon:     [{ key: "sellerId",     label: "Seller ID" },
               { key: "marketplaceId",label: "Marketplace ID" },
               { key: "accessKey",    label: "Access Key", sensitive: true },
               { key: "secretKey",    label: "Secret Key", sensitive: true }],
  ebay:       [{ key: "accessToken",  label: "Access Token", sensitive: true },
               { key: "refreshToken", label: "Refresh Token", sensitive: true },
               { key: "siteId",       label: "Site ID" }],
  tiktokshop: [{ key: "appKey",       label: "App Key" },
               { key: "appSecret",    label: "App Secret", sensitive: true },
               { key: "accessToken",  label: "Access Token", sensitive: true },
               { key: "shopCipher",   label: "Shop Cipher" }],
  // ... lazada, tokopedia, shopee, facebook, walmart
};
```

When the user changes channel type, `credentials` state resets to `{}` — old field values are cleared.

---

## OAuth vs Manual Split in ConnectStoreModal

```typescript
const OAUTH_CHANNELS: ChannelType[] = ["shopify", "wix", "tiktokshop", "amazon", "ebay"];

// On submit:
if (OAUTH_CHANNELS.includes(channelType)) {
  const { authorizationUrl } = await ChannelOAuthService.initiateOAuth({
    channelType, organizationId, storeName, region,
    shop: storeUrl,      // Shopify-specific shop domain
  });
  window.location.href = authorizationUrl;  // browser redirect
} else {
  await onConnect({ channelType, storeName, storeUrl, region, credentials });
}
```

---

## StoreCard Action Buttons by Status

| `connectionStatus` | Channel type | Buttons shown |
|-------------------|-------------|---------------|
| `ACTIVE` | OAuth channel | Deactivate |
| `ACTIVE` | Manual channel | Edit · Deactivate |
| `RECONNECT_REQUIRED` | OAuth | Reconnect (amber) · Deactivate |
| `DISCONNECTED` | Any | Reconnect · Delete |
| `INACTIVE` | Any | Reactivate · Delete |

---

## Adding a New Channel — 5-Step Checklist

### Step 1: Update the `ChannelType` union

`src/modules/channel-platform/types/channelStore.ts`:
```typescript
export type ChannelType =
  | "shopify" | "wix" | "amazon" | "ebay" | "tiktokshop"
  | "lazada" | "tokopedia" | "facebook" | "shopee" | "walmart"
  | "temu";   // ← new
```

### Step 2: Add to channel options list in ConnectStoreModal

```typescript
const CHANNEL_OPTIONS = [
  // ... existing
  { value: "temu", label: "Temu" },
];
```

### Step 3: Define credential fields

```typescript
const CREDENTIAL_FIELDS = {
  // ... existing
  temu: [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "appId",       label: "App ID" },
    { key: "appSecret",   label: "App Secret", sensitive: true },
  ],
};
```

### Step 4: Add badge styling in ChannelTypeBadge

```typescript
const CHANNEL_CONFIGS: Record<ChannelType, { label: string; color: string; icon: string }> = {
  // ... existing
  temu: {
    label: "Temu",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: "T"
  },
};
```

### Step 5: Backend — seed `ChannelConfigurationDataLoader`

Add a new `ChannelConfiguration` entry with:
- `channelId: "temu"`
- `integrationConfig.authentication.credentialMapping` — maps credential keys → `customOptions` keys
- `integrationConfig.tokenRefresh` — `enabled: false` if static token; `enabled: true` with endpoint config if OAuth refresh needed
- `oauthConfig` — if this channel will use Phase B/C OAuth flow

---

## State Management

```typescript
// ChannelStoresDashboard key state
const [stores, setStores] = useState<ChannelStoreConnection[]>([]);
const [loading, setLoading] = useState(true);
const [error,   setError]   = useState<string | null>(null);
const [showModal, setShowModal] = useState(false);
```

**Optimistic updates:** After connect, the new store is appended immediately without refetching. After deactivate, the store is filtered out immediately.

**OAuth callback detection:** On mount, `useSearchParams()` checks for `?connected=shopify`, `?reconnected=shopify`, or `?error=REASON` query params set by the backend redirect and shows a toast.

---

## `organizationId` Wiring

Currently hardcoded as `"org_123"` in dashboard components. For production:

```typescript
import { useAuth } from "@/shared/contexts/AuthContext";

export default function ChannelStoresDashboard() {
  const { organizationId } = useAuth();
  // pass organizationId to all service calls
}
```
