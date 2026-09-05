# Agent Management CRUD smoke test

Exercise the Agent Management HTTP API against a configured LibreChat instance.

## Run the smoke test

Requires Node 24. Run from the repository root. The runner uses
native Node APIs and does not require installing LibreChat dependencies. It creates
one uniquely named Agent and deletes it in a `finally` block, including after failed
assertions. It never executes an Agent or calls a model. Use a configured provider
and model permitted for the restricted management user.

Set these environment variables through your normal local secret mechanism:

| Variable                    | Value                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| `AGENT_PREVIEW_URL`         | Agent collection URL, including its route prefix                        |
| `AGENT_PREVIEW_TOKEN`       | Bearer token for an authorized management caller                        |
| `AGENT_PREVIEW_PROVIDER`    | Permitted provider                                                      |
| `AGENT_PREVIEW_MODEL`       | Permitted model                                                         |
| `AGENT_PREVIEW_REVISION`    | Deployed LibreChat revision                                             |
| `AGENT_PREVIEW_ENVIRONMENT` | Test environment name                                                   |
| `AGENT_PREVIEW_FOREIGN_ID`  | Optional known Agent ID in a separate test tenant; tested with GET only |

```sh
node scripts/agents-preview/run.mts
```

Set the collection URL to the management endpoint (`/api/agents/v1/agents`). Redirects are refused and HTTPS is
required except on localhost. Tokens and response bodies are not logged by the
request reporter; it emits step names, HTTP statuses, and request IDs for correlation.

Checks: missing/invalid authentication, optional foreign-tenant read rejection,
create/retrieve/list, rejection of ownership/tenant fields, update persistence,
delete, missing-after-delete, and repeated deletion. List traversal is bounded at
100 pages. If a request times out after server-side creation, or the server fails to
return an ID, inspect the restricted user's Agents for the `CRUD preview` fixture
and clean it up. A process kill can also prevent cleanup.

## Verify the runner locally

```sh
node --test scripts/agents-preview/run.test.mts
npx tsc --noEmit -p scripts/agents-preview/tsconfig.json
```

The local HTTP fixture verifies the runner's lifecycle, failure cleanup, and URL
handling. It does not substitute for deployed integration tests.
