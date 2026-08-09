# 01 — Reverse Sync: Overview & Prinsip

> DESIGN ONLY — belum diimplementasi. Lihat [`README`](README.md).

## 1. Kenapa reverse sync tidak boleh "salin semua"

Platform ini adalah **forward transformer + publisher**: master product (channel-agnostic) →
transform → payload channel. Master **dibagi ke banyak channel**. Karena itu menarik balik data dari
satu channel **tidak boleh** menyalin bulat-bulat semua yang ada pada item channel:

- Banyak field pada item channel adalah **operasional/sistem channel** (item_id, create_time, rating,
  view_count, shop_id, status internal) — itu bukan konten produk; menyimpannya sebagai master tak
  bermakna.
- Sebagian field adalah **struktur turunan khas channel** (Shopee `tier_variation`, `image_id_list`,
  `model`) yang merupakan **hasil** transform, bukan data master asli. Menyalinnya mentah = mengotori
  master. (Cara membalikkannya: [`02`](02-reverse-pipeline-and-post-processing.md).)
- Master shared → menulis balik sembarangan **menabrak** channel lain yang berbagi master itu.

Jadi reverse harus **selektif dan sadar-mapping**, sama seperti forward selektif memilih field master
mana yang dikirim ke channel.

## 2. Model tiga-ember

Untuk tiap field pada payload channel yang masuk, klasifikasikan ke salah satu:

| Ember | Kriteria (dari DATA, bukan literal) | Tujuan simpan |
|---|---|---|
| **(a) Master-mapped** | Path channel menaut ke master via `attributeMappings` (attrId) dan/atau `ecommerce_master_attributes.masterFieldName` | **Master product** (lihat §4 soal apakah overwrite atau draft) |
| **(b) Channel-only dikenal** | Ada di `apiSchema`/`attributeMappings` tapi tak punya padanan master (mis. `isSupportField`, atribut kategori khusus channel) | **Step-2 `channelData`** per (masterProductId × storeId) |
| **(c) Tak dikenal / operasional** | Tidak dikenal keempat sumber di §3 | **Dibuang** (opsional: `channelProductId` disimpan sebagai linkage; sisanya boleh di-log/raw-archive bila perlu audit) |

Ini menegaskan hipotesis awal: **hanya yang punya mapping** yang membentuk master + Step-2. Yang
membedakan (a) vs (b) adalah apakah field channel itu **menaut ke master** di data.

## 3. Sumber kebenaran mapping (dibaca "terbalik")

Semua sudah ada di MongoDB — reverse tinggal membacanya dari arah channel→master:

| Keputusan reverse | Koleksi/sumber |
|---|---|
| Apakah path ini field channel yang sah? | `ChannelConfiguration.apiSchema` / contract beku |
| Path channel ↔ attrId/master field | `attributeMappings` (`ChannelAttributeMappingsMigration`), `ecommerce_master_attributes.masterFieldName` |
| Nilai channel ↔ nilai master (mis. `COTTON_100`↔`cotton`) | `channel_field_value_mappings` (invers dari entry `mappings[]`) |
| Peran field asing yang tak punya master attr | `field_semantic_knowledge` (fallback, seperti forward) |
| Sumbu varian & rekonsiliasi SKU | `product_types.variantDimensions`, `ecommerce_master_attributes.group` (VARIANT) |

Tidak ada vocabulary baru yang perlu di-hardcode — konsisten dengan aturan **no hardcoded domain
knowledge**. Reverse adalah **konsumen** koleksi yang sama dengan forward.

## 4. Arah kebenaran (direction of truth) — keputusan desain terberat

Karena master shared, pertanyaan sebenarnya bukan "field apa yang masuk" melainkan **"untuk field apa,
channel yang berwenang?"** Rekomendasi:

- **Default aman:** reverse menulis ke **Step-2 `channelData` per-store** (terisolasi, tak menabrak
  channel lain).
- **Menyentuh master:** hanya sebagai **draft/suggestion untuk di-review** ("Shopee melaporkan harga X,
  terima ke master?"), bukan silent overwrite.
- **Field ownership sebagai DATA:** tandai per master-attribute siapa yang authoritative
  (mis. stok/harga aktual → channel-authoritative; deskripsi/kategori → master-authoritative). Simpan
  di `ecommerce_master_attributes` (flag baru), bukan literal di kode.

Detail penyimpanan + policy: [`03`](03-data-model-identity-and-phasing.md).

## 5. Non-goals (di luar cakupan desain ini)

- **Bukan** replikasi dua-arah real-time / CRDT. Reverse di sini adalah import terkontrol
  (webhook/poll), bukan mirror bit-per-bit.
- **Bukan** mengubah jalur forward. Forward tetap apa adanya.
- **Bukan** menambah field ke `apiSchema` demi reverse (apiSchema tetap spec-of-record body channel).
- **Bukan** menjadikan channel sumber-kebenaran master secara default (lihat §4).
