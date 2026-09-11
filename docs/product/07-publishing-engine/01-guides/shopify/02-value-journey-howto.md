# 02 — How a Shopify category attribute travels into the payload (perjalanan satu nilai)

> **STATUS (diperbarui bff-v20): DIIMPLEMENTASIKAN** (bukan lagi "DESIGN/DEFERRED"). Penjelasan tahap-demi-tahap
> satu nilai di bawah **masih akurat** untuk memahami mekanismenya. Yang sudah berubah jadi NYATA: rule
> `shopify-build-category-metafields` + op `set_category_metafields` **ada**; dan provisioning kini **otomatis**
> (write-through, tak perlu handle di-seed manual). Peta terkini: [01](01-category-attributes-write-through-generic.md)
> + Tahap [A](03-tahap-a-available-catalog.md)/[B](04-tahap-b-resolve-by-type.md)/[C](05-tahap-c-probe-enable.md).
> Go/no-go historis di [07](07-spike-and-go-no-go.md); perilaku form Step-2 di [19](../19-step2-category-attribute-fields.md).

Step-by-step explainer. Read this if you are asked to "make the Fabric / Care instructions / etc. values
actually reach Shopify" — reading it top to bottom makes the whole mechanism obvious.

---

## 0. Words used here (read once)

- **Live attribute** — a category attribute Shopify itself returns for a category (e.g. for *T-Shirts*:
  Fabric, Care instructions, Neckline, …). Fetched by our "Pipeline B" (`GenericCategoryService`).
- **TaxonomyValue** — an allowed value of a live attribute, e.g. Fabric → "Cotton", identified by
  `gid://shopify/TaxonomyValue/…`. This is what we store when the merchant picks a value.
- **Metaobject** — Shopify's *storage form* of a taxonomy value, identified by
  `gid://shopify/Metaobject/…`. Setting an attribute on a product means referencing metaobjects.
- **Category metafield** — how Shopify stores a taxonomy attribute value on a product: a normal product
  metafield in namespace `shopify`, key = the attribute **handle**, type `list.metaobject_reference`.
- **channelAttributes** — the flat list of `{attrId, chnlAttrName, chnlAttrValue, chnlAttrType,
  isSupportField}` our BFF builds and sends to the sync-service. The outgoing payload is built from this.
- **workaction / GraphQL op** — a metadata entry telling the sync-service to call a channel endpoint.
  A GraphQL op runs a mutation *after* the main product create.
- **Support field** — a `channelAttribute` flagged `isSupportField=true`: it is *plumbing* for a
  workaction (referenced via `${…}`), not a field of the REST product body.
- **Staging key** — a reserved key prefixed with `_` that post-processing rules read (e.g.
  `_categoryAttributes`). `buildChannelAttributes` strips `_` keys so they never leak into the payload.

---

## 1. There are TWO places a value can "end up" — pick the right one

| Destination                                                              | Built from                                                                              | A field lands here only if…                                                                    |
|--------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| **REST product body** (`create_CP` / `update_CP`, `products.json`)       | `transformedData` → `buildChannelAttributes`                                            | it sits at a real path in the channel's `apiSchema` (JOLT mapped it, or a rule wrote it there) |
| **GraphQL post-write** (`create_CP_Graphql`, runs after the REST create) | a separate array of GraphQL ops; each reads `channelAttributes` via `${…}` placeholders | you add an op whose mutation sets it                                                           |

**Why category attributes must use the GraphQL destination.** Shopify's REST `products.json` has no field
for taxonomy attributes — exactly like the taxonomy *category* itself, which we already set via GraphQL
(`productUpdate(input:{category})`). A post-processing rule writing to a "body" path would have nowhere
valid to write; the REST create would ignore it. So category attribute values go through the **same
GraphQL post-write channel** as `set_category`.

---

## 2. The journey of one value — slowly, stage by stage

```
Step 2 form          Publish pipeline (ChannelPublishService / engine)                    Sync-service
────────────         ────────────────────────────────────────────────                    ────────────
merchant picks   →   channelData["Fabric"] = ["gid://…/TaxonomyValue/16980"]
  a value            (saved keyed by the LIVE attribute id — see guide 19 pure-promote)
                        │
                        ▼  loadAndMergeChannelData()  (ChannelPublishService.java:818)
                     masterProductData["Fabric"] = [TaxonomyValue GID…]
                        │
                        ▼  stageCategoryAttributes()  (ChannelPublishService.java:1500)
                     _categoryAttributes = [ { id:"Fabric", value:[TaxonomyValue GID…] }, … ]
                        │   (reads the LIVE category schema; only attrs the merchant filled)
                        ▼  put into transformedData (a reserved "_" staging key)
                        │
                        ▼  genericPostProcessingEngine.process()  (ChannelPublishService.java:2212)
                     ┌── a post-processing RULE reads _categoryAttributes and writes a real field ──┐
                     │  Shopee analogue today: shopee-build-attribute-list                          │
                     │    _categoryAttributes → body field attribute_list                           │
                     │      (ChannelConfigurationDataLoader.java:2040)                               │
                     │  Shopify (IMPLEMENTED): shopify-build-category-metafields                     │
                     │    _categoryAttributes → SUPPORT field product.category_metafields            │
                     └──────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼  buildChannelAttributes()  (ChannelAttributeConverterService.java:402)
                     • SKIPS every key starting with "_"  (line 447-452)  →  _categoryAttributes never leaks
                     • EMITS product.category_metafields as a channelAttribute (isSupportField=true)
                        │
                        ▼  SyncChannelProductRequest { channelAttributes[], metadataGroups(workactions) }  ───►  executes workactions
                                                                                                                 GraphQL op resolves
                                                                                                                 ${product.category_metafields}
                                                                                                                 from channelAttributes,
                                                                                                                 runs productUpdate(metafields)
```

The single most important insight: **a `_`-staged value is invisible to the payload until a
post-processing rule copies it into a real (non-`_`) field.** For Shopee that real field is a body field
(`attribute_list`). For Shopify it is a **support field** (`product.category_metafields`) that only a
GraphQL op reads — because REST has no slot for it.

---

## 2A. Who builds `_categoryAttributes`? ONE generic function, ZERO per-channel code

Common confusion: "does `stageCategoryAttributes` have a Shopee branch, a Shopify branch, …?" **No.** It is
a single channel-agnostic function (`ChannelPublishService.java:1500`). It never mentions a channel name.
Here is the whole thing in plain steps (pseudo-code):

```text
// 1. Which category did the merchant pick? (native channel category id, staged in Step 2)
Object nativeCat = masterProductData.get("channelCategoryId");
if (blank) return {};                              // no category → nothing to stage

// 2. Ask for THAT category's LIVE attribute schema — same call for every channel.
CategoryAttributesResponse attrs =
    categoryCacheService.getCategoryAttributes(channelId, storeId, nativeCat, orgId);

// 3. Walk the live required + optional fields. Each field has a fieldName.
for (field f in attrs.requiredFields() + attrs.optionalFields()) {
    String attrId = f.getFieldName();              // <- whatever the LIVE schema calls it
    Object val    = masterProductData.get(attrId); // <- the value the merchant saved, keyed by that same name
    if (val present) pairs.add({ id: attrId, value: val });
}

// 4. Emit ONE uniform shape, identical for all channels.
return { "_categoryAttributes": pairs };           // [{id, value}, …]
```

That is the entire logic. It does not parse channel JSON, does not know GID formats, does not know Shopee
vs Shopify. It just: *"for every attribute the channel says this category has, if the merchant filled it,
emit `{id, value}`."*

### So where does the channel difference come from? Three data layers — no code branches.

**(a) How the attributes are fetched + parsed → `channel_category_api_config.attributeConfig` (DATA).**
`stageCategoryAttributes` calls `getCategoryAttributes`, which goes through `GenericCategoryService`
(`.mapToAttributeFields`, `GenericCategoryService.java:346`). That parser reads the channel's
`attributeConfig` — `urlPath`/`graphqlQuery`, `itemsJsonPath`, `idField`, `nameField`, `valuesField`,
`valueIdField`, `requiredField`, `choiceListFieldType` — and turns whatever shape the channel returns into
a **uniform** `CachedAttributeField {fieldName, fieldType, label, options, required}`. This is the
"pattern recognition", and it is entirely config-driven: to teach a new channel, you add a config row, not
Java. (See guide `07-data-driven-channel-config`.)

**(b) What `fieldName` actually IS → `attributeConfig.idField` (DATA).** Because the uniform shape's
`fieldName` = the channel's `idField`, the value staged in `{id, …}` is already the channel's own
identifier:

| Channel | `idField` (from attributeConfig) | example `fieldName` = staged `id` | value id form |
|---|---|---|---|
| Shopee | native `attribute_id` | `"200134"` | value_id (int) |
| Shopify | `name` | `"Fabric"` | `gid://…/TaxonomyValue/…` |
| eBay | `localizedAspectName` | `"Material"` | localizedValue (string) |

**(c) Whether `_categoryAttributes` is CONSUMED → a post-processing rule (DATA).** Producing the staging
key does nothing on its own — a per-channel **rule** must read it and write a real field:

| Channel | rule reading `_categoryAttributes` | writes to | lands in |
|---|---|---|---|
| Shopee | `shopee-build-attribute-list` (`ChannelConfigurationDataLoader.java:2040`) | body field `attribute_list` | REST body |
| Shopify | `shopify-build-category-metafields` (op `BUILD_METAFIELD_LIST`, IMPLEMENTED) | support field `product.category_metafields` | GraphQL op `set_category_metafields` |
| eBay / others | *(none)* | — | `_categoryAttributes` is staged then **dropped** by `buildChannelAttributes` (harmless no-op) |

So: **the producer is generic; the three per-channel behaviours are three pieces of data** (fetch config,
idField, consuming rule). This is the CLAUDE.md rule in action — behaviour lives in MongoDB config/rules,
not in `if (channel == …)` branches.

> **Honest caveat about the rule NAME vs the OP.** The rule *name* `shopee-build-attribute-list` is a pure
> data label — `GenericPostProcessingEngine` only reads `rule.getName()` for logging
> (`GenericPostProcessingEngine.java:89`); it dispatches on the **`op`** string
> (`switch(op)`, line 171), never on the name or channelType. **But** the op it dispatches to,
> `executeBuildAttributeList` (line 785), *bakes Shopee's output field names* (`attribute_id`,
> `attribute_value_list`, `value_id`) into the engine. So that op is not a channel branch, yet its output
> **shape** is Shopee-flavoured — a mild deviation from "fully data-driven". For Shopify, do **not** reuse
> it. Prefer making the op **parameterized** (output key names come from the `operation` config, e.g.
> `{idKey, valueListKey, …}`) so Shopee and Shopify share one op differing only by data — cleaner than
> adding a second baked-shape op like `BUILD_METAFIELD_LIST`.

### The one contract that makes it work

Step 3 matches values by `masterProductData.get(fieldName)`. So the merchant's saved value MUST be stored
under the **same key** the live schema uses (`fieldName` = `idField`). That is exactly why Shopify's
"pure-promote" (guide 19) matters: it makes the Step-2 save key equal the live attribute id (`"Fabric"`),
so `mpd.get("Fabric")` hits. Before pure-promote the value was saved under the overlay slug (`"material"`)
→ `mpd.get("Fabric")` missed → `_categoryAttributes` came out empty for that attribute. Same generic
function; the fix was aligning the data (the key), not the code.

---

## 3. How the metadata operates the GraphQL — anatomy of an op

The metadata is seeded by `ChannelMetadataMigration.graphqlPostWriteWorkflow()`
(`ChannelMetadataMigration.java:1506`) as a JSON **array of ops** stored under
`workaction#create_CP_Graphql` (and `update_CP_Graphql`). The sync-service runs each op after the REST
product upsert. Here is the *existing, working* `set_category` op, annotated — a new op copies its shape:

```jsonc
{
  "name": "set_category",
  "endpoint": {
    "url": "https://<shop>/admin/api/{apiVersion}/graphql.json",  // {apiVersion} substituted at run time
    "method": "POST",
    "action": "ON_GRAPHQL",                                        // tells sync: this is a GraphQL call
    "headers": { "X-Shopify-Access-Token": "<token>" }             // <token> resolved from the store credential
  },
  "graphql": {
    "query": "mutation SetProductCategory($id: ID!, $category: ID) { productUpdate(input:{id:$id, category:$category}) { product{ id } userErrors{ field message } } }",
    "variables": {
      "id":       "gid://shopify/Product/${product.id}",  // ${…} = a channelAttribute value, substituted by the sync
      "category": "${product.category}"
    },
    "nullableVariables": ["category"],           // if the template resolves empty → send JSON null (clears)
    "guard": "${product.category_sync}",          // op is SKIPPED unless this resolves non-empty
    "errorPaths": ["errors", "data.productUpdate.userErrors"]  // GraphQL returns 200 even on failure → check these
  }
}
```

How substitution works (the mental model):
- `${product.id}`, `${product.category}`, `${product.category_sync}` are **not** magic — each is the value
  of a `channelAttribute` whose `chnlAttrName` matches (`product.id`, `product.category`,
  `product.category_sync`). The sync does a string replace from that flat bag.
- `product.id` is captured by the REST create's response write-back (so the post-write op knows the new
  product GID). `product.category_sync` is a **support field** the BFF sets only when the category changed
  (`ChannelAttributeConverterService.java:159`) — that is how a `guard` makes an op conditional.

So "generating metadata to operate GraphQL" = **appending another op to that array**, whose `variables`
reference a channelAttribute we produced in Step 2 of section 2.

---

## 4. The category-metafields design (IMPLEMENTED — reference)

> Bagian ini awalnya "what to build later"; kini **sudah dibangun** (bff-v17 + write-through bff-v20). Dibaca
> sebagai **spesifikasi referensi** dari yang berjalan. Provisioning yang dulu "precondition" kini otomatis —
> lihat Tahap [C](05-tahap-c-probe-enable.md).

### 4.1 What Shopify requires (proven in the spike, [07](07-spike-and-go-no-go.md))

- Set the category first (already done by `set_category`).
- Each attribute value is a product metafield:
  - `namespace = "shopify"`
  - `key = the attribute HANDLE` (e.g. `color-pattern`, `fabric`) — **not** the display name.
  - `type = "list.metaobject_reference"` (choice lists; measurement attrs differ).
  - `value = a JSON array string of Metaobject GIDs`, e.g. `"[\"gid://shopify/Metaobject/286651941154\"]"`.
- **Precondition:** the attribute's metaobject definition + product metafield definition must already exist
  on the store; if not, enable them first (`standardMetaobjectDefinitionEnable(type:"shopify--<handle>")`).

### 4.2 The build rule — `shopify-build-category-metafields`

A post-processing rule, sibling of Shopee's `shopee-build-attribute-list`, but targeting a **support
field** instead of a body field:

- `sourcePath: "_categoryAttributes"`
- `targetPath: "product.category_metafields"`
- op (new): `BUILD_METAFIELD_LIST` — for each staged `{id, handle, type, values[]}` emits
  `{ namespace:"shopify", key:<handle>, type:<type>, value: JSON.stringify(metaobjectGids) }`.

For this rule to have what it needs, `stageCategoryAttributes` must be enriched to stage per attribute:
`handle`, `type`, and the **Metaobject GIDs** (see 4.3), not just `{id, value}`.

### 4.3 Mapping TaxonomyValue → Metaobject (deterministic)

We store TaxonomyValue GIDs; Shopify wants Metaobject GIDs. The link is deterministic: each standard
metaobject carries a `*_taxonomy_reference` field holding its TaxonomyValue GID(s). Example from the spike
— metaobject "Black" (`gid://shopify/Metaobject/286651941154`) has
`color_taxonomy_reference = ["gid://shopify/TaxonomyValue/1"]`.

So the mapping step (cacheable, per attribute definition): read the attribute's metaobject definition's
metaobjects once, build `TaxonomyValue GID → Metaobject GID`, then translate the merchant's picks. The
metaobject definition id comes from the metafield definition's
`validations.metaobject_definition_id`.

### 4.4 The op — `set_category_metafields` (append to `graphqlPostWriteWorkflow`)

```jsonc
{
  "name": "set_category_metafields",
  "endpoint": { "url": "https://<shop>/admin/api/{apiVersion}/graphql.json", "method": "POST",
                "action": "ON_GRAPHQL", "headers": { "X-Shopify-Access-Token": "<token>" } },
  "graphql": {
    "query": "mutation($id: ID!, $mf: [MetafieldInput!]!) { productUpdate(input:{id:$id, metafields:$mf}) { product{ id } userErrors{ field message } } }",
    "variables": {
      "id": "gid://shopify/Product/${product.id}",
      "mf": "${product.category_metafields}"     // the support field built by the rule (a JSON array)
    },
    "guard": "${product.category_attributes_sync}",   // support field: non-empty only when ≥1 attr filled
    "errorPaths": ["errors", "data.productUpdate.userErrors"]
  }
}
```

> ✅ **RESOLVED (sync temp-v3, 2026-09-04).** The array-valued variable dependency is done: `Graphql_CP.executeOneOp`
> now coerces a resolved variable whose value starts with `[`/`{` into a real `JsonNode` (via `coerceStructured` →
> `objectMapper.readTree`) before putting it in `variables` — so `$mf` sent as a JSON **array**, not a string. Scalars
> (`gid://…`, ids) don't start with those and stay strings, so `set_category` and every existing op are byte-for-byte
> unchanged. Generic (no channel/op knowledge). Test: `GraphqlCoerceStructuredTest` (5). So the only remaining work for
> `$mf` is the BFF side: build the `product.category_metafields` JSON-array support field (Areas C–F).

### 4.5 The provisioning op (Area B) — ⚠️ BLOCKED for auto-enable; DETECTION shipped

Intended: before `set_category_metafields`, for each attribute the store hasn't used yet, run
`standardMetaobjectDefinitionEnable(type:"shopify--<handle>")` (needs `write_metaobject_definitions`).

**Blocker (verified):** that mutation needs the metaobject-definition **type** `shopify--<handle>`, but an
un-provisioned attribute has **no runtime source for its handle** — the taxonomy node exposes only `id`+`name`,
the handle only appears in `metafieldDefinitions` for attrs that are *already* provisioned, and there is **no
confirmed Shopify query** that lists available/not-yet-enabled standard definitions by taxonomy attribute. So
proactive auto-enable is chicken-and-egg; lazy-retry never triggers because the enricher already excludes
un-provisioned attrs (so `set_category_metafields` never references a missing key → no userError to catch).

**Shipped — seeded-map auto-enable + detection (bff-v17):** the chicken-and-egg is resolved with a SEEDED
`name→handle` map (`MetaobjectMappingApiConfig.standardHandlesByName`). Flow in `enrichCategoryMetafields`: fetch
defs → `CategoryMetafieldEnricher.unprovisioned` (filled attrs with no def) → `provisioningTypes` maps each to
`type="shopify--"+handle` via the seed → `standardMetaobjectDefinitionEnable(type)` per type (graceful) → **RE-FETCH
defs** → `continueEnrich` (now includes the enabled attrs). Gated (map + `enableMutation` present + the
`write_metaobject_definitions` scope, Area A); a wrong/missing handle fails gracefully (enable userError → skip),
and attrs with no seeded handle stay in the detection WARN for a manual enable. Seed = only the VERIFIED
`color→color-pattern` (guide-20 spike); **extend from Shopify's published product-taxonomy** as handles are confirmed.
Tests: `CategoryMetafieldEnricherTest` (`unprovisioned`, `provisioningTypes`). Dormant until Area A (write scope).

---

## 5. Implementation checklist (maps to guide-20 estimate)

1. **Scopes + apiVersion** — 🟡 **Area A step-1 code DONE (bff-v17):** avoided the big-bang REST bump — the
   `set_category_metafields` GraphQL op is **pinned to 2024-07** (REST create/update + `set_category` stay 2024-01,
   dodging the 2024-07+ REST Product-API deprecation); the Area C/D read configs already use 2024-07. Shopify OAuth
   scopes are now **env-backed** (`SHOPIFY_OAUTH_SCOPES`, default = current set) so prod adds `read_metaobjects,
   read_metaobject_definitions` without a code change. ⏳ **Operational (not code):** add those scopes in the Shopify
   Partner Dashboard + set the env; **each connected store must RE-CONSENT** to gain them. (+ `write_metaobject_definitions`
   only for Area B auto-provisioning.)
2. **Capture handle + metaobject_definition_id** — ✅ **DONE (Area C, corrected — bff-v17).** ⚠️ **Correction to
   the original design:** the taxonomy attribute node (`TaxonomyChoiceListAttribute`) exposes only `id`+`name` —
   **there is NO `handle` field** (verified against the live schema). So the handle/type/metaobject_definition_id do
   **not** come from the taxonomy query; they come from **`metafieldDefinitions(ownerType:PRODUCT, namespace:"shopify")`**
   (`key`=handle, `type.name`, `validations[metaobject_definition_id]`), joined to each attribute **by display name**.
   Implemented: `CachedAttributeField.handle/metafieldType/metaobjectDefinitionId`;
   `ChannelCategoryApiConfig.metafieldDefinitionConfig` (Shopify seed, data-driven paths); pure
   `MetafieldDefinitionParser.parse`+`enrich` (name-join, case-insensitive) with tests. `metafieldDefinitions` only
   lists attributes whose definitions ALREADY exist on the store = exactly Phase-1 scope (unmatched attrs stay null →
   skipped). The live FETCH is dormant until Area A (needs apiVersion 2024-07+ + `read_metaobject_definitions`). (Area C)
3. **Value-mapping** — ✅ **DONE (Area D core, bff-v17):** `MetaobjectTaxonomyMapper.parse` builds
   `TaxonomyValue GID → Metaobject GID` from a metaobject definition's metaobjects (each metaobject's
   `*_taxonomy_reference` field), and `.translate` maps the merchant's picks (drops unmapped, dedups). Config
   `ChannelCategoryApiConfig.metaobjectMappingConfig` + Shopify seed; pure + tested
   (`MetaobjectTaxonomyMapperTest`). The live FETCH (per metaobject definition id from Area C) + cache is dormant
   until Area A. (Area D)
4. **Build rule** — ✅ **DONE (Area E core, bff-v17):** parameterized `BUILD_METAFIELD_LIST` op (output keys from
   config, NOT baked) + `shopify-build-category-metafields` rule (`_categoryAttributes` → SUPPORT field
   `product.category_metafields = [{namespace, key:<handle>, type, value:"[gid,…]"}]`). Skips an attribute with no
   handle/type/GIDs → Phase-1; **dormant with today's `{id,value,hasOptions}` staging** (emits nothing until enriched).
   Golden test `ShopifyCategoryMetafieldsRuleTest`. ✅ **Live-staging wiring DONE (bff-v17):**
   `stageCategoryAttributes` now calls `GenericCategoryService.enrichCategoryMetafields` (gated on
   `metafieldDefinitionConfig`, graceful → base pairs on any error/403) which fetches the store's metafield
   definitions (Area C) + each matched attr's metaobjects (Area D) and joins/translates via the pure
   `CategoryMetafieldEnricher` → `_categoryAttributes=[{id,handle,type,values:[Metaobject GID]}]`. The redundant
   `guard` was REMOVED — the non-nullable `$metafields` variable self-gates (Graphql_CP skips when absent), so the
   never-set `category_attributes_sync` guard/field is gone. Tests: `CategoryMetafieldEnricherTest`. **Dormant until
   Area A operational** (a store without the metaobject scopes 403s → graceful no-op → stages base pairs → op skipped). (Area E)
5. **Seed the op** — ✅ **DONE (Area F, bff-v17):** `set_category_metafields` appended to `graphqlPostWriteWorkflow`
   (after `set_category`): `productUpdate(input:{id, metafields:$metafields})`, `$metafields:[MetafieldInput!]!` =
   `${product.category_metafields}` (the sync coerces it to a real array — step 1), guard
   `${product.category_attributes_sync}`, same `errorPaths`. Registered `product.category_metafields` (object[]) +
   `product.category_attributes_sync` (string) as SUPPORT fields (out of the REST body, available to the op). Dormant
   until Area E's staging fills them → Shopify publish unaffected today. Seed test `ShopifyCategoryMetafieldsSeedTest`.
   (+ optional provisioning op = Area B.) (Area F)
6. **Sync-service**: array-valued GraphQL variable — ✅ **DONE** (`Graphql_CP.coerceStructured`, temp-v3); optional provisioning activity remains. (Area G)

---

## 6. Worked example — publishing Fabric = "Cotton"

```
merchant picks Fabric = Cotton
  channelData["Fabric"] = ["gid://shopify/TaxonomyValue/16980"]        (16980 = Cotton, from the live schema)
        │
stageCategoryAttributes (enriched)
  _categoryAttributes = [ { id:"Fabric", handle:"fabric", type:"list.metaobject_reference",
                            values:["gid://shopify/TaxonomyValue/16980"] } ]
        │
value-mapping (fabric metaobject definition: TaxonomyValue/16980 → Metaobject/NNN)
        │
shopify-build-category-metafields  →  product.category_metafields (support field) =
  [ { "namespace":"shopify", "key":"fabric", "type":"list.metaobject_reference",
      "value":"[\"gid://shopify/Metaobject/NNN\"]" } ]
        │
buildChannelAttributes  →  channelAttribute { chnlAttrName:"product.category_metafields",
                                              chnlAttrValue:<the JSON above>, isSupportField:true }
        │
set_category_metafields op  →  productUpdate(input:{ id:<product GID>, metafields:$mf })   ✅ set on Shopify
```

---

## 7. Code pointers

- Payload has two destinations; REST body skips `_` keys: `ChannelAttributeConverterService.java:402,447`.
- Category-attribute staging (`_categoryAttributes`): `ChannelPublishService.java:1500`.
- Staging merged into `transformedData`, then post-processing: `ChannelPublishService.java:2178,2212`.
- Shopee analogue rule (`_categoryAttributes` → `attribute_list`): `ChannelConfigurationDataLoader.java:2040`.
- GraphQL post-write ops (`set_category`, where a new op goes): `ChannelMetadataMigration.java:1506`.
- Conditional-op support field example (`category_sync`): `ChannelAttributeConverterService.java:159`.
- Spike findings + go/no-go (namespace/key/type/value/provisioning): [07](07-spike-and-go-no-go.md).
- Write-through provisioning otomatis (handle catalog + enable on-demand): Tahap [A](03-tahap-a-available-catalog.md)/[B](04-tahap-b-resolve-by-type.md)/[C](05-tahap-c-probe-enable.md).
- Step-2 form behaviour + why the save key already equals the live attribute id: [19](../19-step2-category-attribute-fields.md).
