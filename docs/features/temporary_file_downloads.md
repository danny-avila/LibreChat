# Temporary File Downloads System

LibreChat's comprehensive temporary file download system provides secure, time-limited access to uploaded files with advanced security, monitoring, and administrative capabilities.

## Overview

The temporary download system enables:
- **Secure file access** with time-limited, token-based URLs
- **MCP integration** with `{{LIBRECHAT_CHAT_URL_FILE}}` placeholder support
- **Comprehensive security** including IP whitelisting and file restrictions
- **Rate limiting** across multiple dimensions (IP, user, file, global)
- **Real-time monitoring** with metrics and audit logging
- **Automatic cleanup** and maintenance
- **Administrative tools** for system management

## Architecture

### Core Services

1. **UrlGeneratorService** - Generates secure download URLs with HMAC tokens
2. **DownloadService** - Handles file downloads with token validation
3. **TokenStorageService** - Manages download tokens in MongoDB
4. **MCPFileUrlService** - Provides MCP integration for `{{LIBRECHAT_CHAT_URL_FILE}}`
5. **RateLimitService** - Implements comprehensive rate limiting
6. **SecurityService** - Enforces security policies and restrictions
7. **MetricsService** - Collects real-time metrics and performance data
8. **AuditService** - Provides comprehensive audit logging
9. **CleanupSchedulerService** - Handles automatic cleanup and maintenance
10. **ConfigValidationService** - Validates configuration and provides warnings

### Database Models

- **DownloadToken** - Stores temporary download tokens with TTL
- **DownloadAuditLog** - Comprehensive audit trail for all download activities

## Configuration

### Required Environment Variables

```bash
# Secret key for token generation (minimum 32 characters)
TEMP_DOWNLOAD_SECRET_KEY=your-256-bit-secret-key-here
```

### Core Configuration

```bash
# Feature toggle
TEMP_DOWNLOAD_ENABLED=true

# TTL Configuration (seconds)
TEMP_DOWNLOAD_DEFAULT_TTL=600        # 10 minutes
TEMP_DOWNLOAD_MAX_TTL=3600          # 1 hour
TEMP_DOWNLOAD_MIN_TTL=60            # 1 minute
```

### Rate Limiting

```bash
# Rate limiting window and limits
TEMP_DOWNLOAD_RATE_WINDOW=3600           # 1 hour window
TEMP_DOWNLOAD_RATE_LIMIT_IP=100          # Per IP
TEMP_DOWNLOAD_RATE_LIMIT_USER=50         # Per user
TEMP_DOWNLOAD_RATE_LIMIT_FILE=10         # Per file
TEMP_DOWNLOAD_RATE_LIMIT_GLOBAL=1000     # Global limit
```

### Security Configuration

```bash
# IP Whitelisting
TEMP_DOWNLOAD_ALLOWED_IPS=192.168.1.0/24,10.0.0.1-10.0.0.100
TEMP_DOWNLOAD_ENFORCE_IP_WHITELIST=false

# File Restrictions
TEMP_DOWNLOAD_MAX_FILE_SIZE=104857600    # 100MB in bytes
TEMP_DOWNLOAD_ALLOWED_TYPES=pdf,jpg,png,txt,doc,docx
```

### MCP Integration

```bash
# MCP-specific configuration
TEMP_DOWNLOAD_MCP_ENABLED=true
TEMP_DOWNLOAD_MCP_DEFAULT_TTL=900       # 15 minutes
TEMP_DOWNLOAD_MCP_MAX_TTL=1800         # 30 minutes
TEMP_DOWNLOAD_MCP_RATE_LIMIT=200
```

### Cleanup and Maintenance

```bash
# Cleanup configuration
TEMP_DOWNLOAD_CLEANUP_INTERVAL=300      # 5 minutes
TEMP_DOWNLOAD_AUDIT_RETENTION=7776000   # 90 days
TEMP_DOWNLOAD_RATE_LIMIT_RETENTION=86400 # 24 hours
TEMP_DOWNLOAD_AUTO_CLEANUP=true
```

### Logging and Monitoring

```bash
# Logging configuration
TEMP_DOWNLOAD_DETAILED_LOGGING=true         # Enable detailed console logging for debugging
TEMP_DOWNLOAD_LOG_ATTEMPTS=true
TEMP_DOWNLOAD_LOG_SECURITY_EVENTS=true
TEMP_DOWNLOAD_METRICS_ENABLED=false
```

### Redis Configuration (Optional)

```bash
# Redis for distributed rate limiting
TEMP_DOWNLOAD_REDIS_URL=redis://localhost:6379
TEMP_DOWNLOAD_REDIS_PREFIX=librechat:downloads:
TEMP_DOWNLOAD_REDIS_TIMEOUT=5000
```

### Development Settings

```bash
# Development and debugging
TEMP_DOWNLOAD_DEBUG=true
TEMP_DOWNLOAD_DEV_BYPASS_RATE_LIMIT=false
TEMP_DOWNLOAD_DEV_ALLOW_INSECURE=true
```

## API Endpoints

### Download Endpoints

#### Generate Download URL
```http
POST /api/files/generate-download-url
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "fileId": "file-id-here",
  "ttlSeconds": 600,
  "singleUse": true,
  "metadata": {}
}
```

#### Download File (Public)
```http
GET /api/files/download/{fileId}?token={token}
```

### Administrative Endpoints

#### System Health
```http
GET /api/files/cleanup/system-health
Authorization: Bearer <jwt-token>
```

#### Download Statistics
```http
GET /api/files/download-stats?timeframe=24
Authorization: Bearer <jwt-token>
```

#### Cleanup Management
```http
# Get cleanup status
GET /api/files/cleanup/status

# Force cleanup
POST /api/files/cleanup/force
Content-Type: application/json
{
  "taskType": "all" // or "tokens", "contexts", "conversations"
}

# Update cleanup configuration
PUT /api/files/cleanup/config
Content-Type: application/json
{
  "config": {
    "cleanupInterval": 300,
    "debug": true
  }
}
```

#### Audit Logs
```http
GET /api/files/cleanup/audit-logs?eventType=download_attempt&limit=50
Authorization: Bearer <jwt-token>
```

#### Configuration Validation
```http
GET /api/files/cleanup/config-validation
Authorization: Bearer <jwt-token>
```

#### MongoDB Index Status
```http
GET /api/files/cleanup/index-status
Authorization: Bearer <jwt-token>
```

#### Recreate Indexes (Development Only)
```http
POST /api/files/cleanup/recreate-indexes
Authorization: Bearer <jwt-token>
```

## MCP Integration

### {{LIBRECHAT_CHAT_URL_FILE}} Placeholder

The system automatically replaces `{{LIBRECHAT_CHAT_URL_FILE}}` in MCP tool calls with a JSON string containing temporary download URLs for files in the current conversation.

**Example replacement:**
```json
{
  "files": [
    {
      "fileId": "file-123",
      "filename": "document.pdf",
      "downloadUrl": "https://your-domain.com/api/files/download/file-123?token=...",
      "expiresAt": "2024-01-01T12:00:00Z",
      "singleUse": true
    }
  ],
  "conversationId": "conv-456",
  "timestamp": "2024-01-01T11:45:00Z"
}
```

### Configuration in librechat.yaml

```yaml
mcpServers:
  file_processor:
    command: "node"
    args: ["server.js"]
    env:
      FILE_ACCESS_URL: "{{LIBRECHAT_CHAT_URL_FILE}}"
```

## Security Features

### Token Security
- HMAC-SHA256 signed tokens
- Base64 encoded with embedded metadata
- Automatic expiration with configurable TTL
- Single-use token support
- IP and User-Agent validation

### Access Control
- IP whitelisting with CIDR and range support
- File type restrictions
- File size limits
- User-based access control

### Rate Limiting
- Multi-dimensional rate limiting (IP, user, file, global)
- Redis-backed distributed limiting
- Configurable time windows
- Automatic cleanup of rate limit data

### Audit Trail
- Comprehensive logging of all download attempts
- Security event tracking
- Configurable retention periods
- MongoDB-based audit storage

## Monitoring and Metrics

### Real-time Metrics
- Download success/failure rates
- Response time tracking
- Security violation counts
- Token usage statistics

### Health Monitoring
- System health endpoints
- Automatic health checks
- Performance monitoring
- Error rate tracking

### Administrative Tools
- Configuration validation
- System status monitoring
- Cleanup management
- Audit log retrieval

## Database Schema

### DownloadToken Collection
```javascript
{
  fileId: String,           // File identifier
  tokenHash: String,        // HMAC token hash
  userId: ObjectId,         // User who generated token
  clientIP: String,         // Client IP address
  expiresAt: Date,          // Token expiration
  used: Boolean,            // Whether token has been used
  singleUse: Boolean,       // Single-use restriction
  downloadCount: Number,    // Number of downloads
  createdAt: Date,          // Creation timestamp
  downloadedAt: Date,       // Last download timestamp
  mcpClientId: String,      // MCP client identifier
  metadata: Object          // Additional metadata
}
```

### DownloadAuditLog Collection
```javascript
{
  eventType: String,        // Event type (download_attempt, security_event, etc.)
  timestamp: Date,          // Event timestamp
  userId: ObjectId,         // User involved
  fileId: String,           // File involved
  clientIP: String,         // Client IP
  success: Boolean,         // Operation success
  statusCode: Number,       // HTTP status code
  errorMessage: String,     // Error details
  securityViolations: Array,// Security violations
  responseTime: Number,     // Response time in ms
  metadata: Object          // Additional event data
}
```

## Performance Optimizations

### Database Indexes
- Compound indexes for efficient queries
- TTL indexes for automatic cleanup
- Sparse indexes for optional fields
- Performance-optimized query patterns

### Caching
- Redis integration for rate limiting
- In-memory fallback for rate limiting
- Efficient token validation
- Optimized file context management

### Cleanup and Maintenance
- Automatic token cleanup
- Configurable cleanup intervals
- Database maintenance tasks
- Memory usage optimization

## Troubleshooting

### Common Issues

1. **Invalid Token Errors**
   - Check token expiration
   - Verify IP address restrictions
   - Confirm single-use token status

2. **Rate Limit Exceeded**
   - Check rate limiting configuration
   - Verify Redis connectivity
   - Review rate limit windows

3. **File Access Denied**
   - Confirm file ownership
   - Check IP whitelist settings
   - Verify file type restrictions

4. **MCP Integration Issues**
   - Verify MCP server configuration
   - Check placeholder replacement
   - Confirm file context capture

### Debug Mode

Enable debug mode for detailed logging:
```bash
TEMP_DOWNLOAD_DEBUG=true
```

### Detailed Logging

For troubleshooting token storage and URL generation issues, enable detailed console logging:
```bash
TEMP_DOWNLOAD_DETAILED_LOGGING=true
```

When enabled, this provides:
- Detailed console output for token storage operations
- Step-by-step URL generation debugging
- MongoDB connection state information
- Validation error details
- Complete error stack traces

**Note**: Only enable this in development or when troubleshooting, as it produces verbose console output.

### Configuration Validation

Use the configuration validation endpoint to check for issues:
```http
GET /api/files/cleanup/config-validation
```

## MongoDB Index Management

### Automatic Index Creation
The system includes automatic MongoDB index management that runs on startup:
- Enhanced compound indexes for optimal query performance
- TTL indexes for automatic document cleanup
- Sparse indexes for optional fields
- Background index creation to avoid blocking operations

### Production Deployment
1. Set secure `TEMP_DOWNLOAD_SECRET_KEY` (minimum 32 characters)
2. Configure appropriate rate limits
3. Set up IP whitelisting if required
4. Configure Redis for distributed rate limiting
5. Set appropriate TTL values
6. Enable audit logging
7. Configure cleanup intervals

### Monitoring Setup
1. Monitor system health endpoints
2. Set up alerts for error rates
3. Track download statistics
4. Monitor cleanup scheduler status
5. Review audit logs regularly

## Support and Maintenance

### Regular Maintenance Tasks
- Review audit logs for security events
- Monitor download statistics
- Check system health status
- Validate configuration settings
- Review rate limiting effectiveness

### Performance Monitoring
- Track response times
- Monitor error rates
- Check database performance
- Review cleanup efficiency
- Analyze usage patterns
