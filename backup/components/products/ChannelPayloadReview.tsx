'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Textarea from '@/components/ui/textarea/Textarea';
import Badge from '@/components/ui/badge/Badge';
import Progress from '@/components/ui/progress/Progress';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/Tabs';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Eye,
  Edit,
  Send,
  Download,
  Copy,
  RefreshCw,
  ExternalLink
} from '@/components/ui/icons/Icons';
import { channelMappingService, PublishResult } from '@/services/ChannelMappingService';
import { ChannelMappingResult } from '@/types/channel';

interface ChannelPayloadReviewProps {
  mappingResults: ChannelMappingResult[];
  productId: string;
  onPublishComplete?: (results: PublishResult[]) => void;
}

interface EditingPayload {
  [channelId: string]: any;
}

interface PublishingStatus {
  [channelId: string]: 'idle' | 'publishing' | 'success' | 'error';
}

export default function ChannelPayloadReview({ 
  mappingResults, 
  productId, 
  onPublishComplete 
}: ChannelPayloadReviewProps) {
  const router = useRouter();
  const [editingPayloads, setEditingPayloads] = useState<EditingPayload>({});
  const [publishingStatus, setPublishingStatus] = useState<PublishingStatus>({});
  const [publishResults, setPublishResults] = useState<{ [channelId: string]: PublishResult }>({});
  const [viewMode, setViewMode] = useState<{ [channelId: string]: 'form' | 'json' }>({});
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  useEffect(() => {
    // Initialize editing payloads with original data
    const initialPayloads: EditingPayload = {};
    mappingResults.forEach(result => {
      if (result.success && result.payload) {
        initialPayloads[result.channelId] = { ...result.payload };
      }
    });
    setEditingPayloads(initialPayloads);

    // Initialize view modes
    const initialViewModes: { [channelId: string]: 'form' | 'json' } = {};
    mappingResults.forEach(result => {
      initialViewModes[result.channelId] = 'form';
    });
    setViewMode(initialViewModes);

    // Initialize publishing status
    const initialStatus: PublishingStatus = {};
    mappingResults.forEach(result => {
      initialStatus[result.channelId] = 'idle';
    });
    setPublishingStatus(initialStatus);
  }, [mappingResults]);

  const handleFieldEdit = (channelId: string, fieldName: string, newValue: any) => {
    setEditingPayloads(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        [fieldName]: newValue
      }
    }));
  };

  const handleJsonEdit = (channelId: string, jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      setEditingPayloads(prev => ({
        ...prev,
        [channelId]: parsed
      }));
    } catch (error) {
      console.error('Invalid JSON:', error);
    }
  };

  const handlePublishToChannel = async (channelId: string) => {
    setPublishingStatus(prev => ({ ...prev, [channelId]: 'publishing' }));

    try {
      const payload = editingPayloads[channelId] || 
                     mappingResults.find(r => r.channelId === channelId)?.payload;

      const result = await channelMappingService.publishToChannel(productId, channelId, payload);
      
      setPublishResults(prev => ({ ...prev, [channelId]: result }));
      setPublishingStatus(prev => ({ 
        ...prev, 
        [channelId]: result.success ? 'success' : 'error' 
      }));
    } catch (error) {
      console.error('Publishing failed:', error);
      setPublishingStatus(prev => ({ ...prev, [channelId]: 'error' }));
      setPublishResults(prev => ({ 
        ...prev, 
        [channelId]: { 
          success: false, 
          error: 'Publishing failed. Please try again.' 
        } 
      }));
    }
  };

  const handleBulkPublish = async () => {
    const successfulMappings = mappingResults.filter(r => r.success);
    const publishPromises: Promise<void>[] = [];

    for (const mapping of successfulMappings) {
      if (selectedChannels.length === 0 || selectedChannels.includes(mapping.channelId)) {
        publishPromises.push(handlePublishToChannel(mapping.channelId));
      }
    }

    await Promise.all(publishPromises);

    if (onPublishComplete) {
      const results = Object.values(publishResults);
      onPublishComplete(results);
    }
  };

  const handleRetryMapping = async (channelId: string) => {
    try {
      setPublishingStatus(prev => ({ ...prev, [channelId]: 'publishing' }));
      
      const result = await channelMappingService.remapToChannel(productId, channelId);
      
      // Update the mapping result would happen here in a real implementation
      // const updatedResults = mappingResults.map(r => 
      //   r.channelId === channelId ? result : r
      // );
      
      if (result.success && result.payload) {
        setEditingPayloads(prev => ({
          ...prev,
          [channelId]: { ...result.payload }
        }));
      }
      
      setPublishingStatus(prev => ({ ...prev, [channelId]: 'idle' }));
    } catch (error) {
      console.error('Retry mapping failed:', error);
      setPublishingStatus(prev => ({ ...prev, [channelId]: 'error' }));
    }
  };

  const handleChannelSelect = (channelId: string, selected: boolean) => {
    setSelectedChannels(prev => 
      selected 
        ? [...prev, channelId]
        : prev.filter(id => id !== channelId)
    );
  };

  const getChannelIcon = (channelId: string) => {
    // You can replace these with actual channel logos
    return <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">
      {channelId.substring(0, 2).toUpperCase()}
    </div>;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadPayload = (channelId: string, payload: any) => {
    const dataStr = JSON.stringify(payload, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${channelId}-payload.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const successfulMappings = mappingResults.filter(r => r.success);
  const failedMappings = mappingResults.filter(r => !r.success);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Review Channel Mappings</span>
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="light" color="light">
                Total: {mappingResults.length}
              </Badge>
              <Badge variant="light" color="success">
                Successful: {successfulMappings.length}
              </Badge>
              {failedMappings.length > 0 && (
                <Badge variant="light" color="error">
                  Failed: {failedMappings.length}
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Bulk Actions */}
      {successfulMappings.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Bulk Actions:</span>
                <div className="flex items-center gap-2">
                  {successfulMappings.map(result => (
                    <label key={result.channelId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(result.channelId)}
                        onChange={(e) => handleChannelSelect(result.channelId, e.target.checked)}
                      />
                      {result.channelName || result.channelId}
                    </label>
                  ))}
                </div>
              </div>
              <Button 
                onClick={handleBulkPublish}
                disabled={successfulMappings.every(r => publishingStatus[r.channelId] === 'publishing')}
                className="flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                Publish Selected ({selectedChannels.length || successfulMappings.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel Mappings */}
      <div className="space-y-6">
        {mappingResults.map(result => (
          <Card key={result.channelId} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getChannelIcon(result.channelId)}
                  <div>
                    <h3 className="font-semibold">{result.channelName || result.channelId}</h3>
                    {result.success && (
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        <span>Mapped: {result.mappedFields}/{result.totalFields} fields</span>
                        <div className="flex items-center gap-2">
                          <span>Confidence:</span>
                          <Progress value={result.confidence} className="w-20 h-2" />
                          <span>{Math.round(result.confidence)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {result.success ? (
                    <>
                      {publishingStatus[result.channelId] === 'success' && (
                        <Badge variant="light" color="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Published
                        </Badge>
                      )}
                      {publishingStatus[result.channelId] === 'error' && (
                        <Badge variant="light" color="error">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                      
                      <Button
                        size="sm"
                        onClick={() => handlePublishToChannel(result.channelId)}
                        disabled={publishingStatus[result.channelId] === 'publishing'}
                      >
                        {publishingStatus[result.channelId] === 'publishing' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {publishingStatus[result.channelId] === 'publishing' ? 'Publishing...' : 'Publish'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetryMapping(result.channelId)}
                      disabled={publishingStatus[result.channelId] === 'publishing'}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry Mapping
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {result.success ? (
                <div className="space-y-4">
                  {/* Warnings */}
                  {result.warnings && result.warnings.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          {result.warnings.map((warning, index) => (
                            <div key={index}>{warning}</div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Publish Result */}
                  {publishResults[result.channelId] && (
                    <Alert variant={publishResults[result.channelId].success ? 'default' : 'destructive'}>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        {publishResults[result.channelId].success ? (
                          <div className="space-y-2">
                            <div>Successfully published to {result.channelId}!</div>
                            {publishResults[result.channelId].url && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => window.open(publishResults[result.channelId].url, '_blank')}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                View on {result.channelId}
                              </Button>
                            )}
                          </div>
                        ) : (
                          publishResults[result.channelId].error
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Payload Editor */}
                  <Tabs 
                    value={viewMode[result.channelId]} 
                    onValueChange={(value) => setViewMode(prev => ({ 
                      ...prev, 
                      [result.channelId]: value as 'form' | 'json' 
                    }))}
                  >
                    <div className="flex items-center justify-between">
                      <TabsList>
                        <TabsTrigger value="form" className="flex items-center gap-2">
                          <Edit className="h-4 w-4" />
                          Form Editor
                        </TabsTrigger>
                        <TabsTrigger value="json" className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          JSON View
                        </TabsTrigger>
                      </TabsList>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(JSON.stringify(editingPayloads[result.channelId] || result.payload, null, 2))}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPayload(result.channelId, editingPayloads[result.channelId] || result.payload)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>

                    <TabsContent value="form" className="mt-4">
                      <PayloadFormEditor
                        channelId={result.channelId}
                        originalPayload={result.payload}
                        currentPayload={editingPayloads[result.channelId] || result.payload}
                        onFieldChange={handleFieldEdit}
                      />
                    </TabsContent>

                    <TabsContent value="json" className="mt-4">
                      <div className="space-y-2">
                        <Label>JSON Payload</Label>
                        <Textarea
                          value={JSON.stringify(editingPayloads[result.channelId] || result.payload, null, 2)}
                          onChange={(e) => handleJsonEdit(result.channelId, e.target.value)}
                          rows={15}
                          className="font-mono text-sm"
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h4 className="font-semibold text-lg mb-2">Mapping Failed</h4>
                  <p className="text-gray-600 mb-4">{result.error}</p>
                  <Button 
                    variant="outline" 
                    onClick={() => handleRetryMapping(result.channelId)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Mapping
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <Button variant="outline" onClick={() => router.back()}>
          Back to Channel Selection
        </Button>
        
        <Button 
          onClick={() => router.push(`/products/${productId}`)}
          variant="outline"
        >
          View Product
        </Button>
      </div>
    </div>
  );
}

// Payload Form Editor Component
interface PayloadFormEditorProps {
  channelId: string;
  originalPayload: any;
  currentPayload: any;
  onFieldChange: (channelId: string, fieldName: string, value: any) => void;
}

function PayloadFormEditor({ 
  channelId, 
  originalPayload, 
  currentPayload, 
  onFieldChange 
}: PayloadFormEditorProps) {
  const renderFieldInput = (fieldName: string, fieldValue: any) => {
    const isModified = originalPayload[fieldName] !== fieldValue;

    if (typeof fieldValue === 'boolean') {
      return (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={fieldValue}
            onChange={(e) => onFieldChange(channelId, fieldName, e.target.checked)}
            className="rounded"
          />
          {isModified && <Badge variant="light" color="warning" size="sm">Modified</Badge>}
        </div>
      );
    }

    if (typeof fieldValue === 'number') {
      return (
        <div className="space-y-1">
          <Input
            type="number"
            value={fieldValue}
            onChange={(e) => onFieldChange(channelId, fieldName, parseFloat(e.target.value) || 0)}
            className={isModified ? 'border-blue-300' : ''}
          />
          {isModified && <Badge variant="light" color="warning" size="sm">Modified</Badge>}
        </div>
      );
    }

    if (typeof fieldValue === 'string' && fieldValue.length > 100) {
      return (
        <div className="space-y-1">
          <Textarea
            value={fieldValue}
            onChange={(e) => onFieldChange(channelId, fieldName, e.target.value)}
            rows={3}
            className={isModified ? 'border-blue-300' : ''}
          />
          {isModified && <Badge variant="light" color="warning" size="sm">Modified</Badge>}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <Input
          type="text"
          value={fieldValue?.toString() || ''}
          onChange={(e) => onFieldChange(channelId, fieldName, e.target.value)}
          className={isModified ? 'border-blue-300' : ''}
        />
        {isModified && <Badge variant="light" color="warning" size="sm">Modified</Badge>}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Object.entries(currentPayload).map(([fieldName, fieldValue]) => (
        <div key={fieldName} className="space-y-2">
          <Label className="font-medium">
            {fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Label>
          {renderFieldInput(fieldName, fieldValue)}
        </div>
      ))}
    </div>
  );
}