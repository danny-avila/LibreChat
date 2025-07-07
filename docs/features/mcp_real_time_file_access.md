# MCP Real-Time File Access System

## Overview

This document describes the new real-time file interception system for MCP (Model Context Protocol) file access in LibreChat. This system replaces the previous database-querying approach that suffered from timing and consistency issues.

## Problem Statement

The original MCP file access system had fundamental issues:

1. **Timing Issues**: Database queries for files happened after the conversation was updated, causing race conditions
2. **Consistency Problems**: Files were available in memory during message processing but not yet committed to database
3. **Complex Fallback Logic**: Required multiple database queries and retry mechanisms
4. **Unreliable Results**: Users experienced empty file responses even when files were present

## Solution: Real-Time File Interception

### Architecture

The new system captures files at the exact moment they're being processed in the message sending pipeline, providing immediate access without database dependencies.

#### Components

1. **ActiveFileContextService**: In-memory service that captures and stores file contexts
2. **Message Pipeline Hooks**: Interception points in chat controllers
3. **Enhanced MCPFileUrlService**: Updated to use active contexts instead of database queries

### File Capture Flow

```
User sends message with files
    ↓
Chat Controller receives request (files in req.body.files)
    ↓
ActiveFileContextService.captureFiles() - CAPTURE POINT
    ↓
Message processing continues
    ↓
MCP tool execution
    ↓
MCPFileUrlService uses active context
    ↓
Immediate file access (no database queries)
```

### Implementation Details

#### 1. ActiveFileContextService

**Location**: `api/server/services/Files/ActiveFileContextService.js`

**Key Features**:
- In-memory storage of file contexts by conversation ID
- Security validation (user ID matching)
- Automatic cleanup of expired contexts (30 minutes)
- Thread-safe operations

**Methods**:
- `captureFiles(conversationId, userId, files, requestContext)`: Capture files during message processing
- `getActiveFiles(conversationId, userId)`: Retrieve active files for MCP access
- `clearFiles(conversationId)`: Manual cleanup
- `getStats()`: Service statistics

#### 2. Message Pipeline Hooks

**Locations**:
- `api/server/controllers/assistants/chatV1.js`
- `api/server/controllers/assistants/chatV2.js`
- `api/server/controllers/agents/request.js`

**Implementation**:
```javascript
// Capture files for real-time MCP access
if (files.length > 0 && conversationId) {
  activeFileContextService.captureFiles(conversationId, req.user.id, files, {
    endpoint,
    messageId,
    parentMessageId,
    model
  });
}
```

#### 3. Enhanced MCPFileUrlService

**Location**: `api/server/services/Files/MCPFileUrlService.js`

**Changes**:
- Primary source: Active file context
- Fallback: Recent user files (database)
- Removed complex conversation/message querying logic
- Simplified error handling

**Flow**:
```javascript
// Try active context first
const activeContext = activeFileContextService.getActiveFiles(conversationId, userId);

if (activeContext && activeContext.files.length > 0) {
  // Use real-time files
  files = activeContext.files;
  source = 'active_context';
} else {
  // Fallback to recent user files
  files = await File.find({ user: userId }).limit(5);
  source = 'recent_user_files';
}
```

## Benefits

### 1. Reliability
- **100% file availability** during message processing
- **No timing issues** - files captured at the exact moment they're available
- **Consistent results** - same files available to MCP tools as to AI models

### 2. Performance
- **No database queries** for active conversations
- **Immediate response** - files available in memory
- **Reduced server load** - eliminates retry mechanisms and complex queries

### 3. Simplicity
- **Single source of truth** - active context during message processing
- **Clear data flow** - capture → store → retrieve
- **Easier debugging** - straightforward logging and monitoring

## Usage

### For MCP Tool Developers

The `{{LIBRECHAT_CHAT_URL_FILE}}` placeholder now provides:

1. **Real-time files** from the current message context (primary)
2. **Recent user files** as fallback (if no active context)

**Response Format**:
```json
{
  "conversationId": "conv-123",
  "files": [
    {
      "fileId": "file-456",
      "filename": "document.pdf",
      "type": "application/pdf",
      "size": 1048576,
      "downloadUrl": "https://librechat.ai/api/files/download/file-456?token=...",
      "expiresAt": "2024-01-15T10:30:00Z",
      "singleUse": true
    }
  ],
  "source": "active_context",
  "generatedAt": "2024-01-15T10:00:00Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

**Source Types**:
- `active_context`: Files from current message processing
- `recent_user_files`: Fallback to recent uploads

### For System Administrators

**Monitoring**:
```javascript
// Get service statistics
const stats = activeFileContextService.getStats();
console.log('Active contexts:', stats.activeContexts);
```

**Configuration**:
- Context expiration: 30 minutes (configurable)
- Cleanup interval: 5 minutes
- Fallback file limit: 5 files

## Migration Notes

### Removed Components
- Complex conversation file querying logic
- Message-based file discovery
- Retry mechanisms for database timing
- Multiple fallback strategies

### Backward Compatibility
- MCP placeholder syntax unchanged: `{{LIBRECHAT_CHAT_URL_FILE}}`
- Response format maintained
- Download URL generation unchanged

## Monitoring and Debugging

### Log Messages

**File Capture**:
```
[ActiveFileContextService] Captured files for conversation: { conversationId, userId, fileCount, files }
```

**File Retrieval**:
```
[MCPFileUrlService] Using files from active context: { conversationId, fileCount, files }
```

**Fallback Usage**:
```
[MCPFileUrlService] No active context, falling back to recent user files...
```

### Error Handling

- **Security violations**: User ID mismatches logged as warnings
- **Expired contexts**: Automatic cleanup with debug logging
- **Missing contexts**: Graceful fallback to recent files

## Future Enhancements

1. **Persistent Context Storage**: Redis-based storage for multi-instance deployments
2. **File Type Filtering**: Context-aware file filtering based on MCP tool requirements
3. **Advanced Caching**: Intelligent caching strategies for frequently accessed files
4. **Real-time Updates**: WebSocket-based file context updates

## Conclusion

The real-time file interception system provides a robust, reliable, and performant solution for MCP file access in LibreChat. By capturing files at the moment they're being processed, we eliminate timing issues and provide immediate access to file data for MCP tools.
