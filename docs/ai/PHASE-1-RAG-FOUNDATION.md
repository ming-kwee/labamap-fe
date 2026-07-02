# Phase 1 — RAG Foundation

**Status**: Implementation Ready  
**Depends on**: MongoDB Atlas (sudah ada), Anthropic SDK, `adaptivepattern` module existing  
**Output**: Vector index siap query, pipeline ingestion berjalan otomatis saat data berubah

---

## 1. Tujuan Phase Ini

RAG (Retrieval-Augmented Generation) adalah jantung sistem. Tanpa retrieval yang tepat, LLM akan "hallucinate" JOLT spec yang terlihat benar tapi salah secara konteks channel.

Phase 1 membangun:
1. **MongoDB Atlas Vector Search index** di collection yang tepat
2. **Embedding pipeline** — mengubah JOLT spec, field mappings, dan channel schemas menjadi vektor
3. **Ingestion triggers** — embedding diperbarui otomatis saat dokumen berubah
4. **Search API** — service layer yang dibungkus sebagai tool untuk agent di Phase 2+

---

## 2. Data yang Diindex

### 2.1 Sumber Data & Prioritas

```
Priority 1 (WAJIB untuk Phase 2+):
├── channel_jolt_specs         → JOLT spec per (channelId, categoryId)
├── channel_field_mappings     → Mapping historis dengan successRate
└── field_semantic_knowledge   → Ontologi semantik field

Priority 2 (untuk Phase 3+):
├── channel_category_api_config → Channel schema & attribute definitions
├── ecommerce_master_attributes → Master product field definitions
└── publish_error_history       → (new) Log error publish untuk learning
```

### 2.2 Yang Di-embed per Dokumen

**`channel_jolt_specs`** — teks yang di-embed:
```
"channelId={shopify} categoryId={clothing}
sourceFields=[name, description, price, variants.*.sku, variants.*.price, variants.*.inventory_quantity]
targetFields=[product.title, product.body_html, product.variants.*.price, product.variants.*.sku, product.variants.*.inventory_quantity]
joltOperations=[shift, default, modify-overwrite-beta]
confidence=0.92 version=v2.1"
```

**`channel_field_mappings`** — teks yang di-embed:
```
"sourceField={product_weight} targetField={item.package_weight}
channelId={amazon} semanticType={WEIGHT}
strategy={SEMANTIC} confidence=0.87 successRate=0.94
aliases=[weight, weightGrams, item_weight, gross_weight]"
```

**`field_semantic_knowledge`** — teks yang di-embed:
```
"fieldName={description} semanticType={PRODUCT_DESCRIPTION}
aliases=[body_html, product_description, long_description, overview, details]
keywords=[description, detail, specification, overview, about, info]
channels=[shopify, amazon, lazada, tokopedia, wix]"
```

---

## 3. New Classes — Java Implementation

### 3.1 Entity: `AiSchemaEmbedding`

```
collection: ai_schema_embeddings
```

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/model/entity/AiSchemaEmbedding.java

@Data @Builder @NoArgsConstructor @AllArgsConstructor
@Document(collection = "ai_schema_embeddings")
public class AiSchemaEmbedding {

    @Id
    private String id;

    // JOLT_SPEC | CHANNEL_SCHEMA | FIELD_MAPPING | SEMANTIC_KNOWLEDGE
    @Indexed
    private String sourceType;

    // _id dari dokumen asal (channel_jolt_specs, channel_field_mappings, dst)
    @Indexed
    private String referenceId;

    @Indexed
    private String channelId;

    @Indexed
    private String categoryId;

    // SHA-256 dari teks yang di-embed — untuk deteksi perubahan tanpa re-embed
    private String contentHash;

    // Vektor embedding 1536-dimensi (Voyage AI / Claude embedding)
    // Disimpan sebagai List<Double> untuk Atlas Vector Search
    private List<Double> embedding;

    // Teks asli yang menghasilkan embedding ini (untuk debugging)
    private String embeddedText;

    private Map<String, Object> metadata;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

### 3.2 Repository: `AiSchemaEmbeddingRepository`

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/repository/AiSchemaEmbeddingRepository.java

public interface AiSchemaEmbeddingRepository
        extends ReactiveMongoRepository<AiSchemaEmbedding, String> {

    Mono<AiSchemaEmbedding> findBySourceTypeAndReferenceId(String sourceType, String referenceId);

    Flux<AiSchemaEmbedding> findByChannelIdAndSourceType(String channelId, String sourceType);

    Flux<AiSchemaEmbedding> findByChannelIdAndCategoryIdAndSourceType(
            String channelId, String categoryId, String sourceType);

    Mono<Void> deleteBySourceTypeAndReferenceId(String sourceType, String referenceId);
}
```

### 3.3 Service: `RagEmbeddingService`

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/RagEmbeddingService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class RagEmbeddingService {

    private final WebClient anthropicWebClient; // configured with api.anthropic.com
    private final AiSchemaEmbeddingRepository embeddingRepository;
    private final ChannelJoltSpecRepository joltSpecRepository;
    private final ChannelFieldMappingRepository fieldMappingRepository;
    private final FieldSemanticKnowledgeRepository semanticKnowledgeRepository;
    private final ObjectMapper objectMapper;

    private static final String EMBED_MODEL = "voyage-3"; // atau model lain via Voyage AI
    private static final int EMBEDDING_DIM = 1024;

    // ── Public API ────────────────────────────────────────────────────────────

    /** Embed satu JOLT spec dan simpan ke ai_schema_embeddings. */
    public Mono<AiSchemaEmbedding> embedJoltSpec(ChannelJoltSpec spec) {
        String text = buildJoltSpecText(spec);
        String hash = sha256(text);

        return embeddingRepository
                .findBySourceTypeAndReferenceId("JOLT_SPEC", spec.getId())
                .filter(existing -> !existing.getContentHash().equals(hash)) // skip jika tdk berubah
                .switchIfEmpty(Mono.just(AiSchemaEmbedding.builder()
                        .sourceType("JOLT_SPEC")
                        .referenceId(spec.getId())
                        .channelId(spec.getChannelId())
                        .categoryId(spec.getCategoryId())
                        .build()))
                .flatMap(emb -> callEmbeddingApi(text)
                        .map(vector -> {
                            emb.setEmbedding(vector);
                            emb.setEmbeddedText(text);
                            emb.setContentHash(hash);
                            emb.setUpdatedAt(LocalDateTime.now());
                            if (emb.getCreatedAt() == null) emb.setCreatedAt(LocalDateTime.now());
                            return emb;
                        }))
                .flatMap(embeddingRepository::save);
    }

    /** Embed semua JOLT specs yang belum ter-embed atau berubah. */
    public Mono<Integer> reindexAllJoltSpecs() {
        return joltSpecRepository.findAll()
                .flatMap(this::embedJoltSpec)
                .count()
                .map(Long::intValue);
    }

    /** Embed semua field mappings. */
    public Mono<Integer> reindexAllFieldMappings() {
        return fieldMappingRepository.findAll()
                .flatMap(mapping -> {
                    String text = buildFieldMappingText(mapping);
                    String hash = sha256(text);
                    return embeddingRepository
                            .findBySourceTypeAndReferenceId("FIELD_MAPPING", mapping.getId())
                            .filter(e -> !e.getContentHash().equals(hash))
                            .switchIfEmpty(Mono.just(AiSchemaEmbedding.builder()
                                    .sourceType("FIELD_MAPPING")
                                    .referenceId(mapping.getId())
                                    .channelId(mapping.getChannelId())
                                    .build()))
                            .flatMap(emb -> callEmbeddingApi(text)
                                    .map(v -> {
                                        emb.setEmbedding(v);
                                        emb.setEmbeddedText(text);
                                        emb.setContentHash(hash);
                                        emb.setUpdatedAt(LocalDateTime.now());
                                        if (emb.getCreatedAt() == null) emb.setCreatedAt(LocalDateTime.now());
                                        return emb;
                                    }))
                            .flatMap(embeddingRepository::save);
                })
                .count()
                .map(Long::intValue);
    }

    // ── Text Builders ─────────────────────────────────────────────────────────

    private String buildJoltSpecText(ChannelJoltSpec spec) {
        StringBuilder sb = new StringBuilder();
        sb.append("channelId=").append(spec.getChannelId()).append(" ");
        sb.append("categoryId=").append(spec.getCategoryId() != null ? spec.getCategoryId() : "default").append(" ");

        if (spec.getSupersetSchema() != null) {
            if (spec.getSupersetSchema().getRequiredFields() != null)
                sb.append("requiredFields=").append(spec.getSupersetSchema().getRequiredFields()).append(" ");
            if (spec.getSupersetSchema().getOptionalFields() != null)
                sb.append("optionalFields=").append(spec.getSupersetSchema().getOptionalFields()).append(" ");
        }

        if (spec.getJoltMetadata() != null) {
            sb.append("confidence=").append(spec.getJoltMetadata().getConfidence()).append(" ");
            sb.append("mappingCount=").append(spec.getJoltMetadata().getMappingCount()).append(" ");
            if (spec.getJoltMetadata().getStrategyBreakdown() != null)
                sb.append("strategies=").append(spec.getJoltMetadata().getStrategyBreakdown()).append(" ");
        }

        if (spec.getDescription() != null)
            sb.append("description=").append(spec.getDescription());

        return sb.toString().trim();
    }

    private String buildFieldMappingText(ChannelFieldMapping mapping) {
        return String.format(
                "sourceField={%s} targetField={%s} channelId={%s} semanticType={%s} " +
                "strategy={%s} confidence=%.2f successRate=%.2f " +
                "aliases=%s keywords=%s",
                mapping.getSourceField(),
                mapping.getTargetField(),
                mapping.getChannelId(),
                mapping.getSourceSemanticType(),
                mapping.getMappingStrategy(),
                mapping.getConfidence() != null ? mapping.getConfidence() : 0.0,
                mapping.getSuccessRate() != null ? mapping.getSuccessRate() : 0.0,
                mapping.getSourceAliases() != null ? mapping.getSourceAliases() : List.of(),
                mapping.getAliases() != null ? mapping.getAliases() : List.of());
    }

    // ── Embedding API Call ────────────────────────────────────────────────────

    private Mono<List<Double>> callEmbeddingApi(String text) {
        // Gunakan Voyage AI (via Anthropic partnership) atau alternative embedding model
        // Format sesuaikan dengan model yang dipilih
        Map<String, Object> body = Map.of(
                "model", EMBED_MODEL,
                "input", List.of(text),
                "input_type", "document");

        return anthropicWebClient.post()
                .uri("/v1/embeddings")  // sesuaikan dengan provider
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .map(resp -> {
                    // Parse embedding dari response
                    List<?> data = (List<?>) resp.get("data");
                    Map<?, ?> first = (Map<?, ?>) data.get(0);
                    List<?> rawVector = (List<?>) first.get("embedding");
                    return rawVector.stream()
                            .map(v -> ((Number) v).doubleValue())
                            .collect(Collectors.toList());
                })
                .onErrorResume(e -> {
                    log.error("Embedding API failed for text ({}...): {}", text.substring(0, Math.min(50, text.length())), e.getMessage());
                    return Mono.error(e);
                });
    }

    private String sha256(String text) {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return String.valueOf(text.hashCode());
        }
    }
}
```

### 3.4 Service: `RagSearchService`

Wrapper di atas MongoDB Atlas `$vectorSearch` aggregation:

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/RagSearchService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class RagSearchService {

    private final ReactiveMongoTemplate mongoTemplate;
    private final RagEmbeddingService embeddingService;

    private static final int DEFAULT_LIMIT = 5;
    private static final int CANDIDATES = 100; // Atlas Vector Search numCandidates

    public record SearchResult(String referenceId, String sourceType,
                               String channelId, String categoryId,
                               double score, String embeddedText,
                               Map<String, Object> metadata) {}

    /**
     * Cari JOLT specs serupa untuk channel + query teks.
     * Dipakai oleh LLM agent tool: search_similar_jolt_specs
     */
    public Mono<List<SearchResult>> searchSimilarJoltSpecs(
            String queryText, String channelId, String categoryId, int limit) {

        return embeddingService.embedQuery(queryText)
                .flatMap(queryVector -> vectorSearch(
                        queryVector, "JOLT_SPEC", channelId, categoryId, limit));
    }

    /**
     * Cari field mappings historis yang relevan.
     * Dipakai oleh LLM agent tool: find_field_mappings
     */
    public Mono<List<SearchResult>> searchFieldMappings(
            String queryText, String channelId, int limit) {

        return embeddingService.embedQuery(queryText)
                .flatMap(queryVector -> vectorSearch(
                        queryVector, "FIELD_MAPPING", channelId, null, limit));
    }

    /**
     * Cari semantic knowledge untuk field tertentu.
     */
    public Mono<List<SearchResult>> searchSemanticKnowledge(
            String queryText, int limit) {

        return embeddingService.embedQuery(queryText)
                .flatMap(queryVector -> vectorSearch(
                        queryVector, "SEMANTIC_KNOWLEDGE", null, null, limit));
    }

    // ── Internal — Atlas $vectorSearch ───────────────────────────────────────

    private Mono<List<SearchResult>> vectorSearch(
            List<Double> queryVector, String sourceType,
            String channelId, String categoryId, int limit) {

        // MongoDB Atlas Vector Search aggregation pipeline
        // index name harus sesuai dengan yang dibuat di Atlas
        Document vectorSearchStage = new Document("$vectorSearch", new Document()
                .append("index", "ai_schema_embeddings_vector_idx")
                .append("path", "embedding")
                .append("queryVector", queryVector)
                .append("numCandidates", CANDIDATES)
                .append("limit", limit * 3) // over-fetch sebelum filter
                .append("filter", buildFilter(sourceType, channelId, categoryId)));

        Document projectStage = new Document("$project", new Document()
                .append("referenceId", 1)
                .append("sourceType", 1)
                .append("channelId", 1)
                .append("categoryId", 1)
                .append("embeddedText", 1)
                .append("metadata", 1)
                .append("score", new Document("$meta", "vectorSearchScore")));

        Document limitStage = new Document("$limit", limit);

        return mongoTemplate.aggregate(
                Aggregation.newAggregation(
                        context -> vectorSearchStage,
                        context -> projectStage,
                        context -> limitStage),
                "ai_schema_embeddings",
                Document.class)
                .map(doc -> new SearchResult(
                        doc.getString("referenceId"),
                        doc.getString("sourceType"),
                        doc.getString("channelId"),
                        doc.getString("categoryId"),
                        doc.getDouble("score") != null ? doc.getDouble("score") : 0.0,
                        doc.getString("embeddedText"),
                        (Map<String, Object>) doc.get("metadata")))
                .collectList()
                .onErrorResume(e -> {
                    log.error("Vector search failed: {}", e.getMessage());
                    return Mono.just(List.of());
                });
    }

    private Document buildFilter(String sourceType, String channelId, String categoryId) {
        Document filter = new Document("sourceType", new Document("$eq", sourceType));
        if (channelId != null) filter.append("channelId", new Document("$eq", channelId));
        if (categoryId != null) filter.append("categoryId", new Document("$eq", categoryId));
        return filter;
    }
}
```

---

## 4. MongoDB Atlas Vector Search Index Setup

### 4.1 Index Definition (JSON — dibuat via Atlas UI atau API)

```json
{
  "name": "ai_schema_embeddings_vector_idx",
  "type": "vectorSearch",
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "sourceType"
    },
    {
      "type": "filter",
      "path": "channelId"
    },
    {
      "type": "filter",
      "path": "categoryId"
    }
  ]
}
```

### 4.2 Cara Buat Index via Atlas CLI

```bash
atlas clusters search indexes create \
  --clusterName labamap-cluster \
  --db labamap \
  --collection ai_schema_embeddings \
  --file atlas-vector-index.json
```

### 4.3 `application.yml` — Konfigurasi Baru

```yaml
ai:
  embedding:
    provider: voyage          # voyage | anthropic | openai
    model: voyage-3
    dimensions: 1024
    batch-size: 32
    timeout-seconds: 10
  rag:
    search-limit: 5
    min-similarity-score: 0.70
    index-name: ai_schema_embeddings_vector_idx
  anthropic:
    api-key: ${ANTHROPIC_API_KEY}
    model: claude-sonnet-4-6
    max-tokens: 8192
```

---

## 5. Ingestion Triggers

### 5.1 Startup Reindex

```java
// Tambahkan ke existing startup migration atau buat baru:

@Component
@Order(200)  // Setelah semua migration selesai
@RequiredArgsConstructor
public class AiEmbeddingInitializer implements CommandLineRunner {

    private final RagEmbeddingService embeddingService;

    @Override
    public void run(String... args) {
        log.info("Starting AI embedding initialization...");
        embeddingService.reindexAllJoltSpecs()
                .doOnNext(count -> log.info("Indexed {} JOLT specs", count))
                .then(embeddingService.reindexAllFieldMappings())
                .doOnNext(count -> log.info("Indexed {} field mappings", count))
                .subscribe(
                        count -> log.info("AI embedding initialization complete"),
                        err -> log.warn("AI embedding initialization failed (non-critical): {}", err.getMessage()));
    }
}
```

### 5.2 Event-Driven Update

Tambahkan hook di `ChannelJoltSpecAdminController` saat JOLT di-update:

```java
// Di ChannelJoltSpecAdminController.updateSpec():
.doOnSuccess(saved -> embeddingService.embedJoltSpec(saved)
        .subscribe(emb -> log.debug("Re-embedded JOLT spec {}", saved.getId()),
                   err -> log.warn("Failed to re-embed JOLT: {}", err.getMessage())))
```

---

## 6. Admin Endpoint: Reindex

```
POST /api/v1/admin/ai/reindex
  ?sourceType=JOLT_SPEC|FIELD_MAPPING|ALL

Response:
{
  "indexed": 47,
  "skipped": 12,  // tidak berubah (hash sama)
  "failed": 0,
  "durationMs": 3241
}
```

---

## 7. Verification Checklist

- [ ] `ai_schema_embeddings` collection terbuat di MongoDB
- [ ] Atlas Vector Search index `ai_schema_embeddings_vector_idx` aktif
- [ ] `AiEmbeddingInitializer` berhasil index semua JOLT specs yang ada
- [ ] `POST /api/v1/admin/ai/reindex` mengembalikan count yang benar
- [ ] Vector search query dengan teks sample mengembalikan hasil relevan (score > 0.7)
- [ ] Update JOLT spec melalui admin UI → embedding ter-update otomatis

---

## 8. Next: Phase 2

Setelah Phase 1 selesai, Phase 2 menggunakan `RagSearchService` sebagai sumber konteks untuk LLM agent. Agent akan menerima top-5 JOLT specs serupa + top-10 field mappings historis sebagai grounding sebelum menganalisis pattern matching.
