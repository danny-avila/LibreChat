# OpenID Connect Federated Provider Token Implementation

## Overview

This implementation adds support for passing **federated provider tokens** (Cognito, Azure AD, Auth0, etc.) as variables in LibreChat's `librechat.yaml` configuration for both custom endpoints and MCP servers. These are the actual tokens issued by your federated identity provider, enabling downstream services to validate and authorize users directly.

## Features

### Supported Variables

- `{{LIBRECHAT_OPENID_TOKEN}}` - The current user's access token from federated provider (default)
- `{{LIBRECHAT_OPENID_ACCESS_TOKEN}}` - Access token specifically from federated provider
- `{{LIBRECHAT_OPENID_ID_TOKEN}}` - ID token with user claims from federated provider
- `{{LIBRECHAT_OPENID_USER_ID}}` - User ID from federated provider token (subject claim)
- `{{LIBRECHAT_OPENID_USER_EMAIL}}` - User email from federated provider token
- `{{LIBRECHAT_OPENID_USER_NAME}}` - User name from federated provider token
- `{{LIBRECHAT_OPENID_EXPIRES_AT}}` - Token expiration timestamp

### Usage Examples

#### Custom Endpoints with Cognito

```yaml
endpoints:
  custom:
    - name: 'CognitoProtectedAPI'
      apiKey: '${API_KEY}'
      baseURL: 'https://api.example.com'
      headers:
        Authorization: 'Bearer {{LIBRECHAT_OPENID_TOKEN}}'
        X-Cognito-User-ID: '{{LIBRECHAT_OPENID_USER_ID}}'
        X-User-Email: '{{LIBRECHAT_OPENID_USER_EMAIL}}'
      models:
        default: ['gpt-4']
```

#### MCP Servers with AWS Cognito

```yaml
mcpServers:
  aws-cognito-service:
    command: node
    args:
      - server.js
    env:
      COGNITO_ACCESS_TOKEN: '{{LIBRECHAT_OPENID_ACCESS_TOKEN}}'
      COGNITO_ID_TOKEN: '{{LIBRECHAT_OPENID_ID_TOKEN}}'
      USER_SUB: '{{LIBRECHAT_OPENID_USER_ID}}'
      USER_EMAIL: '{{LIBRECHAT_OPENID_USER_EMAIL}}'

  cognito-http-service:
    type: sse
    url: 'https://mcp.example.com/sse'
    headers:
      Authorization: 'Bearer {{LIBRECHAT_OPENID_TOKEN}}'
      X-Cognito-ID-Token: '{{LIBRECHAT_OPENID_ID_TOKEN}}'
      X-User-Info: '{{LIBRECHAT_OPENID_USER_EMAIL}}'
```

#### Azure AD Example

```yaml
mcpServers:
  azure-ad-service:
    command: node
    args:
      - azure-server.js
    env:
      AZURE_ACCESS_TOKEN: '{{LIBRECHAT_OPENID_ACCESS_TOKEN}}'
      AZURE_ID_TOKEN: '{{LIBRECHAT_OPENID_ID_TOKEN}}'
      AAD_USER_OID: '{{LIBRECHAT_OPENID_USER_ID}}'
```

## Implementation Details

### Architecture

The implementation extends LibreChat's existing template variable system:

1. **OpenID Connect Module** (`packages/api/src/utils/oidc.ts`)
   - **Federated token extraction** from user session (Cognito, Azure AD, Auth0, etc.)
   - Token validation and expiration checking
   - JWT claims parsing for ID tokens
   - Placeholder processing for federated provider tokens
   - Security utilities

2. **Integration** (`packages/api/src/utils/env.ts`)
   - Extended `processSingleValue()` function
   - OpenID Connect federated provider placeholder resolution
   - Maintains backward compatibility with existing variables

### Security Features

- **Federated Token Validation**: Checks token expiration before processing
- **OpenID Connect Availability**: Validates OpenID Connect configuration exists
- **Secure Processing**: Only processes valid, non-expired federated provider tokens
- **JWT Claims Parsing**: Safely extracts claims from ID tokens without verification
- **Error Handling**: Graceful fallbacks for missing or invalid tokens
- **Provider Agnostic**: Works with Cognito, Azure AD, Auth0, Keycloak, etc.

### Token Flow

1. User authenticates via federated OpenID Connect provider (Cognito, Azure AD, etc.)
2. **Federated provider tokens** stored in user session/object
3. Configuration parsing extracts OpenID Connect placeholders
4. `processSingleValue()` calls federated token processor
5. Valid federated tokens replace placeholders
6. **Raw provider tokens** passed to downstream services for validation

## Configuration Requirements

### Environment Variables

OpenID Connect federated provider must be properly configured with:

**For AWS Cognito:**
```bash
OPENID_CLIENT_ID=your-cognito-client-id
OPENID_CLIENT_SECRET=your-cognito-client-secret
OPENID_ISSUER=https://cognito-idp.region.amazonaws.com/us-east-1_POOL123
```

**For Azure AD:**
```bash
OPENID_CLIENT_ID=your-azure-app-id
OPENID_CLIENT_SECRET=your-azure-client-secret
OPENID_ISSUER=https://login.microsoftonline.com/tenant-id/v2.0
```

**For Auth0:**
```bash
OPENID_CLIENT_ID=your-auth0-client-id
OPENID_CLIENT_SECRET=your-auth0-client-secret
OPENID_ISSUER=https://your-domain.auth0.com/
```

### LibreChat Configuration

Enable OIDC in your LibreChat registration:

```yaml
registration:
  socialLogins: ['openid']
```

## Security Considerations

### Federated Token Security

- **Server-side Processing**: Federated provider tokens are only processed server-side
- **Expiration Validation**: Expired tokens are automatically rejected
- **No Client Exposure**: Tokens never stored in client-side configuration
- **Pre-validation**: Tokens validated before each use
- **JWT Claims**: ID token claims safely extracted without verification

### Best Practices

1. **Use HTTPS**: Always use HTTPS for downstream services receiving tokens
2. **Token Scopes**: Ensure federated provider tokens have appropriate scopes
3. **Token Validation**: Downstream services should validate received federated tokens
4. **Expiration Monitoring**: Monitor token expiration and refresh cycles
5. **Provider-Specific**: Configure according to your federated provider (Cognito, Azure AD, etc.)

### Federated Provider Considerations

**AWS Cognito:**
- Use `sub` claim for user identification
- Validate tokens against Cognito User Pool
- Consider token refresh for long-running sessions

**Azure AD:**
- Use `oid` or `sub` claim for user identification
- Validate tokens against Azure AD tenant
- Configure appropriate scopes (openid, profile, email)

**Auth0:**
- Use `sub` claim for user identification
- Validate tokens against Auth0 domain
- Configure custom claims as needed

### Risk Mitigation

- **No Token Exposure**: Tokens never appear in logs or client responses
- **Validation Layer**: Multi-level validation prevents invalid token usage
- **Graceful Degradation**: System continues working if OIDC unavailable
- **Error Isolation**: OIDC failures don't break other functionality

## Testing

Comprehensive test suite covers:

- **Federated token extraction** from multiple storage locations
- **JWT claims parsing** from ID tokens
- **Provider-specific scenarios** (Cognito, Azure AD examples)
- Placeholder processing for all variable types
- Integration with existing LibreChat systems
- Security edge cases and error handling
- Token expiration and validation scenarios

Run tests:
```bash
npm test -- src/tests/oidc-integration.test.ts
```

## Migration Guide

### Existing Deployments

1. **Update Code**: Apply the implementation changes
2. **Configure Federated Provider**: Set up OpenID Connect environment variables for your provider (Cognito, Azure AD, etc.)
3. **Update Config**: Add OpenID Connect variables to librechat.yaml
4. **Verify Token Storage**: Ensure federated provider tokens are stored in user session
5. **Test Integration**: Verify downstream services receive and validate federated provider tokens
6. **Monitor**: Check logs for any integration issues

### Backward Compatibility

- Existing configurations continue working unchanged
- New OpenID Connect variables are additive, not replacing existing functionality
- Non-OpenID Connect users see no functional changes
- All existing template variables remain supported
- Works alongside current `{{LIBRECHAT_USER_*}}` and `{{LIBRECHAT_BODY_*}}` variables

## Troubleshooting

### Common Issues

1. **Empty Token Values**
   - Check OpenID Connect federated provider configuration
   - Verify user authenticated via federated provider (not local auth)
   - Confirm federated tokens stored in user session
   - Check token not expired

2. **Authentication Failures**
   - Validate downstream service expects federated provider tokens
   - Verify downstream service configured to validate against your provider
   - Check token scopes and permissions from federated provider
   - Verify HTTPS endpoints

3. **Variable Not Replaced**
   - Confirm user authenticated via OpenID Connect (not Google, Facebook, etc.)
   - Check federated token validity and expiration
   - Verify placeholder syntax uses `OPENID` not `OIDC`
   - Ensure tokens stored in `federatedTokens` or `openidTokens`

### Debug Steps

1. Check LibreChat logs for OpenID Connect errors
2. Verify federated provider environment variables set correctly
3. Test OpenID Connect authentication flow
4. Confirm federated tokens are stored in user session
5. Validate downstream service configuration for your provider
6. Monitor federated token expiration times
7. Test token validation with your federated provider's validation endpoint

## Future Enhancements

### Potential Improvements

1. **Token Refresh**: Automatic token refresh handling
2. **Scope Validation**: Verify token scopes match requirements
3. **Multi-Provider**: Support multiple OIDC providers
4. **Token Claims**: Access to specific JWT claims
5. **Caching**: Token caching for performance optimization

### Integration Opportunities

- Integration with existing session management
- Enhanced MCP server authentication
- Custom endpoint security improvements
- Audit logging for token usage
- Advanced claim-based authorization

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review LibreChat documentation
3. Submit GitHub issues with relevant logs
4. Include OIDC provider and configuration details (without secrets)

## License

This implementation follows LibreChat's existing license terms.