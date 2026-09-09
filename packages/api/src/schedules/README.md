# Unattended MCP support

Scheduled chats validate the selected agent and its graph agents before creation,
when enabling or changing the agent, and before each automatic or manual dispatch.
The check uses the persisted user document and plugin credentials, with temporary
user connections that are disposed afterwards. It does not borrow a browser session
or replace a live interactive connection. Tool discovery must complete and contain
all explicitly selected tools; wildcard selections require a nonempty catalog.

Supported authentication is determined by a successful unattended connection:

- Static server credentials and anonymous servers.
- Persisted custom user variables, including API keys.
- Stored MCP OAuth credentials that can connect or refresh without user interaction.

Browser-only credentials, interactive OpenID bearer/OBO sources, missing user
variables, and OAuth grants needing renewed consent cannot be assumed available.
Reconnect or configure the server in an interactive agent chat, or remove it from the
agent, then enable the schedule. A browser connection alone does not prove readiness;
enabling always reruns the unattended check.

`mcp_reauth_required` and `mcp_configuration_missing` stop a scheduled occurrence and
disable the schedule immediately. `mcp_unavailable` counts toward the existing
configured consecutive-failure threshold. Credential-store and configuration-store
outages are transient; they must never be treated as proof of missing credentials.
Failure records contain only server names and resolution statuses, never exception
messages or OAuth URLs. Successful dispatch records also retain the server outcomes.

The schedule card shows failed servers and links to the selected agent for recovery.
A pure pause remains available even when MCP validation fails. This change does not
re-enable existing schedules automatically or repair credentials on the user's behalf.
