"use client";
import React, { useState, useEffect } from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "../ProductCreateForm";

interface PricingInventoryProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

const currencies = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
];

const taxRates = [
  { name: "No Tax", rate: 0 },
  { name: "Standard (8.25%)", rate: 8.25 },
  { name: "Reduced (5%)", rate: 5 },
  { name: "High (20%)", rate: 20 },
];

export default function PricingInventory({ data, onUpdate }: PricingInventoryProps) {
  // const [multiCurrencyPricing, setMultiCurrencyPricing] = useState<Record<string, number>>({});
  const [profitMargin, setProfitMargin] = useState(0);
  const [inventoryLocations, setInventoryLocations] = useState([
    { id: "main", name: "Main Warehouse", quantity: data.stockQuantity || 0 },
    { id: "store1", name: "Store 1", quantity: 0 },
    { id: "store2", name: "Store 2", quantity: 0 },
  ]);

  const selectedCurrency = currencies.find(c => c.code === data.currency) || currencies[0];

  useEffect(() => {
    if (data.basePrice && data.costPrice) {
      const margin = ((data.basePrice - data.costPrice) / data.basePrice) * 100;
      setProfitMargin(margin);
    }
  }, [data.basePrice, data.costPrice]);

  const handleInputChange = (field: keyof ProductData, value: ProductData[keyof ProductData]) => {
    onUpdate({ [field]: value });
  };

  const handlePriceChange = (type: "basePrice" | "costPrice" | "comparePrice", value: string) => {
    const numValue = parseFloat(value) || 0;
    handleInputChange(type, numValue);
  };

  const calculateMultiCurrencyPrice = (basePrice: number, currency: string) => {
    // Mock exchange rates - in real app, fetch from API
    const exchangeRates: Record<string, number> = {
      USD: 1,
      EUR: 0.85,
      GBP: 0.73,
      CAD: 1.25,
      AUD: 1.35,
      JPY: 110,
    };
    
    const rate = exchangeRates[currency] || 1;
    return (basePrice * rate).toFixed(2);
  };

  const updateInventoryLocation = (locationId: string, quantity: number) => {
    setInventoryLocations(prev => 
      prev.map(loc => 
        loc.id === locationId ? { ...loc, quantity } : loc
      )
    );
    
    // Update total stock quantity
    const totalQuantity = inventoryLocations.reduce((sum, loc) => 
      loc.id === locationId ? sum + quantity : sum + loc.quantity, 0
    );
    handleInputChange("stockQuantity", totalQuantity);
  };

  const generatePricingRecommendations = () => {
    if (!data.costPrice) return null;

    const recommendations = [
      { 
        name: "Economy", 
        margin: 50, 
        price: data.costPrice * 1.5,
        description: "Low margin, high volume strategy"
      },
      { 
        name: "Standard", 
        margin: 100, 
        price: data.costPrice * 2,
        description: "Balanced approach"
      },
      { 
        name: "Premium", 
        margin: 150, 
        price: data.costPrice * 2.5,
        description: "High margin, premium positioning"
      },
    ];

    return recommendations;
  };

  const recommendations = generatePricingRecommendations();

  return (
    <div className="space-y-8">
      {/* Pricing Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Pricing</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Set pricing for your product across different markets
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">Profit Margin</div>
            <div className={`text-lg font-semibold ${
              profitMargin > 50 ? "text-green-600" : 
              profitMargin > 20 ? "text-yellow-600" : "text-red-600"
            }`}>
              {profitMargin.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Base Currency */}
          <div>
            <Label>Base Currency</Label>
            <select
              value={data.currency}
              onChange={(e) => handleInputChange("currency", e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3 focus:ring-brand-500/10 focus:border-brand-300 dark:focus:border-brand-800 dark:text-white"
            >
              {currencies.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol} {currency.name} ({currency.code})
                </option>
              ))}
            </select>
          </div>

          {/* Cost Price */}
          <div>
            <Label>Cost Price *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400">
                {selectedCurrency.symbol}
              </span>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                defaultValue={data.costPrice}
                onChange={(e) => handlePriceChange("costPrice", e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Base Price */}
          <div>
            <Label>Selling Price *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400">
                {selectedCurrency.symbol}
              </span>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                defaultValue={data.basePrice}
                onChange={(e) => handlePriceChange("basePrice", e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Compare Price */}
          <div>
            <Label>Compare At Price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400">
                {selectedCurrency.symbol}
              </span>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                defaultValue={data.comparePrice}
                onChange={(e) => handlePriceChange("comparePrice", e.target.value)}
                className="pl-8"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Original price to show discount percentage
            </p>
          </div>
        </div>

        {/* Pricing Recommendations */}
        {recommendations && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-900 dark:text-blue-400 mb-3">💡 Pricing Recommendations</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recommendations.map((rec, index) => (
                <button
                  key={index}
                  onClick={() => handlePriceChange("basePrice", rec.price.toString())}
                  className="text-left p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900 dark:text-white">{rec.name}</div>
                  <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {selectedCurrency.symbol}{rec.price.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{rec.description}</div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">{rec.margin}% margin</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Multi-Currency Pricing */}
        <div className="mt-6">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Multi-Currency Pricing</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currencies.filter(c => c.code !== data.currency).map(currency => (
              <div key={currency.code} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{currency.name}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {currency.symbol}{calculateMultiCurrencyPrice(data.basePrice, currency.code)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax Settings */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <Label>Tax Settings</Label>
            <Switch
              checked={data.taxable}
              onChange={(checked) => handleInputChange("taxable", checked)}
            />
          </div>
          {data.taxable && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select className="h-11 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3 focus:ring-brand-500/10 focus:border-brand-300 dark:focus:border-brand-800 dark:text-white">
                {taxRates.map(tax => (
                  <option key={tax.name} value={tax.rate}>{tax.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Inventory Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Inventory Management</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track and manage your product inventory
            </p>
          </div>
          <Switch
            checked={data.trackInventory}
            onChange={(checked) => handleInputChange("trackInventory", checked)}
          />
        </div>

        {data.trackInventory && (
          <>
            {/* Inventory Locations */}
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Inventory by Location</h4>
              <div className="space-y-3">
                {inventoryLocations.map((location) => (
                  <div key={location.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900 dark:text-white">{location.name}</div>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        defaultValue={location.quantity}
                        onChange={(e) => updateInventoryLocation(location.id, parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-16 text-right">
                      <span className={`text-sm font-medium ${
                        location.quantity > data.lowStockThreshold ? "text-green-600" :
                        location.quantity > 0 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {location.quantity > data.lowStockThreshold ? "✓" :
                         location.quantity > 0 ? "⚠️" : "❌"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stock Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Total Stock Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  defaultValue={data.stockQuantity}
                  onChange={(e) => handleInputChange("stockQuantity", parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <Label>Low Stock Threshold</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="5"
                  defaultValue={data.lowStockThreshold}
                  onChange={(e) => handleInputChange("lowStockThreshold", parseInt(e.target.value) || 5)}
                />
              </div>
            </div>

            {/* Stock Status */}
            <div className="mt-6 p-4 rounded-lg border-2 border-dashed">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">Current Stock Status</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {data.stockQuantity > data.lowStockThreshold ? 
                      "✅ Stock levels are healthy" :
                      data.stockQuantity > 0 ?
                      "⚠️ Stock levels are low" :
                      "❌ Out of stock"
                    }
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.stockQuantity}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">units available</div>
                </div>
              </div>
            </div>

            {/* Inventory Actions */}
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1">
                📊 View Stock History
              </Button>
              <Button variant="outline" className="flex-1">
                📦 Bulk Update
              </Button>
              <Button variant="outline" className="flex-1">
                🔔 Set Alerts
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Advanced Pricing Options */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Advanced Pricing</h3>
        
        <div className="space-y-4">
          {/* Bulk Pricing */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Bulk Pricing Tiers</h4>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <Input placeholder="Min quantity" />
                <Input placeholder="Max quantity" />
                <Input placeholder="Price per unit" />
              </div>
              <Button variant="outline" size="sm">+ Add Tier</Button>
            </div>
          </div>

          {/* Dynamic Pricing */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Dynamic Pricing Rules</h4>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Automatically adjust prices based on:
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">Competitor pricing</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">Demand fluctuation</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">Inventory levels</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}