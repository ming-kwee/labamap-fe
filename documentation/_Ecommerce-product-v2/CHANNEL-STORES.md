# Channel Stores Management

## What This Module Does

The channel stores management sub-system lets sellers **connect, configure and manage
e-commerce platform integrations** (Shopify, Amazon, TikTok, Lazada, etc.) within the
product publishing wizard. Connected stores appear as tabs in Step 2 and as publish
targets in Step 3.

This is a functional, production-ready implementation — distinct from the concept
`channel-platform` module (which is an unfinished sidebar dashboard concept).

---

## Location

```
src/modules/ecommerce-product-v2/step2-channel-fields/
├── types/channelStore.ts
├── services/
│   ├── channelStore.service.ts
│   └── channelOAuth.service.ts
└── components/stores/
    ├── ChannelTypeBadge.tsx
    ├── ConnectStoreModal.tsx
    └── ChannelStoresDashboard.tsx
```

---

## Pages

| Route | File | Component |
|-------|------|-----------|
| `/channels/stores` | `src/app/(admin)/channels/stores/page.tsx` | `ChannelStoresDashboard` |
| `/channels/oauth/callback` | `src/app/(admin)/channels/oauth/callback/page.tsx` | `ChannelOAuthCallbackPage` |

---

## Components

### `ChannelStoresDashboard`

Full store management UI. Handles the entire lifecycle of a store connection.

```tsx
import ChannelStoresDashboard from '@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelStoresDashboard';
// or via the v2 root barrel:
import { ChannelStoresDashboard } from '@/modules/ecommerce-product-v2';

// No props needed — fetches its own data
<ChannelStoresDashboard />
```

**Features:**
- Lists all connected stores as cards (`StoreCard`)
- Shows channel type badge, store name, URL, region, connection date
- Active / Inactive status toggle per store
- Deactivate / Reactivate / Delete actions with confirmation
- "Connect Store" button → opens `ConnectStoreModal`
- Edit existing store credentials → opens `ConnectStoreModal` in edit mode
- Empty state guidance when no stores are connected

### `ConnectStoreModal`

Add-store or edit-store modal dialog.

```tsx
import ConnectStoreModal from '@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ConnectStoreModal';
```

**Props**

| Prop | Type | Description |
|------|------|-------------|
| `organizationId` | `string` | The user's organization ID |
| `onClose` | `() => void` | Called on cancel or after a successful submit |
| `onConnect` | `(req: StoreConnectionRequest) => Promise<void>` | Called with the form payload; parent is responsible for calling the service |
| `existingStore?` | `ChannelStoreConnection` | If provided the modal opens in **edit mode** with fields pre-filled |

**Add Store flow:**
1. Seller selects channel type (Shopify / Amazon / TikTok / …)
2. On channel type selection, modal fetches `GET /channel-stores/credential-schema/{channelType}` → renders credential inputs dynamically
3. Enters store name, URL, region
4. Fills credential fields rendered from the live schema (label, inputType, helpText, required per credential)
5. For Shopify: defaults to OAuth mode; can switch to manual API key entry
6. On submit: `onConnect(StoreConnectionRequest)` → parent calls `ChannelStoreService.connectStore`

**Edit Store flow:**
1. Channel type is locked (cannot be changed after initial connection)
2. Credentials section shows placeholder text "Leave blank to keep existing"
3. Only fields the user fills are included in the credential payload
4. On submit: `onConnect({ ...request, storeId: existingStore.storeId })` → parent calls `ChannelStoreService.updateStore`

---

### Credential Form — Implementation (Data-Driven)

Credential fields are driven by the backend schema endpoint, consistent with the data-driven
pattern used throughout Step 1 (dynamic form schema) and Step 2 (channel field schema).

**Backend endpoint:**

```
GET /api/v1/channel-stores/credential-schema/{channelType}
→ CredentialFieldSchema[]
```

**Example response for Wix:**

```json
[
  {
    "credId":       "wix_access_token",
    "chnlCredName": "accessToken",
    "label":        "API Access Token",
    "inputType":    "password",
    "sensitive":    true,
    "required":     true,
    "helpText":     "Wix API access token from the Wix Developers portal"
  },
  {
    "credId":       "wix_site_id",
    "chnlCredName": "wixSiteId",
    "label":        "Wix Site ID",
    "inputType":    "text",
    "sensitive":    false,
    "required":     true,
    "helpText":     "Found in your Wix dashboard URL after /dashboard/"
  }
]
```

**Frontend behaviour in `ConnectStoreModal`:**

1. On `channelType` change → `useEffect` calls `ChannelCredentialSchemaService.getCredentialSchema(channelType)`
2. Shows a loading spinner while the schema is fetching
3. Renders one `<input>` per `CredentialFieldSchema` entry:
   - `type` set from `field.inputType` (text / password / email / url / number)
   - `required` set from `field.required` (skipped in edit mode — all credentials optional on update)
   - `helpText` shown below the input when present
4. Credential key used in the submission payload is `field.chnlCredName`
5. On submit: credentials sent as `Record<string, string>` keyed by `chnlCredName`

**Submission payload shape (unchanged from `StoreConnectionRequest`):**

```json
{
  "credentials": {
    "accessToken": "...",
    "wixSiteId":   "53001808-..."
  }
}
```

The keys in this map are the `chnlCredName` values from the schema — they are the backend's
canonical credential name, so the mapping is correct by construction.

**Shopify has a special OAuth mode** hardcoded directly in JSX — the channel type selector
defaults Shopify to an OAuth flow (shop domain input → redirect to Shopify consent → callback)
with a manual fallback. No other channel has this in-JSX special casing yet.

**Comparison with the previous static map:**

| | Static `CREDENTIAL_FIELDS` (removed) | Backend schema (current) |
|---|---|---|
| Adding a new channel | Frontend code change | Backend config only |
| Changing a credential name/type | Frontend code change | Backend config only |
| `helpText` per credential | Not supported | Schema-driven |
| `inputType` per credential | Hard-coded as text/password | Schema-driven |
| Per-credential `required` | Not supported | Schema-driven |
| Consistent with Step 1 & 2 | No | Yes |

### `ChannelTypeBadge`

Color-coded chip for a channel type, used throughout the wizard.

```tsx
import ChannelTypeBadge, { getChannelMeta } from '@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge';
// or via the v2 root barrel:
import { ChannelTypeBadge, getChannelMeta } from '@/modules/ecommerce-product-v2';
```

```tsx
<ChannelTypeBadge channelType="shopify" />
<ChannelTypeBadge channelType="amazon" size="lg" />
```

**Props**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `channelType` | `ChannelType` | — | The channel identifier |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size |

**`getChannelMeta(channelType)`** — returns `{ label, bgClass, textClass, code }` for
building custom badge UIs.

**Supported channel types:**

| Type | Display name |
|------|-------------|
| `shopify` | Shopify |
| `wix` | Wix |
| `amazon` | Amazon |
| `ebay` | eBay |
| `tiktok` | TikTok Shop |
| `lazada` | Lazada |
| `tokopedia` | Tokopedia |
| `facebook` | Facebook Shop |
| `shopee` | Shopee |
| `walmart` | Walmart |

---

## OAuth Flow

Currently only **Shopify** has an in-UI OAuth flow. The modal defaults Shopify to OAuth mode
and falls back to manual API key entry. Other channels (TikTok, etc.) use manual credentials only
despite being OAuth-capable platforms — extending OAuth to them requires adding per-channel
JSX branches or migrating to the data-driven schema approach.

```
[ConnectStoreModal — Shopify OAuth mode]
  → user enters shop domain (e.g. mystore.myshopify.com)
  → ChannelOAuthService.initiateOAuth("shopify", { organizationId, returnUrl, extras: { shopDomain } })
  → GET /oauth/shopify/initiate?organizationId=...&returnUrl=...&shopDomain=...
  → { authUrl: "https://mystore.myshopify.com/admin/oauth/authorize?..." }
  → window.location.href = authUrl   ← browser redirected to Shopify consent screen

[Shopify OAuth consent screen]
  → seller approves scopes
  → Shopify redirects to /channels/oauth/callback?code=...&state=...&channelType=shopify&shop=...&hmac=...

[ChannelOAuthCallbackPage — /channels/oauth/callback]
  → reads code, state, channelType from URL; all other params go into extras
  → ChannelOAuthService.completeOAuth("shopify", { code, state, extras: { shop, hmac } })
  → POST /oauth/shopify/callback  body: { code, state, shop, hmac }
  → ChannelStoreConnection
  → redirect to /channels/stores (success) after 2s
```

### `ChannelOAuthService`

```ts
import { ChannelOAuthService } from '@/modules/ecommerce-product-v2/step2-channel-fields/services/channelOAuth.service';
```

| Method | HTTP | Endpoint | Description |
|--------|------|----------|-------------|
| `initiateOAuth(channelType, params)` | `GET` | `/oauth/{channelType}/initiate?...` | Returns `{ authUrl }` — the provider consent URL |
| `completeOAuth(channelType, params)` | `POST` | `/oauth/{channelType}/callback` | Exchanges code for token, saves store, returns `ChannelStoreConnection` |

**`InitiateOAuthParams`**

```ts
interface InitiateOAuthParams {
  organizationId: string;
  returnUrl: string;        // /channels/oauth/callback with channelType query param
  storeName?: string;
  region?: string;
  extras?: Record<string, string>;  // e.g. { shopDomain } for Shopify
}
```

**`CompleteOAuthParams`**

```ts
interface CompleteOAuthParams {
  code: string;
  state: string;
  extras?: Record<string, string>;  // provider-specific callback params (shop, hmac for Shopify)
}
```

The `extras` bag on both methods is the mechanism for passing channel-specific parameters
without needing a typed interface per channel. The callback page (`/channels/oauth/callback`)
automatically forwards all non-reserved URL params (`code`, `state`, `channelType`) as `extras`.

---

## Services

### `ChannelStoreService`

```ts
import { ChannelStoreService } from '@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service';
// or via root barrel:
import { ChannelStoreService } from '@/modules/ecommerce-product-v2';
```

All methods are static. All mutating operations accept `organizationId` as a guard.

| Method | Signature | Description |
|--------|-----------|-------------|
| `listStores` | `(orgId: string) → Promise<ChannelStoreConnection[]>` | All connected stores for the org |
| `getStore` | `(storeId, orgId) → Promise<ChannelStoreConnection>` | Single store by ID |
| `connectStore` | `(req: StoreConnectionRequest, orgId) → Promise<ChannelStoreConnection>` | Register new store |
| `updateStore` | `(storeId, req, orgId) → Promise<ChannelStoreConnection>` | Edit store credentials/name |
| `deactivateStore` | `(storeId, orgId) → Promise<void>` | Soft-disable |
| `reactivateStore` | `(storeId, orgId) → Promise<ChannelStoreConnection>` | Re-enable |
| `deleteStore` | `(storeId, orgId) → Promise<void>` | Hard delete |
| `updateDisplayOrder` | `(storeId, order: number, orgId) → Promise<void>` | Change tab order |

### `ChannelCredentialSchemaService`

```ts
import { ChannelCredentialSchemaService } from '@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service';
// or via root barrel:
import { ChannelCredentialSchemaService } from '@/modules/ecommerce-product-v2';
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `getCredentialSchema` | `(channelType: string) → Promise<CredentialFieldSchema[]>` | Fetch credential field definitions for one channel |

Used internally by `ConnectStoreModal` on every channel type change.

### `mapStore(raw)` — utility

Normalises raw API responses to `ChannelStoreConnection`. Handles missing fields and
ISO-vs-epoch timestamp differences.

---

## Types Reference

```ts
import type {
  ChannelType,
  ChannelStoreConnection,
  StoreConnectionRequest,
} from '@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore';
// or via root barrel:
import type {
  ChannelType,
  ChannelStoreConnection,
  StoreConnectionRequest,
} from '@/modules/ecommerce-product-v2';
```

### `ChannelStoreConnection`

```ts
interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  credentials: Record<string, string>;  // masked ("***MASKED***") in GET responses
  isActive: boolean;
  displayOrder: number;
  connectedAt: string | number;   // ISO 8601 or epoch seconds
  lastSyncedAt?: string | number;
}
```

### `StoreConnectionRequest`

```ts
interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;         // present in edit mode
  region?: string;
  displayOrder?: number;
  credentials: Record<string, string>;  // keys are chnlCredName values from the schema
}
```

### `CredentialFieldSchema`

Returned by `GET /channel-stores/credential-schema/{channelType}`. Used by `ConnectStoreModal`
to render credential inputs dynamically.

```ts
interface CredentialFieldSchema {
  /** Backend internal identifier */
  credId: string;
  /** Canonical credential name — used as key in the credentials submission map */
  chnlCredName: string;
  label: string;
  inputType: "text" | "password" | "email" | "url" | "number";
  sensitive: boolean;
  required: boolean;
  helpText?: string;
}
```

---

## API Endpoints

All base paths are relative to `NEXT_PUBLIC_BACKEND_API_URL` (`http://localhost:8888/labamap/api/v1` in dev).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/channel-stores?organizationId=` | List all stores |
| `GET` | `/channel-stores/{storeId}?organizationId=` | Get single store |
| `GET` | `/channel-stores/credential-schema/{channelType}` | Get credential field definitions for a channel |
| `POST` | `/channel-stores` | Connect a store |
| `PUT` | `/channel-stores/{storeId}` | Update store |
| `PATCH` | `/channel-stores/{storeId}/deactivate` | Deactivate |
| `PATCH` | `/channel-stores/{storeId}/reactivate` | Reactivate |
| `DELETE` | `/channel-stores/{storeId}` | Delete |
| `PATCH` | `/channel-stores/{storeId}/display-order` | Update order |
| `GET`  | `/oauth/{channelType}/initiate?organizationId=&returnUrl=&...` | Get provider consent URL |
| `POST` | `/oauth/{channelType}/callback` | Exchange code → store record |

---

## Separation from `channel-platform`

This sub-module should **not** be confused with `src/modules/channel-platform/`. That
module is an **unfinished dashboard concept** (Channel Hub, Sync Queue, Inventory Sync)
not yet wired to any backend — it only contains mock data and concept UI.

This `step2-channel-fields/stores/` implementation is **production-ready**: it calls
real API endpoints, manages real store connections, and is a dependency of the Step 2
and Step 3 wizard.

| Module | Status | Purpose |
|--------|--------|---------|
| `ecommerce-product-v2/step2-channel-fields/` | Production-ready | Store management for the wizard |
| `channel-platform/` | Concept only | Sidebar dashboard — not implemented |

---

## ORGANIZATION_ID

Both services and components currently hardcode `ORGANIZATION_ID = "org_123"`. In
production this should be injected from the authenticated session context. Locations to
update:

- `ChannelStoresDashboard.tsx` line 8
- `ChannelFieldsWizard.tsx` line 13
- `PublishDashboard.tsx` — reads `organizationId` from a prop or constant
