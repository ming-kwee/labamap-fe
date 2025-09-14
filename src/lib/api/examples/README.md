# ExampleUsage Components - Step-by-Step Guide

This guide explains how to use the `ExampleUsage.tsx` components to learn and implement the API integration system.

## 🚀 Quick Start

### Step 1: Import and Use

```tsx
// Import all examples in a tabbed interface
import { CompleteAPIExamples } from '@/lib/api/examples/ExampleUsage';

export default function TestPage() {
  return <CompleteAPIExamples />;
}
```

OR import individual examples:

```tsx
import { 
  SimpleProductCreation,
  ProductListWithSearch,
  AdvancedProductForm 
} from '@/lib/api/examples/ExampleUsage';
```

## 📚 Available Examples

### 1. SimpleProductCreation
**What it does**: Basic product creation with minimal fields

**How to use**:
```tsx
<SimpleProductCreation />
```

**What you'll learn**:
- Using `useCreateProduct()` hook
- Basic form handling with loading states
- Error handling

**Try this**:
1. Enter a product name
2. Click "Create Product"
3. Watch loading state and feedback

### 2. ProductListWithSearch
**What it does**: Product list with search, filters, and pagination

**How to use**:
```tsx
<ProductListWithSearch />
```

**What you'll learn**:
- Fetching products with `useProducts()`
- Search with `useProductSearch()`
- Pagination handling
- Delete operations

**Try this**:
1. View the product list
2. Search for products
3. Filter by status
4. Navigate pages
5. Delete products

### 3. AdvancedProductForm
**What it does**: Full-featured product form with all capabilities

**How to use**:
```tsx
<AdvancedProductForm />
```

**What you'll learn**:
- Working with categories/brands
- File upload with `useMediaUpload()`
- SKU generation
- Complex form management

**Try this**:
1. Fill out all form fields
2. Select from dropdowns
3. Generate SKU automatically
4. Upload images
5. Submit complete form

### 4. BulkOperationsExample
**What it does**: Bulk operations on multiple products

**How to use**:
```tsx
<BulkOperationsExample />
```

**What you'll learn**:
- Using `useBulkOperations()`
- Selecting multiple items
- Batch processing

**Try this**:
1. Select multiple products
2. Bulk delete selected items
3. Bulk update status

### 5. RealTimeProductUpdates
**What it does**: Real-time product updates

**How to use**:
```tsx
<RealTimeProductUpdates />
```

**What you'll learn**:
- Using `useUpdateProduct()`
- Real-time form updates
- Immediate API calls

**Try this**:
1. Enter a product ID
2. Update fields and see changes happen instantly

## 🛠️ Step-by-Step Implementation

### Example 1: Create Your First Product Form

```tsx
// 1. Import the hook
import { useCreateProduct } from '@/lib/api/hooks/useProducts';

// 2. Create component
function MyProductForm() {
  // 3. Use the hook
  const createProduct = useCreateProduct();
  
  // 4. Form state
  const [name, setName] = useState('');
  
  // 5. Handle submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const result = await createProduct.mutate({
      name,
      description: `Great product: ${name}`,
      // ... other required fields
    });
    
    if (result?.success) {
      alert('Product created!');
      setName('');
    }
  };
  
  // 6. Render form
  return (
    <form onSubmit={handleSubmit}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Product Name"
        required
      />
      <button 
        type="submit" 
        disabled={createProduct.loading}
      >
        {createProduct.loading ? 'Creating...' : 'Create'}
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

### Example 2: Display Product List

```tsx
import { useProducts } from '@/lib/api/hooks/useProducts';

function ProductList() {
  // 1. Fetch products
  const { data: products, loading, error } = useProducts({
    page: 1,
    limit: 10,
    status: 'active'
  });
  
  // 2. Handle loading
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  // 3. Display products
  return (
    <div>
      <h2>Products</h2>
      {products?.data?.products?.map(product => (
        <div key={product.id}>
          <h3>{product.name}</h3>
          <p>Price: ${product.basePrice}</p>
          <p>Status: {product.status}</p>
        </div>
      ))}
    </div>
  );
}
```

### Example 3: Add Search Functionality

```tsx
import { useProductSearch } from '@/lib/api/hooks/useProducts';

function SearchableProductList() {
  const [searchTerm, setSearchTerm] = useState('');
  const searchProducts = useProductSearch();
  
  const handleSearch = async (query) => {
    if (query.trim()) {
      await searchProducts.execute(query);
    }
  };
  
  return (
    <div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          handleSearch(e.target.value);
        }}
        placeholder="Search products..."
      />
      
      {searchProducts.loading && <div>Searching...</div>}
      
      {searchProducts.data?.data?.products?.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
}
```

## 🎯 Common Patterns

### Pattern 1: Form with Validation

```tsx
function ValidatedForm() {
  const createProduct = useCreateProduct();
  const [formData, setFormData] = useState({
    name: '',
    price: 0
  });
  
  const validate = () => {
    if (!formData.name.trim()) return 'Name is required';
    if (formData.price <= 0) return 'Price must be > 0';
    return null;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const error = validate();
    if (error) {
      alert(error);
      return;
    }
    
    await createProduct.mutate(formData);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
    </form>
  );
}
```

### Pattern 2: Loading States

```tsx
function LoadingExample() {
  const { data, loading, error } = useProducts();
  
  return (
    <div>
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div>Loading products...</div>
          <div>Please wait...</div>
        </div>
      )}
      
      {error && (
        <div style={{ color: 'red', padding: '10px' }}>
          Failed to load products: {error}
        </div>
      )}
      
      {data && (
        <div>
          {/* Display products */}
        </div>
      )}
    </div>
  );
}
```

### Pattern 3: Real-time Updates

```tsx
function RealTimeForm() {
  const updateProduct = useUpdateProduct();
  const [productId, setProductId] = useState('');
  
  const handleFieldUpdate = async (field, value) => {
    if (!productId) return;
    
    await updateProduct.mutate(productId, { [field]: value });
  };
  
  return (
    <div>
      <input
        placeholder="Product ID"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
      />
      
      <input
        placeholder="Product Name"
        onBlur={(e) => handleFieldUpdate('name', e.target.value)}
      />
      
      {updateProduct.loading && <span>Updating...</span>}
    </div>
  );
}
```

## 🐛 Troubleshooting

### Common Issues:

1. **Hook called outside component**
   ```tsx
   // ❌ Wrong
   const hook = useCreateProduct();
   function Component() { }
   
   // ✅ Correct
   function Component() {
     const hook = useCreateProduct();
   }
   ```

2. **Undefined data access**
   ```tsx
   // ❌ Wrong
   <div>{products.data.products.map(...)}</div>
   
   // ✅ Correct
   <div>{products?.data?.products?.map(...) || []}</div>
   ```

3. **Form not updating**
   ```tsx
   // ❌ Wrong
   formData.name = newValue;
   
   // ✅ Correct
   setFormData(prev => ({ ...prev, name: newValue }));
   ```

## 📝 Quick Reference

### Available Hooks:
- `useCreateProduct()` - Create products
- `useUpdateProduct()` - Update products  
- `useDeleteProduct()` - Delete products
- `useProducts(filters)` - Fetch product list
- `useProductSearch()` - Search products
- `useMediaUpload()` - Upload files
- `useGenerateSKU()` - Generate SKUs
- `useCategories()` - Fetch categories
- `useBrands()` - Fetch brands
- `useBulkOperations()` - Bulk operations

### Hook Return Values:
All mutation hooks return:
- `data` - Response data
- `loading` - Loading state
- `error` - Error message
- `mutate()` - Function to call

Query hooks return:
- `data` - Response data
- `loading` - Loading state
- `error` - Error message  
- `refetch()` - Function to refresh

## 🚀 Next Steps

1. **Run the examples** - Start with `CompleteAPIExamples`
2. **Copy patterns** - Use the code patterns above
3. **Customize** - Modify for your specific needs
4. **Add features** - Extend with additional functionality
5. **Test thoroughly** - Test all scenarios

Now you're ready to build your own product management system using these examples!