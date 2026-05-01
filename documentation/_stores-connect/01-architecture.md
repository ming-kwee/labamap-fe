# 01 — Architecture Overview

## The Big Picture

An **omnichannel platform** needs to sell the same product across many marketplaces simultaneously. The store connection layer is the foundation: it holds the credentials that allow our backend to push product data, sync inventory, and receive orders from each marketplace.

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
│                                                         │
│  ChannelStoresDashboard                                 │
│       │                                                 │
│       ├── ConnectStoreModal  ──► StoreConnectionRequest │
│       └── StoreCard (per connected store)               │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP POST
                     ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND (Spring Boot / Java)               │
│                                                         │
│  POST /api/v1/channel-stores                            │
│       │                                                 │
│       ├── Validate credentials (optional ping)          │
│       ├── Encrypt sensitive fields (AES-256-GCM)        │
│       └── Save to MongoDB                               │
│                                                         │
│  GET /api/v1/channel-stores  (returns masked creds)     │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS API calls
                     ▼
        ┌────────────────────────┐
        │   Marketplace APIs     │
        │  Shopify / Amazon /    │
        │  TikTok / eBay / ...   │
        └────────────────────────┘
```

---

## Data Model — `ChannelStoreConnection`

```typescript
interface ChannelStoreConnection {
  storeId: string;           // UUID — our internal ID
  channelType: ChannelType;  // "shopify" | "wix" | "amazon" | ...
  storeName: string;         // Human-readable label ("My US Shopify")
  storeUrl: string;          // The marketplace URL or domain
  region?: string;           // Optional: "US", "EU", "SEA", "ID"
  organizationId: string;    // Tenant isolation
  credentials: Record<string, string>; // Masked in API responses
  isActive: boolean;
  displayOrder: number;      // UI ordering
  connectedAt: string;       // ISO datetime
  lastSyncedAt?: string;     // Last successful product sync
}
```

### MongoDB Document (actual at-rest structure)

```json
{
  "_id": "store_abc123",
  "channelType": "shopify",
  "storeName": "My US Shopify",
  "storeUrl": "my-brand.myshopify.com",
  "region": "US",
  "organizationId": "org_123",
  "credentials": {
    "accessToken": "AES256GCM:base64encodedCiphertext==",
    "apiKey":      "AES256GCM:base64encodedCiphertext==",
    "apiSecret":   "AES256GCM:base64encodedCiphertext=="
  },
  "isActive": true,
  "displayOrder": 1,
  "connectedAt": "2026-01-15T08:00:00Z",
  "lastSyncedAt": "2026-02-20T14:30:00Z"
}
```

---

## Credential Security

### Why credentials must be encrypted at rest

Most marketplace credentials are long-lived tokens (Shopify access tokens never expire; Amazon LWA refresh tokens last 1 year). If the database is compromised, plain-text credentials would let an attacker sell on behalf of your merchants.

### Encryption pattern (Spring Boot)

```java
// Pseudo-code — your actual implementation will vary
@Component
public class CredentialEncryptor {

    @Value("${app.credential.encryption-key}") // 256-bit key in env/vault
    private String base64Key;

    public String encrypt(String plainText) {
        // AES-256-GCM with random IV
        byte[] iv = new byte[12];
        SecureRandom.getInstanceStrong().nextBytes(iv);
        SecretKey key = keyFromBase64(base64Key);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] ciphertext = cipher.doFinal(plainText.getBytes(UTF_8));
        return "AES256GCM:" + Base64.encode(concat(iv, ciphertext));
    }

    public String decrypt(String stored) {
        // Parse prefix, decode, split IV from ciphertext, decrypt
    }

    /** Return "***MASKED***" for API responses */
    public Map<String, String> maskCredentials(Map<String, String> credentials) {
        return credentials.entrySet().stream()
            .collect(toMap(Map.Entry::getKey, e -> "***MASKED***"));
    }
}
```

---

## OAuth vs Static Token: Which Does Each Channel Use?

| Channel | Token Type | Expiry | Refresh Needed |
|---------|-----------|--------|----------------|
| Shopify | Static Admin API token | Never | No |
| Wix | OAuth access token | 1 hour | Yes — store refresh token |
| Amazon | LWA access + refresh | 1h / 1y | Yes |
| eBay | OAuth access + refresh | 2h / 18mo | Yes |
| TikTok Shop | OAuth access token | varies | Yes |
| Lazada | OAuth access token | 30 days | Yes |
| Tokopedia | OAuth access token | varies | Yes |
| Shopee | HMAC-signed requests | N/A | N/A — sign per request |
| Facebook | Long-lived system user | 60 days | Yes or rotate |
| Walmart | Short-lived bearer | 15 min | Yes (client credentials) |

> **Key insight for backend:** For channels with expiring tokens, the backend must store the `refreshToken` alongside the `accessToken` and implement a token-refresh job or a refresh-on-demand strategy before every API call.

---

## The `StoreConnectionRequest` Payload

When the user fills in `ConnectStoreModal` and clicks "Connect Store", the frontend sends:

```typescript
interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;    // omit for new connections
  region?: string;
  displayOrder?: number;
  credentials: Record<string, string>;
}
```

**Example for Shopify:**

```json
{
  "channelType": "shopify",
  "storeName": "My Brand US Store",
  "storeUrl": "my-brand.myshopify.com",
  "region": "US",
  "credentials": {
    "accessToken": "shpat_xxxxxxxxxxxx",
    "apiKey":      "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "apiSecret":   "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

---

## Credential Fields by Channel

These match the `CREDENTIAL_FIELDS` map in `ConnectStoreModal.tsx`:

| Channel | Credential Keys |
|---------|----------------|
| shopify | `accessToken`, `apiKey`, `apiSecret` |
| wix | `accessToken`, `wixSiteId` |
| amazon | `sellerId`, `marketplaceId`, `accessKey`, `secretKey` |
| ebay | `accessToken`, `refreshToken`, `siteId` |
| tiktok | `appKey`, `appSecret`, `accessToken`, `shopCipher` |
| lazada | `accessToken`, `appKey`, `appSecret` |
| tokopedia | `accessToken`, `shopId` |
| facebook | `accessToken`, `catalogId` |
| shopee | `accessToken`, `shopId`, `partnerId`, `partnerKey` |
| walmart | `clientId`, `clientSecret` |

Each channel's specific guide (documents 02–08) explains where to obtain each value.

---

## Flow: Connecting a New Store (end-to-end)

```
1. User clicks "+ Connect Store" in ChannelStoresDashboard
        │
        ▼
2. ConnectStoreModal opens
   - User selects channelType (e.g. "shopify")
   - CREDENTIAL_FIELDS renders the correct inputs for that channel
   - User pastes in their credentials from the marketplace
        │
        ▼
3. User clicks "Connect Store"
   handleSubmit() calls onConnect(request)
        │
        ▼
4. ChannelStoresDashboard.handleConnect()
   calls ChannelStoreService.connectStore(organizationId, request)
        │
        ▼
5. POST /api/v1/channel-stores?organizationId=org_123
   Body: StoreConnectionRequest JSON
        │
        ▼
6. Spring Boot: ChannelStoreController.connectStore()
   a. Validate required fields
   b. Optionally: ping the marketplace API to verify credentials
   c. Encrypt credentials with CredentialEncryptor
   d. Generate storeId (UUID)
   e. Save to MongoDB channel_store_connections
   f. Return ChannelStoreConnection (credentials masked)
        │
        ▼
7. Frontend receives new store, appends to stores list
   Modal closes — new StoreCard appears in the grid
```

---

## Error Handling Pattern

The frontend catches errors in the modal and displays them inline:

```typescript
try {
  await onConnect({ channelType, storeName, storeUrl, region, credentials });
  onClose();  // success: close modal
} catch (err) {
  setError(err instanceof Error ? err.message : "Failed to connect store");
  // error div renders below the form
}
```

Common errors to surface from the backend:
- `400` — Missing required credential fields
- `401` — Credential validation failed (e.g., invalid Shopify token)
- `409` — Store with this URL already connected for this organization
- `500` — Encryption or database error

---

## Next: Platform-Specific Guides

Each channel has its own developer portal and setup process. Read the specific guide for the platform you're integrating:

- [Shopify →](./02-shopify.md)
- [Wix →](./03-wix.md)
- [TikTok Shop →](./04-tiktok-shop.md)
- [Amazon →](./05-amazon.md)
- [eBay →](./06-ebay.md)
- [Lazada / Tokopedia / Shopee →](./07-southeast-asia.md)
- [Facebook / Walmart →](./08-facebook-walmart.md)
