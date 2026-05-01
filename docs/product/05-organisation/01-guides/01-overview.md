# Organisation — Overview

## What This Module Does

The organisation module handles multi-tenant identity: who can log in, which organization they belong to, and what they are allowed to do. Every API call after login carries the authenticated user's organization context in request headers, isolating data between tenants at the service layer.

---

## Three Collections

```
users                       organizations                  organization_users
──────────────────          ──────────────────             ──────────────────────
One per person              One per tenant                 One per (user × org)

userId                      organizationId                 userId
email                       organizationName               organizationId
password (hashed)           platformTenantId               role  ← OrganizationUser.UserRole
UserRole  ← platform role   subscriptionTier               departmentId
UserStatus                  status                         permissions[]
                            businessRulesConfig            assignedCategories[]
                            settings                       assignedChannels[]
```

**Why three collections instead of two:** `users` holds the platform-level identity (can log in, global role). `organizations` holds the tenant configuration (subscription, channel integrations, business rules policy). `organization_users` is the bridge that stores the user's *role within a specific org* — a person may belong to multiple organizations with different roles in each.

---

## Role Hierarchy

### `User.UserRole` — platform-level (stored in `users`)

| Role | Description |
|------|-------------|
| `SYSTEM_ADMIN` | Full platform access — manages all organizations |
| `ORGANIZATION_ADMIN` | Can manage their own organization's settings |
| `BUSINESS_USER` | Standard product and channel access |
| `VIEWER` | Read-only across all features |

### `OrganizationUser.UserRole` — tenant-level (stored in `organization_users`)

| Role | Description |
|------|-------------|
| `ORGANIZATION_OWNER` | Full control within the organization |
| `ORGANIZATION_ADMIN` | Can manage users, settings, and integrations |
| `BUSINESS_MANAGER` | Manages products and channel operations |
| `BUSINESS_USER` | Standard day-to-day product work |
| `ANALYST` | Read + reporting access |
| `VIEWER` | Read-only |

The `UserOrganizationRole.role` field in `AuthenticationResponse` comes from `organization_users`.

---

## Authentication Flow

```
1. POST /api/v1/auth/login
   { email, password }
   → AuthenticationResponse
     ├─ accessToken   (Bearer token for subsequent calls)
     ├─ refreshToken  (used to get new accessToken without re-login)
     ├─ tokenExpiresIn (seconds)
     ├─ user          (UserInfo: userId, email, name, role, status)
     ├─ organization  (OrganizationInfo: id, name, tier, settings, features)
     ├─ userOrganizationRole (role within this org, permissions, assigned scope)
     └─ sessionInfo   (sessionId, ip, loginTimestamp)

2. Every subsequent call:
   Authorization: Bearer <accessToken>
   X-Organization-ID: <organizationId>
   X-User-ID: <userId>

3. Token refresh (before accessToken expires):
   POST /api/v1/auth/refresh
   Authorization: Bearer <refreshToken>
   X-Organization-ID + X-User-ID headers required

4. Session end:
   POST /api/v1/auth/logout
```

There is **no `switch-organization` endpoint** — each login is scoped to the organization that the system resolves for the user. If a user belongs to multiple organizations, they log in once per organization context.

---

## Organization Configuration

An organization's configuration (settings, business rules policy, channel integrations) is loaded as part of the login response and can be read or updated via the `/api/v1/organizations/{organizationId}/configuration` endpoints.

`OrganizationController` validates that the `{organizationId}` in the URL path matches the `X-Organization-ID` header. A mismatch returns `400 Bad Request` — users cannot read or write another tenant's data via this endpoint.

### Subscription Tiers

| Tier | Description |
|------|-------------|
| `BASIC` | Entry-level: limited products, channels, users |
| `PROFESSIONAL` | Mid-tier: expanded limits and feature access |
| `ENTERPRISE` | Unlimited: custom branding, advanced analytics |

### Organization Statuses

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Fully operational |
| `SUSPENDED` | Access blocked — typically billing or policy issue |
| `TRIAL` | Time-limited free access |
| `CANCELLED` | Account closed |
| `PENDING` | Registration complete, awaiting activation |

---

## Business Rules Integration

`Organization.BusinessRulesConfiguration` (nested in `organizations` collection) controls whether business rules are active for the org and stores per-category rule assignments. This is updated via `PUT /api/v1/organizations/{organizationId}/business-rules` and is distinct from the `ecommerce_business_rules` collection (which holds the rules themselves).

---

## Codebase

| File | Purpose |
|------|---------|
| `organization/controller/AuthenticationController.java` | Login, validate, refresh, logout |
| `organization/controller/OrganizationController.java` | Org configuration + user profile + business rules config |
| `organization/model/entity/User.java` | `users` collection — `UserRole`, `UserStatus` |
| `organization/model/entity/Organization.java` | `organizations` collection — `SubscriptionTier`, `OrganizationStatus`, `BusinessRulesConfiguration` |
| `organization/model/entity/OrganizationUser.java` | `organization_users` collection — `UserRole` (tenant-level) |
| `organization/model/dto/response/AuthenticationResponse.java` | Full response shape for login/refresh/validate |
| `organization/model/dto/request/LoginRequest.java` | `{ email, password }` only |
