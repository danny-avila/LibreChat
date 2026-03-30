# Statistics Feature - Authentication Testing

This document provides comprehensive testing for the Statistics feature, specifically focusing on the 401 authentication error reported when accessing statistics pages.

## 🧪 Test Suite Overview

The Statistics feature testing includes:

1. **Authentication Tests** (`statistics-auth.spec.ts`)
2. **UI and Navigation Tests** (`statistics-ui.spec.ts`)
3. **Admin Setup and Role Verification** (`statistics-admin-setup.spec.ts`)

## 🚀 Quick Start

### Prerequisites

1. **Backend Server Running**
   ```bash
   npm run backend:dev
   ```

2. **Environment Variables**
   ```bash
   export TEST_EMAIL="user@test.com"
   export TEST_PASSWORD="password"
   export TEST_ADMIN_EMAIL="admin@test.com"
   export TEST_ADMIN_PASSWORD="admin_password"
   ```

3. **Database Setup**
   - Regular user account for `TEST_EMAIL`
   - Admin user account for `TEST_ADMIN_EMAIL` with `role: "ADMIN"`

### Running Tests

```bash
# Run all statistics tests
./test-statistics.sh

# Run specific test suites
npx playwright test --config=e2e/statistics-test-config.ts --project=statistics-auth
npx playwright test --config=e2e/statistics-test-config.ts --project=statistics-ui
npx playwright test --config=e2e/statistics-test-config.ts --project=statistics-admin-setup

# Run individual test files
npx playwright test e2e/specs/statistics-auth.spec.ts
npx playwright test e2e/specs/statistics-ui.spec.ts
npx playwright test e2e/specs/statistics-admin-setup.spec.ts
```

## 📋 Test Scenarios

### 1. Authentication Tests (`statistics-auth.spec.ts`)

#### **Unauthorized Access**
- ✅ Accessing `/d/statistics` without login redirects to `/login`
- ✅ API calls without auth token return `401 Unauthorized`
- ✅ Direct API access to statistics endpoints requires authentication

#### **Non-Admin User Access**
- ✅ Regular users get `403 Forbidden` when accessing statistics
- ✅ API calls from regular users return `403 Forbidden`
- ✅ Statistics navigation is hidden for non-admin users
- ✅ Error messages properly indicate insufficient permissions

#### **Admin User Access**
- ✅ Admin users can access statistics pages without errors
- ✅ API calls from admin users return `200 OK` with data
- ✅ Statistics navigation is visible for admin users
- ✅ All statistics endpoints work for admin users

#### **Error Handling**
- ✅ Network errors are handled gracefully
- ✅ Retry options are available on API failures
- ✅ Malformed responses don't crash the application
- ✅ Token expiration redirects to login

### 2. UI Tests (`statistics-ui.spec.ts`)

#### **Navigation**
- ✅ Statistics accessible from dashboard navigation
- ✅ Default statistics overview page loads correctly
- ✅ Navigation between user and group statistics works
- ✅ Breadcrumb navigation functions properly

#### **User Statistics Page**
- ✅ User leaderboard components display correctly
- ✅ Loading states show appropriate indicators
- ✅ Error states display retry options
- ✅ Empty states show helpful messages
- ✅ Filtering and sorting controls work

#### **Group Statistics Page**
- ✅ Group statistics components render properly
- ✅ Summary cards display correct information
- ✅ Navigation to group details functions
- ✅ API error handling works correctly

#### **Performance & Accessibility**
- ✅ Pages load within reasonable timeframes
- ✅ Proper page titles are set
- ✅ Keyboard navigation works correctly

### 3. Admin Setup Tests (`statistics-admin-setup.spec.ts`)

#### **Admin User Verification**
- ✅ Admin user login credentials are valid
- ✅ Admin user has proper role assignments
- ✅ API access works with admin credentials
- ✅ Role-based permissions are enforced

#### **401 Error Reproduction**
- ✅ Regular users trigger 401/403 errors as expected
- ✅ Each statistics endpoint properly validates permissions
- ✅ JWT token handling works correctly
- ✅ Role checking middleware functions properly

## 🔧 Admin User Setup

### Creating Admin User

1. **Using CLI**
   ```bash
   npm run create-user
   # Follow prompts to create user
   ```

2. **Set Admin Role in Database**
   ```javascript
   // MongoDB command
   db.users.updateOne(
     { email: "admin@test.com" },
     { $set: { role: "ADMIN" } }
   )
   ```

3. **Verify Admin User**
   ```bash
   # Check user role
   npm run list-users
   ```

### Environment Variables for Testing

```bash
# Required for basic tests
export TEST_EMAIL="user@test.com"
export TEST_PASSWORD="password"

# Required for admin tests
export TEST_ADMIN_EMAIL="admin@test.com" 
export TEST_ADMIN_PASSWORD="admin_password"

# Optional: Custom base URL
export PLAYWRIGHT_BASE_URL="http://localhost:3080"
```

## 🐛 Troubleshooting 401 Errors

### Common Issues and Solutions

1. **401 Unauthorized Errors**
   - ✅ **Expected**: Non-authenticated users should get 401
   - ✅ **Expected**: Invalid tokens should get 401
   - ❌ **Problem**: Admin users getting 401 indicates auth token issues

2. **403 Forbidden Errors**
   - ✅ **Expected**: Regular users should get 403
   - ❌ **Problem**: Admin users getting 403 indicates role issues

3. **Admin Role Issues**
   ```bash
   # Verify admin role in database
   db.users.findOne({ email: "admin@test.com" })
   
   # Should show: { ..., role: "ADMIN", ... }
   ```

4. **JWT Token Problems**
   - Check if JWT_SECRET is consistent
   - Verify token is being sent in Authorization header
   - Ensure token hasn't expired

5. **Middleware Configuration**
   - Verify `checkAdmin` middleware is properly imported
   - Ensure statistics routes use admin middleware
   - Check middleware order in route setup

### Debugging Steps

1. **Check Backend Logs**
   ```bash
   # Look for authentication/authorization errors
   tail -f backend.log
   ```

2. **Test API Endpoints Directly**
   ```bash
   # Should return 401
   curl http://localhost:3080/api/statistics/users/leaderboard
   
   # Should return 401  
   curl -H "Authorization: Bearer invalid-token" \
        http://localhost:3080/api/statistics/users/leaderboard
   ```

3. **Verify Database State**
   ```javascript
   // Check user exists and has admin role
   db.users.findOne({ email: "admin@test.com" })
   
   // Check JWT secrets are set
   process.env.JWT_SECRET
   ```

4. **Frontend Network Tab**
   - Check if Authorization header is sent
   - Verify API response status codes
   - Look for CORS or preflight issues

## 📊 Test Results Interpretation

### Expected Results

| User Type | Page Access | API Access | Expected Result |
|-----------|-------------|------------|-----------------|
| No Auth | `/d/statistics` | Any stats API | 401 Unauthorized |
| Regular User | `/d/statistics` | Any stats API | 403 Forbidden |
| Admin User | `/d/statistics` | Any stats API | 200 OK |

### Success Indicators

- ✅ **401 errors for unauthenticated requests**
- ✅ **403 errors for non-admin authenticated requests**
- ✅ **200 responses for admin authenticated requests**
- ✅ **Proper error messages displayed in UI**
- ✅ **Graceful error handling with retry options**

### Failure Indicators

- ❌ **Admin users getting 401/403 errors**
- ❌ **Regular users accessing statistics successfully**
- ❌ **Application crashes on authentication errors**
- ❌ **Missing or incorrect error messages**

## 🔄 Continuous Integration

### GitHub Actions Integration

```yaml
- name: Run Statistics Tests
  run: |
    export TEST_EMAIL="ci-user@test.com"
    export TEST_PASSWORD="ci-password"
    export TEST_ADMIN_EMAIL="ci-admin@test.com" 
    export TEST_ADMIN_PASSWORD="ci-admin-password"
    ./test-statistics.sh
```

### Local Development

```bash
# Quick test during development
npm run backend:dev &
sleep 10
./test-statistics.sh
```

## 📝 Test Maintenance

### Adding New Tests

1. **Authentication Tests**: Add to `statistics-auth.spec.ts`
2. **UI Tests**: Add to `statistics-ui.spec.ts`
3. **Setup Tests**: Add to `statistics-admin-setup.spec.ts`

### Updating Test Data

- Modify mock responses in individual test files
- Update expected API response structures
- Adjust timeout values for slower environments

### Environment-Specific Configuration

- Update `statistics-test-config.ts` for different environments
- Modify `statistics-global-setup.ts` for custom setup requirements
- Adjust base URLs and timeouts as needed

This comprehensive test suite ensures the Statistics feature's authentication and authorization work correctly, helping identify and resolve 401 errors and other access control issues.