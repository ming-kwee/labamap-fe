'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Types
export interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ORGANIZATION_OWNER' | 'ORGANIZATION_ADMIN' | 'BUSINESS_MANAGER' | 'BUSINESS_USER';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  lastLoginAt: string;
  permissions: string[];
}

export interface Organization {
  organizationId: string;
  organizationName: string;
  platformTenantId: string;
  businessDomain: string;
  subscriptionTier: 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED';
  settings: {
    defaultProductCategory: string;
    enabledChannels: string[];
    defaultCurrency: string;
    timezone: string;
    businessRulesEnabled: boolean;
    realTimeValidationEnabled: boolean;
  };
  features: {
    maxProducts: number;
    maxUsers: number;
    businessRulesLimit: string;
    channelIntegrations: string[];
    advancedAnalytics: boolean;
    customBranding: boolean;
  };
}

export interface UserOrganizationRole {
  role: string;
  departmentId: string;
  departmentName: string;
  permissions: string[];
  assignedCategories: string[];
  assignedChannels: string[];
  businessRulesPermissions: {
    canCreateRules: boolean;
    canModifyRules: boolean;
    canViewRules: boolean;
    assignedRuleCategories: string[];
  };
}

export interface SessionInfo {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  loginTimestamp: string;
  lastActivityTimestamp: string;
}

export interface AuthenticationResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  tokenExpiresIn: number;
  user: User;
  organization: Organization;
  userOrganizationRole: UserOrganizationRole;
  sessionInfo: SessionInfo;
}

export interface SignUpRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  businessDomain: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  userOrganizationRole: UserOrganizationRole | null;
  sessionInfo: SessionInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (signUpData: SignUpRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  validateSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token Management
class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'labamap_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'labamap_refresh_token';
  private static readonly USER_DATA_KEY = 'labamap_user_data';
  private static readonly ORG_DATA_KEY = 'labamap_org_data';

  static setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  static getAccessToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    }
    return null;
  }

  static getRefreshToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    }
    return null;
  }

  static setUserData(user: User, organization: Organization, userOrganizationRole: UserOrganizationRole): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.USER_DATA_KEY, JSON.stringify(user));
      localStorage.setItem(this.ORG_DATA_KEY, JSON.stringify({ organization, userOrganizationRole }));
    }
  }

  static getUserData(): { user: User; organization: Organization; userOrganizationRole: UserOrganizationRole } | null {
    if (typeof window !== 'undefined') {
      const userData = localStorage.getItem(this.USER_DATA_KEY);
      const orgData = localStorage.getItem(this.ORG_DATA_KEY);
      
      if (userData && orgData) {
        try {
          const user = JSON.parse(userData);
          const { organization, userOrganizationRole } = JSON.parse(orgData);
          return { user, organization, userOrganizationRole };
        } catch (error) {
          console.error('Error parsing stored user data:', error);
        }
      }
    }
    return null;
  }

  static clearTokens(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.ACCESS_TOKEN_KEY);
      localStorage.removeItem(this.REFRESH_TOKEN_KEY);
      localStorage.removeItem(this.USER_DATA_KEY);
      localStorage.removeItem(this.ORG_DATA_KEY);
    }
  }
}

// Authentication Service
class AuthService {
  private static readonly API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8888/labamap/api/v1';
  private static readonly PLATFORM_ID = process.env.NEXT_PUBLIC_PLATFORM_ID || 'web-application';

  static async login(email: string, password: string): Promise<AuthenticationResponse> {
    const response = await fetch(`${this.API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        platformId: this.PLATFORM_ID
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Login failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.authenticationResponse || data;
  }

  static async signUp(signUpData: SignUpRequest): Promise<AuthenticationResponse> {
    const response = await fetch(`${this.API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...signUpData,
        platformId: this.PLATFORM_ID
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Registration failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.authenticationResponse || data;
  }

  static async refreshToken(): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = TokenManager.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${this.API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }

  static async validateSession(): Promise<any> {
    const accessToken = TokenManager.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const userData = TokenManager.getUserData();
    if (!userData) {
      throw new Error('No user data available');
    }

    const response = await fetch(`${this.API_BASE_URL}/auth/session/validate`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Organization-ID': userData.organization.organizationId,
        'X-User-ID': userData.user.userId,
      },
    });

    if (!response.ok) {
      throw new Error('Session validation failed');
    }

    return response.json();
  }

  static async logout(): Promise<void> {
    const accessToken = TokenManager.getAccessToken();
    if (accessToken) {
      try {
        await fetch(`${this.API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
      } catch (error) {
        console.error('Logout API call failed:', error);
        // Continue with local cleanup even if API call fails
      }
    }

    TokenManager.clearTokens();
  }
}

// Custom error for tenant isolation violations
export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}


// AuthProvider Component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userOrganizationRole, setUserOrganizationRole] = useState<UserOrganizationRole | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from stored tokens
  const initializeAuthState = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Check for stored authentication tokens
      const accessToken = TokenManager.getAccessToken();
      const userData = TokenManager.getUserData();

      if (accessToken && userData) {
        // Try to validate the session
        try {
          const sessionValidation = await AuthService.validateSession();
          
          if (sessionValidation.sessionValidation?.valid) {
            setUser(userData.user);
            setOrganization(userData.organization);
            setUserOrganizationRole(userData.userOrganizationRole);
            
            console.log('[AuthProvider] Session validated successfully');
          } else {
            // Session invalid, clear tokens
            console.log('[AuthProvider] Session invalid, clearing tokens');
            TokenManager.clearTokens();
          }
        } catch (error) {
          console.log('[AuthProvider] Session validation failed, clearing tokens:', error);
          TokenManager.clearTokens();
        }
      } else {
        // No stored auth - user needs to log in
        console.log('[AuthProvider] No stored authentication, user needs to log in');
      }
    } catch (error) {
      console.error('[AuthProvider] Authentication initialization failed:', error);
      TokenManager.clearTokens();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeAuthState();
  }, [initializeAuthState]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    
    try {
      const response = await AuthService.login(email, password);
      
      // Validate tenant isolation
      if (!response.organization?.organizationId || !response.user?.userId) {
        throw new TenantIsolationError('Invalid authentication response - missing organization or user data');
      }

      // Store tokens and user data
      TokenManager.setTokens(response.accessToken, response.refreshToken);
      TokenManager.setUserData(response.user, response.organization, response.userOrganizationRole);

      // Update state
      setUser(response.user);
      setOrganization(response.organization);
      setUserOrganizationRole(response.userOrganizationRole);
      setSessionInfo(response.sessionInfo);

      console.log('[AuthProvider] Login successful for organization:', response.organization.organizationName);
      console.log('[AuthProvider] User state updated:', response.user.email);
      console.log('[AuthProvider] Authentication should now be true');
    } catch (error) {
      console.error('[AuthProvider] Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await AuthService.logout();
    } catch (error) {
      console.error('[AuthProvider] Logout error:', error);
    } finally {
      // Clear state regardless of API call success
      setUser(null);
      setOrganization(null);
      setUserOrganizationRole(null);
      setSessionInfo(null);
      setIsLoading(false);
      
      console.log('[AuthProvider] Logout completed');
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const tokens = await AuthService.refreshToken();
      TokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
      
      console.log('[AuthProvider] Token refreshed successfully');
    } catch (error) {
      console.error('[AuthProvider] Token refresh failed:', error);
      // If refresh fails, logout the user
      await logout();
      throw error;
    }
  }, [logout]);

  const signUp = useCallback(async (signUpData: SignUpRequest) => {
    setIsLoading(true);
    
    try {
      const response = await AuthService.signUp(signUpData);
      
      // Validate tenant isolation
      if (!response.organization?.organizationId || !response.user?.userId) {
        throw new TenantIsolationError('Invalid registration response - missing organization or user data');
      }

      // Store tokens and user data
      TokenManager.setTokens(response.accessToken, response.refreshToken);
      TokenManager.setUserData(response.user, response.organization, response.userOrganizationRole);

      // Update state
      setUser(response.user);
      setOrganization(response.organization);
      setUserOrganizationRole(response.userOrganizationRole);
      setSessionInfo(response.sessionInfo);

      console.log('[AuthProvider] Registration successful for organization:', response.organization.organizationName);
    } catch (error) {
      console.error('[AuthProvider] Registration failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const sessionValidation = await AuthService.validateSession();
      return sessionValidation.sessionValidation?.valid || false;
    } catch (error) {
      console.error('[AuthProvider] Session validation failed:', error);
      return false;
    }
  }, []);

  const isAuthenticated = !!user && !!organization;
  
  // Debug logging for authentication state
  React.useEffect(() => {
    console.log('[AuthProvider] State update:', {
      hasUser: !!user,
      hasOrganization: !!organization,
      isAuthenticated,
      isLoading,
      userEmail: user?.email || 'none'
    });
  }, [user, organization, isAuthenticated, isLoading]);

  const contextValue: AuthContextType = {
    user,
    organization,
    userOrganizationRole,
    sessionInfo,
    isAuthenticated,
    isLoading,
    login,
    signUp,
    logout,
    refreshToken,
    validateSession,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;