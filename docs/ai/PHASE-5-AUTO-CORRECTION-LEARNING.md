# Phase 5 — Auto-Correction & Continuous Learning

**Status**: Design Ready  
**Depends on**: Phase 4 (Recommendation & Approval)  
**Collections Updated**: `channel_field_mappings`, `ai_schema_embeddings`, `ai_agent_sessions`  
**Output**: Sistem yang semakin akurat seiring waktu; developer intervensi mendekati nol untuk channel yang sudah mature

---

## 1. Tujuan Phase Ini

Phase 5 menutup **feedback loop**: setiap interaksi (approve, reject, publish success/fail) menjadi sinyal yang meningkatkan akurasi AI di masa depan.

Komponen Phase 5:

| Komponen | Fungsi |
|---|---|
| **Success Rate Updater** | Update `ChannelFieldMapping.successRate` setelah publish berhasil |
| **Rejection Learner** | Parse rejection reason → update knowledge base |
| **Embedding Updater** | Re-embed JOLT specs + field mappings setelah perubahan |
| **Confidence Calibrator** | Analisis historis approval/rejection → calibrate threshold per channel |
| **Schema Drift Detector** | Deteksi saat channel schema berubah → trigger re-analysis |
| **Autonomous Scheduler** | Cron job untuk maintenance: expire rekomendasi, trim embeddings lama |

---

## 2. Success Rate Feedback Loop

### 2.1 Trigger Points

```
Publish COMPLETED (dari workflow polling) ──► updateSuccessRates(channelId, mappings, SUCCESS)
Publish FAILED    (dari workflow polling) ──► updateSuccessRates(channelId, mappings, FAILED)
Recommendation APPROVED                  ──► updateSuccessRates(channelId, diff, SUCCESS)
Recommendation REJECTED                  ──► persistRejectionLearning(reason, diff)
```

### 2.2 Implementation

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/LearningFeedbackService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class LearningFeedbackService {

    private final ChannelFieldMappingRepository fieldMappingRepository;
    private final FieldSemanticKnowledgeRepository semanticKnowledgeRepository;
    private final AiRecommendationRepository recommendationRepository;
    private final AiAgentSessionRepository sessionRepository;
    private final RagEmbeddingService embeddingService;
    private final ChannelJoltSpecRepository joltSpecRepository;

    private static final double LEARNING_RATE = 0.1;  // EMA smoothing factor
    private static final double MAX_SUCCESS_RATE = 0.99;
    private static final double MIN_SUCCESS_RATE = 0.01;

    /**
     * Dipanggil dari ChannelPublishService setelah workflow selesai (COMPLETED atau FAILED).
     */
    public Mono<Void> recordPublishOutcome(
            String channelId,
            String categoryId,
            List<String> usedFieldMappings,  // field mapping IDs yang dipakai di JOLT ini
            boolean success,
            String publishAttemptId) {

        if (usedFieldMappings == null || usedFieldMappings.isEmpty()) return Mono.empty();

        return Flux.fromIterable(usedFieldMappings)
                .flatMap(mappingId -> updateMappingSuccessRate(mappingId, success))
                .then()
                .doOnSuccess(v -> log.info("Updated {} field mappings for publish {} outcome={}",
                        usedFieldMappings.size(), publishAttemptId, success ? "SUCCESS" : "FAILED"))
                .onErrorResume(e -> {
                    log.warn("Failed to update learning feedback: {}", e.getMessage());
                    return Mono.empty();
                });
    }

    /**
     * Update success rate dengan Exponential Moving Average (EMA).
     * EMA lebih responsive terhadap kejadian terbaru vs rata-rata sederhana.
     */
    private Mono<ChannelFieldMapping> updateMappingSuccessRate(String mappingId, boolean success) {
        return fieldMappingRepository.findById(mappingId)
                .flatMap(mapping -> {
                    double current = mapping.getSuccessRate() != null ? mapping.getSuccessRate() : 0.5;
                    double signal = success ? 1.0 : 0.0;
                    // EMA: new = α × signal + (1−α) × current
                    double updated = LEARNING_RATE * signal + (1 - LEARNING_RATE) * current;
                    updated = Math.min(MAX_SUCCESS_RATE, Math.max(MIN_SUCCESS_RATE, updated));

                    mapping.setSuccessRate(updated);
                    mapping.setUsageCount(mapping.getUsageCount() != null
                            ? mapping.getUsageCount() + 1 : 1);
                    mapping.setLastUsedAt(LocalDateTime.now());
                    mapping.setUpdatedAt(LocalDateTime.now());
                    return fieldMappingRepository.save(mapping);
                })
                .onErrorResume(e -> Mono.empty()); // non-breaking
    }

    /**
     * Proses rejection dari developer — extract learning dari reason.
     */
    public Mono<Void> processRejection(AiRecommendation rejection) {
        String reason = rejection.getRejectionReason();
        if (reason == null || reason.isBlank()) return Mono.empty();

        return Mono.defer(() -> {
            // Simpan rejection event ke ai_agent_sessions untuk analisis
            AiAgentSession.RejectionEvent rejEvent = AiAgentSession.RejectionEvent.builder()
                    .recommendationId(rejection.getId())
                    .channelId(rejection.getChannelId())
                    .categoryId(rejection.getCategoryId())
                    .reason(reason)
                    .confidenceAtRejection(rejection.getAnalysis().getConfidenceScore())
                    .proposedFix(rejection.getProposedFix().getType())
                    .rejectedAt(LocalDateTime.now())
                    .build();

            // Analisis pola rejection: apakah AI sering salah untuk channel ini?
            return checkRejectionPattern(rejection.getChannelId())
                    .flatMap(rejectionRate -> {
                        if (rejectionRate > 0.5) {
                            // Lebih dari 50% rekomendasi ditolak → naikkan threshold
                            log.warn("High rejection rate ({}) for channel {}. Consider raising auto-apply threshold.",
                                    rejectionRate, rejection.getChannelId());
                        }
                        // Mark field mappings yang terkait sebagai "uncertain"
                        return downgradeRejectedMappings(rejection);
                    });
        });
    }

    private Mono<Double> checkRejectionPattern(String channelId) {
        return recommendationRepository
                .countByChannelIdAndStatus(channelId, "REJECTED")
                .zipWith(recommendationRepository.countByChannelId(channelId))
                .map(tuple -> tuple.getT2() > 0
                        ? (double) tuple.getT1() / tuple.getT2() : 0.0);
    }

    private Mono<Void> downgradeRejectedMappings(AiRecommendation rejection) {
        if (rejection.getProposedFix().getFieldMappingChanges() == null) return Mono.empty();

        return Flux.fromIterable(rejection.getProposedFix().getFieldMappingChanges())
                .flatMap(change -> fieldMappingRepository
                        .findByChannelIdAndSourceFieldAndTargetField(
                                rejection.getChannelId(),
                                change.getSourceField(),
                                change.getNewTargetField())
                        .flatMap(mapping -> {
                            // Downgrade confidence slightly untuk rejected mapping
                            double downgraded = Math.max(MIN_SUCCESS_RATE,
                                    (mapping.getConfidence() != null ? mapping.getConfidence() : 0.5) - 0.05);
                            mapping.setConfidence(downgraded);
                            mapping.setUpdatedAt(LocalDateTime.now());
                            return fieldMappingRepository.save(mapping);
                        })
                        .onErrorResume(e -> Mono.empty()))
                .then();
    }
}
```

---

## 3. Schema Drift Detector

Mendeteksi saat channel schema berubah (new required fields, deprecated fields, type changes):

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/SchemaDriftDetectorService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class SchemaDriftDetectorService {

    private final ChannelService channelService;
    private final ChannelJoltSpecRepository joltSpecRepository;
    private final JoltGenerationAgentService joltGenerationAgent;
    private final AiRecommendationService recommendationService;

    /**
     * Dipanggil dari scheduled job (lihat Section 5).
     * Membandingkan channel schema yang di-cache vs JOLT existing.
     */
    @Scheduled(cron = "0 0 2 * * ?")  // Setiap hari jam 02:00
    public void detectDrift() {
        log.info("Schema drift detection starting...");
        channelService.getAllActiveChannels()
                .flatMap(this::checkChannelForDrift)
                .subscribe(
                        result -> log.info("Drift check result: {}", result),
                        err -> log.error("Drift detection error: {}", err.getMessage()));
    }

    private Mono<DriftCheckResult> checkChannelForDrift(ChannelConfiguration channel) {
        return joltSpecRepository
                .findByChannelIdAndIsActiveTrue(channel.getChannelId())
                .collectList()
                .map(specs -> {
                    // Hitung hash dari required fields set saat ini
                    String currentSchemaHash = computeSchemaHash(channel);

                    List<ChannelJoltSpec> outdated = specs.stream()
                            .filter(spec -> spec.getJoltMetadata() != null
                                    && spec.getJoltMetadata().getSupersetSchemaHash() != null
                                    && !spec.getJoltMetadata().getSupersetSchemaHash().equals(currentSchemaHash))
                            .toList();

                    if (!outdated.isEmpty()) {
                        log.info("Schema drift detected for channel={}: {} JOLT specs outdated",
                                channel.getChannelId(), outdated.size());
                        // Trigger AI analysis untuk setiap outdated spec
                        outdated.forEach(spec ->
                                joltGenerationAgent.generateJoltSpec(
                                        spec.getChannelId(), spec.getCategoryId(),
                                        buildSampleFromSupersetSchema(spec.getSupersetSchema()),
                                        null)
                                        .subscribe());
                    }

                    return new DriftCheckResult(channel.getChannelId(), outdated.size());
                });
    }

    private String computeSchemaHash(ChannelConfiguration channel) {
        // Hash berdasarkan required fields dari ChannelConfiguration
        String content = channel.getChannelId() + ":"
                + (channel.getCategoryRequirements() != null
                ? channel.getCategoryRequirements().toString() : "");
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(content.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return String.valueOf(content.hashCode());
        }
    }

    private Map<String, Object> buildSampleFromSupersetSchema(ChannelJoltSpec.SupersetSchema schema) {
        if (schema == null || schema.getRequiredFields() == null) return Map.of();
        Map<String, Object> sample = new LinkedHashMap<>();
        schema.getRequiredFields().forEach(f -> sample.put(f, "sample_value"));
        return sample;
    }

    public record DriftCheckResult(String channelId, int outdatedSpecCount) {}
}
```

---

## 4. Confidence Calibrator

Menganalisis historis untuk calibrate threshold AI per channel:

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/ConfidenceCalibrationService.java

@Slf4j
@Service
@RequiredArgsConstructor
public class ConfidenceCalibrationService {

    private final AiRecommendationRepository recommendationRepository;
    private final AiCalibrationConfigRepository calibrationRepository;

    /**
     * Analisis 90 hari terakhir approval/rejection per channel.
     * Output: adjusted threshold yang lebih akurat.
     * Dijalankan weekly.
     */
    @Scheduled(cron = "0 0 3 ? * SUN")  // Setiap Minggu jam 03:00
    public void recalibrateThresholds() {
        log.info("Recalibrating AI confidence thresholds...");
        recommendationRepository
                .findDistinctChannelIds()
                .flatMap(this::calibrateChannel)
                .subscribe(
                        result -> log.info("Calibrated channel={} newThreshold={}",
                                result.channelId(), result.newThreshold()),
                        err -> log.error("Calibration error: {}", err.getMessage()));
    }

    private Mono<CalibrationResult> calibrateChannel(String channelId) {
        LocalDateTime since = LocalDateTime.now().minusDays(90);

        return Mono.zip(
                recommendationRepository.countByChannelIdAndStatusAndCreatedAtAfter(
                        channelId, "APPROVED", since),
                recommendationRepository.countByChannelIdAndStatusAndCreatedAtAfter(
                        channelId, "REJECTED", since),
                recommendationRepository.findAvgConfidenceByChannelIdAndStatusAndCreatedAtAfter(
                        channelId, "APPROVED", since),
                recommendationRepository.findAvgConfidenceByChannelIdAndStatusAndCreatedAtAfter(
                        channelId, "REJECTED", since))
                .map(tuple -> {
                    long approved = tuple.getT1();
                    long rejected = tuple.getT2();
                    double avgApprovedConfidence = tuple.getT3();
                    double avgRejectedConfidence = tuple.getT4();

                    double total = approved + rejected;
                    if (total < 10) {
                        // Tidak cukup data — keep default
                        return new CalibrationResult(channelId, 0.92, "INSUFFICIENT_DATA");
                    }

                    double approvalRate = approved / total;

                    // Calibrated threshold: midpoint antara avg confidence yang approved vs rejected
                    double newThreshold = (avgApprovedConfidence + avgRejectedConfidence) / 2.0;
                    // Clamp ke range yang aman
                    newThreshold = Math.min(0.97, Math.max(0.75, newThreshold));

                    log.info("Channel {}: approved={} rejected={} approvalRate={}% " +
                            "avgApprovedConf={} avgRejectedConf={} newThreshold={}",
                            channelId, approved, rejected,
                            String.format("%.0f", approvalRate * 100),
                            avgApprovedConfidence, avgRejectedConfidence, newThreshold);

                    return new CalibrationResult(channelId, newThreshold, "CALIBRATED");
                })
                .flatMap(result -> saveCalibration(result));
    }

    private Mono<CalibrationResult> saveCalibration(CalibrationResult result) {
        // Simpan ke ai_calibration_config collection
        return calibrationRepository.upsertThreshold(result.channelId(), result.newThreshold())
                .thenReturn(result);
    }

    public record CalibrationResult(String channelId, double newThreshold, String reason) {}
}
```

---

## 5. Autonomous Maintenance Scheduler

```java
// src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern/service/AiMaintenanceScheduler.java

@Slf4j
@Component
@RequiredArgsConstructor
public class AiMaintenanceScheduler {

    private final AiRecommendationRepository recommendationRepository;
    private final AiSchemaEmbeddingRepository embeddingRepository;
    private final RagEmbeddingService embeddingService;
    private final ChannelJoltSpecRepository joltSpecRepository;

    /** Expire PENDING recommendations yang sudah lebih dari 30 hari. */
    @Scheduled(cron = "0 0 1 * * ?")  // Daily 01:00
    public void expireOldRecommendations() {
        recommendationRepository
                .findByStatusAndExpiresAtBefore("PENDING", LocalDateTime.now())
                .flatMap(rec -> {
                    rec.setStatus("EXPIRED");
                    rec.setUpdatedAt(LocalDateTime.now());
                    return recommendationRepository.save(rec);
                })
                .count()
                .subscribe(count -> log.info("Expired {} stale recommendations", count));
    }

    /** Re-embed JOLT specs yang embedding-nya sudah > 7 hari belum diperbarui. */
    @Scheduled(cron = "0 0 4 * * ?")  // Daily 04:00
    public void refreshStaleEmbeddings() {
        LocalDateTime staleThreshold = LocalDateTime.now().minusDays(7);
        embeddingRepository
                .findBySourceTypeAndUpdatedAtBefore("JOLT_SPEC", staleThreshold)
                .flatMap(emb -> joltSpecRepository.findById(emb.getReferenceId())
                        .flatMap(embeddingService::embedJoltSpec)
                        .onErrorResume(e -> Mono.empty()))
                .count()
                .subscribe(count -> log.info("Refreshed {} stale JOLT embeddings", count));
    }

    /** Trim embeddings untuk dokumen yang sudah dihapus. */
    @Scheduled(cron = "0 0 5 ? * SUN")  // Weekly Sunday 05:00
    public void cleanOrphanEmbeddings() {
        embeddingRepository.findBySourceType("JOLT_SPEC")
                .filterWhen(emb -> joltSpecRepository
                        .existsById(emb.getReferenceId())
                        .map(exists -> !exists))  // exists=false → orphan
                .flatMap(embeddingRepository::delete)
                .count()
                .subscribe(count -> log.info("Removed {} orphan embeddings", count));
    }
}
```

---

## 6. Learning Dashboard API

```
GET /api/v1/admin/ai/learning/stats

Response:
{
  "period": "last_30_days",
  "channels": [
    {
      "channelId": "shopify",
      "totalRecommendations": 24,
      "approved": 18,
      "rejected": 3,
      "autoApplied": 3,
      "approvalRate": 0.857,
      "currentThreshold": 0.90,
      "avgConfidenceApproved": 0.94,
      "avgConfidenceRejected": 0.72,
      "topRejectionReasons": ["TikTok category_id must be live", "Shopify handle format wrong"]
    }
  ],
  "fieldMappings": {
    "totalMappings": 847,
    "avgSuccessRate": 0.91,
    "lowSuccessRate": 12,    // mappings dengan successRate < 0.5
    "topPerformers": [
      {"sourceField": "name", "targetField": "product.title", "channel": "shopify", "successRate": 0.99}
    ]
  },
  "modelHealth": {
    "ragIndexSize": 1243,
    "lastReindexAt": "2026-06-25T04:00:00",
    "pendingRecommendations": 2,
    "staleEmbeddings": 0
  }
}
```

---

## 7. Complete Learning Loop Diagram

```
                         ┌─────────────────────┐
                         │   New Publish        │
                         │   Request            │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Phase 1: RAG        │
                         │   Retrieve Context    │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Phase 2: Pattern    │
                         │   Matching Agent      │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Phase 3: JOLT       │
                         │   Generation          │
                         └──────────┬───────────┘
                                    │
                    confidence?
                         ├──≥0.92──►  AUTO_APPLY
                         ├──0.70-0.91► RECOMMENDATION
                         └──<0.70──►  MANUAL_REVIEW
                                    │
                         ┌──────────▼───────────┐
                         │   Phase 4: Approval   │◄── Developer APPROVE/REJECT
                         │   Workflow            │
                         └──────────┬───────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
        APPROVED               REJECTED               AUTO_APPLIED
              │                     │                     │
              ▼                     ▼                     ▼
    apply JOLT to           downgrade                apply JOLT
    channel_jolt_specs      field mapping            channel_jolt_specs
              │             confidence                    │
              └─────────────────────┬─────────────────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Phase 5: Learning   │
                         │                       │
                         │ • Update successRate  │
                         │ • Re-embed JOLT        │
                         │ • Calibrate threshold  │
                         │ • Drift detection      │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Next Publish:        │
                         │   Better RAG Context  │◄── loop
                         └─────────────────────┘
```

---

## 8. Maturity Model

Sistem mencapai **3 tingkat kematangan** yang progresif:

| Level | Kondisi | Developer Intervensi |
|---|---|---|
| **Assisted** (Phase 1-2) | AI menganalisis, developer masih review semua | ~80% (semua rekomendasi diapprove manual) |
| **Semi-Autonomous** (Phase 3-4) | AI auto-apply untuk confidence tinggi, developer review sisanya | ~30% (hanya medium/low confidence) |
| **Autonomous** (Phase 5 mature) | Channel yang sudah mature: AI auto-apply >90% kasus | <5% (hanya edge cases & schema drift) |

Target maturity untuk setiap channel (berdasarkan volume transaksi):
- **Shopify**: Autonomous dalam 3 bulan (volume tinggi → data banyak)
- **Amazon**: Semi-Autonomous dalam 3 bulan (schema kompleks → threshold tinggi)
- **TikTok Shop**: Semi-Autonomous dalam 4 bulan
- **Channel baru**: Mulai dari Assisted selama 4-6 minggu

---

## 9. Verification Checklist

- [ ] `LearningFeedbackService.recordPublishOutcome()` dipanggil dari `ChannelPublishService` setelah COMPLETED/FAILED
- [ ] `ChannelFieldMapping.successRate` berubah setelah publish sukses/gagal (verifikasi di DB)
- [ ] Rejection menyimpan `rejectionReason` dan mendowngrade confidence mapping terkait
- [ ] Schema drift detector menemukan outdated JOLT dan men-trigger generation
- [ ] Weekly calibration menghasilkan threshold baru yang masuk akal (clamp 0.75–0.97)
- [ ] Expired PENDING recommendations berubah status ke EXPIRED setelah 30 hari
- [ ] `GET /api/v1/admin/ai/learning/stats` mengembalikan statistik yang akurat
- [ ] Setelah 10+ publish sukses untuk channel Shopify: `successRate` field mappings utama > 0.90
