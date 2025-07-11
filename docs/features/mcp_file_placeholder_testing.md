# Testing Guide for {{LIBRECHAT_CHAT_URL_FILE}} Placeholder

This guide provides step-by-step instructions for testing the new `{{LIBRECHAT_CHAT_URL_FILE}}` placeholder functionality.

## Prerequisites

1. LibreChat instance running with MCP support enabled
2. At least one MCP server configured in `librechat.yaml` with the new placeholder
3. Access to upload files in conversations

## Test Configuration

Add this test configuration to your `librechat.yaml`:

```yaml
version: 1.2.1

mcpServers:
  file-test-server:
    type: sse
    url: https://your-test-mcp-server.com/api
    headers:
      Authorization: "Bearer ${TEST_API_KEY}"
      X-File-URLs: "{{LIBRECHAT_CHAT_URL_FILE}}"
      X-User-ID: "{{LIBRECHAT_USER_ID}}"
      Content-Type: "application/json"
```

## Test Scenarios

### Test 1: No Files in Message
**Expected Behavior**: Empty files array returned

1. Start a new conversation
2. Send a message without any file attachments
3. Use an MCP tool from your configured server
4. Check the headers received by your MCP server

**Expected X-File-URLs header:**
```json
{
  "files": [],
  "message": "No files available in current context",
  "generatedAt": "2024-01-15T10:00:00Z"
}
```

### Test 2: Files in Current Message
**Expected Behavior**: URLs for uploaded files returned

1. Start a new conversation
2. Upload one or more files (PDF, image, text, etc.)
3. Send a message with the uploaded files
4. Use an MCP tool from your configured server
5. Check the headers received by your MCP server

**Expected X-File-URLs header:**
```json
{
  "conversationId": "conv-123",
  "files": [
    {
      "fileId": "file-456",
      "filename": "test-document.pdf",
      "type": "application/pdf",
      "size": 1048576,
      "downloadUrl": "https://your-librechat.com/api/files/download/file-456?token=...",
      "expiresAt": "2024-01-15T10:30:00Z",
      "singleUse": true
    }
  ],
  "generatedAt": "2024-01-15T10:00:00Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

### Test 3: Fallback to Recent Files
**Expected Behavior**: Recent conversation files returned when no current message files

1. Start a conversation and upload some files in early messages
2. Send several messages without files
3. Use an MCP tool (should get recent files from conversation)
4. Check the headers received by your MCP server

**Expected X-File-URLs header:**
```json
{
  "conversationId": "conv-123",
  "files": [
    {
      "fileId": "file-789",
      "filename": "earlier-file.pdf",
      "type": "application/pdf",
      "size": 524288,
      "downloadUrl": "https://your-librechat.com/api/files/download/file-789?token=...",
      "expiresAt": "2024-01-15T10:30:00Z",
      "singleUse": true,
      "source": "recent_conversation"
    }
  ],
  "source": "recent_conversation",
  "generatedAt": "2024-01-15T10:00:00Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

### Test 4: File Download Security
**Expected Behavior**: URLs work once and then expire

1. Get file URLs from Test 2 or 3
2. Download a file using the provided URL
3. Try to download the same file again with the same URL
4. Verify the second attempt fails (if singleUse is true)

### Test 5: URL Expiration
**Expected Behavior**: URLs expire after TTL

1. Get file URLs from Test 2 or 3
2. Wait for the TTL period (default 15 minutes)
3. Try to download files using the expired URLs
4. Verify downloads fail with appropriate error

### Test 6: User Isolation
**Expected Behavior**: Users only see their own files

1. User A uploads files in a conversation
2. User B tries to access the same conversation (if shared)
3. User B uses MCP tools
4. Verify User B only sees files they uploaded, not User A's files

## Debugging

### Check Logs

Monitor LibreChat logs for MCP file URL generation:

```bash
# Look for these log entries
grep "Generated.*file URLs for MCP client" logs/librechat.log
grep "No files found for conversation" logs/librechat.log
grep "Failed to generate.*file URLs" logs/librechat.log
```

### Verify Database

Check file records in MongoDB:

```javascript
// Connect to MongoDB and check files
db.files.find({
  conversationId: "your-conversation-id",
  user: ObjectId("your-user-id")
}).sort({createdAt: -1}).limit(10)
```

### Test MCP Server Response

Create a simple test MCP server that logs received headers:

```javascript
// Simple test server to log headers
app.post('/api', (req, res) => {
  console.log('Received headers:', req.headers);
  console.log('X-File-URLs:', req.headers['x-file-urls']);
  res.json({ status: 'received' });
});
```

## Common Issues

### Issue: Empty files array when files are uploaded
**Solution**: Check that files are properly associated with the conversation and user

### Issue: URLs return 404 or access denied
**Solution**: Verify user permissions and file ownership

### Issue: Placeholder not replaced
**Solution**: Check MCP server configuration and ensure placeholder syntax is correct

### Issue: Files from wrong conversation
**Solution**: Verify conversation context is properly passed to MCP tools

## Environment Variables

Configure these environment variables for testing:

```bash
# MCP File URL Configuration
MCP_FILE_URL_TTL=900                    # 15 minutes for testing
MCP_FILE_URL_MAX_TTL=3600              # 1 hour max
MCP_FILE_URL_MIN_TTL=60                # 1 minute min

# Enable debug logging
DEBUG_MCP=true
LOG_LEVEL=debug
```

## Success Criteria

✅ Empty files array when no files in message context
✅ Correct file URLs when files are uploaded with message  
✅ Fallback to recent files when no current message files
✅ URLs work for authorized downloads
✅ URLs expire after TTL or single use
✅ User isolation maintained
✅ Proper error handling and logging
✅ No security vulnerabilities or unauthorized access
