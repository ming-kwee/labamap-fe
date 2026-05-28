'use client';
/**
 * useProductTypeVariants
 * Given a productTypeId (from schema response metadata), fetches the
 * ProductType's ordered variant dimensions AND the master-attribute options
 * (e.g. Color → [Red, Blue, Green]) for each dimension axis.
 *
 * Chain: productTypeId
 *   → GET /admin/product-types/{id}                        → sorted variantDimensions
 *   → GET /admin/master-attributes?productTypeId={id}      → SELECT attrs → options per axis
 *
 * productTypeId is supplied by useFormSchema (read from schema response metadata).
 */
import { useState, useEffect } from 'react';
import type { VariantDimension } from '@/app/(admin)/omni-admin/product-types/_types/product-type';
import { ProductTypeService } from '@/app/(admin)/omni-admin/product-types/_services/product-type.service';
import { AttributeService } from '@/app/(admin)/omni-admin/master-attributes/_services/attribute.service';

export interface UseProductTypeVariantsResult {
  /** Ordered variant dimensions from the ProductType (axes only, no options). */
  productTypeDimensions: VariantDimension[];
  /**
   * Options per dimension: attributeCode → string[] of selectable values.
   * Populated from master attributes of type SELECT / MULTI_SELECT.
   */
  dimensionOptions: Map<string, string[]>;
  /** Display name of the resolved ProductType, or null. */
  productTypeName: string | null;
  /** ID of the resolved ProductType, or null. */
  productTypeId: string | null;
  loading: boolean;
  error: string | null;
}

export function useProductTypeVariants(productTypeId: string | null | undefined): UseProductTypeVariantsResult {
  const [state, setState] = useState<UseProductTypeVariantsResult>({
    productTypeDimensions: [],
    dimensionOptions: new Map(),
    productTypeName: null,
    productTypeId: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!productTypeId) {
      setState({ productTypeDimensions: [], dimensionOptions: new Map(), productTypeName: null, productTypeId: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const [productType, attributes] = await Promise.all([
          ProductTypeService.get(productTypeId),
          AttributeService.listAttributes({ productTypeId }).catch(() => []),
        ]);
        if (cancelled) return;

        const sortedDimensions = [...productType.variantDimensions].sort((a, b) => a.order - b.order);

        const dimensionOptions = new Map<string, string[]>();
        const normalize = (s: string) => s.toLowerCase().replace(/[_-]/g, '');

        for (const dim of sortedDimensions) {
          const dimCode = normalize(dim.attributeCode);
          const attr = attributes.find(a => {
            const attrCode = normalize(a.code);
            return attrCode === dimCode || attrCode.includes(dimCode) || dimCode.includes(attrCode);
          });
          if (attr && (attr.type === 'SELECT' || attr.type === 'MULTI_SELECT') && attr.options && attr.options.length > 0) {
            dimensionOptions.set(dim.attributeCode, attr.options.map(o => o.label || o.value).filter(Boolean));
          }
        }

        setState({
          productTypeDimensions: sortedDimensions,
          dimensionOptions,
          productTypeName: productType.name,
          productTypeId: productType.id,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          productTypeDimensions: [],
          dimensionOptions: new Map(),
          productTypeName: null,
          productTypeId: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load product type',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [productTypeId]);

  return state;
}
