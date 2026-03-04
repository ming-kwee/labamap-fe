'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ProductCreatePage from '@/modules/ecommerce-product-v2/step1-create/components/ProductCreatePage';
import type { MasterProduct } from '@/modules/ecommerce-product-v2/types/product';

export default function CreateProductV2Page() {
  const router = useRouter();

  const handleProductCreated = (product: MasterProduct, _availableChannels: string[]) => {
    sessionStorage.setItem(`product_${product.id}`, JSON.stringify(product));
    router.push(`/products/${product.id}/channel-fields`);
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Master Product</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Step 1 of 3 — Fill in the product details to generate your master product.
        </p>
      </div>
      <ProductCreatePage onProductCreated={handleProductCreated} />
    </div>
  );
}
