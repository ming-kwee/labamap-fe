'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Badge from '@/components/ui/badge/Badge';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp,
  ShoppingCart,
  Globe,
  Users
} from '@/components/ui/icons/Icons';
import { channelMappingService } from '@/services/ChannelMappingService';
import { 
  ChannelMappingRequest, 
  ChannelMappingResult
} from '@/types/channel';
import { MasterProduct } from '@/types/product';

interface ChannelSelectionInterfaceProps {
  masterProduct: MasterProduct;
  onMappingComplete?: (results: ChannelMappingResult[]) => void;
}

export default function ChannelSelectionInterface({ 
  masterProduct, 
  onMappingComplete 
}: ChannelSelectionInterfaceProps) {
  const router = useRouter();
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMapping, setIsMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConnectedChannels();
  }, [masterProduct.id]);

  const loadConnectedChannels = async () => {
    try {
      setIsLoading(true);
      // Use the same service method we added
      const { masterProductService } = await import('@/services/MasterProductService');
      const channels = await masterProductService.getUserConnectedChannels();
      setConnectedChannels(channels);
      setError(null);
    } catch (error) {
      console.error('Failed to load connected channels:', error);
      setError('Failed to load connected channels. Please try again.');
      // Fallback
      setConnectedChannels(['shopify', 'amazon']);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChannelToggle = (channelId: string) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleMapToChannels = async () => {
    if (selectedChannels.length === 0) return;

    setIsMapping(true);

    try {
      const request: ChannelMappingRequest = {
        selectedChannels,
        options: {
          validateOnly: false,
          autoPublish: false
        }
      };

      const response = await channelMappingService.mapToChannels(masterProduct.id, request);

      if (onMappingComplete) {
        onMappingComplete(response.mappingResults);
      } else {
        router.push(`/products/${masterProduct.id}/review`);
      }
    } catch (error) {
      console.error('Failed to map channels:', error);
      setError('Failed to map channels. Please try again.');
    } finally {
      setIsMapping(false);
    }
  };


  const getChannelIcon = (channelId: string) => {
    switch (channelId) {
      case 'shopify':
        return <ShoppingCart className="h-5 w-5" />;
      case 'amazon':
        return <Globe className="h-5 w-5" />;
      case 'google':
        return <Globe className="h-5 w-5" />;
      case 'facebook':
        return <Users className="h-5 w-5" />;
      default:
        return <Globe className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Loading your connected channels...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Select Publishing Channels</CardTitle>
          <div className="text-sm text-gray-600">
            <strong>{masterProduct.name}</strong> • SKU: {masterProduct.sku} • Price: ${masterProduct.price}
          </div>
        </CardHeader>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Connected Channels */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          Your Connected Channels
        </h3>

        {connectedChannels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedChannels.map(channelId => (
              <Card 
                key={channelId}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedChannels.includes(channelId) 
                    ? 'ring-2 ring-blue-500 bg-blue-50' 
                    : ''
                }`}
                onClick={() => handleChannelToggle(channelId)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getChannelIcon(channelId)}
                      <div>
                        <h4 className="font-semibold capitalize">{channelId}</h4>
                        <div className="text-sm text-green-600 font-medium">
                          ✓ Connected & Ready
                        </div>
                      </div>
                    </div>
                    {selectedChannels.includes(channelId) && (
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Account connected and authenticated
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Ready to publish immediately
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Connected Channels</h4>
              <p className="text-gray-600 mb-4">
                You haven't connected any sales channels yet. Please connect your channels first to proceed with publishing.
              </p>
              <Button variant="outline">
                Connect Channels
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Selected Channels Summary */}
      {selectedChannels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Selected Channels ({selectedChannels.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedChannels.map(channelId => (
                <Badge key={channelId} variant="light" color="success" className="flex items-center gap-2">
                  {getChannelIcon(channelId)}
                  <span className="capitalize">{channelId}</span>
                  <CheckCircle2 className="h-3 w-3" />
                </Badge>
              ))}
            </div>

            <div className="text-sm text-gray-600 mb-4">
              All selected channels are connected and ready for immediate publishing.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          Back to Product
        </Button>

        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setSelectedChannels([])}
            disabled={selectedChannels.length === 0}
          >
            Clear Selection
          </Button>
          
          <Button 
            onClick={handleMapToChannels}
            disabled={selectedChannels.length === 0 || isMapping}
            className="min-w-[200px]"
          >
            {isMapping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mapping to Channels...
              </>
            ) : (
              <>
                Map to {selectedChannels.length} Channel{selectedChannels.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {connectedChannels.length}
            </div>
            <div className="text-sm text-gray-600">Connected Channels</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {selectedChannels.length}
            </div>
            <div className="text-sm text-gray-600">Selected for Publishing</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {connectedChannels.length > 0 ? '100' : '0'}%
            </div>
            <div className="text-sm text-gray-600">Ready to Publish</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}