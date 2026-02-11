# CodeCanDirect Codex Context

This document captures the key architectural decisions, fixes, and constraints around the CodeCanDirect flow so future Codex sessions have the full context.

## Why CodeCanDirect Exists
- CodeCanDirect bypasses the standard agents/graph flow to force a locked-down OpenAI Responses API path with `file_search` against a specific vector store.
- The model is constrained to CodeCan Building Code content; citations are required.
- Retrieval precedence is Ontario-first, National fallback:
  - Ontario vector store is checked first.
  - National vector store is only used when Ontario has no relevant evidence.

## Core Flow (Backend)
- Handler: `api/server/controllers/agents/codeCanDirect.js`
- Uses `OpenAIClient.handleResponsesApi` with `useResponsesApi: true` and `stream: true`.
- Always includes `file_search` with `vector_store_ids` and `tool_choice: required`.
- Performs a non-streaming Ontario preflight to decide stage selection.
- Streams only the final selected stage response.
- Uses `createOnProgress` to stream tokens via SSE using LibreChat’s expected schema.
- Captures `returnRaw` response and extracts `output_text.annotations` to build `citations`.

## Conversation Persistence
- CodeCanDirect now explicitly saves:
  - User message (`saveMessage`)
  - Conversation (`saveConvo`) on user save
  - Response message (`saveMessage`)
  - Conversation (`saveConvo`) again on response save
- This matches the standard flow, which always upserts a conversation when messages are saved.

## SSE Events & UI Behavior
- CodeCanDirect **must** emit a `created` SSE event:
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
  - Drop CodeCan-only params for title request: `model_parameters`, `promptPrefix`, `useResponsesApi`.
  - Restore original `useResponsesApi` and `dropParams` after title call.
- This prevents OpenAI errors like:
  - `Unknown parameter: 'presence_penalty'`
  - `Unrecognized request arguments: model_parameters, promptPrefix, useResponsesApi`

## Client Streaming & Citations
- Client SSE handlers live in `client/src/hooks/SSE/useEventHandlers.ts`.
- `createdHandler` inserts conversations into cache for immediate sidebar update.
- Citations appear only if `responseMessage.citations` is present and saved.
- CodeCanDirect extracts citations from `output_text.annotations` (file_citation) and maps `page` from filename patterns like:
  - `ontario_page_845.json`
  - `ontario_combined_page_845.json`
  - `nbc2020_page_845.json`

## Key Files
- Backend:
  - `api/server/controllers/agents/codeCanDirect.js`
  - `api/app/clients/OpenAIClient.js`
  - `api/server/services/Endpoints/openAI/title.js`
  - `api/server/utils/handleText.js` (SSE streaming utilities)
- Frontend:
  - `client/src/hooks/SSE/useEventHandlers.ts`
  - `client/src/components/Chat/Messages/CitationsBlock.tsx`

## Common Failure Modes
- Conversations not appearing: missing `created` SSE or missing `saveConvo` upsert.
- Title errors: title request still using Responses API or not dropping CodeCan-only params.
- Missing citations: no `returnRaw` or failed annotation extraction.
- File_search errors: missing `vector_store_ids` in `tools`.
- Incorrect source precedence: Ontario preflight bypassed or National store used before Ontario.
