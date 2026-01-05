# Curl Guide for Auth & Guardrail Use Case

This guide expands on the [frontend auth/guardrail flow](docs/frontend-auth-flow.md#L3-L70) by giving concrete `curl` commands you can run when you want to:

- exercise the login → `/api/user` → `/api/permissions/<resource>` path from a terminal, and
- verify that department guardrails, default `users` membership, and the new `status` attribute propagate through every layer.

We use two example organisations in this walkthrough — **LibreChat** (global tenant) and **MarketingOps** (example department-level tenant). Both orgs pull the same LDAP template, the `scripts/manage-ldap-org.sh` helper ensures every account joins `users`, and each group description encodes `guardrail`, `services`, and `vectorDb` metadata for the frontend. Set `AUTH_HOST` in your `.env` (and mirror it in `.env.example`) to point at the Keycloak host you want to exercise, whether that’s `https://auth.librechat.local`, `http://localhost:8080`, or another IP/domain.

## 1. Step-by-step commands

1. **Obtain a Keycloak token** (replace client/secret values and username/password per org, and ensure the host matches your `AUTH_HOST` entry from `.env`/`.env.example`):
   ```bash
  curl -X POST "${AUTH_HOST:-https://auth.librechat.local}/realms/librechat/protocol/openid-connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=password&client_id=librechat-web&username=alpha&password=AlphaPass123!" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     | jq -r '.access_token'
   ```
   Save the resulting token for the next calls (shown as `$TOKEN_LC` for LibreChat accounts and `$TOKEN_MKT` for MarketingOps accounts).

2. **Inspect the authenticated user** (LibreChat org user):
   ```bash
   curl -H "Authorization: Bearer $TOKEN_LC" \
     https://librechat.local/api/user
   ```
   Response fields of interest:
   - `groups`: should include `users` plus any department (e.g., `marketing`, `normal`).
   - `status`: should read `active` or `inactive` depending on the LDAP entry.
   - `guardrail` metadata encoded in `groups[].description` to inform UI routing.

3. **Fetch guardrail metadata per organisation** (MarketingOps user with marketing/normal guardrails):
   ```bash
   curl -H "Authorization: Bearer $TOKEN_MKT" \
     https://librechat.local/api/permissions/marketing-chat
   ```
   The payload should contain the union of the guardrails for every group returned by the token, for example:
   ```json
   {
     "guardrails": [
       {"name": "marketing", "promptScope": "marketing", "documentScope": "marketing"},
       {"name": "normal", "promptScope": "general", "documentScope": "general"}
     ],
     "status": "active"
   }
   ```

4. **Validate blocked personas**: repeat step 2 with a token for a `beta` user from a finance group to confirm the `guardrails` array now contains `finance` plus `normal` metadata and `status` mirrors the LDAP entry (`inactive` if you set it so).

5. **Optional: re-run template for a second org** (LibreChat + MarketingOps) via the helper script as described in `docs/frontend-auth-flow.md#L54-L64`. After the second org exists, repeat steps 1‑3 with credentials from `marketingops.supervisor` so you can compare the `/api/user` responses between orgs while both still land in the `users` group.

## 2. Two-org example summary

| Org | Primary guardrails | Sample login | Expected groups/status |
|-----|--------------------|--------------|------------------------|
| LibreChat | `superuser`, `orgadmin`, `users` | `admin`/`PlatformAdmin!` | `status: active`, includes `users` and `superuser` group (group metadata contains `guardrail=superuser`). |
| MarketingOps | `marketing`, `normal`, `users` | `alpha@marketingops.local` / `AlphaPass123!` | `status: active`, includes `users`, `marketing`, and `normal` and the `/api/permissions` response mirrors those guardrails in `guardrails[]`. |

Use the same `curl` commands with each org’s token; the only differences are the credentials, the token variable (`$TOKEN_LC` vs. `$TOKEN_MKT`), and (optionally) the `resource` parameter in `/api/permissions/<resource>` to match the department you want to protect.

## 3. Tips

- Pipe the token command into `tee token.txt` so you can reuse the bearer token for multiple `curl` calls without manually copying it.
- When guarding model access, always tag requests with the highest-priority guardrail (superuser > orgadmin > departmental groups) and include `status: active` checks before allowing chat submissions.
- Running `scripts/manage-ldap-org.sh create-user --status inactive` lets you confirm the `/api/user` response surfaces the inactive flag, helping the UI grey out access controls when necessary.

## 4. Automating guardrail validations

- Run `make auth-guardrails-test` to execute the guardrail validation script inside a Docker `node:20` container; the repo is mounted as a volume so the script and its `reports/auth-guardrails.txt` output survive even when the container stops.
- Inspect [reports/auth-guardrails.txt](reports/auth-guardrails.txt) after each run to ensure every user is seeded with `users` plus the appropriate `guardrail` metadata and that the report is still available without restarting Docker.