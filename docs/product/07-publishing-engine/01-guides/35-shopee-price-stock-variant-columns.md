# 35 — Shopee Step-2: missing price/stock variant columns (supportedChannels omits shopee)

**Status:** implemented (bff-v15). **Area:** Step-2 channel form (variant override columns).
**Symptom:** Shopee variant table in Step 2 showed no **price** and **stock** columns (comparePrice and
weight columns WERE there).

## Root cause
Step-2 variant columns for master-overridable variant attrs are built in
`ChannelStepSchemaService.buildVariantOverridesSection` from `variantOverridableAttrs`
(`isVariantChannelOverridable=true`), gated by:

```java
variantOverridableAttrs.stream()
  .filter(a -> supportsChannel(a, channelType))        // (1)
  .filter(a -> !"product".equals(a.getAppliesTo()))    // (2)
```

`supportsChannel` returns true only when `supportedChannels` is null/empty OR contains the channel:

```java
attr.getSupportedChannels() == null || isEmpty() || contains(channelType);
```

The live `price` and `inventory` docs had an **explicit** `supportedChannels`:
`[shopify, amazon, walmart, ebay, etsy, magento, woocommerce, wix, tiktokshop]` — i.e. every channel
**except shopee** (Shopee was added after that list was seeded, and the list was never updated). So
`supportsChannel(price, "shopee")` returned **false** → filtered out → no column.

`comparePrice`/`weight` had `supportedChannels: []` (empty = all channels) → they passed, which is why
only those two showed. That inconsistency was the tell.

## Fix (data-driven, self-healing)
These are **universal** fields — every channel has price/stock/weight. `MasterProductOverridableAttributesMigration`
(runs after the master-attribute seed) now reconciles the existing-doc path: if an overridable attr has a
**non-empty** `supportedChannels` that is **missing "shopee"**, it adds it.

```java
if (existing.getSupportedChannels() != null && !existing.getSupportedChannels().isEmpty()
        && !existing.getSupportedChannels().contains("shopee")) {
    List<String> merged = new ArrayList<>(existing.getSupportedChannels());
    merged.add("shopee");
    existing.setSupportedChannels(merged);
}
```

- **Add-missing, never remove** — preserves admin edits and the other channels (aligns with the
  seeder-idempotency principle: seeders must not undo admin customisation).
- **Empty stays empty** (= all channels), so `comparePrice`/`weight` are untouched.
- **Idempotent** across restarts (the `contains("shopee")` guard).
- Fixes fresh DBs too: the migration runs after the JSON seed, so even a freshly-seeded
  `price`/`inventory` (whose `master-attributes-ecommerce.json` list still omits shopee) gets shopee added.

The seed JSON (`master-attributes-ecommerce.json`) still lists channels without shopee for these fields;
it is intentionally NOT edited (a full reformat is noisy and a string-replace would hit other identical
lists). The migration is the authoritative reconciler for overridable-attr `supportedChannels`.

## Verify
Restart BFF (runs the migration), reload Step 2 for a Shopee store with a variant product. The variant
table now shows **price** and **stock** columns alongside comparePrice/weight. Confirm in Mongo:
```js
db.ecommerce_master_attributes.find(
  { fieldName: { $in: ["price","inventory"] } },
  { fieldName:1, supportedChannels:1, _id:0 });
// supportedChannels now includes "shopee"
```

## Related
Note: Shopee `update_price` has only `original_price` (no per-model compare price), so a variant
comparePrice has no target there — see guide 34. [[variant-scope-both]]
