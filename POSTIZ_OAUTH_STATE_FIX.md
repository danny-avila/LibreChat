# OAuth State Fix - Secure User ID Passing

**Date:** 2026-02-23  
**Status:** ✅ COMPLETE

---

## Problem

OAuth callback routes don't have access to user session because:
1. OAuth redirects come from external platforms (LinkedIn, X, etc.)
2. No cookies or session data is passed through OAuth flow
3. We need to know which user initiated the OAuth to save the connection

**Original broken code:**
```javascript
const userId = req.user?.id; // undefined - no session in callback
```

---

## Solution

Use **JWT-signed state parameter** to securely pass userId through OAuth flow.

### How It Works

```
1. User clicks "Connect LinkedIn"
   ↓
2. Backend generates JWT with userId
   state = jwt.sign({ userId, platform, timestamp }, JWT_SECRET)
   ↓
3. Redirect to LinkedIn OAuth with state parameter
   ↓
4. User authorizes on LinkedIn
   ↓
5. LinkedIn redirects back with state parameter
   ↓
6. Backend verifies JWT and extracts userId
   decoded = jwt.verify(state, JWT_SECRET)
   ↓
7. Save connection to database with correct userId
```

---

## Implementation

### 1. Generate State (in `/connect/:platform`)

```javascript
function generateOAuthState(userId, platform) {
  const payload = {
    userId,
    platform,
    timestamp: Date.now(),
  };
  
  // Sign with JWT secret, expires in 10 minutes
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });
}

// Usage
const state = generateOAuthState(req.user.id, platform);
const callbackUrl = `${baseUrl}/api/social/callback/${platform}?state=${state}`;
```

### 2. Verify State (in `/callback/:platform`)

```javascript
function verifyOAuthState(state) {
  try {
    return jwt.verify(state, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired OAuth state');
  }
}

// Usage
const { userId, platform } = verifyOAuthState(req.query.state);
```

---

## Security Features

### 1. JWT Signature
- State is signed with `JWT_SECRET`
- Cannot be tampered with
- Any modification invalidates the signature

### 2. Expiration
- State expires in 10 minutes
- Prevents replay attacks
- Forces fresh OAuth flow if expired

### 3. Platform Verification
- State includes platform name
- Verified against URL parameter
- Prevents platform confusion attacks

### 4. Timestamp
- Included in payload
- Can be used for additional validation
- Helps with debugging

---

## Error Handling

### Invalid State
```javascript
// Expired or tampered state
return res.redirect(`${clientUrl}/settings?tab=social&error=invalid_state`);
```

### Platform Mismatch
```javascript
// State says "linkedin" but callback is for "x"
if (statePlatform !== platform) {
  throw new Error('Platform mismatch in state');
}
```

### Missing Integration ID
```javascript
// Postiz didn't return integration_id
if (!integration_id) {
  return res.redirect(`${clientUrl}/settings?tab=social&error=oauth_failed`);
}
```

### Postiz API Error
```javascript
// Failed to get integration details
catch (postizError) {
  return res.redirect(`${clientUrl}/settings?tab=social&error=postiz_error`);
}
```

### Database Error
```javascript
// Failed to save to MongoDB
catch (dbError) {
  return res.redirect(`${clientUrl}/settings?tab=social&error=save_failed`);
}
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User clicks "Connect LinkedIn" in Settings               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. POST /api/social/connect/linkedin                        │
│    - Authenticated (has req.user.id)                        │
│    - Generate JWT state with userId                         │
│    - Call Postiz API to get OAuth URL                       │
│    - Return OAuth URL to frontend                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Frontend redirects to LinkedIn OAuth                     │
│    URL: https://linkedin.com/oauth?...&state=JWT_TOKEN      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. User authorizes on LinkedIn                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. LinkedIn redirects to callback                           │
│    URL: /api/social/callback/linkedin?                      │
│         state=JWT_TOKEN&integration_id=xxx                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. GET /api/social/callback/linkedin                        │
│    - NOT authenticated (no session)                         │
│    - Verify JWT state → extract userId                      │
│    - Get integration details from Postiz                    │
│    - Save to MongoDB with userId                            │
│    - Redirect to settings with success                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. User sees "LinkedIn Connected ✓" in Settings             │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing

### Test State Generation
```javascript
const state = generateOAuthState('user123', 'linkedin');
console.log(state);
// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

const decoded = verifyOAuthState(state);
console.log(decoded);
// { userId: 'user123', platform: 'linkedin', timestamp: 1708704000000 }
```

### Test Expiration
```javascript
// Wait 11 minutes
setTimeout(() => {
  try {
    verifyOAuthState(oldState);
  } catch (error) {
    console.log('Expired as expected:', error.message);
  }
}, 11 * 60 * 1000);
```

### Test Tampering
```javascript
const state = generateOAuthState('user123', 'linkedin');
const tampered = state.slice(0, -5) + 'XXXXX'; // Modify signature

try {
  verifyOAuthState(tampered);
} catch (error) {
  console.log('Tampering detected:', error.message);
}
```

---

## Advantages Over Alternatives

### vs. Session Storage
- ❌ Sessions don't persist across OAuth redirects
- ❌ Requires sticky sessions in load-balanced environments
- ✅ JWT is stateless and works everywhere

### vs. Database Temporary Tokens
- ❌ Requires database write/read for every OAuth
- ❌ Need cleanup job for expired tokens
- ✅ JWT is self-contained, no database needed

### vs. Unencrypted State
- ❌ User can modify userId to hijack connections
- ❌ No expiration, can be reused indefinitely
- ✅ JWT is signed and expires automatically

---

## Code Changes

### Files Modified
1. `api/server/routes/social.js`
   - Added `generateOAuthState()` function
   - Added `verifyOAuthState()` function
   - Updated `/connect/:platform` to generate state
   - Updated `/callback/:platform` to verify state
   - Added comprehensive error handling

### Dependencies
- `jsonwebtoken` (already in package.json)
- `process.env.JWT_SECRET` (already configured)

---

## Security Checklist

- ✅ State is signed with JWT
- ✅ State expires in 10 minutes
- ✅ Platform is verified
- ✅ Timestamp included for audit
- ✅ Error messages don't leak sensitive info
- ✅ All errors redirect to safe URLs
- ✅ No user input in state (only server-generated data)

---

## Next Steps

1. ✅ OAuth state fix complete
2. ⏳ Build frontend hook (`useSocialAccounts`)
3. ⏳ Build UI component (`SocialAccountsSettings`)
4. ⏳ Test full OAuth flow end-to-end

---

*Completed: 2026-02-23*
*Status: ✅ SECURE & READY FOR TESTING*
