# Phase 3 — JOLT Generation Agent

**Status**: Design Ready  
**Depends on**: Phase 1 (RAG), Phase 2 (Pattern Matching Agent)  
**Augments**: `JoltSpecGeneratorService`, `ChannelJoltSpec`, `ChannelJoltSpecAdminController`  
**Output**: JOLT spec yang valid dan telah divalidasi dengan sample data, lengkap dengan penjelasan per rule

---

## 1. Tujuan Phase Ini

Phase 3 adalah titik di mana AI benar-benar **menghasilkan atau memperbaiki JOLT spec**, bukan hanya menganalisis mapping.

Skenario yang ditangani:

| Skenario | Trigger | Output |
|---|---|---|
| **JOLT baru** | Channel baru atau kategori baru tanpa JOLT existing | JOLT spec lengkap |
| **JOLT patch** | Publish gagal karena field missing/wrong di JOLT | Diff patch ke existing JOLT |
| **JOLT improvement** | Confidence rendah pada JOLT existing | Rewritten JOLT dengan confidence lebih tinggi |
| **Schema drift** | Master product schema berubah (field baru ditambah) | JOLT di-extend |

---

## 2. Full Agent Loop dengan Tool Use

### 2.1 Complete Tool Set (Phase 3 = Phase 2 tools + 2 tambahan)

```java
// Tool 5: validate_jolt_spec
{
  "name": "validate_jolt_spec",
  "description": "Execute a JOLT spec against sample product data and validate the output. Returns the transformation result, any errors, and a list of channel required fields that are still missing from the output.",
  "input_schema": {
    "type": "object",
    "properties": {
      "joltSpec": {
        "type": "array",
        "description": "Array of JOLT operations to validate"
      },
      "sampleInput": {
        "type": "object",
        "description": "Sample master product data to transform"
      },
      "channelId": {"type": "string"},
      "categoryId": {"type": "string"}
    },
    "required": ["joltSpec", "sampleInput", "channelId"]
  }
}

// Tool 6: get_existing_jolt_spec
{
  "name": "get_existing_jolt_spec",
  "description": "Retrieve the current JOLT spec for a channel+category combination, if one exists. Returns the spec, its version, and its performance metadata (confidence, mapping count).",
  "input_schema": {
    "type": "object",
    "properties": {
      "channelId": {"type": "string"},
      "categoryId": {"type": "string"},
      "organizationId": {"type": "string"}
    },
    "required": ["channelId"]
  }
}
```

### 2.2 Agent Prompt (JOLT Generation Mode)

```
You are an expert in JOLT (JSON to JSON transformation) for e-commerce channels.

Your task: Generate or fix a JOLT specification that correctly transforms master 
product data to the target channel format.

JOLT operations you can use:
- "shift": Map fields from source to target paths
- "default": Add default values for missing fields  
- "modify-overwrite-beta": Transform values (e.g., string concat, type conversion)
- "remove": Remove unwanted fields from output

Channel-specific rules:
- Shopify: wrap everything in { "product": {...} }, variants → product.variants[*]
- Amazon: flat structure, no root wrapper, bullet_points as array
- TikTok Shop: NO root wrapper, flat JSON, price must be STRING, category_id required
- WIX: product.name (not title), product.variants[].choices for options

JOLT path syntax:
- "product.title": map to nested path
- "product.variants[&1].price": map array elements preserving index
- "@(1,sku)": reference parent field
- "#constant": literal string value

Validation loop:
1. Generate initial JOLT
2. Use validate_jolt_spec tool to test it
3. If required fields are missing in output → fix and retry (max 3 iterations)
4. Return final validated JOLT + explanation

Output format:
{
  "joltSpec": [...],
  "explanation": {
    "rules": [
      {
        "operation": "shift",
        "description": "Map product fields to Shopify structure",
        "fieldsMapped": ["name→product.title", "description→product.body_html"]
      }
    ]
  },
  "validationResult": {
    "passed": true,
    "missingRequiredFields": [],
    "warnings": [],
    "iterationsNeeded": 2
  },
  "confidenceScore": 0.94
}
```

### 2.3 Validation Loop Implementation

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/JoltGenerationAgentService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class JoltGenerationAgentService {

    private final AnthropicClient anthropicClient;
    private final AgentToolHandlerService toolHandler;
    private final JoltTransformationService joltTransformationService; // EXISTING
    private final RagSearchService ragSearchService;
    private final ChannelJoltSpecRepository joltSpecRepository;
    private final AiRecommendationRepository recommendationRepository;
    private final AiAgentSessionRepository sessionRepository;

    private static final String MODEL = "claude-sonnet-4-6";
    private static final int MAX_TOKENS = 8192;
    private static final int MAX_TOOL_ROUNDS = 6; // max tool call iterations
    private static final double AUTO_APPLY_THRESHOLD = 0.92;
    private static final double RECOMMEND_THRESHOLD = 0.70;

    /**
     * Generate atau improve JOLT spec untuk channel+category.
     * Entry point utama dari ChannelPublishService atau manual trigger.
     */
    public Mono<JoltGenerationResult> generateJoltSpec(
            String channelId,
            String categoryId,
            Map<String, Object> sampleMasterProduct,
            String organizationId) {

        String sessionId = "jolt-gen-" + UUID.randomUUID();

        return buildGenerationContext(channelId, categoryId, sampleMasterProduct)
                .flatMap(ctx -> runJoltGenerationLoop(ctx, sessionId))
                .flatMap(result -> routeResult(result, channelId, categoryId, organizationId, sessionId))
                .onErrorResume(e -> {
                    log.error("JOLT generation agent failed: {}", e.getMessage());
                    return Mono.just(JoltGenerationResult.builder()
                            .status("AGENT_FAILED")
                            .errorMessage(e.getMessage())
                            .build());
                });
    }

    // ── Context Builder ───────────────────────────────────────────────────────

    private Mono<GenerationContext> buildGenerationContext(
            String channelId, String categoryId, Map<String, Object> sampleProduct) {

        // Ambil JOLT existing (jika ada)
        Mono<Optional<ChannelJoltSpec>> existingJoltMono = joltSpecRepository
                .findByChannelIdAndCategoryId(channelId, categoryId != null ? categoryId : "default")
                .map(Optional::of)
                .defaultIfEmpty(Optional.empty());

        // RAG: cari JOLT serupa
        String sourceFieldSample = sampleProduct.keySet().stream()
                .limit(15).collect(Collectors.joining(", "));
        Mono<List<RagSearchService.SearchResult>> ragJoltMono =
                ragSearchService.searchSimilarJoltSpecs(sourceFieldSample, channelId, categoryId, 3)
                        .onErrorReturn(List.of());

        return Mono.zip(existingJoltMono, ragJoltMono)
                .map(tuple -> GenerationContext.builder()
                        .channelId(channelId)
                        .categoryId(categoryId)
                        .sampleProduct(sampleProduct)
                        .existingJolt(tuple.getT1().orElse(null))
                        .ragSimilarJolts(tuple.getT2())
                        .mode(tuple.getT1().isPresent() ? "IMPROVE" : "CREATE")
                        .build());
    }

    // ── Main Agent Loop ───────────────────────────────────────────────────────

    private Mono<AgentRawOutput> runJoltGenerationLoop(
            GenerationContext ctx, String sessionId) {

        List<Map<String, Object>> messages = buildInitialMessages(ctx);
        List<Map<String, Object>> tools = buildToolDefinitions();
        List<AgentStep> steps = new ArrayList<>();

        return Mono.defer(() -> callAnthropicWithTools(messages, tools))
                .expand(response -> handleAnthropicResponse(response, messages, tools, steps))
                .filter(response -> isTerminalResponse(response))
                .next()
                .map(response -> parseAgentOutput(response, steps, sessionId));
    }

    private Mono<AnthropicResponse> handleAnthropicResponse(
            AnthropicResponse response,
            List<Map<String, Object>> messages,
            List<Map<String, Object>> tools,
            List<AgentStep> steps) {

        if (response.getStopReason().equals("tool_use")) {
            // Process tool calls
            List<Mono<Map<String, Object>>> toolResults = response.getToolUses().stream()
                    .map(toolUse -> toolHandler
                            .executeTool(toolUse.getName(), toolUse.getInput())
                            .map(result -> Map.<String, Object>of(
                                    "type", "tool_result",
                                    "tool_use_id", toolUse.getId(),
                                    "content", result)))
                    .toList();

            return Flux.fromIterable(toolResults)
                    .flatMap(m -> m)
                    .collectList()
                    .flatMap(results -> {
                        // Append assistant message dan tool results ke conversation
                        messages.add(Map.of("role", "assistant", "content", response.getContent()));
                        messages.add(Map.of("role", "user", "content", results));
                        // Track steps
                        response.getToolUses().forEach(tu ->
                                steps.add(AgentStep.builder()
                                        .tool(tu.getName())
                                        .input(tu.getInput())
                                        .build()));
                        // Continue loop jika masih di bawah max rounds
                        if (steps.size() < MAX_TOOL_ROUNDS) {
                            return callAnthropicWithTools(messages, tools);
                        }
                        return Mono.just(response); // force terminate
                    });
        }
        return Mono.empty(); // terminal state
    }

    private boolean isTerminalResponse(AnthropicResponse response) {
        return "end_turn".equals(response.getStopReason())
                || "max_tokens".equals(response.getStopReason());
    }

    // ── Result Routing ────────────────────────────────────────────────────────

    private Mono<JoltGenerationResult> routeResult(
            AgentRawOutput rawOutput,
            String channelId, String categoryId,
            String organizationId, String sessionId) {

        double confidence = rawOutput.getConfidenceScore();

        if (confidence >= AUTO_APPLY_THRESHOLD) {
            // Auto-apply — langsung update channel_jolt_specs
            return autoApplyJolt(rawOutput, channelId, categoryId, organizationId, sessionId);
        } else if (confidence >= RECOMMEND_THRESHOLD) {
            // Buat rekomendasi untuk developer approval
            return createRecommendation(rawOutput, channelId, categoryId, organizationId, sessionId);
        } else {
            // Confidence terlalu rendah — flag untuk manual review
            return Mono.just(JoltGenerationResult.builder()
                    .status("MANUAL_REVIEW_REQUIRED")
                    .confidenceScore(confidence)
                    .proposedJoltSpec(rawOutput.getJoltSpec())
                    .explanation(rawOutput.getExplanation())
                    .sessionId(sessionId)
                    .build());
        }
    }

    private Mono<JoltGenerationResult> autoApplyJolt(
            AgentRawOutput output, String channelId, String categoryId,
            String organizationId, String sessionId) {

        return joltSpecRepository
                .findByChannelIdAndCategoryId(channelId, categoryId != null ? categoryId : "default")
                .defaultIfEmpty(ChannelJoltSpec.builder()
                        .channelId(channelId)
                        .categoryId(categoryId != null ? categoryId : "default")
                        .organizationId(organizationId)
                        .isSystemDefault(organizationId == null)
                        .build())
                .flatMap(spec -> {
                    spec.setJoltSpec(output.getJoltSpec());
                    spec.setJoltMetadata(ChannelJoltSpec.JoltMetadata.builder()
                            .confidence(output.getConfidenceScore())
                            .generatedBy("ai-agent-v1")
                            .generatedAt(LocalDateTime.now())
                            .isManuallyConfigured(false)
                            .mappingCount(output.getJoltSpec().size())
                            .build());
                    spec.setUpdatedAt(LocalDateTime.now());
                    if (spec.getCreatedAt() == null) spec.setCreatedAt(LocalDateTime.now());
                    return joltSpecRepository.save(spec);
                })
                .map(saved -> JoltGenerationResult.builder()
                        .status("AUTO_APPLIED")
                        .joltSpecId(saved.getId())
                        .confidenceScore(output.getConfidenceScore())
                        .explanation(output.getExplanation())
                        .sessionId(sessionId)
                        .build());
    }

    private Mono<JoltGenerationResult> createRecommendation(
            AgentRawOutput output, String channelId, String categoryId,
            String organizationId, String sessionId) {
        // Delegasi ke AiRecommendationService (Phase 4)
        // ...
        return Mono.empty();
    }

    // ── Tool Handler: validate_jolt_spec ────────────────────────────────────

    /**
     * Dipanggil oleh AgentToolHandlerService untuk tool "validate_jolt_spec"
     */
    public Mono<String> validateJoltSpec(Map<String, Object> input) {
        List<Map<String, Object>> joltSpec = (List<Map<String, Object>>) input.get("joltSpec");
        Map<String, Object> sampleInput = (Map<String, Object>) input.get("sampleInput");
        String channelId = (String) input.get("channelId");
        String categoryId = (String) input.getOrDefault("categoryId", "default");

        return Mono.fromCallable(() -> {
            try {
                // Gunakan existing JoltTransformationService
                Object transformed = joltTransformationService.transform(sampleInput, joltSpec);

                // Validate required fields
                List<String> missingRequired = checkRequiredFields(transformed, channelId, categoryId);

                Map<String, Object> result = Map.of(
                        "passed", missingRequired.isEmpty(),
                        "transformedOutput", transformed,
                        "missingRequiredFields", missingRequired,
                        "warnings", detectWarnings(transformed, channelId)
                );
                return new ObjectMapper().writeValueAsString(result);
            } catch (Exception e) {
                Map<String, Object> error = Map.of(
                        "passed", false,
                        "error", e.getMessage(),
                        "errorType", e.getClass().getSimpleName()
                );
                return new ObjectMapper().writeValueAsString(error);
            }
        });
    }

    private List<String> checkRequiredFields(Object transformed, String channelId, String categoryId) {
        // Channel-specific required field checks
        // Ini adalah simplified version — full version menggunakan ChannelConfiguration.categoryRequirements
        Map<String, Object> output = (Map<String, Object>) transformed;
        List<String> missing = new ArrayList<>();

        switch (channelId.toLowerCase()) {
            case "shopify" -> {
                if (!hasPath(output, "product.title")) missing.add("product.title");
                if (!hasPath(output, "product.variants")) missing.add("product.variants");
            }
            case "amazon" -> {
                if (!hasPath(output, "brand")) missing.add("brand");
                if (!hasPath(output, "item_name")) missing.add("item_name");
            }
            case "tiktokshop" -> {
                if (!hasPath(output, "category_id")) missing.add("category_id");
                if (!hasPath(output, "skus")) missing.add("skus");
            }
        }
        return missing;
    }

    private List<String> detectWarnings(Object transformed, String channelId) {
        // Detect potential issues: wrong types, unexpected nulls, etc.
        return List.of(); // implemented per channel
    }

    private boolean hasPath(Map<String, Object> map, String dotPath) {
        String[] parts = dotPath.split("\\.");
        Object current = map;
        for (String part : parts) {
            if (!(current instanceof Map)) return false;
            current = ((Map<?, ?>) current).get(part);
            if (current == null) return false;
        }
        return true;
    }
}
```

---

## 3. `JoltGenerationResult` DTO

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/model/dto/JoltGenerationResult.java

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class JoltGenerationResult {

    // AUTO_APPLIED | RECOMMENDATION_CREATED | MANUAL_REVIEW_REQUIRED | AGENT_FAILED
    private String status;

    private String joltSpecId;         // Set jika AUTO_APPLIED
    private String recommendationId;   // Set jika RECOMMENDATION_CREATED

    private double confidenceScore;
    private List<Map<String, Object>> proposedJoltSpec;

    private JoltExplanation explanation;
    private ValidationSummary validationSummary;

    private String errorMessage;  // Set jika AGENT_FAILED
    private String sessionId;

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class JoltExplanation {
        private List<RuleExplanation> rules;
        private List<String> designDecisions; // kenapa struktur JOLT tertentu dipilih
        private List<String> limitations;     // apa yang tidak bisa di-handle JOLT ini
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class RuleExplanation {
        private String operation; // shift, default, modify-overwrite-beta, remove
        private String description;
        private List<String> fieldsMapped;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ValidationSummary {
        private boolean passed;
        private List<String> missingRequiredFields;
        private List<String> warnings;
        private int iterationsNeeded;
    }
}
```

---

## 4. API Endpoint: Manual JOLT Generation Trigger

```java
// Tambahkan ke ChannelJoltSpecAdminController atau buat AiJoltController baru:

// POST /api/v1/admin/ai/generate-jolt
@PostMapping("/generate-jolt")
public Mono<JoltGenerationResult> generateJolt(
        @RequestParam String channelId,
        @RequestParam(required = false) String categoryId,
        @RequestParam(required = false) String organizationId,
        @RequestBody Map<String, Object> sampleMasterProduct) {

    return joltGenerationAgentService.generateJoltSpec(
            channelId, categoryId, sampleMasterProduct, organizationId);
}
```

---

## 5. Trigger dari Publish Failure

Di `ChannelPublishService`, saat publish gagal karena JOLT issue:

```java
// Setelah receive FAILED dari workflow polling:

if ("FAILED".equals(ws.getSyncStatus()) && isJoltRelatedError(ws.getFailureReason())) {
    joltGenerationAgentService
            .generateJoltSpec(channelType, categoryId, sampleProductData, organizationId)
            .subscribe(
                    result -> log.info("AI JOLT generation triggered: status={} confidence={}",
                            result.getStatus(), result.getConfidenceScore()),
                    err -> log.warn("AI JOLT generation failed: {}", err.getMessage()));
}
```

---

## 6. Validation Loop Diagram

```
LLM generates initial JOLT
        │
        ▼
validate_jolt_spec(jolt, sampleData, channelId)
        │
        ├── passed=true, no missing required → DONE ✓
        │
        ├── missingRequiredFields: ["product.vendor"]
        │   LLM: "Add default value for product.vendor"
        │   → Retry JOLT dengan default operation
        │   → validate again (iteration 2)
        │
        └── error: "ClassCastException at product.variants"
            LLM: "variants structure wrong, fix array syntax"
            → Rewrite variants section
            → validate again (iteration 3)
            
Max 3 iterations → return best attempt dengan confidence score
```

---

## 7. Confidence Scoring Algorithm

```
Base confidence = average(fieldMapping.confidence untuk semua mapped fields)

Bonuses:
+ 0.05 jika validation passed tanpa iteration
+ 0.03 jika all required fields present dalam output
- 0.10 jika ada field UNCERTAIN dari Phase 2
- 0.05 per missing required field
- 0.03 per validation warning
- 0.15 jika validation gagal setelah 3 iterations

Final cap: min(0.99, max(0.0, base + bonuses))
```

---

## 8. Verification Checklist

- [ ] `JoltGenerationAgentService.generateJoltSpec()` mengembalikan JOLT valid untuk Shopify clothing
- [ ] Validation loop berhenti setelah max 3 iterations jika validation gagal
- [ ] `AUTO_APPLIED` terjadi ketika confidence >= 0.92
- [ ] `RECOMMENDATION_CREATED` terjadi ketika confidence 0.70–0.91
- [ ] JOLT yang auto-applied tersimpan ke `channel_jolt_specs` dengan `generatedBy="ai-agent-v1"`
- [ ] Publish failure untuk channel Shopify men-trigger JOLT generation agent
- [ ] Channel-specific notes (TikTok category_id, Amazon brand) dimasukkan ke context
