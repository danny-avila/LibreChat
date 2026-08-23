# Agent trigger delivery

This module is the trusted, source-neutral boundary for asynchronous agent work. A schedule,
webhook, queue consumer, MCP integration, or internal event adapter produces the same versioned
envelope and calls `enqueueAgentTrigger`; the adapter does not invoke an agent runtime directly.

## Adapter contract

- Authenticate and authorize the source before creating an envelope.
- Strip credentials and transport secrets from `event.payload`.
- Give each source event a stable `event.id`, and keep `deliveryId` stable for retries to one
  target. A retry may use a fresh `requestId` and `receivedAt`.
- Render bounded model input on the host. Infrastructure and routing remain server-controlled.
- Use `continue` only with a persisted `conversationId` and exact `parentMessageId`. The host defers
  that delivery while the parent generation is still running or paused, so it cannot replace the
  generation it is meant to follow.
- External sources never supply a child `conversationId`, `parentMessageId`, or `agentId` on a
  continue delivery. Register an event binding once, then address only its opaque binding id.
- Use `orderingKey` only when deliveries must remain ordered across different event sources.
  Without an override, ordering is scoped to the user, source, mode, agent, and conversation.

```js
const { createAgentTriggerEnvelope } = require('@librechat/api');
const { enqueueAgentTrigger } = require('~/server/services/Agents/triggers');

await enqueueAgentTrigger(
  createAgentTriggerEnvelope({
    mode: 'fire',
    requestId,
    deliveryId,
    receivedAt: Date.now(),
    principal: { id: userId, role, tenantId },
    event: {
      id: eventId,
      type: 'resource.ready',
      occurredAt,
      source: { id: webhookId, type: 'webhook' },
      payload: sanitizedPayload,
    },
    target: { agentId },
    input,
  }),
  { orderingKey: resourceId },
);
```

## Guarantees

- Mongo owns queue state, leases, retry history, and dead letters across restarts and replicas.
- A fresh token fences every claim, including reclaims by the same process.
- A delivery is at-least-once. Fire, continue, and steer admission reuse the envelope's stable idempotency
  identity, so ambiguous retries do not duplicate accepted work.
- Retryable failures use bounded exponential backoff and honor `Retry-After`. Invalid envelopes,
  permanent authorization failures, and exhausted retries become durable dead letters.
- Matching ordering lanes serialize sequence allocation and queue publication behind a
  Mongo-fenced publisher. A staging row is durable before taking that fence, and any replica can
  finish an abandoned publication before allocating the next sequence, so a later delivery can
  never overtake the invisible gap. Dead letters are terminal and do not block later work; an
  explicit requeue admits the dead letter as a new lane tail so it cannot overlap newer in-flight
  work. Inactive lane counters are reclaimed once no staging, queued, leased, or dead delivery
  remains.
- Successful records expire after 90 days. Dead letters remain until explicitly requeued or
  removed. Account deletion first fences admission and drains active leases without destroying
  queued work. A delivery deferred by that fence releases its lease and restores the attempt it
  reserved, so a rolled-back deletion cannot exhaust its retry budget. Before deleting the user,
  every deletion path durably arms an exact-fence purge marker; payloads are purged only after the
  user deletion commits, and every replica retries any orphaned post-commit marker until cleanup
  succeeds. An abandoned deletion fence can be recovered through `config/delete-user.js` only
  after an operator confirms every competing app, worker, and deletion CLI process is stopped.

`getAgentTriggerDeadLetters` and `requeueAgentTrigger` are intentionally trusted in-process
operations. Exposing them through an admin API requires a separate authorization and audit layer.

## Remote event ingress

Authenticated controllers and source adapters can enqueue the same durable envelope through
`POST /api/agents/v1/events`. The endpoint uses Remote Agents API-key authentication, the remote
agents feature permission, and the target agent's existing remote-view ACL. Send exactly one
`Idempotency-Key` header and keep it stable when retrying the same source-event-to-target delivery.
The authenticated user, tenant, API-key source identity, request id, and receive time are always
supplied by LibreChat. Remote callers do not choose `event.source`; provider-specific webhook
adapters may verify their native signature and map verified provider metadata into the trusted
in-process adapter contract above.

```http
POST /api/agents/v1/events
Authorization: Bearer <remote-agents-api-key>
Idempotency-Key: webhook-42-resource-7
Content-Type: application/json

{
  "mode": "fire",
  "event": {
    "id": "resource-7-ready-3",
    "type": "resource.ready",
    "occurredAt": 1786967999000,
    "payload": { "resourceId": "resource-7" }
  },
  "target": { "agentId": "agent-id" },
  "input": "Resource resource-7 is ready. Inspect it and report the result.",
  "orderingKey": "resource-7"
}
```

A successful admission returns `202 Accepted`, an opaque delivery `id`, and a `Location` header.
Poll that location to read `pending`, `leased`, `succeeded`, or `dead` state. Successful fire
results include the conversation and generation identity needed for a later `steer` event. Status
responses never expose the stored source payload, ordering key, retry history, or worker identity.
Callers must sanitize `event.payload`; credentials and transport secrets must not be persisted.

### Event-driven child actors

Register a direct child agent once under the same Remote Agents API key that will deliver events.
The parent must be an ordinary agent conversation, and the target must be enabled in that parent
agent's direct `subagents.agent_ids` list (or be an allowed self-spawn). The reserved child
conversation is hidden from conversation lists and remains read-only to human chat routes.
`endpoints.agents.eventDriven.childTurns` defaults to false; enable it only after every API replica
runs a release that understands bound child continuations, otherwise an older worker could
permanently reject a new envelope during a rolling deployment. The legacy
`ENABLE_AGENT_EVENT_CHILD_TURNS` environment variable remains a compatibility fallback.
`AGENT_TRIGGERS_SELF_URL` likewise remains a compatibility fallback for
`endpoints.agents.eventDriven.selfUrl`; most deployments should omit both and use the bound
listener.

```http
POST /api/agents/v1/events/bindings
Authorization: Bearer <remote-agents-api-key>
Idempotency-Key: championship-7-player-hanae
Content-Type: application/json

{
  "actorId": "hanae-kobayashi",
  "parentConversationId": "director-conversation-id",
  "parentMessageId": "director-message-id",
  "target": { "agentId": "agent-hanae" }
}
```

The response contains an opaque `id` and the child `threadId`. Store the binding id with the
source actor. Deliver every later turn with a source-stable event id and the same API key:

```http
POST /api/agents/v1/events
Authorization: Bearer <remote-agents-api-key>
Idempotency-Key: game-12-ply-17-hanae
Content-Type: application/json

{
  "mode": "continue",
  "bindingId": "evtbind_…",
  "event": {
    "id": "game-12-ply-17",
    "type": "chess.turn.ready",
    "occurredAt": 1786968000000,
    "source": { "id": "speed-chess", "type": "mcp" },
    "payload": { "gameId": "game-12", "expectedPly": 17 }
  },
  "input": "Your clock is running. Read the position and submit one legal move."
}
```

LibreChat resolves the bound agent and child conversation from `(user, tenant, API key, binding)`;
caller-supplied target fields are discarded. It also resolves the latest assistant branch leaf
immediately before dispatch, so queued events do not persist stale chat topology. Each actor binding
is its default ordering lane. A short-lived internal trigger token plus a second binding lookup is
required to pass the child-thread write guard; possessing a binding id alone grants no access.
