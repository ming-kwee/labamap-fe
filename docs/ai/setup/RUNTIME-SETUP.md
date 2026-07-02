# AI Runtime Setup — Pilih Backend Vector Store

Mengaktifkan AI Intelligence System (Phase 1–5) butuh **satu backend vector store**.
Pilih salah satu, lalu ikuti panduannya yang berdiri sendiri (self-contained):

| Backend                         | Panduan                                    | Cocok untuk                                                             |
|---------------------------------|--------------------------------------------|-------------------------------------------------------------------------|
| **MongoDB Atlas Vector Search** | **[SETUP-ATLAS.md](SETUP-ATLAS.md)**       | Produksi; data vektor menyatu dengan data Mongo; butuh cluster **M10+** |
| **PostgreSQL + pgvector**       | **[SETUP-PGVECTOR.md](SETUP-PGVECTOR.md)** | Local dev/test tanpa Atlas; atau yang sudah punya PostgreSQL            |

Backend dipilih lewat satu env var:

```bash
export AI_RAG_PROVIDER=atlas       # default — ikuti SETUP-ATLAS.md
# atau
export AI_RAG_PROVIDER=pgvector    # ikuti SETUP-PGVECTOR.md
```

> Nilai harus **persis** `atlas` atau `pgvector`. Nilai lain (typo) membuat startup gagal
> cepat (fail-fast) karena tidak ada `VectorStore` bean yang aktif. Default = `atlas`.

---

## Arsitektur: kenapa bisa di-switch

Kode RAG bersifat **vendor-agnostic** lewat interface `VectorStore`. `RagEmbeddingService`,
`RagSearchService`, dan `AiAdminController` tidak tahu backend yang dipakai — hanya satu
implementasi yang aktif (dipilih `@ConditionalOnProperty` dari `app.ai.rag.provider`):

```
RagEmbeddingService ─┐
RagSearchService     ├─► VectorStore (interface) ─► AtlasVectorStore  (provider=atlas)
AiAdminController   ─┘                            └► PgVectorStore    (provider=pgvector)
```

Ganti backend = ganti satu env var. **Tidak ada perubahan kode.**

---

## Yang sama untuk kedua backend

Hal-hal berikut identik apa pun backend-nya — detailnya ada di masing-masing panduan:

1. **API key embedding & agent** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) — generate embedding
   dan reasoning agent tidak tergantung backend vector store.
2. **Endpoint verifikasi** (`/admin/ai/reindex`, `/search/test`, `/embeddings/stats`,
   `/generate-jolt`, `/learning/stats`) — sama persis.
3. **Scheduled jobs Phase 5** — backend-independent:

   | Jadwal       | Job                                     |
   |--------------|-----------------------------------------|
   | Harian 01:00 | Expire PENDING recommendation > 30 hari |
   | Harian 02:00 | Schema drift detection                  |
   | Minggu 03:00 | Confidence threshold calibration        |
   | Harian 04:00 | Refresh embedding stale > 7 hari¹       |
   | Minggu 05:00 | Hapus orphan embedding¹                 |

   ¹ Maintenance refresh/orphan-cleanup saat ini Mongo-spesifik (no-op untuk pgvector di v1).

4. **Estimasi biaya embedding** (`text-embedding-3-small` = $0.020/1M token, ~300 token/dok):

   | Skenario                    | Token      | Biaya                    |
   |-----------------------------|------------|--------------------------|
   | First reindex (~800 dok)    | 240.000    | ~$0.005                  |
   | Update harian (5 JOLT edit) | 1.500/hari | ~$0.001/bulan            |
   | Publish 10.000 produk/hari  | 0          | $0 (publish tidak embed) |

   Biaya = fungsi **frekuensi perubahan JOLT/mapping**, bukan volume publish.

---

## Mati bersih bila tidak dikonfigurasi

Tanpa setup apa pun, seluruh AI **mati bersih** dan pipeline lama berjalan normal:
- `OPENAI_API_KEY` kosong → `isEmbeddingEnabled()=false` → embedding & search nonaktif
- `ANTHROPIC_API_KEY` kosong → `isAgentEnabled()=false` → agent nonaktif
- Backend vector store tak terjangkau → `VectorStore.isEnabled()=false` → RAG nonaktif

Pilih panduan Anda: **[Atlas →](SETUP-ATLAS.md)** atau **[pgvector →](SETUP-PGVECTOR.md)**
