# 🚀 Audit Feature - Quick Start Guide

## Enable Audit Feature in 3 Steps

### Step 1: Configure Environment
```bash
# Edit your .env file
BUSINESS_NAME=scaffad
ADMIN_PLATFORM_URL=https://your-audit-platform.com/api
ADMIN_API_SECRET=your-bearer-token-here
```

### Step 2: Restart Backend
```bash
cd api
npm run dev
# or
pm2 restart jamot-chat-api

# Check startup logs for:
# [Feature Config] Audit routes: LOADED
```

### Step 3: Access Feature
1. Login as CEO user
2. Open CEO Dashboard (click profile icon)
3. Click "🔍 Audit" tab
4. Start managing audits!

---

## Quick Test

### Test Audit Enabled (Scaffad)
```bash
# Set in .env
BUSINESS_NAME=scaffad

# Restart backend
# Login as CEO
# Open Dashboard → See "Audit" tab ✅
```

### Test Audit Disabled (Jamot)
```bash
# Set in .env
BUSINESS_NAME=jamot

# Restart backend
# Login as CEO
# Open Dashboard → NO "Audit" tab ✅
```

---

## Available Businesses

| Business | Audit Feature | Other Features |
|----------|---------------|----------------|
| **scaffad** | ✅ Enabled | social-media, user-management |
| **jamot** | ❌ Disabled | social-media, financial-analytics |
| **generic** | ❌ Disabled | (none) |

---

## Troubleshooting

### "Audit tab not showing"
- Check `BUSINESS_NAME=scaffad` in .env
- Restart backend server
- Hard refresh browser (Ctrl+Shift+R)

### "Feature not available" error
- Verify business name is correct (lowercase)
- Check backend logs for feature config
- Ensure backend restarted after env changes

### "API connection error"
- Verify `ADMIN_PLATFORM_URL` is correct
- Verify `ADMIN_API_SECRET` is valid
- Test external API health manually

---

## API Endpoints

All require: JWT + CEO Role + 'audit' feature + Bearer Token

```
GET    /api/admin/audits                    - List audits
GET    /api/admin/audits/:sessionId         - Get details
PUT    /api/admin/audits/:sessionId         - Edit report
PATCH  /api/admin/audits/:sessionId/approve - Approve
GET    /api/admin/audits/users              - List users
GET    /api/admin/audits/health             - Health check
```

---

## Full Documentation

- **Testing Guide**: `AUDIT_IMPLEMENTATION_TESTING.md`
- **Complete Summary**: `AUDIT_FEATURE_COMPLETE.md`
- **API Setup**: `AUDIT_PLATFORM_API_SETUP.md`

---

**Need Help?** Check the full documentation files above or contact the development team.
