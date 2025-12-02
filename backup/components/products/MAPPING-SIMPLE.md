# Simple Guide: How Product Data Gets to Different Channels

## The Big Picture

Think of it like **translating a recipe into different languages** - you have one master recipe, but each language has different words and formats.

```
Master Product Data  →  [Translation System]  →  Channel-Specific Data
     (English)                                        (Spanish, French, etc.)
```

## Part 1: What Are Templates?

**Templates are like "translation rules"** that tell the system:
- Which master fields to use
- How to format them for each channel
- What to do if data is missing

### Simple Example:

**Master Data:**
```
Product Name: "Wireless Headphones"
Brand: "TechCorp"  
Price: $99.99
```

**Template Rule:**
```
Amazon Title = Brand + " " + Product Name + " - Premium Quality"
eBay Title = Product Name + " by " + Brand
```

**Results:**
```
Amazon: "TechCorp Wireless Headphones - Premium Quality"
eBay: "Wireless Headphones by TechCorp"
```

---

## Part 2: How Do Fields Get Included?

### Step 1: Select Master Fields
```
┌─────────────────────────────────────┐
│ ☑ Product Name                      │
│ ☑ Brand                            │
│ ☑ Price                            │
│ ☐ Weight                           │
│ ☐ Dimensions                       │
└─────────────────────────────────────┘
```
*User checks which fields they want to use*

### Step 2: Map to Channels
```
Master Field        →    Amazon Field       →    eBay Field
┌─────────────┐     ┌─────────────────┐    ┌──────────────┐
│Product Name │ ──→ │ Title           │    │ Item Title   │
│Brand        │ ──→ │ Brand           │    │ Manufacturer │
│Price        │ ──→ │ Price           │    │ Starting Bid │
└─────────────┘     └─────────────────┘    └──────────────┘
```

### Step 3: Apply Transformation Rules
```
Simple Mapping:     Product Name → Title (no change)
Concatenation:      Brand + Product Name → "TechCorp Wireless Headphones"
Formatting:         Price $99.99 → "99.99 USD"
```

---

## Part 3: Channel-Specific Fields (The Special Cases)

Some channels have **unique fields** that don't exist in your master data.

### Example: Amazon has special fields
```
Amazon Requires:
┌─────────────────────────┐
│ ✓ Title (from master)   │
│ ✓ Price (from master)   │
│ ? Bullet Point 1        │  ← NOT in master data
│ ? Bullet Point 2        │  ← NOT in master data  
│ ? Search Keywords       │  ← NOT in master data
└─────────────────────────┘
```

### How This Works:
1. **System asks you:** "Amazon needs Bullet Points - what should we put there?"
2. **You can:**
   - Type custom text: "Premium sound quality"
   - Use a template: "Experience {Product Name} with {Brand} technology"
   - Leave empty (system will auto-generate or skip)

---

## Visual Wireframe: The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 1: MASTER PRODUCT                      │
├─────────────────────────────────────────────────────────────────┤
│ Product Name: "Wireless Headphones"                            │
│ Brand: "TechCorp"                                              │
│ Price: $99.99                                                  │
│ Description: "High-quality wireless headphones..."             │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 2: CHOOSE TEMPLATE                     │
├─────────────────────────────────────────────────────────────────┤
│ Template: "Electronics - Amazon & eBay"                        │
│                                                                 │
│ Rules:                                                         │
│ • Amazon Title = Brand + Product Name                          │
│ • eBay Title = Product Name + "by" + Brand                     │
│ • Amazon needs: Bullet Points (we'll create from Description) │
│ • eBay needs: Condition (we'll set to "New")                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 3: FINAL RESULTS                       │
├─────────────────────────────────────────────────────────────────┤
│ AMAZON LISTING:                                                │
│ Title: "TechCorp Wireless Headphones"                         │
│ Price: $99.99                                                  │
│ Bullet Point 1: "High-quality wireless technology"            │
│ Search Terms: "wireless headphones bluetooth"                  │
│                                                                 │
│ EBAY LISTING:                                                  │
│ Title: "Wireless Headphones by TechCorp"                      │
│ Price: $99.99                                                  │
│ Condition: "New"                                               │
│ Category: "Consumer Electronics"                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## The 3 Types of Fields in Final Channel Data

### Type 1: Direct Copy (Simple)
```
Master: Product Name = "Wireless Headphones"
Amazon: Title = "Wireless Headphones"
```

### Type 2: Transformed (Template-Based)  
```
Master: Brand="TechCorp", Product Name="Wireless Headphones"
Amazon: Title = "TechCorp Wireless Headphones" (combined)
```

### Type 3: Channel-Only (Custom Fields)
```
Master: (doesn't have "Bullet Points")
Amazon: Bullet Point 1 = "Premium sound quality" (you typed this)
```

---

## Real User Interface Example

When you're setting up a template, you see something like this:

```
┌──────────────────── MAPPING BUILDER ────────────────────┐
│                                                          │
│ Amazon Title Field:                                      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [Brand] + " " + [Product Name] + " - Premium"       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ Amazon Bullet Point 1:                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ High-quality [Product Name] with premium features   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ [Save Template]  [Test with Sample Data]                │
└──────────────────────────────────────────────────────────┘
```

---

## Summary in Plain English

1. **Templates = Translation Rules** - They tell the system how to convert your master product data into what each channel needs

2. **Field Inclusion = You Choose** - You pick which master fields to use and how to transform them

3. **Channel-Specific Fields = Extra Stuff** - Each channel can have special fields that don't exist in your master data. You fill these in separately or use templates to auto-generate them.

4. **Final Result** - Each channel gets exactly what it needs: some data from master (maybe transformed), plus any channel-specific extras.

It's like having a smart assistant that knows how to speak Amazon, eBay, Shopify, etc., and can translate your single product description into the "language" each platform understands.