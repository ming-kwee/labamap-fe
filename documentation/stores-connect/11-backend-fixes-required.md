# 11 — Backend Fixes Required (Integration Review)

> **Date:** 2026-02-25
> **Raised by:** Frontend team after integration analysis of `/api/v1/channel-stores`
> **Affects:** `ChannelStoreConnection.java`, `ChannelStoreResponse.java`,
>              `ChannelStoreService.java`, `application.yml`

This document describes five integration issues found during frontend–backend
contract review. Each entry states the **root cause**, the **observable symptom**,
the **frontend workaround** already in place, and the **required backend fix**.

Frontend workarounds are defensive fallbacks — they do not remove the need for
the backend fixes. Fixing the backend makes the contract correct and removes
fragile client-side guessing.

---

## Issue 1 — `isActive` field serialised as `"active"` ❌ CRITICAL

### Root cause

`ChannelStoreConnection.java` declares:

```java
@Data
public class ChannelStoreConnection {
    private boolean isActive;
    ...
}
```

Lombok `@Data` generates the getter `isActive()`. Jackson follows the JavaBeans
convention of stripping the `is` prefix from boolean getter names when producing
JSON keys. The result is:

```json
{ "active": true }          ← what the backend sends
{ "isActive": true }        ← what the frontend expects
```

### Symptom

Every store card in the frontend shows **"Inactive"** regardless of the actual
database value, because `store.isActive` is `undefined`.

### Frontend workaround (already applied)

The service mapper reads `r.isActive ?? r.active` and normalises to `isActive`.
This handles whichever key the backend sends.

### Required backend fix

Add `@JsonProperty("isActive")` to force the JSON key name:

```java
// ChannelStoreConnection.java
@JsonProperty("isActive")
private boolean isActive;
```

Apply the same annotation to `ChannelStoreResponse.java` if it has its own
`isActive` field:

```java
// ChannelStoreResponse.java
@JsonProperty("isActive")
private boolean isActive;
```

**Alternative** — rename the field to `active` on both Java and TypeScript sides.
The `@JsonProperty` annotation is simpler and less disruptive.

---

## Issue 2 — `Instant` fields serialised as epoch-seconds numbers ❌ HIGH

### Root cause

Spring Boot WebFlux with the default Jackson configuration produces:

```json
{ "connectedAt": 1735000000.000000000 }    ← epoch seconds (default)
```

The frontend `new Date(1735000000)` interprets the value as **milliseconds**,
producing a date in January 1970 instead of the correct date.

### Symptom

The "Connected" and "Last sync" dates on store cards display as
**"01 Jan 1970"** or similar.

### Frontend workaround (already applied)

`formatDate()` detects numbers less than `1e12` and multiplies by 1000 before
passing to `new Date()`. This is a heuristic and will break if the value ever
exceeds `1e12` (year 33658 — low risk, but still a hack).

### Required backend fix

Add the following to `application.yml`:

```yaml
spring:
  jackson:
    serialization:
      write-dates-as-timestamps: false
```

This makes Jackson serialize all `Instant`, `LocalDate`, `LocalDateTime`, and
`ZonedDateTime` values as ISO 8601 strings:

```json
{ "connectedAt": "2026-02-25T10:30:00Z" }    ← correct output
```

**Scope:** This setting applies globally to the entire application. Verify that
no other endpoint relies on numeric timestamp format before deploying.
If scoping is needed, configure it on the `ObjectMapper` bean used by the
channel store controller only.

---

## Issue 3 — Error response body contract (confirmation, no code change needed) ✅

### Current backend error format

```json
HTTP 409
{ "error": "DUPLICATE_STORE", "message": "Store already connected: mystore.myshopify.com" }

HTTP 400
{ "error": "CREDENTIAL_VALIDATION_FAILED", "message": "Invalid Shopify credentials" }

HTTP 400
{ "error": "VALIDATION_FAILED", "details": ["storeName: must not be blank"] }
```

### Frontend behaviour (already updated)

The service layer now parses the body and reads `body.message ?? body.error`
to extract a human-readable string. This works correctly with the above format.

### What backend must NOT change

- Always return a JSON object (not plain text) for error responses
- Always include either a `message` or `error` string field at the top level
- The `details` array (for validation errors) is not yet surfaced in the UI
  but is available for future use

### Recommendation

For validation errors (`VALIDATION_FAILED`), consider also populating `message`
with a summary string alongside `details`:

```json
{
  "error": "VALIDATION_FAILED",
  "message": "Request validation failed: storeName must not be blank",
  "details": ["storeName: must not be blank"]
}
```

This makes the UI error message meaningful without needing to parse the array.

---

## Issue 4 — `storeUrl` duplicate check is case-sensitive and protocol-sensitive ⚠️ MEDIUM

### Root cause

The duplicate check in `ChannelStoreService.java` calls:

```java
repository.existsByOrganizationIdAndChannelTypeAndStoreUrl(
    organizationId, channelType, req.getStoreUrl())
```

This is an exact string match. The following inputs would all be stored as
**separate records** pointing to the same physical store:

| User input | Stored as |
|-----------|-----------|
| `mystore.myshopify.com` | `mystore.myshopify.com` |
| `mystore.myshopify.com/` | `mystore.myshopify.com/` |
| `MYSTORE.myshopify.com` | `MYSTORE.myshopify.com` |
| `https://mystore.myshopify.com` | `https://mystore.myshopify.com` |

### Frontend workaround (already applied)

`normalizeStoreUrl()` strips protocol, lowercases, and removes trailing slashes
before the request is sent. This covers the common cases.

### Required backend fix

Normalise the URL in `connectStore()` before persistence and before the
duplicate check:

```java
public Mono<ChannelStoreResponse> connectStore(String organizationId,
                                               StoreConnectionRequest req) {
    // Normalise before duplicate check and before save
    String normalizedUrl = normalizeUrl(req.getStoreUrl());
    req.setStoreUrl(normalizedUrl);

    return repository.existsByOrganizationIdAndChannelTypeAndStoreUrl(
                organizationId, req.getChannelType(), normalizedUrl)
        ...
}

private String normalizeUrl(String url) {
    if (url == null) return "";
    return url.trim()
              .toLowerCase()
              .replaceAll("^https?://", "")
              .replaceAll("/+$", "");
}
```

Also apply `normalizeUrl()` when saving the entity so the stored value is
always in the canonical form, making future queries consistent.

**Why backend must also fix this:** The frontend normalises before sending, but
if a store is ever connected via a direct API call (e.g., from another service,
a script, or Postman), the backend has no protection. Defence-in-depth requires
the invariant to be enforced at the persistence layer.

---

## Issue 5 — Deactivation failure error surfacing (frontend only, no backend change)

### What was fixed

The frontend `StoreCard` previously swallowed deactivation errors silently.
The catch block now reads the error message (already correctly formatted by
the backend's `GlobalErrorHandler`) and displays it inside the card.

### No backend change required

The backend already returns a proper error response:

```json
HTTP 404
{ "error": "STORE_NOT_FOUND", "message": "Store not found: <storeId>" }
```

This format is now correctly surfaced to the user.

---

## Summary Table

| # | Issue | Severity | Backend fix required | Frontend workaround |
|---|-------|----------|---------------------|---------------------|
| 1 | `isActive` serialised as `"active"` | **CRITICAL** | `@JsonProperty("isActive")` on entity + DTO | ✅ `r.isActive ?? r.active` mapper |
| 2 | `Instant` serialised as epoch seconds | **HIGH** | `write-dates-as-timestamps: false` in `application.yml` | ✅ Multiply by 1000 if `< 1e12` |
| 3 | Error response body format | **Confirmed OK** | Keep `message`/`error` fields; add `message` to validation errors | ✅ Reads `body.message ?? body.error` |
| 4 | `storeUrl` not normalised server-side | **MEDIUM** | `normalizeUrl()` before duplicate check and save | ✅ `normalizeStoreUrl()` in modal |
| 5 | Deactivation error not shown to user | **Low — frontend only** | None | ✅ Error state added to `StoreCard` |

---

## Priority order for backend work

1. **Issue 1** — Fix immediately. Every merchant sees all stores as "Inactive".
2. **Issue 2** — Fix before first production deployment. Dates show wrong year.
3. **Issue 4** — Fix before launch. Prevents duplicate store records in MongoDB.
4. **Issue 3** — Add `message` to validation errors (quality of life, low urgency).
5. **Issue 5** — No action needed.
