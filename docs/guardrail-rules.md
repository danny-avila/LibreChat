# Guardrail Rule Configuration

All guardrail metadata now lives in `scripts/templates/guardrail-rules.json` so administrators can extend or tune departmental access without modifying multiple scripts or hard-coded constants.

## File structure

The JSON contains a `guardrails` array where every entry describes:

- `guardrail`: the canonical guardrail tag that the chat engine should respect (e.g., `marketing`, `finance`).
- `name`/`description`: human-friendly labels displayed in admin UIs or logs.
- `services`: which services (LLM, config, backup, etc.) the guardrail covers.
- `modelAccess`, `promptScope`, and `documentScope`: the policies the chat engine needs when filtering models or documents.
- `vectorDb`: optional vector database scope for retrieval requests.
- `permissions`: the ACL bits enforced whenever this guardrail is active.
- `defaultGroups`: the LDAP groups that automatically receive the guardrail when they match this entry.
- `allowAdminOverride`: whether admins can promote a session past this guardrail (useful for marketing/finance in emergencies).

Administrators can add new guardrails by appending objects to this array and mentioning the new `guardrail` tag in `scripts/templates/org-template.json` groups/users.

## How the chat engine consumes it

1. The front end fetches `/api/user` (or `/api/permissions/<resource>`) after login and parses the guardrail tags from group descriptions (see `docs/frontend-auth-flow.md`).
2. The chat submission payload (`endpointOption`) should be extended with the highest-priority guardrail and any `promptScope`/`documentScope` metadata so the backend can route the request to the correct models or agents.
3. The backend should cross-check the guardrail tag against this JSON before calling Ollama. If the guardrail’s `modelAccess` is narrower than the requested topic, the backend rejects or reroutes the request.

## Admin workflow

- Run `./scripts/manage-ldap-org.sh apply-template --file scripts/templates/org-template.json` after editing `guardrail-rules.json` so the group descriptions are regenerated with the latest metadata.
- Use `make auth-guardrails-test` to ensure every guardrail group still defines rules and that no guardrails are orphaned.
- When rolling out new guardrails, update `docs/frontend-auth-flow.md` to describe how the UI should signal the new metadata to the server.

By keeping guardrail rules in one JSON document, both LDAP seeds and the chat engine can stay in sync: admins/orgadmins edit a single file, rerun the template, and the chat engine simply reads the guardrail tags that are already encoded in LDAP groups.
