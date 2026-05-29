# API Reference — Merchant Category Management

> **Context:** Merchants manage their own org-scoped `product_categories` from
> `/channels/categories` (My Categories page). This page reuses the existing
> `ProductCategoryAdminController` endpoints — all are already org-scoped via
> `organizationId`. The only **new backend work** is the delete guard (§3) and
> the RBAC verification note (§4).

Base path: `/labamap/api/v1/admin/product-categories`
Controller: `ProductCategoryAdminController` (existing — no new controller needed)

---

## 1. Reused Endpoints (no changes required)

All existing endpoints work for merchant CRUD without modification, because they are
already scoped by `organizationId`. The merchant's frontend passes their own
`organization.organizationId` from `AuthContext`.

| Method | Path | Merchant use |
|--------|------|--------------|
| `GET` | `/tree?organizationId=` | Load merchant's category tree |
| `POST` | `/?organizationId=` | Create a new category |
| `PUT` | `/{id}?organizationId=` | Rename / re-parent a category |
| `PATCH` | `/{id}/active?active=` | Activate or deactivate |
| `DELETE` | `/{id}?organizationId=` | Delete (see §3 for new guard) |

No new endpoints. No new controller. The merchant hits the same backend as the
platform admin; isolation is enforced by `organizationId`.

---

## 2. `channelSyncSummary` — already required, must be populated

The merchant category page shows per-category channel badges (`X ch mapped`,
`X drift`). These come from `channelSyncSummary` embedded on each
`ProductCategoryDocument`, which must be included in the `GET /tree` response.

This requirement was already documented in
`docs/product/01-catalog-schema/02-api-reference/04-channel-category-mapping.md`
(§ChannelSyncSummary). It is restated here because the merchant page depends on it:

- `channelSyncSummary.totalMapped` — used by the frontend delete guard
- `channelSyncSummary.totalDrifted` — shown as amber badge
- If `channelSyncSummary` is absent from the response, the frontend degrades
  gracefully (hides badges, allows delete without the channel guard)

---

## 3. New: Delete guard — 409 when mapped channels exist ⚠️ pending

**This is the only new backend change required.**

### Current behaviour (existing)

```
DELETE /{id}?organizationId=
→ 409 Conflict  if category has active children
→ 204 No Content  otherwise
```

### Required behaviour (new)

Add a second 409 check **before** the children check:

```
DELETE /{id}?organizationId=
→ 409 Conflict  if any channel_category_mappings exist for this categoryId with syncStatus = MAPPED
→ 409 Conflict  if category has active children  (existing — keep as-is)
→ 204 No Content  otherwise
```

**Priority:** check channel mappings first. It is more actionable — the merchant must
unlink channels before they can even think about child categories.

### 409 response body for mapped channels

```json
{
  "error": "CATEGORY_HAS_ACTIVE_MAPPINGS",
  "message": "This category is still linked to 2 channel store(s). Remove all channel mappings before deleting.",
  "mappedCount": 2
}
```

The frontend reads `message` from this body and surfaces it as an error toast.
`mappedCount` is optional but useful for the UI.

### Implementation (Spring Boot reactive)

```java
// ProductCategoryAdminService.deleteCategory(categoryId, organizationId)

// Step 1: check channel mappings
return channelCategoryMappingRepository
    .countByCategoryIdAndSyncStatus(categoryId, "MAPPED")
    .flatMap(mappedCount -> {
        if (mappedCount > 0) {
            return Mono.error(new ResponseStatusException(
                HttpStatus.CONFLICT,
                "CATEGORY_HAS_ACTIVE_MAPPINGS:" + mappedCount
            ));
        }
        // Step 2: existing children check
        return categoryRepository.countByParentIdAndActive(categoryId, true)
            .flatMap(childCount -> {
                if (childCount > 0) {
                    return Mono.error(new ResponseStatusException(
                        HttpStatus.CONFLICT, "CATEGORY_HAS_ACTIVE_CHILDREN"
                    ));
                }
                return categoryRepository.deleteById(categoryId);
            });
    });
```

**New repository method required:**

```java
// ChannelCategoryMappingRepository
Mono<Long> countByCategoryIdAndSyncStatus(String categoryId, String syncStatus);
```

---

## 4. RBAC — verify organizationId ownership ⚠️ check required

Merchants must only be able to modify categories belonging to their own org.

**Verify this is already enforced:**

For `PUT /{id}`, `PATCH /{id}/active`, `DELETE /{id}` — the controller should load the
category by `id` AND verify `category.organizationId == requestingUser.organizationId`
before allowing the mutation. If only `id` is checked without an org ownership
verification, a merchant could modify another org's categories by guessing IDs.

**Recommended pattern:**

```java
// Before any mutation:
categoryRepository.findByIdAndOrganizationId(categoryId, organizationId)
    .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)))
    .flatMap(category -> /* proceed with mutation */);
```

`GET /tree` is already scoped by `?organizationId=` in the query. Read access is safe.
Write paths need the explicit ownership check above.

---

## 5. Summary — what needs to be done

| # | Work | Type | Status |
|---|------|------|--------|
| 1 | `GET /tree` returns `channelSyncSummary` | Existing requirement | Verify implemented |
| 2 | `DELETE /{id}` — 409 if `MAPPED` channel links exist | **New guard** | ⚠️ Pending |
| 3 | `ChannelCategoryMappingRepository.countByCategoryIdAndSyncStatus` | **New repo method** | ⚠️ Pending |
| 4 | Ownership verification on write endpoints | Security check | Verify implemented |

Items 1 and 4 should already be in place — verify before release.
Items 2 and 3 are the only new code required.

---

## 6. Frontend does not call any new endpoint

The merchant category page (`/channels/categories`) uses `CategoryService` as-is:

```typescript
// src/app/omni-admin/product-categories/_services/category.service.ts
// No changes — imported directly by MerchantCategoriesPage
CategoryService.getTree(orgId)
CategoryService.create(payload, orgId)
CategoryService.update(id, payload, orgId)
CategoryService.setActive(id, active, orgId)
CategoryService.delete(id, orgId)   // receives 409 with CATEGORY_HAS_ACTIVE_MAPPINGS message
```

The frontend delete guard (check `channelSyncSummary.totalMapped > 0` before calling
`CategoryService.delete`) means the 409 is a safety net for direct API calls only —
normal merchant UI flow will never hit it.
