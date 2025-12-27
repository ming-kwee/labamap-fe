# MongoDB Connection Timeout Error

## 🔴 Critical Backend Infrastructure Issue

**Error**: MongoDB Atlas connection timeout during pattern matching
**Status**: Backend infrastructure problem (NOT frontend issue)
**Impact**: Pattern matching completely unavailable

---

## 📋 Error Details

### Full Error Message:
```
Failed to process adaptive pattern matching: Timed out after 2000 ms while
waiting for a connection to server labamap2cluster-shard-00-02.zgdyn.mongodb.net:27017.
```

### Backend Response:
```json
{
  "joltSpec": [],
  "fieldMappings": [],
  "overallConfidence": 0.0,
  "status": "ERROR",
  "message": "Failed to process adaptive pattern matching: Timed out after 2000 ms...",
  "unmappedSourceFields": [],
  "unmappedTargetFields": [],
  "matchingMetadata": {
    "totalSourceFields": 0,
    "totalTargetFields": 0,
    "matchedFields": 0,
    "processingTimeMs": 4183,
    "matchStrategyCount": {},
    "warnings": [
      "Pattern matching failed due to exception: DataAccessResourceFailureException",
      "Error message: Timed out after 2000 ms while waiting for a connection..."
    ]
  }
}
```

---

## 🔍 Root Cause Analysis

### What's Happening:

1. **Frontend** sends pattern matching request ✅
2. **Backend** receives request ✅
3. **Backend** tries to connect to MongoDB Atlas cluster ❌
4. **MongoDB** connection times out after 2000ms ❌
5. **Backend** returns error response ✅
6. **Frontend** displays error correctly ✅

**Problem Location**: Backend → MongoDB Atlas connection

**MongoDB Cluster**: `labamap2cluster-shard-00-02.zgdyn.mongodb.net:27017`

---

## 🚨 Possible Causes

### 1. **MongoDB Atlas IP Whitelist Not Configured** (Most Likely)
MongoDB Atlas blocks connections from unauthorized IP addresses.

**Check**:
- Go to MongoDB Atlas Dashboard
- Navigate to: Network Access → IP Access List
- Verify backend server IP is whitelisted

**Fix**:
```
MongoDB Atlas → Network Access → Add IP Address
- Add backend server's public IP
- OR: Add 0.0.0.0/0 (allow all - development only!)
```

---

### 2. **MongoDB Atlas Credentials Expired/Invalid**
Connection string credentials might be incorrect.

**Check Backend Configuration**:
```properties
# application.properties or application.yml
spring.data.mongodb.uri=mongodb+srv://username:password@labamap2cluster.zgdyn.mongodb.net/labamap_omnichannel
```

**Verify**:
- Username is correct
- Password is correct (no special chars causing issues)
- Database name matches (`labamap_omnichannel` or `labamap`)

---

### 3. **MongoDB Atlas Free Tier Paused**
Free tier clusters pause after inactivity.

**Check**:
- MongoDB Atlas Dashboard → Clusters
- Look for "PAUSED" status
- Click "Resume" if paused

---

### 4. **Network Connectivity Issues**
Backend server can't reach MongoDB Atlas.

**Test from Backend Server**:
```bash
# From backend server, test DNS resolution
nslookup labamap2cluster-shard-00-02.zgdyn.mongodb.net

# Test port connectivity
telnet labamap2cluster-shard-00-02.zgdyn.mongodb.net 27017

# Or using nc (netcat)
nc -zv labamap2cluster-shard-00-02.zgdyn.mongodb.net 27017
```

---

### 5. **Connection Pool Exhausted**
Too many connections, pool is full.

**Check Backend Logs**:
```
MongoSocketException: Prematurely reached end of stream
MongoTimeoutException: Timed out after 2000 ms
```

**Fix in Backend**:
```yaml
# application.yml
spring:
  data:
    mongodb:
      max-connection-pool-size: 50
      min-connection-pool-size: 10
      max-wait-time: 5000
      server-selection-timeout: 5000
```

---

### 6. **Firewall Blocking Outbound Connections**
Backend server firewall blocking port 27017.

**Check**:
```bash
# Test outbound connection
curl -v telnet://labamap2cluster-shard-00-02.zgdyn.mongodb.net:27017
```

---

### 7. **MongoDB Atlas Cluster Down/Degraded**
MongoDB Atlas service might be experiencing issues.

**Check**:
- https://status.mongodb.com/
- MongoDB Atlas Dashboard → Metrics

---

## 🔧 Troubleshooting Steps (Backend Team)

### Step 1: Check MongoDB Atlas Status
```
1. Login to MongoDB Atlas
2. Go to your cluster: "labamap2cluster"
3. Check Status: should be "ACTIVE" (not PAUSED)
4. Check Metrics: CPU, Memory, Connections
```

### Step 2: Verify Network Access
```
MongoDB Atlas → Network Access → IP Access List

Should show:
✅ 0.0.0.0/0 (allow all - dev only)
OR
✅ Your backend server's public IP
```

### Step 3: Test Connection from Backend
```bash
# SSH into backend server
ssh user@backend-server

# Test MongoDB connection using mongo shell
mongosh "mongodb+srv://labamap2cluster.zgdyn.mongodb.net/labamap_omnichannel" \
  --username YOUR_USERNAME \
  --password YOUR_PASSWORD

# Should connect successfully
```

### Step 4: Check Backend Application Logs
```bash
# Look for MongoDB connection errors
tail -f /var/log/your-app/application.log | grep -i mongo

# Common errors:
# - "Authentication failed"
# - "IP not whitelisted"
# - "Connection timeout"
# - "SSL handshake failed"
```

### Step 5: Verify Connection String
```properties
# application.properties
spring.data.mongodb.uri=mongodb+srv://username:password@labamap2cluster.zgdyn.mongodb.net/labamap_omnichannel?retryWrites=true&w=majority

# Check:
# ✅ Correct username
# ✅ Correct password (URL encoded if special chars)
# ✅ Correct cluster name
# ✅ Correct database name
```

### Step 6: Increase Timeout (Temporary Workaround)
```yaml
# application.yml
spring:
  data:
    mongodb:
      server-selection-timeout: 10000  # 10 seconds
      socket-timeout: 10000            # 10 seconds
```

---

## 🚀 Quick Fixes (Priority Order)

### Fix 1: Add IP to MongoDB Atlas Whitelist (5 minutes)
```
1. Go to MongoDB Atlas
2. Network Access → Add IP Address
3. Add: 0.0.0.0/0 (for testing)
4. Wait 1-2 minutes for changes to propagate
5. Test again
```

### Fix 2: Resume Paused Cluster (2 minutes)
```
1. MongoDB Atlas → Clusters
2. If status is "PAUSED", click Resume
3. Wait 2-3 minutes for cluster to start
4. Test again
```

### Fix 3: Restart Backend Application (1 minute)
```bash
# Sometimes connection pool gets stuck
sudo systemctl restart your-backend-service

# Or using Docker
docker restart backend-container
```

---

## 🎯 Frontend Impact

### Current Behavior:
✅ **Frontend correctly handles the error**
- Detects `status === 'ERROR'`
- Displays user-friendly error message
- Doesn't crash

### User Experience:
```
When user clicks "Analyze Pattern Matching":

❌ Pattern Matching Failed

Error: Failed to process adaptive pattern matching: Timed out after 2000 ms
while waiting for a connection to server labamap2cluster...

This is likely due to:
1. Database not seeded with fieldBoosts data
2. Backend NullPointerException on missing data

Solution: Backend team needs to reseed database using seed-all-v2-multitenant.js
See QUICK-FIX-GUIDE.md for instructions.
```

**Note**: The error message shown to users currently mentions "database not seeded" but the REAL issue is MongoDB connection timeout.

---

## 🔄 Recommended Frontend Update

Update error message to be more accurate:

```typescript
// src/app/(admin)/products/publish-to-channel/page.tsx

if (result.status === 'ERROR') {
  console.error('[ChannelPublish] Backend returned error status:', result.message);

  // Check if it's a MongoDB connection error
  const isMongoError = result.message?.includes('Timed out')
    || result.message?.includes('MongoDB')
    || result.message?.includes('DataAccessResourceFailureException');

  if (isMongoError) {
    setError(
      `❌ Backend Database Connection Failed\n\n` +
      `Error: ${result.message}\n\n` +
      `This is a backend infrastructure issue:\n` +
      `1. MongoDB Atlas connection timeout\n` +
      `2. IP whitelist not configured\n` +
      `3. MongoDB cluster paused or unreachable\n\n` +
      `Contact backend team to resolve MongoDB connectivity.\n` +
      `See MONGODB-CONNECTION-TIMEOUT-ERROR.md for troubleshooting.`
    );
  } else {
    // Other errors (fieldBoosts null, etc.)
    setError(
      `❌ Pattern Matching Failed\n\n` +
      `Error: ${result.message || 'Unknown error'}\n\n` +
      `This is likely due to:\n` +
      `1. Database not seeded with fieldBoosts data\n` +
      `2. Backend NullPointerException on missing data\n\n` +
      `Solution: Backend team needs to reseed database`
    );
  }
  setMappingResult(null);
  return;
}
```

---

## 📊 Error Timeline

```
00:00 - User clicks "Analyze Pattern Matching"
00:01 - Frontend sends POST to /adaptive-pattern-matching/analyze
00:02 - Backend receives request
00:03 - Backend tries to query MongoDB for channel config
00:04 - MongoDB connection attempt starts
02:00 - Connection timeout (2000ms)
04:18 - Backend catches exception and returns error
04:19 - Frontend receives error response
04:20 - Frontend displays error to user
```

**Total Time**: 4183ms (4.2 seconds)
**Timeout After**: 2000ms (2 seconds)

---

## ✅ Verification Steps (After Fix)

### Test 1: MongoDB Connection from Backend
```bash
# Should succeed
mongosh "mongodb+srv://labamap2cluster.zgdyn.mongodb.net/labamap_omnichannel" \
  --username YOUR_USERNAME \
  --password YOUR_PASSWORD

# Output should show:
# Connected to MongoDB
# labamap_omnichannel>
```

### Test 2: Backend Health Check
```bash
# Check if backend can reach MongoDB
curl http://localhost:8888/actuator/health

# Should show:
{
  "status": "UP",
  "components": {
    "mongo": {
      "status": "UP"  ← Should be UP not DOWN
    }
  }
}
```

### Test 3: Pattern Matching Endpoint
```bash
curl -X POST http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sourceSchema": {"product_name": "Test"},
    "targetSchema": {"title": ""},
    "channelId": "shopify",
    "confidenceThreshold": 70
  }'

# Should NOT timeout
# Should return field mappings (not ERROR status)
```

---

## 🎓 Key Learnings

### This Error Means:
❌ MongoDB Atlas cluster is unreachable
❌ Backend can't establish database connection
❌ Network/firewall/auth issue

### This Error Does NOT Mean:
✅ Frontend code issue (frontend is working correctly)
✅ Data transformation issue (not related to recent refactoring)
✅ API endpoint issue (backend receives request fine)

---

## 📝 Summary

**Problem**: Backend → MongoDB Atlas connection timeout
**Cause**: IP not whitelisted / Cluster paused / Network issue
**Solution**: Backend team needs to fix MongoDB Atlas configuration
**Impact**: Pattern matching unavailable until MongoDB fixed

**Frontend Status**: ✅ Working correctly (properly handling backend errors)
**Backend Status**: ❌ Cannot connect to MongoDB Atlas
**Database Status**: ❓ Unknown (can't connect to check)

---

## 🚨 Action Required

### Immediate (Backend Team):
1. ✅ Check MongoDB Atlas IP whitelist
2. ✅ Verify cluster is not paused
3. ✅ Test connection from backend server
4. ✅ Check credentials in application.properties

### Short-term (Backend Team):
1. Add better error handling for MongoDB connection failures
2. Implement connection retry logic
3. Add health check endpoint that includes MongoDB status
4. Increase connection timeout from 2s to 10s

### Frontend (Optional):
1. Update error message to distinguish MongoDB errors from other errors
2. Add "Retry" button for transient failures

---

**Status**: 🔴 **Blocked by Backend Infrastructure**
**Priority**: 🔴 **Critical** - Pattern matching completely unavailable
**Owner**: Backend Team (MongoDB Atlas configuration)
**ETA**: 5-30 minutes (depending on cause)

---

**Last Updated**: 2025-12-17
**Error Type**: MongoDB Connection Timeout
**Cluster**: labamap2cluster.zgdyn.mongodb.net
