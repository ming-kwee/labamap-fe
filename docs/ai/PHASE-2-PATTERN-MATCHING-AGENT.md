# Phase 2 — Pattern Matching Agent

**Status**: Design Ready  
**Depends on**: Phase 1 (RAG Foundation)  
**Augments**: `AdaptivePatternMatchingCommandImpl`, `FieldMatchingService`, `KnowledgeBasedFieldMatchingService`  
**Output**: LLM-powered field analysis dengan gap detection dan confidence scoring per field

---

## 1. Tujuan Phase Ini

Phase 2 mengintegrasikan LLM sebagai "reasoning layer" di atas existing heuristic matching.

**Existing flow** (tanpa AI):
```
Source Schema → SchemaFlattenerService → FieldMatchingService → JoltSpecGeneratorService
                                           (string similarity + keyword)
```

**Augmented flow** (dengan AI):
```
Source Schema → SchemaFlattenerService → [Existing Matching] → LLM Agent Enhancement
                                                                    │
                                                              RAG Context Retrieval
                                                              (similar JOLT, mappings)
                                                                    │
                                                              Gap Analysis + Enrichment
                                                                    │
                                                           Enriched MatchResult list
                                                                    │
                                                              JoltSpecGeneratorService
```

LLM **tidak menggantikan** existing matching — ia **memperkaya** hasil yang sudah ada dengan:
- Memperbaiki confidence score berdasarkan konteks historis
- Mengisi gap yang tidak bisa dijangkau heuristik
- Mendeteksi potensi masalah sebelum JOLT dipakai
- Memberikan penjelasan human-readable untuk setiap mapping

---

## 2. LLM Agent Architecture

### 2.1 Tool Definitions

Agent menerima 4 tools pada Phase 2:

```java
// Tool 1: search_similar_jolt_specs
{
  "name": "search_similar_jolt_specs",
  "description": "Search for JOLT specs from similar channel+category combinations. Returns top-N specs with their field mappings and confidence scores. Use this to understand what worked before for this channel.",
  "input_schema": {
    "type": "object",
    "properties": {
      "channelId": {"type": "string", "description": "Channel ID: shopify, amazon, lazada, etc."},
      "categoryId": {"type": "string", "description": "Category slug: clothing, electronics, etc."},
      "sourceFieldSample": {"type": "array", "items": {"type": "string"}, "description": "Sample of source field names to find similar patterns"},
      "limit": {"type": "integer", "default": 5}
    },
    "required": ["channelId"]
  }
}

// Tool 2: get_channel_schema
{
  "name": "get_channel_schema",
  "description": "Get the channel's required and optional fields for a specific category. Essential for understanding what fields MUST be mapped.",
  "input_schema": {
    "type": "object",
    "properties": {
      "channelId": {"type": "string"},
      "categoryId": {"type": "string", "description": "Leave null for channel default schema"}
    },
    "required": ["channelId"]
  }
}

// Tool 3: find_field_mappings
{
  "name": "find_field_mappings",
  "description": "Search historical field mappings for a specific source field + channel. Returns mappings ranked by successRate. High successRate = proven mapping in production.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sourceField": {"type": "string", "description": "The source field name to find mappings for"},
      "channelId": {"type": "string"},
      "semanticQuery": {"type": "string", "description": "Semantic description if field name alone is not enough"}
    },
    "required": ["sourceField", "channelId"]
  }
}

// Tool 4: get_semantic_knowledge
{
  "name": "get_semantic_knowledge",
  "description": "Get the semantic knowledge for a field: its known aliases, common patterns, and valid channels. Use when a source field name is ambiguous.",
  "input_schema": {
    "type": "object",
    "properties": {
      "fieldName": {"type": "string"},
      "semanticType": {"type": "string", "description": "Optional: PRODUCT_NAME, PRICE, SKU, BRAND, etc."}
    },
    "required": ["fieldName"]
  }
}
```

### 2.2 System Prompt

```
You are an expert in omnichannel e-commerce data mapping. Your task is to analyze 
field mappings between a master product schema and a target channel schema.

Context:
- Source schema: flat master product fields from our internal system
- Target schema: the channel's required format (Shopify, Amazon, TikTok, etc.)
- Historical data: use tools to retrieve similar past mappings

Your responsibilities:
1. Review the existing heuristic mappings provided to you
2. Identify GAPS — source fields with no confident mapping (confidence < 0.7)  
3. Identify ERRORS — mappings that are semantically wrong despite high similarity score
4. Use tools to find evidence from historical data
5. Return an enriched analysis with corrected/improved mappings

Output format:
{
  "fieldAnalysis": [
    {
      "sourceField": "weight",
      "proposedTarget": "variants.*.weight",
      "confidence": 0.92,
      "reasoning": "...",
      "evidenceFromRag": "Found 3 similar Shopify-clothing mappings with 96% success rate",
      "status": "CONFIRMED | CORRECTED | GAP_FILLED | UNCERTAIN"
    }
  ],
  "gaps": ["brand", "barcode"],
  "channelRequiredUnmapped": ["product.vendor"],
  "overallConfidence": 0.87,
  "warningsForDeveloper": ["TikTok requires category_id from live API, cannot be mapped statically"]
}

Important rules:
- Never hallucinate field names. If you're unsure, mark status as UNCERTAIN with low confidence.
- Always prefer evidence from tools over your training knowledge.
- For Amazon: always check if brand and manufacturer are required.
- For TikTok Shop: category_id must come from live Taxonomy API, not from master data.
- For Shopify: handle must be URL-safe slug.
```

### 2.3 Agent Execution Flow

```
1. Receive: existing MatchResult list dari FieldMatchingService
2. Build initial context:
   │
   ├── Tool call: get_channel_schema(channelId, categoryId)
   │   → channel required/optional fields
   │
   ├── Tool call: search_similar_jolt_specs(channelId, categoryId, sourceFields)
   │   → top-5 similar JOLT specs dengan embedding similarity score
   │
   └── Build prompt dengan semua konteks
   
3. LLM iteration (max 3 tool calls tambahan):
   │
   ├── LLM menganalisis → menemukan gap di field "brand"
   │   → Tool call: find_field_mappings("brand", channelId)
   │   → LLM: "Found successRate=0.94 untuk brand→item_attributes.brand di Amazon"
   │
   └── LLM menganalisis → mapping "weight" confidence hanya 0.6
       → Tool call: get_semantic_knowledge("weight")
       → LLM: "Alias includes 'item_weight', targetPath untuk Amazon adalah 'item.weight.value'"
       
4. LLM produce final analysis JSON
5. Merge dengan existing MatchResult → EnrichedMatchResult
6. Return ke AdaptivePatternMatchingCommandImpl
```

---

## 3. New Classes

### 3.1 `EnrichedMatchResult`

Extends `MatchResult` dengan AI-enriched fields:

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/model/dto/EnrichedMatchResult.java

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnrichedMatchResult {

    // From existing MatchResult
    private String sourcePath;
    private String targetPath;
    private String sourceFieldName;
    private String targetFieldName;
    private double confidence;
    private String matchStrategy;

    // AI-enriched fields
    private String aiStatus;           // CONFIRMED | CORRECTED | GAP_FILLED | UNCERTAIN | REJECTED
    private String aiReasoning;        // Penjelasan dari LLM
    private String evidenceFromRag;    // Bukti dari vector search
    private Double originalConfidence; // confidence sebelum AI correction
    private String correctedFromPath;  // jika LLM mengkoreksi target path
    private boolean requiresManualReview;
    private String warningMessage;
}
```

### 3.2 `PatternMatchingAgentService`

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/PatternMatchingAgentService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class PatternMatchingAgentService {

    private final AnthropicClient anthropicClient; // Anthropic Java SDK
    private final RagSearchService ragSearchService;
    private final ChannelService channelService;
    private final AiAgentSessionRepository sessionRepository;

    private static final String MODEL = "claude-sonnet-4-6";
    private static final int MAX_TOKENS = 8192;
    private static final int MAX_TOOL_ITERATIONS = 5;

    /**
     * Enrich existing MatchResult list dengan LLM reasoning.
     * Fallback ke original jika AI gagal (non-breaking).
     */
    public Mono<List<EnrichedMatchResult>> enrichMatchResults(
            List<MatchResult> existing,
            String channelId,
            String categoryId,
            String masterProductId) {

        String sessionId = UUID.randomUUID().toString();

        return buildInitialContext(channelId, categoryId, existing)
                .flatMap(context -> runAgentLoop(context, channelId, categoryId, sessionId))
                .map(agentOutput -> mergeWithExisting(existing, agentOutput))
                .onErrorResume(e -> {
                    log.warn("AI pattern matching failed, falling back to heuristic: {}", e.getMessage());
                    // Graceful fallback — wrap existing MatchResult sebagai EnrichedMatchResult
                    return Mono.just(existing.stream()
                            .map(mr -> EnrichedMatchResult.builder()
                                    .sourcePath(mr.getSourcePath())
                                    .targetPath(mr.getTargetPath())
                                    .confidence(mr.getConfidence())
                                    .matchStrategy(mr.getMatchStrategy())
                                    .aiStatus("FALLBACK")
                                    .build())
                            .toList());
                })
                .doOnSuccess(results -> saveSessionMetrics(sessionId, results, channelId));
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    private Mono<AgentContext> buildInitialContext(
            String channelId, String categoryId, List<MatchResult> existing) {

        String sourceFieldsSample = existing.stream()
                .map(MatchResult::getSourceFieldName)
                .limit(20)
                .collect(Collectors.joining(", "));

        Mono<ChannelConfiguration> channelMono = channelService.getChannelById(channelId)
                .onErrorReturn(new ChannelConfiguration());

        Mono<List<RagSearchService.SearchResult>> joltContextMono =
                ragSearchService.searchSimilarJoltSpecs(sourceFieldsSample, channelId, categoryId, 5)
                        .onErrorReturn(List.of());

        return Mono.zip(channelMono, joltContextMono)
                .map(tuple -> AgentContext.builder()
                        .channelId(channelId)
                        .categoryId(categoryId)
                        .existingMatchResults(existing)
                        .channelConfig(tuple.getT1())
                        .ragJoltContext(tuple.getT2())
                        .build());
    }

    private Mono<AgentOutput> runAgentLoop(AgentContext context, String channelId, String categoryId, String sessionId) {
        // Menggunakan Anthropic SDK Java dengan tool use
        // Detail implementasi lihat Phase 3 untuk full agent loop
        // ...
        return Mono.empty(); // placeholder
    }

    private List<EnrichedMatchResult> mergeWithExisting(
            List<MatchResult> existing, AgentOutput agentOutput) {
        // Merge LLM corrections ke existing results
        Map<String, AgentOutput.FieldAnalysis> bySourceField = agentOutput.getFieldAnalysis()
                .stream()
                .collect(Collectors.toMap(AgentOutput.FieldAnalysis::getSourceField, f -> f));

        return existing.stream()
                .map(mr -> {
                    AgentOutput.FieldAnalysis analysis = bySourceField.get(mr.getSourceFieldName());
                    if (analysis == null) {
                        return EnrichedMatchResult.builder()
                                .sourcePath(mr.getSourcePath())
                                .targetPath(mr.getTargetPath())
                                .confidence(mr.getConfidence())
                                .matchStrategy(mr.getMatchStrategy())
                                .aiStatus("UNCHANGED")
                                .build();
                    }
                    return EnrichedMatchResult.builder()
                            .sourcePath(mr.getSourcePath())
                            .targetPath(analysis.getProposedTarget() != null
                                    ? analysis.getProposedTarget() : mr.getTargetPath())
                            .confidence(analysis.getConfidence())
                            .originalConfidence(mr.getConfidence())
                            .matchStrategy(mr.getMatchStrategy())
                            .aiStatus(analysis.getStatus())
                            .aiReasoning(analysis.getReasoning())
                            .evidenceFromRag(analysis.getEvidenceFromRag())
                            .warningMessage(analysis.getWarning())
                            .requiresManualReview("UNCERTAIN".equals(analysis.getStatus()))
                            .build();
                })
                .toList();
    }
}
```

---

## 4. Tool Handler Implementations

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/AgentToolHandlerService.java

@Service
@RequiredArgsConstructor
public class AgentToolHandlerService {

    private final RagSearchService ragSearchService;
    private final ChannelService channelService;
    private final ChannelFieldMappingRepository fieldMappingRepository;
    private final FieldSemanticKnowledgeRepository semanticKnowledgeRepository;
    private final ObjectMapper objectMapper;

    /**
     * Dispatch tool call dari LLM ke implementasi yang tepat.
     */
    public Mono<String> executeTool(String toolName, Map<String, Object> input) {
        return switch (toolName) {
            case "search_similar_jolt_specs" -> searchSimilarJoltSpecs(input);
            case "get_channel_schema" -> getChannelSchema(input);
            case "find_field_mappings" -> findFieldMappings(input);
            case "get_semantic_knowledge" -> getSemanticKnowledge(input);
            default -> Mono.just("{\"error\": \"Unknown tool: " + toolName + "\"}");
        };
    }

    private Mono<String> searchSimilarJoltSpecs(Map<String, Object> input) {
        String channelId = (String) input.get("channelId");
        String categoryId = (String) input.get("categoryId");
        List<String> sourceFields = (List<String>) input.getOrDefault("sourceFieldSample", List.of());
        int limit = ((Number) input.getOrDefault("limit", 5)).intValue();

        String query = "channelId=" + channelId + " categoryId=" + (categoryId != null ? categoryId : "default")
                + " sourceFields=" + sourceFields;

        return ragSearchService.searchSimilarJoltSpecs(query, channelId, categoryId, limit)
                .map(results -> {
                    List<Map<String, Object>> summary = results.stream()
                            .map(r -> Map.<String, Object>of(
                                    "referenceId", r.referenceId(),
                                    "channelId", r.channelId(),
                                    "categoryId", r.categoryId() != null ? r.categoryId() : "default",
                                    "similarityScore", r.score(),
                                    "context", r.embeddedText().substring(0, Math.min(200, r.embeddedText().length()))
                            ))
                            .toList();
                    try { return objectMapper.writeValueAsString(Map.of("results", summary)); }
                    catch (Exception e) { return "{}"; }
                });
    }

    private Mono<String> getChannelSchema(Map<String, Object> input) {
        String channelId = (String) input.get("channelId");
        return channelService.getChannelById(channelId)
                .map(config -> {
                    Map<String, Object> schema = new LinkedHashMap<>();
                    schema.put("channelId", channelId);
                    // Ambil required fields dari ChannelConfiguration
                    if (config.getCategoryRequirements() != null)
                        schema.put("categoryRequirements", config.getCategoryRequirements().keySet());
                    schema.put("notes", getChannelSpecificNotes(channelId));
                    try { return objectMapper.writeValueAsString(schema); }
                    catch (Exception e) { return "{}"; }
                })
                .onErrorReturn("{\"error\": \"Channel not found\"}");
    }

    private Mono<String> findFieldMappings(Map<String, Object> input) {
        String sourceField = (String) input.get("sourceField");
        String channelId = (String) input.get("channelId");

        return fieldMappingRepository
                .findByChannelIdAndSourceField(channelId, sourceField)
                .collectList()
                .map(mappings -> {
                    List<Map<String, Object>> result = mappings.stream()
                            .sorted(Comparator.comparingDouble(
                                    m -> -(m.getSuccessRate() != null ? m.getSuccessRate() : 0)))
                            .limit(5)
                            .map(m -> Map.<String, Object>of(
                                    "targetField", m.getTargetField(),
                                    "strategy", m.getMappingStrategy(),
                                    "confidence", m.getConfidence(),
                                    "successRate", m.getSuccessRate(),
                                    "usageCount", m.getUsageCount()
                            ))
                            .toList();
                    try { return objectMapper.writeValueAsString(Map.of("mappings", result)); }
                    catch (Exception e) { return "{}"; }
                });
    }

    private Mono<String> getSemanticKnowledge(Map<String, Object> input) {
        String fieldName = (String) input.get("fieldName");
        return semanticKnowledgeRepository.findByFieldName(fieldName)
                .map(sk -> {
                    Map<String, Object> knowledge = Map.of(
                            "semanticType", sk.getSemanticType(),
                            "aliases", sk.getAliases() != null ? sk.getAliases() : List.of(),
                            "keywords", sk.getKeywords() != null ? sk.getKeywords() : List.of(),
                            "validChannels", sk.getValidChannels() != null ? sk.getValidChannels() : Set.of(),
                            "dataType", sk.getDataType()
                    );
                    try { return objectMapper.writeValueAsString(knowledge); }
                    catch (Exception e) { return "{}"; }
                })
                .defaultIfEmpty("{\"found\": false}");
    }

    private Map<String, String> getChannelSpecificNotes(String channelId) {
        return switch (channelId.toLowerCase()) {
            case "shopify" -> Map.of(
                    "handle", "Must be URL-safe slug, auto-generated from title if missing",
                    "category", "Use Shopify Taxonomy GID from live API");
            case "amazon" -> Map.of(
                    "brand", "REQUIRED — must match Amazon brand registry",
                    "bullet_points", "Max 5 bullet points, each max 500 chars");
            case "tiktokshop" -> Map.of(
                    "category_id", "REQUIRED — must come from TikTok live category API, not static",
                    "price", "Must be STRING type, not number");
            case "lazada" -> Map.of(
                    "primary_category", "REQUIRED — Lazada category ID from API");
            default -> Map.of();
        };
    }
}
```

---

## 5. Integration: `AdaptivePatternMatchingCommandImpl`

Tambahkan AI enrichment sebagai optional step setelah existing matching:

```java
// Di AdaptivePatternMatchingCommandImpl.execute():

// EXISTING STEP (tidak berubah):
List<MatchResult> heuristicResults = fieldMatchingService.matchFields(sourceFields, targetFields);

// NEW STEP (AI enrichment):
if (aiConfig.isEnabled()) {
    return patternMatchingAgentService
            .enrichMatchResults(heuristicResults, request.getChannelId(),
                    request.getCategoryId(), request.getMasterProductId())
            .map(enriched -> buildResponse(enriched, request));
} else {
    // fallback ke existing behavior
    return Mono.just(buildResponse(heuristicResults, request));
}
```

---

## 6. Response Enhancement

`AdaptivePatternMatchingResponse` mendapat field baru:

```java
// Tambah ke AdaptivePatternMatchingResponse:
private boolean aiEnriched;
private double aiConfidenceGain;    // Δ confidence average (AI - heuristic)
private List<String> aiCorrections; // Daftar field yang dikoreksi AI
private List<String> aiGapsFilled;  // Field yang diisi AI (tidak bisa oleh heuristik)
private String agentSessionId;      // Untuk audit trail
```

---

## 7. Observability: `ai_agent_sessions`

Setiap run agent disimpan untuk debugging & analysis:

```json
{
  "_id": "sess-20260626-001",
  "triggerType": "PATTERN_MATCHING",
  "channelId": "amazon",
  "categoryId": "clothing",
  "status": "COMPLETED",
  "ragContext": {
    "retrievedJoltSpecs": 4,
    "retrievedFieldMappings": 12,
    "topSimilarityScore": 0.91
  },
  "agentSteps": [
    {"step": 1, "tool": "get_channel_schema", "durationMs": 45},
    {"step": 2, "tool": "search_similar_jolt_specs", "durationMs": 312},
    {"step": 3, "tool": "find_field_mappings", "input": {"sourceField": "brand"}, "durationMs": 67}
  ],
  "summary": {
    "fieldsAnalyzed": 24,
    "fieldsConfirmed": 18,
    "fieldsCorrected": 3,
    "gapsFilled": 2,
    "uncertainFields": 1,
    "confidenceBefore": 0.73,
    "confidenceAfter": 0.91
  },
  "totalTokensUsed": 3847,
  "durationMs": 1234
}
```

---

## 8. Verification Checklist

- [ ] `PatternMatchingAgentService.enrichMatchResults()` berjalan dan tidak breaking existing flow
- [ ] Fallback ke heuristik berfungsi saat AI timeout/error
- [ ] Tool `search_similar_jolt_specs` mengembalikan hasil relevan
- [ ] Tool `get_channel_schema` mengembalikan channel notes yang benar per channel
- [ ] `ai_agent_sessions` tersimpan dengan benar di MongoDB
- [ ] Response `AdaptivePatternMatchingResponse` memiliki `aiEnriched=true` saat AI berjalan
- [ ] Config `ai.enabled=false` benar-benar skip AI layer
