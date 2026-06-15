# Category Architecture Analysis — Platform Type & Design Decisions

**Written:** 2026-06-15  
**Status:** Active — informs all future category-related development  
**Scope:** Product categories, channel category mapping, importCapable, platform taxonomy

---

## Platform Type: Pure Channel Management — No Storefront

This platform is architecturally equivalent to **Ginee Omnichannel** (Sea Group, dominant
in Southeast Asia). It is a **pure channel management tool** — a command center that helps
merchants manage product listings across multiple marketplaces from one place.

**What this means:**

- Merchants have their own stores on Shopee, Tokopedia, Lazada, TikTok Shop, Shopify, etc.
- This platform connects to those stores and synchronizes products, inventory, and orders.
- **No customer ever visits a "platform storefront."** There is no `mybrand.ourplatform.com`.
- Platform categories are **invisible to end customers** — they exist only inside the
  merchant's dashboard.

**What this does NOT mean:**

- Platform categories are useless — they still serve as internal organization for filtering,
  bulk operations, and reporting.
- Channel category mapping is useless — merchants still need to set the correct channel
  category per channel when publishing products.

The distinction is about **who is the audience** of platform categories:
- With storefront → customers browse them → they must be well-structured, SEO-optimized,
  and stable.
- Without storefront (this platform) → only the merchant's operations team sees them →
  they can be lightweight, flexible, and channel-agnostic.

---

## How Successful Ginee-Like Platforms Handle Categories

### Ginee (Sea Group)

Ginee is the closest analogue to this platform. Their approach:

**Master Product has no "platform category" field.**  
Tags and labels are used for internal filtering — flat, not hierarchical.

**Channel category is a per-listing attribute.**  
When a merchant pushes a master product to Shopee, they select the Shopee category at that
moment. When pushing to Tokopedia, they select the Tokopedia category independently.
The two are completely separate. There is no intermediate mapping table.

**Bulk efficiency via listing templates/profiles.**  
For merchants with thousands of products, Ginee provides listing templates: "for products
tagged `kaos-pria`, default Shopee category to X, Tokopedia category to Y." The template
applies the channel category automatically — no category mapping table required.

### Linnworks (UK, oldest mature platform)

Linnworks spent years trying to build a unified category taxonomy and eventually abandoned
it. Their current approach:

- Categories in Linnworks = tags for filtering only. Not hierarchical.
- Channel listings have their own category fields, set directly per product per channel.
- No "category mapping table" exists. Channel category is just another channel-specific
  attribute alongside price, title, and description.

### ChannelAdvisor / CommerceHub (Enterprise)

ChannelAdvisor's insight after serving enterprise retailers for 15+ years:

> *"We tried a unified category tree mapping to all channels. After 5 years we threw it out.
> Product type classification works. Category hierarchy mapping does not."*

Their model: classify products by **Product Type** (channel-agnostic noun: "Men's T-Shirt").
A channel profile then maps Product Type → channel category automatically. No per-merchant
category tree required.

---

## Diagnosis: Current Architecture vs Platform Reality

### What is correctly implemented

**`CategoryTreePicker` in Step 2 Wizard** — This is the right pattern.

The Step 2 wizard already allows merchants to browse and select the channel category
per product per channel. This is exactly what Ginee does. Channel category is treated as
a channel-specific attribute of the listing, set at the point of channel configuration —
not derived from a platform category mapping table.

```
Step 2: Channel Fields Wizard
  → Shopee tab → CategoryTreePicker → browse Shopee tree → select leaf → saved to listing
  → Tokopedia tab → CategoryTreePicker → browse Tokopedia tree → select separately
  → Lazada tab → CategoryTreePicker → browse Lazada tree → select separately
```

This is architecturally sound for a Ginee-like platform. ✅

---

### What is over-engineered relative to platform type

**1. Platform Category Taxonomy (rigid parent-child hierarchy)**

A rigid hierarchical taxonomy (`product_categories` with parent, children, path, depth,
level fields) has its strongest justification when it powers website navigation — customers
browse `Electronics > Phones > Smartphones` on the merchant's website. Without a storefront,
this justification disappears.

What is actually needed for pure channel management:
- Flat tags or labels (e.g., `kaos-pria`, `elektronik`) for filtering in dashboard
- Product type classification for bulk operations
- Not a rigid multi-level taxonomy with provisioning, templates, and import wizards

**2. Channel Category Mapping Page (`/omni-admin/channel-category-mapping`)**

This page creates a mapping table: platform category → channel category per store. The
conceptual model assumes platform categories are canonical and persistent enough to serve
as a bridge between the master product and all channel listings.

For a storefront platform, this makes sense — the website category "Electronics" maps to
Shopify taxonomy "Electronics & Technology" maps to Shopee category 100045. All three are
stable entities managed by different teams.

For a pure channel management platform, this layer adds overhead without clear benefit
beyond what listing templates or bulk rules could provide more simply.

**3. `ImportCapable` as an architectural concept**

`importCapable` was designed to allow merchants to import their WooCommerce/Etsy/Wix
collections as platform categories. The intent is to reduce onboarding friction.

However, for a Ginee-like platform, this creates a conceptual problem:

- A Ginee merchant who migrates from WooCommerce does NOT need their WooCommerce categories
  to become platform categories. They need to:
  1. Import their **products** into the master product list
  2. When publishing back to WooCommerce, select the appropriate WooCommerce collection
     per product (via listing configuration, not a category mapping table)

- WooCommerce collections and platform categories serve different purposes in this model:
  WooCommerce collections are how WooCommerce organizes the merchant's store.
  Platform categories (if they exist) are how the merchant organizes their operations dashboard.
  These do not need to be the same thing.

---

## The Import Capable Question — Architectural Tension

The current `importCapable` flow:
```
WooCommerce Collections → [import] → Platform Categories → [mapping] → WooCommerce Collections
```

This is circular. The result is that platform categories become shadows of WooCommerce
collections — named the same, structured the same — because they came from there.

For a storefront platform, this makes sense: the merchant is migrating their entire store,
so the website category structure should mirror the channel they're coming from.

For a Ginee-like platform, the circular dependency reveals that the abstraction is not
needed. What the merchant actually wants is: "I want my WooCommerce products to be organized
in my WooCommerce store the same way they are now." That goal is achieved by publishing
products WITH the correct WooCommerce collection assigned per product — not by recreating
the WooCommerce category tree inside the platform.

---

## Recommendations for Future Development

### Short term — do not break what works

The current implementation is functional. Step 2 `CategoryTreePicker` is correctly built.
The channel category mapping page has invested engineering that is working. Do not discard
these for architectural purity.

### Medium term — simplify the category taxonomy

When the platform category system is next redesigned or extended:
- Move away from rigid parent-child taxonomy toward **flat tags + product type**
- Product type (e.g., "Men's T-Shirt", "Electronics", "Home Goods") is the more powerful
  abstraction for a channel management platform
- Channel category rules/profiles: "all products of type `Men's T-Shirt` → Shopee
  category 100001, Tokopedia category 30045" — this replaces the category mapping table

### Long term — channel category as a product attribute

The Linnworks/ChannelAdvisor-proven pattern for pure channel management:

```
Master Product
  ├── name, description, price, stock, variants, images
  ├── product_type: "Men's T-Shirt"           ← classification, not hierarchy
  ├── tags: ["kaos", "pria", "basic"]          ← filtering
  ├── channel_listings:
  │     ├── shopee: { category_id: 100001, ... }
  │     ├── tokopedia: { category_id: 30045, ... }
  │     └── lazada: { category_id: 7890, ... }
```

Channel category lives directly on the channel listing record — not in a separate mapping
collection bridged via platform categories. This eliminates the need for:
- Platform category taxonomy
- Category mapping table
- `importCapable` / `taxonomyEnabled` / `treeCapable` flags for mapping routing
- Import wizard that creates platform categories from channel collections

The `CategoryTreePicker` in Step 2 remains — its job is to help the merchant browse and
select the channel category when setting up a channel listing. The picker's result is
saved directly to the channel listing, not to a mapping table.

---

## ImportCapable — One-Time Onboarding Design (If Retained)

If `importCapable` is retained (acceptable given existing investment), the architectural
principle that reduces the inconsistency risk is:

> **Import is a one-time bootstrapping event, not an ongoing feature.**

**At onboarding, merchant chooses one of two paths:**

```
Path A: Import from Channel                Path B: Platform Category Template
"I have categories on WooCommerce.         "I'm starting fresh. Use the platform's
 Use them as my starting point."            standard category structure."
         ↓                                          ↓
 Platform categories created               Platform categories provisioned
 + WooCommerce mapping auto-formed          (no mapping yet)
         ↓                                          ↓
         └──────────────┬─────────────────────────────┘
                        ↓
         AFTER ONBOARDING: platform categories are master.
         All additions and changes made directly here.
         No re-import. No re-provisioning.
```

**Key constraints:**
- Grace period of 7–14 days where the choice can be reversed (before deep entanglement)
- Clear warning at onboarding that this is a significant, hard-to-reverse decision
- Migration wizard for post-grace-period changes (complex but documented — see below)
- The choice is recorded in `organization.categorySourceOrigin: "import" | "template"`

**Migration procedure (if merchant wants to switch after grace period):**

1. Provision new template categories (run alongside existing, do not delete yet)
2. Bulk-reassign products from old categories to new template categories
3. Migrate all channel mappings to follow the product reassignment
4. Delete old imported categories (safe once steps 2-3 complete)
5. Re-sync affected channel listings

Complexity grows non-linearly with time elapsed since onboarding. The grace period and
onboarding warning exist specifically to minimize how often this migration is needed.

---

## Summary Table

| Aspect | Storefront Platform | This Platform (Ginee-like) |
|---|---|---|
| **Customer sees categories?** | Yes — website navigation | No — internal only |
| **Platform categories purpose** | Website nav + SEO + breadcrumb | Internal filtering and bulk ops |
| **Category hierarchy depth** | Deep, curated, stable | Flat or shallow, flexible |
| **Import from channel** | Valid — migrating a website | Questionable — no website to migrate |
| **Category mapping table** | Justified — canonical bridge | Overhead — channel category can be per-product attribute |
| **Category templates** | High value — website structure | Lower value — no customer impact |
| **Best abstraction** | Category taxonomy | Product type + tags + listing profiles |
| **Reference platforms** | Shopify, BigCommerce, WooCommerce | Ginee, Linnworks, ChannelAdvisor |

---

## Related Documents

- `05-channel-category-mapping.md` — current implementation detail
- `09-channel-category-mapping-frontend.md` — frontend routing and modal logic
- `10-merchant-categories.md` — merchant CRUD on their own category tree
- `02-api-reference/07-channel-category-api-config.md` — `treeCapable` backend recommendation
