/**
 * Development Testing Utilities for Real API Testing
 * 
 * This file provides utilities for developers to test real API endpoints
 * with proper authentication and tokens during development.
 */

export interface TestCredentials {
  email: string;
  password: string;
  organizationId?: string;
  environment: 'local' | 'staging' | 'production';
}

export interface TestUser {
  credentials: TestCredentials;
  description: string;
  permissions: string[];
  channels: string[];
}

// Test users for different environments
export const TEST_USERS: Record<string, TestUser> = {
  // Local backend testing (if you have local backend running)
  local_admin: {
    credentials: {
      email: 'admin@localhost.dev',
      password: 'dev123456',
      organizationId: 'local_org_001',
      environment: 'local'
    },
    description: 'Local admin user for backend testing',
    permissions: ['CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'DELETE_PRODUCTS', 'MANAGE_BUSINESS_RULES'],
    channels: ['shopify', 'amazon', 'walmart']
  },
  
  // Staging environment testing
  staging_business_user: {
    credentials: {
      email: 'business.user@staging.labamap.com',
      password: 'Staging123!',
      organizationId: 'staging_electronics_corp',
      environment: 'staging'
    },
    description: 'Staging business user for real API testing',
    permissions: ['CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'USE_BUSINESS_RULES'],
    channels: ['shopify', 'amazon']
  },
  
  staging_admin: {
    credentials: {
      email: 'admin@staging.labamap.com', 
      password: 'StagingAdmin123!',
      organizationId: 'staging_electronics_corp',
      environment: 'staging'
    },
    description: 'Staging admin with full permissions',
    permissions: ['*'], // All permissions
    channels: ['shopify', 'amazon', 'walmart', 'ebay']
  }
};

/**
 * Development Testing Service
 */
export class DevTestingService {
  
  /**
   * Quick setup for testing real APIs
   */
  static async setupRealApiTesting(testUserKey: string): Promise<void> {
    const testUser = TEST_USERS[testUserKey];
    if (!testUser) {
      throw new Error(`Test user '${testUserKey}' not found. Available: ${Object.keys(TEST_USERS).join(', ')}`);
    }

    console.log('🚀 Setting up real API testing...');
    console.log('👤 Test user:', testUser.description);
    console.log('🔑 Email:', testUser.credentials.email);
    console.log('🏢 Organization:', testUser.credentials.organizationId);
    console.log('🌐 Environment:', testUser.credentials.environment);

    // Update environment variables dynamically
    this.setEnvironmentForTesting(testUser.credentials.environment);

    // Attempt login
    try {
      const { AuthService } = await import('../context/AuthContext');
      const response = await AuthService.login(
        testUser.credentials.email,
        testUser.credentials.password
      );

      console.log('✅ Login successful!');
      console.log('🎯 Organization:', response.organization?.organizationName);
      console.log('👤 User Role:', response.user?.role);
      console.log('🔗 Access Token:', response.accessToken?.substring(0, 20) + '...');
      
      return response;
    } catch (error) {
      console.error('❌ Login failed:', error);
      console.log('💡 Make sure the backend is running and credentials are correct');
      throw error;
    }
  }

  /**
   * Generate valid API request headers for testing
   */
  static generateTestHeaders(testUserKey: string): Record<string, string> {
    const testUser = TEST_USERS[testUserKey];
    if (!testUser) {
      throw new Error(`Test user '${testUserKey}' not found`);
    }

    // Get stored access token
    const accessToken = typeof window !== 'undefined' 
      ? localStorage.getItem('labamap_access_token') 
      : null;

    if (!accessToken) {
      throw new Error('No access token found. Run setupRealApiTesting() first');
    }

    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': testUser.credentials.organizationId!,
      'X-User-ID': 'test_user_' + testUserKey,
      'X-User-Role': 'BUSINESS_USER',
      'X-Request-Source': 'development-testing',
      'X-Timestamp': Date.now().toString()
    };
  }

  /**
   * Test API endpoint directly
   */
  static async testApiEndpoint(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any,
    testUserKey: string = 'staging_business_user'
  ): Promise<any> {
    const config = this.getBackendConfig();
    const url = `${config.baseUrl}${endpoint}`;
    const headers = this.generateTestHeaders(testUserKey);

    console.log(`🧪 Testing ${method} ${url}`);
    console.log('📋 Headers:', headers);
    
    if (body) {
      console.log('📦 Body:', JSON.stringify(body, null, 2));
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(config.timeout)
      });

      console.log('📡 Response Status:', response.status, response.statusText);
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('❌ API Error:', data);
        throw new Error(`API Error: ${response.status} - ${JSON.stringify(data)}`);
      }

      console.log('✅ API Success:', data);
      return data;
      
    } catch (error) {
      console.error('💥 Request failed:', error);
      throw error;
    }
  }

  /**
   * Set environment variables for testing
   */
  private static setEnvironmentForTesting(environment: 'local' | 'staging' | 'production'): void {
    const envUrls = {
      local: 'http://localhost:8888/labamap/api/v1',
      staging: 'https://api-staging.labamap.com/v1',
      production: 'https://api.labamap.com/v1'
    };

    // Update process.env (note: this only works in development)
    if (typeof window !== 'undefined') {
      (window as any).__LABAMAP_DEV_CONFIG = {
        NEXT_PUBLIC_BACKEND_API_URL: envUrls[environment],
        NEXT_PUBLIC_ENABLE_REAL_AUTH: 'true',
        NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
        NODE_ENV: environment === 'local' ? 'development' : 'production'
      };
    }

    console.log(`🔧 Environment configured for: ${environment}`);
    console.log(`🌐 API URL: ${envUrls[environment]}`);
  }

  private static getBackendConfig() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8888/labamap/api/v1';
    
    return {
      baseUrl: `${baseUrl}/ecommerce`,
      isDevelopment,
      timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '10000', 10)
    };
  }
}

/**
 * Quick testing functions for console usage
 */
export const devTest = {
  // Quick setup functions
  setupLocal: () => DevTestingService.setupRealApiTesting('local_admin'),
  setupStaging: () => DevTestingService.setupRealApiTesting('staging_business_user'),
  setupStagingAdmin: () => DevTestingService.setupRealApiTesting('staging_admin'),

  // Quick API tests
  testSchema: (userKey = 'staging_business_user') => 
    DevTestingService.testApiEndpoint('/form-schema/generate', 'POST', {
      context: {
        userId: 'test_user',
        organizationId: TEST_USERS[userKey]?.credentials.organizationId,
        userRole: 'BUSINESS_USER',
        targetChannels: ['shopify'],
        productCategory: 'electronics',
        permissions: ['CREATE_PRODUCTS']
      }
    }, userKey),

  testBusinessRules: (userKey = 'staging_business_user') =>
    DevTestingService.testApiEndpoint('/business-rules/execute', 'POST', {
      ruleType: 'PRE_PROCESSING',
      fieldName: 'name',
      formData: { name: 'Test Product' },
      context: {
        userId: 'test_user',
        organizationId: TEST_USERS[userKey]?.credentials.organizationId,
        userRole: 'BUSINESS_USER'
      }
    }, userKey),

  // Environment switching
  enableDemo: () => {
    if (typeof window !== 'undefined') {
      (window as any).__LABAMAP_DEV_CONFIG = {
        NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true',
        NEXT_PUBLIC_ENABLE_REAL_AUTH: 'false'
      };
    }
    console.log('🧪 Demo mode enabled - refresh page to take effect');
  },

  disableDemo: () => {
    if (typeof window !== 'undefined') {
      (window as any).__LABAMAP_DEV_CONFIG = {
        NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
        NEXT_PUBLIC_ENABLE_REAL_AUTH: 'true'
      };
    }
    console.log('🌐 Real API mode enabled - refresh page to take effect');
  },

  // Show current config
  showConfig: () => {
    console.log('🔧 Current Configuration:');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('BACKEND_URL:', process.env.NEXT_PUBLIC_BACKEND_API_URL);
    console.log('DEMO_MODE:', process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE);
    console.log('REAL_AUTH:', process.env.NEXT_PUBLIC_ENABLE_REAL_AUTH);
    
    if (typeof window !== 'undefined') {
      const devConfig = (window as any).__LABAMAP_DEV_CONFIG;
      if (devConfig) {
        console.log('🧪 Dev Overrides:', devConfig);
      }
    }
  }
};

// Make available globally for easy console access
if (typeof window !== 'undefined') {
  (window as any).devTest = devTest;
  (window as any).DevTestingService = DevTestingService;
}

export default DevTestingService;