# CEO Dashboard Debugging Guide

## Overview
Comprehensive logging has been added to the CEO Dashboard to troubleshoot data display issues with:
- Financial Analytics
- Company Metrics  
- Active Projects
- KPI Stats

---

## How to View Logs

### 1. Open Browser Developer Console
- **Chrome/Edge:** Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Firefox:** Press `F12` or `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)
- **Safari:** Enable Developer Menu first (Preferences → Advanced → Show Develop menu), then press `Cmd+Option+C`

### 2. Navigate to Console Tab
All logs will appear in the Console tab with emoji prefixes for easy filtering.

### 3. Filter Logs
Use the search/filter box in the console:
- `[CEODashboard]` - All dashboard logs
- `[Workflow]` - Workflow execution logs
- `[KPI]` - KPI stats calculation logs
- `🚀` - Workflow execution start
- `❌` - Errors
- `✅` - Success messages

---

## Log Categories

### 1. Component Mount/Initialization
**When:** Component first loads
**Logs:**
```
🎯 [CEODashboard] Component mounted/rendered
👤 [CEODashboard] Profile data: {userId: "...", profileType: "ceo", ...}
🔑 [CEODashboard] Profile type: ceo
📋 [CEODashboard] Allowed workflows: [{workflowId: "...", ...}, ...]
🔄 [CEODashboard] useEffect triggered - fetching dashboard data
```

**What to Check:**
- Is `profileType` correctly set to "ceo"?
- Are `allowedWorkflows` populated?
- Does the profile data look complete?

---

### 2. Project Data Fetching
**When:** Dashboard loads or refresh button clicked
**Logs:**
```
🔄 [CEODashboard] Fetching project data...
📍 [CEODashboard] N8N URL: https://nadyaputriast-n8n.hf.space/webhook/librechat/project-status
📤 [CEODashboard] Request payload: {profileType: "ceo", action: "list"}
📥 [CEODashboard] Raw API response: {...}
📊 [CEODashboard] Response type: object
📊 [CEODashboard] Is Array?: false
✅ [CEODashboard] Extracted from result.data.projects
📊 [CEODashboard] Final projects data: [{...}, ...]
📊 [CEODashboard] Projects count: 5
✅ [CEODashboard] Loading complete
```

**What to Check:**
- Is the N8N URL reachable?
- What does the raw API response look like?
- Is `Projects count` showing 0?
- Any errors in the response?

**Common Issues:**
- **Empty array:** N8N workflow returned no data
- **404 error:** N8N webhook endpoint not found
- **CORS error:** N8N server blocking requests
- **Unknown response structure:** N8N response format changed

---

### 3. KPI Stats Calculation
**When:** After projects data is loaded
**Logs:**
```
📊 [KPI] Calculating KPI stats...
📊 [KPI] Projects data: [{budget: 10000, spent: 5000, status: "active"}, ...]
📊 [KPI] Number of projects: 5
💰 [KPI] Total Budget: 50000
💸 [KPI] Total Spent: 25000
🚀 [KPI] Active Projects: 3
📈 [KPI] Estimated Revenue: 60000
📊 [KPI] Margin: 58.3%
✅ [KPI] Stats calculated: [{title: "Total Budget", value: "$50K", ...}, ...]
```

**What to Check:**
- Are projects properly structured with `budget`, `spent`, and `status` fields?
- Do the calculated values make sense?
- Are all 4 KPI cards showing data?

**Common Issues:**
- **All zeros:** No projects or missing budget/spent fields
- **NaN values:** Projects have invalid numeric data
- **Wrong margin:** Check budget/spent calculation logic

---

### 4. Workflow Execution (Financial Analytics / Company Metrics)
**When:** User clicks a workflow button (e.g., "Financial Analytics", "Company Performance")
**Logs:**
```
🚀 [Workflow] Executing workflow: {workflowId: "wf_financial_analytics", ...}
📋 [Workflow] Workflow ID: wf_financial_analytics
📋 [Workflow] Workflow Name: Financial Analytics Dashboard
💰 [Workflow] Detected financial workflow
📍 [Workflow] Endpoint URL: https://nadyaputriast-n8n.hf.space/webhook/librechat/financial-analytics
📤 [Workflow] Request payload: {userId: "...", profileType: "ceo", workflowId: "..."}
📥 [Workflow] Raw N8N response: {...}
📊 [Workflow] Response type: object
📊 [Workflow] Is Array?: false
🔍 [Workflow] Raw data extracted: {...}
📊 [Workflow] Final metrics data: {revenue: 100000, expenses: 60000, ...}
📊 [Workflow] Metrics keys: ["revenue", "expenses", "profit", ...]
🤖 [Workflow] Sending to OpenAI for analysis...
🤖 [Workflow] AI analysis result: {summary: "...", insights: [...]}
✅ [Workflow] Report generated: {title: "...", summary: "...", metrics: {...}}
🏁 [Workflow] Execution complete
```

**What to Check:**
- Is the workflow being routed to the correct endpoint (financial-analytics vs company-metrics)?
- What data is in the N8N response?
- Are metrics keys populated?
- Did OpenAI analysis complete successfully?

**Common Issues:**
- **No data received:** N8N workflow returned empty/null
- **Wrong endpoint:** Workflow mapping incorrect
- **OpenAI error:** API key missing or invalid
- **Missing metrics keys:** N8N response structure unexpected

---

### 5. Error Handling
**When:** Something goes wrong
**Logs:**
```
❌ [CEODashboard] Fetch failed: Error message here
❌ [CEODashboard] Error details: {message: "...", stack: "..."}
```
OR
```
❌ [Workflow] Execution failed: Error
❌ [Workflow] Error message: Failed to fetch
❌ [Workflow] Error stack: ...
❌ [Workflow] No metrics data received!
```

**What to Check:**
- Full error message and stack trace
- Network tab for failed HTTP requests
- Response status codes (404, 500, CORS errors)

---

## Troubleshooting Checklist

### Projects Not Showing
1. Check console for:
   ```
   📊 [CEODashboard] Projects count: 0
   ```
2. Look at `Raw API response` - is it empty?
3. Test N8N endpoint directly:
   ```bash
   curl -X POST https://nadyaputriast-n8n.hf.space/webhook/librechat/project-status \
     -H "Content-Type: application/json" \
     -d '{"profileType": "ceo", "action": "list"}'
   ```
4. Check if N8N workflow is active and connected to database

### KPI Stats Showing Zeros
1. Check console for:
   ```
   💰 [KPI] Total Budget: 0
   💸 [KPI] Total Spent: 0
   ```
2. Look at `Projects data` - are budget/spent fields present?
3. Verify project data structure matches expected format:
   ```javascript
   {
     projectId: string,
     name: string,
     status: string,
     progress: number,
     budget: number,      // Must be present
     spent: number,       // Must be present
     startDate: string,
     deadline: string
   }
   ```

### Financial Analytics Not Loading
1. Check console for workflow execution logs starting with `🚀 [Workflow]`
2. Verify endpoint mapping:
   - Financial keywords → `/webhook/librechat/financial-analytics`
   - Others → `/webhook/librechat/company-metrics`
3. Check `Raw N8N response` - is data coming back?
4. Verify OpenAI API key in `.env`:
   ```
   VITE_OPENAI_API_KEY=sk-...
   ```
5. Check `Metrics keys` - should show array of available metrics

### Report Not Displaying
1. Check if `Report generated` log appears
2. Verify `activeReport` state is set
3. Look for `CEOReportView` component rendering
4. Check if report section is visible (may need to scroll)

---

## Expected Data Flow

### Successful Project Load
```
1. Component Mount → Profile data logged
2. useEffect → fetchDashboardData called
3. Request sent to N8N
4. Response received and parsed
5. Projects state updated
6. KPI stats recalculated
7. UI renders with data
```

### Successful Workflow Execution
```
1. User clicks workflow button
2. Workflow identified and endpoint mapped
3. Request sent to N8N
4. Metrics data extracted
5. Data sent to OpenAI for analysis
6. AI insights received
7. Report compiled and displayed
8. Auto-scroll to report section
```

---

## Network Debugging

### Check Network Requests
1. Open Browser DevTools → Network tab
2. Reload dashboard
3. Look for requests to:
   - `https://nadyaputriast-n8n.hf.space/webhook/librechat/project-status`
   - `https://nadyaputriast-n8n.hf.space/webhook/librechat/financial-analytics`
   - `https://nadyaputriast-n8n.hf.space/webhook/librechat/company-metrics`
   - `https://api.openai.com/v1/chat/completions`

4. Check status codes:
   - ✅ **200 OK:** Success
   - ❌ **404 Not Found:** Endpoint doesn't exist
   - ❌ **500 Internal Server Error:** N8N workflow error
   - ❌ **CORS Error:** Cross-origin request blocked

### Manual API Testing
Test N8N endpoints directly:

```bash
# Test project status
curl -X POST https://nadyaputriast-n8n.hf.space/webhook/librechat/project-status \
  -H "Content-Type: application/json" \
  -d '{"profileType": "ceo", "action": "list"}'

# Test financial analytics
curl -X POST https://nadyaputriast-n8n.hf.space/webhook/librechat/financial-analytics \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID", "profileType": "ceo", "workflowId": "wf_financial_analytics"}'

# Test company metrics
curl -X POST https://nadyaputriast-n8n.hf.space/webhook/librechat/company-metrics \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID", "profileType": "ceo", "workflowId": "wf_company_metrics"}'
```

---

## Common Fixes

### Issue: No data from N8N
**Solution:** 
1. Verify N8N workflows are active
2. Check database connection in N8N
3. Test endpoints with curl
4. Verify MongoDB collections have data

### Issue: OpenAI analysis fails
**Solution:**
1. Add/verify `VITE_OPENAI_API_KEY` in `.env`
2. Restart frontend dev server
3. Check OpenAI API key has credits
4. Verify API key has correct permissions

### Issue: CORS errors
**Solution:**
1. Check N8N CORS settings
2. Add Jamot domain to N8N allowed origins
3. Use N8N proxy if available

### Issue: Wrong data structure
**Solution:**
1. Check N8N workflow output format
2. Update response parsing logic in `fetchDashboardData`
3. Add data transformation if needed

---

## Log Examples

### ✅ Successful Project Load
```javascript
🎯 [CEODashboard] Component mounted/rendered
👤 [CEODashboard] Profile data: {userId: "507f...", profileType: "ceo"}
🔄 [CEODashboard] useEffect triggered - fetching dashboard data
🔄 [CEODashboard] Fetching project data...
📍 [CEODashboard] N8N URL: https://nadyaputriast-n8n.hf.space/webhook/librechat/project-status
📥 [CEODashboard] Raw API response: {data: {projects: [...]}}
✅ [CEODashboard] Extracted from result.data.projects
📊 [CEODashboard] Projects count: 5
📊 [KPI] Calculating KPI stats...
💰 [KPI] Total Budget: 50000
✅ [KPI] Stats calculated
```

### ❌ Failed API Request
```javascript
🔄 [CEODashboard] Fetching project data...
📍 [CEODashboard] N8N URL: https://nadyaputriast-n8n.hf.space/webhook/librechat/project-status
❌ [CEODashboard] Fetch failed: Error: Server Error (500): Internal Server Error
❌ [CEODashboard] Error details: {message: "Server Error (500)...", stack: "..."}
📊 [CEODashboard] Projects count: 0
```

---

## Files Modified

- `client/src/components/Profile/CEODashboard.tsx`
  - Added logging to component mount
  - Added logging to data fetching
  - Added logging to KPI calculation
  - Added logging to workflow execution
  - Added detailed error logging

---

## Next Steps

1. **Open the dashboard in browser**
2. **Open DevTools Console** (F12)
3. **Look for log entries** with the emoji prefixes
4. **Copy relevant logs** if issues found
5. **Share logs** for debugging support

The logs will show exactly:
- What data is being received
- Where the process fails
- What the response format looks like
- Whether calculations are correct

---

**Last Updated:** January 14, 2026
