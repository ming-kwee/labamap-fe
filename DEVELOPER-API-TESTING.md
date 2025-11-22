# Developer API Testing Guide 
## Real Authentication & Production API Testing

This guide helps developers test **real APIs** with **valid tokens** and **proper authentication** instead of demo mode.

---

## **Quick Start: Test Real APIs** 🚀

### **1. Environment Modes**

| Mode | Command | Description |
|------|---------|-------------|
| **Demo** | `npm run dev:demo` | Hardcoded demo data (current default) |
| **Staging API** | `npm run dev:staging` | Real staging API with authentication |
| **Local Backend** | `npm run dev:local-api` | Your local backend server |
| **Production** | `npm run build && npm start` | Full production mode |

### **2. Switch to Real API Testing**

```bash
# Stop current dev server (Ctrl+C)

# Start with staging APIs (recommended for testing)
npm run dev:staging

# OR test with your local backend
npm run dev:local-api
```

### **3. Authenticate with Real Credentials**

Open browser console and run:

```javascript
// Setup staging environment with real authentication
await devTest.setupStaging()

// OR setup local backend
await devTest.setupLocal()

// Check current configuration
devTest.showConfig()
```

---

## **Available Test Environments**

### **Staging Environment** (Recommended for Testing)
- **URL**: `https://api-staging.labamap.com/v1`
- **Test User**: `business.user@staging.labamap.com`
- **Password**: `Staging123!`
- **Organization**: ABC Electronics Corp (Staging)
- **Features**: Real API calls, business rules, multi-tenant isolation

### **Local Backend** (If you have backend running)
- **URL**: `http://localhost:8888/labamap/api/v1`
- **Test User**: `admin@localhost.dev`
- **Password**: `dev123456`
- **Organization**: Local Development Org

---

## **Testing Real APIs Step by Step**

### **Step 1: Start in Real API Mode**
```bash
npm run dev:staging
```

### **Step 2: Login with Real Credentials**
Open browser → Developer Console → Run:
```javascript
// Authenticate with staging
await devTest.setupStaging()
```

You should see:
```
🚀 Setting up real API testing...
👤 Test user: Staging business user for real API testing
🔑 Email: business.user@staging.labamap.com
🏢 Organization: staging_electronics_corp
🌐 Environment: staging
✅ Login successful!
🎯 Organization: ABC Electronics Corp
👤 User Role: BUSINESS_USER
🔗 Access Token: eyJ0eXAiOiJKV1QiLCJ...
```

### **Step 3: Test Specific APIs**
```javascript
// Test form schema generation
await devTest.testSchema()

// Test business rules execution  
await devTest.testBusinessRules()

// Test with different user (admin permissions)
await devTest.setupStagingAdmin()
```

### **Step 4: Monitor Network Tab**
Open Developer Tools → Network Tab → Look for:
- `POST /form-schema/generate` with real response
- `POST /business-rules/execute` with enhanced data
- Headers include real `Authorization: Bearer ...`

---

## **Real API Flow (When Working)**

```mermaid
graph TD
    A[Browser] --> B[Login API]
    B --> C[Get Access Token]
    C --> D[Store Token in localStorage]
    D --> E[Load Component]
    E --> F[Create Backend Context]
    F --> G[POST /form-schema/generate]
    G --> H[Real Schema Response]
    H --> I[Render Dynamic Form]
    
    style B fill:#e1f5fe
    style G fill:#e8f5e8
    style H fill:#f3e5f5
```

### **What You'll See**

**Console Output:**
```
[BackendAPIService] 🌐 PRODUCTION MODE: Making real API call
[BackendAPIService] 🔗 API URL: https://api-staging.labamap.com/v1/ecommerce/form-schema/generate
[BackendAPIService] 👤 Organization: staging_electronics_corp
[BackendAPIService] 🏢 User: business_user_456
```

**Network Tab:**
```
POST https://api-staging.labamap.com/v1/ecommerce/form-schema/generate
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
X-Organization-ID: staging_electronics_corp
X-User-ID: business_user_456
```

**Response:**
```json
{
  "organizationId": "staging_electronics_corp",
  "formId": "form_1736944567890",
  "fields": [
    // Real fields from backend based on organization
  ]
}
```

---

## **Debugging Real API Issues**

### **Common Issues & Solutions**

#### **1. "No access token available"**
```bash
# Solution: Login first
await devTest.setupStaging()
```

#### **2. "Backend API not reachable"**
```bash
# Check if staging is up
curl -I https://api-staging.labamap.com/v1/health

# OR use local backend
npm run dev:local-api
```

#### **3. "Authentication failed"**
```bash
# Check credentials in devTestingUtils.ts
# Update staging credentials if expired
```

#### **4. "Tenant isolation error"**
```bash
# Organization ID mismatch - check user belongs to org
# Verify test user setup in staging environment
```

### **Debug API Calls**

```javascript
// Enable verbose logging
localStorage.setItem('debug', 'api')

// Test specific endpoint
await DevTestingService.testApiEndpoint('/form-schema/generate', 'POST', {
  context: {
    userId: 'test_user',
    organizationId: 'staging_electronics_corp', 
    userRole: 'BUSINESS_USER',
    targetChannels: ['shopify'],
    productCategory: 'electronics'
  }
})

// Check stored tokens
console.log('Access Token:', localStorage.getItem('labamap_access_token'))
```

---

## **Environment Variables Reference**

### **.env.local** (Development - Demo Mode)
```env
NODE_ENV=development
NEXT_PUBLIC_ENABLE_DEMO_MODE=true
NEXT_PUBLIC_ENABLE_REAL_AUTH=false
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8888/labamap/api/v1
```

### **.env.staging** (Real API Testing)
```env
NODE_ENV=production
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
NEXT_PUBLIC_ENABLE_REAL_AUTH=true
NEXT_PUBLIC_BACKEND_API_URL=https://api-staging.labamap.com/v1
```

---

## **Quick Console Commands**

```javascript
// Environment switching
devTest.enableDemo()        // Switch to demo mode
devTest.disableDemo()       // Switch to real APIs
devTest.showConfig()        // Show current config

// Authentication testing  
devTest.setupLocal()        // Local backend auth
devTest.setupStaging()      // Staging environment auth
devTest.setupStagingAdmin() // Staging admin user

// API endpoint testing
devTest.testSchema()        // Test schema generation
devTest.testBusinessRules() // Test business rules

// Manual API testing
DevTestingService.testApiEndpoint('/health', 'GET')
DevTestingService.generateTestHeaders('staging_business_user')
```

---

## **Production Readiness Checklist** ✅

Before deploying to production, ensure:

- [ ] **Authentication**: Real login flow working
- [ ] **Token Management**: Proper token storage and refresh
- [ ] **Tenant Isolation**: Cross-organization data prevention
- [ ] **Error Handling**: Graceful API failure handling
- [ ] **Environment Config**: Proper production URLs
- [ ] **Security Headers**: All API calls include tenant validation
- [ ] **Performance**: API timeouts and loading states
- [ ] **Monitoring**: Error logging and analytics

---

## **Backend Requirements**

For real API testing to work, your backend must implement:

### **Authentication APIs**
- `POST /auth/login` - User authentication
- `POST /auth/refresh` - Token refresh  
- `GET /auth/session/validate` - Session validation
- `POST /auth/logout` - User logout

### **Organization APIs**
- `GET /organizations/{orgId}/business-rules/configuration` 
- `POST /ecommerce/form-schema/generate`
- `POST /ecommerce/business-rules/execute`
- `POST /ecommerce/dynamic-products/create`

### **Required Response Headers**
- Proper CORS configuration
- Tenant isolation validation in responses
- Consistent error handling with proper status codes

---

## **Next Steps**

1. **Test Demo Mode**: `npm run dev:demo` (current setup)
2. **Try Staging APIs**: `npm run dev:staging` → `devTest.setupStaging()`
3. **Setup Local Backend**: If available, use `npm run dev:local-api`
4. **Validate Token Flow**: Check network tab for real API calls
5. **Test Multi-Tenancy**: Switch between different organizations

This setup provides **complete control** over testing real vs demo APIs without confusing fallbacks!