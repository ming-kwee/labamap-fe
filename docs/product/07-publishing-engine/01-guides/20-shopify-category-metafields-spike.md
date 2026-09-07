# Spike: Shopify category (taxonomy) attribute values via GraphQL — format validation

Purpose: before wiring a `set_category_metafields` GraphQL post-write op (guide 19 / the Step-2
category-attribute publish path), pin down the **exact** Shopify contract, which is under-documented and
version-sensitive:

1. the metafield **namespace + key (handle)** for a category/taxonomy attribute (e.g. is it `shopify` /
   `fabric` / `color-pattern`?),
2. the metafield **type** (`list.metaobject_reference` vs `metaobject_reference` vs measurement types),
3. the **value format** — does it accept our stored `gid://shopify/TaxonomyValue/…` (from
   `TaxonomyChoiceListAttribute.values.nodes.id`) directly, or does it need a
   `gid://shopify/Metaobject/…`, and is `standardMetaobjectDefinitionEnable` a prerequisite?

Run against a **test product** on a **test/dev store**. It is read-heavy; only Step 4 writes (to one
product). Paste each result back.

## Parameters

```sh
SHOP="labamap.myshopify.com"
TOKEN="shpat_xxx"          # Admin API access token (needs read/write_products, read metaobjects)
APIVER="2025-01"           # NOTE: category metafields need 2024-07+. Publish config is 2024-01 —
                           # if the spike only works on 2025-01, the publish apiVersion must be bumped.
PRODUCT_GID="gid://shopify/Product/PUT_A_TEST_PRODUCT_ID"
# T-Shirts taxonomy category GID. Read it from channel_product_data.channelCategoryId for a T-Shirt
# product, or resolve it in Step 0 below.
CATEGORY_GID="gid://shopify/TaxonomyCategory/aa-1-13-8"
```

Curl wrapper (each step below sets `Q` then runs this):

```sh
run() { curl -s -X POST "https://$SHOP/admin/api/$APIVER/graphql.json" \
  -H "X-Shopify-Access-Token: $TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -nc --arg q "$Q" '{query:$q}')" | jq .; }
```

---

## Step 0 — (optional) resolve the T-Shirts taxonomy category GID + its attributes

Confirms the category GID and shows the attributes as our app sees them (name + value ids). Does the
attribute node expose a **handle**? (We expect only `id`+`name` — that is the gap Step 2 fills.)

```sh
Q='query {
  node(id: "'"$CATEGORY_GID"'") {
    ... on TaxonomyCategory {
      id fullName
      attributes(first: 50) {
        nodes {
          __typename
          ... on TaxonomyChoiceListAttribute { id name values(first: 5){ nodes{ id name } } }
          ... on TaxonomyMeasurementAttribute { id name }
        }
      }
    }
  }
}'; run
```
Look for: the value `id` format (`gid://shopify/TaxonomyValue/…`), and whether any handle field exists.

---

## Step 1 — set the category on the test product (provisions category metafield definitions)

```sh
Q='mutation {
  productUpdate(input:{ id:"'"$PRODUCT_GID"'", category:"'"$CATEGORY_GID"'" }) {
    product { id category { id fullName } }
    userErrors { field message }
  }
}'; run
```
Expect `userErrors: []`. Setting the category is what makes Shopify attach the category metafield
definitions to the product.

---

## Step 2 — discover the category metafield DEFINITIONS (THE key answer: namespace + key + type)

```sh
Q='query {
  metafieldDefinitions(first: 100, ownerType: PRODUCT) {
    nodes {
      namespace key name
      type { name }
      validations { name value }
    }
  }
}'; run
```
Look for the entries that correspond to the category attributes (Fabric, Care instructions, …). Record
for each:
- **namespace** (expected `shopify`),
- **key** (this is the attribute **handle** we need for the metafield key — NOT the display name),
- **type.name** (expected `list.metaobject_reference` for choice lists),
- **validations** — the `metaobject_definition_id` / allowed metaobject definition type (used in Step 3).

If nothing category-related appears, re-run filtered: add `namespace: "shopify"` to the query args.

---

## Step 3 — find the valid VALUE GIDs (metaobject GIDs) for one attribute

Use the metaobject definition type/id from Step 2's `validations` (e.g. `shopify--color-pattern` or a
`gid://shopify/MetaobjectDefinition/…`).

```sh
Q='query {
  metaobjectDefinitionByType(type: "PUT_TYPE_FROM_STEP2") {
    id type name
    metaobjects(first: 20) { nodes { id displayName } }
  }
}'; run
```
Compare the `id`s here (`gid://shopify/Metaobject/…`) with the value ids from Step 0
(`gid://shopify/TaxonomyValue/…`). **If they differ, our stored TaxonomyValue GID is NOT directly usable
and needs mapping to the Metaobject GID** — a critical finding for the design.

---

## Step 4 — the write test: try to SET one attribute value

Fill `<KEY>` + `<TYPE>` from Step 2. Try **variant A first (Metaobject GID from Step 3)**; if it errors,
try **variant B (TaxonomyValue GID from Step 0)**.

```sh
# Variant A — Metaobject GID
Q='mutation {
  productUpdate(input:{
    id:"'"$PRODUCT_GID"'",
    metafields:[{ namespace:"shopify", key:"<KEY>", type:"<TYPE>",
                  value:"[\"gid://shopify/Metaobject/PUT_FROM_STEP3\"]" }]
  }) {
    product { id metafield(namespace:"shopify", key:"<KEY>") { value type } }
    userErrors { field message }
  }
}'; run
```
```sh
# Variant B — TaxonomyValue GID (only if A fails)
#   ...same as above but value:"[\"gid://shopify/TaxonomyValue/PUT_FROM_STEP0\"]"
```
Success = `userErrors: []` and the returned `metafield.value` echoes the GID. **This decides the value
format the build rule must emit.**

---

## Step 5 — only if Step 4 fails with a "definition not enabled / not found" error

```sh
Q='mutation {
  standardMetaobjectDefinitionEnable(type: "PUT_TYPE_FROM_STEP2") {
    metaobjectDefinition { id type }
    userErrors { field message }
  }
}'; run
```
Then retry Step 4. If this is required, the publish flow needs a one-time enable step (per store, per
attribute type) before values can be set — an extra op/precondition to design for.

---

## What each answer locks down in the design

| Finding | Decides |
|---|---|
| Step 2 `key` | the metafield **key** → we must stage the attribute **handle** (extend the taxonomy query; keep `idField:name` for pure-promote, add handle as an extra field) |
| Step 2 `type.name` | the `MetafieldInput.type` per attribute (choice-list = list vs single; measurement differs) |
| Step 3 vs Step 0 GID | whether the build rule emits the stored value as-is or must **map TaxonomyValue→Metaobject GID** |
| Step 4 variant that works | the exact `value` JSON the rule emits |
| Step 5 needed? | whether a per-type `standardMetaobjectDefinitionEnable` precondition op is required |
| APIVER that works | whether the publish `apiVersion` (2024-01) must be bumped to 2024-07+/2025-01 |

Paste Steps 0, 2, 3, and the working Step 4 variant back — that is enough to finalize the
`shopify-build-category-metafields` rule + `set_category_metafields` op in guide 19.

---

## Spike RESULTS (store `labamap`, api 2025-01, product `10458184843554`, category T-Shirts `aa-1-13-8`)

Confirmed:

- **Category is set via** `productUpdate(input:{category})` (already our `set_category` op). ✅
- **Values are product metafields**: `namespace = "shopify"`, `key = attribute HANDLE` (e.g. `color-pattern`,
  NOT the display name "Color"), `type = list.metaobject_reference`. ✅
- **Value = Metaobject GID** (`gid://shopify/Metaobject/…`). A raw `gid://shopify/TaxonomyValue/…` is
  **rejected**: `"Value require that you select a metaobject."` ✅ (write test proved it)
- **Deterministic TaxonomyValue→Metaobject mapping**: each standard metaobject carries a
  `*_taxonomy_reference` field holding its TaxonomyValue GID(s). Example — metaobject "Black"
  (`gid://shopify/Metaobject/286651941154`) has `color_taxonomy_reference = ["gid://shopify/TaxonomyValue/1"]`.
  So from our stored TaxonomyValue GID we can find the Metaobject GID by matching that field. ✅
- **Write works** end-to-end: `productUpdate(input:{id, metafields:[{namespace:"shopify", key:"color-pattern",
  type:"list.metaobject_reference", value:"[\"gid://shopify/Metaobject/286651941154\"]"}]})` → `userErrors: []`. ✅

Newly discovered COST (blocking prerequisite):

- Category attribute definitions are **NOT pre-provisioned**. On this store ONLY `color-pattern` (Color)
  has a metafield definition AND a metaobject definition — because Color was used (variant option). For
  **Fabric / Care instructions there is neither a metafield definition nor a metaobject definition yet.**
- So before values can be set for an attribute, its definitions must be **enabled per store, per
  attribute** — likely `standardMetaobjectDefinitionEnable(type:"shopify--<handle>")` (needs
  `write_metaobject_definitions`), and possibly a product metafield definition enable/create too. This is
  a real precondition step the publish flow must own (or detect+enable lazily).

Design consequences (for guide 19 wiring):

1. **Scopes**: publish app needs `read_metaobjects`, `read_metaobject_definitions` (+ `write_metaobject_definitions`
   if we auto-enable). API version must be **2024-07+** (2024-01 won't do category metafields).
2. **Handle**: ⚠️ **CORRECTED (Area C, bff-v17):** the taxonomy attribute node has **no `handle` field** (only
   `id`+`name`, verified against the live schema), so the handle/type/metaobject_definition_id are captured NOT from
   the taxonomy query but from **`metafieldDefinitions(ownerType:PRODUCT, namespace:"shopify")`** (`key`/`type.name`/
   `validations[metaobject_definition_id]`), joined to each attribute by display name. `idField:name` stays for
   pure-promote; the metafield fields land on `CachedAttributeField` via `MetafieldDefinitionParser`. See guide 21 §5.2.
3. **Value mapping**: at publish, per chosen value, resolve TaxonomyValue GID → Metaobject GID via the
   attribute's metaobject definition (`*_taxonomy_reference` match). Needs the metaobject definition id per
   attribute (from the metafield definition's `validations.metaobject_definition_id`).
4. **Provisioning**: ensure metaobject + metafield definitions exist for each attribute before set (enable op).
5. This is substantially heavier than a single GraphQL op — factor into the go/no-go decision.

---

## GO / NO-GO decision (2026-08-25)

### What works (proven) vs what it costs

The mechanism is fully proven, but pushing category attributes to Shopify is a multi-system feature, not
a single op. Work breakdown + rough estimate (engineer-days):

| Area | Work | Est. | Risk |
|---|---|---|---|
| A. Platform | 🟡 **Reduced + step-1 done.** KEY: no big-bang REST bump — only the metafields GraphQL op is pinned to **2024-07** (REST stays 2024-01), so blast radius is small. OAuth scopes are now **env-backed** (`SHOPIFY_OAUTH_SCOPES`). ⏳ operational only: Partner-Dashboard scopes + set env + **store re-consent**. | ~1d + ops | Med (was High) — REST untouched; only re-consent friction remains |
| B. Provisioning | ✅ **DONE (seeded-map auto-enable + detection), gated/dormant.** The chicken-and-egg (no runtime handle for an un-provisioned attr) is resolved by a **seeded `name→handle` map** (`MetaobjectMappingApiConfig.standardHandlesByName`, loader reference-data): for a filled attr with no def, `type="shopify--"+handle` → `standardMetaobjectDefinitionEnable(type)` → **re-fetch defs** → enrich now includes it. Gated (map + enableMutation present + `write_metaobject_definitions` scope); per-type graceful (wrong/missing handle → enable userError → skip + logged). Attrs with no seeded handle stay in the detection WARN. Seed = only the VERIFIED `color→color-pattern`; extend from Shopify's product-taxonomy. | done | Med — seed map is hand-maintained; wrong handles fail gracefully |
| C. Capture (BFF) | ✅ **DONE (corrected).** Capture handle+type+metaobject_definition_id from **`metafieldDefinitions`** (NOT the taxonomy query — no `handle` field there) via `MetafieldDefinitionParser` name-join → `CachedAttributeField.handle/metafieldType/metaobjectDefinitionId`; config `metafieldDefinitionConfig`. Live fetch dormant until A. | ~done | Low |
| D. Value mapping (BFF) | ✅ **DONE (core).** `MetaobjectTaxonomyMapper.parse`+`translate` map TaxonomyValue GID → Metaobject GID via each metaobject's `*_taxonomy_reference`; config `metaobjectMappingConfig`. Pure + tested. Live fetch/cache dormant until A. | ~done | Med |
| E. Payload build (BFF) | ✅ **DONE.** `BUILD_METAFIELD_LIST` op + rule → `product.category_metafields`; live-staging wiring (`stageCategoryAttributes` → `GenericCategoryService.enrichCategoryMetafields` → C/D fetch + `CategoryMetafieldEnricher` join/translate). Gated + graceful; guard dropped ($metafields self-gates). Dormant until Area A operational. | done | Med |
| F. GraphQL op (BFF seed) | ✅ **DONE.** `set_category_metafields` op appended to `graphqlPostWriteWorkflow` + `product.category_metafields`/`category_attributes_sync` registered as SUPPORT fields. Seed-tested. Dormant until Area E staging fills them. | done | Low |
| G. Sync-service (separate Temporal repo) | `ON_GRAPHQL` must accept a **dynamic array** variable built from a support field (today variables are scalar templates); possibly a provisioning activity. Cross-repo coordination + deploy. | 3–5d | **High** — different repo; unknown current reshape capability |
| H. E2E test | Against a real store, per category. | 2–3d | Med |
| | **Total** | **~15–26d (3–5 weeks)** | |

### Value vs cost

- **Value:** richer Shopify listings (Fabric, Care instructions, … as real category metafields) → better
  on-Shopify filtering / discovery / SEO; Step-2 feature-complete. **But** listings publish fine WITHOUT
  them, and a merchant can set them by hand in the Shopify admin. Discoverability enhancement, not a
  listing blocker.
- **Cost:** 3–5 weeks across BFF + a separate sync-service repo, an apiVersion bump with broad blast
  radius, merchant re-consent for new scopes, and dependence on a still-evolving/under-documented Shopify
  surface (maintenance tax).

### Recommendation: **DEFER (soft no-go) for now**

Cost/complexity is disproportionate to the marginal value today. The high-value, low-cost Step-2 wins are
**already shipped** (dedup, data-driven MULTISELECT, pure-promote required, and — crucially — the save key
now equals the live attribute id, which keeps this door open at ~zero extra cost). Revisit when there is
explicit merchant demand for taxonomy-complete Shopify listings, and do it phased:

1. **Prerequisite task (independent value):** bump Shopify apiVersion to a supported version + add scopes,
   as a standalone hardening effort (not coupled to this feature).
2. **Phase 1:** attributes whose definitions already exist on the store (skip provisioning) — capture
   handle + map value + build op. Smallest slice that delivers real pushes.
3. **Phase 2:** auto-provisioning (enable definitions) + sync-service dynamic-array support.

If category metadata is a **strategic differentiator** for the product, treat it as a planned epic with
the estimate above rather than an incremental add-on.

---

## Area A — runbook operasional (langkah yang HARUS Anda lakukan)

> **Konteks.** Semua KODE (Area C/D/E/F + Area B) sudah selesai & **dorman**: tidak melakukan apa-apa sampai
> langkah di bawah beres. `apiVersion` **tidak perlu Anda sentuh** — panggilan GraphQL metafields sudah di-pin ke
> `2024-07` di kode (REST tetap 2024-01). Area A operasional = **scopes + re-consent** saja. Sifatnya **aman &
> bertahap**: kalau belum/half-done, fitur cuma tetap dorman (Shopify publish normal, tak ada yang rusak).

### Langkah 1 — Tambah 3 scope di Shopify Partner Dashboard
Buka app Shopify Anda di **partners.shopify.com → Apps → [app Anda] → Configuration → Admin API access scopes**,
tambahkan (selain scope lama):
```
read_metaobjects
read_metaobject_definitions
write_metaobject_definitions   ← untuk Area B auto-enable; tanpa ini auto-enable 403 → di-skip anggun
```
Save. (Kalau app-nya custom/dibuat di Admin, atur scope di tempat yang sama.) **Kenapa:** Shopify menolak
permintaan OAuth yang meminta scope yang tidak dideklarasikan app.

### Langkah 2 — Set env `SHOPIFY_OAUTH_SCOPES`
Scope OAuth sudah dibuat **env-backed**. Set env berikut (di **IntelliJ Run Config → Environment variables**
untuk dev, atau env prod — ini meng-override default YAML):
```
SHOPIFY_OAUTH_SCOPES=read_products,write_products,read_inventory,write_inventory,read_orders,read_locations,read_product_listings,read_metaobjects,read_metaobject_definitions,write_metaobject_definitions
```
(= daftar lama + 3 scope baru.) Pastikan `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` app yang benar juga ter-set.

### Langkah 3 — Restart aplikasi BFF
Agar env baru terbaca (`OAuthInitiationService` membangun authorize-URL dari scope ini).

### Langkah 4 — RE-CONSENT tiap store Shopify yang sudah terkoneksi
Token lama TIDAK punya scope baru — tiap store harus meng-approve ulang. Untuk tiap store:
1. Panggil: `GET /labamap/api/v1/oauth/initiate?channelType=shopify&organizationId=<org>&storeName=<nama>&shop=<toko>.myshopify.com`
2. Respons berisi `authorizationUrl` — buka URL itu di browser sebagai admin toko → **Approve**.
3. Shopify redirect ke `GET /labamap/api/v1/oauth/shopify/callback` → BFF menyimpan **token baru** (dengan scope baru).

### Langkah 5 — Verifikasi token benar-benar dapat scope baru
Jalankan GraphQL ini dengan token store (2024-07):
```graphql
{ currentAppInstallation { accessScopes { handle } } }
```
Pastikan `read_metaobjects`, `read_metaobject_definitions`, `write_metaobject_definitions` muncul.

### Langkah 6 — Live-verify (satu produk)
Publish satu produk apparel yang: (a) kategorinya ter-set (Step-2), (b) minimal 1 category attribute (mis. Color)
terisi. Cek:
- log BFF: `Category-metafield enrichment [... ] N attribute(s) → metafields` (dan/atau `Area B: enabling …`).
- produk di Shopify admin: metafield kategori (mis. Color) terisi.
- untuk attribute yang belum ada definisinya + **belum** ada di seeded handle map → muncul WARN "…need manual
  enable (Area B)"; enable manual di Shopify admin atau tambah handle terverifikasi ke `standardHandlesByName`.

### Degradasi anggun (kalau langkah tak lengkap)
| Kondisi | Perilaku |
|---|---|
| Env/scope belum di-set, store belum re-consent | fetch metafieldDefinitions 403 → enrichment kosong → stage base pairs → op `set_category_metafields` **di-skip** (aman, dorman) |
| Punya read_* tapi bukan `write_metaobject_definitions` | metafields untuk attr yang **sudah** ada definisinya tetap ter-push; auto-enable attr baru 403 → di-skip + WARN |
| Semua scope ada + re-consent | fitur aktif penuh (enrich + auto-enable + set metafields) |

> Setelah Langkah 1–5 beres di **satu sandbox store**, beri tahu saya → saya bantu **live-verify** (Langkah 6)
> dan menambah handle terverifikasi ke seed bila ada attribute yang perlu.