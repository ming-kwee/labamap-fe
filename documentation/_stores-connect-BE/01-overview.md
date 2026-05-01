# Stores-Connect Module — Overview

## Purpose

The **Stores-Connect** module (`channel/store/`) manages the lifecycle of marketplace store connections for the omnichannel platform. It provides:

- Secure storage of marketplace credentials (AES-256-GCM encrypted at rest)
- Multi-tenant isolation via `organizationId`
- CRUD operations for store connections
- Credential masking in all API responses

## Module Location

```
src/main/java/com/labamap/labamapomnichannelbe4fe/channel/store/
├── controller/
│   └── ChannelStoreController.java       — REST endpoints
├── exception/
│   ├── StoreNotFoundException.java       — 404 when storeId not found
│   ├── DuplicateStoreException.java      — 409 when same URL+channel already connected
│   └── ChannelConnectionException.java   — 400 when credential validation fails
├── model/
│   ├── dto/
│   │   ├── StoreConnectionRequest.java   — inbound payload
│   │   └── ChannelStoreConnectionResponse.java — outbound (credentials masked)
│   └── entity/
│       └── ChannelStoreConnection.java   — MongoDB document
├── repository/
│   └── ChannelStoreConnectionRepository.java — reactive queries
└── service/
    ├── ChannelStoreConnectionService.java — business logic
    ├── CredentialEncryptionService.java   — AES-256-GCM encrypt/decrypt
    └── GenericTokenRefreshService.java    — data-driven OAuth token refresh
```

## MongoDB Collection

`channel_store_connections`

### Compound Indexes

| Index Name | Fields | Unique |
|------------|--------|--------|
| `org_store_unique_idx` | organizationId + storeId | Yes |
| `org_channel_idx` | organizationId + channelType | No |

The repository also enforces uniqueness on `organizationId + channelType + storeUrl` via:
```java
existsByOrganizationIdAndChannelTypeAndStoreUrl(...)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/channel-stores?organizationId=` | List active stores |
| `GET` | `/api/v1/channel-stores?organizationId=&channelType=` | List stores by channel |
| `GET` | `/api/v1/channel-stores/{storeId}?organizationId=` | Get single store |
| `POST` | `/api/v1/channel-stores?organizationId=` | Connect new store |
| `PATCH` | `/api/v1/channel-stores/{storeId}/credentials?organizationId=` | Rotate credentials |
| `PUT` | `/api/v1/channel-stores/{storeId}/deactivate?organizationId=` | Soft-delete store |
| `PUT` | `/api/v1/channel-stores/{storeId}/display-order?organizationId=` | Update sort order |

## Supported Channels

| Channel | Type | Auth Model | Credentials | Auto-Refresh |
|---------|------|------------|-------------|--------------|
| shopify | Direct store | Static token | `accessToken`, `apiKey`, `apiSecret` | No |
| wix | Website builder | OAuth 2.0 | `accessToken`, `refreshToken`, `wixSiteId`, `clientId` | Yes |
| amazon | Marketplace | LWA + SigV4 | `sellerId`, `marketplaceId`, `accessKey`, `secretKey` | Not yet |
| ebay | Marketplace | OAuth 2.0 | `accessToken`, `refreshToken`, `siteId` | Not yet |
| tiktokshop | Social commerce | OAuth 2.0 + HMAC | `appKey`, `appSecret`, `accessToken`, `refreshToken`, `shopCipher` | Yes |
| lazada | Marketplace SEA | OAuth + signing | `accessToken`, `appKey`, `appSecret` | Not yet |
| tokopedia | Marketplace ID | OAuth 2.0 | `accessToken`, `shopId` | Not yet |
| shopee | Marketplace SEA | HMAC signing | `accessToken`, `shopId`, `partnerId`, `partnerKey` | No (HMAC) |
| facebook | Social commerce | System user token | `accessToken`, `catalogId` | No |
| walmart | Marketplace US | Client credentials | `clientId`, `clientSecret` | Per-call |

## Security Rules

1. **Credentials are encrypted before `save()`** — `CredentialEncryptionService.encryptAll()` is called in `connectStore()`, `updateCredentials()`, and after each token refresh
2. **API responses always mask credentials** — `ChannelStoreConnectionResponse.from()` calls `maskCredentials()` which replaces all values with `"***MASKED***"`
3. **Decrypted credentials are only used internally** — `GenericTokenRefreshService` decrypts credentials in-memory for the request lifetime only; values never leave the service layer
4. **Token refresh is automatic** — `GenericTokenRefreshService` checks expiry before each publish and refreshes inline when needed (WIX, TikTok Shop); no background job required
5. **Duplicate prevention** — connecting the same `channelType + storeUrl` twice for the same `organizationId` returns `409 Conflict`
6. **Tenant isolation** — every query includes `organizationId`

## Configuration

```yaml
# application.yml
app:
  credential:
    key: ${CREDENTIAL_ENCRYPTION_KEY}  # 256-bit base64 key
    # Generate: openssl rand -base64 32
```

A dev-only default is provided for local testing. **Always set `CREDENTIAL_ENCRYPTION_KEY` env var in production.**
