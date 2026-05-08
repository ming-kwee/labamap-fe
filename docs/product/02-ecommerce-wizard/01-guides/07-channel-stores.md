# Channel Stores Management

## What This Module Does

Channel stores management lets sellers connect, configure, and manage e-commerce platform
integrations. Connected stores become tabs in Step 2 (channel-specific field entry) and
publish targets in Step 3. A store must be ACTIVE to appear in either place.

---

## Three Data Collections

```
channel_configurations          channel_store_connections         channel_product_data
(one per CHANNEL TYPE)          (one per STORE INSTANCE)          (one per PRODUCT × STORE)
──────────────────────          ─────────────────────────         ──────────────────────────
Transformation contract         Physical connection               What the seller filled in
JOLT spec, field mappings,      Store name, URL, region,          for this product × store
postProcessingRules,            encrypted credentials,
apiWrapperConfig,               token expiry, OAuth state,
channelMappings                 connectionStatus lifecycle
```

`channel_configurations` is per channel TYPE — all Shopify stores share one document.
`channel_store_connections` is per STORE INSTANCE — one org with two Shopify stores has two documents.

---

## Two Connection Methods

### OAuth channels (redirect flow)
`OAUTH_CHANNELS = { shopify, wix, tiktok, amazon, ebay }`

The merchant never enters credentials. The modal redirects the browser to the channel's
OAuth consent screen; the backend exchanges the authorization code for tokens and stores
them encrypted. No credential form is shown on the frontend.

### Manual channels (credential form)
`lazada, tokopedia, facebook, shopee, walmart`

The merchant enters API keys, access tokens, store IDs, etc. The exact fields are
**data-driven** — fetched from `GET /channel-stores/credential-schema/{channelType}`.
The form renders one input per `CredentialFieldSchema` entry; the backend can add, rename,
or remove fields by updating the schema document without frontend changes.

---

## ConnectStoreModal: Which Flow to Show

The modal contains two branches — only one is active at a time:

```
existingStore?  connectionStatus?  channelType in OAUTH_CHANNELS?  → result
─────────────────────────────────────────────────────────────────────────────
null (new conn) —                  YES                              showOAuthFlow
null (new conn) —                  NO                               showManualForm
ACTIVE          —                  YES                              showManualForm  ← edit OAuth store's stored creds
ACTIVE          —                  NO                               showManualForm
RECONNECT_REQUIRED / DISCONNECTED  YES                              showOAuthFlow   ← reconnect passes storeId
RECONNECT_REQUIRED / DISCONNECTED  NO                               showManualForm
```

Key decision expression:
```typescript
const isReconnectMode = existingStore?.connectionStatus === "RECONNECT_REQUIRED"
                     || existingStore?.connectionStatus === "DISCONNECTED";
const isEditMode = Boolean(existingStore) && !isReconnectMode;

const isOAuthChannel = OAUTH_CHANNELS.has(channelType);
const showOAuthFlow = isOAuthChannel && (!existingStore || isReconnectMode);
const showManualForm = !showOAuthFlow;
```

When editing an ACTIVE OAuth store (e.g., updating a Shopify store name), the manual form
shows the credential schema fields with "Leave blank to keep existing" placeholders — the
backend only overwrites credentials that are non-empty in the submission.

---

## Full OAuth Connection Flow (Phase B)

```
1. Merchant opens ConnectStoreModal, selects channel type (e.g. Shopify)
   → showOAuthFlow = true

2. Merchant enters store name + optional region
   Shopify only: also enters shop domain (e.g. my-brand.myshopify.com)
   Other OAuth channels: no domain needed

3. Merchant clicks "Connect with {Channel}"
   → ConnectStoreModal.handleOAuthConnect()
   → ChannelStoreService.initiateOAuth({
       channelType, organizationId, storeName, region?,
       shop?,       ← Shopify only (subdomain without protocol or .myshopify.com)
       storeId?     ← only in reconnect mode (tells backend to update existing store)
     })
   → GET /api/v1/oauth/initiate?channelType=...&organizationId=...&storeName=...&shop=...
   → { authorizationUrl, nonce, channelType }

4. window.location.href = authorizationUrl
   → Browser navigates to channel consent screen (Shopify, Wix installer, Amazon, etc.)

5. Merchant approves scopes

6. Channel redirects to BACKEND callback URL (not the frontend)
   Backend: exchanges code → creates/updates channel_store_connections → stores encrypted token
   Backend: redirects browser to /channels/stores?connected={channelType}

7. ChannelStoresDashboard detects ?connected={channelType} via useSearchParams
   → shows success toast "Shopify store connected successfully"
   → calls listAllStores() to reload the grid
```

**Reconnect flow** follows the same steps, with these differences:

- The **Reconnect button** on the StoreCard passes the full `existingStore` object to `ConnectStoreModal`
  as the `existingStore` prop. There is no `storeId` form field — the merchant never types it.
- The modal detects reconnect mode from `connectionStatus`:
  ```typescript
  const isReconnectMode =
    existingStore?.connectionStatus === "RECONNECT_REQUIRED" ||
    existingStore?.connectionStatus === "DISCONNECTED";
  ```
- The channel type dropdown is **locked** (disabled) — the merchant cannot change it.
- Store name and region fields are **pre-filled** from the existing store record.
- In step 3, `handleOAuthConnect()` silently reads `existingStore.storeId` and passes it:
  ```typescript
  storeId: isReconnectMode ? existingStore?.storeId : undefined,
  ```
- The backend receives `storeId` and **updates** the existing `channel_store_connections` document
  (new token, clears `reconnectRequired`, sets `connectionStatus = ACTIVE`) rather than creating a new one.
- On return, the backend redirects to `/channels/stores?reconnected={channelType}`.
  The dashboard detects `?reconnected=` via `useSearchParams` and shows a success toast.

---

## OAuth Endpoint: Unified vs Legacy

| Version | Frontend call | Backend path |
|---------|--------------|-------------|
| **Current (Phase B+)** | `GET /oauth/initiate?channelType=...` | Single generic handler |
| Legacy (Phase A) | `GET /oauth/{channelType}/initiate` | Per-channel handler |
| Legacy callback | `POST /oauth/{channelType}/callback` | Per-channel (deprecated) |

`ChannelOAuthService.completeOAuth()` calls the legacy POST callback — it is kept for
backwards compatibility but is never called in the Phase B+ flow. The backend now handles
the callback GET itself and redirects directly to `/channels/stores`.

---

## ConnectionStatus State Machine

```
                    ┌──────────────────────────────────────────┐
                    │              ACTIVE                       │
                    │  isActive=true, reconnectRequired=false   │
                    └────┬──────────────────────────────────────┘
                         │                     ▲
              token expires/             OAuth reconnect
              revoked (401/403)          (OAuthCallbackService
                         │                clears reconnectRequired)
                         ▼
                ┌─────────────────────────────────┐
                │       RECONNECT_REQUIRED         │
                │  reconnectRequired=true           │
                └────┬────────────────────────────-┘
                     │                     ▲
         webhook fires              (not restorable
         (app_uninstalled,           from DISCONNECTED —
          deauthorize, etc.)         must reconnect fresh)
                     │
                     ▼
                ┌─────────────────────────────────┐
                │          DISCONNECTED            │
                │  isActive=false, disconnectedAt  │
                │  reconnectRequired may be true   │
                └─────────────────────────────────┘

Manual deactivate (PUT /deactivate) → INACTIVE  (isActive=false, no disconnectReason)
Manual reactivate (PUT /activate)   → ACTIVE
DELETE → store removed permanently
```

`connectionStatus` is derived by the backend from `isActive + reconnectRequired + disconnectedAt`.
The frontend uses `deriveStatus()` as a fallback for stores created before Phase E:

```typescript
function deriveStatus(store: ChannelStoreConnection): ConnectionStatus {
  if (store.connectionStatus) return store.connectionStatus;
  return store.isActive ? "ACTIVE" : "INACTIVE";
}
```

**Webhook disconnect reasons per channel:**
| Channel | `disconnectReason` value |
|---------|-------------------------|
| Shopify | `"app_uninstalled"` |
| TikTok Shop | `"deauthorize"` |
| Wix | `"app_removed"` |
| Amazon | `"app_deauthorized"` |
| eBay | `"account_deletion"` |
| Manual API | `"manual"` |

---

## StoreCard Action Buttons by Status

| Status | OAuth channel | Manual channel |
|--------|--------------|----------------|
| ACTIVE | [Deactivate] | [Edit, Deactivate] |
| RECONNECT_REQUIRED | [Reconnect (amber), Deactivate] | [Edit, Deactivate] |
| DISCONNECTED | [Reconnect, Delete] | [Edit, Delete] |
| INACTIVE | [Reactivate, Delete] | [Reactivate, Delete] |

OAuth channels never show an Edit button when ACTIVE because there are no credentials to
edit — tokens are managed by the OAuth flow, not entered manually.

---

## Token Lifecycle

```
Before every publish:
  GenericTokenRefreshService.getValidCredentials()
    checks tokenExpiry[credentialKey]

  If expires within buffer (default 5 min):
    → call channel token refresh endpoint
    → update channel_store_connections with new token + new expiry
    → proceed with fresh token

  If refresh fails (401/403 from channel):
    → set reconnectRequired = true
    → set connectionStatus = RECONNECT_REQUIRED
    → throw error; publish is blocked until merchant re-authorizes
```

The frontend does not manage token refresh. It only shows the `RECONNECT_REQUIRED` badge
and provides the reconnect button.

---

## `mapStore()` — Response Normalization

`mapStore(raw)` (exported from `channelStore.service.ts`) normalizes raw backend responses
into typed `ChannelStoreConnection` objects. All service methods call it via `.then(mapStore)`.

Key defense it provides:
```typescript
isActive: Boolean(r.isActive ?? r.active)
```
The Jackson library serializes `isActive` boolean fields as `active` (strips the `is` prefix)
in some backend versions. `mapStore` reads whichever key is present so the frontend works
correctly regardless of which backend version it talks to.

---

## `listStores` vs `listAllStores`

| Method | Endpoint | Use |
|--------|----------|-----|
| `listStores(orgId)` | `GET /channel-stores?organizationId=...` | Step 2 tabs, Step 3 publish targets — only active stores |
| `listAllStores(orgId)` | `GET /channel-stores?organizationId=...&includeInactive=true` | Channel Stores Dashboard, Channel Category Mapping — all statuses |

`ChannelStoresDashboard` and `ChannelCategoryMappingPage` call `listAllStores` so
RECONNECT_REQUIRED and DISCONNECTED stores are shown with their attention badges.

---

## Credential Payload: `CredentialEntry[]`

The current `StoreConnectionRequest.credentials` field is `CredentialEntry[]`, not the
old `Record<string, string>`:

```typescript
interface CredentialEntry {
  credId: string;       // backend schema identifier — from CredentialFieldSchema.credId
  chnlCredName: string; // canonical key stored in the credentials map
  chnlCredValue: string;
}
```

`ConnectStoreModal` builds this array from the credential schema:
```typescript
const credentialEntries: CredentialEntry[] = credentialSchema
  .filter(f => (credentials[f.chnlCredName] ?? "").trim() !== "")
  .map(f => ({
    credId:        f.credId,
    chnlCredName:  f.chnlCredName,
    chnlCredValue: credentials[f.chnlCredName].trim(),
  }));
```

Fields with empty values are omitted — in edit mode this means "keep existing credential".

---

## Routes

| Route | Component |
|-------|-----------|
| `/channels/stores` | `ChannelStoresDashboard` (wrapped in `<Suspense>` for `useSearchParams`) |
| `/channels/oauth/callback` | `ChannelOAuthCallbackPage` (legacy — not used in Phase B+ flow) |

---

## Codebase

| File | Purpose |
|------|---------|
| `step2-channel-fields/components/stores/ChannelStoresDashboard.tsx` | Full store management UI; detects OAuth callback query params |
| `step2-channel-fields/components/stores/ConnectStoreModal.tsx` | Add/edit/reconnect modal; branches on OAuth vs manual flow |
| `step2-channel-fields/components/stores/ChannelTypeBadge.tsx` | Color-coded channel type chip; exports `getChannelMeta()` |
| `step2-channel-fields/services/channelStore.service.ts` | `ChannelStoreService`, `ChannelCredentialSchemaService`, `mapStore` |
| `step2-channel-fields/services/channelOAuth.service.ts` | `ChannelOAuthService` — `initiateOAuth` (Phase B+); `completeOAuth` (legacy, deprecated) |
| `step2-channel-fields/types/channelStore.ts` | All TypeScript types |
