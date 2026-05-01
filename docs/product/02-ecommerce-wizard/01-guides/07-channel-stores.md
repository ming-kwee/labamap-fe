# Channel Stores Management

## What This Module Does

Channel stores management lets sellers connect, configure, and manage e-commerce platform integrations (Shopify, Amazon, TikTok, Lazada, etc.). Connected stores appear as tabs in Step 2 and as publish targets in Step 3.

**This is distinct from `src/modules/channel-platform/`** — that module is an unfinished dashboard concept with mock data only. This `step2-channel-fields/stores/` implementation is production-ready and calls real API endpoints.

---

## Three Data Collections

```
channel_configurations          channel_store_connections         channel_product_data
(one per CHANNEL TYPE)          (one per STORE INSTANCE)          (one per PRODUCT × STORE)
──────────────────────          ─────────────────────────         ──────────────────────────
Transformation contract         Physical connection               What the seller filled in
How to transform data           Where to send it + auth           for this product × store
for this channel type           credentials

joltSpec                        storeId: "shopify-us-store"       masterProductId
requiredFieldObjects            channelType: "shopify"            storeId
apiWrapperConfig                storeName: "My Shopify US"        channelData: {}
channelMappings                 credentials: { accessToken }      masterOverrides: {}
                                organizationId                    variantOverrides: {}
```

**Why channel_configurations must stay per channel type:** Fields like `joltSpec`, `postProcessingRules`, `apiSchema` are identical for all Shopify stores. Duplicating them per store would mean an org with 3 Shopify stores has 3 identical JOLT specs — any pipeline change requires updating 3 documents.

**Why channel_store_connections must be per store:** `storeId`, `storeName`, `storeUrl`, `credentials`, `region`, `isActive` are all different per store instance.

---

## Routes

| Route | Component |
|-------|-----------|
| `/channels/stores` | `ChannelStoresDashboard` |
| `/channels/oauth/callback` | `ChannelOAuthCallbackPage` |

---

## Components

### ChannelStoresDashboard

Full store management UI. Fetches its own data — no props needed.

```tsx
<ChannelStoresDashboard />
```

Features:
- Lists all connected stores as cards
- Channel type badge + store name + URL + region + connection date
- Active / Inactive toggle per store
- Deactivate / Reactivate / Delete actions with confirmation
- "Connect Store" button → opens `ConnectStoreModal`
- Edit credentials → opens `ConnectStoreModal` in edit mode
- Empty state guidance when no stores are connected

### ConnectStoreModal

Add-store or edit-store modal. Credential fields are **data-driven** — fetched from the backend, not hardcoded.

**Add flow:**
1. Seller selects channel type
2. `GET /channel-stores/credential-schema/{channelType}` → dynamic credential inputs
3. Seller fills store name, URL, region, credentials
4. Submit → `ChannelStoreService.connectStore()`

**Edit flow:**
1. Channel type locked (cannot change after connection)
2. Credential fields: "Leave blank to keep existing"
3. Submit → `ChannelStoreService.updateStore()`

The credential schema endpoint returns `CredentialFieldSchema[]` — each entry has `label`, `inputType`, `sensitive`, `required`, `helpText`. The form renders one `<input>` per entry. The submission payload keys are the `chnlCredName` values from the schema.

### ChannelTypeBadge

Color-coded chip for a channel type.

```tsx
<ChannelTypeBadge channelType="shopify" size="md" />

// To build custom badge UI:
const { label, bgClass, textClass } = getChannelMeta("shopify");
```

Supported types: `shopify`, `wix`, `amazon`, `ebay`, `tiktok`, `lazada`, `tokopedia`, `facebook`, `shopee`, `walmart`.

---

## OAuth Flow (Shopify)

Currently only Shopify has an in-UI OAuth flow. Other OAuth-capable channels (TikTok, WiX) use manual credentials until their per-channel logic is added.

```
ConnectStoreModal (Shopify mode)
  → seller enters shop domain (e.g. mystore.myshopify.com)
  → ChannelOAuthService.initiateOAuth("shopify", { organizationId, returnUrl, extras: { shopDomain } })
  → GET /oauth/shopify/initiate?...  → { authUrl: "https://...consent..." }
  → window.location.href = authUrl

Shopify consent screen
  → seller approves scopes
  → Shopify → /channels/oauth/callback?code=...&state=...&channelType=shopify&shop=...&hmac=...

ChannelOAuthCallbackPage
  → ChannelOAuthService.completeOAuth("shopify", { code, state, extras: { shop, hmac } })
  → POST /oauth/shopify/callback  → ChannelStoreConnection
  → redirect /channels/stores after 2s
```

The `extras` bag is the mechanism for channel-specific parameters without per-channel typed interfaces. The callback page automatically forwards all URL params not in `{code, state, channelType}` as `extras`.

---

## ChannelStoreService

```typescript
// All methods static. All mutating ops require organizationId.
ChannelStoreService.listStores(orgId)        // GET /channel-stores?organizationId=
ChannelStoreService.getStore(storeId, orgId) // GET /channel-stores/{storeId}
ChannelStoreService.connectStore(req, orgId) // POST /channel-stores
ChannelStoreService.updateStore(id, req, org)// PUT  /channel-stores/{storeId}
ChannelStoreService.deactivateStore(id, org) // PATCH /channel-stores/{storeId}/deactivate
ChannelStoreService.reactivateStore(id, org) // PATCH /channel-stores/{storeId}/reactivate
ChannelStoreService.deleteStore(id, org)     // DELETE /channel-stores/{storeId}
ChannelStoreService.updateDisplayOrder(id,n,org)// PATCH .../display-order
```

`mapStore(raw)` — utility normalizes raw API responses to `ChannelStoreConnection` (handles missing fields, timestamp formats).

---

## Token Lifecycle and Reconnect

OAuth-capable channels (TikTok Shop, WIX, Shopify) use short-lived access tokens. The backend manages token expiry automatically — the frontend does not need to handle this.

**Normal refresh flow:**
1. Before every publish, `GenericTokenRefreshService.getValidCredentials()` checks `tokenExpiry[credentialKey]`.
2. If the token expires within the configured buffer (default 5 minutes), the service calls the channel's token refresh endpoint and updates `channel_store_connections` with the new token + expiry.
3. The publish proceeds with fresh credentials.

**Reconnect required:**
- If the refresh token itself is expired or revoked (HTTP 401/403 from the channel's token endpoint), `GenericTokenRefreshService` sets `reconnectRequired = true` on the store.
- The frontend should detect `reconnectRequired: true` in the store response and show a "Re-authorize" prompt. The merchant re-initiates OAuth via `/oauth/{channelType}/initiate`.
- `OAuthCallbackService` clears `reconnectRequired = false` after successful re-authorization.

**Webhook deactivation:**
- Marketplace webhooks (Shopify `app/uninstalled`, TikTok `deauthorize`, WIX `app-removed`, etc.) trigger `WebhookService`, which sets `isActive = false`, `disconnectedAt`, and `disconnectReason` via `ChannelStoreConnectionService.deactivateByWebhook()`.
- The store remains in the database for audit purposes but is excluded from Step 2 tabs and Step 3 publish targets.

---

## Key Types

```typescript
interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;  // masked ("***MASKED***") in GET responses
  tokenExpiry?: Record<string, string>; // credential key → ISO datetime
  isActive: boolean;
  displayOrder: number;
  connectedAt: string | number;
  lastSyncedAt?: string | number;
  reconnectRequired?: boolean;          // true = merchant must re-authorize via OAuth
  disconnectedAt?: string;              // set by webhook deactivation
  disconnectReason?: string;            // "app_uninstalled" | "deauthorize" | "manual" | ...
}

interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;        // present in edit mode
  region?: string;
  credentials: Record<string, string>;  // keys = chnlCredName from credential schema
}

interface CredentialFieldSchema {
  credId: string;
  chnlCredName: string;   // used as key in credentials map
  label: string;
  inputType: "text" | "password" | "email" | "url" | "number";
  sensitive: boolean;
  required: boolean;
  helpText?: string;
}
```

---

## Codebase

| File | Purpose |
|------|---------|
| `step2-channel-fields/components/stores/ChannelStoresDashboard.tsx` | Full store management UI |
| `step2-channel-fields/components/stores/ConnectStoreModal.tsx` | Add/edit store modal with data-driven credentials |
| `step2-channel-fields/components/stores/ChannelTypeBadge.tsx` | Color-coded channel type chip |
| `step2-channel-fields/services/channelStore.service.ts` | `ChannelStoreService`, `ChannelCredentialSchemaService`, `mapStore` |
| `step2-channel-fields/services/channelOAuth.service.ts` | `ChannelOAuthService` — OAuth initiation + completion |
| `step2-channel-fields/types/channelStore.ts` | All TypeScript types for stores, OAuth, connection |
