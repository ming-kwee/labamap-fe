# Business Rules — Overview

Module: `src/modules/ecommerce-business-rules/`
Route: `/business-rules`

---

## What are business rules?

Business rules are server-side rules stored in MongoDB that run against product data during the Step 1 submission pipeline. They are managed by platform admins at `/business-rules` — merchants never see or configure them.

There are three rule types, executed in this order during product creation:

| Type | `ruleType` | Purpose | When it runs |
|------|-----------|---------|-------------|
| Pre-processing | `PRE_PROCESSING` | Transform data before validation (auto-generate SKU, normalize names, format prices) | Step 1 in submit pipeline |
| Business logic | `BUSINESS_LOGIC` | Validate data against organization rules (price ranges, SKU patterns, cross-field checks) | Step 2 in submit pipeline |
| Data enhancement | `DATA_ENHANCEMENT` | Enrich product data after validation (suggest tags, add category hierarchy, SEO optimization) | Step 3 in submit pipeline |

Rules within each type execute in ascending `priority` order (lower number = runs first).

---

## Rule definitions

Each `BusinessRule` document can carry sub-rule arrays depending on its `ruleType`:

**`validationRules[]`** — used by `BUSINESS_LOGIC` rules

```typescript
{
  field:    "price",
  operator: "GREATER_THAN",
  value:    0,
  message:  "Price must be positive",
  severity: "ERROR"    // ERROR | WARNING | INFO
}
```

Operators: `GREATER_THAN`, `LESS_THAN`, `EQUALS`, `NOT_EQUALS`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`, `MIN_LENGTH`, `MAX_LENGTH`, `LENGTH_BETWEEN`, `REGEX`, `NOT_REGEX`, `REQUIRED`, `NOT_NULL`, `IN`, `NOT_IN`, `CONTAINS`, `NOT_CONTAINS`

**`transformationRules[]`** — used by `PRE_PROCESSING` rules

```typescript
{
  field:          "name",
  transformation: "CAPITALIZE",
  order:          1,
  parameters?:    { ... }
}
```

Transformations: `UPPERCASE`, `LOWERCASE`, `CAPITALIZE`, `TRIM`, `TRIM_START`, `TRIM_END`, `ROUND`, `FORMAT_DATE`, `REMOVE_SPECIAL_CHARS`, `REPLACE`, `CONCATENATE`

**`enhancementRules[]`** — used by `DATA_ENHANCEMENT` rules

```typescript
{
  field:       "tags",
  enhancement: "AUTO_GENERATE_TAGS",
  source?:     "description",
  parameters?: { ... }
}
```

Enhancements: `AUTO_GENERATE_TAGS`, `ADD_CATEGORY_HIERARCHY`, `ENRICH_FROM_BARCODE`, `SUGGEST_PRICING`, `IMAGE_ANALYSIS`, `SEO_OPTIMIZATION`

---

## Admin UI components

```
BusinessRulesManager          ← root component, 3 tabs
  ├── RulesList               ← table of rules with toggle, edit, delete
  ├── RuleForm                ← create / edit a rule
  │     ├── ValidationRuleBuilder    ← sub-form for BUSINESS_LOGIC rules
  │     ├── TransformationRuleBuilder ← sub-form for PRE_PROCESSING rules
  │     └── EnhancementRuleBuilder   ← sub-form for DATA_ENHANCEMENT rules
  └── RuleStatistics          ← aggregated metrics dashboard
```

`BusinessRulesManager` calls `getBusinessRules()` from `@/services/businessRulesService` (Next.js API proxy → backend). The proxy routes live under `/api/business-rules/`.

---

## Known backend limitation — disabled rules disappear

The backend `GET /ecommerce/business-rules` only returns `enabled: true` rules by default. There is no `?includeDisabled=true` parameter yet.

**Consequence:** When an admin disables a rule in the UI, it disappears from the list. To see it again they must re-enable it via direct API call or MongoDB query.

**Recommended backend fix (any of these):**
- `GET /ecommerce/business-rules?includeDisabled=true`
- `GET /ecommerce/business-rules?enabled=false`
- Change default to return all rules, filter with `?enabled=true`

---

## How product submission uses business rules

The `ecommerce-product-v2` submission pipeline calls `POST /ecommerce/business-rules/execute` in Step 1 (pre-processing). If the backend returns a 404 or error, the pipeline degrades gracefully and skips pre-processing — product creation still proceeds.

The same execute endpoint is used by `useBusinessRules` hook (`src/hooks/useBusinessRules.ts`) for any component that needs on-demand rule execution outside the product creation flow.

```
Submit product
  → POST /ecommerce/business-rules/execute  (pre-processing, optional)
  → POST /ecommerce/dynamic-products/validate  (enhanced validation)
  → POST /ecommerce/dynamic-products/create
```
