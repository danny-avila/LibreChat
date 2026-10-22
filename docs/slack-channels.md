# Slack agent setup

Each connection installs one LibreChat agent as a custom Slack app. Slack provides
its native agent view, thread sessions, working status, and stop button.

## Run the gateway

The gateway is a standalone app in `packages/channel-gateway`. It has its own
entry point and Docker image. It calls LibreChat over authenticated HTTP and
does not load the LibreChat API package. Use Node 24. Build from the repository root:

```sh
npm run build:data-provider
npm run build:channel-gateway
```

Add this section to `librechat.yaml`. Use the public HTTPS addresses for your deployment.

```yaml
channels:
  enabled: true
  publicUrl: https://agents.example.com
  gatewayUrl: https://channels.example.com
  port: 3091
```

Set `CHANNEL_GATEWAY_TOKEN` to the same random secret in the LibreChat service and
the gateway service. Use at least 32 random bytes. Keep it in the deployment's
secret store. The gateway uses this dedicated credential, not a user's API key.
LibreChat also needs its normal 32-byte hexadecimal `CREDS_KEY` to encrypt Slack
credentials and linked session references.

Set `CHANNEL_GATEWAY_API_URL` in the gateway to LibreChat's base URL. HTTPS is
required except for localhost. Forward the gateway's HTTPS address to port 3091.
Only the gateway needs public Slack event ingress. Restrict access to LibreChat's
`/api/channels/gateway` routes at your reverse proxy as well as using the service
credential. Do not log request bodies, authorization headers, or link URLs.

```sh
npm run channel-gateway
```

The command reads `.env` in `packages/channel-gateway`. For a container, build
the separate image from the repository root and pass only its service settings:

```sh
docker build -f packages/channel-gateway/Dockerfile -t librechat-channel-gateway .
docker run --init --env-file gateway.env -p 3091:3091 librechat-channel-gateway
```

`gateway.env` contains `CHANNEL_GATEWAY_API_URL` and `CHANNEL_GATEWAY_TOKEN`.
Use a reachable HTTPS LibreChat address from the container. The image contains
only the gateway bundle and Node. It needs no LibreChat image or database secrets.

The gateway has a `/health` endpoint. Run one gateway process for this MVP,
particularly for Socket Mode. The worker stores its event receipts and outgoing
replies in LibreChat's database. It needs no queue service or direct database
credentials. Message content stays in LibreChat. The gateway holds content only
while processing or delivering it.

The selected agent must allow remote access. Each linked user needs remote-agent
use permission and access to that agent. The existing agent runtime resolves tool
permissions and personal credentials for each turn.

## Create and install the Slack app

1. Sign in to LibreChat as the agent owner. Open Settings, Data, Slack agents.
   The direct page is `/channels`.
2. Select your agent and HTTP mode. Download the manifest.
3. In [Slack's app console](https://api.slack.com/apps), create an app from the
   manifest in your test workspace. Install it manually.
4. Copy the app ID, bot token, and signing secret into LibreChat. Save credentials.
   LibreChat checks that the token belongs to the selected Slack app and workspace.
5. Download the manifest again. Apply this manifest in Slack. It now includes the
   signed HTTP event URL. The initial manifest omits this URL because Slack checks
   it before LibreChat has the app's signing secret.
6. Use Check connection in LibreChat. Enable the connection. Add the app to the
   channel where you want to test it. Channel replies stay in their thread.

For local development, select Socket Mode before downloading the manifest. Create
an app-level token with `connections:write` in Slack and save it with the other
credentials. No public event callback is required. LibreChat's account-link URL
must still be reachable by the person linking their account.

Saving credentials, checking the connection, and enabling delivery are separate
operations. Disable stops new work. A credential rotation must keep the app and
workspace identity. Create a different connection for a different agent.

## Link accounts and talk to the agent

Send a DM or mention the app. It sends a private link and code. Sign in to
LibreChat, check the displayed Slack workspace and user IDs, and enter the code.
The code expires after ten minutes and can be used once. A link cannot silently
replace another LibreChat account. Use Unlink before changing accounts.

OpenID connections refer to the server session used during linking. LibreChat's
existing token provider checks and refreshes that session. Logout, session expiry,
or rejected refresh requires sign-in and account reconnection. The gateway never
receives personal tool credentials or OpenID tokens. Tools with their own OAuth
connections continue to use LibreChat's existing credential storage.

Replies in a channel are visible to that channel. The next participant receives
only delivered messages and visible agent replies as context. Private tool
messages, credentials, and private reconnect notices do not enter shared history.
DM threads have separate history. New Slack threads start new conversations.

Use Slack's stop button to cancel your active turn. The gateway closes the active
LibreChat request and clears working status. Stopping cannot undo a tool action
that already completed. Approval and tool-connection failures require action in
LibreChat; the gateway does not approve tools on the user's behalf.

## Failures and recovery

Duplicate Slack deliveries do not create another run. A database lease allows
only one worker to process a conversation at a time. Known Slack rate limits
retry the saved reply after `Retry-After`, without running the agent again.

After an interrupted run, the worker sends a private interruption notice. It does
not rerun tools whose outcome is unknown. If a reply might already have reached
Slack, the worker does not send it again. Check Slack and the tool's result before
sending a new request. A recovered worker also clears stale working status.

The `ChannelEvent` collection stores pending work, outgoing replies, and terminal
`uncertain` receipts. Use those receipts for delivery diagnosis. Do not manually
reset a running or uncertain receipt to pending. The gateway logs stable failure
codes without provider payloads or credentials.

Timeouts, lease duration, message/history size, and delivery attempt limits are
configurable under `channels` in the YAML schema. The feature is disabled by
default. Other providers and broader channel features remain in
[AI-1499](https://linear.app/clickhouse/issue/AI-1499).
