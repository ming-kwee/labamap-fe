# Claude Code Configuration

This file contains configuration and commands for Claude Code to help with development tasks.

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