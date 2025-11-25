# Azure Search Index Validation Report

## Executive Summary

Your Azure Search indexes are **partially configured** but have **critical gaps** that directly cause the agent failures documented earlier. The indexes lack real-time fields needed for stock validation and have incomplete normalization schemas.

---

## Current Index Configuration

### ✅ **Indexes Configured Correctly**

```env
AZURE_AI_SEARCH_SERVICE_ENDPOINT=https://icommerce-ai-search.search.windows.net/
AZURE_AI_SEARCH_CATALOG_INDEX=wpp-knowledge-prod-catalog
AZURE_AI_SEARCH_TRACTOR_INDEX=wpp-knowledge-prod-tractors
AZURE_AI_SEARCH_CASES_INDEX=wpp-knowledge-prod-cases
AZURE_AI_SEARCH_CYCLOPEDIA_INDEX=wpp-knowledge-prod-cyclopedia
AZURE_AI_SEARCH_WEBSITE_INDEX=wpp-knowledge-prod-website
AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX=wpp-knowledge-prod-airtable-producthistory
AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX=wpp-knowledge-prod-airtable-enginehistory
```

**Good**: All major indexes are defined and connected.

---

## ❌ **Critical Missing Fields in Catalog Index**

### Problem: Stock Status Fields Are Static, Not Real-Time

**Current Implementation** (`WoodlandAISearchCatalog.js` line 226-240):

```javascript
const availability = str(d?.availability) || str(d?.status);
// ^ This reads from INDEX, not live inventory

normalized_catalog: {
  availability,  // ← Static text like "In Stock" or "Out of Stock"
  stock_quantity: num(d?.stock_quantity),  // ← Not updated in real-time
  // MISSING: pickup_available
  // MISSING: warehouse_locations
  // MISSING: stock_last_updated
  // MISSING: backorder_status
}
```

**Impact**: Agent said "out of stock" when item was actually available for pickup because:
1. Index data is stale (only updated during nightly sync)
2. No `pickup_available` field to check
3. No API integration for live stock validation

### **Required Index Fields for Catalog**

Your catalog index (`wpp-knowledge-prod-catalog`) **MUST** include these fields:

```json
{
  "name": "wpp-knowledge-prod-catalog",
  "fields": [
    // ... existing fields ...
    
    // STOCK & FULFILLMENT (CRITICAL - MISSING)
    {
      "name": "in_stock",
      "type": "Edm.Boolean",
      "searchable": false,
      "filterable": true,
      "facetable": true,
      "sortable": true
    },
    {
      "name": "stock_quantity",
      "type": "Edm.Int32",
      "searchable": false,
      "filterable": true,
      "sortable": true
    },
    {
      "name": "pickup_available",
      "type": "Edm.Boolean",
      "searchable": false,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "pickup_locations",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "stock_last_updated",
      "type": "Edm.DateTimeOffset",
      "searchable": false,
      "filterable": true,
      "sortable": true
    },
    {
      "name": "backorder_status",
      "type": "Edm.String",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "estimated_availability",
      "type": "Edm.String",
      "searchable": true
    },
    
    // PRICING (Verify these exist)
    {
      "name": "price",
      "type": "Edm.Double",
      "searchable": false,
      "filterable": true,
      "sortable": true
    },
    {
      "name": "catalog_price",
      "type": "Edm.Double",
      "searchable": false,
      "filterable": true,
      "sortable": true
    },
    {
      "name": "old_price",
      "type": "Edm.Double",
      "searchable": false,
      "filterable": true,
      "sortable": true
    },
    
    // SKU & FITMENT (Verify completeness)
    {
      "name": "sku",
      "type": "Edm.String",
      "key": false,
      "searchable": true,
      "filterable": true,
      "sortable": true,
      "facetable": true
    },
    {
      "name": "normalized_sku",
      "type": "Edm.String",
      "searchable": true,
      "filterable": true
    },
    {
      "name": "rake_models",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "rake_names",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "rake_skus",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "hitch_types",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    
    // POLICY FLAGS (Critical for validation)
    {
      "name": "policy_flags",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "policy_severity",
      "type": "Edm.String",
      "searchable": false,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "policy_notes",
      "type": "Edm.String",
      "searchable": true
    }
  ]
}
```

---

## ❌ **Missing Real-Time Data Integration**

### Problem: Index is Static Snapshot

**Current Flow**:
```
iCommerce Database → Nightly Sync → Azure Search Index → Agent Query
                     ^^^^^^^^^^^^
                     Problem: Data becomes stale
```

**Agent can't know**:
- If item was just sold (stock_quantity changed 5 minutes ago)
- If pickup became available today
- If item is on backorder

### **Required Fix: Hybrid Data Architecture**

```
┌─────────────────────────────────────────────────┐
│         Agent Query Flow (Proposed)             │
└─────────────────────────────────────────────────┘

1. Agent calls Catalog Tool
   ↓
2. Catalog Tool queries Azure Search Index
   ↓
3. Results include SKUs: ["01-04-158", "01-04-306"]
   ↓
4. FOR EACH SKU: Call iCommerce Live API
   ↓
5. Merge live data into normalized_catalog:
   {
     sku: "01-04-158",
     title: "XR950 PRO Upgrade Kit",
     price: 299.99,  // from index
     availability: {
       static_status: "In Stock",  // from index (stale)
       live: {
         in_stock: true,           // from API (real-time)
         quantity: 47,              // from API
         pickup_available: true,    // from API
         locations: ["Warehouse A"], // from API
         last_updated: "2025-11-22T10:30:00Z"
       }
     }
   }
   ↓
6. Return enriched results to agent
```

---

## Implementation: Add Live Stock API Integration

### **Step 1: Create Stock API Client**

**File**: `api/app/clients/tools/structured/util/stockApi.js` (NEW)

```javascript
const { logger } = require('~/config');

const ICOMMERCE_API_BASE = process.env.ICOMMERCE_API_ENDPOINT || 'https://api.icommerce.com';
const ICOMMERCE_API_KEY = process.env.ICOMMERCE_API_KEY;

/**
 * Fetch real-time stock status for a SKU from iCommerce API
 * @param {string} sku - Product SKU
 * @returns {Promise<Object>} Live stock data
 */
const fetchLiveStock = async (sku) => {
  if (!ICOMMERCE_API_KEY) {
    logger.warn('[stockApi] ICOMMERCE_API_KEY not configured, skipping live stock check');
    return null;
  }

  try {
    const response = await fetch(`${ICOMMERCE_API_BASE}/inventory/${sku}`, {
      headers: {
        'Authorization': `Bearer ${ICOMMERCE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 3000  // 3 second timeout
    });

    if (!response.ok) {
      logger.warn(`[stockApi] Failed to fetch stock for SKU ${sku}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    return {
      in_stock: data.quantity > 0,
      quantity: data.quantity || 0,
      pickup_available: Array.isArray(data.pickup_locations) && data.pickup_locations.length > 0,
      locations: data.pickup_locations || [],
      backorder_status: data.backorder_available ? 'available' : 'none',
      estimated_ship_date: data.estimated_ship_date,
      last_updated: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`[stockApi] Error fetching stock for SKU ${sku}:`, error.message);
    return null;
  }
};

/**
 * Enrich multiple catalog docs with live stock data
 * @param {Array} docs - Array of catalog documents
 * @returns {Promise<Array>} Enriched documents
 */
const enrichWithLiveStock = async (docs) => {
  if (!Array.isArray(docs) || docs.length === 0) {
    return docs;
  }

  const enrichedDocs = await Promise.all(
    docs.map(async (doc) => {
      const sku = doc?.normalized_catalog?.sku || doc?.sku;
      if (!sku) {
        return doc;
      }

      const liveStock = await fetchLiveStock(sku);
      if (!liveStock) {
        // No live data available, return as-is
        return doc;
      }

      // Merge live data into normalized_catalog
      return {
        ...doc,
        normalized_catalog: {
          ...(doc.normalized_catalog || {}),
          availability: {
            status: doc.normalized_catalog?.availability,  // static from index
            live: liveStock  // real-time from API
          }
        }
      };
    })
  );

  return enrichedDocs;
};

module.exports = {
  fetchLiveStock,
  enrichWithLiveStock
};
```

### **Step 2: Update WoodlandAISearchCatalog.js**

**Location**: Line 900 (in `_call` method)

**Current Code**:
```javascript
const docs = await this._safeSearch(finalQueryString, options);
let payload = docs.docs || [];
if (Array.isArray(payload)) {
  payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
  // ... policy guards ...
}
```

**Updated Code**:
```javascript
const { enrichWithLiveStock } = require('./util/stockApi');

// ... in _call method ...

const docs = await this._safeSearch(finalQueryString, options);
let payload = docs.docs || [];
if (Array.isArray(payload)) {
  payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
  
  // NEW: Enrich with live stock data
  payload = await enrichWithLiveStock(payload);
  
  const { docs: guarded, dropped } = await applyCatalogPolicy(payload, {
    model: modelContext,
    hitch: hitchContext,
    query,
    rakeName: canonicalRakeNameTarget,
  });
  // ... rest of code ...
}
```

### **Step 3: Add Environment Variables**

**File**: `.env`

Add after line 222:

```env
# iCommerce Live API Integration
ICOMMERCE_API_ENDPOINT=https://api.icommerce.woodland.com
ICOMMERCE_API_KEY=your_icommerce_api_key_here
ICOMMERCE_STOCK_CHECK_ENABLED=true
```

### **Step 4: Update Prompt to Require Live Data**

**File**: `api/app/clients/agents/Woodland/promptTemplates.js`

**Line 1 (catalogPartsPrompt), add after SCOPE**:

```javascript
STOCK STATUS RULES (CRITICAL)
- NEVER state stock availability unless normalized_catalog.availability.live exists
- When live stock data is present:
  - Use normalized_catalog.availability.live.in_stock (boolean)
  - Use normalized_catalog.availability.live.pickup_available (boolean)
  - Include normalized_catalog.availability.live.last_updated timestamp
- When live stock data is MISSING:
  - State: "Stock status unavailable - verify in order system before confirming"
  - Do NOT use normalized_catalog.availability.status (static field)
- Pickup availability:
  - Only confirm if normalized_catalog.availability.live.pickup_available === true
  - Include locations from normalized_catalog.availability.live.locations
```

---

## ❌ **Cases Index Missing Relevance Metadata**

### Problem: No Way to Score Case Relevance

**Current Fields** (based on code line 100-120 in `WoodlandAISearchCases.js`):

```javascript
// Cases index reads:
{
  id: string,
  title: string,
  content: string,
  url: string,
  case_number: string,
  summary: string,
  tags: string[],
  keywords: string[]
}
```

**Missing**:
- `topic` field (what is this case about?)
- `product_mentioned` (which products/SKUs discussed?)
- `resolution_type` (technical fix, policy, escalation?)
- `case_date` (how recent is this precedent?)
- `confidence_score` (how authoritative is this case?)

### **Required Fields for Cases Index**

```json
{
  "name": "wpp-knowledge-prod-cases",
  "fields": [
    // ... existing fields ...
    
    {
      "name": "topic",
      "type": "Edm.String",
      "searchable": true,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "products_mentioned",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true
    },
    {
      "name": "skus_mentioned",
      "type": "Collection(Edm.String)",
      "searchable": true,
      "filterable": true
    },
    {
      "name": "resolution_type",
      "type": "Edm.String",
      "searchable": false,
      "filterable": true,
      "facetable": true
    },
    {
      "name": "case_date",
      "type": "Edm.DateTimeOffset",
      "searchable": false,
      "filterable": true,
      "sortable": true
    },
    {
      "name": "is_technical",
      "type": "Edm.Boolean",
      "searchable": false,
      "filterable": true
    },
    {
      "name": "confidence_level",
      "type": "Edm.String",
      "searchable": false,
      "filterable": true,
      "facetable": true
    }
  ]
}
```

---

## ❌ **Tractor Index Missing Compatibility Metadata**

### Current vs. Required

**Current** (partial - inferred from code):
```javascript
{
  make: string,
  model: string,
  deck_size: string,
  mda_sku: string,
  hitch_sku: string,
  hose_sku: string
}
```

**Missing Critical Fields**:
- `deck_size_min` and `deck_size_max` (for range queries)
- `year_min` and `year_max` (for model year ranges)
- `requires_drilling` (boolean)
- `exhaust_clearance_required` (boolean)
- `hose_diameter` (numeric)

### **Required Fields for Tractor Index**

```json
{
  "name": "wpp-knowledge-prod-tractors",
  "fields": [
    // ... existing ...
    
    {
      "name": "deck_size_min",
      "type": "Edm.Int32",
      "filterable": true,
      "sortable": true
    },
    {
      "name": "deck_size_max",
      "type": "Edm.Int32",
      "filterable": true,
      "sortable": true
    },
    {
      "name": "year_min",
      "type": "Edm.Int32",
      "filterable": true,
      "sortable": true
    },
    {
      "name": "year_max",
      "type": "Edm.Int32",
      "filterable": true,
      "sortable": true
    },
    {
      "name": "requires_drilling",
      "type": "Edm.Boolean",
      "filterable": true,
      "facetable": true
    },
    {
      "name": "exhaust_clearance_required",
      "type": "Edm.Boolean",
      "filterable": true,
      "facetable": true
    },
    {
      "name": "hose_diameter_inches",
      "type": "Edm.Double",
      "filterable": true,
      "sortable": true
    },
    {
      "name": "compatibility_confidence",
      "type": "Edm.String",
      "filterable": true,
      "facetable": true
    }
  ]
}
```

---

## ✅ **What's Already Good**

1. **Semantic Search Configured**:
   ```env
   AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION=sem1
   AZURE_AI_SEARCH_QUERY_LANGUAGE=en-us
   ```

2. **Vector Search Ready**:
   ```env
   AZURE_AI_SEARCH_VECTOR_FIELD=text_vector
   AZURE_AI_SEARCH_CATALOG_VECTOR_FIELD=text_vector
   ```

3. **Multiple Specialized Indexes**:
   - Catalog, Tractor, Cases, Cyclopedia, Website, Product History, Engine History

4. **Policy Flags in Catalog**: Your code already checks `policy_flags` with severity "block"

---

## Validation Checklist

### **Immediate Actions Required**

- [ ] **Add stock fields to Catalog index**:
  - `in_stock` (Boolean)
  - `pickup_available` (Boolean)
  - `pickup_locations` (Collection)
  - `stock_last_updated` (DateTimeOffset)

- [ ] **Implement live stock API**:
  - Create `stockApi.js` utility
  - Integrate into `WoodlandAISearchCatalog.js`
  - Add `ICOMMERCE_API_*` env vars

- [ ] **Add metadata to Cases index**:
  - `topic`
  - `products_mentioned`
  - `skus_mentioned`
  - `case_date`
  - `resolution_type`

- [ ] **Enhance Tractor index**:
  - `deck_size_min/max`
  - `year_min/max`
  - `requires_drilling`
  - `exhaust_clearance_required`

### **Verification Steps**

1. **Test Catalog Index Schema**:
   ```bash
   curl -X GET "https://icommerce-ai-search.search.windows.net/indexes/wpp-knowledge-prod-catalog?api-version=2024-07-01" \
     -H "api-key: ${AZURE_AI_SEARCH_API_KEY}" | jq '.fields[] | select(.name | contains("stock"))'
   ```

2. **Test Live Stock API** (once implemented):
   ```bash
   curl -X GET "http://localhost:3080/api/test/stock/01-04-158" \
     -H "Authorization: Bearer ${USER_TOKEN}"
   ```

3. **Validate Enriched Results**:
   ```javascript
   // In Catalog Tool response:
   normalized_catalog.availability.live.in_stock === true
   normalized_catalog.availability.live.last_updated // should be recent
   ```

---

## Performance Considerations

### **Live API Latency**

Adding live stock calls will add ~200-500ms per query:

```
Azure Search: ~100-300ms
Live Stock API (3 SKUs): ~200-500ms
Total: ~300-800ms
```

**Mitigation**:
1. **Parallel Requests**: Fetch stock for all SKUs concurrently
2. **Timeout**: 3-second max (fail gracefully if slow)
3. **Caching**: Cache stock data for 30 seconds
4. **Fallback**: If API fails, use index data with disclaimer

### **Caching Strategy**

```javascript
// In stockApi.js
const stockCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getCachedStock = (sku) => {
  const cached = stockCache.get(sku);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const fetchLiveStock = async (sku) => {
  const cached = getCachedStock(sku);
  if (cached) return cached;
  
  const data = await fetchFromAPI(sku);
  stockCache.set(sku, { data, timestamp: Date.now() });
  return data;
};
```

---

## Summary

| Index | Status | Critical Missing Fields | Impact |
|-------|--------|------------------------|--------|
| **Catalog** | ⚠️ Incomplete | `in_stock`, `pickup_available`, `pickup_locations`, `stock_last_updated` | **HIGH** - Causes incorrect stock answers |
| **Cases** | ⚠️ Incomplete | `topic`, `products_mentioned`, `case_date`, `resolution_type` | **MEDIUM** - Causes irrelevant citations |
| **Tractor** | ⚠️ Incomplete | `deck_size_min/max`, `year_min/max`, `requires_drilling` | **MEDIUM** - Causes incorrect fitment advice |
| **Cyclopedia** | ✅ Good | None identified | None |
| **Website** | ✅ Good | None identified | None |
| **History** | ✅ Good | None identified | None |

**Priority**: Fix Catalog index first (adds live stock API), then Cases (adds relevance metadata), then Tractor (adds range queries).
