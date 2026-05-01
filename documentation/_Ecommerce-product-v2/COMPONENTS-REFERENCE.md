# Components Reference

All components live under `step1-create/components/`. They are pure presentational or
lightly stateful UI components — all business logic lives in the hooks.

---

## ProductCreatePage

**File:** `step1-create/components/ProductCreatePage.tsx`

The **entry point** for Step 1. It is the only component consumers need to import.
It reads auth and org context, guards against unauthenticated access, renders the
organization info bar, and passes derived values down to `ProductCreateForm`.

### Props

```ts
interface ProductCreatePageProps {
  onProductCreated: (product: MasterProduct, availableChannels: string[]) => void;
}
```

`onProductCreated` is called when the product is successfully created and the backend
returns the `MasterProduct` object. The parent page uses this to redirect to Step 2
and pass the available channels list.

### Rendering Flow

```
ProductCreatePage renders
      │
      ├── authLoading || orgLoading
      │       └── Loading spinner (full-page centered)
      │
      ├── !isAuthenticated || !user || !organization
      │       └── Alert (destructive) — "Authentication required"
      │
      ├── orgError
      │       └── Alert (destructive) — "Failed to load org config: {orgError}"
      │
      └── authenticated & loaded
              ├── Org Info Bar
              │     ├── Organization name + businessDomain + subscriptionTier
              │     ├── User name + role
              │     └── Business Rules status indicator (if businessRulesConfig exists)
              │
              └── ProductCreateForm (with derived props)
```

### Derived Values Passed to Form

```ts
userId:                      user.userId
organizationId:              organization.organizationId
userRole:                    mapUserRole(user.role)          // → 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER'
targetChannels:              getAssignedChannels()
assignedCategories:          getAssignedCategories()
organizationDefaultCategory: organizationConfig?.configuration?.businessSettings?.defaultProductCategory || 'general'
```

---

## ProductCreateForm

**File:** `step1-create/components/ProductCreateForm.tsx`

The form orchestrator. Wires all 6 hooks, computes the schema-driven section list, and
routes each section to the appropriate section component. Does not read auth/org context —
it receives everything as props.

### Props

```ts
interface ProductCreateFormProps {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  assignedCategories: string[];
  organizationDefaultCategory: string;
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Record<string, any>;     // Pre-populate form (e.g. from draft)
}
```

### Rendered Layout (top to bottom)

```
1. Header
   "Create Product" title
   "Fill in essential product details" / "Complete product information" subtitle
   "Show JSON Preview" toggle button

2. Category loading indicator
   Alert with spinner — visible while isAddingCategoryFields = true

3. Submit error
   Alert (destructive) — visible when submitError is set

4. ValidationSummary
   Visible when showValidation = true && validationResult is set

5. Schema-driven section cards [one per entry in sortedSections]
   Each section is a collapsible Card
   BasicInfoSection | PricingSection | MediaSection | ShippingSection
   (section routing based on sectionKey — see below)

6. VariantsSection
   Always rendered when variantConfigurator field exists in schema
   (independently of sortedSections)

7. JSON preview card
   Visible when showJsonPreview = true
   Shows generateMasterProduct() result as formatted JSON

8. Submit row
   "Cancel" button (calls window.history.back())
   "Create Product" button (calls handleSubmit)
   Shows "Creating Product..." with spinner while isSubmitting = true
```

### Section Routing

```ts
function renderSection(sectionKey: string, props: SectionProps): React.ReactNode {
  switch (sectionKey) {
    case 'pricing':   return <PricingSection  key={sectionKey} {...props} />;
    case 'media':     return <MediaSection    key={sectionKey} {...props} />;
    case 'shipping':  return <ShippingSection key={sectionKey} {...props} />;
    default:          return <BasicInfoSection key={sectionKey} {...props} />;
  }
}
```

All section keys are already normalized to kebab-case by `normalizeSectionKey()` before
they reach `sortedSections`. The `default` case handles `'basic-info'`, `'content'`,
`'seo'`, `'taxonomy'`, and any unknown section key from the backend.

### Stable Product ID

```ts
const tempProductIdRef = useRef(`temp_${Date.now()}`);
const productId = formData.id || tempProductIdRef.current;
```

This stable ID is passed to `ImageUploadField` and `VariantConfigurator` so that image
upload paths remain consistent throughout the session before the product is saved.

---

## FieldRenderer

**File:** `step1-create/components/FieldRenderer.tsx`

Dispatches a single `FormField` to the correct input element based on `field.fieldType`.
All section components use this for every field they render.

### Props

```ts
interface FieldRendererProps {
  field: any;                  // FormField from schema
  value: any;                  // Current value from formData[fieldName]
  error?: string;              // Current error from fieldErrors[fieldName]
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
}
```

### Dispatch Table

```ts
const fieldType = (field.fieldType || '').toLowerCase();
const fieldName = field.name || field.fieldName;

fieldType === 'textarea'
  → <textarea name={fieldName} value={value} onChange ... />

fieldType === 'select'
  → <select name={fieldName} value={value}>
       <option value="">{field.placeholder || 'Select...'}</option>
       {field.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
     </select>

fieldType === 'checkbox'
  → <input type="checkbox" checked={!!value} ... />

fieldType === 'image' | 'file' | 'media'
  → <ImageUploadField
       multiple={fieldType === 'media' || fieldType === 'file'}
       value={value || (fieldType === 'image' ? '' : [])}
       maxImages={field.validationRules?.maxItems || 5}
       organizationId={organizationId}
       productId={productId}
     />

else (text, number, email, url, tel, date, etc.)
  → <input
       type={fieldType === 'number' ? 'number' : fieldType === 'email' ? 'email' : 'text'}
       value={value || ''}
     />
```

### Surrounding Structure

Each field is wrapped in:
```
<div className="space-y-2">
  Label row:
    <label>{field.label}{required ? '*' : ''}</label>
    {field.description && info icon with tooltip}

  Input element (from dispatch table above)

  {error && <p class="text-red-600"><AlertCircle />{error}</p>}
  {field.helpText && !error && <p class="text-gray-500"><HelpCircle />{helpText}</p>}
</div>
```

---

## Section Components

**Files:** `sections/BasicInfoSection.tsx`, `sections/PricingSection.tsx`,
`sections/MediaSection.tsx`, `sections/ShippingSection.tsx`

All four generic section components are structurally identical — they render a
collapsible `Card` containing a `FieldRenderer` for each field in the section.

### Props (shared by all four)

```ts
interface SectionProps {
  sectionKey: string;                      // e.g. 'basic-info', 'pricing'
  fields: any[];                           // FormField[] from sortedSections
  isExpanded: boolean;                     // from expandedSections.has(sectionKey)
  onToggle: () => void;                    // toggleSection(sectionKey)
  formData: Record<string, any>;
  fieldErrors: Record<string, string>;
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
}
```

### Card Structure

```
<Card>
  <CardHeader onClick={onToggle} role="button" aria-expanded={isExpanded}>
    <ChevronDown | ChevronRight />
    <SectionIcon className={meta.iconColor} />
    <CardTitle>{meta.label}</CardTitle>
    <Badge>{fields.length} field(s)</Badge>
    {meta.description && <p>{meta.description}</p>}
  </CardHeader>

  {isExpanded && (
    <CardContent>
      {fields.map(field => (
        <FieldRenderer key={fieldName} field={field} value={formData[fieldName]} ... />
      ))}
    </CardContent>
  )}
</Card>
```

The icon and label come from `getSectionMetadata(sectionKey)`:

| sectionKey | Icon | Label |
|---|---|---|
| basic-info | Package (blue) | Basic Information |
| pricing | DollarSign (green) | Pricing & Inventory |
| media | Image (purple) | Images & Media |
| content | FileText (indigo) | Product Content |
| shipping | Truck (orange) | Shipping Details |
| seo | Star (yellow) | SEO & Marketing |
| taxonomy | Tag (pink) | Categories & Tags |
| unknown | Settings (gray) | {title-cased key} |

---

## VariantsSection

**File:** `sections/VariantsSection.tsx`

Special section for product variants. Unlike the generic sections, it has hard-coded
UI for the `hasVariants` toggle and owns the logic for dual-scope field value migration.
See [VARIANT-SYSTEM.md](VARIANT-SYSTEM.md) for the full variant system explanation.

### Props

```ts
interface VariantsSectionProps {
  schema: DynamicFormSchema;
  formData: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;    // handleFieldChange
  onVariantChange: (value: string) => void;             // handleVariantConfiguratorChange
  organizationId: string;
  productId: string;
}
```

Returns `null` if `schema.fields` contains no field with `fieldType === 'variant_configurator'`.

### Render Structure

```
<Card>
  <CardHeader>
    {variantField.label || 'Product Variants'}
    {variantField.description}
  </CardHeader>
  <CardContent>
    ┌─────────────────────────────────────────────────────────────┐
    │ [checkbox] This product has variants                        │
    │            Enable to configure variations (size, color...)  │
    │            [Variants Enabled] / [Variants Disabled] badge   │
    └─────────────────────────────────────────────────────────────┘

    ↓ when hasVariants = false:
    ┌─────────────────────────────────────────────────────────────┐
    │ ⚠ Enable the checkbox above to configure product variants   │
    └─────────────────────────────────────────────────────────────┘

    ↓ VariantConfigurator (always rendered, opacity-60 when disabled)
    <VariantConfigurator ... />
  </CardContent>
</Card>
```

---

## ImageUploadField

**File:** `step1-create/components/ImageUploadField.tsx`

Drag-and-drop image upload with XHR progress tracking. Integrates with GCP Storage via
the backend `MediaUploadService`.

### Props

```ts
interface ImageUploadFieldProps {
  fieldName: string;
  label: string;
  value: string | string[];          // single URL or array of URLs
  onChange: (value: string | string[]) => void;
  multiple?: boolean;                // false for 'image', true for 'media'/'file'
  maxImages?: number;                // default 5
  required?: boolean;
  helpText?: string;
  organizationId: string;
  productId: string;
  error?: string;
  disabled?: boolean;
}
```

### Upload Process

1. User drags/drops file(s) or clicks to open file browser
2. File validation: JPEG, PNG, WEBP, GIF only; max 10 MB each
3. For single: `MediaUploadService.uploadImage(file, orgId, productId, 'main', onProgress)`
4. For multiple: `MediaUploadService.uploadMultipleImages(files, orgId, productId, setProgress)`
5. On success: calls `onChange(newUrl)` or `onChange([...existing, ...newUrls])`
6. On error: `alert()` with error message

### Visual States

- **Idle:** Dashed border drop zone with upload icon and text
- **Dragging:** Blue border + blue background
- **Uploading:** Progress bar items per file (filename + percent + status icon)
- **Has images:** Grid of thumbnail images (2-col on mobile, 3-col on md, 4-col on lg)
- **Disabled:** Gray background, no interactions
- **Error:** Red border on drop zone, red error text below

Image thumbnails have:
- Hover: red ×-button appears in top-right corner
- Single: "Main" badge on bottom-left
- Multiple: index number badge on bottom-left

---

## ValidationSummary

**File:** `step1-create/components/ValidationSummary.tsx`

Renders an `EnhancedValidationResult` returned from backend validation.
Displayed when `showValidation = true` and `validationResult` is set.

### Props

```ts
interface ValidationSummaryProps {
  result: EnhancedValidationResult;
  onClose?: () => void;
  className?: string;
}
```

### Layout

```
┌─────────────────────────────────────────────────────┐
│  [✓ green | ✗ red] Validation Summary message       │
│  N violation(s), M warning(s)           [×close]    │
└─────────────────────────────────────────────────────┘

Metrics row (3 cards):
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ ★ Validation Score │ │ ✓ Rules Executed  │ │ ⏱ Execution Time  │
│     87.5%          │ │       24          │ │      18ms         │
└───────────────────┘ └───────────────────┘ └───────────────────┘

Violations card (if violations.length > 0):
  Each violation:
    [icon] Message                  [ERROR/WARNING/INFO badge]
    Affected fields: field1, field2
    Suggestion: ...
    Rule: RULE_ID • Type: BUSINESS_RULE

Warnings card (if warnings.length > 0):
  Each warning: similar layout without badge

"Cannot Submit" alert (if !canSubmit):
  "Please resolve all ERROR violations before submitting."
```

Score coloring: green ≥ 80, yellow ≥ 60, red < 60.

---

## VariantConfigurator

**File:** `step1-create/components/VariantConfigurator.tsx`

The dynamic variant builder. Detects variant dimensions from the schema, lets users select
option values, generates all cartesian product combinations, and renders a table of variant
rows for data entry.

See [VARIANT-SYSTEM.md](VARIANT-SYSTEM.md) for the complete behavioral documentation.

### Props

```ts
interface VariantConfiguratorProps {
  value?: string;                    // JSON string from formData.variantConfigurator
  onChange: (value: string) => void; // emits JSON string on every change
  schema?: DynamicFormSchema;
  formData?: Record<string, any>;    // needed for conditional visibility
  organizationId?: string;
  productId?: string;
}
```

---

## VariantMultiImageUpload

**File:** `step1-create/components/VariantMultiImageUpload.tsx`

Compact image upload for individual variant rows. Designed to fit in a table cell.

### Props

```ts
interface VariantMultiImageUploadProps {
  variantId: string;             // Used as path segment in upload
  currentImages: string[];       // Current images for this variant
  onImagesChange: (imageUrls: string[]) => void;
  organizationId: string;
  productId: string;
  maxImages?: number;            // default 5
}
```

### Visual Layout

```
[img1][img2][img3] [+] 3/5
```

- Thumbnails are 40×40px with a hover ×-overlay for removal
- `+` button opens file picker (hidden when at max)
- Shows spinner with percentage while uploading
- Error tooltip appears below the row on upload failure
- Upload uses `MediaUploadService.uploadImage()` with XHR progress

Accepts `multiple` in the file input — uploads each file sequentially, updating progress
as a weighted average across the batch.
