# Setup — PostgreSQL + pgvector

Panduan lengkap mengaktifkan RAG dengan **PostgreSQL + pgvector**.
Cocok untuk **local dev/test tanpa Atlas M10+**, atau yang sudah punya PostgreSQL.

> Backend chooser & konsep umum: lihat [RUNTIME-SETUP.md](RUNTIME-SETUP.md).
> Untuk backend MongoDB Atlas, lihat [SETUP-ATLAS.md](SETUP-ATLAS.md).

> **Status environment ini**: PostgreSQL **14.20** ada di `/Library/PostgreSQL/14` (port 5432),
> tapi extension **pgvector BELUM terpasang** — Langkah 2 wajib dijalankan dulu.

---

## Langkah 1 — Install pgvector ke PostgreSQL

pgvector adalah extension yang harus dikompilasi & dipasang ke instalasi Postgres.

```bash
# Butuh Xcode Command Line Tools: xcode-select --install
git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git
cd pgvector
make PG_CONFIG=/Library/PostgreSQL/14/bin/pg_config
sudo make install PG_CONFIG=/Library/PostgreSQL/14/bin/pg_config
```

> Sesuaikan path `pg_config` dengan instalasi Anda. Untuk Homebrew: `/opt/homebrew/opt/postgresql@14/bin/pg_config`.
> pgvector mendukung PostgreSQL 13+.

---

## Langkah 2 — Buat Database + Extension

```bash
/Library/PostgreSQL/14/bin/psql -U postgres -h localhost \
  -c "CREATE DATABASE labamap_rag;"

/Library/PostgreSQL/14/bin/psql -U postgres -h localhost -d labamap_rag \
  -c "CREATE EXTENSION vector;"
```

> Tabel `ai_schema_embeddings` + indeks HNSW + indeks filter dibuat **OTOMATIS** oleh
> `PgVectorStore` saat startup (DDL idempotent). Jadi cukup sampai `CREATE EXTENSION` saja.

Verifikasi extension terpasang:
```bash
/Library/PostgreSQL/14/bin/psql -U postgres -h localhost -d labamap_rag \
  -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

---

## Langkah 3 — Environment Variables

```bash
# Backend
export AI_RAG_PROVIDER=pgvector

# Koneksi pgvector (datasource terpisah dari DB utama aplikasi)
export AI_PGVECTOR_URL=jdbc:postgresql://localhost:5432/labamap_rag
export AI_PGVECTOR_USER=postgres
export AI_PGVECTOR_PASSWORD=<password-postgres-anda>

# Embedding — tetap perlu untuk generate vektor
export OPENAI_API_KEY=sk-...

# Agent reasoning (Phase 2-5)
export ANTHROPIC_API_KEY=sk-ant-...

# Opsional
export AI_ENABLED=true
export AI_AUTO_APPLY_THRESHOLD=0.92
export AI_RECOMMEND_THRESHOLD=0.70
```

---

## Langkah 4 — Populate Index (Embedding Awal)

Tabel + indeks dibuat otomatis saat startup. Tinggal isi datanya:

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

## Langkah 5 — Verifikasi End-to-End

```bash
# 5a. Statistik embedding — expect counts.total > 0, embeddingEnabled: true
curl "http://localhost:8888/labamap/api/v1/admin/ai/embeddings/stats"

# 5b. Test vector search — expect resultCount > 0
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/search/test?sourceType=JOLT_SPEC" \
     -H "Content-Type: application/json" \
     -d '{"query":"shopify clothing variants price sku inventory"}'

# 5c. Test JOLT generation (butuh ANTHROPIC_API_KEY)
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/generate-jolt?channelId=shopify&categoryId=clothing" \
     -H "Content-Type: application/json" \
     -d '{"name":"Kemeja Batik","price":150000,"sku":"KB-001","variants":[{"color":"Merah","size":"M","sku":"KB-001-M"}]}'

# 5d. Learning dashboard
curl "http://localhost:8888/labamap/api/v1/admin/ai/learning/stats?days=30"
```

Cek langsung di Postgres:
```bash
/Library/PostgreSQL/14/bin/psql -U postgres -h localhost -d labamap_rag \
  -c "SELECT source_type, count(*) FROM ai_schema_embeddings GROUP BY source_type;"
```

---

## Troubleshooting (pgvector)

| Gejala | Penyebab | Solusi |
|---|---|---|
| Startup log "PgVectorStore init failed" | PG tak terjangkau / kredensial salah | Cek `AI_PGVECTOR_URL/USER/PASSWORD`, pastikan PG jalan di 5432 |
| "CREATE EXTENSION vector failed" | pgvector belum diinstall / butuh hak admin | Ulangi Langkah 1–2, jalankan `CREATE EXTENSION` sebagai superuser |
| "HNSW index creation failed" | pgvector < 0.5.0 (belum ada HNSW) | Upgrade pgvector, atau ganti ke IVFFlat di `runDdl()` |
| `resultCount: 0` selalu | Tabel kosong / dimensi salah | Jalankan reindex; pastikan kolom `vector(1536)` cocok model |
| `embeddingEnabled: false` | `OPENAI_API_KEY` kosong | Set env var, restart |
| Dimensi mismatch saat insert | Ganti model embedding tanpa migrasi tabel | `DROP TABLE ai_schema_embeddings;` lalu restart (auto-recreate) |

---

## Catatan Teknis (pgvector)

- **Dimensi**: kolom `vector(1536)` dibuat dari `app.ai.embedding.dimensions`. Ganti model embedding → drop tabel & sesuaikan dimensi.
- **Blocking → reaktif**: `PgVectorStore` membungkus JDBC dengan `Schedulers.boundedElastic()` agar event-loop WebFlux tidak terblokir.
- **Datasource terpisah**: pgvector pakai `HikariDataSource` sendiri (pool `pgvector-rag-pool`), **tidak** mengganggu datasource utama aplikasi.
- **Vektor sebagai literal string**: disimpan/diquery sebagai `'[v1,v2,...]'::vector` — tanpa dependency driver tambahan.
- **Indeks**: HNSW cosine (`embedding vector_cosine_ops`) + B-tree filter (`source_type, channel_id, category_id`).
- **Graceful degradation**: PG tak terjangkau / pgvector tak terpasang → `isEnabled()=false` → seluruh RAG mati bersih, pipeline lama jalan normal.
- **Keterbatasan v1**: scheduled maintenance (`AiMaintenanceScheduler` refresh/orphan-cleanup) masih Mongo-spesifik (no-op untuk pgvector). Core path (embed + search + stats) sudah penuh vendor-agnostic.
