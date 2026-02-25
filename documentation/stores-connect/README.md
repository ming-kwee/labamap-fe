# Store Connection Documentation

> **Omnichannel Platform — Channel Store Integration Guide**

This documentation explains how the Channel Store Connection system works end-to-end: from obtaining credentials on each marketplace, through the backend API, to the React frontend components.

---

## Table of Contents

| # | Document | What You'll Learn |
|---|----------|-------------------|
| 01 | [Architecture Overview](./01-architecture.md) | Data model, credential flow, OAuth concepts |
| 02 | [Shopify](./02-shopify.md) | Custom App, Admin API token, webhook setup |
| 03 | [Wix](./03-wix.md) | Wix Headless, OAuth, site ID |
| 04 | [TikTok Shop](./04-tiktok-shop.md) | App Key, App Secret, shop cipher, access token |
| 05 | [Amazon](./05-amazon.md) | Selling Partner API, IAM, LWA OAuth |
| 06 | [eBay](./06-ebay.md) | eBay Developer Program, OAuth 2.0, refresh tokens |
| 07 | [Southeast Asia — Lazada, Tokopedia, Shopee](./07-southeast-asia.md) | Regional marketplaces |
| 08 | [Facebook Shop & Walmart](./08-facebook-walmart.md) | Meta Catalog API, Walmart Marketplace API |
| 09 | [Backend API — Spring Boot](./09-backend-api.md) | Controller, service, MongoDB document design |
| 10 | [Frontend Integration](./10-frontend-integration.md) | ConnectStoreModal, ChannelStoresDashboard wiring |

---

## Quick Concept Map

```
Merchant (you)
    │
    ├─ Shopify Partner Account  ──► Admin API access token
    ├─ Wix Developer Account    ──► OAuth access token + site ID
    ├─ TikTok Developer Portal  ──► App Key + App Secret → access token
    ├─ Amazon Developer Central ──► LWA Client + IAM ARN → access/refresh token
    ├─ eBay Developer Program   ──► OAuth client → access + refresh token
    ├─ Lazada Open Platform     ──► App Key + App Secret → access token
    ├─ Tokopedia Open API       ──► access token + shop ID
    ├─ Shopee Open Platform     ──► Partner Key + Shop ID → access token
    ├─ Meta Commerce            ──► System user token + catalog ID
    └─ Walmart Seller Center    ──► Client ID + Client Secret
            │
            ▼
    POST /api/v1/channel-stores        (Spring Boot backend)
    MongoDB: channel_store_connections (credentials encrypted at rest)
            │
            ▼
    ChannelStoreService.connectStore() (React frontend)
            │
            ▼
    ConnectStoreModal / ChannelStoresDashboard
```

---

## Key Rules

1. **Credentials are never stored in plain text in the browser** — the frontend sends them once via HTTPS POST; the backend encrypts them at rest.
2. **API responses always mask credentials** — the `credentials` field is returned as `"***MASKED***"` after the initial save.
3. **One `storeId` per physical store** — a merchant can connect the same channel type multiple times (e.g., a US Shopify store and a UK Shopify store) as separate entries.
4. **`organizationId` scopes everything** — all queries are tenant-isolated by `organizationId`.

---

## Supported Channels

| Channel | Type | Region | Auth Method |
|---------|------|--------|-------------|
| Shopify | Direct-to-consumer storefront | Global | Admin API token |
| Wix | Website builder / storefront | Global | OAuth 2.0 |
| Amazon | Marketplace | Global (region-specific) | LWA (Login with Amazon) OAuth |
| eBay | Marketplace | Global (site-specific) | OAuth 2.0 |
| TikTok Shop | Social commerce | US, UK, SEA | App Key + OAuth |
| Lazada | Marketplace | SEA | App Key + OAuth |
| Tokopedia | Marketplace | Indonesia | OAuth token |
| Shopee | Marketplace | SEA, TW | Partner Key + OAuth |
| Facebook Shop | Social commerce | Global | Meta System User token |
| Walmart | Marketplace | US | Client credentials |
