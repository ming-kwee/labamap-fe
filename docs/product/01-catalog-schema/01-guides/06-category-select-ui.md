# Category Select UI

## Why Not a Plain `<select>`

The product category tree has unlimited depth. A standard HTML `<select>` fails because:

1. No depth concept — a flat option list has no parent/child relationship.
2. Payload bloat — embedding all categories in the form schema response repeats them on every refresh.
3. Stale data — a snapshot embedded at form-generate time diverges from the live collection.
4. No tree browsing — merchants can't find "Electronics > Phones > Smartphones" in a flat alphabetical list.

---

## The Solution: `fieldType: "category-select"`

The backend emits the category field with a special type and **no `options[]`**:

```json
{
  "fieldName": "category",
  "fieldType": "CATEGORY_SELECT",
  "label": "Product Category",
  "required": true
}
```

`FieldRenderer` detects `fieldType === "category-select"` and renders `CategorySelectField`, which:
1. Fetches the live category list from `GET /admin/product-categories/slugs`
2. Sorts by `path` lexicographically (gives parent-before-child order automatically)
3. Renders a searchable combobox with visual tree indentation

The stored value is always the plain `slug` string (e.g., `"smartphones"`).

---

## Java Enum Serialisation — The Normalisation Fix

Java enums serialise to uppercase with underscores: `CATEGORY_SELECT`.

`FieldRenderer` normalises before matching:
```typescript
const fieldType = (field.fieldType || '').toLowerCase().replace(/_/g, '-');
// "CATEGORY_SELECT" → "category_select" → "category-select"
if (fieldType === 'category-select') { ... }
```

Without `.replace(/_/g, '-')`, `"category_select"` would never match `"category-select"` and the plain text input fallback would render instead.

---

## Data Flow

```
Backend: DataDrivenSchemaGenerationService
  → emits: { fieldName: "category", fieldType: "CATEGORY_SELECT", required: true }
                │
                ▼
FieldRenderer.tsx
  fieldType = "CATEGORY_SELECT".toLowerCase().replace(/_/g, '-') → "category-select"
  → renders <CategorySelectField orgId={orgId} value={...} onChange={(slug) => onChange("category", slug)} />
                │
                ▼
CategorySelectField (mounts)
  → fetchSlugs(orgId)
  → GET /admin/product-categories/slugs   [org resolved server-side from auth token]
  → sort by path (lexicographic = parent-before-child)
  → render combobox

Merchant selects "Smartphones" (slug: "smartphones")
                │
                ▼
onChange("category", "smartphones")
  → useFieldHandler detects fieldName === "category"
  → calls loadCategoryFieldsSmooth("smartphones")
  → POST /ecommerce/form-schema/refresh
      { context: { productCategory: "smartphones" } }
  → Response includes productTypeId in metadata
  → VariantConfigurator loads variant options
```

---

## Why Path Sort Gives Correct Tree Order

```
Raw slugs from API (unsorted):
  { name: "Apparel",     path: "apparel",                        level: 0 }
  { name: "Smartphones", path: "electronics/phones/smartphones", level: 2 }
  { name: "Electronics", path: "electronics",                    level: 0 }
  { name: "Phones",      path: "electronics/phones",             level: 1 }
  { name: "Laptops",     path: "electronics/laptops",            level: 1 }

After .sort((a, b) => a.path.localeCompare(b.path)):
  "apparel"                          → Apparel      (level 0)
  "electronics"                      → Electronics  (level 0)
  "electronics/laptops"              → Laptops      (level 1)
  "electronics/phones"               → Phones       (level 1)
  "electronics/phones/smartphones"   → Smartphones  (level 2)

Alphabetical path sort = parent-before-child, siblings adjacent.
No recursive tree traversal needed.
```

---

## Visual Indentation

```
Electronics                    paddingLeft: 0.75rem  (level 0)
  ├ Phones                     paddingLeft: 1.75rem  (level 1)
  │   └ Smartphones            paddingLeft: 2.75rem  (level 2)
  │       └ Budget             paddingLeft: 3.75rem  (level 3)
  └ Laptops                    paddingLeft: 1.75rem  (level 1)
Apparel                        paddingLeft: 0.75rem  (level 0)
```

```typescript
// paddingLeft formula:
style={{ paddingLeft: `${0.75 + item.level * 1}rem` }}

// L-connector line for non-root items:
{item.level > 0 && (
  <span className="mt-1 flex-shrink-0 w-3 border-l-2 border-b-2 border-gray-200 rounded-bl-sm h-2" />
)}
```

---

## Search Mode vs Browse Mode

```
Browse mode (no query):
  Electronics            ← full tree, indented
    Phones
      Smartphones ✓
      Budget Phones
    Laptops

Search mode (query: "phone"):
  electronics / phones            ← ancestor path shown for context
  Phones
  electronics / phones / smartphones
  Smartphones ✓
  Budget Phones
```

When `query` is set, each matching item shows its ancestor breadcrumb. In browse mode, breadcrumbs are hidden because tree indentation already provides hierarchy context.

---

## Module-Level Slug Cache — Org-Keyed (Important)

### Why the cache must be keyed by orgId

Categories are org-scoped. Org A's tree differs from Org B's tree after each merchant
customises their own taxonomy. A singleton cache (the old design) would serve stale data
when:
- A platform admin manages multiple organisations in the same browser tab
- An admin switches org context without a full page reload

### Correct implementation

```typescript
// Module scope — one entry per org, shared across all component instances for the tab lifetime
const slugCacheByOrg = new Map<string, CategorySlugItem[]>();
const fetchPromiseByOrg = new Map<string, Promise<CategorySlugItem[]>>();

function fetchSlugs(orgId: string): Promise<CategorySlugItem[]> {
  if (slugCacheByOrg.has(orgId)) return Promise.resolve(slugCacheByOrg.get(orgId)!);
  if (fetchPromiseByOrg.has(orgId)) return fetchPromiseByOrg.get(orgId)!;

  const promise = CategoryService.getSlugs(orgId).then(items => {
    slugCacheByOrg.set(orgId, [...items].sort((a, b) => a.path.localeCompare(b.path)));
    fetchPromiseByOrg.delete(orgId);
    return slugCacheByOrg.get(orgId)!;
  });
  fetchPromiseByOrg.set(orgId, promise);
  return promise;
}

// Call from component:
function invalidateOrgCache(orgId: string) {
  slugCacheByOrg.delete(orgId);
  fetchPromiseByOrg.delete(orgId);
}
```

### When to invalidate

| Event | Action |
|---|---|
| Merchant creates / renames / deletes a category | `invalidateOrgCache(orgId)` |
| User switches to a different org | The new org has its own cache entry — no invalidation needed |
| Page hard-reload | All entries cleared automatically (module-scope is tab-lifetime) |

The backend category admin operations (`POST`, `PUT`, `DELETE` on `/admin/product-categories`)
should emit a cache-bust signal after success. The simplest approach is a React context event
or a global event bus:

```typescript
// After a successful category mutation:
window.dispatchEvent(new CustomEvent('categoryTreeChanged', { detail: { orgId } }));

// In CategorySelectField:
useEffect(() => {
  const handler = (e: CustomEvent<{ orgId: string }>) => {
    if (e.detail.orgId === currentOrgId) invalidateOrgCache(currentOrgId);
  };
  window.addEventListener('categoryTreeChanged', handler as EventListener);
  return () => window.removeEventListener('categoryTreeChanged', handler as EventListener);
}, [currentOrgId]);
```

---

## Combobox Behaviour

| Feature | Behaviour |
|---------|-----------|
| Trigger button | Shows selected category name with ancestor breadcrumb above it; [×] clear button |
| Dropdown panel | Opens on click or keyboard (Enter / Space / ArrowDown) |
| Search input | Filters by name and path simultaneously; auto-focused on open |
| Tree indentation | `0.75 + level × 1rem` per depth level |
| Ancestor breadcrumb | Shown in each option only when search is active |
| L-connector lines | Left border-bottom connector for non-root items |
| Keyboard navigation | ↑↓ to move, Enter to select, Escape to close |
| Selection tick | Blue checkmark on the currently selected option |
| Footer count | "X of Y categories" when filtering, "Y categories" when browsing |

---

## Can Merchants Select Parent Categories?

Yes. Any node — root, branch, or leaf — is selectable. Leaf-only restriction would block small merchants with flat catalogs. When a parent category has no `productTypeId`, the system walks ancestors to find one.

---

## Codebase

| File | Purpose |
|------|---------|
| `src/modules/ecommerce-product-v2/step1-create/components/CategorySelectField.tsx` | Combobox component with org-keyed module-level cache |
| `src/modules/ecommerce-product-v2/step1-create/components/FieldRenderer.tsx` | Detects `category-select`, renders `CategorySelectField` |
| `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts` | Detects `fieldName === "category"` change → calls `loadCategoryFieldsSmooth` |
| `src/app/omni-admin/product-categories/_services/category.service.ts` | `CategoryService.getSlugs(orgId)` |
| `src/app/omni-admin/product-categories/_types/category.ts` | `CategorySlugItem` type |
