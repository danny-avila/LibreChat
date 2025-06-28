# MCP File URL Placeholder System

## Overview

The `{{LIBRECHAT_CHAT_URL_FILE}}` placeholder system enables MCP (Model Context Protocol) servers to securely access files uploaded to conversations through temporary, signed URLs. This feature provides a secure way for MCP servers to download and process files while maintaining LibreChat's security model.

## Features

- **Secure File Access**: Generate temporary, signed URLs for conversation files
- **One-Time Use**: URLs are automatically disabled after first download (configurable)
- **Time-Limited**: URLs expire after a configurable TTL (default: 15 minutes)
- **Conversation-Scoped**: Only files from the current conversation are accessible
- **Audit Trail**: All download attempts are logged for security monitoring
- **MCP Integration**: Seamlessly integrates with existing MCP server configurations

## How It Works

1. **Placeholder Detection**: When MCP servers are initialized, the system detects `{{LIBRECHAT_CHAT_URL_FILE}}` placeholders in headers or environment variables
2. **Context Extraction**: The system extracts conversation context from the current chat session
3. **File Discovery**: The system looks for files in the following order:
   - Files from recent messages in the current conversation (last 10 messages with files)
   - Recent files uploaded by the user (fallback, limited to last 5 files)
4. **URL Generation**: Temporary, signed download URLs are generated for each accessible file
5. **JSON Response**: A JSON object containing file metadata and download URLs is returned
6. **Secure Download**: MCP servers can use the URLs to download files securely

**Important**: Files are discovered from recent messages in the conversation. The system queries the last 10 messages that contain files and provides download URLs for those files. Empty responses are returned when no files are available.

## Configuration

### Environment Variables

```bash
# MCP File URL Configuration
MCP_FILE_URL_TTL=900                    # Default TTL in seconds (15 minutes)
MCP_FILE_URL_MAX_TTL=3600              # Maximum TTL in seconds (1 hour)
MCP_FILE_URL_MIN_TTL=60                # Minimum TTL in seconds (1 minute)

# Temporary Download Configuration (inherited)
TEMP_DOWNLOAD_SECRET_KEY=your-secret-key-here
TEMP_DOWNLOAD_DEFAULT_TTL=600
TEMP_DOWNLOAD_MAX_TTL=3600
TEMP_DOWNLOAD_MIN_TTL=60
```

### librechat.yaml Configuration

```yaml
version: 1.2.1

mcpServers:
  document-processor:
    type: sse
    url: https://your-mcp-server.com/api
    headers:
      Authorization: "Bearer ${MCP_API_KEY}"
      X-File-URLs: "{{LIBRECHAT_CHAT_URL_FILE}}"
      X-User-ID: "{{LIBRECHAT_USER_ID}}"
    
  file-analyzer:
    command: node
    args: ["mcp-server.js"]
    env:
      CONVERSATION_FILES: "{{LIBRECHAT_CHAT_URL_FILE}}"
      USER_EMAIL: "{{LIBRECHAT_USER_EMAIL}}"
      API_KEY: "${ANALYZER_API_KEY}"
```

## Usage Examples

### Basic Header Configuration

```yaml
mcpServers:
  my-server:
    type: sse
    url: https://api.example.com
    headers:
      X-Files: "{{LIBRECHAT_CHAT_URL_FILE}}"
```

### Environment Variable Configuration

```yaml
mcpServers:
  my-server:
    command: python
    args: ["server.py"]
    env:
      LIBRECHAT_FILES: "{{LIBRECHAT_CHAT_URL_FILE}}"
```

### Combined with Other Placeholders

```yaml
mcpServers:
  comprehensive-server:
    type: sse
    url: https://api.example.com
    headers:
      Authorization: "Bearer ${API_TOKEN}"
      X-User-ID: "{{LIBRECHAT_USER_ID}}"
      X-User-Email: "{{LIBRECHAT_USER_EMAIL}}"
      X-Files: "{{LIBRECHAT_CHAT_URL_FILE}}"
      X-Custom-Var: "{{CUSTOM_VARIABLE}}"
```

## Response Format

The `{{LIBRECHAT_CHAT_URL_FILE}}` placeholder is replaced with a JSON string containing:

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
    },
    {
      "fileId": "file-789",
      "filename": "image.png",
      "type": "image/png",
      "size": 524288,
      "downloadUrl": "https://librechat.ai/api/files/download/file-789?token=...",
      "expiresAt": "2024-01-15T10:30:00Z",
      "singleUse": true
    }
  ],
  "generatedAt": "2024-01-15T10:00:00Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

### Empty Response

When no files are available in the current message context:

```json
{
  "files": [],
  "message": "No files available in current context",
  "generatedAt": "2024-01-15T10:00:00Z"
}
```

### Message Files Response

When files are found from recent messages:

```json
{
  "conversationId": "conv-123",
  "files": [
    {
      "fileId": "file-456",
      "filename": "recent-document.pdf",
      "type": "application/pdf",
      "size": 1048576,
      "downloadUrl": "https://librechat.ai/api/files/download/file-456?token=...",
      "expiresAt": "2024-01-15T10:30:00Z",
      "singleUse": true
    }
  ],
  "source": "message_files",
  "generatedAt": "2024-01-15T10:00:00Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

### Error Response

When an error occurs:

```json
{
  "files": [],
  "error": "Failed to generate file URLs",
  "generatedAt": "2024-01-15T10:00:00Z"
}
```

## Security Considerations

### Access Control
- Only files from the current conversation are accessible
- User must own the conversation to access files
- Downloads are limited to enabled files only

### Token Security
- URLs contain cryptographically signed tokens
- Tokens are single-use by default
- Tokens expire automatically
- All download attempts are audited

### Rate Limiting
- IP-based rate limiting prevents abuse
- User-based rate limiting for authenticated requests
- File-specific rate limiting prevents targeted attacks

## MCP Server Implementation

### Python Example

```python
import json
import requests
import os

def process_files():
    # Get file URLs from environment
    files_json = os.environ.get('LIBRECHAT_FILES', '{"files": []}')
    files_data = json.loads(files_json)
    
    for file_info in files_data['files']:
        # Download file
        response = requests.get(file_info['downloadUrl'])
        if response.status_code == 200:
            # Process file content
            process_file_content(response.content, file_info)
        else:
            print(f"Failed to download {file_info['filename']}")

def process_file_content(content, file_info):
    # Your file processing logic here
    print(f"Processing {file_info['filename']} ({file_info['size']} bytes)")
```

### Node.js Example

```javascript
const axios = require('axios');

async function processFiles() {
  // Get file URLs from headers or environment
  const filesJson = process.env.CONVERSATION_FILES || '{"files": []}';
  const filesData = JSON.parse(filesJson);
  
  for (const fileInfo of filesData.files) {
    try {
      // Download file
      const response = await axios.get(fileInfo.downloadUrl, {
        responseType: 'arraybuffer'
      });
      
      // Process file content
      await processFileContent(response.data, fileInfo);
    } catch (error) {
      console.error(`Failed to download ${fileInfo.filename}:`, error.message);
    }
  }
}

async function processFileContent(buffer, fileInfo) {
  // Your file processing logic here
  console.log(`Processing ${fileInfo.filename} (${fileInfo.size} bytes)`);
}
```

## Troubleshooting

### Common Issues

1. **Empty files array**: Ensure files are uploaded to the current conversation
2. **Token expired**: Check TTL configuration and download timing
3. **Access denied**: Verify user permissions and conversation ownership
4. **Rate limited**: Check rate limiting configuration and usage patterns

### Debug Information

Enable debug logging to troubleshoot issues:

```bash
DEBUG_MCP=true
LOG_LEVEL=debug
```

### Monitoring

Monitor the following metrics:
- Download success/failure rates
- Token usage patterns
- Rate limiting triggers
- File access patterns

## Best Practices

1. **Handle Errors Gracefully**: Always check for empty files arrays and error responses
2. **Respect Rate Limits**: Implement proper retry logic with exponential backoff
3. **Secure Token Handling**: Never log or expose download tokens
4. **Efficient Downloads**: Download files only when needed
5. **Cleanup**: Clean up temporary files after processing

## Migration Guide

If you're upgrading from a previous version:

1. Update your `librechat.yaml` configuration
2. Test MCP server integration with new placeholder
3. Update MCP server code to handle new JSON format
4. Monitor logs for any issues during transition
