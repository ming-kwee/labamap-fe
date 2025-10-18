'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Badge from '@/components/ui/badge/Badge';
import Progress from '@/components/ui/progress/Progress';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Eye,
  Settings,
  Zap,
  Target,
  TrendingUp
} from '@/components/ui/icons/Icons';
import { 
  adaptivePatternMatchingService, 
  ClientSidePatternMatching,
  SemanticMatchResult,
  MappingValidationResult 
} from '@/services/AdaptivePatternMatchingService';
import { FieldMapping } from '@/types/channel';

interface FieldMappingVisualizerProps {
  sourceData: any;
  targetSchema: any;
  channelId: string;
  existingMappings?: FieldMapping[];
  onMappingsChange?: (mappings: FieldMapping[]) => void;
  onValidationChange?: (validation: MappingValidationResult) => void;
}

export default function FieldMappingVisualizer({
  sourceData,
  targetSchema,
  channelId,
  existingMappings = [],
  onMappingsChange,
  onValidationChange
}: FieldMappingVisualizerProps) {
  const [mappings, setMappings] = useState<FieldMapping[]>(existingMappings);
  const [semanticMatches, setSemanticMatches] = useState<SemanticMatchResult[]>([]);
  const [validation, setValidation] = useState<MappingValidationResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});
  // const [selectedMapping, setSelectedMapping] = useState<string | null>(null);

  const sourceFields = Object.keys(sourceData || {});
  const targetFields = Object.keys(targetSchema?.properties || {});
  const requiredFields = targetSchema?.required || [];

  useEffect(() => {
    if (sourceFields.length > 0 && targetFields.length > 0) {
      generateAutoMappings();
    }
  }, [sourceFields.length, targetFields.length, channelId]);

  useEffect(() => {
    if (mappings.length > 0) {
      validateMappings();
    }
  }, [mappings]);

  const generateAutoMappings = async () => {
    setIsAnalyzing(true);

    try {
      // Generate client-side auto mappings first
      const autoMappings = ClientSidePatternMatching.generateAutoMappings(
        sourceFields, 
        targetFields, 
        60 // Lower threshold for initial suggestions
      );

      // Get semantic matches from server
      const semanticResults = await adaptivePatternMatchingService.findSemanticMatches(
        sourceFields,
        targetFields,
        channelId
      );

      setSemanticMatches(semanticResults);

      // Combine auto mappings with semantic matches
      const enhancedMappings = enhanceWithSemanticMatches(autoMappings, semanticResults);
      
      setMappings(enhancedMappings);
      if (onMappingsChange) {
        onMappingsChange(enhancedMappings);
      }
    } catch (error) {
      console.error('Failed to generate auto mappings:', error);
      // Fallback to client-side only
      const fallbackMappings = ClientSidePatternMatching.generateAutoMappings(
        sourceFields, 
        targetFields
      );
      setMappings(fallbackMappings);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const enhanceWithSemanticMatches = (
    autoMappings: FieldMapping[], 
    semanticResults: SemanticMatchResult[]
  ): FieldMapping[] => {
    const enhancedMappings = [...autoMappings];
    const mappedTargetFields = new Set(autoMappings.map(m => m.targetField));

    // Add high-confidence semantic matches that weren't caught by auto mapping
    semanticResults.forEach(semantic => {
      if (semantic.confidence >= 80 && !mappedTargetFields.has(semantic.targetField)) {
        enhancedMappings.push({
          sourceField: semantic.sourceField,
          targetField: semantic.targetField,
          confidence: semantic.confidence,
          transformationType: 'SEMANTIC',
          notes: semantic.reasoning
        });
        mappedTargetFields.add(semantic.targetField);
      }
    });

    return enhancedMappings.sort((a, b) => b.confidence - a.confidence);
  };

  const validateMappings = async () => {
    try {
      const validationResult = await adaptivePatternMatchingService.validateMapping(
        sourceData,
        targetSchema,
        mappings
      );

      setValidation(validationResult);
      if (onValidationChange) {
        onValidationChange(validationResult);
      }
    } catch (error) {
      console.error('Failed to validate mappings:', error);
    }
  };

  // const updateMapping = (index: number, updates: Partial<FieldMapping>) => {
  //   const updatedMappings = mappings.map((mapping, i) => 
  //     i === index ? { ...mapping, ...updates } : mapping
  //   );
  //   setMappings(updatedMappings);
  //   if (onMappingsChange) {
  //     onMappingsChange(updatedMappings);
  //   }
  // };

  const removeMapping = (index: number) => {
    const updatedMappings = mappings.filter((_, i) => i !== index);
    setMappings(updatedMappings);
    if (onMappingsChange) {
      onMappingsChange(updatedMappings);
    }
  };

  const addManualMapping = () => {
    const unmappedSource = sourceFields.find((field: string) => 
      !mappings.some(m => m.sourceField === field)
    );
    const unmappedTarget = targetFields.find((field: string) => 
      !mappings.some(m => m.targetField === field)
    );

    if (unmappedSource && unmappedTarget) {
      const newMapping: FieldMapping = {
        sourceField: unmappedSource,
        targetField: unmappedTarget,
        confidence: 50,
        transformationType: 'DIRECT'
      };

      const updatedMappings = [...mappings, newMapping];
      setMappings(updatedMappings);
      if (onMappingsChange) {
        onMappingsChange(updatedMappings);
      }
    }
  };

  const toggleDetails = (mappingKey: string) => {
    setShowDetails(prev => ({
      ...prev,
      [mappingKey]: !prev[mappingKey]
    }));
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-500';
    if (confidence >= 70) return 'bg-blue-500';
    if (confidence >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTransformationIcon = (type: string) => {
    switch (type) {
      case 'DIRECT': return <ArrowRight className="h-4 w-4" />;
      case 'SEMANTIC': return <Zap className="h-4 w-4" />;
      case 'PLATFORM_SPECIFIC': return <Target className="h-4 w-4" />;
      case 'COMPUTED': return <Settings className="h-4 w-4" />;
      default: return <ArrowRight className="h-4 w-4" />;
    }
  };

  const isFieldRequired = (fieldName: string) => requiredFields.includes(fieldName);
  const mappedTargetFields = new Set(mappings.map(m => m.targetField));
  const unmappedRequiredFields = requiredFields.filter((field: string) => !mappedTargetFields.has(field));

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Field Mapping Visualizer
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={generateAutoMappings} 
                disabled={isAnalyzing}
                variant="outline"
                size="sm"
              >
                {isAnalyzing ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Zap className="h-4 w-4 mr-1" />
                )}
                Auto-Map
              </Button>
              <Button onClick={addManualMapping} variant="outline" size="sm">
                Add Mapping
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{mappings.length}</div>
              <div className="text-sm text-gray-600">Total Mappings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {Math.round(mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length || 0)}%
              </div>
              <div className="text-sm text-gray-600">Avg Confidence</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {Math.round((mappedTargetFields.size / targetFields.length) * 100)}%
              </div>
              <div className="text-sm text-gray-600">Field Coverage</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {validation.valid ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Mapping Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Completeness</h4>
                  <Progress 
                    value={validation.completeness.percentage} 
                    className="w-full"
                  />
                  <div className="text-sm text-gray-600 mt-1">
                    {validation.completeness.mappedFields}/{validation.completeness.totalFields} fields mapped
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Status</h4>
                  <div className="flex items-center gap-2">
                    {validation.valid ? (
                      <Badge variant="light" color="success" className="bg-green-100 text-green-800">
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="light" color="error">
                        {validation.errors.length} Error{validation.errors.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {validation.warnings.length > 0 && (
                      <Badge variant="light" color="warning" className="bg-yellow-100 text-yellow-800">
                        {validation.warnings.length} Warning{validation.warnings.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Missing Required Fields */}
              {unmappedRequiredFields.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Missing Required Fields:</div>
                      <div className="flex flex-wrap gap-1">
                        {unmappedRequiredFields.map((field: string) => (
                          <Badge key={field} variant="light" color="error" size="sm">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Validation Errors */}
              {validation.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-red-600">Errors</h4>
                  {validation.errors.map((error, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{error.field}:</strong> {error.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {validation.suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-blue-600">Suggestions</h4>
                  {validation.suggestions.map((suggestion, index) => (
                    <Alert key={index}>
                      <Eye className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{suggestion.field}:</strong> {suggestion.suggestion} 
                        <Badge variant="light" color="light" className="ml-2 text-xs">
                          {Math.round(suggestion.confidence)}% confidence
                        </Badge>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field Mappings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Field Mappings</h3>
        
        {mappings.map((mapping, index) => {
          const mappingKey = `${mapping.sourceField}-${mapping.targetField}`;
          const isRequired = isFieldRequired(mapping.targetField);
          const sourceValue = sourceData?.[mapping.sourceField];
          
          return (
            <Card key={mappingKey} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Source Field */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="light" color="light" className="text-xs">Source</Badge>
                        <span className="font-medium">{mapping.sourceField}</span>
                      </div>
                      {sourceValue !== undefined && (
                        <div className="text-sm text-gray-600 mt-1 truncate max-w-xs">
                          Value: {JSON.stringify(sourceValue)}
                        </div>
                      )}
                    </div>

                    {/* Transformation */}
                    <div className="flex items-center gap-2">
                      {getTransformationIcon(mapping.transformationType)}
                      <div className="text-center">
                        <div className={`w-16 h-2 rounded-full ${getConfidenceColor(mapping.confidence)}`} />
                        <div className="text-xs text-gray-600 mt-1">
                          {Math.round(mapping.confidence)}%
                        </div>
                      </div>
                    </div>

                    {/* Target Field */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="light"
                          color={isRequired ? "error" : "light"}
                          className="text-xs"
                        >
                          {isRequired ? 'Required' : 'Target'}
                        </Badge>
                        <span className="font-medium">{mapping.targetField}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Type: {mapping.transformationType}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => toggleDetails(mappingKey)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      onClick={() => removeMapping(index)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-800"
                    >
                      ×
                    </Button>
                  </div>
                </div>

                {/* Details */}
                {showDetails[mappingKey] && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    {mapping.notes && (
                      <div>
                        <h5 className="font-medium text-sm">Reasoning</h5>
                        <p className="text-sm text-gray-600">{mapping.notes}</p>
                      </div>
                    )}

                    {/* Semantic Match Details */}
                    {mapping.transformationType === 'SEMANTIC' && semanticMatches.find(
                      s => s.sourceField === mapping.sourceField && s.targetField === mapping.targetField
                    ) && (
                      <div>
                        <h5 className="font-medium text-sm">Semantic Analysis</h5>
                        {(() => {
                          const semantic = semanticMatches.find(
                            s => s.sourceField === mapping.sourceField && s.targetField === mapping.targetField
                          );
                          return semantic ? (
                            <div className="space-y-2">
                              <div className="text-sm">
                                <strong>Type:</strong> {semantic.semanticType}
                              </div>
                              <div className="text-sm">
                                <strong>Reasoning:</strong> {semantic.reasoning}
                              </div>
                              {semantic.alternatives.length > 0 && (
                                <div>
                                  <strong className="text-sm">Alternatives:</strong>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {semantic.alternatives.slice(0, 3).map((alt, i) => (
                                      <Badge key={i} variant="light" color="light" className="text-xs">
                                        {alt.field} ({Math.round(alt.confidence)}%)
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* Field Schema Info */}
                    {targetSchema?.properties?.[mapping.targetField] && (
                      <div>
                        <h5 className="font-medium text-sm">Target Field Schema</h5>
                        <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(targetSchema.properties[mapping.targetField], null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {mappings.length === 0 && !isAnalyzing && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No field mappings generated yet.</p>
              <p className="text-sm">Click "Auto-Map" to generate intelligent field mappings.</p>
            </CardContent>
          </Card>
        )}

        {isAnalyzing && (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p>Analyzing fields and generating mappings...</p>
              <p className="text-sm text-gray-600">This may take a few moments.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}