"use client";

/**
 * Simple Product Form - Direct implementation to test variants
 */

import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2, AlertCircle } from '@/components/ui/icons/Icons';

export default function SimpleProductForm() {
  const [schema, setSchema] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    const loadSchema = async () => {
      try {
        const { BackendAPIService, createBackendContext } = await import('@/lib/api/backendService');
        
        const backendContext = createBackendContext(
          'user-123',
          'retail-division',
          'BUSINESS_USER',
          ['shopify', 'amazon', 'walmart', 'ebay'],
          'electronics',
          ['read', 'write', 'create']
        );
        
        const result: any = await BackendAPIService.generateFormSchema(backendContext);
        const parsedSchema = result.formSchema ? result.formSchema : result;
        
        console.log('[SimpleProductForm] ✅ Schema loaded with', parsedSchema.fields?.length, 'fields');
        setSchema(parsedSchema);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setError(`Backend API error: ${errorMessage}`);
        console.error('[SimpleProductForm] ❌ Error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSchema();
  }, []);

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const renderField = (field: any) => {
    const normalizedType = field.fieldType.toLowerCase();
    
    if (field.fieldName === 'hasVariants') {
      return (
        <div key={field.fieldName} className="mb-4 p-3 border-2 border-blue-200 rounded-lg bg-blue-50">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData[field.fieldName] || false}
              onChange={(e) => {
                console.log('hasVariants checkbox clicked:', e.target.checked);
                handleInputChange(field.fieldName, e.target.checked);
              }}
              className="mr-3 w-4 h-4"
            />
            <span className="font-medium text-lg">{field.label}</span>
          </label>
          <p className="text-sm text-gray-600 mt-2">{field.helpText}</p>
          <div className="mt-2 text-sm">
            <strong>Current value:</strong> {formData[field.fieldName] ? 'TRUE ✅' : 'FALSE ❌'}
          </div>
        </div>
      );
    }
    
    if (field.fieldName === 'variantConfigurator') {
      const hasVariantsEnabled = formData['hasVariants'] || false;
      
      return (
        <div key={field.fieldName} className={`mb-6 p-4 border rounded-lg transition-all ${
          hasVariantsEnabled ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300 opacity-60'
        }`}>
          <h3 className="font-medium text-lg mb-2">{field.label}</h3>
          <p className="text-sm text-gray-600 mb-4">{field.helpText}</p>
          
          {!hasVariantsEnabled && (
            <div className="p-3 bg-yellow-100 border border-yellow-300 rounded mb-4">
              <strong>⚠️ Enable "Has Product Variants" checkbox above to activate this section</strong>
            </div>
          )}
          
          <div className="space-y-4">
            <div className="p-3 bg-white rounded border">
              <strong>✅ Variant Field Found!</strong>
              <br />Type: {field.fieldType}
              <br />Order: {field.order}
              <br />Conditional Visibility: {JSON.stringify(field.conditionalVisibility)}
              <br />Status: {hasVariantsEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
            </div>
            
            {hasVariantsEnabled && (
              <div className="space-y-3">
                <div>
                  <label className="block font-medium mb-2">Variant Configuration:</label>
                  <textarea
                    placeholder="Enter variant configuration as JSON... e.g. {&quot;colors&quot;: [&quot;red&quot;, &quot;blue&quot;], &quot;sizes&quot;: [&quot;S&quot;, &quot;M&quot;, &quot;L&quot;]}"
                    value={formData[field.fieldName] || ''}
                    onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
                    className="w-full p-3 border rounded"
                    rows={6}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium mb-1">Variant Price:</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Variant Cost:</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      className="w-full p-2 border rounded"
                    />
                  </div>
                </div>
                
                <button 
                  type="button"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => {
                    const sampleVariants = JSON.stringify({
                      "variants": [
                        {"color": "red", "size": "S", "price": 29.99, "sku": "PROD-RED-S"},
                        {"color": "red", "size": "M", "price": 29.99, "sku": "PROD-RED-M"},
                        {"color": "blue", "size": "S", "price": 29.99, "sku": "PROD-BLUE-S"},
                        {"color": "blue", "size": "M", "price": 29.99, "sku": "PROD-BLUE-M"}
                      ],
                      "options": {
                        "color": ["red", "blue"],
                        "size": ["S", "M", "L"]
                      }
                    }, null, 2);
                    handleInputChange(field.fieldName, sampleVariants);
                  }}
                >
                  Load Sample Variants
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Basic field rendering for other types
    switch (normalizedType) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <div key={field.fieldName} className="mb-4">
            <label className="block font-medium mb-1">{field.label}</label>
            <input
              type={normalizedType}
              placeholder={field.placeholder}
              value={formData[field.fieldName] || ''}
              onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
              className="w-full p-2 border rounded"
            />
            <p className="text-sm text-gray-600">{field.helpText}</p>
          </div>
        );
      
      case 'textarea':
        return (
          <div key={field.fieldName} className="mb-4">
            <label className="block font-medium mb-1">{field.label}</label>
            <textarea
              placeholder={field.placeholder}
              value={formData[field.fieldName] || ''}
              onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
            />
            <p className="text-sm text-gray-600">{field.helpText}</p>
          </div>
        );
      
      case 'select':
        return (
          <div key={field.fieldName} className="mb-4">
            <label className="block font-medium mb-1">{field.label}</label>
            <select
              value={formData[field.fieldName] || ''}
              onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">{field.placeholder}</option>
              {field.options?.map((option: any) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-600">{field.helpText}</p>
          </div>
        );
      
      case 'checkbox':
        return (
          <div key={field.fieldName} className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData[field.fieldName] || false}
                onChange={(e) => handleInputChange(field.fieldName, e.target.checked)}
                className="mr-2"
              />
              <span className="font-medium">{field.label}</span>
            </label>
            <p className="text-sm text-gray-600">{field.helpText}</p>
          </div>
        );
      
      default:
        return (
          <div key={field.fieldName} className="mb-4 p-3 bg-yellow-50 border rounded">
            <strong>Unhandled field type: {field.fieldType}</strong>
            <br />Field: {field.fieldName} - {field.label}
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading form schema...</p>
        </div>
      </div>
    );
  }

  if (error || !schema) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Failed to load form schema. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const variantFields = schema.fields?.filter((f: any) => 
    f.fieldName === 'hasVariants' || f.fieldName === 'variantConfigurator'
  ) || [];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Simple Product Form Test</h1>
        <div className="text-sm text-gray-600 space-y-1">
          <div>✅ Schema loaded: {schema.fields?.length || 0} fields total</div>
          <div>✅ Variant fields found: {variantFields.length}</div>
          {variantFields.map((f: any) => (
            <div key={f.fieldName}>
              - {f.fieldName} ({f.fieldType}) - Order: {f.order}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Form Fields</h2>
          <div className="space-y-4">
            {schema.fields?.slice(0, 10).map((field: any) => renderField(field))}
            
            {/* Specifically render variant fields */}
            <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-4">🎯 Variant Fields Section</h3>
              {variantFields.map((field: any) => renderField(field))}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Form Data (JSON)</h2>
          <div className="bg-gray-900 rounded-lg p-4">
            <pre className="text-green-400 text-xs overflow-auto">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}