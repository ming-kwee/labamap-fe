# Keamanan kegagalan CREATE — kenapa CREATE tidak di-auto-retry (risiko duplikat)

> Ringkas + actionable untuk tim BFF. Melengkapi `12-tier1-auto-retry.md` (yang **UPDATE-only**). Analisis
> penuh di repo sync: `documentation/10-create-failure-safety.md`.

## 1. CREATE ≠ UPDATE

| | UPDATE | CREATE |
|---|---|---|
| Produk | sudah ada | **baru dibuat** |
| Verb | PUT (idempoten) | **POST (non-idempoten)** |
| Retry transient HTTP di sync | ya | **tidak** (cegah duplikat saat timeout) |
| Saat gagal | forward-only (keep-live) | **compensate-by-delete** (Saga rollback) |
| Listing-state | tetap PUBLISHED (G7) | **FAILED** (`recordPublishFailure`) |

CREATE **bukan** forward-only: produk baru yang gagal **dihapus** agar bersih, sehingga percobaan berikutnya
= CREATE bersih lagi.

## 2. Tier 0 CREATE = ADA (re-CREATE pada publish berikutnya), bersyarat

Setelah CREATE gagal & di-compensate → listing-state FAILED → publish berikutnya memutuskan CREATE lagi.
Aman bila kompensasi bersih:
- create **ditolak channel** → tak ada yang dibuat → re-CREATE aman ✅
- create sukses lalu langkah lanjut gagal → kompensasi hapus by-id (DELETE di-retry + 404=sukses) → aman ✅

**Bocor** hanya di: create **timeout ambigu** → produk mungkin terbuat **tanpa id** → kompensasi tak bisa
menghapus → **orphan** → re-CREATE → **DUPLIKAT** ❌.

## 3. Tier 1 CREATE = sengaja TIDAK ada

Tier-1 auto-retry (doc 12) **UPDATE-only**. CREATE dieksklusikan karena auto-retry POST non-idempoten
memperbesar duplikat di kasus timeout ambigu. **Jangan** menyalakan auto-retry untuk CREATE.

`eventId`→`ALREADY_PROCESSED` hanya cegah menjalankan ulang workflowId yang sama; retry butuh eventId baru →
tak melindungi re-CREATE dari duplikat.

## 4. Yang bisa dikerjakan BFF (masa depan)

| Prioritas | Item | Efek |
|---|---|---|
| **Paling berharga** | **Search-before-create**: sebelum publish CREATE, query channel by SKU/handle; kalau ada → adopsi id-nya (jadikan UPDATE), jangan bikin baru. | Menutup kasus orphan/timeout **dan** membuat re-CREATE aman tanpa duplikat. Channel-agnostik. |
| Bila didukung | **Idempotency key** pada create (mis. header dedup Shopify). | Channel men-dedup POST berulang. Terbatas per-channel. |
| Murah | **Tier-2 visibilitas** ✅ **DIIMPLEMENTASI (bff-v17)** — lihat §6. | Deteksi orphan lebih awal. |
| **JANGAN** | Auto-retry CREATE. | Menggandakan produk. |

## 5. Verdict

CREATE aman untuk kegagalan yang **ditolak channel** atau **ter-kompensasi bersih** (Tier-0 re-CREATE).
Lubang nyata = **create timeout ambigu → orphan → duplikat**. Obatnya **bukan retry**, melainkan
**search-before-create** (utama) atau idempotency key. Sampai itu ada, CREATE tetap **tanpa auto-retry**.

## 6. Tier-2 visibilitas — as-built (bff-v17)

Search-before-create **sengaja ditunda**: analisis performa menyimpulkan versi always-on (search tiap CREATE)
= pajak latensi + rate-limit demi kejadian LANGKA (timeout ambigu) → over-engineering. Yang dikerjakan = item
**"Murah"**: menandai CREATE yang gagal ambigu agar orphan bisa **dideteksi** (bukan dicegah), BFF-only, nol call channel.

- **Klasifier** `ChannelPublishService.isAmbiguousCreateFailure(op, errorMsg)` — `true` hanya bila op=CREATE **dan**
  errorMsg mengandung token timeout/transient (`timeout/deadline/504/503/502/unavailable/connection reset/…`).
  CREATE yang **ditolak bersih** channel (error logis, tanpa token timeout) atau error pre-flight/transform (tak
  pernah menyentuh channel) → **bukan** ambigu → FAILED biasa. UPDATE tak pernah ambigu (idempoten, keep-live).
- **Flag** `channel_product_data.orphanRisk` (Boolean). Di-set `true` oleh `recordAmbiguousCreateFailure` di **dua**
  jalur gagal (respons-normal + exception). Di-clear (`false`) pada sukses (`recordPublishSuccess`) & kegagalan
  bersih (`recordPublishFailure`) → flag selalu akurat. Query triase: `orphanRisk=true, status=FAILED`
  (`ChannelProductDataRepository.findByOrphanRiskIsTrue`).
- **Log** WARN "ORPHAN RISK: CREATE failed AMBIGUOUSLY …" untuk alerting.
- **TIDAK mengubah keputusan publish** — listing FAILED tetap re-CREATE (Tier-0). Ini murni visibilitas; obat lubang
  tetap search-before-create bila nanti frekuensi orphan membenarkan biayanya (dan itu pun **conditional**, dipicu
  `orphanRisk`, bukan always-on).
- Uji: `ChannelPublishServiceAmbiguousCreateTest` (4).
