'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth, TenantIsolationError } from './AuthContext';

// Types for Organization Configuration
export interface OrganizationConfiguration {
  organizationId: string;
  organizationName: string;
  lastUpdated: string;
  configuration: {
    branding: {
      primaryColor: string;
      secondaryColor: string;
      logoUrl: string;
      brandName: string;
      tagline: string;
    };
    businessSettings: {
      defaultProductCategory: string;
      enabledChannels: string[];
      primaryChannels: string[];
      defaultCurrency: string;
      supportedCurrencies: string[];
      timezone: string;
      businessHours: {
        start: string;
        end: string;
        timezone: string;
      };
    };
    productManagement: {
      defaultSKUPattern: string;
      autoGenerateSKU: boolean;
      requireUniqueNames: boolean;
      maxProductsPerUser: number;
      enableVariants: boolean;
      maxVariantsPerProduct: number;
      imageRequirements: {
        minResolution: { width: number; height: number };
        maxFileSize: string;
        supportedFormats: string[];
        maxImagesPerProduct: number;
      };
    };
    businessRules: {
      enabled: boolean;
      autoApplyPreProcessing: boolean;
      blockOnViolations: boolean;
      enableRealTimeValidation: boolean;
      executionTimeout: number;
      customRulesEnabled: boolean;
      ruleVersioning: boolean;
    };
    integrations: {
      enabledChannels: Record<string, {
        enabled: boolean;
        storeUrl?: string;
        sellerId?: string;
        partnerId?: string;
        marketplace?: string;
        syncFrequency: string;
        autoPublish: boolean;
      }>;
      webhooks: {
        enabled: boolean;
        endpoints: Array<{
          event: string;
          url: string;
        }>;
      };
    };
    analytics: {
      enabled: boolean;
      retentionPeriod: string;
      customDashboards: boolean;
      realTimeReports: boolean;
      exportFormats: string[];
    };
  };
}

export interface Permission {
  name: string;
  description: string;
  category: string;
}

export interface BusinessRulesConfiguration {
  organizationId: string;
  organizationName: string;
  platformTenantId: string;
  businessRulesConfig: {
    version: string;
    lastUpdated: string;
    updatedBy: string;
    globalSettings: {
      businessRulesEnabled: boolean;
      autoApplyPreProcessing: boolean;
      blockOnViolations: boolean;
      enableRealTimeValidation: boolean;
      executionTimeout: number;
    };
    ruleCategories: {
      PRE_PROCESSING: any;
      BUSINESS_LOGIC: any;
      DATA_ENHANCEMENT: any;
    };
  };
}

interface OrganizationContextType {
  organizationConfig: OrganizationConfiguration | null;
  businessRulesConfig: BusinessRulesConfiguration | null;
  userPermissions: Permission[];
  isLoading: boolean;
  error: string | null;
  
  // Helper functions
  hasPermission: (permission: string) => boolean;
  getAssignedCategories: () => string[];
  getAssignedChannels: () => string[];
  getEnabledChannels: () => string[];
  getPrimaryChannels: () => string[];
  
  // Data refresh functions
  refreshConfiguration: () => Promise<void>;
  refreshBusinessRules: () => Promise<void>;
  updateConfiguration: (config: Partial<OrganizationConfiguration>) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

// Organization Service
class OrganizationService {
  private static readonly API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8888/labamap/api/v1';

  private static getAuthHeaders(): Record<string, string> {
    // Development mode: Use demo authentication
    if (process.env.NODE_ENV === 'development') {
      return {
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'labamap_tenant_abc',
        'X-Organization-ID': 'company_abc_12345',
        'X-User-ID': 'demo_user_123',
        'Authorization': 'Bearer demo_token_development'
      };
    }

    const accessToken = localStorage.getItem('labamap_access_token');
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const userData = localStorage.getItem('labamap_user_data');
    const orgData = localStorage.getItem('labamap_org_data');
    
    if (!userData || !orgData) {
      throw new Error('No user or organization data available');
    }

    const user = JSON.parse(userData);
    const { organization } = JSON.parse(orgData);

    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': organization.organizationId,
      'X-User-ID': user.userId,
    };
  }

  static async getConfiguration(organizationId: string): Promise<OrganizationConfiguration> {
    try {
      const headers = this.getAuthHeaders();
      
      const response = await fetch(`${this.API_BASE_URL}/organizations/${organizationId}/configuration`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to get organization configuration: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validate tenant isolation
      if (data.organizationConfiguration?.organizationId !== organizationId) {
        throw new TenantIsolationError('Organization configuration data mismatch - security violation');
      }

      return data.organizationConfiguration;
    } catch (error) {
      console.error('[OrganizationService] Failed to get configuration:', error);
      throw error;
    }
  }

  static async getBusinessRules(organizationId: string): Promise<BusinessRulesConfiguration> {
    const headers = this.getAuthHeaders();

    // Business rules endpoint: GET /api/v1/ecommerce/business-rules
    const response = await fetch(`${this.API_BASE_URL}/ecommerce/business-rules`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch business rules: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.success || !data.rules) {
      throw new Error('Invalid business rules response format - missing success or rules');
    }

    // Group rules by type
    const rulesByType = {
      PRE_PROCESSING: data.rules.filter((r: any) => r.ruleType === 'PRE_PROCESSING'),
      BUSINESS_LOGIC: data.rules.filter((r: any) => r.ruleType === 'BUSINESS_LOGIC'),
      DATA_ENHANCEMENT: data.rules.filter((r: any) => r.ruleType === 'DATA_ENHANCEMENT')
    };

    // Transform backend response to expected frontend structure
    const businessRulesConfig: BusinessRulesConfiguration = {
      organizationId: organizationId,
      organizationName: '', // Not provided by backend
      platformTenantId: '', // Not provided by backend
      businessRulesConfig: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        updatedBy: 'system',
        globalSettings: {
          businessRulesEnabled: data.rules.length > 0,
          autoApplyPreProcessing: rulesByType.PRE_PROCESSING.some((r: any) => r.enabled),
          blockOnViolations: rulesByType.BUSINESS_LOGIC.some((r: any) => r.enabled),
          enableRealTimeValidation: true,
          executionTimeout: 5000
        },
        ruleCategories: {
          PRE_PROCESSING: {
            enabled: rulesByType.PRE_PROCESSING.some((r: any) => r.enabled),
            autoApply: true,
            rules: rulesByType.PRE_PROCESSING
          },
          BUSINESS_LOGIC: {
            enabled: rulesByType.BUSINESS_LOGIC.some((r: any) => r.enabled),
            blockOnViolation: true,
            rules: rulesByType.BUSINESS_LOGIC
          },
          DATA_ENHANCEMENT: {
            enabled: rulesByType.DATA_ENHANCEMENT.some((r: any) => r.enabled),
            autoApply: false,
            rules: rulesByType.DATA_ENHANCEMENT
          }
        }
      }
    };

    console.log('[OrganizationService] ✓ Business rules loaded:', {
      total: data.rules.length,
      preProcessing: rulesByType.PRE_PROCESSING.length,
      businessLogic: rulesByType.BUSINESS_LOGIC.length,
      dataEnhancement: rulesByType.DATA_ENHANCEMENT.length
    });

    return businessRulesConfig;
  }

  static async getUserProfile(organizationId: string, userId: string): Promise<any> {
    try {
      // Development mode: Return demo user profile
      if (process.env.NODE_ENV === 'development') {
        console.log('[OrganizationService] Development mode: Using demo user profile');
        return {
          userProfile: {
            userId,
            organizationId,
            firstName: "Demo",
            lastName: "User",
            email: "demo@abcelectronics.com",
            role: "BUSINESS_USER",
            permissions: ["CREATE_PRODUCTS", "EDIT_PRODUCTS", "VIEW_ANALYTICS", "USE_BUSINESS_RULES"],
            preferences: {
              theme: "light",
              language: "en",
              timezone: "America/New_York"
            },
            lastLoginAt: new Date().toISOString(),
            status: "ACTIVE"
          }
        };
      }

      const headers = this.getAuthHeaders();
      
      const response = await fetch(`${this.API_BASE_URL}/organizations/${organizationId}/users/${userId}/profile`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to get user profile: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validate tenant isolation
      if (data.userProfile?.organizationId !== organizationId || data.userProfile?.userId !== userId) {
        throw new TenantIsolationError('User profile data mismatch - security violation');
      }

      return data.userProfile;
    } catch (error) {
      console.error('[OrganizationService] Failed to get user profile:', error);
      throw error;
    }
  }

  static async updateConfiguration(organizationId: string, config: Partial<OrganizationConfiguration>): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      
      const response = await fetch(`${this.API_BASE_URL}/organizations/${organizationId}/configuration`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`Failed to update organization configuration: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[OrganizationService] Failed to update configuration:', error);
      throw error;
    }
  }
}

// OrganizationProvider Component
export const OrganizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, organization, userOrganizationRole, isAuthenticated } = useAuth();
  
  const [organizationConfig, setOrganizationConfig] = useState<OrganizationConfiguration | null>(null);
  const [businessRulesConfig, setBusinessRulesConfig] = useState<BusinessRulesConfiguration | null>(null);
  const [userPermissions, setUserPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load organization configuration
  const loadOrganizationConfiguration = useCallback(async () => {
    if (!organization?.organizationId || !isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('[OrganizationProvider] Loading configuration for organization:', organization.organizationName);
      
      // In development mode, use local JSON data instead of API calls
      if (process.env.NODE_ENV === 'development') {
        console.log('[OrganizationProvider] Development mode: Using local demo data');
        
        // Create demo organization configuration based on organization data
        const demoConfig: OrganizationConfiguration = {
          organizationId: organization.organizationId,
          organizationName: organization.organizationName,
          lastUpdated: new Date().toISOString(),
          configuration: {
            branding: {
              primaryColor: "#3B82F6",
              secondaryColor: "#1E40AF",
              logoUrl: "/logo.svg",
              brandName: organization.organizationName,
              tagline: "Excellence in " + organization.businessDomain
            },
            businessSettings: {
              defaultProductCategory: organization.settings.defaultProductCategory,
              enabledChannels: organization.settings.enabledChannels,
              primaryChannels: organization.settings.enabledChannels.slice(0, 2),
              defaultCurrency: organization.settings.defaultCurrency,
              supportedCurrencies: ["USD", "EUR", "GBP", "CAD"],
              timezone: organization.settings.timezone,
              businessHours: {
                start: "09:00",
                end: "17:00",
                timezone: organization.settings.timezone
              }
            },
            productManagement: {
              defaultSKUPattern: "${categoryCode}-${brandCode}-${hash}",
              autoGenerateSKU: true,
              requireUniqueNames: true,
              maxProductsPerUser: organization.features.maxProducts,
              enableVariants: true,
              maxVariantsPerProduct: 50,
              imageRequirements: {
                minResolution: { width: 800, height: 600 },
                maxFileSize: "5MB",
                supportedFormats: ["jpg", "png", "webp"],
                maxImagesPerProduct: 10
              }
            },
            businessRules: {
              enabled: organization.settings.businessRulesEnabled,
              autoApplyPreProcessing: true,
              blockOnViolations: true,
              enableRealTimeValidation: organization.settings.realTimeValidationEnabled,
              executionTimeout: 5000,
              customRulesEnabled: organization.features.businessRulesLimit === "unlimited",
              ruleVersioning: true
            },
            integrations: {
              enabledChannels: organization.settings.enabledChannels.reduce((acc, channel) => ({
                ...acc,
                [channel]: {
                  enabled: true,
                  syncFrequency: "realtime",
                  autoPublish: true
                }
              }), {}),
              webhooks: {
                enabled: false,
                endpoints: []
              }
            },
            analytics: {
              enabled: organization.features.advancedAnalytics,
              retentionPeriod: "90_days",
              customDashboards: organization.features.advancedAnalytics,
              realTimeReports: true,
              exportFormats: ["csv", "xlsx", "json"]
            }
          }
        };
        
        setOrganizationConfig(demoConfig);
        console.log('[OrganizationProvider] Demo configuration loaded successfully');
      } else {
        // Production mode - use real API
        const config = await OrganizationService.getConfiguration(organization.organizationId);
        setOrganizationConfig(config);
        console.log('[OrganizationProvider] Configuration loaded successfully');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load organization configuration';
      console.error('[OrganizationProvider] Configuration load failed:', error);
      setError(errorMessage);
      
      if (error instanceof TenantIsolationError) {
        // Critical security violation - should trigger logout
        console.error('[OrganizationProvider] SECURITY VIOLATION: Tenant isolation error detected');
      }
    } finally {
      setIsLoading(false);
    }
  }, [organization, isAuthenticated]);

  // Load business rules configuration
  const loadBusinessRules = useCallback(async () => {
    if (!organization?.organizationId || !isAuthenticated) return;

    try {
      console.log('[OrganizationProvider] Loading business rules for organization:', organization.organizationName);

      const businessRules = await OrganizationService.getBusinessRules(organization.organizationId);

      setBusinessRulesConfig(businessRules);

      const totalRules = businessRules.businessRulesConfig.ruleCategories.PRE_PROCESSING.rules.length +
                         businessRules.businessRulesConfig.ruleCategories.BUSINESS_LOGIC.rules.length +
                         businessRules.businessRulesConfig.ruleCategories.DATA_ENHANCEMENT.rules.length;

      console.log('[OrganizationProvider] ✓ Business rules loaded successfully:', {
        totalRules,
        enabled: businessRules.businessRulesConfig.globalSettings.businessRulesEnabled
      });
    } catch (error) {
      console.error('[OrganizationProvider] Failed to load business rules:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error loading business rules';
      setError(errorMessage);
    }
  }, [organization, isAuthenticated]);

  // Load user permissions
  const loadUserPermissions = useCallback(async () => {
    if (!organization?.organizationId || !user?.userId || !isAuthenticated) return;

    try {
      console.log('[OrganizationProvider] Loading user permissions for user:', user.email);
      
      // Development mode: Use demo permissions
      if (process.env.NODE_ENV === 'development') {
        console.log('[OrganizationProvider] Development mode: Using demo user permissions');
        const demoPermissions: Permission[] = [
          { name: 'CREATE_PRODUCTS', description: 'Permission: CREATE_PRODUCTS', category: 'products' },
          { name: 'EDIT_PRODUCTS', description: 'Permission: EDIT_PRODUCTS', category: 'products' },
          { name: 'VIEW_ANALYTICS', description: 'Permission: VIEW_ANALYTICS', category: 'analytics' },
          { name: 'USE_BUSINESS_RULES', description: 'Permission: USE_BUSINESS_RULES', category: 'business_rules' },
          { name: 'MANAGE_VARIANTS', description: 'Permission: MANAGE_VARIANTS', category: 'products' },
          { name: 'MANAGE_CHANNELS', description: 'Permission: MANAGE_CHANNELS', category: 'channels' }
        ];
        
        setUserPermissions(demoPermissions);
        console.log('[OrganizationProvider] Demo user permissions loaded:', demoPermissions.length);
        return;
      }
      
      const userProfile = await OrganizationService.getUserProfile(organization.organizationId, user.userId);
      
      // Convert permissions to Permission objects
      const permissions: Permission[] = userProfile.organizationRole?.permissions?.map((permission: string) => ({
        name: permission,
        description: `Permission: ${permission}`,
        category: 'general'
      })) || [];
      
      setUserPermissions(permissions);
      
      console.log('[OrganizationProvider] User permissions loaded:', permissions.length);
    } catch (error) {
      console.error('[OrganizationProvider] User permissions load failed:', error);
      // Fallback to permissions from auth context
      if (user?.permissions) {
        const fallbackPermissions: Permission[] = user.permissions.map(permission => ({
          name: permission,
          description: `Permission: ${permission}`,
          category: 'general'
        }));
        setUserPermissions(fallbackPermissions);
      }
    }
  }, [organization, user, isAuthenticated]);

  // Load all data when organization or authentication changes
  useEffect(() => {
    if (isAuthenticated && organization && user) {
      loadOrganizationConfiguration();
      loadBusinessRules();
      loadUserPermissions();
    } else {
      // Clear data when not authenticated
      setOrganizationConfig(null);
      setBusinessRulesConfig(null);
      setUserPermissions([]);
      setError(null);
    }
  }, [isAuthenticated, organization, user, loadOrganizationConfiguration, loadBusinessRules, loadUserPermissions]);

  // Helper functions
  const hasPermission = useCallback((permission: string): boolean => {
    return userPermissions.some(p => p.name === permission) || user?.permissions?.includes(permission) || false;
  }, [userPermissions, user]);

  const getAssignedCategories = useCallback((): string[] => {
    return userOrganizationRole?.assignedCategories || [];
  }, [userOrganizationRole]);

  const getAssignedChannels = useCallback((): string[] => {
    return userOrganizationRole?.assignedChannels || organization?.settings?.enabledChannels || [];
  }, [userOrganizationRole, organization]);

  const getEnabledChannels = useCallback((): string[] => {
    return organizationConfig?.configuration?.businessSettings?.enabledChannels || 
           organization?.settings?.enabledChannels || 
           [];
  }, [organizationConfig, organization]);

  const getPrimaryChannels = useCallback((): string[] => {
    return organizationConfig?.configuration?.businessSettings?.primaryChannels || 
           getEnabledChannels().slice(0, 2); // Default to first 2 enabled channels
  }, [organizationConfig, getEnabledChannels]);

  // Data refresh functions
  const refreshConfiguration = useCallback(async () => {
    await loadOrganizationConfiguration();
  }, [loadOrganizationConfiguration]);

  const refreshBusinessRules = useCallback(async () => {
    await loadBusinessRules();
  }, [loadBusinessRules]);

  const updateConfiguration = useCallback(async (config: Partial<OrganizationConfiguration>) => {
    if (!organization?.organizationId) {
      throw new Error('No organization available for configuration update');
    }

    await OrganizationService.updateConfiguration(organization.organizationId, config);
    await refreshConfiguration();
  }, [organization, refreshConfiguration]);

  const contextValue: OrganizationContextType = {
    organizationConfig,
    businessRulesConfig,
    userPermissions,
    isLoading,
    error,
    hasPermission,
    getAssignedCategories,
    getAssignedChannels,
    getEnabledChannels,
    getPrimaryChannels,
    refreshConfiguration,
    refreshBusinessRules,
    updateConfiguration,
  };

  return (
    <OrganizationContext.Provider value={contextValue}>
      {children}
    </OrganizationContext.Provider>
  );
};

// Hook to use organization context
export const useOrganization = (): OrganizationContextType => {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

export default OrganizationContext;