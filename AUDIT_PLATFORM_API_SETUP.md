# Admin API & Approval Workflow - Setup Guide

## Overview

This guide will help you complete the setup of the admin approval workflow and APIs for the AI Auditor platform.

## ✅ What's Been Completed

- ✅ Database schema updated with approval fields and version tracking
- ✅ Migration created and applied
- ✅ Admin authentication middleware created
- ✅ 5 admin API endpoints built
- ✅ Email service with Resend integration created
- ✅ User-facing APIs updated to respect approval status
- ✅ Environment variables configured with placeholders

## 🔧 Configuration Required

### 1. Resend Setup

You need to configure Resend for sending approval emails with PDF attachments.

**Steps:**

1. **Get Resend API Key** (if you don't have one):
   - Go to https://resend.com
   - Sign up or log in
   - Navigate to API Keys
   - Create a new API key
   - Copy the key (starts with `re_`)

2. **Update .env file**:
   ```bash
   RESEND_API_KEY="re_YOUR_ACTUAL_KEY_HERE"
   RESEND_FROM_EMAIL="noreply@yourdomain.com"  # Update with your domain
   ```

3. **Verify Domain** (for production):
   - In Resend dashboard, go to Domains
   - Add your domain (e.g., `yourdomain.com`)
   - Add the DNS records they provide (SPF, DKIM, DMARC)
   - Verify the domain
   - Use format: `Your Company <noreply@yourdomain.com>`

### 2. Environment Variables Summary

Your `.env` file now includes:

```env
# Admin API Authentication
ADMIN_API_SECRET="56d6e133-7574-4b46-b749-d15b4a784377"

# Email Service (Resend)
RESEND_API_KEY="re_YOUR_RESEND_API_KEY_HERE"  # ⚠️ UPDATE THIS
RESEND_FROM_EMAIL="noreply@yourdomain.com"     # ⚠️ UPDATE THIS
```

**Admin Secret:**
- ✅ Already generated: `56d6e133-7574-4b46-b749-d15b4a784377`
- This is used for bearer token authentication on admin APIs
- Keep this secure - share only with your admin platform developers

### 3. Update Production URLs

Update these values for production deployment:

```env
NEXT_PUBLIC_APP_URL="https://yourproductiondomain.com"
RESEND_FROM_EMAIL="noreply@yourproductiondomain.com"
```

## 📚 API Documentation

### Authentication

All admin endpoints require bearer token authentication:

```bash
Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377
```

Optional header for tracking admin actions:
```bash
X-Admin-ID: admin-john
```

### Available Endpoints

#### 1. List All Audits
```bash
GET /api/admin/audits

Query Parameters:
- userId: Filter by user ID
- status: Filter by session status (PAID, COMPLETED, PROCESSED, etc.)
- approved: Filter by approval status (true/false)
- limit: Results per page (default: 50, max: 100)
- offset: Skip N results (default: 0)

Example:
curl "http://localhost:3000/api/admin/audits?approved=false&limit=20" \
  -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377"
```

**Response:**
```json
{
  "audits": [
    {
      "id": "session_123",
      "userId": "user_456",
      "status": "PROCESSED",
      "createdAt": "2026-02-16T10:30:00Z",
      "user": {
        "id": "user_456",
        "email": "customer@example.com",
        "name": "John Doe"
      },
      "report": {
        "id": "report_789",
        "approved": false,
        "createdAt": "2026-02-16T10:51:00Z"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### 2. Get Audit Details
```bash
GET /api/admin/audits/:id

Example:
curl "http://localhost:3000/api/admin/audits/session_123" \
  -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377"
```

**Response includes:**
- Full session details (payment, timestamps, conversation)
- User information
- Complete report content
- Version history

#### 3. Edit Report
```bash
PUT /api/admin/audits/:id

Example:
curl -X PUT "http://localhost:3000/api/admin/audits/session_123" \
  -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377" \
  -H "X-Admin-ID: admin-jane" \
  -H "Content-Type: application/json" \
  -d '{
    "executiveSummary": "Updated summary text...",
    "painPoints": [
      {
        "category": "operations",
        "title": "Manual data entry",
        "description": "...",
        "severity": "high",
        "current_time_spent": "10 hours/week",
        "business_impact": "..."
      }
    ],
    "recommendations": [...],
    "quickWins": ["Action 1", "Action 2"],
    "longTermInitiatives": ["Initiative 1"],
    "estimatedROI": {
      "hours_saved": "500 hours/year",
      "cost_equivalent": "£25,000 annual value"
    },
    "changeNotes": "Fixed typos and clarified recommendations"
  }'
```

**Response:**
```json
{
  "success": true,
  "reportId": "report_789",
  "versionNumber": 2,
  "message": "Report updated successfully"
}
```

**Version Tracking:**
- First edit automatically creates version 1 (original)
- Each subsequent edit creates a new version
- Full snapshot stored for each version
- Admin ID and change notes tracked

#### 4. Approve Report (Sends Email)
```bash
PATCH /api/admin/audits/:id/approve

Example:
curl -X PATCH "http://localhost:3000/api/admin/audits/session_123/approve" \
  -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377" \
  -H "X-Admin-ID: admin-jane" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Great insights! Let me know if you have any questions about the recommendations."
  }'
```

**Response:**
```json
{
  "success": true,
  "reportId": "report_789",
  "emailSent": true,
  "message": "Report approved and email sent successfully"
}
```

**What Happens:**
1. Report marked as `approved: true`
2. `approvedAt` timestamp set
3. `approvedBy` field set to admin ID
4. Email sent to user with PDF attachment
5. User can now view report in their dashboard

**Email Contents:**
- Professional HTML template with branding
- PDF report attached
- Optional custom message from admin
- Link to view report online

#### 5. List Users
```bash
GET /api/admin/users

Query Parameters:
- search: Search by email or name
- limit: Results per page (default: 50, max: 100)
- offset: Skip N results (default: 0)

Example:
curl "http://localhost:3000/api/admin/users?search=john&limit=10" \
  -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377"
```

**Response:**
```json
{
  "users": [
    {
      "id": "user_456",
      "email": "john@example.com",
      "name": "John Doe",
      "createdAt": "2026-01-10T09:00:00Z",
      "emailVerified": "2026-01-10T09:05:00Z",
      "_count": {
        "auditSessions": 3
      }
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

## 🧪 Testing the Workflow

### Local Testing Steps

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Test unapproved reports (with a test audit):**
   ```bash
   # Get audit list (should show approved: false for new reports)
   curl "http://localhost:3000/api/admin/audits?approved=false" \
     -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377"
   ```

3. **Test user view (should return 202 - Processing):**
   - Log in as the user who completed the audit
   - Navigate to `/report/[sessionId]`
   - Should see "Processing" state (report exists but not approved)

4. **Test approval with email:**
   ```bash
   # Approve report (replace session_123 with actual session ID)
   curl -X PATCH "http://localhost:3000/api/admin/audits/session_123/approve" \
     -H "Authorization: Bearer 56d6e133-7574-4b46-b749-d15b4a784377" \
     -H "X-Admin-ID: test-admin" \
     -H "Content-Type: application/json" \
     -d '{"message": "Test approval message"}'
   ```

5. **Verify email sent:**
   - Check Resend dashboard for email delivery status
   - Check user's email inbox
   - Verify PDF attachment is present and correct

6. **Test user view after approval:**
   - Refresh `/report/[sessionId]` page
   - Report should now be visible
   - PDF download should work

### Testing Checklist

- [ ] Admin can list all audits with filters
- [ ] Admin can view audit details
- [ ] Admin can edit report (version created)
- [ ] Admin can approve report
- [ ] Email sent successfully on approval
- [ ] PDF attached to email correctly
- [ ] User sees "Processing" before approval
- [ ] User can view report after approval
- [ ] User can download PDF after approval
- [ ] Existing reports still accessible (auto-approved)

## 🚀 Production Deployment

### Pre-Deployment Checklist

1. **Environment Variables:**
   - [ ] `ADMIN_API_SECRET` set (already done: `56d6e133-7574-4b46-b749-d15b4a784377`)
   - [ ] `RESEND_API_KEY` updated with real key
   - [ ] `RESEND_FROM_EMAIL` updated with verified domain
   - [ ] `NEXT_PUBLIC_APP_URL` updated to production URL

2. **Resend Configuration:**
   - [ ] Domain verified in Resend dashboard
   - [ ] DNS records added (SPF, DKIM, DMARC)
   - [ ] Test email sent successfully

3. **Database Migration:**
   ```bash
   npx prisma migrate deploy
   ```

4. **Verify Migration:**
   ```bash
   npx prisma db pull
   ```

5. **Build & Deploy:**
   ```bash
   npm run build
   # Deploy to Coolify or your hosting platform
   ```

### Post-Deployment Verification

1. **Test Admin APIs:**
   - Call each endpoint with production URL
   - Verify authentication works
   - Check response formats

2. **Test Email Delivery:**
   - Approve a test report
   - Verify email received
   - Check Resend dashboard for delivery status

3. **Monitor Logs:**
   - Watch for any errors in application logs
   - Check Resend webhook logs (if configured)
   - Monitor approval workflow timing

## 🔐 Security Considerations

### Admin API Secret

**Current Secret:**
```
56d6e133-7574-4b46-b749-d15b4a784377
```

**Sharing with Admin Platform:**
- Share securely via password manager (1Password, LastPass)
- Never commit to git
- Never send via plain text email
- Consider rotating periodically

### Best Practices

1. **Token Rotation:**
   - Rotate `ADMIN_API_SECRET` every 90 days
   - Update all admin platforms when rotating

2. **Monitoring:**
   - Log all admin API requests
   - Monitor for unusual activity
   - Set up alerts for failed auth attempts

3. **Access Control:**
   - Use `X-Admin-ID` header to track who made changes
   - Implement admin user roles (future enhancement)

## 📊 Monitoring & Analytics

### Key Metrics to Track

1. **Approval Workflow:**
   - Time from report generation to approval
   - Number of pending approvals
   - Approval rate (approved vs rejected)

2. **Email Delivery:**
   - Email sent successfully rate
   - Email open rate (via Resend webhooks)
   - PDF attachment download rate

3. **Admin Activity:**
   - Number of edits per report
   - Most active admins (via X-Admin-ID)
   - Edit frequency and timing

### Resend Dashboard

Monitor in Resend:
- Email delivery status
- Bounce rates
- Spam complaints
- Open rates (if tracking enabled)

## 🛠️ Troubleshooting

### Email Not Sending

**Check:**
1. `RESEND_API_KEY` is correct
2. `RESEND_FROM_EMAIL` domain is verified
3. User email address is valid
4. Check Resend dashboard for errors
5. Check application logs for error messages

**Approval will succeed even if email fails** - check response:
```json
{
  "success": true,
  "emailSent": false,
  "error": "Email delivery error"
}
```

### User Still Sees "Processing"

**Check:**
1. Report was actually approved (call GET /api/admin/audits/:id)
2. Browser cache cleared
3. User is logged in as correct user
4. Session ID is correct

### Admin API Returns 401

**Check:**
1. Bearer token matches `ADMIN_API_SECRET`
2. Authorization header format: `Bearer <token>`
3. No extra spaces or quotes in token

## 📞 Support

For issues or questions:
- Review this guide
- Check application logs
- Review Resend dashboard
- Contact development team

## 🎯 Next Steps

1. **Update Environment Variables:**
   - Get Resend API key
   - Update `RESEND_API_KEY` in `.env`
   - Update `RESEND_FROM_EMAIL` with your domain

2. **Test Locally:**
   - Follow testing steps above
   - Verify email delivery works

3. **Deploy to Production:**
   - Update production environment variables
   - Run migration
   - Deploy application
   - Test with production URLs

4. **Share with Admin Platform Team:**
   - API base URL: `https://yourdomain.com/api/admin`
   - Bearer token: `56d6e133-7574-4b46-b749-d15b4a784377`
   - This documentation

## 📝 Additional Notes

### Existing Reports
- All existing reports were auto-approved during migration
- Users with existing reports can still access them
- Only new reports (from now on) require approval

### Version History
- Original report saved as version 1 on first edit
- Each edit creates a new incremental version
- Full content snapshot stored for each version
- Easy to view edit history and rollback if needed

### Email Template
- Professional HTML design with gradient header
- Responsive for mobile devices
- Includes company branding
- PDF automatically attached
- "View Online" button links to dashboard
