# Clio Expanded Scopes — Implementation Plan (AIWP#112)

**Branch:** `feat/clio-expanded-scopes` (off `feat/integrations-hub-and-legal-links`)

**Issue:** [AIWP#112](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/112)

**Status:** Discovery complete — **product scope confirmed by Greta** ([comment](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/112#issuecomment-4908204909)).

**Depends on:** Integrations hub + Clio OAuth wiring from PR [#113](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/pull/113) (`feat/integrations-hub-and-legal-links`).

---

## 1. Confirmed v1 scope (Greta, 2026-07-07)

### Resources in v1

| Resource | Read | Write (tool) | Notes |
|----------|------|--------------|-------|
| **Matters** | ✅ | ✅ `create_matter` | |
| **Contacts** | ✅ | ✅ `create_contact` | |
| **Tasks** | ✅ | ✅ `create_task` | |
| **Activities** | ✅ | ✅ `create_activity_time_entry` | Time-entry writes only |
| **Documents** | ✅ (existing) | ✅ create/upload | Extend beyond search/list |
| **Communications** | ✅ | ❌ | Writes skipped — phone-call logging is workflow-sensitive |
| **Calendars** | ✅ | ❌ | Writes skipped — scheduling risks conflicts |
| **Users** | ✅ | ❌ | **Read only** — `list_users`, `get_user` (no user writes; confirmed by Greta 2026-07-07) |

### Explicitly out of v1

Api, Court rules, Custom fields, Payment distributions, Reporting, Webhooks.

Also **not** in Greta's v1 list (leave unexposed unless she expands scope later): Billing, Payments, Bank accounts.

### Cross-cutting rules

1. **All write actions** must return the **created record `id`** in the tool response so the model can confirm to the user.
2. **Reconnect after ship:** users with existing Clio connections should be prompted to **reconnect** in the Integrations hub (expanded app permissions may not apply to old tokens).
3. **No Nango dashboard changes** — Clio uses portal-based permissions; scopes in Nango stay empty.

### Users (resolved)

Greta has no specific user **write** action in mind. Clio API v4 exposes **read-only** Users endpoints (`GET` list/get). v1 will expose **`list_users`** and **`get_user`** so the assistant can resolve firm users (e.g. `responsible_attorney_id` on `create_matter` / `create_task`). No `create_user` or user-update actions.

---

## 2. Gap table (portal vs AIWP today)

Source: Clio Developer Portal app **34580** (screenshot 2026-07-07).

| Clio portal permission | Portal R/W | Exposed in AIWP today | v1 target |
|------------------------|------------|----------------------|-----------|
| Documents | R+W | ✅ search/list only | R+W (add create/upload) |
| Matters | R+W | ❌ | R+W |
| Contacts | R+W | ❌ | R+W |
| Tasks | R+W | ❌ | R+W |
| Activities | R+W | ❌ | R+W |
| Communications | R+W | ❌ | **Read only** |
| Calendars | R+W | ❌ | **Read only** |
| Users | R | ❌ | **Read only** (`list_users`, `get_user`) |
| Billing | R+W | ❌ | Out of v1 |
| Payments | R+W | ❌ | Out of v1 |
| Bank accounts | R | ❌ | Out of v1 |
| Custom fields | R | ❌ | Out of v1 |
| Webhooks | R+W | ❌ | Out of v1 |

Discovery comment with full table: [issuecomment-4907991499](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/112#issuecomment-4907991499).

---

## 3. Proposed `clio` tool actions (v1)

Mirror the QuickBooks pattern: single tool, `action` discriminator, dispatch in `clio.js`.

### Read actions

| `action` | Clio API (reference) | Key params |
|----------|----------------------|------------|
| `search_documents` | `GET /api/v4/documents.json` | `query`, `page_size` (existing) |
| `list_matters` | `GET /api/v4/matters.json` | `query`, `status`, `max_results` |
| `get_matter` | `GET /api/v4/matters/{id}.json` | `matter_id` |
| `list_contacts` | `GET /api/v4/contacts.json` | `query`, `max_results` |
| `get_contact` | `GET /api/v4/contacts/{id}.json` | `contact_id` |
| `list_tasks` | `GET /api/v4/tasks.json` | `matter_id`, `max_results` |
| `list_activities` | `GET /api/v4/activities.json` | `matter_id`, `max_results` |
| `list_communications` | `GET /api/v4/communications.json` | `matter_id`, `max_results` |
| `list_calendar_entries` | `GET /api/v4/calendar_entries.json` | date range, `max_results` |
| `list_users` | `GET /api/v4/users.json` | `query`, `max_results` |
| `get_user` | `GET /api/v4/users/{id}.json` | `user_id` |

### Write actions

| `action` | Clio API (reference) | Key params | Response |
|----------|----------------------|------------|----------|
| `create_matter` | `POST /api/v4/matters.json` | `client_id`, `description`, … | `{ id, … }` |
| `create_contact` | `POST /api/v4/contacts.json` | `name`, `type`, … | `{ id, … }` |
| `create_task` | `POST /api/v4/tasks.json` | `matter_id`, `name`, … | `{ id, … }` |
| `create_activity_time_entry` | `POST /api/v4/activities.json` | `matter_id`, `quantity`, … | `{ id, … }` |
| `create_document` | `POST /api/v4/documents.json` | `matter_id`, `name`, content/metadata | `{ id, … }` |

Use `fields=` on all requests per [Clio Fields docs](https://docs.developers.clio.com/api-docs/clio-manage/fields/).

`create_matter` / `create_task` may accept optional user id fields (`responsible_attorney_id`, assignee) resolved via `list_users` / `get_user` — not separate user writes.

---

## 4. Files to change

| Area | File | Work |
|------|------|------|
| API helpers | `packages/api/src/integrations/clio/clioApi.ts` | Refactor to shared `clioRequest`; add helpers per action |
| API tests | `packages/api/src/integrations/clio/clioApi.spec.ts` | Spec per helper (mock `fetch`) |
| Exports | `packages/api/src/integrations/index.ts` | Export new helpers/types |
| LangChain tool | `api/app/clients/tools/util/clio.js` | `action` schema + dispatch |
| Tool registry | `packages/api/src/tools/registry/definitions.ts` | Replace `clioSchema` with action enum |
| Model instructions | `librechat.yaml`, `librechat.example.yaml` | Remove “read-only”; document callable actions and write limits |
| Reconnect UX | `client/src/components/Integrations/IntegrationsPanel.tsx` (optional) | Banner/toast: “Reconnect Clio to use new features” |
| Docs | `docs/NANGO_INTEGRATIONS.md` | Update Clio section (no longer documents-only) |

**No changes expected:** data-provider flags (`clio: true` already exists), Nango config, new client connector UI.

---

## 5. Implementation order

1. **`clioApi.ts` refactor** — `clioRequest(method, path, { query, body, fields })` + error normalization (surface 403 with Clio body).
2. **Read helpers** — matters, contacts, tasks, activities, communications, calendar entries, users.
3. **Write helpers** — create_matter, create_contact, create_task, create_activity_time_entry, create_document; each returns `{ id, ... }`.
4. **`clio.js`** — action discriminator; wire all helpers; JSON schema documents required fields per action.
5. **`definitions.ts`** — update schema + tool description.
6. **`librechat.yaml`** — replace read-only block with v1 capability list; tell model not to write communications/calendars.
7. **Specs** — `clioApi.spec.ts` for each helper; extend agent load test only if needed.
8. **Manual QA** — see §6.
9. **PR** — target `feat/integrations-hub-and-legal-links` or `main` after #113 merges; label `deploy-tonight`.

---

## 6. Test plan

### Automated

```bash
cd packages/api
npx jest src/integrations/clio/clioApi.spec.ts --coverage=false
```

### Manual (Clio test tenant)

Prerequisites: user reconnects Clio in **Integrations** hub.

| # | Prompt | Expected |
|---|--------|----------|
| 1 | “List my open matters in Clio” | `list_matters` → real matter rows |
| 2 | “Create a matter in Clio called **AIWP Test Matter** for client X” | `create_matter` → returns `id`; visible in Clio UI |
| 3 | “Search Clio for the Smith contract” | `search_documents` (regression) |
| 4 | “Log a time entry on matter Y for 0.5 hours” | `create_activity_time_entry` → `id` |
| 5 | “Who are the attorneys in our Clio firm?” | `list_users` → user names/ids |
| 6 | Attempt calendar create via chat | Model should **not** call calendar write (instructions) |

---

## 7. Acceptance criteria (#112)

- [x] Discovery gap table posted on #112
- [x] Greta confirms target scope ([comment](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/112#issuecomment-4908204909))
- [ ] `clio` tool exposes v1 read + write actions per §3
- [ ] All write responses include created record `id`
- [ ] `librechat.yaml` updated — no “read-only” claim; communications/calendar writes disallowed in instructions
- [ ] Reconnect messaging for existing Clio users
- [ ] At least one write verified E2E (`create_matter` recommended)
- [ ] PR labeled `deploy-tonight`

---

## 8. Deployment notes

- Ship **after** #113 (Integrations hub) is on the base branch.
- No Nango or Clio Developer Portal changes required for v1 (permissions already expanded).
- Ask users to **disconnect and reconnect Clio** once after deploy.
