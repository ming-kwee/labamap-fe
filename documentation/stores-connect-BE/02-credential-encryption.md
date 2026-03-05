# Credential Encryption — AES-256-GCM

## Why Encrypt Credentials?

Most marketplace credentials are long-lived:
- Shopify access tokens **never expire** (unless rotated manually)
- Amazon LWA refresh tokens last **1 year**
- eBay refresh tokens last **18 months**

If the MongoDB database is compromised without encryption, an attacker could publish products, read orders, and modify inventory on behalf of all merchants. Encryption at rest limits the blast radius.

## Algorithm: AES-256-GCM

**AES-256-GCM** (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode):

| Property   | Value                                        |
|------------|----------------------------------------------|
| Key size   | 256 bits (32 bytes)                          |
| IV size    | 12 bytes (random per encryption)             |
| Auth tag   | 128 bits (GCM provides integrity)            |
| Mode       | Authenticated encryption — detects tampering |

GCM is preferred over CBC because it provides **both confidentiality and integrity** without a separate MAC.

## Stored Format

```
AES256GCM:<base64(12-byte-IV + ciphertext-with-auth-tag)>
```

Example stored value:
```
AES256GCM:A3k9xPqRmZoLvBNt...==
```

The prefix `AES256GCM:` lets the `decrypt()` method detect whether a value is encrypted or plain-text (backward compatibility with legacy data).

## CredentialEncryptionService API

```java
// Encrypt a single value
String encrypted = encryptionService.encrypt("shpat_real_token");

// Decrypt a stored value (handles plain-text gracefully)
String plain = encryptionService.decrypt("AES256GCM:...");

// Encrypt all values in a credentials map (called on connectStore / updateCredentials)
Map<String, String> encrypted = encryptionService.encryptAll(request.getCredentials());

// Decrypt all values (called before API calls to marketplace)
Map<String, String> plain = encryptionService.decryptAll(store.getCredentials());

// Mask all values for API responses (***MASKED***)
Map<String, String> masked = encryptionService.maskAll(store.getCredentials());
```

## Key Management

The encryption key is a 256-bit (32 byte) random value, base64-encoded:

```bash
# Generate a production key
openssl rand -base64 32
# Example output: RGV2T25seUtleUZvckxvY2FsVGVzdGluZ09ubHkxMjM=
```

### Where the Key Lives

| Environment | Location |
|-------------|----------|
| Production | `CREDENTIAL_ENCRYPTION_KEY` environment variable or secret manager |
| Development | `application.yml` default (dev-only placeholder) |
| Never | In source code or committed to git |

### Spring Boot Configuration

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

## Key Rotation Process

If a key needs to be rotated (security incident, key expiry, etc.):

1. Generate a new key: `openssl rand -base64 32`
2. Write a one-time migration job:
   ```java
   // Fetch all stores → decrypt with OLD key → re-encrypt with NEW key → save
   repository.findAll()
       .flatMap(store -> {
           Map<String, String> plain = oldKeyService.decryptAll(store.getCredentials());
           store.setCredentials(newKeyService.encryptAll(plain));
           return repository.save(store);
       })
       .blockLast();
   ```
3. Update the `CREDENTIAL_ENCRYPTION_KEY` env var
4. Restart the application

## Backward Compatibility

The `decrypt()` method checks for the `AES256GCM:` prefix:
- **Present** → decrypt normally
- **Absent** → return the value as-is (plain text, pre-encryption migration)

This means existing stores with plain-text credentials continue to work after the encryption service is introduced. They will be re-encrypted on the next `updateCredentials()` call.
