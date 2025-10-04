'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select/Select';
import Textarea from '@/components/ui/textarea/Textarea';
import Badge from '@/components/ui/badge/Badge';
import Progress from '@/components/ui/progress/Progress';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/Tabs';
import { 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  Save, 
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  Settings
} from '@/components/ui/icons/Icons';
import { bulkOperationsService } from '@/services/BulkOperationsService';
import { 
  BulkEditOperation, 
  BulkEditRequest, 
  BulkEditResult,
  BulkSelectionCriteria,
  BulkOperationPreview,
  BulkOperationTemplate
} from '@/types/bulk';
import { MasterProduct } from '@/types/product';

interface BulkEditInterfaceProps {
  selectedProducts?: MasterProduct[];
  onOperationComplete?: (results: BulkEditResult[]) => void;
}

export default function BulkEditInterface({ 
  selectedProducts = [], 
  onOperationComplete 
}: BulkEditInterfaceProps) {
  const [operations, setOperations] = useState<BulkEditOperation[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState<BulkEditResult[]>([]);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, percentage: 0 });
  const [preview, setPreview] = useState<BulkOperationPreview | null>(null);
  const [templates, setTemplates] = useState<BulkOperationTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [selectionCriteria, setSelectionCriteria] = useState<BulkSelectionCriteria>({
    type: 'SPECIFIC_PRODUCTS',
    productIds: selectedProducts.map(p => p.id)
  });

  useEffect(() => {
    loadTemplates();
    if (selectedProducts.length > 0) {
      setSelectionCriteria({
        type: 'SPECIFIC_PRODUCTS',
        productIds: selectedProducts.map(p => p.id)
      });
    }
  }, [selectedProducts]);

  const loadTemplates = async () => {
    try {
      const loadedTemplates = await bulkOperationsService.getBulkOperationTemplates();
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const addOperation = () => {
    setOperations([...operations, {
      fieldName: '',
      operation: 'SET',
      value: ''
    }]);
  };

  const removeOperation = (index: number) => {
    setOperations(operations.filter((_, i) => i !== index));
  };

  const updateOperation = (index: number, updates: Partial<BulkEditOperation>) => {
    setOperations(operations.map((op, i) => 
      i === index ? { ...op, ...updates } : op
    ));
  };

  const loadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setOperations([...template.operations]);
      if (template.selectionCriteria) {
        setSelectionCriteria(template.selectionCriteria);
      }
    }
  };

  const saveAsTemplate = async () => {
    const templateName = prompt('Enter template name:');
    if (!templateName) return;

    try {
      await bulkOperationsService.saveBulkOperationTemplate({
        name: templateName,
        description: `Template with ${operations.length} operations`,
        type: 'PRODUCT_EDIT',
        operations,
        selectionCriteria,
        tags: ['user-created'],
        isPublic: false,
        createdBy: 'current-user',
        lastModified: new Date().toISOString(),
        usageCount: 0,
        version: 1
      });
      
      await loadTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const generatePreview = async () => {
    if (operations.length === 0) return;

    try {
      setShowPreview(true);
      const previewData = await bulkOperationsService.validateBulkOperation({
        productIds: selectionCriteria.type === 'SPECIFIC_PRODUCTS' 
          ? selectionCriteria.productIds 
          : [],
        operations,
        options: { validateOnly: true }
      });
      
      // Convert validation result to preview format
      setPreview({
        criteria: selectionCriteria,
        matchingProducts: selectionCriteria.productIds?.length || 0,
        sampleProducts: [],
        estimatedImpact: {
          fieldsToModify: operations.map(op => op.fieldName),
          productsAffected: selectionCriteria.productIds?.length || 0,
          channelsAffected: [],
          estimatedDuration: previewData.estimatedDuration || 60,
          riskLevel: 'MEDIUM',
          potentialIssues: previewData.warnings || []
        }
      });
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  const executeBulkEdit = async () => {
    if (operations.length === 0) return;

    setIsExecuting(true);
    setProgress({ completed: 0, total: selectedProducts.length, percentage: 0 });

    try {
      const request: BulkEditRequest = {
        productIds: selectionCriteria.type === 'SPECIFIC_PRODUCTS' 
          ? selectionCriteria.productIds || []
          : selectedProducts.map(p => p.id),
        operations,
        options: {
          continueOnError: true,
          batchSize: 10
        }
      };

      const response = await bulkOperationsService.bulkEditProducts(request);
      
      setOperationId(response.operationId);
      setResults(response.results);
      setProgress({
        completed: response.successfulUpdates,
        total: response.totalProducts,
        percentage: (response.successfulUpdates / response.totalProducts) * 100
      });

      if (onOperationComplete) {
        onOperationComplete(response.results);
      }
    } catch (error) {
      console.error('Bulk edit failed:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'SET': return '=';
      case 'APPEND': return '+';
      case 'PREPEND': return '←';
      case 'MULTIPLY': return '×';
      case 'INCREMENT': return '++';
      case 'CLEAR': return '∅';
      case 'REPLACE': return '⟲';
      default: return '?';
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'LOW': return 'text-green-600 bg-green-100';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
      case 'HIGH': return 'text-orange-600 bg-orange-100';
      case 'CRITICAL': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Bulk Edit Products</span>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="light" color="light">
                {selectionCriteria.type === 'SPECIFIC_PRODUCTS' 
                  ? `${selectionCriteria.productIds?.length || 0} products selected`
                  : 'Filter-based selection'
                }
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      <Tabs defaultValue="operations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="selection">Selection</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Edit Operations</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={addOperation} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Operation
                  </Button>
                  <Button onClick={generatePreview} variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button onClick={saveAsTemplate} variant="outline" size="sm">
                    <Save className="h-4 w-4 mr-1" />
                    Save Template
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {operations.map((operation, index) => (
                  <Card key={index} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                      <div className="space-y-2">
                        <Label>Field</Label>
                        <Select
                          value={operation.fieldName}
                          onValueChange={(value) => updateOperation(index, { fieldName: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="name">Product Name</SelectItem>
                            <SelectItem value="description">Description</SelectItem>
                            <SelectItem value="price">Price</SelectItem>
                            <SelectItem value="compareAtPrice">Compare At Price</SelectItem>
                            <SelectItem value="category">Category</SelectItem>
                            <SelectItem value="brand">Brand</SelectItem>
                            <SelectItem value="tags">Tags</SelectItem>
                            <SelectItem value="status">Status</SelectItem>
                            <SelectItem value="weight">Weight</SelectItem>
                            <SelectItem value="quantity">Quantity</SelectItem>
                            <SelectItem value="metaTitle">SEO Title</SelectItem>
                            <SelectItem value="metaDescription">SEO Description</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Operation</Label>
                        <Select
                          value={operation.operation}
                          onValueChange={(value) => updateOperation(index, { 
                            operation: value as BulkEditOperation['operation'] 
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SET">Set to</SelectItem>
                            <SelectItem value="APPEND">Append</SelectItem>
                            <SelectItem value="PREPEND">Prepend</SelectItem>
                            <SelectItem value="MULTIPLY">Multiply by</SelectItem>
                            <SelectItem value="INCREMENT">Add</SelectItem>
                            <SelectItem value="CLEAR">Clear</SelectItem>
                            <SelectItem value="REPLACE">Replace</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Value</Label>
                        {operation.fieldName === 'description' || operation.fieldName === 'metaDescription' ? (
                          <Textarea
                            value={operation.value}
                            onChange={(e) => updateOperation(index, { value: e.target.value })}
                            placeholder="Enter value"
                            rows={2}
                          />
                        ) : (
                          <Input
                            type={['price', 'compareAtPrice', 'weight', 'quantity'].includes(operation.fieldName) ? 'number' : 'text'}
                            value={operation.value}
                            onChange={(e) => updateOperation(index, { value: e.target.value })}
                            placeholder="Enter value"
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="light" color="light" className="px-2 py-1">
                          {getOperationIcon(operation.operation)}
                        </Badge>
                        <Button 
                          onClick={() => removeOperation(index)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}

                {operations.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No operations configured. Click "Add Operation" to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {showPreview && preview && (
            <Card>
              <CardHeader>
                <CardTitle>Operation Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {preview.matchingProducts}
                    </div>
                    <div className="text-sm text-gray-600">Products Affected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {preview.estimatedImpact.fieldsToModify.length}
                    </div>
                    <div className="text-sm text-gray-600">Fields Modified</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {Math.round(preview.estimatedImpact.estimatedDuration / 60)}m
                    </div>
                    <div className="text-sm text-gray-600">Estimated Time</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Risk Level:</span>
                    <Badge className={getRiskLevelColor(preview.estimatedImpact.riskLevel)}>
                      {preview.estimatedImpact.riskLevel}
                    </Badge>
                  </div>

                  {preview.estimatedImpact.potentialIssues.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          <div className="font-medium">Potential Issues:</div>
                          {preview.estimatedImpact.potentialIssues.map((issue, index) => (
                            <div key={index} className="text-sm">• {issue}</div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Execute Button */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Ready to apply {operations.length} operation{operations.length !== 1 ? 's' : ''} to{' '}
                  {selectionCriteria.productIds?.length || 0} product{(selectionCriteria.productIds?.length || 0) !== 1 ? 's' : ''}
                </div>
                <Button
                  onClick={executeBulkEdit}
                  disabled={operations.length === 0 || isExecuting}
                  className="min-w-[150px]"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Execute Operations
                    </>
                  )}
                </Button>
              </div>

              {isExecuting && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress</span>
                    <span>{progress.completed}/{progress.total} products</span>
                  </div>
                  <Progress value={progress.percentage} className="w-full" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Operation Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} ({template.operations.length} operations)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={() => selectedTemplate && loadTemplate(selectedTemplate)}
                    disabled={!selectedTemplate}
                  >
                    Load Template
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map(template => (
                    <Card key={template.id} className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{template.name}</h4>
                          <Badge variant="light" color="light">{template.type}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{template.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{template.operations.length} operations</span>
                          <span>Used {template.usageCount} times</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadTemplate(template.id)}
                          className="w-full"
                        >
                          Load Template
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {results.length > 0 ? (
            <BulkEditResults results={results} operationId={operationId} />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No operations have been executed yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Bulk Edit Results Component
interface BulkEditResultsProps {
  results: BulkEditResult[];
  operationId: string | null;
}

function BulkEditResults({ results, operationId }: BulkEditResultsProps) {
  const successfulResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);

  const downloadResults = () => {
    const dataStr = JSON.stringify(results, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `bulk-edit-results-${operationId || Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Bulk Edit Results</CardTitle>
          <Button onClick={downloadResults} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Download Results
          </Button>
        </div>
        <div className="flex gap-4 text-sm">
          <Badge variant="light" color="success">
            Success: {successfulResults.length}
          </Badge>
          {failedResults.length > 0 && (
            <Badge variant="light" color="error">
              Failed: {failedResults.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {results.map(result => (
            <Card key={result.productId} className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="font-medium">Product {result.productId}</span>
                  </div>
                  
                  {result.success && result.appliedOperations.length > 0 && (
                    <div className="text-sm text-gray-600">
                      Applied: {result.appliedOperations.join(', ')}
                    </div>
                  )}
                  
                  {result.failedOperations.length > 0 && (
                    <div className="text-sm text-red-600">
                      Failed: {result.failedOperations.join(', ')}
                    </div>
                  )}
                  
                  {result.errors && result.errors.length > 0 && (
                    <div className="text-sm text-red-600">
                      Errors: {result.errors.join(', ')}
                    </div>
                  )}
                </div>
                
                <div className="text-right text-sm text-gray-500">
                  <div>{result.fieldsModified} fields modified</div>
                  <div>{result.processingTime}ms</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}