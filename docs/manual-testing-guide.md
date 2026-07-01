# Manual Testing Guide — AI Workforce Pro (Functional)

This guide helps you test the three new features by **using the app like a real user** and
checking that each one behaves the way it should. You don't need to understand the code — you
just follow the scenarios and confirm what you see.

Feature numbering matches `docs/Requirements.md`:

| # | Feature | Status |
|---|---|---|
| **Feature 1** | Local file access | ⬜ Not released yet |
| **Feature 2** | Long-horizon tasks (background multi-step jobs) | ✅ Available for testing |
| **Feature 3** | Browser control | ⬜ Not released yet |

---

## How to read this guide

Each test has three parts:

- **You do:** the actions you take (what to click / type).
- **You should see:** the correct result.
- **Pass / Fail:** how to judge the outcome.

If "You should see" doesn't match reality, it's a **Fail** — write it down (see the last
section, "Reporting a problem"). A failed test is useful information, not a mistake on your
part.

---

## Before you start

You only need two things:

1. **A link to the app** and it should already be running. Open it in **Google Chrome** or
   **Microsoft Edge** (required later for local file access; long-horizon tasks work in any
   modern browser).
2. **A login (email + password).** If you don't have one, ask the team to create a test
   account for you.

Then:

- Open the app link.
- Log in with your email and password.
- You should see a chat screen with a welcome message.

**Quick warm-up (confirms the app is healthy):** type "Hello" and press Enter. The assistant
should reply within a few seconds, with the text appearing gradually. If it replies, you're
ready to test. If nothing happens, tell the team before continuing.

---

## Feature 2 — Long-horizon tasks ✅ (ready to test)

**In plain words:** you ask for something that takes several steps. The assistant works on it
in the background on the server. You can walk away and it keeps going; when you come back,
the conversation shows what happened.

### Prerequisites (important)

Before running tests A1–A3, confirm with the team:

1. **Agents permission** — your test user must be allowed to use agents (`Agents → USE`).
   Long-horizon jobs run through the same pipeline as scheduled skills. If agents are disabled
   in config, the **list-checks icon** next to Send will not appear.
2. **A model is selected** — pick an endpoint/model in the chat header (same as for a normal
   message).
3. **Backend is running** — the job worker starts automatically with the server; no extra
   setup for testers.

### How to start a long-horizon task

1. **Select a model** in the chat header (required — same as for Send).
2. Type your request in the message box (do **not** press Send yet).
3. Click the **list-checks icon** next to the Send button.
   - Tooltip: **"Start a long-running task"**
   - This opens a **new conversation** for that task and starts it on the server.
4. A **status banner** appears below the header while the job runs. Example:

   **In progress**  
   *Getting started — you can leave this tab and come back anytime*

   As the task continues, the subtitle may change to something like:  
   *3 updates so far — still working in the background*

### What the banner means (plain language)

| What you see | What it means |
|---|---|
| **Waiting to start** | Your task is queued; the server will pick it up shortly. |
| **In progress** | The assistant is working on your request in the background. |
| **N updates so far** | N assistant replies have been saved to this conversation so far (not "N tasks in queue"). |
| **N other background tasks…** | You have other jobs running in other conversations. |
| **Cancel** | Stops the job (no new steps after cancel; a step already running may finish once). |

The app **does not** show an internal limit like "step 1 of 25". That number is a server safety cap on how many agent turns one task can take — not a checklist of subtasks.

While tasks are running, look for **Background tasks** in the left sidebar (above **Chats**) — click any entry to jump to that conversation.

### Send vs list-checks (important)

| Action | Button | What happens |
|---|---|---|
| **Normal chat** | **Send** (arrow) | One immediate reply in the **current** conversation. You wait in the tab; if you close it, the reply may stop. Use this for quick questions or web search in the moment. |
| **Background task** | **List-checks icon** | A **new** multi-step job on the server. Progress is saved in a **new conversation**. You can close the tab and come back later. |

**For Test A1, use the list-checks icon — not Send.**

To run **another** background task while one is already running: pick your model again, open **New chat** (+), type the new goal, and click **list-checks** again. Each task gets its own conversation in the sidebar.

---

### Test A1 — A task runs and shows its progress

**You do:**
1. Start a new chat and pick a model.
2. Type a multi-step request, for example:
   > "Research three time-management tips, then write a short summary that combines them."
3. Click the **list-checks icon** (not Send).

**You should see:**
- A **status banner** at the top, e.g. **In progress** with *Getting started…*, then later *N updates so far — still working in the background* as messages appear.
- New **messages in the conversation** as each step completes (user prompt + assistant reply
  per step).
- When finished, the **banner shows Done** (or Error / Canceled) instead of disappearing immediately.

**Pass:** messages appear in order; the banner reflects active work, then shows a terminal state when done; you get a final result in the thread.

**Fail:** nothing happens, banner stuck on "Getting started" for many minutes with no messages, error in messages, or no list-checks icon visible.

**Note:** if the model provider returns an error (e.g. insufficient API credits), the task should stop with an **Error** banner — not keep retrying and counting many "updates". Report it if the banner stays **In progress** after repeated identical error messages.

**Known limitation:** when finished, the banner shows **Done** (green) for a few moments while you stay in the conversation — it no longer disappears immediately. Judge completion by the banner + last assistant message.

**Sidebar:** while tasks run, a **Background tasks** section appears above **Chats** in the left sidebar. It hides automatically when nothing is active.

**Troubleshooting (if the banner never appears):**

- Confirm **Agents → USE** permission for your test user.
- After clicking list-checks, you should land in a **new conversation** (not stay on `/c/new`).
- If you only see a loading spinner or **"Nothing found"** with no banner, report it — that indicates a UI bug (fixed in current branch: empty job threads should show the banner, not an infinite spinner).

---

### Test A2 — The task keeps going after you leave (most important)

**You do:**
1. Start a task like in Test A1.
2. While the banner still shows **In progress**, **close the browser tab** (or go to another site).
3. Wait at least one minute (longer for multi-step tasks).
4. Reopen the app, log in if needed, and open the **same conversation** from the history
   list on the left.

**You should see:**
- Messages that appeared **while you were away** are now in the thread.
- If the job finished while gone: banner is gone, final answer is in the messages.
- If still running: banner shows **In progress** with updated subtitle; new messages keep appearing.

**Pass:** work continued without you; reopening shows everything that happened.

**Fail:** conversation frozen where you left it, empty, or missing steps that should have
run on the server.

---

### Test A3 — Stopping a task

**You do:**
1. Start a task like in Test A1.
2. While the banner still shows **In progress**, click **Cancel** on the banner.

**You should see:**
- The **banner disappears** shortly after cancel.
- **No new messages** appear after you canceled (allow ~10 seconds).

**Pass:** it stops and stays stopped.

**Fail:** new step messages keep appearing after Cancel.

**Known limitation:** Cancel updates the job in the database; a step already in progress may
still finish once before stopping. Report if many steps continue after cancel.

---

### Test A4 — Conversation appears in history (optional)

**You do:**
1. Start a long task from a **new chat** using the list-checks icon.

**You should see:**
- The new conversation appears in the **left sidebar** with a title based on your goal.
- You do not need to send a normal message first for it to show up.

**Pass:** conversation is listed and openable.

**Fail:** job runs but conversation never appears in history.

---

## Feature 1 — Local file access ⬜ (not released yet)

**In plain words:** you give the app permission to one folder on your computer. The assistant
can then read files there and create new ones. **Chrome or Edge only.**

> These tests apply once Feature 1 is shipped. Skip section B until the team confirms it is
> ready.

### Get ready — make a safe test folder

1. On your Desktop, create an empty folder named **`aiwp-test`**.
2. Inside it, create a text file `notes.txt` containing one line:
   `Hello from my computer`

Using an empty throwaway folder means a mistake can't touch anything important.

---

### Test B1 — Connect a folder

**You do:**
1. Click **"Connect a folder"** in the app.
2. In the pop-up, choose the **`aiwp-test`** folder and confirm.
3. When the browser asks to view/edit files, click **Allow** (or **Edit**).

**You should see:**
- The app shows the folder as connected (its name appears somewhere in the interface).

**Pass:** the folder connects with no error.
**Fail:** an error appears or nothing indicates it connected.

---

### Test B2 — The assistant reads a file

**You do:**
- Ask: *"Read notes.txt in my connected folder and tell me what it says."*

**You should see:**
- The assistant replies with the content: `Hello from my computer`.

**Pass:** it reports the correct text.
**Fail:** it can't find the file or reports the wrong content.

---

### Test B3 — The assistant creates a file

**You do:**
1. Ask: *"Create a file called summary.txt in my folder with the text 'Test successful'."*
2. Wait for the assistant to confirm.
3. Open the `aiwp-test` folder yourself in your computer's file explorer.

**You should see:**
- A new file `summary.txt` exists and contains `Test successful`.

**Pass:** the file really appears on your computer with the right content.
**Fail:** no file appears, or the content is wrong.

---

### Test B4 — Safety: it can't leave the folder

**You do:**
- Ask: *"Read a file that is outside my connected folder, one level up."*

**You should see:**
- The assistant **cannot** do it — access outside the connected folder is refused.

**Pass:** anything outside the connected folder is blocked. (This is an important safety
check — a Fail here is serious, report it right away.)
**Fail:** it manages to read or list files outside `aiwp-test`.

---

### Test B5 — Reconnecting after closing the browser

**You do:**
1. Fully close Chrome/Edge (all windows), reopen it, and return to the app.
2. Look at the folder feature.

**You should see:**
- A **"Reconnect folder"** option (it remembers your folder but needs permission again).
- After clicking Reconnect and approving, reading files works again.

**Pass:** you reconnect without choosing the folder from scratch.
**Fail:** the folder is forgotten entirely, or reconnect doesn't work.

---

### Test B6 — Safari shows a friendly message (only if you have a Mac)

**You do:**
- Open the app in **Safari** and look for "Connect a folder".

**You should see:**
- A clear message that this feature needs Chrome or Edge — not a broken button or a crash.

**Pass:** friendly message, no crash.

---

## Feature 3 — Browser control ⬜ (not released yet)

**In plain words:** the assistant can open a website, read it, and use what it finds.

> Ask the team whether this feature is turned on before testing it.

### Test C1 — The assistant uses a website

**You do:**
- Start a long task: *"Go to example.com, read the page, and summarize what it says."*

**You should see:**
- Progress showing it opened and read the page.
- A summary that clearly matches the real content of that page.

**Pass:** the summary is based on the actual website.
**Fail:** it makes up an answer without visiting, or errors out.

---

## Reporting a problem

When a test Fails, write it down so it can be fixed. Copy this and fill it in:

```
Feature: (Feature 2 — Long-horizon / Feature 1 — Local files / Feature 3 — Browser)
Test: (e.g. Test A2)
What I did:
  1.
  2.
What I expected to see:
What actually happened:
Screenshot: (attach if you can)
Browser: (Chrome / Edge / Safari)
Date & time it happened:
```

**Tip for better bug reports:** a screenshot of the screen when it went wrong is worth more
than a long description. Take one whenever you can.

---

## Testing checklist

Use this to track your run. Mark each one Pass or Fail.

| Feature | Test | Ready? | Result |
|---|---|---|---|
| **Feature 2** — Long-horizon | A1 — Task runs and shows progress | ✅ | ☐ |
| **Feature 2** — Long-horizon | A2 — Task continues after you leave | ✅ | ☐ |
| **Feature 2** — Long-horizon | A3 — Stopping a task | ✅ | ☐ |
| **Feature 2** — Long-horizon | A4 — Conversation in sidebar | ✅ | ☐ |
| **Feature 1** — Local files | B1 — Connect a folder | ⬜ | ☐ |
| **Feature 1** — Local files | B2 — Read a file | ⬜ | ☐ |
| **Feature 1** — Local files | B3 — Create a file | ⬜ | ☐ |
| **Feature 1** — Local files | B4 — Cannot leave the folder (safety) | ⬜ | ☐ |
| **Feature 1** — Local files | B5 — Reconnect after closing the browser | ⬜ | ☐ |
| **Feature 1** — Local files | B6 — Safari friendly message | ⬜ | ☐ |
| **Feature 3** — Browser | C1 — Uses a website | ⬜ | ☐ |

**Golden rule:** you're checking whether the feature does what a normal user would expect. If
something feels confusing or surprising even when it "works," note that too — that's useful
feedback.

For implementation details and what is still pending for Feature 2, see
`docs/new-features-plan.md` (sections **6b** and **6c**).
