# User Management System - Setup Guide

## Overview

Jamot now has an automated user management system with two registration paths:
1. **Public Registration** → Automatically creates Customer profiles
2. **CEO Dashboard** → CEO can manually create Employee/CEO accounts

---

## Quick Start

### 1. Create Initial CEO Account

Run the seed command to create your first CEO:

```bash
npm run seed-ceo
```

You'll be prompted for:
- Email address
- Full name
- Password (min 8 characters)

**Example:**
```
CEO Email: admin@jamot.pro
CEO Full Name: John Doe
CEO Password: ********
Confirm Password: ********
```

---

## How It Works

### New User Registration (Public)

When users register via the public signup page (`/register`), the system automatically:
1. Creates their user account
2. Creates a **Customer** profile with:
   - Profile Type: `customer`
   - Permissions: `create_ticket`, `view_own_tickets`, `update_own_ticket`
   - Workflows: 3 support ticket workflows (create, list, update)
   - Security Level: 1

**Implementation:** `api/server/services/AuthService.js`

### CEO User Creation (Dashboard)

CEOs can create internal users (employees/CEOs) from the User Management panel:

1. Log in as CEO
2. Navigate to Dashboard
3. Scroll to "User Management" section
4. Click "Create User" button
5. Fill in the form:
   - Full Name
   - Email
   - Password
   - Profile Type (Employee or CEO)
   - Department (optional)

**Implementation:** `client/src/components/Profile/CEO/CEOUserManagement.tsx`

---

## Profile Types

### Customer
- **Created by:** Auto-generated on public signup
- **Permissions:** Limited to support tickets
- **Workflows:** 3 support workflows
- **Security Level:** 1
- **Can access:** Create and view their own support tickets

### Employee
- **Created by:** CEO via dashboard
- **Permissions:** Task management, project viewing
- **Workflows:** 6 task and project workflows
- **Security Level:** 2
- **Can access:** Create tasks, view projects, submit workflow results

### CEO
- **Created by:** 
  - Initial setup: `npm run seed-ceo`
  - Additional CEOs: Created by existing CEO via dashboard
- **Permissions:** Full system access including user management
- **Workflows:** 17 complete workflows (projects, tasks, tickets, analytics)
- **Security Level:** 3
- **Can access:** Everything + user management

---

## API Endpoints

All admin endpoints require JWT authentication + CEO role.

### POST `/api/admin/users/create`
Create a new employee or CEO account.

**Request Body:**
```json
{
  "email": "employee@company.com",
  "name": "Jane Smith",
  "password": "securepassword",
  "profileType": "employee",
  "department": "Engineering"
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "employee@company.com",
    "name": "Jane Smith",
    "profileType": "employee",
    "permissions": ["create_task", "view_assigned_tasks", ...],
    "department": "Engineering"
  }
}
```

### GET `/api/admin/users`
List all users with their profiles.

**Query Parameters:**
- `profileType` (optional): Filter by `ceo`, `employee`, or `customer`
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "users": [
    {
      "id": "...",
      "email": "user@example.com",
      "name": "User Name",
      "profileType": "employee",
      "permissions": [...],
      "department": "Sales",
      "allowedWorkflows": [...],
      "createdAt": "2025-01-14T12:00:00.000Z"
    }
  ],
  "total": 25,
  "limit": 50,
  "offset": 0
}
```

### PATCH `/api/admin/users/:id/profile`
Update a user's profile type and permissions.

**Request Body:**
```json
{
  "profileType": "ceo",
  "permissions": ["manage_users", "view_all_projects"],
  "department": "Executive"
}
```

### DELETE `/api/admin/users/:id`
Deactivate a user (soft delete).

**Response:**
```json
{
  "message": "User deactivated successfully",
  "userId": "507f1f77bcf86cd799439011"
}
```

---

## Workflow Definitions

### Customer Workflows (3)
1. Create Support Ticket
2. List Support Tickets
3. Update Support Ticket

### Employee Workflows (6)
1. Create Task
2. List Tasks
3. Update Task
4. List Projects
5. Create Workflow Result
6. List Workflow Results

### CEO Workflows (17)
All Employee workflows plus:
- Project management (create, update, delete)
- Task management (delete, assign)
- Ticket management (view all, delete)
- Workflow result management (update, delete)
- Financial analytics
- Company metrics

---

## Security Features

### CEO-Only Middleware
**File:** `api/server/middleware/requireCEORole.js`

Protects admin routes by:
1. Checking if user is authenticated (JWT)
2. Verifying user has a CEO profile
3. Returning 403 Forbidden if not CEO
4. Preventing self-deletion

### Auto-Profile Creation
**File:** `api/server/services/AuthService.js`

Automatically creates customer profiles on registration to ensure:
- Every user has a profile
- No manual setup required for customers
- Consistent permissions and workflows

---

## Testing

### Verify Implementation

Run the test script:
```bash
node test-user-management.js
```

**Expected Output:**
```
✅ Connected to MongoDB
✅ Found profiles in database
✅ All implementation files exist
✅ Admin routes loaded successfully
```

### Manual Testing

1. **Test Customer Registration:**
   - Go to `/register`
   - Create a new account
   - Verify profile is auto-created
   - Check you can see support ticket workflows

2. **Test CEO Dashboard:**
   - Log in as CEO
   - Navigate to Dashboard
   - Scroll to User Management section
   - Create a new employee
   - Verify employee appears in the table

3. **Test API Endpoints:**
   ```bash
   # Get JWT token by logging in
   # Then test endpoints:
   
   curl -X GET http://localhost:3080/api/admin/users \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

---

## Troubleshooting

### Admin routes not loading
**Error:** `[SKIP] Admin routes (error loading)`

**Solution:** Check import paths in `api/server/routes/admin.js`:
```javascript
const { requireJwtAuth } = require('~/server/middleware');
const requireCEORole = require('~/server/middleware/requireCEORole');
```

### Profile not found on login
**Issue:** User exists but has no profile

**Solution:** Run profile setup for existing users:
```bash
npm run setup-all-profiles
```

### CEO can't access user management
**Issue:** Permission denied or 403 error

**Solution:** Verify user has CEO profile:
```bash
node test-user-management.js
```

Or upgrade user to CEO:
```bash
npm run setup-profile
# Select the user and change to CEO profile
```

---

## Database Schema

### Profile Model
**Collection:** `profiles`

```javascript
{
  userId: ObjectId,              // Reference to users collection
  profileType: String,           // 'ceo' | 'employee' | 'customer'
  permissions: [String],         // Array of permission strings
  allowedWorkflows: [{
    workflowId: String,
    workflowName: String,
    endpoint: String,
    description: String
  }],
  metadata: {
    department: String,          // Optional department
    customerId: String,          // For customer profiles
    securityLevel: Number,       // 1-3 (customer-CEO)
    companyId: String           // Future multi-tenancy
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## Migration from Old System

If you have existing users without profiles:

```bash
# Option 1: Auto-setup all users
npm run setup-all-profiles

# Option 2: Setup individual users
npm run setup-profile
```

---

## Future Enhancements

Potential improvements:
- [ ] Bulk user import from CSV
- [ ] Role-based access control (RBAC) with custom roles
- [ ] Department-based workflow restrictions
- [ ] User invitation system with email
- [ ] Activity logs for user management actions
- [ ] Multi-tenancy support with company isolation

---

## Files Modified/Created

### Backend
- ✅ `api/server/services/AuthService.js` - Auto-profile creation
- ✅ `api/server/middleware/requireCEORole.js` - CEO authorization
- ✅ `api/server/routes/admin.js` - User management API
- ✅ `api/server/index.js` - Route registration
- ✅ `config/seed-ceo.js` - CEO seeding script

### Frontend
- ✅ `client/src/components/Profile/CEO/CEOUserManagement.tsx` - UI component
- ✅ `client/src/components/Profile/CEODashboard.tsx` - Dashboard integration

### Configuration
- ✅ `package.json` - Added `seed-ceo` script
- ✅ `test-user-management.js` - Test script

---

## Support

For issues or questions:
1. Check this guide first
2. Run test script: `node test-user-management.js`
3. Check server logs for errors
4. Verify database connection and profile collection

---

**Last Updated:** January 14, 2026
**Version:** V0.41
