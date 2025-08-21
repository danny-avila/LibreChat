require('dotenv').config();

const { isEnabled } = require('@librechat/api');

// Check if tracing should be enabled
const OTEL_TRACING_ENABLED = isEnabled(process.env.OTEL_TRACING_ENABLED);

// Only initialize if tracing is enabled
if (OTEL_TRACING_ENABLED) {
  // Initialize OpenTelemetry first
  require('./otel');

  // Initialize custom instrumentations
  require('./instrumentations').default;

  console.log(`🔍 OpenTelemetry tracing initialized for LibreChat`);
  console.log(`   Service: ${process.env.OTEL_SERVICE_NAME || 'librechat'}`);
  console.log(
    `   Endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'}`,
  );
} else {
  console.log(`🔍 Tracing disabled - set OTEL_TRACING_ENABLED=true to enable`);
}

// Export tracing utilities for use throughout the application
module.exports = require('./utils').default;
