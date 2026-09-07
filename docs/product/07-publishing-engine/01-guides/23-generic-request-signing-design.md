# Generic, data-driven request signing (TikTok + Shopee under one abstraction)

**Status: IMPLEMENTED (2026-08-26).** `SignatureScheme` + `RequestSigner`/registry landed; Shopee migrated
via back-compat mapping (`HMAC_SHA256 → HMAC_CONCAT_FIXED`), TikTok config now uses
`HMAC_SORTED_QUERY_WRAP`. Live signature parity still to be confirmed by browsing categories on a real
store (see §5). Written to fix TikTok category browse failing with
`36009004 Invalid timestamp` (the request reaches TikTok's real API but carries no `timestamp`/`sign`
because our TikTok config uses `API_KEY_QUERY` with no signing — the pre-existing gap flagged in guide 22 §1).

Constraint from the outset: **generic, no hardcode.** The fix must NOT add a `channelType == "tiktok"`
branch. It must express the signature algorithm as **data** selected by config, so adding any future
channel that signs the same way is config-only.

---

## 1. Why a config tweak is not enough

The existing signer, `HmacSha256Signer`, has a **fixed message template**:

```
message = signingCredentialId + urlPath + timestamp [+ extraValues]
sign    = hex( HMAC-SHA256( message, OAuthAppConfig[channel].clientSecret ) )
```

Despite the generic class name, that template **is** Shopee's algorithm. TikTok's algorithm is materially
different (verified from the EcomPHP 202309 client → official doc `partner.tiktokshop.com/doc/page/274638`):

```
1. take all QUERY params EXCEPT: sign, access_token, x-tts-access-token
2. sort keys alphabetically
3. concat each as {key}{value}   (no separators)
4. prepend the request PATH        →  path + concat
5. (GET → no body; else append body unless multipart)
6. wrap with the secret on BOTH ends →  app_secret + step4 + app_secret
7. sign = hex( HMAC-SHA256( step6, app_secret ) )
required query: app_key, timestamp(unix seconds);  access_token goes in HEADER x-tts-access-token
```

Two different algorithms → cannot be one hardcoded template. The generic move is to make the **algorithm a
data-selected scheme**, with each algorithm implemented once (the same way post-processing `op`s are named
code selected by rule data — see guide 21 §2A).

---

## 2. Two concerns the current `AuthStrategy` conflates — split them

| Concern | Question | Today | Generic answer |
|---|---|---|---|
| **Token transport** | where does the access token go? | `AuthStrategy` (BEARER/API_KEY_HEADER/API_KEY_QUERY/NO_AUTH) | keep `AuthStrategy` — it already covers header vs query |
| **Request signing** | how is the request signed? | fused into `HMAC_SHA256` (Shopee-shaped) | NEW `signatureScheme` field (data), independent of transport |

Key realisation: **token transport is already data-driven.** TikTok wants the token in header
`x-tts-access-token` and `app_key` in the (signed) query. That is expressible today with **no new code**:

```
authStrategy      = API_KEY_HEADER
authHeaderName    = "x-tts-access-token"
authCredentialKey = "accessToken"
credentialQueryParams = { "app_key": "appKey" }     // app_key stays a signed query param
```

So the ONLY missing generic piece is the signature scheme.

---

## 3. The generic signing abstraction

### 3.1 Config (data) — generalise the `hmac*` fields on `CategoryTreeApiConfig`

Replace the Shopee-specific `hmac*` fields with a scheme-agnostic `SignatureConfig` (keep the old fields as
deprecated aliases for back-compat, mapping to `HMAC_CONCAT_FIXED`):

```
signatureScheme : enum { NONE, HMAC_CONCAT_FIXED, HMAC_SORTED_QUERY_WRAP }   // default NONE
secretSource    : enum { PLATFORM_CLIENT_SECRET }                            // OAuthAppConfig[channel].clientSecret; default this
timestampParam  : String   // "timestamp"
signParam       : String   // "sign"
excludeFromSign : List<String>   // e.g. ["sign","access_token","x-tts-access-token"]  (scheme 2)
// scheme-1 (Shopee) only:
signingCredentialKey : String        // "partnerId"   (the id prefixed to the message)
extraSigningKeys     : List<String>  // appended after timestamp
```

- `HMAC_CONCAT_FIXED` = today's Shopee template (`id + path + timestamp + extras`).
- `HMAC_SORTED_QUERY_WRAP` = TikTok (§1 steps 1–7).
- Both take the secret from `PLATFORM_CLIENT_SECRET` (platform-level, never per store) — the pattern that
  already exists.

### 3.2 A `RequestSigner` selected by scheme (data), not by channel

```
interface RequestSigner {
  SignatureScheme scheme();
  // mutate the query builder: add timestamp, compute + add sign, over the FINAL query set + path
  void sign(UriComponentsBuilder uri, String resolvedPath, String channelType,
            Map<String,String> creds, SignatureConfig cfg);
}
```

- `HmacConcatFixedSigner` — the current `HmacSha256Signer` logic, unchanged, registered for
  `HMAC_CONCAT_FIXED`.
- `HmacSortedQueryWrapSigner` — new, implements §1 steps 1–7 for `HMAC_SORTED_QUERY_WRAP`.
- A tiny registry (`Map<SignatureScheme, RequestSigner>`, Spring-injected) does the dispatch. **No
  channelType anywhere** — dispatch is purely on the config's `signatureScheme` value.

This is exactly the codebase's existing generic pattern: the algorithm is named code (like `BUILD_*` ops),
and *which* algorithm runs is chosen by data.

### 3.3 Wiring in `GenericCategoryService` (both signing points: tree ~L751, attribute ~L310)

Replace:

```
if (authStrategy == HMAC_SHA256) hmacSigner.sign(uriBuilder, resolvedPath, channelType, creds, hmacSpec(tc));
```

with:

```
SignatureScheme scheme = tc.getSignatureScheme();           // data
if (scheme != NONE) {
    // add channel query params FIRST (app_key via credentialQueryParams, fixedQueryParams, etc.)
    // THEN sign over the final query set:
    signerRegistry.get(scheme).sign(uriBuilder, resolvedPath, channelType, effectiveCreds, tc.getSignatureConfig());
}
```

Ordering matters: the signer must run **after** all query params are on the builder (it sorts them), and it
adds `timestamp` itself before computing `sign`. For scheme 2 the signer reads
`uriBuilder.build().getQueryParams()`, applies `excludeFromSign`, sorts, concatenates `{k}{v}`, prepends
`resolvedPath`, wraps with the secret, HMACs, and appends `sign`.

Back-compat: map legacy `authStrategy == HMAC_SHA256` → `signatureScheme = HMAC_CONCAT_FIXED` at read time,
so Shopee keeps working with zero seed change during migration; migrate Shopee's seed to the explicit
`signatureScheme` afterwards.

---

## 4. TikTok seed after this lands (all data — the point of the design)

```
treeApiConfig / attributeConfig:
  authStrategy          = API_KEY_HEADER
  authHeaderName        = "x-tts-access-token"
  authCredentialKey     = "accessToken"
  credentialQueryParams = { "app_key": "appKey" }
  signatureScheme       = HMAC_SORTED_QUERY_WRAP
  secretSource          = PLATFORM_CLIENT_SECRET        // OAuthAppConfig["tiktokshop"].clientSecret = app_secret
  timestampParam        = "timestamp"
  signParam             = "sign"
  excludeFromSign       = ["sign","access_token","x-tts-access-token"]
```

Adding another channel that signs the TikTok way later = set these fields; **no Java**.

---

## 5. Prerequisites & residual unknowns (verify against a live store)

1. **`app_secret` availability.** Requires `OAuthAppConfig.getChannel("tiktokshop").getClientSecret()` to hold
   the TikTok app_secret (env-backed, Phase A). Confirm it is populated in the target env.
2. **Token in header, not query.** 202309 expects `x-tts-access-token` (EcomPHP confirms). Verify the tree +
   attribute calls accept the header form.
3. **`shop_cipher`.** Get Categories / Get Attributes are global reference data → EcomPHP omits `shop_cipher`
   for calls that disallow it, so category/attribute browse likely needs none. If TikTok returns a
   shop-scope error, add `shop_cipher` as a signed credentialQueryParam (it is stored per-store from Phase C
   OAuth). This stays data-driven (a query param), not code.
4. **`category_version`** (v1/v2) — if required, it is just another signed query param (fixedQueryParams).
5. **Live signature parity.** This is crypto we cannot unit-verify against TikTok here; after implementing,
   verify by browsing categories on a real store. Failure mode is a 4xx sign error (not a crash), easy to
   iterate.

---

## 6. Why this is "generic" (the constraint check)

- No `channelType`/name branch is introduced anywhere in runtime signing — dispatch is on the config's
  `signatureScheme` **data**.
- The two algorithms are named implementations (like `BUILD_ATTRIBUTE_LIST` vs a future
  `BUILD_METAFIELD_LIST`), each written once; channels pick one by config.
- Token transport reuses the existing data-driven `AuthStrategy` (header vs query) — no new code.
- Adding the next signed channel is a seed-only change.

This turns the accidental hardcoding (`HmacSha256Signer` = Shopee template) into a proper data-selected
scheme, and Shopee + TikTok become two data points of one mechanism.

---

## Code pointers

- Failing call + both signing points: `GenericCategoryService` (attribute ~L310, tree ~L751).
- Current Shopee-shaped signer to generalise: `channel/common/HmacSha256Signer` (`computeSign`).
- Signing config fields to generalise: `ChannelCategoryApiConfig.CategoryTreeApiConfig` (`hmac*`).
- Secret source: `OAuthAppConfig.getChannel(channelType).getClientSecret()`.
- TikTok seed to update: `CategoryApiConfigDataLoader` (tiktokshop block).
- TikTok 202309 endpoints + earlier flags: guide 22.
