# Social Media Automation – Payload Contract

Defines the data shape between LibreChat and the n8n social automation workflow(s).

---

## 1. Where `userId` comes from

LibreChat gets the current user’s id from **`GET /api/profile`**. The response includes:

```json
{
  "userId": "697b96e54c7e06d7d81c495a",
  "profileType": "customer",
  "permissions": ["create_ticket", "view_own_tickets", "update_own_ticket"],
  "allowedWorkflows": [
    {
      "workflowId": "wf_create_ticket",
      "workflowName": "Create Support Ticket",
      "endpoint": "/webhook/librechat/ticket-create",
      "description": "Create a new support ticket.",
      "_id": "697b96e64c7e06d7d81c495d"
    }
  ],
  "metadata": { "securityLevel": 1 }
}
```

Use **`userId`** from this response when calling the social automation workflow.

---

## 2. Trigger: LibreChat → n8n (start social draft)

**When:** User submits a raw idea to generate social drafts.

**Method:** `POST` to the workflow’s webhook endpoint (e.g. `N8N_WEBHOOK_URL + /webhook/librechat/social-draft`).

**Body (minimal):**

```json
{
  "rawIdea": "Your one or two sentences describing the idea",
  "userId": "697b96e54c7e06d7d81c495a"
}
```

| Field     | Type   | Required | Description |
|----------|--------|----------|-------------|
| `rawIdea` | string | Yes      | Raw idea or brief from the user. |
| `userId`  | string | Yes      | Current user id from `GET /api/profile` → `userId`. |

**Enriched by LibreChat (optional):** The n8n proxy may add `_context` (e.g. `userId`, `profileType`, `timestamp`). The n8n workflow can use `body.rawIdea`, `body.userId`, and `body._context` if present.

---

## 3. Response: n8n → LibreChat (drafts ready)

**When:** After the workflow has generated platform drafts (Phase B). Later, with HITL, this may be a “pending” response with `executionId` / `resumeUrl`.

**Body (Phase B – simple):**

```json
{
  "success": true,
  "drafts": {
    "linkedin": "Draft text for LinkedIn...",
    "x": "Draft text for X...",
    "instagram": "Draft caption for Instagram...",
    "farcaster": "Draft for Farcaster..."
  }
}
```

**Body (Phase C – with HITL):**

```json
{
  "status": "drafts_ready",
  "executionId": "...",
  "resumeUrl": "...",
  "drafts": {
    "linkedin": "...",
    "x": "...",
    "instagram": "...",
    "farcaster": "..."
  }
}
```

---

## 4. Approval: LibreChat/UI → n8n (resume after HITL)

**When:** User approves or rejects drafts. Sent to the approval/resume webhook so the workflow can continue.

**Body:**

```json
{
  "executionId": "...",
  "approved": true,
  "selectedPlatforms": ["linkedin", "x"]
}
```

| Field               | Type    | Description |
|---------------------|---------|-------------|
| `executionId`       | string  | From the “drafts ready” response. |
| `approved`          | boolean | `true` to post, `false` to cancel. |
| `selectedPlatforms`| string[]| Optional. Platforms to post to when `approved` is true. |

---

## 5. Registering the workflow in LibreChat

To show “Social Media Automation” in the app, add an entry to the profile’s **`allowedWorkflows`** (same shape as existing workflows):

```json
{
  "workflowId": "wf_social_draft",
  "workflowName": "Social Media Draft",
  "endpoint": "/webhook/librechat/social-draft",
  "description": "Generate social media drafts from a raw idea."
}
```

The **endpoint** must match the path you set on the Webhook node in n8n (e.g. `librechat/social-draft` → `/webhook/librechat/social-draft`).
