'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Badge from '@/components/ui/badge/Badge';
import Progress from '@/components/ui/progress/Progress';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Star,
  TrendingUp,
  ShoppingCart,
  Globe,
  Users
} from '@/components/ui/icons/Icons';
import { channelMappingService } from '@/services/ChannelMappingService';
import { 
  ChannelRecommendation, 
  ChannelMappingRequest, 
  ChannelMappingResult,
  ChannelAvailabilityResponse 
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
  const [recommendations, setRecommendations] = useState<ChannelRecommendation[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [mappingResults, setMappingResults] = useState<ChannelMappingResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMapping, setIsMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChannelRecommendations();
  }, [masterProduct.id]);

  const loadChannelRecommendations = async () => {
    try {
      setIsLoading(true);
      const response = await channelMappingService.getAvailableChannels(masterProduct.id);
      setRecommendations(response.channelRecommendations);
      setError(null);
    } catch (error) {
      console.error('Failed to load channel recommendations:', error);
      setError('Failed to load channel recommendations. Please try again.');
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
      setMappingResults(response.mappingResults);

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

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'HIGHLY_RECOMMENDED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'RECOMMENDED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'NEEDS_IMPROVEMENT':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'NOT_SUITABLE':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
          <span>Loading channel recommendations...</span>
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

      {/* Channel Recommendations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Star className="h-5 w-5" />
          Recommended Channels
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recommendations.map(recommendation => (
            <Card 
              key={recommendation.channelId}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedChannels.includes(recommendation.channelId) 
                  ? 'ring-2 ring-blue-500 bg-blue-50' 
                  : ''
              }`}
              onClick={() => handleChannelToggle(recommendation.channelId)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getChannelIcon(recommendation.channelId)}
                    <div>
                      <h4 className="font-semibold">{recommendation.channelName}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="text-sm text-gray-600">
                          {Math.round(recommendation.compatibilityScore)}% match
                        </div>
                        <Progress 
                          value={recommendation.compatibilityScore} 
                          className="w-16 h-2"
                        />
                      </div>
                    </div>
                  </div>
                  {selectedChannels.includes(recommendation.channelId) && (
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <Badge 
                  variant="light" 
                  color="light"
                  className={getRecommendationColor(recommendation.recommendation)}
                >
                  {recommendation.recommendation.replace('_', ' ')}
                </Badge>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Setup Time */}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    Setup time: {recommendation.estimatedSetupTime}
                  </div>

                  {/* Reasons */}
                  <div>
                    <h5 className="font-medium text-sm mb-2">Why this channel?</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {recommendation.reasons.slice(0, 3).map((reason, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Missing Fields */}
                  {recommendation.missingFields.length > 0 && (
                    <div>
                      <h5 className="font-medium text-sm mb-2 text-orange-600">
                        To improve compatibility:
                      </h5>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {recommendation.missingFields.slice(0, 2).map((field, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <AlertCircle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                            Add {field}
                          </li>
                        ))}
                        {recommendation.missingFields.length > 2 && (
                          <li className="text-orange-600 text-xs">
                            +{recommendation.missingFields.length - 2} more fields
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
              {selectedChannels.map(channelId => {
                const recommendation = recommendations.find(r => r.channelId === channelId);
                return (
                  <Badge key={channelId} variant="light" color="light" className="flex items-center gap-2">
                    {getChannelIcon(channelId)}
                    {recommendation?.channelName || channelId}
                    <span className="text-xs">
                      {recommendation ? Math.round(recommendation.compatibilityScore) : 0}%
                    </span>
                  </Badge>
                );
              })}
            </div>

            <div className="text-sm text-gray-600 mb-4">
              Estimated total setup time: {
                recommendations
                  .filter(r => selectedChannels.includes(r.channelId))
                  .map(r => r.estimatedSetupTime)
                  .join(', ')
              }
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
              {recommendations.filter(r => r.recommendation === 'HIGHLY_RECOMMENDED').length}
            </div>
            <div className="text-sm text-gray-600">Highly Recommended</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {recommendations.length}
            </div>
            <div className="text-sm text-gray-600">Total Channels Available</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(
                recommendations.reduce((sum, r) => sum + r.compatibilityScore, 0) / 
                recommendations.length
              )}%
            </div>
            <div className="text-sm text-gray-600">Average Compatibility</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}