# API Reference — Step 2: Channel Schema and Channel Product Data

Base path: `/labamap/api/v1`

---

## POST `/ecommerce/form-schema/channel-step`

Generates the Step 2 schema — one `ChannelSchemaPerStore` per active connected store.

**Request body:**
```json
{
  "masterProductId": "prod_abc123",
  "organizationId":  "org_123",
  "masterVariants":  [
    { "sku": "SKU-BLACK-64GB", "color": "Black", "storage": "64GB" },
    { "sku": "SKU-BLACK-128GB", "color": "Black", "storage": "128GB" }
  ]
}
```

`masterVariants` is read from `sessionStorage["product_{masterProductId}"].variants` by the frontend. It is needed so the backend can build the `variant_overrides` table with the correct SKU rows.

**Response:** `ChannelStepSchemaResponse`
```json
{
  "stores": [
    {
      "storeId":    "shopify-us-store",
      "storeName":  "My Shopify US Store",
      "channelType":"shopify",
      "sections": {
        "required": {
          "sectionName": "required",
          "label": "Required Fields",
          "fields": [
            {
              "fieldName": "vendor",
              "fieldType": "TEXT",
              "label": "Vendor",
              "required": true,
              "currentValue": "TechBrand US"
            }
          ]
        },
        "recommended": { "...": "..." },
        "optional": { "...": "..." },
        "master_overrides": {
          "sectionName": "master_overrides",
          "fields": [
            {
              "fieldName": "title",
              "fieldType": "TEXT",
              "label": "Product Title",
              "currentValue": "Wireless Earbuds Pro",
              "masterValue": "Wireless Earbuds Pro",
              "isChannelOverridable": true
            }
          ]
        },
        "variant_overrides": {
          "sectionName": "variant_overrides",
          "variantFields": [
            { "fieldName": "inventory_policy", "fieldType": "SELECT", "isMasterField": false,
              "options": [{"value":"deny","label":"Deny"},{"value":"continue","label":"Continue"}] },
            { "fieldName": "price", "fieldType": "NUMBER", "isMasterField": true }
          ],
          "variants": [
            { "sku": "SKU-BLACK-64GB", "color": "Black", "storage": "64GB", "price": 29.99 },
            { "sku": "SKU-BLACK-128GB", "color": "Black", "storage": "128GB", "price": 39.99 }
          ]
        }
      },
      "completionStats": {
        "requiredTotal": 9, "requiredFilled": 4,
        "channelRequiredTotal": 5,  "channelRequiredFilled": 3,
        "categoryRequiredTotal": 4, "categoryRequiredFilled": 1,
        "recommendedTotal": 8, "recommendedFilled": 5
      }
      // categoryAttributeSection: omitted when no category saved; see 06-step2-category-attributes.md
    }
  ]
}
```

---

## ChannelFormField Shape

```typescript
interface ChannelFormField {
  fieldName:    string;
  fieldType:    ChannelFieldType;
  label:        string;
  required:     boolean;
  helpText?:    string;
  placeholder?: string;
  options?:     Array<{ value: string; label: string }>;
  currentValue?: unknown;          // pre-populated from saved channel_product_data
  masterValue?:  unknown;          // master product's value (for master_overrides section)
  isChannelOverridable?: boolean;  // true = shown in master_overrides section
  isMasterField?: boolean;         // true in variant_overrides = reads from master product

  // Phase 1: merchant-sourced options
  optionsSource?:   "STATIC" | "MERCHANT_API";
  optionsEndpoint?: string;        // e.g. "/merchant-data/tiktok/store-01/field-options?fieldName=warehouse_id"

  // Phase 2: master-to-channel value mapping
  masterMappedSuggestion?: {
    masterField:    string;        // master product field that was the source, e.g. "material"
    masterValue:    unknown;       // raw master value, e.g. "cotton"
    suggestedValue: unknown;       // channel code to write on Accept, e.g. "LZ_MAT_001" (null for NONE)
    suggestedLabel: string;        // human-readable label shown in banner (null for NONE)
    confidence:     "EXACT" | "FUZZY" | "NONE";
  };

  // Phase 3: hierarchical category tree
  categoryTreeConfig?: {
    rootEndpoint:    string;       // GET /merchant-data/{ch}/{store}/categories
    childEndpoint:   string;       // ...?parentId={parentId}&organizationId=...
    maxDepth:        number;
    requireLeafNode: boolean;
    selectedPath?:   CategoryTreeNode[];

    // Phase 3b (new — backend implementation required):
    // Full-text search endpoint for large taxonomies (Shopify, Amazon, TikTok, etc.)
    // GET {searchEndpoint}&q={query}
    // Returns CategorySearchResult[] — see search endpoint below.
    // Omit for channels with small taxonomies (Wix); frontend falls back to level-filter.
    searchEndpoint?: string;
  };
}

type ChannelFieldType =
  | "TEXT" | "TEXTAREA" | "NUMBER" | "SELECT" | "MULTISELECT"
  | "CHECKBOX" | "RADIO" | "DATE" | "URL" | "EMAIL" | "COLOR"
  | "CATEGORY_TREE";
```

---

## MongoDB Collection: `channel_product_data`

One document per master product × connected store.

```json
{
  "_id":            "67a1b2c3d4e5f6a7b8c9d0e1",
  "masterProductId":"prod_abc123",
  "storeId":        "shopify-us-store",
  "channelType":    "shopify",
  "organizationId": "org_123",
  "status":         "READY",
  "channelData": {
    "vendor":        "TechBrand US",
    "product_type":  "Electronics",
    "tags":          ["wireless", "earbuds"]
  },
  "masterOverrides": {
    "title": "Wireless Earbuds Pro — Limited Edition"
  },
  "variantOverrides": {
    "SKU-BLACK-64GB": {
      "inventory_policy": "deny",
      "barcode": "1234567890123"
    },
    "SKU-BLACK-128GB": {
      "inventory_policy": "continue",
      "barcode": "1234567890124"
    }
  },
  "completionStats": {
    "required": 3,
    "total": 3,
    "percentage": 100
  },
  "updatedAt": "2026-04-28T14:00:00Z"
}
```

---

## POST `/channel-product-data/save`

Saves (upserts) one store's channel data. Called on autosave (30s debounce) and on tab switch.

**Request body:**
```json
{
  "masterProductId": "prod_abc123",
  "organizationId":  "org_123",
  "storeId":         "shopify-us-store",
  "channelType":     "shopify",
  "channelData": {
    "vendor": "TechBrand US"
  },
  "masterOverrides": {
    "title": "Shorter title for Shopify"
  },
  "variantOverrides": {
    "SKU-BLACK-64GB": { "inventory_policy": "deny" }
  },
  "categoryId": "electronics"
}
```

**Response:**
```json
{
  "success": true,
  "completionStats": {
    "required": 2,
    "total": 3,
    "percentage": 66
  }
}
```

---

## GET `/channel-product-data/{masterProductId}?organizationId={orgId}`

Returns all stores' saved channel data for a product.

**Response:** `ChannelProductData[]`

---

## GET `/channel-product-data/{masterProductId}/{storeId}?organizationId={orgId}`

Returns a single store's saved channel data.

**Response:** `ChannelProductData`

---

## GET `/channel-product-data/{masterProductId}/completion?organizationId={orgId}`

Returns completion statistics per store.

**Response:**
```json
{
  "stores": [
    {
      "storeId":    "shopify-us-store",
      "storeName":  "My Shopify US Store",
      "status":     "COMPLETE",
      "required":   3,
      "total":      3,
      "percentage": 100
    }
  ]
}
```

`status` values: `"EMPTY"` | `"PARTIAL"` | `"COMPLETE"` | `"PUBLISHED"` | `"ERROR"`

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts

interface ChannelProductData {
  masterProductId:  string;
  storeId:          string;
  channelType:      string;
  organizationId:   string;
  status:           ChannelProductStatus;
  channelData:      Record<string, unknown>;
  masterOverrides:  Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;  // sku → fieldName → value
  completionStats?: CompletionStats;  // see 06-step2-category-attributes.md for full shape
  updatedAt?:       string;
}

type ChannelProductStatus = "EMPTY" | "PARTIAL" | "COMPLETE" | "PUBLISHED" | "ERROR";

interface ChannelStepSaveRequest {
  masterProductId:  string;
  organizationId:   string;
  storeId:          string;
  channelType:      string;
  channelData:      Record<string, unknown>;
  masterOverrides:  Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
  categoryId?:      string;
}
```

---

## Phase 1 — Merchant-Sourced Options

**Implemented 2026-03-09.**

### MongoDB Collection: `merchant_api_operations`

One document per `(channelType, operationName)`. Unique compound index on both fields.

```json
{
  "_id":                 "...",
  "channelType":         "tiktok",
  "operationName":       "GetWarehouses",
  "label":               "TikTok Warehouses",
  "baseUrl":             "https://open-api.tiktokglobalshop.com",
  "httpMethod":          "GET",
  "urlPath":             "/api/logistics/get_warehouse_list",
  "authStrategy":        "BEARER_TOKEN",
  "authCredentialKey":   "accessToken",
  "authHeaderName":      null,
  "authQueryParam":      null,
  "fixedQueryParams":    {},
  "credentialQueryParams": {},
  "itemsJsonPath":       "data.warehouse_list",
  "valueField":          "warehouse_id",
  "labelField":          "warehouse_name",
  "enabled":             true
}
```

| Field | Description |
|-------|-------------|
| `authStrategy` | `BEARER_TOKEN` / `API_KEY_HEADER` / `API_KEY_QUERY` / `NO_AUTH` |
| `authHeaderName` | Header name when `authStrategy = API_KEY_HEADER` (e.g. `"X-Shopify-Access-Token"`) |
| `authQueryParam` | Query param name when `authStrategy = API_KEY_QUERY` |
| `authCredentialKey` | Key in `channel_store_connections.credentials` that holds the auth value |
| `itemsJsonPath` | Dot-notation path into the response body to the items array, e.g. `"data.warehouse_list"` |
| `valueField` / `labelField` | Keys within each item for `FieldOption.value` / `.label` |
| `fixedQueryParams` | Static key→value params always appended |
| `credentialQueryParams` | Maps query param name → credential key; value looked up from store credentials at runtime |

Both `baseUrl` and `urlPath` support `{storeId}` placeholder replaced at runtime (e.g. Shopify `baseUrl: "https://{storeId}"`).

### GET `/merchant-data/{channelType}/{storeId}/field-options`

Lazy-load endpoint. Called by the frontend when `optionsSource === "MERCHANT_API"` and `optionsEndpoint` is set.

**Query params:** `fieldName` (required), `organizationId` (required)

**Example:**
```
GET /merchant-data/tiktok/tiktok-sg-01/field-options?fieldName=warehouse_id&organizationId=org_123
```

**Response:**
```json
{
  "fieldName": "warehouse_id",
  "options": [
    { "value": "WH_001", "label": "Main Warehouse" },
    { "value": "WH_002", "label": "East Warehouse" }
  ]
}
```

The backend resolves `fieldName` → `merchantApiOperation` by reading the matching `EcommerceMasterAttributeDocument`, then calls the corresponding `merchant_api_operations` document via `GenericMerchantDataService`.

---

## Phase 2 — Master-to-Channel Value Mapping

**Implemented 2026-03-07.**

### MongoDB Collection: `channel_field_value_mappings`

One document per `(channelType, masterFieldName, channelFieldName)`.

```json
{
  "_id":             "...",
  "channelType":     "lazada",
  "masterFieldName": "material",
  "channelFieldName":"bahan",
  "mappings": [
    { "masterValue": "cotton",          "channelValue": "LZ_MAT_001", "channelLabel": "Cotton" },
    { "masterValue": "polyester blend", "channelValue": "LZ_MAT_003", "channelLabel": "Polyester Blend" }
  ],
  "fallbackStrategy": "PROMPT_USER"
}
```

`channelValue` is `Object` — supports `String` or `List<String>` (e.g. Amazon gender `"unisex"` maps to `["mens", "womens"]`).

`fallbackStrategy` values: `PROMPT_USER` | `FREE_TEXT` | `USE_CLOSEST`

### Admin Endpoints — `/admin/channel-mappings`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/channel-mappings?channelType=lazada&masterFieldName=material` | List mappings (filterable) |
| `POST` | `/admin/channel-mappings` | Create a new mapping document |
| `PUT` | `/admin/channel-mappings/{id}` | Update an existing mapping document |
| `DELETE` | `/admin/channel-mappings/{id}` | Delete a mapping document |

These endpoints let the ops team update translations without a redeploy. Mapping document lookup is cached 10 minutes (`@Cacheable("channelValueMappings")`); cache is invalidated on write.

---

## Phase 3 — Hierarchical Category Tree

**Implemented.**

### GET `/categories/{channelType}/{storeId}/root`

Returns top-level category nodes for the channel store.

**Query params:** `organizationId` (required)

**Response:** `CategoryNodesResponse`
```json
{
  "channelType": "tiktokshop",
  "storeId":     "store-sg-01",
  "parentId":    null,
  "nodes": [
    { "id": "100", "name": "Electronics",  "hasChildren": true },
    { "id": "101", "name": "Fashion",      "hasChildren": true }
  ]
}
```

### GET `/categories/{channelType}/{storeId}/children/{parentId}`

Returns direct children of the given parent node.

**Query params:** `organizationId` (required)

Backend caches responses in `channel_category_cache` (TTL 24h, indexed by `(channelType, storeId, parentId)`), warmed nightly by `CategorySyncJob`.

---

## Phase 3b — Category Tree Search ⚠️ Backend implementation required

Extends Phase 3. Enables full-text search inside the `CategoryTreePicker` for large taxonomies (Shopify ~6 000 nodes, Amazon ~100 000+) where level-by-level browsing is impractical.

**How it works:**
- Backend adds `searchEndpoint` to `categoryTreeConfig` in the schema response for channels with large taxonomies
- Frontend detects `searchEndpoint` present → switches picker to server-search mode (debounced 300ms)
- When absent → falls back to filtering the currently-loaded level client-side (no backend change needed)
- Frontend is already complete — only the backend endpoint below needs to be built

### GET `/merchant-data/{channelType}/{storeId}/categories/search`

**Query params:**

| Param | Required | Default | Description |
|---|---|---|---|
| `q` | yes | — | Search term, min 2 chars. Case-insensitive contains. |
| `organizationId` | yes | — | Owning organization |
| `maxResults` | no | 20 | Max 50 |
| `leafOnly` | no | false | If true, exclude intermediate (non-leaf) nodes |

**Response:** `CategorySearchResult[]`

```json
[
  {
    "id":          "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "name":        "Shirts",
    "fullName":    "Apparel & Accessories > Clothing > Clothing Tops > Shirts",
    "hasChildren": false,
    "level":       3,
    "ancestorIds": [
      "gid://shopify/TaxonomyCategory/aa",
      "gid://shopify/TaxonomyCategory/aa-1",
      "gid://shopify/TaxonomyCategory/aa-1-13"
    ]
  }
]
```

**Frontend contract — must be upheld:**
- `fullName.split(" > ").length === ancestorIds.length + 1` — used to build the breadcrumb path
- Separator is exactly `" > "` (space–gt–space)
- `ancestorIds` ordered root-first (index 0 = root, last = immediate parent)
- Return `200 []` (not an error) for `q` shorter than 2 chars or when nothing matches
- Never return 4xx/5xx — the picker degrades gracefully on empty results

**Ordering:** leaf nodes first, then intermediate nodes; within each tier sort by name length ascending (shorter = more specific match).

**Implementation:** Regex search on the existing `channel_category_cache` collection.
Two new fields must be added to `ChannelCategoryCacheDocument` and populated by `CategorySyncJob`:

| New field | Type | Content |
|---|---|---|
| `fullName` | `String` | `"Apparel & Accessories > Clothing > Clothing Tops > Shirts"` |
| `ancestorIds` | `List<String>` | Ordered list of ancestor node IDs, root-first |

**Channels that must include `searchEndpoint` in their `categoryTreeConfig`:**
Shopify, Amazon, TikTok Shop, Lazada, Shopee, eBay

**Channels that must omit `searchEndpoint`:**
Wix (small merchant-created taxonomy — frontend uses client-side level filter)

**Example `categoryTreeConfig` for Shopify with search enabled:**

```json
"categoryTreeConfig": {
  "rootEndpoint":   "/merchant-data/shopify/store-abc/categories?organizationId=org_123",
  "childEndpoint":  "/merchant-data/shopify/store-abc/categories?parentId={parentId}&organizationId=org_123",
  "searchEndpoint": "/merchant-data/shopify/store-abc/categories/search?organizationId=org_123",
  "maxDepth": 4,
  "requireLeafNode": true,
  "selectedPath": [ ... ]
}
```

---

## Phase 4 — Category-Dependent Field Injection

**Implemented.** Full spec: [`06-step2-category-attributes.md`](06-step2-category-attributes.md)

### GET `/merchant-data/{channelType}/{storeId}/category-attributes`

**Query params:** `categoryId` (required), `organizationId` (required)

**Response:** `CategoryAttributesResponse`
```json
{
  "categoryId":   "123456",
  "categoryName": "Women's T-Shirts",
  "categoryPath": ["Clothing", "Women's", "T-Shirts"],
  "requiredFields": [ { "fieldName": "100001", "fieldType": "SELECT", "label": "Color", "required": true, "options": [...] } ],
  "optionalFields": [ { "fieldName": "100010", "fieldType": "SELECT", "label": "Pattern", "required": false } ]
}
```

`ChannelStepSchemaService` pre-fetches this during schema generation when a `categoryId` is already
saved, embedding the result in `ChannelSchemaPerStore.categoryAttributeSection`. The `required`
section in the schema response also has these fields appended directly. Call this endpoint directly
only when the user changes category after initial schema load (see frontend contract).
