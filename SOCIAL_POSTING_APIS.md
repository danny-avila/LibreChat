# Phase D – Social Posting APIs & Credentials

Reference for implementing **D1 (credentials)** and **D2 (post nodes)**. Use this when configuring OAuth2/API keys and HTTP Request nodes for LinkedIn, X, and Instagram.

---

## 0. Product flow: per-user social accounts (required)

**The flow is for individual logged-in or registered users.** Each user connects **their own** social accounts. When they approve a draft, the post is sent **only to that user's** LinkedIn, X, or Instagram—not to a single shared account. Sending all approved drafts to one connected account regardless of who is logged in is **not** the product.

| Step | Who | Where | What |
|------|-----|--------|------|
| **User connects their accounts** | Each **logged-in user** | **LibreChat** (e.g. Settings → "Connected accounts" / "Social accounts") | Buttons: "Connect LinkedIn", "Connect X", "Connect Instagram". OAuth runs; we store tokens **per user** (e.g. MongoDB by `userId`). |
| **User approves a draft** | Same user | LibreChat (social draft modal / sidebar) | Approval is tied to `userId` and `draftId`. |
| **Post is sent** | System | LibreChat backend and/or n8n | We use **that user's** stored tokens to post to **their** LinkedIn, X, Instagram. No shared account. |

So: **user connects their account** = in LibreChat, per user. **Posting** = use the approving user's tokens (either LibreChat backend calls the platform APIs, or n8n calls back to LibreChat to get tokens for `userId` and then posts).

---

### Where is D1 done? (LibreChat vs n8n)

| What | Where |
|------|--------|
| **D1 – App credentials (client ID/secret)** | **Developer portals** (LinkedIn, X, Meta) and then **LibreChat** (for per-user OAuth). Register an application per platform; LibreChat uses these to run OAuth and obtain each user's tokens. |
| **User OAuth tokens (per user)** | **LibreChat only.** Each user's LinkedIn/X/Instagram access tokens are stored in LibreChat (e.g. MongoDB by `userId`). For per-user posting, n8n either receives the user's token when the workflow runs (e.g. passed from LibreChat) or calls LibreChat to get tokens for the approving user's `userId`. |
| **D2 – Post nodes** | **n8n** and/or **LibreChat.** Either: (a) n8n HTTP Request nodes that use the **user's token** (supplied per execution), or (b) LibreChat backend receives "post this draft" and does the HTTP POST to LinkedIn/X/Instagram using the user's stored tokens. |

So for **per-user** flow: LibreChat must implement "Connect LinkedIn / X / Instagram" (OAuth + store tokens per `userId`) and either perform the post itself or pass the right user's tokens into n8n when approval triggers the workflow.

---

## 1. LinkedIn

| Item | Value |
|------|--------|
| **Post endpoint** | `POST https://api.linkedin.com/v2/ugcPosts` |
| **Auth** | OAuth 2.0 (member token). Scope needed: `w_member_social` (to create posts on behalf of the user). |
| **Required header** | `X-Restli-Protocol-Version: 2.0.0` |
| **Docs** | [Share on LinkedIn](https://developer.linkedin.com/docs/share-on-linkedin), [UGC Post API](https://learn.microsoft.com/en-us/linkedin/compliance/integrations/shares/ugc-post-api) |

**Minimal POST body (text-only post):**

- `author` – URN of the person (e.g. `urn:li:person:...`)
- `lifecycleState` – `PUBLISHED`
- `specificContent.com.linkedin.ugc.ShareContent.shareCommentary.text` – post text
- `specificContent.com.linkedin.ugc.ShareContent.shareMediaCategory` – `NONE` for text-only
- `visibility` – `PUBLIC` or `CONNECTIONS`

**In n8n:** Create a **LinkedIn OAuth2** credential (or use LinkedIn node if available). In an HTTP Request node, use that credential and the endpoint above; set the header and body as per the UGC Post API docs. For **per-user** posting, the token used must be the **approving user's** token (supplied by LibreChat), not a single shared credential.

---

## 2. X (Twitter)

| Item | Value |
|------|--------|
| **Post endpoint** | `POST https://api.twitter.com/2/tweets` |
| **Auth** | OAuth 2.0 User Context (or API Key + Secret + Bearer for app-only; posting usually needs user context). |
| **Docs** | [Twitter API v2 – Create Tweet](https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets) |

**Minimal POST body:**

- `text` – tweet content (max 280 characters for most accounts)

**In n8n:** Create an **X (Twitter) OAuth2** or **Twitter API** credential. Use HTTP Request to `POST https://api.twitter.com/2/tweets` with body `{ "text": "{{ $json.drafts.x }}" }` (or map from your approval payload). For **per-user** posting, use the **approving user's** token. Respect rate limits (e.g. tweet create limits per 15-min window).

---

## 3. Instagram (Meta Graph API)

| Item | Value |
|------|--------|
| **Publishing** | Two steps: (1) create a **container** (e.g. for caption-only or image), (2) **publish** the container. |
| **Auth** | Facebook/Instagram access token (Instagram Business or Creator account; Page may be required). |
| **Docs** | [Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing), [IG Container](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container/) |

**Text-only / caption:**  
Caption is part of the container. For **image** posts: create container with `image_url` + `caption`, then call publish on that container. For **text-only**, check current Instagram API support (they may require at least one media asset in many flows).

**Limits:**  
~50 posts per account per 24h; containers expire after 24 hours.

**In n8n:** Use **Facebook/Instagram** OAuth2 or API credential. For **per-user** posting, use the **approving user's** token. Add two HTTP Request nodes (or use Instagram nodes if available): one to create the container, one to publish it. Map `drafts.instagram` to the caption field.

---

## 4. D1 Checklist (per-user flow)

- [ ] **Developer portals:** Register an app for LinkedIn, X (Twitter), and Meta (Instagram) and obtain client ID + client secret for each.
- [ ] **LibreChat:** Implement "Connect LinkedIn", "Connect X", "Connect Instagram" (OAuth flows) and store each user's access tokens (e.g. MongoDB by `userId`). Do **not** send all posts from a single shared credential.
- [ ] **n8n (optional for testing):** You can create test credentials in n8n to verify the post endpoints; for production, posting must use the **approving user's** tokens (from LibreChat).
- [ ] **Document** which apps/credentials you created (by name only; never store secrets in the repo).

---

## 5. D2 Checklist (post nodes)

- [ ] After the **If (approved)** branch, add a branch or sequence per platform (LinkedIn, X, Instagram).
- [ ] For each platform: use the **approving user's** token (from LibreChat, by `userId` / `draftId`) and map approved draft text to the API body (e.g. `drafts.linkedin` → LinkedIn UGC post, `drafts.x` → Twitter tweet, `drafts.instagram` → Instagram caption/container).
- [ ] Respect **selectedPlatforms**: only post to platforms the user selected (and that have non-empty draft text).
- [ ] Add error handling (retry, log, or send failure back to LibreChat if desired).

---

## 6. Postiz (D5 – later)

Postiz can sit **in front of** the platforms (n8n → Postiz → LinkedIn/X/Instagram) if you use it for scheduling and analytics. Document Postiz API/credentials and where they fit (e.g. "Post to Postiz" node that accepts the same `drafts` + `selectedPlatforms`) when you implement D5. Per-user tokens still apply if posts are to each user's accounts.

---

*Last updated: 2026. Flow is per-user: each logged-in user connects their own accounts; approved drafts post only to that user's social accounts. Use official docs above for current request/response shapes and limits.*
