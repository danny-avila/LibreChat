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
- A delivery is at-least-once. Fire and steer admission reuse the envelope's stable idempotency
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
