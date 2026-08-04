# FRONTEND — Reframe "Paste JSON" (schema-level) sebagai Heuristic Matcher Inspector

> **Untuk tim FE.** Mode **"Paste JSON"** di Publish Diagnostics
> (`/platform-admin/publish-diagnostics`) memanggil `POST /adaptive-pattern-matching/analyze`
> (`persistJolt:false`). Ini **APM murni — tanpa AI, tanpa persist, bukan kebenaran produksi**. Nilainya
> adalah sebagai **alat diagnostik developer** untuk menginspeksi perilaku heuristic-matcher + kesehatan
> KB (`field_semantic_knowledge`), BUKAN sebagai penghasil mapping produksi. Dokumen ini meminta dua
> perubahan FE kecil agar mode ini jujur & benar-benar berguna.

---

## 1. Latar

Mode ini menampilkan output yang sering **pede-tapi-salah** (mis. `comparePrice → product_attributes[0].id`
@95%) karena APM adalah pencocok-nama dan KB kadang men-type token generik (`value`→PRICE, `id`→SKU,
`name`→PRODUCT_NAME). Untuk developer yang paham ini heuristik, itu justru **berguna**: ia deterministik,
nol-biaya (tanpa kuota LLM), tanpa efek-samping — cara termurah melihat "apa yang dilakukan matcher & KB".
Tapi tanpa label, non-expert mengira ini jawaban.

**Perbedaan dengan mode "Dari My Products"** (`/channels/publish/analyze`, `persistJolt:true`): mode itu
APM **+ cascade LLM** dan **persist** — bisa eskalasi ke agent. Mode "Paste JSON" tidak.

## 2. Yang diminta (2 perubahan kecil)

### 2a. Beri label yang jujur pada mode "Paste JSON"

Tampilkan badge/subjudul di panel hasil mode ini, mis.:

> **Heuristic Matcher Inspector** — APM murni (tanpa AI). Deterministik, tidak menulis ke JOLT produksi.
> Untuk mendiagnosis matcher + KB, **bukan** mapping siap-pakai.

Pisahkan visual dari surface AI/produksi (mode "Dari My Products", Generate Console, Recommendations) agar
tak dikira "jawaban".

### 2b. Tampilkan kolom/tooltip **"Why"** per mapping (backend sudah mengirimnya)

Backend kini menambahkan field **`reasoning`** di tiap `fieldMappings[]` — string yang menjelaskan **kenapa**
match terjadi, termasuk semanticType yang mendorongnya. Contoh nilai nyata:

```jsonc
{
  "sourcePath": "variants[0].price",
  "targetPath": "package_weight.value",
  "matchStrategy": "ALIAS_MAPPING",
  "confidence": 95.0,
  "sourceSemanticType": "PRICE",
  "targetSemanticType": "PRICE",
  "reasoning": "Common aliases: value (semanticType=PRICE)"   // ← BARU
}
```

Render `reasoning` sebagai kolom "Why" (atau tooltip pada baris). Ini mengubah mapping-salah menjadi
**perbaikan-KB yang actionable**: developer langsung melihat *"oh, `value` di-type PRICE di KB — itu
alias generik yang salah, perbaiki `field_semantic_knowledge`."*

## 3. Kontrak field (BE → FE)

`fieldMappings[]` (di `AdaptivePatternMatchingResponse` dan `adaptiveMapping` pada publish-analyze):

| Field | Tipe | Catatan |
|---|---|---|
| `sourcePath` / `targetPath` | string | path lengkap |
| `sourceFieldName` / `targetFieldName` | string | nama leaf |
| `matchStrategy` | string | `CHANNEL_SPECIFIC`/`SEMANTIC_KNOWLEDGE`/`ALIAS_MAPPING`/`PATTERN_MAPPING`/`KEYWORD_SIMILARITY` |
| `confidence` | number | 0–100 (kemiripan nama, **bukan** kebenaran) |
| `sourceSemanticType` / `targetSemanticType` | string? | tipe semantik (bisa null bila FieldInfo tak ter-set) |
| **`reasoning`** | string? | **BARU** — "why" per match; memuat semanticType penggerak |

Tambahkan `reasoning?: string` ke interface `FieldMapping`
(`src/modules/ecommerce-product-v2/types/channel-mapping.ts`).

## 4. Non-goals / catatan

- **Jangan hilangkan** mode ini — ia alat inspeksi matcher/KB termurah & teraman. Cukup diberi label + "why".
- Mode ini **tidak** memberi makan RAG agent (persist nol). Ia lensa KE ATAS KB, bukan sumber data KB.
- Untuk mapping yang benar-benar akurat (channel struktural seperti TikTok), gunakan jalur AI: mode
  "Dari My Products" (APM+cascade) atau Generate Console (agent) → Recommendations Review.
