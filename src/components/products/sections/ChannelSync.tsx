"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "../ProductCreateForm";
import { getEnhancedChannelConfig, getChannelsByCategory, ENHANCED_CHANNEL_CONFIGS } from "../channels/EnhancedChannelConfigs";
import { ChannelConfig, ChannelSpecificData } from "../channels/ChannelTypes";
import ChannelConfigurationForm from "./ChannelConfigurationForm";

interface ChannelSyncProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

export default function ChannelSync({ data, onUpdate }: ChannelSyncProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date(Date.now() - 30 * 60 * 1000));
  const [channelDataState, setChannelDataState] = useState<Record<string, ChannelSpecificData>>({});

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

  const handleChannelSync = async (channelId: string) => {
    setIsSyncing(true);
    try {
      // Simulate sync process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update sync status
      handleChannelDataUpdate(channelId, {
        lastSynced: new Date(),
        syncErrors: [],
        pendingSync: false
      });
      
      console.log(`Successfully synced ${channelId}`);
    } catch (error) {
      handleChannelDataUpdate(channelId, {
        syncErrors: ['Sync failed: Network error'],
        pendingSync: false
      });
      console.error(`Sync failed for ${channelId}:`, error);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAllChannels = async () => {
    setIsSyncing(true);
    try {
      for (const channel of activeChannels) {
        await handleChannelSync(channel.id);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setLastSync(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
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
                            size="sm"
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChannelSync(channel.id);
                            }}
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