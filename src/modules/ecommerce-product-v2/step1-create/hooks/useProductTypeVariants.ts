'use client';
/**
 * useProductTypeVariants
 * Given a category ID, resolves the ProductType and returns its ordered
 * variant dimensions. Used by ProductCreateForm to drive VariantConfigurator.
 *
 * Chain: category → productTypeId → ProductType.variantDimensions
 */
import { useState, useEffect } from 'react';
import type { VariantDimension } from '@/app/omni-admin/product-types/_types/product-type';
import { CategoryService } from '@/app/omni-admin/product-categories/_services/category.service';
import { ProductTypeService } from '@/app/omni-admin/product-types/_services/product-type.service';

export interface UseProductTypeVariantsResult {
  /** Ordered variant dimensions from the ProductType. Empty when none. */
  productTypeDimensions: VariantDimension[];
  /** Display name of the resolved ProductType, or null. */
  productTypeName: string | null;
  /** ID of the resolved ProductType, or null. */
  productTypeId: string | null;
  loading: boolean;
  error: string | null;
}

export function useProductTypeVariants(categoryId: string | undefined): UseProductTypeVariantsResult {
  const [state, setState] = useState<UseProductTypeVariantsResult>({
    productTypeDimensions: [],
    productTypeName: null,
    productTypeId: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!categoryId) {
      setState({ productTypeDimensions: [], productTypeName: null, productTypeId: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const category = await CategoryService.get(categoryId);
        if (cancelled) return;

        if (!category.productTypeId) {
          // Category exists but has no ProductType assigned
          setState({ productTypeDimensions: [], productTypeName: null, productTypeId: null, loading: false, error: null });
          return;
        }

        const productType = await ProductTypeService.get(category.productTypeId);
        if (cancelled) return;

        // Sort dimensions by order ascending (order 1 = primary axis, 2 = secondary, ...)
        const sortedDimensions = [...productType.variantDimensions].sort((a, b) => a.order - b.order);

        setState({
          productTypeDimensions: sortedDimensions,
          productTypeName: productType.name,
          productTypeId: productType.id,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        // Non-fatal: fall back to schema-heuristic detection
        setState({
          productTypeDimensions: [],
          productTypeName: null,
          productTypeId: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load product type',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [categoryId]);

  return state;
}
