# 10 — Frontend Integration Guide

## Overview

This document explains how the frontend components wire together, how to extend `ConnectStoreModal` with a new channel, and best practices for the store connection UI.

**Files covered:**
- `src/modules/channel-platform/types/channelStore.ts`
- `src/modules/channel-platform/services/channelStoreService.ts`
- `src/modules/channel-platform/components/stores/ConnectStoreModal.tsx`
- `src/modules/channel-platform/components/stores/ChannelStoresDashboard.tsx`
- `src/modules/channel-platform/components/stores/ChannelTypeBadge.tsx`

---

## Component Architecture

```
ChannelStoresDashboard
    │
    ├── StoreCard[]                    (per connected store)
    │       ├── ChannelTypeBadge
    │       └── deactivate button
    │
    └── ConnectStoreModal              (modal dialog)
            ├── channel type selector
            ├── storeName / storeUrl inputs
            ├── region input
            └── credentials section    (dynamic per channelType)
```

---

## Data Flow

```
Component               Service Layer           Backend API
──────────────          ────────────────        ────────────
ChannelStoresDashboard
  useEffect()  ──────►  ChannelStoreService
                          .listStores(orgId) ──► GET /channel-stores
                                           ◄──  ChannelStoreConnection[]
  setStores(data) ◄──────────────────────────

  handleConnect()──────►  .connectStore(
                              orgId,          ──► POST /channel-stores
                              request)        ◄──  ChannelStoreConnection
  setStores(prev
    => [...prev, newStore])

StoreCard
  handleDeactivate()──► .deactivateStore(
                            storeId, orgId) ──► PUT /deactivate
  onDeactivate(id) ◄────────────────────────
  setStores(prev
    => filter by id)
```

---

## Credential Fields Map (ConnectStoreModal)

The `CREDENTIAL_FIELDS` constant in `ConnectStoreModal.tsx` maps each channel type to its specific credential inputs:

```typescript
const CREDENTIAL_FIELDS: Record<ChannelType, Array<{
  key: string;
  label: string;
  sensitive?: boolean;    // renders as password input
}>> = {
  shopify:   [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "apiKey",      label: "API Key",       sensitive: true },
    { key: "apiSecret",   label: "API Secret",    sensitive: true },
  ],
  wix:       [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "wixSiteId",   label: "WIX Site ID" },
  ],
  // ... etc
};
```

When the user selects a different channel type, the `credentials` state is **reset** to `{}`, and the new fields are rendered:

```typescript
onChange={(e) => {
  setChannelType(e.target.value as ChannelType);
  setCredentials({});   // ← clear old credentials
}}
```

---

## Adding a New Channel

**Example: Adding `temu` as a new channel type.**

### Step 1: Update Types

In `src/modules/channel-platform/types/channelStore.ts`:

```typescript
export type ChannelType =
  | "shopify"
  | "wix"
  // ... existing channels ...
  | "temu";       // ← add here
```

### Step 2: Add to Channel Options List

In `ConnectStoreModal.tsx`:

```typescript
const CHANNEL_OPTIONS: Array<{ value: ChannelType; label: string }> = [
  // ... existing options ...
  { value: "temu", label: "Temu" },   // ← add here
];
```

### Step 3: Define Credential Fields

```typescript
const CREDENTIAL_FIELDS: Record<ChannelType, ...> = {
  // ... existing channels ...
  temu: [
    { key: "accessToken", label: "Access Token", sensitive: true },
    { key: "appId",       label: "App ID" },
    { key: "appSecret",   label: "App Secret", sensitive: true },
  ],
};
```

### Step 4: Add Badge Styling

In `ChannelTypeBadge.tsx`, add the color/icon for the new channel:

```typescript
const CHANNEL_CONFIGS: Record<ChannelType, { label: string; color: string; icon: string }> = {
  // ... existing ...
  temu: { label: "Temu", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: "T" },
};
```

### Step 5: Backend

Add validation logic and credential mapping for the new channel in the Spring Boot backend (see `09-backend-api.md`).

---

## The `ChannelStoreService` — API Layer

All API calls are centralized in `channelStoreService.ts`. This keeps components clean:

```typescript
// Components only call service methods — never fetch() directly

// List stores
const stores = await ChannelStoreService.listStores(organizationId);

// Connect store
const newStore = await ChannelStoreService.connectStore(organizationId, {
  channelType: "shopify",
  storeName: "My Store",
  storeUrl: "my-store.myshopify.com",
  credentials: {
    accessToken: "shpat_xxx",
    apiKey: "xxx",
    apiSecret: "xxx"
  }
});

// Deactivate
await ChannelStoreService.deactivateStore(storeId, organizationId);
```

---

## State Management in `ChannelStoresDashboard`

```typescript
// Key state variables
const [stores, setStores] = useState<ChannelStoreConnection[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [showModal, setShowModal] = useState(false);
```

### Optimistic Updates Pattern

After connecting a new store, we immediately add it to the list **without** waiting for a re-fetch:

```typescript
async function handleConnect(request: StoreConnectionRequest) {
  const newStore = await ChannelStoreService.connectStore(ORGANIZATION_ID, request);
  setStores((prev) =>
    [...prev, newStore].sort((a, b) => a.displayOrder - b.displayOrder)
  );
  // Modal closes automatically (called from onConnect callback in modal)
}
```

After deactivating, filter out the removed store immediately:

```typescript
function handleDeactivated(storeId: string) {
  setStores((prev) => prev.filter((s) => s.storeId !== storeId));
}
```

---

## ConnectStoreModal — Form State

The modal manages its own local state (not parent state):

```typescript
const [channelType, setChannelType] = useState<ChannelType>("shopify");
const [storeName, setStoreName] = useState("");
const [storeUrl, setStoreUrl] = useState("");
const [region, setRegion] = useState("");
const [credentials, setCredentials] = useState<Record<string, string>>({});
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);
```

On submit, it builds the `StoreConnectionRequest` and calls `onConnect` (the parent-provided callback):

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  setSubmitting(true);
  try {
    await onConnect({
      channelType,
      storeName: storeName.trim(),
      storeUrl: storeUrl.trim(),
      region: region.trim() || undefined,
      credentials,
    });
    onClose();    // only close on success
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to connect store");
    // modal stays open on error — user can see the error and retry
  } finally {
    setSubmitting(false);
  }
}
```

---

## ChannelTypeBadge Component

Used in both `StoreCard` and other parts of the UI to display a colored channel type label:

```typescript
// Usage
<ChannelTypeBadge channelType={store.channelType} size="sm" />
<ChannelTypeBadge channelType="amazon" size="md" />
```

The badge automatically picks color and icon from the channel config map.

---

## Loading / Error / Empty States

`ChannelStoresDashboard` handles all three states cleanly:

```tsx
{/* Loading */}
{loading && <LoadingSpinner />}

{/* Error */}
{!loading && error && (
  <ErrorBanner message={error} onRetry={loadStores} />
)}

{/* Empty */}
{!loading && !error && stores.length === 0 && (
  <EmptyState onConnect={() => setShowModal(true)} />
)}

{/* Data */}
{!loading && !error && stores.length > 0 && (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {stores.map((store) => (
      <StoreCard key={store.storeId} store={store} onDeactivate={handleDeactivated} />
    ))}
  </div>
)}
```

---

## Wiring `organizationId` from Auth Context

Currently `ORGANIZATION_ID` is hardcoded as `"org_123"`. For production:

```typescript
// Before (hardcoded)
const ORGANIZATION_ID = "org_123";

// After (from auth context)
import { useAuth } from "@/shared/contexts/AuthContext";

export default function ChannelStoresDashboard() {
  const { organizationId } = useAuth();
  // ... rest of component
}
```

The `useAuth()` hook reads from a JWT claim or session. The `organizationId` flows through:

```
JWT token (from Spring Security)
    │
    ▼
AuthContext (React Context)
    │
    ▼
useAuth() hook
    │
    ▼
ChannelStoresDashboard → ChannelStoreService.listStores(organizationId)
```

---

## Page Route

The Channel Stores page lives at:

```
src/app/(admin)/channels/stores/page.tsx
```

```typescript
// page.tsx
import ChannelStoresDashboard from "@/modules/channel-platform/components/stores/ChannelStoresDashboard";

export default function ChannelStoresPage() {
  return (
    <div className="p-6">
      <ChannelStoresDashboard />
    </div>
  );
}
```

Accessible at: `/channels/stores`

---

## Sidebar Navigation

The Channel Stores link is in `AppSidebar.tsx` under the **Channel Platform** section:

```typescript
{
  name: "Channel Stores",
  href: "/channels/stores",
  icon: <StoreIcon />,
}
```

---

## UI Improvements Roadmap

The current implementation is functional. Future enhancements to consider:

1. **OAuth flow integration** — instead of pasting tokens manually, add an "Authorize with Shopify" button that initiates the OAuth flow
2. **Connection health indicator** — ping each store's API periodically and show green/red health status
3. **Last sync timestamp** — show when products were last synced to each store
4. **Re-order drag-and-drop** — drag StoreCards to reorder by `displayOrder`
5. **Edit credentials** — allow updating credentials without deactivating and re-adding
6. **Multi-region grouping** — group multiple stores of the same channel type visually

---

## Testing the Connection

### Manual Test Sequence

1. Navigate to `/channels/stores`
2. Click **+ Connect Store**
3. Select **Shopify** from the dropdown — verify the 3 credential fields appear
4. Switch to **Wix** — verify credential fields change to `accessToken` + `wixSiteId`
5. Switch to **TikTok Shop** — verify 4 fields: `appKey`, `appSecret`, `accessToken`, `shopCipher`
6. Fill in test/sandbox credentials and click **Connect Store**
7. Verify:
   - Modal shows loading state during submission
   - On success: modal closes, new StoreCard appears
   - On error (e.g., backend down): error message shows in modal, modal stays open

### Example Test Payload (Shopify)

```json
POST /api/v1/channel-stores?organizationId=org_123
{
  "channelType": "shopify",
  "storeName": "Test Shopify Store",
  "storeUrl": "test-store.myshopify.com",
  "region": "US",
  "credentials": {
    "accessToken": "shpat_test_token",
    "apiKey": "test_api_key",
    "apiSecret": "test_api_secret"
  }
}

Expected Response 201:
{
  "storeId": "store_uuid_here",
  "channelType": "shopify",
  "storeName": "Test Shopify Store",
  "storeUrl": "test-store.myshopify.com",
  "region": "US",
  "credentials": {
    "accessToken": "***MASKED***",
    "apiKey": "***MASKED***",
    "apiSecret": "***MASKED***"
  },
  "isActive": true,
  "displayOrder": 999,
  "connectedAt": "2026-02-25T10:00:00Z"
}
```
