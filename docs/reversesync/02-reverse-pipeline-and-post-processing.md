# 02 — Reverse Pipeline & Peran Post-Processing

> **TERIMPLEMENTASI (R0–R5).** Dokumen ini adalah **rasional desain awal** pipeline balik & peran post-processing;
> **ya, wajib, dan dibalik.** As-built: interpreter reverse terpisah (`ReverseDerivationEngine` jalan PALING AWAL)
> + reverse-op descriptor (variant/attribute_list/image) + enricher lokal. **Konfigurasinya kini SATU list terpadu
> `reverseSyncConfig.operations[]`** (op `REBASE_ITEM`/`VARIANT_INVERSE`/`ATTRIBUTE_LIST`/`AGGREGATE`/`IMAGE_INVERSE`,
> dibaca `ReverseOps` → descriptor tipenya; satu-satunya sumber, tak ada legacy/fallback). Gambar: op `IMAGE_INVERSE`
> me-route gambar channel → master `mainImage`/`galleryImages`/`variantImages` ([`05`](05-config-source-of-truth.md) §7b).
> Pipeline as-built langkah-demi-langkah + peta SoT: [`05`](05-config-source-of-truth.md) §3; log per-slice:
> [`04`](04-engine-separation-and-industry-comparison.md).

## 1. Pipeline maju (yang sudah ada) sebagai acuan

```
master  (+ staging keys: _sourceImages, _productTypeVariantDimensions, dst.)
  └─▶ JOLT shift            master paths ──▶ channel paths
  └─▶ buildChannelAttributes  (skip key ber-prefix "_")
  └─▶ POST-PROCESSING        (GenericPostProcessingEngine) — bangun struktur turunan khas channel:
         BUILD_TIER_VARIATION, BUILD_MODEL, WRAP_ARRAY_TO_OBJECTS, MAP_TO_INDEXED,
         BUILD_SALES_ATTRIBUTES, ENRICH_IMAGES/MEDIA, CONCAT_INTO, SET_DEFAULT, ...
  └─▶ channel payload  ─────▶  publish
```

Poin kunci: **post-processing adalah langkah TERAKHIR** dan justru di situlah data master yang "polos"
diubah jadi bentuk idiosinkratik channel (Shopee `tier_variation`/`image.image_id_list`/`model`,
Shopify `option1_name`/`option1` terindeks, atribut ter-nest, default terisi, nilai ter-concat).

## 2. Pipeline balik = MIRROR (post-processing dibalik, jalan PALING AWAL)

Payload yang masuk dari channel **sudah** dalam bentuk idiosinkratik itu. Kalau kita langsung reverse-JOLT
tanpa membongkarnya, master akan berisi `tier_variation`/`image_id`/string ter-concat — **salah**. Maka
urutannya di-mirror:

```
channel payload  (dari GET item / webhook product-update)
  └─▶ REVERSE POST-PROCESSING  ("de-derivation") — jalan PERTAMA, bongkar struktur channel:
         tier_variation ──▶ variant dimensions
         model          ──▶ per-SKU price/stock/variant overrides
         image_id_list  ──▶ URLs   (perlu resolve via media API — lihat §4 kelas B)
         option1/2      ──▶ dimensions
         attribute-list ──▶ flat fields
  └─▶ normalized flat channel attrs   (bentuk yang setara "sebelum post-processing" di forward)
  └─▶ REVERSE JOLT           channel paths ──▶ master paths      (butuh spec balik — §5)
  └─▶ REVERSE value-mapping  channel value ──▶ master value      (invers channel_field_value_mappings)
  └─▶ KLASIFIKASI tiga-ember (a/b/c)  +  policy ownership
  └─▶ master-draft  /  Step-2 channelData
```

**Simetri yang harus dipegang:** forward = `JOLT → post-processing`; reverse = `reverse-post-processing →
reverse-JOLT`. Post-processing maju di ekor, reverse-post-processing di kepala. Kalau urutan ini
terbalik, hasil reverse tidak akan benar.

## 3. Kenapa post-processing tidak bisa dilewati saat reverse

Contoh konkret (Shopee), menunjukkan tanpa reverse-post-processing master jadi rusak:

| Field masuk dari Shopee | Kalau langsung reverse-JOLT (SALAH) | Setelah reverse-post-processing (BENAR) |
|---|---|---|
| `tier_variation: [{name:"Color",option_list:[...]}, {name:"Size",...}]` | master dapat objek `tier_variation` asing | `variantDimensions` + nilai sumbu master yang bersih |
| `model: [{tier_index:[0,1], price, stock, sku}]` | master dapat array `model` tak bermakna | per-SKU `variantOverrides` (harga/stok/sku) ter-rekonsiliasi ke varian master |
| `image.image_id_list: ["img_a","img_b"]` | master `images` berisi **ID**, bukan URL | `images` berisi URL asli (di-resolve dari media API) |
| Shopify `option1:"Red", option2:"M"` (terindeks) | master kehilangan nama sumbu; nilai tercecer | dipetakan balik ke `{Color:Red, Size:M}` via urutan sumbu |

Inilah alasan post-processing **wajib** terlibat: ia satu-satunya tempat pengetahuan "bagaimana channel
membentuk strukturnya" — dan hanya dengan membalik pengetahuan itu, reverse menghasilkan master benar.

## 4. Klasifikasi invertibility per operasi (dari operasi NYATA di `GenericPostProcessingEngine`)

Tidak semua operasi maju bisa dibalik. Tiga kelas:

### Kelas A — Invertible deterministik (punya invers bersih)
Reverse otomatis bisa dibangun.

| Operasi maju | Invers reverse |
|---|---|
| `WRAP_ARRAY_TO_OBJECTS` (URLs → `[{uri,scene}]`) | unwrap objects → array URL |
| `NEST_FIELD` / `WRAP_TO_LIST` | unnest / unwrap list tunggal |
| `RENAME_FIELD` | rename balik |
| `STRING_TO_OBJECT` | object → string (struktur diketahui) |
| `TRANSLATE_VALUE_IDS` | translate balik (bila peta id↔value dua-arah) |
| `BUILD_TIER_VARIATION` | extract → `variantDimensions` |
| `BUILD_MODEL` | extract → per-SKU overrides |
| `BUILD_SALES_ATTRIBUTES` / `BUILD_ATTRIBUTE_LIST` | flatten attribute-list → field datar |
| `MAP_TO_INDEXED` / `EXTRACT_DIMENSIONS` | recover sumbu dari option terindeks |
| `BUILD_OPTIONS_FROM_FLAT_KEYS` / `BUILD_CHOICES_MAP` | recover flat keys / choices |
| `COPY_FIELD` / `COPY_PATH` | no-op saat reverse (sumber sudah ada) |

### Kelas B — Enrichment (butuh data EKSTERNAL untuk dibalik, bukan invers murni)
Reverse memerlukan panggilan tambahan; bukan sekadar transform lokal.

| Operasi maju | Yang dibutuhkan saat reverse |
|---|---|
| `ENRICH_IMAGES` / `ENRICH_MEDIA` / `ENRICH_VARIANT_MEDIA` / `LINK_MEDIA_TO_CHOICES` | resolve `image_id` → URL via media API channel; petakan balik media↔choice |
| `BUILD_STOCK_INFOS` | agregasi balik stok per-warehouse → stok master (butuh peta warehouse) |

> Kelas B adalah alasan reverse **tidak murni fungsi lokal** — untuk Shopee, membalik gambar berarti
> memanggil endpoint media (kebalikan dari langkah upload dua-tahap di publish). Ini juga versi-aware:
> endpoint media harus sesuai versi yang membuat payload.

### Kelas C — Lossy / non-invertible (TIDAK bisa dibalik deterministik)
Reverse **tidak boleh mengarang**. Kebijakan: skip di reverse; field yang disentuh op ini **tidak
menjadi master-authoritative** (biarkan master apa adanya / tandai draft-review).

| Operasi maju | Kenapa tak bisa dibalik | Kebijakan reverse |
|---|---|---|
| `SET_DEFAULT` / `SET_FIELD` / `CONDITIONAL_SET` | tak bisa bedakan default suntikan vs nilai asli | jangan tulis balik ke master; abaikan |
| `CONCAT_INTO` | string gabungan tak bisa dipecah deterministik | abaikan; atau simpan mentah ke Step-2 |
| `AUTO_INCREMENT` | indeks generated, tak punya sumber | abaikan |
| `REMOVE_PATH` / `REMOVE_FIELD` / `FILTER` | data sudah dibuang saat maju | tak ada yang bisa dipulihkan |
| `COERCE_TYPE` / `TO_STRING` | semi-lossy (mis. `"0"` vs `0`) | re-coerce ke tipe master dari `apiSchema`/master schema (aman) |
| `value-mapping fallback FREE_TEXT/USE_CLOSEST` | tak ada entry balik yang eksklusif | pakai invers hanya untuk entry eksplisit; sisanya draft-review |

**Aturan emas:** field yang di forward hanya lahir dari operasi Kelas C **tidak pernah** dijadikan
sumber kebenaran master saat reverse. Reverse mengisi master hanya dari Kelas A (+ B yang berhasil
di-resolve).

## 5. Reverse JOLT: butuh spec tersendiri, bukan spec maju "dibalik"

JOLT shift maju umumnya **tidak** simetris otomatis (banyak-ke-satu, default, `#`/`@` operations). Jadi
reverse butuh **spec channel→master tersendiri**. Dua opsi:

- **Digenerate agent** (pola sama seperti `JoltGenerationAgentService`): analisa `apiSchema` (channel) ↔
  master schema, hasilkan shift channel→master. Disimpan versi-aware (mis. `channel_reverse_jolt_specs`
  key `(channelId, category, orgId, apiVersion)`), fallback seperti forward.
- **Turunan sebagian** dari attributeMappings (yang memang menyimpan path↔attrId) untuk field 1:1;
  agent hanya mengisi yang non-trivial.

Rekomendasi: mulai dari **attributeMappings 1:1** (deterministik, tanpa AI) untuk fase awal; agent
untuk field kompleks di fase lanjut.

## 6. Engine dua-arah: reuse `GenericPostProcessingEngine`, jangan bikin pengetahuan kembar

Agar tidak melanggar **"avoid duplication"**, jangan tulis ulang pengetahuan channel di tempat kedua.
Rekomendasi konkret:

1. **Direction-aware engine.** Beri `GenericPostProcessingEngine` mode `FORWARD`/`REVERSE`.
2. **Kelas A → invers otomatis.** Untuk operasi invertible, engine menurunkan perilaku balik dari
   definisi maju (satu sumber pengetahuan). Boleh ditandai lewat metadata `reversible: true` +
   `inverseOp` pada tiap operasi di rule.
3. **Kelas B → reverse-enricher eksplisit.** Operasi enrichment mendaftarkan handler balik (media
   resolve, warehouse map) — karena butuh I/O eksternal, ini tak bisa diturunkan otomatis.
4. **Kelas C → no-op saat REVERSE** + tandai field non-authoritative.
5. **Sumber rule = contract BEKU.** `ChannelApiContract` sudah membekukan `postProcessingRules` per versi
   (Fase 2b). Reverse **membaca rule dari contract versi efektif store** — sehingga payload yang dibuat
   oleh v2 dibongkar dengan resep v2, bukan resep v-terbaru. (Tie-in versioning: [`03`](03-data-model-identity-and-phasing.md).)

Dengan ini, menambah channel/versi baru untuk reverse = **data** (rule + reverse-jolt + mapping), bukan
kode runtime baru — konsisten dengan seluruh arsitektur.

## 7. Rekonsiliasi varian (khusus, sering salah)

Saat reverse membangun ulang varian dari `model`/`tier_variation`, **jangan** cocokkan varian by index.
Cocokkan **by nilai sumbu** terhadap sumbu master (`product_types.variantDimensions`,
`ecommerce_master_attributes.group=VARIANT`). Index channel bisa berubah urutan; nilai sumbu (Color=Red,
Size=M) yang stabil. Ini menjaga `variantOverrides` master tetap benar walau urutan SKU di channel
berbeda.
