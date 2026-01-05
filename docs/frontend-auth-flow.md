# Front-End Authentication & Guardrail Flow

This document explains how the UI should consume the auth/LDAP structure that `scripts/manage-ldap-org.sh` and `scripts/templates/org-template.json` now codify. The goal is to keep a clear separation between the four core personas (global admin, organisation supervisor, departmental user, general user) while enforcing the marketing/finance/normal guardrails on every request.

## 1. End-to-end flow

```
+----------------------+      +------------------------------+      +-----------------------+
| Keycloak + LDAP      | ----> | LibreChat API (/api/auth)    | ----> | Front-end (React/Vite) |
| (LDAP groups sync)   |      | issues JWT + group metadata  |      | fetches user + groups |
+----------------------+      +------------------------------+      +-----------------------+
                                         |                                    |
                                         v                                    v
                             +--------------------------+            +------------------------------+
                             | /api/user                |            | /api/permissions/<resource>  |
                             | returns groups + role    |            | returns guardrail metadata   |
                             +--------------------------+            +------------------------------+
```

1. **Login step**: Keycloak proxies LDAP and issues tokens. Every LDAP `group` entry created through the script embeds `org`, `guardrail`, `services`, and optional `vectorDb` hints inside the `description` property for easy parsing. The new helpers also ensure every user is automatically added to the `users` group so the general user flow is always unlocked without extra configuration, and every user entry now carries a `status` attribute (`active`/`inactive`) so the UI can surface disabled accounts explicitly.
2. **Token handling**: The frontend stores the JWT and calls `/api/user` to retrieve the authenticated user plus their LDAP groups.
3. **Guardrail enrichment**: For each group, parse `description` (e.g., `org=LibreChat;guardrail=marketing;services=llm`) to build a `guardrail` object. Also call `/api/permissions/<resourceId>` when necessary to get ACL context.
4. **UI routing**: The frontend shows admin/supervisor controls only when `group.guardrail` is `superuser` or `orgadmin`. Basic chat UI is rendered for marketing/finance/normal personas with guardrails applied.

## 2. Persona-specific UI responsibilities

- **admin (group: `superuser`)**
  - Show model catalog management and global settings panels.
  - Allow project-wide ACL updates (models → LDAP groups) via the `/api/permissions` APIs.
  - Surface backup/restore controls and password-reset helpers (via new admin endpoints to be added later).

- **supervisor (group: `orgadmin`)**
  - Restrict model configuration UI to the organisation they own; include the `vectorDb` name from the group metadata when targeting MCP servers.
  - Allow per-organisation onboarding tasks (create LDAP org/base) and user invitations tied to that org.
  - Show guardrail controls for department groups inside their organisation to map models and documents.

- **alpha/beta (group: `users` plus departmental guardrails)**
  - Only display the chat composer with models filtered to their allowed guardrail (see table below).
  - Disable prompts or tools that touch other departments (e.g., hide finance models for marketing-only users).
  - Respect combinatorial membership (marketing + normal, finance + normal) by unioning the allowed topics.

## 3. Guardrail rule matrix

| Group | Allowed Prompt Domains | Allowed Documents | Notes |
|-------|-----------------------|-------------------|-------|
| `marketing` | Marketing-only (product campaigns, creative briefs) | Marketing docs only (tagged via metadata) | Uses guardrail string `marketing` and a `vectorDb` scope `marketing-db` stored on the group. |
| `finance` | Finance-only (reports, budgets) | Finance docs only | Guardrail string `finance`. |
| `normal` | General questions (policies, employee info) | Documents tagged as `general` | Combined with other groups to broaden scope. |
| `superuser` | Full platform config | All docs | `guardrail=superuser`. |
| `orgadmin` | Org-scoped model catalog | Org documents | `guardrail=orgadmin`. |

> Guardrail enforcement should happen client-side by filtering models/plugins and server-side (when adding new endpoints) using the group/role metadata so unauthorized prompts never reach restricted models.

## 4. Template maintenance and script usage

- Keep `scripts/templates/org-template.json` as the single source of truth for your sample LDAP landscape; update it whenever the persona list or guardrail rules change.
- Guardrails themselves are defined only in `scripts/templates/guardrail-rules.json`. The onboarding script reads that file to generate `description` metadata when it creates groups so every user in a `guardrail` group automatically inherits the prompt/document scope and vector DB hints configured for that guardrail.
- Run `scripts/manage-ldap-org.sh apply-template --file scripts/templates/org-template.json` after the LDAP container is healthy to populate the org, groups, and users automatically. The script already ensures the required OUs (`users`, `groups`, `organizations`) exist.
- Use `scripts/manage-ldap-org.sh create-user`/`create-group` etc. for ad-hoc additions or to create new departments for other organisations.
- `scripts/templates/org-template.json` now defines an `hr` guardrail group backed by `vectorDb=hr-db` plus the `hr` prompt/document scopes, and it seeds the new `gamma` (normal) and `sigma` (HR) personas so the frontend can prove departmental variations locally.

## 5. CLI examples for user/group management

- **Create/re-create users** – Reflect the template by running `scripts/manage-ldap-org.sh create-user --username gamma --password GammaPass123! --firstname Gamma --lastname User --email gamma@librechat.local --groups users,normal --org LibreChat --status active` and `scripts/manage-ldap-org.sh create-user --username sigma --password SigmaPass123! --firstname Sigma --lastname HR --email sigma@librechat.local --groups users,hr --org LibreChat --status active` whenever you need to reprovision those personas.
- **Add/remove group memberships** – Use `scripts/manage-ldap-org.sh add-user-to-group --username gamma --group normal` to attach a user to any guardrail group, and `scripts/manage-ldap-org.sh remove-user-from-group --username gamma --group marketing` to drop them out of a departmental guardrail when their role changes.
- **Clean up duplicates or deletes** – `scripts/manage-ldap-org.sh show-user ssouser` reveals every LDAP attribute, `cleanup-user ssouser` removes stray entries (e.g., the legacy `cn=ssouser` record), and `scripts/manage-ldap-org.sh delete-user --username gamma` deletes the entire account when you want a clean slate.
- **Search by username** – Keep `show-user` handy when debugging guardrail metadata returned by `/api/user` or when the frontend reports an unexpected LDAP payload.

These commands pair with the template-driven approach: update `org-template.json`, re-run `scripts/manage-ldap-org.sh apply-template --file scripts/templates/org-template.json`, and then use the ad-hoc helpers above to manage individual memberships or lifecycles without re-running the template.

## 6. Frontend implementation checklist

1. After login, fetch `/api/user` and `/api/permissions/<resource>` to read ACLs and guardrail metadata.
2. Parse each group description into a structured object (e.g., `guardrail`, `services`, `vectorDb`).
3. Decide which UI sections to unlock:
   - `superuser` → enable global config, backups, backend controls.
   - `orgadmin` → expose organisation-specific catalog + vector DB selector.
   - departmental guardrails → narrow the model dropdown to the appropriate set.
4. When sending messages, tag the request with the highest-priority guardrail so the backend can route it to the correct LLM endpoint/agent.
5. Provide visual badges (e.g., `Marketing Only`, `Finance Only`) so users understand limits. When a user toggles groups (e.g., marketing + normal), show the union of allowed bundles instead of overlapping rules.
6. Persist the parsed guardrail map in a dedicated context/provider so chat components can re-use it without refetching every time.

Once the backend landing endpoints for backups, password resets, and model configuration are ready, add corresponding fetches and UI flows guided by these guardrails. Keep regression tests that cover each persona’s UI surface (global admin, supervisor, marketing, finance, normal) so the experience stays consistent as new LLM endpoints are added.