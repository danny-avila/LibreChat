# Audit Feature Implementation - Testing Guide

## Overview
The audit management feature has been fully integrated into the CEO Dashboard. This document provides testing instructions to verify the implementation works correctly with different business configurations.

## Implementation Summary

### 🎯 What Was Built
- **Backend**: Feature flag system, API proxy, middleware protection
- **Frontend**: Audit tab in CEO Dashboard with Users and Health sub-tabs
- **Integration**: Seamless integration with existing CEO Dashboard modal

### 📁 Files Modified/Created (24 total)

#### Backend (9 files)
1. `api/constants/businesses.js` - Business registry with feature flags
2. `api/server/services/FeatureService.js` - Feature resolution service
3. `api/server/middleware/featureGuard.js` - Route protection middleware
4. `api/server/services/AuditAdminService.js` - External API proxy
5. `api/server/controllers/AuditAdminController.js` - Request handlers
6. `api/server/routes/auditAdmin.js` - Audit routes
7. `api/server/routes/config.js` - Modified to expose feature config
8. `api/server/index.js` - Modified to conditionally load routes
9. `api/server/routes/index.js` - Modified to export audit routes

#### Frontend (15 files)
10. `client/src/constants/businesses.ts` - TypeScript business constants
11. `client/src/hooks/useFeatureFlag.ts` - Feature flag hooks
12. `client/src/components/Guards/FeatureGuard.tsx` - Route guard
13. `client/src/components/Guards/index.ts` - Guard exports
14. `client/src/types/audit.ts` - TypeScript types
15. `client/src/data-provider/audit.ts` - API client
16. `client/src/data-provider/audit-queries.ts` - React Query hooks
17. `client/src/components/Audit/AuditManagementPage.tsx` - Main container (MODIFIED)
18. `client/src/components/Audit/AuditFilters.tsx` - Filter controls
19. `client/src/components/Audit/AuditTable.tsx` - Data table
20. `client/src/components/Audit/AuditListView.tsx` - List view
21. `client/src/components/Audit/ApprovalModal.tsx` - Approval dialog
22. `client/src/components/Audit/AuditDetailView.tsx` - Detail view
23. `client/src/components/Audit/index.ts` - Component exports
24. **`client/src/components/Profile/CEODashboard.tsx`** - Modified to add Audit tab

## Testing Instructions

### Prerequisites
1. Ensure you have a CEO profile configured in your database
2. Set up the external Audit Platform API:
   - Configure `ADMIN_PLATFORM_URL` in your `.env`
   - Configure `ADMIN_API_SECRET` (Bearer token) in your `.env`
3. Restart the backend server after environment changes

### Test Case 1: Scaffad Business (Audit Enabled)

**Setup:**
```bash
# In your .env file
BUSINESS_NAME=scaffad
ADMIN_PLATFORM_URL=https://your-audit-platform.com/api
ADMIN_API_SECRET=your-secret-token
```

**Expected Behavior:**
1. ✅ Backend logs should show on startup:
   ```
   [Feature Config] Business: scaffad (Scaffad)
   [Feature Config] Enabled Features: audit, social-media, user-management
   [Feature Config] Audit routes: LOADED
   ```

2. ✅ Login as CEO user

3. ✅ Open the CEO Dashboard (click your profile icon or dashboard button)

4. ✅ You should see **7 tabs**:
   - Overview
   - Projects
   - Tasks
   - Tickets
   - Analytics
   - Users
   - **🔍 Audit** ← NEW TAB

5. ✅ Click the "Audit" tab

6. ✅ You should see the Audit Management interface with **3 sub-tabs**:
   - **Audits**: List of all audit sessions with filters
   - **Users**: Table of users who have audit sessions
   - **Health**: API health status display

7. ✅ Test Audits tab:
   - Filter by status (draft/pending_review/approved)
   - Filter by approval status
   - Search by user ID
   - Click on any audit row to view details
   - For unapproved audits, test the "Approve" button

8. ✅ Test Users tab:
   - Should display table with User ID, Email, Session Count
   - Should show real data from the external API

9. ✅ Test Health tab:
   - Should show green/red status indicator
   - Should display API status and timestamp

### Test Case 2: Jamot Business (Audit Disabled)

**Setup:**
```bash
# In your .env file
BUSINESS_NAME=jamot
ADMIN_PLATFORM_URL=https://your-audit-platform.com/api
ADMIN_API_SECRET=your-secret-token
```

**Expected Behavior:**
1. ✅ Backend logs should show on startup:
   ```
   [Feature Config] Business: jamot (Jamot)
   [Feature Config] Enabled Features: social-media, financial-analytics
   [Feature Config] Audit routes: SKIPPED
   ```

2. ✅ Login as CEO user

3. ✅ Open the CEO Dashboard

4. ✅ You should see **6 tabs** (NO Audit tab):
   - Overview
   - Projects
   - Tasks
   - Tickets
   - Analytics
   - Users

5. ✅ The Audit tab should NOT be visible

6. ✅ If you try to access audit API directly:
   ```bash
   curl -X GET http://localhost:3080/api/admin/audits \
     -H "Authorization: Bearer <your-jwt-token>" \
     -H "Content-Type: application/json"
   ```
   Should return: `403 Forbidden - Feature not available`

### Test Case 3: Generic Business (Audit Disabled)

**Setup:**
```bash
# In your .env file
BUSINESS_NAME=generic
# or leave BUSINESS_NAME unset (defaults to generic)
```

**Expected Behavior:**
1. ✅ Backend logs should show on startup:
   ```
   [Feature Config] Business: generic (Generic)
   [Feature Config] Enabled Features: (none)
   [Feature Config] Audit routes: SKIPPED
   ```

2. ✅ Same behavior as Test Case 2 - NO Audit tab visible

### Test Case 4: Security Testing

**Test 1: Non-CEO User**
1. Login as Employee or Customer user
2. Try to access CEO Dashboard
3. ✅ Should be blocked by profile guard (not see dashboard at all)

**Test 2: Direct API Access Without JWT**
```bash
curl -X GET http://localhost:3080/api/admin/audits \
  -H "Content-Type: application/json"
```
✅ Should return: `401 Unauthorized`

**Test 3: Valid JWT but Wrong Business**
1. Set `BUSINESS_NAME=jamot` (audit disabled)
2. Login as CEO
3. Try direct API call with valid JWT
```bash
curl -X GET http://localhost:3080/api/admin/audits \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json"
```
✅ Should return: `403 Forbidden - Feature not available`

**Test 4: Missing External API Credentials**
1. Set `BUSINESS_NAME=scaffad` (audit enabled)
2. Remove or comment out `ADMIN_API_SECRET` in .env
3. Restart backend
4. Login as CEO, open Audit tab
5. ✅ Should show error: "Missing API configuration"

## Multi-Layer Security Verification

The audit feature has **4 layers of security**:

1. ✅ **JWT Authentication** - User must be logged in
2. ✅ **CEO Role Check** - User must have CEO profile type
3. ✅ **Feature Flag Check** - Business must have 'audit' feature enabled
4. ✅ **Bearer Token Auth** - External API requires valid ADMIN_API_SECRET

Test that all 4 layers work:
```javascript
// Layer 1: No JWT → 401
// Layer 2: JWT but not CEO → 403 (Profile guard)
// Layer 3: CEO but audit disabled → 403 (Feature guard)
// Layer 4: All pass but wrong API secret → 500 (External API error)
```

## UI/UX Verification

### Dark Mode Support
1. ✅ Toggle dark mode (check theme settings)
2. ✅ All audit components should render properly in dark mode
3. ✅ Status badges should have proper contrast

### Responsive Design
1. ✅ Desktop: Audit list shows as table
2. ✅ Mobile: Audit list shows as cards
3. ✅ Tablet: Smooth transition between layouts

### Loading States
1. ✅ Initial load shows loading spinner
2. ✅ Filter changes show loading state
3. ✅ Health tab shows "Loading health status..."

### Error States
1. ✅ API errors display user-friendly messages
2. ✅ Network errors show retry option
3. ✅ Empty states show helpful icons and text

## Performance Verification

### No Caching (As Required)
1. Open Audit tab
2. Open browser DevTools → Network tab
3. Clear cache
4. Click refresh on audit list
5. ✅ Should see new API request (staleTime: 0)
6. ✅ Should NOT use cached data

### Auto-Refresh After Mutations
1. Approve an audit report
2. ✅ List should automatically refresh
3. ✅ Approved status should be reflected immediately

## Troubleshooting

### Issue: Audit tab not showing for Scaffad
**Solution:**
- Check `.env` has `BUSINESS_NAME=scaffad` (exact lowercase match)
- Restart backend server
- Hard refresh browser (Ctrl+Shift+R)
- Check browser console for errors

### Issue: "Feature not available" error
**Solution:**
- Verify `BUSINESS_NAME` in `.env` matches business with audit feature
- Check backend logs for feature config on startup
- Ensure backend was restarted after `.env` changes

### Issue: API connection errors
**Solution:**
- Verify `ADMIN_PLATFORM_URL` is correct and accessible
- Verify `ADMIN_API_SECRET` is correct
- Test external API health endpoint manually
- Check CORS configuration on external API

### Issue: Dark mode colors look wrong
**Solution:**
- Audit components use Tailwind's `dark:` classes
- Ensure ThemeProvider is working in parent components
- Check browser theme detection

## Success Criteria

All tests pass when:
- ✅ Scaffad shows Audit tab with full functionality
- ✅ Jamot does NOT show Audit tab
- ✅ Generic does NOT show Audit tab
- ✅ Non-CEO users cannot access audit features
- ✅ Direct API access is properly protected
- ✅ All sub-tabs (Audits/Users/Health) work correctly
- ✅ Dark mode renders properly
- ✅ Mobile responsive design works
- ✅ No caching behavior is confirmed
- ✅ Security layers all function correctly

## Next Steps (Future Enhancements)

1. **Granular Permissions**: Add role-based access beyond CEO-only
2. **Audit Edit Functionality**: Implement edit report feature
3. **Real-time Updates**: Add WebSocket support for live status changes
4. **Batch Operations**: Add bulk approval/rejection
5. **Export Functionality**: Add PDF/CSV export for reports
6. **Audit Logs**: Track who approved what and when
7. **Email Notifications**: Notify users when reports are approved
8. **Advanced Filtering**: Date range, custom fields, saved filters

## Documentation References

- Business Constants: `api/constants/businesses.js`
- Feature Flag Usage: `client/src/hooks/useFeatureFlag.ts`
- API Documentation: `AUDIT_PLATFORM_API_SETUP.md`
- Original Implementation Plan: `AUDIT_IMPLEMENTATION_COMPLETE.md`

---

**Implementation Status**: ✅ **100% Complete**

**Last Updated**: 2026-02-16

**Testing Status**: Ready for manual testing
