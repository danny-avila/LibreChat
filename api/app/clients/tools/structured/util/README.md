# Woodland Tool Shared Utilities

Reusable patterns extracted from the Tractor implementation for use across all Woodland agents and tools.

## Overview

The shared utilities provide common functionality for:
- Azure AI Search client management
- Configuration validation and parsing
- Compatibility data extraction
- Telemetry and performance tracking
- Adaptive search strategies with fallback
- Document normalization helpers

## Architecture

```
api/app/clients/tools/structured/util/
├── index.js                      # Main export file
├── WoodlandSearchBase.js         # Base class for all search tools
├── configValidation.js           # Config parsing and validation
├── compatibilityExtraction.js    # Extract fitment/compatibility from text
├── telemetry.js                  # Structured logging and metrics
└── adaptiveSearch.js             # Multi-tier search strategies
```

## Core Components

### WoodlandSearchBase

Base class providing common patterns for all Woodland AI Search tools.

**Key Features:**
- Environment variable resolution with fallback chains
- Azure SearchClient initialization
- Provenance and citation formatting
- OData filter building
- Field validation
- Type conversion helpers (str, num, bool, list, listFromAny)
- Cache infrastructure
- Vector/semantic search configuration

**Usage:**
```javascript
const { WoodlandSearchBase } = require('./util');

class MySearchTool extends WoodlandSearchBase {
  constructor(fields = {}) {
    super(fields);
    
    // Initialize search client
    this.client = this._initializeSearchClient();
    
    // Use helper methods
    const provenance = this._provenance(doc, baseUrl);
    const citation = this._buildCitation(doc);
    const filter = this._andFilter(filter1, filter2, filter3);
  }
}
```

### Configuration Validation

Parse and validate tool configurations from JSON with schema validation.

**Usage:**
```javascript
const {
  parseToolConfig,
  normalizeAliasMap,
  mergeIntentKeywords,
  safeRegex,
} = require('./util');

// Parse config from JSON
const config = parseToolConfig(configData, defaults, 'my-tool');

// Normalize aliases
const aliasMap = normalizeAliasMap({
  classic: ['classic', 'classic rake', '101'],
  commander: ['commander', 'cmd', '103'],
});

// Build regex safely
const partNumberRegex = safeRegex(
  configPattern,
  /\b\d{2}-[a-z0-9]{2,}\b/i
);
```

### Compatibility Extraction

Extract compatibility information from unstructured text and tags.

**Usage:**
```javascript
const {
  extractCompatFromText,
  cleanCompatList,
  normalizeDimension,
  extractYears,
  extractPartNumbers,
  canonicalizeValue,
} = require('./util');

// Extract from text
const compatModels = extractCompatFromText(
  doc.content,
  doc.tags,
  { maxLength: 40 }
);

// Normalize dimensions
const deckSize = normalizeDimension('42 inches'); // '42'

// Extract years
const years = extractYears('Models 2018-2023'); // [2018, 2019, 2020, 2021, 2022, 2023]

// Canonicalize using alias map
const canonical = canonicalizeValue('cmd', aliasMap); // 'commander'
```

### Telemetry

Structured event logging and performance tracking.

**Usage:**
```javascript
const {
  createTelemetry,
  createTimer,
  createMetrics,
  EventTypes,
} = require('./util');

// Create telemetry emitter
const telemetry = createTelemetry('my-tool', { logLevel: 'info' });

// Log events
telemetry.queryStart({ query: 'test' });
telemetry.searchStrategy('strict', filter, 5);
telemetry.queryComplete(results, 123, 'strict');

// Performance timing
const timer = createTimer('operation');
// ... do work ...
const duration = timer.complete('my-tool');

// Track metrics
const metrics = createMetrics();
metrics.recordQuery({ cached: false, strategy: 'strict', duration: 100 });
metrics.log('my-tool');
```

### Adaptive Search

Multi-tier search strategies with automatic fallback.

**Usage:**
```javascript
const {
  executeTwoTierSearch,
  buildRakeContextFallback,
  relaxSearchParams,
  AdaptiveSearchExecutor,
} = require('./util');

// Simple two-tier search
const { results, strategy } = await executeTwoTierSearch(
  (params) => this._executeSearch(params),
  strictParams,
  relaxedParams,
  { context: 'catalog-search' }
);

// Build fallback params
const fallback = buildRakeContextFallback(params, rakeName);
const relaxed = relaxSearchParams(strictParams, {
  removeFilters: true,
  expandTop: true,
});

// Advanced multi-tier executor
const executor = new AdaptiveSearchExecutor(
  (params) => this._executeSearch(params),
  { strategy: 'strict-then-relaxed', minResults: 1 }
);

const outcome = await executor.execute(primaryParams, [
  fallbackParams1,
  fallbackParams2,
]);
```

## Example: Refactored Tool

See `WoodlandAISearchCatalogRefactored.js` for a complete example showing:

1. **Base class inheritance** - Extends `WoodlandSearchBase`
2. **Telemetry integration** - Uses `createTelemetry` and `createTimer`
3. **Adaptive search** - Implements two-tier strict-then-relaxed strategy
4. **Config validation** - Normalizes rake aliases
5. **Compatibility extraction** - Enhances fitment data from text
6. **Intent classification** - Uses `_classifyIntent` helper
7. **Document normalization** - Leverages type conversion helpers

## Migration Guide

### Step 1: Extend Base Class

**Before:**
```javascript
const { Tool } = require('@langchain/core/tools');

class MyTool extends Tool {
  constructor(fields) {
    super();
    this.serviceEndpoint = process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT;
    // ... manual setup
  }
}
```

**After:**
```javascript
const { WoodlandSearchBase } = require('./util');

class MyTool extends WoodlandSearchBase {
  constructor(fields) {
    super(fields);
    this.client = this._initializeSearchClient();
  }
}
```

### Step 2: Add Telemetry

**Add to constructor:**
```javascript
this.telemetry = createTelemetry(this.name);
```

**Add to search method:**
```javascript
async _call(params) {
  const timer = createTimer('query');
  this.telemetry.queryStart(params);
  
  try {
    const results = await this._executeSearch(params);
    const duration = timer.complete(this.name);
    this.telemetry.queryComplete(results, duration);
    return results;
  } catch (error) {
    this.telemetry.queryError(error, params);
    throw error;
  }
}
```

### Step 3: Implement Adaptive Search

```javascript
const { executeTwoTierSearch, relaxSearchParams } = require('./util');

// In _call method
const relaxed = relaxSearchParams(params);
const { results, strategy } = await executeTwoTierSearch(
  (p) => this._executeSearch(p),
  params,
  relaxed
);
```

### Step 4: Use Normalization Helpers

**Replace manual parsing:**
```javascript
const price = doc.price ? Number(doc.price) : undefined;
const tags = Array.isArray(doc.tags) 
  ? doc.tags.filter(t => t).map(t => t.trim()) 
  : [];
```

**With helpers:**
```javascript
const price = this._num(doc.price);
const tags = this._list(doc.tags);
```

## Benefits

### Code Reuse
- Eliminate duplicated utility code across tools
- Consistent patterns and behaviors
- Easier maintenance and updates

### Reliability
- Battle-tested patterns from Tractor implementation
- Proper error handling and fallbacks
- Validated configurations

### Observability
- Structured telemetry for all tools
- Performance tracking built-in
- Query metrics and analytics

### Flexibility
- Adaptive search strategies
- Configurable fallback behavior
- Easy to extend and customize

## Testing

Use the shared utilities in your tests:

```javascript
const { createTelemetry, createMetrics } = require('./util');

describe('MyTool', () => {
  it('tracks metrics correctly', () => {
    const metrics = createMetrics();
    metrics.recordQuery({ cached: false, duration: 100 });
    const stats = metrics.getStats();
    expect(stats.totalQueries).toBe(1);
  });
});
```

## Future Enhancements

- Golden query harness framework
- Configuration hot-reload
- Circuit breaker patterns
- Rate limiting utilities
- Result ranking/scoring helpers
- A/B testing framework
