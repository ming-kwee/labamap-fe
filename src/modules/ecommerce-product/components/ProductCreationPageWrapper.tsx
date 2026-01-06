'use client';

import React from 'react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useOrganization } from '@/shared/contexts/OrganizationContext';
import DynamicProductCreationFormRefactored from './DynamicProductCreationFormRefactored';
import { MasterProduct } from '../types/product';

interface ProductCreationPageWrapperProps {
  onProductCreated: (product: MasterProduct, availableChannels: string[]) => void;
  debugMode?: boolean;
}

export default function ProductCreationPageWrapper({
  onProductCreated,
  debugMode = false
}: ProductCreationPageWrapperProps) {
  const { user, organization, isAuthenticated, isLoading: authLoading } = useAuth();
  const { organizationConfig, businessRulesConfig, isLoading: orgLoading } = useOrganization();

  // 🐛 DEBUG: Component lifecycle tracking
  console.log('🔄🐛 [ProductCreationPageWrapper] Rendering - Component lifecycle', {
    timestamp: new Date().toISOString(),
    authLoading,
    orgLoading,
    hasUser: !!user,
    hasOrg: !!organization,
    hasOrgConfig: !!organizationConfig,
    hasBusinessRules: !!businessRulesConfig,
    defaultCategory: organization?.settings?.defaultProductCategory || 'none'
  });

  // Show loading while contexts are initializing
  if (authLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading organization configuration...</p>
        </div>
      </div>
    );
  }

  // Show error if auth fails
  if (!isAuthenticated || !user || !organization) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600 mb-4">
            You need to be logged in to access the product creation interface.
          </p>
          <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
            <strong>Development Mode:</strong> Demo authentication should auto-load.
            If you see this message, there may be a configuration issue.
          </div>
        </div>
      </div>
    );
  }

  // Show organization info
  return (
    <div className="space-y-4">
      {/* Organization Info Bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-blue-900">
              {organization.organizationName}
            </h4>
            <p className="text-sm text-blue-700">
              {organization.businessDomain} • {organization.subscriptionTier}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-blue-700">
              <strong>User:</strong> {user.firstName} {user.lastName}
            </div>
            <div className="text-sm text-blue-600">
              {user.role}
            </div>
          </div>
        </div>
        
        {/* Business Rules Status */}
        {businessRulesConfig && (
          <div className="mt-3 pt-3 border-t border-blue-200">
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <span className={`w-2 h-2 rounded-full ${
                  businessRulesConfig.businessRulesConfig.globalSettings.businessRulesEnabled 
                    ? 'bg-green-500' 
                    : 'bg-red-500'
                }`}></span>
                <span className="text-blue-700">
                  Business Rules: {businessRulesConfig.businessRulesConfig.globalSettings.businessRulesEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="text-blue-600">
                Version: {businessRulesConfig.businessRulesConfig.version}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Creation Form - REFACTORED VERSION */}
      <DynamicProductCreationFormRefactored
        key="stable-product-form" // CRITICAL: Stable key to prevent remounting
        onProductCreated={onProductCreated}
        debugMode={debugMode}
      />
    </div>
  );
}