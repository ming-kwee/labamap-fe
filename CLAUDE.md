# Claude Code Configuration

This file contains configuration and commands for Claude Code to help with development tasks.

---

## Platform Identity — Read This First

**This platform is a pure channel management tool — equivalent to Ginee Omnichannel (Sea Group).**

It is NOT a storefront builder. It does NOT power merchant websites. No customer ever
visits a storefront on this platform. Merchants use this platform to manage their product
listings across multiple marketplaces (Shopee, Tokopedia, Lazada, TikTok Shop, Shopify
stores, WooCommerce stores, Amazon, eBay, etc.) from one dashboard.

### Architectural implications of this

| Concern | Implication |
|---|---|
| **Platform categories** | Internal filtering and bulk ops only — no customer ever sees them |
| **Category hierarchy** | Should trend toward flat tags + product type, not deep rigid taxonomy |
| **Channel category** | Is a per-listing attribute (set in Step 2 wizard), not derived from a mapping table |
| **Import from channel** | One-time onboarding bootstrapping only — not an ongoing sync |
| **Category templates** | Useful for operations convenience, not for website navigation |
| **Reference architecture** | Ginee, Linnworks, ChannelAdvisor — NOT Shopify, WooCommerce, BigCommerce |

### What is correctly built (aligned with platform type)

- `CategoryTreePicker` in Step 2 wizard — merchants browse and select channel category
  per product per channel at the point of listing configuration. This is the Ginee pattern.
- Channel credential management, OAuth flow, store connections — all correct.
- Master product → channel listing publishing pipeline — correct direction.

### What carries architectural tension (storefront assumptions)

- `channel_category_mappings` table (platform category → channel category mapping)
  was designed with storefront assumptions. It works, but the abstraction is heavier
  than needed for a pure channel management platform.
- `importCapable` (import WooCommerce/Etsy/Wix collections as platform categories)
  makes more sense for a storefront migration than for Ginee-like channel management.
- Rigid parent-child category taxonomy has its strongest justification in website navigation.

Full analysis: `docs/product/01-catalog-schema/01-guides/11-category-architecture-analysis.md`

---

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

## Project Structure

- `src/components/auth/` - Authentication components (SignInForm, SignUpForm)
- `src/app/(full-width-pages)/(auth)/` - Authentication pages and routes
- `src/components/form/` - Reusable form components
- `src/components/ui/` - UI components library
- `src/layout/` - Layout components including sidebar and header
- `src/components/products/` - **NEW** Omnichannel product management system
- `src/app/(admin)/products/` - **NEW** Product management routes

## Authentication System

The project includes UI components for authentication:
- Sign in form with email/password and social login options
- Sign up form with user registration fields
- Password visibility toggles and form validation styling
- Social authentication buttons (Google, X/Twitter) - UI only, not connected

## **NEW: Omnichannel Master Product System**

A complete product management solution with the following features:

### Core Features
- **Product Basics**: Name, description, SKU, barcode, tags with AI content generation
- **Pricing & Inventory**: Multi-currency pricing, bulk pricing tiers, inventory tracking across locations
- **Images & Media**: Drag-drop upload, AI alt text generation, video support, image optimization
- **Product Variants**: Dynamic variant generation, bulk editing, SKU management
- **Shipping & Details**: Physical dimensions, weight, shipping classes
- **SEO & Marketing**: Meta optimization, keyword management, AI-powered content generation
- **Channel Sync**: Multi-platform integration (Shopify, Amazon, eBay, Facebook, etc.)
- **Publish Settings**: Scheduling, automation, visibility controls

### Enhanced Features
- **Analytics Dashboard**: Product performance metrics, conversion tracking
- **Customer Reviews**: Review management, rating analysis
- **Product Bundles**: Cross-sell opportunities, bundle creation
- **AI-Powered Tools**: Content generation, SEO optimization, alt text creation
- **Bulk Operations**: Mass editing, batch processing
- **Smart Insights**: Performance recommendations, completion tracking

### Technical Features
- **Responsive Design**: Works on all device sizes
- **Dark Mode**: Full dark/light theme support
- **Real-time Updates**: Live data synchronization
- **Progress Tracking**: Visual completion indicators
- **Modern UI/UX**: Clean, intuitive interface following design system
- **TypeScript**: Fully typed for better development experience

### Access the Product Manager
Navigate to `/products/create` to access the complete product management interface.

## Notes

- Authentication forms are currently UI-only without backend integration
- Product management system is fully functional with mock data
- Real API integration needed for production use
- All components follow the existing design system and patterns