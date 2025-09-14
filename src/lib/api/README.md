# Centralized API Integration System

A complete, centralized utility system for communicating with backend OpenAPI endpoints. This system provides a robust, type-safe, and easy-to-understand API integration for the product management system.

## 🚀 Features

- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Centralized Configuration**: Single source of truth for all API endpoints
- **Error Handling**: Built-in error handling with retry logic
- **Loading States**: Automatic loading state management
- **React Hooks**: Ready-to-use React hooks for common operations
- **Validation**: Client-side validation before API calls
- **Caching**: Built-in response caching capabilities
- **Retry Logic**: Automatic retry for failed requests
- **OpenAPI Compatible**: Designed to work with OpenAPI specifications

## 📁 Project Structure

```
src/lib/api/
├── README.md              # This documentation
├── config.ts              # API configuration and endpoints
├── types.ts               # TypeScript type definitions
├── client.ts              # Core HTTP client
├── hooks/
│   ├── useApi.ts          # Generic API hooks
│   └── useProducts.ts     # Product-specific hooks
└── services/
    ├── index.ts           # Service exports
    ├── productService.ts  # Product CRUD operations
    ├── categoryService.ts # Category operations
    └── brandService.ts    # Brand operations
```

## 🛠️ Setup

### 1. Environment Configuration

Create or update your `.env.local` file:

```env
# API Configuration
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com/v1
NEXT_PUBLIC_OPENAPI_SCHEMA_URL=https://your-api-domain.com/openapi.json

# Optional: API Authentication
NEXT_PUBLIC_API_KEY=your-api-key
```

### 2. Authentication Setup (Optional)

If your API requires authentication, set the token:

```typescript
import { apiClient } from '@/lib/api/client';

// Set authentication token
apiClient.setAuthToken('your-jwt-token');

// Remove authentication token
apiClient.removeAuthToken();
```

## 🔧 Basic Usage

### Using Service Classes Directly

```typescript
import { productService } from '@/lib/api/services';

// Create a product
const createProduct = async () => {
  const response = await productService.createProduct({
    name: "New Product",
    description: "Product description",
    category: "electronics",
    brand: "Apple",
    sku: "PROD-001",
    barcode: "1234567890123",
    status: "draft",
    tags: ["new", "featured"],
    basePrice: 99.99,
    currency: "USD",
    // ... other fields
  });

  if (response.success) {
    console.log('Product created:', response.data);
  } else {
    console.error('Error:', response.error?.message);
  }
};
```

### Using React Hooks (Recommended)

```typescript
import { useCreateProduct, useProducts } from '@/lib/api/hooks/useProducts';

function ProductManagement() {
  // Create product hook
  const createProduct = useCreateProduct();
  
  // Fetch products hook
  const { data: products, loading, error, refetch } = useProducts({
    page: 1,
    limit: 10,
    status: 'active'
  });

  const handleCreateProduct = async () => {
    const result = await createProduct.mutate({
      name: "New Product",
      description: "Product description",
      // ... other fields
    });

    if (result?.success) {
      refetch(); // Refresh the products list
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <button 
        onClick={handleCreateProduct}
        disabled={createProduct.loading}
      >
        {createProduct.loading ? 'Creating...' : 'Create Product'}
      </button>
      
      {products?.data?.products.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
}
```

## 📚 API Reference

### Core Services

#### ProductService

```typescript
// CRUD Operations
productService.createProduct(productData)
productService.getProduct(id)
productService.updateProduct(id, updates)
productService.deleteProduct(id)
productService.getProducts(filters)

// Advanced Operations
productService.searchProducts(query, filters)
productService.uploadMedia(file, productId, alt)
productService.generateSKU(category)
productService.generateBarcode()
productService.generateContent(productName, category)
productService.syncToChannels(productId, channels, mapping)
productService.getAnalytics(productId, period)

// Bulk Operations
productService.bulkCreate(products)
productService.bulkUpdate(updates)
productService.bulkDelete(ids)
productService.importProducts(file, mapping)
productService.exportProducts(filters, format)

// Utility Operations
productService.duplicateProduct(id, newName)
productService.archiveProduct(id)
productService.restoreProduct(id)
productService.checkNameAvailability(name, excludeId)
productService.checkSKUAvailability(sku, excludeId)
```

#### CategoryService & BrandService

```typescript
// Category operations
categoryService.getCategories()
categoryService.getCategory(id)
categoryService.createCategory(category)
categoryService.updateCategory(id, updates)
categoryService.deleteCategory(id)

// Brand operations (same pattern)
brandService.getBrands()
brandService.getBrand(id)
brandService.createBrand(brand)
brandService.updateBrand(id, updates)
brandService.deleteBrand(id)
```

### React Hooks

#### Product Hooks

```typescript
// Mutations
useCreateProduct()        // Create new product
useUpdateProduct()        // Update existing product
useDeleteProduct()        // Delete product
useMediaUpload()          // Upload media files
useGenerateSKU()          // Generate SKU
useGenerateBarcode()      // Generate barcode
useGenerateContent()      // AI content generation
useChannelSync()          // Sync to channels

// Queries
useProduct(id)            // Fetch single product
useProducts(filters)      // Fetch products list
useProductSearch()        // Search products
useProductAnalytics(id, period) // Get analytics

// Utilities
useCategories()           // Fetch categories
useBrands()              // Fetch brands
useBulkOperations()      // Bulk operations
useProductImportExport() // Import/export
useAvailabilityCheck()   // Check name/SKU availability
```

#### Generic Hooks

```typescript
// Generic API hook
const { data, loading, error, execute } = useApi(apiFunction, options);

// Mutation hook
const { data, loading, error, mutate } = useMutation(apiFunction, options);

// Query hook with auto-execution
const { data, loading, error, refetch } = useQuery(apiFunction, args, options);

// Infinite scroll/pagination
const { data, loading, hasMore, loadMore } = useInfiniteQuery(apiFunction, args, options);
```

## 🎯 Real-World Examples

### Complete Product Creation Form

```typescript
import React, { useState } from 'react';
import { 
  useCreateProduct, 
  useCategories, 
  useBrands,
  useGenerateSKU,
  useMediaUpload 
} from '@/lib/api/hooks/useProducts';

function ProductCreateForm() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    brand: '',
    basePrice: 0,
    // ... other fields
  });

  // API hooks
  const createProduct = useCreateProduct();
  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const generateSKU = useGenerateSKU();
  const uploadMedia = useMediaUpload();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const result = await createProduct.mutate(formData);
    
    if (result?.success) {
      alert('Product created successfully!');
      // Reset form or redirect
    }
  };

  const handleGenerateSKU = async () => {
    const result = await generateSKU.mutate(formData.category);
    if (result?.success) {
      setFormData(prev => ({ ...prev, sku: result.data.sku }));
    }
  };

  const handleFileUpload = async (file) => {
    const result = await uploadMedia.mutate(file);
    if (result?.success) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, result.data]
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Product Name"
        value={formData.name}
        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        required
      />
      
      <select
        value={formData.category}
        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
        required
      >
        <option value="">Select Category</option>
        {categories?.data?.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>

      <div>
        <input
          type="text"
          placeholder="SKU"
          value={formData.sku}
          onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
          required
        />
        <button 
          type="button" 
          onClick={handleGenerateSKU}
          disabled={generateSKU.loading}
        >
          {generateSKU.loading ? 'Generating...' : 'Generate SKU'}
        </button>
      </div>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
      />

      <button 
        type="submit" 
        disabled={createProduct.loading}
      >
        {createProduct.loading ? 'Creating...' : 'Create Product'}
      </button>

      {createProduct.error && (
        <div style={{ color: 'red' }}>
          Error: {createProduct.error}
        </div>
      )}
    </form>
  );
}
```

### Product List with Search and Filters

```typescript
import React, { useState } from 'react';
import { useProducts, useProductSearch, useDeleteProduct } from '@/lib/api/hooks/useProducts';

function ProductList() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    status: 'active',
    category: '',
    search: ''
  });

  const { data: products, loading, error, refetch } = useProducts(filters);
  const searchProducts = useProductSearch();
  const deleteProduct = useDeleteProduct();

  const handleSearch = async (query) => {
    if (query) {
      await searchProducts.execute(query, { status: filters.status });
    } else {
      refetch();
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure?')) {
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
      <input
        type="text"
        placeholder="Search products..."
        onChange={(e) => handleSearch(e.target.value)}
      />

      <select
        value={filters.status}
        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
      >
        <option value="active">Active</option>
        <option value="draft">Draft</option>
        <option value="inactive">Inactive</option>
      </select>

      <div>
        {displayProducts.map(product => (
          <div key={product.id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
            <h3>{product.name}</h3>
            <p>SKU: {product.sku}</p>
            <p>Price: ${product.basePrice}</p>
            <p>Status: {product.status}</p>
            
            <button onClick={() => handleDelete(product.id)}>
              {deleteProduct.loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        ))}
      </div>

      {products?.data?.pagination && (
        <div>
          <button
            disabled={filters.page === 1}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            Previous
          </button>
          
          <span> Page {filters.page} of {products.data.pagination.totalPages} </span>
          
          <button
            disabled={!products.data.pagination.hasNext}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

## ⚙️ Configuration Options

### API Client Configuration

```typescript
// config.ts
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.example.com/v1',
  TIMEOUT: 30000, // 30 seconds
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  // Add your endpoints here
  ENDPOINTS: {
    PRODUCTS: '/products',
    CATEGORIES: '/categories',
    // ... more endpoints
  }
};
```

### Hook Options

```typescript
const options = {
  immediate: true,        // Execute immediately on mount
  onSuccess: (data) => {}, // Success callback
  onError: (error) => {}, // Error callback
  retryAttempts: 3,       // Number of retry attempts
  retryDelay: 1000,       // Delay between retries (ms)
};

const { data, loading, error } = useApi(apiFunction, options);
```

## 🔒 Error Handling

The system provides comprehensive error handling:

```typescript
// API Response structure
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    field?: string; // For validation errors
  };
  meta?: {
    pagination?: Pagination;
    total?: number;
    timestamp?: string;
  };
}

// Error handling in components
const { data, loading, error } = useProducts();

if (error) {
  // Handle different error types
  if (error.includes('Network')) {
    return <div>Network error. Please check your connection.</div>;
  }
  if (error.includes('401')) {
    return <div>Please log in to continue.</div>;
  }
  return <div>An error occurred: {error}</div>;
}
```

## 🚨 Common Issues and Solutions

### 1. CORS Issues
```typescript
// Add to your API server configuration
headers: {
  'Access-Control-Allow-Origin': 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}
```

### 2. Authentication Token Expiry
```typescript
// Set up automatic token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Refresh token and retry
      const newToken = await refreshAuthToken();
      apiClient.setAuthToken(newToken);
      return apiClient.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

### 3. Type Safety
```typescript
// Extend ProductData interface for your specific needs
interface ExtendedProductData extends ProductData {
  customField: string;
  nestedObject: {
    field1: string;
    field2: number;
  };
}

// Use with type safety
const { data, loading } = useQuery<ExtendedProductData>(...);
```

## 📈 Performance Optimization

### 1. Request Batching
```typescript
// Batch multiple API calls
const [products, categories, brands] = await Promise.all([
  productService.getProducts(),
  categoryService.getCategories(),
  brandService.getBrands(),
]);
```

### 2. Caching
```typescript
// Implement caching in your hooks
const useProductsWithCache = (filters) => {
  const cacheKey = JSON.stringify(filters);
  const cachedData = getFromCache(cacheKey);
  
  const { data, loading, error } = useProducts(filters);
  
  useEffect(() => {
    if (data && !loading) {
      setCache(cacheKey, data);
    }
  }, [data, loading, cacheKey]);
  
  return {
    data: data || cachedData,
    loading: loading && !cachedData,
    error
  };
};
```

### 3. Debounced Search
```typescript
import { useMemo } from 'react';
import { debounce } from 'lodash';

const useDebounceSearch = () => {
  const searchProducts = useProductSearch();
  
  const debouncedSearch = useMemo(
    () => debounce((query) => {
      searchProducts.execute(query);
    }, 300),
    [searchProducts]
  );
  
  return debouncedSearch;
};
```

## 🧪 Testing

### Unit Testing Services
```typescript
import { productService } from '@/lib/api/services';

// Mock the API client
jest.mock('@/lib/api/client');

describe('ProductService', () => {
  it('should create a product', async () => {
    const mockProduct = { name: 'Test Product' };
    const response = await productService.createProduct(mockProduct);
    
    expect(response.success).toBe(true);
    expect(response.data).toEqual(expect.objectContaining(mockProduct));
  });
});
```

### Testing Hooks
```typescript
import { renderHook, act } from '@testing-library/react';
import { useCreateProduct } from '@/lib/api/hooks/useProducts';

describe('useCreateProduct', () => {
  it('should create a product', async () => {
    const { result } = renderHook(() => useCreateProduct());
    
    await act(async () => {
      await result.current.mutate({ name: 'Test Product' });
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeDefined();
  });
});
```

## 🔄 Migration Guide

### From Direct Fetch to API System

**Before:**
```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

const createProduct = async (data) => {
  setLoading(true);
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    setLoading(false);
    return result;
  } catch (err) {
    setError(err.message);
    setLoading(false);
  }
};
```

**After:**
```typescript
import { useCreateProduct } from '@/lib/api/hooks/useProducts';

const createProduct = useCreateProduct();

// Usage
await createProduct.mutate(data);
// Loading: createProduct.loading
// Error: createProduct.error
// Data: createProduct.data
```

This centralized API system provides a robust, scalable, and maintainable foundation for all your API communications. It's designed to grow with your application and can be easily extended for additional functionality.