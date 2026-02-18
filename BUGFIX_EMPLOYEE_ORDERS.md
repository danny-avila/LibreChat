# Bug Fix: Employee Orders Not Loading

## Issue
Employee dashboard "Print Queue" tab was showing empty results even when orders were assigned to the employee.

**Symptoms:**
- API call to `/api/signage/my-orders` returned `200 OK`
- Response had empty data array: `{"data": [], "pagination": {...}}`
- Orders were correctly assigned in CEO dashboard
- PDF Builder backend was working correctly

## Root Cause
The signage orders proxy route was using `requireJwtAuth` middleware which only provides basic authentication (`req.user`) but does NOT load the user's profile information (`req.userProfile`).

Without `req.userProfile`, the `X-User-Role` header was `undefined`, and the PDF Builder backend couldn't properly identify the employee role and match orders.

## Solution
Changed the middleware from `requireJwtAuth` to `profileAuth` in `api/server/routes/signageOrders.js`.

### Code Changes

**Before:**
```javascript
const { requireJwtAuth } = require('../middleware');
// ...
router.use(requireJwtAuth);
```

**After:**
```javascript
const profileAuth = require('../middleware/profileAuth');
// ...
router.use(profileAuth);
```

## Why This Works

**`requireJwtAuth`** provides:
- `req.user.id` - User ID
- `req.user.email` - User email
- Basic JWT validation

**`profileAuth`** provides everything above PLUS:
- `req.userProfile` - Full profile object from database
- `req.userProfile.profileType` - Role (ceo/employee/customer)
- `req.userProfile.allowedWorkflows` - Permissions
- `req.userProfile.userId` - User ID reference

The `forwardRequest` helper function sends these headers to PDF Builder:
```javascript
headers: {
  'X-User-Id': req.user?.id,           // User ID
  'X-User-Role': req.userProfile?.profileType  // NOW AVAILABLE: 'employee'
}
```

PDF Builder backend uses:
- `X-User-Id` to identify which user
- `X-User-Role` to determine access level
- Query param `assignedTo=me` to filter orders where `assignedTo === X-User-Id`

## Testing
After the fix:
1. ✅ Employee can see orders assigned to them
2. ✅ Orders display correctly with all fields
3. ✅ Status updates work properly
4. ✅ CEO routes still work (they use `requireCEORole` which also loads profile)

## Files Modified
- `api/server/routes/signageOrders.js` - Changed middleware from `requireJwtAuth` to `profileAuth`

## Impact
- **CEO routes**: No change (already had profile via `requireCEORole`)
- **Employee routes**: Now properly authenticated with profile data
- **Security**: Improved (profile validation now enforced)
- **Performance**: Negligible (one additional DB query per request, but necessary)

## Related Middleware

### Middleware Hierarchy
1. **`requireJwtAuth`** - Basic JWT validation only
2. **`profileAuth`** - JWT validation + profile loading
3. **`requireCEORole`** - Profile loading + CEO role check
4. **`validateProfileType(['ceo', 'employee'])`** - Profile loading + multi-role check

### When to Use Each
- Use `profileAuth` when you need profile data but any role is allowed
- Use `requireCEORole` when only CEO should access
- Use `validateProfileType([...])` when specific roles should access
- Use `requireJwtAuth` only for routes that don't need profile data (rare)

---

*Fixed: 2026-02-18*
*Status: ✅ RESOLVED*
