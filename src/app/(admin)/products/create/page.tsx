'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Badge from '@/components/ui/badge/Badge';
import Progress from '@/components/ui/progress/Progress';
import { 
  CheckCircle2, 
  ArrowRight, 
  Package, 
  Settings, 
  Send,
  Eye
} from '@/components/ui/icons/Icons';
import MasterProductCreationForm from '@/components/products/MasterProductCreationForm';
import ChannelSelectionInterface from '@/components/products/ChannelSelectionInterface';
import ChannelPayloadReview from '@/components/products/ChannelPayloadReview';
import { MasterProduct } from '@/types/product';
import { ChannelMappingResult } from '@/types/channel';
import { PublishResult } from '@/services/ChannelMappingService';

type WorkflowStep = 'product' | 'channels' | 'review' | 'complete';

interface WorkflowState {
  masterProduct: MasterProduct | null;
  availableChannels: string[];
  mappingResults: ChannelMappingResult[];
  publishResults: PublishResult[];
}

export default function CreateProductPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('product');
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    masterProduct: null,
    availableChannels: [],
    mappingResults: [],
    publishResults: []
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
      title: 'Select Channels',
      description: 'Choose publishing destinations',
      icon: Settings,
      completed: workflowState.mappingResults.length > 0
    },
    {
      id: 'review' as WorkflowStep,
      title: 'Review & Publish',
      description: 'Verify and publish',
      icon: Eye,
      completed: workflowState.publishResults.some(r => r.success)
    },
    {
      id: 'complete' as WorkflowStep,
      title: 'Complete',
      description: 'Workflow finished',
      icon: CheckCircle2,
      completed: workflowState.publishResults.length > 0 && 
                 workflowState.publishResults.every(r => r.success)
    }
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

  const handleProductCreated = (product: MasterProduct, availableChannels: string[]) => {
    setWorkflowState(prev => ({
      ...prev,
      masterProduct: product,
      availableChannels
    }));
    setCurrentStep('channels');
  };

  const handleMappingComplete = (results: ChannelMappingResult[]) => {
    setWorkflowState(prev => ({
      ...prev,
      mappingResults: results
    }));
    setCurrentStep('review');
  };

  const handlePublishComplete = (results: PublishResult[]) => {
    setWorkflowState(prev => ({
      ...prev,
      publishResults: results
    }));
    setCurrentStep('complete');
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
          <MasterProductCreationForm 
            onProductCreated={handleProductCreated}
          />
        );
      
      case 'channels':
        return workflowState.masterProduct ? (
          <ChannelSelectionInterface
            masterProduct={workflowState.masterProduct}
            onMappingComplete={handleMappingComplete}
          />
        ) : (
          <div className="text-center py-12">
            <p>No product data available. Please go back to create a product first.</p>
          </div>
        );
      
      case 'review':
        return workflowState.mappingResults.length > 0 && workflowState.masterProduct ? (
          <ChannelPayloadReview
            mappingResults={workflowState.mappingResults}
            productId={workflowState.masterProduct.id}
            onPublishComplete={handlePublishComplete}
          />
        ) : (
          <div className="text-center py-12">
            <p>No mapping results available. Please go back to select channels.</p>
          </div>
        );
      
      case 'complete':
        return (
          <CompletionSummary 
            workflowState={workflowState}
            onStartNew={() => {
              setCurrentStep('product');
              setWorkflowState({
                masterProduct: null,
                availableChannels: [],
                mappingResults: [],
                publishResults: []
              });
            }}
            onViewProduct={() => {
              if (workflowState.masterProduct) {
                router.push(`/products/${workflowState.masterProduct.id}`);
              }
            }}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Create New Product</h1>
            <p className="text-gray-600">Complete omnichannel product creation workflow</p>
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

// Completion Summary Component
interface CompletionSummaryProps {
  workflowState: WorkflowState;
  onStartNew: () => void;
  onViewProduct: () => void;
}

function CompletionSummary({ workflowState, onStartNew, onViewProduct }: CompletionSummaryProps) {
  const { masterProduct, mappingResults, publishResults } = workflowState;
  
  const successfulPublishes = publishResults.filter(r => r.success);
  const failedPublishes = publishResults.filter(r => !r.success);
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-6 w-6" />
            Product Creation Complete!
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Product Summary */}
            {masterProduct && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Product Details</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="font-medium">Product Name</div>
                      <div className="text-gray-600">{masterProduct.name}</div>
                    </div>
                    <div>
                      <div className="font-medium">SKU</div>
                      <div className="text-gray-600">{masterProduct.sku}</div>
                    </div>
                    <div>
                      <div className="font-medium">Price</div>
                      <div className="text-gray-600">${masterProduct.price}</div>
                    </div>
                    <div>
                      <div className="font-medium">Category</div>
                      <div className="text-gray-600">{masterProduct.category || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Publishing Summary */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Publishing Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-blue-600">{mappingResults.length}</div>
                    <div className="text-sm text-gray-600">Channels Mapped</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-green-600">{successfulPublishes.length}</div>
                    <div className="text-sm text-gray-600">Successful Publishes</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-red-600">{failedPublishes.length}</div>
                    <div className="text-sm text-gray-600">Failed Publishes</div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Channel Details */}
            {publishResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Channel Status</h3>
                <div className="space-y-2">
                  {publishResults.map((result, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${result.success ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="font-medium capitalize">
                          {mappingResults.find(m => m.channelId === Object.keys(result)[0])?.channelId || 'Unknown Channel'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <>
                            <Badge variant="light" color="success">
                              Published
                            </Badge>
                            {result.url && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => window.open(result.url, '_blank')}
                              >
                                View
                              </Button>
                            )}
                          </>
                        ) : (
                          <Badge variant="light" color="error">
                            Failed
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-center gap-4 pt-6">
              <Button onClick={onStartNew} variant="outline">
                Create Another Product
              </Button>
              <Button onClick={onViewProduct}>
                <Send className="h-4 w-4 mr-2" />
                View Product Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}