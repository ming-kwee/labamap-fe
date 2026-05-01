# 05 — Amazon Integration (Selling Partner API)

## Overview

Amazon uses the **Selling Partner API (SP-API)** — the successor to MWS (Marketplace Web Services). Authentication requires:
1. **Login with Amazon (LWA)** — OAuth 2.0 to get access/refresh tokens
2. **AWS IAM** — role-based access for SP-API calls (the API is hosted on AWS)

**Credential fields required:**
- `sellerId` — Amazon Merchant/Seller ID
- `marketplaceId` — Amazon Marketplace ID (region-specific)
- `accessKey` — AWS IAM access key
- `secretKey` — AWS IAM secret key (also store `refreshToken` in backend)

> **Note:** The `accessToken` (LWA short-lived token) is generated at request time. What you store is the `refreshToken` + AWS IAM keys.

---

## Step 1: Create an SP-API Application

### 1a: Register as an Amazon Selling Partner

You need either:
- **A seller account** (sellercentral.amazon.com) — for selling your own products
- **A developer account** (developer.amazonservices.com) — for building tools for other sellers

### 1b: Register SP-API Application

1. Go to **Seller Central** → **Apps & Services** → **Develop Apps**
2. Click **Add new app client**
3. Fill in:
   - App Name: `Labamap Omnichannel`
   - App Type: `Private` (for your own stores) or `Public` (for multiple merchants)
   - OAuth Redirect URI: `https://your-backend.com/api/v1/oauth/amazon/callback`

4. After creation, note your **LWA Client ID** and **LWA Client Secret**

---

## Step 2: Set Up AWS IAM

SP-API calls go through AWS. You need an IAM policy:

### Create IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:*:*:*"
    }
  ]
}
```

### Create IAM User (for server-to-server)

1. AWS Console → **IAM** → **Users** → **Create User**
2. Name: `labamap-spapi-user`
3. Attach the policy above
4. Go to **Security Credentials** → **Create Access Key**
5. Copy:
   - **Access Key ID** → `accessKey`
   - **Secret Access Key** → `secretKey`

---

## Step 3: OAuth Flow — Authorize Seller

### Step 3a: Authorization URL

```
GET https://sellercentral.amazon.com/apps/authorize/consent
    ?application_id={your-app-id}
    &state={random_state}
    &version=beta  (use "beta" during development)
```

### Step 3b: Callback & Token Exchange

```
POST https://api.amazon.com/auth/o2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&client_id={lwa_client_id}
&client_secret={lwa_client_secret}
```

Response:
```json
{
  "access_token": "Atza|...",    // valid 1 hour
  "refresh_token": "Atzr|...",   // valid 1 year
  "token_type": "bearer",
  "expires_in": 3600
}
```

Store the `refreshToken` in the encrypted credentials. Generate a new `accessToken` on every SP-API call.

---

## Step 4: Marketplace IDs

Each Amazon regional marketplace has a unique ID. Set the correct `marketplaceId` when connecting:

| Marketplace | Region | ID |
|-------------|--------|-----|
| Amazon US | North America | `ATVPDKIKX0DER` |
| Amazon CA | North America | `A2EUQ1WTGCTBG2` |
| Amazon MX | North America | `A1AM78C64UM0Y8` |
| Amazon BR | South America | `A2Q3Y263D00KWC` |
| Amazon UK | Europe | `A1F83G8C2ARO7P` |
| Amazon DE | Europe | `A1PA6795UKMFR9` |
| Amazon FR | Europe | `A13V1IB3VIYZZH` |
| Amazon IT | Europe | `APJ6JRA9NG5V4` |
| Amazon ES | Europe | `A1RKKUPIHCS9HS` |
| Amazon NL | Europe | `A1805IZSGTT6HS` |
| Amazon SE | Europe | `A2NODRKZP88ZB9` |
| Amazon PL | Europe | `AZ8E5ALBD9UDZY` |
| Amazon JP | Far East | `A1VC38T7YXB528` |
| Amazon AU | Far East | `A39IBJ37TRP1C6` |
| Amazon SG | Far East | `A19VAU5U5O7RUS` |
| Amazon AE | Middle East | `A2VIGQ35RCS4UG` |
| Amazon SA | Middle East | `A17E79C6D8DWNP` |
| Amazon IN | India | `A21TJRUUN4KGV` |

---

## Step 5: SP-API Request Signing (AWS SigV4)

Every SP-API call must be signed with AWS Signature Version 4:

```java
// AmazonSPApiService.java
public HttpResponse<String> callSpApi(
    String method, String endpoint, String path,
    String accessToken, String accessKeyId, String secretKey,
    String body
) throws Exception {
    String region = "us-east-1"; // adjust per marketplace
    String service = "execute-api";
    String timestamp = ZonedDateTime.now(ZoneOffset.UTC)
        .format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'"));
    String date = timestamp.substring(0, 8);

    // Build canonical request, string to sign, and signature
    // (Use AWS SDK or a SigV4 utility library)
    String signature = computeSigV4(method, path, timestamp, date,
                                    accessKeyId, secretKey, region, service, body);

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(endpoint + path))
        .header("x-amz-access-token", accessToken)   // LWA token
        .header("x-amz-date", timestamp)
        .header("Authorization", signature)            // AWS SigV4
        .header("Content-Type", "application/json")
        .method(method, BodyPublishers.ofString(body))
        .build();

    return httpClient.send(request, BodyHandlers.ofString());
}
```

> **Tip:** Use the official **AWS SDK for Java** — it handles SigV4 signing automatically.

---

## Amazon SP-API — Key Endpoints

Base URL: `https://sellingpartnerapi-na.amazon.com` (US)
          `https://sellingpartnerapi-eu.amazon.com` (EU)
          `https://sellingpartnerapi-fe.amazon.com` (Far East)

### List Marketplaces

```
GET /sellers/v1/marketplaceParticipations
x-amz-access-token: {accessToken}
```

### Create/Update Product Listing

```
PUT /listings/2021-08-01/items/{sellerId}/{sku}
    ?marketplaceIds={marketplaceId}

{
  "productType": "SHIRT",
  "requirements": "LISTING",
  "attributes": {
    "item_name": [{ "value": "Classic T-Shirt", "marketplace_id": "ATVPDKIKX0DER" }],
    "brand": [{ "value": "My Brand" }],
    "color": [{ "value": "Red" }],
    "size": [{ "value": "Small" }],
    "list_price": [{ "value": 29.99, "currency": "USD" }],
    "quantity": [{ "value": 50 }],
    "condition_type": [{ "value": "new_new" }]
  }
}
```

### Get Product Type Definition (critical — must use correct attributes)

```
GET /definitions/2020-09-01/productTypes/SHIRT
    ?marketplaceIds={marketplaceId}
    &requirements=LISTING
```

### Update Pricing

```
PUT /pricing/v0/price
{
  "MarketplaceId": "ATVPDKIKX0DER",
  "SKU": "TSH-RED-S",
  "Price": {
    "ListingPrice": { "Amount": 29.99, "CurrencyCode": "USD" }
  }
}
```

---

## Mapping: Master Product → Amazon Listing

```
MasterProduct               Amazon Listing
──────────────────────────────────────────────────
name             ──►        item_name
description      ──►        product_description
brand            ──►        brand
categoryId       ──►        productType (SHIRT, SHOES, etc.)
images[]         ──►        main_product_image_locator

MasterVariant               Amazon Variant/Child ASIN
──────────────────────────────────────────────────
variantSku       ──►        SKU (seller-defined)
price            ──►        list_price
stockQuantity    ──►        quantity (via Inventory API)
color            ──►        color attribute
size             ──►        size attribute
barcode          ──►        externally_assigned_product_identifier (UPC/EAN)
```

---

## Channel-Specific Fields (Step 2 Form)

**Required:**
- `amazon_product_type` — Amazon product type (SHIRT, SHOES, BACKPACK, etc.)
- `amazon_bullet_points` — 1-5 bullet points (key product features)
- `amazon_keywords` — backend search keywords (not visible to customers)

**Recommended:**
- `amazon_manufacturer` — product manufacturer
- `amazon_part_number` — manufacturer part number
- `amazon_item_package_quantity` — number of items per package
- `amazon_included_components` — what's in the box

**Optional:**
- `amazon_target_audience` — age group / gender targeting
- `amazon_material_type` — fabric/material composition
- `amazon_care_instructions` — washing/care labels

---

## Amazon-Specific Considerations

### 1. ASIN vs SKU
Amazon assigns an **ASIN** (Amazon Standard Identification Number) to every product. If your product already exists on Amazon, you list against the existing ASIN. If it's new, Amazon creates an ASIN when you publish.

### 2. Product Type Definitions
Amazon is strict about attribute requirements per product type. Always fetch the product type definition API to know exactly which attributes are required vs optional for each category.

### 3. Brand Registry
For brand owners: enroll in **Amazon Brand Registry** to get enhanced listing control, A+ Content, and protection against counterfeit listings.

### 4. Fulfillment: FBA vs FBM
- **FBA** (Fulfilled by Amazon): Ship inventory to Amazon warehouse. Inventory levels are managed by Amazon.
- **FBM** (Fulfilled by Merchant): You ship directly. Manage inventory via Inventory API.

---

## Troubleshooting

| Error Code | Meaning | Fix |
|------------|---------|-----|
| `InvalidAccessToken` | LWA token expired | Refresh using `refreshToken` |
| `AccessDenied` | Missing IAM permissions | Update IAM policy |
| `InvalidInput` | Wrong attribute format | Fetch product type definition |
| `DataInconsistency` | Conflicting attributes | Check variant parent-child relationships |
| `QuotaExceeded` | Rate limit hit | SP-API has per-plan rate limits; implement retry |
| `ResourceNotFound` | ASIN/SKU not found | Verify marketplace ID |
