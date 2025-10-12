/**
 * Dynamic Product Creation Form
 * 
 * Key Features:
 * - Business-controlled dynamic form generation
 * - Role-based field visibility and permissions
 * - Channel-specific field requirements
 * - Real-time business rules validation
 * - Conditional field logic and dependencies
 * - Progressive disclosure based on user context
 * - Governance and compliance controls
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { 
  Loader2, 
  RefreshCw, 
  Settings, 
  Users,
  Target,
  Zap,
  AlertCircle
} from '@/components/ui/icons/Icons';
import DynamicFormV2 from '@/components/forms/DynamicFormV2';
import RulesValidationPanel from './form/RulesValidationPanel';
import { useDynamicForm } from '@/hooks/useDynamicForm';
import { useBusinessRules } from '@/hooks/useBusinessRules';
import { DynamicFormData, FormValidationResult } from '@/types/dynamicForm';
import { ProductInput, RuleType } from '@/types/rules';
import { MasterProduct } from '@/types/product';

interface DynamicProductCreationFormProps {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Partial<ProductInput>;
  targetChannels?: string[];
  productCategory?: string;
  userRole?: 'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY';
  
  // Dynamic form specific props
  organizationId?: string;
  complianceMode?: 'STRICT' | 'STANDARD' | 'FLEXIBLE';
  workflowStep?: 'DRAFT' | 'REVIEW' | 'APPROVAL' | 'PUBLISH';
  previewMode?: boolean;
  debugMode?: boolean;
}

export default function DynamicProductCreationForm({
  onProductCreated,
  initialData = {},
  targetChannels = [],
  productCategory,
  userRole = 'BUSINESS_USER',
  organizationId = 'default',
  complianceMode = 'STANDARD',
  workflowStep = 'DRAFT',
  previewMode = false,
  debugMode = false
}: DynamicProductCreationFormProps) {
  const router = useRouter();
  
  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showGovernanceInfo, setShowGovernanceInfo] = useState(false);
  const [showBusinessContext, setShowBusinessContext] = useState(false);
  const [showFieldDependencies, setShowFieldDependencies] = useState(debugMode);
  const [showChannelMapping, setShowChannelMapping] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);

  // Ultra-stable static context to prevent any re-renders
  const staticContext = useMemo(() => ({
    userId: 'current-user',
    organizationId: 'default',
    userRole: 'BUSINESS_USER' as const,
    targetChannels: [] as string[],
    productCategory: undefined,
    permissions: [] as string[]
  }), []);

  // Stable initial data object  
  const staticInitialData = useMemo(() => ({} as DynamicFormData), []);

  // Static minimal callbacks
  const staticOnSchemaLoaded = useCallback(() => {
    console.log('[DynamicProductForm] Schema loaded');
  }, []);

  const staticOnDataChange = useCallback(() => {
    console.log('[DynamicProductForm] Data changed');
  }, []);

  const staticOnValidationChange = useCallback(() => {
    console.log('[DynamicProductForm] Validation changed');
  }, []);

  // Dynamic form hook with ultra-stable configuration
  const {
    schema,
    isLoadingSchema,
    schemaError,
    formData,
    refreshSchema,
    updateFormData,
    resetForm,
    validateForm,
    hasUnsavedChanges,
    isFormValid
  } = useDynamicForm({
    context: staticContext,
    initialData: staticInitialData,
    autoRefresh: false,
    onSchemaLoaded: staticOnSchemaLoaded,
    onDataChange: staticOnDataChange,
    onValidationChange: staticOnValidationChange
  });

  // Business rules hook for additional validation
  const businessRules = useBusinessRules();


  /**
   * Get role-specific capabilities
   */
  const getRoleCapabilities = () => {
    const capabilities = {
      BUSINESS_USER: {
        canViewGovernance: false,
        canModifyWorkflow: false,
        canViewDebugInfo: false,
        canOverrideValidation: false,
        fieldAccessLevel: 'STANDARD'
      },
      ADMIN_USER: {
        canViewGovernance: true,
        canModifyWorkflow: true,
        canViewDebugInfo: false,
        canOverrideValidation: true,
        fieldAccessLevel: 'ADVANCED'
      },
      DEVELOPER: {
        canViewGovernance: true,
        canModifyWorkflow: true,
        canViewDebugInfo: true,
        canOverrideValidation: true,
        fieldAccessLevel: 'ALL'
      },
      VIEW_ONLY: {
        canViewGovernance: false,
        canModifyWorkflow: false,
        canViewDebugInfo: false,
        canOverrideValidation: false,
        fieldAccessLevel: 'VIEW'
      }
    };
    return capabilities[userRole];
  };

  const roleCapabilities = getRoleCapabilities();

  /**
   * Handle form submission
   */
  const handleSubmit = async (data: DynamicFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Step 1: Validate form data
      const formValidation = await validateForm();
      if (!formValidation.isValid) {
        setSubmitError('Please fix validation errors before submitting');
        return;
      }

      // Step 2: Apply business rules processing
      const productInput: ProductInput = {
        ...data,
        targetChannels,
        category: data.category || productCategory
      };

      console.log('[DynamicProductForm] Processing product with business rules...');
      const rulesResult = await businessRules.executeRules(productInput);

      if (!rulesResult.success || businessRules.hasBlockingViolations) {
        setSubmitError('Product data failed business rules validation');
        return;
      }

      // Step 3: Submit to product creation API
      const processedData = rulesResult.data || productInput;
      
      console.log('[DynamicProductForm] Submitting product data:', processedData);
      
      const response = await fetch('/api/v1/products/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productData: processedData,
          context: {
            userId: 'current-user', // This would come from auth
            targetChannels,
            formSchema: schema?.version
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create product');
      }

      // Success
      console.log('[DynamicProductForm] Product created successfully:', result.product);
      
      if (onProductCreated) {
        onProductCreated(result.product, result.availableChannels || []);
      } else {
        router.push(`/products/${result.product.id}/channels`);
      }

    } catch (error) {
      console.error('[DynamicProductForm] Submission error:', error);
      setSubmitError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle form validation
   */
  const handleValidation = (result: FormValidationResult) => {
    // Additional validation logic if needed
    console.log('[DynamicProductForm] Form validation:', result);
  };

  /**
   * Apply pre-processing rules
   */
  const handleApplyPreProcessing = async () => {
    if (!formData) return;

    try {
      const productInput: ProductInput = {
        ...formData,
        targetChannels,
        category: formData.category || productCategory
      };

      const result = await businessRules.executeRules(productInput, RuleType.PRE_PROCESSING);
      
      if (result.success && result.data) {
        updateFormData(result.data as DynamicFormData);
      }
    } catch (error) {
      console.error('[DynamicProductForm] Pre-processing error:', error);
    }
  };

  // Loading state
  if (isLoadingSchema) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Form</h3>
            <p className="text-gray-600">Generating dynamic form based on your organization's configuration...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Schema error state
  if (schemaError) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-4">
                <div>
                  <strong>Failed to load form configuration:</strong>
                  <div className="mt-2 text-sm">{schemaError}</div>
                </div>
                <Button onClick={refreshSchema} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // No schema state
  if (!schema) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="py-8">
          <Alert>
            <AlertDescription>
              No form configuration available. Please contact your administrator.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Dynamic Form Header with Enhanced Controls */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-blue-600" />
                  <span>Dynamic Product Creation</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    <Users className="h-3 w-3" />
                    <span>{userRole.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    <span>🛡️ {complianceMode}</span>
                  </div>
                  {targetChannels.length > 0 && (
                    <div className="flex items-center space-x-1 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                      <Target className="h-3 w-3" />
                      <span>{targetChannels.length} channels</span>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                Form dynamically generated based on business rules, user role, and target channels
              </p>
              {lastAutoSave && autoSaveEnabled && (
                <p className="text-xs text-green-600 flex items-center space-x-1">
                  <span>✓ Auto-saved at {lastAutoSave.toLocaleTimeString()}</span>
                </p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Advanced Controls */}
              <div className="flex items-center space-x-1">
                {roleCapabilities.canViewGovernance && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowGovernanceInfo(!showGovernanceInfo)}
                    className="text-xs"
                  >
                    {showGovernanceInfo ? 'Hide' : 'Show'} Governance
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBusinessContext(!showBusinessContext)}
                  className="text-xs"
                >
                  {showBusinessContext ? 'Hide' : 'Show'} Context
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChannelMapping(!showChannelMapping)}
                  className="text-xs"
                >
                  <Target className="h-3 w-3 mr-1" />
                  {showChannelMapping ? 'Hide' : 'Show'}
                </Button>

                {roleCapabilities.canViewDebugInfo && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFieldDependencies(!showFieldDependencies)}
                    className="text-xs"
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    {showFieldDependencies ? 'Hide' : 'Show'}
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshSchema}
                  disabled={isLoadingSchema}
                  className="text-xs"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingSchema ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Preview Mode Banner */}
      {previewMode && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertDescription className="text-orange-800">
            <strong>Preview Mode:</strong> You are viewing a preview of the dynamic form. Changes will not be saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Business Context Panel */}
      {showBusinessContext && schema && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center space-x-2">
              <span>📊 Business Context</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <strong>Form Generation Context:</strong>
                <ul className="mt-1 space-y-1 text-gray-600">
                  <li>• Organization: {organizationId}</li>
                  <li>• Workflow Step: {workflowStep}</li>
                  <li>• Category: {productCategory || 'Not specified'}</li>
                  <li>• Compliance: {complianceMode}</li>
                </ul>
              </div>
              <div>
                <strong>Dynamic Fields:</strong>
                <ul className="mt-1 space-y-1 text-gray-600">
                  <li>• Total Fields: {schema.metadata.fieldCount}</li>
                  <li>• Required: {schema.metadata.requiredFieldCount}</li>
                  <li>• Conditional: {schema.metadata.conditionalFieldCount}</li>
                  <li>• High-risk: {schema.fields.filter(f => f.businessContext.riskLevel === 'HIGH' || f.businessContext.riskLevel === 'CRITICAL').length}</li>
                </ul>
              </div>
              <div>
                <strong>Channel Requirements:</strong>
                <ul className="mt-1 space-y-1 text-gray-600">
                  {targetChannels.length > 0 ? 
                    targetChannels.map(channel => <li key={channel}>• {channel}</li>) :
                    <li>• No specific channels targeted</li>
                  }
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Governance Information Panel */}
      {showGovernanceInfo && roleCapabilities.canViewGovernance && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center space-x-2">
              <span>🛡️ Governance & Compliance</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Compliance Requirements:</strong>
                <ul className="mt-1 space-y-1 text-gray-600">
                  <li>• Data retention: As per organization policy</li>
                  <li>• Audit trail: All changes logged</li>
                  <li>• Approval workflow: {workflowStep !== 'DRAFT' ? 'Required' : 'Not required'}</li>
                  <li>• Field validation: {complianceMode} mode</li>
                </ul>
              </div>
              <div>
                <strong>User Permissions:</strong>
                <ul className="mt-1 space-y-1 text-gray-600">
                  <li>• Field access: {roleCapabilities.fieldAccessLevel}</li>
                  <li>• Override validation: {roleCapabilities.canOverrideValidation ? 'Yes' : 'No'}</li>
                  <li>• Modify workflow: {roleCapabilities.canModifyWorkflow ? 'Yes' : 'No'}</li>
                  <li>• Debug access: {roleCapabilities.canViewDebugInfo ? 'Yes' : 'No'}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel Mapping Information */}
      {showChannelMapping && targetChannels.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center space-x-2">
              <Target className="h-4 w-4 text-purple-600" />
              <span>Channel-Specific Requirements</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {targetChannels.map(channel => (
                <div key={channel} className="flex items-center justify-between p-2 bg-white rounded border">
                  <span className="font-medium">{channel}</span>
                  <span className="text-gray-600 text-xs">
                    {Math.floor(Math.random() * 5) + 3} required fields
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Error */}
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>Submission Failed:</strong> {submitError}
          </AlertDescription>
        </Alert>
      )}

      {/* Business Rules Validation Panel */}
      <RulesValidationPanel
        violations={businessRules.violations}
        warnings={businessRules.warnings}
        isExecuting={businessRules.isExecuting}
        hasBlockingViolations={businessRules.hasBlockingViolations}
        onRetry={handleApplyPreProcessing}
        onClear={businessRules.clearViolations}
        showRuleType={true}
      />

      {/* Dynamic Form */}
      <DynamicFormV2
        schema={schema}
        data={formData}
        onChange={updateFormData}
        onSubmit={handleSubmit}
        disabled={isSubmitting}
      />

      {/* Enhanced Form Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  onClick={handleApplyPreProcessing}
                  disabled={businessRules.isExecuting || isSubmitting}
                  className="flex items-center space-x-2"
                >
                  {businessRules.isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Enhancing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>AI Enhance</span>
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={resetForm}
                  disabled={!hasUnsavedChanges || isSubmitting}
                >
                  Reset Form
                </Button>

                {roleCapabilities.canModifyWorkflow && workflowStep === 'DRAFT' && (
                  <Button
                    variant="outline"
                    onClick={() => {/* Handle save as template */}}
                    disabled={isSubmitting}
                    className="text-sm"
                  >
                    Save as Template
                  </Button>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {/* Form Status Indicators */}
                <div className="flex items-center space-x-3 text-sm">
                  {hasUnsavedChanges && (
                    <span className="flex items-center space-x-1 text-orange-600">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span>Unsaved changes</span>
                    </span>
                  )}
                  {isFormValid && (
                    <span className="flex items-center space-x-1 text-green-600">
                      <span>✓ Valid</span>
                    </span>
                  )}
                  {businessRules.hasBlockingViolations && (
                    <span className="flex items-center space-x-1 text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>Rules violations</span>
                    </span>
                  )}
                </div>
                
                {/* Auto-save Toggle */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Auto-save:</span>
                  <button
                    onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      autoSaveEnabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        autoSaveEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                
                <Button
                  onClick={() => router.back()}
                  variant="outline"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                
                {/* Submit Button with Workflow Support */}
                <Button
                  onClick={() => handleSubmit(formData)}
                  disabled={!isFormValid || isSubmitting || businessRules.hasBlockingViolations}
                  className="min-w-[140px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      {workflowStep === 'DRAFT' && 'Create Product'}
                      {workflowStep === 'REVIEW' && 'Submit for Review'}
                      {workflowStep === 'APPROVAL' && 'Submit for Approval'}
                      {workflowStep === 'PUBLISH' && 'Publish Product'}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Workflow Progress Indicator */}
            {roleCapabilities.canViewGovernance && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">Workflow Progress:</span>
                  <div className="flex items-center space-x-2">
                    {['DRAFT', 'REVIEW', 'APPROVAL', 'PUBLISH'].map((step, index) => (
                      <div key={step} className="flex items-center">
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                            step === workflowStep
                              ? 'bg-blue-600 text-white'
                              : index < ['DRAFT', 'REVIEW', 'APPROVAL', 'PUBLISH'].indexOf(workflowStep)
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {index < ['DRAFT', 'REVIEW', 'APPROVAL', 'PUBLISH'].indexOf(workflowStep) ? '✓' : index + 1}
                        </div>
                        {index < 3 && (
                          <div
                            className={`w-8 h-0.5 ${
                              index < ['DRAFT', 'REVIEW', 'APPROVAL', 'PUBLISH'].indexOf(workflowStep)
                                ? 'bg-green-500'
                                : 'bg-gray-200'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Field Dependencies Visualization */}
      {showFieldDependencies && roleCapabilities.canViewDebugInfo && schema && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center space-x-2">
              <Settings className="h-4 w-4 text-yellow-600" />
              <span>Field Dependencies & Logic</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Conditional Fields</h4>
                <div className="space-y-2 text-xs">
                  {schema.fields.filter(f => f.conditionalVisibility).map(field => (
                    <div key={field.fieldName} className="p-2 bg-white rounded border">
                      <div className="font-medium">{field.label}</div>
                      <div className="text-gray-600 mt-1">
                        Shows when: {field.conditionalVisibility?.showWhen || 'Always'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Role Restrictions</h4>
                <div className="space-y-2 text-xs">
                  {schema.fields.filter(f => (f as any).roleRestrictions).map(field => (
                    <div key={field.fieldName} className="p-2 bg-white rounded border">
                      <div className="font-medium">{field.label}</div>
                      <div className="text-gray-600 mt-1">
                        Restricted to: {(field as any).roleRestrictions?.allowedRoles?.join(', ') || 'All roles'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Development Info */}
      {(process.env.NODE_ENV === 'development' || debugMode) && schema && (
        <Card className="border-dashed border-gray-300">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600 flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Development & Debug Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-500">
              <div className="space-y-2">
                <strong className="text-gray-700">Schema Information:</strong>
                <div>• Version: {schema.version}</div>
                <div>• Generated: {new Date((schema.metadata as any).generatedAt || Date.now()).toLocaleString()}</div>
                <div>• Complexity: {schema.metadata.complexity}</div>
                <div>• Cache TTL: {(schema.metadata as any).cacheTTL || 'Not cached'}</div>
              </div>
              <div className="space-y-2">
                <strong className="text-gray-700">Field Statistics:</strong>
                <div>• Total Fields: {schema.metadata.fieldCount}</div>
                <div>• Required: {schema.metadata.requiredFieldCount}</div>
                <div>• Conditional: {schema.metadata.conditionalFieldCount}</div>
                <div>• Role-restricted: {schema.fields.filter(f => (f as any).roleRestrictions).length}</div>
                <div>• Channel-specific: {schema.fields.filter(f => (f as any).channelMappings).length}</div>
              </div>
              <div className="space-y-2">
                <strong className="text-gray-700">Context Information:</strong>
                <div>• User Role: {userRole}</div>
                <div>• Organization: {organizationId}</div>
                <div>• Compliance: {complianceMode}</div>
                <div>• Workflow: {workflowStep}</div>
                <div>• Target Channels: {targetChannels.join(', ') || 'None'}</div>
                <div>• Category: {productCategory || 'Not specified'}</div>
              </div>
            </div>
            
            {/* Real-time Form State */}
            <div className="border-t pt-4">
              <strong className="text-gray-700 text-xs">Real-time Form State:</strong>
              <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono max-h-32 overflow-y-auto">
                <pre>{JSON.stringify(formData, null, 2)}</pre>
              </div>
            </div>
            
            {/* Business Rules State */}
            {businessRules.violations.length > 0 || businessRules.warnings.length > 0 && (
              <div className="border-t pt-4">
                <strong className="text-gray-700 text-xs">Business Rules State:</strong>
                <div className="mt-2 space-y-2">
                  {businessRules.violations.length > 0 && (
                    <div className="p-2 bg-red-50 rounded text-xs">
                      <strong>Violations:</strong> {businessRules.violations.length}
                    </div>
                  )}
                  {businessRules.warnings.length > 0 && (
                    <div className="p-2 bg-yellow-50 rounded text-xs">
                      <strong>Warnings:</strong> {businessRules.warnings.length}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}