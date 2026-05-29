"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProductDetailPlaceholderPage() {
  const { masterProductId } = useParams<{ masterProductId: string }>();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center mx-auto mb-6 text-4xl">
          🛍
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Product Detail</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
          The full product detail view — master data, channel distribution cards,
          and per-channel edit/sync actions — is coming in Phase 3.
        </p>
        <code className="block text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 mb-8 font-mono break-all">
          {masterProductId}
        </code>

        <div className="flex flex-col gap-3">
          <Link
            href={`/products/${masterProductId}/channel-fields`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
          >
            Edit channel fields →
          </Link>
          <Link
            href={`/products/${masterProductId}/publish`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Publish dashboard →
          </Link>
          <Link
            href="/products"
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors mt-1"
          >
            ← Back to My Products
          </Link>
        </div>

        <p className="mt-10 text-xs text-gray-400 dark:text-gray-500">
          Phase 3 of the product management roadmap
        </p>
      </div>
    </div>
  );
}
