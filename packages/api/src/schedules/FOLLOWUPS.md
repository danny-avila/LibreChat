# Scheduled chats: deferred scope

Scheduled chats remain experimental and default-off.

## Must-have product follow-ups

- Add one-time and monthly schedules; current cadences are hourly, daily, weekdays, and weekly.
- Add non-agent chat targets and existing-conversation continuation; current schedules require
  `agent_id` and always target `new`.

## Client/API parity

- Return `minIntervalMinutes` in schedule limits and surface it in the dialog.
- Add active-run and run-history discovery. The list response currently projects only `lastRun`,
  which is written on pause, skip, or terminal outcomes, so the client's `started` chip is
  unreachable.
- Add multi-day weekly, timezone, and attachment controls. The API supports these, but the dialog
  does not.

## Runtime scope

- The standard server supports multi-replica scheduling only with a confirmed Redis-backed
  `GenerationJobManager`; in-memory mode requires `SCHEDULES_SINGLE_PROCESS`. The legacy
  `experimental.js` clustered entrypoint does not arm the engine and rejects schedule writes.
- Deferred account deletion blocks new remote API admission but cannot yet drain already-admitted
  OpenAI-compatible or Responses requests; see
  [#14594](https://github.com/danny-avila/LibreChat/issues/14594).

## Test debt

- Add Playwright coverage for creating a schedule through the UI. The execution E2E currently
  seeds schedules through the API.
