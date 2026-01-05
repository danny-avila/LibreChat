# Test Plan: Auth, Guardrails, and Document-Based Chat

This page summarizes the verification steps we currently cover so that every persona—admin, supervisor, marketing user, finance user—travels through the expected flow.

## 1. Guardrail template validation (`make auth-guardrails-test`)

- **Checks**: ensures every account seeded via `scripts/templates/org-template.json` has a `status` (`active`/`inactive`), includes the `users` group, and references only groups whose metadata defines a `rules` block (`marketing`, `finance`, `normal`). This keeps the LDAP/Keycloak layer in sync with the frontend guardrail expectations documented in [`docs/frontend-auth-flow.md`](docs/frontend-auth-flow.md#L3-L70).
- **How to run**: execute `make auth-guardrails-test`. Under the hood the target spins up a `node:20` container with the workspace mounted, runs `scripts/tests/auth-guardrails.js`, and writes a human-readable report to `reports/auth-guardrails.txt` (survives even after the container stops).
- **Why it matters**: any change to the template (new users/groups/status values, guardrail metadata updates) must pass this script before user-auth features are considered stable.

## 2. Authorization/authentication workflow (curl guide)

- **Token acquisition**: use `AUTH_HOST` from `.env`/`.env.example` to hit Keycloak (e.g., `https://auth.librechat.local`, `http://localhost:8080`). Run:
  ```bash
  curl -X POST "${AUTH_HOST:-https://auth.librechat.local}/realms/librechat/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password&client_id=librechat-web&username=alpha&password=AlphaPass123!" \
    -d "client_secret=YOUR_CLIENT_SECRET" \
    | jq -r '.access_token'
  ```
- **Verify user metadata**: call `/api/user` (LibreChat) or `/api/permissions/<resource>` (scope-specific) to confirm the token returns `groups` (must include `users`), `status`, and description strings such as `guardrail=marketing`.
- **Blocked personas**: request `/api/permissions/<resource>` with a finance user to ensure `guardrails` contain `finance` + `normal` and that `status` reflects LDAP (use `scripts/manage-ldap-org.sh create-user --status inactive` to test the inactive path).
- **Documentation**: these steps are captured in [`docs/curl-auth-guardrails.md`](docs/curl-auth-guardrails.md) along with the two-org summary and automation tips.

## 3. Role-based, document-aware chat tests

We store supporting documents in `uploads/` (e.g., the uploaded Starbucks fiscal/impact reports). Guardrails should restrict departmental questions to the appropriate genomes.

- **Setup**: ensure the documents live inside `uploads/` before running the web server so the chat backend indexes them into the vector DB; the template already maps marketing/finance/normal groups to vector DB scopes.
- **Marketing user scenario**: log in as `alpha@librechat.local` (belongs to `users`, `marketing`, `normal`). In the chat UI (or via the `/api/conversation` routes) ask a marketing-specific question, e.g., “What is the 2024 marketing spend change in the Starbucks report?” The response should only reference marketing/creative sections.
- **Finance user scenario**: use the `beta` account; ask a finance-only question about the 2024 fiscal report. The backend should apply the `finance` guardrail and avoid marketing-only text.
- **HR/general scenario**: use a normal user or disable marketing/finance groups to confirm a general question (e.g., “Summarize Starbucks’ 2024 global impact report”) doesn’t surface restricted financial sections.
- **Model check**: use `docker compose exec ollama ollama pull gemma3` to ensure the chat agent uses `gemma3` for these prompt evaluations once guardrails are enforced.
- **Verification**: ensure each persona’s guardrail metadata (token/modal) matches the allowed document scopes and that the response mentions only permitted topics. Document this manual run as part of regression coverage and pair it with screenshot/text transcripts if desired.

## 4. Reported artifacts

- `reports/auth-guardrails.txt`: look here after every `make auth-guardrails-test` run for the output of the scripted checks.
- Uploaded PDFs (`uploads/Starbucks-Fiscal-2024-*.pdf`): keep these available for chat-based validation.

## 5. Next steps for automated coverage

- Add automated chat regression tests that programmatically send questions through the `/api/chat` endpoint (bearing marketing/finance tokens) and assert the response text includes/omits specific guardrail keywords.
- Extend the guardrail validation script if you add new groups/statuses to ensure the template stays consistent.
