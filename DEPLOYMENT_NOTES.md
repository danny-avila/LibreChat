# AI Workforce Pro — v0 Deployment Notes

> Extracted from internal SMB Tech working-notes (`claude_findings.md`) captured during the initial deployment on 2026-05-22. Covers the v0 manual VM setup, critical gotchas hit during install, and the open items for the developer migrating this to Cloud Run next Tuesday.

---

## AI Workforce Pro — LibreChat on GCP Compute Engine (2026-05-22)

Stood up the v0 frontend for "AI Workforce Pro": a LibreChat instance Greta can log into and chat with Claude through, running on a single Compute Engine VM with Docker Compose. Intended as a working setup for a few days until a developer (starting next Tuesday) migrates it to Cloud Run with TLS and a custom domain.

### Final state
- **VM:** `librechat-vm` in `us-central1-a`, `e2-medium`, Ubuntu 22.04.5 LTS, 30 GB pd-balanced disk
- **GCP project ID:** `ai-workforce-pro` (no suffix — display name matched ID exactly; project number 137220708519)
- **External IP (ephemeral):** `34.136.159.99` — accessible at `http://34.136.159.99:3080`
- **Firewall rule:** `allow-librechat-3080` — tcp:3080 from `0.0.0.0/0` to VMs tagged `librechat`
- **Fork:** `https://github.com/SMB-Team-Technology/AI-Workforce-Pro` (public)
- **Anthropic API key name:** `librechat-prod-2026-05` (in console.anthropic.com)
- **Admin user:** `greta@smbteam.com` (created via `npm run create-user`)
- **Estimated cost:** ~$25/mo if VM left running 24/7; ~$1.20/mo if stopped (disk only)

### Critical gotcha: gcloud CLI now requires Python 3.10+ on macOS
- gcloud 569.0.0's source contains `match` statements (Python 3.10+ syntax)
- Apple's bundled `/usr/bin/python3` is 3.9.6 → installer fails with `SyntaxError`
- Google publishes a bundled Python component for Linux x86_64 and Windows, but **NOT for macOS** (verified via `components-2.json`)
- **Fix:** install Python 3.13 from python.org's .pkg installer **before** running gcloud's `install.sh`. Set `CLOUDSDK_PYTHON=/usr/local/bin/python3.13` for the install. After install completes, gcloud builds its own internal venv and `CLOUDSDK_PYTHON` is no longer needed.
- Apple's .pkg is GUI-driven for the password prompt — the Bash tool can't `sudo` it directly, so this step requires the user to double-click the .pkg and click through.

### Critical security gotcha: LibreChat .env.example ships with public default secrets
- `.env.example` in the LibreChat repo contains **real-looking, hardcoded values** for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, `CREDS_IV`, and `MEILI_MASTER_KEY`
- These are visible in the public GitHub repo — anyone could forge JWTs against an instance running with defaults
- **Always rotate all 5 secrets** before starting the stack. Generate via:
  - `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`: `openssl rand -hex 32` (64 hex chars)
  - `CREDS_IV`: `openssl rand -hex 16` (32 hex chars)
  - `MEILI_MASTER_KEY`: `openssl rand -hex 24` (48 hex chars)
- `cp -n` to preserve `.env.example` as the reference; then `sed -i` in place on `.env`.

### Invite-only auth flow
- Set both `ALLOW_REGISTRATION=false` and `ALLOW_SOCIAL_REGISTRATION=false` from the start (no "register first, lock down later" race window)
- Create users with `docker compose exec api npm run create-user` — interactive prompts for email, name, username, password, email-verified
- The script emits a non-fatal `ENOENT: no such file or directory, open '/app/librechat.yaml'` warning at startup because `librechat.yaml` is an optional advanced config; user creation succeeds anyway
- Verify by hitting `GET /api/config` from inside the VM — `registrationEnabled: false`, `emailLoginEnabled: true`, `socialLoginEnabled: false`

### OS Login = no manual SSH key wrangling
- Created the VM with `--metadata=enable-oslogin=TRUE`
- First `gcloud compute ssh` auto-generates `~/.ssh/google_compute_engine` and uploads the public key tied to IAM
- OS Login username is `<email-with-@-and-.-replaced-by-_>`, e.g. `greta_smbteam_com`
- Adding the OS Login user to the `docker` group via `sudo usermod -aG docker $(whoami)` takes effect on the *next* `gcloud compute ssh` invocation (each `--command="..."` call is a fresh login) — no manual logout dance required

### Driving the VM from `gcloud compute ssh --command`
- Non-tty mode (`--command="..."`) is ideal for automation: one-shot commands return stdout/stderr cleanly
- Multi-step bash with `&&` between commands works; for very long scripts, write to a file with a heredoc first
- Interactive tools on the VM (`nano`, `docker compose exec api npm run create-user` with password prompts) need to be driven by the user from their own Terminal session — the Bash tool can't proxy a TTY

### Verification (end-to-end, confirmed working)
1. `docker compose ps` — 5 containers Up (`LibreChat`, `chat-mongodb`, `chat-meilisearch`, `rag_api`, `vectordb`)
2. `curl http://localhost:3080/api/config` from inside VM returns HTTP 200 with `serverDomain: "http://34.136.159.99:3080"`
3. Browser at `http://34.136.159.99:3080` shows Login page (no Sign-up tab — registration off)
4. Login with admin creds succeeds; Claude responds in the chat UI

### Outstanding (for the developer starting next Tuesday)
- Reserve a static IP and bind a DNS A record (e.g. `chat.smbteam.com`)
- TLS via Caddy/nginx + Let's Encrypt
- Restrict firewall `--source-ranges` to SMB office IPs or front with IAP
- SMTP config for password reset emails (currently `ALLOW_PASSWORD_RESET=false`)
- VM snapshot schedule
- Eventual Cloud Run migration with Mongo Atlas
- Build a real invite flow instead of `npm run create-user` for each new user
- Add a `librechat.yaml` to silence the startup warning and to configure custom endpoints/agents
