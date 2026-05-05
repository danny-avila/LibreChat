# Frontend Spec: Responses API + Conversations

## Goal

JuristAI chat requests should use the Agents route. When the request includes a supported `appId`, the frontend payload builder injects the configured OpenAI Responses prompt and enables `useResponsesApi`.

The active payload adapter is `packages/data-provider/src/createPayload.ts`.

## Contract Changes

- Keep using a stable `conversationId`.
- Preserve OpenAI conversation/thread identity separately as `threadId`, `openaiConversationId`, or `openai_conversation_id`.
- Do not send:
  - `endpoint: "assistants"`
  - `assistant_id`
  - Assistants chat route (`/api/assistants/.../chat`)
- Use `endpoint: "agents"` for JuristAI chat submissions.
- Use prompt-based Responses API execution when an `appId` maps to a configured prompt.

Legacy frontend submissions that still select an Assistants endpoint are normalized by `createPayload.ts` to `endpoint: "agents"` and have `assistant_id` removed before the request is sent.

## Prompt Mapping

Use `appId` to select prompt identity:

| appId | Product               | prompt.id                                               | prompt.version |
| ----- | --------------------- | ------------------------------------------------------- | -------------- |
| `2`   | civil / LitigAI       | `pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916` | `2`            |
| `1`   | criminal / FedCrim    | `pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796` | `3`            |

If `appId` is missing or unsupported, the current payload builder does not inject a prompt configuration. JuristAI app surfaces should validate `appId` before submission when prompt-based Responses execution is required.

## Required Request Shape

Send generation requests to the resumable chat route with `endpoint: "agents"` and Responses options enabled.

```json
{
  "text": "research | hello",
  "endpoint": "agents",
  "conversationId": "userId:...|caseId:...|threadId:...|tag:research|customId:...",
  "parentMessageId": "00000000-0000-0000-0000-000000000000",
  "model": "gpt-4o",
  "model_parameters": {
    "useResponsesApi": true,
    "prompt": {
      "id": "<from mapping>",
      "version": "<from mapping>"
    }
  },
  "appId": 2,
  "tag": "research"
}
```

### Notes

- `conversationId` remains the canonical identifier for conversation persistence and SSE resume.
- `streamId` is the same value as `conversationId` for active resumable jobs.
- Keep `parentMessageId` semantics unchanged (`NO_PARENT` for first turn).
- `threadId`, `openaiConversationId`, and `openai_conversation_id` carry the OpenAI conversation/thread ID when JuristAI has one.

## Conversation Title Update

Conversation title generation is queued after a new resumable job finishes. Manual title updates still use:

`POST /api/convos/update`

```json
{
  "arg": {
    "conversationId": "userId:...|caseId:...|threadId:...|tag:research|customId:...",
    "title": "research | hello"
  }
}
```

## Streaming Sequence

1. POST generation request.
2. Read `{ streamId, conversationId, threadId, status }` response.
3. Subscribe SSE: `GET /api/agents/chat/stream/{streamId}`.
4. On reconnect, use `?resume=true`.
5. Use `GET /api/agents/chat/status/{conversationId}` for restore-on-load checks.
6. Use `GET /api/agents/chat/active` to show active conversation indicators.
7. Use `POST /api/agents/chat/abort` to abort a running job.

## Error Handling

If the stream emits:

```text
event: error
data: {"text":"Endpoint models not loaded"}
```

the frontend should:

- stop streaming UI state,
- show a non-retryable configuration error,
- avoid automatic retries until endpoint model config is restored.

## OpenAI Responses Equivalent

Civil / litigai (`appId = 2`):

```python
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
  prompt={
    "id": "pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916",
    "version": "2"
  }
)
```

Criminal / fedcrim.ai (`appId = 1`):

```python
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
  prompt={
    "id": "pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796",
    "version": "3"
  }
)
```
