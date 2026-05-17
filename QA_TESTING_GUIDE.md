# Local QA Testing Guide: Scheduled Tasks

This guide walks through end-to-end manual QA of the Scheduled Tasks feature. It assumes a clean local checkout of this branch.

## Prerequisites

1. **Node.js & MongoDB.** Use Node v20.19.0+ / ^22.12.0 / ≥23, and a reachable MongoDB instance (Community Server, Atlas, or `mongodb-memory-server`). Update `MONGO_URI` in `.env` accordingly.
2. **Install dependencies and build all compiled code** (Turborepo). From the project root:
   ```bash
   npm run smart-reinstall   # installs deps + builds workspaces
   # or, after subsequent pulls:
   npm run build
   ```
3. **Lint check before testing** (the project ships husky pre-commit hooks; run manually to catch issues early):
   ```bash
   npm run lint
   ```
4. **Redis** is required for BullMQ. Spin up a local instance:
   ```bash
   docker run -d -p 6379:6379 --name librechat-redis redis
   ```
5. **Environment variables** in `.env`:
   ```env
   USE_REDIS=true
   REDIS_URI=redis://localhost:6379
   ```
6. **Run unit tests** (from the project root, matches `.github/CONTRIBUTING.md`):
   ```bash
   npm run test:api          # backend (legacy /api): job processor
   npm run test:packages:api # new /packages/api: timezone helpers + queue service
   npm run test:client       # frontend: cron presets, timezones, form-state helpers
   ```
7. **Start the app** in two terminals:
   - Terminal 1: `npm run backend:dev`
   - Terminal 2: `npm run frontend:dev`
8. Log in to `http://localhost:3090`.

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

### 5b. Timezone-aware scheduling
- Create a cron task with:
  - **Trigger Type**: Cron
  - **Cron Expression**: `0 9 * * *` (9 AM)
  - **Timezone**: pick a zone that's currently *not* your local zone (e.g. `Asia/Kolkata` if you're in the US).
- Backend should accept and persist the task.
- In your DB (or `GET /api/scheduled-tasks`), confirm the `timezone` field is stored.
- Tail the backend logs around the next 9 AM in the selected zone — the run should fire then, not at your local 9 AM.

Also create a one-shot date task:
  - **Trigger Type**: One-shot date
  - **Run At**: pick a datetime ~2 minutes in the future
  - **Timezone**: leave as your local zone

Expected: the run fires at the wall-clock time you entered, regardless of server timezone.

Invalid-timezone smoke test:
```bash
curl -s -X POST http://localhost:3080/api/scheduled-tasks \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"targetType":"agent","targetId":"<id>","triggerType":"cron",
       "expression":"0 9 * * *","timezone":"Bogus/Zone","payload":{"text":"hi"}}'
```
Expected: `400` with an error message about IANA identifier.

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

### 8a. Pause and resume a task (UI)
- Create a new every-minute cron task and wait until you've seen at least one successful run in the Task Runs modal.
- On the task card, click the **Pause** icon. The status badge should flip to `paused` (yellow) and the icon should become **Play**.
- Wait at least 2 minutes — no new run entries should appear in the Task Runs modal and backend logs should be quiet for this task.
- Click **Play** (resume). Status flips back to `active` (green) and within ~60 s a new run shows up.

### 8b. Edit a task in place (UI)
- On any existing task, click the **Pencil** icon.
- The form opens prepopulated with the task's values and the heading reads **Edit Task**.
- Change the prompt and switch the trigger from `Cron` to `Interval` (e.g. `120000` ms). Save.
- The task card updates immediately. New runs use the new prompt and interval.

### 8c. Cron preset picker (UI)
- Open the create form, leave **Trigger Type** as **Cron**.
- Use the **Quick presets…** dropdown beneath the cron input — selecting "Every 5 minutes" should fill the input with `*/5 * * * *`.
- Modify the field to `*/30 * * * *`. The helper line below should read "Every 30 minutes".
- For an expression we can't describe (e.g. `0 9 * * 1-3`) the helper line should disappear — power users can still save it. Submit and confirm the task is created.

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
  - Creating a task with Web Search + MCP enabled, using the **Cron preset picker**
  - Pausing → resuming → editing a task
  - Opening the **Task Runs** modal and navigating into a run
  - The chat history sidebar staying clean (no scheduled runs)
- Logs snippet showing one successful background execution.
- Confirmation that all test cases above pass.

## Companion docs PR

User-facing documentation lives in the [`LibreChat-AI/librechat.ai`](https://github.com/LibreChat-AI/librechat.ai) repo. This PR is paired with `content/docs/features/scheduled_tasks.mdx` (registered in `content/docs/features/meta.json`). Link the docs PR in this PR's description before requesting review.
