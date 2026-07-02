# Score Accuracy — Analisis Mendalam & Kritik

**Tanggal**: 2026-06-29  
**Status**: Review kritis terhadap `SCORE-ACCURACY-ANALYSIS.md`  
**Kesimpulan**: Analisis sebelumnya benar mengidentifikasi masalah, tapi solusi yang diusulkan **masih memiliki cacat fundamental** dari perspektif statistik dan sistem ML.

---

## 1. Cacat Analisis Sebelumnya

### Cacat #1 — Haircut Angka Arbitrari Tanpa Dasar Statistik

Analisis sebelumnya mengusulkan:
```java
if (uses == 0)  return base * 0.65;
if (uses < 5)   return base * 0.80;
if (uses < 20)  return base * 0.90;
```

**Masalah**: Angka 0.65, 0.80, 0.90 ini berasal dari mana? Tidak ada dasar matematis. Ini hanya memindahkan masalah dari "developer arbitrary number" ke "saya arbitrary multiplier." Dua sistem yang sama-sama tidak bisa dipertanggungjawabkan secara statistik.

---

### Cacat #2 — Weighted Average Punya Kelemahan Fatal

`calculateOverallConfidence()` menggunakan weighted average:

```java
// weight: IDENTIFIER=1.5, NAME=1.4, PRICE=1.3, others=1.0
totalWeightedConfidence += match.getConfidence() * fieldWeight;
```

**Skenario berbahaya**:
```
Mapping hasil:
  sku    → wrong.path.sku     [conf=99, weight=1.5] ← CRITICAL, SALAH PATH
  price  → wrong.path.price   [conf=95, weight=1.3] ← CRITICAL, SALAH
  name   → product.title      [conf=90, weight=1.4] ← benar
  color  → option1            [conf=88, weight=1.0] ← benar
  size   → option2            [conf=85, weight=1.0] ← benar
  weight → grams              [conf=82, weight=1.0] ← benar

overallConfidence = (99×1.5 + 95×1.3 + 90×1.4 + 88 + 85 + 82) / (1.5+1.3+1.4+1+1+1)
                 = 88.6%  ← TINGGI
```

Hasilnya: confidence 88.6%, cukup untuk masuk zona "RECOMMEND" — padahal `sku` dan `price` salah path. Publish akan **pasti gagal** tapi sistem menunjukkan confidence tinggi.

**Root cause**: weighted average tidak bisa mengekspresikan "field ini wajib benar, kalau salah semuanya gagal."

---

### Cacat #3 — Conflating Confidence dengan Accuracy

`confidence` dalam sistem ini berarti **"seberapa yakin algoritma matching"** bukan **"seberapa akurat mapping ini menghasilkan JOLT yang diterima channel."**

Ini adalah dua hal berbeda:

```
Algorithm confidence: "keyword 'price' cocok dengan 'price' → 95%"
    ↑ Ini yang ada sekarang

Channel accuracy: "apakah path product.variants.*.price diterima Shopify?"
    ↑ Ini yang sebenarnya penting
```

Sebuah sistem bisa sangat "confident" (95%) sekaligus sangat "inaccurate" (0%) jika field-nya salah path.

---

### Cacat #4 — successRate Tidak Bisa Diatribusikan ke Field

Saat publish FAILED, kita tahu:
```java
ws.getSyncStatus() == "FAILED"
ws.getFailureReason() == "Sync workflow failed"
```

Tapi kita **tidak tahu field mana yang menyebabkan gagal**. Semua field mapping dihukum rata meskipun hanya satu yang salah. Ini seperti menilai seluruh tim karena kesalahan satu orang.

Contoh error Shopify yang lebih informatif (yang tidak kita parse):
```json
{
  "errors": {
    "variants.price": ["can't be blank"],
    "title": ["is too long (maximum 255 characters)"]
  }
}
```

Dengan ini, kita bisa menurunkan successRate **hanya** untuk mapping yang menyebabkan error, bukan semua mapping.

---

### Cacat #5 — Tidak Ada Mekanisme Kalibrasi

Confidence hanya berguna jika **terkalibrasi** — artinya:
- Prediction confidence=80% harus terbukti benar 80% dari waktu
- Prediction confidence=90% harus benar 90% dari waktu

Sistem saat ini **tidak pernah mengukur** apakah confidence yang dilaporkan akurat. Bisa saja confidence=90% hanya benar 60% kali — tapi kita tidak pernah tahu.

---

### Cacat #6 — Data Stale Tidak Didepresiasi

Mapping `weight → grams` yang berhasil 200 kali tahun lalu mungkin tidak valid hari ini jika channel mengubah schema-nya. Tapi successRate-nya tetap 100% dalam DB.

---

## 2. Pendekatan yang Lebih Solid

### Solusi #1 — Beta Distribution (Thompson Sampling) untuk successRate

Ganti arbitrary haircut dengan distribusi probabilistik yang memiliki dasar statistik kuat:

```
Setiap ChannelFieldMapping memiliki:
  - successes: jumlah publish berhasil menggunakan mapping ini
  - failures:  jumlah publish gagal yang diatribusikan ke mapping ini

Effective confidence = Beta(successes + 1, failures + 1).mean()
                     = (successes + 1) / (successes + failures + 2)

Bukan: base * 0.65
Tapi:  (0 + 1) / (0 + 0 + 2) = 0.50  ← mapping baru = 50%, bukan 99%
```

Contoh evolusi kepercayaan:

| State | successes | failures | Effective Confidence | Interpretasi |
|---|---|---|---|---|
| Baru dibuat | 0 | 0 | **50.0%** | Belum ada bukti |
| 3 berhasil | 3 | 0 | **80.0%** | Sedikit bukti |
| 10 berhasil | 10 | 0 | **91.7%** | Cukup dipercaya |
| 50 berhasil | 50 | 0 | **98.1%** | Sangat dipercaya |
| 50 berhasil, 5 gagal | 50 | 5 | **89.5%** | Degraded karena ada failure |
| 1 berhasil, 10 gagal | 1 | 10 | **15.4%** | Mapping jelek |

Ini **tidak memerlukan angka arbitrari**. Formula Beta distribution adalah standar industri untuk estimasi probabilitas dari sampel kecil.

**Yang perlu ditambah di `ChannelFieldMapping`**:
```java
private Long successCount;   // bukan usageCount general
private Long failureCount;   // baru

public double getEffectiveConfidence() {
    long s = successCount != null ? successCount : 0;
    long f = failureCount != null ? failureCount : 0;
    return (s + 1.0) / (s + f + 2.0) * 100.0;  // scale ke 0-100
}
```

---

### Solusi #2 — Critical Fields sebagai Hard Constraint, Bukan Weighted Input

Ganti weighted average dengan arsitektur dua lapisan:

```
LAPISAN 1: Hard Constraints (field wajib)
  - Jika field required (sku, price, title) punya confidence < 70%:
    → overallConfidence = confidence TERENDAH dari required fields
    → Tidak peduli berapa bagusnya optional fields

LAPISAN 2: Soft Score (field opsional)
  - Weighted average dari non-required fields
  - Hanya berkontribusi jika semua required fields sudah terpenuhi

Formula:
  required_min = min(confidence of required fields)
  if required_min < 70:
      return required_min  ← bottlenecked oleh field terlemah
  else:
      return 0.6 * required_min + 0.4 * weighted_avg(optional fields)
```

**Kenapa ini lebih baik**: JOLT tidak bisa sukses jika field required salah path, tidak peduli seberapa bagus field lain. Formula ini mencerminkan realitas itu.

---

### Solusi #3 — Ganti "Input Angka" dengan "Verifikasi Boolean"

Masalah terdalam: meminta developer memasukkan angka `confidence: 85.0` adalah meminta mereka jadi probability calibration expert — yang mereka bukan.

**Pendekatan lebih baik**:

```
SEBELUM (problematik):
  POST /admin/channel-field-mappings
  { "confidence": 92.5 }   ← Developer tebak angka

SESUDAH (lebih baik):
  POST /admin/channel-field-mappings
  {
    "verificationTier": "VERIFIED_PRODUCTION",  ← pilih tier, bukan angka
    "verifiedBy": "developer-email@company.com",
    "verifiedAt": "2026-06-29T10:00:00"
  }
```

Tier mapping ke confidence awal:

| Tier | Confidence Awal | Artinya |
|---|---|---|
| `UNVERIFIED` | 50% | Baru dibuat, belum diuji |
| `MANUALLY_TESTED` | 70% | Developer uji di dev/staging |
| `VERIFIED_PRODUCTION` | 85% | Dikonfirmasi dari live publish |
| `CERTIFIED_HIGH_VOLUME` | 95% | >100 publish sukses |

Confidence kemudian **naik otomatis** berdasarkan Beta distribution dari actual publish outcomes. Developer tidak pernah memasukkan angka — hanya menentukan tier.

---

### Solusi #4 — Field-Level Error Attribution dari Channel Response

Aktifkan parsing error response dari channel API untuk menentukan **field mana yang menyebabkan kegagalan**:

```java
// ChannelPublishService — setelah FAILED:
private Map<String, Integer> parseFieldErrors(String failureReason) {
    // Shopify error format: "variants.price: can't be blank"
    // Amazon error format: "BulletPoint1: String too long"
    // TikTok error format: "category_id: required field missing"
    
    // Parse → Map<fieldPath, errorCount>
    // Return ke LearningFeedbackService untuk update failure count
    // hanya pada mapping yang field-nya terdapat dalam error
}
```

Ini mengubah successRate dari "level produk" ke "level field" — jauh lebih akurat.

---

### Solusi #5 — Time Decay untuk Data Stale

Channel API berubah. Data lama harus didepresiasi:

```java
public double getEffectiveConfidence() {
    double beta = betaDistributionMean();  // dari Solusi #1
    
    // Decay factor: makin lama tidak dipakai, makin rendah kepercayaan
    long daysSinceLastUse = lastUsedAt != null
        ? ChronoUnit.DAYS.between(lastUsedAt, LocalDate.now())
        : 365;
    
    // Half-life 180 hari: confidence turun 50% jika tidak dipakai 6 bulan
    double decayFactor = Math.pow(0.5, daysSinceLastUse / 180.0);
    double decayed = 50.0 + (beta - 50.0) * decayFactor;
    
    return Math.max(decayed, 30.0);  // floor 30% — jangan sampai nol
}
```

Contoh:
- Mapping tidak dipakai 6 bulan: confidence = 50 + (90-50) × 0.5 = **70%** (dari 90%)
- Mapping tidak dipakai 1 tahun: confidence = 50 + (90-50) × 0.25 = **60%** (dari 90%)

---

### Solusi #6 — Calibration Measurement

Tambah endpoint untuk mengukur apakah confidence terkalibrasi:

```
GET /api/v1/admin/ai/calibration/report

Response:
{
  "buckets": [
    { "range": "50-60%", "predictions": 45, "actualAccuracy": 0.53 },  ← OK
    { "range": "70-80%", "predictions": 123, "actualAccuracy": 0.61 }, ← OVERCONFIDENT
    { "range": "80-90%", "predictions": 89, "actualAccuracy": 0.84 },  ← OK
    { "range": "90-99%", "predictions": 234, "actualAccuracy": 0.71 }  ← SANGAT OVERCONFIDENT
  ],
  "calibrationError": 0.12,  ← average jarak antara predicted dan actual (lower = better)
  "recommendation": "TIER_1_CONFIDENCE_IS_OVERFIT"
}
```

Calibration error < 0.05 = well-calibrated. Error saat ini kemungkinan > 0.15 karena default 99.0.

---

## 3. Perbandingan Langsung: Lama vs Baru

| Aspek | Analisis Sebelumnya | Pendekatan Baru |
|---|---|---|
| Confidence baru | `base × 0.65` (arbitrari) | `Beta(1,1).mean() = 50%` (principled) |
| Confidence terverifikasi | `base × 0.90` (arbitrari) | `Beta(n_s+1, n_f+1).mean()` (data-driven) |
| Field wajib | Masih di weighted avg | Hard constraint — bottleneck entire score |
| Developer input | Masih bisa input angka | Pilih tier saja, angka dihitung sistem |
| Error attribution | Level produk saja | Level field (parse channel error response) |
| Data stale | Tidak dibahas | Time decay half-life 180 hari |
| Calibration | Tidak dibahas | Endpoint measurement aktif |

---

## 4. Prioritas Implementasi

### Immediate (block production deployment)

**P0 — Hard constraint untuk required fields**
```java
// calculateOverallConfidence() — ubah formula:
double requiredMin = matchesToUse.stream()
    .filter(m -> isRequiredField(m.getSourceField(), channelId))
    .mapToDouble(MatchResult::getConfidence)
    .min().orElse(100.0);

if (requiredMin < 70.0) {
    return requiredMin;  // bottlenecked by weakest required field
}
// else: proceed with weighted average of all fields
```

Ini bisa diimplementasi dalam **1 jam** dan langsung mencegah false high confidence.

**P0 — Default confidence baru = 50% (bukan 99%)**
```java
// ChannelFieldMappingAdminController.buildFromRequest():
.confidence(req.getConfidence() != null ? req.getConfidence() : 50.0) // WAS 99.0
.successRate(50.0)  // WAS 100.0
.successCount(0L)   // new field
.failureCount(0L)   // new field
```

### Short-term (1-2 minggu)

**P1 — Beta distribution untuk getEffectiveConfidence()**
- Tambah `successCount` dan `failureCount` ke `ChannelFieldMapping`
- Ganti `getConfidence()` di Tier 1 matching dengan `getEffectiveConfidence()`
- Parse channel error response untuk field-level attribution

**P1 — Verifikasi Tier, bukan angka**
- Update admin UI: dropdown tier (UNVERIFIED/TESTED/VERIFIED/CERTIFIED)
- Developer tidak bisa input angka confidence langsung

### Medium-term (Phase 5)

**P2 — Time decay**
**P2 — Calibration measurement endpoint**
**P2 — Transfer learning antar channel** (mapping sukses di Shopify informing Amazon prior)

---

## 5. Kesimpulan Jujur

### Analisis sebelumnya (`SCORE-ACCURACY-ANALYSIS.md`):
✅ Benar mengidentifikasi masalah utama (developer input subjektif, successRate belum aktif)  
❌ Solusi haircut arbitrari tidak lebih baik dari masalah yang dipecahkan  
❌ Tidak menyentuh kelemahan fundamental weighted average untuk required fields  
❌ Tidak ada pendekatan statistik yang principled  
❌ Tidak membahas kalibrasi, staleness, field-level attribution  

### Pendekatan baru ini:
✅ Statistically principled (Beta distribution — standar industri)  
✅ Mengatasi kelemahan fundamental weighted average  
✅ Developer tidak perlu expertise statistik (hanya pilih tier)  
✅ Calibration bisa diukur dan diperbaiki  
✅ Scalable: makin banyak data, makin akurat otomatis  

**Yang paling penting untuk langsung diimplementasi**: P0 hard constraint untuk required fields dan ganti default 99.0 → 50.0. Dua perubahan ini bisa dilakukan dalam beberapa jam dan langsung mencegah false high confidence yang paling berbahaya di production.
