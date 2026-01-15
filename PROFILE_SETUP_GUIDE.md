# Profile Setup Guide for Jamot

## Overview
The Dashboard feature requires user profiles to be configured in MongoDB. This guide explains how to set up profiles for all existing users.

## Quick Start

### Setup All Users at Once
```bash
npm run setup-all-profiles
```

When prompted with "Proceed with creating default profiles? (yes/no):", type **yes** and press Enter.

**What it does:**
- Finds all users without profiles
- Creates a **CEO** profile for the first user
- Creates **Employee** profiles for all other users
- Shows summary of what was created

### Setup Individual User
```bash
npm run setup-profile
```

Follow the prompts to:
1. Enter user email
2. Choose profile type (ceo/employee/customer)
3. Optionally add metadata (department, customer ID, etc.)

**Or use arguments:**
```bash
npm run setup-profile user@example.com ceo
npm run setup-profile user@example.com employee
npm run setup-profile user@example.com customer
```

---

## Profile Types

### 1. CEO Profile
**Best for:** Executives, administrators
- Access to financial analytics
- Company-wide metrics dashboard
- Full project/user management permissions
- 2 executive workflows

### 2. Employee Profile
**Best for:** Team members, project managers
- Project and task management
- Create, view, and update projects/tasks
- Department-based organization
- 6 project/task workflows

### 3. Customer Profile
**Best for:** External users, clients
- Support ticket system
- Create and track support tickets
- Limited to own tickets only
- 3 support workflows

---

## Current User

**Email:** akejupaul10@gmail.com  
**Name:** Akeju  
**Suggested Profile:** CEO (since you're the first/admin user)

---

## Manual Run Instructions

1. **Open Terminal in project root:**
   ```bash
   cd /Users/akejupaul/Documents/office/jamot/librechat
   ```

2. **Run the setup script:**
   ```bash
   npm run setup-all-profiles
   ```

3. **When prompted, type:** `yes` and press Enter

4. **Expected output:**
   ```
   📝 Creating profiles...
   
   ✅ akejupaul10@gmail.com -> ceo
   
   --------------------------
   Profile creation complete!
     Created: 1
   --------------------------
   ```

5. **Verify by:**
   - Log into the application
   - Click user menu (bottom right)
   - Click "Dashboard"
   - You should see the CEO Dashboard with analytics

---

## Troubleshooting

### "Profile not found" error in Dashboard
**Solution:** Run `npm run setup-all-profiles`

### Script hangs or takes long time
**Reason:** Connecting to remote MongoDB Atlas cluster
**Solution:** Wait 10-20 seconds for connection. If still hanging, check:
- Internet connection
- MongoDB Atlas cluster is running
- MONGO_URI in .env is correct

### Want to change profile type
**Solution:** 
```bash
npm run setup-profile akejupaul10@gmail.com employee
```

### Check existing profiles
**Solution:** Use MongoDB Compass or mongo shell:
```javascript
db.profiles.find({})
```

---

## Workflows by Profile Type

### CEO Workflows:
1. **Financial Analytics** - Revenue, expenses, profit analysis
2. **Company Metrics** - KPIs, employee count, satisfaction scores

### Employee Workflows:
1. **Create Project** - Define new projects
2. **List Projects** - View all project statuses
3. **Update Project** - Modify project details
4. **Create Task** - Assign new tasks
5. **List Tasks** - View task lists with filters
6. **Update Task** - Change task status/assignee

### Customer Workflows:
1. **Create Support Ticket** - Submit support requests
2. **List Support Tickets** - View your tickets
3. **Update Support Ticket** - Update ticket status

---

## Next Steps After Setup

1. ✅ Run `npm run setup-all-profiles`
2. ✅ Log in and test Dashboard access
3. ✅ Verify workflows are accessible
4. Add more users with `npm run create-user`
5. Assign profiles with `npm run setup-profile`

---

## Script Locations

- **All users setup:** `config/setup-all-profiles.js`
- **Individual setup:** `config/setup-profile.js`
- **Profile model:** `api/server/models/Profile.js`
- **Profile controller:** `api/server/controllers/ProfileController.js`
- **Profile route:** `api/server/routes/profile.js`

---

**For questions or issues, check the logs or console output when running the scripts.**
