'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import Badge from '@/shared/ui/badge/Badge';
import Progress from '@/shared/ui/progress/Progress';
import Alert from '@/shared/ui/alert/Alert';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Send,
  Eye,
  RefreshCw,
  TrendingUp,
  Database,
  Brain,
  Zap,
  Target,
  Award,
  Code,
  ChevronDown,
  ChevronUp
} from '@/shared/ui/icons/Icons';

import { MasterProduct } from '@/modules/ecommerce-product/types/product';
import {
  AdaptivePatternMatchingResponse,
  ChannelConfiguration,
  FieldMapping
} from '@/modules/ecommerce-product/types/channelMapping';
import { channelMappingService } from '@/modules/ecommerce-product/services/channelMappingService';
import {
  transformMasterProductToSourceSchema,
  generateMappingRequest,
  checkChannelReadiness,
  ChannelReadinessResult
} from '@/modules/ecommerce-product/services/productGenerationService';

export default function PublishToChannelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get product data from URL params or session storage
  const [product, setProduct] = useState<MasterProduct | null>(null);
  const [availableChannels, setAvailableChannels] = useState<ChannelConfiguration[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [mappingResult, setMappingResult] = useState<AdaptivePatternMatchingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [showJoltPreview, setShowJoltPreview] = useState(false);
  const [joltPreviewData, setJoltPreviewData] = useState<any>(null);
  const [channelReadiness, setChannelReadiness] = useState<ChannelReadinessResult | null>(null);
  const [persistJolt, setPersistJolt] = useState(true);

  // Load product data
  useEffect(() => {
    const productId = searchParams.get('productId');

    console.log('[ChannelPublish] Loading product data...', {
      productId,
      hasProductId: !!productId
    });

    if (!productId) {
      console.error('[ChannelPublish] No productId in URL parameters');
      setError('No product ID provided. Please create a product first.');
      return;
    }

    const storageKey = `product_${productId}`;
    const productDataStr = sessionStorage.getItem(storageKey);

    console.log('[ChannelPublish] Session storage check:', {
      storageKey,
      hasData: !!productDataStr,
      dataLength: productDataStr?.length
    });

    if (productDataStr) {
      try {
        const productData = JSON.parse(productDataStr);
        console.log('[ChannelPublish] ✓ Product loaded from session storage:', {
          id: productData.id,
          name: productData.name,
          sku: productData.sku
        });
        setProduct(productData);
      } catch (err) {
        console.error('[ChannelPublish] Failed to parse product data:', err);
        setError('Failed to load product data. The data might be corrupted.');
      }
    } else {
      console.error('[ChannelPublish] Product not found in session storage');
      console.log('[ChannelPublish] Available session storage keys:', Object.keys(sessionStorage));
      setError('Product data not found. Please create a product first, then try again.');
    }
  }, [searchParams]);

  // Load available channels
  useEffect(() => {
    async function loadChannels() {
      try {
        console.log('[ChannelPublish] Loading channels from backend...');
        const channels = await channelMappingService.getAvailableChannels();
        console.log('[ChannelPublish] ✓ Channels loaded:', channels.length);
        setAvailableChannels(channels);
      } catch (err) {
        console.error('[ChannelPublish] Failed to load channels:', err);
        setError(
          '❌ Backend API Missing: GET /labamap/api/v1/channels\n\n' +
          'Expected Response:\n' +
          '[\n' +
          '  {\n' +
          '    "channelId": "shopify",\n' +
          '    "channelName": "Shopify",\n' +
          '    "requiredFields": ["title", "price"],\n' +
          '    "optionalFields": ["description"],\n' +
          '    "fieldConstraints": {},\n' +
          '    "variantSupport": true\n' +
          '  }\n' +
          ']'
        );
      }
    }
    loadChannels();
  }, []);

  // Check channel readiness when product or selected channel changes
  useEffect(() => {
    async function checkReadiness() {
      if (!product || !selectedChannel) {
        setChannelReadiness(null);
        return;
      }

      try {
        console.log('[ChannelPublish] 📡 Checking channel readiness (Step 2)...');
        const readiness = await checkChannelReadiness(product, selectedChannel);
        console.log('[ChannelPublish] ✅ Channel readiness:', readiness);
        setChannelReadiness(readiness);
      } catch (err) {
        console.error('[ChannelPublish] Failed to check channel readiness:', err);
        // Don't set error state - readiness check is non-blocking
        setChannelReadiness(null);
      }
    }

    checkReadiness();
  }, [product, selectedChannel]);

  // Analyze pattern matching when channel is selected
  const handleAnalyze = async () => {
    if (!product || !selectedChannel) return;

    setIsAnalyzing(true);
    setError(null);
    setMappingResult(null);

    try {
      console.log('[ChannelPublish] Starting pattern matching analysis');

      // STEP 2: Fetch target schema from MongoDB apiSchema field
      const request = await generateMappingRequest(product, selectedChannel, {
        confidenceThreshold: 70,
        organizationId: product.customAttributes?._organizationId as string,
        userId: product.customAttributes?._createdBy as string,
        categoryId: product.category || 'default',
        persistJolt,
        persistConfidenceThreshold: 80,
      });

      console.log('[ChannelPublish] Mapping request:', request);
      console.log('[ChannelPublish] Request body:', JSON.stringify(request, null, 2));

      const result = await channelMappingService.analyzePatternMatching(request);

      console.log('[ChannelPublish] Pattern matching result:', result);

      // Check if backend returned an error status
      if (result.status === 'ERROR') {
        console.error('[ChannelPublish] Backend returned error status:', result.message);
        setError(
          `❌ Pattern Matching Failed\n\n` +
          `Error: ${result.message || 'Unknown error'}\n\n` +
          `This is likely due to:\n` +
          `1. Database not seeded with fieldBoosts data\n` +
          `2. Backend NullPointerException on missing data\n\n` +
          `Solution: Backend team needs to reseed database using seed-all-v2-multitenant.js\n` +
          `See QUICK-FIX-GUIDE.md for instructions.`
        );
        setMappingResult(null);
        return;
      }

      setMappingResult(result);

    } catch (err) {
      console.error('[ChannelPublish] Pattern matching failed:', err);
      const sourceSchema = transformMasterProductToSourceSchema(product);

      setError(
        '❌ Backend API Missing: POST /labamap/api/v1/adaptive-pattern-matching/analyze\n\n' +
        '📝 Request Body:\n' +
        JSON.stringify({
          sourceSchema: { ...sourceSchema },
          targetSchema: { /* channel-specific schema */ },
          channelId: selectedChannel,
          confidenceThreshold: 70,
          organizationId: product.customAttributes?._organizationId,
          userId: product.customAttributes?._createdBy
        }, null, 2) + '\n\n' +
        '📤 Expected Response:\n' +
        JSON.stringify({
          fieldMappings: [
            {
              sourcePath: 'product_name',
              targetPath: 'title',
              confidence: 95,
              matchStrategy: 'KNOWLEDGE_BASED',
              usageCount: 1542,
              successRate: 98.5
            }
          ],
          joltSpec: [{ operation: 'shift', spec: {} }],
          overallConfidence: 93,
          unmappedSourceFields: [],
          unmappedTargetFields: [],
          matchingMetadata: {
            knowledgeBasedMatches: 2,
            semanticMatches: 1,
            similarityMatches: 1,
            patternMatches: 1,
            totalMatches: 8,
            processingTimeMs: 245
          }
        }, null, 2)
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Preview JOLT transformation
  const handlePreviewTransformation = async () => {
    if (!product || !mappingResult) return;

    try {
      const sourceData = transformMasterProductToSourceSchema(product);
      const transformed = await channelMappingService.previewJoltTransformation(
        sourceData,
        mappingResult.joltSpec || []
      );

      setJoltPreviewData(transformed);
      setShowJoltPreview(true);
    } catch (err) {
      console.error('[ChannelPublish] Transformation preview error:', err);
      setError('Failed to preview transformation');
    }
  };

  // Publish to channel
  const handlePublish = async () => {
    if (!product || !selectedChannel || !mappingResult) return;

    setIsPublishing(true);
    setError(null);

    try {
      const sourceData = transformMasterProductToSourceSchema(product);

      const publishRequest = {
        masterProductId: product.id,
        masterProductData: sourceData,
        channelId: selectedChannel,
        fieldMappings: mappingResult.fieldMappings || [],
        joltSpec: mappingResult.joltSpec || [],
        categoryId: product.category || 'default',
        organizationId: product.customAttributes?._organizationId as string,
        dryRun: false
      };

      console.log('[ChannelPublish] Publish request:', JSON.stringify(publishRequest, null, 2));

      const result = await channelMappingService.publishToChannel(publishRequest);

      if (result.success) {
        setPublishSuccess(true);
        console.log('[ChannelPublish] ✓ Published successfully:', result);
      } else {
        setError(`Publishing failed: ${result.errors?.join(', ')}`);
      }

    } catch (err) {
      console.error('[ChannelPublish] Publish failed:', err);
      const sourceData = transformMasterProductToSourceSchema(product);

      setError(
        '❌ Backend API Missing: POST /labamap/api/v1/channels/publish\n\n' +
        '📝 Request Body:\n' +
        JSON.stringify({
          masterProductId: product.id,
          masterProductData: { ...sourceData },
          channelId: selectedChannel,
          fieldMappings: mappingResult.fieldMappings || [],
          joltSpec: mappingResult.joltSpec || [],
          dryRun: false
        }, null, 2) + '\n\n' +
        '📤 Expected Response:\n' +
        JSON.stringify({
          success: true,
          channelProductId: 'ch_prod_12345',
          channelUrl: 'https://shopify.com/products/12345',
          publishedData: {},
          warnings: [],
          errors: [],
          publishedAt: new Date().toISOString(),
          syncStatus: 'COMPLETED'
        }, null, 2)
      );
    } finally {
      setIsPublishing(false);
    }
  };

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Alert
          variant="error"
          title="Product Not Found"
          message={error || 'Loading product data...'}
        />
        <div className="mt-4">
          <Button onClick={() => router.push('/products/v2/create')}>
            Go to Product Creation
          </Button>
        </div>
      </div>
    );
  }

  // Channel readiness is now computed in useEffect and stored in state

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Publish to Sales Channel</h1>
          <p className="text-gray-600">Adaptive Pattern Matching • 5-Tier Matching Strategy • ML-Enhanced</p>
        </div>
      </div>

      {publishSuccess && (
        <Alert
          variant="success"
          title="Success!"
          message={`Product successfully published to ${selectedChannel}!`}
        />
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Backend API Not Implemented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-red-600 font-medium">
                Please implement the following backend endpoint:
              </p>
              <pre className="bg-white p-4 rounded border border-red-200 overflow-auto text-xs">
                {error}
              </pre>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  <strong>For Backend Team:</strong> The request body and expected response format are shown above.
                  Implement this endpoint to enable the channel publishing feature.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Info & Channel Selection */}
        <div className="space-y-6">
          {/* Product Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Master Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm text-gray-600">Product Name</div>
                <div className="font-medium">{product.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">SKU</div>
                <div className="font-medium">{product.sku}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Price</div>
                <div className="font-medium">${product.price?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Category</div>
                <div className="font-medium">{product.category || 'N/A'}</div>
              </div>
              {product.brand && (
                <div>
                  <div className="text-sm text-gray-600">Brand</div>
                  <div className="font-medium">{product.brand}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Channel Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Channel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Sales Channel
                </label>
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Choose a channel...</option>
                  {availableChannels.map((channel) => (
                    <option key={channel.channelId} value={channel.channelId}>
                      {channel.channelName}
                    </option>
                  ))}
                </select>
              </div>

              {selectedChannel && (
                <>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <label htmlFor="persistJolt" className="text-sm font-medium cursor-pointer">
                        Persist JOLT Spec
                      </label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Save transformation to MongoDB for reuse
                      </p>
                    </div>
                    <button
                      id="persistJolt"
                      type="button"
                      role="switch"
                      aria-checked={persistJolt}
                      onClick={() => setPersistJolt(!persistJolt)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        persistJolt ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          persistJolt ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="w-full"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 mr-2" />
                        Analyze Pattern Matching
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Channel Readiness */}
          {channelReadiness && (
            <Card>
              <CardHeader>
                <CardTitle>Channel Readiness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Confidence Score</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {channelReadiness.confidence}%
                  </span>
                </div>
                <Progress value={channelReadiness.confidence} className="w-full" />

                <div className="flex items-center gap-2">
                  {channelReadiness.ready ? (
                    <Badge variant="light" color="success">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ready to Publish
                    </Badge>
                  ) : (
                    <Badge variant="light" color="error">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Missing Required Fields
                    </Badge>
                  )}
                </div>

                {channelReadiness.blockers.length > 0 && (
                  <div className="text-sm space-y-1">
                    <div className="font-medium text-red-600">Blockers:</div>
                    {channelReadiness.blockers.map((blocker, idx) => (
                      <div key={idx} className="text-red-600">• {blocker}</div>
                    ))}
                  </div>
                )}

                {channelReadiness.warnings.length > 0 && (
                  <div className="text-sm space-y-1">
                    <div className="font-medium text-yellow-600">Warnings:</div>
                    {channelReadiness.warnings.map((warning, idx) => (
                      <div key={idx} className="text-yellow-600">• {warning}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Mapping Analysis Results */}
        <div className="lg:col-span-2 space-y-6">
          {!mappingResult && !isAnalyzing && (
            <Card>
              <CardContent className="p-12 text-center">
                <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Channel to Begin</h3>
                <p className="text-gray-600">
                  Choose a sales channel and click "Analyze Pattern Matching" to see intelligent field mappings
                </p>
              </CardContent>
            </Card>
          )}

          {isAnalyzing && (
            <Card>
              <CardContent className="p-12 text-center">
                <RefreshCw className="h-12 w-12 mx-auto text-blue-600 animate-spin mb-4" />
                <h3 className="text-lg font-semibold mb-2">Analyzing Pattern Matching...</h3>
                <p className="text-gray-600">
                  Running 5-tier matching strategy: Knowledge-Based → Semantic → Similarity → Pattern → Boost
                </p>
              </CardContent>
            </Card>
          )}

          {mappingResult && (
            <>
              {/* Overall Confidence */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Pattern Matching Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">
                        {mappingResult.overallConfidence ?? 0}%
                      </div>
                      <div className="text-sm text-gray-600">Overall Confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {mappingResult.fieldMappings?.length ?? 0}
                      </div>
                      <div className="text-sm text-gray-600">Fields Mapped</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600">
                        {mappingResult.unmappedSourceFields?.length ?? 0}
                      </div>
                      <div className="text-sm text-gray-600">Unmapped Fields</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 5-Tier Matching Strategy Breakdown */}
              <MatchingStrategyBreakdown
                metadata={mappingResult.matchingMetadata}
                fieldMappings={mappingResult.fieldMappings || []}
              />

              {/* Field Mappings Table */}
              <FieldMappingsTable
                fieldMappings={mappingResult.fieldMappings || []}
                selectedChannel={selectedChannel}
              />

              {/* Unmapped Fields */}
              {((mappingResult.unmappedSourceFields?.length ?? 0) > 0 || (mappingResult.unmappedTargetFields?.length ?? 0) > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      Unmapped Fields
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {(mappingResult.unmappedSourceFields?.length ?? 0) > 0 && (
                        <div>
                          <div className="font-medium mb-2">Source Fields Not Mapped:</div>
                          <div className="space-y-1">
                            {(mappingResult.unmappedSourceFields || []).map((field, idx) => (
                              <div key={idx} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                {field}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(mappingResult.unmappedTargetFields?.length ?? 0) > 0 && (
                        <div>
                          <div className="font-medium mb-2">Target Fields Missing:</div>
                          <div className="space-y-1">
                            {(mappingResult.unmappedTargetFields || []).map((field, idx) => (
                              <div key={idx} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                {field}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* JOLT Transformation Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      JOLT Transformation
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowJoltPreview(!showJoltPreview)}
                    >
                      {showJoltPreview ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-2" />
                          Hide Spec
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-2" />
                          Show Spec
                        </>
                      )}
                    </Button>
                  </CardTitle>
                </CardHeader>
                {showJoltPreview && (
                  <CardContent>
                    <pre className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96 text-xs">
                      {JSON.stringify(mappingResult.joltSpec || [], null, 2)}
                    </pre>
                    <div className="mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handlePreviewTransformation}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview Transformed Data
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Publish Button */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Ready to Publish?</h3>
                      <p className="text-sm text-gray-600">
                        Publish your product to {availableChannels.find(c => c.channelId === selectedChannel)?.channelName}
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={handlePublish}
                      disabled={isPublishing || !channelReadiness?.ready}
                    >
                      {isPublishing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Publish to Channel
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* JOLT Preview Modal */}
      {joltPreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[80vh] overflow-auto">
            <CardHeader>
              <CardTitle>Transformed Data Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-xs">
                {JSON.stringify(joltPreviewData, null, 2)}
              </pre>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setJoltPreviewData(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// 5-Tier Matching Strategy Breakdown Component
interface MatchingStrategyBreakdownProps {
  metadata: {
    knowledgeBasedMatches: number;
    semanticMatches: number;
    similarityMatches: number;
    patternMatches: number;
    totalMatches: number;
    processingTimeMs: number;
  };
  fieldMappings: FieldMapping[];
}

function MatchingStrategyBreakdown({ metadata, fieldMappings }: MatchingStrategyBreakdownProps) {
  const strategies = [
    {
      name: 'Knowledge-Based',
      count: metadata.knowledgeBasedMatches,
      confidence: '95%+',
      icon: Database,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      description: 'Learned from production usage'
    },
    {
      name: 'Semantic Match',
      count: metadata.semanticMatches,
      confidence: '85%+',
      icon: Brain,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'Semantic type equivalence'
    },
    {
      name: 'Similarity Match',
      count: metadata.similarityMatches,
      confidence: '60-90%',
      icon: Target,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'Levenshtein distance'
    },
    {
      name: 'Pattern Match',
      count: metadata.patternMatches,
      confidence: '75%',
      icon: Zap,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      description: 'Regex-based detection'
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          5-Tier Matching Strategy Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {strategies.map((strategy) => {
            const Icon = strategy.icon;
            return (
              <div key={strategy.name} className={`${strategy.bgColor} p-4 rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-5 w-5 ${strategy.color}`} />
                  <div className="font-medium">{strategy.name}</div>
                </div>
                <div className={`text-2xl font-bold ${strategy.color} mb-1`}>
                  {strategy.count}
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  {strategy.confidence} confidence
                </div>
                <div className="text-xs text-gray-500">
                  {strategy.description}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-center text-sm text-gray-600">
          Total matches: {metadata.totalMatches} • Processing time: {metadata.processingTimeMs}ms
        </div>
      </CardContent>
    </Card>
  );
}

// Field Mappings Table Component
interface FieldMappingsTableProps {
  fieldMappings: FieldMapping[];
  selectedChannel: string;
}

function FieldMappingsTable({ fieldMappings, selectedChannel }: FieldMappingsTableProps) {
  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'KNOWLEDGE_BASED': return 'text-purple-600 bg-purple-50';
      case 'SEMANTIC_MATCH':
      case 'SEMANTIC_WITH_BOOST': return 'text-blue-600 bg-blue-50';
      case 'SIMILARITY_MATCH': return 'text-green-600 bg-green-50';
      case 'PATTERN_MATCH': return 'text-orange-600 bg-orange-50';
      case 'EXACT_MATCH': return 'text-indigo-600 bg-indigo-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStrategyLabel = (strategy: string) => {
    return strategy.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field Mappings ({fieldMappings.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left font-medium">Source Field</th>
                <th className="p-3 text-left font-medium">Target Field ({selectedChannel})</th>
                <th className="p-3 text-center font-medium">Confidence</th>
                <th className="p-3 text-left font-medium">Strategy</th>
                <th className="p-3 text-center font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {fieldMappings.map((mapping, idx) => (
                <tr key={idx} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{mapping.sourcePath}</td>
                  <td className="p-3 font-mono text-xs text-blue-600">{mapping.targetPath}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center">
                      <Progress value={mapping.confidence} className="w-16 h-2" />
                      <span className="ml-2 font-medium">{mapping.confidence}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant="light"
                      className={`text-xs ${getStrategyColor(mapping.matchStrategy)}`}
                    >
                      {getStrategyLabel(mapping.matchStrategy)}
                    </Badge>
                  </td>
                  <td className="p-3 text-center text-gray-600">
                    {mapping.usageCount ? `${mapping.usageCount}x` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
