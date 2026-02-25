'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import Badge from '@/shared/ui/badge/Badge';
import Progress from '@/shared/ui/progress/Progress';
import {
  CheckCircle2,
  ArrowRight,
  Package,
  Settings,
  Send,
  Eye,
  Info
} from '@/shared/ui/icons/Icons';
import ProductCreationPageWrapper from '@/modules/ecommerce-product/components/ProductCreationPageWrapper';
import { MasterProduct } from '@/modules/ecommerce-product/types/product';

type WorkflowStep = 'product' | 'channels' | 'review' | 'complete';

interface WorkflowState {
  masterProduct: MasterProduct | null;
  availableChannels: string[];
}

export default function CreateProductPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('product');
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    masterProduct: null,
    availableChannels: []
  });

  const steps = [
    {
      id: 'product' as WorkflowStep,
      title: 'Create Product',
      description: 'Basic product information',
      icon: Package,
      completed: !!workflowState.masterProduct
    },
    {
      id: 'channels' as WorkflowStep,
      title: 'Next Steps',
      description: 'Publish to channels',
      icon: Send,
      completed: !!workflowState.masterProduct
    }
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

  // Memoize stable props to prevent re-renders
  const stableDebugMode = useMemo(() => process.env.NODE_ENV === 'development', []);

  const handleProductCreated = (product: MasterProduct, availableChannels: string[]) => {
    console.log('[CreateProduct] Product created successfully:', product);

    // Ensure product has an ID (generate one if backend didn't provide)
    if (!product.id) {
      console.warn('[CreateProduct] Product missing ID, generating one...');
      product.id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('[CreateProduct] Generated ID:', product.id);
    }

    // Store product in session storage for channel publish page
    if (typeof window !== 'undefined') {
      const storageKey = `product_${product.id}`;
      sessionStorage.setItem(storageKey, JSON.stringify(product));
      console.log('[CreateProduct] ✓ Stored product in session storage:', {
        key: storageKey,
        productId: product.id,
        productName: product.name,
        productSku: product.sku
      });
    }

    setWorkflowState(prev => ({
      ...prev,
      masterProduct: product,
      availableChannels
    }));
    setCurrentStep('channels');
  };


  const goToStep = (step: WorkflowStep) => {
    const stepIndex = steps.findIndex(s => s.id === step);
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    
    // Only allow going to previous steps or the next immediate step
    if (stepIndex <= currentIndex || (stepIndex === currentIndex + 1 && steps[currentIndex].completed)) {
      setCurrentStep(step);
    }
  };

  const canNavigateToStep = (step: WorkflowStep) => {
    const stepIndex = steps.findIndex(s => s.id === step);
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    
    if (stepIndex <= currentIndex) return true;
    if (stepIndex === currentIndex + 1 && steps[currentIndex].completed) return true;
    return false;
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'product':
        return (
          <ProductCreationPageWrapper
            onProductCreated={handleProductCreated}
            debugMode={stableDebugMode}
          />
        );
      
      case 'channels':
        return workflowState.masterProduct ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
                Product Created Successfully!
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Product Summary */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="font-semibold text-lg mb-4">Product Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Product ID</div>
                    <div className="font-medium text-xs text-gray-500 font-mono">
                      {workflowState.masterProduct.id || 'Not assigned'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">SKU</div>
                    <div className="font-medium">{workflowState.masterProduct.sku || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Product Name</div>
                    <div className="font-medium">{workflowState.masterProduct.name || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Price</div>
                    <div className="font-medium">
                      {workflowState.masterProduct.price != null
                        ? `$${workflowState.masterProduct.price.toFixed(2)}`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Category</div>
                    <div className="font-medium">{workflowState.masterProduct.category || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Inventory</div>
                    <div className="font-medium">
                      {workflowState.masterProduct.quantity != null
                        ? workflowState.masterProduct.quantity
                        : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">What's Next?</h3>
                <p className="text-gray-600">
                  Your master product has been created. Now you can publish it to sales channels using our
                  intelligent adaptive pattern matching system.
                </p>

                {/* Primary Action - Publish to Channels */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-8 text-center">
                  <div className="flex items-center justify-center mb-4">
                    <div className="bg-blue-600 rounded-full p-4">
                      <Send className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-blue-900 mb-2">
                    Ready to Publish to Sales Channels?
                  </h3>
                  <p className="text-blue-700 mb-6 max-w-2xl mx-auto">
                    Use our intelligent adaptive pattern matching system to automatically map your product fields
                    to Shopify, Amazon, Walmart, eBay and more. See real-time confidence scores with our 5-tier
                    matching strategy.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={() => {
                        router.push(`/products/${workflowState.masterProduct!.id}/channel-fields`);
                      }}
                      className="text-lg px-8 py-3"
                    >
                      <Send className="h-5 w-5 mr-2" />
                      Fill Channel Fields
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCurrentStep('product');
                        setWorkflowState({
                          masterProduct: null,
                          availableChannels: []
                        });
                      }}
                      className="text-lg px-8 py-3"
                    >
                      <Package className="h-5 w-5 mr-2" />
                      Create Another Product
                    </Button>
                  </div>
                </div>

                {/* Product Information Card */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Info className="h-5 w-5 text-gray-600" />
                    What Happens Next?
                  </h4>
                  <div className="space-y-3 text-sm text-gray-600">
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 text-blue-600 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        1
                      </div>
                      <div>
                        <strong className="text-gray-900">Select Your Channel</strong>
                        <p>Choose from Shopify, Amazon, Walmart, eBay, or other supported platforms</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 text-blue-600 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        2
                      </div>
                      <div>
                        <strong className="text-gray-900">Analyze Pattern Matching</strong>
                        <p>Our AI uses 5-tier strategy: Knowledge-Based → Semantic → Similarity → Pattern → Boost</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 text-blue-600 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        3
                      </div>
                      <div>
                        <strong className="text-gray-900">Review & Publish</strong>
                        <p>See confidence scores, field mappings, and preview transformations before publishing</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-12">
            <p>No product data available. Please go back to create a product first.</p>
          </div>
        );

      default:
        return (
          <div className="text-center py-12">
            <p>Unknown step. Please start over.</p>
          </div>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Create New Product</h1>
            <p className="text-gray-600">Complete omnichannel product creation workflow with backend-driven validation</p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push('/products')}
          >
            Back to Products
          </Button>
        </div>

        {/* Progress Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span>Workflow Progress</span>
                <span>{Math.round(progressPercentage)}% Complete</span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step Navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isClickable = canNavigateToStep(step.id);
              
              return (
                <React.Fragment key={step.id}>
                  <div 
                    className={`flex flex-col items-center text-center cursor-pointer transition-all ${
                      isClickable ? 'hover:opacity-80' : 'cursor-not-allowed opacity-50'
                    }`}
                    onClick={() => isClickable && goToStep(step.id)}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all ${
                      isActive 
                        ? 'bg-blue-600 text-white' 
                        : step.completed 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-200 text-gray-600'
                    }`}>
                      {step.completed && !isActive ? (
                        <CheckCircle2 className="h-6 w-6" />
                      ) : (
                        <Icon className="h-6 w-6" />
                      )}
                    </div>
                    <div className={`font-medium ${isActive ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-600'}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500 max-w-20">
                      {step.description}
                    </div>
                    {step.completed && (
                      <Badge variant="light" color="success" className="mt-1 text-xs">
                        Complete
                      </Badge>
                    )}
                  </div>
                  
                  {index < steps.length - 1 && (
                    <ArrowRight className="h-5 w-5 text-gray-400 mx-4" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <div className="min-h-96">
        {renderStepContent()}
      </div>
    </div>
  );
}

