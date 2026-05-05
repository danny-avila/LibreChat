# JuristAI Chatbot

JuristAI Chatbot is JuristAI's production fork of LibreChat. The repository still uses the LibreChat monorepo structure and much of the upstream runtime, but the active product direction is JuristAI case-based legal chat for LitigAI and FedCrim.

The fork is no longer a generic upstream LibreChat checkout. The current codebase adds prompt-based OpenAI Responses API execution, resumable agent streaming, JuristAI conversation/thread identity handling, deployment automation for JuristAI ECS, and documentation for the JuristAI DynamoDB case data model.

## What Changed From Upstream

- Chat requests are routed through the Agents endpoint and can be forced onto the OpenAI Responses API flow with prompt IDs selected by `appId`.
- Legacy Assistants payloads from the frontend are normalized to `endpoint: "agents"` and stripped of `assistant_id` before submission.
- Agent generations are resumable. The initial POST returns `{ streamId, conversationId, threadId, status }`, and the browser subscribes through `/api/agents/chat/stream/:streamId`.
- `conversationId` is treated as the canonical LibreChat/Mongo conversation key, while OpenAI conversation/thread IDs are preserved as `threadId`, `openaiConversationId`, and `openai_conversation_id`.
- Stream status, active jobs, abort behavior, partial response persistence, and late reconnect handling are managed by `GenerationJobManager` in `packages/api`.
- The repo includes JuristAI-specific deployment workflow documentation and a DynamoDB data model catalog for case, docket, email, billing, and access-control data.

## Product Flows

### Prompt-Based Responses API

The frontend prompt mapping lives in `packages/data-provider/src/createPayload.ts`.

| `appId` | Product | Prompt ID | Version |
| --- | --- | --- | --- |
| `1` | FedCrim / criminal | `pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796` | `3` |
| `2` | LitigAI / civil | `pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916` | `2` |

When an `appId` maps to a prompt, the payload includes:

```json
{
  "endpoint": "agents",
  "model_parameters": {
    "useResponsesApi": true,
    "prompt": {
      "id": "pmpt_...",
      "version": "..."
    }
  }
}
```

The full frontend contract is documented in `docs/frontend-responses-conversations-spec.md`.

### Resumable Streaming

The active chat path is:

1. `POST /api/agents/chat/:endpoint` starts generation.
2. The server immediately returns `streamId`, `conversationId`, optional `threadId`, and `status: "started"`.
3. The client subscribes to `GET /api/agents/chat/stream/:streamId`.
4. Reconnects use `?resume=true` to receive a sync event with aggregated content and run steps.
5. Restore checks use `GET /api/agents/chat/status/:conversationId`.
6. Active conversation indicators use `GET /api/agents/chat/active`.
7. Aborts use `POST /api/agents/chat/abort`.

The implementation is split between the legacy Express layer in `api/server/controllers/agents/request.js` and the TypeScript stream manager in `packages/api/src/stream`.

### JuristAI IDs

JuristAI callers may pass stable case/thread context through `conversationId`, `threadId`, `openaiConversationId`, or `openai_conversation_id`. Backend resolution supports both LibreChat conversation IDs and OpenAI conversation IDs, then maps them back to the latest stored Mongo conversation when possible.

This is important for case-scoped chat surfaces where the external JuristAI app already owns durable case, user, and thread identifiers.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `api` | Legacy Express server. Keep new changes thin here when possible. |
| `packages/api` | TypeScript backend modules consumed by `api`, including Responses and streaming support. |
| `packages/data-provider` | Shared endpoint builders, payload construction, request types, and frontend/backend API contracts. |
| `packages/data-schemas` | Shared Mongo models, schemas, and backend data abstractions. |
| `packages/client` | Shared frontend utilities. |
| `client` | React/Vite SPA. |
| `docs` | JuristAI-specific deployment and frontend integration notes. |
| `juristai_dynamodb_catalog.md` | Observed JuristAI DynamoDB domain catalog. |

## Development

Required runtime:

- Node.js `v20.19.0+`, `^22.12.0`, or `>=23.0.0`
- npm `11.10.0` per `packageManager`
- MongoDB for core LibreChat persistence
- Redis/Meilisearch/RAG services when using the corresponding upstream features

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run smart-reinstall` | Install dependencies when needed and build via Turborepo. |
| `npm run backend:dev` | Start the backend with file watching. |
| `npm run backend` | Start the backend in production mode. |
| `npm run frontend:dev` | Start the Vite frontend dev server on port `3090`. |
| `npm run build:data-provider` | Rebuild shared data-provider code after API contract changes. |
| `npm run build:packages` | Build shared packages in dependency order. |
| `npm run build` | Build all workspaces through Turborepo. |

Default local ports:

- Backend: `http://localhost:3080/`
- Frontend dev server: `http://localhost:3090/`

## Deployment

GitHub Actions deploys `main` to ECS through `.github/workflows/ci-cd.yml` using the `publish` environment. The image is pushed to:

```text
730335261767.dkr.ecr.us-east-1.amazonaws.com/librechat:${GITHUB_SHA}
```

Deployment configuration, required secrets, defaults, and ECS behavior are documented in `docs/publish-environment.md`.

## Additional Docs

- `docs/frontend-responses-conversations-spec.md` - frontend contract for prompt-based Responses API conversations.
- `docs/publish-environment.md` - GitHub Actions `publish` environment setup for ECS deployments.
- `juristai_dynamodb_catalog.md` - observed DynamoDB tables and relationships for JuristAI case workflows.
- `AGENTS.md` - coding rules and workspace boundaries for automated engineering work in this fork.

## Upstream

This project remains based on LibreChat and keeps compatibility with upstream workspace names, package names, and many runtime abstractions. Upstream references are useful for understanding inherited behavior, but this repository's docs and code should be treated as the source of truth for JuristAI-specific chat, deployment, and integration behavior.
