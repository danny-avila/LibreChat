// Telemetry event emitter: logs structured JSON for tractor agent queries
// Usage: const { emitTelemetry } = require('./extensions/telemetry');
// Standalone; writes to stdout or optional file sink.

const fs = require('fs');
const path = require('path');

function emitTelemetry(event, sink = process.stdout) {
  const payload = {
    timestamp: new Date().toISOString(),
    event: 'tractor_agent_query',
    ...event,
  };
  const line = JSON.stringify(payload) + '\n';
  if (typeof sink === 'string') {
    // File path sink
    fs.appendFileSync(sink, line, 'utf8');
  } else if (sink?.write) {
    // Stream sink
    sink.write(line);
  }
}

function buildTelemetryEvent({
  make,
  model,
  deck,
  rake,
  year,
  missingFields = [],
  latencyMs,
  resultCount,
  cacheHit = false,
}) {
  return {
    make,
    model,
    deck,
    rake,
    year,
    missingFields,
    latencyMs,
    resultCount,
    cacheHit,
  };
}

module.exports = { emitTelemetry, buildTelemetryEvent };
