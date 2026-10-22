# MCP servers in config profiles

Config profiles (the `__base__` document and role, group and user documents written through
`/api/admin/config`) merge over `librechat.yaml`. For MCP servers, the merge can also take away
what `librechat.yaml` declared: a profile can hide a whole server, remove a field, or remove one key
of a record map. All three are tombstones, written and removed with the same two calls:

| Method | Path                                                             | Body / query                      |
| ------ | ---------------------------------------------------------------- | --------------------------------- |
| POST   | `/api/admin/config/:principalType/:principalId/fields/tombstone` | `{ "fieldPath": "mcpServers.…" }` |
| DELETE | `/api/admin/config/:principalType/:principalId/fields`           | `?fieldPath=mcpServers.…`         |

Profiles merge in a fixed order, the last winning: `__base__` first whatever its priority, then
ascending priority, then role, group and user on equal priority. A "higher" profile below is one
that merges later.

`librechat.yaml` stays authoritative for which servers exist. A profile cannot delete or rename a
`librechat.yaml` server; it can only hide it from the principals the profile applies to.

## Hiding a server

`fieldPath: "mcpServers.<name>"` hides the server for every principal the profile applies to. A
hidden server is an access boundary, not only a catalog filter. For those principals:

- it is missing from `GET /api/mcp/servers`, MCP tool lists, connection status and the agent
  builder;
- registry lookups by name return nothing, so the reinitialize, auth-value, OAuth initiation and
  OAuth callback routes answer as they do for an unknown server;
- an OAuth sign-in started before the hide goes no further: initiation does not redirect to the
  authorization server, and the callback does not exchange the code;
- checkout refuses it, including a configuration resolved before the hide took effect, so a
  persisted agent, a scheduled run or an MCP App that references the server cannot connect to it;
- tools from it are dropped when an agent loads, and its `serverInstructions` are left out of the
  model's context, even when a model spec pins the server;
- saving an agent drops tools from it that the save adds. Tools the agent already had stay stored,
  because a collaborator who edits the agent may not see every server it uses, but they cannot
  load or run for these principals.

Two broader tombstones hide more than one server or reach more principals:

- `fieldPath: "mcpServers"` removes the whole section, so it hides every server a profile can hide
  (all but the ones listed below) for the profile's principals.
- A tombstone in the `__base__` profile applies to every principal, administrators included.
  `__base__` merges first, so every other profile is higher than it: a profile that writes fields
  of a server `__base__` hides brings it back for that profile's principals, as described below.

Deleting the tombstone shows the server again. A higher profile that writes some fields of
a server a lower profile hides also brings it back for its own principals, but not with those
fields. The merge keeps only what the higher profile wrote, which is not a usable server
definition, so those principals get the server as `librechat.yaml` defines it, and the incomplete
entry stays behind as a failed configuration that is inspected again every 5 minutes. To bring the
server back with changes, write the complete definition (`type`, `url` and every other field the
server needs) in the higher profile. To bring it back unchanged, delete the lower profile's
tombstone.

Some servers are never hidden:

- Process-backed (`stdio`) servers. The merge ignores tombstones under them, because their process
  is shared by every user.
- Agent Plugins servers, which are not part of `librechat.yaml`.
- A user's own servers.

The decision comes from the principal's merged configuration (user, role and group memberships, in
merge order). When that configuration cannot be read, every server a profile could hide is
withheld instead of falling back to `librechat.yaml`.

### When a change takes effect

Each process keeps a principal's decision for `MCP_REGISTRY_CACHE_TTL` (5 seconds by default),
including a decision made while the configuration could not be read. The decision is derived from
the merged configuration, which each process also caches, per user and role, for 60 seconds.
Hiding or unhiding a server therefore takes effect:

- immediately in the process that handled the admin config write, which clears both caches;
- within 60 seconds plus `MCP_REGISTRY_CACHE_TTL` (65 seconds by default) in every other process,
  which learns of the write only when its caches expire. The same bound applies to the writing
  process when the `APP_CONFIG` cache is Redis-backed, because merged configurations are then left
  to expire rather than cleared.

Group membership is not part of either cache key, so adding a user to a group or removing one from
it also takes up to that long to change what the user can see.

Hiding does not stop the shared connections started at boot for other principals, and it keeps the
principal's stored OAuth tokens. Revoking those tokens (uninstalling the server or deleting the
account) still reaches the server. The name stays reserved: a user cannot create a server with the
name of a hidden `librechat.yaml` server.

### After upgrading

Profiles could store these tombstones before they had any effect on `librechat.yaml` servers. They
take effect after the upgrade: `mcpServers` and `mcpServers.<name>` tombstones hide servers, and
`mcpServers.<name>.<field>` tombstones remove the field. At startup, each process logs a warning
that lists the stored tombstones of these kinds, by principal (and by tenant, for profiles that
belong to one), so you can review them.

## Removing inherited values

`fieldPath: "mcpServers.<name>.<field>"` removes a field `librechat.yaml` set, such as `timeout`,
`headers` or `customUserVars`, for the principals the profile applies to.

`fieldPath: "mcpServers.<name>.<record>.<key>"` removes one key from a record map and keeps its
siblings. This works for `headers`, `oauth_headers`, `requestHeaders` and `customUserVars`:

```json
{ "fieldPath": "mcpServers.github.headers.Authorization" }
```

These tombstones behave as follows:

- Writing a sibling key in the same profile keeps the tombstone. Writing the same key clears it.
- `DELETE …/fields?fieldPath=<same path>` removes that tombstone and restores the inherited key.
- `DELETE …/fields?fieldPath=mcpServers.<name>.headers` resets the whole record: it clears the key
  tombstones under it as well as the keys the profile wrote.
- A higher profile can supply the key again.
- Fields of a process-backed server, including `env`, cannot be removed.
- A record key that contains `.` cannot be addressed with a dotted `fieldPath`.

The server without the removed value is inspected as its own configuration. If that inspection
fails, for example because the server rejects requests without the removed `Authorization` header,
those principals get it as a failed configuration, inspected again every 5 minutes. They never fall
back to the `librechat.yaml` definition, which still has the value. A change that removes nothing
(such as a new `timeout`) still falls back to `librechat.yaml` while its inspection fails.

Removing `oauth_headers` keys, or the whole field, also covers OAuth sign-in. A sign-in sends the
headers the principal's config had when it started, and none when that config had none left, never
the `librechat.yaml` headers. A sign-in started before the removal goes no further, because the
server's definition changed; signing in again uses the remaining headers.

Removing a `customUserVars` key that a header still references as `{{VAR}}` leaves that placeholder
unresolved for those principals; remove or change the header too.
