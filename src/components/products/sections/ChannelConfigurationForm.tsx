"use client";
import React, { useState } from "react";
import { ChannelConfig, ChannelSpecificData, ChannelFormProps } from "../channels/ChannelTypes";
import { ProductData } from "../ProductCreateForm";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";

interface ChannelConfigurationFormProps {
  channelConfig: ChannelConfig;
  data: ProductData;
  channelData: ChannelSpecificData;
  onUpdate: (channelId: string, updates: Partial<ChannelSpecificData>) => void;
  onSync?: (channelId: string) => Promise<void>;
  isReadOnly?: boolean;
}

export default function ChannelConfigurationForm({ 
  channelConfig, 
  data, 
  channelData, 
  onUpdate, 
  onSync, 
  isReadOnly = false 
}: ChannelConfigurationFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSync = async () => {
    if (!onSync) return;
    setIsLoading(true);
    try {
      await onSync(channelConfig.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    if (isReadOnly) return;

    const updatedData = {
      ...channelData,
      customFields: {
        ...channelData.customFields,
        [fieldName]: value
      }
    };

    onUpdate(channelConfig.id, updatedData);
  };

  const handleOverrideChange = (field: string, value: any) => {
    if (isReadOnly) return;
    onUpdate(channelConfig.id, { [field]: value });
  };

  const renderField = (field: any, value: any = '') => {
    const fieldValue = value || channelData.customFields?.[field.fieldName] || field.defaultValue || '';

    switch (field.type) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <input
            type={field.type}
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-orange-500"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.fieldName, parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-orange-500"
          />
        );

      case 'textarea':
        return (
          <textarea
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            maxLength={field.validation?.maxLength}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 resize-none focus:ring-2 focus:ring-orange-500"
          />
        );

      case 'select':
        return (
          <select
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Select {field.displayName}</option>
            {field.options?.map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <Switch
            label=""
            defaultChecked={fieldValue}
            onChange={(checked) => handleFieldChange(field.fieldName, checked)}
            disabled={isReadOnly}
          />
        );

      default:
        return (
          <input
            type="text"
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-orange-500"
          />
        );
    }
  };

  const getLastSyncStatus = () => {
    if (channelData.syncErrors && channelData.syncErrors.length > 0) {
      return {
        status: 'error',
        message: `${channelData.syncErrors.length} error(s)`,
        color: 'text-red-600 dark:text-red-400'
      };
    }
    
    if (channelData.lastSynced) {
      return {
        status: 'success',
        message: `Last synced: ${new Date(channelData.lastSynced).toLocaleString()}`,
        color: 'text-green-600 dark:text-green-400'
      };
    }
    
    return {
      status: 'pending',
      message: 'Never synced',
      color: 'text-yellow-600 dark:text-yellow-400'
    };
  };

  const syncStatus = getLastSyncStatus();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-orange-200 dark:border-orange-700">
      {/* Channel Header with Orange Theme */}
      <div className="p-6 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center text-2xl border border-orange-200 dark:border-orange-700">
              {channelConfig.icon}
            </div>
            <div>
              <h3 className="text-title-md font-semibold text-orange-900 dark:text-orange-100 flex items-center gap-2">
                {channelConfig.displayName}
                <span className="px-2 py-1 text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-full">
                  Override Settings
                </span>
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                {channelConfig.description}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={`text-sm font-medium ${syncStatus.color}`}>
                {syncStatus.message}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400">
                Channel-specific
              </div>
            </div>
            
            {onSync && (
              <Button
                onClick={handleSync}
                disabled={isLoading || !channelConfig.isConnected}
                size="sm"
                variant="outline"
              >
                {isLoading ? '🔄' : '🔄'} Sync
              </Button>
            )}
          </div>
        </div>

        {/* Sync Errors */}
        {channelData.syncErrors && channelData.syncErrors.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-400 mb-2">Sync Errors:</h4>
            <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
              {channelData.syncErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Channel Limitations */}
        {channelConfig.limitations.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-2">Channel Limitations:</h4>
            <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-300 space-y-1">
              {channelConfig.limitations.map((limitation, index) => (
                <li key={index}>{limitation.description}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Master Data Preview with Blue Theme */}
      <div className="p-6 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-200 dark:border-blue-800">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          Master Product Data (Read-only)
          <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
            Source of Truth
          </span>
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-blue-600 dark:text-blue-400">Name:</span>
            <span className="ml-2 text-blue-900 dark:text-blue-100 font-medium">{data.masterAttributes.product_name}</span>
          </div>
          <div>
            <span className="text-blue-600 dark:text-blue-400">SKU:</span>
            <span className="ml-2 text-blue-900 dark:text-blue-100 font-medium">{data.masterAttributes.sku}</span>
          </div>
          <div>
            <span className="text-blue-600 dark:text-blue-400">Price:</span>
            <span className="ml-2 text-blue-900 dark:text-blue-100 font-medium">
              {data.masterAttributes.currency} {data.masterAttributes.basePrice}
            </span>
          </div>
          <div>
            <span className="text-blue-600 dark:text-blue-400">Stock:</span>
            <span className="ml-2 text-blue-900 dark:text-blue-100 font-medium">{data.masterAttributes.stockQuantity}</span>
          </div>
          <div>
            <span className="text-blue-600 dark:text-blue-400">Category:</span>
            <span className="ml-2 text-blue-900 dark:text-blue-100 font-medium">{data.masterAttributes.category}</span>
          </div>
          <div>
            <span className="text-blue-600 dark:text-blue-400">Brand:</span>
            <span className="ml-2 text-blue-900 dark:text-blue-100 font-medium">{data.masterAttributes.brand}</span>
          </div>
        </div>
      </div>

      {/* Channel-Specific Configuration with Orange Theme */}
      <div className="p-6">
        <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-4 flex items-center gap-2">
          <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
          Channel-Specific Configuration
        </h4>

        <div className="space-y-6">
          {/* Master Data Overrides */}
          <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <h5 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-3">
              Master Data Overrides
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                  Title Override
                </label>
                <input
                  type="text"
                  value={channelData.customTitle || ''}
                  onChange={(e) => handleOverrideChange('customTitle', e.target.value)}
                  placeholder={`Default: ${data.masterAttributes.product_name}`}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Leave empty to use master product name
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                  Price Override
                </label>
                <input
                  type="number"
                  value={channelData.customPrice || ''}
                  onChange={(e) => handleOverrideChange('customPrice', parseFloat(e.target.value) || undefined)}
                  placeholder={`Default: ${data.masterAttributes.basePrice}`}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Leave empty to use master product price
                </p>
              </div>
            </div>
          </div>

          {/* Required Fields */}
          {channelConfig.requiredFields.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
              <h5 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-3">
                Required Fields <span className="text-red-500">*</span>
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {channelConfig.requiredFields.map((field) => (
                  <div key={field.fieldName}>
                    <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                      {field.displayName} <span className="text-red-500">*</span>
                    </label>
                    {renderField(field)}
                    {field.helpText && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        {field.helpText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Fields */}
          {channelConfig.optionalFields.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Optional Fields
                </h5>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-orange-600 dark:text-orange-400 hover:underline"
                >
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                </button>
              </div>
              
              {showAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {channelConfig.optionalFields.map((field) => (
                    <div key={field.fieldName}>
                      <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                        {field.displayName}
                      </label>
                      {renderField(field)}
                      {field.helpText && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Supported Features */}
          <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <h5 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-3">
              Supported Features
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {channelConfig.supportedFeatures.map((feature, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border border-orange-200 dark:border-orange-700">
                  <span className="text-sm text-gray-900 dark:text-white">{feature.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      feature.supported 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {feature.supported ? 'Supported' : 'Not Supported'}
                    </span>
                    {feature.limitations && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({feature.limitations})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}