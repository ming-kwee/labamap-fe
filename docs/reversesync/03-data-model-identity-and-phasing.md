# 03 — Data Model, Identity, Ownership & Phasing

> DESIGN ONLY — belum diimplementasi. Lihat [`README`](README.md).

## 1. Linkage identity (prasyarat #1 — belum ada hari ini)

Reverse harus tahu "item channel ini = master product yang mana", untuk memilih **update** vs
**create**. Hari ini `channel_product_data` **tidak** menyimpan id sisi-channel — jadi linkage belum
bisa. Yang perlu ditambahkan:

| Field baru di `ChannelProductData` | Guna |
|---|---|
| `channelProductId` (item_id/listing_id channel) | kunci pencocokan reverse; juga memperbaiki create-vs-update di forward |
| `publishedApiVersion` | tahu payload dibuat dengan resep versi apa → pilih contract beku + reverse-rule yang benar |
| `lastReverseSyncedAt` | audit & dedup event |
| `channelUpdatedAt` (dari payload) | deteksi mana yang lebih baru (echo-suppression, §4) |

> Catatan: `channelProductId` + `publishedApiVersion` juga sudah disebut sebagai gap di diskusi Fase 3.
> Reverse menjadikannya **wajib**, bukan sekadar nice-to-have. Distempel di `markPublished(...)` (kini
> hanya menulis `status` + `publishedAt`).

## 2. Target penyimpanan (mengikuti model dua-tier yang ada)

Reuse struktur yang sudah ada — reverse **tidak** memerlukan koleksi produk baru:

| Ember (dari [`01`](01-overview-and-principles.md) §2) | Ditulis ke |
|---|---|
| (a) Master-mapped | Master product — **sebagai draft/override**, lihat §3. Untuk field per-store: `channel_product_data.masterOverrides` |
| (b) Channel-only dikenal | `channel_product_data.channelData` (+ `variantOverrides` untuk per-SKU) |
| (c) Tak dikenal | dibuang; hanya `channelProductId` disimpan sebagai linkage (opsional raw-archive untuk audit) |

Koleksi baru yang **mungkin** diperlukan:
- `channel_reverse_jolt_specs` (opsional) — spec channel→master versi-aware (lihat [`02`](02-reverse-pipeline-and-post-processing.md) §5).
- `reverse_sync_events` (opsional) — jejak audit tiap import (payload hash, versi, hasil klasifikasi,
  konflik yang di-resolve). Berguna untuk debug & idempotensi.

## 3. Ownership & conflict policy (arah kebenaran, sebagai DATA)

Master shared → reverse **tidak** boleh silent-overwrite. Policy per master-attribute, disimpan di
`ecommerce_master_attributes` (flag baru, bukan literal):

| Flag baru (usulan) | Arti |
|---|---|
| `reverseWritePolicy` = `IGNORE` | jangan pernah tarik dari channel |
| `reverseWritePolicy` = `CHANNEL_AUTHORITATIVE` | channel menang → tulis langsung (mis. stok/harga aktual marketplace, **per-store** ke `channelData`/`masterOverrides`, bukan master global) |
| `reverseWritePolicy` = `DRAFT_REVIEW` | buat suggestion untuk di-ACC manusia sebelum menyentuh master |
| `reverseWritePolicy` = `MASTER_AUTHORITATIVE` (default) | master menang → abaikan nilai channel |

Prinsip: apa pun yang lahir dari operasi **Kelas C** ([`02`](02-reverse-pipeline-and-post-processing.md) §4)
otomatis diperlakukan `MASTER_AUTHORITATIVE` (jangan ditimpa).

## 4. Idempotensi & echo-suppression

Publish → channel memancarkan webhook `product/update` → jangan sampai itu memicu reverse yang menimpa
master lalu memicu publish lagi (loop). Penjaga:
- Bandingkan `channelUpdatedAt` / hash payload dengan `lastReverseSyncedAt`; **skip** bila ini echo dari
  publish kita sendiri (mis. window waktu + hash sama dengan payload yang barusan kita kirim).
- Reverse default menulis ke **draft/Step-2**, bukan master — memutus loop secara struktural.

## 5. Trigger

Hari ini `WebhookService`/`WebhookController` hanya menangani uninstall/deauthorize. Reverse butuh:
- **Webhook produk** (`product/create`, `product/update`) — verifikasi signature seperti webhook
  existing (Shopify base64 HMAC-SHA256, TikTok `HMAC(timestamp+body)`, dst.), lalu masuk pipeline balik.
- atau **Poll/backfill** — `GET item` untuk import awal / rekonsiliasi berkala (perlu paginasi + rate
  limit; ini juga versi-aware pada endpoint-nya).

## 6. Tie-in versioning (kenapa reverse butuh contract beku)

Payload yang datang dari channel dibuat oleh **suatu versi**. Untuk membongkarnya dengan benar, reverse
harus memakai **resep versi itu**:
- Ambil `publishedApiVersion` (atau pin store) → resolve `ChannelApiContract` beku versi itu →
  `postProcessingRules` + `apiSchema` versi itu → reverse-post-processing & klasifikasi memakai resep yang
  benar, bukan resep versi terbaru.
- Endpoint Kelas B (media resolve, dll.) di-templat `{apiVersion}` seperti forward (Fase 1/1b/1c).

Inilah kenapa pekerjaan versioning (contract beku + pin) adalah **fondasi** reverse yang benar lintas
drift versi — tanpa itu, payload v2 akan dibongkar dengan aturan v-terbaru dan menghasilkan master salah.

## 7. Fase implementasi yang disarankan

Bertahap, tiap fase behaviour-additive (tak mengubah forward):

| Fase | Isi | Nilai |
|---|---|---|
| **R0 — Linkage** | Tambah `channelProductId` + `publishedApiVersion` di `ChannelProductData`, stempel di `markPublished`. **Tak ada reverse logic dulu.** | Prasyarat semua; sekaligus perbaiki create-vs-update forward |
| **R1 — Read-only preview** | Endpoint "fetch & classify": ambil item channel, jalankan reverse-post-processing + klasifikasi tiga-ember, **tampilkan diff** vs master — tanpa menulis | Bukti kebenaran mapping/post-processing sebelum menulis apa pun |
| **R2 — Write Step-2 only** | Terapkan hasil ke `channelData`/`variantOverrides`/`masterOverrides` (per-store) — **tidak** menyentuh master global | Aman; tak menabrak channel lain |
| **R3 — Master draft-review** | Field `DRAFT_REVIEW` → suggestion untuk di-ACC; `CHANNEL_AUTHORITATIVE` stok/harga per-store | Import kaya, tetap ada guardrail manusia |
| **R4 — Webhook + backfill** | Trigger event produk + poll rekonsiliasi + echo-suppression | Otomatis & idempoten |
| **R5 — Reverse JOLT agent** | Spec channel→master digenerate untuk field kompleks (di luar 1:1 attributeMappings) | Cakupan penuh |

Mulai dari **R0 + R1**: keduanya membuktikan hipotesis "hanya yang termapping yang masuk" dan
"post-processing wajib dibalik" secara nyata, **tanpa risiko** menulis data.

## 8. Ringkas prasyarat (gap yang harus ditutup lebih dulu)

1. `channelProductId` + `publishedApiVersion` di `ChannelProductData` (R0).
2. Konfirmasi di mana create-vs-update forward diputuskan (BFF vs sync-service `localhost:9000`) —
   reverse & forward-update berbagi kebutuhan linkage yang sama.
3. Contract beku per versi (**sudah ada**, Fase 2a–2d) — reverse tinggal membacanya.
4. Flag `reverseWritePolicy` di `ecommerce_master_attributes` (R2/R3).
