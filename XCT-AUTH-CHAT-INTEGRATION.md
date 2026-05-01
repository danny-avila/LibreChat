# XCT-Auth Integration - Xcity-Chat

## Overview
Unified authentication for Xcity-Chat using XCT-Auth service on Railway.

## Service Details
- Service: XCT-Auth
- Platform: Railway
- URL: xct-litellm.up.railway.app

## Configuration
USE_XCT_AUTH=true
XCT_AUTH_URL=https://xct-litellm.up.railway.app
JWT_SECRET=your-secret-key

## Implementation
- Added api/server/middleware/xctAuth.js
- Updated auth routes with XCT-Auth support
- Token-based JWT authentication
- HttpOnly cookies for security

## Features
1. requireXctAuth - Validate JWT for protected routes
2. optionalXctAuth - Optional authentication
3. loginWithXctAuth - Login via XCT-Auth
4. registerWithXctAuth - Register via XCT-Auth
5. refreshXctToken - Refresh JWT tokens
