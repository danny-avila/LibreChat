# OpenID Connect Deployment Guide for auth.xcity.one Integration

## Overview

This guide provides step-by-step instructions for configuring xct-chat to use auth.xcity.one as the OpenID Connect authentication provider.

## Prerequisites

1. Access to auth.xcity.one admin panel to register OAuth clients
2. Access to deployment environment (Railway, Docker, etc.)
3. Client credentials from auth.xcity.one (CLIENT_ID and CLIENT_SECRET)

## Registration at auth.xcity.one

Before configuring environment variables, you must register xct-chat as an OAuth client at auth.xcity.one:

1. Log in to auth.xcity.one admin panel
2. Create a new OAuth/OIDC client with the following settings:
   - **Client Name**: Xcity Chat
   - **Redirect URI**: `https://chat.xcity.one/oauth/openid/callback`
   - **Post Logout Redirect URI**: `https://chat.xcity.one/login`
   - **Scopes**: `openid profile email`
   - **Grant Type**: Authorization Code
3. Save the generated `CLIENT_ID` and `CLIENT_SECRET`

## Environment Variables Configuration

### Required Core OIDC Settings

These are mandatory for OpenID Connect to be enabled (verified in `api/server/socialLogins.js:84-92`):

```bash
# Client credentials from auth.xcity.one
OPENID_CLIENT_ID=<your-client-id-from-auth.xcity.one>
OPENID_CLIENT_SECRET=<your-client-secret-from-auth.xcity.one>

# OIDC provider endpoint
OPENID_ISSUER=https://auth.xcity.one

# Session secret (generate a random string, minimum 32 characters)
# Example: openssl rand -base64 32
OPENID_SESSION_SECRET=<generate-random-string-min-32-chars>

# OAuth scopes
OPENID_SCOPE="openid profile email"

# Callback path (relative to DOMAIN_CLIENT)
OPENID_CALLBACK_URL=/oauth/openid/callback
```

### Auto-Redirect Configuration

Enable automatic redirect to auth.xcity.one for unauthenticated users:

```bash
# Bypass login form and redirect directly to auth.xcity.one
OPENID_AUTO_REDIRECT=true
```

### Login Button Customization

Configure the OpenID login button appearance:

```bash
# Button text
OPENID_BUTTON_LABEL="Login with Xcity"

# Button logo (path relative to client public directory)
OPENID_IMAGE_URL=/logo.png
```

### Logout Synchronization

Enable logout synchronization with auth.xcity.one:

```bash
# Use OIDC end session endpoint for logout
OPENID_USE_END_SESSION_ENDPOINT=true

# Redirect URL after logout
OPENID_POST_LOGOUT_REDIRECT_URI=https://chat.xcity.one/login
```

### Domain Configuration

Set the correct domain URLs for production:

```bash
DOMAIN_CLIENT=https://chat.xcity.one
DOMAIN_SERVER=https://chat.xcity.one
```

### Disable Local Authentication (Optional but Recommended)

For auth.xcity.one-only authentication, disable local email/password login:

```bash
# Disable local email/password login
ALLOW_EMAIL_LOGIN=false

# Disable local registration
ALLOW_REGISTRATION=false
```

## Complete Configuration Example

Here's a complete example of all required environment variables:

```bash
# Core OIDC Configuration
OPENID_CLIENT_ID=xcity-chat-client-abc123
OPENID_CLIENT_SECRET=super-secret-key-xyz789
OPENID_ISSUER=https://auth.xcity.one
OPENID_SESSION_SECRET=randomly-generated-32-char-secret-key-here
OPENID_SCOPE="openid profile email"
OPENID_CALLBACK_URL=/oauth/openid/callback

# Auto-redirect
OPENID_AUTO_REDIRECT=true

# Button Customization
OPENID_BUTTON_LABEL="Login with Xcity"
OPENID_IMAGE_URL=/logo.png

# Logout Sync
OPENID_USE_END_SESSION_ENDPOINT=true
OPENID_POST_LOGOUT_REDIRECT_URI=https://chat.xcity.one/login

# Domain
DOMAIN_CLIENT=https://chat.xcity.one
DOMAIN_SERVER=https://chat.xcity.one

# Disable Local Auth
ALLOW_EMAIL_LOGIN=false
ALLOW_REGISTRATION=false
```

## Deployment Platforms

### Railway

1. Go to your Railway project dashboard
2. Select the xct-chat service
3. Navigate to **Variables** tab
4. Add each environment variable from the configuration above
5. Click **Deploy** to restart the service with new variables

### Docker / Docker Compose

1. Create a `.env` file in the project root (not tracked in git)
2. Copy the configuration from above and fill in actual values
3. Update `docker-compose.yml` to use `env_file: .env`
4. Restart containers: `docker-compose down && docker-compose up -d`

### Other Platforms

For other deployment platforms (Heroku, Render, etc.), use their respective environment variable configuration interfaces to set the values from the configuration above.

## Verification Steps

After deployment, verify the integration:

1. **Auto-redirect Test**
   - Visit `https://chat.xcity.one` without being logged in
   - You should be automatically redirected to `https://auth.xcity.one/authorize?...`

2. **Login Flow Test**
   - Complete login at auth.xcity.one
   - Verify callback to `https://chat.xcity.one/oauth/openid/callback`
   - Verify successful entry into chat interface

3. **Logout Sync Test**
   - Click logout in xct-chat
   - Verify you're logged out of auth.xcity.one as well
   - Verify redirect to `https://chat.xcity.one/login`

4. **Local Login Disabled Test**
   - Verify email/password login form is not shown (if `ALLOW_EMAIL_LOGIN=false`)
   - Verify registration page is not accessible (if `ALLOW_REGISTRATION=false`)

## Troubleshooting

### OpenID Not Activating

If OpenID login is not appearing, check that ALL required variables are set:
- `OPENID_CLIENT_ID`
- `OPENID_CLIENT_SECRET`
- `OPENID_ISSUER`
- `OPENID_SCOPE`
- `OPENID_SESSION_SECRET`

Missing even one of these will prevent OpenID from being enabled (see `api/server/socialLogins.js:84-92`).

### Redirect URI Mismatch

If you see "redirect_uri_mismatch" errors:
- Verify the callback URL registered at auth.xcity.one exactly matches: `https://chat.xcity.one/oauth/openid/callback`
- Check that `DOMAIN_CLIENT` is set to `https://chat.xcity.one` (no trailing slash)

### Session Issues

If users are repeatedly logged out:
- Ensure `OPENID_SESSION_SECRET` is set and persistent across deployments
- Check session cookie settings in browser developer tools

### CORS Errors

If you see CORS errors during authentication:
- Verify auth.xcity.one allows `https://chat.xcity.one` as an authorized origin
- Check that both `DOMAIN_CLIENT` and `DOMAIN_SERVER` are correctly set

## Security Considerations

1. **Never commit `.env` files** with real credentials to version control
2. **Rotate `OPENID_SESSION_SECRET`** periodically (note: will invalidate existing sessions)
3. **Use HTTPS** in production (enforced by using `https://` in DOMAIN_CLIENT/SERVER)
4. **Restrict OIDC scopes** to only what's needed (current: `openid profile email`)
5. **Keep `OPENID_CLIENT_SECRET`** confidential and secure

## References

- LibreChat OpenID Documentation: Check official LibreChat docs for advanced OpenID features
- auth.xcity.one Documentation: Refer to auth.xcity.one admin panel for OIDC provider details
- Code Implementation: `api/server/socialLogins.js:84-92` (OpenID validation logic)
