'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ProductCreatePage from '@/modules/ecommerce-product-v2/step1-create/components/ProductCreatePage';
import type { MasterProduct } from '@/modules/ecommerce-product-v2/types/product';

export default function CreateProductV2Page() {
  const router = useRouter();

  const handleProductCreated = (product: MasterProduct, _availableChannels: string[]) => {
    // Merge with existing sessionStorage entry — ProductCreateForm pre-writes form-derived
    // variants before calling this callback, since the backend create response may not echo
    // them back. Merging here preserves those variants instead of overwriting with empty.
    try {
      const key = `product_${product.id}`;
      const existing = sessionStorage.getItem(key);
      const existingVariants = existing
        ? (JSON.parse(existing) as Record<string, unknown>).variants
        : undefined;
      const productVariants = (product as unknown as Record<string, unknown>).variants;
      const variants = Array.isArray(productVariants) && (productVariants as unknown[]).length > 0
        ? productVariants
        : Array.isArray(existingVariants) && (existingVariants as unknown[]).length > 0
          ? existingVariants
          : [];
      sessionStorage.setItem(key, JSON.stringify({ ...product, variants }));
    } catch {
      sessionStorage.setItem(`product_${product.id}`, JSON.stringify(product));
    }
    router.push(`/products/${product.id}/channel-fields`);
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Master Product</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">
          Step 1 of 3 — Fill in the product details to generate your master product.
        </p>
      </div>
      <ProductCreatePage onProductCreated={handleProductCreated} />
    </div>
  );
}
