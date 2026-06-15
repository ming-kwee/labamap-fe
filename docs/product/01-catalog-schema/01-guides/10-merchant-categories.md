# Merchant Category Management

## Why This Page Exists

Platform categories are created through a **one-time onboarding choice**:

| Onboarding path | Who controls it afterwards | Example |
|---|---|---|
| **Platform category templates** | Platform admin provisions a standard tree; merchant customizes from there | "Electronics > Phones > Smartphones" |
| **One-time channel import** | Merchant imports channel collections as bootstrap; platform becomes master after import | Wix collection "Baju Kaos" → platform category |

After onboarding (and the 14-day grace period), **platform is always master**.
Import from channel is no longer available — all category changes happen here.

Merchants use this page to:
- Rename a category after a business change
- Add sub-categories the initial structure didn't include
- Deactivate a category no longer in use
- Delete a category (must unlink all channel mappings first)

Previously there was no merchant-facing page for this. `ProductCategoriesPage` at
`/omni-admin/product-categories` is owned by the **platform admin**, not the merchant.
Channel Category Mapping (`/omni-admin/channel-category-mapping`) focuses on linking
categories to channels — not managing the categories themselves.

---

## Ownership Model

```
Platform Admin
  ├── Creates category templates  (/platform-admin/category-templates)
  ├── Provisions templates to merchant orgs
  └── Manages the admin-level product category tree (/omni-admin/product-categories)

Merchant User
  ├── Chooses category source at onboarding (import OR template — once only)
  ├── Receives provisioned categories (org-scoped copy)
  ├── Manages their own org's categories  ← THIS PAGE  /channels/categories
  └── Maps their categories to channel stores  (Channel Category Mapping)
```

The merchant's category tree is the **source of truth** for the Channel Category Mapping
grid. CRUD here directly affects what appears in the left column of the mapping grid.

---

## Page: My Categories

**Route:** `/channels/categories`
**Sidebar section:** Channel Platform (after Channel Stores)
**Sidebar label:** My Categories

### What the Merchant Can Do

| Action | Notes |
|---|---|
| **View** category tree | Expandable tree, same structure as admin page |
| **Add** root or child category | Name, slug, description, parent selection |
| **Edit** a category | Name, slug, description, product type assignment |
| **Toggle active/inactive** | Soft hide from channel sync without deleting |
| **Delete** a category | Blocked if still mapped to any channel store — merchant must unlink all channels first via Channel Category Mapping |

### Delete Guard

If a category has `channelSyncSummary.totalMapped > 0`, the delete button is disabled
with a tooltip: *"Still linked to N channel(s). Remove all channel links in Channel
Category Mapping before deleting."*

This prevents orphaned mapping records and forces the merchant to consciously unlink
before destroying. The backend enforces the same rule as a 409 safety net (see API ref).

### Channel Sync Summary Badges

Each category row shows the same `channelSyncSummary` badges from the mapping collection:
- Green badge: `X ch` → X channels mapped
- Amber badge: `X drift` → X mappings drifted

These are read-only informational. Clicking them links to Channel Category Mapping filtered
to that category.

---

## Relationship to Channel Category Mapping

The two pages have distinct, complementary jobs:

| My Categories (`/channels/categories`) | Channel Category Mapping |
|---|---|
| CRUD on the platform category tree | Link each category to a channel-side category |
| Merchant manages structure and naming | Merchant manages channel connections |
| Delete requires all channels unlinked | Unlink button is the entry point before delete |

**Typical flow for an accidentally imported category:**
1. Channel Category Mapping → click unlink icon → "Remove link only" (severs channel connection)
   — OR if `importedFrom: true` → "Remove link + delete category" (full undo in one step)
2. My Categories → delete the category (now safe since no channel links remain)

---

## Frontend Implementation Plan

### Route

```
src/app/(admin)/channels/categories/
  page.tsx                          ← exports MerchantCategoriesPage as default
  _components/
    MerchantCategoriesPage.tsx      ← main component
    MerchantCategoryModal.tsx       ← add/edit modal (adapted from AddEditCategoryModal)
    DeleteCategoryConfirm.tsx       ← confirm modal with channel-link guard messaging
```

### Key Differences from `ProductCategoriesPage`

| `ProductCategoriesPage` (admin) | `MerchantCategoriesPage` |
|---|---|
| No channel sync badges (admin context) | Shows `channelSyncSummary` badges per row |
| Delete has no channel guard | Delete blocked if `totalMapped > 0` |
| Manages all orgs' templates | Scoped to `useAuth().organization.organizationId` |
| No link to Channel Category Mapping | "Manage channel links →" link per row or per page |

### Reused Components

- `CategoryService` from `../../omni-admin/product-categories/_services/category.service` —
  all endpoints are org-scoped and work as-is
- `ProductCategoryTree`, `ProductCategory` types — identical
- `AddEditCategoryModal` can be copied and adapted, or imported directly if no admin-specific
  logic is present

### Sidebar Entry

```typescript
// src/layout/AppSidebar.tsx — Channel Platform section
{ name: "My Categories", path: "/channels/categories", pro: false, new: true },
```

Insert after `{ name: "Channel Stores", ... }`.

---

## States and Edge Cases

| State | Handling |
|---|---|
| No categories yet (fresh org) | Empty state: "Pilih cara setup kategori Anda di halaman Channel Category Mapping untuk memulai." (redirects to onboarding panel) |
| Category has children | Backend 409 — cannot delete parent before children. Show: "Remove child categories first." |
| Category mapped to channels | Frontend blocks delete with tooltip. Backend returns 409 as safety net. |
| Category both has children AND is mapped | Show children error first (most actionable) |
| `channelSyncSummary` absent | Backend hasn't implemented the field yet — hide badges silently, allow delete (no false block) |
