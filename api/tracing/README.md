# OpenTelemetry Tracing for LibreChat

This directory contains a simplified OpenTelemetry tracing implementation for LibreChat, providing observability for LLM calls, MongoDB operations, HTTP requests, and logging using standard OpenTelemetry libraries.

## Features

- 🔍 **Basic LLM Instrumentation**: Simple tracing for LLM provider calls
- 🗄️ **Database Monitoring**: MongoDB query tracing with automatic instrumentation
- 🌐 **HTTP Request Tracing**: Complete request/response lifecycle tracking
- 📝 **Correlated Logging**: Automatic trace ID injection into log messages
- 🎯 **Custom Business Logic**: Simple span creation for LibreChat operations
- 🔄 **OTLP Export**: Standard OpenTelemetry Protocol export

## Files Overview

- **`index.js`** - Main entry point and initialization logic
- **`otel.js`** - Core OpenTelemetry SDK configuration
- **`instrumentations.js`** - Simple custom span creation utilities
- **`utils.js`** - Utility functions for tracing operations
- **`logger.js`** - Enhanced Winston logger with trace correlation
- **`clientWrapper.js`** - Simple LLM call tracing helpers
- **`middleware.js`** - Express middleware for HTTP span enhancement

## Quick Start

### 1. Initialize Tracing

Add this to the very beginning of your main server file (`api/server/index.js`):

```javascript
// Initialize tracing before any other imports
require('./tracing');

// Rest of your application imports...
require('dotenv').config();
// ... other imports
```

### 2. Environment Configuration

Update your `.env` file:

```env
# Enable OpenTelemetry tracing
OTEL_TRACING_ENABLED=true

# Service information
OTEL_SERVICE_NAME=librechat
OTEL_SERVICE_VERSION=0.8.0

# OTLP Exporter (Jaeger, OpenTelemetry Collector, etc.)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Optional: Headers for authentication
# OTEL_EXPORTER_OTLP_HEADERS={"api-key":"your-api-key"}

# Optional: Enhanced console logging with trace IDs
OTEL_ENHANCE_CONSOLE=true
```

### 3. Add Middleware (Optional)

Enhance HTTP tracing by adding middleware to your Express app:

```javascript
const { tracingMiddleware, llmTracingMiddleware, errorTracingMiddleware } = require('./tracing/middleware');

// Add after body parsing middleware
app.use(tracingMiddleware);
app.use(llmTracingMiddleware);

// Add error middleware at the end
app.use(errorTracingMiddleware);
```

## Usage Examples

### Custom Span Creation

```javascript
const { withSpan } = require('./tracing');

// Wrap any operation with a custom span
const result = await withSpan(
  'user.authentication',
  { 'user.email': email, 'auth.method': 'jwt' },
  async (span) => {
    // Your business logic here
    const user = await authenticateUser(email, password);
    
    // Add dynamic attributes
    span.setAttributes({
      'user.id': user.id,
      'user.role': user.role,
    });
    
    return user;
  }
);
```

### LLM Call Tracing

```javascript
const { traceLLMCall } = require('./tracing/clientWrapper');

// Trace an LLM call
const response = await traceLLMCall(
  'openai',
  'chat_completion',
  { model: 'gpt-4', temperature: 0.7 },
  async () => {
    return await openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
  }
);
```

### Enhanced Logging

```javascript
// Use the enhanced logger for automatic trace correlation
const logger = require('./tracing/logger');

logger.info('Processing chat completion', {
  model: 'gpt-4',
  conversationId: 'conv-123',
  messageCount: 5,
});

// Logs will automatically include trace context:
// {
//   "message": "Processing chat completion",
//   "model": "gpt-4",
//   "conversationId": "conv-123",
//   "messageCount": 5,
//   "trace": {
//     "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
//     "spanId": "00f067aa0ba902b7"
//   }
// }
```

### Manual Span Management

```javascript
const { getActiveSpan, setSpanAttributes, addEvent } = require('./tracing/utils');

function processMessage(message) {
  const span = getActiveSpan();
  
  if (span) {
    setSpanAttributes({
      'message.length': message.length,
      'message.type': message.type,
    });
    
    addEvent('message.validation.start');
    
    // Process the message...
    
    addEvent('message.validation.complete', {
      'validation.result': 'success',
    });
  }
}
```

## Observability Platforms

### Jaeger (Recommended for Development)

1. **Start Jaeger**:
   ```bash
   docker run -d --name jaeger \
     -p 16686:16686 \
     -p 4317:4317 \
     -p 4318:4318 \
     jaegertracing/all-in-one:latest
   ```

2. **Access UI**: http://localhost:16686

### OpenTelemetry Collector

Use the OpenTelemetry Collector to export traces to multiple backends.

### Cloud Platforms

- **Datadog**: Set appropriate OTLP endpoint
- **New Relic**: Configure OTLP endpoint for New Relic
- **Honeycomb**: Use Honeycomb's OTLP endpoint

## Integration Points

### Existing LibreChat Components

The tracing system automatically instruments:

- **HTTP**: All Express routes and middleware
- **Database**: MongoDB operations via Mongoose
- **Caching**: Redis operations (if enabled)
- **Logging**: Winston logger with correlation

### Custom Integration

For custom components:

```javascript
// In your component file
const { withSpan } = require('../tracing');

class CustomService {
  async processData(data) {
    return withSpan(
      'custom.service.process_data',
      { 'data.type': data.type, 'data.size': data.length },
      async () => {
        // Your processing logic
        return processedData;
      }
    );
  }
}
```

## Performance Considerations

- **Sampling**: Use environment variables to configure sampling in production
- **Batch Export**: Traces are automatically batched for efficient export
- **Resource Usage**: Minimal overhead
- **Network**: Async export doesn't block application threads

## Troubleshooting

### Common Issues

1. **No traces appearing**:
   - Check `OTEL_TRACING_ENABLED=true`
   - Verify OTLP endpoint is reachable
   - Check console logs for initialization messages

2. **Missing traces**:
   - Ensure tracing is initialized before other imports
   - Check middleware is properly applied

3. **Performance issues**:
   - Configure sampling for production workloads
   - Disable noisy instrumentations if needed

### Debug Mode

Check initialization logs:
- `🔍 OpenTelemetry tracing initialized for LibreChat`
- `🚀 OpenTelemetry SDK started successfully`

## Security Considerations

- **Sensitive Data**: Be careful not to log sensitive information in spans
- **API Keys**: Never include API keys in span attributes
- **PII**: Be cautious with user data in traces
- **Network**: Use TLS for OTLP export in production

## Contributing

When adding new tracing:

1. Use semantic naming: `component.operation.sub_operation`
2. Add relevant attributes for filtering and analysis
3. Include error handling and exception recording
4. Test with sampling enabled
5. Document new span types and attributes

This simplified tracing implementation provides essential observability for LibreChat while maintaining high performance and ease of use with standard OpenTelemetry libraries.