# API Reference — Organisations

Base path: `/labamap/api/v1/organizations`

**All endpoints require:**
```
Authorization:    Bearer <accessToken>
X-Organization-ID: <organizationId>
X-User-ID:         <userId>
```

The `{organizationId}` path variable must match the `X-Organization-ID` header. A mismatch returns `400 Bad Request`.

---

## MongoDB Collection: `organizations`

```json
{
  "_id":              "65f1a2b3c4d5e6f7a8b9c0d1",
  "organizationId":   "org_123",
  "organizationName": "Acme Store",
  "platformTenantId": "tenant_abc",
  "businessDomain":   "electronics",
  "subscriptionTier": "PROFESSIONAL",
  "status":           "ACTIVE",
  "businessRulesEnabled": true,
  "version":          "1.0",
  "createdAt":        "2026-01-15T08:00:00Z",
  "updatedAt":        "2026-04-29T10:00:00Z",
  "updatedBy":        "user_abc123",
  "businessRulesConfig": {
    "organizationId":         "org_123",
    "version":                "1.0",
    "businessRulesEnabled":   true,
    "autoApplyPreProcessing": true,
    "blockOnViolations":      false,
    "enableRealTimeValidation": true,
    "executionTimeout":       5000,
    "ruleCategories": {
      "pricing": {
        "enabled":         true,
        "autoApply":       true,
        "blockOnViolation": false,
        "rules": []
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `subscriptionTier` | `BASIC`, `PROFESSIONAL`, `ENTERPRISE` |
| `status` | `ACTIVE`, `SUSPENDED`, `TRIAL`, `CANCELLED`, `PENDING` |
| `businessRulesConfig` | Org-level business rules policy — distinct from `ecommerce_business_rules` collection (the rules themselves) |

---

## MongoDB Collection: `organization_users`

One document per (user × organization) pairing.

```json
{
  "_id":            "65f1a2b3c4d5e6f7a8b9c0d2",
  "userId":         "user_abc123",
  "organizationId": "org_123",
  "role":           "BUSINESS_MANAGER",
  "title":          "Head of Operations",
  "departmentId":   "dept_ops",
  "departmentName": "Operations",
  "managerId":      "user_mgr001",
  "createdAt":      "2026-01-15T08:00:00Z",
  "updatedAt":      "2026-04-01T12:00:00Z",
  "createdBy":      "user_owner001",
  "updatedBy":      "user_owner001",
  "permissions":    ["products:read", "products:write"],
  "assignedCategories": ["electronics"],
  "assignedChannels":   ["shopify", "amazon"]
}
```

| `role` values | Description |
|---------------|-------------|
| `ORGANIZATION_OWNER` | Full control within the organization |
| `ORGANIZATION_ADMIN` | Manage users, settings, integrations |
| `BUSINESS_MANAGER` | Manage products and channel operations |
| `BUSINESS_USER` | Standard day-to-day product work |
| `ANALYST` | Read + reporting |
| `VIEWER` | Read-only |

---

## GET `/{organizationId}/configuration`

Returns the organization's full configuration.

**Response:** `OrganizationConfigurationResponse`
```json
{
  "organizationId":   "org_123",
  "organizationName": "Acme Store",
  "subscriptionTier": "PROFESSIONAL",
  "status":           "ACTIVE",
  "configuration": {
    "defaultProductCategory":   "electronics",
    "enabledChannels":          ["shopify", "amazon"],
    "defaultCurrency":          "USD",
    "timezone":                 "Asia/Kuala_Lumpur",
    "businessRulesEnabled":     true,
    "realTimeValidationEnabled": true
  }
}
```

---

## PUT `/{organizationId}/configuration`

Updates the organization's configuration settings.

**Request body:** `OrganizationConfigurationResponse.OrganizationConfiguration`
```json
{
  "defaultProductCategory":   "fashion",
  "enabledChannels":          ["shopify", "amazon", "tiktok"],
  "defaultCurrency":          "MYR",
  "timezone":                 "Asia/Kuala_Lumpur",
  "businessRulesEnabled":     true,
  "realTimeValidationEnabled": false
}
```

**Response:** Updated `OrganizationConfigurationResponse`.

---

## GET `/{organizationId}/users/{userId}/profile`

Returns the user's profile within this organization, combining `users` + `organization_users` data.

**Path variables:**
- `{organizationId}` — must match `X-Organization-ID` header
- `{userId}` — the user whose profile to retrieve; `X-User-ID` header is the requesting user

**Response:** User profile including organization-specific role, permissions, and assigned scope.

```json
{
  "userId":         "user_abc123",
  "organizationId": "org_123",
  "email":          "merchant@example.com",
  "firstName":      "Jane",
  "lastName":       "Smith",
  "role":           "BUSINESS_MANAGER",
  "departmentId":   "dept_ops",
  "departmentName": "Operations",
  "permissions":    ["products:read", "products:write"],
  "assignedCategories": ["electronics"],
  "assignedChannels":   ["shopify", "amazon"]
}
```

---

## GET `/{organizationId}/business-rules`

Returns the organization's business rules configuration (policy settings, not the rules themselves).

**Response:** `Organization.BusinessRulesConfiguration`
```json
{
  "organizationId":         "org_123",
  "version":                "1.0",
  "lastUpdated":            "2026-04-01T12:00:00Z",
  "updatedBy":              "user_owner001",
  "businessRulesEnabled":   true,
  "autoApplyPreProcessing": true,
  "blockOnViolations":      false,
  "enableRealTimeValidation": true,
  "executionTimeout":       5000,
  "ruleCategories": {
    "pricing": {
      "enabled":         true,
      "autoApply":       true,
      "blockOnViolation": false,
      "rules": []
    },
    "validation": {
      "enabled":         true,
      "autoApply":       false,
      "blockOnViolation": true,
      "rules": []
    }
  }
}
```

This is the **policy** for when/how rules execute. The rules themselves live in `ecommerce_business_rules` and are managed via `/api/v1/ecommerce/business-rules`.

---

## PUT `/{organizationId}/business-rules`

Updates the organization's business rules configuration.

**Request body:** `Organization.BusinessRulesConfiguration` — same shape as the GET response.

**Response:** Updated `Organization.BusinessRulesConfiguration`.

---

## TypeScript Types

```typescript
// src/modules/organisation/types/organisation.ts

type SubscriptionTier = 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED' | 'PENDING';
type OrganizationUserRole =
  | 'ORGANIZATION_OWNER' | 'ORGANIZATION_ADMIN' | 'BUSINESS_MANAGER'
  | 'BUSINESS_USER' | 'ANALYST' | 'VIEWER';

interface OrganizationConfiguration {
  defaultProductCategory:    string;
  enabledChannels:           string[];
  defaultCurrency:           string;
  timezone:                  string;
  businessRulesEnabled:      boolean;
  realTimeValidationEnabled: boolean;
}

interface OrganizationConfigurationResponse {
  organizationId:   string;
  organizationName: string;
  subscriptionTier: SubscriptionTier;
  status:           OrganizationStatus;
  configuration:    OrganizationConfiguration;
}

interface RuleCategory {
  enabled:         boolean;
  autoApply:       boolean;
  blockOnViolation: boolean;
  rules:           BusinessRuleSummary[];
}

interface BusinessRuleSummary {
  ruleId:              string;
  ruleName:            string;
  priority:            number;
  enabled:             boolean;
  applicableFields:    string[];
  applicableCategories: string[];
  supportedChannels:   string[];
  configuration?:      Record<string, unknown>;
}

interface BusinessRulesConfiguration {
  organizationId:           string;
  version?:                 string;
  lastUpdated?:             string;
  updatedBy?:               string;
  businessRulesEnabled:     boolean;
  autoApplyPreProcessing:   boolean;
  blockOnViolations:        boolean;
  enableRealTimeValidation: boolean;
  executionTimeout:         number;  // milliseconds
  ruleCategories:           Record<string, RuleCategory>;
}

interface UserProfile {
  userId:             string;
  organizationId:     string;
  email:              string;
  firstName:          string;
  lastName:           string;
  role:               OrganizationUserRole;
  departmentId?:      string;
  departmentName?:    string;
  permissions:        string[];
  assignedCategories: string[];
  assignedChannels:   string[];
}
```
