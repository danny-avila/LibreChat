# Social Media Automation – Work Plan & Progress Tracker

**Owner:** [Your name]  
**Started:** [Date]  
**First milestone:** Input-to-Draft loop + approval gate (48h from kickoff)

---

## 0. Getting started – n8n access & env

**n8n instance (your team’s):**

| Item | Value |
|------|--------|
| **n8n URL (login & webhooks)** | `https://n8n-esksoko8wgcg8w00gg880s8k.cloud.jamot.pro` |
| **Login** | Open the URL above in your browser. Sign in with the credentials you were given (email + password). Do **not** commit passwords to the repo. |

**LibreChat → n8n:** So that this app can call n8n, set in your **`.env`** (repo root):

```env
N8N_WEBHOOK_URL=https://n8n-esksoko8wgcg8w00gg880s8k.cloud.jamot.pro
```

If your team uses an API key for n8n, add:

```env
N8N_API_KEY=your-n8n-api-key-if-required
```

Restart `npm run dev` after changing `.env`. Then proceed to Phase A below.

---

## 1. Executive summary

| Item | Description |
|------|-------------|
| **Vision** | Turn LibreChat into a **Command Center**: user enters a raw idea → n8n orchestrates creation, adaptation, and distribution of content across social platforms, with a **Human-in-the-Loop (HITL)** approval gate before anything is posted. |
| **Infrastructure** | LibreChat is installed and talks to n8n via webhooks. Your work is the **intelligence** (LLM-based generation) and **orchestration** (workflows, HITL, posting) **inside n8n**. |
| **First milestone (48h)** | Fully functional **Input → Draft** loop: LibreChat sends raw idea → n8n generates platform-specific drafts → workflow **pauses** → user sees preview and approves → workflow **resumes** (posting to APIs can come after this). |

---

## 2. Technical objectives (from task)

| # | Objective | What | Why |
|---|-----------|------|-----|
| **1** | **Multi-platform generation** | Receive raw text from LibreChat; route to LLMs (GPT-4/Claude) to produce optimized drafts for LinkedIn, X, Instagram, Farcaster. | Each platform needs its own “voice” and format. |
| **2** | **Stateful HITL** | After drafts are generated, workflow **stops** and sends a preview to the user. It **only continues** to “Post” when an explicit approval signal is received. | Brand safety: no content hits public APIs without human verification. |
| **3** | **Direct API distribution** | Final nodes push **approved** content to LinkedIn, X, Instagram (OAuth2, error handling, rate limits). | Zero manual upload. |

---

## 3. How it fits the codebase (quick reference)

| Layer | Where it lives | Your focus |
|-------|----------------|------------|
| **LibreChat** | This repo (`librechat-n8n-enterprise`). User chats here; a “tool” or UI action sends payload to n8n. | Optional: small change to **trigger** the workflow (e.g. tool name, payload shape). Most work is in n8n. |
| **n8n** | External instance (e.g. `N8N_WEBHOOK_URL` in `.env`). Workflows are **designed and run there**. | **Primary:** build workflows, LLM chains, HITL, and (later) posting. |
| **LibreChat ↔ n8n** | `api/server/middleware/n8nProxy.js`: LibreChat POSTs to `N8N_WEBHOOK_URL + workflow.endpoint`. Profile’s `allowedWorkflows` define which workflowId and endpoint are used. | Ensure the new workflow has an `endpoint` (webhook path) and is registered in profiles if you use the existing “execute workflow” UX. |
| **Workflow definitions (reference)** | `n8n-workflows/*.json` in this repo. You can add a **reference** export here; actual editing runs in n8n UI. | Optional: export your n8n workflow JSON into `n8n-workflows/` for version control. |

---

## 4. Work plan (steps to follow)

### Phase A – Foundation (do first)

| Step | Task | Status | Notes |
|------|------|--------|-------|
| A1 | **Confirm n8n access** – Log into the n8n instance (e.g. from `N8N_WEBHOOK_URL`). Create a test workflow with a Webhook trigger and a “Respond to Webhook” to verify LibreChat can call it. | ✅ Done | Postman 200 + JSON response on production URL. |
| A2 | **Confirm LibreChat → n8n** – In this repo, ensure `.env` has `N8N_WEBHOOK_URL` and (if required) `N8N_API_KEY`. Trigger an existing n8n workflow from LibreChat (e.g. create-task) and confirm execution. | ✅ Done | Created project from app; POST to n8n webhook returned 200 + success. |
| A3 | **Define payload contract** – Document the JSON body LibreChat will send (e.g. `{ "rawIdea": "...", "userId": "..." }`) and what the “social automation” workflow will accept. Add this to this file or a linked `PAYLOAD_CONTRACT.md`. | ✅ Done | See `SOCIAL_AUTOMATION_PAYLOAD.md`. |
| A4 | **Register new workflow in LibreChat** – If your team uses profile-based workflow lists, add the new “Social Media Automation” workflow (workflowId + webhook `endpoint`) to the relevant profile(s) so users can trigger it. | ✅ Done | Definition in `N8nToolService.js`; AuthService updated for new users; existing users authorized by `profileType`. |

### Phase B – Input → Draft (48h milestone)

| Step | Task | Status | Notes |
|------|------|--------|-------|
| B1 | **Create main workflow in n8n** – New workflow: Webhook trigger (e.g. `librechat/social-draft`). Parse incoming body (raw idea, user id). | ✅ Done | Webhook1 (path `librechat/social-draft`) + Prepare Data node. |
| B2 | **Add LLM node(s)** – One or more OpenAI/Claude nodes to generate **one** platform draft first (e.g. LinkedIn). Use a clear prompt: “Turn this raw idea into a LinkedIn post: {{ rawIdea }}.” Test with a manual webhook call. | ✅ Done | LinkedIn (and structured multi-platform) generation working; output at `output[0].content[0].text`. |
| B3 | **Extend to multi-platform** – Duplicate/adapt logic for X, Instagram, Farcaster (or a subset for v1). Either: separate branches per platform, or one LLM call with a structured prompt that returns multiple drafts. Output: one object per platform (e.g. `{ linkedin: "...", x: "...", ... }`). | ✅ Done | Single LLM with structured JSON prompt; Code node parses and builds `drafts` object (see `SOCIAL_DRAFT_N8N_GUIDE.md`). |
| B4 | **Return drafts to LibreChat** – After generation, use “Respond to Webhook” (or a second webhook) to send back the drafts JSON so LibreChat can show a preview. For HITL you will later **not** respond immediately; instead you’ll “wait” and respond after approval. | ✅ Done | Code node returns `[{ json: { success, drafts } }]`; Respond to Webhook sends body; modal displays drafts. |
| B5 | **Verify end-to-end** – From LibreChat (or Postman) send a raw idea → n8n returns drafts. Confirm format and content. | ✅ Done | E2E verified: LibreChat → n8n → drafts returned → modal shows drafts. |

### Phase C – Human-in-the-Loop (HITL)

| Step | Task | Status | Notes |
|------|------|--------|-------|
| C1 | **Introduce Wait** – After generating drafts, **do not** respond to the Webhook yet. Use n8n **Wait** node (e.g. “Wait for webhook” or “Wait” with a resume URL). The workflow execution will pause and get an `executionId` / `resumeUrl`. | ⬜ Todo | |
| C2 | **Expose drafts to user** – Store drafts + `executionId`/`resumeUrl` somewhere the user can see them (e.g. return a “pending” response with a link, or store in DB and show in LibreChat). User sees: “Drafts ready – Approve or Reject.” | ⬜ Todo | |
| C3 | **Approval webhook** – Create a second webhook (e.g. `librechat/social-approve`) that receives `{ executionId, approved: true|false, selectedPlatforms?: [...] }`. Use n8n’s “Resume Wait” or call the stored resume URL so the paused execution continues. | ⬜ Todo | |
| C4 | **Branch on approval** – After resume, IF approved → go to “Post” branch; IF rejected → end workflow (optional: respond with “Rejected”). No content must reach LinkedIn/X/Instagram without approval. | ⬜ Todo | |
| C5 | **Test HITL** – Full run: trigger from LibreChat → drafts generated → workflow paused → call approval webhook → workflow resumes and (for now) just logs “Would post” or returns success. | ⬜ Todo | |

### Phase D – Direct API distribution (after 48h milestone)

| Step | Task | Status | Notes |
|------|------|--------|-------|
| D1 | **Credentials** – In n8n, create OAuth2 (or API key) credentials for LinkedIn, X (Twitter), Instagram (e.g. Meta Graph API) as needed. Document which APIs you use (REST endpoints). | ⬜ Todo | |
| D2 | **Post nodes** – Add HTTP Request or native nodes to post approved content to each platform. Map draft fields to the required API payloads. | ⬜ Todo | |
| D3 | **Error handling & retries** – Use n8n’s retry/error handling and respect rate limits (backoff, optional queue). | ⬜ Todo | |
| D4 | **E2E test** – Approve one draft → confirm it appears on the target platform (or in sandbox). | ⬜ Todo | |

---

## 5. Progress log (how far we’ve come)

Use this section to note what you did and when. Copy the table and add rows as you go.

| Date | Step | What you did | Blockers / next |
|------|------|--------------|-----------------|
| (example) | A1 | Logged into n8n, created test webhook workflow. | Next: A2 – trigger from LibreChat. |
| | A2–A3 | Confirmed LibreChat → n8n; defined payload contract in `SOCIAL_AUTOMATION_PAYLOAD.md`. | |
| | A4 | Registered social draft workflow: `wf_social_draft` in N8nToolService, customer `allowedWorkflows` in AuthService, sidebar link + Start Social Draft modal, i18n key. | |
| | B1–B5 | n8n workflow with webhook `librechat/social-draft` + Prepare Data; LinkedIn LLM draft working. LibreChat modal shows drafts. Guide in `SOCIAL_DRAFT_N8N_GUIDE.md`. | Next: multi-platform drafts + response shape `{ success, drafts }` in n8n; then HITL. |
| 2025-01-29 | B2–B5 | Fixed n8n Code node: pass `$json` (not `{$json}`), return `[{ json: { success, drafts } }]`. E2E working; Input → Draft loop complete. | Next: Phase C (HITL). |

---

## 6. Decisions & open questions

- **Modular vs single workflow:** TBD – e.g. one workflow with branches vs separate sub-workflows per platform.
- **Where to show drafts in LibreChat:** Dedicated UI – sidebar link “Start Social Draft” opens a modal; modal displays drafts when n8n returns them.
- **Wait implementation:** TBD – n8n “Wait for Webhook” vs external DB + resume URL; document once chosen.

---

## 7. File and doc links

- **This plan:** `SOCIAL_MEDIA_AUTOMATION_PLAN.md`
- **Local dev:** `LOCAL_DEV_SETUP.md`
- **n8n workflow reference (this repo):** `n8n-workflows/`
- **LibreChat → n8n:** `api/server/middleware/n8nProxy.js`, `api/server/routes/n8n.js`
- **Payload contract:** `SOCIAL_AUTOMATION_PAYLOAD.md` (trigger, response, approval, profile reference)

---

## 8. Payload contract (summary)

Full contract: **`SOCIAL_AUTOMATION_PAYLOAD.md`**.

- **Trigger:** `{ "rawIdea": "...", "userId": "..." }` — `userId` from `GET /api/profile`.
- **Response (drafts):** `{ "success": true, "drafts": { "linkedin": "...", "x": "...", ... } }` (or with `executionId`/`resumeUrl` when HITL is in place).
- **Approval:** `{ "executionId": "...", "approved": true|false, "selectedPlatforms": [...] }`.

---

*Last updated: 2025-01-29. Phase B complete; next: Phase C (HITL).*
