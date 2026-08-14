# P0-4 — Rate-Limit per Channel + Cap Konkurensi Batch

> Turunan dari [`01-analisis-kesiapan-produksi-mvp.md`](01-analisis-kesiapan-produksi-mvp.md) §5 (P0-4).
> **Tujuan:** bulk-publish tidak membanjiri channel dan kena throttle/ban API. Melengkapi
> [P0-3 durable jobs](05-p0-3-durable-jobs-dan-rekonsiliasi.md).

---

## 1. Masalah

- Tak ada throttle per-channel pada jalur publish — 200 produk ke Shopee/Amazon bisa di-dispatch
  serempak → kena rate-limit/ban.
- Endpoint `/publish/batch` memakai `Flux.merge(publishOps)` **tanpa cap** → subscribe ke **semua** store
  sekaligus.

---

## 2. Desain

Dua gerbang, keduanya reaktif & config-driven (env-overridable, sesuai aturan runtime-config CLAUDE.md):

### 2a. Limiter konkurensi per `(channelType, store)` — bulkhead
`PublishRateLimiter.gate(channelType, storeId, action)` membungkus **dispatch channel** (`doChannelSyncPublish`)
di balik `Semaphore` **fair** per key. Permit di-acquire di `Schedulers.boundedElastic` (tunggu blocking
singkat, wajar di sana) dengan **timeout** sebagai katup pengaman backpressure, dan **selalu di-release**
(sukses/error/cancel) via `Mono.usingWhen`.

- **Hanya CREATE/UPDATE yang di-gate** — NO-OP & BLOCKED (P0-2) tak menyentuh channel, jadi tak butuh permit.
- `apiCallStart` diukur **setelah** permit didapat → `channelApiCallTimeMs` mencerminkan waktu channel, bukan antrean.
- **Kenapa concurrency-cap (bulkhead), bukan token-bucket per-detik?** Untuk MVP "jangan kena ban saat bulk",
  membatasi **berapa dispatch serentak** per channel/store sudah efektif & sederhana, tanpa dependency baru
  (tak ada resilience4j/bucket4j; hanya Guava). Rate berbasis-waktu (req/detik) = refinement (§5).

### 2b. Cap fan-out batch
`/publish/batch`: `Flux.merge(publishOps)` → `Flux.fromIterable(publishOps).flatMap(op -> op, batchMaxConcurrency)`
→ hanya N store di-dispatch serentak; limiter per-channel (2a) lalu men-throttle di dalam channel.

---

## 3. Konfigurasi (semua default aman, env-overridable)

```yaml
app.publish:
  batch-max-concurrency: 4                 # APP_PUBLISH_BATCH_MAX_CONCURRENCY
  rate-limit:
    enabled: true                          # APP_PUBLISH_RATE_LIMIT_ENABLED
    default-max-concurrent: 4              # APP_PUBLISH_RATE_LIMIT_DEFAULT
    acquire-timeout-seconds: 60            # APP_PUBLISH_RATE_LIMIT_ACQUIRE_TIMEOUT
    max-concurrent: { shopee: 2, amazon: 2 }   # override per channelType (lowercase)
```

Timeout acquire → publish gagal cepat dengan pesan jelas (`RateLimitedException`), bukan menggantung. Nilai
permit sebuah key **di-fix saat pertama dilihat**; ubah config perlu restart.

---

## 4. File & test

| File | Peran |
|---|---|
| `publishing/service/PublishRateLimitProperties.java` (**baru**) | `@ConfigurationProperties(app.publish.rate-limit)`; `maxConcurrentFor(channelType)` (override→default, floor 1). |
| `publishing/service/PublishRateLimiter.java` (**baru**) | `gate(...)` reaktif; `Semaphore` fair per `(channelType,store)`; `Mono.usingWhen` acquire/release; `RateLimitedException`. |
| `ChannelPublishService` | `doChannelSyncPublish` dibungkus `gate(...)` (`Mono.defer` agar body jalan setelah permit). |
| `ChannelPublishController` | `/publish/batch` pakai `flatMap(op->op, batchMaxConcurrency)`; `@Value app.publish.batch-max-concurrency`. |
| `application.yml` | blok `app.publish` (P0-2/P0-3/P0-4) untuk discoverability. |

**Test (7):** `PublishRateLimiterTest` — same-key permits=1 **men-serialize** (peak konkurensi=1),
beda-store **independen** (peak=2), disabled passthrough, permit **di-release** (dua gate sekuensial sukses);
`PublishRateLimitPropertiesTest` — resolusi override/default/null/floor. Deterministik (bukan timing-flaky).

---

## 5. Yang DITUNDA (refinement)

1. **Token-bucket berbasis waktu** (req/detik + burst) per channel — presisi mengikuti limit channel
   sebenarnya (Shopify 2/s, Shopee X/menit). Sekarang: cap konkurensi.
2. **Limiter terdistribusi** (mis. Redis) — saat ini in-memory **per-instance**, jadi multi-instance = cap
   per instance (agregat = N×instance). Sepaket dengan atomic-claim reconciler (P0-3 §4).
3. **Granularitas per-org / promosikan kuota ke `ChannelConfiguration`** — bila butuh per-store/kategori
   berbeda per organisasi.

---

## 6. Status

- **Build:** `BUILD SUCCESS`. **Test:** 26 hijau (P0-4 rate-limit 4 + properties 3 + P0-3 6 + P0-2 6 +
  kontrak sync 1 + steps 2 + hash 3 + listing-state 1).
- Aditif; hanya jalur dispatch channel yang di-gate. **Aman untuk bulk-publish** di skala awal.
