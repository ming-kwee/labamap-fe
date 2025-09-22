"use client";
import React, { useState } from "react";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ProductData } from "../ProductCreateForm";

interface ProductBasicsProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

const categories = [
  "Electronics", "Clothing", "Home & Garden", "Sports", "Books", 
  "Toys", "Health & Beauty", "Automotive", "Food & Beverage", "Other"
];

const brands = [
  "Apple", "Samsung", "Nike", "Adidas", "Sony", "Microsoft", 
  "Amazon", "Google", "Custom Brand", "Other"
];

export default function ProductBasics({ data, onUpdate }: ProductBasicsProps) {
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const handleInputChange = (field: keyof ProductData['masterAttributes'], value: any) => {
    onUpdate({ 
      masterAttributes: { 
        ...data.masterAttributes, 
        [field]: value 
      } 
    });
  };

  const generateSKU = () => {
    const prefix = data.masterAttributes.category ? data.masterAttributes.category.substring(0, 3).toUpperCase() : "PRD";
    const timestamp = Date.now().toString().slice(-6);
    const sku = `${prefix}-${timestamp}`;
    handleInputChange("sku", sku);
  };

  const generateBarcode = () => {
    // Generate a simple 12-digit barcode
    const barcode = Math.floor(Math.random() * 999999999999).toString().padStart(12, "0");
    handleInputChange("barcode", barcode);
  };

  const generateContent = async () => {
    if (!data.masterAttributes.product_name) return;
    
    setIsGeneratingContent(true);
    try {
      // Simulate AI content generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const generatedDescription = `Experience the premium quality of ${data.masterAttributes.product_name}. This exceptional product combines innovative design with superior functionality, making it perfect for modern consumers who demand excellence. 

Key Features:
• Premium materials and construction
• User-friendly design
• Exceptional durability and performance
• Versatile functionality for multiple use cases
• Backed by our quality guarantee

Whether you're looking for reliability, style, or performance, ${data.masterAttributes.product_name} delivers on all fronts. Join thousands of satisfied customers who have made this their go-to choice.`;

      handleInputChange("description", generatedDescription);
      
      
    } catch (error) {
      console.error("Failed to generate content:", error);
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const addTag = (tag: string) => {
    if (tag && !data.masterAttributes.tags.includes(tag)) {
      handleInputChange("tags", [...data.masterAttributes.tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleInputChange("tags", data.masterAttributes.tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput.trim());
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-title-md font-semibold text-gray-900 dark:text-white">Product Basics</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Essential product information and details
            </p>
          </div>
          <Button 
            onClick={generateContent}
            disabled={!data.masterAttributes.product_name || isGeneratingContent}
            className="bg-purple-500 hover:bg-purple-600"
          >
            {isGeneratingContent ? "🤖 Generating..." : "🤖 AI Generate"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Product Name */}
          <div className="lg:col-span-2">
            <Label>Product Name *</Label>
            <Input
              type="text"
              placeholder="Enter product name"
              defaultValue={data.masterAttributes.product_name}
              onChange={(e) => handleInputChange("product_name", e.target.value)}
              className="text-title-md font-medium"
            />
          </div>

          {/* Category */}
          <div>
            <Label>Category *</Label>
            <select
              value={data.masterAttributes.category}
              onChange={(e) => handleInputChange("category", e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3 focus:ring-brand-500/10 focus:border-brand-300 dark:focus:border-brand-800 dark:text-white"
            >
              <option value="">Select Category</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Brand */}
          <div>
            <Label>Brand</Label>
            <select
              value={data.masterAttributes.brand}
              onChange={(e) => handleInputChange("brand", e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3 focus:ring-brand-500/10 focus:border-brand-300 dark:focus:border-brand-800 dark:text-white"
            >
              <option value="">Select Brand</option>
              {brands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* SKU */}
          <div>
            <Label>SKU (Stock Keeping Unit) *</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Product SKU"
                defaultValue={data.masterAttributes.sku}
                onChange={(e) => handleInputChange("sku", e.target.value)}
              />
              <Button onClick={generateSKU} variant="outline" className="whitespace-nowrap">
                Generate
              </Button>
            </div>
          </div>

          {/* Barcode */}
          <div>
            <Label>Barcode/UPC</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Product barcode"
                defaultValue={data.masterAttributes.barcode}
                onChange={(e) => handleInputChange("barcode", e.target.value)}
              />
              <Button onClick={generateBarcode} variant="outline" className="whitespace-nowrap">
                Generate
              </Button>
            </div>
          </div>


          {/* Status */}
          <div>
            <Label>Product Status</Label>
            <select
              value={data.masterAttributes.status}
              onChange={(e) => handleInputChange("status", e.target.value as "draft" | "active" | "inactive")}
              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3 focus:ring-brand-500/10 focus:border-brand-300 dark:focus:border-brand-800 dark:text-white"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="mb-4">
          <Label>Product Description *</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Detailed description that will be used across all channels
          </p>
        </div>
        <TextArea
          placeholder="Enter detailed product description..."
          value={data.masterAttributes.description}
          onChange={(value) => handleInputChange("description", value)}
          className="min-h-32"
        />
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500 dark:text-gray-400">
          <span>Use clear, engaging language that highlights key benefits</span>
          <span>{data.masterAttributes.description.length} characters</span>
        </div>
      </div>



      {/* Tags */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="mb-4">
          <Label>Product Tags</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Add tags to improve searchability and organization
          </p>
        </div>
        
        {/* Existing Tags */}
        {data.masterAttributes.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {data.masterAttributes.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-brand-100 text-brand-800 dark:bg-brand-900/20 dark:text-brand-400 rounded-full"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-1 text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add Tag Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add tags (press Enter or comma to add)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={handleTagKeyPress}
            className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3 focus:ring-brand-500/10 focus:border-brand-300 dark:focus:border-brand-800 dark:text-white"
          />
          <Button 
            onClick={() => addTag(tagInput.trim())}
            disabled={!tagInput.trim()}
            variant="outline"
          >
            Add Tag
          </Button>
        </div>

        {/* Suggested Tags */}
        <div className="mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Suggested tags:</p>
          <div className="flex flex-wrap gap-2">
            {["premium", "bestseller", "new", "limited", "eco-friendly", "handmade"].map(tag => (
              <button
                key={tag}
                onClick={() => addTag(tag)}
                disabled={data.masterAttributes.tags.includes(tag)}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Smart Insights */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">💡</span>
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-blue-900 dark:text-blue-400 mb-2">Smart Insights</h3>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
              <p>• Product name should be clear and include key benefits</p>
              <p>• SKU format should be consistent across your catalog</p>
              <p>• Consider adding seasonal or trending tags for better discoverability</p>
              {data.masterAttributes.product_name && !data.masterAttributes.description && (
                <p className="text-amber-700 dark:text-amber-400">⚠️ Add a description to improve conversion rates</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}