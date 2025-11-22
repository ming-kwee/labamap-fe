"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
// import Input from "@/components/form/input/InputField";
import { ProductData } from "../ProductCreateForm";

interface ProductBundlesProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

export default function ProductBundles({ }: ProductBundlesProps) {
  const [bundles] = useState([
    { id: 1, name: "Complete Set", discount: 15, products: ["Product A", "Product B"] },
    { id: 2, name: "Starter Pack", discount: 10, products: ["Product A", "Accessory C"] },
  ]);

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-title-md font-semibold text-gray-900 dark:text-white">Product Bundles & Upsells</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create product bundles and cross-sell opportunities
            </p>
          </div>
          <Button>+ Create Bundle</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bundles.map(bundle => (
            <div key={bundle.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">{bundle.name}</h3>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                  {bundle.discount}% off
                </span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {bundle.products.join(" + ")}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Edit</Button>
                <Button variant="outline" size="sm">Remove</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">Recommended Products</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["Related Product 1", "Related Product 2", "Related Product 3"].map((product, index) => (
              <div key={index} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="font-medium text-sm text-gray-900 dark:text-white mb-1">{product}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Frequently bought together</div>
                <Button variant="outline" size="sm" className="mt-2 w-full">Add to Recommendations</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}