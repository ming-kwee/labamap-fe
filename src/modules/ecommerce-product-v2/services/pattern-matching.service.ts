/**
 * Pattern Matching Service
 * Implements Adaptive Pattern Matching for channel field mapping
 */

import {
  AdaptivePatternMatchingRequest,
  AdaptivePatternMatchingResponse,
  ChannelPublishRequest,
  ChannelPublishResponse,
  ChannelConfiguration,
  ChannelConfigurationBackend,
} from '../types/channel-mapping';

const BASE_URL = 'http://localhost:8888/labamap/api/v1';

function transformChannelConfig(backend: ChannelConfigurationBackend): ChannelConfiguration {
  return {
    channelId: backend.channelId,
    channelName: backend.channelName,
    description: backend.description,
    requiredFields: backend.requiredFields || [],
    optionalFields: backend.optionalFields || [],
    variantSupport: backend.metadata?.variantSupport ?? false,
    maxVariants: backend.metadata?.maxVariants,
    isActive: backend.isActive,
    metadata: backend.metadata,
    fieldConstraints: {}
  };
}

/**
 * Analyzes master product against channel schema using 5-tier pattern matching
 * POST /api/v1/adaptive-pattern-matching/analyze
 */
export async function analyzePatternMatching(
  request: AdaptivePatternMatchingRequest,
  signal?: AbortSignal
): Promise<AdaptivePatternMatchingResponse> {
  const response = await fetch(`${BASE_URL}/adaptive-pattern-matching/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pattern matching failed: ${response.statusText} — ${errorText}`);
  }

  const result = await response.json();

  if (result.status === 'ERROR') {
    throw new Error(`Backend error: ${result.message || 'Pattern matching failed'}`);
  }

  return result;
}

/**
 * Publishes master product to a channel using generated field mappings
 * POST /api/v1/channels/publish
 */
export async function publishToChannel(
  request: ChannelPublishRequest
): Promise<ChannelPublishResponse> {
  const response = await fetch(`${BASE_URL}/channels/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to publish to channel: ${response.statusText} — ${errorText}`);
  }

  return response.json();
}

/**
 * Preview JOLT transformation result without publishing
 * POST /api/v1/jolt/preview
 */
export async function previewJoltTransformation(
  sourceData: Record<string, any>,
  joltSpec: any[]
): Promise<Record<string, any>> {
  const response = await fetch(`${BASE_URL}/jolt/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceData, joltSpec }),
  });

  if (!response.ok) {
    throw new Error(`Failed to preview transformation: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Returns all active channel configurations
 * GET /api/v1/channels
 */
export async function getAvailableChannels(): Promise<ChannelConfiguration[]> {
  const response = await fetch(`${BASE_URL}/channels`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get channels: ${response.statusText}`);
  }

  const backendChannels: ChannelConfigurationBackend[] = await response.json();

  return backendChannels
    .filter(ch => ch.isActive)
    .map(ch => transformChannelConfig(ch));
}

/** Category attributes returned as a target schema fragment (APM A2+ auto-fetch). */
export interface CategoryAttributeSchemaResponse {
  channelType: string;
  storeId: string;
  categoryId: string;
  categoryName: string;
  // schema keys are the resolved apiSchema path when a field mapped (else the bare field name).
  schema: Record<string, unknown>;
  fieldCount: number;
  requiredCount: number;
  optionalCount: number;
  requiredFieldNames: string[];
  resolvedPaths: Record<string, string>; // fieldName → dotted apiSchema path (only fields that mapped)
  matchedCount: number;                    // how many fields resolved to a real path
}

/** Resolved category-tree endpoints for a store (drives the CATEGORY_TREE picker). */
export interface CategoryTreeConfigResponse {
  rootEndpoint: string;
  childEndpoint: string;
  searchEndpoint: string | null; // null = channel has no full-tree search endpoint
}

/**
 * Resolved category-tree endpoint URLs for a (channel, store) — single backend source of truth
 * (which channels have a search endpoint lives there, not in the FE).
 * GET /api/v1/categories/{channelType}/{storeId}/tree-config?organizationId=
 */
export async function fetchCategoryTreeConfig(
  channelType: string,
  storeId: string,
  organizationId: string,
  signal?: AbortSignal,
): Promise<CategoryTreeConfigResponse> {
  const url =
    `${BASE_URL}/categories/${encodeURIComponent(channelType)}/${encodeURIComponent(storeId)}/tree-config` +
    `?organizationId=${encodeURIComponent(organizationId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch category tree config: ${response.statusText}`);
  }
  return response.json();
}

/**
 * A2+ auto-fetch: live/cached channel category attributes as a TARGET schema fragment.
 * GET /api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}/schema?organizationId=
 * Needs a store (for channel credentials) and the channel's leaf categoryId. Never throws a 5xx body
 * — the backend returns an empty schema on failure.
 */
export async function fetchCategoryAttributeSchema(
  channelType: string,
  storeId: string,
  categoryId: string,
  organizationId: string,
  signal?: AbortSignal,
): Promise<CategoryAttributeSchemaResponse> {
  const url =
    `${BASE_URL}/categories/${encodeURIComponent(channelType)}/${encodeURIComponent(storeId)}` +
    `/attributes/${encodeURIComponent(categoryId)}/schema?organizationId=${encodeURIComponent(organizationId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch category attributes: ${response.statusText}`);
  }
  return response.json();
}
