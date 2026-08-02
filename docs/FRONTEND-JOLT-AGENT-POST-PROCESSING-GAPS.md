# FRONTEND — Post-Processing Gaps di Review Queue (rekomendasi JOLT-agent)

> **Untuk tim FE.** Backend menambahkan sinyal baru pada `AiRecommendation` agar reviewer tahu kapan sebuah
> spec JOLT **tidak cukup** dan butuh **post-processing rule** (tugas developer), bukan sekadar approve.
> Dokumen ini merangkum **kontrak API final** dan **apa yang perlu FE ubah/tambah** — dengan pembagian
> jelas mana yang datanya **sudah ada** (tanpa blocker BE) dan mana yang tidak berlaku lagi.
>
> Latar teknis backend: [product/07-publishing-engine/01-guides/15-…](product/07-publishing-engine/01-guides/15-jolt-agent-post-processing-split-konvergensi.md)
> dan [16-…](product/07-publishing-engine/01-guides/16-jolt-agent-gap-recommendations.md).
> Layar Review Queue: [AI-RECOMMENDATIONS-REVIEW-QUEUE-EXPLAINER.md](AI-RECOMMENDATIONS-REVIEW-QUEUE-EXPLAINER.md).

---

## 1. Apa yang berubah di backend (ringkas)

- Agent JOLT kini **tidak** memetakan field yang dibangun post-processing (mis. gambar, `tier_variation`,
  `model`, `dimension`, dll). Jadi **`proposedFix.proposedJoltSpec` / diff jadi lebih bersih** — field-field
  itu **tidak lagi muncul** di JOLT (by design).
- Saat ada **gap sejati** — required field yang **tak bisa** dihasilkan JOLT **dan** belum ada
  post-processing rule-nya — recommendation membawa daftar gap **plus** usulan op per gap.

**Tidak ada endpoint/DTO baru.** Controller mengembalikan entity `AiRecommendation` langsung, jadi
field-field baru otomatis muncul di response yang sudah FE konsumsi.

Endpoint yang sama seperti sekarang:
- `GET /api/v1/admin/ai/recommendations` → `PageResponse<AiRecommendation>` (list — **membawa `analysis` penuh**)
- `GET /api/v1/admin/ai/recommendations/{id}` → `AiRecommendation` (detail)

---

## 2. Kontrak JSON final (`analysis`)

```jsonc
{
  "analysis": {
    "rootCause": "…",
    "affectedFields": ["…"],
    "missingChannelRequirements": ["…"],          // required kurang — MUNGKIN cukup diperbaiki di JOLT
    "postProcessingGaps": ["model", "tier_variation"],   // BARU: butuh RULE post-processing (JOLT tak bisa)
    "postProcessingGapSuggestions": [                    // BARU: usulan op per gap (best-effort, data-driven)
      { "field": "tier_variation",
        "suggestedOp": "BUILD_TIER_VARIATION",
        "buildsTarget": "tier_variation",
        "source": "shopee / shopee-build-tier-variation" },
      { "field": "model" }                               // tanpa suggestedOp = belum ada preseden → developer memutuskan
    ],
    "confidenceScore": 0.85,
    "confidenceLevel": "MEDIUM",
    "ragEvidence": ["…"],
    "warnings": ["…"]
  },
  "proposedFix": { "type": "JOLT_PATCH", "proposedJoltSpec": [ … ], "diff": "…" }
}
```

> ⚠️ **Nama key = camelCase.** JSON-nya `postProcessingGaps` & `postProcessingGapSuggestions`.
> (`post_processing_gaps` yang mungkin terlihat di kode BE itu hanya **nama kolom Mongo**, **bukan** key API.)

### Makna & tindakan

| Field | Arti | Implikasi reviewer |
|---|---|---|
| `missingChannelRequirements` | Required kurang — **mungkin** cukup fix JOLT | Approve JOLT bisa menyelesaikan |
| **`postProcessingGaps`** | Butuh **post-processing rule baru** | **Approve JOLT saja TAK menyelesaikan** — butuh developer |
| **`postProcessingGapSuggestions`** | Usulan op per gap (best-effort) | Petunjuk op yang mungkin dipakai developer; `suggestedOp` bisa kosong |

---

## 3. Yang HARUS ditambah FE (utama) — data sudah ada, tanpa blocker BE

### 3a. Render gap di panel "Penilaian AI (analysis)", dibedakan dari `missingChannelRequirements`

Tambahkan baris/blok baru di panel detail:

```
│ ▍Penilaian AI (analysis)                                             │
│   Root cause : …                                                     │
│   Missing channel req  : [—]                                         │
│   Post-processing gaps : ⚙ butuh rule post-processing               │  ← BARU
│     • tier_variation   → usul op: BUILD_TIER_VARIATION               │
│                          (preseden: shopee/shopee-build-tier-variation)│
│     • model            → (belum ada preseden — developer memutuskan) │
```

- Sumber: `analysis.postProcessingGaps` (daftar field) + `analysis.postProcessingGapSuggestions`
  (per field: `suggestedOp`, `source`).
- Kalau `suggestedOp` tidak ada di sebuah entry → tampilkan "belum ada preseden".

### 3b. Warning sebelum Approve saat `postProcessingGaps` non-empty

Tampilkan peringatan (di dekat tombol Approve):

> "Spec ini punya **post-processing gaps**. Meng-approve JOLT **tidak** mengisi field ini — seorang
> **developer** harus menambah post-processing rule. Approve hanya menetapkan bagian JOLT-nya."

Ini mencegah reviewer mengira listing sudah lengkap setelah approve.

---

## 4. Sebaiknya ditambah (enhancement) — juga tanpa blocker BE

- **Badge / filter "needs post-processing"** di **list** Review Queue. `PageResponse<AiRecommendation>`
  sudah membawa `analysis` penuh → tandai/saring item ber-gap **tanpa fetch tambahan**. Berguna untuk
  triage: item ber-gap butuh **developer**, bukan sekadar approval reviewer.
- **Empty-state.** `postProcessingGaps`/`postProcessingGapSuggestions` bisa `null`/kosong pada spec yang
  lolos → **sembunyikan** blok gap (seperti `Missing channel req: [—]`). Selalu cek null.
- **Catatan pada "Proposed Fix" (JOLT diff).** Diff kini **tidak** memuat mapping gambar/support-field
  (dibuang backend by design). Beri hint kecil agar reviewer tak salah kira "gambar hilang dari spec":
  > "Field gambar & support (tier_variation/model/dll) sengaja tak ada di JOLT — dibangun post-processing."

---

## 5. Tidak berlaku lagi / catatan

- **Tak perlu** menampilkan mapping gambar di preview JOLT — memang tak akan ada lagi (backend #1).
- `postProcessingGapSuggestions[].suggestedOp` bersifat **best-effort** (diturunkan dari rule channel
  lain). Perlakukan sebagai **petunjuk**, bukan instruksi final — developer memverifikasi param op.
- Semua field gap **hanya terisi** saat ada gap sejati (spec di-route ke review, `status=PENDING`,
  bukan auto-applied). Pada mayoritas recommendation biasa, blok gap kosong.

---

## 6. Checklist FE

- [x] Render `analysis.postProcessingGaps` + `postProcessingGapSuggestions` di panel analysis (§3a), dibedakan dari `missingChannelRequirements`. → `PostProcessingGapsBlock` (blok violet ⚙) di `RecommendationsReviewQueue.tsx`.
- [x] Warning "approve JOLT tak mengisi gap" saat `postProcessingGaps` non-empty (§3b). → `InfoBanner` amber di atas tombol Approve.
- [x] Badge/filter "needs post-processing" di list (§4). → Badge ⚙ di baris + toggle "Perlu post-processing" (filter client-side halaman termuat, tanpa fetch tambahan).
- [x] Empty-state / null-guard untuk kedua field (§4). → `postProcessingGapFields()` null-safe; blok disembunyikan saat kosong.
- [x] Hint pada JOLT diff bahwa gambar/support-field ditangani post-processing (§4). → Catatan di bawah `JoltSummary` pada section Proposed Fix.

**Implementasi (v8):** `src/modules/ai-admin/types/recommendation.ts` (tipe `PostProcessingGapSuggestion` + 2 field pada `RecommendationAnalysis`) & `src/modules/ai-admin/components/recommendations/RecommendationsReviewQueue.tsx`. Tanpa perubahan backend.

Semua item di checklist **tidak** butuh perubahan backend tambahan — datanya sudah ada di response.
</content>
