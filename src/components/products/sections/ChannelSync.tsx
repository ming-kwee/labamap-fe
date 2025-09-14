"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "../ProductCreateForm";

interface ChannelSyncProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

const availableChannels = [
  { 
    id: "shopify", 
    name: "Shopify", 
    icon: "🛍️", 
    description: "Connect to your Shopify stores",
    connected: true,
    stores: [
      { id: "store-1", name: "Main Store", url: "mystore.myshopify.com" },
      { id: "store-2", name: "EU Store", url: "eu-store.myshopify.com" }
    ]
  },
  { 
    id: "amazon", 
    name: "Amazon", 
    icon: "📦", 
    description: "Sell on Amazon marketplace",
    connected: true,
    stores: [
      { id: "amazon-us", name: "Amazon US", url: "amazon.com" },
      { id: "amazon-uk", name: "Amazon UK", url: "amazon.co.uk" }
    ]
  },
  { 
    id: "ebay", 
    name: "eBay", 
    icon: "🏪", 
    description: "List on eBay auctions",
    connected: false,
    stores: []
  },
  { 
    id: "facebook", 
    name: "Facebook Shop", 
    icon: "📘", 
    description: "Sell on Facebook & Instagram",
    connected: true,
    stores: [
      { id: "fb-main", name: "Main Business Page", url: "facebook.com/mybusiness" }
    ]
  },
  { 
    id: "google", 
    name: "Google Shopping", 
    icon: "🔍", 
    description: "Show in Google Shopping results",
    connected: false,
    stores: []
  },
  { 
    id: "etsy", 
    name: "Etsy", 
    icon: "🎨", 
    description: "Sell handmade and vintage items",
    connected: false,
    stores: []
  },
];

export default function ChannelSync({ data, onUpdate }: ChannelSyncProps) {
  // const [selectedChannels, setSelectedChannels] = useState<string[]>(
  //   data.channels?.map(c => c.platform) || []
  // );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date(Date.now() - 30 * 60 * 1000)); // 30 min ago

  const toggleChannel = (channelId: string, storeId: string) => {
    const channelExists = data.channels?.find(c => c.platform === channelId && c.storeId === storeId);
    
    let newChannels;
    if (channelExists) {
      newChannels = data.channels?.filter(c => !(c.platform === channelId && c.storeId === storeId)) || [];
    } else {
      const channel = availableChannels.find(c => c.id === channelId);
      const store = channel?.stores.find(s => s.id === storeId);
      
      if (channel && store) {
        newChannels = [
          ...(data.channels || []),
          {
            platform: channelId,
            storeId: storeId,
            enabled: true,
            customMapping: {}
          }
        ];
      } else {
        newChannels = data.channels || [];
      }
    }

    onUpdate({ channels: newChannels });
  };

  const syncAllChannels = async () => {
    setIsSyncing(true);
    try {
      // Simulate sync process
      await new Promise(resolve => setTimeout(resolve, 3000));
      setLastSync(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const getChannelStatus = (channelId: string, storeId: string) => {
    return data.channels?.some(c => c.platform === channelId && c.storeId === storeId && c.enabled) || false;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Channel Sync</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your product across multiple sales channels
            </p>
          </div>
          <Button onClick={syncAllChannels} disabled={isSyncing || !data.channels?.length}>
            {isSyncing ? "🔄 Syncing..." : "🔄 Sync All"}
          </Button>
        </div>

        {/* Sync Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.channels?.length || 0}
            </div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Connected Channels</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.channels?.filter(c => c.enabled).length || 0}
            </div>
            <div className="text-sm text-green-800 dark:text-green-300">Active Syncs</div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white">Last Sync</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {lastSync.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Available Channels */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Available Channels</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {availableChannels.map((channel) => (
            <div key={channel.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
                  {channel.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white">{channel.name}</h4>
                    {channel.connected ? (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 rounded-full">
                        Connected
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 rounded-full">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{channel.description}</p>
                  
                  {channel.connected && channel.stores.length > 0 ? (
                    <div className="space-y-2">
                      {channel.stores.map((store) => (
                        <div key={store.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                          <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-white">{store.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{store.url}</div>
                          </div>
                          <Switch
                            checked={getChannelStatus(channel.id, store.id)}
                            onChange={() => toggleChannel(channel.id, store.id)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full">
                      Connect Channel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Channel Mapping */}
      {data.channels && data.channels.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Channel-Specific Settings</h3>
          
          <div className="space-y-6">
            {data.channels.map((channel, index) => {
              const channelInfo = availableChannels.find(c => c.id === channel.platform);
              const storeInfo = channelInfo?.stores.find(s => s.id === channel.storeId);
              
              return (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{channelInfo?.icon}</span>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {channelInfo?.name} - {storeInfo?.name}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{storeInfo?.url}</p>
                      </div>
                    </div>
                    <Switch
                      checked={channel.enabled}
                      onChange={(enabled) => {
                        const updatedChannels = data.channels?.map((c, i) => 
                          i === index ? { ...c, enabled } : c
                        );
                        onUpdate({ channels: updatedChannels });
                      }}
                    />
                  </div>

                  {channel.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Custom Title
                        </label>
                        <input
                          type="text"
                          placeholder={data.name || "Use default title"}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Custom Price Adjustment
                        </label>
                        <select className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                          <option value="none">No adjustment</option>
                          <option value="markup">Markup %</option>
                          <option value="fixed">Fixed amount</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sync Rules */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Sync Rules & Automation</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Auto-sync inventory changes</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically sync when inventory levels change</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Auto-sync price changes</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically sync when prices are updated</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Sync product details</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Keep descriptions, images, and attributes in sync</p>
            </div>
            <Switch />
          </div>
        </div>
      </div>
    </div>
  );
}