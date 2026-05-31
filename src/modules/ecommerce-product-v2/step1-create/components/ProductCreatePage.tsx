'use client';

/**
 * ProductCreatePage
 * Auth/org context gate for Step 1 product creation.
 * Reads auth + org context, derives runtime values, renders the org info bar,
 * and passes everything down to ProductCreateForm.
 */

import React from 'react';
import { Loader2, AlertCircle } from '@/shared/ui/icons/Icons';
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useOrganization } from '@/shared/contexts/OrganizationContext';
import type { MasterProduct } from '../../types/product';
import { mapUserRole } from '../../utils/form-utils';
import ProductCreateForm from './ProductCreateForm';

interface ProductCreatePageProps {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  /** Phase 4: "edit" mode — pre-fills the form and routes submit through updateProduct */
  mode?: 'create' | 'edit';
  /** Phase 4: the existing product ID (required when mode === "edit") */
  masterProductId?: string;
  /** Phase 4: pre-filled form values from productAttributes */
  initialData?: Record<string, unknown>;
  /** Phase 4: called on successful update */
  onProductSaved?: (product: MasterProduct) => void;
}

export default function ProductCreatePage({
  onProductCreated,
  mode = 'create',
  masterProductId,
  initialData,
  onProductSaved,
}: ProductCreatePageProps) {
  const { user, organization, isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    organizationConfig,
    getAssignedChannels,
    getAssignedCategories,
    isLoading: orgLoading,
    error: orgError,
  } = useOrganization();

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (authLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading organization configuration...</p>
        </div>
      </div>
    );
  }

  // ── Auth guard ──────────────────────────────────────────────────────────────

  if (!isAuthenticated || !user || !organization) {
    return (
      <div className="flex items-center justify-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Authentication required. Please log in to continue.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Org error ───────────────────────────────────────────────────────────────

  if (orgError) {
    return (
      <div className="flex items-center justify-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load organization configuration: {orgError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const organizationDefaultCategory =
    organizationConfig?.configuration?.businessSettings?.defaultProductCategory || 'general';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ProductCreateForm
      userId={user.userId}
      organizationId={organization.organizationId}
      userRole={mapUserRole(user.role)}
      targetChannels={getAssignedChannels()}
      assignedCategories={getAssignedCategories()}
      organizationDefaultCategory={organizationDefaultCategory}
      onProductCreated={onProductCreated}
      mode={mode}
      initialProductId={masterProductId}
      initialData={initialData}
      onProductSaved={onProductSaved}
    />
  );
}
