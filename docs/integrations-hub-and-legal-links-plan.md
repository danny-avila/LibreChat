# Integrations Hub, QBO Connector & Legal Links — Work Plan

**Branch:** `feat/integrations-hub-and-legal-links` (off `main`)

Single shared branch covering three independent AIWP issues. Admin-Panel #12
(migration UI) is already delivered via merged PR #13 and is out of scope here
except to close it.

**Tracking issues:**

- [AIWP#110](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/110) — Privacy Policy + ToS links must open in new tabs
- [AIWP#111](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/111) — Wire QuickBooks Online (QBO) as a first-class connector
- [AIWP#112](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/112) — Expose expanded Clio developer-portal permissions as usable tools
- [Admin-Panel#12](https://github.com/SMB-Team-Technology/AI-Workforce-Pro-Admin-Panel/issues/12) — Migration UI (**done** — PR #13 merged)

All file anchors below were verified against the current `main`.

---

## 0. Scope decisions (confirmed)

| Decision | Choice |
|---|---|
| Branch layout | **One shared branch** for #110, #111, #112. |
| QBO surface | Add QBO **and** build a **left-side-nav Integrations hub** (not just the attach menu) as part of #111. |
| #112 gating | **Discovery table first**, posted as a comment on #112; no scope code until Greta confirms. |
| QBO data model | QBO is a **data tool** (invoices, payments, sales, expenses), not a file connector — mirror the Clio **tool** path, not the file-picker path. |

---

## 1. AIWP#110 — Legal links open in new tab (size: XS)

### Current state

- `client/src/components/Auth/Footer.tsx:16-17,28-29` — `target={... '_blank'}` is
  **commented out** ("Removed for WCAG compliance"); only `rel="noreferrer"` remains.
- `client/src/components/Chat/Footer.tsx:16,22` — anchors have **no `target`** and
  only `rel="noreferrer"`.
- Reference (do **not** change): `client/src/components/Nav/AccountSettings.tsx:123`
  already opens Help & FAQ correctly via `window.open(url, '_blank')`.

### Changes

For every external legal-doc anchor in both footers:

```tsx
<a
  href={termsOfService.externalUrl}
  target={termsOfService.openNewTab ? '_blank' : undefined}
  rel="noopener noreferrer"
  aria-label={`${localize('com_ui_terms_of_service')} (opens in new tab)`}
>
  {localize('com_ui_terms_of_service')}
  {termsOfService.openNewTab && (
    <ExternalLinkIcon className="inline-block ml-1 h-3 w-3" aria-hidden="true" />
  )}
</a>
```

- Use `lucide-react` (`ExternalLink`) — already a dependency.
- Apply to both Privacy Policy and Terms of Service in `Auth/Footer.tsx` and
  `Chat/Footer.tsx`.

### WCAG triad (all three required)

- `rel="noopener noreferrer"` — prevents `window.opener` XSS.
- Visible external-link icon — sighted-user affordance.
- `aria-label` with "(opens in new tab)" — screen-reader announcement.

### Acceptance

- Both footers open Privacy + ToS in new tabs when `openNewTab: true`.
- Screen reader announces "opens in new tab".
- Help & FAQ link unchanged; existing tests pass.

---

## 2. AIWP#111 — QuickBooks Online connector + Integrations hub (size: L)

Intuit + Nango are fully configured server-side (production Client ID/Secret,
redirect URI registered, test connection verified). Only the AIWP wiring is
missing. Mirror the existing **Clio** connector, which touches ~10 spots.

### 2.1 Clio reference map (the template to mirror)

| Concern | File | Anchor |
|---|---|---|
| Server provider registry | `packages/api/src/integrations/providers.ts` | `INTEGRATION_PROVIDERS`, `IntegrationProviderKey.CLIO` |
| Provider-key union (server) | `packages/api/src/integrations/providers.ts:1-12` | add `QUICKBOOKS` |
| Provider-key union (data-provider) | `packages/data-provider/src/types/integrations.ts:8-15` | add `'quickbooks'` |
| Provider API helper | `packages/api/src/integrations/clio/clioApi.ts` | new `quickbooks/quickbooksApi.ts` |
| LangChain tool | `api/app/clients/tools/util/clio.js` | new `quickbooks.js` |
| Tool registration | `api/app/clients/tools/util/handleTools.js`, `api/server/services/ToolService.js` | register `quickbooks` |
| Toolset flag (interface) | `packages/data-provider/src/models.ts:47,76` | `quickbooks?: boolean` |
| Toolset default | `packages/data-provider/src/schemas.ts:298` | `[Tools.quickbooks]: false` |
| Toolset type | `packages/data-provider/src/types.ts:113` | `quickbooks?: boolean` |
| Tools enum | `packages/data-provider/src/types/assistants.ts:37` | `quickbooks = 'quickbooks'` |
| Client connector hook | `client/src/hooks/integrations/useIntegrationConnectors.ts` | add `quickbooks` |
| Client label keys | `client/src/constants/integrations.ts` | `INTEGRATION_LABEL_KEYS` |
| Client provider icon | `client/src/components/Integrations/IntegrationProviderIcon.tsx` | add QBO icon (SiQuickbooks / lucide fallback) |
| Attach menu (optional) | `client/src/components/Integrations/buildAttachIntegrationMenuItems.tsx`, `attachMenu.ts` | `INTEGRATION_MENU_ORDER`, connect item |
| i18n | `client/src/locales/en/translation.json`, `client/src/locales/es/translation.json` | `com_integrations_quickbooks`, connect labels |
| Config | `librechat.yaml:742` (`clio: true`), `:827-829` (instructions) | add `quickbooks: true` + instructions |

### 2.2 Server work

1. `providers.ts`: add `QUICKBOOKS: 'quickbooks'` to the key object + type union,
   and an `INTEGRATION_PROVIDERS.quickbooks` entry
   (`nangoIntegrationId: 'quickbooks'`, `labelKey`, `icon`, `enabled: true`).
2. `packages/api/src/integrations/quickbooks/quickbooksApi.ts`: helper functions
   for the read scopes (invoices, payments, sales/receipts, expenses, customers).
   Model on `clioApi.ts` (auth via Nango token, typed responses, spec file).
3. `api/app/clients/tools/util/quickbooks.js`: LangChain `tool()` mirroring
   `clio.js` — `Tools.quickbooks`, JSON schema with an `action` discriminator
   (e.g. `list_invoices`, `list_payments`, `list_expenses`, `search_customers`),
   Nango access-token retrieval, error handling.
4. Register the tool in `handleTools.js` and `ToolService.js` alongside `clio`.

### 2.3 data-provider work

Add the `quickbooks` flag in `models.ts` (interface + zod), `schemas.ts` default,
`types.ts`, and the `Tools` enum in `types/assistants.ts`.

### 2.4 Client work

1. `useIntegrationConnectors.ts`: add a `quickbooks` `useNangoConnect` line + map entry.
2. `IntegrationProviderIcon.tsx`: add a QBO icon (prefer
   `@icons-pack/react-simple-icons` `SiQuickbooks`; else a lucide fallback like
   `Receipt`).
3. `constants/integrations.ts`: `com_integrations_quickbooks` label key.
4. i18n: `com_integrations_quickbooks` + connect label in `en` and `es`.
5. Optionally add to `INTEGRATION_MENU_ORDER` / connect item in the attach menu.

### 2.5 librechat.yaml

- Add `quickbooks: true` to every modelSpec `apiToolset` block that has
  `clio: true` (currently the shared `&aiw_tools` anchor at `:742`).
- Extend the `&aiw_instructions` block (near `:827`) with a "Connected QuickBooks
  account" section describing when to call the `quickbooks` tool (invoicing,
  payments, sales, expenses, customers). Confirm final scope wording with Greta.

### 2.6 Left-side-nav Integrations hub (new)

Today integrations are surfaced only through the chat **attach (+) menu**
(`buildAttachIntegrationMenuItems.tsx`). This adds a dedicated hub:

- New **Integrations** entry in the left nav (`client/src/components/Nav/`).
- A panel/page listing all enabled providers (Google, Microsoft, Dropbox, Box,
  Clio, QuickBooks) with per-provider **connect / disconnect / reconnect** state.
- Reuse existing data: the integrations-status query + `useIntegrationConnectors`
  (Nango connect) + `IntegrationProviderIcon` + `INTEGRATION_LABEL_KEYS`.
- Keep the attach-menu path working; the hub is an additional surface, not a
  replacement.
- New i18n keys for the nav label, page title, and status strings (en + es).

### Acceptance (#111)

- "QuickBooks" appears in the connector list (hub + attach menu) for QBO-enabled specs.
- OAuth flow works end-to-end: initiate → Intuit → return → connected state shows.
- A sample prompt ("Show me my top 10 outstanding invoices") triggers a real QBO
  tool call returning real data.
- QBO flag present on every relevant modelSpec; instructions updated.
- Integrations hub reachable from the left nav and lists all providers.
- PR labeled `deploy-tonight` for the maintenance-window merge.

---

## 3. AIWP#112 — Expose expanded Clio scopes (size: M) — GATED

Greta expanded Clio's developer-portal permissions to a broader set of **13
permissions** (matters, contacts, documents, activities, communications,
calendars, tasks, custom fields, and write scopes). AIWP still exposes only the
read-only document search.

### Current state

- Tool is hard-coded read-only doc search: `api/app/clients/tools/util/clio.js`
  (single `query`/`page_size` schema → `searchClioDocuments`).
- Helper exposes only `searchClioDocuments`: `packages/api/src/integrations/clio/clioApi.ts`.
- `librechat.yaml:829` tells the model **"Clio is read-only"**.

### Step 1 — Discovery FIRST (blocking)

Produce and **post as a comment on #112** a 2-column gap table:

| Approved in Clio portal | Exposed as an AIWP tool today? |
|---|---|
| read matters | ❌ no |
| write matters | ❌ no |
| read/write contacts | ❌ no |
| documents (read) | ✅ yes (`clio` tool) |
| activities / communications / calendars / tasks / custom fields | ❌ no |
| ... (fill from portal — Greta is source of truth) | ... |

Await Greta's confirmation of the target scope before writing code.

### Step 2 — Implementation (after sign-off)

1. Extend `clioApi.ts` with helpers for the confirmed actions (matters, contacts,
   activities, write scopes) — typed, with spec coverage.
2. Extend `clio.js` to an `action`-discriminated schema (e.g. `search_documents`,
   `list_matters`, `create_matter`, `list_contacts`, `create_contact`, ...),
   dispatching to the new helpers.
3. Update `librechat.yaml` instructions (`:827-829`): remove the "read-only"
   claim and describe the now-callable actions.
4. Verify at least one **write** action end-to-end from a chat (e.g. "Create a new
   matter in Clio called 'Test Matter'").

### Acceptance (#112)

- Discovery comment posted; Greta confirms target scope.
- `librechat.yaml` instructions updated (no more "read-only" if writes approved).
- At least one write action verified end-to-end.
- PR labeled `deploy-tonight`.

---

## 4. Admin-Panel#12 — Migration UI (done)

Delivered by merged PR
[#13](https://github.com/SMB-Team-Technology/AI-Workforce-Pro-Admin-Panel/pull/13).
Action: confirm it satisfies the issue and **close #12**.

---

## 5. Deployment & sequencing

- #110 is independent and low-risk — can ship first.
- #111 and #112 both land via the maintenance-window pipeline — label the PR(s)
  `deploy-tonight` (auto-merge 22:00 ET via the `scheduled-merge` workflow).
- #112 code is blocked on the discovery sign-off; #110 and #111 can proceed in
  parallel meanwhile.

---

## 6. Testing notes

- **#110:** manual — click both links on the login page and in-chat footer;
  confirm new tab + screen-reader announcement; run existing footer tests.
- **#111:** unit/spec for `quickbooksApi.ts` (mirror `clioApi.spec.ts`); manual
  OAuth flow in a fresh incognito on prod; sample QBO prompt returns real data;
  verify the Integrations hub renders and connect/disconnect works.
- **#112:** unit/spec for new `clioApi` actions; manual write-action verification
  in Clio after sign-off.
