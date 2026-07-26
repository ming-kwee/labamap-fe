# JOLT Publish Correctness — Deep Dive

**Status:** Implemented on branch `bff-v8` (9 commits, `d4945fd` … `98c0295`)
**Scope:** Why a "successful" Shopify publish silently corrupted the product title, the full chain
of root causes behind it, and the layered fixes that now prevent it — end to end.
**Audience:** Backend engineers working on the publish pipeline, JOLT specs, the adaptive-pattern
(APM) / LLM agent, and the Step-1/Step-2 form schema.

---

## 1. The symptom

A merchant published a simple apparel product (2 SKUs: Size × Color, all Black) to Shopify. The
publish reported **success**, but the product title on Shopify became **"Size"** instead of the real
name **"test 1"**. Data corruption, silently, with no error.

Earlier, the same flow also produced **false Step-2 warnings** and a **disabled/empty `material`
column** in the Step-1 variant editor. These turned out to share a common theme with the title bug:
**runtime code making decisions from hardcoded field-name literals instead of the canonical data.**

---

## 2. The one-paragraph explanation

The publish pipeline transforms the master product into the channel shape using a **JOLT spec**
selected per `(channel, category, org)`. For this product, three independent defects lined up: (a) the
frontend does not send `productTypeId`, so the backend could not resolve the category and fell back to
the generic `"default"`; (b) a **spec-priority bug** made an org-specific `"default"` spec outrank the
correct system `"clothing"` spec; and (c) the fallback ultimately used `request.joltSpec` (an
AI-generated spec supplied by the frontend) **without any semantic validation** — and that spec had a
**scrambled mapping** (`option1_name → product.title`), so the axis name "Size" was written into the
title. Each defect is independently fixable; together they produced silent corruption.

---

## 3. Background — how a publish actually works

```
PublishProductRequest (from frontend)
   masterProductData  ← the data to publish (frontend-supplied, NOT loaded from the stored master)
   masterProductId, storeId, channelId, organizationId, categoryId?, joltSpec?, dryRun

ChannelPublishService.publishProduct
   1. resolve store + decrypt credentials
   2. loadAndMergeChannelData      → merge Step-2 channelData into masterProductData
   3. ensureProductTypeId          → (NEW) backfill productTypeId from stored master if missing
   4. injectProductTypeVariantDimensions
   5. runPreflightGate             → block on merchant-fixable missing fields
   6. executePublish
        categoryResolver.resolveForPublish(categoryId, masterProductData)   → categoryId
        findJoltSpecWithFallback(channel, categoryId, org)                  → stored spec (or none)
        processPublish
            pick spec: stored (category-aware) > request.joltSpec
            JoltSemanticValidator.validate(spec)   → (NEW) block on semantic scramble
            JoltTransformationService.transform(masterProductData, spec)
            post-processing rules
            ChannelAttributeConverterService → SyncChannelProductRequest
            → POST /sync_channel_product_impl   (skipped when dryRun)
```

Key facts that matter later:

- **`masterProductData` is caller-supplied.** The backend does not load the stored master into it; it
  only merges Step-2 data. So whatever the frontend sends is what JOLT transforms.
- **The converter auto-enumerates JOLT output.** `ChannelAttributeConverterService` emits a
  `channelAttribute` for every `product.*` field the JOLT produced; `attributeMappings` is a sparse
  override only. So if `product.title` is absent from JOLT output, it is absent from the payload — the
  converter does not drop it, JOLT never produced it.

---

## 4. Root-cause chain (title corruption)

### 4.1 The JOLT spec was scrambled

The spec actually used mapped:

```
option1_name → product.title            (option1_name value = "Size")   ❌
name         → product.options[&1].name (name value = "test 1")         ❌
```

`product-title` and `option-name` were **swapped**. `title` became "Size"; the real name "test 1" was
routed into the option-name slot and then lost. The mapping was **structurally valid** (compiled fine,
no target conflict) — only **semantically** wrong. No structural check catches this.

### 4.2 Why that spec was used at all (the fallback chain)

1. The frontend's publish payload has **no `productTypeId` and no `category`** (`masterDetailToProduct`
   omits it; `PublishDashboard` deliberately does not send `categoryId`).
2. → `resolveForPublish` cannot derive the category → falls back to **`"default"`**.
3. → No stored `shopify/default` spec exists → `categoryJoltSpec == null`.
4. → `processPublish` falls back to **`request.joltSpec`** — the AI-generated spec from the frontend's
   analyze step — and uses it **raw, unvalidated**.

### 4.3 The priority bug (an adjacent, real defect)

`calculatePriority` weighted **org-specificity (+20) above category-exactness (+10)**:

```
org  + "default"  category = 5 (default) + 20 (org)    = 25   ← WON
system + "clothing" category = 10 (exact) + 10 (system) = 20
```

So even when a `"clothing"` category *was* resolved, an org-specific `"default"` spec (produced by the
auto-recovery agent — see §4.4) could outrank the correct system `"clothing"` spec. This dropped the
clothing-only attributes (`material`, `size_type`, `care_instructions`) too.

### 4.4 Where the org `"default"` spec came from (self-reinforcing loop)

The org-specific `"default"` spec was **not** created by the merchant running analyze — merchants
don't. It was created by **auto-recovery**: on a failed publish, `ChannelPublishService` triggered
`JoltGenerationAgentService.generateJoltSpec(..., orgId)`, which **learns a spec from the failing
sample** and persists it org-scoped, keyed to whatever category was resolved (often `"default"`).
Timeline proved it: sync failed at 14:52:12; the org `"default"` spec was rewritten by `ai-agent-v1` at
14:53:06 — one minute later.

This created a loop: publish fails → auto-recovery writes an org `"default"` catch-all → priority bug
makes it win → next publish uses the wrong spec → fails again → …

### 4.5 The APM matcher is only *partially* correct-by-construction

The console/analyze path uses APM (`KnowledgeBasedFieldMatchingService`) + a deterministic builder, not
a raw LLM. APM's **semantic tier** only pairs fields with the **same semantic type**, so it would never
emit `option1_name → title`. **But** APM also has fuzzy tiers (alias/pattern/keyword, 50-80%) that match
on string similarity **without** a semantic constraint — `name` ≈ `options.name` (keyword) can slip
through. And the LLM enrichment persists learned mappings that the heuristic later reuses. So **no
generation path is fully safe**, and `request.joltSpec` bypasses all of them.

---

## 5. The theme behind everything: no hardcoded domain knowledge at runtime

This session's bugs were all instances of one anti-pattern: **runtime code branching on literal
field-name substrings** instead of reading the canonical data. Documented as a project rule in
`CLAUDE.md`. Canonical sources:

| Decision | Source of truth (data) |
|---|---|
| Is a field a variant axis / variant-scoped? | `ecommerce_master_attributes.group` (`VARIANT`/`ATTRIBUTE`/`OPTION`) |
| A product's real SKU axes | `product_types.variantDimensions` |
| Semantic role of a field name (name/price/qty…) | `field_semantic_knowledge` (semanticType + aliases) |
| Which attribute names a channel/category expresses as options | `channel_category_api_config…variantOptionAttributeNames` |

The `material` ghost column and the false axis warnings were the same class of bug in the form-schema
path (see §7).

---

## 6. The fixes (layered defense)

Nine commits, grouped by what they defend.

### 6.1 Right spec gets resolved

- **`2cf8a3e` — priority fix.** Category specificity is now the **primary** key (exact +100, default
  +50), ownership **secondary** (org +20, system +10). The category gap (50) exceeds the max ownership
  bonus (20), so category can never be overridden. Restores the documented order:
  `org+exact (120) > system+exact (110) > org+default (70) > system+default (60)`.
- **`f9051d1` — dedup.** The same scoring lived in two places under different conventions (publish:
  higher=better; analyze: penalty + `.min`). Unified into `ChannelJoltSpec.resolutionPriority` (one
  source of truth). *Not a behavior change* — both already produced the correct order — but removes
  drift risk.
- **`a494a6d` — backfill productTypeId (Option B).** Before category resolution, if the request lacks
  `productTypeId`, load it from the **stored master** (by `masterProductId`) and inject it, so category
  resolves to `"clothing"` and the correct stored spec is chosen instead of falling back to
  `request.joltSpec`. **Gated**: no DB read when `productTypeId` is already present; otherwise one
  indexed `findById`. Fail-safe: any load error leaves the request unchanged.

### 6.2 Bad spec doesn't get created

- **`c272ea8` — tighten auto-recovery.** Two guards at `JoltGenerationAgentService.autoApply` (the
  persist choke-point): (1) refuse to auto-apply an **org-specific spec for the generic `"default"`
  category** (`SKIPPED_UNRESOLVED_CATEGORY`) — system defaults still allowed; (2) never **downgrade** —
  skip when an existing spec's confidence ≥ the regenerated one (`SKIPPED_NOT_BETTER`), breaking the
  regenerate→fail→regenerate loop. The publish trigger also now requires a resolved category before
  spending an LLM call.

### 6.3 Scrambled spec doesn't get used (the core safety net)

- **`9df6f38` — semantic validator.** `JoltSemanticValidator` re-applies the "same semantic type"
  rule that makes the APM semantic tier correct — but as a **post-hoc guard on the final spec**,
  sourced from `field_semantic_knowledge` (cached at startup). Enforced in `ChannelPublishService`
  **before transform**, for **every spec source** (stored + `request.joltSpec`). On a confident
  violation the publish is **refused** (HTTP 400) rather than writing corrupt data.
  Accompanied by `OptionNameSemanticKnowledgeMigration` seeding an `OPTION_NAME` type for
  `option{n}_name`, so `option1_name → product.title` reads as `OPTION_NAME → PRODUCT_NAME` and is
  caught.
- **`9c6b7a2` — gate LLM auto-apply on the validator.** The agent runs the validator alongside its
  conflict/compile checks; a scrambled spec is downgraded to review instead of auto-persisted — so it
  never reaches storage. (Publish-time guard remains the backstop.)
- **`d8c7d84` — path-aware target typing.** `classifyTarget` strips array indices and resolves the type
  by the **container-qualified token** (last two segments, e.g. `options.name`) before the bare leaf.
  This disambiguates the context-sensitive leaf `name` (PRODUCT_NAME at `product.title`, OPTION_NAME at
  `product.options[].name`) and lets array/variant-scoped targets be validated too.
- **`98c0295` — recurse into nested subtrees.** `validate()` originally only checked **top-level**
  String entries, so the nested variant subtree real specs use — `variants:{"*":{price: …}}` — was
  skipped. Now it walks the shift spec recursively, tracking the source field across JOLT structural
  keys (`*`, `@`, `&…`, `$…`), so a scramble inside a variant/media block is caught too.

### 6.4 Form-schema correctness (the adjacent bugs)

- **`d4945fd` — data-driven axis classification + `material` → product-level.**
  - `VariantAxisResolver` dropped its `VARIANT_METADATA_KEYS` **denylist** (which mis-classified any
    unlisted per-variant field — `variantImages`/`costPrice`/`inventory` — as a spurious axis, causing
    the false `NOT_EXPRESSIBLE_ON_CHANNEL` warnings). It now classifies positively via
    `MasterAttributeSchemaService.isVariantField` (`group=VARIANT`).
  - `MasterAttributeSchemaService` builds its variant-field cache from `group=VARIANT` (canonical)
    instead of the `attributeType==Enum` heuristic (which silently dropped `dataType="Select"` fields —
    the `material` case-sensitivity bug); removed the hardcoded `isCommonVariantField`/
    `looksLikeVariantField` vocabularies; removed the dead, hardcoded domain filter.
  - `material` reclassified to product-level (`group=ATTRIBUTE`, `variantScope=product_only`) via
    `MaterialProductLevelReclassificationMigration` — it's a product spec, not a per-SKU axis (matching
    real Shopify), which removes the disabled/empty ghost column. It stays promotable to an axis
    per-product via `product_types.variantDimensions`.

---

## 7. The `material` ghost column (worked example of §5)

Three independent definitions shared the token `"material"`:

1. **Master attribute** — `group=VARIANT`, `variant_only`, `Select` (13 options).
2. **Category requirement** (clothing slug) — a product-level **required** field.
3. **Channel axis whitelist** — Shopify: *not* in `variantOptionAttributeNames`; Shopee: *is*.

`material` was classified variant **only** via the hardcoded `isCommonVariantField("material")` (the DB
`dataType` was `"Select"`, and the cache builder's case-sensitive `"select"` check never matched — so
it was never in the data-driven cache). Because it was variant-scoped but **not** in the product type's
`variantDimensions`, the Step-1 editor rendered it as a disabled, empty ghost column. Reclassifying it
product-level (data) fixed it structurally. **Note:** the earlier hypothesis that a
`conditionalVisibility: {behaviour: "disable"}` rule caused this was **wrong** — that rule existed only
in the stale seed JSON, not in the live DB. Verified against Atlas.

---

## 8. Verification (all end-to-end, dry-run — no live Shopify calls)

Method: capture the bug on the running (old) instance, then run the rebuilt binary on a separate port
against the same Atlas DB, driving the real HTTP publish endpoint with `dryRun:true` (runs JOLT +
validation, skips the channel call).

| Scenario | Result |
|---|---|
| Baseline (old binary): variants carry variantImages/costPrice/inventory | 3 false `NOT_EXPRESSIBLE` warnings (reproduced) |
| Fixed: same product, Step-2 | 0 axis warnings; `variantAxes=[size,color]` |
| Step-1: `material` after cache clear | `variantScope=product_only`, out of variant columns, still a SELECT with 13 options |
| Publish: `name` under `name` key + clothing spec | `product.title = "test 1"` ✅ |
| Publish: name under `title` key (no `name`) | `product.title` absent — proved the key-mismatch class |
| Publish, scrambled `option1_name→product.title` (request.joltSpec) | **HTTP 400 blocked**: `'option1_name' [OPTION_NAME] → 'product.title' [expects PRODUCT_NAME]` |
| Publish, correct `name→product.title` | HTTP 200, no false positive |
| Publish, `name→product.options[].name` (other scramble half) | **400 blocked** (path-aware) |
| Publish, `price→variants[].inventory_quantity` (variant scope, request.joltSpec, forced) | **400 blocked** (nested recursion): `'price' [PRICE] → … [expects QUANTITY]` |
| Publish, no productTypeId + no joltSpec | resolves `categoryId=clothing`, uses stored `shopify/clothing` spec, HTTP 200 (Option B) |
| Publish, real stored clothing spec (nested variant subtree) | HTTP 200, no false positive |

Unit tests: `JoltSemanticValidatorTest` (12), `ChannelPublishServiceJoltPriorityTest` (4),
`JoltGenerationAutoApplyTest` (4, incl. the two new guards), `VariantAxisResolverTest` (22).

---

## 9. The semantic validator in detail

**File:** `adaptivepattern/service/JoltSemanticValidator.java`

- **Source of truth:** `field_semantic_knowledge` (fieldName + aliases → `semanticType`), loaded into
  an in-memory cache at `ApplicationReadyEvent`.
- **What it checks:** every `sourceField → targetPath` String leaf in a shift spec (flat and nested).
- **Target typing is path-aware:** strip `[…]` indices, then try the container-qualified token
  (`options.name`) before the bare leaf (`name`).
- **When it flags:** only when **both** the source field and the target resolve to a **KNOWN** semantic
  type and those types **differ** ("confident mismatch").
- **Enforcement:**
  - Publish (`ChannelPublishService`, before transform) → **refuse to publish** (backstop for all
    sources).
  - Generation (`JoltGenerationAgentService.routeResult`) → **downgrade to human review** (keeps bad
    specs out of storage).

### Deliberate limitations (trade-offs, not oversights)

- **Fail-open on empty cache.** If `field_semantic_knowledge` fails to load, everything is UNKNOWN and
  nothing is blocked. Safe default for a guard; worth monitoring the startup "loaded N tokens" log.
- **UNKNOWN never triggers.** Fields not in the knowledge base (size, color, custom fields) are not
  validated → **zero false positives**, but a scramble involving an unknown field (e.g. `size → price`)
  can pass. Chosen: never wrongly block a legitimate publish > catch every conceivable scramble.
- **Lists (multi-target fan-out) are out of scope.**
- **Confidence threshold not yet applied** — a KNOWN type is treated as certain regardless of
  `baseConfidence`.

---

## 10. Remaining open items

- **`isJoltRelatedError` is a substring heuristic** (`contains("field"|"required"|"missing"|…)`) — the
  auto-recovery trigger still guesses from the failure string. A robust fix needs structured error
  codes from the sync API. Mitigated for now by the resolved-category gate.
- **Tier C hardcoding** (§5) in external-schema heuristics —
  `ChannelSchemaService`/`ComplexSchemaService`/`SchemaFlattenerService`/`DataDrivenSchemaGenerationService`
  still infer types from name substrings. Should be centralized behind a `field_semantic_knowledge`-backed
  classifier. Not started.
- **Form-schema cache is productType-keyed and persisted** — after the `material` migration, the
  Step-1 cache must be cleared (`DELETE /api/v1/ecommerce/form-schema/cache/product-type/{id}`) for the
  change to surface. Operational, not code.
- **Semantic validator confidence threshold** and **list-target handling** (§9).
- **Frontend note** (`docs/product/02-ecommerce-wizard/01-guides/19-frontend-note-variant-axis-and-material.md`)
  and several pre-existing docs remain uncommitted; nothing has been pushed.

---

## 11. Commit index (branch `bff-v8`, on top of `897eef1`)

| Commit | Summary |
|---|---|
| `d4945fd` | data-driven variant-axis classification; `material` → product-level (+ Tier A/B de-hardcoding) |
| `2cf8a3e` | JOLT spec priority — category-exact outranks org-specific "default" |
| `c272ea8` | tighten JOLT auto-recovery (no per-org "default" catch-alls, no downgrade) |
| `f9051d1` | unify JOLT resolution priority into one canonical method |
| `9df6f38` | semantic guard blocks JOLT specs that scramble field mappings (publish) |
| `9c6b7a2` | gate LLM auto-apply on the semantic validator |
| `d8c7d84` | path-aware target typing in the semantic validator |
| `a494a6d` | backfill productTypeId from stored master (correct category spec) |
| `98c0295` | semantic validator recurses into nested shift subtrees |

---

## 12. Key files

| File | Role |
|---|---|
| `publishing/service/ChannelPublishService.java` | publish pipeline; spec resolution + priority; semantic-validate before transform; backfill productTypeId |
| `adaptivepattern/service/JoltSemanticValidator.java` | the semantic guard (cache + recursive, path-aware validate) |
| `adaptivepattern/service/JoltGenerationAgentService.java` | LLM auto-apply; tightened guards + semantic gate |
| `adaptivepattern/model/entity/ChannelJoltSpec.java` | `resolutionPriority` (canonical scoring) |
| `adaptivepattern/command/impl/AdaptivePatternMatchingCommandImpl.java` | analyze/generate-jolt (APM + deterministic builder) |
| `config/OptionNameSemanticKnowledgeMigration.java` | seeds `OPTION_NAME` (source aliases + path-qualified target tokens) |
| `config/MaterialProductLevelReclassificationMigration.java` | `material` → product-level |
| `ecommerce/channelproduct/service/VariantAxisResolver.java` | positive axis classification (no denylist) |
| `ecommerce/service/MasterAttributeSchemaService.java` | `group=VARIANT` cache; de-hardcoded |
| `CLAUDE.md` | the "no hardcoded domain knowledge at runtime" rule |
