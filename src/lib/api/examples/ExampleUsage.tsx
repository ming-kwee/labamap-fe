/**
 * Example Usage Components
 * Practical examples showing how to use the API integration system
 */

import React, { useState } from 'react';
import {
  useCreateProduct,
  useProducts,
  useUpdateProduct,
  useDeleteProduct,
  useMediaUpload,
  useGenerateSKU,
  useCategories,
  useBrands,
  useProductSearch,
  useBulkOperations,
} from '@/lib/api/hooks/useProducts';

// Example 1: Simple Product Creation
export function SimpleProductCreation() {
  const [name, setName] = useState('');
  const createProduct = useCreateProduct();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = await createProduct.mutate({
      name,
      description: `A great product named ${name}`,
      category: 'electronics',
      brand: 'Generic',
      sku: `SKU-${Date.now()}`,
      barcode: '1234567890123',
      status: 'draft',
      tags: ['new'],
      basePrice: 99.99,
      currency: 'USD',
      costPrice: 50,
      comparePrice: 129.99,
      taxable: true,
      trackInventory: true,
      stockQuantity: 100,
      lowStockThreshold: 10,
      images: [],
      videos: [],
      hasVariants: false,
      variantOptions: [],
      variants: [],
      weight: 1,
      dimensions: { length: 10, width: 10, height: 10 },
      shippingClass: 'standard',
      seoTitle: name,
      seoDescription: `Buy ${name} online`,
      seoKeywords: [name, 'product'],
      metaImage: '',
      channels: [],
      publishedAt: null,
      scheduledPublish: null,
      autoPublish: false,
    });

    if (result?.success) {
      alert('Product created successfully!');
      setName('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Product</h2>
      <div>
        <input
          type="text"
          placeholder="Product Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={createProduct.loading}>
        {createProduct.loading ? 'Creating...' : 'Create Product'}
      </button>
      {createProduct.error && (
        <div style={{ color: 'red' }}>Error: {createProduct.error}</div>
      )}
    </form>
  );
}

// Example 2: Product List with Search and Pagination
export function ProductListWithSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    status: 'active' as const,
  });

  const { data: products, loading, error, refetch } = useProducts(filters);
  const searchProducts = useProductSearch();
  const deleteProduct = useDeleteProduct();

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      await searchProducts.execute(query, filters);
    } else {
      refetch();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      const result = await deleteProduct.mutate(id);
      if (result?.success) {
        refetch();
      }
    }
  };

  const displayProducts = searchProducts.data?.data?.products || products?.data?.products || [];

  if (loading) return <div>Loading products...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Product Management</h2>
      
      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            handleSearch(e.target.value);
          }}
          style={{ marginRight: '10px', padding: '8px' }}
        />
        
        <select
          value={filters.status}
          onChange={(e) => setFilters(prev => ({ 
            ...prev, 
            status: e.target.value as 'active' | 'draft' | 'inactive' 
          }))}
          style={{ padding: '8px' }}
        >
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Product List */}
      <div>
        {displayProducts.map(product => (
          <div 
            key={product.id} 
            style={{ 
              border: '1px solid #ddd', 
              margin: '10px 0', 
              padding: '15px',
              borderRadius: '8px' 
            }}
          >
            <h3>{product.name}</h3>
            <p><strong>SKU:</strong> {product.sku}</p>
            <p><strong>Price:</strong> ${product.basePrice}</p>
            <p><strong>Status:</strong> {product.status}</p>
            <p><strong>Category:</strong> {product.category}</p>
            
            <div style={{ marginTop: '10px' }}>
              <button 
                onClick={() => handleDelete(product.id)}
                disabled={deleteProduct.loading}
                style={{ 
                  backgroundColor: '#dc3545', 
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {deleteProduct.loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {products?.data?.pagination && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            disabled={filters.page === 1}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
            style={{ marginRight: '10px', padding: '8px 16px' }}
          >
            Previous
          </button>
          
          <span style={{ margin: '0 10px' }}>
            Page {filters.page} of {products.data.pagination.totalPages}
          </span>
          
          <button
            disabled={!products.data.pagination.hasNext}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
            style={{ marginLeft: '10px', padding: '8px 16px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// Example 3: Advanced Product Form with Dynamic Features
export function AdvancedProductForm() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    brand: '',
    sku: '',
    basePrice: 0,
    images: [] as string[],
  });

  const createProduct = useCreateProduct();
  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const generateSKU = useGenerateSKU();
  const uploadMedia = useMediaUpload();

  const handleGenerateSKU = async () => {
    const result = await generateSKU.mutate(formData.category);
    if (result?.success && result.data) {
      setFormData(prev => ({ ...prev, sku: result.data.sku }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadMedia.mutate(file);
    if (result?.success && result.data) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, result.data.url]
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const productData = {
      ...formData,
      barcode: '1234567890123',
      status: 'draft' as const,
      tags: ['new'],
      currency: 'USD',
      costPrice: formData.basePrice * 0.6,
      comparePrice: formData.basePrice * 1.3,
      taxable: true,
      trackInventory: true,
      stockQuantity: 100,
      lowStockThreshold: 10,
      images: formData.images.map((url, index) => ({
        id: `img-${index}`,
        url,
        alt: `${formData.name} image ${index + 1}`,
        isPrimary: index === 0,
      })),
      videos: [],
      hasVariants: false,
      variantOptions: [],
      variants: [],
      weight: 1,
      dimensions: { length: 10, width: 10, height: 10 },
      shippingClass: 'standard',
      seoTitle: formData.name,
      seoDescription: formData.description,
      seoKeywords: [formData.name],
      metaImage: formData.images[0] || '',
      channels: [],
      publishedAt: null,
      scheduledPublish: null,
      autoPublish: false,
    };

    const result = await createProduct.mutate(productData);
    if (result?.success) {
      alert('Product created successfully!');
      // Reset form
      setFormData({
        name: '',
        description: '',
        category: '',
        brand: '',
        sku: '',
        basePrice: 0,
        images: [],
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Advanced Product Creation</h2>
      
      <div style={{ marginBottom: '15px' }}>
        <label>Product Name:</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Description:</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={4}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Category:</label>
        <select
          value={formData.category}
          onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
          required
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        >
          <option value="">Select Category</option>
          {categories?.data?.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Brand:</label>
        <select
          value={formData.brand}
          onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        >
          <option value="">Select Brand</option>
          {brands?.data?.map(brand => (
            <option key={brand.id} value={brand.id}>{brand.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>SKU:</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={formData.sku}
            onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
            required
            style={{ flex: 1, padding: '8px' }}
          />
          <button
            type="button"
            onClick={handleGenerateSKU}
            disabled={generateSKU.loading || !formData.category}
            style={{ padding: '8px 16px' }}
          >
            {generateSKU.loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Base Price:</label>
        <input
          type="number"
          value={formData.basePrice}
          onChange={(e) => setFormData(prev => ({ ...prev, basePrice: parseFloat(e.target.value) || 0 }))}
          min="0"
          step="0.01"
          required
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Product Images:</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
        {uploadMedia.loading && <p>Uploading...</p>}
        
        {formData.images.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <p>Uploaded Images:</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {formData.images.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Product ${index + 1}`}
                  style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <button 
        type="submit" 
        disabled={createProduct.loading}
        style={{ 
          width: '100%', 
          padding: '12px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          border: 'none',
          borderRadius: '4px',
          fontSize: '16px'
        }}
      >
        {createProduct.loading ? 'Creating Product...' : 'Create Product'}
      </button>

      {createProduct.error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          Error: {createProduct.error}
        </div>
      )}
    </form>
  );
}

// Example 4: Bulk Operations
export function BulkOperationsExample() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const { data: products } = useProducts({ limit: 50 });
  const { bulkDelete, bulkUpdate } = useBulkOperations();

  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.length === 0) return;
    
    if (confirm(`Delete ${selectedProducts.length} products?`)) {
      const result = await bulkDelete.mutate(selectedProducts);
      if (result?.success) {
        alert('Products deleted successfully!');
        setSelectedProducts([]);
      }
    }
  };

  const handleBulkStatusUpdate = async (status: 'active' | 'inactive') => {
    if (selectedProducts.length === 0) return;

    const updates = selectedProducts.map(id => ({
      id,
      data: { status }
    }));

    const result = await bulkUpdate.mutate(updates);
    if (result?.success) {
      alert(`${selectedProducts.length} products updated!`);
      setSelectedProducts([]);
    }
  };

  return (
    <div>
      <h2>Bulk Operations</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={handleBulkDelete}
          disabled={selectedProducts.length === 0 || bulkDelete.loading}
          style={{ marginRight: '10px', padding: '8px 16px', backgroundColor: '#dc3545', color: 'white' }}
        >
          {bulkDelete.loading ? 'Deleting...' : `Delete Selected (${selectedProducts.length})`}
        </button>
        
        <button
          onClick={() => handleBulkStatusUpdate('active')}
          disabled={selectedProducts.length === 0 || bulkUpdate.loading}
          style={{ marginRight: '10px', padding: '8px 16px', backgroundColor: '#28a745', color: 'white' }}
        >
          Activate Selected
        </button>
        
        <button
          onClick={() => handleBulkStatusUpdate('inactive')}
          disabled={selectedProducts.length === 0 || bulkUpdate.loading}
          style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white' }}
        >
          Deactivate Selected
        </button>
      </div>

      <div>
        {products?.data?.products.map(product => (
          <div
            key={product.id}
            style={{
              border: '1px solid #ddd',
              margin: '5px 0',
              padding: '10px',
              backgroundColor: selectedProducts.includes(product.id) ? '#e3f2fd' : 'white'
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedProducts.includes(product.id)}
                onChange={() => handleSelectProduct(product.id)}
                style={{ marginRight: '10px' }}
              />
              <div>
                <strong>{product.name}</strong>
                <br />
                SKU: {product.sku} | Status: {product.status} | Price: ${product.basePrice}
              </div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Example 5: Real-time Product Updates
export function RealTimeProductUpdates() {
  const [productId, setProductId] = useState('');
  const [updates, setUpdates] = useState({
    name: '',
    basePrice: 0,
    status: 'draft' as const,
  });

  const updateProduct = useUpdateProduct();

  const handleQuickUpdate = async (field: keyof typeof updates, value: any) => {
    if (!productId) return;

    const result = await updateProduct.mutate(productId, { [field]: value });
    if (result?.success) {
      alert(`${field} updated successfully!`);
    }
  };

  return (
    <div>
      <h2>Real-time Product Updates</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Product ID"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          style={{ padding: '8px', marginRight: '10px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Product Name:</label>
        <input
          type="text"
          value={updates.name}
          onChange={(e) => setUpdates(prev => ({ ...prev, name: e.target.value }))}
          onBlur={() => handleQuickUpdate('name', updates.name)}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Price:</label>
        <input
          type="number"
          value={updates.basePrice}
          onChange={(e) => setUpdates(prev => ({ ...prev, basePrice: parseFloat(e.target.value) || 0 }))}
          onBlur={() => handleQuickUpdate('basePrice', updates.basePrice)}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Status:</label>
        <select
          value={updates.status}
          onChange={(e) => {
            const status = e.target.value as 'draft' | 'active' | 'inactive';
            setUpdates(prev => ({ ...prev, status }));
            handleQuickUpdate('status', status);
          }}
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {updateProduct.loading && <p>Updating...</p>}
      {updateProduct.error && <p style={{ color: 'red' }}>Error: {updateProduct.error}</p>}
    </div>
  );
}

// Main example component that demonstrates all features
export function CompleteAPIExamples() {
  const [activeExample, setActiveExample] = useState<string>('simple');

  const examples = {
    simple: SimpleProductCreation,
    list: ProductListWithSearch,
    advanced: AdvancedProductForm,
    bulk: BulkOperationsExample,
    realtime: RealTimeProductUpdates,
  };

  const ExampleComponent = examples[activeExample as keyof typeof examples];

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>API Integration Examples</h1>
      
      <nav style={{ marginBottom: '30px' }}>
        <button
          onClick={() => setActiveExample('simple')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: activeExample === 'simple' ? '#007bff' : '#f8f9fa',
            color: activeExample === 'simple' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Simple Creation
        </button>
        
        <button
          onClick={() => setActiveExample('list')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: activeExample === 'list' ? '#007bff' : '#f8f9fa',
            color: activeExample === 'list' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Product List
        </button>
        
        <button
          onClick={() => setActiveExample('advanced')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: activeExample === 'advanced' ? '#007bff' : '#f8f9fa',
            color: activeExample === 'advanced' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Advanced Form
        </button>
        
        <button
          onClick={() => setActiveExample('bulk')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: activeExample === 'bulk' ? '#007bff' : '#f8f9fa',
            color: activeExample === 'bulk' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Bulk Operations
        </button>
        
        <button
          onClick={() => setActiveExample('realtime')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeExample === 'realtime' ? '#007bff' : '#f8f9fa',
            color: activeExample === 'realtime' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Real-time Updates
        </button>
      </nav>

      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
        <ExampleComponent />
      </div>
    </div>
  );
}