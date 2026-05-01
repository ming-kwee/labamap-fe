# API Reference — Authentication

Base path: `/labamap/api/v1/auth`

---

## MongoDB Collection: `users`

```json
{
  "_id":        "65f1a2b3c4d5e6f7a8b9c0d1",
  "userId":     "user_abc123",
  "email":      "merchant@example.com",
  "password":   "<bcrypt hash>",
  "firstName":  "Jane",
  "lastName":   "Smith",
  "role":       "BUSINESS_USER",
  "status":     "ACTIVE",
  "createdAt":  "2026-01-15T08:00:00Z",
  "updatedAt":  "2026-04-29T10:00:00Z",
  "lastLoginAt": "2026-04-29T09:55:00Z"
}
```

| Field | Description |
|-------|-------------|
| `role` | Platform-level role: `SYSTEM_ADMIN`, `ORGANIZATION_ADMIN`, `BUSINESS_USER`, `VIEWER` |
| `status` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION` |
| `password` | Never returned in any response — server-side only |

---

## POST `/auth/login`

Authenticates a user and returns tokens plus full organization context.

**Request body:** `LoginRequest`
```json
{
  "email":    "merchant@example.com",
  "password": "MySecurePass123!"
}
```

No `organizationId` field — it is not part of `LoginRequest`.

**Response:** `AuthenticationResponse`
```json
{
  "success":       true,
  "message":       "Login successful",
  "accessToken":   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken":  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenExpiresIn": 3600,
  "user": {
    "userId":      "user_abc123",
    "email":       "merchant@example.com",
    "firstName":   "Jane",
    "lastName":    "Smith",
    "role":        "BUSINESS_USER",
    "status":      "ACTIVE",
    "lastLoginAt": "2026-04-29T09:55:00Z",
    "permissions": ["products:read", "products:write"]
  },
  "organization": {
    "organizationId":   "org_123",
    "organizationName": "Acme Store",
    "platformTenantId": "tenant_abc",
    "businessDomain":   "electronics",
    "subscriptionTier": "PROFESSIONAL",
    "status":           "ACTIVE",
    "settings": {
      "defaultProductCategory":   "electronics",
      "enabledChannels":          ["shopify", "amazon"],
      "defaultCurrency":          "USD",
      "timezone":                 "Asia/Kuala_Lumpur",
      "businessRulesEnabled":     true,
      "realTimeValidationEnabled": true
    },
    "features": {
      "maxProducts":          5000,
      "maxUsers":             25,
      "businessRulesLimit":   "unlimited",
      "channelIntegrations":  ["shopify", "amazon", "tiktok"],
      "advancedAnalytics":    true,
      "customBranding":       false
    }
  },
  "userOrganizationRole": {
    "role":               "BUSINESS_MANAGER",
    "departmentId":       "dept_ops",
    "departmentName":     "Operations",
    "permissions":        ["products:read", "products:write", "channels:read"],
    "assignedCategories": ["electronics", "accessories"],
    "assignedChannels":   ["shopify", "amazon"],
    "businessRulesPermissions": {
      "canCreateRules":         false,
      "canModifyRules":         false,
      "canViewRules":           true,
      "assignedRuleCategories": ["pricing", "validation"]
    }
  },
  "sessionInfo": {
    "sessionId":             "sess_xyz789",
    "ipAddress":             "203.0.113.45",
    "userAgent":             "Mozilla/5.0...",
    "loginTimestamp":        "2026-04-29T10:00:00Z",
    "lastActivityTimestamp": "2026-04-29T10:00:00Z"
  }
}
```

`userOrganizationRole.role` is from `OrganizationUser.UserRole` (tenant-level): `ORGANIZATION_OWNER`, `ORGANIZATION_ADMIN`, `BUSINESS_MANAGER`, `BUSINESS_USER`, `ANALYST`, `VIEWER`.

On failure:
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

## GET `/auth/session/validate`

Validates the current access token and returns refreshed session state.

**Required headers:**
```
Authorization:    Bearer <accessToken>
X-Organization-ID: org_123
X-User-ID:         user_abc123
```

**Response:** `AuthenticationResponse` — same shape as login response.

---

## POST `/auth/refresh`

Exchanges a refresh token for a new access token without requiring re-login.

**Required headers:**
```
Authorization:    Bearer <refreshToken>
X-Organization-ID: org_123
X-User-ID:         user_abc123
```

No request body.

**Response:** `AuthenticationResponse` with new `accessToken`, `refreshToken`, and `tokenExpiresIn`.

---

## POST `/auth/logout`

Invalidates the current session.

**Required headers:**
```
Authorization:    Bearer <accessToken>
X-Organization-ID: org_123
X-User-ID:         user_abc123
```

No request body.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## TypeScript Types

```typescript
// src/modules/auth/types/auth.ts

interface LoginRequest {
  email:    string;
  password: string;
}

type UserRole = 'SYSTEM_ADMIN' | 'ORGANIZATION_ADMIN' | 'BUSINESS_USER' | 'VIEWER';
type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
type OrganizationUserRole = 'ORGANIZATION_OWNER' | 'ORGANIZATION_ADMIN' | 'BUSINESS_MANAGER' | 'BUSINESS_USER' | 'ANALYST' | 'VIEWER';
type SubscriptionTier = 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED' | 'PENDING';

interface UserInfo {
  userId:      string;
  email:       string;
  firstName:   string;
  lastName:    string;
  role:        UserRole;
  status:      UserStatus;
  lastLoginAt?: string;
  permissions: string[];
}

interface OrganizationSettings {
  defaultProductCategory:    string;
  enabledChannels:           string[];
  defaultCurrency:           string;
  timezone:                  string;
  businessRulesEnabled:      boolean;
  realTimeValidationEnabled: boolean;
}

interface OrganizationFeatures {
  maxProducts:         number;
  maxUsers:            number;
  businessRulesLimit:  string;
  channelIntegrations: string[];
  advancedAnalytics:   boolean;
  customBranding:      boolean;
}

interface OrganizationInfo {
  organizationId:   string;
  organizationName: string;
  platformTenantId: string;
  businessDomain:   string;
  subscriptionTier: SubscriptionTier;
  status:           OrganizationStatus;
  settings:         OrganizationSettings;
  features:         OrganizationFeatures;
}

interface BusinessRulesPermissions {
  canCreateRules:         boolean;
  canModifyRules:         boolean;
  canViewRules:           boolean;
  assignedRuleCategories: string[];
}

interface UserOrganizationRole {
  role:                      OrganizationUserRole;
  departmentId?:             string;
  departmentName?:           string;
  permissions:               string[];
  assignedCategories:        string[];
  assignedChannels:          string[];
  businessRulesPermissions:  BusinessRulesPermissions;
}

interface SessionInfo {
  sessionId:              string;
  ipAddress:              string;
  userAgent:              string;
  loginTimestamp:         string;
  lastActivityTimestamp:  string;
}

interface AuthenticationResponse {
  success:              boolean;
  message?:             string;
  accessToken?:         string;
  refreshToken?:        string;
  tokenExpiresIn?:      number;  // seconds (long)
  user?:                UserInfo;
  organization?:        OrganizationInfo;
  userOrganizationRole?: UserOrganizationRole;
  sessionInfo?:         SessionInfo;
}
```
