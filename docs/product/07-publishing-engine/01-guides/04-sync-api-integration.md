# Sync API Integration

## Overview

The sync API is a separate service at `localhost:9000` that takes a channel-agnostic product representation and handles the actual channel API calls (Shopify, Amazon, WIX, TikTok Shop, etc.).

Our backend transforms the master product into a `SyncChannelProductRequest`, then calls:

```
POST localhost:9000/sync_channel_product_impl
```

The sync API returns a `SyncApiResponse` with the `channelProductId` assigned by the channel.

---

## WebClient Configuration

The `WebClient` bean (`syncApiWebClient`) is configured with `baseUrl = "http://localhost:9000"`. All publish calls use:

```
POST /sync_channel_product_impl
Content-Type: application/json
```

On `WebClientResponseException`, the error includes the HTTP status code and response body. The error code in the response follows the pattern `SYNC_API_HTTP_{statusCode}`.

---

## SyncChannelProductRequest Structure

A flat, strongly-typed request — **no** nested `channelProducts` wrapper. All 5 components are top-level arrays:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "pub_1746000000000_shopify_prod_abc123",
  "channelAttributes": [...],
  "variantGroups": [...],
  "optionGroups": [...],
  "metadataGroups": [...],
  "channelCredentials": [...]
}
```

- `id` — UUID generated for this sync request (for idempotency on the sync side)
- `eventId` — the `publishId` from our system (`pub_{timestamp}_{channelId}_{masterProductId}`)

---

## channelAttributes

Product-level fields, flat array:

```json
[
  {
    "attrId":        "id",
    "chnlAttrName":  "id",
    "chnlAttrValue": "550e8400-...",
    "chnlAttrType":  "string",
    "isCommonField": true,
    "isSupportField": true
  },
  {
    "attrId":        "product_name",
    "chnlAttrName":  "product.title",
    "chnlAttrValue": "Wireless Earbuds Pro",
    "chnlAttrType":  "string",
    "isCommonField": false,
    "isSupportField": false
  }
]
```

`isCommonField` — marks system-level routing fields (id, organization, store).  
`isSupportField` — marks fields that support the sync operation but aren't channel product attributes (e.g. body_html).

---

## variantGroups

One `VariantGroup` per variant. Each group contains the variant's fields as `ChannelVariant` entries:

```json
[
  {
    "channelVariant": [
      {
        "vrntId":       "channel_variant_price",
        "chnlVrntName": "product.variants.price",
        "chnlVrntValue": "29.99",
        "chnlVrntType": "string",
        "isSupportField": false
      },
      {
        "vrntId":       "color",
        "chnlVrntName": "product.variants.option1",
        "chnlVrntValue": "Black",
        "chnlVrntType": "string",
        "isSupportField": false
      },
      {
        "vrntId":       "passthrough_inventory_policy",
        "chnlVrntName": "product.variants.inventory_policy",
        "chnlVrntValue": "deny",
        "chnlVrntType": "TEXT",
        "isSupportField": false
      }
    ]
  }
]
```

Fields emitted in two passes:
1. Pre-registered fields from `attributeMappings.variantFields` (sorted by dimension order when ProductType is present)
2. Passthrough — any variant field not in pre-registered mappings (channel-specific fields like `barcode`, `inventory_policy`)

---

## optionGroups

One `OptionGroup` per option (variant dimension name + values). Shopify options are named (e.g. "Color") and carry an array of valid values:

```json
[
  {
    "channelOption": [
      {
        "optnId":       "option_name",
        "chnlOptnName": "product.options.name",
        "chnlOptnType": "string",
        "chnlOptnValue": "Color",
        "isSupportField": false
      },
      {
        "optnId":       "option_values",
        "chnlOptnName": "product.options.values",
        "chnlOptnType": "array",
        "chnlOptnValue": "[\"Black\",\"White\",\"Red\"]",
        "isSupportField": false
      }
    ]
  }
]
```

The options key is channel-specific: `options` for Shopify, `productOptions` for WIX.

---

## metadataGroups

Workflow instructions for the sync API. All metadata items from `channelConfig.channelMetadataList` are packed into a single `MetadataGroup`:

```json
[
  {
    "channelMetadata": [
      {
        "channelId":   "shopify",
        "key":         "workflow_step",
        "value":       "create_product",
        "grouping":    "workflow",
        "subGrouping": "product",
        "target":      "shopify_api"
      },
      {
        "channelId":   "shopify",
        "key":         "api_version",
        "value":       "2024-01",
        "grouping":    "config",
        "subGrouping": null,
        "target":      "shopify_api"
      }
    ]
  }
]
```

Shopify has 5 workflow instruction items covering its multi-step API flow:
create product → update variants → add media → link media to choices → publish.

Metadata is static — seeded by `ChannelConfigurationDataLoader` on startup.

---

## channelCredentials

Authentication for the sync API to call the channel:

```json
[
  {
    "credId":       "auth_token",
    "chnlCredName": "token",
    "chnlCredValue": "shpat_..."
  },
  {
    "credId":       "auth_site_id",
    "chnlCredName": "wix-site-id",
    "chnlCredValue": "53001808-..."
  }
]
```

Credentials are injected into `request.publishOptions.customOptions` by the data-driven credential mapping step (from `ChannelConfiguration.integrationConfig.authentication.credentialMapping`) before `ChannelAttributeConverterService` runs.

---

## SyncApiResponse (POST `/sync_channel_product_impl` → 200)

The POST is **accept-then-poll**, not synchronous. It returns only a handle:

```json
{ "workflowId": "...", "entityId": "...", "status": "ACCEPTED" | "ALREADY_PROCESSED" }
```

- `workflowId` — opaque token; echo it into the poll URL, do **not** construct it. Kalix returns the bare
  `<eventId>`; Temporal returns `sync-<eventId>` (the Temporal poll route accepts either form).
- `entityId` — the channel-product entity id (same as `SyncRequest.id`). `SyncApiResponse.channelProductId`
  reads it via `@JsonAlias({"entityId"})`.
- `status` — `ACCEPTED` (workflow started) or `ALREADY_PROCESSED` (a run with that `workflowId` already
  exists — idempotent). The final `COMPLETED`/`FAILED` outcome comes from the **poll**, not here.

Both sync backends (Kalix and Temporal) emit this exact POST shape, so either is drop-in behind the BFF.

---

## Workflow polling & terminal-state detection

> **Status: ✅ Hardened.** The publish is POST-then-poll: `POST /sync_channel_product_impl` returns a
> `workflowId`, then the backend polls `GET /channel_product_workflow/{workflowId}` every 2s until a
> terminal state. See `ChannelPublishService` (`isTerminalSyncStatus`/`isSyncSucceeded`/
> `isProcessingSyncStatus`) and `WorkflowStatusResponse`. Regression covered by
> `ChannelPublishServiceSyncStatusTest` and `WorkflowStatusResponseTest`.
>
> **Canonical route, both backends.** `GET /channel_product_workflow/{workflowId}` is served identically
> by the Kalix and Temporal sync services (Temporal also keeps `GET /channel_product_state?workflowId=`
> as a legacy alias), and the poll body field names are aligned (`syncStatus` / `externalChannelProductId`
> / `failureReason` / `step_results`). So the BFF poll URL is backend-agnostic — no BFF change when the
> sync service is swapped.

**Symptom fixed.** A publish whose sync workflow clearly succeeded showed **failed** on the page, and
only a **refresh** revealed success.

**Root cause — blacklist terminal predicate.** The poll stopped on the first status that was *not*
exactly `"PROCESSING"` and then required exactly `"COMPLETED"` for success. So any other value —
`PENDING`, an empty/transient status, or `null` from a wire field-name mismatch (`status` vs
`syncStatus`) — was read as a *finished, non-completed* (i.e. failed) workflow on the very first poll
(~2s), even while the workflow kept running and later completed. The sync service, being the source of
truth for the channel-product record, then recorded success — hence refresh showed success.

**Fix — three parts:**

1. **Whitelist terminal states.** Only `COMPLETED`/`FAILED` (case-insensitive) stop the poll. Everything
   else — `PROCESSING`, `PENDING`, `null`, empty, transient/unknown — means *keep polling* until a real
   terminal state or timeout.
2. **Field-name tolerance.** `WorkflowStatusResponse` accepts the status/id/error fields under both
   camelCase and snake_case (and the sync service's plain `status`/`message`) via `@JsonAlias`, so a
   wire-name difference can never deserialize the status to `null`.
3. **Timeout ≠ failure.** Poll timeout is `${app.sync.poll-timeout-seconds:180}` (raised from 120s;
   image-heavy products upload each image as a separate channel call). On timeout the backend returns a
   **non-terminal** response (`success=false`, `syncStatus="PROCESSING"`, a "still processing" warning)
   instead of a hard failure, and status persistence is **skipped** (see below) — a later refresh reflects
   the true outcome.

## Status Update after Publish

After the sync API responds, `ChannelPublishService` updates `channel_product_data`:

| Sync result | Status set |
|-------------|-----------|
| `response.success = true` | `PUBLISHED` (via `channelProductDataService.markPublished`) |
| `response.success = false` **and terminal** | `FAILED` (via `channelProductDataService.markFailed`, stores first error message) |
| `syncStatus = PROCESSING`/`PENDING` (poll timed out, still running) | **No update** — prior status left intact so refresh shows the true outcome |
| `dryRun = true` | No update |

Failures here are logged but do not fail the overall publish response — the channel product was already published or failed independently.

---

## Frontend consumption (Step 3 — Publish)

The frontend mirrors the same **whitelist-terminal** contract so it never repeats the blacklist bug
(a still-running publish shown as *failed* until a refresh). See
`step2-channel-fields/services/channelStore.service.ts` and
`step3-publish/components/PublishDashboard.tsx`.

1. **`classifyPublishOutcome(response)`** maps a publish/sync response to `PUBLISHED` | `FAILED` |
   `PROCESSING`, reading `success`, `syncStatus`, then `status` (case-insensitive). Only
   `COMPLETED`/`PUBLISHED` → `PUBLISHED` and `FAILED` → `FAILED` are terminal; **everything else —
   `PROCESSING`, `PENDING`, `null`, empty, unknown — is `PROCESSING` (non-terminal), never a failure.**
   `PublishSingleResponse` carries `success`/`syncStatus`/`workflowId` optionally, so plainer bodies
   still deserialize.
2. **Polling contract — `ChannelProductDataService.pollUntilTerminal(masterProductId, storeId)`.** On a
   `PROCESSING` verdict (server-side poll timed out, workflow still running) the FE re-reads
   `channel_product_data` every 2s (matching the backend cadence) up to a 60s window, until the store's
   status settles to `PUBLISHED`/`FAILED` — reconciling automatically instead of forcing a manual refresh.
3. **Status table (frontend mirror).** Terminal `PUBLISHED`/`FAILED` update the store badge; a lingering
   `PROCESSING` leaves the prior badge intact and surfaces a "still publishing" state (Step 3 shows a
   *Publishing…* pill + refresh hint), so a later refresh reflects the true outcome. Applies to both
   single publish and batch. Pre-flight `BLOCKED` (HTTP 400) is unchanged — a distinct, terminal
   merchant-fixable verdict.
