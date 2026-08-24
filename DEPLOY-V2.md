# LibreChat v2 (staging) — operations

Second LibreChat instance, fully separate from the live production stack.
Production (`librechat.aidstlab.top`, compose project `librechat`,
`/home/debian/projects/librechat`) is **not** touched by anything here.

| | production | this instance |
|---|---|---|
| compose project | `librechat` | `librechat-v2` |
| project dir (host) | `/home/debian/projects/librechat` | `/home/debian/projects/claude-code/librechat-v2` |
| chat URL | `https://librechat.aidstlab.top` | `https://librechat-v2.aidstlab.top` |
| admin URL | `https://librechat-admin.aidstlab.top` | `https://librechat-v2-admin.aidstlab.top` |
| billing | `librechat.aidstlab.top/billing` | `librechat-v2.aidstlab.top/billing` |
| containers | `LibreChat`, `chat-mongodb`, … | `LibreChat-v2`, `chat-mongodb-v2`, … |
| named volumes | `librechat_*` | `librechat-v2_*` |
| internal network | `librechat_default` | `librechat-v2_default` |
| branch | — | `dstlab-billing` |

Both stacks join the shared external `edge` network so the host's Traefik can
route to them. Nothing is published on a host port.

## Compose invocation

This stack is **not** driven by `docker-compose.override.yml` — that tracked
file carries the production hostnames and is left alone. Always pass both files
explicitly:

```bash
cd /workspace/librechat-v2   # host: /home/debian/projects/claude-code/librechat-v2

alias lc2='docker compose -p librechat-v2 -f docker-compose.yml -f docker-compose.v2.yml'
```

## Everyday commands

```bash
# status
lc2 ps

# logs
lc2 logs -f api            # chat backend
lc2 logs -f billing
lc2 logs --tail 200        # everything

# restart
lc2 restart api            # one service
lc2 up -d                  # apply config changes
lc2 down                   # stop this stack only (production unaffected)

# rebuild after pulling new code
git pull
lc2 build api billing
lc2 up -d
```

Without the alias, spell the flags out — `-p librechat-v2` is what keeps this
stack from colliding with production, so never omit it:

```bash
docker compose -p librechat-v2 -f docker-compose.yml -f docker-compose.v2.yml ps
```

## Ingress

Traefik (`traefik-traefik-1`, host `:80`/`:443`) discovers this stack through
container labels — there is no Nginx on this server and no vhost file to edit.
Routers are named `librechat-v2`, `librechat-v2-admin`, `librechat-v2-billing`
so they cannot clash with the production routers.

TLS is Let's Encrypt via Traefik's `letsencrypt` resolver (HTTP-01), renewed
automatically; `*.aidstlab.top` already resolves to this host, so no DNS work
is needed for new subdomains. HTTP→HTTPS redirect is global on the `web`
entrypoint.

## Secrets

`.env` holds freshly generated secrets for this instance (`CREDS_KEY`,
`CREDS_IV`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEILI_MASTER_KEY`,
`ADMIN_PANEL_SESSION_SECRET`) — deliberately different from production's, so a
staging leak cannot decrypt production data. `.env*` is gitignored; do not
commit it.

`ALFAPAY_DRIVER=mock` keeps staging off the live payment gateway.

## Restart-after-reboot

Every service carries `restart: always` (`unless-stopped` for Traefik), so the
stack comes back on its own after a Docker daemon or host restart.
