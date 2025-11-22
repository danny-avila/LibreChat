# Woodland Tractor Agent Extensions (Non-Invasive)

Standalone helpers; no core LibreChat code modified. Import selectively where you integrate agents.

## Files
- `autocompleteCache.js` — Build and query make/model autocomplete maps.
- `freeformParser.js` — Parse pasted freeform line into anchors (make/model/deck/rake/year).
- `deckWidthSelector.js` — Derive available deck width options from tool docs.
- `outputSimplifier.js` — Generate compact CRM line, tiered output, and colored flags.
- `progressiveChipState.js` — Track make/model/deck/rake/year collection status for step-by-step UI.
- `telemetry.js` — Emit JSON telemetry events (query, latency, make, model) for observability.
- `goldenHarness.js` — Regression test harness; validates tool output against known fitment scenarios.
- `accessorySuggestor.js` — Recommend upgrade hose/rubber collar accessories based on fitment data.

## Usage Examples
```js
const { buildAutocompleteCache, suggestMakes, suggestModels } = require('./extensions/autocompleteCache');
const { parseLine } = require('./extensions/freeformParser');
const { deriveDeckOptions } = require('./extensions/deckWidthSelector');
const { buildCRMLine, buildTieredOutput, colorizeFlags } = require('./extensions/outputSimplifier');
const { ChipStateManager } = require('./extensions/progressiveChipState');
const { emitTelemetry, buildTelemetryEvent } = require('./extensions/telemetry');
const { runGoldenTests } = require('./extensions/goldenHarness');
const { suggestAccessories, formatAccessoryList } = require('./extensions/accessorySuggestor');

// Build cache from recent tool docs
const cache = buildAutocompleteCache(toolPayload.docs);
const makes = suggestMakes(cache, 'jo'); // ['John Deere']
const models = suggestModels(cache, 'John Deere', 'd1'); // ['D130']

// Parse freeform note
const parsed = parseLine('JD D130 42 Commander');
// { make:'jd', model:'d130', deck:'42', rake:'Commander', ... }

// Deck width choices from docs
const widths = deriveDeckOptions(toolPayload.docs); // ['42','48','54']

// Output simplification
const crmLine = buildCRMLine(parsed, { mda:'206D', hitch:'208-090', hose:'305' });
// 'jd d130 42" Commander: 206D | 208-090 | 305'

const tiered = buildTieredOutput({ mda:'206D', hitch:'208-090', hose:'305' }, { drilling:false, exhaust:false }, { showAdvanced:true });

// Progressive chip state (track field collection status)
const chipState = new ChipStateManager();
chipState.update('make', 'John Deere');
chipState.update('model', 'D130');
chipState.isComplete(); // false (missing deck/rake)
const next = chipState.getNextMissing(); // ['deck','rake']

// Telemetry (JSON logging)
const event = buildTelemetryEvent({ make:'John Deere', model:'D130', deck:'42', rake:'Commander', latencyMs:120 });
emitTelemetry(event, 'stdout'); // or '/var/log/tractor-queries.json'

// Golden tests (regression validation)
await runGoldenTests(); // Returns [{id,pass,actual,expected,latencyMs}, ...]

// Accessory suggestions (upsell upgrade hose/collar)
const accessories = suggestAccessories(toolPayload.docs[0]);
// [{sku:'304JP', name:'Upgrade Hose (304JP)', url:'...', reason:'Enhanced durability'}, ...]
const md = formatAccessoryList(accessories);
```

## Guidance

Keep these helpers decoupled; do not mutate tool results. If upstream changes structure, adapt mapping here not in core files.
