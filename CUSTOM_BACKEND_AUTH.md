# Custom Backend Authentication for LibreChat

This implementation replaces LibreChat's default authentication with your proprietary backend authentication system.

## Overview

The custom authentication system consists of several components:

1. **Custom Backend Strategy** (`customBackendStrategy.js`) - Handles authentication with your backend
2. **Custom JWT Strategy** (`customJwtStrategy.js`) - Validates both LibreChat and backend tokens
3. **Custom Auth Middleware** (`requireCustomBackendAuth.js`) - Replaces local auth middleware
4. **Custom Auth Service** (`CustomBackendAuthService.js`) - Handles token refresh and management
5. **Custom Controllers** - Handle login and refresh with backend integration

## Setup Instructions

### 1. Environment Configuration

Copy the `.env.custom-backend.example` file and configure your backend endpoints:

```bash
cp .env.custom-backend.example .env.custom-backend
```

Edit `.env.custom-backend` with your actual backend URLs:

```env
USE_CUSTOM_BACKEND_AUTH=true
BACKEND_AUTH_URL=https://your-backend.com/api/auth/login
BACKEND_USER_INFO_URL=https://your-backend.com/api/auth/userinfo
BACKEND_REFRESH_URL=https://your-backend.com/api/auth/refresh
```

Add these variables to your main `.env` file.

### 2. Backend API Requirements

Your backend needs to provide these endpoints:

#### POST /api/auth/login
**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response (Success):**
```json
{
  "token": "your-access-token",
  "refreshToken": "your-refresh-token",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "username": "username",
    "name": "Full Name"
  }
}
```

#### GET /api/auth/userinfo
**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com", 
    "username": "username",
    "name": "Full Name"
  }
}
```

#### POST /api/auth/refresh
**Request:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

**Response:**
```json
{
  "token": "new-access-token",
  "refreshToken": "new-refresh-token"
}
```

### 3. Restart LibreChat

After configuring the environment variables, restart your LibreChat server:

```bash
npm run backend
```

## How It Works

### Authentication Flow

1. **Login Request**: User submits credentials to `/api/auth/login`
2. **Backend Authentication**: Credentials are forwarded to your backend
3. **User Creation/Update**: User record is created or updated in LibreChat database
4. **Token Management**: Backend tokens are stored in secure HTTP-only cookies
5. **Session Management**: LibreChat manages the user session

### Token Validation

The system supports two types of tokens:

1. **Backend Tokens**: Validated directly with your backend
2. **LibreChat Tokens**: For backward compatibility and internal operations

### User Synchronization

When a user logs in:
- User data is fetched from your backend
- LibreChat user record is created or updated
- User roles and permissions are synchronized

## Customization

### User Field Mapping

If your backend uses different field names, modify the `createOrUpdateLibreChatUser` function in `customBackendStrategy.js`:

```javascript
const email = backendUser.email_address; // if your backend uses 'email_address'
const username = backendUser.login_name; // if your backend uses 'login_name'
```

### Role Mapping

Modify the role assignment logic in `customBackendStrategy.js`:

```javascript
// Example: Map backend roles to LibreChat roles
let role = SystemRoles.USER;
if (backendUser.roles && backendUser.roles.includes('admin')) {
  role = SystemRoles.ADMIN;
}
```

### Token Validation

If your backend uses different token validation endpoints, update the URLs in:
- `customBackendStrategy.js`
- `CustomBackendAuthService.js`

## Security Considerations

1. **HTTPS**: Always use HTTPS in production
2. **Token Security**: Tokens are stored in HTTP-only, secure cookies
3. **CORS**: Ensure proper CORS configuration for your backend
4. **Rate Limiting**: Login attempts are rate-limited by LibreChat
5. **Input Validation**: All user inputs are validated before sending to backend

## Troubleshooting

### Common Issues

1. **Authentication Fails**: 
   - Check backend endpoint URLs in environment variables
   - Verify backend API is responding correctly
   - Check LibreChat logs for detailed error messages

2. **Token Refresh Fails**:
   - Ensure refresh token endpoint is correctly configured
   - Check token expiration times
   - Verify refresh token format matches backend expectations

3. **User Not Created**:
   - Check user field mappings in `customBackendStrategy.js`
   - Verify backend returns required user fields
   - Check LibreChat database permissions

### Debugging

Enable debug logging by setting:
```env
DEBUG=librechat:*
```

Check logs in:
- Browser developer console (frontend)
- LibreChat server logs (backend)
- Your backend service logs

## Migration from Default Auth

To migrate existing users:

1. Export existing user data from LibreChat
2. Import users into your backend system
3. Update email addresses to match between systems
4. Enable custom backend authentication
5. Test login with migrated users

## Fallback to Default Auth

To disable custom backend authentication and return to default:

1. Set `USE_CUSTOM_BACKEND_AUTH=false` in your environment
2. Restart LibreChat
3. Users can login with local credentials

## API Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `USE_CUSTOM_BACKEND_AUTH` | Yes | Enable/disable custom backend auth |
| `BACKEND_AUTH_URL` | Yes | Your backend login endpoint |
| `BACKEND_USER_INFO_URL` | Yes | Your backend user info endpoint |
| `BACKEND_REFRESH_URL` | Yes | Your backend token refresh endpoint |

### Files Modified

- `api/strategies/customBackendStrategy.js` - Custom authentication strategy
- `api/strategies/customJwtStrategy.js` - Custom JWT validation
- `api/server/middleware/requireCustomBackendAuth.js` - Auth middleware
- `api/server/services/CustomBackendAuthService.js` - Token management
- `api/server/controllers/CustomAuthController.js` - Custom refresh controller
- `api/server/controllers/auth/CustomBackendLoginController.js` - Custom login controller
- `api/server/routes/auth.js` - Updated auth routes
- `api/server/index.js` - Strategy registration
- `api/strategies/index.js` - Strategy exports
- `api/server/middleware/index.js` - Middleware exports

This implementation provides a complete replacement for LibreChat's authentication while maintaining compatibility with existing features.
