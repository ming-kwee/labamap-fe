# API Reference — Platform Category Templates

Base path: `/labamap/api/v1/platform-admin/category-templates`

These endpoints are **platform-admin only** — not accessible to merchant users. The
`platform_category_templates` collection is the master taxonomy shipped with the platform.
It is the source used when seeding a new organisation's `product_categories` on first
provisioning.

---

## Why Two Collections

| Collection | Owner | Org-scoped | Purpose |
|---|---|---|---|
| `platform_category_templates` | Platform admin | No | Single canonical tree, seeded at startup by `PlatformCategoryTemplateDataLoader` |
| `product_categories` | Organisation | Yes (`organizationId`) | Each org's own working copy, customisable post-provision |

The two datasets are independent after provisioning. Changes to templates never propagate
to existing organisations automatically.

---

## MongoDB Collection: `platform_category_templates`

```json
{
  "_id":          "ObjectId",
  "slug":         "smartphones",
  "name":         "Smartphones",
  "parentId":     "ObjectId | null",
  "path":         "electronics/phones/smartphones",
  "level":        2,
  "description":  "Android and iOS smartphones",
  "imageUrl":     null,
  "sortOrder":    10,
  "active":       true,
  "templateVersion": 1,
  "createdAt":    "2026-01-01T00:00:00Z",
  "updatedAt":    "2026-01-01T00:00:00Z"
}
```

### Differences from `product_categories`

| Field | `platform_category_templates` | `product_categories` |
|---|---|---|
| `organizationId` | absent | required |
| `productTypeId` | absent | optional |
| `productTypeName` | absent | optional |
| `channelSyncSummary` | absent | optional (denormalized) |
| `templateVersion` | present (int) | absent |
| `slug` uniqueness | global unique | per-org compound |

Templates do not carry `productTypeId` because ProductType assignments are merchant-specific —
the same category slug may map to different ProductTypes across orgs.

---

## Indexes

```javascript
db.platform_category_templates.createIndex({ slug: 1 }, { unique: true })
db.platform_category_templates.createIndex({ path: 1 })
db.platform_category_templates.createIndex({ parentId: 1 })
db.platform_category_templates.createIndex({ level: 1, sortOrder: 1 })
```

---

## GET `/platform-admin/category-templates`

Returns the full template tree as nested nodes. Platform-admin auth required.

**Response:** same shape as `GET /admin/product-categories` but without
`channelSyncSummary`, `productTypeId`, and `productTypeName`.

---

## POST `/platform-admin/category-templates`

Creates a new template node. Slug must be globally unique.

**Request body:**
```json
{
  "name":        "Halal & Organic Food",
  "slug":        "halal-organic-food",
  "parentId":    "ObjectId | null",
  "description": "Halal certified and organic food products",
  "sortOrder":   115
}
```

**Side effects:** does NOT auto-propagate to any existing org. New template nodes are
only picked up during future org provisioning runs.

---

## PUT `/platform-admin/category-templates/{id}`

Updates a template node. Same side-effect caveat as POST — no propagation.

---

## DELETE `/platform-admin/category-templates/{id}`

Returns `409` if the template node has children. On success: deletes the node only from
the template collection. Does NOT delete corresponding `product_categories` documents in
any organisation.

---

## POST `/platform-admin/category-templates/provision/{orgId}`

Copies the entire `platform_category_templates` tree into `product_categories` for the
given org. This is the standard org-creation hook.

### Normal provisioning (new org)

```
platform_category_templates.find({})           ← all template documents, ordered by level
        │
        ▼
For each template document (parent-before-child order):
  Resolve parent ObjectId: templateParentId → already-inserted product_categories._id
  Insert:
    product_categories {
      organizationId: orgId,
      slug:           template.slug,
      name:           template.name,
      parentId:       <resolved org-specific parentId>,
      path:           template.path,
      level:          template.level,
      description:    template.description,
      imageUrl:       template.imageUrl,
      sortOrder:      template.sortOrder,
      active:         true,
      createdBy:      "platform-provision",
      updatedBy:      "platform-provision"
    }
```

**Returns:**
```json
{
  "orgId":    "org_abc123",
  "inserted": 247,
  "skipped":  0,
  "errors":   []
}
```

`skipped` is non-zero only if a category with the same `{organizationId, slug}` already
exists (idempotent guard). A re-run of provisioning on an org that already has categories
is safe — existing documents are never overwritten.

### Force re-provision (destructive reset)

Add `?force=true` to overwrite the org's entire category tree with the current template.

```
DELETE product_categories WHERE organizationId = orgId
  ↓
DELETE channel_category_mappings WHERE organizationId = orgId
  ↓
Run standard provisioning
```

**This is destructive.** All merchant customisations (renames, custom nodes, ProductType
assignments, channel mappings) are permanently lost. Requires an explicit confirmation
header:

```
X-Confirm-Destructive: RESET_CATEGORIES
```

Returns `400` without the header.

**Response** on success:
```json
{
  "orgId":              "org_abc123",
  "deletedCategories":  312,
  "deletedMappings":    89,
  "inserted":           247,
  "skipped":            0,
  "errors":             []
}
```

---

## `PlatformCategoryTemplateDataLoader` — Startup Seeding

The data loader (`@Order(200)`) runs on every startup and upserts all template nodes into
`platform_category_templates` by slug. Existing documents are skipped (idempotent). Admin
edits to the template collection are never overwritten by the loader.

The old `ProductCategoryDataLoader` that seeded directly into `product_categories` is
**removed**. All startup seeding now targets `platform_category_templates` only.

---

## Template Versioning

`templateVersion` is an integer incremented on each platform release that changes the
canonical tree. It is stored on template documents only — not on `product_categories`.

A future migration utility can use this to offer merchants a "what's new in this template
version" diff, letting them selectively adopt new nodes without a destructive force-reprovision.
That utility is not yet implemented.

---

## Frontend — Platform Admin UI

The platform admin UI (not merchant-facing) at
`src/app/platform-admin/category-templates/` provides:

- Full tree view of `platform_category_templates`
- Create / edit / deactivate template nodes
- Provision status per org: shows which orgs have been provisioned and at which template version
- Provision action: `POST /platform-admin/category-templates/provision/{orgId}`
- Force re-provision: same endpoint with `?force=true` and confirmation dialog

Merchant users do not see this section. It is gated by the `PLATFORM_ADMIN` role claim in
the JWT.
