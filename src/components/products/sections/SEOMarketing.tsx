"use client";
import React, { useState } from "react";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ProductData } from "../ProductCreateForm";

interface SEOMarketingProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

export default function SEOMarketing({ data, onUpdate }: SEOMarketingProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleInputChange = (field: keyof ProductData['masterAttributes'], value: any) => {
    onUpdate({ 
      masterAttributes: { 
        ...data.masterAttributes, 
        [field]: value 
      } 
    });
  };

  const generateSEOContent = async () => {
    if (!data.masterAttributes.product_name) return;
    
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      handleInputChange("seoTitle", `${data.masterAttributes.product_name} - Best Quality & Price | Shop Now`);
      handleInputChange("seoDescription", `Shop ${data.masterAttributes.product_name} with fast shipping and best price guarantee. High quality, excellent value. Order now and get free shipping on orders over $50.`);
      handleInputChange("seoKeywords", [data.masterAttributes.product_name.toLowerCase(), data.masterAttributes.category?.toLowerCase(), "quality", "best price", "online shopping"].filter(Boolean));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-title-md font-semibold text-gray-900 dark:text-white">SEO & Marketing</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Optimize your product for search engines and marketing campaigns
            </p>
          </div>
          <Button onClick={generateSEOContent} disabled={isGenerating || !data.masterAttributes.product_name}>
            {isGenerating ? "🤖 Generating..." : "🤖 AI Optimize"}
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <Label>SEO Title</Label>
            <Input
              type="text"
              placeholder="Optimized title for search engines"
              defaultValue={data.masterAttributes.seoTitle}
              onChange={(e) => handleInputChange("seoTitle", e.target.value)}
            />
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {data.masterAttributes.seoTitle?.length || 0}/60 characters
            </div>
          </div>

          <div>
            <Label>SEO Description</Label>
            <TextArea
              placeholder="Brief description that appears in search results"
              value={data.masterAttributes.seoDescription}
              onChange={(value) => handleInputChange("seoDescription", value)}
            />
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {data.masterAttributes.seoDescription?.length || 0}/160 characters
            </div>
          </div>

          <div>
            <Label>Keywords</Label>
            <Input
              type="text"
              placeholder="Enter keywords separated by commas"
              defaultValue={data.masterAttributes.seoKeywords?.join(", ")}
              onChange={(e) => handleInputChange("seoKeywords", e.target.value.split(",").map(k => k.trim()).filter(k => k))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}