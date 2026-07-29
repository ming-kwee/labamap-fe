# Rekomendasi Perbaikan Backend: `PublishTraceResponse.gate`

**Tanggal**: 2026-07-29
**Sifat perubahan**: **Aditif** — tidak mengubah field lama, tidak mengubah endpoint/body.
**Status frontend**: Halaman side-by-side **JOLT | DSL** (`/products/{id}/publish/trace`) sudah ada. Stage
**"gate"** dalam pipeline (`merge → jolt → gate → DSL` menurut model mental user teknis) saat ini **hanya
bisa ditebak dari `warnings[]`** — tak terstruktur. FE tak bisa menampilkan "field apa yang diblok gate & kenapa".

Referensi:
- `docs/product/07-publishing-engine/01-guides/14-publish-trace-inspector.md` (guide trace)
- `docs/JOLT-PUBLISH-CORRECTNESS-DEEP-DIVE.md` §§ pipeline (baris 43–59), semantic validator (§9)
- FE types: `src/modules/ecommerce-product-v2/types/publish-trace.ts`

---

## 1. Ringkasan Masalah

Pipeline publish (`ChannelPublishService.publishProduct`) punya **dua gate** yang, di publish nyata,
**memblokir** sebelum payload sampai ke channel:

| Gate | Di mana (pipeline) | Yang dicek | Aksi saat gagal (publish nyata) |
|---|---|---|---|
| **Preflight** (`runPreflightGate`) | Langkah 5, **setelah merge**, sebelum `executePublish` | Field wajib yang **merchant-fixable** hilang | Blokir — minta merchant lengkapi |
| **Semantic** (`JoltSemanticValidator.validate`) | Dalam `processPublish`, **setelah resolve spec, sebelum transform** | Setiap `sourceField → targetPath` leaf di shift spec yang **confident mismatch** (dua tipe semantik KNOWN yang berbeda) | Refuse-to-publish |

Trace (`POST /channels/publish/trace`) sekarang mengembalikan snapshot `afterMerge`, `afterJolt`,
`postProcessing[]`, `afterPostProcessing`, `channelAttributes[]` — tapi **tidak** mengekspos hasil kedua gate
secara terstruktur. Jadi kalau publish nyata bakal diblok gate, user diagnostik tidak melihat **field mana**
dan **kenapa** — hanya (mungkin) satu baris di `warnings`.

## 2. Yang Diminta

Tambahkan field **`gate`** pada `PublishTraceResponse`, diisi dengan menjalankan **kedua gate** dalam mode
**capture non-blocking** (lihat §5 — ini prinsip kuncinya). Semua field lama tetap; klien lama tak terpengaruh
(`@JsonInclude(NON_NULL)` sudah dipakai konsisten, jadi `gate` boleh absen).

## 3. DTO Java yang Diusulkan

`publishing/model/response/PublishTraceResponse.java` — tambah:

```java
private PublishTraceGate gate;   // null jika tak dijalankan (mis. trace warnings-only)
```

```java
// publishing/model/response/PublishTraceGate.java  (baru)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublishTraceGate {
    /** true = tak ada isu MEMBLOKIR (preflight & semantic dua-duanya lolos / fail-open). */
    private boolean passed;
    /** Di PUBLISH NYATA, apakah pipeline berhenti sebelum sync karena gate ini? */
    private boolean wouldBlockPublish;
    private PreflightGateResult preflight;
    private SemanticGateResult semantic;
}
```

```java
// PreflightGateResult
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PreflightGateResult {
    private boolean ran;                       // false jika gate di-skip
    private boolean passed;
    private List<MissingField> missingFields;  // kosong = lolos

    // MissingField
    //   String field;        // nama field master/merged yang hilang
    //   String label;        // (opsional) label ramah untuk merchant
    //   String reason;       // "required by channel", "empty", dst
    //   String source;       // (opsional) dari mana requirement ini ("apiSchema", "categoryAttributes")
}
```

```java
// SemanticGateResult
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SemanticGateResult {
    private boolean ran;                          // false = FAIL-OPEN (cache field_semantic_knowledge kosong)
    private boolean passed;
    private Integer knowledgeTokensLoaded;        // (opsional) buat menjelaskan fail-open
    private List<SemanticViolation> violations;   // kosong = lolos

    // SemanticViolation  (satu confident mismatch)
    //   String sourceField;  // mis. "name"
    //   String targetPath;   // mis. "options.name"
    //   String sourceType;   // semanticType sumber (KNOWN)
    //   String targetType;   // semanticType target (KNOWN, berbeda)
    //   String message;      // ringkasan human-readable
}
```

## 4. Di Mana Mengisinya (`buildTrace`)

`ChannelPublishService.buildTrace` sudah mereplikasi pipeline dengan **service produksi yang sama**. Sisipkan
kedua gate pada titik yang **sama** dengan publish nyata supaya faithful:

```
buildTrace:
   afterMerge      = loadAndMergeChannelData(...)     // sudah ada
   ── PREFLIGHT ──  gate.preflight = runPreflightGate(afterMerge, ...) [capture]   ← jalankan di sini
   resolvedSpec    = findJoltSpecWithFallback(...) / pick spec         // sudah ada
   ── SEMANTIC ──   gate.semantic  = JoltSemanticValidator.collect(resolvedSpec)   ← jalankan di sini
   afterJolt       = transform(afterMerge, resolvedSpec)               // sudah ada
   … post-processing … channelAttributes …                            // sudah ada
   gate.wouldBlockPublish = !preflight.passed || !semantic.passed
   gate.passed            = !gate.wouldBlockPublish
```

- **Preflight** dievaluasi atas `afterMerge` (input yang sama dengan publish nyata).
- **Semantic** dievaluasi atas **spec yang menang** (`resolvedSpec`), sebelum transform — sama dengan
  enforcement produksi di `ChannelPublishService`.

## 5. Prinsip Kunci: **Non-Blocking di Trace**

Di publish nyata gate **melempar / menghentikan** pipeline. Di trace **jangan** — **catat hasilnya lalu
LANJUTKAN** pipeline, supaya user tetap melihat downstream (`afterJolt`, DSL, `channelAttributes`) **walaupun**
gate akan memblokir. Justru saat gate akan memblokir itulah user paling butuh melihat "kalau tetap dipublish,
bentuknya jadi apa".

Implementasi disarankan: sediakan varian **collect** (mengembalikan objek hasil, tidak melempar) untuk tiap
gate, lalu jalur produksi tinggal `throw`/refuse berdasarkan hasil yang sama:

```java
// contoh pola
PreflightGateResult r = preflightGate.collect(mergedData, ctx);   // tak melempar
if (!dryRun && !r.passed()) throw new PreflightBlockedException(r); // produksi tetap blokir

SemanticGateResult s = joltSemanticValidator.collect(resolvedSpec); // tak melempar
if (!dryRun && !s.passed()) throw new SemanticScrambleException(s);  // produksi tetap refuse
```

Dengan pola ini, **produksi dan trace memakai evaluasi gate yang identik** — trace tak bisa diam-diam
menyimpang (prinsip fidelity yang sama seperti bagian trace lainnya).

## 6. Kontrak Frontend (sudah disiapkan)

FE akan menambah tipe berikut di `publish-trace.ts` dan merender stage **Gate** di antara JOLT dan DSL pada
halaman side-by-side. Bentuk yang FE harapkan:

```ts
export interface PublishTraceGate {
  passed?: boolean;
  wouldBlockPublish?: boolean;
  preflight?: {
    ran?: boolean;
    passed?: boolean;
    missingFields?: { field: string; label?: string; reason?: string; source?: string }[];
  };
  semantic?: {
    ran?: boolean;                 // false → fail-open (cache kosong), tampilkan sebagai "tidak divalidasi"
    passed?: boolean;
    knowledgeTokensLoaded?: number;
    violations?: { sourceField: string; targetPath: string; sourceType?: string; targetType?: string; message?: string }[];
  };
}
// PublishTraceResponse.gate?: PublishTraceGate
```

FE akan menampilkan:
- `wouldBlockPublish=true` → banner merah **"Publish nyata akan diblok gate"** + daftar penyebab.
- `preflight.missingFields[]` → chip merah per field wajib yang hilang.
- `semantic.violations[]` → baris `sourceField → targetPath` dengan `sourceType ≠ targetType`.
- `semantic.ran=false` → badge abu **"semantic gate fail-open (knowledge base kosong)"**.

## 7. Cara Verifikasi

1. **Produk lengkap, spec sehat** → `gate.passed=true`, `wouldBlockPublish=false`, `preflight.missingFields=[]`,
   `semantic.violations=[]`.
2. **Kosongkan field wajib** (mis. `name`/`price`) di `masterProductData` → `preflight.passed=false`,
   `missingFields` memuat field itu, tapi response **tetap** berisi `afterJolt`/`channelAttributes`
   (bukti non-blocking).
3. **Kirim `request.joltSpec` yang scramble** (mis. shift `name → price`, dua tipe KNOWN berbeda) →
   `semantic.passed=false`, satu `violation` `{sourceField:"name", targetPath:"price", sourceType:"title",
   targetType:"price"}`.
4. **Matikan/kosongkan `field_semantic_knowledge`** → `semantic.ran=false`, `passed=true` (fail-open),
   tak ada violation.
5. Response tetap **200 OK** untuk semua kasus di atas (isu ada di CONTENT, bukan HTTP status — konsisten
   dengan kontrak trace yang sudah ada).

## 8. Catatan & Batasan (selaras deep-dive §9)

- **Fail-open pada cache kosong.** Jika `field_semantic_knowledge` gagal load → semua UNKNOWN → tak ada yang
  diblok. Set `semantic.ran=false` supaya FE jujur menampilkannya sebagai "tidak divalidasi", bukan "aman".
- **UNKNOWN tak memicu.** Field di luar knowledge base (size, color, custom) tak divalidasi → nol false
  positive. FE tak akan mengklaim field itu "aman", hanya "tak dinilai".
- **Lists / multi-target fan-out out of scope** untuk semantic (sama seperti produksi).
- **Reuse service produksi — jangan re-implement.** Sama prinsipnya dengan snapshot trace lainnya; kalau gate
  di-fork, trace bisa berbohong.

## 9. File yang Kemungkinan Tersentuh (backend)

| File | Perubahan |
|---|---|
| `publishing/model/response/PublishTraceResponse.java` | tambah `gate` |
| `publishing/model/response/PublishTraceGate.java` (+ nested result DTO) | **baru** |
| `publishing/service/ChannelPublishService.java` | `buildTrace`: jalankan preflight + semantic (collect, non-blocking); produksi pakai hasil yang sama untuk blokir |
| `adaptivepattern/service/JoltSemanticValidator.java` | varian `collect(spec)` yang mengembalikan hasil tanpa melempar |
| (preflight gate service) | varian `collect(mergedData, ctx)` non-blocking |

## 10. Dampak jika Tidak Difix

Halaman side-by-side JOLT | DSL sudah menerangkan **merge → jolt → DSL** dengan jelas, tapi stage **gate**
tetap "kotak hitam" — user teknis tak bisa tahu kenapa publish nyata diblok tanpa menjalankan publish live
(persis masalah yang inspector ini diciptakan untuk hilangkan). Menambahkan `gate` menutup satu-satunya stage
pipeline yang masih opak.
