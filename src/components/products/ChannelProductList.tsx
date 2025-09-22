"use client";
import React, { useState, useEffect } from "react";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "./ProductCreateForm";
import ChannelProductEditModal from "./ChannelProductEditModal";

interface ChannelProduct {
  id: string;
  masterProductId: string;
  channelId: string;
  channelName: string;
  channelIcon: string;
  storeId: string;
  storeName: string;
  
  // Product Details
  title: string;
  sku: string;
  barcode: string;
  description: string;
  
  // Pricing
  price: number;
  comparePrice: number;
  costPrice: number;
  currency: string;
  
  // Inventory
  stock: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  
  // Status & Sync
  isActive: boolean;
  lastSynced: Date | null;
  syncStatus: 'pending' | 'synced' | 'error' | 'manual';
  syncErrors: string[];
  
  // Channel-specific data
  visibility: boolean;
  tags: string[];
  customFields: Record<string, any>;
  
  // Product Image
  imageUrl: string;
}

interface ColumnConfig {
  key: string;
  label: string;
  width: number;
  visible: boolean;
  editable: boolean;
  type: 'text' | 'number' | 'boolean' | 'select' | 'price';
}

interface ChannelProductListProps {
  masterProducts: ProductData[];
  onProductUpdate: (productId: string, updates: Partial<ChannelProduct>) => void;
  onBulkSync: (productIds: string[]) => Promise<void>;
  onBulkUpdate: (productIds: string[], updates: Partial<ChannelProduct>) => void;
}

const defaultColumns: ColumnConfig[] = [
  { key: 'select', label: '', width: 50, visible: true, editable: false, type: 'boolean' },
  { key: 'image', label: 'Image', width: 60, visible: true, editable: false, type: 'text' },
  { key: 'title', label: 'Product Title', width: 200, visible: true, editable: true, type: 'text' },
  { key: 'sku', label: 'SKU', width: 120, visible: true, editable: true, type: 'text' },
  { key: 'channel', label: 'Channel', width: 120, visible: true, editable: false, type: 'text' },
  { key: 'store', label: 'Store', width: 120, visible: true, editable: false, type: 'text' },
  { key: 'price', label: 'Price', width: 100, visible: true, editable: true, type: 'price' },
  { key: 'comparePrice', label: 'Compare Price', width: 120, visible: true, editable: true, type: 'price' },
  { key: 'stock', label: 'Stock', width: 80, visible: true, editable: true, type: 'number' },
  { key: 'status', label: 'Status', width: 80, visible: true, editable: true, type: 'boolean' },
  { key: 'syncStatus', label: 'Sync', width: 100, visible: true, editable: false, type: 'select' },
  { key: 'lastSynced', label: 'Last Synced', width: 120, visible: true, editable: false, type: 'text' },
  { key: 'actions', label: 'Actions', width: 140, visible: true, editable: false, type: 'text' },
];

// Mock data generator
const generateMockChannelProducts = (masterProducts: ProductData[]): ChannelProduct[] => {
  const channels = [
    { id: 'shopify', name: 'Shopify', icon: '🛍️' },
    { id: 'amazon', name: 'Amazon', icon: '📦' },
    { id: 'shopee', name: 'Shopee', icon: '🛒' },
    { id: 'lazada', name: 'Lazada', icon: '🏪' },
    { id: 'tokopedia', name: 'Tokopedia', icon: '🛵' },
    { id: 'facebook', name: 'Facebook', icon: '📘' },
  ];

  const stores = [
    'Main Store', 'Premium Store', 'Outlet Store', 'International Store'
  ];

  const products: ChannelProduct[] = [];

  masterProducts.slice(0, 3).forEach((master, masterIndex) => {
    channels.forEach((channel, channelIndex) => {
      if (Math.random() > 0.3) { // Not all products on all channels
        const store = stores[Math.floor(Math.random() * stores.length)];
        const syncStatuses: ChannelProduct['syncStatus'][] = ['synced', 'pending', 'error', 'manual'];
        
        products.push({
          id: `${master.masterAttributes.id || `master-${masterIndex}`}-${channel.id}-${store.replace(' ', '-')}`,
          masterProductId: master.masterAttributes.id || `master-${masterIndex}`,
          channelId: channel.id,
          channelName: channel.name,
          channelIcon: channel.icon,
          storeId: store.replace(' ', '-'),
          storeName: store,
          
          title: `${master.masterAttributes.product_name} - ${channel.name}`,
          sku: `${master.masterAttributes.sku}-${channel.id.toUpperCase()}`,
          barcode: master.masterAttributes.barcode || `${channelIndex}${masterIndex}123456789`,
          description: master.masterAttributes.description,
          
          price: master.masterAttributes.basePrice * (0.8 + Math.random() * 0.4), // Vary prices per channel
          comparePrice: master.masterAttributes.comparePrice * (0.8 + Math.random() * 0.4),
          costPrice: master.masterAttributes.costPrice * (0.8 + Math.random() * 0.4),
          currency: master.masterAttributes.currency,
          
          stock: Math.floor(master.masterAttributes.stockQuantity * (0.3 + Math.random() * 0.7)),
          lowStockThreshold: master.masterAttributes.lowStockThreshold,
          trackInventory: master.masterAttributes.trackInventory,
          
          isActive: Math.random() > 0.2, // Most products active
          lastSynced: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null,
          syncStatus: syncStatuses[Math.floor(Math.random() * syncStatuses.length)],
          syncErrors: Math.random() > 0.8 ? ['Price validation failed', 'Image missing'] : [],
          
          visibility: Math.random() > 0.2,
          tags: master.masterAttributes.tags.slice(0, 2),
          customFields: {},
          
          imageUrl: master.masterAttributes.product_images?.[0]?.src || '/images/products/placeholder.jpg',
        });
      }
    });
  });

  return products;
};

export default function ChannelProductList({ 
  masterProducts, 
  onProductUpdate, 
  onBulkSync,
  onBulkUpdate 
}: ChannelProductListProps) {
  const [products, setProducts] = useState<ChannelProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ChannelProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [columns] = useState<ColumnConfig[]>(defaultColumns);
  const [editingCell, setEditingCell] = useState<{productId: string, field: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [sortConfig, setSortConfig] = useState<{field: string, direction: 'asc' | 'desc'} | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<ChannelProduct | null>(null);

  // Initialize products
  useEffect(() => {
    const mockProducts = generateMockChannelProducts(masterProducts);
    setProducts(mockProducts);
    setFilteredProducts(mockProducts);
  }, [masterProducts]);

  // Filter and search products
  useEffect(() => {
    let filtered = products;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(product => 
        product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.channelName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Channel filter
    if (channelFilter !== 'all') {
      filtered = filtered.filter(product => product.channelId === channelFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(product => {
        switch (statusFilter) {
          case 'active': return product.isActive;
          case 'inactive': return !product.isActive;
          case 'synced': return product.syncStatus === 'synced';
          case 'error': return product.syncStatus === 'error';
          case 'pending': return product.syncStatus === 'pending';
          default: return true;
        }
      });
    }

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.field as keyof ChannelProduct];
        const bVal = b[sortConfig.field as keyof ChannelProduct];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortConfig.direction === 'asc' ? -1 : 1;
        if (bVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredProducts(filtered);
  }, [products, searchTerm, channelFilter, statusFilter, sortConfig]);

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev?.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleCellEdit = (productId: string, field: string, value: any) => {
    setProducts(prev => prev.map(product => 
      product.id === productId 
        ? { ...product, [field]: value, syncStatus: 'manual' as const }
        : product
    ));
    onProductUpdate(productId, { [field]: value });
    setEditingCell(null);
  };

  const handleBulkSync = async () => {
    const selectedIds = Array.from(selectedProducts);
    if (selectedIds.length === 0) return;
    
    await onBulkSync(selectedIds);
    
    // Update sync status optimistically
    setProducts(prev => prev.map(product => 
      selectedIds.includes(product.id)
        ? { ...product, syncStatus: 'synced' as const, lastSynced: new Date() }
        : product
    ));
  };

  const handleBulkPriceUpdate = (percentage: number) => {
    const selectedIds = Array.from(selectedProducts);
    if (selectedIds.length === 0) return;

    const updates = {
      price: undefined as number | undefined
    };

    setProducts(prev => prev.map(product => {
      if (selectedIds.includes(product.id)) {
        const newPrice = product.price * (1 + percentage / 100);
        updates.price = newPrice;
        return { ...product, price: newPrice, syncStatus: 'manual' as const };
      }
      return product;
    }));

    onBulkUpdate(selectedIds, updates);
  };

  const handleEditProduct = (product: ChannelProduct) => {
    setSelectedProductForEdit(product);
    setEditModalOpen(true);
  };

  const handleSaveProduct = (productId: string, updates: Partial<ChannelProduct>) => {
    setProducts(prev => prev.map(product => 
      product.id === productId 
        ? { ...product, ...updates, syncStatus: 'manual' as const }
        : product
    ));
    onProductUpdate(productId, updates);
    setEditModalOpen(false);
    setSelectedProductForEdit(null);
  };

  const getSyncStatusIcon = (status: ChannelProduct['syncStatus']) => {
    switch (status) {
      case 'synced': return '✅';
      case 'pending': return '⏳';
      case 'error': return '❌';
      case 'manual': return '✋';
      default: return '❓';
    }
  };

  const renderEditableCell = (product: ChannelProduct, column: ColumnConfig): React.ReactNode => {
    const isEditing = editingCell?.productId === product.id && editingCell?.field === column.key;
    const value = product[column.key as keyof ChannelProduct];

    if (!column.editable) {
      return renderReadOnlyCell(product, column);
    }

    if (isEditing) {
      return (
        <div className="p-1">
          {column.type === 'boolean' ? (
            <Switch
              label=""
              defaultChecked={Boolean(value)}
              onChange={(checked) => handleCellEdit(product.id, column.key, checked)}
            />
          ) : (
            <input
              type={column.type === 'number' || column.type === 'price' ? 'number' : 'text'}
              defaultValue={String(value)}
              className="h-7 w-full rounded-md border border-gray-300 px-2 py-1 text-theme-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                const newValue = column.type === 'number' || column.type === 'price' 
                  ? parseFloat(e.target.value) || 0 
                  : e.target.value;
                handleCellEdit(product.id, column.key, newValue);
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  const newValue = column.type === 'number' || column.type === 'price' 
                    ? parseFloat(e.currentTarget.value) || 0 
                    : e.currentTarget.value;
                  handleCellEdit(product.id, column.key, newValue);
                }
              }}
              autoFocus
            />
          )}
        </div>
      );
    }

    return (
      <div
        className="p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[32px] flex items-center"
        onClick={() => setEditingCell({ productId: product.id, field: column.key })}
      >
        {column.type === 'boolean' ? (
          <span className={`px-2 py-1 text-theme-xs rounded-full ${
            value ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}>
            {value ? 'Active' : 'Inactive'}
          </span>
        ) : column.type === 'price' ? (
          <span className="font-medium text-theme-sm">
            {product.currency} {Number(value).toFixed(2)}
          </span>
        ) : (
          <span className="text-theme-sm">{String(value)}</span>
        )}
      </div>
    );
  };

  const renderReadOnlyCell = (product: ChannelProduct, column: ColumnConfig): React.ReactNode => {
    switch (column.key) {
      case 'select':
        return (
          <div className="flex justify-center">
            <input
              type="checkbox"
              checked={selectedProducts.has(product.id)}
              onChange={() => handleSelectProduct(product.id)}
              className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
            />
          </div>
        );
        
      case 'image':
        return (
          <div className="flex justify-center">
            <img
              src={product.imageUrl}
              alt={product.title}
              className="w-10 h-10 object-cover rounded border border-gray-200 dark:border-gray-700"
            />
          </div>
        );
        
      case 'channel':
        return (
          <div className="flex items-center gap-2 p-2">
            <span className="text-title-md">{product.channelIcon}</span>
            <span className="text-theme-sm font-medium">{product.channelName}</span>
          </div>
        );
        
      case 'store':
        return (
          <div className="p-2">
            <span className="text-theme-sm">{product.storeName}</span>
          </div>
        );
        
      case 'syncStatus':
        return (
          <div className="p-2">
            <div className="flex items-center gap-2">
              <span className="text-title-md">{getSyncStatusIcon(product.syncStatus)}</span>
              <span className={`text-theme-xs px-2 py-1 rounded-full ${
                product.syncStatus === 'synced' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                product.syncStatus === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                product.syncStatus === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              }`}>
                {product.syncStatus}
              </span>
            </div>
            {product.syncErrors.length > 0 && (
              <div className="text-theme-xs text-red-600 dark:text-red-400 mt-1">
                {product.syncErrors[0]}
              </div>
            )}
          </div>
        );
        
      case 'lastSynced':
        return (
          <div className="p-2">
            <span className="text-theme-xs text-gray-500 dark:text-gray-400">
              {product.lastSynced ? product.lastSynced.toLocaleDateString() : 'Never'}
            </span>
          </div>
        );
        
      case 'actions':
        return (
          <div className="flex gap-1 p-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleEditProduct(product)}
              className="text-theme-xs px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              Edit
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onBulkSync([product.id])}
              className="text-theme-xs px-2 py-1 hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              Sync
            </Button>
          </div>
        );
        
      default:
        return renderEditableCell(product, column);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white">Channel Product List</h2>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage products across all sales channels from one interface
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={() => setBulkEditMode(!bulkEditMode)} variant="outline">
              {bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
            </Button>
            <Button onClick={handleBulkSync} disabled={selectedProducts.size === 0}>
              Sync Selected ({selectedProducts.size})
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <Label>Search Products</Label>
            <input
              type="text"
              placeholder="Search by title, SKU, or channel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          
          <div>
            <Label>Channel</Label>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="all">All Channels</option>
              <option value="shopify">Shopify</option>
              <option value="amazon">Amazon</option>
              <option value="shopee">Shopee</option>
              <option value="lazada">Lazada</option>
              <option value="tokopedia">Tokopedia</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>
          
          <div>
            <Label>Status</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="synced">Synced</option>
              <option value="error">Error</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <Button variant="outline" className="w-full">
              Export Data
            </Button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedProducts.size > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-theme-sm text-blue-900 dark:text-blue-200">
                {selectedProducts.size} products selected
              </span>
              
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleBulkPriceUpdate(10)} variant="outline">
                  +10% Price
                </Button>
                <Button size="sm" onClick={() => handleBulkPriceUpdate(-10)} variant="outline">
                  -10% Price
                </Button>
                <Button size="sm" onClick={handleBulkSync}>
                  Bulk Sync
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Grid */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {columns.filter(col => col.visible).map((column) => (
                  <th
                    key={column.key}
                    style={{ width: column.width }}
                    className="px-2 py-3 text-left text-theme-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => column.key !== 'select' && column.key !== 'image' && column.key !== 'actions' && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-2">
                      {column.key === 'select' ? (
                        <input
                          type="checkbox"
                          checked={filteredProducts.length > 0 && selectedProducts.size === filteredProducts.length}
                          onChange={handleSelectAll}
                          className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                        />
                      ) : (
                        <>
                          {column.label}
                          {sortConfig?.field === column.key && (
                            <span className="text-brand-500">
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  {columns.filter(col => col.visible).map((column) => (
                    <td
                      key={`${product.id}-${column.key}`}
                      style={{ width: column.width }}
                      className="border-gray-200 dark:border-gray-700"
                    >
                      {renderReadOnlyCell(product, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-title-md font-medium text-gray-900 dark:text-white mb-2">
              No products found
            </h3>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              Try adjusting your filters or search terms
            </p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {filteredProducts.length}
            </div>
            <div className="text-theme-sm text-gray-500 dark:text-gray-400">Total Products</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {filteredProducts.filter(p => p.syncStatus === 'synced').length}
            </div>
            <div className="text-theme-sm text-gray-500 dark:text-gray-400">Synced</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {filteredProducts.filter(p => p.syncStatus === 'pending').length}
            </div>
            <div className="text-theme-sm text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {filteredProducts.filter(p => p.syncStatus === 'error').length}
            </div>
            <div className="text-theme-sm text-gray-500 dark:text-gray-400">Errors</div>
          </div>
        </div>
      </div>

      {/* Channel Product Edit Modal */}
      <ChannelProductEditModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedProductForEdit(null);
        }}
        product={selectedProductForEdit}
        onSave={handleSaveProduct}
      />
    </div>
  );
}