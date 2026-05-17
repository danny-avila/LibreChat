# Local QA Testing Guide: Scheduled Tasks

This guide walks through end-to-end manual QA of the Scheduled Tasks feature. It assumes a clean local checkout of this branch.

## Prerequisites

1. **Redis** is required for BullMQ. Spin up a local instance:
   ```bash
   docker run -d -p 6379:6379 --name librechat-redis redis
   ```
2. **Environment variables** in `.env`:
   ```env
   USE_REDIS=true
   REDIS_URI=redis://localhost:6379
   ```
3. **Build and start** in two terminals:
   - `npm run build` (one time, after pulling)
   - Terminal 1: `npm run backend:dev`
   - Terminal 2: `npm run frontend:dev`
4. Log in to `http://localhost:3090`.

---

## Test Cases

### 1. Sidebar entry renders
- Open the unified left sidebar.
- The **Scheduled Tasks** tab should appear with a clock-calendar icon.
- Clicking it should open an empty panel with a **+** button at the top right.

### 2. Create a basic recurring task (UI)
- Click **+** to open the form.
- Fill in:
  - **Target Type**: `Agent`
  - **Target ID**: a real agent ID from your workspace
  - **Cron Expression**: `* * * * *` (every minute)
  - **Prompt**: `Write one fun fact about octopuses.`
- Leave the capability switches off.
- Click **Save**.

Expected:
- Task card appears with `active` badge.
- Within ~60s, backend logs show `Executing scheduled task ...` then `Successfully executed scheduled task ...`.
- **The main chat history sidebar should NOT show this new run as a conversation.**

### 3. View task runs (new UI)
- On the task card, click the **History** (clock) icon.
- A modal titled "Task Runs" opens.
- After a minute or two there should be one or more entries with timestamps.
- Click any entry → you should navigate to `/c/<conversationId>` and see the agent's response in the normal chat view.
- Verify that the resulting conversation is **not** present in the main chat history list.

### 4. Per-task capabilities: Web Search
- Create another task with:
  - Prompt: `Search the web for today's top headline and summarize it.`
  - Toggle **Web Search** ON.
- After the next minute, open the task's runs and click into the latest one.

Expected: the conversation shows tool calls for the web-search tool and a summarized answer.

### 5. Per-task capabilities: MCP server
- Configure an MCP server (e.g., a weather tool) in your account.
- Create a task with:
  - Prompt: `What's the weather in Tokyo right now?`
  - Check the relevant MCP server in the form.
- After the next run, open the run from the History modal.

Expected: the conversation invokes the selected MCP server tool.

### 6. Temporary chat mode (no persistence)
- Create a task with **Run as Temporary Chat** enabled.
- After the next run, open the History modal for this task.

Expected: the modal shows no entries — the run executed but was not persisted. Backend logs still show success.

### 7. User isolation
- Log in as user A, create a task, capture its `_id` (from network tab `GET /api/scheduled-tasks`).
- Log in as user B in a different browser.
- From user B's session, try:
  ```bash
  curl -X PUT http://localhost:3080/api/scheduled-tasks/<USER_A_TASK_ID> \
    -H "Authorization: Bearer <USER_B_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"status":"paused"}'
  curl -X DELETE http://localhost:3080/api/scheduled-tasks/<USER_A_TASK_ID> \
    -H "Authorization: Bearer <USER_B_TOKEN>"
  ```
Expected: both return `404 Task not found`. User A's task remains unaffected.

### 8. Task deletion cleans up the queue
- Delete the task created in step 2 by clicking the trash icon.
- Wait two minutes.

Expected: no further `Executing scheduled task ...` log lines for that task ID — BullMQ repeatable job has been removed.

### 9. API smoke test (cURL)
Replace `<TOKEN>` with the JWT from your browser's network tab.

```bash
# List
curl -s http://localhost:3080/api/scheduled-tasks -H "Authorization: Bearer <TOKEN>"

# Create
curl -s -X POST http://localhost:3080/api/scheduled-tasks \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "targetType":"agent",
    "targetId":"<AGENT_ID>",
    "triggerType":"interval",
    "expression":"60000",
    "payload":{"text":"hello","ephemeralAgent":{"web_search":true}}
  }'

# Update (pause)
curl -s -X PUT http://localhost:3080/api/scheduled-tasks/<TASK_ID> \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"status":"paused"}'

# Delete
curl -s -X DELETE http://localhost:3080/api/scheduled-tasks/<TASK_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

### 10. Backend restart resilience
- Create an active recurring task.
- Stop and restart `npm run backend:dev`.

Expected: after restart, BullMQ should resume firing the existing repeatable jobs (they're persisted in Redis). Verify with backend logs.

---

## What to capture for the PR

- A short screen recording (or annotated screenshots) covering:
  - Creating a task with Web Search + MCP enabled
  - Opening the **Task Runs** modal and navigating into a run
  - The chat history sidebar staying clean (no scheduled runs)
- Logs snippet showing one successful background execution.
- Confirmation that all 10 test cases above pass.
