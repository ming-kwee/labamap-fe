# Credential Security Reference

## Why Encrypt Credentials?

Most marketplace credentials are long-lived:
- Shopify access tokens **never expire** (unless rotated manually)
- Amazon LWA refresh tokens last **1 year**
- eBay refresh tokens last **18 months**

If the MongoDB database is compromised without encryption, an attacker could publish products, read orders, and modify inventory on behalf of all merchants. Encryption at rest limits the blast radius.

---

## Algorithm: AES-256-GCM

| Property | Value |
|----------|-------|
| Key size | 256 bits (32 bytes) |
| IV size | 12 bytes (random per encryption) |
| Auth tag | 128 bits |
| Mode | Authenticated encryption — detects tampering |

GCM is preferred over CBC because it provides **both confidentiality and integrity** without a separate MAC.

---

## Stored Format

```
AES256GCM:<base64(12-byte-IV + ciphertext-with-auth-tag)>
```

Example:
```
AES256GCM:A3k9xPqRmZoLvBNt...==
```

The `AES256GCM:` prefix lets `decrypt()` detect whether a value is already encrypted (backward compatibility with plain-text legacy data).

---

## CredentialEncryptionService

**Package:** `com.labamap.labamapomnichannelbe4fe.channel.store.service`

```java
// Encrypt a single value
String encrypted = encryptionService.encrypt("shpat_real_token");

// Decrypt a stored value (handles plain-text gracefully)
String plain = encryptionService.decrypt("AES256GCM:...");

// Encrypt all values in a credentials map — called in connectStore() and updateCredentials()
Map<String, String> encrypted = encryptionService.encryptAll(request.getCredentials());

// Decrypt all values — called before any marketplace API call
Map<String, String> plain = encryptionService.decryptAll(store.getCredentials());

// Mask all values for API responses
Map<String, String> masked = encryptionService.maskAll(store.getCredentials());
// → { "accessToken": "***MASKED***", "apiKey": "***MASKED***", ... }
```

**Call sites:**
- `encryptAll()` — in `connectStore()`, `updateCredentials()`, and after every token refresh
- `decryptAll()` — in `GenericTokenRefreshService.getValidCredentials()` only (in-memory, request lifetime)
- `maskAll()` — in `ChannelStoreConnectionResponse.from()` before any API response leaves the service layer

---

## Key Management

Generate a production key:

```bash
openssl rand -base64 32
# Example: RGV2T25seUtleUZvckxvY2FsVGVzdGluZ09ubHkxMjM=
```

| Environment | Where the key lives |
|-------------|---------------------|
| Production | `CREDENTIAL_ENCRYPTION_KEY` environment variable or secret manager |
| Development | `application.yml` default (dev-only placeholder) |
| Never | In source code or committed to git |

**Spring Boot wiring:**

```yaml
app:
  credential:
    key: ${CREDENTIAL_ENCRYPTION_KEY:dev-only-fallback-key-here}
```

```java
@Service
public class CredentialEncryptionService {
    public CredentialEncryptionService(@Value("${app.credential.key}") String base64Key) {
        byte[] keyBytes = Base64.getDecoder().decode(base64Key);
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }
}
```

---

## Key Rotation

1. Generate new key: `openssl rand -base64 32`
2. Write a one-time migration job:
   ```java
   repository.findAll()
       .flatMap(store -> {
           Map<String, String> plain = oldKeyService.decryptAll(store.getCredentials());
           store.setCredentials(newKeyService.encryptAll(plain));
           return repository.save(store);
       })
       .blockLast();
   ```
3. Update `CREDENTIAL_ENCRYPTION_KEY` env var
4. Restart the application

---

## Backward Compatibility

`decrypt()` checks for the `AES256GCM:` prefix:
- **Present** → decrypt normally
- **Absent** → return value as-is (pre-encryption plain-text data)

Stores with plain-text credentials continue to work; they are re-encrypted on the next `PATCH /credentials` call.

---

## Security Rules

- Decrypted credentials **never leave the service layer** — `GenericTokenRefreshService` decrypts in-memory for the request lifetime only; `customOptions` receives decrypted values only during the active publish request.
- Refresh tokens must be stored encrypted — they are long-lived (up to 18 months) and high-value.
- Never log decrypted token values — the service logs only key names, not values.
- If a refresh token is compromised: deactivate the store via `PUT /{storeId}/deactivate` and re-authorize from scratch via the OAuth flow.
- All OAuth callbacks must use HTTPS — tokens appear in query strings and request bodies.
