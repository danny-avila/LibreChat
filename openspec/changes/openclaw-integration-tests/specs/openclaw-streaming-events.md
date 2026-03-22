# Capability: openclaw-streaming-events

## Requirement: Delta Event Translation
`translateEvent` SHALL translate a `delta` state event into one or more LibreChat SSE events per content block.

#### Scenario: Text block
- GIVEN `{ state: 'delta', message: { content: [{ type: 'text', text: 'hello' }] } }`
- WHEN `translateEvent` is called
- THEN it returns at least one event containing the text

## Requirement: Final Event
`translateEvent` SHALL return a `{ final: true }` event for `state === 'final'`.

## Requirement: Aborted Event
`translateEvent` SHALL return `{ final: true, aborted: true }` for `state === 'aborted'`.

## Requirement: Error Event
`translateEvent` SHALL return `{ final: true, error: { message: string } }` for `state === 'error'`, using `errorMessage` when present.

## Requirement: Tool Call Tracking
The `TranslationContext` SHALL track `tool_use` blocks by id and increment `toolCallIndex` for each new call.

#### Scenario: Unique tool call IDs
- GIVEN two `tool_use` blocks with different ids
- WHEN both are translated
- THEN `toolCallMap` contains both ids and `toolCallIndex === 2`
