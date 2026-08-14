# Analisis Kesiapan Produksi & Rekomendasi Fitur MVP Omnichannel

> **Sudut pandang:** engineer omnichannel ecommerce, menilai sistem **apa adanya** dari pembedahan
> kode & API surface (bukan brosur). Tanggal audit: **2026-08-11**, branch `bff-v12`.
>
> **Pertanyaan yang dijawab:** apa yang sudah ada, apa yang penting tapi masih kurang, bagaimana
> dibanding sistem luar & kebutuhan seller, dan **fitur minimum apa yang wajib ada agar sistem
> benar-benar siap dipakai men-*publish* produk ke marketplace** (bukan platform ops lengkap).
>
> Pelengkap dari [`ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS.md`](../ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS.md)
> yang menilai *kualitas jalur transformasi*. Dokumen ini menilai **kesiapan operasional untuk go-live**.

---

## 0. TL;DR — 8 hal yang menghalangi go-live yang aman

Sistem ini **kuat di jalur transformasi** (master→channel deklaratif, data-driven, JOLT + post-processing
+ AI co-pilot, OAuth penuh, capability enrichment). Tapi "bisa men-*transform* & mengirim 1 payload" ≠
"siap dipakai seller sungguhan di market". Yang menghalangi go-live aman, urut prioritas:

| # | Gap (P0 = pemblokir go-live) | Dampak jika diabaikan | Status |
|---|---|---|---|
| 1 | **Tak ada listing-identity / publish-status store** yang persist (`masterProduct × store → channelProductId + status + error + waktu`) | Tak tahu "apa yang live di mana"; tak bisa update/hapus/rekonsiliasi listing; tak ada audit | ❌ **P0** |
| 2 | **Lifecycle listing hanya CREATE + DELETE** — tidak ada UPDATE; re-publish = bikin listing baru | Duplikat listing, seller tak bisa edit produk yang sudah tayang | ❌ **P0** |
| 3 | **Publish sinkron, tanpa job durable / retry / idempotency / DLQ** | 1 error transient channel = listing hilang atau **dobel**; batch gagal separuh tak bisa lanjut | ❌ **P0** |
| 4 | **Rate-limiting per-channel nyaris tak ada**; batch = `Flux.merge` tanpa cap konkurensi | Bulk publish kena throttle / ban API channel | ❌ **P0** |
| 5 | **Golden-payload test per channel/kategori belum ada** | Regresi diam-diam pada perubahan JOLT/post-proc | ❌ **P0** (sudah lama jadi rekomendasi #1) |
| 6 | **Observability operasional** (metrik sukses/gagal, alert) — hanya ada health + trace debug | Kegagalan produksi tak terdeteksi sampai seller komplain | ⚠️ **P1** |
| 7 | **Sinkronisasi stok & harga berkelanjutan** — belum ada | Oversell / harga basi setelah listing tayang | ⚠️ **P1** (boleh fase-2) |
| 8 | **Reverse-sync & ingest order** — design-only / belum ada | Edit sisi channel & order tak masuk balik | 🔵 **P2** (pasca-launch) |

**Inti rekomendasi:** MVP go-live **tidak** butuh inventory-sync/order/repricing lengkap. Yang **wajib**
adalah **#1–#5**: sistem harus bisa **melacak, meng-update, dan mengulang-secara-aman** listing yang
sudah dikirim. Tanpa itu, seller pertama yang re-publish akan membuat duplikat, dan tim tak punya cara
tahu apa yang sedang live.

---

## 1. Peta kapabilitas sistem SAAT INI (hasil pembedahan)

Dibaca dari 45 controller / API surface + entitas Mongo. Yang **sudah ada dan matang**:

### 1a. Katalog & pemodelan produk (kuat)
- Master product channel-agnostic + `product_types.variantDimensions` (sumbu varian otoritatif) +
  `ecommerce_master_attributes` (grup VARIANT/ATTRIBUTE/OPTION, relevansi kategori).
- **Step-1** (form master) & **Step-2** (form channel-specific per store): `channel_product_data`
  menyimpan `channelData` + `masterOverrides` + `variantOverrides` + `completionPercentage`.
- Business rules, conditional-logic rules, dynamic-product — semua data-driven.

### 1b. Koneksi channel & keamanan (production-grade)
- OAuth penuh (initiate → callback → code-exchange), nonce anti-CSRF, token-refresh data-driven,
  webhook uninstall/deauthorize per-channel, enkripsi kredensial **AES-256-GCM**.
- `channel_store_connections` per instance store (multi-store, multi-org).

### 1c. Jalur transformasi & publish (canggih — ini keunggulan sistem)
- Resolusi JOLT category-aware berlapis prioritas (`org+cat > sys+cat > org+default > seed`).
- Post-processing pipeline (FOR_EACH, BUILD_TIER_VARIATION, BUILD_MODEL, WRAP_ARRAY_TO_OBJECTS, …).
- **Capability enrichment**: resolve pohon kategori channel, atribut kategori, logistik/brand live.
- Value-mapping master→channel (EXACT → fuzzy Levenshtein → free-text).
- Media flow multi-step (Shopee/WIX/TikTok: upload → create → write-back id).
- **AI co-pilot** menyusun JOLT-spec per-kategori dengan guardrail berlapis (data: 0 auto-apply murni
  di runtime; semua yang live = seed atau human-approved).
- **Publish**: single, `batch` (multi-store), `dryRun`, `analyze`, **publish-trace inspector**
  (`/publish/trace`) untuk melihat output antar-tahap tanpa live-call. Pre-flight gate fail-fast.

### 1d. Admin & operabilitas dasar
- ~20 controller admin (channel config, jolt-spec, category-api-config, image-spec, mapping, dsb).
- Organisasi, auth, user-management. Image GC (orphan purge).

> **Kesimpulan bagian ini:** sisi **"ubah 1 produk jadi payload yang benar untuk N channel"** sudah
> sangat lengkap. Yang belum lengkap adalah **siklus hidup listing setelah dikirim** dan **ketahanan
> operasional saat volume & kegagalan nyata**.

---

## 2. Apa yang KURANG — analisis gap (dengan bukti kode)

### Gap 1 — Tak ada *listing-identity / publish-record* yang persist  ❌ P0
`channel_product_data` menyimpan `status` (DRAFT/PUBLISHED/FAILED), `publishedAt`, `publishError` —
tapi **tidak menyimpan `channelProductId`** (ID listing eksternal). `channelProductId` hanya dikembalikan
di *response* publish lalu hilang. Tidak ada koleksi `publish_history` / `listing_state`
(grep: kosong).

**Konsekuensi konkret:**
- Tak bisa menjawab "master X tayang di store Y sebagai listing mana, versi berapa, error terakhir apa".
- Tak bisa **update** atau **delete** listing tertentu belakangan (butuh ID-nya).
- Tak bisa **dedup** saat re-publish → langsung ke Gap 2.
- Tak ada jejak audit multi-publish (hanya 1 field mutable yang ditimpa).

**Yang dibutuhkan:** koleksi `listing_state` (atau perkaya `channel_product_data`) menyimpan
`(masterProductId, storeId, channelType) → channelProductId, channelUrl, status, publishedVersion,
lastPublishHash, lastError, publishedAt, updatedAt`. Plus `publish_history` append-only untuk audit.

### Gap 2 — Lifecycle listing hanya CREATE + DELETE, tak ada UPDATE  ❌ P0
Workflow action yang direferensikan: `create_CP`, `create_CP_Media`, `create_CP_Variants`,
`delete_CP`, `upload_image` — **tidak ada `update_CP`**. Re-publish menjalankan jalur create lagi.

**Konsekuensi:** seller yang mengedit harga/stok/deskripsi produk yang sudah tayang akan **membuat
listing baru** (duplikat) alih-alih meng-update yang ada. Ini pemecah kepercayaan #1 di dunia nyata.

**Yang dibutuhkan (minimum):** jalur re-publish yang **idempoten** — jika `listing_state` sudah punya
`channelProductId`, arahkan ke workflow **update** channel (bukan create); sediakan **delist/relist**.

### Gap 3 — Publish sinkron; tak ada job durable, retry, idempotency, DLQ  ❌ P0
Retry hanya ada di LLM client (`GeminiLlmClient`, `OpenAiCompatibleLlmClient`) — **bukan** di jalur
publish. Tak ada `@Async`/queue pada publish; `batch` = `Flux.merge` inline (sinkron, in-request).
Tak ada idempotency-key, tak ada dead-letter.

**Konsekuensi:** channel API sering balas 429/5xx/timeout transient. Tanpa retry → listing gagal
padahal harusnya sukses. Tanpa idempotency → retry membuat **listing dobel**. Batch yang mati di
tengah tak bisa dilanjutkan (tak tahu mana yang sudah beres).

**Yang dibutuhkan:** publish sebagai **job durable** (status di DB) + retry backoff untuk error
transient + **idempotency-key** per `(master, store, contentHash)` agar aman diulang + DLQ untuk
kegagalan permanen + progress tracking untuk batch.

### Gap 4 — Rate-limiting per-channel nyaris tak ada  ❌ P0
Hanya 2 file menyentuh rate-limit; tak ada gate throttle per-channel pada jalur publish. `batch`
memfan-out `Flux.merge` **tanpa cap konkurensi**.

**Konsekuensi:** bulk-publish 200 produk ke Shopee/Amazon serempak → langsung kena throttle/ban.

**Yang dibutuhkan:** limiter token-bucket per `(channelType, store)` yang dikonfig data-driven
(reuse pola `ChannelConfiguration`), plus cap konkurensi batch.

### Gap 5 — Golden-payload test per channel/kategori belum ada  ❌ P0
Sudah jadi rekomendasi #1 di assessment terdahulu, masih ⬜. Pipeline 5–7 lapisan tanpa test
"master X + kategori Y ⇒ body HARUS = Z" berarti setiap edit JOLT/post-proc berisiko regresi diam.

**Yang dibutuhkan:** suite golden-payload (fixture per channel×kategori) yang jalan di CI.

### Gap 6 — Observability operasional terbatas  ⚠️ P1
Ada `GET /publish/health` (statik) + **publish-trace inspector** (bagus untuk *debug transform*),
tapi tak ada metrik agregat sukses/gagal per channel, tak ada alert. Kegagalan produksi baru
ketahuan saat seller komplain.

**Yang dibutuhkan:** metrik (publish success-rate, latency p95, error-rate per channel/error-code) +
alert ambang; expose ke Prometheus/log terstruktur.

### Gap 7 — Sinkronisasi stok & harga berkelanjutan: belum ada  ⚠️ P1 (boleh fase-2)
Tak ada kelas order/inventory/stock (hanya substring di komentar). `publishOptions.syncInventory`
flag ada tapi bukan mesin sync berkelanjutan.

**Konsekuensi:** setelah listing tayang, stok/harga tak ikut berubah otomatis → **oversell**. Untuk
"minimum viable publish" ini bisa fase-2 **asalkan** update-manual (Gap 2) sudah ada sebagai jalan darurat.

### Gap 8 — Reverse-sync & order ingestion  🔵 P2 (pasca-launch)
Reverse-sync **design-only** (`docs/reversesync/`, tertulis "belum diimplementasi"). Order ingestion
tidak ada. Ini fitur ops penuh — di luar cakupan MVP-publish, tapi dicatat agar roadmap jelas.

### Gap 9 — Kontrak BFF↔sync-service implisit  ⚠️ P1
Dari assessment terdahulu (masih valid): kontrak metadata-workflow / `transformPaths` / support-field
menyebar lintas-repo tanpa contract-test. Sumber banyak bug integrasi.

---

## 3. Perbandingan dengan sistem luar (fokus: yang relevan untuk MVP-publish)

| Kapabilitas | Labamap (kini) | Sellbrite | Channable | BigSeller | Linnworks / ChannelAdvisor |
|---|---|---|---|---|---|
| Transform master→channel | **JOLT+post-proc+AI-draft** (superior) | Template UI | Feed/rule engine | Per-channel hardcoded | Adapter + ML taksonomi |
| Onboarding channel baru | Data + AI-draft | Tim engineer | Rule UI | Tim engineer | Tim integrasi besar |
| **Listing-state store** ("live di mana") | ❌ **belum** | ✅ | ✅ | ✅ | ✅ |
| **Update/relist listing** | ❌ hanya create/delete | ✅ | ✅ | ✅ | ✅ |
| **Retry/idempotency/queue** | ❌ | ✅ | ✅ | ✅ | ✅ (matang) |
| **Rate-limit per channel** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Inventory/price sync** | ❌ | ✅ | sebagian | ✅ | ✅ |
| Order ingestion / routing | ❌ | ✅ | ❌ (feed-only) | ✅ | ✅ |
| Observability/alert | ⚠️ debug-only | ✅ | ✅ | ✅ | ✅ |

**Bacaan:** Labamap **melampaui** kompetitor di kualitas transformasi (tak ada yang meng-AI-draft
spec), tapi **tertinggal di dasar-dasar operasional** yang setiap kompetitor MVP-nya sudah punya:
tahu apa yang live, bisa update-nya, dan tahan terhadap kegagalan/limit. **Channable** menarik sebagai
pembanding terdekat: ia "feed + rule → publish" (mirip niche Labamap, tanpa order/WMS) — dan bahkan ia
punya listing-state + retry + rate-limit sebagai baseline.

---

## 4. Kebutuhan seller untuk "siap publish ke market" (perspektif user)

Seller yang pertama pakai sistem ini akan menuntut, berurutan:

1. **"Produk saya tayang di mana saja & statusnya apa?"** → butuh Gap 1 (listing-state).
2. **"Saya ganti harga/stok, update dong listing-nya — jangan bikin baru."** → butuh Gap 2 (update).
3. **"Publish 50 produk sekaligus, dan jangan gagal separuh diam-diam."** → butuh Gap 3+4 (job+retry+limit).
4. **"Kalau gagal, kasih tahu kenapa & bisa diulang."** → butuh Gap 3 (retry/DLQ) + Gap 6 (visibility).
5. **"Jangan sampai saya oversell."** → idealnya Gap 7; minimum: update-manual cepat (Gap 2).

Poin 1–4 adalah **fondasi kepercayaan**. Tanpa itu, kehebatan transformasi tak terasa — seller berhenti
di penggunaan pertama karena listing dobel atau tak terlacak.

---

## 5. Rekomendasi: DAFTAR FITUR MVP MINIMUM (siap publish ke market)

Prinsip: **bukan platform ops lengkap** — cukup agar publish itu **terlacak, bisa di-update, dan aman
diulang**. Dipesan agar tiap item punya nilai berdiri-sendiri.

### 🟥 P0 — WAJIB sebelum go-live (pemblokir)

| # | Fitur | Cakupan minimum | Sentuhan implementasi (indikatif) |
|---|---|---|---|
| P0-1 | **Listing-state store** | Koleksi `listing_state`: `(masterProductId, storeId, channelType) → channelProductId, channelUrl, status, contentHash, lastError, publishedAt, updatedAt`. Diisi saat publish sukses. | Perkaya `ChannelPublishService` untuk persist hasil; entitas+repo baru; simpan `channelProductId` yang kini terbuang. |
| P0-2 | **Re-publish idempoten + update/delist** | Jika `listing_state.channelProductId` ada → jalur **UPDATE** channel; sediakan **delist**. Cegah create-dobel. | Tambah `update_CP` di metadata workflow sync-service + cabang di publish berdasarkan listing-state. |
| P0-3 | **Publish sebagai job durable + retry + idempotency + DLQ** | Job status di DB; retry-backoff untuk 429/5xx/timeout; idempotency-key `(master,store,contentHash)`; DLQ + progress batch. | Bungkus publish jadi job; cap konkurensi batch; simpan job-state; retry policy data-driven. |
| P0-4 | **Rate-limit per channel + cap konkurensi batch** | Token-bucket per `(channelType, store)` dari config; batch tidak fan-out tak-terbatas. | Limiter reaktif; baca kuota dari `ChannelConfiguration`. |
| P0-5 | **Golden-payload tests** | Fixture "master X + kategori Y ⇒ body Z" per channel utama; jalan di CI. | Suite test + fixture; gerbang regresi. |

### 🟧 P1 — segera setelah go-live (stabilitas & kepercayaan)

| # | Fitur | Kenapa |
|---|---|---|
| P1-1 | **Observability operasional** (metrik success-rate/latency/error-code per channel + alert) | Deteksi kegagalan sebelum seller komplain. |
| P1-2 | **Sinkronisasi stok & harga (poll/webhook, satu arah master→channel)** | Cegah oversell; bisa mulai dari "push stok saja". |
| P1-3 | **Kontrak BFF↔sync eksplisit (contract-test / schema bersama)** | Hilangkan tebak `transformPaths`/support-field. |
| P1-4 | **Bulk-publish UX: progress + resume partial-failure** | Skala nyata; melengkapi P0-3. |

### 🟦 P2 — pasca-launch (ops penuh, sesuai roadmap)

Reverse-sync (channel→master, sudah ada desain) · order ingestion/routing · repricing · WMS/fulfillment.
Ini yang membedakan "publisher" dari "platform ops penuh" — **sengaja ditunda**, konsisten dengan
tujuan MVP.

---

## 6. Roadmap bertahap (saran urutan kerja)

```
Sprint 1  P0-1 listing-state store  ──►  fondasi semua yang lain (tanpa ini P0-2/3 mustahil)
Sprint 1  P0-5 golden-payload tests ──►  jaring pengaman sebelum menyentuh pipeline
Sprint 2  P0-2 update/delist idempoten (butuh P0-1)
Sprint 2  P0-4 rate-limit + cap konkurensi
Sprint 3  P0-3 job durable + retry + DLQ + progress (butuh P0-1, P0-4)
────────────────────────────  GO-LIVE GATE  ────────────────────────────
Sprint 4  P1-1 observability  ·  P1-2 stok/harga push  ·  P1-3 contract-test
Pasca     P2: reverse-sync → order → repricing
```

**Definisi "siap publish ke market" (go-live gate):** P0-1..P0-5 selesai — sistem bisa **melacak apa
yang live, meng-update tanpa duplikat, mengulang secara aman saat gagal, tidak kena ban rate-limit, dan
terlindung regresi**. Itu ambang minimum yang jujur; di bawah itu, kehebatan transformasi belum bisa
dipercaya seller di produksi.

---

## 7. Catatan penutup (jujur)

- Yang **sudah dibangun bagus**: transformasi data-driven, OAuth/keamanan, capability enrichment,
  AI-guardrail, trace-inspector. Jangan dibongkar — itu aset & pembeda.
- Yang **kurang** bukan soal "AI vs tidak" dan bukan kualitas transform — melainkan **fondasi
  operasional siklus-hidup listing**: melacak, meng-update, mengulang-aman, membatasi laju, menguji regresi.
- Kabar baiknya: **P0-1..P0-5 semuanya aditif** — memanfaatkan substrat data-driven yang sudah ada
  (`ChannelConfiguration`, metadata-workflow, `channel_product_data`), bukan penulisan-ulang arsitektur.
- Sengaja **tidak** merekomendasikan inventory/order/reprice penuh untuk MVP — sesuai permintaan
  "kebutuhan minim yang ready untuk di-publish", itu fase pasca-launch.
