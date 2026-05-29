"use client";

import React from "react";
import Link from "next/link";

export default function MyProductsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center mx-auto mb-6 text-4xl">
          📦
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">My Products</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
          Your master product library is being built. Once ready, every product you create
          will appear here — searchable, filterable, and linked to all your channels.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/products/v2/create"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
          >
            + Create a product
          </Link>
          <Link
            href="/channels/products"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            View channel sync →
          </Link>
        </div>

        <p className="mt-10 text-xs text-gray-400 dark:text-gray-500">
          Phase 2 of the product management roadmap
        </p>
      </div>
    </div>
  );
}
