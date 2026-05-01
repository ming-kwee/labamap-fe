# Per-Channel Credential Guide

How to obtain the credentials for each supported marketplace and what to enter in `ConnectStoreModal`.

`storeUrl` should always be the domain only — no `https://` prefix.

---

## Shopify

**Credentials:** `accessToken`, `apiKey`, `apiSecret`
**Token expiry:** Never (static — rotate manually if compromised)

### Setup

1. Shopify Admin → **Settings → Apps and sales channels → Develop apps**
2. Click **Allow custom app development** (first time only)
3. **Create an app** — name: `Labamap Omnichannel`
4. **Configure Admin API scopes** — select:
   - `write_products`, `read_products`
   - `write_inventory`, `read_inventory`
   - `read_locations` (multi-location inventory)
   - `read_orders`, `write_orders` (optional, for order sync)
5. Click **Install app**
6. Go to **API credentials** tab:
   - Copy **API key** → `apiKey`
   - Copy **API secret key** → `apiSecret`
   - Click **Reveal token once** → copy Admin API access token → `accessToken`

> The access token is shown **once only**. If you miss it, you must reinstall the app (generates a new token; the old one is revoked).

**storeUrl format:** `your-store.myshopify.com`

---

## Wix

**Credentials:** `accessToken`, `refreshToken`, `wixSiteId`, `clientId`
**Token expiry:** Access token ~1 hour; refresh token indefinite

### Setup (Wix Headless / OAuth)

1. **Create an app** at `dev.wix.com` → **Create New App**
2. Under **OAuth** → add redirect URI: `https://api.yourdomain.com/labamap/api/v1/oauth/callback/wix`
3. Note the **App ID** → `clientId`
4. Under **Permissions** → enable Wix Stores (Products, Inventory)
5. The merchant authorizes via OAuth flow → backend stores `accessToken` + `refreshToken`

**Quick setup (API Key method — no OAuth flow):**
1. Wix Admin → **Settings → Advanced → API Keys** → Generate API Key with Stores permissions
2. Copy the key → `accessToken`
3. Get Site ID: **Settings → Business Info → Site ID** (UUID format) → `wixSiteId`

**storeUrl format:** `www.yourbrand.com` (custom domain) or `username.wixsite.com/sitename`

---

## Amazon (Selling Partner API)

**Credentials:** `sellerId`, `marketplaceId`, `accessKey`, `secretKey`
**Token expiry:** Access token 1 hour; LWA refresh token 1 year

### Setup

1. **Amazon Developer Central** (`developer.amazonservices.com`) → Create LWA application
   - OAuth redirect: `https://api.yourdomain.com/labamap/api/v1/oauth/callback/amazon`
   - Copy **Client ID** (not used as credential key — used by backend config) and **Client Secret**
2. **Seller Central** → **Apps & Services → Develop Apps** → Authorize the SP-API app → copy **Seller ID** → `sellerId`
3. **AWS IAM** → Create policy for SP-API, create user, attach policy
   - Copy **Access Key ID** → `accessKey`
   - Copy **Secret Access Key** → `secretKey`
4. **Marketplace ID** — find at `developer-docs.amazon.com/sp-api/docs/marketplace-ids`:
   - US: `ATVPDKIKX0DER`
   - EU (DE): `A1PA6795UKMFR9`
   - JP: `A1VC38T7YXB528`
   → `marketplaceId`

**storeUrl format:** `sellercentral.amazon.com` (or region-specific URL)

---

## eBay

**Credentials:** `accessToken`, `refreshToken`, `siteId`
**Token expiry:** Access token 2 hours; refresh token 18 months

### Setup

1. **eBay Developer Program** (`developer.ebay.com`) → Create application
   - Under **Keys** → copy **App ID** (client ID for backend config)
   - Under **User Tokens** → generate OAuth token via `sign_in_with_ebay` flow
2. Copy the **access token** → `accessToken`
3. Copy the **refresh token** → `refreshToken`
4. **Site ID** — eBay site you sell on:
   - US: `0`, UK: `3`, DE: `77`, AU: `15`
   → `siteId`

**storeUrl format:** `www.ebay.com` (or region: `www.ebay.co.uk`, `www.ebay.de`)

---

## TikTok Shop

**Credentials:** `appKey`, `appSecret`, `accessToken`, `refreshToken`, `shopCipher`
**Token expiry:** Varies (auto-refreshed by `GenericTokenRefreshService`)

### Setup

1. **TikTok Open Platform** (`partner.tiktokshop.com`) → Create App
   - Service type: **Store management**
   - Redirect URI: `https://api.yourdomain.com/labamap/api/v1/oauth/callback/tiktokshop`
   - Copy **App Key** → `appKey`
   - Copy **App Secret** → `appSecret`
2. Merchant authorizes via OAuth → backend calls token exchange → stores `accessToken` + `refreshToken`
3. **Shop Cipher** — unique identifier for the merchant's shop instance (returned in the OAuth token response) → `shopCipher`

**storeUrl format:** `shop.tiktok.com` (or merchant-specific TikTok Shop URL)

---

## Lazada

**Credentials:** `accessToken`, `appKey`, `appSecret`
**Token expiry:** Access token 30 days; refresh token ~90 days

### Setup

1. **Lazada Open Platform** (`open.lazada.com`) → **Create App**
   - App name: `Labamap Omnichannel`
   - Redirect URI: `https://api.yourdomain.com/labamap/api/v1/oauth/callback/lazada`
   - Copy **App Key** → `appKey`
   - Copy **App Secret** → `appSecret`
2. Merchant authorizes via OAuth → obtain `accessToken`

**Regional endpoints (storeUrl):**
| Country | storeUrl |
|---------|----------|
| Malaysia | `www.lazada.com.my` |
| Indonesia | `www.lazada.co.id` |
| Thailand | `www.lazada.co.th` |
| Vietnam | `www.lazada.vn` |
| Philippines | `www.lazada.com.ph` |
| Singapore | `www.lazada.sg` |

---

## Tokopedia

**Credentials:** `accessToken`, `shopId`
**Token expiry:** ~1 hour

### Setup

1. **Tokopedia Open API** (`developer.tokopedia.com`) → Apply for API access (approval required)
2. After approval, receive OAuth credentials
3. Merchant authorizes via OAuth → obtain `accessToken`
4. **Shop ID** — from merchant's Tokopedia seller dashboard URL → `shopId`

**storeUrl format:** `www.tokopedia.com/your-shop-name`

---

## Shopee

**Credentials:** `accessToken`, `shopId`, `partnerId`, `partnerKey`
**Auth model:** HMAC-SHA256 request signing (no OAuth token refresh — token valid 4 hours, re-authorize when expired)

### Setup

1. **Shopee Open Platform** (`open.shopee.com`) → **Create App** → apply for Seller API access
2. After approval:
   - Copy **Partner ID** → `partnerId`
   - Copy **Partner Key** → `partnerKey`
3. Merchant authorizes via Shopee OAuth → obtain `accessToken`
4. **Shop ID** — from merchant's Shopee seller account → `shopId`

**Every API call is signed:** `sign = SHA256(partnerId + apiPath + timestamp + accessToken + shopId)`
When `accessToken` expires, merchant re-authorizes and the new token is saved via `PATCH /credentials`.

**Regional storeUrl:**
`shopee.sg`, `shopee.com.my`, `shopee.co.id`, `shopee.co.th`, `shopee.vn`, `shopee.ph`

---

## Facebook Shop

**Credentials:** `accessToken`, `catalogId`
**Token expiry:** Long-lived system user token (~60 days — rotate manually)

### Setup

1. **Meta Business Suite** → **Business Settings → System Users** → Create System User
2. Assign assets: **Commerce → Catalog** (your product catalog)
3. **Generate New Token** → select permissions: `catalog_management`, `business_management`
4. Copy the token → `accessToken`
5. **Catalog ID** — from Commerce Manager → Catalog settings → copy the numeric ID → `catalogId`

**storeUrl format:** `www.facebook.com/your-page` or `business.facebook.com`

---

## Walmart

**Credentials:** `clientId`, `clientSecret`
**Token expiry:** 15 minutes (token generated fresh before every API call — no token stored)

### Setup

1. **Walmart Seller Center** (`seller.walmart.com`) → **Settings → API Credentials**
2. Request API access → approval typically takes 3–5 business days
3. After approval:
   - Copy **Client ID** → `clientId`
   - Copy **Client Secret** → `clientSecret`

No `accessToken` is stored. The backend generates a fresh Bearer token for every Walmart API call using the stored `clientId` + `clientSecret`.

**storeUrl format:** `www.walmart.com/seller/your-seller-id`
