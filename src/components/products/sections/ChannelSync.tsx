"use client";
import React, { useState, useEffect } from "react";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "../ProductCreateForm";
import { getEnhancedChannelConfig, getChannelsByCategory, ENHANCED_CHANNEL_CONFIGS } from "../channels/EnhancedChannelConfigs";
import { ChannelConfig, ChannelSpecificData } from "../channels/ChannelTypes";
import ChannelConfigurationForm from "./ChannelConfigurationForm";
import { useChannelSync, useVariantChannelSync, useBulkVariantSync, useChannelConfigs } from "@/lib/api/hooks/useProducts";

interface ChannelSyncProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
  productId?: string; // For correlating with save operations
  onSyncStatusChange?: (channelId: string, status: 'pending' | 'synced' | 'error', errors?: string[]) => void;
  autoSyncEnabled?: boolean; // Enable auto-sync after save
  onSyncFunctionsReady?: (functions: {
    validateChannelsForSync: () => { isValid: boolean; errors: string[] };
    triggerAutoSync: () => Promise<any>;
    syncAllChannels: () => Promise<any>;
    handleChannelSync: (channelId: string, storeId?: string) => Promise<void>;
  }) => void;
}

export default function ChannelSync({ 
  data, 
  onUpdate, 
  productId, 
  onSyncStatusChange, 
  autoSyncEnabled = false,
  onSyncFunctionsReady
}: ChannelSyncProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date(Date.now() - 30 * 60 * 1000));
  const [channelDataState, setChannelDataState] = useState<Record<string, ChannelSpecificData>>({});

  // Enhanced API hooks for real channel operations
  const channelSync = useChannelSync();
  const variantSync = useVariantChannelSync();
  const bulkVariantSync = useBulkVariantSync();
  const { data: channelConfigs } = useChannelConfigs();

  const availableChannels = Object.values(ENHANCED_CHANNEL_CONFIGS);
  const activeChannels = availableChannels.filter(channel => 
    data.masterAttributes.channels?.some(c => c.platform === channel.id && c.enabled)
  );

  const toggleChannel = (channelId: string, storeId: string) => {
    const channelExists = data.masterAttributes.channels?.find(c => c.platform === channelId && c.storeId === storeId);
    
    let newChannels;
    if (channelExists) {
      newChannels = data.masterAttributes.channels?.filter(c => !(c.platform === channelId && c.storeId === storeId)) || [];
    } else {
      const channel = availableChannels.find(c => c.id === channelId);
      const store = channel?.stores?.find(s => s.id === storeId);
      
      if (channel) {
        newChannels = [
          ...(data.masterAttributes.channels || []),
          {
            platform: channelId,
            storeId: storeId || 'default',
            enabled: true,
            customMapping: {}
          }
        ];
        
        // Initialize channel data
        if (!channelDataState[channelId]) {
          setChannelDataState(prev => ({
            ...prev,
            [channelId]: {
              customFields: {},
              lastSynced: undefined,
              syncErrors: []
            }
          }));
        }
      } else {
        newChannels = data.masterAttributes.channels || [];
      }
    }

    onUpdate({ 
      masterAttributes: { 
        ...data.masterAttributes, 
        channels: newChannels 
      } 
    });
  };

  const handleChannelDataUpdate = (channelId: string, updates: Partial<ChannelSpecificData>) => {
    setChannelDataState(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        ...updates
      }
    }));
  };

  // Enhanced handleChannelSync with real API integration
  const handleChannelSync = async (channelId: string, storeId = 'default') => {
    if (!productId) {
      console.warn('Cannot sync: Product must be saved first');
      return;
    }

    setIsSyncing(true);
    
    // Update sync status to pending
    handleChannelDataUpdate(channelId, {
      syncStatus: 'pending',
      pendingSync: true
    });
    
    onSyncStatusChange?.(channelId, 'pending');

    try {
      // Get channel configuration for this sync
      const channelConfig = getEnhancedChannelConfig(channelId);
      const channelData = getChannelData(channelId);
      
      // Prepare channel-specific data for sync
      const channelPayload = {
        platform: channelId,
        storeId,
        channelData: {
          ...channelData,
          sku: data.masterAttributes.sku,
          title: data.masterAttributes.product_name,
          description: data.masterAttributes.description,
          price: data.masterAttributes.basePrice,
          inventory: data.masterAttributes.stockQuantity,
          enabled: true,
          ...channelData.customFields
        }
      };

      // Real API call to sync product to channel
      const result = await channelSync.mutate(productId, [channelPayload]);
      
      if (result?.success) {
        // Update sync status to success
        handleChannelDataUpdate(channelId, {
          lastSynced: new Date(),
          syncStatus: 'synced',
          syncErrors: [],
          pendingSync: false
        });
        
        onSyncStatusChange?.(channelId, 'synced');
        console.log(`Successfully synced ${channelId} to ${storeId}`);
        
        // If variants exist, sync them too
        if (data.enhancedVariants && data.enhancedVariants.length > 0) {
          await syncProductVariants(channelId, storeId);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      const syncErrors = [`Sync failed: ${errorMessage}`];
      
      handleChannelDataUpdate(channelId, {
        syncStatus: 'error',
        syncErrors,
        pendingSync: false
      });
      
      onSyncStatusChange?.(channelId, 'error', syncErrors);
      console.error(`Sync failed for ${channelId}:`, error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Enhanced variant sync function
  const syncProductVariants = async (channelId: string, storeId: string) => {
    if (!data.enhancedVariants || !productId) return;

    try {
      // Prepare variant data for bulk sync
      const variantsToSync = data.enhancedVariants.map(variant => ({
        variantId: variant.id,
        channels: [{
          platform: channelId,
          storeId,
          channelData: {
            sku: variant.channelData[channelId]?.sku || variant.masterData.sku,
            title: variant.channelData[channelId]?.title || variant.masterData.title,
            price: variant.channelData[channelId]?.price || variant.masterData.price,
            inventory: variant.channelData[channelId]?.inventory || variant.masterData.inventory,
            enabled: variant.channelData[channelId]?.enabled ?? variant.masterData.enabled,
            ...variant.channelData[channelId]?.customFields
          }
        }]
      }));

      await bulkVariantSync.mutate(productId, variantsToSync);
      console.log(`Successfully synced ${variantsToSync.length} variants to ${channelId}`);
    } catch (error) {
      console.error(`Failed to sync variants to ${channelId}:`, error);
    }
  };

  // Enhanced syncAllChannels with real API calls
  const syncAllChannels = async () => {
    if (!productId) {
      console.warn('Cannot sync all channels: Product must be saved first');
      return;
    }

    setIsSyncing(true);
    const results = [];
    
    try {
      for (const channel of activeChannels) {
        const stores = channel.stores || [{ id: 'default', name: 'Default Store', url: '' }];
        
        for (const store of stores) {
          const isActive = data.masterAttributes.channels?.some(
            c => c.platform === channel.id && c.storeId === store.id && c.enabled
          );
          
          if (isActive) {
            try {
              await handleChannelSync(channel.id, store.id);
              results.push({ channel: channel.id, store: store.id, success: true });
              
              // Small delay between syncs to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
              results.push({ 
                channel: channel.id, 
                store: store.id, 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
              });
            }
          }
        }
      }
      
      setLastSync(new Date());
      console.log('Bulk sync completed:', results);
    } catch (error) {
      console.error("Bulk sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
    
    return results;
  };

  const getChannelStatus = (channelId: string, storeId: string) => {
    return data.masterAttributes.channels?.some(c => c.platform === channelId && c.storeId === storeId && c.enabled) || false;
  };

  const getChannelData = (channelId: string): ChannelSpecificData => {
    return channelDataState[channelId] || {
      customFields: {},
      lastSynced: undefined,
      syncErrors: []
    };
  };

  // Channel validation function for save correlation
  const validateChannelsForSync = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!productId) {
      errors.push('Product must be saved before channel sync validation');
    }
    
    const enabledChannels = data.masterAttributes.channels?.filter(c => c.enabled) || [];
    
    if (enabledChannels.length === 0) {
      return { isValid: true, errors: [] }; // No channels selected is valid
    }

    for (const channel of enabledChannels) {
      const channelConfig = getEnhancedChannelConfig(channel.platform);
      const channelData = getChannelData(channel.platform);
      
      if (!channelConfig) {
        errors.push(`Unknown channel configuration: ${channel.platform}`);
        continue;
      }

      // Check required fields for this channel
      for (const field of channelConfig.requiredFields) {
        const value = channelData.customFields?.[field.fieldName];
        if (!value && field.required) {
          errors.push(`${channelConfig.displayName}: Missing required field '${field.displayName}'`);
        }
      }

      // Check basic product data
      if (!data.masterAttributes.product_name.trim()) {
        errors.push(`${channelConfig.displayName}: Product name is required`);
      }
      
      if (!data.masterAttributes.sku.trim()) {
        errors.push(`${channelConfig.displayName}: SKU is required`);
      }
      
      if (data.masterAttributes.basePrice <= 0) {
        errors.push(`${channelConfig.displayName}: Valid price is required`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // Auto-sync function that can be called after save
  const triggerAutoSync = async () => {
    if (!autoSyncEnabled || !productId) return;
    
    const validation = validateChannelsForSync();
    if (!validation.isValid) {
      console.warn('Auto-sync skipped due to validation errors:', validation.errors);
      return;
    }

    const enabledChannels = data.masterAttributes.channels?.filter(c => c.enabled) || [];
    if (enabledChannels.length > 0) {
      console.log('Triggering auto-sync for', enabledChannels.length, 'channels');
      return await syncAllChannels();
    }
  };

  // Expose sync functions to parent component
  useEffect(() => {
    if (onSyncFunctionsReady) {
      onSyncFunctionsReady({
        validateChannelsForSync,
        triggerAutoSync,
        syncAllChannels,
        handleChannelSync
      });
    }
  }, [productId, data.masterAttributes.channels, autoSyncEnabled]);

  const channelsByCategory = {
    marketplace: getChannelsByCategory('marketplace'),
    social: getChannelsByCategory('social'),
    direct: getChannelsByCategory('direct'),
    advertising: getChannelsByCategory('advertising')
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Enhanced Channel Management</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your product across multiple sales channels with dedicated interfaces
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              onClick={syncAllChannels}
              disabled={isSyncing || activeChannels.length === 0}
              variant="primary"
            >
              {isSyncing ? '🔄 Syncing...' : '🔄 Sync All Active'}
            </Button>
          </div>
        </div>

        {/* Enhanced Sync Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {activeChannels.length}
            </div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Active Channels</div>
          </div>
          
          <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {Object.values(channelDataState).filter(c => c.lastSynced).length}
            </div>
            <div className="text-sm text-green-800 dark:text-green-300">Successfully Synced</div>
          </div>
          
          <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {Object.values(channelDataState).reduce((sum, c) => sum + (c.syncErrors?.length || 0), 0)}
            </div>
            <div className="text-sm text-red-800 dark:text-red-300">Total Errors</div>
          </div>
          
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">Last Sync</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {lastSync.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Channel Categories */}
      {Object.entries(channelsByCategory).map(([category, channels]) => (
        <div key={category} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 capitalize">
            {category} Channels
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {channels.map((channel) => {
              const isActive = data.masterAttributes.channels?.some(c => c.platform === channel.id && c.enabled) || false;
              const channelData = getChannelData(channel.id);
              const hasErrors = channelData.syncErrors && channelData.syncErrors.length > 0;
              const isSynced = channelData.lastSynced;
              
              return (
                <div 
                  key={channel.id} 
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedChannelId === channel.id
                      ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/10'
                      : isActive
                        ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/10 hover:border-green-300'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedChannelId(selectedChannelId === channel.id ? null : channel.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center text-2xl border border-gray-200 dark:border-gray-700">
                      {channel.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                          {channel.displayName}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-lg" title={hasErrors ? 'Has errors' : isSynced ? 'Synced' : 'Not synced'}>
                            {hasErrors ? '🔴' : isSynced ? '🟢' : '🟡'}
                          </span>
                          <Switch
                            label=""
                            defaultChecked={isActive}
                            onChange={(checked) => toggleChannel(channel.id, 'default')}
                          />
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                        {channel.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-1 rounded-full ${
                          channel.isConnected
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {channel.isConnected ? 'Connected' : 'Not Connected'}
                        </span>
                        
                        <span className="text-gray-500 dark:text-gray-400">
                          {hasErrors ? `${channelData.syncErrors?.length} error(s)` :
                           isSynced ? 'Synced' : 'Never synced'}
                        </span>
                      </div>
                      
                      {isActive && selectedChannelId === channel.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleChannelSync(channel.id)}
                            disabled={!channel.isConnected}
                            className="w-full"
                          >
                            🔄 Sync Now
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Selected Channel Detail Configuration */}
      {selectedChannelId && (
        <div className="space-y-6">
          <ChannelConfigurationForm
            channelConfig={getEnhancedChannelConfig(selectedChannelId)!}
            data={data}
            channelData={getChannelData(selectedChannelId)}
            onUpdate={handleChannelDataUpdate}
            onSync={handleChannelSync}
          />
        </div>
      )}

      {/* Global Sync Rules */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Global Sync Rules & Automation</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Auto-sync on master changes</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically sync when master data changes</p>
            </div>
            <Switch label="" defaultChecked />
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Batch sync optimization</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Optimize API calls for bulk operations</p>
            </div>
            <Switch label="" defaultChecked />
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Smart conflict resolution</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Auto-resolve data conflicts using predefined rules</p>
            </div>
            <Switch label="" />
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Error notifications</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Get notified when sync operations fail</p>
            </div>
            <Switch label="" defaultChecked />
          </div>
        </div>
      </div>
    </div>
  );
}