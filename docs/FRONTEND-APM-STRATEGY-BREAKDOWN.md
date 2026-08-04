# FRONTEND — "Matching strategy breakdown" menampilkan 0 padahal ada mapping

> **Untuk tim FE.** Panel **"Matching strategy breakdown"** (Publish Diagnostics) menampilkan `0` untuk
> semua tier padahal tabel **Field mappings** jelas berisi mapping dengan strategi. **Bukan bug matching
> dan bukan data backend yang salah** — panel-nya membaca **key yang tidak cocok** dengan nama strategi
> backend, dan **tidak punya bucket untuk `ALIAS_MAPPING`**. Perbaikannya di FE: render breakdown
> **dinamis dari key yang benar-benar ada**. Backend tidak perlu diubah.

---

## 1. Gejala

```
Field mappings (6)
  description        → description                              SEMANTIC_KNOWLEDGE   95%
  comparePrice       → product_attributes[0].values[0].id       ALIAS_MAPPING        95%
  variants[0].price  → skus[0].price.amount                     ALIAS_MAPPING        95%
  variants[0].inventory → skus[0].inventory                    ALIAS_MAPPING        95%
  name               → skus[0].sales_attributes[0].name         SEMANTIC_KNOWLEDGE   95%
  category           → category_version                         KEYWORD_SIMILARITY

Matching strategy breakdown
  Knowledge-Based 0 · Semantic 0 · Similarity 0 · Pattern 0      ← semua 0
```

## 2. Akar masalah

Backend mengirim breakdown sebagai **`Map<strategyName, count>` yang di-key oleh nama strategi PERSIS**
seperti kolom `Strategy` di tabel mapping. Untuk contoh di atas:

```jsonc
strategyBreakdown = { "SEMANTIC_KNOWLEDGE": 2, "ALIAS_MAPPING": 3, "KEYWORD_SIMILARITY": 1 }
```

Panel saat ini punya **4 tier tetap** yang membaca key **berbeda** dan **melewatkan `ALIAS_MAPPING`**
(justru mayoritas):

| Panel tier (label) | Key backend sebenarnya | Cocok? |
|---|---|---|
| Knowledge-Based | `CHANNEL_SPECIFIC` | ✗ |
| Semantic | `SEMANTIC_KNOWLEDGE` | ✗ |
| Similarity | `KEYWORD_SIMILARITY` | ✗ |
| Pattern | `PATTERN_MAPPING` | ✗ |
| *(tidak ada)* | **`ALIAS_MAPPING`** | ✗ — 3 mapping tak terhitung |

Tiap tier membaca key yang `undefined` → `0`. (Catatan: contoh lama di javadoc backend menyebut
`{"EXACT_MATCH","SEMANTIC_MATCH"}` — itu **stale**, sudah dikoreksi; jangan dijadikan acuan.)

## 3. Kontrak yang benar (backend)

`strategyBreakdown` adalah `Map<String,Integer>`, key = nama strategi, value = jumlah mapping. Tersedia di:

- **Publish-analyze** (`POST /api/v1/channels/publish/analyze`) → `adaptiveMapping.strategyBreakdown`
- **APM analyze** (`POST /api/v1/adaptive-pattern-matching/analyze`) → `matchingMetadata.matchStrategyCount`

Kedua map ini **identik** dan di-key oleh nilai yang **sama** dengan `matchStrategy` di tiap baris field
mapping. **Kemungkinan key** (dari `KnowledgeBasedFieldMatchingService`, urut prioritas tier):

| Key strategi | Tier matcher | Confidence khas |
|---|---|---|
| `CHANNEL_SPECIFIC` | 1 (pre-configured/learned) | ~90–98% |
| `SEMANTIC_KNOWLEDGE` | 2 (tipe semantik sama) | ~85–95% |
| `ALIAS_MAPPING` | 3 (alias + tipe semantik sama) | ~80–95% |
| `PATTERN_MAPPING` | 4 (regex) | ~75% |
| `KEYWORD_SIMILARITY` | 5 (Jaccard) | ~60–90% |

> Set key ini bisa bertambah/berubah seiring waktu — **jangan hardcode**; render apa pun yang ada.

## 4. Perbaikan FE (disarankan)

Ganti 4 tier hardcoded → **loop atas entri `strategyBreakdown`** yang benar-benar ada, konsisten dengan
kolom `Strategy`:

```tsx
// sebelum: 4 tier tetap membaca key yang salah → 0
// sesudah: render dinamis dari key aktual
const breakdown = adaptiveMapping?.strategyBreakdown ?? {};   // { SEMANTIC_KNOWLEDGE: 2, ALIAS_MAPPING: 3, ... }
Object.entries(breakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([strategy, count]) => (
    <Row key={strategy} label={LABELS[strategy] ?? strategy} count={count} />
  ));
```

Opsional — glosarium label ramah (tetap render key tak dikenal apa adanya):

```ts
const LABELS: Record<string, string> = {
  CHANNEL_SPECIFIC:   "Knowledge-Based (channel-specific/learned)",
  SEMANTIC_KNOWLEDGE: "Semantic (same semantic type)",
  ALIAS_MAPPING:      "Alias (same semantic type + shared alias)",
  PATTERN_MAPPING:    "Pattern (regex)",
  KEYWORD_SIMILARITY: "Similarity (keyword/Jaccard)",
};
```

Hasilnya untuk contoh di atas: `Semantic 2 · Alias 3 · Similarity 1` — total 6, cocok dengan tabel.

## 5. Non-goals / catatan

- **Backend tidak perlu diubah** — datanya sudah benar. Hanya javadoc contoh yang stale sudah dikoreksi.
- Jika Anda ingin **tetap** 4 tier tetap, minta backend menambah field baru `strategyTierBreakdown`
  (mengelompokkan 5 strategi → 4 tier dengan key stabil). Tapi render dinamis lebih jujur & menampilkan
  `ALIAS_MAPPING`.
- Mapping yang **salah secara isi** (mis. `comparePrice → product_attributes[...].id`) adalah isu berbeda
  (tier alias). Sudah diperbaiki di backend commit `f2660c2` (alias wajib tipe-semantik sama) — akan hilang
  setelah backend di-restart.
