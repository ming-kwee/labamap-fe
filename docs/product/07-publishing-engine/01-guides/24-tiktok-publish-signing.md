# 24 — TikTok Shop publish signing (fixing `36009004 Invalid 'app_key'`)

**Status:** implemented (bff-v14). **Area:** publish pipeline → sync-service HMAC signing.
**Symptom fixed:** TikTok create/delete return HTTP 400
`{"code":36009004,"message":"Invalid credentials. Invalid 'app_key' query parameter."}`.

---

## 1. What actually happened

The publish request left the BFF fine — JOLT ran, post-processing built `skus`/`sales_attributes`,
the sync API accepted the workflow — but the workflow **FAILED** at
`create_rest_channel_product`. The sync-server's HTTP call to TikTok came back:

```
[HTTP] POST https://open-api.tiktokglobalshop.com/product/202309/products
[HTTP] response status=400 body={"code":36009004,"message":"Invalid credentials. Invalid 'app_key' query parameter."}
```

**"Invalid 'app_key' query parameter" does not mean the key is wrong — it means it was never
sent.** TikTok rejects any Product-API call whose query string lacks a valid `app_key` + `sign`.

### Why signing here is NOT the BFF's `RequestSigner`

We have generic BFF-side signing (`channel/common/RequestSigner*`, scheme
`HMAC_SORTED_QUERY_WRAP`). That path signs **only the calls the BFF makes directly** — category
browse (`GenericCategoryService`) and merchant-data (`GenericMerchantDataService`, e.g.
GetWarehouses). That is why *browse category and warehouses work.*

**Publish is a different path.** The BFF hands the product to the **sync-service** (separate repo,
`notifikasi temporal`, Temporal), which signs the outbound TikTok call **itself**, driven entirely
by the `metadataGroups` the BFF ships in the request. So the fix is **not** in Java signing code —
it is in the **metadata the BFF authors** for TikTok (`ChannelMetadataMigration`).

---

## 2. Root cause — 4 authoring mistakes in the TikTok workaction metadata

The sync-service's signer/HTTP builder has a fixed contract (the same one Shopee already satisfies).
The TikTok `create_CP` / `update_CP` / `delete_CP` metadata violated it in four ways:

| # | The sync-service expects | TikTok metadata had (broken) | Effect |
|---|---|---|---|
| 1 | query params under **`params`** | `queryParams` | signer never reads them → **app_key never sent** → `36009004` |
| 2 | **`"timestamp":"TIMESTAMP"`** (uppercase sentinel → epoch injected at call time) | `"timestamp":"timestamp"` (lowercase) | treated as a literal credential lookup, not the epoch |
| 3 | **no** pre-declared `sign` (it is derived) | `"sign":"sign"` | a bogus literal `sign`, real signature never computed |
| 4 | a **`signature`** block (formula + paramOrder + algorithm) | *absent* | signer had no algorithm → produced no `sign` |

Plus the secret was in the wrong place: **the sync HMAC signer reads the app secret ONLY from the
`shared#serviceFunctions#partner-credential` metadata key** — never from a plain credential. TikTok's
`app_secret` was being shipped as an ordinary credential, so the signer had no secret. (The
`app_secret` credential in the payload is a red herring; the signer doesn't look there.)

### The proof: the verified e2e payload

`src/main/resources/json/tiktok_create_product_e2e_payload.json` is a **known-good** TikTok publish
payload. Its `create_CP` is exactly the shape we now emit:

```json
"params": { "app_key": "client_id", "shop_cipher": "shop_cipher", "timestamp": "TIMESTAMP" },
"signature": {
  "paramOrder": ["app_key", "shop_cipher", "timestamp"],
  "formula": "${SECRET}${PATH}app_key${app_key}shop_cipher${shop_cipher}timestamp${timestamp}${BODY}${SECRET}",
  "algorithm": "HmacSHA256",
  "includeBody": true
}
```
…and it carries `shared#serviceFunctions#partner-credential = {"secret":"<app_secret>"}`.

> Note: in the e2e file the credential is named `client_id`, so `params.app_key` = `"client_id"`.
> In our live store the credential is literally named `app_key`, so we keep `params.app_key` = `"app_key"`.
> Either way the query that reaches TikTok is `app_key=<value>`. The value is identical.

---

## 3. The signature formula (what TikTok's algorithm is)

TikTok's documented signing: **sort** all query params alphabetically (excluding `sign`), concat
`key+value`, prepend the request **path**, append the request **body**, wrap the whole thing with the
**app secret** on both ends, then HMAC-SHA256.

The `formula` string encodes exactly that, with the sync-service filling the `${...}` tokens:

```
${SECRET}  ${PATH}  app_key${app_key} shop_cipher${shop_cipher} timestamp${timestamp}  ${BODY}  ${SECRET}
   │          │            └─────────── sorted key+value pairs ───────────┘              │        │
   │          └ request path (e.g. /product/202309/products)                             │        └ app secret
   └ app secret                                                          raw JSON body (if includeBody)
```

- `paramOrder` is **alphabetical**: `app_key < shop_cipher < timestamp`.
- **`includeBody`**: `true` for create/update/delete (JSON body is signed), `false` for image
  upload (multipart body is not signed).
- image upload is **not** shop-scoped → **no `shop_cipher`**, paramOrder `["app_key","timestamp"]`.

This is the same algorithm as the BFF-side `HMAC_SORTED_QUERY_WRAP` scheme — just expressed as
sync-service metadata instead of Java, because the *signer* here lives in the sync-service.

---

## 4. The fix (BFF, `config/ChannelMetadataMigration.java`)

Two small helpers build the spec from `paramOrder` (no hard-coded formula literal):

```java
private Map<String,String> tiktokSignedParams(boolean withShopCipher) {
    Map<String,String> p = new LinkedHashMap<>();   // sorted: app_key < shop_cipher < timestamp
    p.put("app_key", "app_key");
    if (withShopCipher) p.put("shop_cipher", "shop_cipher");
    p.put("timestamp", "TIMESTAMP");                // uppercase → epoch injected by sync-service
    return p;
}
private Map<String,Object> tiktokSignature(boolean withShopCipher, boolean includeBody) {
    List<String> order = new ArrayList<>(List.of("app_key"));
    if (withShopCipher) order.add("shop_cipher");
    order.add("timestamp");
    StringBuilder f = new StringBuilder("${SECRET}${PATH}");
    for (String k : order) f.append(k).append("${").append(k).append("}");
    f.append("${BODY}${SECRET}");
    return Map.of("paramOrder", order, "formula", f.toString(),
                  "algorithm", "HmacSHA256", "includeBody", includeBody);
}
```

Applied to each workaction:

| Workaction | `withShopCipher` | `includeBody` |
|---|---|---|
| `create_CP` (POST /products) | true | true |
| `update_CP` (PUT /products/${product_id}) | true | true |
| `delete_CP` (DELETE /products) | true | true |
| `upload_image` (POST /images/upload, multipart) | false | false |

And two new metadata items on `buildTiktokshopMetadata()`:

```java
// secret — read ONLY from here by the sync signer; resolved at publish time, never persisted at rest
.key("shared#serviceFunctions#partner-credential")
.value("{\"secret\":\"{app.oauth.clientSecret}\"}")     // grouping=integration, subGrouping=security

// TikTok returns 200 even on logical failure; only body code=0 is success
.key("servflow#response#success-check")
.value("{\"path\":\"code\",\"equals\":\"0\"}")           // grouping=body, subGrouping=content
```

### Where the secret comes from (data-driven, no hardcode)

`{app.oauth.clientSecret}` is substituted at publish time by
`ChannelAttributeConverterService.resolveMetadataValue`, per-channel, from
`OAuthAppConfig.getChannel("tiktokshop").getClientSecret()`:

```yaml
# application.yml
app.oauth.channels.tiktokshop.client-secret: ${TIKTOK_APP_SECRET:dev-tiktok-app-secret}
```

So the real secret lives in **env `TIKTOK_APP_SECRET`** (the same env-backed source used for OAuth),
is injected only into the outbound sync request, and is **never stored** in `channel_configuration`.
This is byte-for-byte how Shopee's `partner-credential` works (`{app.oauth.clientSecret}` →
`SHOPEE_PARTNER_KEY`).

> The `app_secret` is the OAuth **app** (platform) secret — one per TikTok app, shared by every store
> that authorised that app. That is why a single env var is correct, not a per-store value.

---

## 5. ⚠️ Two things to check before it works at runtime

### (a) `TIKTOK_APP_SECRET` must be the REAL app secret
The YAML default is `dev-tiktok-app-secret` — **wrong**. If the env is unset, `{app.oauth.clientSecret}`
resolves to that dummy and TikTok returns `sign invalid`. Set it in the IntelliJ run config (Run →
Edit Configurations → Environment variables) to the app's real secret
(`9b340b8f…` in the sandbox). `resolveMetadataValue` logs a WARN if the placeholder is unresolved.

### (b) The metadata must actually re-seed
`applyChannelMetadata` (Order 100) has two branches:
- **system-default config** → **overwrites** metadata with the current spec. The fixed
  `create_CP`/`update_CP`/`delete_CP`/`upload_image` values land immediately on restart. ✅
- **user-customised config** (`isSystemDefault != true`, metadata already present) → **merge-by-key**:
  only *missing* keys are added; **existing keys are NOT overwritten.** The two new keys
  (`partner-credential`, `success-check`) get added, but the **changed values of the existing
  `*_CP` keys would be skipped** — leaving the broken `queryParams` in place.

If after restart the DB still shows `queryParams`/`"sign":"sign"` on `create_CP`, the config is
user-customised. Force a refresh by clearing the stale keys so the merge re-adds them:

```js
// mongosh — drop the 4 workaction keys + let the seeder re-add them on next restart
db.channel_configuration.updateMany(
  { channelId: "tiktokshop" },
  { $pull: { channelMetadataList: { key: { $in:
      ["workaction#create_CP","workaction#update_CP","workaction#delete_CP","workaction#upload_image"] } } } }
);
```
…then restart. (Or null the whole `channelMetadataList` to fully reseed.)

---

## 6. Verify

```js
// mongosh — the create_CP value should now contain "params"/"signature", NOT "queryParams"
db.channel_configuration.findOne(
  { channelId: "tiktokshop" },
  { channelMetadataList: 1 }
).channelMetadataList.find(m => m.key === "workaction#create_CP").value
```

Then republish. Success looks like:

```
[HTTP] POST .../product/202309/products
[HTTP] response status=200 body={"code":0,"data":{"product_id":"...","skus":[...]}}
Workflow ... terminal state: COMPLETED externalId=<product_id>
```

The sync-server log will show `params` populated and a computed `sign` (not the literal `"sign"`).

---

## 7. Why this is generic (no per-channel branch)

- The BFF authors **data** (metadata strings). It does not sign, and has **no `if (tiktok)`** in the
  publish signer — the sync-service dispatches on the `signature` block it is handed.
- The secret is resolved through the **same** `{app.oauth.clientSecret}` → `OAuthAppConfig` path as
  every other channel; adding a channel that signs this way is metadata-only.
- The `formula` is derived from `paramOrder`, not pasted, so the two helpers cover create/update/
  delete/upload with a single boolean switch.

**Related:** [[shopee-partner-secret-config]] (identical secret-via-metadata model),
`23-generic-request-signing-design.md` (the BFF-side browse/merchant signer this is the publish
counterpart of), `22-tiktok-category-api-202309-and-taxonomy.md`.
