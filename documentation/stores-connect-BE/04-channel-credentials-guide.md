# Channel Credentials Guide

How to obtain the credentials for each supported marketplace.

---

## SHOPIFY

**Credentials:** `accessToken`, `apiKey`, `apiSecret`

**Setup:**
1. Shopify Admin → **Settings → Apps and sales channels → Develop apps**
2. Click **Allow custom app development** (first time only)
3. Click **Create an app** → configure Admin API scopes:
   - `write_products`, `read_products`
   - `write_inventory`, `read_inventory`
4. Click **Install app** → go to **API credentials** tab
5. Copy **API key** → `apiKey`
6. Copy **API secret key** → `apiSecret`
7. Click **Reveal token once** → copy Admin API access token → `accessToken`

**Note:** The access token is shown **once only**. Missing it requires re-installing the app.

**storeUrl format:** `your-store.myshopify.com` (no `https://`)

**Token expiry:** Never (static token, rotate manually)

---

## WIX

**Credentials:** `accessToken`, `wixSiteId`

**Setup (Wix Headless / API Key):**
1. Wix Admin → **Settings → Advanced → API Keys**
2. Click **Generate API Key** → set Wix Stores permissions
3. Copy the API key → `accessToken`
4. Get Site ID from: **Settings → Business Info → Site ID** (UUID format)

**storeUrl format:** `www.yourbrand.com` (your custom Wix domain)

**Token expiry:** OAuth tokens expire in ~1 hour (store `refreshToken` for server refresh)

---

## AMAZON (Selling Partner API)

**Credentials:** `sellerId`, `marketplaceId`, `accessKey`, `secretKey`

**Setup:**
1. Seller Central → **Apps & Services → Develop Apps → Add new app client**
2. After authorization, retrieve the `refreshToken` (store in credentials as `refreshToken`)
3. AWS Console → **IAM → Create User** → create access key pair
4. Copy **Access Key ID** → `accessKey`, **Secret Access Key** → `secretKey`
5. `sellerId`: your Amazon Merchant ID (found in Seller Central → Account Info)
6. `marketplaceId`: region-specific ID (e.g., `ATVPDKIKX0DER` for US)

**Key marketplace IDs:**

| Marketplace | ID |
|-------------|-----|
| Amazon US | `ATVPDKIKX0DER` |
| Amazon UK | `A1F83G8C2ARO7P` |
| Amazon DE | `A1PA6795UKMFR9` |
| Amazon JP | `A1VC38T7YXB528` |
| Amazon AU | `A39IBJ37TRP1C6` |

**Token expiry:** LWA access token 1 hour (auto-refreshed from `refreshToken`; refresh token valid 1 year)

---

## EBAY

**Credentials:** `accessToken`, `refreshToken`, `siteId`

**Setup:**
1. eBay Developer Program → **Application Keys → Create a keyset**
2. Configure OAuth scopes: `sell.inventory`, `sell.account`, `sell.fulfillment`
3. Set redirect URI (RuName) → complete OAuth flow to get tokens
4. `siteId`: numeric eBay site ID

**Key site IDs:**

| Site | ID |
|------|----|
| eBay US | `0` |
| eBay UK | `3` |
| eBay DE | `77` |
| eBay AU | `15` |
| eBay FR | `71` |

**Token expiry:** Access token 2 hours, refresh token 18 months

---

## TIKTOK SHOP

**Credentials:** `appKey`, `appSecret`, `accessToken`, `shopCipher`

**Setup:**
1. TikTok Developer Portal (`developer.tiktokshop.com`) → **Create App**
2. Enable scopes: `product.read`, `product.create`, `product.update`, `inventory.read`, `inventory.update`
3. Complete OAuth flow → exchange code for tokens
4. `shopCipher`: from `authorized_shop_list[].cipher` in token response
5. `appKey` and `appSecret`: from Developer Portal

**Note:** One `shopCipher` per shop. If the seller has multiple shops (US + UK), create separate store connections.

**Token expiry:** Varies; store `refreshToken` alongside `accessToken`

---

## LAZADA (SEA)

**Credentials:** `accessToken`, `appKey`, `appSecret`

**Markets:** Singapore, Malaysia, Indonesia, Thailand, Vietnam, Philippines

**Setup:**
1. Lazada Open Platform (`open.lazada.com`) → Create App
2. Complete OAuth flow with app-signed requests (HMAC-SHA256)
3. `appKey` and `appSecret`: from app dashboard
4. `accessToken`: from token exchange

**Token expiry:** 30 days

---

## TOKOPEDIA (Indonesia)

**Credentials:** `accessToken`, `shopId`

**Setup:**
1. Apply to Tokopedia Open API → `developer.tokopedia.com`
2. Standard OAuth 2.0 flow → `shop_id` returned in token response
3. Store `accessToken` and `shopId`

**Token expiry:** ~1 hour (store `refreshToken`)

---

## SHOPEE (SEA + Taiwan)

**Credentials:** `accessToken`, `shopId`, `partnerId`, `partnerKey`

**Setup:**
1. Shopee Open Platform (`open.shopee.com`) → Register as partner → Create App
2. `partnerId` and `partnerKey`: from app dashboard
3. Complete OAuth auth_partner flow → `shop_id` in callback URL
4. Exchange code for `accessToken`

**Note:** Shopee uses **HMAC-SHA256 request signing** (not Bearer tokens). All API calls are signed with:
`sign = SHA256(partnerId + path + timestamp + accessToken + shopId)`

**Token expiry:** 4 hours

---

## FACEBOOK SHOP (Meta Commerce)

**Credentials:** `accessToken`, `catalogId`

**Setup:**
1. Meta Business Manager (`business.facebook.com`) → Commerce Manager → Create Catalog
2. Note the **Catalog ID** → `catalogId`
3. Meta for Developers → Create App → Add Marketing API
4. Business Manager → System Users → Create system user → Generate token
5. Token scopes: `catalog_management`, `business_management`
6. Copy the **System User Access Token** → `accessToken`

**Token expiry:** System user tokens last 60 days (extendable)

---

## WALMART MARKETPLACE

**Credentials:** `clientId`, `clientSecret`

**Setup:**
1. Apply to sell on Walmart (`marketplace.walmart.com`) — approval takes 2-4 weeks
2. Seller Center → **Settings → APIs → Production Keys**
3. Copy **Client ID** → `clientId`
4. Copy **Client Secret** → `clientSecret`

**Note:** Walmart uses client credentials OAuth — no user authorization needed. The backend generates a short-lived bearer token (15 min) from `clientId` + `clientSecret` before each API call.

**Token expiry:** 15 minutes (auto-generated before API calls)

---

## OAuth Token Storage Strategy

For channels with expiring tokens, store these additional keys in `credentials`:

| Channel | Extra Keys to Store |
|---------|-------------------|
| Wix | `refreshToken` |
| Amazon | `refreshToken`, `lwaClientId`, `lwaClientSecret` |
| eBay | `refreshToken`, `clientId`, `clientSecret` |
| TikTok Shop | `refreshToken` |
| Lazada | `refreshToken` |
| Tokopedia | `refreshToken` |
| Shopee | (no refresh; re-authorize when `accessToken` expires) |

All extra keys are encrypted alongside the primary credentials.
