# Wix Integration

## What Kind of Channel Is Wix

Wix is an **OAuth channel** — it is in `OAUTH_CHANNELS` alongside Shopify, TikTok,
Amazon, and eBay. The merchant never manually enters credentials when connecting for
the first time. Credentials are obtained automatically via Wix's OAuth install flow and
stored encrypted in `channel_store_connections`.

| Property                       | Value                                                              |
|--------------------------------|--------------------------------------------------------------------|
| `channelType`                  | `"wix"`                                                            |
| Connection method              | OAuth (Wix App Market install)                                     |
| `disconnectReason` on webhook  | `"app_removed"`                                                    |
| Token refresh                  | Yes — Wix access tokens expire; refresh token is stored            |
| Manual credentials for editing | `accessToken`, `wixSiteId`                                         |
| `taxonomyEnabled`              | false (Wix has merchant-created collections, not a fixed taxonomy) |
| `importCapable`                | `true` — Wix collections are merchant-created and import-capable   |

---

## Wix OAuth vs Shopify OAuth: Key Differences

| Aspect                     | Shopif y                                                     | Wix                                                |
|----------------------------|--------------------------------------------------------------|----------------------------------------------------|
| Extra required input       | `shop` domain (`your-brand.myshopify.com`)                   | None — Wix identifies the site during OAuth        |
| Authorization URL source   | Shopify builds it from the shop domain                       | Backend builds it from the app's client ID         |
| Site identifier after auth | `storeUrl` = shop domain                                     | `wixSiteId` credential stored separately           |
| Webhook disconnect event   | `app/uninstalled`                                            | `APP_REMOVED` → `disconnectReason = "app_removed"` |
| Token endpoint             | `POST https://{shop}.myshopify.com/admin/oauth/access_token` | `POST https://www.wix.com/oauth/access`            |

---

## How Wix OAuth Works End-to-End

```
1. Merchant clicks "Connect New Store" → selects "WIX"
   → showOAuthFlow = true (wix ∈ OAUTH_CHANNELS)

2. Merchant enters store name + optional region (no domain field — Wix doesn't need it)

3. Merchant clicks "Connect with WIX"
   → ChannelStoreService.initiateOAuth({
       channelType: "wix",
       organizationId: "org_123",
       storeName: "My Wix Site",
       region: undefined,
       shop: undefined,     ← NOT sent for Wix
       storeId: undefined,  ← undefined for new connection
     })
   → GET /api/v1/oauth/initiate?channelType=wix&organizationId=org_123&storeName=My+Wix+Site
   → { authorizationUrl: "https://www.wix.com/installer/install?token=...&appId=...&redirectUrl=...", ... }

4. window.location.href = authorizationUrl
   → Browser opens the Wix App Market installer for the app
   → Merchant is shown the Wix install consent screen (permissions list)

5. Merchant clicks "Add to Site" on the Wix installer

6. Wix redirects to the BACKEND callback URL with:
   ?code={authCode}&state={nonce}&instanceId={wixSiteId}&...

7. Backend (OAuthCallbackService):
   a. Validates state/nonce
   b. POST https://www.wix.com/oauth/access → { access_token, refresh_token, expires_in }
   c. Extracts instanceId (= wixSiteId) from callback params
   d. Creates channel_store_connections document:
      {
        channelType: "wix",
        storeId: "wix-{instanceId}",
        credentials: {
          accessToken: "{access_token}",    ← encrypted at rest
          refreshToken: "{refresh_token}",  ← encrypted at rest
          wixSiteId: "{instanceId}"
        },
        tokenExpiry: { accessToken: "..." },
        connectionStatus: "ACTIVE"
      }
   e. Redirects browser to /channels/stores?connected=wix

8. ChannelStoresDashboard detects ?connected=wix
   → toast: "WIX store connected successfully"
   → listAllStores() reload
```

---

## Wix Credentials

After OAuth, three credentials are stored (all encrypted):

| Credential key (`chnlCredName`)   | What it is                                                           |
|-----------------------------------|----------------------------------------------------------------------|
| `accessToken`                     | Short-lived Wix REST API token (expires in 5 minutes)                |
| `refreshToken`                    | Long-lived token used to refresh the access token                    |
| `wixSiteId`                       | Wix site identifier (= `instanceId` from OAuth callback) — permanent |

`wixSiteId` is not sensitive and is returned in GET responses unmasked. `accessToken` and
`refreshToken` are sensitive and are always masked as `"***MASKED***"` in GET responses.

### Credential schema (for edit mode)

`GET /channel-stores/credential-schema/wix` returns:
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

This schema is only shown in **edit mode** (ACTIVE + OAuth channel → `showManualForm`).
When connecting for the first time, the OAuth flow populates these automatically. A
merchant would only see this form if they need to manually correct a credential after
the fact (unusual).

---

## Token Refresh Lifecycle

Wix access tokens expire in **5 minutes**. Every publish call hits `GenericTokenRefreshService`:

```
Before publish:
  tokenExpiry["accessToken"] → check if expires within 5-min buffer

  If yes:
    POST https://www.wix.com/oauth/access
      grant_type=refresh_token
      client_id={wixAppClientId}
      client_secret={wixAppClientSecret}
      refresh_token={storedRefreshToken}
    → { access_token, refresh_token, expires_in }

    Update channel_store_connections:
      credentials.accessToken = new access_token
      credentials.refreshToken = new refresh_token  ← Wix rotates refresh tokens
      tokenExpiry.accessToken = now + expires_in

  If refresh fails (refresh token expired or Wix app removed):
    → reconnectRequired = true
    → connectionStatus = RECONNECT_REQUIRED
    → publish blocked
```

**Important:** Wix rotates refresh tokens on every use. The backend must always store
the newly returned `refresh_token`, not just the `access_token`. If a prior refresh
token is replayed after rotation, the request will fail with 401.

---

## Webhook: App Removed

Wix sends a `POST` to the backend's registered webhook URL when the merchant removes the
app from their Wix site. The payload identifies the site via `instanceId`.

```
Webhook event received by WebhookService:
  instanceId → look up channel_store_connections by wixSiteId credential

  Sets on the store document:
    isActive = false
    disconnectedAt = now
    disconnectReason = "app_removed"
    connectionStatus = DISCONNECTED
```

On the `ChannelStoresDashboard`:
- The store card shows the red **Disconnected** badge
- The reconnect notice reads:
  "The app was uninstalled from the marketplace. Re-authorize to reconnect."
  (triggered by `disconnectReason === "app_uninstalled"` check — Wix uses `"app_removed"`
  which falls through to the generic: "Your access token has expired. Click below to re-authorize access.")

---

## Reconnect Flow

If `connectionStatus = RECONNECT_REQUIRED` or `DISCONNECTED`:
```
Merchant clicks "Reconnect" on the StoreCard
→ ConnectStoreModal opens with existingStore
→ isReconnectMode = true → showOAuthFlow = true
→ ChannelStoreService.initiateOAuth({
    channelType: "wix",
    organizationId,
    storeName: existingStore.storeName,
    storeId: existingStore.storeId,   ← included so backend updates existing record
  })
→ Same OAuth flow as above
→ Backend OAuthCallbackService: storeId present → updates existing record
  (new tokens, reconnectRequired = false, connectionStatus = ACTIVE)
```

---

## Wix API Usage After Connection

Once connected, the backend uses the Wix REST API for:

| Operation             | Wix endpoint                                                 |
|-----------------------|--------------------------------------------------------------|
| Publish product       | `POST https://www.wixapis.com/stores/v1/products`            |
| Update product        | `PUT https://www.wixapis.com/stores/v1/products/{productId}` |
| Category (collection) | `POST https://www.wixapis.com/stores/v1/collections`         |
| Token refresh         | `POST https://www.wix.com/oauth/access`                      |

All API calls pass:
- `Authorization: Bearer {accessToken}` header
- `wix-site-id: {wixSiteId}` header (identifies the merchant's site)

The `wixSiteId` is critical — every Wix API call requires it. Without it the API returns
a 400 or 401 regardless of the token validity.

---

## JOLT Transformation

Wix uses the standard JOLT transformation pipeline. The `channel_configurations` document
for `channelId: "wix"` contains the JOLT spec that transforms the platform product schema
into the Wix Products API request shape.

Key field mappings (Wix Products API shape):
```
platform.name               → wix.name
platform.description        → wix.description
platform.price              → wix.priceData.price  (with currency code from channel config)
platform.inventory          → wix.stock.quantity
platform.sku                → wix.sku
platform.mainImage          → wix.media.mainMedia.image.url
platform.variantConfigurator → wix.variants[]  (post-processing rule)
```

---

## Channel Category Mapping for Wix

Wix has **merchant-created collections** (storefront groupings), not a fixed taxonomy.
This puts it in the same category as WooCommerce and Etsy:

- `taxonomyEnabled = false` — no fixed taxonomy tree to browse
- `importCapable` — should be `true` (see gap below)

### How the two mapping flows work

The frontend determines which UI to show based on two boolean flags in `ChannelStoreConnectionResponse`:

| Flag              | Value  | Frontend behaviour                                              |
|-------------------|--------|-----------------------------------------------------------------|
| `taxonomyEnabled` | `true` | TaxonomyMapperModal — browse a channel-owned fixed category tree |
| `importCapable`   | `true` | ImportWizardModal — fetch merchant's own collections, let them pick |
| both `false`      | —      | "No mapping flow configured for {store.storeName}" error        |

### How import works: fully data-driven

`ChannelCategoryImportService` is fully generic — there are no hardcoded per-channel
switch cases. Import behaviour is driven entirely by the `channel_category_api_config`
document for each channel type. The Wix config has `importCapable = true` and provides
all field mappings needed:

| Config field             | Wix value                         | Purpose                                       |
|--------------------------|-----------------------------------|-----------------------------------------------|
| `httpMethod`             | `POST`                            | Uses a POST query endpoint, not REST GET      |
| `childrenUrlPath`        | `/stores/v3/categories/query`     | Wix category list endpoint                    |
| `authStrategy`           | `BEARER_TOKEN`                    | `Authorization: Bearer {accessToken}`         |
| `credentialHeaders`      | `wix-site-id → wixSiteId`         | Adds `wix-site-id` header from credentials    |
| `requestBodyTemplate`    | `{"query":{"paging":{"limit":100}}}` | POST body                                  |
| `itemsJsonPath`          | `categories`                      | Dot-notation path to the items array          |
| `nodeIdField`            | `id`                              | Maps to `externalId`                          |
| `nodeNameField`          | `name`                            | Maps to `externalName`                        |
| `nodeSlugField`          | `slug`                            | Maps to `externalSlug`                        |
| `nodeParentIdField`      | `parentCategory.id`               | Dot-notation; null parent = root category     |
| `nodeProductCountField`  | `numberOfProducts`                | Maps to `ImportableCollectionDto.productCount` |

Adding a new import-capable channel (e.g. Etsy, Magento) requires **no Java code changes**
— insert a document in `channel_category_api_config` with `importCapable = true` and the
field mappings above.

### How `importCapable` is set in the API response

`ChannelStoreConnectionResponse` has an enriched factory that takes both flags directly:

```java
// Both flags read independently from channel_category_api_config
ChannelStoreConnectionResponse.from(entity, flags.taxonomyEnabled(), flags.importCapable())
```

`ChannelTaxonomyService.getCategoryFlags(channelType)` performs one DB lookup against
`channel_category_api_config` and returns `ChannelCategoryFlags(taxonomyEnabled, importCapable)`.
For Wix: `taxonomyEnabled=false`, `importCapable=true`.

---

## Known Limitations

| Item                             | Status                                                                                                              |
|----------------------------------|---------------------------------------------------------------------------------------------------------------------|
| Category mapping                 | Fully implemented. Both flags (`taxonomyEnabled=false`, `importCapable=true`) stored in `channel_category_api_config` and read by `ChannelTaxonomyService.getCategoryFlags()`. |
| Variant images on Wix            | Not yet — Wix Products API requires separate media upload step                                                      |
| Wix webhook signature validation | Must verify `x-wix-signature` header before processing                                                              |
| Reconnect banner text            | Shows generic "access token expired" instead of "app removed" for `app_removed` reason — minor UX gap              |
