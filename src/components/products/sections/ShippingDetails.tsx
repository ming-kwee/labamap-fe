"use client";
import React from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { ProductData } from "../ProductCreateForm";

interface ShippingDetailsProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

export default function ShippingDetails({ data, onUpdate }: ShippingDetailsProps) {
  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Shipping & Physical Details</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>Weight (kg)</Label>
            <Input
              type="number"
              step={0.01}
              defaultValue={data.masterAttributes.weight}
              onChange={(e) => onUpdate({ masterAttributes: { ...data.masterAttributes, weight: parseFloat(e.target.value) || 0 } })}
            />
          </div>
          
          <div>
            <Label>Shipping Class</Label>
            <select 
              defaultValue={data.masterAttributes.shippingClass}
              onChange={(e) => onUpdate({ masterAttributes: { ...data.masterAttributes, shippingClass: e.target.value } })}
              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm"
            >
              <option value="">Standard</option>
              <option value="heavy">Heavy Items</option>
              <option value="fragile">Fragile</option>
              <option value="express">Express Only</option>
            </select>
          </div>

          <div>
            <Label>Length (cm)</Label>
            <Input
              type="number"
              step={0.1}
              defaultValue={data.masterAttributes.dimensions?.length}
              onChange={(e) => onUpdate({ 
                masterAttributes: { 
                  ...data.masterAttributes, 
                  dimensions: { ...data.masterAttributes.dimensions, length: parseFloat(e.target.value) || 0 } 
                } 
              })}
            />
          </div>
          
          <div>
            <Label>Width (cm)</Label>
            <Input
              type="number"
              step={0.1}
              defaultValue={data.masterAttributes.dimensions?.width}
              onChange={(e) => onUpdate({ 
                masterAttributes: { 
                  ...data.masterAttributes, 
                  dimensions: { ...data.masterAttributes.dimensions, width: parseFloat(e.target.value) || 0 } 
                } 
              })}
            />
          </div>
          
          <div>
            <Label>Height (cm)</Label>
            <Input
              type="number"
              step={0.1}
              defaultValue={data.masterAttributes.dimensions?.height}
              onChange={(e) => onUpdate({ 
                masterAttributes: { 
                  ...data.masterAttributes, 
                  dimensions: { ...data.masterAttributes.dimensions, height: parseFloat(e.target.value) || 0 } 
                } 
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}