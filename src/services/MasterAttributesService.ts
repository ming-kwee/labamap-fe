/**
 * Master Attributes Service - Source of Truth for Product Attributes
 * Handles dynamic field definitions, validation rules, and form generation
 */

export interface MasterAttribute {
  fieldName: string;
  dataType: string;
  channelId?: string | null;
  required: boolean;
  description: string;
  category: string;
  group: 'attribute' | 'option' | 'variant';
  supportedChannels: string[];
  validationRules: {
    pattern?: string;
    maxLength?: number;
    minLength?: number;
    min?: number;
    max?: number;
    precision?: number;
    enum?: string[];
    maxItems?: number;
    itemMaxLength?: number;
  };
  isChannelField: boolean;
  priority: number;
  mappingHint: string;
  conditionalVisibility?: {
    showWhen?: string;
    hideWhen?: string;
  };
}

export interface FormFieldDefinition extends MasterAttribute {
  inputType: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date';
  placeholder?: string;
  helpText?: string;
  section: 'essential' | 'advanced' | 'variants' | 'channel_specific';
  displayOrder: number;
}

export interface CategoryFieldConfiguration {
  categoryName: string;
  requiredFields: string[];
  recommendedFields: string[];
  optionalFields: string[];
  fieldDefinitions: FormFieldDefinition[];
  variantOptions: string[];
  sectionOrder: string[];
}

export class MasterAttributesService {
  private baseUrl = '/api/v1/master-attributes';
  private attributesCache: MasterAttribute[] | null = null;

  /**
   * Get all master attributes (cached)
   */
  async getMasterAttributes(): Promise<MasterAttribute[]> {
    if (this.attributesCache) {
      return this.attributesCache;
    }

    // Check if we're running on server-side (Node.js environment)
    if (typeof window === 'undefined') {
      // Server-side: read file directly from filesystem
      try {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(process.cwd(), 'src', 'master-attributes-ecommerce.json');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        this.attributesCache = data.masterAttributes || data;
        return this.attributesCache || [];
      } catch (error) {
        console.error('Failed to load master attributes from file system:', error);
        return [];
      }
    }

    // Client-side: try API first, then public file
    try {
      // Try API first
      const response = await fetch(`${this.baseUrl}/all`);
      if (response.ok) {
        this.attributesCache = await response.json();
        return this.attributesCache || [];
      }
    } catch (error) {
      console.warn('API not available, loading from static file');
    }

    // Fallback to static file (client-side only)
    try {
      const response = await fetch('/master-attributes-ecommerce.json');
      const data = await response.json();
      this.attributesCache = data.masterAttributes || data;
      return this.attributesCache || [];
    } catch (error) {
      console.error('Failed to load master attributes:', error);
      return [];
    }
  }

  /**
   * Get form field definitions for a specific category
   */
  async getFormFieldsForCategory(category: string): Promise<FormFieldDefinition[]> {
    const attributes = await this.getMasterAttributes();
    
    return attributes
      .filter(attr => this.isRelevantForCategory(attr, category))
      .map(attr => this.convertToFormField(attr, category))
      .sort((a, b) => {
        // Sort by section, then priority, then alphabetically
        if (a.section !== b.section) {
          const sectionOrder = ['essential', 'advanced', 'variants', 'channel_specific'];
          return sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
        }
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.fieldName.localeCompare(b.fieldName);
      })
      .map((field, index) => ({ ...field, displayOrder: index }));
  }

  /**
   * Get category configuration with dynamic fields
   */
  async getCategoryConfiguration(category: string): Promise<CategoryFieldConfiguration> {
    const attributes = await this.getMasterAttributes();
    const relevantFields = attributes.filter(attr => this.isRelevantForCategory(attr, category));
    
    const requiredFields = relevantFields
      .filter(attr => attr.required)
      .map(attr => attr.fieldName);
    
    const recommendedFields = relevantFields
      .filter(attr => !attr.required && attr.priority <= 2)
      .map(attr => attr.fieldName);
    
    const optionalFields = relevantFields
      .filter(attr => !attr.required && attr.priority > 2)
      .map(attr => attr.fieldName);
    
    const variantOptions = relevantFields
      .filter(attr => attr.group === 'variant' || attr.category === 'variant_attributes')
      .map(attr => attr.fieldName);

    const fieldDefinitions = await this.getFormFieldsForCategory(category);

    return {
      categoryName: category,
      requiredFields,
      recommendedFields,
      optionalFields,
      fieldDefinitions,
      variantOptions,
      sectionOrder: ['essential', 'advanced', 'variants', 'channel_specific']
    };
  }

  /**
   * Get available categories dynamically
   */
  async getAvailableCategories(): Promise<string[]> {
    const attributes = await this.getMasterAttributes();
    const categories = new Set<string>();
    
    attributes.forEach(attr => {
      if (attr.category.startsWith('category_specific_')) {
        const category = attr.category.replace('category_specific_', '');
        categories.add(category);
      }
    });
    
    // Add common categories
    ['electronics', 'clothing', 'books', 'home', 'sports', 'beauty', 'automotive', 'other'].forEach(cat => {
      categories.add(cat);
    });
    
    return Array.from(categories).sort();
  }

  /**
   * Get validation rules for a field
   */
  async getFieldValidation(fieldName: string, category?: string): Promise<any> {
    const attributes = await this.getMasterAttributes();
    const field = attributes.find(attr => 
      attr.fieldName === fieldName && 
      (!category || this.isRelevantForCategory(attr, category))
    );
    
    return field?.validationRules || {};
  }

  /**
   * Get channel-specific fields
   */
  async getChannelSpecificFields(channelId: string): Promise<FormFieldDefinition[]> {
    const attributes = await this.getMasterAttributes();
    
    return attributes
      .filter(attr => 
        attr.isChannelField || 
        (attr.supportedChannels.includes(channelId) && attr.category === 'channel_specific')
      )
      .map(attr => this.convertToFormField(attr))
      .sort((a, b) => a.priority - b.priority);
  }

  private isRelevantForCategory(attribute: MasterAttribute, category: string): boolean {
    // Always include core attributes
    if (['identification', 'pricing', 'inventory', 'shipping', 'seo'].includes(attribute.category)) {
      return true;
    }
    
    // Include category-specific attributes
    if (attribute.category === `category_specific_${category}`) {
      return true;
    }
    
    // Include variant attributes for all categories
    if (attribute.group === 'variant' || attribute.category === 'variant_attributes') {
      return true;
    }
    
    // Include option attributes
    if (attribute.group === 'option' || attribute.category === 'option_attributes') {
      return true;
    }
    
    return false;
  }

  private convertToFormField(attribute: MasterAttribute, category?: string): FormFieldDefinition {
    const inputType = this.determineInputType(attribute);
    const section = this.determineSection(attribute, category);
    
    return {
      ...attribute,
      inputType,
      placeholder: this.generatePlaceholder(attribute),
      helpText: this.generateHelpText(attribute),
      section,
      displayOrder: 0 // Will be set during sorting
    };
  }

  private determineInputType(attribute: MasterAttribute): FormFieldDefinition['inputType'] {
    if (attribute.validationRules.enum) {
      return 'select';
    }
    
    switch (attribute.dataType.toLowerCase()) {
      case 'number':
      case 'decimal':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'checkbox';
      case 'date':
        return 'date';
      case 'text':
      case 'string':
      default:
        // Use textarea for long text fields
        if (attribute.validationRules.maxLength && attribute.validationRules.maxLength > 255) {
          return 'textarea';
        }
        return 'text';
    }
  }

  private determineSection(attribute: MasterAttribute, _category?: string): FormFieldDefinition['section'] {
    // Channel-specific fields
    if (attribute.isChannelField || attribute.category === 'channel_specific') {
      return 'channel_specific';
    }
    
    // Variant fields
    if (attribute.group === 'variant' || attribute.category === 'variant_attributes') {
      return 'variants';
    }
    
    // Essential fields (priority 1, required, or core identification)
    if (attribute.priority === 1 || 
        attribute.required || 
        ['id', 'name', 'sku', 'price', 'description'].includes(attribute.fieldName)) {
      return 'essential';
    }
    
    // Everything else is advanced
    return 'advanced';
  }

  private generatePlaceholder(attribute: MasterAttribute): string {
    const baseText = attribute.description.toLowerCase();
    
    // Use the attribute data type to determine placeholder
    if (attribute.validationRules.enum) {
      return `Select ${baseText}`;
    }
    
    switch (attribute.dataType.toLowerCase()) {
      case 'number':
      case 'decimal':
      case 'integer':
        return `Enter ${baseText} (number)`;
      default:
        return `Enter ${baseText}`;
    }
  }

  private generateHelpText(attribute: MasterAttribute): string {
    let help = attribute.description;
    
    if (attribute.validationRules.pattern) {
      help += ` (Format: ${attribute.validationRules.pattern})`;
    }
    
    if (attribute.validationRules.minLength || attribute.validationRules.maxLength) {
      const min = attribute.validationRules.minLength || 0;
      const max = attribute.validationRules.maxLength || 'unlimited';
      help += ` (Length: ${min}-${max} characters)`;
    }
    
    if (attribute.supportedChannels.length < 9) {
      help += ` (Supported by: ${attribute.supportedChannels.join(', ')})`;
    }
    
    return help;
  }
}

// Singleton instance
export const masterAttributesService = new MasterAttributesService();