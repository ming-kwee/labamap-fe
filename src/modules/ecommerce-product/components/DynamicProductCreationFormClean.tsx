// "use client";

// /**
//  * Clean Dynamic Product Creation Form
//  * 
//  * Simplified version focusing on user experience like ProductCreateForm
//  * - No complex business rules panels
//  * - No governance/approval workflows
//  * - Clean, simple UI
//  * - Fast product creation
//  */

// import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
// import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
// import { Loader2, AlertCircle, Package, Settings, Star, Image, DollarSign, Truck, Tag, FileText, Info, HelpCircle, Search, ChevronDown, ChevronRight } from '@/shared/ui/icons/Icons';
// import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
// import Button from '@/shared/ui/button/Button';
// import { DynamicFormData, FormValidationResult, FormField } from '../types/dynamicForm';
// import { MasterProduct, ProductVariant } from '../types/product';
// import VariantConfiguratorDynamic from './VariantConfiguratorDynamic';
// import ValidationResultDisplay from './ValidationResultDisplay';
// import { useAuth } from '@/shared/contexts/AuthContext';
// import { useOrganization } from '@/shared/contexts/OrganizationContext';

// // Map user roles to backend expected format
// const mapUserRole = (role: string): 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER' => {
//   switch (role) {
//     case 'ADMIN_USER':
//     case 'ORGANIZATION_OWNER':
//     case 'ORGANIZATION_ADMIN':
//       return 'ADMIN';
//     case 'BUSINESS_MANAGER':
//     case 'BUSINESS_USER':
//       return 'BUSINESS_USER';
//     case 'DEVELOPER':
//       return 'DEVELOPER';
//     case 'VIEW_ONLY':
//     default:
//       return 'BUSINESS_USER';
//   }
// };

// // Normalize section names (backend may send snake_case, we use kebab-case)
// const normalizeSectionKey = (sectionKey: string): string => {
//   if (!sectionKey) return 'basic-info';

//   // Convert snake_case to kebab-case (basic_info → basic-info)
//   const normalized = sectionKey
//     .toLowerCase()
//     .replace(/_/g, '-')
//     .trim();

//   return normalized || 'basic-info';
// };

// // Section metadata configuration (backend can override with sectionLabel, sectionIcon, etc.)
// interface SectionMetadata {
//   label: string;
//   icon: React.ComponentType<any>;
//   iconColor: string;
//   description?: string;
//   order: number;
// }

// const getSectionMetadata = (sectionKey: string): SectionMetadata => {
//   const metadata: Record<string, SectionMetadata> = {
//     'basic-info': {
//       label: 'Basic Information',
//       icon: Package,
//       iconColor: 'text-blue-600',
//       description: 'Essential product details',
//       order: 1
//     },
//     'pricing': {
//       label: 'Pricing & Inventory',
//       icon: DollarSign,
//       iconColor: 'text-green-600',
//       description: 'Pricing, costs, and stock levels',
//       order: 2
//     },
//     'media': {
//       label: 'Images & Media',
//       icon: Image,
//       iconColor: 'text-purple-600',
//       description: 'Product images, videos, and galleries',
//       order: 3
//     },
//     'content': {
//       label: 'Product Content',
//       icon: FileText,
//       iconColor: 'text-indigo-600',
//       description: 'Descriptions, features, and specifications',
//       order: 4
//     },
//     'shipping': {
//       label: 'Shipping Details',
//       icon: Truck,
//       iconColor: 'text-orange-600',
//       description: 'Weight, dimensions, and shipping options',
//       order: 5
//     },
//     'seo': {
//       label: 'SEO & Marketing',
//       icon: Search,
//       iconColor: 'text-pink-600',
//       description: 'Meta tags, keywords, and marketing',
//       order: 6
//     },
//     'taxonomy': {
//       label: 'Classification',
//       icon: Tag,
//       iconColor: 'text-yellow-600',
//       description: 'Categories, brands, and tags',
//       order: 7
//     },
//     'variants': {
//       label: 'Product Variants',
//       icon: Settings,
//       iconColor: 'text-purple-600',
//       description: 'Size, color, and other variations',
//       order: 8
//     }
//   };

//   // Return section metadata or default
//   return metadata[sectionKey] || {
//     label: sectionKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
//     icon: Package,
//     iconColor: 'text-gray-600',
//     order: 999
//   };
// };

// // Validate and normalize product category
// const validateProductCategory = (
//   category: string, 
//   organizationConfig: any,
//   assignedCategories: string[]
// ): { category: string; isValid: boolean; warning?: string } => {
//   if (!category) {
//     return {
//       category: organizationConfig?.configuration?.businessSettings?.defaultProductCategory || 'general',
//       isValid: false,
//       warning: 'Category is required'
//     };
//   }

//   // Check if user has access to this category
//   if (assignedCategories.length > 0 && !assignedCategories.includes(category)) {
//     return {
//       category: assignedCategories[0] || 'general',
//       isValid: false,
//       warning: `Access denied to category '${category}'. Using assigned category instead.`
//     };
//   }

//   // Validate against known categories (could be expanded with backend validation)
//   const knownCategories = [
//     'electronics', 'clothing', 'books', 'home-garden', 'sports', 
//     'automotive', 'health-beauty', 'toys-games', 'food-beverage', 'general'
//   ];
  
//   if (!knownCategories.includes(category.toLowerCase())) {
//     console.warn(`[Category Validation] Unknown category '${category}', proceeding but may cause schema issues`);
//     return {
//       category: category.toLowerCase(),
//       isValid: true,
//       warning: `Unknown category '${category}' - may have limited field support`
//     };
//   }

//   return {
//     category: category.toLowerCase(),
//     isValid: true
//   };
// };

// interface DynamicProductCreationFormCleanProps {
//   onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
//   initialData?: Partial<DynamicFormData>;
//   debugMode?: boolean;
//   // Removed: All organization, user, and configuration props - now come from context
// }

// export default function DynamicProductCreationFormClean({
//   onProductCreated,
//   initialData = {},
//   debugMode = false
// }: DynamicProductCreationFormCleanProps) {
  
//   // Track component renders to detect re-mounting
//   const renderCount = useRef(0);
//   renderCount.current += 1;
//   console.log(`🏁🏁🏁 [RENDER #${renderCount.current}] DynamicProductCreationFormClean rendering!`);
  
//   // DEBUGGING: This should ALWAYS show in console to confirm component loads
//   console.log('🔥🔥🔥 DynamicProductCreationFormClean COMPONENT LOADED 🔥🔥🔥', { debugMode });
  
//   // ✅ Use authentication and organization context instead of hardcoded values
//   const { user, organization, userOrganizationRole, isAuthenticated, isLoading: authLoading } = useAuth();
//   const { 
//     organizationConfig, 
//     businessRulesConfig,
//     userPermissions, 
//     getAssignedChannels, 
//     getAssignedCategories,
//     getEnabledChannels,
//     hasPermission,
//     isLoading: orgLoading,
//     error: orgError
//   } = useOrganization();

//   // Show loading or error states if authentication/organization data not ready
//   if (!isAuthenticated || authLoading || orgLoading) {
//     return (
//       <div className="flex items-center justify-center min-h-96">
//         <div className="text-center">
//           <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
//           <p>Loading organization configuration...</p>
//         </div>
//       </div>
//     );
//   }

//   if (!user || !organization) {
//     return (
//       <div className="flex items-center justify-center min-h-96">
//         <div className="text-center">
//           <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
//           <p>Authentication required. Please log in to continue.</p>
//         </div>
//       </div>
//     );
//   }

//   if (orgError) {
//     return (
//       <div className="flex items-center justify-center min-h-96">
//         <div className="text-center">
//           <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
//           <p>Failed to load organization configuration: {orgError}</p>
//         </div>
//       </div>
//     );
//   }
//   console.log('[DynamicProductCreationFormClean] 🎬 COMPONENT MOUNTING/RENDERING');
//   console.log('[DynamicProductCreationFormClean] 🏢 Organization:', organization.organizationName);
//   console.log('[DynamicProductCreationFormClean] 👤 User:', user.email, 'Role:', user.role);
  
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [submitError, setSubmitError] = useState<string | null>(null);
//   const [validationResult, setValidationResult] = useState<import('../types/dynamicForm').EnhancedValidationResult | null>(null);
//   const [showValidation, setShowValidation] = useState(false);
//   const [showJsonPreview, setShowJsonPreview] = useState(false);

//   // Client-side field validation state (onBlur validation)
//   const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
//   const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

//   // CRITICAL: Track user's manual category selection to prevent org config overrides
//   const userSelectedCategory = useRef<string>("");

//   // ✅ Create dynamic context from authentication and organization data
//   const stableContext = useMemo(() => {
//     const assignedChannels = getAssignedChannels();
//     const enabledChannels = getEnabledChannels();
//     const assignedCategories = getAssignedCategories();
    
//     // Use assigned channels if available, otherwise fall back to enabled channels
//     const targetChannels = assignedChannels.length > 0 ? assignedChannels : enabledChannels;
    
//     // TWO-STAGE LOADING: Always start with empty string for stable context
//     // Schema loading will be triggered manually with specific category
//     const defaultCategory = "";
//     console.log('[stableContext] Using empty string category for stable context (two-stage loading)');
    
//     // Get user permissions
//     const permissions = userPermissions.map(p => p.name);
    
//     return {
//       userId: user.userId,
//       organizationId: organization.organizationId,
//       userRole: mapUserRole(user.role),
//       targetChannels,
//       productCategory: defaultCategory,
//       permissions
//     };
//   }, [user, organization, organizationConfig, userPermissions, getAssignedChannels, getEnabledChannels, getAssignedCategories]);

//   // ✅ Create initial data with organization context - STABILIZED TO PREVENT RESETS
//   const enrichedInitialData = useMemo(() => {
//     console.log('🌟🌟🌟 [ENRICHED INITIAL DATA] useMemo being recalculated!');
    
//     const orgDefaults: Partial<DynamicFormData> = {};
    
//     // Add organization-specific defaults if available
//     if (organizationConfig?.configuration?.businessSettings) {
//       const businessSettings = organizationConfig.configuration.businessSettings;
      
//       console.log('🔧 [enrichedInitialData] businessSettings.defaultProductCategory:', businessSettings.defaultProductCategory);
      
//       // TWO-STAGE LOADING: Only set category if user has manually selected one
//       // For initial load, leave category empty to trigger essential fields
//       if (userSelectedCategory.current && userSelectedCategory.current !== "" && userSelectedCategory.current !== null) {
//         orgDefaults.category = userSelectedCategory.current;
//         console.log('🔧 [enrichedInitialData] Using user-selected category:', userSelectedCategory.current);
//       } else {
//         // Don't set category for initial load - let backend return essential fields
//         console.log('🔧 [enrichedInitialData] Leaving category empty for essential fields load');
//       }
      
//       orgDefaults.currency = businessSettings.defaultCurrency;
      
//       // Add SKU pattern if auto-generation is enabled
//       if (organizationConfig.configuration.productManagement?.autoGenerateSKU) {
//         orgDefaults.autoGenerateSKU = true;
//         orgDefaults.skuPattern = organizationConfig.configuration.productManagement.defaultSKUPattern;
//       }
//     }
    
//     // Merge with provided initial data
//     const finalData = { ...orgDefaults, ...initialData };
//     console.log('🔧 [enrichedInitialData] Final initial data with category:', finalData.category);
//     console.log('🌟🌟🌟 [ENRICHED INITIAL DATA] Returning:', finalData);
//     return finalData;
//   }, []); // CRITICAL: Remove dependencies to make it stable after first calculation

//   // Create a simple state-based approach to avoid infinite loop
//   const [schema, setSchema] = useState<any>(null);
//   const [isLoadingSchema, setIsLoadingSchema] = useState(false);
//   const [schemaError, setSchemaError] = useState<string | null>(null);
//   const [formStage, setFormStage] = useState<'essential' | 'category-specific'>('essential');
  
//   // Schema caching to prevent unnecessary reloads and improve UX
//   const schemaCache = useRef<Record<string, any>>({});
//   const [isAddingCategoryFields, setIsAddingCategoryFields] = useState(false);

//   // Collapsible sections state - smart defaults (basic-info expanded, others collapsed)
//   const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['basic-info']));
//   // CRITICAL FIX: Initialize form data only once to prevent resets during re-renders
//   // Wrap setFormData to track all calls
//   const [formDataState, setFormDataState] = useState<DynamicFormData>(() => {
//     const initialData = { ...enrichedInitialData };
    
//     if (debugMode) {
//       console.log('[COMPONENT INIT] Form data initializing...');
//     }
    
//     // Restore variant data from sessionStorage if available
//     try {
//       const savedVariantData = sessionStorage.getItem('variant_configurator_data');
//       if (savedVariantData) {
//         initialData.variantConfigurator = savedVariantData;
//         if (debugMode) console.log('[COMPONENT INIT] Restored variant data from sessionStorage');
//       }
//     } catch (error) {
//       if (debugMode) console.log('[COMPONENT INIT] Failed to restore from sessionStorage:', error);
//     }
    
//     if (debugMode) console.log('[COMPONENT INIT] Initial formData ready:', Object.keys(initialData));
//     return initialData;
//   });
  
//   // Create wrapper function for setFormData
//   const setFormData = useCallback((newData: any) => {
//     if (typeof newData === 'function') {
//       setFormDataState(newData);
//     } else {
//       setFormDataState(newData);
//     }
//   }, []);
  
//   // Use the state
//   const formData = formDataState;
  
//   // Add effect to track formData changes (for development only)
//   useEffect(() => {
//     if (debugMode) {
//       console.log('[FORMDATA CHANGE] formData state updated:', formData);
//     }
//   }, [formData, debugMode]);
  
//   // CRITICAL: Prevent enrichedInitialData changes from resetting formData after mount
//   const hasInitialized = useRef(false);
  
//   useEffect(() => {
//     if (!hasInitialized.current) {
//       hasInitialized.current = true;
//       console.log('🔒 [formData] Initial data locked - no more resets from enrichedInitialData');
//     }
//   }, []);
  
//   // Debug formData changes
//   useEffect(() => {
//     console.log('🔄 [formData] State updated - category is now:', formData.category);
//   }, [formData.category]);
  
//   // DEBUGGING: Add aggressive category tracking
//   const [categoryChangeLog, setCategoryChangeLog] = useState<Array<{timestamp: string, value: string, source: string}>>([]);
  
//   // Track category changes for debugging
//   const trackCategoryChange = (value: string, source: string) => {
//     const timestamp = new Date().toISOString();
//     console.log(`🏷️🔥 [CATEGORY TRACKER] ${timestamp} - Category changed to "${value}" from source: ${source}`);
//     setCategoryChangeLog(prev => [...prev.slice(-10), { timestamp, value, source }]); // Keep last 10 changes
//   };

//   // Two-stage form loading: Essential fields first, then category-specific fields
//   const loadSchema = useCallback(async (targetCategory: string = "") => {
//     const isInitialLoad = targetCategory === "";
//     console.log('[DynamicProductCreationFormClean] 🔥 Schema loading started - Stage:', isInitialLoad ? 'ESSENTIAL' : 'CATEGORY-SPECIFIC');
//     console.log('[DynamicProductCreationFormClean] 🎯 Target category:', targetCategory);
    
//     setIsLoadingSchema(true);
//     setSchemaError(null);
    
//     try {
//       console.log('[DynamicProductCreationFormClean] 📦 Importing ProductService...');
//       const { ProductService, createBackendContext } = await import('@/lib/api/backendService');
//       console.log('[DynamicProductCreationFormClean] ✅ ProductService imported successfully');
      
//       // CRITICAL: Use targetCategory for context ("" for essential fields)
//       const backendContext = createBackendContext(
//         stableContext.userId,
//         stableContext.organizationId,
//         stableContext.userRole,
//         stableContext.targetChannels,
//         targetCategory, // "" for essential fields, specific category for category-specific fields
//         stableContext.permissions
//       );

      
//       console.log('[DynamicProductCreationFormClean] ⚙️ Backend context created:', backendContext);
      
//       console.log('[DynamicProductCreationFormClean] 🌐 Calling ProductService.generateFormSchema...');
//       let result: any = await ProductService.generateFormSchema(backendContext);
//       console.log('[DynamicProductCreationFormClean] 🔍 Raw API response received:', result);
      
//       // Handle the nested response structure
//       let parsedSchema;
//       if (result?.formSchema) {
//         parsedSchema = result.formSchema;
//         console.log('[DynamicProductCreationFormClean] 📋 Using result.formSchema');
//       } else if (result?.fields) {
//         parsedSchema = result;
//         console.log('[DynamicProductCreationFormClean] 📋 Using direct result');
//       } else {
//         console.error('[DynamicProductCreationFormClean] ❌ Invalid response structure:', result);
//         throw new Error('Invalid API response structure - missing formSchema or fields');
//       }

//       // Enhance schema with business rules if enabled
//       if (businessRulesConfig?.businessRulesConfig?.globalSettings?.businessRulesEnabled) {
//         try {
//           console.log('[DynamicProductCreationFormClean] 🔧 Enhancing schema with business rules...');
          
//           // Get enabled rule IDs from business rules config
//           const enabledRules: string[] = [];
//           Object.values(businessRulesConfig.businessRulesConfig.ruleCategories).forEach((category: any) => {
//             if (category.enabled && category.rules) {
//               category.rules.forEach((rule: any) => {
//                 if (rule.enabled) {
//                   enabledRules.push(rule.ruleId);
//                 }
//               });
//             }
//           });

//           if (enabledRules.length > 0) {
//             // TODO: Implement backend API for business rules schema enhancement
//             // const enhancedResult = await ProductService.enhanceSchemaWithBusinessRules(
//             //   parsedSchema,
//             //   organization.organizationId,
//             //   stableContext,
//             //   enabledRules
//             // );

//             // if (enhancedResult?.enhancedSchema) {
//             //   parsedSchema = enhancedResult.enhancedSchema;
//             //   console.log('[DynamicProductCreationFormClean] ✅ Schema enhanced with business rules:', enabledRules.length, 'rules applied');
//             // }
//             console.log('[DynamicProductCreationFormClean] ℹ️ Business rules schema enhancement not yet implemented');
//           }
//         } catch (error) {
//           console.error('[DynamicProductCreationFormClean] ⚠️ Business rules schema enhancement failed:', error);
//           // Continue with base schema if enhancement fails
//         }
//       }
      
//       console.log('[DynamicProductCreationFormClean] 🔍 Final schema has', parsedSchema.fields?.length, 'fields');
      
      
//       // Detect form stage based on metadata or field presence
//       const isBasicForm = parsedSchema.metadata?.isInitialLoad || 
//                          parsedSchema.fields?.some((field: any) => field.fieldName === 'category' || field.name === 'category') &&
//                          parsedSchema.fields?.length <= 6;
      
//       console.log('[DynamicProductCreationFormClean] 📊 Form analysis:', {
//         isInitialLoad,
//         isBasicForm,
//         fieldCount: parsedSchema.fields?.length,
//         hasMetadata: !!parsedSchema.metadata,
//         metadata: parsedSchema.metadata
//       });
      
//       // Store form stage information
//       setFormStage(isBasicForm ? 'essential' : 'category-specific');
      
//       console.log('[DynamicProductCreationFormClean] ✅ Setting schema state...');
//       setSchema(parsedSchema);
//       setIsLoadingSchema(false);
//       console.log('[DynamicProductCreationFormClean] 🎯 State updated successfully');
      
//     } catch (error) {
//       console.error('[DynamicProductCreationFormClean] ❌ Error in loadSchema:', error);
//       const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//       console.error('[DynamicProductCreationFormClean] 🚨 Setting error state:', errorMessage);
//       setSchemaError(`Schema loading error: ${errorMessage}`);
//       setIsLoadingSchema(false);
//     }
//   }, [stableContext, businessRulesConfig, organization]); // useCallback dependency array

//   console.log('[DynamicProductCreationFormClean] 🔧 About to define useEffect hooks - loadSchema function exists:', typeof loadSchema);

//   // TEST: Simple useEffect to verify hook execution
//   useEffect(() => {
//     console.log('[DynamicProductCreationFormClean] 🟢 BASIC useEffect RUNNING!');
//   }, []);

//   // CRITICAL FIX: Move useEffect to top level - must be called before any early returns
//   // Auto-load schema on component mount - simplified version
//   useEffect(() => {
//     console.log('[DynamicProductCreationFormClean] 🚀 useEffect: RUNNING! Auto-loading schema...');
//     console.log('[DynamicProductCreationFormClean] 🚀 useEffect: Current state check:');
//     console.log('[DynamicProductCreationFormClean] 🚀 - isLoadingSchema:', isLoadingSchema);
//     console.log('[DynamicProductCreationFormClean] 🚀 - schema:', !!schema);
//     console.log('[DynamicProductCreationFormClean] 🚀 - schemaError:', schemaError);
    
//     // STAGE 1: Load essential fields on first mount
//     console.log('[DynamicProductCreationFormClean] 🚀 STAGE 1: Loading essential fields on mount');
//     loadSchema(""); // empty string = load essential fields
//   }, [loadSchema]); // Run when loadSchema function changes

//   // Modern smooth category field loading - no page refresh effect
//   const loadCategoryFieldsSmooth = useCallback(async (category: string) => {
//     console.log('[DynamicProductCreationFormClean] Loading category fields smoothly for:', category);
    
//     // Check cache first - instant response for cached categories
//     const cacheKey = category || 'essential';
//     if (schemaCache.current[cacheKey]) {
//       console.log('[DynamicProductCreationFormClean] ⚡ Instant load from cache for:', category);
//       const cachedSchema = schemaCache.current[cacheKey];
      
//       // Use cached schema directly - it has all the correct fields
//       setSchema(cachedSchema);
//       console.log('[DynamicProductCreationFormClean] Applied cached schema with', cachedSchema.fields?.length, 'fields');
      
//       setFormStage('category-specific');
//       return;
//     }
    
//     // Only show subtle loading indicator for new fields, not whole form
//     // DON'T set isLoadingSchema to avoid page refresh effect
//     setIsAddingCategoryFields(true);
    
//     try {
//       const { ProductService, createBackendContext } = await import('@/lib/api/backendService');
      
//       const backendContext = createBackendContext(
//         stableContext.userId,
//         stableContext.organizationId,
//         stableContext.userRole,
//         stableContext.targetChannels,
//         category,
//         stableContext.permissions
//       );
      
//       // Use refreshFormSchema for better performance when category changes
//       console.log('[DynamicProductCreationFormClean] 🔄 Refreshing schema for category:', category);
//       const newSchema = await ProductService.refreshFormSchema(backendContext);

//       // Cache the result
//       schemaCache.current[cacheKey] = newSchema;

//       // Apply the new schema directly to get all category-specific fields
//       setSchema(newSchema);
//       console.log('[DynamicProductCreationFormClean] ✅ Applied refreshed schema with', newSchema.fields?.length, 'fields for category:', category);
      
//       setFormStage('category-specific');
      
//     } catch (error) {
//       console.error('[DynamicProductCreationFormClean] Failed to load category fields:', error);
//     } finally {
//       setIsAddingCategoryFields(false);
//     }
//   }, [stableContext]);

//   // CRITICAL FIX: Initialize form data with schema defaultValues when schema loads
//   // BUT: Don't override values that user has explicitly set
//   useEffect(() => {
//     if (!schema || !schema.fields) return;
    
//     console.log('🚨🚨🚨 [SCHEMA EFFECT] Schema loaded, checking for defaultValues...');
//     console.log('🚨🚨🚨 [SCHEMA EFFECT] Current formData before applying defaults:', formData);
    
//     // Find fields with defaultValue and merge with current form data
//     const defaultValues: Partial<DynamicFormData> = {};
//     let hasDefaultValues = false;
    
//     schema.fields.forEach((field: any) => {
//       const fieldName = field.name || field.fieldName;
//       if (field.defaultValue !== undefined && field.defaultValue !== null) {
//         defaultValues[fieldName] = field.defaultValue;
//         hasDefaultValues = true;
//         console.log(`[DynamicProductCreationFormClean] 📝 Found defaultValue for "${fieldName}":`, field.defaultValue);
//       }
//     });
    
//     if (hasDefaultValues) {
//       console.log('🚨🚨🚨 [SCHEMA EFFECT] About to call setFormData with defaults:', defaultValues);
//       setFormData((prev: DynamicFormData) => {
//         console.log('🚨🚨🚨 [SCHEMA EFFECT] Inside setFormData callback - prev:', prev);
//         // CRITICAL: Only apply defaultValues for fields that are currently empty or undefined
//         // This prevents overriding user selections (especially category field)
//         const mergedData = { ...prev };
//         let appliedDefaults = false;
        
//         Object.entries(defaultValues).forEach(([fieldName, defaultValue]) => {
//           const currentValue = prev[fieldName];
//           const isEmpty = currentValue === undefined || currentValue === null || currentValue === '';
          
//           // CRITICAL: Extra protection for category field - never override user selection
//           if (fieldName === 'category' && currentValue && currentValue !== 'general' && currentValue !== '') {
//             console.log(`[DynamicProductCreationFormClean] 🛡️ CATEGORY PROTECTION: Refusing to apply defaultValue for category field - preserving user selection: "${currentValue}"`);
//             trackCategoryChange(currentValue, 'schema-defaultValues-protected');
//             return; // Skip this field completely
//           }
          
//           if (isEmpty) {
//             mergedData[fieldName] = defaultValue;
//             appliedDefaults = true;
//             console.log(`[DynamicProductCreationFormClean] ✅ Applied defaultValue for empty field "${fieldName}":`, defaultValue);
//             // Track category changes
//             if (fieldName === 'category') {
//               trackCategoryChange(defaultValue, 'schema-defaultValues-empty');
//             }
//           } else {
//             console.log(`[DynamicProductCreationFormClean] ⏭️ Skipped defaultValue for field "${fieldName}" - user value exists:`, currentValue);
//             // Track category skips too
//             if (fieldName === 'category') {
//               trackCategoryChange(currentValue, 'schema-defaultValues-skipped');
//             }
//           }
//         });
        
//         if (appliedDefaults) {
//           console.log('[DynamicProductCreationFormClean] 📋 Updated form data with selective defaults:', mergedData);
//         } else {
//           console.log('[DynamicProductCreationFormClean] ⏭️ No default values applied - all fields have user values');
//         }
        
//         return mergedData;
//       });
//     }
//   }, [schema]); // Run when schema changes

//   // Helper function to evaluate conditional visibility rules from backend schema
//   const isFieldVisible = useCallback((field: FormField, currentFormData: DynamicFormData): boolean => {
//     const fieldName = field.name || field.fieldName;
    
//     // If no conditional visibility rules, field is always visible
//     if (!field.conditionalVisibility) {
//       return true;
//     }

//     const { showWhen, hideWhen } = field.conditionalVisibility;
    
//     // Debug logging for specific conditional fields
//     if (fieldName === 'size' || fieldName === 'color' || fieldName === 'warranty' || fieldName === 'brand') {
//       console.log(`[isFieldVisible] 🔍 Evaluating "${fieldName}":`, {
//         showWhen,
//         hideWhen,
//         currentCategory: currentFormData.category,
//         allFormData: currentFormData,
//         field
//       });
//     }

//     // Helper function to evaluate JavaScript expressions safely
//     const evaluateExpression = (expression: string, formData: DynamicFormData): boolean => {
//       try {
//         // Create a safe evaluation context with form data and enhanced category context
//         const currentCategory = formData.category || stableContext.productCategory || 'general';
//         const evalContext = {
//           ...formData,
//           // Add enhanced helper values
//           category: currentCategory,
//           productCategory: currentCategory,
//           hasVariants: formData.hasVariants,
//           // Add organization context
//           targetChannels: stableContext.targetChannels,
//           userRole: stableContext.userRole,
//           organizationId: stableContext.organizationId,
//           // Add category-specific helpers
//           isElectronics: currentCategory === 'electronics',
//           isClothing: currentCategory === 'clothing',
//           isAutomotive: currentCategory === 'automotive',
//           isGeneral: currentCategory === 'general',
//         };
        
//         // Replace variable names in expression with actual values
//         let safeExpression = expression;
        
//         // Handle specific patterns from backend
//         Object.keys(evalContext).forEach(key => {
//           const value = (evalContext as any)[key];
          
//           // Replace patterns like "category === 'electronics'"
//           safeExpression = safeExpression.replace(
//             new RegExp(`\\b${key}\\b`, 'g'), 
//             JSON.stringify(value)
//           );
//         });
        
//         console.log(`[ConditionalVisibility] Evaluating: ${expression} -> ${safeExpression}`);
        
//         // Use Function constructor for safer evaluation than eval
//         const result = new Function('return ' + safeExpression)();
//         console.log(`[ConditionalVisibility] Result: ${result}`);
        
//         return Boolean(result);
//       } catch (error) {
//         console.error(`[ConditionalVisibility] Error evaluating expression "${expression}":`, error);
//         return true; // Default to visible on error
//       }
//     };

//     // Evaluate showWhen conditions
//     if (showWhen) {
//       if (typeof showWhen === 'string') {
//         // Handle JavaScript expression
//         if (!evaluateExpression(showWhen, currentFormData)) {
//           return false;
//         }
//       } else if (typeof showWhen === 'object') {
//         // Handle object-based conditions (legacy support)
//         const showConditionsMet = Object.entries(showWhen).every(([fieldName, expectedValue]) => {
//           const currentValue = currentFormData[fieldName];
          
//           if (Array.isArray(expectedValue)) {
//             return expectedValue.includes(currentValue);
//           }
          
//           return currentValue === expectedValue;
//         });
        
//         if (!showConditionsMet) {
//           return false;
//         }
//       }
//     }

//     // Evaluate hideWhen conditions
//     if (hideWhen) {
//       if (typeof hideWhen === 'string') {
//         // Handle JavaScript expression
//         if (evaluateExpression(hideWhen, currentFormData)) {
//           return false;
//         }
//       } else if (typeof hideWhen === 'object') {
//         // Handle object-based conditions (legacy support)
//         const hideConditionsMet = Object.entries(hideWhen).some(([fieldName, expectedValue]) => {
//           const currentValue = currentFormData[fieldName];
          
//           if (Array.isArray(expectedValue)) {
//             return expectedValue.includes(currentValue);
//           }
          
//           return currentValue === expectedValue;
//         });
        
//         if (hideConditionsMet) {
//           return false;
//         }
//       }
//     }

//     return true;
//   }, []);

//   // Helper function to get visible fields based on current form data
//   const getVisibleFields = useCallback((fields: FormField[], currentFormData: DynamicFormData): FormField[] => {
//     if (!fields) return [];

//     return fields.filter(field => isFieldVisible(field, currentFormData));
//   }, [isFieldVisible]);

//   // Client-side field validation function (onBlur validation)
//   const validateField = useCallback((field: FormField, value: any): string | null => {
//     const fieldName = field.name || field.fieldName;

//     // Check required fields
//     if (field.required && (value === undefined || value === null || value === '')) {
//       return `${field.label || fieldName} is required`;
//     }

//     // Skip validation for empty optional fields
//     if (!field.required && (value === undefined || value === null || value === '')) {
//       return null;
//     }

//     // Type-specific validation
//     const fieldType = field.type || 'text';

//     switch (fieldType) {
//       case 'number':
//         if (typeof value === 'string' && value !== '') {
//           const numValue = parseFloat(value);
//           if (isNaN(numValue)) {
//             return `${field.label || fieldName} must be a valid number`;
//           }
//           value = numValue;
//         }

//         if (typeof value === 'number') {
//           if (field.validation?.min !== undefined && value < field.validation.min) {
//             return `${field.label || fieldName} must be at least ${field.validation.min}`;
//           }
//           if (field.validation?.max !== undefined && value > field.validation.max) {
//             return `${field.label || fieldName} must be at most ${field.validation.max}`;
//           }
//         }
//         break;

//       case 'text':
//       case 'textarea':
//       case 'email':
//         if (typeof value === 'string') {
//           if (field.validation?.minLength && value.length < field.validation.minLength) {
//             return `${field.label || fieldName} must be at least ${field.validation.minLength} characters`;
//           }
//           if (field.validation?.maxLength && value.length > field.validation.maxLength) {
//             return `${field.label || fieldName} must be at most ${field.validation.maxLength} characters`;
//           }
//           if (field.validation?.pattern) {
//             const regex = new RegExp(field.validation.pattern);
//             if (!regex.test(value)) {
//               return `${field.label || fieldName} format is invalid`;
//             }
//           }

//           // Email-specific validation
//           if (fieldType === 'email') {
//             const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//             if (!emailRegex.test(value)) {
//               return `${field.label || fieldName} must be a valid email address`;
//             }
//           }
//         }
//         break;

//       case 'select':
//         if (field.options && value) {
//           const validValues = field.options.map((opt: any) => opt.value);
//           if (!validValues.includes(value)) {
//             return `${field.label || fieldName} must be one of the available options`;
//           }
//         }
//         break;
//     }

//     return null;
//   }, []);

//   // Handle field blur - validate individual field
//   const handleFieldBlur = useCallback((field: FormField) => {
//     const fieldName = field.name || field.fieldName;

//     // Mark field as touched
//     setTouchedFields(prev => new Set(prev).add(fieldName));

//     // Get current value
//     const value = formData[fieldName];

//     // Validate on blur
//     const error = validateField(field, value);
//     if (error) {
//       setFieldErrors(prev => ({ ...prev, [fieldName]: error }));
//     } else {
//       setFieldErrors(prev => {
//         const newErrors = { ...prev };
//         delete newErrors[fieldName];
//         return newErrors;
//       });
//     }
//   }, [formData, validateField]);

//   // Debug schema and conditional visibility
//   useEffect(() => {
//     console.log('[DynamicProductCreationFormClean] 🔍 Schema debug - Schema object:', schema);
//     if (schema?.fields) {
//       console.log('[DynamicProductCreationFormClean] 📋 Schema loaded with', schema.fields.length, 'fields');
//       console.log('[DynamicProductCreationFormClean] 📋 All fields:', schema.fields.map((f: any) => ({
//         name: f.name || f.fieldName,
//         id: f.id,
//         type: f.type,
//         hasConditional: !!f.conditionalVisibility
//       })));
      
//       const conditionalFields = schema.fields.filter((f: FormField) => f.conditionalVisibility);
//       console.log('[DynamicProductCreationFormClean] 🎯 Found', conditionalFields.length, 'fields with conditional visibility rules');
      
//       conditionalFields.forEach((field: FormField) => {
//         const fieldName = field.name || field.fieldName;
//         console.log(`[DynamicProductCreationFormClean] 🎯 Conditional Field "${fieldName}":`, {
//           showWhen: field.conditionalVisibility?.showWhen,
//           hideWhen: field.conditionalVisibility?.hideWhen,
//           fieldObject: field
//         });
//       });
//     } else {
//       console.log('[DynamicProductCreationFormClean] ❌ Schema or fields not available yet, schema:', schema);
//     }
//   }, [schema]);

//   // Debug visible fields when form data changes
//   useEffect(() => {
//     if (schema?.fields && Object.keys(formData).length > 0) {
//       const visibleFields = getVisibleFields(schema.fields, formData);
//       const totalFields = schema.fields.length;
      
//       console.log(`[DynamicProductCreationFormClean] Visible fields: ${visibleFields.length}/${totalFields}`);
//       console.log('[DynamicProductCreationFormClean] Current form data:', formData);
      
//       // Log fields that are hidden due to conditional visibility
//       const hiddenFields = schema.fields.filter((field: FormField) => !isFieldVisible(field, formData));
//       if (hiddenFields.length > 0) {
//         console.log('[DynamicProductCreationFormClean] Hidden fields due to conditions:', 
//           hiddenFields.map((f: FormField) => f.name || f.fieldName)
//         );
//       }
//     }
//   }, [schema, formData, getVisibleFields, isFieldVisible]);


//   // Enhanced field change handler with business rules integration and category-driven schema updates
//   const handleFieldChange = useCallback(async (fieldName: string, value: any) => {
//     console.log('[DynamicProductCreationFormClean] Field changed:', fieldName, '=', value);
//     console.log('[DynamicProductCreationFormClean] Current formData keys:', Object.keys(formData));

//     // Clear field error when user starts typing
//     if (fieldErrors[fieldName]) {
//       setFieldErrors(prev => {
//         const newErrors = { ...prev };
//         delete newErrors[fieldName];
//         return newErrors;
//       });
//     }

//     // CRITICAL: Special handling for variantConfigurator to preserve category context
//     if (fieldName === 'variantConfigurator') {
//       console.log('🔥 [VARIANT CONFIGURATOR] Variant data updated, preserving category context');
//       console.log('🔥 [VARIANT CONFIGURATOR] User selected category:', userSelectedCategory.current);
//       console.log('🔥 [VARIANT CONFIGURATOR] Variant value being stored:', value);
      
//       // Use functional setState to avoid stale closure issues
//       setFormData((prev: DynamicFormData) => {
//         console.log('🔥 [VARIANT CONFIGURATOR] Previous state:', prev);
//         const protectedCategory = userSelectedCategory.current || prev.category;
        
//         const newFormData = {
//           ...prev,
//           [fieldName]: value,
//           category: protectedCategory // Explicitly preserve category
//         };
        
//         console.log('🔥 [VARIANT CONFIGURATOR] Updated formData with variants:', newFormData);
//         console.log('🔥 [VARIANT CONFIGURATOR] Category protected during variant update:', protectedCategory);
        
//         return newFormData;
//       });
      
//       // CRITICAL: Persist variant data in sessionStorage to survive re-mounts
//       try {
//         sessionStorage.setItem('variant_configurator_data', value);
//         console.log('🔥 [VARIANT CONFIGURATOR] ✅ Persisted variant data to sessionStorage');
//       } catch (error) {
//         console.log('🔥 [VARIANT CONFIGURATOR] ❌ Failed to persist to sessionStorage:', error);
//       }
      
//       // Skip business rules execution for variant configurator to prevent category corruption
//       return;
//     }
    
//     // Track category changes
//     if (fieldName === 'category') {
//       trackCategoryChange(value, 'user-handleFieldChange');
//       // CRITICAL: Track user's manual category selection to prevent org config overrides
//       if (value && value !== 'general' && value !== '') {
//         userSelectedCategory.current = value;
//         console.log('🎯 [USER CATEGORY TRACKER] User manually selected category:', value);
        
//         // STAGE 2: Load category-specific fields when category is selected
//         if (formStage === 'essential') {
//           console.log('[DynamicProductCreationFormClean] 🚀 STAGE 2: Loading category-specific fields for:', value);
//           loadSchema(value).catch(error => {
//             console.error('[DynamicProductCreationFormClean] Failed to load category-specific schema:', error);
//           });
//         }
//       }
//     }
    
//     // Track hasVariants changes that might affect category
//     if (fieldName === 'hasVariants') {
//       console.log(`🔥🔥🔥 [HASVARIANT TRACKER] hasVariants changed to: ${value}, current category: ${formData.category}`);
//       trackCategoryChange(formData.category, `hasVariants-change-to-${value}`);
      
//       // CRITICAL FIX: When hasVariants changes, preserve the current category using functional setState
//       setFormData((prev: DynamicFormData) => {
//         const categoryToPreserve = userSelectedCategory.current || prev.category;
//         console.log(`🔍 [DEBUG] Previous category: "${prev.category}", categoryToPreserve: "${categoryToPreserve}"`);
        
//         if (categoryToPreserve && categoryToPreserve !== 'general' && categoryToPreserve !== '') {
//           console.log(`✅ [HASVARIANT TRACKER] Preserving category "${categoryToPreserve}" during hasVariants change`);
//           const preservedData = {
//             ...prev,
//             [fieldName]: value,
//             category: categoryToPreserve // Explicitly preserve category
//           };
//           console.log(`✅ [HASVARIANT TRACKER] Category preserved successfully: ${preservedData.category}`);
//           return preservedData;
//         } else {
//           console.log(`❌ [HASVARIANT TRACKER] No valid category to preserve: "${prev.category}"`);
//           return {
//             ...prev,
//             [fieldName]: value
//           };
//         }
//       });
//       return; // Early return to prevent normal processing that might reset category
//     }
    
//     // Create updated form data object for use in category change logic
//     const updatedFormData = {
//       ...formData,
//       [fieldName]: value
//     };

//     // Update form data immediately for responsive UI using functional form to avoid stale closure
//     setFormData((prev: DynamicFormData) => ({
//       ...prev, // Use fresh prev instead of stale closure formData
//       [fieldName]: value
//     }));

//     // Check if category field changed - validate and regenerate schema if needed
//     if (fieldName === 'category' && value !== formData.category) {
//       console.log('[DynamicProductCreationFormClean] Category changed from', formData.category, 'to', value);

//       // Validate the new category
//       const categoryValidation = validateProductCategory(
//         value,
//         organizationConfig,
//         getAssignedCategories()
//       );

//       if (categoryValidation.warning) {
//         console.warn('[DynamicProductCreationFormClean] Category validation:', categoryValidation.warning);
//         // Update the updatedFormData if category was changed by validation
//         if (categoryValidation.category !== value) {
//           updatedFormData[fieldName] = categoryValidation.category;
//         }
//       }
      
//       const finalCategory = categoryValidation.category;
//       console.log('[DynamicProductCreationFormClean] Using validated category:', finalCategory, '- regenerating schema...');
      
//       try {
//         const { ProductService, createBackendContext } = await import('@/lib/api/backendService');
        
//         // Create new context with updated category
//         const updatedContext = createBackendContext(
//           stableContext.userId,
//           stableContext.organizationId,
//           stableContext.userRole,
//           stableContext.targetChannels,
//           finalCategory, // Use validated category
//           stableContext.permissions
//         );
        
//         // Generate new schema for the new category
//         // Use refreshFormSchema for category changes (optimized endpoint)
//         console.log('[DynamicProductCreationFormClean] 🔄 Refreshing schema for category change:', finalCategory);
//         const newSchema = await ProductService.refreshFormSchema(updatedContext);
//         console.log('[DynamicProductCreationFormClean] ✅ Schema refreshed for category:', finalCategory);

//         // Update schema with new category-specific fields
//         if (newSchema?.fields) {
//           setSchema(newSchema);
          
//           // IMPORTANT: Preserve form data after schema update, especially the category value
//           const preservedFormData = {
//             ...updatedFormData, // Use the updated form data, not stale closure data
//             [fieldName]: finalCategory // Ensure category value is preserved
//           };
          
//           // Update form data to include the validated category and preserve existing data
//           setFormData(preservedFormData);
//           console.log('[DynamicProductCreationFormClean] Form data preserved after schema regeneration:', preservedFormData);
//           // Track category preservation
//           trackCategoryChange(finalCategory, 'schema-regeneration-preserved');
          
//           // Debug variant fields visibility for the new category
//           const variantFields = newSchema.fields.filter((f: any) => 
//             f.validationRules?.isVariantDimension || 
//             f.businessContext?.variantDimension ||
//             ['size', 'color', 'warranty', 'storage'].includes(f.name || f.fieldName)
//           );
//           console.log('[DynamicProductCreationFormClean] Variant fields in new schema:', variantFields.length);
//           variantFields.forEach((f: any) => {
//             const fieldName = f.name || f.fieldName;
//             console.log(`[DynamicProductCreationFormClean] Variant field "${fieldName}":`, {
//               conditionalVisibility: f.conditionalVisibility,
//               shouldShowFor: finalCategory,
//               isVisible: f.conditionalVisibility ? finalCategory === 'electronics' && f.conditionalVisibility.showWhen.includes('electronics') : true
//             });
//           });
//         }
        
//         // Apply business rules enhancement for new schema if enabled
//         if (businessRulesConfig?.businessRulesConfig?.globalSettings?.businessRulesEnabled) {
//           try {
//             const enabledRules: string[] = [];
//             Object.values(businessRulesConfig.businessRulesConfig.ruleCategories).forEach((category: any) => {
//               if (category.enabled && category.rules) {
//                 category.rules.forEach((rule: any) => {
//                   if (rule.enabled) {
//                     enabledRules.push(rule.ruleId);
//                   }
//                 });
//               }
//             });

//             if (enabledRules.length > 0) {
//               // TODO: Implement backend API for business rules schema enhancement
//               // const enhancedResult = await ProductService.enhanceSchemaWithBusinessRules(
//               //   newSchema,
//               //   organization?.organizationId,
//               //   updatedContext,
//               //   enabledRules
//               // );

//               // if (enhancedResult?.enhancedSchema) {
//               //   setSchema(enhancedResult.enhancedSchema);
//               //
//               //   // Preserve form data after business rules enhancement too
//               //   const preservedFormDataWithRules = {
//               //     ...updatedFormData, // Use the updated form data
//               //     [fieldName]: finalCategory // Ensure category value is still preserved
//               //   };
//               //   setFormData(preservedFormDataWithRules);
//               //
//               //   console.log('[DynamicProductCreationFormClean] Schema enhanced with business rules for new category');
//               //   console.log('[DynamicProductCreationFormClean] Form data preserved after business rules enhancement:', preservedFormDataWithRules);
//               // }
//               console.log('[DynamicProductCreationFormClean] ℹ️ Business rules schema enhancement not yet implemented');
//             }
//           } catch (error) {
//             console.error('[DynamicProductCreationFormClean] Business rules schema enhancement failed for new category:', error);
//           }
//         }
        
//       } catch (error) {
//         console.error('[DynamicProductCreationFormClean] Failed to regenerate schema for category change:', error);
//       }
//     }

//     // Apply business rules if enabled for this organization
//     // TEMPORARILY DISABLED: Backend API not ready - returns 404
//     if (false && businessRulesConfig?.businessRulesConfig?.globalSettings?.businessRulesEnabled) {
//       try {
//         const { ProductService } = await import('@/lib/api/backendService');
        
//         console.log('🔥 [BUSINESS RULES] About to execute business rules for:', fieldName, 'with current formData keys:', Object.keys(formData));
//         console.log('🔥 [BUSINESS RULES] Current formData values:', formData);
        
//         // Execute pre-processing rules for auto-enhancement
//         const ruleExecutionRequest = {
//           ruleType: 'PRE_PROCESSING' as const,
//           fieldName,
//           formData: { ...formData, [fieldName]: value },
//           context: stableContext
//         };

//         const ruleResult = await ProductService.executeBusinessRules(
//           organization?.organizationId || '',
//           ruleExecutionRequest
//         );

//         if (ruleResult?.ruleExecutionResult?.enhancedData) {
//           console.log('[DynamicProductCreationFormClean] Applying business rule enhancements:', ruleResult.ruleExecutionResult.enhancedData);
          
//           // Track if business rules are changing category
//           if (ruleResult.ruleExecutionResult.enhancedData.category) {
//             trackCategoryChange(ruleResult.ruleExecutionResult.enhancedData.category, `business-rules-${fieldName}`);
//           }
          
//           // Apply enhanced data from business rules
//           setFormData((prev: DynamicFormData) => {
//             // CRITICAL: Protect user's category selection from being overridden by business rules
//             const enhancedData = { ...ruleResult.ruleExecutionResult.enhancedData };
//             const currentCategory = prev.category;
            
//             // Use user-selected category as primary source of truth, fallback to current form category
//             const protectedCategory = userSelectedCategory.current || currentCategory;
            
//             // If user has a valid category selection, don't let business rules override it
//             if (protectedCategory && protectedCategory !== 'general' && protectedCategory !== '' && enhancedData.category && enhancedData.category !== protectedCategory) {
//               console.log(`[DynamicProductCreationFormClean] 🛡️ BUSINESS RULES CATEGORY PROTECTION: Refusing to override user category "${protectedCategory}" with business rules category "${enhancedData.category}"`);
//               console.log(`[DynamicProductCreationFormClean] 🛡️ Protection sources: userSelected="${userSelectedCategory.current}", current="${currentCategory}"`);
//               trackCategoryChange(protectedCategory, 'business-rules-protected');
//               delete enhancedData.category; // Remove category from enhanced data
//             }
            
//             // CRITICAL: Always preserve user's manual category selection
//             if (userSelectedCategory.current && userSelectedCategory.current !== 'general' && userSelectedCategory.current !== '') {
//               enhancedData.category = userSelectedCategory.current;
//               console.log(`[DynamicProductCreationFormClean] 🎯 FORCING user-selected category in business rules: "${userSelectedCategory.current}"`);
//             }
            
//             const mergedData = {
//               ...prev,
//               ...enhancedData
//             };
//             console.log('🔥 [BUSINESS RULES] Merging data:', {
//               previousKeys: Object.keys(prev),
//               enhancedKeys: Object.keys(enhancedData),
//               mergedKeys: Object.keys(mergedData),
//               preservedFields: Object.keys(prev).filter(key => !Object.keys(enhancedData).includes(key))
//             });
//             return mergedData;
//           });
//         }

//         // Handle business rule violations
//         if (ruleResult?.ruleExecutionResult?.violations?.length > 0) {
//           console.warn('[DynamicProductCreationFormClean] Business rule violations detected:', ruleResult.ruleExecutionResult.violations);
//           // Could set validation errors here for UI feedback
//         }

//         // Handle warnings and suggestions
//         if (ruleResult?.ruleExecutionResult?.warnings?.length > 0) {
//           console.log('[DynamicProductCreationFormClean] Business rule warnings:', ruleResult.ruleExecutionResult.warnings);
//         }

//         if (ruleResult?.ruleExecutionResult?.suggestions?.length > 0) {
//           console.log('[DynamicProductCreationFormClean] Business rule suggestions:', ruleResult.ruleExecutionResult.suggestions);
//         }

//       } catch (error) {
//         console.error('[DynamicProductCreationFormClean] Business rules execution failed:', error);
//         // Continue with basic functionality if business rules fail
//       }
//     }
//   }, [stableContext, businessRulesConfig, organization, fieldErrors]);

//   // Handle validation changes
//   const handleValidationChange = useCallback((_result: FormValidationResult) => {
//     // Handle validation results if needed
//   }, []);

//   // Toggle section expand/collapse
//   const toggleSection = useCallback((sectionKey: string) => {
//     setExpandedSections((prev) => {
//       const newSet = new Set(prev);
//       if (newSet.has(sectionKey)) {
//         newSet.delete(sectionKey);
//       } else {
//         newSet.add(sectionKey);
//       }
//       return newSet;
//     });
//   }, []);

//   // Truly dynamic masterProduct generation with zero hardcoded field mappings
//   const generateMasterProduct = (formData: DynamicFormData): MasterProduct => {
//     const now = new Date().toISOString();
    
//     // Base required fields (minimum needed for valid MasterProduct)
//     const masterProduct: MasterProduct = {
//       id: `prod_${Date.now()}`,
//       sku: formData.sku as string || `SKU_${Date.now()}`,
//       name: formData.name as string || '',
//       price: Number(formData.price) || 0,
//       createdAt: now,
//       updatedAt: now
//     };

//     // Configuration-driven field mapping (no hardcoded switches!)
//     const fieldMappingConfig = {
//       // Direct property mappings (form field -> masterProduct property)
//       directMappings: {
//         'description': 'description',
//         'shortDescription': 'shortDescription', 
//         'brand': 'brand',
//         'category': 'category',
//         'barcode': 'barcode',
//         'metaTitle': 'metaTitle',
//         'metaDescription': 'metaDescription',
//         'shippingClass': 'shippingClass',
//         'weight': 'weight',
//         'weightUnit': 'weightUnit',
//         'status': 'status'
//       },
      
//       // Field name transformations (form field -> different masterProduct property)
//       fieldTransforms: {
//         'comparePrice': 'compareAtPrice',
//         'costPrice': 'costPerItem', 
//         'inventory': 'quantity',
//         'lowStockAlert': 'lowStockThreshold',
//         'trackInventory': 'trackQuantity',
//         'publishedScope': 'visibility'
//       },
      
//       // Special complex field handlers
//       specialFields: {
//         'variantConfigurator': (value: any) => {
//           if (Array.isArray(value)) {
//             return { variants: value };
//           } else if (typeof value === 'object' && value) {
//             const variantData = value as any;
//             if (variantData.variants && Array.isArray(variantData.variants)) {
//               return { variants: variantData.variants };
//             }
//             return { variants: value };
//           }
//           return {};
//         },
        
//         'images': (value: any) => {
//           const images = Array.isArray(value) ? value : [value];
//           return {
//             galleryImages: images,
//             mainImage: images.length > 0 ? images[0] : undefined
//           };
//         },
        
//         'channelSettings': (value: any) => {
//           const channelMappings: any[] = [];
//           const channelSettings = value as Record<string, any>;
//           Object.keys(channelSettings).forEach(channelName => {
//             const settings = channelSettings[channelName];
//             if (settings?.enabled) {
//               channelMappings.push({
//                 channelId: channelName,
//                 mappedAt: now,
//                 status: 'mapped',
//                 confidence: 0.95,
//                 mappedFields: Object.keys(settings).length - 1,
//                 totalFields: 10
//               });
//             }
//           });
//           return { channelMappings };
//         }
//       },
      
//       // Array fields that need special handling
//       arrayFields: ['tags', 'metaKeywords'],
      
//       // Fields that combine into dimensions object
//       dimensionFields: ['length', 'width', 'height', 'dimensionUnit']
//     };

//     // Process all form fields dynamically using configuration
//     if (schema?.fields) {
//       // Handle dimensions first (they need to be processed together)
//       const hasDimensions = fieldMappingConfig.dimensionFields.some(dim => formData[dim]);
//       if (hasDimensions) {
//         masterProduct.dimensions = {
//           length: Number(formData.length) || 0,
//           width: Number(formData.width) || 0, 
//           height: Number(formData.height) || 0,
//           unit: (formData.dimensionUnit as 'cm' | 'in' | 'm' | 'ft') || 'in'
//         };
//       }
      
//       schema.fields.forEach((field: FormField) => {
//         const fieldName = field.fieldName;
//         const fieldValue = formData[fieldName];

//         // Skip empty/undefined values, already processed base fields, and dimension fields
//         // PURE: Use backend metadata to determine if field should be skipped
//         const isBaseField = Object.prototype.hasOwnProperty.call(masterProduct, fieldName);
//         const isDimensionField = fieldMappingConfig.dimensionFields.includes(fieldName);
//         const isEmpty = fieldValue === undefined || fieldValue === null || fieldValue === '';

//         if (isEmpty || isBaseField || isDimensionField) {
//           return;
//         }

//         // 1. Special field handlers (complex logic)
//         if ((fieldMappingConfig.specialFields as any)[fieldName]) {
//           const result = (fieldMappingConfig.specialFields as any)[fieldName](fieldValue);
//           Object.assign(masterProduct, result);
//           return;
//         }

//         // 2. Array fields
//         if (fieldMappingConfig.arrayFields.includes(fieldName)) {
//           (masterProduct as any)[fieldName] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
//           return;
//         }

//         // 3. Direct property mappings
//         if ((fieldMappingConfig.directMappings as any)[fieldName]) {
//           const targetProperty = (fieldMappingConfig.directMappings as any)[fieldName];
//           (masterProduct as any)[targetProperty] = convertValueByType(fieldValue, field.fieldType);
//           return;
//         }

//         // 4. Field name transformations  
//         if ((fieldMappingConfig.fieldTransforms as any)[fieldName]) {
//           const targetProperty = (fieldMappingConfig.fieldTransforms as any)[fieldName];
//           (masterProduct as any)[targetProperty] = convertValueByType(fieldValue, field.fieldType);
//           return;
//         }

//         // 5. All unmapped fields automatically go to customAttributes
//         if (!masterProduct.customAttributes) {
//           masterProduct.customAttributes = {};
//         }
//         masterProduct.customAttributes[fieldName] = convertValueByType(fieldValue, field.fieldType);
//       });
//     }

//     return masterProduct;
//   };

//   // Helper function for automatic type conversion based on schema
//   const convertValueByType = (value: any, fieldType: string): any => {
//     switch (fieldType) {
//       case 'number':
//         return Number(value);
//       case 'checkbox':
//         return Boolean(value);
//       case 'select':
//       case 'text':
//       case 'textarea':
//       default:
//         return value;
//     }
//   };

//   // Handle form submission
//   const handleSubmit = async (submissionData: DynamicFormData) => {
//     if (isSubmitting) return;
    

//     setIsSubmitting(true);
//     setSubmitError(null);
    
//     try {
//       console.log('[DynamicProductCreationForm] Submitting to backend API:', submissionData);
      
//       // Use backend API for product creation
//       const { ProductService, createBackendContext } = await import('@/lib/api/backendService');

//       const backendContext = createBackendContext(
//         stableContext.userId,
//         stableContext.organizationId,
//         stableContext.userRole,
//         stableContext.targetChannels,
//         stableContext.productCategory,
//         stableContext.permissions
//       );

//       // STEP 1: Pre-Processing - Transform/Normalize Data
//       console.log('[DynamicProductCreationForm] 🔄 Running pre-processing...');
//       let processedData = submissionData;

//       try {
//         const preprocessResult = await ProductService.executeBusinessRules(
//           stableContext.organizationId,
//           {
//             ruleType: 'PRE_PROCESSING',
//             productData: submissionData,
//             context: backendContext,
//             fieldName: 'all',
//             formData: submissionData
//           }
//         );

//         if (preprocessResult.ruleExecutionResult?.enhancedData) {
//           processedData = preprocessResult.ruleExecutionResult.enhancedData;
//           console.log('[DynamicProductCreationForm] ✅ Pre-processing complete:', processedData);

//           // Show what was transformed
//           if (preprocessResult.ruleExecutionResult.metadata?.appliedRules) {
//             console.log('[DynamicProductCreationForm] 📋 Applied rules:',
//               preprocessResult.ruleExecutionResult.metadata.appliedRules);
//           }
//         } else {
//           console.log('[DynamicProductCreationForm] ℹ️ No pre-processing transformations applied');
//         }
//       } catch (preprocessError) {
//         console.warn('[DynamicProductCreationForm] ⚠️ Pre-processing failed, continuing with original data:', preprocessError);
//         // Continue with original data if pre-processing fails
//       }

//       // STEP 2: Enhanced Validation - Run on pre-processed data
//       console.log('[DynamicProductCreationForm] 🔍 Running enhanced validation...');

//       try {
//         const enhancedValidation = await ProductService.validateProductEnhanced(
//           processedData,  // Use pre-processed data instead of original submissionData
//           backendContext
//         );

//         setValidationResult(enhancedValidation);
//         setShowValidation(true);

//         console.log('[DynamicProductCreationForm] Validation result:', enhancedValidation);

//         // Check if validation passed and product can be submitted
//         if (!enhancedValidation.canSubmit) {
//           console.error('[DynamicProductCreationForm] ❌ Enhanced validation failed');
//           setIsSubmitting(false);

//           // Scroll to validation results
//           setTimeout(() => {
//             document.getElementById('validation-results')?.scrollIntoView({ behavior: 'smooth' });
//           }, 100);

//           return; // Stop submission
//         }

//         // Show warnings but allow submission
//         if (enhancedValidation.warnings.length > 0) {
//           console.warn('[DynamicProductCreationForm] ⚠️ Validation passed with warnings');
//         }

//         console.log('[DynamicProductCreationForm] ✅ Enhanced validation passed');

//       } catch (validationError) {
//         console.error('[DynamicProductCreationForm] ❌ Enhanced validation error:', validationError);
//         // Continue with submission even if validation fails (degraded mode)
//         console.warn('[DynamicProductCreationForm] ⚠️ Continuing submission without validation (degraded mode)');
//       }

//       // STEP 3: Create Product - Use pre-processed and validated data
//       console.log('[DynamicProductCreationForm] 🚀 Creating product with pre-processed data:', processedData);

//       const masterProduct = await ProductService.createProduct(processedData, backendContext);
//       console.log('[DynamicProductCreationForm] ✅ Product created successfully via backend:', masterProduct);
      
//       // Success - notify parent
//       onProductCreated?.(masterProduct, stableContext.targetChannels);
      
//     } catch (error) {
//       console.error('Failed to create product:', error);
//       setSubmitError(error instanceof Error ? error.message : 'Failed to create product');
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   console.log('[DynamicProductCreationFormClean] RENDER STATE CHECK:', {
//     isLoadingSchema,
//     schemaError,
//     hasSchema: !!schema,
//     schemaFields: schema?.fields?.length || 0,
//     schemaType: typeof schema,
//     schemaKeys: schema ? Object.keys(schema) : 'null'
//   });
  
//   // Log what will happen next
//   if (isLoadingSchema) {
//     console.log('[DynamicProductCreationFormClean] 📍 NEXT: Will show LOADING state');
//   } else if (schemaError || !schema) {
//     console.log('[DynamicProductCreationFormClean] 📍 NEXT: Will show ERROR state (has schema:', !!schema, ')');
//   } else {
//     console.log('[DynamicProductCreationFormClean] 📍 NEXT: Will show NORMAL form state');
//   }

//   // Only show full loading for initial schema load, not for category changes
//   if (isLoadingSchema && !schema) {
//     console.log('[DynamicProductCreationFormClean] 🔄 SHOWING INITIAL LOADING STATE');
//     return (
//       <div className="max-w-4xl mx-auto p-6 flex items-center justify-center">
//         <div className="text-center">
//           <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
//           <p className="text-gray-600">Loading form schema...</p>
//         </div>
//       </div>
//     );
//   }

//   // Error state - provide fallback manual form
//   if (schemaError || !schema) {
//     console.log('[DynamicProductCreationFormClean] ❌ SHOWING ERROR STATE:', { schemaError, hasSchema: !!schema });
//     console.log('[DynamicProductCreationFormClean] ❌ Schema details:', { 
//       schema: schema, 
//       schemaType: typeof schema,
//       schemaStringified: JSON.stringify(schema)?.substring(0, 200)
//     });
//     return (
//       <div className="max-w-4xl mx-auto p-6">
//         {/* SUPER VISIBLE DEBUG INDICATOR */}
//         <div className="bg-red-500 text-white p-4 text-center text-xl font-bold mb-4 animate-pulse">
//           🚨 ERROR STATE RENDERING - FALLBACK FORM ACTIVE 🚨
//           <br />
//           <div className="text-sm mt-2">
//             Schema: {schema ? 'EXISTS' : 'NULL'} | Error: {schemaError || 'NONE'}
//           </div>
//         </div>
        
//         <Alert variant="destructive">
//           <AlertCircle className="h-4 w-4" />
//           <AlertDescription>
//             {schemaError || 'Schema not loaded yet. Use the fallback form below to test product creation.'}
//           </AlertDescription>
//         </Alert>
        
//         <div className="mt-4 text-center">
//           <Button 
//             onClick={() => {
//               console.log('[Manual Button] Load Schema button clicked');
//               loadSchema();
//             }}
//             disabled={isLoadingSchema}
//             className="px-6 py-2 mr-4"
//           >
//             {isLoadingSchema ? (
//               <>
//                 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                 Loading Schema...
//               </>
//             ) : (
//               <>
//                 <Settings className="h-4 w-4 mr-2" />
//                 Load Schema
//               </>
//             )}
//           </Button>
//         </div>
        
//         {/* Fallback Manual Form */}
//         <Card className="mt-6">
//           <CardHeader>
//             <CardTitle>Manual Product Creation (Fallback)</CardTitle>
//           </CardHeader>
//           <CardContent>
//             <form onSubmit={(e) => { 
//               e.preventDefault(); 
//               // Create a basic product data object
//               const basicProductData = {
//                 name: 'Test Product ' + Date.now(),
//                 description: 'Test product created via manual fallback form',
//                 sku: `SKU-${Date.now()}`,
//                 price: 29.99,
//                 category: 'electronics',
//                 inventory: 10,
//                 status: 'draft'
//               };
//               handleSubmit(basicProductData);
//             }} className="space-y-4">
//               <div className="text-sm text-gray-600 mb-4">
//                 This fallback form creates a test product with all required fields pre-filled.
//               </div>
              
//               <Button 
//                 type="submit" 
//                 disabled={isSubmitting}
//                 className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white text-lg font-bold"
//               >
//                 {isSubmitting ? (
//                   <>
//                     <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                     Creating Test Product...
//                   </>
//                 ) : (
//                   <>
//                     <Package className="h-4 w-4 mr-2" />
//                     🚀 CREATE TEST PRODUCT 🚀
//                   </>
//                 )}
//               </Button>
              
//               {submitError && (
//                 <Alert variant="destructive" className="mt-4">
//                   <AlertCircle className="h-4 w-4" />
//                   <AlertDescription>{submitError}</AlertDescription>
//                 </Alert>
//               )}
//             </form>
//           </CardContent>
//         </Card>
//       </div>
//     );
//   }

//   console.log('[DynamicProductCreationFormClean] ✅ RENDERING NORMAL FORM STATE with schema:', schema?.fields?.length, 'fields');

//   return (
//     <div className="max-w-7xl mx-auto space-y-6">
//       {/* SUCCESS INDICATOR - Schema loaded and form is working */}
//       <div className="bg-green-500 text-white p-4 text-center text-lg font-bold mb-4">
//         ✅ SUCCESS: Dynamic Form Loaded with {schema?.fields?.length || 0} Fields
//         <br />
//         <div className="text-sm mt-2">
//           Total: {schema?.fields?.length || 0} | 
//           Conditional: {schema?.fields?.filter((f: any) => f.conditionalVisibility).length || 0} | 
//           Visible: {getVisibleFields(schema?.fields || [], formData).length || 0} | 
//           Required: {schema?.fields?.filter((f: any) => f.required || f.validationRules?.required).length || 0}
//         </div>
//         <div className="text-sm mt-2 p-2 bg-blue-100 rounded">
//           <strong>Category Tracking:</strong> Current = "{formData.category || 'undefined'}" | 
//           Changes: {categoryChangeLog.length} | 
//           Last: {categoryChangeLog[categoryChangeLog.length - 1]?.source || 'none'}
//         </div>
//       </div>
//       {/* Submit Error */}
//       {submitError && (
//         <Alert variant="destructive">
//           <AlertCircle className="h-4 w-4" />
//           <AlertDescription>{submitError}</AlertDescription>
//         </Alert>
//       )}

//       {/* Header Card */}
//       <Card>
//         <CardHeader>
//           <div className="flex items-center justify-between">
//             <div className="flex items-center space-x-3">
//               <Package className="h-6 w-6 text-blue-600" />
//               <div>
//                 <div className="flex items-center space-x-2">
//                   <CardTitle className="text-2xl">
//                     {schema?.title || 'Create New Product'}
//                   </CardTitle>
//                   {schema?.version && (
//                     <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
//                       v{schema.version}
//                     </span>
//                   )}
//                 </div>
//                 <p className="text-gray-600 mt-1">
//                   {schema?.description || 'Build your product for multi-channel distribution'}
//                 </p>
//               </div>
//             </div>
//             {/* JSON Preview Toggle */}
//             <Button
//               variant="outline"
//               onClick={() => setShowJsonPreview(!showJsonPreview)}
//               className="text-sm"
//             >
//               {showJsonPreview ? '🙈 Hide' : '👁️ Show'} JSON Preview
//             </Button>
//           </div>
//         </CardHeader>
//       </Card>

//       {/* Main Content Layout */}
//       <div className={`${showJsonPreview ? 'grid grid-cols-1 xl:grid-cols-3 gap-6' : ''}`}>
//         {/* Dynamic Form */}
//         <div className={showJsonPreview ? 'xl:col-span-2' : ''}>
//           {schema && schema.fields ? (
//             <form onSubmit={(e) => { e.preventDefault(); handleSubmit(formData); }} className="space-y-6">
              
//               {/* Section-Based Form Fields */}
//               {(() => {
//                     const visibleFields = getVisibleFields(schema.fields, formData);

//                     // 🔍 DIAGNOSTIC: Log ALL fields from backend with their properties
//                     console.log('🔍🔍🔍 [DIAGNOSTIC - ALL FIELDS FROM BACKEND]');
//                     console.log(`Total fields from schema: ${schema.fields?.length || 0}`);
//                     console.log(`Visible fields after conditional filter: ${visibleFields.length}`);
//                     visibleFields.forEach((field: any, idx: number) => {
//                       const fieldName = field.name || field.fieldName;
//                       console.log(`  Field ${idx + 1}: "${fieldName}"`, {
//                         displayLevel: field.displayLevel,
//                         group: field.group,
//                         order: field.order,
//                         required: field.required,
//                         fieldType: field.fieldType,  // Backend always sends fieldType (uppercase)
//                         hasConditionalVisibility: !!field.conditionalVisibility
//                       });
//                     });

//                     // ✅ PURE BACKEND-DRIVEN FILTERING (no hardcoded fallbacks)
//                     const filteredFields = visibleFields.filter((field: any) => {
//                       const fieldName = field.name || field.fieldName;

//                       // ✅ PURE: Use ONLY displayLevel from backend (no fallbacks)
//                       // CASE-INSENSITIVE: Handle ESSENTIAL, Essential, essential, etc.
//                       const displayLevel = (field.displayLevel || '').toLowerCase();
//                       const isEssential = displayLevel === 'essential';
//                       const isBasic = displayLevel === 'basic';
//                       const isCategorySpecific = displayLevel === 'category-specific';
//                       const isConditionalField = field.conditionalVisibility !== null;

//                       // ✅ For initial load (no category selected)
//                       if (formStage === 'essential') {
//                         // PURE: Only show fields with displayLevel 'essential' or 'basic' from backend
//                         const shouldShow = isEssential || isBasic;

//                         // 🔍 DIAGNOSTIC: Log EVERY field evaluation
//                         console.log(`[FieldFilter - Essential Stage] "${fieldName}":`, {
//                           displayLevel_ORIGINAL: field.displayLevel,
//                           displayLevel_NORMALIZED: displayLevel,
//                           isEssential,
//                           isBasic,
//                           shouldShow,
//                           REASON: shouldShow ? '✅ SHOWING' : `❌ HIDDEN (displayLevel="${field.displayLevel}" normalized to "${displayLevel}" is not "essential" or "basic")`
//                         });

//                         return shouldShow;
//                       }

//                       // ✅ After category selected, show applicable fields
//                       const shouldShow = isEssential || isBasic || isCategorySpecific || isConditionalField;

//                       console.log(`[FieldFilter - Category Stage] "${fieldName}":`, {
//                         displayLevel_ORIGINAL: field.displayLevel,
//                         displayLevel_NORMALIZED: displayLevel,
//                         isEssential,
//                         isBasic,
//                         isCategorySpecific,
//                         isConditionalField,
//                         shouldShow,
//                         REASON: shouldShow ? '✅ SHOWING' : `❌ HIDDEN (displayLevel="${field.displayLevel}" normalized to "${displayLevel}" - no match)`
//                       });

//                       return shouldShow;
//                     });

//                     // ✅ Sort fields by order metadata from schema
//                     const sortedFields = filteredFields.sort((a: any, b: any) => {
//                       return (a.order ?? 999) - (b.order ?? 999);
//                     });

//                     console.log(`\n🔍 [FieldFilter SUMMARY] Stage: ${formStage}, Showing ${sortedFields.length}/${visibleFields.length} fields`);
//                     if (sortedFields.length === 0) {
//                       console.error('❌❌❌ NO FIELDS TO SHOW!');
//                       console.error('REASON: None of the fields have displayLevel="essential" or "basic"');
//                       console.error('ACTION REQUIRED: Backend must set displayLevel property on fields');
//                       console.error('Expected: field.displayLevel should be "essential" or "basic" for initial load');
//                     } else {
//                       console.log(`✅ [FieldFilter] Field names (sorted):`, sortedFields.map((f: any) => `${f.name || f.fieldName} (displayLevel: ${f.displayLevel}, order: ${f.order ?? 'none'})`));
//                     }

//                     // 🔍 Show warning if no fields
//                     if (sortedFields.length === 0) {
//                       return (
//                         <Alert className="border-yellow-200 bg-yellow-50">
//                           <AlertCircle className="h-4 w-4 text-yellow-600" />
//                           <AlertDescription className="text-yellow-800">
//                             <div className="font-semibold mb-2">⚠️ No fields to display</div>
//                             <div className="text-sm space-y-1">
//                               <p><strong>Reason:</strong> Backend schema has no fields with displayLevel="essential" or "basic"</p>
//                               <p><strong>Action Required:</strong> Backend must set displayLevel property on fields</p>
//                               <p><strong>Example:</strong> {`{ fieldName: "name", displayLevel: "essential", ... }`}</p>
//                               <p className="mt-2"><strong>Check browser console for detailed diagnostics</strong></p>
//                             </div>
//                           </AlertDescription>
//                         </Alert>
//                       );
//                     }

//                     // ✅ Group fields by section
//                     const nonVariantFields = sortedFields.filter((field: any) => {
//                       const fieldName = field.name || field.fieldName;
//                       // Exclude variant-specific fields (they have dedicated section below)
//                       return fieldName !== 'hasVariants' && fieldName !== 'variantConfigurator';
//                     });

//                     // Group fields by section property (normalize to kebab-case)
//                     const fieldsBySection: Record<string, any[]> = {};
//                     nonVariantFields.forEach((field: any) => {
//                       // ✅ Normalize section key (basic_info → basic-info)
//                       const rawSection = field.section || 'basic-info';
//                       const section = normalizeSectionKey(rawSection);

//                       // 🔍 DIAGNOSTIC: Log section normalization
//                       if (rawSection !== section) {
//                         console.log(`[Section Normalization] "${rawSection}" → "${section}" for field "${field.name || field.fieldName}"`);
//                       }

//                       if (!fieldsBySection[section]) {
//                         fieldsBySection[section] = [];
//                       }
//                       fieldsBySection[section].push(field);
//                     });

//                     // 🔍 DIAGNOSTIC: Log final section grouping
//                     console.log('📋 [Section Grouping Summary]');
//                     Object.entries(fieldsBySection).forEach(([sectionKey, fields]) => {
//                       console.log(`  Section "${sectionKey}": ${fields.length} fields`);
//                     });

//                     // Sort sections by order
//                     const sortedSections = Object.entries(fieldsBySection).sort(([keyA], [keyB]) => {
//                       const metaA = getSectionMetadata(keyA);
//                       const metaB = getSectionMetadata(keyB);
//                       return metaA.order - metaB.order;
//                     });

//                     // Render each section as a Card
//                     return sortedSections.map(([sectionKey, sectionFields]) => {
//                       const sectionMeta = getSectionMetadata(sectionKey);
//                       const IconComponent = sectionMeta.icon;
//                       const isExpanded = expandedSections.has(sectionKey);
//                       const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

//                       return (
//                         <Card key={sectionKey} className="mb-6">
//                           <CardHeader
//                             className="cursor-pointer hover:bg-gray-50 transition-colors"
//                             onClick={() => toggleSection(sectionKey)}
//                             onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
//                               if (e.key === 'Enter' || e.key === ' ') {
//                                 e.preventDefault();
//                                 toggleSection(sectionKey);
//                               }
//                             }}
//                             tabIndex={0}
//                             role="button"
//                             aria-expanded={isExpanded}
//                             aria-controls={`section-content-${sectionKey}`}
//                           >
//                             <div className="flex items-center justify-between">
//                               <div className="flex items-center space-x-3">
//                                 <ChevronIcon className="h-5 w-5 text-gray-500 transition-transform" />
//                                 <IconComponent className={`h-5 w-5 ${sectionMeta.iconColor}`} />
//                                 <CardTitle className="text-lg">{sectionMeta.label}</CardTitle>
//                                 <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
//                                   {sectionFields.length} {sectionFields.length === 1 ? 'field' : 'fields'}
//                                 </span>
//                               </div>
//                               {sectionMeta.description && (
//                                 <p className="text-sm text-gray-500">{sectionMeta.description}</p>
//                               )}
//                             </div>
//                           </CardHeader>

//                           {/* Collapsible content with smooth animation */}
//                           <div
//                             id={`section-content-${sectionKey}`}
//                             className={`transition-all duration-300 ease-in-out overflow-hidden ${
//                               isExpanded ? 'max-h-[10000px] opacity-100' : 'max-h-0 opacity-0'
//                             }`}
//                           >
//                             <CardContent className="space-y-4 pt-4">
//                             {sectionFields.map((field: any, index: number) => {
//                               const fieldName = field.name || field.fieldName;
//                               const fieldType = (field.fieldType || '').toLowerCase();

//                               return (
//                                 <div key={`${fieldName}-${index}`} className="space-y-2">
//                                   {/* Label with optional info tooltip */}
//                                   <div className="flex items-center justify-between">
//                                     <label className="flex items-center text-sm font-medium text-gray-700">
//                                       {field.label}
//                                       {field.required && <span className="text-red-500 ml-1">*</span>}
//                                     </label>
//                                     {field.description && (
//                                       <div className="group relative">
//                                         <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
//                                         <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
//                                           {field.description}
//                                         </div>
//                                       </div>
//                                     )}
//                                   </div>

//                                   {/* Input field based on type */}
//                                   {(() => {
//                                     const hasError = !!fieldErrors[fieldName];
//                                     const errorClass = hasError
//                                       ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
//                                       : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';
//                                     const baseClass = `w-full px-3 py-2 border rounded-md shadow-sm ${errorClass} transition-colors`;

//                                     return fieldType === 'textarea' ? (
//                                       <textarea
//                                         id={`${fieldName}-${index}`}
//                                         name={fieldName}
//                                         placeholder={field.placeholder}
//                                         value={formData[fieldName] || ''}
//                                         onChange={(e) => handleFieldChange(fieldName, e.target.value)}
//                                         onBlur={() => handleFieldBlur(field)}
//                                         className={baseClass}
//                                         rows={3}
//                                       />
//                                     ) : fieldType === 'select' ? (
//                                       <select
//                                         id={`${fieldName}-${index}`}
//                                         name={fieldName}
//                                         value={formData[fieldName] || ''}
//                                         onChange={(e) => handleFieldChange(fieldName, e.target.value)}
//                                         onBlur={() => handleFieldBlur(field)}
//                                         className={baseClass}
//                                       >
//                                         <option value="">{field.placeholder}</option>
//                                         {field.options?.map((option: any) => (
//                                           <option key={option.value} value={option.value}>
//                                             {option.label}
//                                           </option>
//                                         ))}
//                                       </select>
//                                     ) : (
//                                       <input
//                                         id={`${fieldName}-${index}`}
//                                         name={fieldName}
//                                         type={fieldType === 'number' ? 'number' : fieldType === 'email' ? 'email' : 'text'}
//                                         placeholder={field.placeholder}
//                                         value={formData[fieldName] || ''}
//                                         onChange={(e) => handleFieldChange(fieldName, e.target.value)}
//                                         onBlur={() => handleFieldBlur(field)}
//                                         className={baseClass}
//                                       />
//                                     );
//                                   })()}

//                                   {/* Error message */}
//                                   {fieldErrors[fieldName] && (
//                                     <p className="text-xs text-red-600 flex items-start">
//                                       <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
//                                       {fieldErrors[fieldName]}
//                                     </p>
//                                   )}

//                                   {/* Help text with icon */}
//                                   {field.helpText && !fieldErrors[fieldName] && (
//                                     <p className="text-xs text-gray-500 flex items-start">
//                                       <HelpCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
//                                       {field.helpText}
//                                     </p>
//                                   )}
//                                 </div>
//                               );
//                             })}
//                             </CardContent>
//                           </div>
//                         </Card>
//                       );
//                     });
//                   })()}

//               {/* Product Variants Card - Collapsible */}
//               {(() => {
//                 const variantSectionKey = 'variants';
//                 const isExpanded = expandedSections.has(variantSectionKey);
//                 const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

//                 // Count variant fields
//                 const variantFieldsCount = getVisibleFields(schema.fields, formData).filter((field: any) => {
//                   const fieldName = field.name || field.fieldName;
//                   return fieldName === 'hasVariants' || fieldName === 'variantConfigurator';
//                 }).length;

//                 return (
//                   <Card>
//                     <CardHeader
//                       className="cursor-pointer hover:bg-gray-50 transition-colors"
//                       onClick={() => toggleSection(variantSectionKey)}
//                       onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
//                         if (e.key === 'Enter' || e.key === ' ') {
//                           e.preventDefault();
//                           toggleSection(variantSectionKey);
//                         }
//                       }}
//                       tabIndex={0}
//                       role="button"
//                       aria-expanded={isExpanded}
//                       aria-controls={`section-content-${variantSectionKey}`}
//                     >
//                       <div className="flex items-center justify-between">
//                         <div className="flex items-center space-x-3">
//                           <ChevronIcon className="h-5 w-5 text-gray-500 transition-transform" />
//                           <Settings className="h-5 w-5 text-purple-600" />
//                           <CardTitle className="text-lg">Product Variants</CardTitle>
//                           {variantFieldsCount > 0 && (
//                             <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
//                               {variantFieldsCount} {variantFieldsCount === 1 ? 'field' : 'fields'}
//                             </span>
//                           )}
//                         </div>
//                         <p className="text-sm text-gray-500">Size, color, and other variations</p>
//                       </div>
//                     </CardHeader>

//                     {/* Collapsible content */}
//                     <div
//                       id={`section-content-${variantSectionKey}`}
//                       className={`transition-all duration-300 ease-in-out overflow-hidden ${
//                         isExpanded ? 'max-h-[10000px] opacity-100' : 'max-h-0 opacity-0'
//                       }`}
//                     >
//                       <CardContent className="space-y-4 pt-4">
//                   {/* Render hasVariants checkbox ONLY if it exists in schema */}
//                   {getVisibleFields(schema.fields, formData)
//                     .filter((field: any) => {
//                       const fieldName = field.name || field.fieldName;
//                       return fieldName === 'hasVariants';
//                     })
//                     .map((field: any) => {
//                       const fieldName = field.name || field.fieldName;
//                       return (
//                         <div key={fieldName} className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
//                           <label className="flex items-center cursor-pointer">
//                             <input
//                               type="checkbox"
//                               checked={formData[fieldName] || false}
//                               onChange={(e) => {
//                                 console.log('hasVariants checkbox clicked:', e.target.checked);
//                                 handleFieldChange(fieldName, e.target.checked);
//                               }}
//                               className="mr-3 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
//                             />
//                             <span className="font-medium text-lg text-gray-800">{field.label}</span>
//                           </label>
//                           <p className="text-sm text-gray-600 mt-2 ml-7">{field.helpText}</p>
//                           <div className="mt-3 ml-7">
//                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
//                               formData[field.fieldName] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
//                             }`}>
//                               {formData[field.fieldName] ? '✅ Enabled' : '❌ Disabled'}
//                             </span>
//                           </div>
//                         </div>
//                       );
//                     })}

//                   {/* ✅ Variant configurator UI - renders when hasVariants=true */}
//                   {(() => {
//                     const hasVariantsEnabled = formData['hasVariants'] || false;

//                     // ✅ Get variantConfigurator field from backend schema
//                     const variantConfigField = schema.fields?.find((f: any) =>
//                       (f.name || f.fieldName) === 'variantConfigurator'
//                     );

//                     // ✅ Use backend field properties (no fallbacks - backend always provides)
//                     const label = variantConfigField?.label || '';
//                     const helpText = variantConfigField?.helpText || '';

//                     // If backend didn't provide variantConfigurator field, don't render
//                     if (!variantConfigField) {
//                       return null;
//                     }

//                     return (
//                       <div className={`transition-all duration-300 ${
//                         hasVariantsEnabled ? 'opacity-100' : 'opacity-60'
//                       }`}>
//                         <div className={`p-4 border rounded-lg ${
//                           hasVariantsEnabled
//                             ? 'bg-gradient-to-r from-green-50 to-blue-50 border-green-300'
//                             : 'bg-gray-50 border-gray-300'
//                         }`}>
//                           <h4 className="font-medium text-lg mb-2 flex items-center">
//                             <Star className="h-4 w-4 mr-2 text-purple-600" />
//                             {label}
//                           </h4>
//                           <p className="text-sm text-gray-600 mb-4">{helpText}</p>

//                           {!hasVariantsEnabled && (
//                             <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg mb-4">
//                               <div className="flex items-center">
//                                 <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
//                                 <span className="text-sm font-medium text-yellow-800">
//                                   Enable "Has Product Variants" above to configure variants
//                                 </span>
//                               </div>
//                             </div>
//                           )}

//                           {hasVariantsEnabled && (
//                             <div className="bg-white rounded-lg border border-gray-200 p-4">
//                               <VariantConfiguratorDynamic
//                                 value={formData['variantConfigurator']}
//                                 onChange={(value) => handleFieldChange('variantConfigurator', value)}
//                                 schema={schema}
//                                 formData={formData}
//                               />
//                             </div>
//                           )}
//                         </div>
//                       </div>
//                     );
//                   })()}
//                       </CardContent>
//                     </div>
//                   </Card>
//                 );
//               })()}

//               {/* Validation Results Display */}
//               {showValidation && validationResult && (
//                 <div id="validation-results">
//                   <ValidationResultDisplay
//                     result={validationResult}
//                     onClose={() => setShowValidation(false)}
//                   />
//                 </div>
//               )}

//               {/* Actions Card */}
//               <Card>
//                 <CardContent className="pt-6">
//                   <div className="flex items-center justify-between">
//                     <div className="flex items-center space-x-4">
//                       <div className="text-sm text-gray-600">
//                         <span className="font-medium">Fields completed:</span> {Object.values(formData).filter(v => v !== undefined && v !== '').length} / {schema?.fields?.length || 0}
//                       </div>
//                     </div>
//                     <Button
//                       type="submit"
//                       disabled={isSubmitting}
//                       className="px-8 py-2"
//                     >
//                       {isSubmitting ? (
//                         <>
//                           <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                           Creating Product...
//                         </>
//                       ) : (
//                         <>
//                           <Package className="h-4 w-4 mr-2" />
//                           Create Product
//                         </>
//                       )}
//                     </Button>
//                   </div>
//                 </CardContent>
//               </Card>

//             </form>
//           ) : (
//             <Card>
//               <CardContent className="p-8 text-center text-gray-500">
//                 <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
//                 <p>No schema available</p>
//               </CardContent>
//             </Card>
//           )}
//         </div>

//         {/* Real-time JSON Preview */}
//         {showJsonPreview && (
//           <div className="xl:col-span-1">
//             <div className="sticky top-4 space-y-4">
              
//               {/* Generated masterProduct JSON */}
//               <Card>
//                 <CardHeader>
//                   <div className="flex items-center justify-between">
//                     <CardTitle className="text-sm flex items-center">
//                       📋 Generated Product
//                     </CardTitle>
//                     <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-medium">
//                       Real-time
//                     </span>
//                   </div>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="bg-gray-900 rounded-lg overflow-hidden">
//                     <div className="p-4 overflow-auto max-h-80">
//                       <pre className="text-xs text-green-400 font-mono leading-relaxed">
//                         {JSON.stringify(generateMasterProduct(formData), null, 2)}
//                       </pre>
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>

//               {/* Raw Form Data JSON */}
//               <Card>
//                 <CardHeader>
//                   <div className="flex items-center justify-between">
//                     <CardTitle className="text-sm flex items-center">
//                       🔧 Form Data
//                     </CardTitle>
//                     <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full font-medium">
//                       Debug
//                     </span>
//                   </div>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="bg-gray-900 rounded-lg overflow-hidden">
//                     <div className="p-4 overflow-auto max-h-64">
//                       <pre className="text-xs text-cyan-400 font-mono leading-relaxed">
//                         {JSON.stringify(formData, null, 2)}
//                       </pre>
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>

//               {/* Schema Info */}
//               <Card>
//                 <CardHeader>
//                   <CardTitle className="text-sm">📊 Schema Stats</CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="space-y-3 text-sm">
//                     <div className="flex justify-between">
//                       <span className="text-gray-600">Total Fields:</span>
//                       <span className="font-medium">{schema?.fields?.length || 0}</span>
//                     </div>
//                     <div className="flex justify-between">
//                       <span className="text-gray-600">Completed:</span>
//                       <span className="font-medium text-green-600">
//                         {Object.values(formData).filter(v => v !== undefined && v !== '').length}
//                       </span>
//                     </div>
//                     <div className="flex justify-between">
//                       <span className="text-gray-600">Custom Attrs:</span>
//                       <span className="font-medium text-blue-600">
//                         {generateMasterProduct(formData).customAttributes ? Object.keys(generateMasterProduct(formData).customAttributes!).length : 0}
//                       </span>
//                     </div>
//                     <div className="pt-2 border-t">
//                       <div className="flex justify-between items-center">
//                         <span className="text-gray-600">Progress:</span>
//                         <div className="flex items-center space-x-2">
//                           <div className="w-16 bg-gray-200 rounded-full h-2">
//                             <div 
//                               className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
//                               style={{ 
//                                 width: `${Math.round((Object.values(formData).filter(v => v !== undefined && v !== '').length / (schema?.fields?.length || 1)) * 100)}%` 
//                               }}
//                             ></div>
//                           </div>
//                           <span className="text-xs font-medium">
//                             {Math.round((Object.values(formData).filter(v => v !== undefined && v !== '').length / (schema?.fields?.length || 1)) * 100)}%
//                           </span>
//                         </div>
//                       </div>
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>

//             </div>
//           </div>
//         )}
//       </div>

//       {/* Debug Info (development only) */}
//       {debugMode && (
//         <Card>
//           <CardHeader>
//             <CardTitle className="text-sm">🐛 Debug Information</CardTitle>
//           </CardHeader>
//           <CardContent>
//             <div className="grid grid-cols-2 gap-4 text-xs">
//               <div className="space-y-2">
//                 <div><span className="font-medium">Channels:</span> {stableContext.targetChannels.join(', ')}</div>
//                 <div><span className="font-medium">Category:</span> {stableContext.productCategory}</div>
//                 <div><span className="font-medium">User Role:</span> {stableContext.userRole}</div>
//               </div>
//               <div className="space-y-2">
//                 <div><span className="font-medium">Schema Fields:</span> {schema?.fields?.length || 0}</div>
//                 <div><span className="font-medium">Form Keys:</span> {Object.keys(formData).length}</div>
//                 <div><span className="font-medium">Schema Title:</span> {schema?.title || 'N/A'}</div>
//               </div>
//             </div>
//           </CardContent>
//         </Card>
//       )}


//     </div>
//   );
// }