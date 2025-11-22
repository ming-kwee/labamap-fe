# Linnworks Template Creation: Step-by-Step Wireframe Analysis

## Overview

Linnworks provides a sophisticated template creation system for multi-channel e-commerce management. This document analyzes their step-by-step process with wireframes showing how users create templates for Amazon, eBay, Shopify, and other channels.

---

## Method 1: Template Creation via Inventory

### Step 1: Access Template Creation from Inventory
```
┌─────────────────────────────────────────────────────────────────┐
│                    MY INVENTORY                                  │
├─────────────────────────────────────────────────────────────────┤
│ [Search] [Filters]                              [Add New Item]  │
├─────────────────────────────────────────────────────────────────┤
│ ☑ SKU: WH-001    │ Wireless Headphones │ Stock: 150 │ £99.99   │
│ ☑ SKU: SM-002    │ Smartphone Case     │ Stock: 75  │ £15.99   │ 
│ ☑ SKU: KB-003    │ Bluetooth Keyboard  │ Stock: 200 │ £45.50   │
├─────────────────────────────────────────────────────────────────┤
│                 Right-click selected items                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Edit Item                                                   │ │
│ │ ► Edit EBAY listing(s)          ← Template Creation Entry   │ │
│ │ ► Edit AMAZON listing(s)        ← Template Creation Entry   │ │
│ │ ► Edit SHOPIFY listing(s)       ← Template Creation Entry   │ │
│ │ Duplicate Item                                              │ │
│ │ Delete Item                                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**User Journey**: Users select inventory items → Right-click → Choose channel template creation

### Step 2: Channel Template Selection
```
┌─────────────────────────────────────────────────────────────────┐
│                    SELECT TEMPLATE TYPE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Select the sales channel for template creation:                 │
│                                                                 │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │
│ │   📦 AMAZON     │ │   🔨 EBAY       │ │  🛍️ SHOPIFY     │      │
│ │                 │ │                 │ │                 │      │
│ │ • Product Feed  │ │ • Auction Style │ │ • Online Store  │      │
│ │ • Buy Box       │ │ • Buy It Now    │ │ • Collections   │      │
│ │ • FBA Support   │ │ • Best Offer    │ │ • SEO Optimized │      │
│ │                 │ │                 │ │                 │      │
│ │   [Select]      │ │   [Select]      │ │   [Select]      │      │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘      │
│                                                                 │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │
│ │  🛒 WALMART     │ │  📱 FACEBOOK    │ │  🌐 CUSTOM      │      │
│ │                 │ │                 │ │                 │      │
│ │   [Select]      │ │   [Select]      │ │   [Select]      │      │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘      │
│                                                                 │
│            [Cancel]                    [Continue]               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Method 2: Template Management via Settings

### Step 1: Access Template Settings
```
┌─────────────────────────────────────────────────────────────────┐
│                        SETTINGS                                 │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐                                             │
│ │ SETTINGS MENU   │   Template Management Dashboard             │
│ │                 │                                             │
│ │ • General       │   ┌─────────────────────────────────────┐   │
│ │ • Users         │   │        TEMPLATE OVERVIEW            │   │
│ │ • Integrations  │   │                                     │   │
│ │ ► Configurators │   │ Active Templates: 24                │   │
│ │   └► Templates  │   │ Draft Templates: 3                  │   │
│ │ • Locations     │   │ Last Modified: 2 hours ago          │   │
│ │ • Automation    │   │                                     │   │
│ │                 │   │ [+ Create New Template]             │   │
│ └─────────────────┘   └─────────────────────────────────────┘   │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                TEMPLATE LIST                            │   │
│   ├─────────────────────────────────────────────────────────┤   │
│   │ Name          │ Channel │ Status   │ Items │ Modified   │   │
│   ├─────────────────────────────────────────────────────────┤   │
│   │ Electronics   │ Amazon  │ Active   │ 156   │ Today      │   │
│   │ Fashion Items │ eBay    │ Active   │ 89    │ Yesterday  │   │
│   │ Home & Garden │ Shopify │ Draft    │ 12    │ 3 days ago │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 3: Template Configuration Wizard (Example: Amazon)

### Phase 1: Basic Template Information
```
┌─────────────────────────────────────────────────────────────────┐
│           AMAZON LISTING TEMPLATE - STEP 1 of 6                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Template Configuration                                          │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Template Name: [Electronics - Amazon Standard    ]         │ │
│ │                                                             │ │
│ │ Description:   [Amazon listing template for electronic...] │ │
│ │                                                             │ │
│ │ Category:      [Electronics ▼]                             │ │
│ │                                                             │ │
│ │ SKU Selection: ○ All Items  ● Selected Items (3)          │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Selected Items Preview:                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • WH-001: Wireless Headphones                               │ │
│ │ • SM-002: Smartphone Case                                   │ │
│ │ • KB-003: Bluetooth Keyboard                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [← Back]                    [Next: Fields →]      │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Field Mapping Configuration
```
┌─────────────────────────────────────────────────────────────────┐
│           AMAZON LISTING TEMPLATE - STEP 2 of 6                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Field Mapping Configuration                                     │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ REQUIRED AMAZON FIELDS                                      │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │ Product Title (Max 200 chars)                              │ │
│ │ Master Field: [Product Name ▼]                             │ │
│ │ Custom Format: [{{ProductName}} - {{Brand}} {{Model}}]     │ │
│ │                                                             │ │
│ │ Product ID (GTIN/UPC/EAN)                                   │ │
│ │ Master Field: [Barcode ▼]                                  │ │
│ │ ID Type: [UPC ▼]                                           │ │
│ │                                                             │ │
│ │ Brand                                                       │ │
│ │ Master Field: [Brand ▼]                                    │ │
│ │                                                             │ │
│ │ Manufacturer                                                │ │
│ │ Master Field: [Manufacturer ▼] or [Same as Brand ☑]        │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [← Back]                    [Next: Categories →]   │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Category Selection & Attributes
```
┌─────────────────────────────────────────────────────────────────┐
│           AMAZON LISTING TEMPLATE - STEP 3 of 6                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Category Selection & Product Attributes                         │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AMAZON CATEGORY TREE                                        │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ► Electronics                                               │ │
│ │   ► Computers & Accessories                                 │ │
│ │     ► Computer Accessories & Peripherals                    │ │
│ │       ● Keyboards & Mice                    [Selected]      │ │
│ │         • Keyboards (172282)                                │ │
│ │         • Mice (172283)                                     │ │
│ │                                                             │ │
│ │ Category Requirements:                                      │ │
│ │ ☑ Connection Type (Required)                                │ │
│ │ ☑ Compatible Devices (Recommended)                          │ │
│ │ ☑ Color (Optional)                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ATTRIBUTE MAPPING                                           │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Connection Type: [Bluetooth ▼]                             │ │
│ │ Compatible Devices: [{{CompatibilityList}}]                │ │
│ │ Color: [{{ProductColor}}]                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [← Back]                    [Next: Pricing →]      │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 4: Pricing & Inventory Rules
```
┌─────────────────────────────────────────────────────────────────┐
│           AMAZON LISTING TEMPLATE - STEP 4 of 6                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Pricing Strategy & Inventory Management                         │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ PRICING RULES                                               │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │ Base Price Source: ● Master Price  ○ Cost + Markup         │ │
│ │                                                             │ │
│ │ Amazon Fee Adjustment: [15%] (Auto-calculated)             │ │
│ │ Additional Markup: [5%]                                     │ │
│ │                                                             │ │
│ │ Competitive Pricing:                                        │ │
│ │ ☑ Enable Buy Box monitoring                                 │ │
│ │ ☑ Auto-adjust to stay competitive                          │ │
│ │ Min Margin Protection: [10%]                               │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ INVENTORY SYNC                                              │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Stock Level Sync: ● Real-time  ○ Daily  ○ Manual          │ │
│ │ Low Stock Warning: [5] units                               │ │
│ │ Out of Stock Action: ● Hide Listing  ○ Mark Unavailable   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [← Back]                    [Next: Content →]      │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 5: Content & Images
```
┌─────────────────────────────────────────────────────────────────┐
│           AMAZON LISTING TEMPLATE - STEP 5 of 6                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Product Content & Media Configuration                           │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ PRODUCT DESCRIPTION                                         │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Description Source: ● Master Description                    │ │
│ │                     ○ Custom Template                       │ │
│ │                                                             │ │
│ │ Template Format:                                            │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ {{ProductDescription}}                                  │ │ │
│ │ │                                                         │ │ │
│ │ │ Key Features:                                           │ │ │
│ │ │ {{#each Features}}                                      │ │ │
│ │ │ • {{this}}                                             │ │ │
│ │ │ {{/each}}                                              │ │ │
│ │ │                                                         │ │ │
│ │ │ Specifications: {{SpecificationTable}}                 │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ IMAGE MANAGEMENT                                            │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Primary Image: [Browse] [Use Master Image ☑]               │ │
│ │ Additional Images: [Auto-sync all product images ☑]        │ │
│ │ Image Optimization: [Resize to Amazon specs ☑]             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [← Back]                    [Next: Review →]       │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 6: Review & Template Validation
```
┌─────────────────────────────────────────────────────────────────┐
│           AMAZON LISTING TEMPLATE - STEP 6 of 6                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Template Review & Validation                                    │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ VALIDATION STATUS                              ✅ All Valid  │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ✅ Required fields mapped                                   │ │
│ │ ✅ Category selected                                        │ │
│ │ ✅ Product IDs valid                                        │ │
│ │ ✅ Images configured                                        │ │
│ │ ⚠️  3 products missing brand information                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ PREVIEW                                                     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Product: Wireless Headphones - TechBrand Pro               │ │
│ │ Price: £99.99 (inc. Amazon fees & markup)                  │ │
│ │ Category: Electronics > Audio > Headphones                 │ │
│ │ Images: 4 images configured                                 │ │
│ │                                                             │ │
│ │ [View Full Preview]  [Test Amazon API]                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ TEMPLATE ACTIONS                                            │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ○ Save as Draft                                             │ │
│ │ ● Save and Create Listings                                  │ │
│ │ ○ Save and Schedule for Later                               │ │
│ │                                                             │ │
│ │ Notification Settings:                                      │ │
│ │ ☑ Email when listings are created                          │ │
│ │ ☑ Alert if validation fails                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│              [← Back]      [Save Template]    [Create Now]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Template Management Dashboard

### Post-Creation Template Management
```
┌─────────────────────────────────────────────────────────────────┐
│                    TEMPLATE DASHBOARD                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Active Template: Electronics - Amazon Standard                  │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ TEMPLATE PERFORMANCE                                        │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 📊 156 Products Listed                                      │ │
│ │ ✅ 142 Successfully Created                                  │ │
│ │ ⚠️  14 With Warnings                                        │ │
│ │ ❌ 0 Failed                                                 │ │
│ │                                                             │ │
│ │ Last Sync: 15 minutes ago                                   │ │
│ │ Success Rate: 91%                                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ QUICK ACTIONS                                               │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ [Edit Template]  [Duplicate]  [Run Sync]  [View Listings] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ RECENT ACTIVITY                                             │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 10:45 AM - 12 new listings created                         │ │
│ │ 09:30 AM - Template updated: pricing rules                 │ │
│ │ 08:15 AM - Bulk update: 45 products synced                 │ │
│ │ Yesterday - Category mapping updated                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key UX Design Patterns in Linnworks

### 1. **Progressive Disclosure**
- Multi-step wizard breaks complex configuration into manageable chunks
- Each step focuses on a specific aspect (fields, categories, pricing, content)
- Users can navigate back and forth to refine settings

### 2. **Smart Defaults & Validation**
- Red highlighting indicates missing or invalid data
- Real-time validation prevents errors before template creation
- Auto-calculation of fees and pricing adjustments

### 3. **Flexible Data Mapping**
- Dropdown selection from master fields
- Custom template formatting with variables
- Support for complex mappings (one-to-many, conditional logic)

### 4. **Channel-Specific Intelligence**
- Different workflows for Amazon, eBay, Shopify based on platform requirements
- Category trees specific to each marketplace
- Platform-specific validation rules

### 5. **Bulk Operations Focus**
- Templates designed for multiple products simultaneously
- Bulk listing creation and management
- Performance monitoring for large-scale operations

### 6. **Error Prevention & Recovery**
- Warning system for missing data
- Preview functionality before committing
- Ability to save as draft for incremental building

---

## Comparison with Our Implementation

### Similarities:
- Multi-step wizard approach
- Field mapping from master data to channel-specific fields
- Category selection and attribute mapping
- Template reusability

### Key Differences:
- **Linnworks**: More inventory-centric, starts from existing products
- **Our System**: More template-centric, creates reusable mapping rules
- **Linnworks**: Platform-specific wizards
- **Our System**: Unified wizard with channel tabs
- **Linnworks**: Heavy focus on bulk operations and performance monitoring
- **Our System**: More focused on template creation and field transformation

### Learning Opportunities:
1. **Better validation feedback** with red highlights for missing data
2. **Performance monitoring** for template usage and success rates
3. **Smart defaults** based on product categories
4. **More granular pricing rules** with competitive monitoring
5. **Enhanced preview functionality** with full listing preview