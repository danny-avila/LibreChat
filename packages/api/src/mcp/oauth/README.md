# MCP OAuth Implementation

This implementation provides OAuth authentication support for MCP (Model Context Protocol) servers in LibreChat.

## Overview

The MCP OAuth implementation follows the OAuth 2.0 authorization code flow with PKCE (Proof Key for Code Exchange) for enhanced security. OAuth authentication is automatically triggered when an MCP server returns a 401 Unauthorized response during initial connection.

## Key Components

### 1. OAuth Handler (`handler.ts`)
- Manages the OAuth flow lifecycle
- Supports OAuth metadata discovery
- Handles dynamic client registration
- Implements PKCE for secure authorization

### 2. Token Storage (`tokenStorage.ts`)
- Securely stores OAuth tokens using encryption
- Manages token lifecycle (create, read, update, delete)
- Handles token expiration checks

### 3. OAuth Routes (`mcp.js`)
- `/api/mcp/:serverName/oauth/callback` - Handles OAuth callback
- `/api/mcp/oauth/tokens/:flowId` - Retrieves tokens for completed flows
- `/api/mcp/oauth/status/:flowId` - Check OAuth flow status

### 4. Connection Integration
- MCPConnection automatically includes OAuth tokens in request headers
- Detects OAuth authentication errors (401/403) during connection
- Emits 'oauthRequired' events for authentication

## OAuth Flow

1. **Connection Attempt**: LibreChat attempts to connect to MCP server on startup
2. **401 Response**: Server returns 401 Unauthorized if OAuth is required
3. **Auto-Discovery**: System discovers OAuth endpoints (if not pre-configured)
4. **Registration**: Dynamic client registration (if needed)
5. **Authorization**: Authorization URL is displayed in the terminal
6. **User Action**: Admin visits the URL and authorizes the application
7. **Callback**: Authorization code is exchanged for tokens
8. **Storage**: Tokens are encrypted and stored
9. **Retry**: Connection can be retried with OAuth tokens

## Terminal Output Example

When OAuth is required, you'll see output like this in the terminal:

```
═══════════════════════════════════════════════════════════════════════
[MCP][todo-app] OAuth authentication required

Please visit the following URL to authenticate:

  https://auth.example.com/authorize?client_id=...&redirect_uri=...

Flow ID: system:todo-app:1234567890
═══════════════════════════════════════════════════════════════════════
```

## Configuration

MCP servers can be configured with OAuth settings in the MCP configuration:

```typescript
{
  "serverName": {
    "url": "https://mcp-server.example.com",
    "type": "sse",
    "oauth": {
      "authorization_url": "https://auth.example.com/authorize",
      "token_url": "https://auth.example.com/token",
      "client_id": "your-client-id",
      "client_secret": "your-client-secret",
      "scope": "read write",
      "redirect_uri": "https://your-app.com/api/mcp/serverName/oauth/callback"
    }
  }
}
```

If OAuth configuration is not provided, the system will attempt auto-discovery when a 401 response is received.

## Security Considerations

1. **Token Encryption**: All tokens are encrypted using AES-256-GCM before storage
2. **PKCE**: Proof Key for Code Exchange is used to prevent authorization code interception
3. **State Parameter**: Secure state parameters prevent CSRF attacks
4. **User Isolation**: Tokens are stored per-user and per-server
5. **Automatic Cleanup**: Tokens are removed when connections are disconnected

## Error Handling

- **401/403 Errors**: Automatically trigger OAuth authentication flow
- **Token Expiration**: Automatic detection with refresh token support (future enhancement)
- **Flow Timeout**: OAuth flows expire after 10 minutes
- **Invalid State**: Prevents replay attacks

## Checking OAuth Status

You can check the status of an OAuth flow using the status endpoint:

```bash
curl http://localhost:3080/api/mcp/oauth/status/system:todo-app:1234567890
```

Response:
```json
{
  "status": "COMPLETED",
  "completed": true,
  "failed": false,
  "error": null
}
```

## Future Enhancements

1. **Automatic Retry**: Automatically retry connection after OAuth completion
2. **Token Refresh**: Automatic refresh token handling
3. **Token Revocation**: Explicit token revocation support
4. **Multiple Auth Methods**: Support for other authentication methods
5. **Web-based Flow**: Option to complete OAuth through web UI instead of terminal 