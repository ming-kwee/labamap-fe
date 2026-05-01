# 09 — Backend API: Spring Boot Implementation

## Overview

This document covers how to implement the `channel_store_connections` backend in **Spring Boot + WebFlux** (reactive) with **MongoDB**. The backend is at `http://localhost:8888/labamap/api/v1`.

---

## MongoDB Document Design

### Collection: `channel_store_connections`

```java
// ChannelStoreConnection.java
@Document(collection = "channel_store_connections")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChannelStoreConnection {

    @Id
    private String storeId;           // UUID

    @Indexed
    private String organizationId;    // tenant isolation

    private String channelType;       // "shopify", "wix", "amazon", etc.
    private String storeName;
    private String storeUrl;
    private String region;

    private Map<String, String> credentials; // encrypted at rest

    private boolean isActive;
    private int displayOrder;

    @CreatedDate
    private Instant connectedAt;

    private Instant lastSyncedAt;
}
```

### Indexes to create

```javascript
// In MongoDB shell or migration
db.channel_store_connections.createIndex(
  { organizationId: 1, isActive: 1 },
  { name: "org_active_idx" }
);

db.channel_store_connections.createIndex(
  { organizationId: 1, channelType: 1, storeUrl: 1 },
  { name: "org_channel_url_idx", unique: true }
);
```

---

## Repository

```java
// ChannelStoreRepository.java
@Repository
public interface ChannelStoreRepository extends ReactiveMongoRepository<ChannelStoreConnection, String> {

    Flux<ChannelStoreConnection> findByOrganizationIdAndIsActiveTrue(String organizationId);

    Mono<ChannelStoreConnection> findByStoreIdAndOrganizationId(String storeId, String organizationId);

    Mono<Boolean> existsByOrganizationIdAndChannelTypeAndStoreUrl(
        String organizationId, String channelType, String storeUrl);
}
```

---

## Credential Encryption Service

```java
// CredentialEncryptionService.java
@Service
@Slf4j
public class CredentialEncryptionService {

    private final SecretKey secretKey;
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;
    private static final String PREFIX = "AES256GCM:";

    public CredentialEncryptionService(@Value("${app.credential.key}") String base64Key) {
        byte[] keyBytes = Base64.getDecoder().decode(base64Key);
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt credential", e);
        }
    }

    public String decrypt(String encrypted) {
        try {
            if (!encrypted.startsWith(PREFIX)) {
                return encrypted; // not encrypted (legacy or plain)
            }
            byte[] combined = Base64.getDecoder().decode(encrypted.substring(PREFIX.length()));

            byte[] iv = Arrays.copyOfRange(combined, 0, GCM_IV_LENGTH);
            byte[] ciphertext = Arrays.copyOfRange(combined, GCM_IV_LENGTH, combined.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);

            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new EncryptionException("Failed to decrypt credential", e);
        }
    }

    public Map<String, String> encryptAll(Map<String, String> credentials) {
        return credentials.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> encrypt(e.getValue())));
    }

    public Map<String, String> maskAll(Map<String, String> credentials) {
        return credentials.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> "***MASKED***"));
    }
}
```

---

## DTOs

```java
// StoreConnectionRequest.java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StoreConnectionRequest {
    @NotBlank private String channelType;
    @NotBlank private String storeName;
    @NotBlank private String storeUrl;
    private String storeId;
    private String region;
    private Integer displayOrder;
    @NotNull private Map<String, String> credentials;
}

// ChannelStoreResponse.java (masked credentials)
@Data
@Builder
public class ChannelStoreResponse {
    private String storeId;
    private String organizationId;
    private String channelType;
    private String storeName;
    private String storeUrl;
    private String region;
    private Map<String, String> credentials; // always masked in response
    private boolean isActive;
    private int displayOrder;
    private Instant connectedAt;
    private Instant lastSyncedAt;
}
```

---

## Service Layer

```java
// ChannelStoreService.java
@Service
@RequiredArgsConstructor
@Slf4j
public class ChannelStoreService {

    private final ChannelStoreRepository repository;
    private final CredentialEncryptionService encryptionService;
    private final ChannelValidatorFactory validatorFactory; // optional: validate credentials

    public Flux<ChannelStoreResponse> listStores(String organizationId) {
        return repository.findByOrganizationIdAndIsActiveTrue(organizationId)
            .map(this::toResponse)
            .sort(Comparator.comparingInt(ChannelStoreResponse::getDisplayOrder));
    }

    public Mono<ChannelStoreResponse> getStore(String storeId, String organizationId) {
        return repository.findByStoreIdAndOrganizationId(storeId, organizationId)
            .switchIfEmpty(Mono.error(new StoreNotFoundException(storeId)))
            .map(this::toResponse);
    }

    public Mono<ChannelStoreResponse> connectStore(String organizationId, StoreConnectionRequest req) {
        // 1. Check for duplicate
        return repository.existsByOrganizationIdAndChannelTypeAndStoreUrl(
                organizationId, req.getChannelType(), req.getStoreUrl())
            .flatMap(exists -> {
                if (exists) {
                    return Mono.error(new DuplicateStoreException(
                        "Store already connected: " + req.getStoreUrl()));
                }

                // 2. Optional: validate credentials by pinging the API
                return validatorFactory.getValidator(req.getChannelType())
                    .validate(req.getStoreUrl(), req.getCredentials())
                    .then(Mono.just(req));
            })
            .flatMap(r -> {
                // 3. Build document with encrypted credentials
                ChannelStoreConnection store = ChannelStoreConnection.builder()
                    .storeId(UUID.randomUUID().toString())
                    .organizationId(organizationId)
                    .channelType(r.getChannelType())
                    .storeName(r.getStoreName())
                    .storeUrl(r.getStoreUrl())
                    .region(r.getRegion())
                    .credentials(encryptionService.encryptAll(r.getCredentials()))
                    .isActive(true)
                    .displayOrder(r.getDisplayOrder() != null ? r.getDisplayOrder() : 999)
                    .connectedAt(Instant.now())
                    .build();

                return repository.save(store);
            })
            .map(this::toResponse);
    }

    public Mono<Void> deactivateStore(String storeId, String organizationId) {
        return repository.findByStoreIdAndOrganizationId(storeId, organizationId)
            .switchIfEmpty(Mono.error(new StoreNotFoundException(storeId)))
            .flatMap(store -> {
                store.setActive(false);
                return repository.save(store);
            })
            .then();
    }

    public Mono<ChannelStoreResponse> updateDisplayOrder(
            String storeId, String organizationId, int displayOrder) {
        return repository.findByStoreIdAndOrganizationId(storeId, organizationId)
            .switchIfEmpty(Mono.error(new StoreNotFoundException(storeId)))
            .flatMap(store -> {
                store.setDisplayOrder(displayOrder);
                return repository.save(store);
            })
            .map(this::toResponse);
    }

    /** Decrypt credentials for internal use (API calls to marketplace) */
    public Mono<Map<String, String>> getDecryptedCredentials(String storeId, String organizationId) {
        return repository.findByStoreIdAndOrganizationId(storeId, organizationId)
            .switchIfEmpty(Mono.error(new StoreNotFoundException(storeId)))
            .map(store -> store.getCredentials().entrySet().stream()
                .collect(Collectors.toMap(
                    Map.Entry::getKey,
                    e -> encryptionService.decrypt(e.getValue())
                ))
            );
    }

    private ChannelStoreResponse toResponse(ChannelStoreConnection store) {
        return ChannelStoreResponse.builder()
            .storeId(store.getStoreId())
            .organizationId(store.getOrganizationId())
            .channelType(store.getChannelType())
            .storeName(store.getStoreName())
            .storeUrl(store.getStoreUrl())
            .region(store.getRegion())
            .credentials(encryptionService.maskAll(store.getCredentials()))
            .isActive(store.isActive())
            .displayOrder(store.getDisplayOrder())
            .connectedAt(store.getConnectedAt())
            .lastSyncedAt(store.getLastSyncedAt())
            .build();
    }
}
```

---

## Controller

```java
// ChannelStoreController.java
@RestController
@RequestMapping("/api/v1/channel-stores")
@RequiredArgsConstructor
@Validated
public class ChannelStoreController {

    private final ChannelStoreService storeService;

    @GetMapping
    public Flux<ChannelStoreResponse> listStores(
            @RequestParam @NotBlank String organizationId) {
        return storeService.listStores(organizationId);
    }

    @GetMapping("/{storeId}")
    public Mono<ChannelStoreResponse> getStore(
            @PathVariable String storeId,
            @RequestParam @NotBlank String organizationId) {
        return storeService.getStore(storeId, organizationId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ChannelStoreResponse> connectStore(
            @RequestParam @NotBlank String organizationId,
            @RequestBody @Valid StoreConnectionRequest request) {
        return storeService.connectStore(organizationId, request);
    }

    @PutMapping("/{storeId}/deactivate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> deactivateStore(
            @PathVariable String storeId,
            @RequestParam @NotBlank String organizationId) {
        return storeService.deactivateStore(storeId, organizationId);
    }

    @PutMapping("/{storeId}/display-order")
    public Mono<ChannelStoreResponse> updateDisplayOrder(
            @PathVariable String storeId,
            @RequestParam @NotBlank String organizationId,
            @RequestBody Map<String, Integer> body) {
        return storeService.updateDisplayOrder(storeId, organizationId, body.get("displayOrder"));
    }
}
```

---

## Error Handling

```java
// GlobalErrorHandler.java
@RestControllerAdvice
public class GlobalErrorHandler {

    @ExceptionHandler(StoreNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, String> handleNotFound(StoreNotFoundException ex) {
        return Map.of("error", "STORE_NOT_FOUND", "message", ex.getMessage());
    }

    @ExceptionHandler(DuplicateStoreException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public Map<String, String> handleDuplicate(DuplicateStoreException ex) {
        return Map.of("error", "DUPLICATE_STORE", "message", ex.getMessage());
    }

    @ExceptionHandler(ChannelConnectionException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleConnectionFailed(ChannelConnectionException ex) {
        return Map.of("error", "CREDENTIAL_VALIDATION_FAILED", "message", ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleValidation(MethodArgumentNotValidException ex) {
        List<String> errors = ex.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + ": " + f.getDefaultMessage())
            .toList();
        return Map.of("error", "VALIDATION_FAILED", "details", errors);
    }
}
```

---

## Optional: Channel Credential Validator

```java
// ChannelValidatorFactory.java
@Component
@RequiredArgsConstructor
public class ChannelValidatorFactory {

    private final WebClient.Builder webClientBuilder;

    public ChannelValidator getValidator(String channelType) {
        return switch (channelType) {
            case "shopify"   -> new ShopifyValidator(webClientBuilder);
            case "wix"       -> new WixValidator(webClientBuilder);
            case "amazon"    -> new AmazonValidator(webClientBuilder);
            case "ebay"      -> new EbayValidator(webClientBuilder);
            case "tiktok"    -> new TikTokValidator(webClientBuilder);
            default          -> (url, creds) -> Mono.empty(); // no-op for unsupported
        };
    }
}

// ShopifyValidator.java
public class ShopifyValidator implements ChannelValidator {

    @Override
    public Mono<Void> validate(String storeUrl, Map<String, String> credentials) {
        String accessToken = credentials.getOrDefault("accessToken", "");
        String shopUrl = "https://" + storeUrl + "/admin/api/2024-01/shop.json";

        return webClient.get()
            .uri(shopUrl)
            .header("X-Shopify-Access-Token", accessToken)
            .retrieve()
            .onStatus(status -> status.is4xxClientError(),
                resp -> Mono.error(new ChannelConnectionException("Invalid Shopify credentials")))
            .bodyToMono(Void.class);
    }
}
```

---

## application.yml Configuration

```yaml
spring:
  data:
    mongodb:
      uri: mongodb://localhost:27017/labamap
      database: labamap

app:
  credential:
    key: ${CREDENTIAL_ENCRYPTION_KEY}  # 256-bit base64-encoded key
    # Generate with: openssl rand -base64 32

server:
  port: 8888

logging:
  level:
    com.labamap: DEBUG
```

---

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/channel-stores?organizationId=` | List active stores |
| `GET` | `/api/v1/channel-stores/{storeId}?organizationId=` | Get single store |
| `POST` | `/api/v1/channel-stores?organizationId=` | Connect new store |
| `PUT` | `/api/v1/channel-stores/{storeId}/deactivate?organizationId=` | Deactivate store |
| `PUT` | `/api/v1/channel-stores/{storeId}/display-order?organizationId=` | Update display order |

---

## Security Checklist

- [ ] `CREDENTIAL_ENCRYPTION_KEY` is stored in environment variable / secret manager (never in code)
- [ ] All credential fields are encrypted at rest before `save()`
- [ ] API responses always call `maskAll()` before returning
- [ ] `organizationId` is validated against the authenticated user's org (JWT claim) — not just trusted from query param
- [ ] HTTPS enforced in production (credentials in transit)
- [ ] MongoDB connection uses TLS in production
- [ ] Audit log for `connectStore` and `deactivateStore` events
