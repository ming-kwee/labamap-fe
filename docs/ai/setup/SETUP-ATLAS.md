# Setup — MongoDB Atlas Vector Search

Panduan lengkap mengaktifkan RAG dengan **MongoDB Atlas `$vectorSearch`** (backend default).

> Backend chooser & konsep umum: lihat [RUNTIME-SETUP.md](RUNTIME-SETUP.md).
> Untuk backend PostgreSQL, lihat [SETUP-PGVECTOR.md](SETUP-PGVECTOR.md).

**Prasyarat**: Atlas cluster tier **M10 atau lebih tinggi**. Free tier (M0) **tidak** mendukung Vector Search.

---

## Langkah 1 — Environment Variables

```bash
# Backend (default sudah atlas, set eksplisit untuk kejelasan)
export AI_RAG_PROVIDER=atlas

# Embedding (Phase 1 RAG) — wajib
export OPENAI_API_KEY=sk-...

# Agent reasoning (Phase 2-5) — wajib untuk JOLT generation & enrichment
export ANTHROPIC_API_KEY=sk-ant-...

# Opsional — override default
export AI_ENABLED=true                   # master switch (default true)
export AI_AUTO_APPLY_THRESHOLD=0.92      # auto-apply JOLT di atas ini
export AI_RECOMMEND_THRESHOLD=0.70       # recommendation queue di atas ini
```

Atlas memakai koneksi MongoDB yang sudah ada di aplikasi (`spring.data.mongodb.uri`) —
tidak ada datasource tambahan.

---

## Langkah 2 — Buat Vector Search Index

`$vectorSearch` **tidak berjalan** tanpa index ini. Buat manual di Atlas.

### Opsi A — Atlas UI
1. Buka cluster → **Atlas Search** → **Create Search Index**
2. Pilih **JSON Editor** → **Vector Search**
3. Database: `labamap_omnichannel`, Collection: `ai_schema_embeddings`
4. Paste isi [`atlas-vector-index.json`](atlas-vector-index.json) (file di folder ini)
5. Index name: `ai_schema_embeddings_vector_idx`
6. **Create** — tunggu status `ACTIVE` (~1-2 menit)

### Opsi B — Atlas CLI
```bash
atlas clusters search indexes create \
  --clusterName <NAMA_CLUSTER> \
  --file docs/ai/setup/atlas-vector-index.json
```

### Opsi C — mongosh (Atlas 7.0+)
```javascript
use labamap_omnichannel
db.ai_schema_embeddings.createSearchIndex(
  "ai_schema_embeddings_vector_idx",
  "vectorSearch",
  {
    fields: [
      { type: "vector", path: "embedding", numDimensions: 1536, similarity: "cosine" },
      { type: "filter", path: "sourceType" },
      { type: "filter", path: "channelId" },
      { type: "filter", path: "categoryId" }
    ]
  }
)
```

> **PENTING**: `numDimensions: 1536` harus cocok dengan model embedding
> (`text-embedding-3-small`). Jika ganti model, sesuaikan dimensi + `app.ai.embedding.dimensions`.

---

## Langkah 3 — Populate Index (Embedding Awal)

Setelah index `ACTIVE`:

```bash
# Opsi A — reindex saat startup (sekali; lalu kembalikan ke false)
export AI_REINDEX_ON_STARTUP=true

# Opsi B — panggil endpoint admin kapan saja
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/reindex?sourceType=ALL"
```

Output yang diharapkan:
```json
{ "status": "COMPLETED", "indexed": 47, "skipped": 0, "failed": 0 }
```

---

## Langkah 4 — Verifikasi End-to-End

```bash
# 4a. Statistik embedding — expect counts.total > 0, embeddingEnabled: true, provider: atlas
curl "http://localhost:8888/labamap/api/v1/admin/ai/embeddings/stats"

# 4b. Test vector search — expect resultCount > 0, score teratas > 0.70
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/search/test?sourceType=JOLT_SPEC" \
     -H "Content-Type: application/json" \
     -d '{"query":"shopify clothing variants price sku inventory"}'

# 4c. Test JOLT generation (butuh ANTHROPIC_API_KEY)
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/generate-jolt?channelId=shopify&categoryId=clothing" \
     -H "Content-Type: application/json" \
     -d '{"name":"Kemeja Batik","price":150000,"sku":"KB-001","variants":[{"color":"Merah","size":"M","sku":"KB-001-M"}]}'

# 4d. Learning dashboard
curl "http://localhost:8888/labamap/api/v1/admin/ai/learning/stats?days=30"
```

`4b` harus menghasilkan `resultCount > 0`. Jika `0` padahal ada data → index belum `ACTIVE`
atau dimensi tidak cocok.

`4c` harus mengembalikan `status` = `AUTO_APPLIED` / `RECOMMENDATION_CREATED` / `MANUAL_REVIEW_REQUIRED`.

---

## Troubleshooting (Atlas)

| Gejala | Penyebab | Solusi |
|---|---|---|
| `resultCount: 0` selalu | Index belum ACTIVE / dimensi salah | Cek status index di Atlas, pastikan 1536-dim |
| Error "vectorSearch not supported" | Tier M0 (free) | Upgrade ke M10+ |
| `embeddingEnabled: false` | `OPENAI_API_KEY` kosong | Set env var, restart |
| JOLT gen → `AGENT_FAILED` "ANTHROPIC_API_KEY" | Key kosong | Set `ANTHROPIC_API_KEY` |
| Reindex `failed > 0` | OpenAI rate limit / quota | Cek log, retry batch lebih kecil |

---

## Catatan Teknis (Atlas)

- **Reaktif native**: `AtlasVectorStore` memakai `ReactiveMongoTemplate.aggregate($vectorSearch)` — tidak ada blocking bridge.
- **Colocation**: vektor disimpan di collection `ai_schema_embeddings` di database Mongo yang sama dengan data aplikasi.
- **Index name** dapat diubah via `app.ai.rag.index-name` (default `ai_schema_embeddings_vector_idx`).
- **`numCandidates`** (`app.ai.rag.num-candidates`, default 100) = over-fetch sebelum filter skor.
