# 07 — Southeast Asia: Lazada, Tokopedia & Shopee

## Overview

Southeast Asia has three dominant marketplaces, each with different auth models and product APIs. The region covers Indonesia, Malaysia, Thailand, Vietnam, Philippines, and Singapore.

| Platform | Auth | Primary Market |
|----------|------|----------------|
| Lazada | OAuth 2.0 + App Key signing | MY, ID, TH, VN, PH, SG |
| Tokopedia | OAuth 2.0 | Indonesia |
| Shopee | HMAC-SHA256 request signing (no OAuth) | MY, ID, TH, VN, PH, SG, TW |

---

# LAZADA

## About Lazada

Lazada is the leading marketplace in SEA, owned by Alibaba Group. It operates across 6 countries under separate region endpoints.

**Credential fields:** `accessToken`, `appKey`, `appSecret`

---

## Step 1: Register on Lazada Open Platform

1. Go to `open.lazada.com`
2. Log in with your Lazada seller account
3. Click **Create App** → fill in:
   - App Name: `Labamap Omnichannel`
   - Redirect URI: `https://your-backend.com/api/v1/oauth/lazada/callback`
4. Once approved, get:
   - **App Key** → `appKey`
   - **App Secret** → `appSecret`

---

## Step 2: OAuth Flow

### Authorization URL
```
GET https://auth.lazada.com/oauth/authorize
    ?response_type=code
    &force_auth=true
    &redirect_uri=https://your-backend.com/api/v1/oauth/lazada/callback
    &client_id={appKey}
    &country={country_code}  // e.g. "sg", "my", "id", "th", "vn", "ph"
```

### Exchange Code for Tokens
```
POST https://auth.lazada.com/rest
     /auth/token/create
     ?app_key={appKey}
     &timestamp={unix_ms}
     &sign_method=sha256
     &sign={computed_sign}
     &code={auth_code}
```

> Lazada uses a **unique signing algorithm**: all params sorted alphabetically, concatenated, then HMAC-SHA256 signed with `appSecret`.

```java
// LazadaSigningUtil.java
public static String sign(Map<String, String> params, String appSecret) throws Exception {
    // Sort params by key
    List<String> keys = new ArrayList<>(params.keySet());
    Collections.sort(keys);

    // Concatenate: API path + sorted key=value pairs
    StringBuilder sb = new StringBuilder("/auth/token/create");
    for (String key : keys) {
        sb.append(key).append(params.get(key));
    }

    // HMAC-SHA256
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(appSecret.getBytes(UTF_8), "HmacSHA256"));
    byte[] hash = mac.doFinal(sb.toString().getBytes(UTF_8));

    // Convert to uppercase hex
    return bytesToHex(hash).toUpperCase();
}
```

Token Response:
```json
{
  "access_token": "50000101xxxxx",
  "expires_in": "2592000",
  "refresh_token": "50000201xxxxx",
  "refresh_expires_in": "7776000",
  "account_platform": "seller",
  "country_user_info": [
    { "country": "sg", "seller_id": "123456", "short_code": "SGXXX" }
  ]
}
```

---

## Lazada API Endpoints

| Region | Base URL |
|--------|----------|
| Singapore | `https://api.lazada.sg/rest` |
| Malaysia | `https://api.lazada.com.my/rest` |
| Indonesia | `https://api.lazada.co.id/rest` |
| Thailand | `https://api.lazada.co.th/rest` |
| Vietnam | `https://api.lazada.vn/rest` |
| Philippines | `https://api.lazada.com.ph/rest` |

### Create Product
```
POST https://api.lazada.sg/rest
     /product/create
     ?app_key={appKey}
     &access_token={accessToken}
     &timestamp={unix_ms}
     &sign_method=sha256
     &sign={sign}

Body (XML — Lazada uses XML for product creation):
<Request>
  <Product>
    <PrimaryCategory>10000285</PrimaryCategory>
    <Attributes>
      <Name>Classic T-Shirt</Name>
      <Description>Product description</Description>
      <Brand>My Brand</Brand>
      <model>TS-001</model>
    </Attributes>
    <Skus>
      <Sku>
        <SellerSku>TSH-RED-S</SellerSku>
        <price>29.99</price>
        <quantity>50</quantity>
        <Images>
          <Image>https://cdn.example.com/tshirt.jpg</Image>
        </Images>
        <color_family>Red</color_family>
        <size>S</size>
      </Sku>
    </Skus>
  </Product>
</Request>
```

---

## Channel-Specific Fields for Lazada (Step 2 Form)

**Required:** `lazada_category_id`, `lazada_brand`, `lazada_model`
**Recommended:** `lazada_package_weight`, `lazada_package_length/width/height`, `lazada_warranty_type`
**Optional:** `lazada_color_family`, `lazada_size` (for fashion), `lazada_material`

---

# TOKOPEDIA

## About Tokopedia

Tokopedia is Indonesia's largest marketplace (merged with GoTo). It uses **OAuth 2.0** with a relatively standard token-based API.

**Credential fields:** `accessToken`, `shopId`

---

## Step 1: Register on Tokopedia Open API

1. Go to `developer.tokopedia.com`
2. Apply to become an **Open API Partner**
3. After approval, create an application:
   - Redirect URI: `https://your-backend.com/api/v1/oauth/tokopedia/callback`
4. Get your **Client ID** and **Client Secret**

---

## Step 2: OAuth Flow

### Authorization URL
```
GET https://accounts.tokopedia.com/oauth2/auth
    ?client_id={clientId}
    &redirect_uri=https://your-backend.com/api/v1/oauth/tokopedia/callback
    &response_type=code
    &scope=write
```

### Token Exchange
```
POST https://accounts.tokopedia.com/token
Authorization: Basic base64({clientId}:{clientSecret})
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={auth_code}
&redirect_uri=https://your-backend.com/api/v1/oauth/tokopedia/callback
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def50200...",
  "shop_id": "12345678"
}
```

The `shop_id` in the response is your `shopId`.

---

## Tokopedia API Endpoints

```
Base URL: https://fs.tokopedia.net/v1
```

### Create Product
```
POST https://fs.tokopedia.net/v1/product/create?fs_id={shopId}
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "products": [
    {
      "name": "Classic T-Shirt",
      "category_id": 174,
      "status": 1,
      "description": "Product description",
      "images": [
        { "file_path": "https://cdn.example.com/tshirt.jpg" }
      ],
      "weight": 200,
      "weight_unit": "GR",
      "price": 449000,
      "stock": 50,
      "min_order": 1,
      "sku": "TSH-001",
      "etalase_id": 0,
      "preorder": {
        "is_active": false
      },
      "variant": {
        "selections": [
          {
            "option_name": "Warna",
            "options": ["Merah", "Biru"]
          },
          {
            "option_name": "Ukuran",
            "options": ["S", "M", "L"]
          }
        ],
        "products": [
          {
            "combination": [0, 0],
            "price": 449000,
            "stock": 20,
            "sku": "TSH-RED-S"
          }
        ]
      }
    }
  ]
}
```

---

## Channel-Specific Fields for Tokopedia (Step 2 Form)

**Required:** `tokopedia_category_id`, `tokopedia_etalase_id` (product showcase/collection)
**Recommended:** `tokopedia_weight_grams`, `tokopedia_min_order`, `tokopedia_condition` (NEW/USED)
**Optional:** `tokopedia_preorder_days`, `tokopedia_must_insurance`

---

# SHOPEE

## About Shopee

Shopee is one of the most popular marketplaces in SEA and Taiwan. Unlike others, Shopee uses **HMAC-SHA256 request signing** on every API call (similar to AWS SigV4) rather than OAuth bearer tokens.

**Credential fields:** `accessToken`, `shopId`, `partnerId`, `partnerKey`

---

## Step 1: Register as a Shopee Open Platform Partner

1. Go to `open.shopee.com`
2. Click **Register** → fill in business details
3. Wait for approval (can take 1-5 business days)
4. After approval, go to **My Apps** → **Create App**
5. Set Redirect URI: `https://your-backend.com/api/v1/oauth/shopee/callback`
6. Get:
   - **Partner ID** → `partnerId` (numeric, e.g., `12345`)
   - **Partner Key** → `partnerKey` (hex string)

---

## Step 2: OAuth Authorization (Get Access Token + Shop ID)

### Authorization URL
```
GET https://partner.shopeemobile.com/api/v2/shop/auth_partner
    ?partner_id={partnerId}
    &timestamp={unix_timestamp}
    &sign={sign}
    &redirect={redirect_url}
```

Signing for authorization URL:
```
sign = SHA256(partner_id + "/api/v2/shop/auth_partner" + timestamp + partner_key)
(hex string, lowercase)
```

```java
// ShopeeSigningUtil.java
public static String signAuthUrl(long partnerId, String path, long timestamp, String partnerKey) {
    String base = partnerId + path + timestamp;
    // Append partner_key ONLY for auth_url sign
    String toSign = base + partnerKey;
    return sha256Hex(toSign);
}
```

### Exchange Code for Access Token
```
POST https://partner.shopeemobile.com/api/v2/auth/token/get

Headers:
  Content-Type: application/json

Body:
{
  "code": "{auth_code}",
  "shop_id": {shopId_from_callback},
  "partner_id": {partnerId}
}
```

> The `shop_id` is returned by Shopee in the callback URL.

Response:
```json
{
  "access_token": "xxxxxx",
  "refresh_token": "xxxxxx",
  "expire_in": 14400,
  "request_id": "req_id_xxx",
  "error": "",
  "message": ""
}
```

---

## Shopee API Request Signing

Every Shopee API call (after authentication) requires a signature:

```
sign = SHA256(partner_id + api_path + timestamp + access_token + shop_id)
(hex string, lowercase)
```

```java
// ShopeeApiClient.java
public HttpResponse<String> callShopeeApi(
    String method, String path, String body,
    long partnerId, String partnerKey,
    String accessToken, long shopId
) throws Exception {
    long timestamp = Instant.now().getEpochSecond();
    String base = partnerId + path + timestamp + accessToken + shopId;
    String sign = sha256Hex(base);

    String url = "https://partner.shopeemobile.com" + path
        + "?partner_id=" + partnerId
        + "&timestamp=" + timestamp
        + "&access_token=" + accessToken
        + "&shop_id=" + shopId
        + "&sign=" + sign;

    return httpClient.send(
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .method(method, BodyPublishers.ofString(body))
            .build(),
        BodyHandlers.ofString()
    );
}
```

---

## Shopee API Endpoints

```
Base URL: https://partner.shopeemobile.com/api/v2
```

### Get Category List
```
GET /product/get_category?language=en
```

### Add Item (Create Product)
```
POST /product/add_item

{
  "original_price": 29.99,
  "description": "Product description",
  "weight": 0.2,
  "item_name": "Classic T-Shirt",
  "item_sku": "TSH-001",
  "image": {
    "image_id_list": ["image_id_from_upload_api"]
  },
  "category_id": 100744,
  "normal_stock": 50,
  "logistic_info": [
    {
      "logistic_id": 80012,
      "enabled": true,
      "is_free": false,
      "shipping_fee": 3.00
    }
  ],
  "attribute_list": [
    { "attribute_id": 100022, "attribute_value_list": [{ "original_value_name": "Cotton" }] }
  ],
  "tier_variation": [
    {
      "name": "Color",
      "option_list": [
        { "option": "Red", "image": { "image_id": "img_id_xxx" } },
        { "option": "Blue" }
      ]
    },
    {
      "name": "Size",
      "option_list": [
        { "option": "S" },
        { "option": "M" },
        { "option": "L" }
      ]
    }
  ],
  "model": [
    {
      "tier_index": [0, 0],
      "normal_stock": 20,
      "original_price": 29.99,
      "model_sku": "TSH-RED-S"
    }
  ]
}
```

---

## Image Upload (Required Before Product Creation)

```
POST /media_space/upload_image

Content-Type: multipart/form-data
file: {binary image data}

Response:
{
  "image_id": "sg-11134213-7rasz-xxx",
  "image_url": "https://cf.shopee.sg/file/xxx"
}
```

---

## Shopee Regional Endpoints

| Region | Base URL |
|--------|----------|
| Singapore | `https://partner.shopeemobile.com/api/v2` |
| Malaysia | Same base URL, different shop context |
| Indonesia | Same base URL |
| Thailand | Same base URL |
| Vietnam | Same base URL |
| Philippines | Same base URL |
| Taiwan | `https://partner.shopee.tw/api/v2` |
| Brazil | `https://partner.shopee.com.br/api/v2` |

---

## Channel-Specific Fields (Step 2 Form)

**Required:** `shopee_category_id`, `shopee_logistics_id` (shipping option)
**Recommended:** `shopee_weight_kg`, `shopee_package_length/width/height`, `shopee_condition` (NEW/USED)
**Optional:** `shopee_pre_order_days`, `shopee_days_to_ship`, `shopee_wholesale_tiers`

---

## SEA Marketplace Comparison

| Feature | Lazada | Tokopedia | Shopee |
|---------|--------|-----------|--------|
| Auth | OAuth + signing | OAuth 2.0 | HMAC signing |
| Product format | XML + JSON | JSON | JSON |
| Image handling | External URLs OK | External URLs OK | Must upload first |
| Variant support | Via SKU matrix | Via `variant` object | Via `tier_variation` |
| Category update | GET categories API | GET categories API | GET categories API |
| Token expiry | 30 days | ~1 hour | 4 hours |
| Sandbox | Yes | Yes | Yes |

---

## Troubleshooting

### Lazada
| Error | Cause | Fix |
|-------|-------|-----|
| `ISP.0000` | Invalid signature | Check sign algorithm (sorted params + path prefix) |
| `ERR_CATEGORY_INVALID` | Wrong category ID | Fetch from `/product/getCategoryTree` |

### Tokopedia
| Error | Cause | Fix |
|-------|-------|-----|
| `401` | Token expired | Refresh access token |
| `Product name already exists` | Duplicate name | Tokopedia requires unique names per shop |

### Shopee
| Error Code | Cause | Fix |
|------------|-------|-----|
| `error_auth` | Invalid signature | Check sign formula (partner_id + path + timestamp + token + shop_id) |
| `error_param` | Missing required field | Check required params for the endpoint |
| `product.name_not_allow` | Restricted keyword in name | Remove brand names / restricted words |
