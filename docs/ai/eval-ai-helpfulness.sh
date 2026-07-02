#!/usr/bin/env bash
#
# Evaluasi: "Apakah AI membantu?" — menjalankan endpoint admin AI secara berurutan
# dan mencetak hasilnya untuk diinterpretasi.
#
# Pakai:
#   BASE=http://localhost:8888/labamap TOKEN="<jwt>" bash docs/ai/eval-ai-helpfulness.sh
#
# TOKEN opsional — isi kalau endpoint admin Anda butuh Bearer auth.
#
# Prasyarat:
#   - app.ai.enabled=true
#   - embedding aktif + RAG sudah terisi (cek Step 0 di bawah)
#   - AGENT: AI_LLM_PROVIDER=gemini + GEMINI_API_KEY (atau ANTHROPIC_API_KEY) — kalau tidak,
#     Step 3 akan AGENT_FAILED.

set -uo pipefail
BASE="${BASE:-http://localhost:8888/labamap}"
ADMIN="$BASE/api/v1/admin/ai"
AUTH=()
[ -n "${TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer ${TOKEN}")
PP="cat"; command -v jq >/dev/null 2>&1 && PP="jq ."

hr() { printf '\n=== %s ===\n' "$1"; }

hr "STEP 0 — Konfigurasi & jumlah embedding (bukti RAG terisi)"
curl -s "${AUTH[@]}" "$ADMIN/embeddings/stats" | $PP

hr "STEP 1 — RAG retrieval test (FIELD_MAPPING): cari mapping relevan tanpa LLM"
curl -s "${AUTH[@]}" -X POST "$ADMIN/search/test?sourceType=FIELD_MAPPING&limit=5" \
  -H 'Content-Type: application/json' \
  -d '{"query":"product color and size variant option for clothing"}' | $PP

hr "STEP 2 — RAG retrieval test (JOLT_SPEC): cari JOLT spec mirip"
curl -s "${AUTH[@]}" -X POST "$ADMIN/search/test?sourceType=JOLT_SPEC&channelId=shopify&limit=3" \
  -H 'Content-Type: application/json' \
  -d '{"query":"shopify clothing product with variants and images"}' | $PP

hr "STEP 3 — INTI: agent generate JOLT untuk produk contoh (pakai RAG + LLM)"
curl -s "${AUTH[@]}" -X POST "$ADMIN/generate-jolt?channelId=shopify&categoryId=clothing" \
  -H 'Content-Type: application/json' \
  -d '{
        "name":"Premium Cotton T-Shirt",
        "description":"Soft breathable cotton tee",
        "price":199000,
        "sku":"TSHIRT-001",
        "brand":"Acme",
        "color":"Navy",
        "size":"L",
        "material":"Cotton",
        "quantity":100,
        "weight":0.2,
        "images":["https://example.com/tshirt.jpg"],
        "variants":[
          {"color":"Navy","size":"L","sku":"TSHIRT-001-NV-L","price":199000},
          {"color":"Navy","size":"M","sku":"TSHIRT-001-NV-M","price":199000}
        ]
      }' | $PP

hr "STEP 4 — Observability: sesi agent terakhir (lihat penalaran + tool RAG yang dipakai)"
curl -s "${AUTH[@]}" "$ADMIN/sessions?channelId=shopify&triggerType=JOLT_GENERATION" | $PP

hr "STEP 5 — Dashboard pembelajaran (kesehatan rekomendasi & mapping)"
curl -s "${AUTH[@]}" "$ADMIN/learning/stats?days=30" | $PP

hr "SELESAI"
echo "Interpretasi singkat ada di docs/ai/eval-ai-helpfulness.sh (komentar di bawah)."

# ── CARA MEMBACA HASIL ────────────────────────────────────────────────────────
# STEP 0  counts.total > 0  → RAG terisi (Anda: ~61).
# STEP 1/2 resultCount > 0 dengan score tinggi (mendekati 1.0) → retrieval relevan BEKERJA.
#          Ini fondasi: agent bisa "mengingat" mapping/JOLT yang sudah terbukti.
# STEP 3  status:
#          AUTO_APPLIED            → agent yakin (≥0.92), JOLT langsung disimpan. confidenceScore tinggi.
#          RECOMMENDATION_CREATED  → agent menghasilkan, menunggu approval developer (0.70–0.92).
#          MANUAL_REVIEW_REQUIRED  → confidence rendah, agent minta review.
#          AGENT_FAILED            → cek errorMessage (biasanya LLM key belum diset).
#         → "AI membantu" = menghasilkan JOLT valid + confidence wajar TANPA developer menulis JOLT manual.
# STEP 4  sessions[].toolCalls / steps → agent benar-benar memanggil tool RAG (search_jolt_specs,
#          search_field_mappings) = bernalar berbasis data, bukan menebak. tokensUsed menunjukkan biaya.
# STEP 5  approvalRate naik, fieldMapping successRate naik, pendingRecs terkelola = sistem belajar dari waktu ke waktu.
