/**
 * Test page for variant fields
 * Note: SimpleProductForm has been removed. Use DynamicProductCreationFormClean instead.
 */

export default function ProductTestPage() {
  return (
    <div className="p-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-yellow-800 mb-2">Test Page Notice</h2>
        <p className="text-yellow-700">
          SimpleProductForm has been removed as part of component cleanup. 
          Please use the main product creation form at{' '}
          <a href="/products/create" className="underline font-medium">
            /products/create
          </a>
        </p>
      </div>
      
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Test Page</h1>
        <p className="text-gray-600 mb-6">
          This page previously showed SimpleProductForm for testing variant fields.
        </p>
        <a 
          href="/products/create" 
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Go to Product Creation Form
        </a>
      </div>
    </div>
  );
}