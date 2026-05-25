# Operations

For routine health checks and incident response. For initial setup or shipping changes, see [deployment.md](deployment.md).

## Health checks

### Daily glance (2 minutes)

| Dashboard | What you're looking for |
|---|---|
| [UptimeRobot](https://uptimerobot.com/dashboard) | The `chat.patoexpectsspeed.com` monitor is green. 5-min interval. |
| [Together AI console](https://api.together.ai/settings/billing) | Credit balance not approaching zero. Daily spend trend not spiking. |
| [Groq console](https://console.groq.com/) | Free-tier token usage not pinned at the 100K/day cap (signal that Together has fallen over). |

### Weekly (5 minutes)

| Dashboard | What you're looking for |
|---|---|
| AWS Billing → Cost Explorer | Month-to-date under the $25/mo budget. |
| AWS Budgets → alerts | No fired alerts at 85%/100%/100%-forecasted. |
| AWS Cost Anomaly Detection | No new anomaly above the $5 spike threshold. |
| EC2 → Instance status | The t3.small shows `2/2 status checks passed`. |

### Monthly

- Verify the Let's Encrypt cert is fresh (Caddy auto-renews, but check). On EC2: `curl -vI https://chat.patoexpectsspeed.com 2>&1 | grep "expire date"`.
- Sanity check that there are no surprise EC2 resources accumulating (snapshots, volumes, EIPs).

## Common operations

All commands below assume you've SSHed into the EC2 host:

```
ssh -i ~/.ssh/llm-chat-key.pem ubuntu@3.14.217.225
cd ~/libre-chat
```

### Container status

```
docker compose ps
```

All services should be `Up`. `Restarting` means something is crash-looping — check logs.

### View LibreChat logs

```
docker compose logs api --tail=100 -f
```

Replace `api` with `mongodb`, `meilisearch`, or `rag_api` to inspect other containers.

### Restart everything

```
docker compose down
docker compose up -d
```

Safe — the data volumes (`./data-node`, `./meili_data_v1.35.1`) persist across restarts.

### Swap LLM provider as the UI default

Default model is set in [librechat.yaml](../librechat.yaml). The order of endpoints determines the UI default (first one wins). To make Groq the default instead of Together, reorder the `endpoints.custom` list so Groq comes first, or change the default model on the Together endpoint.

After editing locally, follow the [config-only deploy](deployment.md#config-only-deploy) path.

### Adjust rate limits

The relevant env vars in `.env`:

| Var | Current | Default |
|---|---|---|
| `LOGIN_MAX` | 20 | 7 |
| `LOGIN_WINDOW` | 5 (min) | 5 |
| `REGISTER_MAX` | 20 | 5 |
| `REGISTER_WINDOW` | 60 (min) | 60 |

Edit `.env`, `scp` to EC2, restart. See [decisions/2026-05-25-pilot-config-and-provider-swap.md](decisions/2026-05-25-pilot-config-and-provider-swap.md) for sizing notes.

### Rotate the Together AI API key

1. In the [Together console](https://api.together.ai/settings/api-keys), generate a new key.
2. Update `TOGETHER_API_KEY=` in `.env` on the laptop.
3. `scp` `.env` to EC2 and restart (see [config-only deploy](deployment.md#config-only-deploy)).
4. In the Together console, revoke the old key.

Same flow for `GROQ_API_KEY`.

## Troubleshooting

### Chat URL won't load at all

1. UptimeRobot status — is the monitor red? If yes, this is a real outage.
2. DNS: `dig chat.patoexpectsspeed.com` — does it still resolve to `3.14.217.225`?
3. EC2 console: is the instance running? Did it stop or get terminated?
4. SSH in, check Caddy: `systemctl status caddy`.
5. SSH in, check containers: `docker compose ps`. Anything `Restarting` or `Exited`?
6. Try `curl -I http://localhost:3080` on the host. If that's OK but `https://chat.patoexpectsspeed.com` isn't, the problem is Caddy or DNS, not LibreChat.

### Login works but messages fail

The LLM provider is the most likely culprit.

1. Tail the api logs: `docker compose logs api --tail=200 -f`. Look for 4xx/5xx from Together or Groq.
2. Together console → check credit balance. If $0, top up or swap to Groq.
3. Groq console → check token usage. If you've hit the 100K/day free cap, Groq will 429.
4. The simplest test: in the LibreChat UI, switch the model dropdown to the other provider. If that works, the issue is provider-side.

### Personas hit "Too many login attempts"

`LOGIN_MAX=20 / LOGIN_WINDOW=5` means 20 attempts per IP per 5 minutes. If SPE is hammering with all personas from the same egress IP, raise both:

- Pilot: 20 / 5 min (current)
- Production scale (~180 personas): probably 100 / 5 min

Edit `.env`, redeploy (config-only path).

### Personas hit "session expired" frequently

`SESSION_EXPIRY=86400000` is already 24 hours. If sessions are still expiring sooner:

- The persona client is likely re-logging-in repeatedly and generating a new session each time rather than reusing one. That's an SPE-side bug, not a LibreChat config issue.
- The proper fix is refresh-token handling on the SPE side; see [decisions/2026-05-25-pilot-config-and-provider-swap.md](decisions/2026-05-25-pilot-config-and-provider-swap.md).

### Container shows "Restarting" in `docker compose ps`

```
docker compose logs <service-name> --tail=200
```

Common causes:
- **LibreChat**: bad `.env` (malformed value, missing required var). The api container will log a parse error at the top and crash-loop.
- **mongodb**: corrupted data-node volume or permissions issue on `./data-node`. Check disk space (`df -h`).
- **meilisearch**: similar — permissions on `./meili_data_v1.35.1` or out-of-disk.

## Credential rotation cadence

| Credential | Cadence | Notes |
|---|---|---|
| GHCR PAT (laptop, `write:packages`) | 90 days | GitHub will email when nearing expiry. |
| GHCR PAT (EC2, `read:packages`) | 90 days | Same. |
| SSH key (`llm-chat-key.pem`) | When team membership changes | Rotate immediately if the key is ever leaked or the laptop is lost. Update the EC2 key pair via AWS console + replace `~/.ssh/authorized_keys` on the host. |
| Together AI API key | Annually, or immediately after any incident | See [rotation steps above](#rotate-the-together-ai-api-key). |
| Groq API key | Annually, or immediately after any incident | Same flow as Together. |
| Mongo credentials | N/A — Mongo runs with `--noauth` inside the docker network (see [docker-compose.yml](../docker-compose.yml)). Not exposed externally. Revisit if we ever publish the port. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, `CREDS_IV` | After any incident or suspicion of leak | Rotating these invalidates all existing sessions — coordinate with SPE so personas re-auth cleanly. |
