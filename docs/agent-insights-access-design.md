# Agent-Scoped Insights Design

Status: design reference for work based on `upstream/dev` after PR #14898.

## Access Model

- `ENABLE_INSIGHTS` remains the only feature flag.
- Literal tenant admins can view insights for every current persisted agent.
- A global `read:insights` grant permits viewing every current persisted agent.
- Otherwise, a user needs at least one effective per-agent insights grant to open Insights.
- Add `PermissionBits.VIEW_INSIGHTS = 16` to the existing agent ACL entry.
- One ACL entry must contain both `VIEW` and `VIEW_INSIGHTS`; bits from separate entries do not combine.
- Users, groups, and roles can receive the bit. Public principals cannot.
- Agent creators and owners do not receive it automatically. Do not backfill existing ACL entries.
- Only literal admins can change the bit, for any agent in their tenant.
- Ordinary dashboard reads are not written to the audit log.

## Permission Updates

- Extend the existing agent sharing dialog and permission update API.
- Show an admin-only **View insights** checkbox on each principal row.
- Explain: "Allows this principal to view usage and conversation content for this agent."
- Treat `viewInsights` as tri-state: omitted preserves the bit, `true` adds it, and `false` removes it.
- Removing ordinary `VIEW` also removes the dependent insights bit.
- Save role and insights changes through the existing bulk transaction boundary. Each ACL document is updated atomically.
- Audit each actual insights grant or revoke separately. Follow `AUDIT_LOG_FAIL_CLOSED`; compensate any transition that cannot be audited, and do not audit no-op saves.

## API And Authorization

- Replace `/api/admin/insights` with `/api/insights`; no compatibility alias is required.
- Keep `/api/insights/access` as a lightweight sidebar authorization check.
- Outside Insights, the sidebar calls `/access`. On Insights itself, skip `/access` and call `/api/insights` immediately.
- `/api/insights` independently resolves authorization and validates the requested agent IDs before starting its data aggregations in parallel.
- The main response includes the authorized alphabetized `{ id, name }` agent list and dashboard data.
- Omitted `agentIds` means all currently authorized agents. Repeated `agentIds` request an exact subset.
- Sort and deduplicate IDs. Return `403` if any requested ID is missing or unauthorized.
- Return `404` when the feature flag is off. Return `403` when the feature is on but the user has no accessible agents.
- Resolve access on every protected request; do not add an authorization cache.
- Every Agent, ACL, Conversation, Message, and User query must be tenant-scoped.
- Transcript and attachment viewing are out of scope.

## Agent Filter

- Put a simple multi-select in the sticky header before the date controls.
- Show current persisted agents only, in alphabetical order. Include agents with no activity.
- Do not show deleted agents or their historical data.
- Select all accessible agents by default, without a synthetic "All" row.
- Provide a **Select all** command and prevent an empty selection.
- Keep a one-agent selector visible but disabled.
- Show one agent name, `N agents`, or `All N agents` in the trigger.
- For duplicate names only, append a short stable agent ID.
- Preserve the date range and conversation search when the filter changes; reset conversation pagination.
- Omit `agentIds` from the URL for the default all-agent view; use repeated values for a subset.
- Reserve the Insights icon slot while access loads so the icon rail does not move.

## Metric Attribution

- Add an immutable, server-owned `initial_agent_id` to conversations.
- On insert, set it to the verified same-tenant persisted agent ID, or explicitly to `null` when the conversation did not start with one.
- Never accept client writes to `initial_agent_id` and never change it after insertion.
- Do not migrate existing conversations. For legacy rows where the field is absent, fall back to `agent_id`.
- Conversation metrics and the conversations table use `initial_agent_id`, or the legacy fallback, as the primary agent.
- Show only that primary agent in each conversations-table row.
- Assistant messages use the persisted top-level `Message.model` agent ID.
- User messages, which do not consistently store an agent ID, inherit the conversation's primary agent.
- Ignore nested agent IDs in message content; subagent activity does not grant access to the parent conversation.
- Exclude persisted `subagentThread` conversations and messages as standalone Insights data.
- In a mixed-agent conversation, conversation metrics remain with the primary agent while assistant messages and output tokens can count for the agent in `Message.model`.
- Unique users include users with any attributed message.
- Top users counts attributed messages and distinct conversations containing them.
- Churn uses user-authored messages only, across all selected agents, with the existing 28-day threshold.
- Keep the Conversations label and add a tooltip stating that it counts conversations created during the selected period.
- Text search affects only the conversations table. Agent and date filters affect every panel.
- Archived and automated top-level persisted-agent conversations remain included.
- Temporary, unattributed, deleted-agent, remote-agent, ephemeral-agent, and newly created normal chats later converted to agents are excluded.
- Empty periods keep the dashboard visible, show zero summaries, and show localized empty states.

## DocumentDB Constraints

- Do not use `$facet` or correlated `$lookup` pipelines.
- Bound conversation agent filters by indexed persisted fields before projection. Bound message queries by tenant and date before joining.
- Use equality `$lookup` only where user messages must inherit conversation attribution, then validate tenant and owner after the join.
- Add the required conversation agent/date index and message attribution index.
- Cover the final pipelines in the DocumentDB compatibility tests.

## Delivery

- Implement the complete change in one PR.
- Add the required indexes with the code; no separate index rollout is needed at current query volume.
- Preserve the existing date, search, pagination, churn, and empty-state behavior except where this document explicitly changes it.
