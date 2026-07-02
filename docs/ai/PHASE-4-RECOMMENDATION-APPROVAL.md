# Phase 4 — Recommendation & Approval Workflow

**Status**: Design Ready  
**Depends on**: Phase 3 (JOLT Generation Agent)  
**New Collections**: `ai_recommendations`  
**New Endpoints**: `/api/v1/admin/ai/recommendations/**`  
**Output**: Antrian rekomendasi terkelola dengan developer approval flow, diff view, dan notifikasi

---

## 1. Tujuan Phase Ini

Phase 4 adalah jembatan antara **AI yang generate fix** dan **developer yang punya final authority**.

Prinsip utama:
- AI tidak pernah mengubah JOLT production tanpa developer tahu
- Kecuali: `confidence >= AUTO_APPLY_THRESHOLD` (default 0.92) — bisa diset per channel
- Developer mendapat **penjelasan lengkap** + **diff** + **bukti dari RAG** sebelum approve
- Rejected recommendation menjadi training signal (AI belajar dari rejection)

---

## 2. `AiRecommendation` Entity

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/model/entity/AiRecommendation.java

@Data @Builder @NoArgsConstructor @AllArgsConstructor
@Document(collection = "ai_recommendations")
@CompoundIndexes({
    @CompoundIndex(def = "{'channelId': 1, 'status': 1}"),
    @CompoundIndex(def = "{'status': 1, 'priority': 1, 'createdAt': -1}")
})
public class AiRecommendation {

    @Id
    private String id;

    // PENDING | APPROVED | REJECTED | AUTO_APPLIED | EXPIRED
    @Indexed
    private String status;

    // HIGH | MEDIUM | LOW
    private String priority;

    @Indexed
    private String channelId;

    private String categoryId;

    private String organizationId;

    // PUBLISH_FAILED | VALIDATION_WARNING | SCHEMA_DRIFT | MANUAL_TRIGGER | LOW_CONFIDENCE_JOLT
    private String triggerType;

    private TriggerContext triggerContext;

    private Analysis analysis;

    private ProposedFix proposedFix;

    // Developer interaction
    private String developerNote;
    private String reviewedBy;
    private LocalDateTime reviewedAt;
    private String rejectionReason;

    // Lifecycle
    private LocalDateTime appliedAt;
    private String appliedJoltSpecId;
    private LocalDateTime expiresAt;   // TTL: auto-expire setelah 30 hari

    private String agentSessionId;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("updated_at")
    private LocalDateTime updatedAt;

    // ── Nested DTOs ───────────────────────────────────────────────────────────

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class TriggerContext {
        private String masterProductId;
        private String publishAttemptId;
        private String errorMessage;
        private String joltSpecIdBefore;   // JOLT yang dipakai saat gagal
        private Map<String, Object> sampleProductSnapshot; // snapshot data saat trigger
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Analysis {
        private String rootCause;          // Penjelasan LLM tentang penyebab masalah
        private List<String> affectedFields;
        private List<String> missingChannelRequirements;
        private double confidenceScore;
        private String confidenceLevel;    // HIGH (>0.9) | MEDIUM (0.7-0.9) | LOW (<0.7)
        private List<String> ragEvidence;  // Daftar bukti dari vector search
        private List<String> warnings;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ProposedFix {
        // JOLT_PATCH | NEW_JOLT | FIELD_MAPPING_ADD | FIELD_MAPPING_UPDATE
        private String type;

        private String currentJoltSpecId;
        private List<Map<String, Object>> proposedJoltSpec;

        private JoltDiff diff;   // Human-readable diff untuk developer

        private String explanation;  // Rangkuman dari LLM tentang apa yang diubah

        private List<FieldMappingChange> fieldMappingChanges;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class JoltDiff {
        private List<DiffEntry> added;
        private List<DiffEntry> removed;
        private List<DiffEntry> modified;
        private int totalChanges;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class DiffEntry {
        private String operation;      // e.g., "shift", "default"
        private String field;
        private String before;
        private String after;
        private String reason;         // LLM explanation untuk perubahan ini
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class FieldMappingChange {
        private String sourceField;
        private String oldTargetField;
        private String newTargetField;
        private double confidenceChange; // Δ confidence
        private String reason;
    }
}
```

---

## 3. `AiRecommendationService`

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/AiRecommendationService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class AiRecommendationService {

    private final AiRecommendationRepository recommendationRepository;
    private final ChannelJoltSpecRepository joltSpecRepository;
    private final ChannelFieldMappingRepository fieldMappingRepository;
    private final RagEmbeddingService embeddingService;
    private final AiNotificationService notificationService;

    /**
     * Buat rekomendasi baru dari hasil JOLT generation agent.
     * Dipanggil dari JoltGenerationAgentService saat confidence < AUTO_APPLY_THRESHOLD.
     */
    public Mono<AiRecommendation> createFromJoltGeneration(
            AgentRawOutput agentOutput,
            String channelId, String categoryId,
            String organizationId, String sessionId,
            AiRecommendation.TriggerContext triggerContext) {

        String priority = agentOutput.getConfidenceScore() >= 0.85 ? "HIGH"
                : agentOutput.getConfidenceScore() >= 0.70 ? "MEDIUM" : "LOW";

        return fetchCurrentJoltForDiff(channelId, categoryId)
                .map(currentJolt -> buildDiff(currentJolt, agentOutput.getJoltSpec()))
                .defaultIfEmpty(AiRecommendation.JoltDiff.builder()
                        .added(List.of()).removed(List.of()).modified(List.of())
                        .totalChanges(agentOutput.getJoltSpec().size())
                        .build())
                .flatMap(diff -> {
                    AiRecommendation rec = AiRecommendation.builder()
                            .status("PENDING")
                            .priority(priority)
                            .channelId(channelId)
                            .categoryId(categoryId)
                            .organizationId(organizationId)
                            .triggerType(triggerContext != null ? "PUBLISH_FAILED" : "MANUAL_TRIGGER")
                            .triggerContext(triggerContext)
                            .analysis(AiRecommendation.Analysis.builder()
                                    .rootCause(agentOutput.getRootCause())
                                    .affectedFields(agentOutput.getAffectedFields())
                                    .confidenceScore(agentOutput.getConfidenceScore())
                                    .confidenceLevel(priority.equals("HIGH") ? "HIGH"
                                            : priority.equals("MEDIUM") ? "MEDIUM" : "LOW")
                                    .ragEvidence(agentOutput.getRagEvidence())
                                    .warnings(agentOutput.getWarnings())
                                    .build())
                            .proposedFix(AiRecommendation.ProposedFix.builder()
                                    .type("JOLT_PATCH")
                                    .proposedJoltSpec(agentOutput.getJoltSpec())
                                    .diff(diff)
                                    .explanation(agentOutput.getExplanationSummary())
                                    .fieldMappingChanges(agentOutput.getFieldMappingChanges())
                                    .build())
                            .agentSessionId(sessionId)
                            .expiresAt(LocalDateTime.now().plusDays(30))
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();

                    return recommendationRepository.save(rec);
                })
                .doOnSuccess(rec -> {
                    log.info("Created recommendation {} for channel={} confidence={}",
                            rec.getId(), channelId, rec.getAnalysis().getConfidenceScore());
                    // Notify developer
                    notificationService.notifyNewRecommendation(rec).subscribe();
                });
    }

    /**
     * Developer approve → apply fix ke production.
     */
    public Mono<AiRecommendation> approve(
            String recommendationId, String reviewedBy, String developerNote) {

        return recommendationRepository.findById(recommendationId)
                .switchIfEmpty(Mono.error(new IllegalArgumentException("Recommendation not found: " + recommendationId)))
                .filter(rec -> "PENDING".equals(rec.getStatus()))
                .switchIfEmpty(Mono.error(new IllegalStateException("Recommendation is not in PENDING status")))
                .flatMap(rec -> applyFix(rec)
                        .map(appliedSpecId -> {
                            rec.setStatus("APPROVED");
                            rec.setReviewedBy(reviewedBy);
                            rec.setReviewedAt(LocalDateTime.now());
                            rec.setDeveloperNote(developerNote);
                            rec.setAppliedAt(LocalDateTime.now());
                            rec.setAppliedJoltSpecId(appliedSpecId);
                            rec.setUpdatedAt(LocalDateTime.now());
                            return rec;
                        }))
                .flatMap(recommendationRepository::save)
                .doOnSuccess(rec -> {
                    // Update field mapping success rates (Phase 5 concern, called here)
                    updateFieldMappingSuccessRates(rec).subscribe();
                    // Re-embed updated JOLT spec
                    reEmbedAfterApproval(rec).subscribe();
                });
    }

    /**
     * Developer reject → simpan alasan sebagai learning signal.
     */
    public Mono<AiRecommendation> reject(
            String recommendationId, String reviewedBy, String rejectionReason) {

        return recommendationRepository.findById(recommendationId)
                .filter(rec -> "PENDING".equals(rec.getStatus()))
                .switchIfEmpty(Mono.error(new IllegalStateException("Not PENDING")))
                .map(rec -> {
                    rec.setStatus("REJECTED");
                    rec.setReviewedBy(reviewedBy);
                    rec.setReviewedAt(LocalDateTime.now());
                    rec.setRejectionReason(rejectionReason);
                    rec.setUpdatedAt(LocalDateTime.now());
                    return rec;
                })
                .flatMap(recommendationRepository::save)
                .doOnSuccess(rec -> persistRejectionAsLearning(rec).subscribe());
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    private Mono<String> applyFix(AiRecommendation rec) {
        if (!"JOLT_PATCH".equals(rec.getProposedFix().getType())
                && !"NEW_JOLT".equals(rec.getProposedFix().getType())) {
            return Mono.just("N/A");
        }

        String catId = rec.getCategoryId() != null ? rec.getCategoryId() : "default";

        return joltSpecRepository
                .findByChannelIdAndCategoryId(rec.getChannelId(), catId)
                .defaultIfEmpty(ChannelJoltSpec.builder()
                        .channelId(rec.getChannelId())
                        .categoryId(catId)
                        .organizationId(rec.getOrganizationId())
                        .isSystemDefault(rec.getOrganizationId() == null)
                        .createdAt(LocalDateTime.now())
                        .build())
                .flatMap(spec -> {
                    spec.setJoltSpec(rec.getProposedFix().getProposedJoltSpec());
                    spec.setJoltMetadata(ChannelJoltSpec.JoltMetadata.builder()
                            .confidence(rec.getAnalysis().getConfidenceScore())
                            .generatedBy("ai-approved-by:" + rec.getReviewedBy())
                            .generatedAt(LocalDateTime.now())
                            .isManuallyConfigured(false)
                            .mappingCount(rec.getProposedFix().getProposedJoltSpec().size())
                            .build());
                    spec.setUpdatedAt(LocalDateTime.now());
                    spec.setIsActive(true);
                    return joltSpecRepository.save(spec);
                })
                .map(ChannelJoltSpec::getId);
    }

    private Mono<List<Map<String, Object>>> fetchCurrentJoltForDiff(String channelId, String categoryId) {
        return joltSpecRepository
                .findByChannelIdAndCategoryId(channelId, categoryId != null ? categoryId : "default")
                .map(ChannelJoltSpec::getJoltSpec);
    }

    private AiRecommendation.JoltDiff buildDiff(
            List<Map<String, Object>> current,
            List<Map<String, Object>> proposed) {
        // Simplified diff — production version menggunakan Jackson diff atau custom comparator
        int currentSize = current != null ? current.size() : 0;
        int proposedSize = proposed != null ? proposed.size() : 0;
        return AiRecommendation.JoltDiff.builder()
                .totalChanges(Math.abs(proposedSize - currentSize))
                .added(List.of())
                .removed(List.of())
                .modified(List.of())
                .build();
    }

    private Mono<Void> updateFieldMappingSuccessRates(AiRecommendation rec) {
        // Phase 5 concern — implementation di Phase 5
        return Mono.empty();
    }

    private Mono<Void> reEmbedAfterApproval(AiRecommendation rec) {
        if (rec.getAppliedJoltSpecId() == null) return Mono.empty();
        return joltSpecRepository.findById(rec.getAppliedJoltSpecId())
                .flatMap(embeddingService::embedJoltSpec)
                .then();
    }

    private Mono<Void> persistRejectionAsLearning(AiRecommendation rec) {
        // Simpan ke ai_agent_sessions sebagai negative signal — Phase 5 concern
        log.info("Rejection recorded for recommendation {} reason: {}",
                rec.getId(), rec.getRejectionReason());
        return Mono.empty();
    }
}
```

---

## 4. REST API: `AiRecommendationController`

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/controller/AiRecommendationController.java

@RestController
@RequestMapping("/api/v1/admin/ai/recommendations")
@RequiredArgsConstructor
public class AiRecommendationController {

    private final AiRecommendationService recommendationService;
    private final AiRecommendationRepository recommendationRepository;

    /** List rekomendasi dengan filter. */
    @GetMapping
    public Flux<AiRecommendation> list(
            @RequestParam(required = false) String channelId,
            @RequestParam(required = false, defaultValue = "PENDING") String status,
            @RequestParam(required = false, defaultValue = "20") int limit) {

        if (channelId != null) {
            return recommendationRepository
                    .findByChannelIdAndStatusOrderByCreatedAtDesc(channelId, status)
                    .take(limit);
        }
        return recommendationRepository
                .findByStatusOrderByPriorityAscCreatedAtDesc(status)
                .take(limit);
    }

    /** Get detail satu rekomendasi + diff. */
    @GetMapping("/{id}")
    public Mono<AiRecommendation> getById(@PathVariable String id) {
        return recommendationRepository.findById(id)
                .switchIfEmpty(Mono.error(new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Recommendation not found: " + id)));
    }

    /** Approve — apply fix ke production. */
    @PostMapping("/{id}/approve")
    @ResponseStatus(HttpStatus.OK)
    public Mono<AiRecommendation> approve(
            @PathVariable String id,
            @RequestParam String reviewedBy,
            @RequestParam(required = false) String note) {

        return recommendationService.approve(id, reviewedBy, note);
    }

    /** Reject — simpan reason untuk learning. */
    @PostMapping("/{id}/reject")
    @ResponseStatus(HttpStatus.OK)
    public Mono<AiRecommendation> reject(
            @PathVariable String id,
            @RequestParam String reviewedBy,
            @RequestBody Map<String, String> body) {

        return recommendationService.reject(id, reviewedBy, body.get("reason"));
    }

    /** Manual trigger: generate JOLT untuk channel+category tanpa publish failure. */
    @PostMapping("/trigger-analysis")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Mono<Map<String, String>> triggerAnalysis(
            @RequestParam String channelId,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String organizationId,
            @RequestBody Map<String, Object> sampleProduct) {

        // Async — return session ID, developer poll status
        return recommendationService
                .triggerManualAnalysis(channelId, categoryId, sampleProduct, organizationId)
                .map(sessionId -> Map.of("sessionId", sessionId, "status", "TRIGGERED"));
    }

    /** Get agent session detail untuk observability. */
    @GetMapping("/sessions/{sessionId}")
    public Mono<AiAgentSession> getSession(@PathVariable String sessionId) {
        return sessionRepository.findById(sessionId)
                .switchIfEmpty(Mono.error(new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Session not found")));
    }
}
```

---

## 5. Notification System

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/AiNotificationService.java

@Service
@RequiredArgsConstructor
public class AiNotificationService {

    private final ApplicationEventPublisher eventPublisher;

    /**
     * Notify developer via application event (bisa dihubungkan ke Slack, email, atau WebSocket).
     * Phase 4 hanya menyimpan notification event.
     * Integrasi Slack/email bisa ditambahkan di Phase 5.
     */
    public Mono<Void> notifyNewRecommendation(AiRecommendation rec) {
        return Mono.fromRunnable(() -> {
            NewRecommendationEvent event = NewRecommendationEvent.builder()
                    .recommendationId(rec.getId())
                    .channelId(rec.getChannelId())
                    .priority(rec.getPriority())
                    .confidenceScore(rec.getAnalysis().getConfidenceScore())
                    .triggerType(rec.getTriggerType())
                    .summary(buildSummary(rec))
                    .reviewUrl("/admin/ai/recommendations/" + rec.getId())
                    .build();
            eventPublisher.publishEvent(event);
        });
    }

    private String buildSummary(AiRecommendation rec) {
        return String.format("[%s] AI menemukan JOLT issue untuk channel=%s category=%s. " +
                "Confidence=%.0f%%. Root cause: %s",
                rec.getPriority(),
                rec.getChannelId(),
                rec.getCategoryId() != null ? rec.getCategoryId() : "default",
                rec.getAnalysis().getConfidenceScore() * 100,
                rec.getAnalysis().getRootCause());
    }
}
```

---

## 6. Auto-Apply Configuration

```yaml
# application.yml — per-channel thresholds
ai:
  recommendation:
    auto-apply-threshold: 0.92      # global default
    channel-overrides:
      shopify: 0.90                 # Shopify schema sederhana → threshold lebih rendah
      amazon: 0.95                  # Amazon kompleks → threshold lebih tinggi
      tiktokshop: 0.95              # TikTok strict rules
    recommendation-threshold: 0.70  # di bawah ini → MANUAL_REVIEW_REQUIRED
    expiry-days: 30                  # PENDING recommendation expires setelah N hari
    max-pending-per-channel: 10      # Jika > 10 PENDING, escalate priority
```

---

## 7. Developer UI Contract (Frontend)

Endpoint yang dibutuhkan frontend untuk Recommendation Dashboard:

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/v1/admin/ai/recommendations?status=PENDING` | List pending |
| `GET` | `/api/v1/admin/ai/recommendations/{id}` | Detail + diff |
| `POST` | `/api/v1/admin/ai/recommendations/{id}/approve` | Approve |
| `POST` | `/api/v1/admin/ai/recommendations/{id}/reject` | Reject dengan reason |
| `POST` | `/api/v1/admin/ai/recommendations/trigger-analysis` | Manual trigger |
| `GET` | `/api/v1/admin/ai/recommendations/sessions/{sessionId}` | Agent session detail |

Response untuk GET detail sudah include:
- `proposedFix.diff` — human-readable diff (added/removed/modified rules)
- `analysis.ragEvidence` — bukti dari vector search
- `analysis.rootCause` — penjelasan LLM
- `proposedFix.explanation` — rangkuman perubahan

---

## 8. Recommendation Status Flow

```
PENDING ──────────────────────► APPROVED ──► (apply fix) ──► channel_jolt_specs updated
   │                                                              │
   │                                                         re-embed + 
   │                                                         update successRate
   │
   └─────────────────────────► REJECTED ──► (save learning signal)
   
   PENDING ──[30 days]──────► EXPIRED  ──► no action
   
   (dari Phase 3)
   confidence >= 0.92 ───────► AUTO_APPLIED ──► direct to channel_jolt_specs
```

---

## 9. Verification Checklist

- [ ] `ai_recommendations` collection tersimpan di MongoDB dengan index yang benar
- [ ] `GET /api/v1/admin/ai/recommendations?status=PENDING` mengembalikan list yang benar
- [ ] `POST /{id}/approve` berhasil apply JOLT ke `channel_jolt_specs`
- [ ] `POST /{id}/reject` menyimpan `rejectionReason` dan mengubah status
- [ ] Recommendation dengan confidence < 0.70 berstatus `MANUAL_REVIEW_REQUIRED` (tidak masuk antrian)
- [ ] Auto-apply berjalan untuk confidence >= threshold channel
- [ ] `expiresAt` di-set 30 hari dari `createdAt`
- [ ] Event `NewRecommendationEvent` ter-publish saat rekomendasi baru dibuat
