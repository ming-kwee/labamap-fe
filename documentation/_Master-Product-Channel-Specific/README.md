# Master Product — Channel-Specific Fields

## What This Module Does

When a master product is created (Step 1 of the product wizard), it contains shared
data across all channels: name, SKU, base price, variants, images. This is intentionally
channel-agnostic.

**Step 2** of the wizard handles the channel layer: each sales channel (Shopify, WIX,
Amazon, etc.) — and each connected store within that channel — has its own required,
recommended, and optional fields that cannot come from the master product alone.

This module defines:
- How multiple stores per channel type are stored (`channel_store_connections`)
- How per-store channel-specific field values are stored (`channel_product_data`)
- How Step 2 form schema is generated dynamically per connected store
- How Step 2 data flows into the publish pipeline

## Why Two Separate Collections

```
channel_configurations          channel_store_connections
(one per channel TYPE)          (one per connected STORE)
──────────────────────          ─────────────────────────
channelId: "shopify"     ◄───  channelType: "shopify"
joltSpec: [...]                 storeId: "shopify-us-store"
postProcessingRules: [...]      storeName: "My Shopify US"
apiSchema: {...}                credentials: { accessToken }
requiredFieldObjects: [...]     organizationId: "org_123"
apiWrapperConfig: {...}
```

`channel_configurations` is the **transformation contract** for a channel type.
`channel_store_connections` is the **physical connection** to a specific store.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full rationale.

## Documents in This Module

| File | What It Covers |
|------|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Two-collection design, data flow, design decisions |
| [CHANNEL-STORE-CONNECTIONS.md](CHANNEL-STORE-CONNECTIONS.md) | `channel_store_connections` entity, service, API |
| [CHANNEL-PRODUCT-DATA.md](CHANNEL-PRODUCT-DATA.md) | `channel_product_data` entity, service, API |
| [STEP2-SCHEMA-GENERATION.md](STEP2-SCHEMA-GENERATION.md) | How the Step 2 form schema is built per store |
| [PRODUCT-WIZARD-FLOW.md](PRODUCT-WIZARD-FLOW.md) | Complete 3-step wizard API contracts and UI flow |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Phase-by-phase implementation with exact file paths |

## Related Documentation

- [Master-Product/DATA-MODEL.md](../Master-Product/DATA-MODEL.md) — Master product structure
- [Master-Product/FORM-SCHEMA-GENERATION.md](../Master-Product/FORM-SCHEMA-GENERATION.md) — Step 1 schema
- [Publishing/01-Sync-API-Integration.md](../Publishing/01-Sync-API-Integration.md) — Publish pipeline
- [Post-Processing-Engine/README.md](../Post-Processing-Engine/README.md) — JOLT + post-processing
