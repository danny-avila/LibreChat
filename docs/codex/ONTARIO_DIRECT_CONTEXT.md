# OntarioDirect Codex Context

This document captures the key architectural decisions, fixes, and constraints around the OntarioDirect flow so future Codex sessions have the full context.

## Why OntarioDirect Exists
- OntarioDirect bypasses the standard agents/graph flow to force a locked-down OpenAI Responses API path with `file_search` against a specific vector store.
- The model is constrained to Ontario Building Code content; citations are required and must map to NBC page markers.

## Core Flow (Backend)
- Handler: `api/server/controllers/agents/ontarioDirect.js`
- Uses `OpenAIClient.handleResponsesApi` with `useResponsesApi: true` and `stream: true`.
- Always includes `file_search` with `vector_store_ids` and `tool_choice: required`.
- Uses `createOnProgress` to stream tokens via SSE using LibreChat’s expected schema.
- Captures `returnRaw` response and extracts `output_text.annotations` to build `citations`.

## Conversation Persistence
- OntarioDirect now explicitly saves:
  - User message (`saveMessage`)
  - Conversation (`saveConvo`) on user save
  - Response message (`saveMessage`)
  - Conversation (`saveConvo`) again on response save
- This matches the standard flow, which always upserts a conversation when messages are saved.

## SSE Events & UI Behavior
- OntarioDirect **must** emit a `created` SSE event:
  - `sendEvent(res, { message: userMessage, created: true })`
  - This triggers client `createdHandler` to insert the conversation into the list immediately.
- Final SSE event includes:
  - `conversation` (with `conversationId`)
  - `title` (if available)
  - `requestMessage` / `responseMessage`

## Title Generation (OpenAI)
- Title flow is triggered after the final event on **new, root** messages.
- Title service: `api/server/services/Endpoints/openAI/title.js` calls `client.titleConvo`.
- Fixes applied in `api/app/clients/OpenAIClient.js`:
  - Force title generation to **not** use Responses API (`useResponsesApi: false`).
  - Drop Ontario-only params for title request: `model_parameters`, `promptPrefix`, `useResponsesApi`.
  - Restore original `useResponsesApi` and `dropParams` after title call.
- This prevents OpenAI errors like:
  - `Unknown parameter: 'presence_penalty'`
  - `Unrecognized request arguments: model_parameters, promptPrefix, useResponsesApi`

## Client Streaming & Citations
- Client SSE handlers live in `client/src/hooks/SSE/useEventHandlers.ts`.
- `createdHandler` inserts conversations into cache for immediate sidebar update.
- Citations appear only if `responseMessage.citations` is present and saved.
- OntarioDirect extracts citations from `output_text.annotations` (file_citation) and maps `page` from filename like `nbc2020_page_845.json`.

## Key Files
- Backend:
  - `api/server/controllers/agents/ontarioDirect.js`
  - `api/app/clients/OpenAIClient.js`
  - `api/server/services/Endpoints/openAI/title.js`
  - `api/server/utils/handleText.js` (SSE streaming utilities)
- Frontend:
  - `client/src/hooks/SSE/useEventHandlers.ts`
  - `client/src/components/Chat/Messages/CitationsBlock.tsx`

## Common Failure Modes
- Conversations not appearing: missing `created` SSE or missing `saveConvo` upsert.
- Title errors: title request still using Responses API or not dropping Ontario-only params.
- Missing citations: no `returnRaw` or failed annotation extraction.
- File_search errors: missing `vector_store_ids` in `tools`.

