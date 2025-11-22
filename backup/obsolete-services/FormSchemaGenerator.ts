/**
 * Dynamic Form Schema Generator
 * Generates form schemas based on business-controlled master attributes
 */

import { 
  FormGenerationContext, 
  DynamicFormSchema, 
  FormField, 
  FormFieldType,
  FormFieldValidationRules,
  FormLogic,
  FieldDependency,
  ValidationDependency,
  FormGovernanceInfo,
  FieldBusinessContext,
  FormFieldOption
} from '@/types/dynamicForm';
import { masterAttributesService, MasterAttribute } from '@/services/MasterAttributesService';
import fs from 'fs';
import path from 'path';

export class FormSchemaGenerator {
  
  /**
   * Generate dynamic form schema based on context
   */
  async generateSchema(context: FormGenerationContext): Promise<DynamicFormSchema> {
    console.log(`[FormSchemaGenerator] Generating schema for user: ${context.userId}, org: ${context.organizationId}`);
    
    try {
      // Step 1: Get all active master attributes
      const activeAttributes = await this.getActiveAttributesForOrganization(context.organizationId);
      console.log(`[FormSchemaGenerator] Step 1: Got ${activeAttributes.length} active attributes`);
      
      // Step 2: Filter by user permissions
      const visibleAttributes = this.filterByUserPermissions(activeAttributes, context);
      console.log(`[FormSchemaGenerator] Step 2: ${visibleAttributes.length} attributes after permission filtering`);
      
      // Step 3: Apply category-specific filtering
      const categoryFilteredAttributes = this.filterByCategory(visibleAttributes, context.productCategory);
      console.log(`[FormSchemaGenerator] Step 3: ${categoryFilteredAttributes.length} attributes after category filtering`);
      
      // Step 4: Apply channel-specific requirements
      const channelOptimizedAttributes = this.applyChannelRequirements(categoryFilteredAttributes, context.targetChannels);
      console.log(`[FormSchemaGenerator] Step 4: ${channelOptimizedAttributes.length} attributes after channel filtering`);
      
      // Step 5: Generate form fields
      const formFields = await this.generateFormFields(channelOptimizedAttributes, context);
      console.log(`[FormSchemaGenerator] Step 5: Generated ${formFields.length} form fields`);
      
      // Step 6: Generate conditional logic
      const conditionalLogic = this.generateConditionalLogic(channelOptimizedAttributes, context);
      
      // Step 7: Generate governance information
      const governanceInfo = this.generateGovernanceInfo(channelOptimizedAttributes, context);
      
      // Step 8: Create form groups
      const groups = this.generateFormGroups(formFields);
      
      const schema: DynamicFormSchema = {
        title: 'Create Master Product',
        description: `Dynamic form generated for ${context.userRole} in ${context.organizationId}`,
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        generatedFor: {
          userId: context.userId,
          organizationId: context.organizationId,
          userRole: context.userRole,
          permissions: context.permissions
        },
        fields: formFields,
        groups,
        conditionalLogic,
        governanceInfo,
        metadata: {
          estimatedCompletionTime: this.estimateCompletionTime(formFields),
          complexity: this.assessComplexity(formFields, conditionalLogic),
          fieldCount: formFields.length,
          requiredFieldCount: formFields.filter(f => f.required).length,
          conditionalFieldCount: formFields.filter(f => f.conditionalVisibility).length
        }
      };
      
      console.log(`[FormSchemaGenerator] Generated schema with ${formFields.length} fields`);
      return schema;
      
    } catch (error) {
      console.error('[FormSchemaGenerator] Error generating schema:', error);
      throw new Error(`Failed to generate form schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get active master attributes for organization
   */
  private async getActiveAttributesForOrganization(organizationId: string): Promise<MasterAttribute[]> {
    try {
      // Server-side: Read file directly from filesystem
      if (typeof window === 'undefined') {
        try {
          const filePath = path.join(process.cwd(), 'src', 'master-attributes-ecommerce.json');
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(fileContent);
          const allAttributes = data.masterAttributes || data;
          
          // Filter for active attributes (in real implementation, this would be in the query)
          return allAttributes.filter((attr: MasterAttribute) => {
            // Simulate organization-specific attributes
            return true; // For now, return all attributes
          });
        } catch (error) {
          console.error('Failed to read master attributes file:', error);
          return [];
        }
      }
      
      // Client-side: Use the service
      const allAttributes = await masterAttributesService.getMasterAttributes();
      
      // Filter for active attributes (in real implementation, this would be in the query)
      return allAttributes.filter(attr => {
        // Simulate organization-specific attributes
        return true; // For now, return all attributes
      });
    } catch (error) {
      console.error('[FormSchemaGenerator] Error loading master attributes:', error);
      return [];
    }
  }
  
  /**
   * Filter attributes by user permissions
   */
  private filterByUserPermissions(attributes: MasterAttribute[], context: FormGenerationContext): MasterAttribute[] {
    return attributes.filter(attr => {
      // Check if user has permission to view this field
      if (context.userRole === 'VIEW_ONLY') {
        // View-only users can see non-sensitive fields
        return !this.isSensitiveField(attr.fieldName);
      }
      
      if (context.userRole === 'BUSINESS_USER') {
        // Business users can see most fields except system-level ones
        return !this.isSystemField(attr.fieldName);
      }
      
      // ADMIN_USER and DEVELOPER can see all fields
      return true;
    });
  }
  
  /**
   * Filter attributes by product category
   */
  private filterByCategory(attributes: MasterAttribute[], productCategory?: string): MasterAttribute[] {
    // For now, return all attributes since we're using attribute categories (basic_info, pricing, etc.)
    // not product categories (electronics, clothing, etc.)
    // In a real implementation, you might filter certain attributes based on product category
    return attributes;
  }
  
  /**
   * Apply channel-specific requirements
   */
  private applyChannelRequirements(attributes: MasterAttribute[], channels: string[]): MasterAttribute[] {
    if (channels.length === 0) return attributes;
    
    // Define ecommerce-only channels (exclude social media platforms)
    const ecommerceChannels = ['shopify', 'amazon', 'walmart', 'ebay', 'etsy', 'magento', 'woocommerce'];
    const validChannels = channels.filter(channel => ecommerceChannels.includes(channel));
    
    if (validChannels.length === 0) {
      console.warn('[FormSchemaGenerator] No valid ecommerce channels found, using all attributes');
      return attributes;
    }
    
    return attributes.filter(attr => {
      // Check if attribute is supported by at least one valid ecommerce channel
      if (attr.supportedChannels && attr.supportedChannels.length > 0) {
        return validChannels.some(channel => attr.supportedChannels.includes(channel));
      }
      
      // If no specific channels defined, assume it's supported everywhere
      return true;
    });
  }
  
  /**
   * Generate form fields from master attributes
   */
  private async generateFormFields(attributes: MasterAttribute[], context: FormGenerationContext): Promise<FormField[]> {
    const fields: FormField[] = [];
    
    for (const attr of attributes) {
      const field = await this.generateFormField(attr, context);
      fields.push(field);
    }
    
    // Sort by priority (lower number = higher priority)
    return fields.sort((a, b) => a.businessContext.version - b.businessContext.version);
  }
  
  /**
   * Generate a single form field from master attribute
   */
  private async generateFormField(attribute: MasterAttribute, context: FormGenerationContext): Promise<FormField> {
    const fieldType = this.mapDataTypeToFormFieldType(attribute.dataType, attribute.fieldName);
    const validationRules = this.generateFieldValidationRules(attribute, context);
    const options = await this.generateFieldOptions(attribute, context);
    
    return {
      fieldName: attribute.fieldName,
      fieldType,
      label: this.generateFieldLabel(attribute),
      description: attribute.description,
      placeholder: this.generatePlaceholder(attribute),
      helpText: this.generateHelpText(attribute, context),
      
      validationRules,
      
      conditionalVisibility: this.generateConditionalVisibility(attribute, context),
      conditionalLogic: {
        triggersFieldChanges: this.getTriggeredFields(attribute),
        affectedByFields: this.getAffectingFields(attribute)
      },
      
      options,
      
      readOnly: this.determineIfReadOnly(attribute, context),
      hidden: this.determineIfHidden(attribute, context),
      required: this.determineIfRequired(attribute, context),
      
      businessContext: this.generateBusinessContext(attribute),
      
      group: this.determineFieldGroup(attribute),
      order: attribute.priority || 100,
      width: this.determineFieldWidth(attribute),
      appearance: this.generateFieldAppearance(attribute)
    };
  }
  
  /**
   * Map data types to form field types
   */
  private mapDataTypeToFormFieldType(dataType: string, fieldName?: string): FormFieldType {
    console.log(`[FormSchemaGenerator] Mapping field "${fieldName}" with dataType "${dataType}"`);
    
    // Special handling for variant configurator
    if (fieldName === 'variantConfigurator') {
      console.log(`[FormSchemaGenerator] ✅ Mapping variantConfigurator to variant-configurator`);
      return 'variant-configurator';
    }
    
    // Special handling for images field - treat Array type as image gallery
    if (fieldName === 'images' && dataType === 'Array') {
      console.log(`[FormSchemaGenerator] ✅ Mapping images field with Array type to image`);
      return 'image';
    }
    
    // Special handling for channelSettings field - treat Object type as channel-settings
    if (fieldName === 'channelSettings' && dataType === 'Object') {
      console.log(`[FormSchemaGenerator] ✅ Mapping channelSettings field with Object type to channel-settings`);
      return 'channel-settings';
    }

    const typeMap: Record<string, FormFieldType> = {
      'String': 'text',
      'Integer': 'number',
      'Double': 'number',
      'Decimal': 'number',
      'Boolean': 'checkbox',
      'Date': 'date',
      'DateTime': 'datetime-local',
      'Email': 'email',
      'URL': 'url',
      'Phone': 'tel',
      'Text': 'textarea',
      'Enum': 'select',
      'MultiEnum': 'multiselect',
      'Image': 'image',
      'File': 'file',
      'Color': 'color',
      'JSON': 'textarea'
    };
    
    // Override field type based on field name for common select fields
    if (fieldName && dataType === 'String') {
      const fieldNameLower = fieldName.toLowerCase();
      const selectFieldNames = [
        'category', 'brand', 'condition', 'color', 'colour', 'material', 'fabric',
        'country', 'countryoforigin', 'origin', 'supplier', 'vendor', 'warranty',
        'tags', 'keywords', 'size', 'connectivity', 'connection', 'screensize',
        'displaysize', 'season', 'style', 'clothingstyle', 'room', 'manufacturer',
        'productcondition', 'primarycolor', 'warrantylength'
      ];
      
      if (selectFieldNames.some(name => fieldNameLower.includes(name))) {
        return 'select';
      }
    }
    
    const result = typeMap[dataType] || 'text';
    console.log(`[FormSchemaGenerator] Final mapping for "${fieldName}": ${dataType} -> ${result}`);
    return result;
  }
  
  /**
   * Generate validation rules for field
   */
  private generateFieldValidationRules(attribute: MasterAttribute, context: FormGenerationContext): FormFieldValidationRules {
    const rules: FormFieldValidationRules = {
      required: attribute.required
    };
    
    if (attribute.validationRules) {
      Object.assign(rules, attribute.validationRules);
    }
    
    // Apply context-specific validation rules
    if (context.targetChannels.includes('walmart') && attribute.fieldName === 'gtin') {
      rules.required = true;
    }
    
    return rules;
  }
  
  /**
   * Generate field options for select/radio fields
   */
  private async generateFieldOptions(attribute: MasterAttribute, context: FormGenerationContext): Promise<FormFieldOption[] | undefined> {
    // 1. Use enum options from master attributes (highest priority)
    if (attribute.validationRules?.enum) {
      return attribute.validationRules.enum.map(value => ({
        value,
        label: this.formatEnumLabel(value),
        description: this.generateOptionDescription(attribute.fieldName, value)
      }));
    }
    
    // 2. Generate dynamic options based on field name
    const fieldName = attribute.fieldName.toLowerCase();
    
    // Category options
    if (fieldName === 'category' || fieldName === 'productcategory') {
      return this.generateCategoryOptions(context);
    }
    
    // Brand options
    if (fieldName === 'brand' || fieldName === 'manufacturer') {
      return this.generateBrandOptions(context);
    }
    
    // Condition options
    if (fieldName === 'condition' || fieldName === 'productcondition') {
      return this.generateConditionOptions();
    }
    
    // Size options (for products that don't have enum)
    if (fieldName.includes('size') && !attribute.validationRules?.enum) {
      return this.generateSizeOptions(context);
    }
    
    // Color options
    if (fieldName === 'color' || fieldName === 'colour' || fieldName === 'primarycolor') {
      return this.generateColorOptions();
    }
    
    // Material options
    if (fieldName === 'material' || fieldName === 'fabric') {
      return this.generateMaterialOptions(context);
    }
    
    // Country options
    if (fieldName === 'country' || fieldName === 'countryoforigin' || fieldName === 'origin') {
      return this.generateCountryOptions();
    }
    
    // Supplier options
    if (fieldName === 'supplier' || fieldName === 'vendor') {
      return this.generateSupplierOptions(context);
    }
    
    // Warranty options
    if (fieldName === 'warranty' || fieldName === 'warrantylength') {
      return this.generateWarrantyOptions();
    }
    
    // Tag options
    if (fieldName === 'tags' || fieldName === 'keywords') {
      return this.generateTagOptions(context);
    }
    
    // 3. Category-specific dynamic options
    if (context.productCategory) {
      const categoryOptions = await this.generateCategorySpecificOptions(attribute, context);
      if (categoryOptions) return categoryOptions;
    }
    
    return undefined;
  }
  
  /**
   * Generate category options
   */
  private async generateCategoryOptions(context: FormGenerationContext): Promise<FormFieldOption[]> {
    // In real implementation, this would come from database
    const categories = await masterAttributesService.getAvailableCategories();
    
    return categories.map(category => ({
      value: category,
      label: this.formatEnumLabel(category),
      description: `Products in the ${category} category`
    }));
  }
  
  /**
   * Generate brand options
   */
  private async generateBrandOptions(context: FormGenerationContext): Promise<FormFieldOption[]> {
    // In real implementation, this would come from database
    const commonBrands = [
      'Apple', 'Samsung', 'Nike', 'Adidas', 'Sony', 'Microsoft', 
      'Google', 'Amazon', 'Dell', 'HP', 'Canon', 'Nikon'
    ];
    
    return commonBrands.map(brand => ({
      value: brand.toLowerCase(),
      label: brand,
      description: `${brand} products`
    }));
  }
  
  /**
   * Generate condition options
   */
  private generateConditionOptions(): FormFieldOption[] {
    const conditions = [
      { value: 'new', label: 'New', description: 'Brand new, unused item' },
      { value: 'used', label: 'Used', description: 'Previously owned item in good condition' },
      { value: 'refurbished', label: 'Refurbished', description: 'Restored to working condition' },
      { value: 'damaged', label: 'Damaged', description: 'Item with visible wear or damage' },
      { value: 'open_box', label: 'Open Box', description: 'New item with opened packaging' },
      { value: 'renewed', label: 'Renewed', description: 'Professionally restored item' }
    ];
    
    return conditions;
  }
  
  /**
   * Generate size options based on context
   */
  private generateSizeOptions(context: FormGenerationContext): FormFieldOption[] {
    // Generic size options - could be enhanced based on category
    const sizes = [
      { value: 'xs', label: 'XS', description: 'Extra Small' },
      { value: 's', label: 'S', description: 'Small' },
      { value: 'm', label: 'M', description: 'Medium' },
      { value: 'l', label: 'L', description: 'Large' },
      { value: 'xl', label: 'XL', description: 'Extra Large' },
      { value: 'xxl', label: 'XXL', description: 'Extra Extra Large' },
      { value: 'one_size', label: 'One Size', description: 'Universal fit' }
    ];
    
    return sizes;
  }
  
  /**
   * Generate color options
   */
  private generateColorOptions(): FormFieldOption[] {
    const colors = [
      { value: 'black', label: 'Black', description: 'Black color' },
      { value: 'white', label: 'White', description: 'White color' },
      { value: 'red', label: 'Red', description: 'Red color' },
      { value: 'blue', label: 'Blue', description: 'Blue color' },
      { value: 'green', label: 'Green', description: 'Green color' },
      { value: 'yellow', label: 'Yellow', description: 'Yellow color' },
      { value: 'pink', label: 'Pink', description: 'Pink color' },
      { value: 'purple', label: 'Purple', description: 'Purple color' },
      { value: 'orange', label: 'Orange', description: 'Orange color' },
      { value: 'brown', label: 'Brown', description: 'Brown color' },
      { value: 'gray', label: 'Gray', description: 'Gray color' },
      { value: 'silver', label: 'Silver', description: 'Silver color' },
      { value: 'gold', label: 'Gold', description: 'Gold color' },
      { value: 'multicolor', label: 'Multi-color', description: 'Multiple colors' }
    ];
    
    return colors;
  }
  
  /**
   * Generate material options based on context
   */
  private generateMaterialOptions(context: FormGenerationContext): FormFieldOption[] {
    // Basic materials - could be enhanced based on category
    const materials = [
      { value: 'cotton', label: 'Cotton', description: 'Natural cotton fiber' },
      { value: 'polyester', label: 'Polyester', description: 'Synthetic polyester fabric' },
      { value: 'wool', label: 'Wool', description: 'Natural wool fiber' },
      { value: 'silk', label: 'Silk', description: 'Natural silk fiber' },
      { value: 'denim', label: 'Denim', description: 'Denim fabric' },
      { value: 'leather', label: 'Leather', description: 'Natural or synthetic leather' },
      { value: 'plastic', label: 'Plastic', description: 'Plastic material' },
      { value: 'metal', label: 'Metal', description: 'Metal construction' },
      { value: 'wood', label: 'Wood', description: 'Wood material' },
      { value: 'glass', label: 'Glass', description: 'Glass material' },
      { value: 'ceramic', label: 'Ceramic', description: 'Ceramic material' },
      { value: 'rubber', label: 'Rubber', description: 'Rubber material' }
    ];
    
    return materials;
  }
  
  /**
   * Generate country options
   */
  private generateCountryOptions(): FormFieldOption[] {
    const countries = [
      { value: 'US', label: 'United States', description: 'Made in USA' },
      { value: 'CN', label: 'China', description: 'Made in China' },
      { value: 'DE', label: 'Germany', description: 'Made in Germany' },
      { value: 'JP', label: 'Japan', description: 'Made in Japan' },
      { value: 'KR', label: 'South Korea', description: 'Made in South Korea' },
      { value: 'IT', label: 'Italy', description: 'Made in Italy' },
      { value: 'FR', label: 'France', description: 'Made in France' },
      { value: 'GB', label: 'United Kingdom', description: 'Made in UK' },
      { value: 'CA', label: 'Canada', description: 'Made in Canada' },
      { value: 'MX', label: 'Mexico', description: 'Made in Mexico' },
      { value: 'IN', label: 'India', description: 'Made in India' },
      { value: 'VN', label: 'Vietnam', description: 'Made in Vietnam' },
      { value: 'TH', label: 'Thailand', description: 'Made in Thailand' },
      { value: 'TW', label: 'Taiwan', description: 'Made in Taiwan' }
    ];
    
    return countries;
  }
  
  /**
   * Generate supplier options
   */
  private generateSupplierOptions(context: FormGenerationContext): FormFieldOption[] {
    // In real implementation, this would come from database
    const suppliers = [
      { value: 'supplier_001', label: 'Global Trading Co.', description: 'International supplier' },
      { value: 'supplier_002', label: 'Premium Products Inc.', description: 'High-quality supplier' },
      { value: 'supplier_003', label: 'Wholesale Direct', description: 'Bulk supplier' },
      { value: 'supplier_004', label: 'Local Manufacturing', description: 'Local supplier' },
      { value: 'supplier_005', label: 'Express Logistics', description: 'Fast delivery supplier' }
    ];
    
    return suppliers;
  }
  
  /**
   * Generate warranty options
   */
  private generateWarrantyOptions(): FormFieldOption[] {
    const warranties = [
      { value: 'none', label: 'No Warranty', description: 'No warranty coverage' },
      { value: '30_days', label: '30 Days', description: '30-day warranty' },
      { value: '90_days', label: '90 Days', description: '90-day warranty' },
      { value: '6_months', label: '6 Months', description: '6-month warranty' },
      { value: '1_year', label: '1 Year', description: '1-year warranty' },
      { value: '2_years', label: '2 Years', description: '2-year warranty' },
      { value: '3_years', label: '3 Years', description: '3-year warranty' },
      { value: '5_years', label: '5 Years', description: '5-year warranty' },
      { value: 'lifetime', label: 'Lifetime', description: 'Lifetime warranty' }
    ];
    
    return warranties;
  }
  
  /**
   * Generate tag options based on context
   */
  private generateTagOptions(context: FormGenerationContext): FormFieldOption[] {
    // Popular product tags
    const tags = [
      { value: 'bestseller', label: 'Bestseller', description: 'Popular selling item' },
      { value: 'new_arrival', label: 'New Arrival', description: 'Recently added product' },
      { value: 'sale', label: 'On Sale', description: 'Discounted item' },
      { value: 'premium', label: 'Premium', description: 'High-quality product' },
      { value: 'eco_friendly', label: 'Eco-Friendly', description: 'Environmentally conscious' },
      { value: 'limited_edition', label: 'Limited Edition', description: 'Exclusive item' },
      { value: 'handmade', label: 'Handmade', description: 'Crafted by hand' },
      { value: 'organic', label: 'Organic', description: 'Organic materials' },
      { value: 'sustainable', label: 'Sustainable', description: 'Sustainably sourced' },
      { value: 'trending', label: 'Trending', description: 'Currently popular' }
    ];
    
    return tags;
  }
  
  /**
   * Generate category-specific options
   */
  private async generateCategorySpecificOptions(attribute: MasterAttribute, context: FormGenerationContext): Promise<FormFieldOption[] | undefined> {
    const category = context.productCategory?.toLowerCase();
    const fieldName = attribute.fieldName.toLowerCase();
    
    // Electronics category
    if (category === 'electronics') {
      if (fieldName === 'connectivity' || fieldName === 'connection') {
        return [
          { value: 'wifi', label: 'WiFi', description: 'Wireless connectivity' },
          { value: 'bluetooth', label: 'Bluetooth', description: 'Bluetooth connectivity' },
          { value: 'usb', label: 'USB', description: 'USB connection' },
          { value: 'ethernet', label: 'Ethernet', description: 'Wired network connection' },
          { value: '4g_lte', label: '4G/LTE', description: 'Cellular connectivity' },
          { value: '5g', label: '5G', description: '5G connectivity' }
        ];
      }
      
      if (fieldName === 'screensize' || fieldName === 'displaysize') {
        return [
          { value: '5_inch', label: '5"', description: '5-inch display' },
          { value: '6_inch', label: '6"', description: '6-inch display' },
          { value: '10_inch', label: '10"', description: '10-inch display' },
          { value: '13_inch', label: '13"', description: '13-inch display' },
          { value: '15_inch', label: '15"', description: '15-inch display' },
          { value: '24_inch', label: '24"', description: '24-inch display' },
          { value: '27_inch', label: '27"', description: '27-inch display' },
          { value: '32_inch', label: '32"', description: '32-inch display' }
        ];
      }
    }
    
    // Clothing category
    if (category === 'clothing' || category === 'fashion') {
      if (fieldName === 'season') {
        return [
          { value: 'spring', label: 'Spring', description: 'Spring season' },
          { value: 'summer', label: 'Summer', description: 'Summer season' },
          { value: 'fall', label: 'Fall/Autumn', description: 'Fall season' },
          { value: 'winter', label: 'Winter', description: 'Winter season' },
          { value: 'all_season', label: 'All Season', description: 'Year-round wear' }
        ];
      }
      
      if (fieldName === 'style' || fieldName === 'clothingstyle') {
        return [
          { value: 'casual', label: 'Casual', description: 'Everyday wear' },
          { value: 'formal', label: 'Formal', description: 'Business or formal wear' },
          { value: 'business', label: 'Business', description: 'Professional attire' },
          { value: 'sportswear', label: 'Sportswear', description: 'Athletic clothing' },
          { value: 'vintage', label: 'Vintage', description: 'Retro style' },
          { value: 'bohemian', label: 'Bohemian', description: 'Boho style' }
        ];
      }
    }
    
    // Home & Garden category
    if (category === 'home' || category === 'garden') {
      if (fieldName === 'room') {
        return [
          { value: 'living_room', label: 'Living Room', description: 'For living room use' },
          { value: 'bedroom', label: 'Bedroom', description: 'For bedroom use' },
          { value: 'kitchen', label: 'Kitchen', description: 'For kitchen use' },
          { value: 'bathroom', label: 'Bathroom', description: 'For bathroom use' },
          { value: 'dining_room', label: 'Dining Room', description: 'For dining room use' },
          { value: 'office', label: 'Office', description: 'For office use' },
          { value: 'outdoor', label: 'Outdoor', description: 'For outdoor use' }
        ];
      }
    }
    
    return undefined;
  }
  
  /**
   * Generate conditional logic for the form
   */
  private generateConditionalLogic(attributes: MasterAttribute[], context: FormGenerationContext): FormLogic {
    const fieldDependencies: FieldDependency[] = [];
    const validationDependencies: ValidationDependency[] = [];
    
    // Category-based field dependencies
    fieldDependencies.push({
      triggerField: 'category',
      affectedFields: ['warranty', 'size', 'author', 'isbn', 'color', 'material'],
      logic: {
        'electronics': {
          show: ['warranty', 'color'],
          hide: ['size', 'author', 'isbn', 'material']
        },
        'clothing': {
          show: ['size', 'color', 'material'],
          hide: ['warranty', 'author', 'isbn']
        },
        'books': {
          show: ['author', 'isbn'],
          hide: ['warranty', 'size', 'color', 'material']
        }
      }
    });
    
    // Channel-based field dependencies
    if (context.targetChannels.length > 0) {
      fieldDependencies.push({
        triggerField: 'targetChannels',
        affectedFields: ['gtin', 'brand', 'productIdentifier'],
        logic: {
          'walmart': {
            require: ['gtin', 'brand'],
            show: ['productIdentifier']
          },
          'amazon': {
            recommend: ['gtin'],
            show: ['productIdentifier']
          },
          'shopify': {
            optional: ['gtin']
          }
        }
      });
    }
    
    // Price validation dependencies
    validationDependencies.push({
      field: 'price',
      dependsOn: ['category', 'targetChannels'],
      validationRules: {
        'electronics': { min: 1.0, max: 50000.0 },
        'clothing': { min: 5.0, max: 2000.0 },
        'books': { min: 0.99, max: 500.0 },
        'jewelry': { min: 10.0, max: 100000.0 }
      }
    });
    
    return {
      fieldDependencies,
      validationDependencies,
      globalValidations: [
        {
          expression: 'price > 0',
          message: 'Price must be greater than zero',
          severity: 'error'
        }
      ]
    };
  }
  
  /**
   * Generate governance information
   */
  private generateGovernanceInfo(attributes: MasterAttribute[], context: FormGenerationContext): FormGovernanceInfo {
    return {
      formGeneratedBy: 'dynamic-form-engine',
      attributesVersion: '2.1.0',
      lastAttributeUpdate: new Date().toISOString(),
      businessApprovals: attributes
        .filter(attr => attr.required)
        .map(attr => ({
          field: attr.fieldName,
          approvedBy: 'business-director@company.com',
          approvedAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
          notes: 'Approved for production use'
        })),
      pendingApprovals: [],
      changeLog: [
        {
          timestamp: new Date().toISOString(),
          changedBy: context.userId,
          changeType: 'FIELD_MODIFIED',
          fieldName: 'price',
          reason: 'Updated validation rules for international markets'
        }
      ]
    };
  }
  
  /**
   * Generate form groups for better organization
   */
  private generateFormGroups(fields: FormField[]) {
    const groupDefinitions = [
      {
        groupName: 'basic_info',
        label: 'Product Information',
        description: 'Essential product details',
        fieldCategories: ['basic_info'],
        collapsible: false,
        defaultExpanded: true
      },
      {
        groupName: 'pricing',
        label: 'Pricing',
        description: 'Product pricing and costs',
        fieldCategories: ['pricing'],
        collapsible: false,
        defaultExpanded: true
      },
      {
        groupName: 'classification',
        label: 'Classification',
        description: 'Category, brand, and tags',
        fieldCategories: ['classification'],
        collapsible: true,
        defaultExpanded: true
      },
      {
        groupName: 'inventory',
        label: 'Inventory',
        description: 'Stock management settings',
        fieldCategories: ['inventory'],
        collapsible: true,
        defaultExpanded: true
      },
      {
        groupName: 'shipping',
        label: 'Shipping',
        description: 'Dimensions and shipping settings',
        fieldCategories: ['shipping'],
        collapsible: true,
        defaultExpanded: false
      },
      {
        groupName: 'variants',
        label: 'Product Variants',
        description: 'Size, color, and other variations',
        fieldCategories: ['variants'],
        collapsible: true,
        defaultExpanded: false
      },
      {
        groupName: 'media',
        label: 'Images & Media',
        description: 'Product images and videos',
        fieldCategories: ['media'],
        collapsible: true,
        defaultExpanded: false
      },
      {
        groupName: 'seo',
        label: 'SEO & Marketing',
        description: 'Search engine optimization',
        fieldCategories: ['seo'],
        collapsible: true,
        defaultExpanded: false
      },
      {
        groupName: 'status',
        label: 'Status & Visibility',
        description: 'Product status and publishing settings',
        fieldCategories: ['status'],
        collapsible: true,
        defaultExpanded: false
      },
      {
        groupName: 'channels',
        label: 'Channel Settings',
        description: 'Platform-specific configurations',
        fieldCategories: ['channels'],
        collapsible: true,
        defaultExpanded: false
      }
    ];

    return groupDefinitions.map(groupDef => ({
      groupName: groupDef.groupName,
      label: groupDef.label,
      description: groupDef.description,
      fields: fields
        .filter(f => {
          // Get category from field attributes or default categories
          const fieldCategory = (f as any).category || this.getFieldCategory(f.fieldName);
          return groupDef.fieldCategories.includes(fieldCategory);
        })
        .map(f => f.fieldName),
      collapsible: groupDef.collapsible,
      defaultExpanded: groupDef.defaultExpanded
    })).filter(group => group.fields.length > 0);
  }

  /**
   * Get field category for grouping
   */
  private getFieldCategory(fieldName: string): string {
    const categoryMap: Record<string, string> = {
      'name': 'basic_info',
      'description': 'basic_info', 
      'sku': 'basic_info',
      'price': 'pricing',
      'comparePrice': 'pricing',
      'costPrice': 'pricing',
      'category': 'classification',
      'brand': 'classification',
      'tags': 'classification',
      'weight': 'shipping',
      'length': 'shipping',
      'width': 'shipping', 
      'height': 'shipping',
      'inventory': 'inventory',
      'trackInventory': 'inventory',
      'lowStockAlert': 'inventory',
      'hasVariants': 'variants',
      'variantConfigurator': 'variants',
      'images': 'media',
      'metaTitle': 'seo',
      'metaDescription': 'seo',
      'status': 'status',
      'publishedScope': 'status',
      'channelSettings': 'channels'
    };
    
    return categoryMap[fieldName] || 'basic_info';
  }
  
  // Helper methods
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = ['cost', 'margin', 'internalNotes'];
    return sensitiveFields.includes(fieldName);
  }
  
  private isSystemField(fieldName: string): boolean {
    const systemFields = ['id', 'createdAt', 'updatedAt', 'version'];
    return systemFields.includes(fieldName);
  }
  
  private generateFieldLabel(attribute: MasterAttribute): string {
    return attribute.description || this.formatEnumLabel(attribute.fieldName);
  }
  
  private formatEnumLabel(value: string): string {
    return value.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
  
  private generatePlaceholder(attribute: MasterAttribute): string {
    const placeholders: Record<string, string> = {
      'name': 'Enter product name...',
      'price': '0.00',
      'description': 'Describe your product...',
      'brand': 'Select or enter brand...',
      'sku': 'Will be auto-generated if left empty',
      'weight': 'Weight in pounds'
    };
    
    return placeholders[attribute.fieldName] || `Enter ${attribute.fieldName}...`;
  }
  
  private generateHelpText(attribute: MasterAttribute, context: FormGenerationContext): string {
    const helpTexts: Record<string, string> = {
      'gtin': context.targetChannels.includes('walmart') ? 'Required for Walmart marketplace' : 'Global Trade Item Number - helps with product identification',
      'price': 'Base selling price in USD. Channel-specific pricing can be set later.',
      'sku': 'Leave empty to auto-generate based on brand and category'
    };
    
    return helpTexts[attribute.fieldName] || attribute.description;
  }
  
  private generateConditionalVisibility(attribute: MasterAttribute, context: FormGenerationContext) {
    const conditionalFields: Record<string, any> = {
      'warranty': {
        showWhen: "category === 'electronics'",
        hideWhen: "category !== 'electronics'"
      },
      'size': {
        showWhen: "category === 'clothing' || hasVariants === true",
        hideWhen: "category !== 'clothing' && hasVariants !== true"
      },
      'color': {
        showWhen: "hasVariants === true",
        hideWhen: "hasVariants !== true"
      },
      'material': {
        showWhen: "hasVariants === true || category === 'clothing'",
        hideWhen: "hasVariants !== true && category !== 'clothing'"
      },
      'variantConfigurator': {
        showWhen: "hasVariants === true",
        hideWhen: "hasVariants !== true"
      },
      'variantType': {
        showWhen: "hasVariants === true",
        hideWhen: "hasVariants !== true"
      },
      'variantOptions': {
        showWhen: "hasVariants === true",
        hideWhen: "hasVariants !== true"
      },
      'author': {
        showWhen: "category === 'books'",
        hideWhen: "category !== 'books'"
      },
      'gtin': {
        showWhen: "targetChannels.includes('walmart') || targetChannels.includes('amazon')",
        requiredWhen: "targetChannels.includes('walmart')"
      }
    };
    
    return conditionalFields[attribute.fieldName];
  }
  
  private getTriggeredFields(attribute: MasterAttribute): string[] {
    const triggers: Record<string, string[]> = {
      'category': ['warranty', 'size', 'author', 'isbn', 'color', 'material'],
      'targetChannels': ['gtin', 'brand', 'productIdentifier'],
      'hasVariants': ['variantConfigurator', 'variantType', 'variantOptions', 'size', 'color', 'material']
    };
    
    return triggers[attribute.fieldName] || [];
  }
  
  private getAffectingFields(attribute: MasterAttribute): string[] {
    const affected: Record<string, string[]> = {
      'warranty': ['category'],
      'size': ['category'],
      'author': ['category'],
      'gtin': ['targetChannels']
    };
    
    return affected[attribute.fieldName] || [];
  }
  
  private determineIfReadOnly(attribute: MasterAttribute, context: FormGenerationContext): boolean {
    if (context.userRole === 'VIEW_ONLY') return true;
    
    const readOnlyFields = ['id', 'createdAt', 'updatedAt'];
    return readOnlyFields.includes(attribute.fieldName);
  }
  
  private determineIfHidden(attribute: MasterAttribute, context: FormGenerationContext): boolean {
    return false; // Visibility is handled by conditional logic
  }
  
  private determineIfRequired(attribute: MasterAttribute, context: FormGenerationContext): boolean {
    // Base requirement from attribute
    if (attribute.required) return true;
    
    // Channel-specific requirements
    if (context.targetChannels.includes('walmart') && attribute.fieldName === 'gtin') {
      return true;
    }
    
    return false;
  }
  
  private generateBusinessContext(attribute: MasterAttribute): FieldBusinessContext {
    return {
      businessOwner: 'product-team@company.com',
      technicalOwner: 'platform-team@company.com',
      lastModifiedBy: 'system-admin@company.com',
      modificationReason: 'Updated for dynamic form generation',
      requiresApproval: attribute.required,
      riskLevel: attribute.required ? 'HIGH' : 'MEDIUM',
      version: 1
    };
  }
  
  private determineFieldGroup(attribute: MasterAttribute): string {
    const groupMap: Record<string, string> = {
      'name': 'essential',
      'price': 'essential',
      'category': 'essential',
      'description': 'essential',
      'images': 'media',
      'videos': 'media',
      'tags': 'marketing',
      'seoTitle': 'marketing',
      'seoDescription': 'marketing'
    };
    
    return groupMap[attribute.fieldName] || 'details';
  }
  
  private determineFieldWidth(attribute: MasterAttribute): 'full' | 'half' | 'third' | 'quarter' {
    const fullWidthFields = ['description', 'images'];
    if (fullWidthFields.includes(attribute.fieldName)) return 'full';
    
    const halfWidthFields = ['name', 'price', 'category', 'brand'];
    if (halfWidthFields.includes(attribute.fieldName)) return 'half';
    
    return 'third';
  }
  
  private generateFieldAppearance(attribute: MasterAttribute): Record<string, any> {
    return {
      theme: 'default',
      size: 'medium',
      variant: 'outlined'
    };
  }
  
  private generateOptionDescription(fieldName: string, value: string): string {
    return `${this.formatEnumLabel(value)} option for ${fieldName}`;
  }
  
  private estimateCompletionTime(fields: FormField[]): number {
    // Estimate 30 seconds per field, plus extra for complex fields
    const baseTime = fields.length * 30;
    const complexFields = fields.filter(f => f.conditionalVisibility || f.options).length;
    return baseTime + (complexFields * 15);
  }
  
  private assessComplexity(fields: FormField[], logic: FormLogic): 'SIMPLE' | 'MODERATE' | 'COMPLEX' {
    const fieldCount = fields.length;
    const conditionalCount = fields.filter(f => f.conditionalVisibility).length;
    const dependencyCount = logic.fieldDependencies.length;
    
    if (fieldCount <= 5 && conditionalCount === 0) return 'SIMPLE';
    if (fieldCount <= 15 && conditionalCount <= 3 && dependencyCount <= 2) return 'MODERATE';
    return 'COMPLEX';
  }
}