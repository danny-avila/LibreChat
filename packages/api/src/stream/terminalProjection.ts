import type { FinalEvent, FinalMessageFields, ServerSentEvent } from '~/types/events';

/**
 * Transient prompt-building fields that must never reach a terminal cache,
 * durable terminal record, publication or replay.
 *
 * These carry model inputs assembled while building the prompt, not
 * authoritative final state:
 * - `fileContext`: text extracted from attachments for the prompt.
 * - `image_urls`: base64 image inputs accumulated during prompt building.
 *
 * Adding a field here is the deliberate decision to exclude it everywhere a
 * terminal event is stored or transmitted. `ProjectedMessageFields` keeps the
 * TypeScript contract aligned so a projected message cannot be read for one of
 * them without a type error.
 */
export const TRANSIENT_MESSAGE_FIELDS = ['fileContext', 'image_urls'] as const;

/**
 * Transient fields on a message's nested file/attachment entries. `text` is the
 * embedded extracted body; `_id` and `__v` are storage bookkeeping. Every other
 * property is display and download metadata the client needs to keep rendering
 * the attachment after FINAL, so entries are projected field-by-field rather
 * than dropped.
 */
export const TRANSIENT_FILE_FIELDS = ['text', '_id', '__v'] as const;

/** Message-valued slots of a terminal event that can carry transient inputs. */
const MESSAGE_SLOTS = ['requestMessage', 'responseMessage'] as const;

/** Nested collections of file-like entries on a message. */
const FILE_COLLECTIONS = ['files', 'attachments'] as const;

export type TransientMessageField = (typeof TRANSIENT_MESSAGE_FIELDS)[number];

/** A message whose transient prompt-building fields have been excluded. */
export type ProjectedMessageFields = Omit<FinalMessageFields, TransientMessageField>;

/** A terminal event safe to cache, persist, publish and replay. */
export type ProjectedFinalEvent = Omit<
  FinalEvent,
  'requestMessage' | 'responseMessage' | 'runMessages'
> & {
  requestMessage?: ProjectedMessageFields | null;
  responseMessage?: ProjectedMessageFields | null;
  runMessages?: ProjectedMessageFields[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Project one file/attachment entry. Returns the same reference when it carries
 * no transient field, so a clean event allocates nothing.
 */
function projectFileEntry(entry: unknown): unknown {
  if (!isRecord(entry)) {
    return entry;
  }
  let projected: Record<string, unknown> | undefined;
  for (const field of TRANSIENT_FILE_FIELDS) {
    if (field in entry) {
      projected ??= { ...entry };
      delete projected[field];
    }
  }
  return projected ?? entry;
}

function projectFileCollection(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  let changed = false;
  const projected = value.map((entry) => {
    const next = projectFileEntry(entry);
    if (next !== entry) {
      changed = true;
    }
    return next;
  });
  return changed ? projected : value;
}

/**
 * Project a single message slot. Preserves `null` and `undefined` distinctly:
 * a caller that deliberately sent `requestMessage: null` (early abort) keeps
 * the null, and an absent slot stays absent.
 */
function projectMessage<T>(message: T): T {
  if (!isRecord(message)) {
    return message;
  }
  let projected: Record<string, unknown> | undefined;

  for (const field of TRANSIENT_MESSAGE_FIELDS) {
    if (field in message) {
      projected ??= { ...message };
      delete projected[field];
    }
  }

  for (const collection of FILE_COLLECTIONS) {
    const current = (projected ?? message)[collection];
    const next = projectFileCollection(current);
    if (next !== current) {
      projected ??= { ...message };
      projected[collection] = next;
    }
  }

  return (projected ?? message) as T;
}

function projectRunMessages(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const projected = value.map((entry) => {
    const next = projectMessage(entry);
    if (next !== entry) {
      changed = true;
    }
    return next;
  });
  return changed ? { value: projected, changed: true } : { value, changed: false };
}

/** A terminal event is the only kind that carries message payloads. */
function isFinalEvent(event: ServerSentEvent): event is FinalEvent {
  return isRecord(event) && (event as { final?: unknown }).final === true;
}

/**
 * Exclude transient prompt-building data from a terminal event before it is
 * cached, persisted, published or replayed.
 *
 * Selects fields rather than deep-cloning: only the containers along a path
 * that actually holds transient data are rebuilt, the excluded values are never
 * copied, and the input is never mutated (prompt processing, message
 * persistence and lifecycle code may still own those objects).
 *
 * Idempotent and allocation-free for an already-safe event: projecting a clean
 * event returns the identical reference.
 *
 * Non-terminal events (chunks, `created`) carry no message payload and are
 * returned unchanged.
 */
export function projectTerminalEvent<T extends ServerSentEvent>(event: T): T {
  if (!isFinalEvent(event)) {
    return event;
  }

  let projected: Record<string, unknown> | undefined;

  for (const slot of MESSAGE_SLOTS) {
    const current = (event as Record<string, unknown>)[slot];
    const next = projectMessage(current);
    if (next !== current) {
      projected ??= { ...(event as Record<string, unknown>) };
      projected[slot] = next;
    }
  }

  const runMessages = projectRunMessages((event as Record<string, unknown>).runMessages);
  if (runMessages.changed) {
    projected ??= { ...(event as Record<string, unknown>) };
    projected.runMessages = runMessages.value;
  }

  return (projected ?? event) as T;
}
