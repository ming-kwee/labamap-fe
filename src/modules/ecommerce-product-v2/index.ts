/**
 * ecommerce-product-v2 — Public API
 *
 * Named exports intentionally mirror the old ecommerce-product module so that
 * external consumers (create/page.tsx, publish-to-channel/page.tsx,
 * PublishDashboard.tsx) can migrate with a one-line import-path change.
 */

// ── Components ─────────────────────────────────────────────────────────────

export { default as ProductCreatePage } from './step1-create/components/ProductCreatePage';
// Backward-compat alias for external files still using ProductCreationPageWrapper
export { default as ProductCreationPageWrapper } from './step1-create/components/ProductCreatePage';

// ── Types ──────────────────────────────────────────────────────────────────

export type {
  MasterProduct,
  ProductVariant,
  ChannelMapping,
} from './types/product';

export type {
  FormField,
  DynamicFormSchema,
  EnhancedValidationResult,
  ValidationViolation,
  DynamicFormData,
} from './types/form-schema';

export type {
  FieldMapping,
  AdaptivePatternMatchingRequest,
  AdaptivePatternMatchingResponse,
} from './types/channel-mapping';

// ── Services (raw functions) ───────────────────────────────────────────────

export {
  analyzePatternMatching,
  publishToChannel,
  previewJoltTransformation,
  getAvailableChannels,
} from './services/pattern-matching.service';

export { ProductApiService } from './services/product-api.service';
export { MediaUploadService } from './services/media-upload.service';
export {
  generateFormSchema,
  refreshFormSchema,
  getCategoryConfig,
  createBackendContext,
} from './services/schema-api.service';

// ── Service compat objects ─────────────────────────────────────────────────
// These let files that import `channelMappingService` / `productGenerationService`
// as namespace objects continue to work unchanged.

import {
  analyzePatternMatching as _am,
  publishToChannel as _pt,
  previewJoltTransformation as _pj,
  getAvailableChannels as _ga,
} from './services/pattern-matching.service';

export const channelMappingService = {
  analyzePatternMatching: _am,
  publishToChannel: _pt,
  previewJoltTransformation: _pj,
  getAvailableChannels: _ga,
} as const;

import {
  generateMasterProduct as _gmp,
  transformMasterProductToSourceSchema as _tmss,
  generateMappingRequest as _gmr,
} from './utils/product-mapper';

export const productGenerationService = {
  generateMasterProduct: _gmp,
  transformMasterProductToSourceSchema: _tmss,
  generateMappingRequest: _gmr,
} as const;

// ── Utils (standalone) ─────────────────────────────────────────────────────

export {
  generateMasterProduct,
  transformMasterProductToSourceSchema,
  generateMappingRequest,
} from './utils/product-mapper';

export {
  getSectionMetadata,
  groupFieldsBySection,
  mapUserRole,
  validateProductCategory,
  normalizeSectionKey,
} from './utils/form-utils';

export { onVariantsEnabled, onVariantsDisabled } from './utils/variant-scope';
