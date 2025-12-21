# Quick Fix Guide - Backend fieldBoosts Issue

## 🔴 Critical Issue Found

**Error**: Pattern matching fails with NullPointerException
```
"message": "Cannot invoke \"java.util.List.stream()\" because the return value
of \"ChannelConfiguration.getFieldBoosts()\" is null"
```

**Root Cause**: Backend database has channels, but `fieldBoosts` field is `null`

---

## ✅ Solution: Reseed Database with v2 File

### Step 1: Verify Current State

```bash
# Check channels exist
curl http://localhost:8888/labamap/api/v1/channels

# You'll see: "fieldBoosts": null  ← This is the problem
```

### Step 2: Reseed Database

**⚠️ IMPORTANT**: The seed file uses `labamap_omnichannel` but your API uses `labamap`

#### Option A: Modify Seed File (Recommended)

Edit `seed-all-v2-multitenant.js` line 16:
```javascript
// Change this:
use labamap_omnichannel;

// To this:
use labamap;
```

Then run:
```bash
mongosh < seed-all-v2-multitenant.js
```

#### Option B: Use Correct Database Name

If backend actually uses `labamap_omnichannel` internally:
```bash
# Run as-is
mongosh < seed-all-v2-multitenant.js
```

### Step 3: Verify Fix

```bash
# Should now show fieldBoosts array (not null)
curl http://localhost:8888/labamap/api/v1/channels
```

**Expected Result**:
```json
{
  "channelId": "shopify",
  "fieldBoosts": [  ← Not null anymore!
    {
      "sourcePattern": "brand",
      "targetPattern": "vendor",
      "confidenceBoost": 10.0
    }
  ]
}
```

### Step 4: Test Pattern Matching

```bash
curl -X POST http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sourceSchema": {"product_name": "Gaming Mouse", "base_price": 59.99},
    "targetSchema": {"title": "", "price": 0},
    "channelId": "shopify",
    "confidenceThreshold": 70,
    "organizationId": "org_demo"
  }'
```

**Expected Result**:
```json
{
  "fieldMappings": [
    {
      "sourcePath": "product_name",
      "targetPath": "title",
      "confidence": 95.0,
      "matchStrategy": "KNOWLEDGE_BASED"
    }
  ],
  "overallConfidence": 95.0,
  "status": "SUCCESS"  ← Not ERROR anymore!
}
```

---

## 🎯 What This Fixes

| Before (Broken) | After (Fixed) |
|-----------------|---------------|
| `fieldBoosts: null` | `fieldBoosts: [...]` array with data |
| Pattern matching fails with NullPointerException | Pattern matching works |
| Frontend channel dropdown works | Frontend channel dropdown works |
| Pattern analysis **FAILS** | Pattern analysis **WORKS** |

---

## 🚨 If You Can't Reseed

### Alternative: Add Null Safety in Backend Code

If you can't reseed immediately, add null safety:

```java
// In AdaptivePatternMatchingService.java or similar
List<FieldBoost> boosts = channelConfig.getFieldBoosts();
if (boosts != null) {
    boosts.stream()
        .filter(...)
        .forEach(...);
} else {
    // Log warning and continue with default matching
    log.warn("Channel {} has no fieldBoosts defined", channelId);
}
```

This is a **temporary workaround**. You should still reseed to get proper boost data.

---

## ✅ Current Status

### What's Working ✅
- GET /channels endpoint (returns 4 channels)
- Multi-tenant fields (`organizationId`, `isSystemDefault`)
- Frontend channel dropdown displays correctly
- Channel selection in UI

### What's Broken ❌
- Pattern matching analysis (NullPointerException)
- Confidence scoring (needs fieldBoosts)
- Field mapping intelligence (relies on boost data)

### After Reseeding ✅
- Everything will work
- Pattern matching will return high-confidence mappings
- Channel-specific intelligence will boost correct fields

---

## 📞 Questions?

**Q: Which database name should I use?**
A: Check your `application.properties` or `application.yml`:
```yaml
spring.data.mongodb.database=labamap  # or labamap_omnichannel?
```
Use whichever name is configured there.

**Q: Will reseeding delete existing data?**
A: The seed script uses `deleteMany({})` first, so YES it will clear all data. If you have production data, back it up first:
```bash
mongodump --db labamap --out backup/
```

**Q: Can I update just fieldBoosts without reseeding?**
A: Yes, but manual updates are tedious. Better to reseed.

---

**Priority**: 🔴 **CRITICAL** - Pattern matching is completely broken without this fix
**ETA**: 5 minutes to reseed database
**Risk**: Low (only affects channel configurations, not product data)
