'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/shared/contexts/AuthContext';
import SignInForm from './SignInForm';
import SignUpForm from './SignUpForm';
import { LogoutButton } from './LogoutButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import { Loader2, Package, User, Building } from '@/shared/ui/icons/Icons';

interface AuthLayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  fallbackToDemo?: boolean;
  className?: string;
}

type AuthMode = 'login' | 'signup';

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  requireAuth = true,
  fallbackToDemo = false,
  className = ""
}) => {
  const { user, organization, isAuthenticated, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Debug logging
  React.useEffect(() => {
    console.log('[AuthLayout] State change:', {
      requireAuth,
      isAuthenticated,
      isLoading,
      hasUser: !!user,
      hasOrganization: !!organization,
      authMode
    });
  }, [requireAuth, isAuthenticated, isLoading, user, organization, authMode]);

  // Switch between login and signup
  const switchToLogin = () => setAuthMode('login');
  const switchToSignUp = () => setAuthMode('signup');

  // Loading state
  if (isLoading) {
    console.log('[AuthLayout] Rendering loading state');
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-brand-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // If authentication is required and user is not authenticated
  if (requireAuth && !isAuthenticated) {
    console.log('[AuthLayout] Rendering login/signup form - requireAuth:', requireAuth, 'isAuthenticated:', isAuthenticated);
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 ${className}`}>
        <div className="w-full max-w-lg">
          {authMode === 'login' && (
            <SignInForm
              onSwitchToSignUp={switchToSignUp}
              showBackLink={false}
            />
          )}

          {authMode === 'signup' && (
            <SignUpForm
              onSwitchToLogin={switchToLogin}
            />
          )}
        </div>
      </div>
    );
  }

  // If authentication is not required or user is authenticated
  console.log('[AuthLayout] Rendering authenticated content - isAuthenticated:', isAuthenticated);
  return (
    <div className={className}>
      {children}
    </div>
  );
};

// User info display component for authenticated users
export const UserInfoCard: React.FC<{
  showLogout?: boolean;
  className?: string;
}> = ({ showLogout = true, className = "" }) => {
  const { user, organization } = useAuth();

  if (!user || !organization) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="h-5 w-5 text-brand-600" />
            <span>Account Information</span>
          </div>
          {showLogout && <LogoutButton size="sm" />}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Name:</span>
            <p className="text-sm text-gray-900 dark:text-white">
              {user.firstName} {user.lastName}
            </p>
          </div>
          
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email:</span>
            <p className="text-sm text-gray-900 dark:text-white">{user.email}</p>
          </div>
          
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Role:</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200 ml-2">
              {user.role.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center space-x-2 mb-2">
            <Building className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Organization</span>
          </div>
          
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Name:</span>
              <p className="text-sm text-gray-900 dark:text-white">{organization.organizationName}</p>
            </div>
            
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Domain:</span>
              <p className="text-sm text-gray-900 dark:text-white">{organization.businessDomain}</p>
            </div>
            
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subscription:</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 ml-2">
                {organization.subscriptionTier}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Authentication state indicator component
export const AuthStatusIndicator: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        <span className="text-sm text-gray-600 dark:text-gray-400">Checking auth...</span>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="h-2 w-2 bg-green-500 rounded-full"></div>
        <span className="text-sm text-gray-900 dark:text-white">
          {user.firstName} {user.lastName}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="h-2 w-2 bg-red-500 rounded-full"></div>
      <span className="text-sm text-gray-600 dark:text-gray-400">Not authenticated</span>
    </div>
  );
};

// Protected route wrapper
export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}> = ({ children, fallback, className = "" }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-brand-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback ? (
      <div className={className}>{fallback}</div>
    ) : (
      <AuthLayout requireAuth={true} className={className}>
        {children}
      </AuthLayout>
    );
  }

  return <div className={className}>{children}</div>;
};

// Quick auth switcher for development/testing
export const AuthSwitcher: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  if (isAuthenticated) {
    return (
      <div className={`space-y-4 ${className}`}>
        <UserInfoCard />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex space-x-2 justify-center">
        <Button
          onClick={() => setMode('login')}
          variant={mode === 'login' ? 'primary' : 'outline'}
          size="sm"
        >
          Login
        </Button>
        <Button
          onClick={() => setMode('signup')}
          variant={mode === 'signup' ? 'primary' : 'outline'}
          size="sm"
        >
          Sign Up
        </Button>
      </div>

      {mode === 'login' && (
        <SignInForm 
          onSwitchToSignUp={() => setMode('signup')} 
          showBackLink={false}
        />
      )}
      
      {mode === 'signup' && (
        <SignUpForm onSwitchToLogin={() => setMode('login')} />
      )}
    </div>
  );
};

export default AuthLayout;