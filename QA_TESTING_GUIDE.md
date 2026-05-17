# Local QA Testing Guide: Scheduled Tasks

This guide provides step-by-step instructions to locally test the newly implemented **Scheduled Tasks** feature in LibreChat. It covers the end-to-end data flow, API interactions (with dummy content), and edge cases such as enabling MCP and Web Search on a per-task basis.

## Prerequisites

1. **Redis**: Ensure you have a local Redis instance running (BullMQ requires Redis).
   ```bash
   # Example using Docker
   docker run -d -p 6379:6379 redis
   ```
2. **Environment Variables**: Verify that your `.env` file has Redis enabled:
   ```env
   USE_REDIS=true
   REDIS_URI=redis://localhost:6379
   ```
3. **Start the Application**:
   Open two terminals and run:
   - Terminal 1: `npm run backend:dev`
   - Terminal 2: `npm run frontend:dev`

---

## Test Cases

### 1. Basic Task Creation (UI Validation)
**Goal:** Verify the new "Scheduled Tasks" side panel renders correctly and allows basic task creation.

- **Step 1:** Log in to your local LibreChat instance.
- **Step 2:** Open the left-hand Unified Sidebar and click on the **Scheduled Tasks** tab.
- **Step 3:** Click the **+** (Plus) button to open the "New Task" form.
- **Step 4:** Fill out the form with dummy data:
  - **Target Type:** `Agent`
  - **Target ID:** `<your-agent-id>` *(Create a dummy agent first, and copy its ID)*
  - **Cron Expression:** `* * * * *` *(Runs every minute)*
  - **Prompt:** `Write a one-sentence summary of the weather.`
- **Step 5:** Click **Save**.
- **Expected Result:** The task should appear in the list with an `active` status. Wait 1 minute, and check your backend terminal for `[INFO] Successfully executed scheduled task...`.

### 2. Edge Case: MCP Integration (Per-Task Basis via API)
**Goal:** Ensure that when a scheduled task runs, it correctly utilizes the specific MCP servers configured for that exact task (overriding or supplementing the Agent's default configuration).

*Note: Since the UI for advanced `ephemeralAgent` settings isn't fully built out yet, we will test this via the API.*

- **Step 1:** Configure a dummy MCP server (e.g., `weather-mcp`) in the MCP Builder.
- **Step 2:** Obtain your Bearer Token from the browser's Network tab or local storage.
- **Step 3:** Create a task using cURL, passing the `ephemeralAgent` configuration to enable the specific MCP server:

```bash
curl -X POST http://localhost:3080/api/scheduled-tasks \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "agent",
    "targetId": "<your-agent-id>",
    "triggerType": "cron",
    "expression": "* * * * *",
    "payload": {
      "text": "What is the weather in London right now?",
      "ephemeralAgent": {
        "mcp": ["weather-mcp"]
      }
    }
  }'
```
- **Expected Result:** The backend logs should show the background job executing, and the Agent should successfully call the `weather-mcp` tool during execution.

### 3. Edge Case: Web Search & File Search (Per-Task Basis)
**Goal:** Verify that standard tools (like web search) function correctly in a background context when explicitly enabled for the task.

- **Step 1:** Use cURL to create a task with Web Search and File Search explicitly enabled:

```bash
curl -X POST http://localhost:3080/api/scheduled-tasks \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "agent",
    "targetId": "<your-agent-id>",
    "triggerType": "cron",
    "expression": "* * * * *",
    "payload": {
      "text": "Search the web for today s top news headline and summarize it.",
      "ephemeralAgent": {
        "web_search": true,
        "file_search": false
      }
    }
  }'
```
- **Expected Result:** The backend job completes without errors, and the agent successfully performs the web search. You can verify this by checking the resulting conversation thread in your LibreChat UI.

### 4. Task Deletion & Queue Cleanup
**Goal:** Verify that deleting a task removes it from the database and stops the BullMQ queue from firing it.

- **Step 1:** In the Scheduled Tasks UI, click the **Trash** icon next to the active task.
- **Step 2:** Verify it disappears from the UI.
- **Step 3:** Wait for the next cron interval (e.g., 2 minutes).
- **Expected Result:** The task should *not* execute in the backend logs, confirming the BullMQ repeatable job was successfully destroyed.
