# Frontend Spec: Responses API + Conversations (Prompt-based)

## Goal

All new frontend chat requests must use the Responses API flow. Do not call the Assistants API and do not send `assistant_id`.

## Contract Changes

- Keep using a stable `conversationId`.
- Stop using:
  - `endpoint: "assistants"`
  - `assistant_id`
  - Assistants chat route (`/api/assistants/.../chat`)
- Use prompt-based execution via the Responses API.

## Prompt Mapping

Use `appId` to select prompt identity:

| appId | Product | prompt.id | prompt.version |
|---|---|---|---|
| `2` | civil / litigai | `pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916` | `2` |
| `1` | criminal / fedcrim.ai | `pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796` | `3` |

If `appId` is missing or unsupported, the frontend must fail fast before sending the request.

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
- Keep `parentMessageId` semantics unchanged (`NO_PARENT` for first turn).
- `thread_id` is not required for this prompt-based Responses flow.

## Conversation Title Update

After the first user message is accepted, update title using:

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
2. Read `{ streamId, conversationId, status }` response.
3. Subscribe SSE: `GET /api/agents/chat/stream/{streamId}`.
4. On reconnect, use `?resume=true`.
5. Use `GET /api/agents/chat/status/{conversationId}` for restore-on-load checks.

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
